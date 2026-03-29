"""
Runtime compatibility router.
Extracted from main.py to keep app entrypoint small and maintainable.
"""

from __future__ import annotations

from datetime import datetime, timezone
import io
import json
import os
import pickle
import re
import time
import uuid
from contextlib import contextmanager
from typing import Any, Dict, List, Optional

from starlette.responses import StreamingResponse
from starlette.responses import StreamingResponse

import joblib
import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, ConfigDict, Field

from app.explainability import ModelExplainer
from app.security import bind_tenant_context, require_api_key
from app.runtime_state import (
    CHAT_HISTORY,
    DATASETS,
    PREPROCESSORS,
    TRAINED_MODELS,
    eda_engine,
    ml_engine,
    read_uploaded_dataframe,
)
from app.preprocessing import DataPreprocessor

router = APIRouter(tags=["runtime"], dependencies=[Depends(require_api_key), Depends(bind_tenant_context)])


class TrainRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    dataset_id: str = Field(alias="datasetId")
    target_column: str = Field(alias="targetColumn")
    task_type: str = Field(default="auto", alias="taskType")
    use_gpu: bool = Field(default=True, alias="useGpu")
    hyperparameter_tuning: bool = Field(default=False, alias="hyperparameterTuning")
    n_trials: int = Field(default=50, alias="nTrials")
    cv_folds: int = Field(default=5, alias="cvFolds")
    test_size: float = Field(default=0.2, alias="testSize")


class SelectedModelTrainRequest(BaseModel):
    dataset_id: str
    model_name: str
    x_columns: List[str]
    y_columns: List[str]
    task_type: str = "auto"
    test_size: float = 0.2
    random_state: int = 42


class PreprocessRequest(BaseModel):
    dataset_id: str
    handle_missing: str = "auto"
    handle_outliers: str = "none"
    encode_categorical: str = "auto"
    scale_features: str = "standard"
    feature_selection: str = "none"


class PredictRequest(BaseModel):
    dataset_id: str
    model_id: str
    data: List[Dict[str, Any]]


class ChatRequest(BaseModel):
    message: str
    dataset_id: Optional[str] = None
    session_id: Optional[str] = None


class QueryRequest(BaseModel):
    session_id: str
    query: str
    dataset_id: Optional[str] = None


class AutoAnalysisRequest(BaseModel):
    session_id: str
    dataset_id: str
    analysis_type: str = "full"
    target_column: Optional[str] = None
    model_type: str = "auto"


class ClusterRequest(BaseModel):
    dataset_id: str
    x_columns: Optional[List[str]] = None
    algorithm: str = "kmeans"
    n_clusters: int = 3
    eps: float = 0.5
    min_samples: int = 5


class KaggleSearchRequest(BaseModel):
    query: str
    page: int = 1
    kaggle_username: Optional[str] = None
    kaggle_key: Optional[str] = None


class KaggleDownloadRequest(BaseModel):
    dataset_ref: str
    kaggle_username: Optional[str] = None
    kaggle_key: Optional[str] = None


class DataCleaningRequest(BaseModel):
    missing_strategy: str = "fill_mean"
    trim_text: bool = True
    remove_duplicates: bool = True
    handle_outliers: bool = False
    outlier_action: str = "clip"
    type_fixer_enabled: bool = False
    number_columns: Optional[List[str]] = None
    date_columns: Optional[List[str]] = None
    string_columns: Optional[List[str]] = None
    date_formats: List[str] = Field(default_factory=list)
    number_thousands_separator: str = ","
    number_decimal_separator: str = "."
    date_day_first: bool = False
    text_cleaner_enabled: bool = False
    text_clean_columns: Optional[List[str]] = None
    text_lowercase: bool = True
    text_remove_punctuation: bool = True
    text_remove_stopwords: bool = False
    custom_stopwords: List[str] = Field(default_factory=list)
    category_standardize_enabled: bool = False
    category_columns: Optional[List[str]] = None
    category_case: str = "lower"
    category_mappings: Dict[str, Dict[str, str]] = Field(default_factory=dict)
    noise_smoothing_enabled: bool = False
    noise_smoothing_columns: Optional[List[str]] = None
    noise_smoothing_method: str = "rolling_mean"
    noise_smoothing_window: int = 3


class FeatureEngineeringSaveRequest(BaseModel):
    headers: List[str]
    rows: List[Dict[str, Any]]
    name: Optional[str] = None
    notes: List[str] = Field(default_factory=list)


class StatisticsMathRequest(BaseModel):
    dataset_id: str
    numeric_column: Optional[str] = None
    group_column: Optional[str] = None
    categorical_column: Optional[str] = None
    time_column: Optional[str] = None
    probability_value: Optional[float] = None
    confidence_level: float = 0.95
    ab_group_column: Optional[str] = None
    ab_outcome_column: Optional[str] = None
    control_label: Optional[str] = None
    variant_label: Optional[str] = None
    prior_alpha: float = 1.0
    prior_beta: float = 1.0
    arima_order: List[int] = Field(default_factory=lambda: [1, 1, 1])
    sarima_order: List[int] = Field(default_factory=lambda: [1, 1, 1])
    seasonal_order: List[int] = Field(default_factory=lambda: [1, 1, 1])
    seasonal_period: int = 12
    forecast_steps: int = 12
    matrix_columns: Optional[List[str]] = None
    vector_columns: Optional[List[str]] = None


DEFAULT_STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "he", "in", "is",
    "it", "its", "of", "on", "that", "the", "to", "was", "were", "will", "with", "or", "not",
}


@contextmanager
def _temporary_kaggle_credentials(username: Optional[str], key: Optional[str]):
    original_username = os.environ.get("KAGGLE_USERNAME")
    original_key = os.environ.get("KAGGLE_KEY")
    try:
        if username and key:
            os.environ["KAGGLE_USERNAME"] = username
            os.environ["KAGGLE_KEY"] = key
        yield
    finally:
        if original_username is None:
            os.environ.pop("KAGGLE_USERNAME", None)
        else:
            os.environ["KAGGLE_USERNAME"] = original_username

        if original_key is None:
            os.environ.pop("KAGGLE_KEY", None)
        else:
            os.environ["KAGGLE_KEY"] = original_key


def _infer_task_type(df: pd.DataFrame, y_columns: List[str], preferred: str = "auto") -> str:
    if preferred in {"classification", "regression", "multi_output"}:
        return preferred

    if len(y_columns) > 1:
        return "multi_output"

    y = df[y_columns[0]]
    if pd.api.types.is_numeric_dtype(y) and y.nunique(dropna=True) > 20:
        return "regression"
    return "classification"


def _encode_features(df_x: pd.DataFrame) -> pd.DataFrame:
    x = df_x.copy()
    obj_cols = x.select_dtypes(include=["object", "category", "bool"]).columns.tolist()
    if obj_cols:
        x = pd.get_dummies(x, columns=obj_cols, drop_first=False)
    return x.fillna(0)


def _encode_targets_for_classification(df_y: pd.DataFrame) -> tuple[pd.DataFrame, Dict[str, List[Any]]]:
    encoded = pd.DataFrame(index=df_y.index)
    labels: Dict[str, List[Any]] = {}
    for col in df_y.columns:
        le = LabelEncoder()
        col_values = df_y[col].astype("string").fillna("<missing>")
        encoded[col] = le.fit_transform(col_values)
        labels[col] = le.classes_.tolist()
    return encoded, labels


