# Deploying "compare by Thaker"

## Option A — Install as PWA (local network)

While the dev servers are running on your PC:

1. Open `http://<YOUR-PC-IP>:5173` on your phone (e.g. `http://192.168.1.170:5173`)
2. **Android (Chrome):** Tap the three-dot menu → **"Add to Home screen"** or **"Install app"**
3. **iPhone (Safari):** Tap the Share icon → **"Add to Home Screen"**
4. The app now has its own icon and opens full-screen like a native app

> Note: Your PC must be running the dev servers for this to work.

---

## Option B — Deploy to the Cloud (runs without PC)

This deploys everything on **Render** as a single service (backend serves the built frontend).

### Prerequisites
- A free [Render](https://render.com) account
- Your code pushed to a **GitHub** or **GitLab** repo

### Steps

1. **Push to GitHub**
   ```bash
   cd product_comparision
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/compare-by-thaker.git
   git push -u origin main
   ```

2. **Create a Render Web Service**
   - Go to [Render Dashboard](https://dashboard.render.com) → **New** → **Web Service**
   - Connect your GitHub repo
   - Settings:
     - **Build Command:** `cd frontend && npm install --legacy-peer-deps && npm run build && cd ../backend && npm install`
     - **Start Command:** `cd backend && npm start`
     - **Environment:** `Node`
   - Add these **Environment Variables**:
     | Key | Value |
     |-----|-------|
     | `NODE_ENV` | `production` |
     | `TAVILY_API_KEY` | your key |
     | `SERPAPI_KEY` | your key |
     | `GROQ_API_KEY` | your key |
     | `OPENROUTER_API_KEY` | your key |
     | `GEMINI_API_KEY` | your key (optional) |

3. **Deploy** — Click "Create Web Service". Render will build and deploy automatically.

4. **Access your app** at `https://compare-by-thaker.onrender.com` (or whatever URL Render assigns).

5. **Install on phone** — Open the Render URL on your phone and follow the PWA install steps from Option A above.

### Auto-deploy
Every time you push to GitHub, Render will automatically rebuild and redeploy.

---

## Architecture

```
Phone Browser / PWA
        │
        ▼
   Render (single service)
   ┌─────────────────────┐
   │  Express.js backend  │
   │  ├─ /api/*  routes   │
   │  └─ static frontend  │
   │     (dist/ folder)   │
   └─────────────────────┘
        │
        ▼
   External APIs
   (Tavily, SerpAPI, Groq, OpenRouter)
```
