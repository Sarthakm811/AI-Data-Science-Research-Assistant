"""
Correlation Analysis - Multi-type correlation and VIF
"""

import pandas as pd
import numpy as np
from scipy.stats import chi2_contingency
from typing import Dict, List
import warnings

warnings.filterwarnings("ignore")


class CorrelationAnalyzer:
    """Advanced correlation analysis"""

    def __init__(self, df: pd.DataFrame):
        self.df = df
        self.numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()

        # Filter categorical columns to only include those with valid data
        categorical_candidates = df.select_dtypes(
            include=["object", "category"]
        ).columns.tolist()
        self.categorical_cols = []
        for col in categorical_candidates:
            # Only include if column has at least 2 non-null values and at least 2 unique values
            valid_values = df[col].dropna()
            if len(valid_values) >= 2 and valid_values.nunique() >= 2:
                self.categorical_cols.append(col)

    def analyze_all_correlations(self) -> Dict:
        """Comprehensive correlation analysis"""
        return {
            "pearson": self.pearson_correlation(),
            "spearman": self.spearman_correlation(),
            "cramers_v": self.cramers_v_matrix(),
            "mixed_correlations": self.mixed_type_correlation(),
            "vif": self.calculate_vif(),
            "redundancy": self.detect_redundant_features(),
        }

    def pearson_correlation(self) -> Dict:
        """Pearson correlation for numeric features"""
        if len(self.numeric_cols) < 2:
            return {"error": "Insufficient numeric columns"}

        corr_matrix = self.df[self.numeric_cols].corr(method="pearson")

        # Find high correlations
        high_corr = []
        for i in range(len(corr_matrix.columns)):
            for j in range(i + 1, len(corr_matrix.columns)):
                corr_val = corr_matrix.iloc[i, j]
                if abs(corr_val) > 0.7:
                    high_corr.append(
                        {
                            "feature1": corr_matrix.columns[i],
                            "feature2": corr_matrix.columns[j],
                            "correlation": float(corr_val),
                            "strength": self._correlation_strength(abs(corr_val)),
                        }
                    )

        return {
            "matrix": corr_matrix.to_dict(),
            "high_correlations": high_corr,
            "summary": {
                "total_pairs": len(high_corr),
                "max_correlation": (
                    float(corr_matrix.abs().max().max()) if len(corr_matrix) > 0 else 0
                ),
            },
        }

    def spearman_correlation(self) -> Dict:
        """Spearman rank correlation"""
        if len(self.numeric_cols) < 2:
            return {"error": "Insufficient numeric columns"}

        corr_matrix = self.df[self.numeric_cols].corr(method="spearman")

        # Find high correlations
        high_corr = []
        for i in range(len(corr_matrix.columns)):
            for j in range(i + 1, len(corr_matrix.columns)):
                corr_val = corr_matrix.iloc[i, j]
                if abs(corr_val) > 0.7:
                    high_corr.append(
                        {
                            "feature1": corr_matrix.columns[i],
                            "feature2": corr_matrix.columns[j],
                            "correlation": float(corr_val),
                        }
                    )

        return {"matrix": corr_matrix.to_dict(), "high_correlations": high_corr}

    def cramers_v_matrix(self) -> Dict:
        """Cramér's V for categorical variables"""
        if len(self.categorical_cols) < 2:
            return {
                "matrix": {},
                "high_associations": [],
                "error": "Insufficient categorical columns (need at least 2 with valid data)",
            }

        n = len(self.categorical_cols)
        cramers_matrix = np.zeros((n, n))

        for i, col1 in enumerate(self.categorical_cols):
            for j, col2 in enumerate(self.categorical_cols):
                if i == j:
                    cramers_matrix[i, j] = 1.0
                elif i < j:
                    v = self._cramers_v(col1, col2)
                    cramers_matrix[i, j] = v
                    cramers_matrix[j, i] = v

        # Convert to DataFrame
        cramers_df = pd.DataFrame(
            cramers_matrix, index=self.categorical_cols, columns=self.categorical_cols
        )

        # Find high associations
        high_assoc = []
        for i in range(len(self.categorical_cols)):
            for j in range(i + 1, len(self.categorical_cols)):
                v = cramers_matrix[i, j]
                if v > 0.5:
                    high_assoc.append(
                        {
                            "feature1": self.categorical_cols[i],
                            "feature2": self.categorical_cols[j],
                            "cramers_v": float(v),
                            "strength": self._association_strength(v),
                        }
                    )

        return {"matrix": cramers_df.to_dict(), "high_associations": high_assoc}

    def _cramers_v(self, col1: str, col2: str) -> float:
        """Calculate Cramér's V statistic"""
        try:
            # Drop NaN values before creating crosstab
            valid_data = self.df[[col1, col2]].dropna()

            # Check if we have enough data
            if len(valid_data) < 2:
                return 0.0

            confusion_matrix = pd.crosstab(valid_data[col1], valid_data[col2])

            # Check if confusion matrix is empty or too small
            if (
                confusion_matrix.size == 0
                or confusion_matrix.shape[0] < 2
                or confusion_matrix.shape[1] < 2
            ):
                return 0.0

            chi2 = chi2_contingency(confusion_matrix)[0]
            n = confusion_matrix.sum().sum()
            min_dim = min(confusion_matrix.shape) - 1

            if min_dim == 0 or n == 0:
                return 0.0

            v = np.sqrt(chi2 / (n * min_dim))
            return min(v, 1.0)  # Cap at 1.0
        except Exception:
            # Return 0 if any error occurs
            return 0.0

    def mixed_type_correlation(self) -> Dict:
        """Correlation between numeric and categorical"""
        if len(self.numeric_cols) == 0 or len(self.categorical_cols) == 0:
            return {"error": "Need both numeric and categorical columns"}

        correlations = []

        for num_col in self.numeric_cols:
            for cat_col in self.categorical_cols:
                # Use correlation ratio (eta squared)
                eta_sq = self._correlation_ratio(cat_col, num_col)

                if eta_sq > 0.3:  # Moderate correlation
                    correlations.append(
                        {
                            "categorical": cat_col,
                            "numeric": num_col,
                            "eta_squared": float(eta_sq),
                            "strength": self._correlation_strength(eta_sq),
                        }
                    )

        return {"correlations": correlations, "count": len(correlations)}

    def _correlation_ratio(self, cat_col: str, num_col: str) -> float:
        """Calculate correlation ratio (eta squared)"""
        try:
            # Get valid data only
            valid_data = self.df[[cat_col, num_col]].dropna()

            if len(valid_data) < 2:
                return 0.0

            categories = valid_data[cat_col].unique()

            if len(categories) < 2:
                return 0.0

            # Overall mean
            overall_mean = valid_data[num_col].mean()

            # Between-group variance
            between_var = 0
            total_count = 0

            for cat in categories:
                group = valid_data[valid_data[cat_col] == cat][num_col]
                if len(group) > 0:
                    group_mean = group.mean()
                    between_var += len(group) * (group_mean - overall_mean) ** 2
                    total_count += len(group)

            if total_count == 0:
                return 0.0

            # Total variance
            total_var = valid_data[num_col].var() * (len(valid_data[num_col]) - 1)

            if total_var == 0 or np.isnan(total_var):
                return 0.0

            eta_squared = between_var / total_var
            return min(max(eta_squared, 0.0), 1.0)  # Clamp between 0 and 1
        except Exception:
            return 0.0

    def calculate_vif(self) -> Dict:
        """Calculate Variance Inflation Factor"""
        if len(self.numeric_cols) < 2:
            return {"error": "Need at least 2 numeric columns"}

        from sklearn.linear_model import LinearRegression

        vif_data = []

        for i, col in enumerate(self.numeric_cols):
            # Use other columns to predict this column
            X = self.df[self.numeric_cols].drop(columns=[col]).fillna(0)
            y = self.df[col].fillna(0)

            if len(X.columns) == 0:
                continue

            try:
                model = LinearRegression()
                model.fit(X, y)
                r_squared = model.score(X, y)

                # VIF = 1 / (1 - R²)
                vif = 1 / (1 - r_squared) if r_squared < 0.9999 else np.inf

                vif_data.append(
                    {
                        "feature": col,
                        "vif": float(vif),
                        "multicollinearity": self._vif_interpretation(vif),
                    }
                )
            except (ValueError, RuntimeError, np.linalg.LinAlgError) as e:
                import logging
                logging.debug(f"VIF calculation failed for {col}: {e}")
                continue

        return {
            "vif_scores": vif_data,
            "high_vif_features": [v for v in vif_data if v["vif"] > 10],
            "summary": self._vif_summary(vif_data),
        }

    def _vif_interpretation(self, vif: float) -> str:
        """Interpret VIF value"""
        if vif < 5:
            return "low"
        elif vif < 10:
            return "moderate"
        else:
            return "high"

    def _vif_summary(self, vif_data: List[Dict]) -> Dict:
        """Summarize VIF results"""
        if not vif_data:
            return {}

        vif_values = [v["vif"] for v in vif_data if v["vif"] != np.inf]

        return {
            "max_vif": float(max(vif_values)) if vif_values else 0,
            "mean_vif": float(np.mean(vif_values)) if vif_values else 0,
            "features_with_high_vif": sum(1 for v in vif_data if v["vif"] > 10),
        }

    def detect_redundant_features(self) -> Dict:
        """Detect redundant features using correlation clustering"""
        if len(self.numeric_cols) < 2:
            return {"error": "Insufficient features"}

        corr_matrix = self.df[self.numeric_cols].corr(method="pearson").abs()

        # Find groups of highly correlated features
        redundant_groups = []
        processed = set()

        for col in corr_matrix.columns:
            if col in processed:
                continue

            # Find features highly correlated with this one
            high_corr_features = corr_matrix[col][corr_matrix[col] > 0.9].index.tolist()

            if len(high_corr_features) > 1:
                redundant_groups.append(
                    {
                        "group": high_corr_features,
                        "size": len(high_corr_features),
                        "recommendation": f'Consider keeping only one feature from: {", ".join(high_corr_features)}',
                    }
                )
                processed.update(high_corr_features)

        return {
            "redundant_groups": redundant_groups,
            "total_redundant_features": sum(g["size"] - 1 for g in redundant_groups),
            "recommendation": "Remove redundant features to reduce multicollinearity",
        }

    def _correlation_strength(self, corr: float) -> str:
        """Classify correlation strength"""
        abs_corr = abs(corr)
        if abs_corr < 0.3:
            return "weak"
        elif abs_corr < 0.7:
            return "moderate"
        else:
            return "strong"

    def _association_strength(self, v: float) -> str:
        """Classify association strength for Cramér's V"""
        if v < 0.1:
            return "negligible"
        elif v < 0.3:
            return "weak"
        elif v < 0.5:
            return "moderate"
        else:
            return "strong"

    def get_correlation_summary(self) -> Dict:
        """Get executive summary of correlations"""
        all_corr = self.analyze_all_correlations()

        return {
            "pearson_high_count": len(
                all_corr.get("pearson", {}).get("high_correlations", [])
            ),
            "spearman_high_count": len(
                all_corr.get("spearman", {}).get("high_correlations", [])
            ),
            "categorical_associations": len(
                all_corr.get("cramers_v", {}).get("high_associations", [])
            ),
            "mixed_correlations": all_corr.get("mixed_correlations", {}).get(
                "count", 0
            ),
            "multicollinearity_issues": len(
                all_corr.get("vif", {}).get("high_vif_features", [])
            ),
            "redundant_features": all_corr.get("redundancy", {}).get(
                "total_redundant_features", 0
            ),
        }
