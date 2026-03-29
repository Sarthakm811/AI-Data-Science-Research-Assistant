from typing import Any, Dict, List, Optional

# Core pandas stays for type hinting if preferred, or move it too
import pandas as pd


class EDAEngine:
    """Comprehensive Exploratory Data Analysis engine."""

    def full_analysis(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Run a complete EDA summary and return JSON-serializable results matching AutoEDA.jsx expectations."""
        stats = self._statistics(df)
        correlations = self._correlations(df)
        missing_data = self._missing_data(df)
        categorical = self._categorical_analysis(df)
        
        quality_score = self._calculate_quality_score(df, missing_data, stats)
        
        return {
            "summary": self._summary(df),
            "statistics": stats,
            "correlations": correlations,
            "missingData": missing_data,
            "categoricalAnalysis": categorical,
            "qualityScore": quality_score,
            "insights": self._generate_insights(df, missing_data, stats, correlations),
            "recommendations": self._recommendations(df),
            "numericColumns": [s["name"] for s in stats],
            "dateColumns": self._detect_date_columns(df),
            "typeCount": self._get_type_counts(df),
            "qualityRadar": self._get_quality_radar(quality_score, missing_data, stats),
            "missingHeatmap": self._get_missing_heatmap(df),
            "correlationHeatmap": self._get_correlation_heatmap(df)
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
        num_cols = len(df.select_dtypes(include=[np.number]).columns)
        cat_cols = len(df.select_dtypes(exclude=[np.number]).columns)
        
        # Calculate outliers across all columns
        outlier_total = 0
        num_df = df.select_dtypes(include=[np.number])
        for col in num_df.columns:
            s = num_df[col].dropna()
            if s.empty: continue
            q1, q3 = s.quantile(0.25), s.quantile(0.75)
            iqr = q3 - q1
            outlier_total += int(((s < (q1 - 1.5 * iqr)) | (s > (q3 + 1.5 * iqr))).sum())

        return {
            "rows": int(df.shape[0]),
            "columns": int(df.shape[1]),
            "numericCols": num_cols,
            "categoricalCols": cat_cols,
            "memory_usage_mb": round(float(df.memory_usage(deep=True).sum() / (1024**2)), 2),
            "duplicateRows": int(df.duplicated().sum()),
            "missingTotal": missing_cells,
            "missing_percentage": round((missing_cells / total_cells) * 100, 2) if total_cells else 0.0,
            "outlierTotal": outlier_total
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

    def _missing_data(self, df: pd.DataFrame) -> List[Dict[str, Any]]:
        missing = df.isna().sum()
        n_rows = max(len(df), 1)
        results = []
        for col in df.columns:
            count = int(missing[col])
            results.append({
                "name": col,
                "missing": count,
                "percentage": round((count / n_rows) * 100, 2)
            })
        return results

    def _statistics(self, df: pd.DataFrame) -> List[Dict[str, Any]]:
        import numpy as np
        num = df.select_dtypes(include=[np.number])
        if num.empty:
            return []

        results = []
        n_rows = len(df)
        
        for col in num.columns:
            s = num[col].dropna()
            if s.empty:
                continue
                
            desc = s.describe().to_dict()
            q1 = desc.get("25%", 0)
            q3 = desc.get("75%", 0)
            iqr = q3 - q1
            lower = q1 - 1.5 * iqr
            upper = q3 + 1.5 * iqr
            outliers = int(((s < lower) | (s > upper)).sum())
            
            # Simple histogram for distribution
            counts, bins = np.histogram(s, bins=10)
            distribution = [{"bin": f"{bins[i]:.2f}-{bins[i+1]:.2f}", "count": int(counts[i])} for i in range(len(counts))]
            
            skew = float(s.skew())
            results.append({
                "name": col,
                "mean": float(desc.get("mean", 0)),
                "median": float(desc.get("50%", 0)),
                "std": float(desc.get("std", 0)),
                "min": float(desc.get("min", 0)),
                "max": float(desc.get("max", 0)),
                "q1": float(desc.get("25%", 0)),
                "q3": float(desc.get("75%", 0)),
                "outlierCount": outliers,
                "outlierPercentage": round((outliers / n_rows) * 100, 2) if n_rows else 0,
                "skewness": round(skew, 3),
                "trend": "symmetric" if abs(skew) < 0.5 else ("right-skewed" if skew > 0 else "left-skewed"),
                "cv": round((float(desc.get("std", 0)) / float(desc.get("mean", 1)) * 100), 2) if desc.get("mean") else 0,
                "distribution": distribution
            })
        return results

    def _correlations(self, df: pd.DataFrame) -> List[Dict[str, Any]]:
        import numpy as np
        num = df.select_dtypes(include=[np.number])
        if num.shape[1] < 2:
            return []

        corr = num.corr(numeric_only=True)
        results: List[Dict[str, Any]] = []
        cols = list(corr.columns)
        for i in range(len(cols)):
            for j in range(i + 1, len(cols)):
                value = corr.iloc[i, j]
                if not np.isnan(value):
                    results.append({
                        "feature1": cols[i],
                        "feature2": cols[j],
                        "correlation": float(value),
                        "direction": "Positive" if value > 0 else "Negative"
                    })
        return results

    def _categorical_analysis(self, df: pd.DataFrame) -> List[Dict[str, Any]]:
        cat = df.select_dtypes(include=["object", "category"])
        results = []
        for col in cat.columns:
            counts = df[col].value_counts()
            top_ten = counts.head(10)
            n_rows = len(df)
            
            # Entropy calculation
            probs = counts / n_rows
            entropy = float(-(probs * np.log2(probs + 1e-12)).sum())
            dominance = float(counts.iloc[0] / n_rows * 100) if not counts.empty else 0
            
            results.append({
                "name": col,
                "uniqueValues": int(df[col].nunique()),
                "topValues": [{"name": str(k), "value": int(v)} for k, v in top_ten.items()],
                "entropy": round(entropy, 3),
                "dominance": round(dominance, 2)
            })
        return results

    def _get_missing_heatmap(self, df: pd.DataFrame) -> Dict[str, Any]:
        sample = df.head(50) # Limit for UI performance
        return {
            "labels": list(df.columns),
            "rowLabels": list(sample.index.astype(str)),
            "values": sample.isna().astype(int).values.tolist()
        }

    def _get_correlation_heatmap(self, df: pd.DataFrame) -> Dict[str, Any]:
        num = df.select_dtypes(include=[np.number])
        if num.shape[1] < 2:
            return {"labels": [], "values": []}
        
        corr = num.corr().fillna(0)
        return {
            "labels": list(corr.columns),
            "values": corr.values.tolist()
        }

    def _calculate_quality_score(self, df: pd.DataFrame, missing: List[Dict[str, Any]], stats: List[Dict[str, Any]]) -> int:
        score = 100
        # Penalty for missing data
        total_missing_pct = sum(m["percentage"] for m in missing) / max(len(df.columns), 1)
        score -= min(40, total_missing_pct * 2)
        
        # Penalty for outliers
        total_outliers = sum(s["outlierCount"] for s in stats)
        outlier_pct = (total_outliers / (len(df) * len(df.columns))) * 100 if not df.empty and len(df.columns) else 0
        score -= min(20, outlier_pct * 5)
        
        return int(max(0, score))

    def _generate_insights(self, df: pd.DataFrame, missing: List[Dict[str, Any]], stats: List[Dict[str, Any]], correlations: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        insights = []
        
        # Missing data insights
        top_missing = sorted([m for m in missing if m["percentage"] > 5], key=lambda x: x["percentage"], reverse=True)
        if top_missing:
            insights.append({
                "type": "warning",
                "title": "High Missing Data",
                "desc": f"{top_missing[0]['name']} has {top_missing[0]['percentage']}% missing values."
            })
            
        # Outlier insights
        top_outliers = sorted([s for s in stats if s["outlierPercentage"] > 5], key=lambda x: x["outlierPercentage"], reverse=True)
        if top_outliers:
            insights.append({
                "type": "info",
                "title": "Outliers Detected",
                "desc": f"{top_outliers[0]['name']} contains significant outliers ({top_outliers[0]['outlierPercentage']}%)."
            })
            
        # Correlation insights
        strong_corr = [c for c in correlations if abs(c["correlation"]) > 0.8]
        if strong_corr:
            insights.append({
                "type": "success",
                "title": "Strong Patterns",
                "desc": f"Strong correlation found between {strong_corr[0]['feature1']} and {strong_corr[0]['feature2']}."
            })
            
        return insights

    def _detect_date_columns(self, df: pd.DataFrame) -> List[str]:
        return [col for col in df.columns if pd.api.types.is_datetime64_any_dtype(df[col])]

    def _get_type_counts(self, df: pd.DataFrame) -> List[Dict[str, Any]]:
        counts = df.dtypes.value_counts().to_dict()
        return [{"name": str(k), "value": int(v)} for k, v in counts.items()]

    def _get_quality_radar(self, score: int, missing: List[Dict[str, Any]], stats: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        return [
            {"subject": "Completeness", "A": 100 - sum(m["percentage"] for m in missing)/len(missing) if missing else 100},
            {"subject": "Consistency", "A": score},
            {"subject": "Validity", "A": 100 - sum(s["outlierPercentage"] for s in stats)/len(stats) if stats else 100},
            {"subject": "Uniqueness", "A": 100}, # Placeholder
        ]
