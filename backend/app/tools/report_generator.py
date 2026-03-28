"""Report Generator - Create markdown and notebook reports."""

from typing import Dict, Any, List, Iterable
from pathlib import Path
import json
from datetime import datetime


class ReportGenerator:
    def __init__(self, output_dir: str = "/outputs"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def generate_markdown_report(
        self, analysis_results: Dict[str, Any], job_id: str
    ) -> str:
        """Generate a structured markdown report with complete analysis coverage."""
        report = []
        generated_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        eda = analysis_results.get("eda", {})
        basic_info = eda.get("basic_info", analysis_results.get("basic_info", {}))
        visual_assets = self._collect_visual_assets(analysis_results)

        shape = basic_info.get("shape", [0, 0]) if basic_info else [0, 0]
        rows = shape[0] if isinstance(shape, (list, tuple)) and len(shape) > 0 else 0
        cols = shape[1] if isinstance(shape, (list, tuple)) and len(shape) > 1 else 0
        missing = eda.get("missing_data", analysis_results.get("missing_data", {}))
        correlations = eda.get("correlations", analysis_results.get("correlations", {}))
        outliers = eda.get("outliers", analysis_results.get("outliers", {}))
        distributions = eda.get("distributions", analysis_results.get("distributions", {}))

        total_missing = int(missing.get("total_missing", 0)) if missing else 0
        high_corr_count = len(correlations.get("high_correlations", [])) if correlations else 0
        outlier_feature_count = len(outliers) if isinstance(outliers, dict) else 0
        distribution_feature_count = len(distributions) if isinstance(distributions, dict) else 0

        # Cover and metadata
        report.append("# Data Science Analysis Report")
        report.append("")
        report.append("## Report Metadata")
        report.append("| Field | Value |")
        report.append("|---|---|")
        report.append(f"| Report ID | {job_id} |")
        report.append(f"| Generated At | {generated_at} |")
        report.append(f"| Status | {analysis_results.get('status', 'completed')} |")
        report.append("")
        report.append("---")
        report.append("")
        report.append("## Table of Contents")
        report.append("1. Executive Summary")
        report.append("2. Analysis Scorecard")
        report.append("3. Dataset Overview")
        report.append("4. Auto EDA Summary")
        report.append("5. Data Quality")
        report.append("6. Correlation Analysis")
        report.append("7. Distribution Analysis")
        report.append("8. Outlier Analysis")
        report.append("9. Categorical Analysis")
        report.append("10. Machine Learning Results")
        report.append("11. Visual Assets")
        report.append("12. Appendix")
        report.append("")

        # Executive summary
        report.append("## 1. Executive Summary")
        if "insights" in analysis_results and analysis_results["insights"]:
            report.append("> This section contains AI-generated interpretation of the analysis results.")
            report.append("")
            report.append(str(analysis_results["insights"]).strip())
        else:
            report.append("- AI-generated insights are not available for this run.")
        report.append("")

        # Scorecard
        report.append("## 2. Analysis Scorecard")
        report.append("| Metric | Value |")
        report.append("|---|---:|")
        report.append(f"| Rows | {rows:,} |")
        report.append(f"| Columns | {cols:,} |")
        report.append(f"| Missing Values | {total_missing:,} |")
        report.append(f"| High Correlation Pairs | {high_corr_count:,} |")
        report.append(f"| Features with Outliers | {outlier_feature_count:,} |")
        report.append(f"| Features with Distribution Stats | {distribution_feature_count:,} |")
        report.append(f"| Total Visual Assets | {len(visual_assets):,} |")
        report.append("")

        # Dataset info
        if basic_info:
            report.append("## 3. Dataset Overview")
            report.append(f"- **Rows:** {rows}")
            report.append(f"- **Columns:** {cols}")
            report.append(f"- **Memory:** {float(basic_info.get('memory_usage_mb', 0)):.2f} MB")
            if basic_info.get("columns"):
                report.append(f"- **Column Names:** {', '.join(map(str, basic_info['columns']))}")
            report.append("")

        # Auto EDA natural-language summary
        if "eda_summary" in analysis_results and analysis_results["eda_summary"]:
            report.append("## 4. Auto EDA Summary")
            report.append("```text")
            report.append(str(analysis_results["eda_summary"]))
            report.append("```")
            report.append("")

        # Summary statistics
        summary_stats = eda.get("summary_stats", analysis_results.get("summary_stats", {}))
        if summary_stats:
            report.append("## 5. Summary Statistics")
            report.append("Key statistical measures for numeric features.")
            for feature, stats in summary_stats.items():
                report.append(f"### {feature}")
                for key in ["count", "mean", "std", "min", "25%", "50%", "75%", "max", "skewness", "kurtosis"]:
                    if key in stats:
                        value = stats[key]
                        report.append(f"- **{key}:** {self._fmt_num(value)}")
            report.append("")

        # Missing data
        if missing:
            report.append("## 6. Data Quality")
            report.append(f"- **Total missing values:** {int(missing.get('total_missing', 0))}")
            columns_with_missing = missing.get("columns_with_missing", {})
            if columns_with_missing:
                report.append("### Missing Values by Column")
                report.append("| Column | Missing Count | Missing % |")
                report.append("|---|---:|---:|")
                for col, item in columns_with_missing.items():
                    report.append(
                        f"| {col} | {int(item.get('count', 0))} | {float(item.get('percentage', 0)):.2f}% |"
                    )
            else:
                report.append("- No missing values detected.")
            report.append("")

        # Correlations
        if correlations:
            report.append("## 7. Correlation Analysis")
            high = correlations.get("high_correlations", [])
            if high:
                report.append("### High Correlations")
                report.append("| Feature 1 | Feature 2 | Correlation |")
                report.append("|---|---|---:|")
                for item in high:
                    report.append(
                        f"| {item.get('feature1', '')} | {item.get('feature2', '')} | {float(item.get('correlation', 0)):.4f} |"
                    )
            else:
                report.append("- No strong pairwise correlations identified above threshold.")

            corr_assets = self._collect_eda_visual_assets(eda, ["correlation_visualizations"])
            if corr_assets:
                report.append("### Correlation Charts")
                for path in corr_assets:
                    asset_path = Path(str(path))
                    title = asset_path.stem.replace("_", " ").title()
                    report.append(f"- `{asset_path}`")
                    report.append(f"![{title}]({asset_path.as_posix()})")
            report.append("")

        # Distribution analysis
        if distributions:
            report.append("## 8. Distribution Analysis")
            report.append("| Feature | Mean | Median | Std | Min | Max | Unique Values |")
            report.append("|---|---:|---:|---:|---:|---:|---:|")
            for feature, item in distributions.items():
                report.append(
                    "| {feature} | {mean} | {median} | {std} | {minv} | {maxv} | {uniq} |".format(
                        feature=feature,
                        mean=self._fmt_num(item.get("mean")),
                        median=self._fmt_num(item.get("median")),
                        std=self._fmt_num(item.get("std")),
                        minv=self._fmt_num(item.get("min")),
                        maxv=self._fmt_num(item.get("max")),
                        uniq=int(item.get("unique_values", 0)),
                    )
                )

            dist_assets = self._collect_eda_visual_assets(eda, ["distribution_visualizations"])
            if dist_assets:
                report.append("### Distribution Charts")
                for path in dist_assets:
                    asset_path = Path(str(path))
                    title = asset_path.stem.replace("_", " ").title()
                    report.append(f"- `{asset_path}`")
                    report.append(f"![{title}]({asset_path.as_posix()})")
            report.append("")

        # Outlier analysis
        report.append("## 9. Outlier Analysis")
        if outliers:
            report.append("| Feature | Outlier Count | Outlier % | Lower Bound | Upper Bound |")
            report.append("|---|---:|---:|---:|---:|")
            for col, item in outliers.items():
                report.append(
                    "| {col} | {count} | {pct:.2f}% | {lb} | {ub} |".format(
                        col=col,
                        count=int(item.get("count", 0)),
                        pct=float(item.get("percentage", 0)),
                        lb=self._fmt_num(item.get("lower_bound")),
                        ub=self._fmt_num(item.get("upper_bound")),
                    )
                )
        else:
            report.append("- No outliers detected by the configured method.")
        report.append("")

        # Categorical analysis
        categorical = eda.get("categorical_analysis", analysis_results.get("categorical_analysis", {}))
        if categorical:
            report.append("## 10. Categorical Analysis")
            for col, item in categorical.items():
                report.append(f"### {col}")
                report.append(f"- **Unique values:** {int(item.get('unique_values', 0))}")
                report.append(f"- **Missing:** {int(item.get('missing', 0))}")
                most_common = item.get("most_common", {})
                if most_common:
                    report.append("- **Top Categories:**")
                    for label, cnt in most_common.items():
                        report.append(f"  - {label}: {cnt}")
            report.append("")

        # ML Results
        if "ml_results" in analysis_results:
            ml = analysis_results["ml_results"]
            report.append("## 11. Machine Learning Results")
            report.append(f"- **Task Type:** {ml.get('task_type', 'N/A')}")
            report.append(f"- **Best Model:** {ml.get('best_model', 'N/A')}")
            if "best_score" in ml:
                report.append(f"- **Best Score:** {self._fmt_num(ml.get('best_score'))}")
            report.append("")

        # All visuals/charts/graphs/dashboards
        report.append("## 12. Visual Assets")
        if visual_assets:
            report.append("The following generated assets are included as part of this analysis:")
            for path in visual_assets:
                asset_path = Path(str(path))
                title = asset_path.stem.replace("_", " ").title()
                report.append(f"### {title}")
                report.append(f"- File: `{asset_path}`")
                report.append(f"![{title}]({asset_path.as_posix()})")
                report.append("")
        else:
            report.append("- No generated visual assets were found for this run.")
            report.append("")

        # Raw artifacts (compact JSON) for traceability
        report.append("## 13. Appendix: Raw Analysis Snapshot")
        report.append("```json")
        report.append(json.dumps(self._build_raw_snapshot(analysis_results), indent=2, default=str))
        report.append("```")
        report.append("")
        report.append("---")
        report.append("Prepared by AI Data Science Research Assistant")

        report_text = "\n".join(report)

        # Save report
        report_path = self.output_dir / f"{job_id}_report.md"
        report_path.write_text(report_text)

        return str(report_path)

    def _fmt_num(self, value: Any) -> str:
        try:
            return f"{float(value):.4f}"
        except Exception:
            return str(value)

    def _collect_visual_assets(self, analysis_results: Dict[str, Any]) -> List[str]:
        """Collect all known visual artifact paths across analysis outputs."""
        assets: List[str] = []

        def _extend_paths(values: Iterable[Any]) -> None:
            for item in values:
                if isinstance(item, str) and item.strip():
                    assets.append(item)

        eda = analysis_results.get("eda", {})
        if isinstance(eda, dict):
            _extend_paths(eda.get("visualizations", []))
            _extend_paths(eda.get("distribution_visualizations", []))
            _extend_paths(eda.get("correlation_visualizations", []))

        # Generic buckets from present/future modules
        for key in ["visualizations", "charts", "graphs", "dashboards", "artifacts", "images"]:
            value = analysis_results.get(key)
            if isinstance(value, list):
                _extend_paths(value)
            elif isinstance(value, dict):
                _extend_paths(v for v in value.values() if isinstance(v, str))

        # De-duplicate while preserving order
        seen = set()
        deduped: List[str] = []
        for path in assets:
            if path not in seen:
                seen.add(path)
                deduped.append(path)
        return deduped

    def _collect_eda_visual_assets(self, eda: Dict[str, Any], keys: List[str]) -> List[str]:
        assets: List[str] = []
        for key in keys:
            value = eda.get(key, []) if isinstance(eda, dict) else []
            if isinstance(value, list):
                for item in value:
                    if isinstance(item, str) and item.strip():
                        assets.append(item)
        # Preserve order, drop duplicates
        seen = set()
        result: List[str] = []
        for path in assets:
            if path not in seen:
                seen.add(path)
                result.append(path)
        return result

    def _build_raw_snapshot(self, analysis_results: Dict[str, Any]) -> Dict[str, Any]:
        """Keep snapshot concise while preserving key computed sections."""
        keys_to_keep = [
            "job_id",
            "status",
            "query",
            "eda_summary",
            "insights",
            "ml_results",
            "eda",
        ]
        return {k: analysis_results.get(k) for k in keys_to_keep if k in analysis_results}

    def generate_notebook(self, code: str, job_id: str) -> str:
        """Generate Jupyter notebook"""
        notebook = {
            "cells": [
                {
                    "cell_type": "markdown",
                    "metadata": {},
                    "source": ["# Data Science Analysis\n", f"Job ID: {job_id}"],
                },
                {
                    "cell_type": "code",
                    "execution_count": None,
                    "metadata": {},
                    "source": code.split("\n"),
                },
            ],
            "metadata": {
                "kernelspec": {
                    "display_name": "Python 3",
                    "language": "python",
                    "name": "python3",
                }
            },
            "nbformat": 4,
            "nbformat_minor": 4,
        }

        notebook_path = self.output_dir / f"{job_id}_analysis.ipynb"
        with open(notebook_path, "w") as f:
            json.dump(notebook, f, indent=2)

        return str(notebook_path)
