"""Helpers for building prompt-safe context from an uploaded dataframe."""

from __future__ import annotations

from typing import Any, Dict, List

import pandas as pd


def build_dataframe_context(df: pd.DataFrame, sample_rows: int = 5) -> Dict[str, Any]:
    """Return a compact, deterministic snapshot of the live dataframe."""
    if df is None:
        return {
            "shape": [0, 0],
            "columns": [],
            "dtypes": {},
            "sample_rows": [],
            "numeric_summary": {},
            "missing_values": {},
        }

    numeric_df = df.select_dtypes(include="number")
    numeric_summary: Dict[str, Dict[str, float]] = {}
    if not numeric_df.empty:
        summary = numeric_df.describe().to_dict()
        for column in numeric_df.columns:
            col_summary = dict(summary.get(column, {}))
            try:
                col_summary["skewness"] = float(numeric_df[column].skew())
            except Exception:
                col_summary["skewness"] = 0.0
            try:
                col_summary["kurtosis"] = float(numeric_df[column].kurtosis())
            except Exception:
                col_summary["kurtosis"] = 0.0
            numeric_summary[column] = {
                key: float(value) if isinstance(value, (int, float)) else value
                for key, value in col_summary.items()
            }

    sample = df.head(max(0, int(sample_rows)))
    missing_values = df.isna().sum().to_dict()

    return {
        "shape": [int(df.shape[0]), int(df.shape[1])],
        "columns": df.columns.tolist(),
        "dtypes": {column: str(dtype) for column, dtype in df.dtypes.items()},
        "sample_rows": sample.to_dict("records"),
        "numeric_summary": numeric_summary,
        "missing_values": {column: int(count) for column, count in missing_values.items()},
    }


def format_dataframe_context(df: pd.DataFrame, sample_rows: int = 5) -> str:
    """Format the dataframe snapshot as a prompt-friendly text block."""
    context = build_dataframe_context(df, sample_rows=sample_rows)

    lines: List[str] = []
    lines.append(f"Shape: {context['shape'][0]} rows x {context['shape'][1]} columns")
    lines.append(f"Columns: {', '.join(map(str, context['columns'])) if context['columns'] else 'None'}")
    lines.append("Dtypes:")
    for column, dtype in context["dtypes"].items():
        lines.append(f"- {column}: {dtype}")

    if context["missing_values"]:
        lines.append("Missing values:")
        for column, count in context["missing_values"].items():
            lines.append(f"- {column}: {count}")

    if context["sample_rows"]:
        lines.append("Sample rows:")
        sample_df = pd.DataFrame(context["sample_rows"])
        lines.append(sample_df.to_string(index=False))

    if context["numeric_summary"]:
        lines.append("Numeric summary:")
        for column, summary in context["numeric_summary"].items():
            parts = []
            for key in ["mean", "std", "min", "25%", "50%", "75%", "max", "skewness", "kurtosis"]:
                if key in summary and summary[key] is not None:
                    value = summary[key]
                    if isinstance(value, (int, float)):
                        parts.append(f"{key}={value:.4f}")
                    else:
                        parts.append(f"{key}={value}")
            lines.append(f"- {column}: {', '.join(parts)}")

    return "\n".join(lines)