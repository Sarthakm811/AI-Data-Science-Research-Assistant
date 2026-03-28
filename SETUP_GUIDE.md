# Setup Guide

Last updated: 2026-03-28

This guide covers local setup for the current FastAPI + React architecture.

## 1. Requirements

- Python 3.10+
- Node.js 18+
- npm 9+

Optional:
- Redis
- PostgreSQL

## 2. Backend Setup

From repository root:

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r backend/requirements.txt
```

Create or update backend/.env:

```env
GEMINI_API_KEY=your_gemini_key
KAGGLE_USERNAME=optional
KAGGLE_KEY=optional
REDIS_URL=redis://localhost:6379
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ds_agent_dev
SECRET_KEY=your_strong_secret
ENFORCE_API_KEY=true
ENFORCE_TENANT_ISOLATION=true
ALLOW_CODE_EXECUTION=false
MAX_EXECUTION_TIME=45
MAX_MEMORY_MB=1536
```

Run backend:

```bash
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
```

Health check:

```bash
curl http://localhost:8000/health
```

## 3. Frontend Setup

Install and run:

```bash
npm --prefix frontend install
npm --prefix frontend run dev
```

Create or update frontend/.env.development:

```env
VITE_API_URL=http://localhost:8000
VITE_API_KEY=match_backend_secret_key
VITE_TENANT_ID=local-dev-tenant
```

## 4. Required Headers

Frontend automatically injects:
- X-API-Key
- X-Tenant-Id

If testing API manually, include both headers.

Example:

```bash
curl -X GET "http://localhost:8000/api/datasets" \
  -H "X-API-Key: your_secret_key" \
  -H "X-Tenant-Id: local-dev-tenant"
```

## 5. Tests and Build

Run backend tests:

```bash
pytest -q
```

Run frontend production build:

```bash
npm --prefix frontend run build
```

## 6. Vercel Frontend Deployment

The repository root has vercel.json configured for monorepo frontend build.

Set Vercel environment variables:
- VITE_API_URL
- VITE_API_KEY
- VITE_TENANT_ID

Deploy from main branch.

## 7. Common Issues

1) 401 Unauthorized
- Check SECRET_KEY backend value
- Check VITE_API_KEY frontend value matches SECRET_KEY

2) 400 X-Tenant-Id header is required
- Ensure VITE_TENANT_ID is set, or frontend localStorage tenant id is available

3) CORS blocked
- Add your frontend origin to ALLOWED_ORIGINS on backend

4) Code execution disabled
- This is expected by default
- Enable only if you have proper sandboxing: ALLOW_CODE_EXECUTION=true

## 8. Production Recommendations

- Keep ENFORCE_API_KEY=true
- Keep ENFORCE_TENANT_ISOLATION=true
- Keep ALLOW_CODE_EXECUTION=false unless strongly sandboxed
- Use secret manager for SECRET_KEY, DATABASE_URL, API keys
- Add WAF/rate-limiting at ingress
