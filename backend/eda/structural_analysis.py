"""
Structural EDA - Schema and Relationship Analysis
"""

import pandas as pd
from typing import Dict, List, Optional


class StructuralAnalyzer:
    """Analyze dataset structure, schema, and relationships"""

    def __init__(self, df: pd.DataFrame):
        self.df = df
        self.n_rows = len(df)
        self.n_cols = len(df.columns)

    def infer_column_types(self) -> Dict:
        """
        Infer semantic meaning of columns
        Categories: ID, Metric, Code, Text, Date, Boolean, Category
        """
        column_types = {}

        for col in self.df.columns:
            col_type = self._infer_single_column(col)
            column_types[col] = col_type

        return column_types

    def _infer_single_column(self, col: str) -> Dict:
        """Infer type of a single column"""
        series = self.df[col]
        dtype = series.dtype

        # Basic classification
        result = {"semantic_type": "Unknown", "confidence": 0.0, "reasoning": []}

        # Check for ID columns
        if self._is_id_column(col, series):
            result["semantic_type"] = "ID"
            result["confidence"] = 0.9
            result["reasoning"].append("High cardinality, unique values")
            return result

        # Check for boolean
        if self._is_boolean(series):
            result["semantic_type"] = "Boolean"
            result["confidence"] = 0.95
            result["reasoning"].append("Only 2 unique values")
            return result

        # Check for date
        if dtype == "datetime64[ns]" or self._looks_like_date(series):
            result["semantic_type"] = "Date"
            result["confidence"] = 0.9
            result["reasoning"].append("Date format detected")
            return result

        # Check for numeric metric
        if pd.api.types.is_numeric_dtype(dtype):
            result["semantic_type"] = "Metric"
            result["confidence"] = 0.8
            result["reasoning"].append("Numeric type")
            return result

        # Check for category
        if self._is_category(series):
            result["semantic_type"] = "Category"
            result["confidence"] = 0.85
            result["reasoning"].append("Low cardinality, repeated values")
            return result

        # Check for code (like product codes, zip codes)
        if self._is_code(col, series):
            result["semantic_type"] = "Code"
            result["confidence"] = 0.75
            result["reasoning"].append("Alphanumeric pattern")
            return result

        # Default to text
        result["semantic_type"] = "Text"
        result["confidence"] = 0.6
        result["reasoning"].append("String type, high variability")

        return result

    def _is_id_column(self, col: str, series: pd.Series) -> bool:
        """Check if column is an ID"""
        # Check name
        if any(keyword in col.lower() for keyword in ["id", "_id", "key", "index"]):
            return True

        # Check uniqueness
        unique_ratio = series.nunique() / len(series)
        if unique_ratio > 0.95:
            return True

        return False

    def _is_boolean(self, series: pd.Series) -> bool:
        """Check if column is boolean"""
        unique_vals = series.dropna().unique()
        if len(unique_vals) == 2:
            return True
        return False

    def _looks_like_date(self, series: pd.Series) -> bool:
        """Check if string column looks like dates"""
        if series.dtype != "object":
            return False

        sample = series.dropna().head(100)
        try:
            pd.to_datetime(sample, errors="raise")
            return True
        except (ValueError, TypeError, pd.errors.ParserError):
            return False

    def _is_category(self, series: pd.Series) -> bool:
        """Check if column is categorical"""
        unique_ratio = series.nunique() / len(series)
        return unique_ratio < 0.05  # Less than 5% unique

    def _is_code(self, col: str, series: pd.Series) -> bool:
        """Check if column contains codes"""
        if series.dtype != "object":
            return False

        # Check for code-like patterns
        if any(keyword in col.lower() for keyword in ["code", "sku", "zip", "postal"]):
            return True

        # Check format (alphanumeric with consistent length)
        sample = series.dropna().head(100).astype(str)
        if len(sample) > 0:
            lengths = sample.str.len()
            if lengths.std() < 2:  # Consistent length
                return True

        return False

    def detect_primary_keys(self) -> List[str]:
        """Detect potential primary key columns"""
        candidates = []

        for col in self.df.columns:
            # Check uniqueness
            if self.df[col].nunique() == self.n_rows:
                # Check no nulls
                if self.df[col].isnull().sum() == 0:
                    candidates.append(col)

        return candidates

    def detect_functional_dependencies(self) -> List[Dict]:
        """
        Detect functional dependencies (A -> B)
        If A determines B uniquely
        """
        dependencies = []

        # Only check categorical columns (too expensive for high cardinality)
        cat_cols = [col for col in self.df.columns if self.df[col].nunique() < 100]

        for col_a in cat_cols:
            for col_b in cat_cols:
                if col_a != col_b:
                    if self._is_functional_dependency(col_a, col_b):
                        dependencies.append(
                            {
                                "determinant": col_a,
                                "dependent": col_b,
                                "type": "functional_dependency",
                            }
                        )

        return dependencies

    def _is_functional_dependency(self, col_a: str, col_b: str) -> bool:
        """Check if col_a -> col_b (A determines B)"""
        grouped = self.df.groupby(col_a)[col_b].nunique()
        return (grouped == 1).all()

    def detect_relationships(self) -> Dict:
        """Detect one-to-many, many-to-one relationships"""
        relationships = {"one_to_many": [], "many_to_one": [], "many_to_many": []}

        cat_cols = [col for col in self.df.columns if self.df[col].nunique() < 100]

        for col_a in cat_cols:
            for col_b in cat_cols:
                if col_a != col_b:
                    rel_type = self._detect_relationship_type(col_a, col_b)
                    if rel_type:
                        relationships[rel_type].append({"from": col_a, "to": col_b})

        return relationships

    def _detect_relationship_type(self, col_a: str, col_b: str) -> Optional[str]:
        """Detect relationship type between two columns"""
        # Count unique values per group
        a_to_b = self.df.groupby(col_a)[col_b].nunique()
        b_to_a = self.df.groupby(col_b)[col_a].nunique()

        a_unique = (a_to_b == 1).all()
        b_unique = (b_to_a == 1).all()

        if a_unique and not b_unique:
            return "many_to_one"  # Many A -> One B
        elif not a_unique and b_unique:
            return "one_to_many"  # One A -> Many B
        elif not a_unique and not b_unique:
            return "many_to_many"

        return None

    def suggest_merge_keys(self, other_df: Optional[pd.DataFrame] = None) -> List[Dict]:
        """Suggest potential merge keys for joining datasets"""
        if other_df is None:
            return []

        suggestions = []

        # Find columns with similar names
        for col1 in self.df.columns:
            for col2 in other_df.columns:
                if col1.lower() == col2.lower():
                    suggestions.append(
                        {
                            "left_key": col1,
                            "right_key": col2,
                            "match_type": "exact_name",
                            "confidence": 0.9,
                        }
                    )
                elif self._similar_names(col1, col2):
                    suggestions.append(
                        {
                            "left_key": col1,
                            "right_key": col2,
                            "match_type": "similar_name",
                            "confidence": 0.7,
                        }
                    )

        # Find columns with similar value distributions
        for col1 in self.df.columns:
            for col2 in other_df.columns:
                if self._similar_distributions(self.df[col1], other_df[col2]):
                    suggestions.append(
                        {
                            "left_key": col1,
                            "right_key": col2,
                            "match_type": "similar_distribution",
                            "confidence": 0.6,
                        }
                    )

        return suggestions

    def _similar_names(self, name1: str, name2: str) -> bool:
        """Check if column names are similar"""
        # Simple similarity check
        name1_clean = name1.lower().replace("_", "").replace("-", "")
        name2_clean = name2.lower().replace("_", "").replace("-", "")

        # Check if one contains the other
        if name1_clean in name2_clean or name2_clean in name1_clean:
            return True

        return False

    def _similar_distributions(self, series1: pd.Series, series2: pd.Series) -> bool:
        """Check if two columns have similar value distributions"""
        # Check if same data type
        if series1.dtype != series2.dtype:
            return False

        # Check overlap in unique values
        unique1 = set(series1.dropna().unique())
        unique2 = set(series2.dropna().unique())

        if len(unique1) == 0 or len(unique2) == 0:
            return False

        overlap = len(unique1.intersection(unique2))
        overlap_ratio = overlap / min(len(unique1), len(unique2))

        return overlap_ratio > 0.5

    def get_schema_summary(self) -> Dict:
        """Get comprehensive schema summary"""
        return {
            "column_types": self.infer_column_types(),
            "primary_keys": self.detect_primary_keys(),
            "functional_dependencies": self.detect_functional_dependencies(),
            "relationships": self.detect_relationships(),
            "schema_quality": self._assess_schema_quality(),
        }

    def _assess_schema_quality(self) -> Dict:
        """Assess overall schema quality"""
        pks = self.detect_primary_keys()

        return {
            "has_primary_key": len(pks) > 0,
            "primary_key_candidates": pks,
            "normalized": len(self.detect_functional_dependencies()) == 0,
            "quality_score": self._calculate_schema_score(),
        }

    def _calculate_schema_score(self) -> float:
        """Calculate schema quality score (0-100)"""
        score = 100

        # Deduct for no primary key
        if len(self.detect_primary_keys()) == 0:
            score -= 20

        # Deduct for functional dependencies (denormalization)
        fd_count = len(self.detect_functional_dependencies())
        score -= min(30, fd_count * 5)

        # Deduct for high cardinality text columns
        for col in self.df.columns:
            if self.df[col].dtype == "object":
                if self.df[col].nunique() / self.n_rows > 0.9:
                    score -= 5

        return max(0, score)
