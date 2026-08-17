# 🚀 ArcOps 1.0 - Complete Ecosystem Skills & Deployment Guide

ArcOps is a single-user, open-source cloud infrastructure engine and control plane designed to unify **Authentication, Multi-Database Proxies, Object Storage, Static Deployments, and API Gateway Routing** into a light-footprint microservices architecture.

---

## 🏗️ ArcOps Architecture & Numerical Port Matrix

ArcOps is composed of 5 decoupled Go microservices and a modern React/Vite dashboard, organized in a strict numerical port order:

| Microservice | Port | Internal / External Role |
| :--- | :--- | :--- |
| **ArcOps Gateway** | **`:8000`** | Central Reverse Proxy, Rate Limiting & Auth Verification |
| **ArcAuth** | **`:8081`** | Single-User Passwordless Auth, OAuth & JWT Engine |
| **DBMux** | **`:8082`** | Multi-Database Proxy (Postgres, MySQL, Mongo, Redis, Vector) |
| **BuckStream** | **`:8083`** | S3-Compatible Object Storage Broker & Static Site Engine |
| **Frontedge** | **`:8084`** | Cloudflare Pages & GitHub Micro-Frontend Deployer |
| **ArcOps Web** | **`:3000`** | Vite + React Dashboard (Served via Nginx on `:80` mapped to `:3000`) |

```mermaid
graph TD
    Client[Web Browser / API Client] -->|Port 3000 / 8000| Gateway[ArcOps Gateway :8000]
    
    Gateway -->|Auth Routes| ArcAuth[ArcAuth Service :8081]
    Gateway -->|Database & Cache| DBMux[DBMux Data Engine :8082]
    Gateway -->|S3 / Storage| BuckStream[BuckStream Storage :8083]
    Gateway -->|Deployments| Frontedge[Frontedge Deployer :8084]
    
    ArcAuth --> DBMux
    DBMux --> Postgres[(PostgreSQL + pgvector :5432)]
    DBMux --> Redis[(Redis / Valkey :6379)]
    BuckStream --> LocalStorage[(Storage Volume / S3)]
```

---

## 🐳 Complete Docker Compose Guide (`docker-compose.yml`)

Save the following file as `docker-compose.yml` in your deployment root to run the entire ArcOps ecosystem using public GitHub Container Registry images:

