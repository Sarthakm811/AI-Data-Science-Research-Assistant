"""
Data Quality Assessment - Data Reliability Index (DRI)
"""

import pandas as pd
import numpy as np
from typing import Dict


class DataQualityAnalyzer:
    """Comprehensive data quality assessment"""

    def __init__(self, df: pd.DataFrame):
        self.df = df
        self.n_rows = len(df)
        self.n_cols = len(df.columns)

    def calculate_dri(self) -> Dict:
        """
        Calculate Data Reliability Index (0-100)
        Higher score = better quality
        """
        scores = {
            "missingness": self._score_missingness(),
            "duplicates": self._score_duplicates(),
            "outliers": self._score_outliers(),
            "type_consistency": self._score_type_consistency(),
            "category_balance": self._score_category_balance(),
            "date_consistency": self._score_date_consistency(),
            "high_cardinality": self._score_high_cardinality(),
            "zero_variance": self._score_zero_variance(),
        }

        # Weighted average
        weights = {
            "missingness": 0.20,
            "duplicates": 0.15,
            "outliers": 0.15,
            "type_consistency": 0.15,
            "category_balance": 0.10,
            "date_consistency": 0.10,
            "high_cardinality": 0.10,
            "zero_variance": 0.05,
        }

        dri_score = sum(scores[k] * weights[k] for k in scores.keys())

        return {
            "dri_score": round(dri_score, 2),
            "grade": self._get_grade(dri_score),
            "component_scores": scores,
            "issues": self._identify_issues(scores),
        }

    def _score_missingness(self) -> float:
        """Score based on missing data (0-100)"""
        missing_pct = (self.df.isnull().sum().sum() / (self.n_rows * self.n_cols)) * 100

        if missing_pct == 0:
            return 100
        elif missing_pct < 5:
            return 90
        elif missing_pct < 10:
            return 75
        elif missing_pct < 20:
            return 50
        else:
            return max(0, 100 - missing_pct)

    def _score_duplicates(self) -> float:
        """Score based on duplicate rows"""
        dup_pct = (self.df.duplicated().sum() / self.n_rows) * 100

        if dup_pct == 0:
            return 100
        elif dup_pct < 1:
            return 95
        elif dup_pct < 5:
            return 80
        elif dup_pct < 10:
            return 60
        else:
            return max(0, 100 - dup_pct * 2)

    def _score_outliers(self) -> float:
        """Score based on outlier rate using IQR method"""
        numeric_cols = self.df.select_dtypes(include=[np.number]).columns
        if len(numeric_cols) == 0:
            return 100

        total_outliers = 0
        total_values = 0

        for col in numeric_cols:
            Q1 = self.df[col].quantile(0.25)
            Q3 = self.df[col].quantile(0.75)
            IQR = Q3 - Q1
            lower = Q1 - 1.5 * IQR
            upper = Q3 + 1.5 * IQR

            outliers = ((self.df[col] < lower) | (self.df[col] > upper)).sum()
            total_outliers += outliers
            total_values += self.df[col].notna().sum()

        outlier_rate = (total_outliers / total_values) * 100 if total_values > 0 else 0

        if outlier_rate < 1:
            return 100
        elif outlier_rate < 5:
            return 90
        elif outlier_rate < 10:
            return 75
        else:
            return max(0, 100 - outlier_rate * 2)

    def _score_type_consistency(self) -> float:
        """Score based on data type consistency"""
        issues = 0

        for col in self.df.columns:
            # Check for mixed types
            if self.df[col].dtype == "object":
                # Check if numeric values in string column
                try:
                    pd.to_numeric(self.df[col].dropna(), errors="raise")
                    issues += 1  # Should be numeric but stored as string
                except (ValueError, TypeError):
                    pass

        consistency_score = 100 - (issues / self.n_cols * 100)
        return max(0, consistency_score)

    def _score_category_balance(self) -> float:
        """Score based on categorical balance"""
        cat_cols = self.df.select_dtypes(include=["object", "category"]).columns
        if len(cat_cols) == 0:
            return 100

        imbalance_scores = []

        for col in cat_cols:
            value_counts = self.df[col].value_counts()
            if len(value_counts) > 1:
                # Calculate entropy (higher = more balanced)
                probs = value_counts / value_counts.sum()
                entropy = -np.sum(probs * np.log2(probs + 1e-10))
                max_entropy = np.log2(len(value_counts))
                balance = (entropy / max_entropy) * 100 if max_entropy > 0 else 100
                imbalance_scores.append(balance)

        return np.mean(imbalance_scores) if imbalance_scores else 100

    def _score_date_consistency(self) -> float:
        """Score based on date column consistency"""
        date_cols = self.df.select_dtypes(include=["datetime64"]).columns

        if len(date_cols) == 0:
            # Check for potential date columns in object type
            potential_dates = 0
            for col in self.df.select_dtypes(include=["object"]).columns:
                sample = self.df[col].dropna().head(100)
                try:
                    pd.to_datetime(sample, errors="raise")
                    potential_dates += 1
                except (ValueError, TypeError, pd.errors.ParserError):
                    pass

            if potential_dates > 0:
                return 50  # Dates exist but not properly typed
            return 100  # No dates

        # Check for date consistency
        issues = 0
        for col in date_cols:
            # Check for future dates
            if (self.df[col] > pd.Timestamp.now()).any():
                issues += 1

            # Check for very old dates
            if (self.df[col] < pd.Timestamp("1900-01-01")).any():
                issues += 1

        return max(0, 100 - (issues / len(date_cols)) * 50)

    def _score_high_cardinality(self) -> float:
        """Score based on high cardinality detection"""
        cat_cols = self.df.select_dtypes(include=["object", "category"]).columns
        if len(cat_cols) == 0:
            return 100

        high_card_count = 0

        for col in cat_cols:
            unique_ratio = self.df[col].nunique() / self.n_rows
            if unique_ratio > 0.5:  # More than 50% unique values
                high_card_count += 1

        if high_card_count == 0:
            return 100

        return max(0, 100 - (high_card_count / len(cat_cols)) * 100)

    def _score_zero_variance(self) -> float:
        """Score based on zero-variance columns"""
        zero_var_count = 0

        for col in self.df.columns:
            if self.df[col].nunique() == 1:
                zero_var_count += 1

        if zero_var_count == 0:
            return 100

        return max(0, 100 - (zero_var_count / self.n_cols) * 100)

    def _get_grade(self, score: float) -> str:
        """Convert DRI score to letter grade"""
        if score >= 90:
            return "A (Excellent)"
        elif score >= 80:
            return "B (Good)"
        elif score >= 70:
            return "C (Fair)"
        elif score >= 60:
            return "D (Poor)"
        else:
            return "F (Critical)"

    def _identify_issues(self, scores: Dict) -> list:
        """Identify critical issues"""
        issues = []

        if scores["missingness"] < 70:
            issues.append("⚠️ High missing data rate")
        if scores["duplicates"] < 80:
            issues.append("⚠️ Significant duplicate rows")
        if scores["outliers"] < 70:
            issues.append("⚠️ High outlier rate")
        if scores["type_consistency"] < 90:
            issues.append("⚠️ Data type inconsistencies")
        if scores["category_balance"] < 60:
            issues.append("⚠️ Severe category imbalance")
        if scores["high_cardinality"] < 70:
            issues.append("⚠️ High cardinality columns detected")
        if scores["zero_variance"] < 95:
            issues.append("⚠️ Zero-variance columns found")

        return issues if issues else ["✅ No critical issues detected"]

    def get_detailed_report(self) -> Dict:
        """Get detailed quality report"""
        return {
            "dri": self.calculate_dri(),
            "missing_analysis": self._analyze_missing(),
            "duplicate_analysis": self._analyze_duplicates(),
            "outlier_analysis": self._analyze_outliers(),
            "cardinality_analysis": self._analyze_cardinality(),
        }

    def _analyze_missing(self) -> Dict:
        """Detailed missing data analysis"""
        missing = self.df.isnull().sum()
        missing_pct = (missing / self.n_rows) * 100

        return {
            "total_missing": int(missing.sum()),
            "columns_with_missing": {
                col: {
                    "count": int(missing[col]),
                    "percentage": round(missing_pct[col], 2),
                }
                for col in missing[missing > 0].index
            },
        }

    def _analyze_duplicates(self) -> Dict:
        """Detailed duplicate analysis"""
        dup_count = self.df.duplicated().sum()

        return {
            "duplicate_rows": int(dup_count),
            "percentage": round((dup_count / self.n_rows) * 100, 2),
            "unique_rows": int(self.n_rows - dup_count),
        }

    def _analyze_outliers(self) -> Dict:
        """Detailed outlier analysis"""
        numeric_cols = self.df.select_dtypes(include=[np.number]).columns
        outliers = {}

        for col in numeric_cols:
            Q1 = self.df[col].quantile(0.25)
            Q3 = self.df[col].quantile(0.75)
            IQR = Q3 - Q1
            lower = Q1 - 1.5 * IQR
            upper = Q3 + 1.5 * IQR

            outlier_mask = (self.df[col] < lower) | (self.df[col] > upper)
            outlier_count = outlier_mask.sum()

            if outlier_count > 0:
                outliers[col] = {
                    "count": int(outlier_count),
                    "percentage": round((outlier_count / self.n_rows) * 100, 2),
                    "lower_bound": round(lower, 2),
                    "upper_bound": round(upper, 2),
                }

        return outliers

    def _analyze_cardinality(self) -> Dict:
        """Detailed cardinality analysis"""
        cardinality = {}

        for col in self.df.columns:
            unique_count = self.df[col].nunique()
            unique_ratio = unique_count / self.n_rows

            cardinality[col] = {
                "unique_values": int(unique_count),
                "unique_ratio": round(unique_ratio, 4),
                "cardinality_level": self._get_cardinality_level(unique_ratio),
            }

        return cardinality

    def _get_cardinality_level(self, ratio: float) -> str:
        """Classify cardinality level"""
        if ratio < 0.01:
            return "Very Low"
        elif ratio < 0.1:
            return "Low"
        elif ratio < 0.5:
            return "Medium"
        elif ratio < 0.9:
            return "High"
        else:
            return "Very High (Potential ID)"