def _resolve_model(model_name: str, task_type: str):
    from sklearn.base import clone
    from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
    from sklearn.linear_model import LinearRegression, LogisticRegression
    from sklearn.multioutput import MultiOutputClassifier, MultiOutputRegressor
    from sklearn.neighbors import KNeighborsClassifier, KNeighborsRegressor
    from sklearn.svm import SVC, SVR
    from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor

    name = model_name.strip().lower()

    regression_models = {
        "linear regression": LinearRegression(),
        "decision tree": DecisionTreeRegressor(random_state=42),
        "random forest": RandomForestRegressor(n_estimators=200, random_state=42),
        "svm": SVR(),
        "knn": KNeighborsRegressor(n_neighbors=5),
    }

    classification_models = {
        "logistic regression": LogisticRegression(max_iter=2000),
        "decision tree": DecisionTreeClassifier(random_state=42),
        "random forest": RandomForestClassifier(n_estimators=200, random_state=42),
        "svm": SVC(probability=True),
        "knn": KNeighborsClassifier(n_neighbors=5),
    }

    try:
        from xgboost import XGBClassifier, XGBRegressor  # type: ignore[import-not-found]

        regression_models["xgboost"] = XGBRegressor(
            n_estimators=200,
            learning_rate=0.05,
            max_depth=6,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=42,
            n_jobs=2,
        )
        classification_models["xgboost"] = XGBClassifier(
            n_estimators=200,
            learning_rate=0.05,
            max_depth=6,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=42,
            n_jobs=2,
            eval_metric="logloss",
        )
    except Exception:
        pass

    if task_type == "regression":
        if name not in regression_models:
            raise HTTPException(status_code=400, detail=f"Model '{model_name}' is not available for regression")
        return regression_models[name]

    if task_type == "classification":
        if name not in classification_models:
            raise HTTPException(status_code=400, detail=f"Model '{model_name}' is not available for classification")
        return classification_models[name]

    # multi_output
    if name in regression_models:
        return MultiOutputRegressor(clone(regression_models[name]))
    if name in classification_models:
        return MultiOutputClassifier(clone(classification_models[name]))

    raise HTTPException(status_code=400, detail=f"Model '{model_name}' is not available for multi-output")


def _is_missing(value: Any) -> bool:
    return value is None or str(value).strip() == ""


def _choose_fill_value(series: pd.Series, strategy: str) -> Any:
    non_missing = series[~series.apply(_is_missing)]
    numeric = pd.to_numeric(non_missing, errors="coerce")
    numeric = numeric.dropna()

    if strategy == "fill_zero":
        return 0 if not numeric.empty else "Unknown"
    if strategy == "fill_mean" and not numeric.empty:
        return float(numeric.mean())
    if strategy == "fill_median" and not numeric.empty:
        return float(numeric.median())

    mode = non_missing.mode(dropna=True)
    if not mode.empty:
        return mode.iloc[0]
    return "Unknown"


def _select_columns(requested: Optional[List[str]], available: List[str]) -> List[str]:
    if not requested:
        return available
    wanted = {str(col).strip() for col in requested if str(col).strip()}
    return [col for col in available if col in wanted]


def _parse_numeric_value(value: Any, thousands_sep: str, decimal_sep: str) -> Any:
    if _is_missing(value) or isinstance(value, (int, float, np.number)):
        return value

    text = str(value).strip()
    if not text:
        return value

    candidate = text.replace(" ", "")
    if thousands_sep and thousands_sep != decimal_sep:
        candidate = candidate.replace(thousands_sep, "")
    if decimal_sep and decimal_sep != ".":
        candidate = candidate.replace(decimal_sep, ".")

    try:
        return float(candidate)
    except Exception:
        return value


def _apply_type_fixer(cleaned: pd.DataFrame, req: DataCleaningRequest) -> Dict[str, Any]:
    if not req.type_fixer_enabled:
        return {"enabled": False}

    all_cols = cleaned.columns.tolist()
    object_like = cleaned.select_dtypes(include=["object", "string", "category"]).columns.tolist()

    number_cols = _select_columns(req.number_columns, object_like if req.number_columns is None else all_cols)

    auto_date_cols = [
        col for col in object_like
        if any(token in str(col).lower() for token in ["date", "time", "timestamp"])
    ]
    date_cols = _select_columns(req.date_columns, auto_date_cols if req.date_columns is None else all_cols)
    string_cols = _select_columns(req.string_columns, object_like if req.string_columns is None else all_cols)

    for col in number_cols:
        cleaned[col] = cleaned[col].apply(
            lambda v: _parse_numeric_value(v, req.number_thousands_separator, req.number_decimal_separator)
        )

    for col in date_cols:
        source = cleaned[col]
        parsed: Optional[pd.Series] = None
        best_count = -1

        for fmt in [f.strip() for f in req.date_formats if str(f).strip()]:
            candidate = pd.to_datetime(source, format=fmt, errors="coerce", dayfirst=req.date_day_first)
            count = int(candidate.notna().sum())
            if count > best_count:
                parsed = candidate
                best_count = count

        if parsed is None or best_count <= 0:
            parsed = pd.to_datetime(source, errors="coerce", dayfirst=req.date_day_first)

        cleaned[col] = parsed.dt.strftime("%Y-%m-%d").where(parsed.notna(), source)

    for col in string_cols:
        cleaned[col] = cleaned[col].apply(lambda v: str(v) if not _is_missing(v) else v)

    return {
        "enabled": True,
        "number_columns": number_cols,
        "date_columns": date_cols,
        "string_columns": string_cols,
    }


def _apply_text_cleaner(cleaned: pd.DataFrame, req: DataCleaningRequest) -> Dict[str, Any]:
    if not req.text_cleaner_enabled:
        return {"enabled": False}

    text_cols = cleaned.select_dtypes(include=["object", "string", "category"]).columns.tolist()
    selected_cols = _select_columns(req.text_clean_columns, text_cols)

    stopwords = set(DEFAULT_STOPWORDS)
    stopwords.update({str(word).strip().lower() for word in req.custom_stopwords if str(word).strip()})

    for col in selected_cols:
        def _clean_text(v: Any) -> Any:
            if _is_missing(v):
                return v
            text = str(v).strip()
            if req.text_lowercase:
                text = text.lower()
            if req.text_remove_punctuation:
                text = re.sub(r"[^\w\s]", " ", text)
            if req.text_remove_stopwords:
                tokens = [tok for tok in text.split() if tok and tok.lower() not in stopwords]
                text = " ".join(tokens)
            return re.sub(r"\s+", " ", text).strip()

        cleaned[col] = cleaned[col].apply(_clean_text)

    return {
        "enabled": True,
        "columns": selected_cols,
    }


def _apply_category_standardization(cleaned: pd.DataFrame, req: DataCleaningRequest) -> Dict[str, Any]:
    if not req.category_standardize_enabled:
        return {"enabled": False}

    category_cols = cleaned.select_dtypes(include=["object", "string", "category"]).columns.tolist()
    selected_cols = _select_columns(req.category_columns, category_cols)

    normalized_mappings: Dict[str, Dict[str, str]] = {}
    for col, mapping in req.category_mappings.items():
        normalized_mappings[col] = {
            str(k).strip().lower(): str(v).strip() for k, v in mapping.items()
        }

    case_mode = (req.category_case or "lower").strip().lower()

    for col in selected_cols:
        mapping = normalized_mappings.get(col, {})

        def _normalize(v: Any) -> Any:
            if _is_missing(v):
                return v
            text = str(v).strip()
            lookup = mapping.get(text.lower())
            if lookup is not None:
                text = lookup

            if case_mode == "lower":
                return text.lower()
            if case_mode == "upper":
                return text.upper()
            if case_mode == "title":
                return text.title()
            return text

        cleaned[col] = cleaned[col].apply(_normalize)

    return {
        "enabled": True,
        "columns": selected_cols,
        "case": case_mode,
    }


def _apply_noise_smoothing(cleaned: pd.DataFrame, req: DataCleaningRequest) -> Dict[str, Any]:
    if not req.noise_smoothing_enabled:
        return {"enabled": False}

    numeric_cols = cleaned.select_dtypes(include=[np.number]).columns.tolist()
    selected_cols = _select_columns(req.noise_smoothing_columns, numeric_cols)

    window = max(2, int(req.noise_smoothing_window or 3))
    method = (req.noise_smoothing_method or "rolling_mean").strip().lower()

    for col in selected_cols:
        series = pd.to_numeric(cleaned[col], errors="coerce")
        if series.notna().sum() < 2:
            continue
        if method == "rolling_median":
            smoothed = series.rolling(window=window, min_periods=1).median()
        else:
            smoothed = series.rolling(window=window, min_periods=1).mean()
        cleaned[col] = smoothed

    return {
        "enabled": True,
        "columns": selected_cols,
        "method": method,
        "window": window,
    }


