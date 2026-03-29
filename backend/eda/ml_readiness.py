"""
ML Readiness Assessment - Feature scoring and recommendations
"""

import pandas as pd
import numpy as np
from sklearn.feature_selection import (
    mutual_info_classif,
    mutual_info_regression,
)
from typing import Dict, List, Optional
import warnings

warnings.filterwarnings("ignore")


class MLReadinessAnalyzer:
    """Assess ML readiness and provide recommendations"""

    def __init__(self, df: pd.DataFrame, target_col: Optional[str] = None):
        self.df = df
        self.target_col = target_col
        self.numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        self.categorical_cols = df.select_dtypes(
            include=["object", "category"]
        ).columns.tolist()

        if target_col:
            self.numeric_cols = [c for c in self.numeric_cols if c != target_col]
            self.categorical_cols = [
                c for c in self.categorical_cols if c != target_col
            ]

    def assess_ml_readiness(self) -> Dict:
        """Complete ML readiness assessment"""
        results = {"overall_score": 0, "readiness_grade": "Not Assessed"}

        if self.target_col and self.target_col in self.df.columns:
            results.update(
                {
                    "feature_scores": self.score_features(),
                    "leakage_detection": self.detect_target_leakage(),
                    "imbalance_analysis": self.analyze_imbalance(),
                    "transform_recommendations": self.recommend_transforms(),
                    "overall_score": self._calculate_readiness_score(),
                }
            )
            results["readiness_grade"] = self._get_readiness_grade(
                results["overall_score"]
            )
        else:
            results.update(
                {
                    "transform_recommendations": self.recommend_transforms(),
                    "data_quality": self._assess_data_quality(),
                }
            )

        return results

    def score_features(self) -> Dict:
        """Score feature usefulness"""
        if not self.target_col:
            return {"error": "No target column specified"}

        target = self.df[self.target_col]
        is_classification = target.nunique() < 20

        scores = {
            "numeric_features": self._score_numeric_features(is_classification),
            "categorical_features": self._score_categorical_features(is_classification),
            "top_features": [],
        }

        # Combine and rank
        all_scores = []
        for feat, score in scores["numeric_features"].items():
            all_scores.append({"feature": feat, "score": score, "type": "numeric"})
        for feat, score in scores["categorical_features"].items():
            all_scores.append({"feature": feat, "score": score, "type": "categorical"})

        all_scores.sort(key=lambda x: x["score"], reverse=True)
        scores["top_features"] = all_scores[:10]

        return scores

    def _score_numeric_features(self, is_classification: bool) -> Dict:
        """Score numeric features"""
        if len(self.numeric_cols) == 0:
            return {}

        X = self.df[self.numeric_cols].fillna(0)
        y = self.df[self.target_col]

        # Remove rows with missing target
        mask = y.notna()
        X = X[mask]
        y = y[mask]

        scores = {}

        try:
            # Mutual Information
            if is_classification:
                mi_scores = mutual_info_classif(X, y, random_state=42)
            else:
                mi_scores = mutual_info_regression(X, y, random_state=42)

            for i, col in enumerate(self.numeric_cols):
                scores[col] = float(mi_scores[i])
        except (ValueError, TypeError, RuntimeError) as e:
            # Fallback to correlation
            import logging
            logging.warning(f"Mutual information calculation failed: {e}. Using correlation instead.")
            for col in self.numeric_cols:
                try:
                    corr = abs(self.df[col].corr(y))
                    scores[col] = float(corr) if not np.isnan(corr) else 0.0
                except (ValueError, TypeError) as col_err:
                    logging.debug(f"Failed to calculate correlation for {col}: {col_err}")
                    scores[col] = 0.0

        return scores

    def _score_categorical_features(self, is_classification: bool) -> Dict:
        """Score categorical features"""
        if len(self.categorical_cols) == 0:
            return {}

        scores = {}

        for col in self.categorical_cols:
            try:
                # Use chi-square for classification, ANOVA for regression
                if is_classification:
                    score = self._chi_square_score(col)
                else:
                    score = self._anova_score(col)
                scores[col] = float(score)
            except (ValueError, TypeError) as e:
                import logging
                logging.debug(f"Failed to score categorical feature {col}: {e}")
                scores[col] = 0.0

        return scores

    def _chi_square_score(self, col: str) -> float:
        """Chi-square test for categorical feature"""
        from scipy.stats import chi2_contingency

        contingency = pd.crosstab(self.df[col], self.df[self.target_col])
        chi2_stat, p_value, dof, expected = chi2_contingency(contingency)

        # Normalize by sample size
        n = contingency.sum().sum()
        cramers_v = np.sqrt(chi2_stat / (n * (min(contingency.shape) - 1)))

        return cramers_v

    def _anova_score(self, col: str) -> float:
        """ANOVA F-test for categorical vs numeric"""
        from scipy.stats import f_oneway

        groups = []
        for category in self.df[col].unique():
            group = self.df[self.df[col] == category][self.target_col].dropna()
            if len(group) > 0:
                groups.append(group)

        if len(groups) < 2:
            return 0.0

        f_stat, p_value = f_oneway(*groups)

        # Normalize F-statistic
        return min(f_stat / 100, 1.0)

    def detect_target_leakage(self) -> Dict:
        """Detect potential target leakage"""
        if not self.target_col:
            return {"error": "No target column"}

        leakage_suspects = []

        # Check for perfect correlations
        for col in self.numeric_cols:
            corr = abs(self.df[col].corr(self.df[self.target_col]))
            if corr > 0.99:
                leakage_suspects.append(
                    {
                        "feature": col,
                        "reason": "Perfect correlation with target",
                        "correlation": float(corr),
                        "severity": "high",
                    }
                )

        # Check for features derived from target
        target_name = self.target_col.lower()
        for col in self.df.columns:
            if col != self.target_col:
                col_lower = col.lower()
                if target_name in col_lower or col_lower in target_name:
                    leakage_suspects.append(
                        {
                            "feature": col,
                            "reason": "Name suggests derivation from target",
                            "severity": "medium",
                        }
                    )

        # Check for post-event features (if date columns exist)
        date_cols = self.df.select_dtypes(include=["datetime64"]).columns
        if len(date_cols) > 0:
            # This is a simplified check
            for col in date_cols:
                if "after" in col.lower() or "post" in col.lower():
                    leakage_suspects.append(
                        {
                            "feature": col,
                            "reason": "Potential post-event feature",
                            "severity": "medium",
                        }
                    )

        return {
            "leakage_detected": len(leakage_suspects) > 0,
            "suspects": leakage_suspects,
            "count": len(leakage_suspects),
        }

    def analyze_imbalance(self) -> Dict:
        """Analyze target imbalance"""
        if not self.target_col:
            return {"error": "No target column"}

        value_counts = self.df[self.target_col].value_counts()

        if len(value_counts) < 2:
            return {"imbalanced": False, "reason": "Single class"}

        majority_count = value_counts.iloc[0]
        minority_count = value_counts.iloc[-1]
        total = value_counts.sum()

        imbalance_ratio = majority_count / minority_count
        minority_pct = (minority_count / total) * 100

        # SMOTE recommendation
        smote_recommended = imbalance_ratio > 3 and minority_count > 6

        # Calculate ideal sampling ratios
        if smote_recommended:
            target_ratio = 0.5  # Aim for 1:2 ratio
            samples_needed = int(majority_count * target_ratio - minority_count)
        else:
            samples_needed = 0

        return {
            "imbalanced": imbalance_ratio > 1.5,
            "imbalance_ratio": float(imbalance_ratio),
            "majority_class": str(value_counts.index[0]),
            "majority_percentage": float(majority_count / total * 100),
            "minority_class": str(value_counts.index[-1]),
            "minority_percentage": float(minority_pct),
            "severity": self._imbalance_severity(imbalance_ratio),
            "smote_recommended": smote_recommended,
            "samples_to_generate": samples_needed,
            "recommendations": self._imbalance_recommendations(
                imbalance_ratio, minority_count
            ),
        }

    def _imbalance_severity(self, ratio: float) -> str:
        """Classify imbalance severity"""
        if ratio < 2:
            return "balanced"
        elif ratio < 5:
            return "mild"
        elif ratio < 10:
            return "moderate"
        else:
            return "severe"

    def _imbalance_recommendations(
        self, ratio: float, minority_count: int
    ) -> List[str]:
        """Generate imbalance handling recommendations"""
        recs = []

        if ratio > 10:
            recs.append("Use SMOTE or ADASYN for oversampling")
            recs.append("Consider ensemble methods (BalancedRandomForest)")
        elif ratio > 5:
            recs.append("Use class weights in model")
            recs.append("Consider SMOTE if minority class > 50 samples")
        elif ratio > 2:
            recs.append("Use class weights")
            recs.append("Monitor precision-recall metrics")

        if minority_count < 30:
            recs.append("⚠️ Very few minority samples - collect more data if possible")

        return recs

    def recommend_transforms(self) -> Dict:
        """Recommend transformations for each column"""
        recommendations = {}

        for col in self.numeric_cols:
            recs = self._recommend_numeric_transform(col)
            if recs:
                recommendations[col] = recs

        for col in self.categorical_cols:
            recs = self._recommend_categorical_encoding(col)
            if recs:
                recommendations[col] = recs

        return recommendations

    def _recommend_numeric_transform(self, col: str) -> Dict:
        """Recommend transformation for numeric column"""
        data = self.df[col].dropna()

        if len(data) < 10:
            return {}

        recommendations = []

        # Check skewness
        skewness = data.skew()
        if abs(skewness) > 1:
            if skewness > 0 and (data > 0).all():
                recommendations.append("log_transform")
            recommendations.append("sqrt_transform")
            recommendations.append("box_cox")

        # Check for outliers
        Q1 = data.quantile(0.25)
        Q3 = data.quantile(0.75)
        IQR = Q3 - Q1
        outlier_pct = ((data < Q1 - 1.5 * IQR) | (data > Q3 + 1.5 * IQR)).sum() / len(
            data
        )

        if outlier_pct > 0.05:
            recommendations.append("robust_scaling")
            recommendations.append("winsorization")

        # Check range
        if data.min() >= 0 and data.max() <= 1:
            recommendations.append("already_normalized")
        else:
            recommendations.append("min_max_scaling")
            recommendations.append("standard_scaling")

        return {
            "recommended": recommendations[:3],  # Top 3
            "skewness": float(skewness),
            "outlier_percentage": float(outlier_pct * 100),
        }

    def _recommend_categorical_encoding(self, col: str) -> Dict:
        """Recommend encoding for categorical column"""
        unique_count = self.df[col].nunique()
        total_count = len(self.df)
        cardinality_ratio = unique_count / total_count

        recommendations = []

        if unique_count == 2:
            recommendations.append("label_encoding")
            recommendations.append("binary_encoding")
        elif unique_count <= 10:
            recommendations.append("one_hot_encoding")
            if self.target_col:
                recommendations.append("target_encoding")
        elif unique_count <= 50:
            recommendations.append("target_encoding")
            recommendations.append("frequency_encoding")
            recommendations.append("binary_encoding")
        else:
            recommendations.append("frequency_encoding")
            recommendations.append("target_encoding")
            recommendations.append("hashing")

        return {
            "recommended": recommendations[:2],
            "unique_count": int(unique_count),
            "cardinality": "high" if cardinality_ratio > 0.5 else "low",
        }

    def _calculate_readiness_score(self) -> float:
        """Calculate overall ML readiness score"""
        score = 100

        # Deduct for missing data
        missing_pct = (
            self.df.isnull().sum().sum() / (len(self.df) * len(self.df.columns))
        ) * 100
        score -= min(20, missing_pct)

        # Deduct for imbalance
        if self.target_col:
            imbalance = self.analyze_imbalance()
            if imbalance.get("severity") == "severe":
                score -= 15
            elif imbalance.get("severity") == "moderate":
                score -= 10

        # Deduct for leakage
        leakage = self.detect_target_leakage()
        score -= len(leakage.get("suspects", [])) * 10

        return max(0, score)

    def _get_readiness_grade(self, score: float) -> str:
        """Convert score to grade"""
        if score >= 90:
            return "A (Excellent - Ready for ML)"
        elif score >= 80:
            return "B (Good - Minor adjustments needed)"
        elif score >= 70:
            return "C (Fair - Some work required)"
        elif score >= 60:
            return "D (Poor - Significant preprocessing needed)"
        else:
            return "F (Critical - Major issues to resolve)"

    def _assess_data_quality(self) -> Dict:
        """Basic data quality without target"""
        return {
            "missing_percentage": float(
                (self.df.isnull().sum().sum() / (len(self.df) * len(self.df.columns)))
                * 100
            ),
            "duplicate_percentage": float(
                (self.df.duplicated().sum() / len(self.df)) * 100
            ),
            "numeric_features": len(self.numeric_cols),
            "categorical_features": len(self.categorical_cols),
        }
