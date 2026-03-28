# 📋 DEPLOYMENT DOCUMENTATION

This folder contains everything you need to deploy the Data Science Research Assistant.

## 📚 Documentation Files

### **Start Here:**
- **[QUICK_DEPLOY.md](QUICK_DEPLOY.md)** ⚡ 
  - 5-minute quick reference
  - Essential commands only
  - Best for experienced developers

### **Complete Guide:**
- **[DEPLOYMENT_STEPS.md](DEPLOYMENT_STEPS.md)** 📖
  - Step-by-step detailed walkthrough
  - All 6 phases with explanations
  - Troubleshooting section
  - Complete checklist

### **Original Documentation:**
- **[CLOUDFLARE_DEPLOYMENT.md](CLOUDFLARE_DEPLOYMENT.md)**
  - Comprehensive reference
  - All deployment options
  - Alternative hosting platforms
  - Advanced configurations

---

## 🎯 Deployment Overview

### Architecture
```
┌─────────────────────────────────────────┐
│         Your GitHub Repository          │
└─────────────┬──────────────────────────┘
              │
       ┌──────┴──────┐
       ▼              ▼
  ┌─────────┐    ┌──────────┐
  │Frontend │    │ Backend  │
  │(React)  │    │(FastAPI) │
  └────┬────┘    └────┬─────┘
       │              │
       ▼              ▼
  ┌──────────────┐  ┌─────────────┐
  │Cloudflare    │  │ Railway.app │
  │Pages (CDN)   │  │ (Hosting)   │
  └──────────────┘  └─────────────┘
```

### Services
| Service | Provider | Type | Cost |
|---------|----------|------|------|
| Frontend | Cloudflare Pages | Static Site Hosting | Free tier available |
| Backend | Railway.app | Python/FastAPI Hosting | Free tier available |
| Database | Railway PostgreSQL | Database | Free tier available |
| SSL/HTTPS | Cloudflare | Automatic | Free |
| CDN | Cloudflare | Content Delivery | Free |

---

## ⚡ Quick Start (Experienced Users)

```powershell
# 1. Install
npm install -g wrangler @railway/cli

# 2. Authenticate
wrangler login
railway login

# 3. Build frontend
npm --prefix frontend run build

# 4. Deploy frontend
wrangler pages deploy frontend/dist --project-name ds-research-assistant

# 5. Deploy backend
railway init
railway add --database postgresql
railway variables set GEMINI_API_KEY=your_key SECRET_KEY=your_secret ENFORCE_API_KEY=true
railway up

# 6. Connect (update Cloudflare Pages env vars with Railway URL)
```

---

## 📖 Step-by-Step (New Users)

Follow [DEPLOYMENT_STEPS.md](DEPLOYMENT_STEPS.md) for complete walkthrough with:
- ✅ Pre-requisites and account setup
- ✅ Detailed commands with explanations
- ✅ Screenshots and examples
- ✅ Troubleshooting guide
- ✅ Verification steps

---

## 🔧 Configuration Files

These files support the deployment:

| File | Purpose |
|------|---------|
| `wrangler.toml` | Cloudflare Workers configuration |
| `cloudflare-pages.config.js` | Pages build settings |
| `backend/worker.js` | Backend API proxy (optional) |
| `frontend/public/_redirects` | Frontend routing rules |
| `railway.toml` | Railway deployment config |
| `scripts/deploy-cloudflare.ps1` | Automated deployment script (Windows) |
| `scripts/deploy-cloudflare.sh` | Automated deployment script (macOS/Linux) |

---

## 🚀 Deployment Paths

### Path 1: Cloudflare Pages + Railway (⭐ Recommended)
```
Frontend: Cloudflare Pages (automatic from Git)
Backend: Railway.app (Python-native)
Database: PostgreSQL (Railway)
```
✅ Best compatibility | ✅ Easy to manage | ✅ Free tier | ✅ Auto-scaling

### Path 2: GitHub + Custom Server
```
Frontend: Cloudflare Pages
Backend: Your own server (VPS)
Database: Your choice
```
✅ Maximum control | ❌ More management

### Path 3: All on Cloudflare
```
Frontend: Cloudflare Pages
Backend: Cloudflare Workers (requires conversion)
Database: Cloudflare D1
```
❌ Limited Python support | ⚠️ Complex setup

---

## 📋 Pre-Deployment Checklist

Before deploying, ensure:

- [ ] GitHub account created and code pushed
- [ ] Cloudflare account created (free tier OK)
- [ ] Railway account created (free tier OK)
- [ ] Node.js 18+ installed
- [ ] Wrangler CLI installed (`wrangler --version`)
- [ ] Railway CLI installed (`railway --version`)
- [ ] GEMINI_API_KEY obtained
- [ ] Backend runs locally: `uvicorn backend.app.main:app`
- [ ] Frontend builds: `npm --prefix frontend run build`

---

## ✅ Post-Deployment Checklist

After deployment:

- [ ] Frontend loads at Pages URL
- [ ] Backend health check passes
- [ ] Frontend can call backend API
- [ ] No CORS errors in browser console
- [ ] Database connected (check Railway logs)
- [ ] Environment variables set correctly
- [ ] Logs monitored (Railway + Cloudflare)
- [ ] Backups configured

---

## 🆘 Getting Help

### Quick Troubleshooting
See **[DEPLOYMENT_STEPS.md](DEPLOYMENT_STEPS.md#common-issues--fixes)** - "Common Issues & Fixes"

### Check Logs
```powershell
# Frontend logs
wrangler tail --project-name ds-research-assistant

# Backend logs  
railway logs
```

### Resources
- 📖 [Cloudflare Pages Docs](https://developers.cloudflare.com/pages/)
- 📖 [Railway Docs](https://docs.railway.app/)
- 📖 [FastAPI Deployment](https://fastapi.tiangolo.com/deployment/)

---

## 🎯 Next Steps

1. **Choose deployment path** → Recommended is Cloudflare + Railway
2. **Read full guide** → [DEPLOYMENT_STEPS.md](DEPLOYMENT_STEPS.md)
3. **Follow each phase** → ~30 min total
4. **Run verification tests** → Ensure everything works
5. **Monitor logs** → Keep an eye on both services

---

**Ready? Start with [QUICK_DEPLOY.md](QUICK_DEPLOY.md) or [DEPLOYMENT_STEPS.md](DEPLOYMENT_STEPS.md)!**

---

## 📞 Support

- **Technical Issues**: Check logs, see troubleshooting guide
- **Deployment Help**: Follow DEPLOYMENT_STEPS.md
- **Account Issues**: Contact Cloudflare/Railway support
- **Code Issues**: Review SETUP_GUIDE.md for local setup
