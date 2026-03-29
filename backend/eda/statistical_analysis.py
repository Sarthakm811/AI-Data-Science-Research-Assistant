"""
Statistical EDA - Advanced Statistical Analysis
"""

import pandas as pd
import numpy as np
from scipy import stats
from scipy.stats import shapiro, kstest, normaltest
from typing import Dict, List
import warnings

warnings.filterwarnings("ignore")


class StatisticalAnalyzer:
    """Advanced statistical analysis for EDA"""

    def __init__(self, df: pd.DataFrame):
        self.df = df
        self.numeric_cols = df.select_dtypes(include=[np.number]).columns
        self.categorical_cols = df.select_dtypes(include=["object", "category"]).columns

    def analyze_numerical_columns(self) -> Dict:
        """Comprehensive numerical analysis"""
        results = {}

        for col in self.numeric_cols:
            results[col] = {
                "distribution_fit": self._fit_distribution(col),
                "skewness": float(self.df[col].skew()),
                "kurtosis": float(self.df[col].kurtosis()),
                "robust_stats": self._robust_statistics(col),
                "outlier_impact": self._outlier_impact(col),
                "normality_tests": self._normality_tests(col),
            }

        return results

    def _fit_distribution(self, col: str) -> Dict:
        """Fit multiple distributions and find best fit"""
        data = self.df[col].dropna()

        if len(data) < 10:
            return {"best_fit": "insufficient_data"}

        distributions = {
            "normal": stats.norm,
            "lognormal": stats.lognorm,
            "gamma": stats.gamma,
            "exponential": stats.expon,
        }

        best_fit = None
        best_score = -np.inf

        for name, dist in distributions.items():
            try:
                params = dist.fit(data)
                # Kolmogorov-Smirnov test
                ks_stat, p_value = stats.kstest(data, lambda x: dist.cdf(x, *params))
                score = -ks_stat  # Higher is better

                if score > best_score:
                    best_score = score
                    best_fit = {
                        "distribution": name,
                        "ks_statistic": float(ks_stat),
                        "p_value": float(p_value),
                        "fit_quality": "good" if p_value > 0.05 else "poor",
                    }
            except:
                continue

        return best_fit or {"best_fit": "none"}

    def _robust_statistics(self, col: str) -> Dict:
        """Robust statistics using median-based measures"""
        data = self.df[col].dropna()

        median = float(data.median())
        mad = float(np.median(np.abs(data - median)))  # Median Absolute Deviation
        iqr = float(data.quantile(0.75) - data.quantile(0.25))

        return {
            "median": median,
            "mad": mad,
            "iqr": iqr,
            "robust_mean": float(data.quantile(0.5)),
            "trimmed_mean": float(stats.trim_mean(data, 0.1)),  # 10% trimmed
        }

    def _outlier_impact(self, col: str) -> Dict:
        """Calculate outlier impact on statistics"""
        data = self.df[col].dropna()

        Q1 = data.quantile(0.25)
        Q3 = data.quantile(0.75)
        IQR = Q3 - Q1
        lower = Q1 - 1.5 * IQR
        upper = Q3 + 1.5 * IQR

        outliers = data[(data < lower) | (data > upper)]
        clean_data = data[(data >= lower) & (data <= upper)]

        if len(outliers) == 0:
            return {"has_outliers": False}

        mean_with = float(data.mean())
        mean_without = float(clean_data.mean())
        std_with = float(data.std())
        std_without = float(clean_data.std())

        return {
            "has_outliers": True,
            "outlier_count": int(len(outliers)),
            "outlier_percentage": float(len(outliers) / len(data) * 100),
            "mean_impact": float(abs(mean_with - mean_without)),
            "std_impact": float(abs(std_with - std_without)),
            "impact_severity": (
                "high" if abs(mean_with - mean_without) > std_with * 0.1 else "low"
            ),
        }

    def _normality_tests(self, col: str) -> Dict:
        """Multiple normality tests"""
        data = self.df[col].dropna()

        if len(data) < 8:
            return {"insufficient_data": True}

        results = {}

        # Shapiro-Wilk test
        try:
            if len(data) <= 5000:  # Shapiro-Wilk limit
                stat, p_value = shapiro(data)
                results["shapiro_wilk"] = {
                    "statistic": float(stat),
                    "p_value": float(p_value),
                    "is_normal": p_value > 0.05,
                }
        except (ValueError, RuntimeError) as e:
            import logging
            logging.debug(f"Shapiro-Wilk test failed: {e}")

        # Kolmogorov-Smirnov test
        try:
            stat, p_value = kstest(data, "norm", args=(data.mean(), data.std()))
            results["ks_test"] = {
                "statistic": float(stat),
                "p_value": float(p_value),
                "is_normal": p_value > 0.05,
            }
        except (ValueError, RuntimeError) as e:
            import logging
            logging.debug(f"KS test failed: {e}")

        # D'Agostino-Pearson test
        try:
            if len(data) >= 20:
                stat, p_value = normaltest(data)
                results["dagostino_pearson"] = {
                    "statistic": float(stat),
                    "p_value": float(p_value),
                    "is_normal": p_value > 0.05,
                }
        except (ValueError, RuntimeError) as e:
            import logging
            logging.debug(f"D'Agostino-Pearson test failed: {e}")

        return results

    def analyze_categorical_columns(self) -> Dict:
        """Comprehensive categorical analysis"""
        results = {}

        for col in self.categorical_cols:
            results[col] = {
                "entropy": self._calculate_entropy(col),
                "imbalance": self._category_imbalance(col),
                "rare_categories": self._rare_categories(col),
                "concentration": self._concentration_metrics(col),
            }

        return results

    def _calculate_entropy(self, col: str) -> Dict:
        """Calculate Shannon entropy"""
        value_counts = self.df[col].value_counts()
        probs = value_counts / value_counts.sum()
        entropy = -np.sum(probs * np.log2(probs + 1e-10))
        max_entropy = np.log2(len(value_counts))

        return {
            "entropy": float(entropy),
            "max_entropy": float(max_entropy),
            "normalized_entropy": (
                float(entropy / max_entropy) if max_entropy > 0 else 0
            ),
            "interpretation": (
                "balanced" if entropy / max_entropy > 0.7 else "imbalanced"
            ),
        }

    def _category_imbalance(self, col: str) -> Dict:
        """Measure category imbalance"""
        value_counts = self.df[col].value_counts()

        if len(value_counts) < 2:
            return {"imbalanced": False}

        majority_pct = float(value_counts.iloc[0] / value_counts.sum() * 100)
        minority_pct = float(value_counts.iloc[-1] / value_counts.sum() * 100)

        imbalance_ratio = majority_pct / minority_pct if minority_pct > 0 else np.inf

        return {
            "majority_class": str(value_counts.index[0]),
            "majority_percentage": majority_pct,
            "minority_class": str(value_counts.index[-1]),
            "minority_percentage": minority_pct,
            "imbalance_ratio": float(imbalance_ratio),
            "severity": self._imbalance_severity(imbalance_ratio),
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

    def _rare_categories(self, col: str) -> Dict:
        """Identify rare categories"""
        value_counts = self.df[col].value_counts()
        total = value_counts.sum()

        # Categories with < 1% frequency
        rare = value_counts[value_counts / total < 0.01]

        return {
            "rare_count": int(len(rare)),
            "rare_categories": list(rare.index[:10]),  # Top 10
            "rare_total_percentage": float(rare.sum() / total * 100),
        }

    def _concentration_metrics(self, col: str) -> Dict:
        """Calculate concentration metrics"""
        value_counts = self.df[col].value_counts()
        total = value_counts.sum()

        # Gini coefficient
        sorted_counts = np.sort(value_counts.values)
        n = len(sorted_counts)
        index = np.arange(1, n + 1)
        gini = (2 * np.sum(index * sorted_counts)) / (n * np.sum(sorted_counts)) - (
            n + 1
        ) / n

        # Top-k concentration
        top5_pct = float(value_counts.head(5).sum() / total * 100)

        return {
            "gini_coefficient": float(gini),
            "top5_concentration": top5_pct,
            "concentration_level": (
                "high" if top5_pct > 80 else "moderate" if top5_pct > 50 else "low"
            ),
        }


    def get_comprehensive_report(self) -> Dict:
        """Get complete statistical analysis"""
        return {
            "numerical_analysis": self.analyze_numerical_columns(),
            "categorical_analysis": self.analyze_categorical_columns(),
            "summary": self._generate_summary(),
        }

    def _generate_summary(self) -> Dict:
        """Generate executive summary"""
        num_analysis = self.analyze_numerical_columns()
        cat_analysis = self.analyze_categorical_columns()

        # Count issues
        non_normal_count = sum(
            1
            for col_data in num_analysis.values()
            if not col_data.get("normality_tests", {})
            .get("shapiro_wilk", {})
            .get("is_normal", True)
        )

        imbalanced_count = sum(
            1
            for col_data in cat_analysis.values()
            if col_data.get("imbalance", {}).get("severity") in ["moderate", "severe"]
        )

        return {
            "total_numeric_columns": len(self.numeric_cols),
            "total_categorical_columns": len(self.categorical_cols),
            "non_normal_distributions": non_normal_count,
            "imbalanced_categories": imbalanced_count,
            "quality_flags": self._get_quality_flags(num_analysis, cat_analysis),
        }

    def _get_quality_flags(self, num_analysis: Dict, cat_analysis: Dict) -> List[str]:
        """Generate quality flags"""
        flags = []

        # Check for high outlier impact
        for col, data in num_analysis.items():
            outlier_info = data.get("outlier_impact", {})
            if outlier_info.get("impact_severity") == "high":
                flags.append(f"⚠️ High outlier impact in {col}")

        # Check for severe imbalance
        for col, data in cat_analysis.items():
            imbalance = data.get("imbalance", {})
            if imbalance.get("severity") == "severe":
                flags.append(f"⚠️ Severe imbalance in {col}")

        return flags if flags else ["✅ No critical statistical issues"]