def _clean_dataframe(df: pd.DataFrame, req: DataCleaningRequest) -> tuple[pd.DataFrame, Dict[str, Any]]:
    cleaned = df.copy()

    before_rows = int(len(cleaned))
    before_missing = int(cleaned.applymap(_is_missing).sum().sum())

    if req.trim_text:
        obj_cols = cleaned.select_dtypes(include=["object", "string", "category"]).columns
        for col in obj_cols:
            cleaned[col] = cleaned[col].apply(lambda v: v.strip() if isinstance(v, str) else v)

    type_fixer_summary = _apply_type_fixer(cleaned, req)
    text_clean_summary = _apply_text_cleaner(cleaned, req)
    category_summary = _apply_category_standardization(cleaned, req)

    if req.missing_strategy == "drop_rows":
        mask = cleaned.apply(lambda row: row.map(_is_missing).any(), axis=1)
        cleaned = cleaned.loc[~mask].copy()
    else:
        for col in cleaned.columns:
            fill_value = _choose_fill_value(cleaned[col], req.missing_strategy)
            cleaned[col] = cleaned[col].apply(lambda v: fill_value if _is_missing(v) else v)

    if req.remove_duplicates:
        cleaned = cleaned.drop_duplicates().copy()

    if req.handle_outliers:
        numeric_cols = cleaned.select_dtypes(include=[np.number]).columns.tolist()
        if numeric_cols:
            bounds: Dict[str, tuple[float, float]] = {}
            for col in numeric_cols:
                series = cleaned[col].dropna()
                if series.empty:
                    continue
                q1 = float(series.quantile(0.25))
                q3 = float(series.quantile(0.75))
                iqr = q3 - q1
                low = q1 - (1.5 * iqr)
                high = q3 + (1.5 * iqr)
                bounds[col] = (low, high)

            if req.outlier_action == "remove":
                keep_mask = pd.Series(True, index=cleaned.index)
                for col, (low, high) in bounds.items():
                    keep_mask &= cleaned[col].isna() | ((cleaned[col] >= low) & (cleaned[col] <= high))
                cleaned = cleaned.loc[keep_mask].copy()
            else:
                for col, (low, high) in bounds.items():
                    cleaned[col] = cleaned[col].clip(lower=low, upper=high)

    smoothing_summary = _apply_noise_smoothing(cleaned, req)

    after_missing = int(cleaned.applymap(_is_missing).sum().sum())

    summary = {
        "rows_before": before_rows,
        "rows_after": int(len(cleaned)),
        "removed_rows": int(before_rows - len(cleaned)),
        "missing_before": before_missing,
        "missing_after": after_missing,
        "operations": {
            "type_fixer": type_fixer_summary,
            "text_cleaner": text_clean_summary,
            "category_standardization": category_summary,
            "noise_smoothing": smoothing_summary,
        },
    }

    return cleaned, summary


def _safe_feature_importance(model: Any, feature_names: List[str]) -> List[Dict[str, Any]]:
    estimator = model
    if hasattr(model, "estimators_") and isinstance(model.estimators_, list) and model.estimators_:
        estimator = model.estimators_[0]

    if hasattr(estimator, "feature_importances_"):
        vals = np.asarray(estimator.feature_importances_, dtype=float)
    elif hasattr(estimator, "coef_"):
        coef = np.asarray(estimator.coef_, dtype=float)
        vals = np.mean(np.abs(coef), axis=0) if coef.ndim > 1 else np.abs(coef)
    else:
        return []

    if vals.size == 0:
        return []

    if vals.sum() > 0:
        vals = vals / vals.sum()

    pairs = [
        {"feature": feature_names[i], "importance": float(vals[i])}
        for i in range(min(len(feature_names), len(vals)))
    ]
    pairs.sort(key=lambda x: x["importance"], reverse=True)
    return pairs


def _evaluate_classification(y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, Any]:
    from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
    return {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "precision": float(precision_score(y_true, y_pred, average="weighted", zero_division=0)),
        "recall": float(recall_score(y_true, y_pred, average="weighted", zero_division=0)),
        "f1": float(f1_score(y_true, y_pred, average="weighted", zero_division=0)),
    }


def _evaluate_regression(y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, Any]:
    from sklearn.metrics import r2_score, mean_absolute_error, mean_squared_error
    mse = float(mean_squared_error(y_true, y_pred))
    return {
        "r2": float(r2_score(y_true, y_pred)),
        "mae": float(mean_absolute_error(y_true, y_pred)),
        "mse": mse,
        "rmse": float(np.sqrt(mse)),
    }


def _resolve_numeric_column(df: pd.DataFrame, preferred: Optional[str]) -> Optional[str]:
    if preferred and preferred in df.columns:
        return preferred
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    return numeric_cols[0] if numeric_cols else None


def _encode_binary_outcome(series: pd.Series) -> Optional[pd.Series]:
    numeric = pd.to_numeric(series, errors="coerce")
    if numeric.notna().sum() >= max(3, int(len(series) * 0.7)):
        return (numeric.fillna(0) > 0).astype(int)

    normalized = series.astype("string").str.strip().str.lower()
    positives = {"1", "true", "yes", "y", "success", "win", "converted"}
    if normalized.isin(positives).any():
        return normalized.isin(positives).astype(int)

    unique_vals = [v for v in normalized.dropna().unique().tolist() if v != ""]
    if len(unique_vals) == 2:
        mapping = {unique_vals[0]: 0, unique_vals[1]: 1}
        return normalized.map(mapping).fillna(0).astype(int)

    return None


