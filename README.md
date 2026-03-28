# AI Data Science Research Assistant

Production-ready data science assistant with:
- FastAPI backend for dataset processing, EDA, ML, statistics, and reporting
- React + Vite frontend for interactive workflows
- Optional Express fallback server in frontend/server.js

## Architecture

- frontend: React app (Vite)
- backend: FastAPI API and ML/EDA runtime
- infra: Kubernetes deployment manifests
- docs: additional project documentation

## Core Features

- Dataset upload and management
- Auto EDA and rich visual summaries
- Auto ML training and model comparison
- Statistics and mathematics lab (tests, confidence intervals, A/B, Bayesian, ARIMA/SARIMA)
- Feature engineering and data cleaning workflows
- Report generation with integrated insights

## Security Model

Runtime API is protected by:
- X-API-Key header
- X-Tenant-Id header

Backend defaults enforce:
- API key validation
- tenant isolation in in-memory runtime stores
- code execution disabled unless explicitly enabled

## Local Development

### 1. Backend setup

From repository root:

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r backend/requirements.txt
```

Create backend/.env (or edit existing) with at least:

```env
GEMINI_API_KEY=your_gemini_key
SECRET_KEY=your_strong_secret
ENFORCE_API_KEY=true
ENFORCE_TENANT_ISOLATION=true
ALLOW_CODE_EXECUTION=false
```

Run backend:

```bash
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
```

### 2. Frontend setup

```bash
npm --prefix frontend install
npm --prefix frontend run dev
```

Use frontend/.env.development:

```env
VITE_API_URL=http://localhost:8000
VITE_API_KEY=match_backend_secret_key
VITE_TENANT_ID=local-dev-tenant
```

## Testing and Validation

From repository root:

```bash
pytest -q
npm --prefix frontend run build
```

## Deployment

### Backend

- Container deployment supported via infra/k8s
- Ensure SECRET_KEY and DATABASE_URL are provided from secrets
- Keep ALLOW_CODE_EXECUTION=false unless you have strong sandbox isolation

### Frontend (Vercel)

Root vercel.json is configured for monorepo deployment:
- installCommand: npm --prefix frontend install
- buildCommand: npm --prefix frontend run build
- outputDirectory: frontend/dist

Set Vercel environment variables:
- VITE_API_URL
- VITE_API_KEY
- VITE_TENANT_ID

## Environment Variables Reference

Backend important vars:
- GEMINI_API_KEY
- SECRET_KEY
- ENFORCE_API_KEY
- ENFORCE_TENANT_ISOLATION
- ALLOW_CODE_EXECUTION
- DATABASE_URL
- REDIS_URL

Frontend important vars:
- VITE_API_URL
- VITE_API_KEY
- VITE_TENANT_ID

## Notes

- frontend/server.js is optional and intended for local fallback/testing paths.
- Primary production API should be backend/app/main.py FastAPI service.

## License

MIT
