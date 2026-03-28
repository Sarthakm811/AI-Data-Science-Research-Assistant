"""
Shared in-memory runtime state for API routers.
"""

from __future__ import annotations

from typing import Any, Dict, List
import io

import pandas as pd
from fastapi import HTTPException, UploadFile

from app.eda_engine import EDAEngine
from app.ml_engine import MLEngine
from app.preprocessing import DataPreprocessor

# In-memory runtime stores
DATASETS: Dict[str, pd.DataFrame] = {}
TRAINED_MODELS: Dict[str, Dict[str, Any]] = {}
PREPROCESSORS: Dict[str, DataPreprocessor] = {}
CHAT_HISTORY: Dict[str, List[Dict[str, str]]] = {}

# Engines
ml_engine = MLEngine()
eda_engine = EDAEngine()


def read_uploaded_dataframe(file: UploadFile, content: bytes) -> pd.DataFrame:
    """Read CSV/XLSX upload into a dataframe."""
    filename = (file.filename or "").lower()
    if filename.endswith(".csv"):
        return pd.read_csv(io.BytesIO(content))
    if filename.endswith((".xlsx", ".xls")):
        return pd.read_excel(io.BytesIO(content))
    raise HTTPException(status_code=400, detail="Unsupported file format")
