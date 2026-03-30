"""
AI Data Science Research Assistant - FastAPI Backend entrypoint.
"""

from __future__ import annotations

import os
from typing import Any, Dict, List

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.runtime_compat import router as runtime_router
from app.api.enhanced_query import router as enhanced_router
from app.api.sessions import router as sessions_router
from app.api.query import router as query_router
from app.api.langchain_query import router as langchain_router
from app.api.datasets import router as datasets_router
from app.runtime_state import ml_engine
from mcp.api_routes import router as mcp_router


app = FastAPI(title="AI Data Science Assistant API", version="2.2.0")


def _allowed_origins() -> List[str]:
    env = os.getenv("ALLOWED_ORIGINS", "")
    if env.strip():
        return [origin.strip() for origin in env.split(",") if origin.strip()]
    # Default: allow localhost dev + common deployment origins
    return [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
    ]


app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-API-Key", "X-Tenant-Id"],
    max_age=600,
)

# Specialized routers must be registered BEFORE runtime_router to avoid
# duplicate route shadowing (FastAPI matches first registered route).
app.include_router(sessions_router, prefix="/api")
app.include_router(query_router, prefix="/api")
app.include_router(langchain_router, prefix="/api")
app.include_router(enhanced_router, prefix="/api")
app.include_router(datasets_router, prefix="/api")
app.include_router(mcp_router, prefix="/api")
# runtime_router last — its duplicate stubs for /sessions, /query/enhanced,
# /query/langchain, /analysis/auto, /datasets/search are now unreachable
# (intentional — the real implementations above take precedence).
app.include_router(runtime_router, prefix="/api")


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
