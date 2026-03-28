# 🚀 Complete Deployment Steps - Cloudflare Frontend + Backend

This guide walks you through deploying the Data Science Research Assistant to Cloudflare Pages (frontend) and Railway (backend).

---

## **PHASE 1: PREPARATION (5 minutes)**

### Step 1.1: Install Required Tools

```powershell
# Windows PowerShell - Run as Administrator

# 1. Install/Update Node.js (if not already installed)
# Download from https://nodejs.org/ or use winget:
winget install -e --id OpenJS.NodeJS

# 2. Install Wrangler CLI (Cloudflare's tool)
npm install -g wrangler

# 3. Verify installations
wrangler --version
npm --version
node --version
```

### Step 1.2: Get Your Cloudflare Account Ready

1. Go to https://dash.cloudflare.com
2. Sign up or log in to your Cloudflare account
3. Note your **Account ID** (visible in dashboard settings)
4. Create a GitHub account (if you don't have one)
5. Push your code to GitHub for automatic deployments

---

## **PHASE 2: FRONTEND DEPLOYMENT (10 minutes)**

### Step 2.1: Build Frontend Locally

```powershell
# From project root directory
cd "D:\Google\Data Science Research Assistant Agent"

# Install dependencies
npm --prefix frontend install

# Build for production
npm --prefix frontend run build

# Verify build succeeded
ls frontend/dist
```

### Step 2.2: Authenticate with Cloudflare

```powershell
# Open browser and authenticate
wrangler login

# You'll be redirected to Cloudflare to authorize
# After authorization, return to terminal
```

### Step 2.3: Deploy Frontend to Cloudflare Pages

**Option A: Deploy via CLI (Immediate)**

```powershell
# Deploy built frontend directly
wrangler pages deploy frontend/dist `
  --project-name ds-research-assistant `
  --branch main

# Output will show your Pages URL:
# https://ds-research-assistant.pages.dev
```

**Option B: Connect GitHub (Recommended - Auto-Deploy on Push)**

```powershell
# Step 1: Create Pages project
wrangler pages project create ds-research-assistant

# Step 2: Go to Cloudflare Dashboard > Pages > ds-research-assistant
# Step 3: Click "Connect to Git"
# Step 4: Select your GitHub repository
# Step 5: Configure build settings:
#   - Build command: npm --prefix frontend run build
#   - Build output: frontend/dist
#   - Root directory: (leave empty)

# Step 6: Push to your repo - it auto-deploys!
git add .
git commit -m "Deploy Cloudflare configuration"
git push origin main
```

### Step 2.4: Verify Frontend Deployment

```powershell
# Check deployment status
wrangler pages deployments list --project-name ds-research-assistant

# View your Pages URL in Cloudflare dashboard
# Open browser: https://ds-research-assistant.pages.dev
```

---

## **PHASE 3: BACKEND DEPLOYMENT ON RAILWAY (15 minutes)**

### Step 3.1: Set Up Railway Account

1. Go to https://railway.app
2. Click **Start Project**
3. Sign in with GitHub
4. Authorize Railway to access your GitHub account

### Step 3.2: Deploy Backend to Railway

```powershell
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login to Railway
railway login

# 3. Initialize Railway project (in your project root)
railway init

# When prompted:
#   - Project name: ds-research-assistant
#   - Select current directory

# This creates railway.toml
```

### Step 3.3: Add PostgreSQL Database (Optional but Recommended)

```powershell
# Add PostgreSQL to your project
railway add --database postgresql

# This automatically sets DATABASE_URL environment variable
```

### Step 3.4: Configure Backend Environment Variables

```powershell
# Set environment variables in Railway
railway variables set GEMINI_API_KEY=your_gemini_api_key
railway variables set SECRET_KEY=generate_a_strong_random_key
railway variables set ENFORCE_API_KEY=true
railway variables set ENFORCE_TENANT_ISOLATION=true
railway variables set ALLOW_CODE_EXECUTION=false
railway variables set ALLOWED_ORIGINS=https://ds-research-assistant.pages.dev

# Optional (if using external Redis):
# railway variables set REDIS_URL=your_redis_url

# Optional (if using external Kaggle):
# railway variables set KAGGLE_USERNAME=your_username
# railway variables set KAGGLE_KEY=your_key
```

### Step 3.5: Deploy Backend

```powershell
# Deploy to Railway
railway up

# Railway will:
# - Detect Python project
# - Install requirements.txt
# - Build Docker image
# - Deploy and monitor

# This takes 2-5 minutes
```

### Step 3.6: Get Backend URL

```powershell
# Get your backend service URL
railway domains

# Output example: https://ds-research-assistant-backend.railway.app

# Save this URL - you'll need it for frontend
```

---

## **PHASE 4: CONNECT FRONTEND TO BACKEND (5 minutes)**

### Step 4.1: Update Frontend Environment Variables

In **Cloudflare Dashboard**:

1. Go to **Pages** → **ds-research-assistant** → **Settings** → **Environment variables**

2. Add for **Production** environment:
   ```
   VITE_API_URL = https://your-backend-railway-url.railway.app
   VITE_API_KEY = same_as_backend_SECRET_KEY
   VITE_TENANT_ID = prod-tenant-1
   ```

3. Click **Save**

4. Trigger new deployment:
   ```powershell
   # If using GitHub deployment
   git add .
   git commit -m "Update API configuration"
   git push origin main
   
   # Or manually redeploy
   wrangler pages deploy frontend/dist --project-name ds-research-assistant
   ```

### Step 4.2: Update Backend CORS Configuration

If backend is already deployed, update via Railway:

```powershell
# Update backend environment variables
railway variables set ALLOWED_ORIGINS=https://ds-research-assistant.pages.dev

# Restart backend service
railway restart
```

---

## **PHASE 5: TEST DEPLOYMENT (5 minutes)**

### Step 5.1: Test Backend Health

```powershell
# Check backend is running
$backendUrl = "https://your-backend-railway-url.railway.app"
$apiKey = "your_SECRET_KEY"

curl -X GET "$backendUrl/health" `
  -Headers @{"X-API-Key" = $apiKey}

# Should return: {"status": "ok"}
```

### Step 5.2: Test Frontend

```powershell
# Open frontend in browser
# https://ds-research-assistant.pages.dev

# Check Network tab in browser DevTools:
# - API calls should show 200/201 status
# - No CORS errors
# - Data loading from backend
```

### Step 5.3: Check Logs

**Frontend Logs:**
```powershell
wrangler tail --project-name ds-research-assistant
```

**Backend Logs:**
```powershell
railway logs
# View real-time logs from Railway service
```

---

## **PHASE 6: OPTIONAL - CUSTOM DOMAIN (10 minutes)**

### Step 6.1: Add Custom Domain to Frontend

In **Cloudflare Dashboard**:

1. Pages → **ds-research-assistant** → **Custom domains**
2. Enter your domain (e.g., `app.yourdomain.com`)
3. Verify DNS records
4. SSL certificate auto-generates (HTTPS enabled)

### Step 6.2: Add Custom Domain to Backend

On **Railway Dashboard**:

1. Select your backend service
2. **Settings** → **Domains**
3. Add custom domain (e.g., `api.yourdomain.com`)

### Step 6.3: Update Frontend Configuration

Update environment variable:
```
VITE_API_URL = https://api.yourdomain.com
```

---

## **COMPLETE CHECKLIST**

- [ ] Installed Wrangler CLI and Railway CLI
- [ ] Created Cloudflare account and noted Account ID
- [ ] Built frontend: `npm --prefix frontend run build`
- [ ] Deployed frontend to Pages: `wrangler pages deploy frontend/dist`
- [ ] Frontend running at: `https://ds-research-assistant.pages.dev`
- [ ] Created Railway account and logged in
- [ ] Initialized Railway project: `railway init`
- [ ] Added PostgreSQL database: `railway add --database postgresql`
- [ ] Set backend environment variables
- [ ] Deployed backend: `railway up`
- [ ] Obtained backend URL from Railway
- [ ] Updated frontend env vars (VITE_API_URL, VITE_API_KEY)
- [ ] Updated backend env vars (ALLOWED_ORIGINS)
- [ ] Tested backend health endpoint
- [ ] Tested frontend (no CORS errors)
- [ ] Checked logs for any issues

---

## **QUICK REFERENCE COMMANDS**

### Cloudflare Pages
```powershell
# Deploy frontend
wrangler pages deploy frontend/dist --project-name ds-research-assistant

# View deployments
wrangler pages deployments list --project-name ds-research-assistant

# View logs (real-time)
wrangler tail --project-name ds-research-assistant

# View project info
wrangler pages info --project-name ds-research-assistant
```

### Railway Backend
```powershell
# Deploy
railway up

# View logs
railway logs

# List environments
railway environments

# View variables
railway variables

# Set variable
railway variables set KEY=value

# Restart service
railway restart
```

---

## **COMMON ISSUES & FIXES**

### Issue: CORS Error
**Error**: `Access to XMLHttpRequest blocked by CORS`

**Fix**:
```powershell
# 1. Check backend ALLOWED_ORIGINS
railway variables | grep ALLOWED_ORIGINS

# 2. Update it to include frontend URL
railway variables set ALLOWED_ORIGINS=https://ds-research-assistant.pages.dev

# 3. Restart backend
railway restart

# 4. Clear browser cache (Ctrl+Shift+Del) and retry
```

### Issue: 401 Unauthorized
**Error**: `401 Unauthorized - API key required`

**Fix**:
```powershell
# 1. Verify backend SECRET_KEY
railway variables | grep SECRET_KEY

# 2. Verify frontend VITE_API_KEY matches
# Update in Cloudflare Pages env vars

# 3. Restart both services
railway restart
wrangler pages deploy frontend/dist --project-name ds-research-assistant
```

### Issue: Frontend Can't Reach Backend
**Error**: `Backend service unavailable` or `Network error`

**Fix**:
```powershell
# 1. Test backend directly
curl https://your-backend-url.railway.app/health

# 2. Check railway logs
railway logs

# 3. Verify environment variables
railway variables

# 4. Restart Railway service
railway restart
```

### Issue: Build Fails
**Error**: `npm: command not found` or `Build failed`

**Fix**:
```powershell
# 1. Rebuild locally to test
npm --prefix frontend run build

# 2. If local build works, trigger Pages rebuild via GitHub
git add .
git commit -m "Trigger rebuild"
git push origin main

# 3. Check Pages build logs in Cloudflare dashboard
```

---

## **NEXT STEPS AFTER DEPLOYMENT**

1. **Monitor Performance**
   - Check Cloudflare Analytics for Pages
   - Monitor Railway metrics

2. **Set Up Alerts**
   - Enable error notifications in Railway
   - Configure Cloudflare rate limiting

3. **Scale if Needed**
   - Upgrade Railway plan for more resources
   - Add caching rules in Cloudflare

4. **Backup Database**
   - Railway auto-backups PostgreSQL
   - Download backups regularly

5. **Update DNS Records**
   - Point custom domain to Cloudflare
   - Configure CNAME records

---

## **SUPPORT & RESOURCES**

- **Cloudflare Pages Docs**: https://developers.cloudflare.com/pages/
- **Railway Docs**: https://docs.railway.app/
- **FastAPI Deployment**: https://fastapi.tiangolo.com/deployment/
- **Wrangler CLI**: https://developers.cloudflare.com/workers/wrangler/

---

**🎉 Your application is now live on Cloudflare Pages + Railway!**

Frontend: `https://ds-research-assistant.pages.dev`  
Backend: `https://your-backend.railway.app`

