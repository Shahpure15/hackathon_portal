# Version 9.1.0 Incident Report & Argon2 Architecture Documentation

**Document Created**: 2026-08-18  
**Target Version**: `9.1.0` → `10.0.0`  
**Repository**: `Shahpure15/hackathon_portal`

---

## 📜 1. Overview of Version 9.1.0 Architecture & Argon2 Hashing

In Version `9.1.0`, the platform utilized **Argon2id** (`m=65536, t=3, p=4`) as its sole password hashing algorithm via `passlib[argon2]`. 

While Argon2id offers strong resistance against GPU side-channel attacks, it enforces a memory cost of **~64 MB of RAM per password hash operation**.

---

## ⚠️ 2. Production Incidents Encountered in v9.1.0

### Incident A: Render Outage under Concurrent Login Bursts (30 Users)
- **Symptom**: Server crashed or returned `504 Gateway Timeout` / `502 Bad Gateway` on Render when 30 users logged in simultaneously.
- **Root Cause**:
  - `30 concurrent logins × 64 MB RAM per hash = ~1,920 MB (1.9 GB) of RAM`.
  - On Render's Free / Starter instances (**512 MB RAM limit**), RAM usage spiked instantly, triggering Render's Out-Of-Memory (OOM) killer (`SIGKILL`).
  - CPU usage spiked to 100%, blocking Starlette's threadpool executor.

### Incident B: CORS Policy Block on Custom Domain (`https://hackathon.mitindia.com`)
- **Symptom**: Browser console error: `Access to XMLHttpRequest at '.../auth/refresh' from origin 'https://hackathon.mitindia.com' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header`.
- **Root Cause**: `CORS_ALLOWED_ORIGINS` in `.env` and `allow_origin_regex` in `main.py` only permitted `*.vercel.app` and `localhost`. Custom domain `hackathon.mitindia.com` was missing. Furthermore, slowapi rate limit 429 error responses lacked CORS headers.

### Incident C: Chrome Browser UI Freeze (High-Frequency WebSocket Reconnect Loop)
- **Symptom**: Platform ran smoothly in Brave Browser but lagged heavily and froze in Google Chrome.
- **Root Cause**: React hooks `usePsWebSocket.js` and `useCheckinWebSocket.js` included `onMessage` in `useCallback` dependency arrays. On every component re-render, a new inline `onMessage` reference was created, closing and re-opening WebSockets dozens of times per second. Chrome's V8 renderer froze trying to inspect/track rapid socket lifecycle events.

---

## 📦 3. Argon2 Archive Location

The original v9.1.0 Argon2 password hashing implementation has been preserved in:
`backend/app/archive/argon2_auth_v9_1.py`

If you ever need to restore pure Argon2id hashing in high-RAM environments (e.g. servers with 4GB+ RAM), refer to `argon2_auth_v9_1.py`.

---

## 🚀 4. Version 10.0.0 Recommendation

> [!IMPORTANT]
> **Deployment Recommendation**:
> If your backend host is RAM-constrained (e.g. Render 512MB RAM free containers), **always use Version 10.0.0 (Bcrypt Hashing Scheme)**.
> - **Argon2 RAM Footprint**: ~64 MB per login
> - **Bcrypt RAM Footprint**: ~4 KB per login (99.99% reduction)
> - **Bcrypt Login Speed**: 3x–5x faster response times (<40ms)
