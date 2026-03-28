"""
Model explainability helpers.
"""

from __future__ import annotations

from typing import Any, Dict, List

import numpy as np
import pandas as pd


class ModelExplainer:
    def __init__(self, model_bundle: Dict[str, Any]):
        # main.py stores {model, scaler, feature_names}
        self.model_bundle = model_bundle
        self.model = model_bundle.get("model") if isinstance(model_bundle, dict) else model_bundle
        self.scaler = model_bundle.get("scaler") if isinstance(model_bundle, dict) else None
        self.feature_names = model_bundle.get("feature_names", []) if isinstance(model_bundle, dict) else []

    def _prepare_features(self, df: pd.DataFrame) -> pd.DataFrame:
        data = df.copy()
        # Keep only known training features when available.
        if self.feature_names:
            missing = [c for c in self.feature_names if c not in data.columns]
            for col in missing:
                data[col] = 0
            data = data[self.feature_names]

        for col in data.select_dtypes(include=["object", "category"]).columns:
            data[col] = data[col].astype("category").cat.codes

        data = data.fillna(0)
        return data

    def get_feature_importance(self) -> Dict[str, Any]:
        if hasattr(self.model, "feature_importances_"):
            importances = np.array(self.model.feature_importances_, dtype=float)
            return self._format_importance(importances)

        if hasattr(self.model, "coef_"):
            coef = np.array(self.model.coef_, dtype=float)
            if coef.ndim > 1:
                coef = np.mean(np.abs(coef), axis=0)
            else:
                coef = np.abs(coef)
            return self._format_importance(coef)

        return {
            "feature_importance": [],
            "message": "Model does not expose feature importance",
        }

    def compute_shap(self, df: pd.DataFrame) -> Dict[str, Any]:
        prepared = self._prepare_features(df)

        try:
            import shap

            sample = prepared.head(200)
            model_input = sample
            if self.scaler is not None:
                model_input = self.scaler.transform(sample)

            explainer = shap.Explainer(self.model)
            shap_values = explainer(model_input)

            # Return compact payload to avoid huge response sizes.
            values = np.array(shap_values.values)
            mean_abs = np.mean(np.abs(values), axis=0)
            names = self.feature_names or list(prepared.columns)

            importance = [
                {"feature": names[i], "importance": float(mean_abs[i])}
                for i in range(min(len(names), len(mean_abs)))
            ]
            importance.sort(key=lambda x: x["importance"], reverse=True)

            return {
                "feature_importance": importance[:20],
                "num_samples": int(sample.shape[0]),
            }
        except Exception as exc:
            return {
                "feature_importance": self.get_feature_importance().get("feature_importance", []),
                "warning": f"SHAP unavailable or failed: {exc}",
            }

    def _format_importance(self, importance: np.ndarray) -> Dict[str, Any]:
        names = self.feature_names or [f"feature_{i}" for i in range(len(importance))]
        values = importance.astype(float)
        if values.sum() > 0:
            values = values / values.sum()

        items: List[Dict[str, Any]] = [
            {"feature": names[i], "importance": float(values[i])}
            for i in range(min(len(names), len(values)))
        ]
        items.sort(key=lambda x: x["importance"], reverse=True)
        return {"feature_importance": items}