```yaml
version: '3.8'

# =============================================================================
# ArcOps 1.0 Complete Ecosystem Production & Development Stack
# GitHub Container Registry: ghcr.io/parthtiw710/* (or ghcr.io/arcops/*)
# Microservice Ports: Gateway: 8000 | ArcAuth: 8081 | DBMux: 8082 | BuckStream: 8083 | Frontedge: 8084 | Web: 3000
# =============================================================================

services:

  # ---------------------------------------------------------------------------
  # 1. PostgreSQL Database + pgvector Extension
  # ---------------------------------------------------------------------------
  postgres:
    image: pgvector/pgvector:pg17
    container_name: arcops-postgres
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-arcops}
      POSTGRES_USER: ${POSTGRES_USER:-postgres}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgrespassword}
    command: postgres -c max_connections=50 -c shared_buffers=64MB
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-postgres}"]
      interval: 3s
      timeout: 5s
      retries: 10
      start_period: 5s
    restart: always

  # ---------------------------------------------------------------------------
  # 2. Redis / Valkey Cache & PubSub Engine
  # ---------------------------------------------------------------------------
  redis:
    image: valkey/valkey:latest
    container_name: arcops-redis
    ports:
      - "6379:6379"
    command: valkey-server --maxmemory 32mb --maxmemory-policy allkeys-lru
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "valkey-cli", "ping"]
      interval: 3s
      timeout: 3s
      retries: 5
    restart: always

  # ---------------------------------------------------------------------------
  # 3. ArcAuth Identity & OAuth Engine (Port 8081)
  # ---------------------------------------------------------------------------
  arcauth:
    image: ghcr.io/parthtiw710/arcops-arcauth:latest
    container_name: arcops-arcauth
    ports:
      - "8081:8081"
    environment:
      - PORT=8081
      - DBMUX_URL=http://dbmux:8082
      - ADMIN_EMAILS=${ADMIN_EMAILS}
      - JWT_SECRET=${JWT_SECRET:-super_secret_jwt_key_change_me_in_production}
      - EMAIL_PROVIDER=${EMAIL_PROVIDER:-resend}
      - RESEND_API_KEY=${RESEND_API_KEY}
      - GITHUB_CLIENT_ID=${GITHUB_CLIENT_ID}
      - GITHUB_CLIENT_SECRET=${GITHUB_CLIENT_SECRET}
      - GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
      - GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
    depends_on:
      - dbmux
    restart: always

  # ---------------------------------------------------------------------------
  # 4. DBMux Data Engine Proxy (Port 8082)
  # ---------------------------------------------------------------------------
  dbmux:
    image: ghcr.io/parthtiw710/arcops-dbmux:latest
    container_name: arcops-dbmux
    ports:
      - "8082:8082"
    environment:
      - PORT=8082
      - DBMUX_POSTGRES_DSN=postgres://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD:-postgrespassword}@postgres:5432/${POSTGRES_DB:-arcops}?sslmode=disable
      - REDIS_DSN=redis://redis:6379/0
      - DBMUX_ANON_KEY=${ARCOPS_ANON_KEY:-anon_secret_token_123}
      - DBMUX_ADMIN_KEY=${ARCOPS_ADMIN_KEY:-admin_secret_token_123}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
    restart: always

  # ---------------------------------------------------------------------------
  # 5. BuckStream S3 Object Storage Broker (Port 8083)
  # ---------------------------------------------------------------------------
  buckstream:
    image: ghcr.io/parthtiw710/arcops-buckstream:latest
    container_name: arcops-buckstream
    ports:
      - "8083:8083"
    environment:
      - PORT=8083
      - LOCAL_S3=true
      - LOCAL_S3_DIR=/data/storage
      - BUCKET_NAME=BuckStream
      - UPLOAD_TOKEN=${ARCOPS_ANON_KEY:-anon_secret_token_123}
      - DEPLOY_TOKEN=${ARCOPS_ADMIN_KEY:-admin_secret_token_123}
    volumes:
      - storage_data:/data/storage
    restart: always

  # ---------------------------------------------------------------------------
  # 6. Frontedge Cloudflare & GitHub Deployer (Port 8084)
  # ---------------------------------------------------------------------------
  frontedge:
    image: ghcr.io/parthtiw710/arcops-frontedge:latest
    container_name: arcops-frontedge
    ports:
      - "8084:8084"
    environment:
      - PORT=8084
      - CLOUDFLARE_ACCOUNT_ID=${CLOUDFLARE_ACCOUNT_ID}
      - CLOUDFLARE_API_TOKEN=${CLOUDFLARE_API_TOKEN}
    restart: always

  # ---------------------------------------------------------------------------
  # 7. ArcOps Gateway API Proxy (Port 8000)
  # ---------------------------------------------------------------------------
  gateway:
    image: ghcr.io/parthtiw710/arcops-gateway:latest
    container_name: arcops-gateway
    ports:
      - "8000:8000"
    environment:
      - GATEWAY_PORT=8000
      - ARCAUTH_URL=http://arcauth:8081
      - DBMUX_URL=http://dbmux:8082
      - BUCKSTREAM_URL=http://buckstream:8083
      - FRONTEDGE_URL=http://frontedge:8084
      - RATE_LIMIT_PER_SEC=30
      - RATE_BURST=60
    depends_on:
      - arcauth
      - dbmux
      - buckstream
      - frontedge
    restart: always

  # ---------------------------------------------------------------------------
  # 8. ArcOps Web Dashboard (Port 3000)
  # ---------------------------------------------------------------------------
  web:
    image: ghcr.io/parthtiw710/arcops-web:latest
    container_name: arcops-web
    ports:
      - "3000:80"
    depends_on:
      - gateway
    restart: always

volumes:
  postgres_data:
  redis_data:
  storage_data:
```

---

## 🔑 Environment Configuration (`deploy/.env`)

Create a `.env` file in your deployment directory:

```env
# Gateway & Admin Access
GATEWAY_PORT=8000
ADMIN_EMAILS=yourname@example.com
ARCOPS_ADMIN_KEY=admin_secret_token_123
ARCOPS_ANON_KEY=anon_secret_token_123
JWT_SECRET=super_secret_jwt_key_change_me_in_production

# PostgreSQL Database
POSTGRES_DB=arcops
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgrespassword
POSTGRES_DSN=postgres://postgres:postgrespassword@postgres:5432/arcops?sslmode=disable

# Storage Configuration
LOCAL_S3=true
LOCAL_S3_DIR=/data/storage
BUCKET_NAME=BuckStream

# ArcAuth OAuth & Email Setup
EMAIL_PROVIDER=resend
RESEND_API_KEY=your_resend_api_key
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Frontedge Deployment
FRONTEDGE_URL=http://frontedge:8084
CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token
```
