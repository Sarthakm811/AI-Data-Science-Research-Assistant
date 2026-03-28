"""
Shared in-memory runtime state for API routers.
"""

from __future__ import annotations

from typing import Any, Dict, List
import io

import pandas as pd
import numpy as np
from fastapi import HTTPException, UploadFile
from PIL import Image

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
    """Read CSV/XLSX or JPG/PNG upload into a dataframe."""
    filename = (file.filename or "").lower()
    if filename.endswith(".csv"):
        return pd.read_csv(io.BytesIO(content))
    if filename.endswith((".xlsx", ".xls")):
        return pd.read_excel(io.BytesIO(content))
    if filename.endswith((".jpg", ".jpeg", ".png")):
        return _image_to_dataframe(file, content)
    raise HTTPException(status_code=400, detail="Unsupported file format. Use CSV, XLSX, XLS, JPG, JPEG, or PNG.")


def _image_to_dataframe(file: UploadFile, content: bytes) -> pd.DataFrame:
    """Convert a single image file into one row of structured numeric features."""
    try:
        image = Image.open(io.BytesIO(content))
        image.load()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid image file: {exc}") from exc

    rgb_img = image.convert("RGB")
    arr = np.array(rgb_img, dtype=np.float32)

    height, width = arr.shape[0], arr.shape[1]
    channels = arr.shape[2] if arr.ndim == 3 else 1

    r = arr[:, :, 0]
    g = arr[:, :, 1]
    b = arr[:, :, 2]
    gray = np.dot(arr[..., :3], [0.299, 0.587, 0.114])

    hist, _ = np.histogram(gray, bins=256, range=(0, 255), density=True)
    hist = hist + 1e-12
    entropy = float(-(hist * np.log2(hist)).sum())

    row = {
        "source_type": "image",
        "image_name": file.filename or "image",
        "image_mode": image.mode,
        "width": int(width),
        "height": int(height),
        "channels": int(channels),
        "aspect_ratio": float(width / max(height, 1)),
        "pixel_count": int(width * height),
        "mean_r": float(r.mean()),
        "mean_g": float(g.mean()),
        "mean_b": float(b.mean()),
        "std_r": float(r.std()),
        "std_g": float(g.std()),
        "std_b": float(b.std()),
        "brightness_mean": float(gray.mean()),
        "brightness_std": float(gray.std()),
        "min_pixel": float(arr.min()),
        "max_pixel": float(arr.max()),
        "contrast": float(gray.std()),
        "entropy": entropy,
    }

    return pd.DataFrame([row])
