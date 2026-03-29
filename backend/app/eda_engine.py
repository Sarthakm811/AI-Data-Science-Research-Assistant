from typing import Any, Dict, List, Optional

# Core pandas stays for type hinting if preferred, or move it too
import pandas as pd


class EDAEngine:
    """Comprehensive Exploratory Data Analysis engine."""

    def full_analysis(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Run a complete EDA summary and return JSON-serializable results."""
        return {
            "summary": self._summary(df),
            "data_types": self._data_types(df),
            "missing_data": self._missing_data(df),
            "statistics": self._statistics(df),
            "correlations": self._correlations(df),
            "outliers": self._outliers(df),
            "recommendations": self._recommendations(df),
        }

    def statistical_tests(
        self, df: pd.DataFrame, column1: str, column2: Optional[str] = None
    ) -> Dict[str, Any]:
        """Run a lightweight statistical test suite for one or two columns."""
        from scipy.stats import chi2_contingency, mannwhitneyu, ttest_ind
        
        if column1 not in df.columns:
            raise ValueError(f"Column not found: {column1}")

        series1 = df[column1].dropna()
        if series1.empty:
            return {"error": f"No non-null values in column: {column1}"}

        result: Dict[str, Any] = {
            "column1": column1,
            "column2": column2,
            "normality": self._normality_test(series1),
        }

        if column2 is None:
            return result

        if column2 not in df.columns:
            raise ValueError(f"Column not found: {column2}")

        series2 = df[column2].dropna()
        if series2.empty:
            result["comparison"] = {"error": f"No non-null values in column: {column2}"}
            return result

        if pd.api.types.is_numeric_dtype(series1) and pd.api.types.is_numeric_dtype(series2):
            paired = pd.DataFrame({"a": series1, "b": series2}).dropna()
            if len(paired) < 3:
                result["comparison"] = {"error": "Insufficient paired numeric samples"}
                return result

            a = paired["a"].to_numpy()
            b = paired["b"].to_numpy()
            t_stat, t_p = ttest_ind(a, b, equal_var=False)
            mw_stat, mw_p = mannwhitneyu(a, b, alternative="two-sided")
            result["comparison"] = {
                "type": "numeric_vs_numeric",
                "ttest": {"statistic": float(t_stat), "p_value": float(t_p)},
                "mann_whitney": {"statistic": float(mw_stat), "p_value": float(mw_p)},
            }
            return result

        c1 = df[column1].astype("string")
        c2 = df[column2].astype("string")
        contingency = pd.crosstab(c1, c2)
        if contingency.empty:
            result["comparison"] = {"error": "Insufficient categorical overlap"}
            return result

        chi2, p_value, dof, _ = chi2_contingency(contingency)
        result["comparison"] = {
            "type": "categorical_vs_categorical",
            "chi_square": {
                "statistic": float(chi2),
                "p_value": float(p_value),
                "dof": int(dof),
            },
        }
        return result

    def _summary(self, df: pd.DataFrame) -> Dict[str, Any]:
        total_cells = int(df.shape[0] * df.shape[1]) if not df.empty else 0
        missing_cells = int(df.isna().sum().sum())
        return {
            "rows": int(df.shape[0]),
            "columns": int(df.shape[1]),
            "memory_usage_mb": round(float(df.memory_usage(deep=True).sum() / (1024**2)), 2),
            "duplicates": int(df.duplicated().sum()),
            "missing_cells": missing_cells,
            "missing_percentage": round((missing_cells / total_cells) * 100, 2) if total_cells else 0.0,
        }

    def _data_types(self, df: pd.DataFrame) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []
        n_rows = max(len(df), 1)

        for col in df.columns:
            s = df[col]
            unique = int(s.nunique(dropna=True))
            missing = int(s.isna().sum())
            semantic_type = "categorical"
            if pd.api.types.is_datetime64_any_dtype(s):
                semantic_type = "datetime"
            elif pd.api.types.is_numeric_dtype(s):
                if unique == len(df) and len(df) > 0:
                    semantic_type = "identifier"
                elif unique <= 10:
                    semantic_type = "categorical_numeric"
                else:
                    semantic_type = "continuous"

            results.append(
                {
                    "name": col,
                    "dtype": str(s.dtype),
                    "unique_values": unique,
                    "unique_percentage": round((unique / n_rows) * 100, 2),
                    "missing": missing,
                    "missing_percentage": round((missing / n_rows) * 100, 2),
                    "semantic_type": semantic_type,
                }
            )
        return results

    def _missing_data(self, df: pd.DataFrame) -> Dict[str, Any]:
        missing = df.isna().sum()
        cols = missing[missing > 0]
        n_rows = max(len(df), 1)
        return {
            "total_missing": int(missing.sum()),
            "columns_with_missing": {
                col: {
                    "count": int(cols[col]),
                    "percentage": round((int(cols[col]) / n_rows) * 100, 2),
                }
                for col in cols.index
            },
        }

    def _statistics(self, df: pd.DataFrame) -> Dict[str, Any]:
        import numpy as np
        num = df.select_dtypes(include=[np.number])
        if num.empty:
            return {}

        stats = num.describe().to_dict()
        for col in num.columns:
            stats[col]["skewness"] = float(num[col].skew())
            stats[col]["kurtosis"] = float(num[col].kurtosis())
        return stats

    def _correlations(self, df: pd.DataFrame) -> Dict[str, Any]:
        import numpy as np
        num = df.select_dtypes(include=[np.number])
        if num.shape[1] < 2:
            return {"correlation_matrix": {}, "high_correlations": []}

        corr = num.corr(numeric_only=True)
        high: List[Dict[str, Any]] = []
        cols = list(corr.columns)
        for i in range(len(cols)):
            for j in range(i + 1, len(cols)):
                value = corr.iloc[i, j]
                if abs(value) >= 0.7:
                    high.append(
                        {
                            "feature1": cols[i],
                            "feature2": cols[j],
                            "correlation": float(value),
                        }
                    )

        return {"correlation_matrix": corr.to_dict(), "high_correlations": high}

    def _outliers(self, df: pd.DataFrame) -> Dict[str, Any]:
        import numpy as np
        out: Dict[str, Any] = {}
        num = df.select_dtypes(include=[np.number])
        n_rows = max(len(df), 1)

        for col in num.columns:
            s = num[col].dropna()
            if s.empty:
                continue
            q1 = s.quantile(0.25)
            q3 = s.quantile(0.75)
            iqr = q3 - q1
            if iqr == 0:
                continue
            lower = q1 - 1.5 * iqr
            upper = q3 + 1.5 * iqr
            count = int(((s < lower) | (s > upper)).sum())
            if count > 0:
                out[col] = {
                    "count": count,
                    "percentage": round((count / n_rows) * 100, 2),
                    "lower_bound": float(lower),
                    "upper_bound": float(upper),
                }

        return out

    def _normality_test(self, series: pd.Series) -> Dict[str, Any]:
        from scipy.stats import shapiro
        if not pd.api.types.is_numeric_dtype(series):
            return {"test": "shapiro", "error": "Normality tests require numeric data"}

        data = series.to_numpy(dtype=float)
        if len(data) < 3:
            return {"test": "shapiro", "error": "Insufficient samples"}

        sample = data[:5000] if len(data) > 5000 else data
        stat, p_value = shapiro(sample)
        return {
            "test": "shapiro",
            "statistic": float(stat),
            "p_value": float(p_value),
            "is_normal": bool(p_value > 0.05),
        }

    def _recommendations(self, df: pd.DataFrame) -> List[str]:
        import numpy as np
        recommendations: List[str] = []
        missing = df.isna().sum().sum()
        if missing > 0:
            recommendations.append("Handle missing values before model training.")

        duplicates = int(df.duplicated().sum())
        if duplicates > 0:
            recommendations.append("Remove or review duplicate rows.")

        num_cols = df.select_dtypes(include=[np.number]).shape[1]
        if num_cols >= 2:
            recommendations.append("Review highly correlated numeric features to reduce multicollinearity.")

        if not recommendations:
            recommendations.append("Dataset looks clean enough for baseline modeling.")

        return recommendations
