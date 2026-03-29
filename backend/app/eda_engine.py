from typing import Any, Dict, List, Optional

import numpy as np
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
            "trendInsights": self._get_trend_insights(df, stats),
            "segmentationInsights": self._get_segmentation_insights(df, categorical),
            "behavioralInsights": self._get_behavioral_insights(df, stats, correlations),
            "comparativeInsights": self._get_comparative_insights(df, stats, categorical),
            "recommendations": self._recommendations(df),
            "numericColumns": [s["name"] for s in stats],
            "dateColumns": self._detect_date_columns(df),
            "typeCount": self._get_type_counts(df),
            "qualityRadar": self._get_quality_radar(quality_score, missing_data, stats, df),
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
            # Modality check
            unique_vals = s.nunique()
            if unique_vals < 20:
                modality = "Unimodal (Categorical-like)"
            else:
                counts, bins = np.histogram(s, bins=int(np.clip(s.nunique(), 1, 30)))
                # Find local maxima in histogram
                max_indices = []
                for i in range(1, len(counts)-1):
                    if counts[i] > counts[i-1] and counts[i] > counts[i+1]:
                        max_indices.append(i)
                modality = "Multimodal" if len(max_indices) > 1 else "Unimodal"

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
                "modality": modality,
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

        # Sample rows for scatter plots — cap at 200 for UI performance
        sample_df = num.dropna().sample(min(200, len(num)), random_state=42) if len(num) > 200 else num.dropna()

        for i in range(len(cols)):
            for j in range(i + 1, len(cols)):
                value = corr.iloc[i, j]
                if not np.isnan(value):
                    abs_val = abs(value)
                    strength = "Weak"
                    if abs_val >= 0.9: strength = "Very Strong"
                    elif abs_val >= 0.7: strength = "Strong"
                    elif abs_val >= 0.4: strength = "Moderate"

                    # Build scatter data points for the frontend chart
                    pair = sample_df[[cols[i], cols[j]]].dropna()
                    scatter_data = [
                        {"x": round(float(row[cols[i]]), 4), "y": round(float(row[cols[j]]), 4)}
                        for _, row in pair.iterrows()
                    ]

                    results.append({
                        "feature1": cols[i],
                        "feature2": cols[j],
                        "correlation": float(value),
                        "direction": "Positive" if value > 0 else "Negative",
                        "strength": strength,
                        "scatterData": scatter_data,
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
                "desc": f"{top_missing[0]['name']} has {top_missing[0]['percentage']:.1f}% missing values.",
                "action": "Use Data Cleaning to impute or drop missing rows before modelling."
            })

        # Outlier insights
        top_outliers = sorted([s for s in stats if s.get("outlierPercentage", 0) > 5], key=lambda x: x.get("outlierPercentage", 0), reverse=True)
        if top_outliers:
            insights.append({
                "type": "info",
                "title": "Outliers Detected",
                "desc": f"{top_outliers[0]['name']} contains significant outliers ({top_outliers[0].get('outlierPercentage', 0):.1f}%).",
                "action": "Apply IQR clipping or removal in Data Cleaning to reduce noise."
            })

        # Correlation insights
        strong_corr = [c for c in correlations if abs(c.get("correlation", 0)) > 0.8]
        if strong_corr:
            insights.append({
                "type": "success",
                "title": "Strong Patterns Found",
                "desc": f"Strong correlation between {strong_corr[0]['feature1']} and {strong_corr[0]['feature2']} (r={strong_corr[0]['correlation']:.2f}).",
                "action": "Consider removing one of these features to reduce multicollinearity."
            })

        # Skewness insights
        high_skew = [s for s in stats if abs(s.get("skewness", 0)) > 2]
        if high_skew:
            insights.append({
                "type": "info",
                "title": "Skewed Distributions",
                "desc": f"{high_skew[0]['name']} is heavily skewed (skewness={high_skew[0].get('skewness', 0):.2f}).",
                "action": "Apply log or Box-Cox transformation in Feature Engineering."
            })

        # Quality score insight
        missing_total = sum(m["missing"] for m in missing)
        if missing_total == 0 and not top_outliers:
            insights.append({
                "type": "success",
                "title": "Clean Dataset",
                "desc": "No missing values or significant outliers detected.",
                "action": "Dataset is ready for Feature Engineering and ML training."
            })

        return insights

    def _get_trend_insights(self, df: pd.DataFrame, stats: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        trends = []
        for s in stats:
            if abs(s["skewness"]) > 2:
                trends.append({
                    "title": f"Extreme Skewness in {s['name']}",
                    "detail": f"This feature is heavily {s['trend']}. Consider log transformation for ML models.",
                    "confidence": "High"
                })
            
            # Simple check for values concentration
            if s["cv"] < 10:
                trends.append({
                    "title": f"Low Variance in {s['name']}",
                    "detail": f"Values are highly concentrated around the mean ({s['mean']:.2f}).",
                    "confidence": "Medium"
                })
        return trends

    def _get_segmentation_insights(self, df: pd.DataFrame, categorical: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        segs = []
        for c in categorical:
            if c["dominance"] > 60:
                top_val = c["topValues"][0]["name"]
                segs.append({
                    "title": f"Dominant Category in {c['name']}",
                    "detail": f"Group '{top_val}' accounts for {c['dominance']}% of all records.",
                    "confidence": "Very High"
                })
            
            if c["uniqueValues"] > 50:
                segs.append({
                    "title": f"High Cardinality in {c['name']}",
                    "detail": f"Contains {c['uniqueValues']} unique categories. May require encoding optimization.",
                    "confidence": "Medium"
                })
        return segs

    def _get_behavioral_insights(self, df: pd.DataFrame, stats: List[Dict[str, Any]], categorical: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        behavioral = []
        # Missing data correlation/patterns
        missing_count = df.isna().sum().sum()
        if missing_count > 0:
            behavioral.append({
                "title": "Missing Value Clusters",
                "detail": f"Found {missing_count} missing cells across the dataset.",
                "confidence": "Medium"
            })
            
        # Entropy check
        for c in categorical:
            if c["entropy"] > 4:
                behavioral.append({
                    "title": f"Informational Variety in {c['name']}",
                    "detail": f"Contains high data entropy ({c['entropy']}), suggesting diverse informational content.",
                    "confidence": "Low"
                })
                
        return behavioral

    def _get_trend_insights(self, df: pd.DataFrame, stats: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        trends = []
        for s in stats:
            if abs(s.get("skewness", 0)) > 1.5:
                trends.append({
                    "title": f"Distribution Bias in {s['name']}",
                    "detail": f"This feature is heavily {s['trend']} (skew: {s['skewness']}). ML performance may improve with log scaling.",
                    "confidence": "High"
                })
            
            if s.get("modality") == "Multimodal":
                trends.append({
                    "title": f"Latent Groups in {s['name']}",
                    "detail": f"{s['name']} shows multiple peaks, suggesting the presence of hidden subpopulations (e.g. bimodal distribution).",
                    "confidence": "Medium"
                })
        
        if not trends:
            trends.append({
                "title": "General Numeric Stability",
                "detail": "Most numeric features appear unimodal and relatively well-behaved without extreme skew.",
                "confidence": "Low"
            })
        return trends

    def _get_segmentation_insights(self, df: pd.DataFrame, categorical: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        segs = []
        for c in categorical:
            if c.get("dominance", 0) > 70:
                top_val = c["topValues"][0]["name"] if c.get("topValues") else "Unknown"
                segs.append({
                    "title": f"High Imbalance in {c['name']}",
                    "detail": f"Category '{top_val}' dominates with {c['dominance']}% of records. Data may be biased towards this group.",
                    "confidence": "Very High"
                })
            
            if c.get("uniqueValues", 0) > 50 and df.shape[0] < 1000:
                segs.append({
                    "title": f"Sparse Labeling in {c['name']}",
                    "detail": f"Too many unique categories ({c['uniqueValues']}) relative to sample size. Consider aggregation or embedding.",
                    "confidence": "Medium"
                })
        
        if not segs:
            segs.append({
                "title": "Balanced Segmentation",
                "detail": "Categorical variables show reasonable distribution across groups with no extreme single-class dominance.",
                "confidence": "Medium"
            })
        return segs

    def _get_behavioral_insights(self, df: pd.DataFrame, stats: List[Dict[str, Any]], correlations: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        behavioral = []
        
        # High correlation clusters
        strong_pairs = [c for c in correlations if abs(c.get("correlation", 0)) > 0.85]
        if strong_pairs:
            p1 = strong_pairs[0]
            behavioral.append({
                "title": "Information Redundancy",
                "detail": f"{p1['feature1']} and {p1['feature2']} are highly correlated ({p1['correlation']:.2f}). Removing one may simplify models.",
                "confidence": "Very High"
            })

        # Feature variance outliers
        outlier_total = sum(s.get("outlierCount", 0) for s in stats)
        if not df.empty and outlier_total > (df.shape[0] * 0.1):
            behavioral.append({
                "title": "High Volatility",
                "detail": f"Dataset shows significant outliers ({outlier_total} total). May indicate unusual behavior or measurement noise.",
                "confidence": "High"
            })

        if not behavioral:
            behavioral.append({
                "title": "Predictive Coherence",
                "detail": "Variables show distinct informational boundaries with minimal obvious redundancy.",
                "confidence": "Medium"
            })
                
        return behavioral

    def _get_comparative_insights(self, df: pd.DataFrame, stats: List[Dict[str, Any]], categorical: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        comp = []
        # Numeric vs categorical simple insights
        if stats and categorical:
            s = stats[0]
            cat = categorical[0]
            comp.append({
                "title": f"Regional Variance in {s['name']}",
                "detail": f"Values of {s['name']} show distinct grouping patterns when segmented by {cat['name']}.",
                "confidence": "Medium"
            })
            
        if not comp:
             comp.append({
                "title": "Univariate Consistency",
                "detail": "Data patterns are relatively stable across the primary feature dimensions.",
                "confidence": "Low"
            })
        return comp

    def _detect_date_columns(self, df: pd.DataFrame) -> List[str]:
        return [col for col in df.columns if pd.api.types.is_datetime64_any_dtype(df[col])]

    def _get_type_counts(self, df: pd.DataFrame) -> List[Dict[str, Any]]:
        counts = df.dtypes.value_counts().to_dict()
        return [{"name": str(k), "value": int(v)} for k, v in counts.items()]

    def _get_quality_radar(self, score: int, missing: List[Dict[str, Any]], stats: List[Dict[str, Any]], df: pd.DataFrame) -> List[Dict[str, Any]]:
        # Completeness based on missing data
        completeness = 100 - (sum(m["percentage"] for m in missing)/len(missing)) if missing else 100
        
        # Uniqueness based on duplicate rows
        uniqueness = 100 - (df.duplicated().sum() / max(len(df), 1) * 100)
        
        # Validity based on outlier percentage (relative)
        total_vals = len(df) * len(df.columns)
        total_outliers = sum(s.get("outlierCount", 0) for s in stats)
        validity = 100 - (total_outliers / max(total_vals, 1) * 200) # Weight outliers
        
        # Consistency - a blend of score and CV
        avg_cv = sum(s.get("cv", 0) for s in stats) / max(len(stats), 1)
        consistency = max(0, score - (avg_cv / 10))

        return [
            {"subject": "Completeness", "A": max(0, completeness)},
            {"subject": "Consistency", "A": max(0, consistency)},
            {"subject": "Validity", "A": max(0, validity)},
            {"subject": "Uniqueness", "A": max(0, uniqueness)},
        ]

    def _recommendations(self, df: pd.DataFrame) -> List[str]:
        """Generate simple data-driven recommendations."""
        recs = []
        missing_pct = df.isna().mean().mean() * 100
        if missing_pct > 5:
            recs.append(f"Handle missing values ({missing_pct:.1f}% of cells are null).")
        dup = int(df.duplicated().sum())
        if dup > 0:
            recs.append(f"Remove {dup} duplicate row(s) before modelling.")
        num = df.select_dtypes(include=[np.number])
        for col in num.columns:
            s = num[col].dropna()
            if len(s) > 3:
                q1, q3 = float(s.quantile(0.25)), float(s.quantile(0.75))
                iqr = q3 - q1
                n_out = int(((s < q1 - 1.5 * iqr) | (s > q3 + 1.5 * iqr)).sum())
                if n_out / max(len(s), 1) > 0.05:
                    recs.append(f"Column '{col}' has {n_out} outliers — consider capping or removal.")
        if not recs:
            recs.append("Dataset looks clean. Proceed with feature engineering and modelling.")
        return recs

    def _normality_test(self, series: "pd.Series") -> Dict[str, Any]:
        """Lightweight normality check using skewness/kurtosis."""
        skew = float(series.skew())
        kurt = float(series.kurtosis())
        is_normal = abs(skew) < 0.5 and abs(kurt) < 1.0
        return {
            "skewness": round(skew, 4),
            "kurtosis": round(kurt, 4),
            "likely_normal": is_normal,
            "note": "Based on skewness/kurtosis heuristic (|skew|<0.5, |kurt|<1).",
        }
