# ⚡ QUICK START - 5 Minute Deployment

**Total Time: ~30 minutes** (mostly waiting for builds)

---

## **1️⃣ SETUP (2 min)**

```powershell
# Install tools
npm install -g wrangler
npm install -g @railway/cli

# Login
wrangler login
railway login
```

---

## **2️⃣ FRONTEND → CLOUDFLARE PAGES (5 min)**

```powershell
# Build
npm --prefix frontend run build

# Deploy
wrangler pages deploy frontend/dist --project-name ds-research-assistant

# Your Pages URL: https://ds-research-assistant.pages.dev ✅
```

---

## **3️⃣ BACKEND → RAILWAY (15 min)**

```powershell
# Initialize
railway init
# Answer: yes to create new project

# Add database
railway add --database postgresql

# Set environment variables
railway variables set GEMINI_API_KEY=your_key
railway variables set SECRET_KEY=strong_random_key
railway variables set ENFORCE_API_KEY=true
railway variables set ENFORCE_TENANT_ISOLATION=true
railway variables set ALLOW_CODE_EXECUTION=false
railway variables set ALLOWED_ORIGINS=https://ds-research-assistant.pages.dev

# Deploy (this takes 2-5 minutes)
railway up

# Get backend URL
railway domains
# Example: https://ds-research-assistant-backend.railway.app ✅
```

---

## **4️⃣ CONNECT FRONTEND ↔ BACKEND (3 min)**

**In Cloudflare Dashboard:**

1. Pages → **ds-research-assistant** → Settings → Environment variables
2. Add for Production:
   ```
   VITE_API_URL = https://YOUR_RAILWAY_BACKEND_URL
   VITE_API_KEY = same_as_SECRET_KEY
   VITE_TENANT_ID = prod-tenant-1
   ```
3. Save & Redeploy

---

## **5️⃣ TEST (5 min)**

```powershell
# Test backend
curl https://YOUR_RAILWAY_URL/health `
  -Headers @{"X-API-Key" = "your_api_key"}

# Open frontend in browser
# https://ds-research-assistant.pages.dev

# Check browser DevTools > Network > check for 200 responses
```

---

## **✅ DONE!**

| Component | URL |
|-----------|-----|
| **Frontend** | https://ds-research-assistant.pages.dev |
| **Backend** | https://your-railway-backend.railway.app |

---

## **COMMON COMMANDS**

```powershell
# Redeploy frontend
wrangler pages deploy frontend/dist --project-name ds-research-assistant

# View backend logs
railway logs

# View frontend logs
wrangler tail --project-name ds-research-assistant

# Update backend variables
railway variables set VARIABLE_NAME=value

# Restart backend
railway restart
```

---

## **🚨 TROUBLESHOOTING**

**CORS Error?** → Update `ALLOWED_ORIGINS` in Railway, restart

**401 Error?** → Check `SECRET_KEY` matches `VITE_API_KEY`, redeploy

**Backend Down?** → `railway logs` to see errors

**Build Failed?** → `npm --prefix frontend run build` locally first

---

👉 **For detailed steps**, see [DEPLOYMENT_STEPS.md](DEPLOYMENT_STEPS.md)
