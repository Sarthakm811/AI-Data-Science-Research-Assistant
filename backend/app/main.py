"""
AI Data Science Research Assistant - FastAPI Backend entrypoint.
"""

from __future__ import annotations

import os
from typing import Any, Dict, List

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.runtime_compat import router as runtime_router
from app.runtime_state import ml_engine

app = FastAPI(title="AI Data Science Assistant API", version="2.2.0")


def _allowed_origins() -> List[str]:
    env = os.getenv("ALLOWED_ORIGINS", "")
    if env.strip():
        return [origin.strip() for origin in env.split(",") if origin.strip()]
    return ["http://localhost:3000", "http://127.0.0.1:3000"]


app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount runtime compatibility/data/ML routes from dedicated module.
app.include_router(runtime_router)


@app.get("/")
def root() -> Dict[str, Any]:
    return {
        "message": "AI Data Science Assistant API is running",
        "name": "AI Data Science Assistant API",
        "version": "2.2.0",
        "gpu_available": ml_engine.gpu_available,
        "gpu_name": ml_engine.gpu_name,
    }


@app.get("/health")
def health() -> Dict[str, Any]:
    return {"status": "healthy", "gpu": ml_engine.gpu_available}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
