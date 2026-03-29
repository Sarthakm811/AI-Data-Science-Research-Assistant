# Cloudflare Deployment Guide

Deploy the Data Science Research Assistant to Cloudflare Pages (frontend) and Cloudflare Workers or external backend (backend).

## Prerequisites

1. **Cloudflare Account** - Sign up at https://dash.cloudflare.com
2. **Wrangler CLI** - Install Cloudflare's CLI tool:
   ```bash
   npm install -g wrangler
   ```
3. **Git Repository** - Push your code to GitHub/GitLab for automatic deployments

## Deployment Strategy

### Option 1: Frontend on Pages + Backend on External Server (Recommended)
- **Frontend**: Cloudflare Pages
- **Backend**: Railway, Render, Heroku, or your own server
- **Pros**: Full FastAPI compatibility, easy to manage Python dependencies
- **Cons**: Requires additional hosting for backend

### Option 2: Frontend on Pages + Backend on Workers (Limited Python Support)
- **Frontend**: Cloudflare Pages  
- **Backend**: Cloudflare Workers (requires Node.js wrapper or conversion)
- **Pros**: Single platform, automatic scaling
- **Cons**: Limited Python runtime, requires API conversion

## Step 1: Deploy Frontend to Cloudflare Pages

### Via GitHub (Recommended - Auto-Deploy)

1. **Connect your GitHub repository:**
   ```bash
   wrangler pages project create
   ```

2. **In Cloudflare Dashboard:**
   - Go to **Pages**
   - Click **Connect to Git**
   - Select your repository
   - Authorize Cloudflare

3. **Configure Build Settings:**
   - **Framework presets**: None or Vite
   - **Build command**: `npm --prefix frontend run build`
   - **Build output directory**: `frontend/dist`
   - **Root directory**: (leave empty or `/`)

4. **Add Environment Variables:**
   ```
   VITE_API_URL=https://your-backend-api.com
   VITE_API_KEY=your_api_key
   VITE_TENANT_ID=prod-tenant-1
   ```

5. **Deploy** - Push to main branch, auto-deploys!

### Via Direct Upload

```bash
# Build frontend
npm --prefix frontend run build

# Install wrangler
npm install -g wrangler

# Deploy to Pages
wrangler pages deploy frontend/dist --project-name ds-research-assistant
```

## Step 2: Deploy Backend

### Option A: Railroad/Railway (Recommended for Python)

1. **Install Railway CLI:**
   ```bash
   npm i -g @railway/cli
   ```

2. **Login and create project:**
   ```bash
   railway login
   railway init
   ```

3. **Configure for FastAPI:**
   ```bash
   railway add --database postgresql
   ```

4. **Deploy:**
   ```bash
   railway up
   ```

5. **Get backend URL:**
   ```bash
   railway variables
   ```

### Option B: Render.com (Easy Python Hosting)

1. Go to https://render.com
2. Click **New → Web Service**
3. Connect your GitHub repository
4. **Settings:**
   - Name: `ds-research-assistant-backend`
   - Environment: `Python 3.11`
   - Build command: `pip install -r backend/requirements.txt`
   - Start command: `uvicorn backend.app.main:app --host 0.0.0.0 --port 8000`

5. **Environment Variables:**
   ```
   GEMINI_API_KEY=your_key
   SECRET_KEY=your_secret
   DATABASE_URL=your_postgres_url
   REDIS_URL=your_redis_url
   ENFORCE_API_KEY=true
   ENFORCE_TENANT_ISOLATION=true
   ALLOW_CODE_EXECUTION=false
   ALLOWED_ORIGINS=https://your-pages-domain.pages.dev
   ```

6. Deploy with **Create Web Service**

### Option C: Fly.io (Docker-based)

```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Deploy
flyctl launch

# Configure Procfile or add fly.toml:
[build]
  builder = "docker"
  dockerfile = "backend/Dockerfile"

flyctl deploy
```

### Option D: Cloudflare Workers (Advanced Python)

Requires converting FastAPI to a Node.js compatible format or using a Python-to-JS transpiler.

```bash
# Create worker
wrangler workers create ds-research-backend

# Deploy
wrangler publish
```

## Step 3: Connect Frontend to Backend

### Update Frontend Environment Variables

In Cloudflare Pages dashboard, set:

```
VITE_API_URL=https://your-backend-domain.com
VITE_API_KEY=your_secret_key
VITE_TENANT_ID=prod-tenant-1
```

### Configure CORS on Backend

Update backend environment:
```
ALLOWED_ORIGINS=https://your-pages-domain.pages.dev,https://yourdomain.com
```

