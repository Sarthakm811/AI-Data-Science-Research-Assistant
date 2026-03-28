from __future__ import annotations

from fastapi import Header, HTTPException

from app.runtime_state import reset_tenant, set_current_tenant
from app.utils.config import settings


def require_api_key(x_api_key: str | None = Header(default=None, alias="X-API-Key")) -> None:
    """Require a shared API key for all runtime API calls."""
    if not settings.enforce_api_key:
        return

    if not x_api_key or x_api_key != settings.secret_key:
        raise HTTPException(status_code=401, detail="Unauthorized")


def bind_tenant_context(x_tenant_id: str | None = Header(default=None, alias="X-Tenant-Id")):
    """Bind request-scoped tenant context used by in-memory stores."""
    tenant_id = x_tenant_id or "public"
    if settings.enforce_tenant_isolation and not x_tenant_id:
        raise HTTPException(status_code=400, detail="X-Tenant-Id header is required")

    token = set_current_tenant(tenant_id)
    try:
        yield
    finally:
        reset_tenant(token)