@router.post("/statistics-math/analyze")
def statistics_math_analysis(request: StatisticsMathRequest) -> Dict[str, Any]:
    from scipy.stats import beta as beta_distribution, chi2_contingency, f_oneway, norm, t, ttest_ind
    from statsmodels.stats.proportion import proportions_ztest
    from statsmodels.tsa.arima.model import ARIMA
    from statsmodels.tsa.statespace.sarimax import SARIMAX

    if request.dataset_id not in DATASETS:
        raise HTTPException(status_code=404, detail="Dataset not found")

    df = DATASETS[request.dataset_id].copy()
    warnings: List[str] = []

    numeric_column = _resolve_numeric_column(df, request.numeric_column)
    if request.numeric_column and request.numeric_column not in df.columns:
        warnings.append(f"Requested numeric column '{request.numeric_column}' was not found. Using fallback.")

    probability: Dict[str, Any] = {}
    confidence_intervals: Dict[str, Any] = {}
    hypothesis_testing: Dict[str, Any] = {}
    ab_test: Dict[str, Any] = {}
    bayesian: Dict[str, Any] = {}
    time_series: Dict[str, Any] = {}
    linear_algebra: Dict[str, Any] = {}

    if numeric_column:
        numeric_series = pd.to_numeric(df[numeric_column], errors="coerce").dropna()
        if len(numeric_series) >= 3:
            mean_val = float(numeric_series.mean())
            std_val = float(numeric_series.std(ddof=1))
            probability = {
                "column": numeric_column,
                "mean": mean_val,
                "std": std_val,
                "sample_size": int(len(numeric_series)),
                "within_1_std": float(norm.cdf(1) - norm.cdf(-1)) if std_val > 0 else None,
                "within_2_std": float(norm.cdf(2) - norm.cdf(-2)) if std_val > 0 else None,
                "within_3_std": float(norm.cdf(3) - norm.cdf(-3)) if std_val > 0 else None,
            }

            if request.probability_value is not None and std_val > 0:
                z_score = float((request.probability_value - mean_val) / std_val)
                probability.update({
                    "input_value": float(request.probability_value),
                    "z_score": z_score,
                    "p_below_value_normal": float(norm.cdf(z_score)),
                    "p_above_value_normal": float(1.0 - norm.cdf(z_score)),
                    "empirical_p_below_value": float((numeric_series <= request.probability_value).mean()),
                })

            confidence = float(np.clip(request.confidence_level, 0.5, 0.999))
            alpha = 1.0 - confidence
            stderr = float(std_val / np.sqrt(len(numeric_series))) if len(numeric_series) > 1 else 0.0
            margin = float(t.ppf(1 - alpha / 2, df=len(numeric_series) - 1) * stderr) if len(numeric_series) > 1 else 0.0
            confidence_intervals = {
                "column": numeric_column,
                "confidence_level": confidence,
                "mean": mean_val,
                "lower": float(mean_val - margin),
                "upper": float(mean_val + margin),
                "margin_of_error": margin,
                "n": int(len(numeric_series)),
            }
        else:
            warnings.append("Not enough numeric rows to compute probability and confidence interval outputs.")
    else:
        warnings.append("No numeric column available for probability, confidence interval, and time-series baselines.")

    group_column = request.group_column if request.group_column in df.columns else None
    categorical_column = request.categorical_column if request.categorical_column in df.columns else None

    if group_column and numeric_column:
        grouped = df[[group_column, numeric_column]].dropna().copy()
        grouped[numeric_column] = pd.to_numeric(grouped[numeric_column], errors="coerce")
        grouped = grouped.dropna()
        if not grouped.empty:
            groups = [g for g in grouped[group_column].astype("string").unique().tolist() if g not in {"", "<NA>"}]
            if len(groups) >= 2:
                g1 = grouped.loc[grouped[group_column].astype("string") == groups[0], numeric_column].to_numpy(dtype=float)
                g2 = grouped.loc[grouped[group_column].astype("string") == groups[1], numeric_column].to_numpy(dtype=float)
                if len(g1) >= 2 and len(g2) >= 2:
                    t_stat, t_p = ttest_ind(g1, g2, equal_var=False, nan_policy="omit")
                    hypothesis_testing["t_test"] = {
                        "group_a": groups[0],
                        "group_b": groups[1],
                        "t_statistic": float(t_stat),
                        "p_value": float(t_p),
                        "mean_a": float(np.mean(g1)),
                        "mean_b": float(np.mean(g2)),
                        "n_a": int(len(g1)),
                        "n_b": int(len(g2)),
                    }

                anova_groups = [
                    grouped.loc[grouped[group_column].astype("string") == g, numeric_column].to_numpy(dtype=float)
                    for g in groups
                ]
                anova_groups = [arr for arr in anova_groups if len(arr) >= 2]
                if len(anova_groups) >= 2:
                    f_stat, f_p = f_oneway(*anova_groups)
                    hypothesis_testing["anova"] = {
                        "group_column": group_column,
                        "groups_used": int(len(anova_groups)),
                        "f_statistic": float(f_stat),
                        "p_value": float(f_p),
                    }
                else:
                    warnings.append("ANOVA skipped: each group needs at least 2 valid observations.")
            else:
                warnings.append("T-test/ANOVA skipped: group column needs at least two groups.")

    if group_column and categorical_column:
        contingency = pd.crosstab(df[group_column], df[categorical_column])
        if contingency.shape[0] >= 2 and contingency.shape[1] >= 2:
            chi2, p_value, dof, _ = chi2_contingency(contingency)
            hypothesis_testing["chi_square"] = {
                "group_column": group_column,
                "categorical_column": categorical_column,
                "chi2_statistic": float(chi2),
                "p_value": float(p_value),
                "degrees_of_freedom": int(dof),
                "contingency_shape": [int(contingency.shape[0]), int(contingency.shape[1])],
            }
        else:
            warnings.append("Chi-square skipped: contingency table needs at least 2x2 shape.")

    ab_group_col = request.ab_group_column if request.ab_group_column in df.columns else group_column
    ab_outcome_col = request.ab_outcome_column if request.ab_outcome_column in df.columns else None
    if ab_group_col and ab_outcome_col:
        ab_df = df[[ab_group_col, ab_outcome_col]].dropna().copy()
        ab_df[ab_group_col] = ab_df[ab_group_col].astype("string")
        labels = [str(v) for v in ab_df[ab_group_col].dropna().unique().tolist() if str(v).strip()]
        control_label = request.control_label or (labels[0] if len(labels) >= 1 else None)
        variant_label = request.variant_label or (labels[1] if len(labels) >= 2 else None)

        encoded = _encode_binary_outcome(ab_df[ab_outcome_col])
        if encoded is None:
            warnings.append("A/B and Bayesian analysis skipped: outcome column could not be interpreted as binary.")
        elif control_label and variant_label:
            ab_df = ab_df.assign(__outcome=encoded)
            control_mask = ab_df[ab_group_col] == control_label
            variant_mask = ab_df[ab_group_col] == variant_label

            control = ab_df.loc[control_mask, "__outcome"]
            variant = ab_df.loc[variant_mask, "__outcome"]

            if len(control) >= 2 and len(variant) >= 2:
                control_success = int(control.sum())
                variant_success = int(variant.sum())
                control_rate = float(control_success / len(control))
                variant_rate = float(variant_success / len(variant))

                z_stat, z_p = proportions_ztest(
                    count=np.array([variant_success, control_success]),
                    nobs=np.array([len(variant), len(control)]),
                    alternative="two-sided",
                )

                ab_test = {
                    "group_column": ab_group_col,
                    "outcome_column": ab_outcome_col,
                    "control_label": control_label,
                    "variant_label": variant_label,
                    "control": {
                        "n": int(len(control)),
                        "successes": control_success,
                        "rate": control_rate,
                    },
                    "variant": {
                        "n": int(len(variant)),
                        "successes": variant_success,
                        "rate": variant_rate,
                    },
                    "absolute_lift": float(variant_rate - control_rate),
                    "relative_lift": float((variant_rate - control_rate) / control_rate) if control_rate > 0 else None,
                    "z_statistic": float(z_stat),
                    "p_value": float(z_p),
                }

                prior_alpha = max(0.001, float(request.prior_alpha))
                prior_beta = max(0.001, float(request.prior_beta))
                control_alpha = prior_alpha + control_success
                control_beta = prior_beta + (len(control) - control_success)
                variant_alpha = prior_alpha + variant_success
                variant_beta = prior_beta + (len(variant) - variant_success)

                control_ci = beta_distribution.ppf([0.025, 0.975], control_alpha, control_beta)
                variant_ci = beta_distribution.ppf([0.025, 0.975], variant_alpha, variant_beta)

                draws = 20000
                control_samples = np.random.beta(control_alpha, control_beta, size=draws)
                variant_samples = np.random.beta(variant_alpha, variant_beta, size=draws)

                bayesian = {
                    "prior": {"alpha": prior_alpha, "beta": prior_beta},
                    "control_posterior": {
                        "alpha": float(control_alpha),
                        "beta": float(control_beta),
                        "mean": float(control_alpha / (control_alpha + control_beta)),
                        "credible_interval_95": [float(control_ci[0]), float(control_ci[1])],
                    },
                    "variant_posterior": {
                        "alpha": float(variant_alpha),
                        "beta": float(variant_beta),
                        "mean": float(variant_alpha / (variant_alpha + variant_beta)),
                        "credible_interval_95": [float(variant_ci[0]), float(variant_ci[1])],
                    },
                    "p_variant_gt_control": float(np.mean(variant_samples > control_samples)),
                    "expected_uplift": float(np.mean(variant_samples - control_samples)),
                }
            else:
                warnings.append("A/B and Bayesian analysis skipped: control and variant each need at least 2 rows.")
        else:
            warnings.append("A/B and Bayesian analysis skipped: could not infer two test groups.")

    time_col = request.time_column if request.time_column in df.columns else None
    if time_col and numeric_column:
        ts = df[[time_col, numeric_column]].dropna().copy()
        ts[time_col] = pd.to_datetime(ts[time_col], errors="coerce")
        ts[numeric_column] = pd.to_numeric(ts[numeric_column], errors="coerce")
        ts = ts.dropna().sort_values(time_col)

        if len(ts) >= 20:
            y = pd.Series(ts[numeric_column].to_numpy(dtype=float), index=ts[time_col])
            forecast_steps = int(np.clip(request.forecast_steps, 3, 60))

            arima_order = tuple((request.arima_order + [1, 1, 1])[:3])
            sarima_order = tuple((request.sarima_order + [1, 1, 1])[:3])
            seasonal_base = (request.seasonal_order + [1, 1, 1])[:3]
            seasonal_period = max(2, int(request.seasonal_period))
            seasonal_order = (seasonal_base[0], seasonal_base[1], seasonal_base[2], seasonal_period)

            time_series = {
                "time_column": time_col,
                "value_column": numeric_column,
                "n_points": int(len(y)),
                "frequency_hint": pd.infer_freq(y.index[: min(len(y), 50)]),
            }

            try:
                arima_fit = ARIMA(y, order=arima_order).fit()
                arima_forecast = arima_fit.forecast(steps=forecast_steps)
                time_series["arima"] = {
                    "order": list(arima_order),
                    "aic": float(arima_fit.aic),
                    "bic": float(arima_fit.bic),
                    "forecast": [float(v) for v in np.asarray(arima_forecast).tolist()],
                }
            except Exception as exc:
                time_series["arima"] = {"error": str(exc)}

            try:
                sarima_fit = SARIMAX(
                    y,
                    order=sarima_order,
                    seasonal_order=seasonal_order,
                    enforce_stationarity=False,
                    enforce_invertibility=False,
                ).fit(disp=False)
                sarima_forecast = sarima_fit.forecast(steps=forecast_steps)
                time_series["sarima"] = {
                    "order": list(sarima_order),
                    "seasonal_order": list(seasonal_order),
                    "aic": float(sarima_fit.aic),
                    "bic": float(sarima_fit.bic),
                    "forecast": [float(v) for v in np.asarray(sarima_forecast).tolist()],
                }
            except Exception as exc:
                time_series["sarima"] = {"error": str(exc)}
        else:
            warnings.append("Time series analysis skipped: need at least 20 valid timestamped observations.")

    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    matrix_cols = [c for c in (request.matrix_columns or numeric_cols[:6]) if c in numeric_cols]
    if len(matrix_cols) >= 2:
        matrix_df = df[matrix_cols].apply(pd.to_numeric, errors="coerce").dropna()
        if len(matrix_df) >= 2:
            matrix_df = matrix_df.head(500)
            X = matrix_df.to_numpy(dtype=float)
            covariance = np.cov(X, rowvar=False)
            correlation = np.corrcoef(X, rowvar=False)
            gram = np.matmul(X.T, X)
            eigenvalues, eigenvectors = np.linalg.eig(covariance)
            _, singular_values, _ = np.linalg.svd(X, full_matrices=False)

            vector_cols = [c for c in (request.vector_columns or matrix_cols[:2]) if c in matrix_cols]
            vector_payload: Dict[str, Any] = {}
            if len(vector_cols) >= 2:
                vec_a = matrix_df[vector_cols[0]].to_numpy(dtype=float)
                vec_b = matrix_df[vector_cols[1]].to_numpy(dtype=float)
                denom = float(np.linalg.norm(vec_a) * np.linalg.norm(vec_b))
                dot_product = float(np.dot(vec_a, vec_b))
                vector_payload = {
                    "vector_a": vector_cols[0],
                    "vector_b": vector_cols[1],
                    "dot_product": dot_product,
                    "norm_a": float(np.linalg.norm(vec_a)),
                    "norm_b": float(np.linalg.norm(vec_b)),
                    "cosine_similarity": float(dot_product / denom) if denom > 0 else None,
                }

            linear_algebra = {
                "matrix_columns": matrix_cols,
                "shape": [int(X.shape[0]), int(X.shape[1])],
                "rank": int(np.linalg.matrix_rank(X)),
                "covariance_matrix": np.asarray(covariance, dtype=float).round(6).tolist(),
                "correlation_matrix": np.asarray(correlation, dtype=float).round(6).tolist(),
                "gram_matrix": np.asarray(gram, dtype=float).round(6).tolist(),
                "eigenvalues": np.real(eigenvalues).astype(float).round(6).tolist(),
                "eigenvectors": np.real(eigenvectors).astype(float).round(6).tolist(),
                "singular_values": np.asarray(singular_values, dtype=float).round(6).tolist(),
                "vector_analysis": vector_payload,
            }
        else:
            warnings.append("Linear algebra analysis skipped: selected matrix columns need at least 2 complete rows.")
    else:
        warnings.append("Linear algebra analysis skipped: at least two numeric matrix columns are required.")

    return {
        "dataset_id": request.dataset_id,
        "selected_columns": {
            "numeric": numeric_column,
            "group": group_column,
            "categorical": categorical_column,
            "time": time_col,
            "matrix": matrix_cols,
        },
        "probability": probability,
        "hypothesis_testing": hypothesis_testing,
        "confidence_intervals": confidence_intervals,
        "ab_test": ab_test,
        "bayesian": bayesian,
        "time_series": time_series,
        "linear_algebra": linear_algebra,
        "warnings": warnings,
    }


