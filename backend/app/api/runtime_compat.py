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
import time
import uuid
from typing import Any, Dict, List, Optional

import joblib
import numpy as np
import pandas as pd
from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, ConfigDict, Field
from sklearn.base import clone
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    precision_score,
    r2_score,
    recall_score,
)
from sklearn.model_selection import train_test_split
from sklearn.multioutput import MultiOutputClassifier, MultiOutputRegressor
from sklearn.neighbors import KNeighborsClassifier, KNeighborsRegressor
from sklearn.preprocessing import LabelEncoder
from sklearn.svm import SVC, SVR
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor
from starlette.responses import StreamingResponse

from app.explainability import ModelExplainer
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

router = APIRouter(tags=["runtime"])


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


class KaggleSearchRequest(BaseModel):
    query: str
    page: int = 1
    kaggle_username: Optional[str] = None
    kaggle_key: Optional[str] = None


class KaggleDownloadRequest(BaseModel):
    dataset_ref: str
    kaggle_username: Optional[str] = None
    kaggle_key: Optional[str] = None


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
    return {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "precision": float(precision_score(y_true, y_pred, average="weighted", zero_division=0)),
        "recall": float(recall_score(y_true, y_pred, average="weighted", zero_division=0)),
        "f1": float(f1_score(y_true, y_pred, average="weighted", zero_division=0)),
    }


def _evaluate_regression(y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, Any]:
    mse = float(mean_squared_error(y_true, y_pred))
    return {
        "r2": float(r2_score(y_true, y_pred)),
        "mae": float(mean_absolute_error(y_true, y_pred)),
        "mse": mse,
        "rmse": float(np.sqrt(mse)),
    }


@router.post("/api/dataset/upload")
@router.post("/api/datasets/upload")
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


@router.get("/api/dataset/{dataset_id}")
@router.get("/api/datasets/{dataset_id}")
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


@router.get("/api/dataset/list")
@router.get("/api/datasets")
def list_datasets() -> List[Dict[str, Any]]:
    return [{"id": k, "rows": int(len(v)), "cols": int(len(v.columns))} for k, v in DATASETS.items()]


@router.delete("/api/datasets/{dataset_id}")
def delete_dataset(dataset_id: str) -> Dict[str, Any]:
    if dataset_id not in DATASETS:
        raise HTTPException(status_code=404, detail="Dataset not found")
    DATASETS.pop(dataset_id, None)
    return {"success": True}


@router.get("/api/datasets/{dataset_id}/preview")
def dataset_preview(dataset_id: str, rows: int = Query(default=10, ge=1, le=500)) -> Dict[str, Any]:
    return get_dataset(dataset_id=dataset_id, rows=rows)


@router.post("/api/preprocess")
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


@router.get("/api/preprocess/options")
def get_preprocessing_options() -> Dict[str, List[str]]:
    return {
        "handle_missing": ["auto", "drop", "mean", "median", "mode", "knn", "iterative"],
        "handle_outliers": ["none", "clip", "remove", "winsorize", "isolation_forest"],
        "encode_categorical": ["auto", "onehot", "label", "target", "frequency"],
        "scale_features": ["none", "standard", "minmax", "robust", "maxabs", "quantile"],
        "feature_selection": ["none", "correlation", "variance", "rfe", "mutual_info"],
    }


@router.post("/api/eda/analyze")
def run_eda(dataset_id: str) -> Dict[str, Any]:
    if dataset_id not in DATASETS:
        raise HTTPException(status_code=404, detail="Dataset not found")

    df = DATASETS[dataset_id]
    return eda_engine.full_analysis(df)


@router.post("/api/eda/statistical-tests")
def statistical_tests(dataset_id: str, column1: str, column2: Optional[str] = None) -> Dict[str, Any]:
    if dataset_id not in DATASETS:
        raise HTTPException(status_code=404, detail="Dataset not found")

    df = DATASETS[dataset_id]
    try:
        return eda_engine.statistical_tests(df, column1, column2)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/api/ml/train")
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

    model_id = f"model_{request.dataset_id}_{request.target_column}"
    TRAINED_MODELS[model_id] = results["best_model"]

    response = {k: v for k, v in results.items() if k != "best_model"}
    response["model_id"] = model_id
    return response


@router.post("/api/ml/train-selected")
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


@router.get("/api/ml/models/{model_id}/download")
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


@router.get("/api/ml/gpu-status")
def gpu_status() -> Dict[str, Any]:
    return ml_engine.get_gpu_status()


@router.post("/api/explain/shap")
def get_shap_values(dataset_id: str, model_id: str, num_samples: int = 100) -> Dict[str, Any]:
    if model_id not in TRAINED_MODELS:
        raise HTTPException(status_code=404, detail="Model not found")
    if dataset_id not in DATASETS:
        raise HTTPException(status_code=404, detail="Dataset not found")

    model_bundle = TRAINED_MODELS[model_id]
    df = DATASETS[dataset_id]

    explainer = ModelExplainer(model_bundle)
    return explainer.compute_shap(df.head(num_samples))


@router.post("/api/explain/feature-importance")
def get_feature_importance(model_id: str) -> Dict[str, Any]:
    if model_id not in TRAINED_MODELS:
        raise HTTPException(status_code=404, detail="Model not found")

    model_bundle = TRAINED_MODELS[model_id]
    explainer = ModelExplainer(model_bundle)
    return explainer.get_feature_importance()


@router.post("/api/predict")
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


@router.post("/api/chat")
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


@router.get("/api/chat/history/{session_id}")
def chat_history(session_id: str) -> Dict[str, Any]:
    return {"history": CHAT_HISTORY.get(session_id, [])}


@router.post("/api/sessions")
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


@router.get("/api/sessions/{session_id}/history")
def session_history(session_id: str) -> Dict[str, Any]:
    return {"history": CHAT_HISTORY.get(session_id, [])}


@router.post("/api/query")
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


@router.post("/api/query/enhanced")
def enhanced_query(req: QueryRequest) -> Dict[str, Any]:
    return query(req)


@router.post("/api/query/langchain")
def langchain_query(req: QueryRequest) -> Dict[str, Any]:
    return query(req)


@router.post("/api/analysis/auto")
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


@router.post("/api/kaggle/search")
def kaggle_search(req: KaggleSearchRequest) -> Dict[str, Any]:
    try:
        from kaggle.api.kaggle_api_extended import KaggleApi  # type: ignore[import-not-found]

        if req.kaggle_username and req.kaggle_key:
            os.environ["KAGGLE_USERNAME"] = req.kaggle_username
            os.environ["KAGGLE_KEY"] = req.kaggle_key

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


@router.post("/api/kaggle/download")
def kaggle_download(req: KaggleDownloadRequest) -> Dict[str, Any]:
    try:
        from kaggle.api.kaggle_api_extended import KaggleApi  # type: ignore[import-not-found]

        if req.kaggle_username and req.kaggle_key:
            os.environ["KAGGLE_USERNAME"] = req.kaggle_username
            os.environ["KAGGLE_KEY"] = req.kaggle_key

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