## Step 4: Custom Domain (Optional)

### Add Custom Domain to Cloudflare Pages

1. In Pages project settings
2. Click **Custom domains**
3. Enter your custom domain
4. Verify DNS (Cloudflare usually auto-configures)
5. SSL/TLS automatically enabled

### Update Backend to Accept Custom Domain

Add custom domain to `ALLOWED_ORIGINS`:
```
ALLOWED_ORIGINS=https://your-pages-domain.pages.dev,https://yourdomain.com
```

## Step 5: Monitoring and Logs

### Cloudflare Pages Logs
```bash
wrangler pages deployment list --project-name ds-research-assistant
wrangler pages deployment show <id> --project-name ds-research-assistant
```

### View Real-Time Logs
```bash
wrangler tail --project-name ds-research-assistant
```

### Backend Logs (Railway example)
```bash
railway logs
```

## Environmental Variables Reference

### Frontend (.env in Cloudflare Pages)
```
VITE_API_URL=https://api.yourdomain.com
VITE_API_KEY=your_secret_key
VITE_TENANT_ID=prod-tenant-1
```

### Backend (on your hosting provider)
```
GEMINI_API_KEY=your_gemini_api_key
SECRET_KEY=your_strong_secret_key
DATABASE_URL=postgresql://user:pass@host:5432/db
REDIS_URL=redis://host:6379
ENFORCE_API_KEY=true
ENFORCE_TENANT_ISOLATION=true
ALLOW_CODE_EXECUTION=false
ALLOWED_ORIGINS=https://yourdomain.com,https://yourpages.pages.dev
```

## Common Issues & Troubleshooting

### 1. CORS Errors
**Error**: `Access to XMLHttpRequest blocked by CORS`
**Fix**: 
- Add frontend domain to backend `ALLOWED_ORIGINS`
- Ensure backend sets proper CORS headers
- Redeploy backend

### 2. API Key Not Found
**Error**: `401 Unauthorized - API key required`
**Fix**:
- Check `ENFORCE_API_KEY` is `true` on backend
- Verify `VITE_API_KEY` matches backend `SECRET_KEY`
- Set in Cloudflare Pages env vars

### 3. Build Failures
**Error**: `npm: command not found`
**Fix**:
- In Cloudflare Pages settings, ensure Node.js version is set (18+)
- Check build command: `npm --prefix frontend run build`
- Check build output directory: `frontend/dist`

### 4. Backend URL Not Reachable
**Error**: `Cannot reach backend service`
**Fix**:
- Verify backend is running on your hosting platform
- Check `VITE_API_URL` is correct
- Ensure firewall allows Cloudflare IPs
- Test: `curl https://your-backend-url/health`

### 5. Database Connection Issues
**Fix**:
- Verify DATABASE_URL format is correct
- Check database is accessible from backend server
- For PostgreSQL: `postgresql://user:pass@host:5432/db`
- Run migrations: `alembic upgrade head`

## Deployment Checklist

- [ ] Frontend pushed to GitHub/GitLab
- [ ] Cloudflare Pages project created and connected
- [ ] Backend deployed to Railway/Render/Fly/etc
- [ ] Environment variables set on both frontend & backend
- [ ] CORS properly configured
- [ ] Custom domain (optional) configured
- [ ] SSL certificates active
- [ ] Health endpoints verify both services running
- [ ] Frontend can call backend API successfully
- [ ] Monitoring/logs tested

## Quick Deploy Commands

```bash
# Test locally first
npm --prefix frontend run build
npm --prefix frontend run preview

# Deploy frontend to Pages
wrangler pages deploy frontend/dist --project-name ds-research-assistant

# View Pages deployments
wrangler pages deployments list --project-name ds-research-assistant

# Tail live logs
wrangler tail --project-name ds-research-assistant
```

## Scaling & Performance

### Caching Strategy
- Static assets: Cache for 30 days (automatic via Pages)
- HTML: No cache (always fresh)
- API calls: Cache GET requests for 5 minutes on backend

### Database Optimization
- Use connection pooling (PgBouncer)
- Add indexes for common queries
- Monitor slow queries

### Backend Optimization
- Use gunicorn with multiple workers
- Enable Redis caching
- Set `ALLOW_CODE_EXECUTION=false` by default

## Support & Resources

- [Cloudflare Pages Docs](https://developers.cloudflare.com/pages/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
- [FastAPI Deployment](https://fastapi.tiangolo.com/deployment/)
- [Railway.app Docs](https://docs.railway.app/)
- [Render.com Docs](https://render.com/docs)
