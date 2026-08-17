# 🌐 Gateway — ArcOps Reverse Proxy & Unified API Router

**Gateway** is the central high-performance API router and reverse proxy for the **ArcOps** platform. It handles API request routing, authentication verification, rate limiting, and CORS headers across all ArcOps microservices.

---

## 🏛️ Microservice Routing Table

The Gateway proxies incoming HTTP requests to internal microservices based on URL path prefixes:

| Path Prefix | Target Microservice | Port | Description |
| :--- | :--- | :---: | :--- |
| `/api/auth/*` | **ArcAuth** | `8081` | Authentication, OTPs, Session Cookies, OAuth |
| `/api/dbmux/*` | **DBMux** | `8082` | Database query execution, SQL drawer, schemas |
| `/api/buckstream/*` | **BuckStream** | `8084` | S3 object storage streaming & file uploads |
| `/api/frontedge/*` | **Frontedge** | `8083` | Edge deployment engine, Cloudflare Pages, repos |
| `/*` | **Web Frontend** | `3000` | Single-page React dashboard |

---

## ✨ Features

- ⚡ **Zero-Latency Routing**: Lightweight Go reverse proxy with low overhead HTTP streaming (`httputil.ReverseProxy`).
- 🔒 **Token Introspection**: Pre-validates `Authorization: Bearer <token>` headers before forwarding downstream.
- 🛡️ **Rate Limiting**: Token bucket rate limiter preventing brute-force or denial-of-service attempts.
- 🌐 **Unified CORS Headers**: Enforces strict origin policies (`Access-Control-Allow-Origin`, `Credentials`).

---

## 🚀 Environment Variables

```env
GATEWAY_PORT=8000
RATE_LIMIT_PER_SEC=30
RATE_BURST=60
ARCAUTH_URL=http://arcauth:8081
DBMUX_URL=http://dbmux:8082
FRONTEDGE_URL=http://frontedge:8083
BUCKSTREAM_URL=http://buckstream:8084
```