@router.post("/dataset/upload")
@router.post("/datasets/upload")
async def upload_dataset(file: UploadFile = File(...)) -> Dict[str, Any]:
    try:
        content = await file.read()
        df = read_uploaded_dataframe(file, content)

        stem = (file.filename or "dataset").split(".")[0]
        dataset_id = f"ds_{len(DATASETS)}_{stem}"
        DATASETS[dataset_id] = df

        return {
            "id": dataset_id,
            "name": file.filename,
            "headers": df.columns.tolist(),
            "rows": df.head(100).to_dict("records"),
            "rowCount": int(len(df)),
            "colCount": int(len(df.columns)),
            "dtypes": {k: str(v) for k, v in df.dtypes.to_dict().items()},
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/dataset/{dataset_id}")
@router.get("/datasets/{dataset_id}")
def get_dataset(dataset_id: str, rows: int = Query(default=100, ge=1, le=5000)) -> Dict[str, Any]:
    if dataset_id not in DATASETS:
        raise HTTPException(status_code=404, detail="Dataset not found")

    df = DATASETS[dataset_id]
    return {
        "id": dataset_id,
        "headers": df.columns.tolist(),
        "rows": df.head(rows).to_dict("records"),
        "rowCount": int(len(df)),
        "colCount": int(len(df.columns)),
    }


@router.get("/dataset/list")
@router.get("/datasets")
def list_datasets() -> List[Dict[str, Any]]:
    return [{"id": k, "rows": int(len(v)), "cols": int(len(v.columns))} for k, v in DATASETS.items()]


@router.get("/dataset/{dataset_id}/download")
@router.get("/datasets/{dataset_id}/download")
def download_dataset(dataset_id: str, format: str = Query(default="csv")):
    if dataset_id not in DATASETS:
        raise HTTPException(status_code=404, detail="Dataset not found")

    df = DATASETS[dataset_id]
    fmt = format.strip().lower()

    if fmt == "csv":
        payload = df.to_csv(index=False).encode("utf-8")
        media_type = "text/csv"
        filename = f"{dataset_id}.csv"
    elif fmt == "json":
        payload = df.to_json(orient="records", force_ascii=False).encode("utf-8")
        media_type = "application/json"
        filename = f"{dataset_id}.json"
    else:
        raise HTTPException(status_code=400, detail="Unsupported format. Use csv or json")

    return StreamingResponse(
        io.BytesIO(payload),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/dataset/{dataset_id}/clean")
@router.post("/datasets/{dataset_id}/clean")
def clean_dataset(dataset_id: str, request: DataCleaningRequest) -> Dict[str, Any]:
    if dataset_id not in DATASETS:
        raise HTTPException(status_code=404, detail="Dataset not found")

    base_df = DATASETS[dataset_id]
    cleaned_df, summary = _clean_dataframe(base_df, request)

    suffix = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    cleaned_id = f"{dataset_id}_cleaned_{suffix}"
    DATASETS[cleaned_id] = cleaned_df

    return {
        "clean_summary": summary,
        "dataset": {
            "id": cleaned_id,
            "name": f"{dataset_id}_cleaned.csv",
            "headers": cleaned_df.columns.tolist(),
            "rows": cleaned_df.head(100).to_dict("records"),
            "rowCount": int(len(cleaned_df)),
            "colCount": int(len(cleaned_df.columns)),
            "source_dataset_id": dataset_id,
        },
    }


@router.post("/dataset/{dataset_id}/feature-engineer")
@router.post("/datasets/{dataset_id}/feature-engineer")
def save_feature_engineered_dataset(dataset_id: str, request: FeatureEngineeringSaveRequest) -> Dict[str, Any]:
    if dataset_id not in DATASETS:
        raise HTTPException(status_code=404, detail="Dataset not found")

    if not request.rows:
        raise HTTPException(status_code=400, detail="Engineered dataset rows are required")
    if not request.headers:
        raise HTTPException(status_code=400, detail="Engineered dataset headers are required")

    try:
        engineered_df = pd.DataFrame(request.rows)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid engineered rows payload: {exc}") from exc

    missing_headers = [h for h in request.headers if h not in engineered_df.columns]
    if missing_headers:
        raise HTTPException(
            status_code=400,
            detail=f"Engineered dataset is missing expected headers: {', '.join(missing_headers[:10])}",
        )

    engineered_df = engineered_df[request.headers].copy()

    suffix = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    engineered_id = f"{dataset_id}_features_{suffix}"
    DATASETS[engineered_id] = engineered_df

    base_name = (request.name or f"{dataset_id}_engineered").strip() or f"{dataset_id}_engineered"

    return {
        "feature_engineering_summary": {
            "rows": int(len(engineered_df)),
            "columns": int(len(engineered_df.columns)),
            "notes": request.notes,
        },
        "dataset": {
            "id": engineered_id,
            "name": f"{base_name}.csv",
            "headers": engineered_df.columns.tolist(),
            "rows": engineered_df.head(100).to_dict("records"),
            "rowCount": int(len(engineered_df)),
            "colCount": int(len(engineered_df.columns)),
            "source_dataset_id": dataset_id,
        },
    }


@router.delete("/datasets/{dataset_id}")
def delete_dataset(dataset_id: str) -> Dict[str, Any]:
    if dataset_id not in DATASETS:
        raise HTTPException(status_code=404, detail="Dataset not found")
    DATASETS.pop(dataset_id, None)
    return {"success": True}


@router.get("/datasets/{dataset_id}/preview")
def dataset_preview(dataset_id: str, rows: int = Query(default=10, ge=1, le=500)) -> Dict[str, Any]:
    return get_dataset(dataset_id=dataset_id, rows=rows)


@router.post("/preprocess")
def preprocess_data(request: PreprocessRequest) -> Dict[str, Any]:
    if request.dataset_id not in DATASETS:
        raise HTTPException(status_code=404, detail="Dataset not found")

    df = DATASETS[request.dataset_id].copy()
    preprocessor = DataPreprocessor()

    result = preprocessor.fit_transform(
        df,
        handle_missing=request.handle_missing,
        handle_outliers=request.handle_outliers,
        encode_categorical=request.encode_categorical,
        scale_features=request.scale_features,
        feature_selection=request.feature_selection,
    )

    new_id = f"{request.dataset_id}_processed"
    DATASETS[new_id] = result["data"]
    PREPROCESSORS[new_id] = preprocessor

    return {
        "dataset_id": new_id,
        "original_shape": result["original_shape"],
        "new_shape": result["new_shape"],
        "transformations": result["transformations"],
        "removed_columns": result.get("removed_columns", []),
        "encoded_columns": result.get("encoded_columns", {}),
        "scaling_params": result.get("scaling_params", {}),
    }


@router.get("/preprocess/options")
def get_preprocessing_options() -> Dict[str, List[str]]:
    return {
        "handle_missing": ["auto", "drop", "mean", "median", "mode", "knn", "iterative"],
        "handle_outliers": ["none", "clip", "remove", "winsorize", "isolation_forest"],
        "encode_categorical": ["auto", "onehot", "label", "target", "frequency"],
        "scale_features": ["none", "standard", "minmax", "robust", "maxabs", "quantile"],
        "feature_selection": ["none", "correlation", "variance", "rfe", "mutual_info"],
    }


@router.post("/eda/analyze")
def run_eda(dataset_id: str) -> Dict[str, Any]:
    if dataset_id not in DATASETS:
        raise HTTPException(status_code=404, detail="Dataset not found")

    df = DATASETS[dataset_id]
    return eda_engine.full_analysis(df)


@router.post("/eda/statistical-tests")
def statistical_tests(dataset_id: str, column1: str, column2: Optional[str] = None) -> Dict[str, Any]:
    if dataset_id not in DATASETS:
        raise HTTPException(status_code=404, detail="Dataset not found")

    df = DATASETS[dataset_id]
    try:
        return eda_engine.statistical_tests(df, column1, column2)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/ml/train")
def train_models(request: TrainRequest) -> Dict[str, Any]:
    if request.dataset_id not in DATASETS:
        raise HTTPException(status_code=404, detail="Dataset not found")

    df = DATASETS[request.dataset_id]
    if request.target_column not in df.columns:
        raise HTTPException(status_code=400, detail=f"Target column '{request.target_column}' not found")

    results = ml_engine.train_all_models(
        df=df,
        target_column=request.target_column,
        task_type=request.task_type,
        use_gpu=request.use_gpu,
        hyperparameter_tuning=request.hyperparameter_tuning,
        n_trials=request.n_trials,
        cv_folds=request.cv_folds,
        test_size=request.test_size,
    )

    model_id = f"model_{request.dataset_id}_{request.target_column}_{uuid.uuid4().hex[:8]}"
    TRAINED_MODELS[model_id] = {
        **results["best_model"],
        "task_type": results.get("task_type"),
        "source": "train-all",
        "model_name": results.get("best_model_name"),
        "x_columns": [c for c in df.columns if c != request.target_column],
        "y_columns": [request.target_column],
        "dataset_id": request.dataset_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    response = {k: v for k, v in results.items() if k != "best_model"}
    response["model_id"] = model_id
    return response


@router.post("/ml/cluster")
def cluster_dataset(request: ClusterRequest) -> Dict[str, Any]:
    if request.dataset_id not in DATASETS:
        raise HTTPException(status_code=404, detail="Dataset not found")

    df = DATASETS[request.dataset_id].copy()
    x_columns = request.x_columns or df.columns.tolist()
    missing = [c for c in x_columns if c not in df.columns]
    if missing:
        raise HTTPException(status_code=400, detail=f"Unknown clustering columns: {missing}")

    prepared = _encode_features(df[x_columns]).dropna().copy()
    if len(prepared) < 5:
        raise HTTPException(status_code=400, detail="Not enough valid rows for clustering")

    numeric_prepared = prepared.select_dtypes(include=[np.number])
    if numeric_prepared.empty:
        raise HTTPException(status_code=400, detail="Clustering requires numeric or encoded features")

    from sklearn.preprocessing import StandardScaler
    scaler = StandardScaler()
    x_np = scaler.fit_transform(numeric_prepared)

    outcome = ml_engine.cluster_data(
        x_np,
        algorithm=request.algorithm,
        n_clusters=request.n_clusters,
        eps=request.eps,
        min_samples=request.min_samples,
    )

    labels = outcome.pop("labels", [])
    assignments = []
    for idx, lbl in zip(prepared.index.tolist(), labels):
        row_index = int(idx) if isinstance(idx, (int, np.integer)) else str(idx)
        cluster_value = int(lbl) if isinstance(lbl, (int, np.integer)) else -1
        assignments.append({
            "row_index": row_index,
            "cluster": cluster_value,
        })

    preview_rows = prepared.head(min(100, len(prepared))).copy()
    preview_labels = labels[:len(preview_rows)]
    preview_rows["cluster"] = preview_labels

    model_id = f"cluster_{request.dataset_id}_{uuid.uuid4().hex[:8]}"
    TRAINED_MODELS[model_id] = {
        "model": outcome.get("model"),
        "scaler": scaler,
        "feature_names": prepared.columns.tolist(),
        "task_type": "clustering",
        "source": "cluster",
        "model_name": outcome.get("algorithm"),
        "x_columns": x_columns,
        "y_columns": [],
        "dataset_id": request.dataset_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    return {
        "task_type": "clustering",
        "taskType": "clustering",
        "model_id": model_id,
        "algorithm": outcome.get("algorithm"),
        "cluster_count": outcome.get("cluster_count"),
        "clusters": outcome.get("clusters", []),
        "metrics": outcome.get("metrics", {}),
        "x_columns": x_columns,
        "total_rows": int(len(prepared)),
        "cluster_column": "cluster",
        "cluster_assignments": assignments,
        "models": [
            {
                "type": f"{outcome.get('algorithm', 'cluster').upper()} clustering",
                "category": "Clustering",
                "silhouette": outcome.get("metrics", {}).get("silhouette"),
                "inertia": outcome.get("metrics", {}).get("inertia"),
                "calinski_harabasz": outcome.get("metrics", {}).get("calinski_harabasz"),
                "davies_bouldin": outcome.get("metrics", {}).get("davies_bouldin"),
            }
        ],
        "cluster_preview": {
            "headers": preview_rows.columns.tolist(),
            "rows": preview_rows.to_dict("records"),
        },
    }


@router.post("/ml/train-selected")
def train_selected_model(request: SelectedModelTrainRequest) -> Dict[str, Any]:
    if request.dataset_id not in DATASETS:
        raise HTTPException(status_code=404, detail="Dataset not found")

    df = DATASETS[request.dataset_id].copy()
    if not request.x_columns:
        raise HTTPException(status_code=400, detail="At least one X feature is required")
    if not request.y_columns:
        raise HTTPException(status_code=400, detail="At least one Y target is required")

    missing_x = [c for c in request.x_columns if c not in df.columns]
    missing_y = [c for c in request.y_columns if c not in df.columns]
    if missing_x or missing_y:
        raise HTTPException(status_code=400, detail=f"Unknown columns. Missing X: {missing_x}, Missing Y: {missing_y}")

    if set(request.x_columns) & set(request.y_columns):
        raise HTTPException(status_code=400, detail="X and Y columns must not overlap")

    task_type = _infer_task_type(df, request.y_columns, request.task_type)

    if task_type in {"classification", "regression"} and len(request.y_columns) != 1:
        raise HTTPException(status_code=400, detail="Selected model/task requires exactly one Y target")
    if task_type == "multi_output" and len(request.y_columns) < 2:
        raise HTTPException(status_code=400, detail="Multi-output requires at least two Y targets")

    base = df[request.x_columns + request.y_columns].dropna().copy()
    if len(base) < 10:
        raise HTTPException(status_code=400, detail="Not enough valid rows after preprocessing")

    x_df = _encode_features(base[request.x_columns])
    y_df = base[request.y_columns].copy()

    y_label_map: Dict[str, List[Any]] = {}
    multi_output_mode = ""

    if task_type == "classification":
        y_df, y_label_map = _encode_targets_for_classification(y_df)
        y_data = y_df.iloc[:, 0]
    elif task_type == "regression":
        y_data = pd.to_numeric(y_df.iloc[:, 0], errors="coerce").fillna(0)
    else:
        numeric_ratio = [pd.api.types.is_numeric_dtype(y_df[c]) for c in y_df.columns]
        is_all_numeric = all(numeric_ratio)
        if is_all_numeric:
            multi_output_mode = "regression"
            y_data = y_df.apply(pd.to_numeric, errors="coerce").fillna(0)
        else:
            multi_output_mode = "classification"
            y_data, y_label_map = _encode_targets_for_classification(y_df)

    x_train, x_test, y_train, y_test = train_test_split(
        x_df,
        y_data,
        test_size=request.test_size,
        random_state=request.random_state,
    )

    resolved_task = task_type
    if task_type == "multi_output":
        resolved_task = f"multi_output_{multi_output_mode}"

    if task_type == "multi_output":
        if multi_output_mode == "classification":
            base_model = _resolve_model(request.model_name, "classification")
            model = MultiOutputClassifier(clone(base_model))
        else:
            base_model = _resolve_model(request.model_name, "regression")
            model = MultiOutputRegressor(clone(base_model))
    else:
        model = _resolve_model(request.model_name, task_type)

    started_at = time.perf_counter()
    model.fit(x_train, y_train)
    training_time_seconds = float(time.perf_counter() - started_at)
    y_pred = model.predict(x_test)

    metrics: Dict[str, Any]
    matrix_payload: Dict[str, Any] = {}

    if resolved_task == "classification":
        y_true = np.asarray(y_test)
        y_hat = np.asarray(y_pred)
        metrics = _evaluate_classification(y_true, y_hat)
        labels = sorted(np.unique(np.concatenate([y_true, y_hat])).tolist())
        cm = confusion_matrix(y_true, y_hat, labels=labels)
        matrix_payload = {
            "labels": labels,
            "matrix": cm.tolist(),
        }

        if len(np.unique(y_true)) == 2 and hasattr(model, "predict_proba"):
            try:
                y_proba = model.predict_proba(x_test)[:, 1]
                metrics["roc_auc"] = float(roc_auc_score(y_true, y_proba))
                fpr, tpr, _ = roc_curve(y_true, y_proba)
                metrics["roc_curve"] = {
                    "fpr": fpr.tolist(),
                    "tpr": tpr.tolist(),
                }
            except Exception:
                pass
    elif resolved_task == "regression":
        y_true = np.asarray(y_test, dtype=float)
        y_hat = np.asarray(y_pred, dtype=float)
        metrics = _evaluate_regression(y_true, y_hat)
    elif resolved_task == "multi_output_regression":
        y_true = np.asarray(y_test, dtype=float)
        y_hat = np.asarray(y_pred, dtype=float)
        per_target = {}
        for i, col in enumerate(request.y_columns):
            per_target[col] = _evaluate_regression(y_true[:, i], y_hat[:, i])
        metrics = {
            "r2": float(np.mean([m["r2"] for m in per_target.values()])),
            "mae": float(np.mean([m["mae"] for m in per_target.values()])),
            "mse": float(np.mean([m["mse"] for m in per_target.values()])),
            "rmse": float(np.mean([m["rmse"] for m in per_target.values()])),
            "per_target": per_target,
        }
    else:
        # multi_output_classification
        y_true = np.asarray(y_test)
        y_hat = np.asarray(y_pred)
        per_target = {}
        for i, col in enumerate(request.y_columns):
            per_target[col] = _evaluate_classification(y_true[:, i], y_hat[:, i])
        subset_acc = float(np.mean(np.all(y_true == y_hat, axis=1)))
        metrics = {
            "accuracy": float(np.mean([m["accuracy"] for m in per_target.values()])),
            "precision": float(np.mean([m["precision"] for m in per_target.values()])),
            "recall": float(np.mean([m["recall"] for m in per_target.values()])),
            "f1": float(np.mean([m["f1"] for m in per_target.values()])),
            "subset_accuracy": subset_acc,
            "per_target": per_target,
        }

    # CV-based bias/variance diagnostics (single-task only).
    try:
        if resolved_task in {"classification", "regression"}:
            if resolved_task == "classification":
                cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
                cv_scores = cross_val_score(clone(model), x_train, y_train, cv=cv, scoring="accuracy")
                holdout_score = float(metrics.get("accuracy", 0.0))
            else:
                cv = KFold(n_splits=5, shuffle=True, random_state=42)
                cv_scores = cross_val_score(clone(model), x_train, y_train, cv=cv, scoring="r2")
                holdout_score = float(metrics.get("r2", 0.0))

            cv_mean = float(np.mean(cv_scores))
            cv_std = float(np.std(cv_scores))
            bias_proxy = max(0.0, cv_mean - holdout_score)
            variance_proxy = max(0.0, cv_std)

            metrics["cv_mean"] = cv_mean
            metrics["cv_std"] = cv_std
            metrics["bias_proxy"] = float(bias_proxy)
            metrics["variance_proxy"] = float(variance_proxy)
            metrics["bias_level"] = "High" if bias_proxy > 0.08 else "Moderate" if bias_proxy > 0.03 else "Low"
            metrics["variance_level"] = "High" if variance_proxy > 0.08 else "Moderate" if variance_proxy > 0.03 else "Low"
    except Exception:
        pass

    feature_importance = _safe_feature_importance(model, list(x_df.columns))

    # Backward compatible model summary block for existing UI components
    model_summary: Dict[str, Any] = {
        "type": request.model_name,
        "category": "Selected",
    }
    model_summary.update({
        "accuracy": metrics.get("accuracy"),
        "precision": metrics.get("precision"),
        "recall": metrics.get("recall"),
        "f1": metrics.get("f1"),
        "r2": metrics.get("r2"),
        "mae": metrics.get("mae"),
        "mse": metrics.get("mse"),
        "rmse": metrics.get("rmse"),
    })

    model_id = f"selected_{request.dataset_id}_{uuid.uuid4().hex[:8]}"
    TRAINED_MODELS[model_id] = {
        "model": model,
        "scaler": None,
        "feature_names": list(x_df.columns),
        "task_type": resolved_task,
        "source": "train-selected",
        "model_name": request.model_name,
        "x_columns": request.x_columns,
        "y_columns": request.y_columns,
        "dataset_id": request.dataset_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    return {
        "taskType": resolved_task,
        "task_type": resolved_task,
        "model_id": model_id,
        "model_name": request.model_name,
        "x_columns": request.x_columns,
        "y_columns": request.y_columns,
        "total_rows": int(len(base)),
        "train_rows": int(len(x_train)),
        "test_rows": int(len(x_test)),
        "feature_count": int(x_df.shape[1]),
        "target_count": int(len(request.y_columns)),
        "trainingTime": training_time_seconds,
        "training_time": training_time_seconds,
        "metrics": metrics,
        "confusion_matrix": matrix_payload,
        "target_labels": y_label_map,
        "featureImportance": feature_importance,
        "feature_importance": feature_importance,
        "models": [model_summary],
        "best_model": request.model_name,
    }


@router.get("/ml/models/{model_id}/download")
def download_trained_model(model_id: str, format: str = Query(default="pkl")):
    if model_id not in TRAINED_MODELS:
        raise HTTPException(status_code=404, detail="Model not found")

    stored_model = TRAINED_MODELS[model_id]
    model_bundle = stored_model if isinstance(stored_model, dict) else {"model": stored_model}
    fmt = format.strip().lower()
    model_name = str(model_bundle.get("model_name") or model_id).replace(" ", "_")

    if fmt in {"pkl", "pickle"}:
        payload = pickle.dumps(model_bundle)
        filename = f"{model_name}_{model_id}.pkl"
        media_type = "application/octet-stream"
    elif fmt == "joblib":
        buffer = io.BytesIO()
        joblib.dump(model_bundle, buffer)
        payload = buffer.getvalue()
        filename = f"{model_name}_{model_id}.joblib"
        media_type = "application/octet-stream"
    elif fmt == "json":
        payload_json = {
            "model_id": model_id,
            "model_name": model_bundle.get("model_name"),
            "task_type": model_bundle.get("task_type"),
            "dataset_id": model_bundle.get("dataset_id"),
            "x_columns": model_bundle.get("x_columns", []),
            "y_columns": model_bundle.get("y_columns", []),
            "feature_names": model_bundle.get("feature_names", []),
            "created_at": model_bundle.get("created_at"),
            "source": model_bundle.get("source"),
        }
        payload = json.dumps(payload_json, indent=2).encode("utf-8")
        filename = f"{model_name}_{model_id}.json"
        media_type = "application/json"
    else:
        raise HTTPException(status_code=400, detail="Unsupported format. Use pkl, joblib, or json")

    return StreamingResponse(
        io.BytesIO(payload),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/ml/gpu-status")
def gpu_status() -> Dict[str, Any]:
    return ml_engine.get_gpu_status()


@router.post("/explain/shap")
def get_shap_values(dataset_id: str, model_id: str, num_samples: int = 100) -> Dict[str, Any]:
    if model_id not in TRAINED_MODELS:
        raise HTTPException(status_code=404, detail="Model not found")
    if dataset_id not in DATASETS:
        raise HTTPException(status_code=404, detail="Dataset not found")

    model_bundle = TRAINED_MODELS[model_id]
    df = DATASETS[dataset_id]

    explainer = ModelExplainer(model_bundle)
    return explainer.compute_shap(df.head(num_samples))


@router.post("/explain/feature-importance")
def get_feature_importance(model_id: str) -> Dict[str, Any]:
    if model_id not in TRAINED_MODELS:
        raise HTTPException(status_code=404, detail="Model not found")

    model_bundle = TRAINED_MODELS[model_id]
    explainer = ModelExplainer(model_bundle)
    return explainer.get_feature_importance()


@router.post("/predict")
def predict(request: PredictRequest) -> Dict[str, Any]:
    if request.model_id not in TRAINED_MODELS:
        raise HTTPException(status_code=404, detail="Model not found")

    model_data = TRAINED_MODELS[request.model_id]
    model = model_data["model"]
    scaler = model_data.get("scaler")
    feature_names = model_data.get("feature_names", [])

    df = pd.DataFrame(request.data)

    if request.dataset_id in PREPROCESSORS:
        df = PREPROCESSORS[request.dataset_id].transform(df)

    if feature_names:
        for col in feature_names:
            if col not in df.columns:
                df[col] = 0
        df = df[feature_names]

    for col in df.select_dtypes(include=["object", "category"]).columns:
        df[col] = df[col].astype("category").cat.codes

    x_input = df.fillna(0)
    if scaler is not None:
        x_input = scaler.transform(x_input)

    predictions = model.predict(x_input)
    result: Dict[str, Any] = {"predictions": predictions.tolist()}

    if hasattr(model, "predict_proba"):
        result["probabilities"] = model.predict_proba(x_input).tolist()

    return result


@router.post("/chat")
def chat(request: ChatRequest) -> Dict[str, Any]:
    session_id = request.session_id or "default"
    dataset_hint = f" Dataset: {request.dataset_id}." if request.dataset_id else ""

    response = (
        "I can help with EDA, feature engineering, model selection, and result interpretation."
        f" You asked: '{request.message}'.{dataset_hint}"
    )

    CHAT_HISTORY.setdefault(session_id, []).append({"role": "user", "content": request.message})
    CHAT_HISTORY[session_id].append({"role": "assistant", "content": response})

    return {"response": response, "session_id": session_id}


@router.get("/chat/history/{session_id}")
def chat_history(session_id: str) -> Dict[str, Any]:
    return {"history": CHAT_HISTORY.get(session_id, [])}


@router.post("/sessions")
def create_session(payload: Dict[str, Any]) -> Dict[str, Any]:
    session_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    CHAT_HISTORY[session_id] = []
    return {
        "session_id": session_id,
        "created_at": now,
        "last_activity": now,
        "user_id": payload.get("user_id"),
    }


@router.get("/sessions/{session_id}/history")
def session_history(session_id: str) -> Dict[str, Any]:
    return {"history": CHAT_HISTORY.get(session_id, [])}


@router.post("/query")
def query(req: QueryRequest) -> Dict[str, Any]:
    response = (
        "Query received. Use /api/analysis/auto for automated EDA/ML workflows "
        "or /api/chat for conversational guidance."
    )
    CHAT_HISTORY.setdefault(req.session_id, []).append({"role": "user", "content": req.query})
    CHAT_HISTORY[req.session_id].append({"role": "assistant", "content": response})
    return {
        "job_id": f"job_{len(CHAT_HISTORY[req.session_id])}",
        "status": "completed",
        "explanation": response,
    }


@router.post("/query/enhanced")
def enhanced_query(req: QueryRequest) -> Dict[str, Any]:
    return query(req)


@router.post("/query/langchain")
def langchain_query(req: QueryRequest) -> Dict[str, Any]:
    return query(req)


@router.post("/analysis/auto")
def analysis_auto(req: AutoAnalysisRequest) -> Dict[str, Any]:
    if req.dataset_id not in DATASETS:
        raise HTTPException(status_code=404, detail="Dataset not found")

    df = DATASETS[req.dataset_id]
    result: Dict[str, Any] = {
        "session_id": req.session_id,
        "dataset_id": req.dataset_id,
        "analysis_type": req.analysis_type,
        "status": "completed",
    }

    if req.analysis_type in ["full", "eda"]:
        result["eda"] = eda_engine.full_analysis(df)

    if req.analysis_type in ["full", "ml"]:
        if not req.target_column:
            result["ml"] = {"status": "skipped", "reason": "target_column not provided"}
        elif req.target_column not in df.columns:
            result["ml"] = {"status": "skipped", "reason": "target_column not found"}
        else:
            ml = ml_engine.train_all_models(
                df=df,
                target_column=req.target_column,
                task_type=req.model_type,
                use_gpu=True,
            )
            model_id = f"model_{req.dataset_id}_{req.target_column}"
            TRAINED_MODELS[model_id] = ml["best_model"]
            result["ml"] = {
                "model_id": model_id,
                "task_type": ml.get("task_type"),
                "best_model_name": ml.get("best_model_name"),
                "models": ml.get("models", []),
            }

    return result


@router.post("/kaggle/search")
def kaggle_search(req: KaggleSearchRequest) -> Dict[str, Any]:
    try:
        from kaggle.api.kaggle_api_extended import KaggleApi  # type: ignore[import-not-found]

        with _temporary_kaggle_credentials(req.kaggle_username, req.kaggle_key):
            api = KaggleApi()
            api.authenticate()
            datasets = api.dataset_list(search=req.query, page=req.page)
        return {
            "datasets": [
                {
                    "id": ds.ref,
                    "ref": ds.ref,
                    "title": ds.title,
                    "size": getattr(ds, "size", None),
                    "url": f"https://www.kaggle.com/datasets/{ds.ref}",
                }
                for ds in datasets[:20]
            ]
        }
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Kaggle search unavailable: {exc}") from exc


@router.post("/kaggle/download")
def kaggle_download(req: KaggleDownloadRequest) -> Dict[str, Any]:
    try:
        from kaggle.api.kaggle_api_extended import KaggleApi  # type: ignore[import-not-found]

        with _temporary_kaggle_credentials(req.kaggle_username, req.kaggle_key):
            api = KaggleApi()
            api.authenticate()

            download_path = os.path.join("data", req.dataset_ref.replace("/", "_"))
            os.makedirs(download_path, exist_ok=True)
            api.dataset_download_files(req.dataset_ref, path=download_path, unzip=True)

        csv_files = [f for f in os.listdir(download_path) if f.lower().endswith(".csv")]
        if not csv_files:
            raise HTTPException(status_code=400, detail="Downloaded dataset has no CSV file")

        df = pd.read_csv(os.path.join(download_path, csv_files[0]))
        dataset_id = f"ds_{len(DATASETS)}_{req.dataset_ref.replace('/', '_')}"
        DATASETS[dataset_id] = df

        return {
            "id": dataset_id,
            "name": csv_files[0],
            "headers": df.columns.tolist(),
            "rows": df.head(100).to_dict("records"),
            "rowCount": int(len(df)),
            "colCount": int(len(df.columns)),
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Kaggle download unavailable: {exc}") from exc
