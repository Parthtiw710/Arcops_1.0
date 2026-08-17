# ⚡ BuckStream Skill & Developer Guide

BuckStream is a lightweight, high-performance **Storage Broker and Static Site Hosting Gateway** packaged as a single binary. It hosts static websites and proxies file uploads/downloads using a completely private storage bucket (S3, GCS, Cloudflare R2, or local persistent volume) with RAM-speed serving and zero-downtime deployments.

---

## 🐋 1. Docker Compose Configurations

### Option A: Local Development with Persistent Volume (`LOCAL_S3=true`)
Zero external dependencies. Ideal for offline local development and self-hosted single-node deployments using a mounted volume.

```yaml
services:
  buckstream:
    image: ghcr.io/parthtiw710/arcops-buckstream:latest
    container_name: buckstream
    restart: unless-stopped
    ports:
      - "8083:8083"
    environment:
      # --- Enable Built-in Local Storage (No external S3 required) ---
      - LOCAL_S3=true
      - LOCAL_S3_DIR=/data

      # --- App Configuration ---
      - BUCKET_NAME=buckstream
      - ROOT_DOMAIN=localhost:8080
      - ALLOWED_DOMAINS=*
      
      # --- Security Tokens ---
      - DEPLOY_TOKEN=dev_deploy_token_secret
      - UPLOAD_TOKEN=dev_upload_token_secret
      
      # --- Cache Settings ---
      - MAX_CACHED_SITES=10
    volumes:
      # Persistent Volume for local storage
      - buckstream_data:/data

volumes:
  buckstream_data:
    driver: local
```

---

### Option B: Real Cloud S3 / GCS Production Setup
Connects directly to real cloud storage providers (Cloudflare R2, AWS S3, Google Cloud Storage, Wasabi, Backblaze B2, or self-hosted MinIO).

> **IAM Keyless Authentication**: For AWS ECS/EC2 set `S3_BY_IAM=true`. For GCP Cloud Run/GKE set `GCS_BY_IAM=true` (uses Application Default Credentials without storing API keys).

```yaml
services:
  buckstream:
    image: ghcr.io/parthtiw710/arcops-buckstream:latest
    container_name: buckstream
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      # --- Storage Provider Selection ---
      - LOCAL_S3=false

      # --- Cloud IAM Keyless Authentication (AWS / GCP) ---
      # Set S3_BY_IAM=true if running on AWS (ECS, EC2, EKS) using IAM Task/Instance Roles
      - S3_BY_IAM=false
      # Set GCS_BY_IAM=true if running on GCP (Cloud Run, GKE) using Application Default Credentials
      - GCS_BY_IAM=false

      # --- S3-Compatible Token Authentication (Static API Keys) ---
      # Set S3_COMPATIBLE_BY_TOKEN=true for Cloudflare R2, Wasabi, B2, MinIO, or static S3 keys
      - S3_COMPATIBLE_BY_TOKEN=true
      - S3_COMPATIBLE_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
      - S3_COMPATIBLE_REGION=us-east-1
      - S3_COMPATIBLE_ACCESS_KEY=your_s3_access_key
      - S3_COMPATIBLE_ACCESS_SECRET=your_s3_access_secret
      
      # --- Target Bucket & Domain Configuration ---
      - BUCKET_NAME=my-private-bucket
      - ROOT_DOMAIN=yourdomain.com
      - ALLOWED_DOMAINS=*
      
      # --- Security Tokens ---
      - DEPLOY_TOKEN=prod_deploy_token_secret
      - UPLOAD_TOKEN=prod_upload_token_secret
      - MAX_CACHED_SITES=50
```

---

### 💡 Upload Strategy & Pre-Signed URL Routing Comparison

| Feature / File Size | Local Storage (`LOCAL_S3=true`) | Real Cloud S3 (`S3_COMPATIBLE_BY_TOKEN=true`) |
| :--- | :--- | :--- |
| **Small Files (≤ 5MB)** | Streamed through broker directly to disk | Streamed through broker directly to private S3 bucket |
| **Large Files (> 5MB)** | Streamed through broker via internal `/api/upload/proxy` | **Bypasses Broker Bandwidth!** Automatically generates a secure 15-minute **S3 Pre-Signed Upload URL** directly to the cloud bucket |
| **Static Site Deployments** | Unzipped into broker RAM cache on-demand | Downloaded from S3 & unzipped into broker RAM cache on-demand (< 1ms serving) |
| **Storage Credentials** | Never needed | Kept 100% private in broker container env (never exposed to clients) |

---

## 📦 2. Library & SDK Installation

### A. Go Backend Dependencies (Building from source)
```bash
# Download Go module dependencies
go mod download

# Hot reloading in development
go install github.com/air-verse/air@latest
air
```

### B. TypeScript / JavaScript Client SDK (`npm`)
Published on npm as [`buckstream-client`](https://www.npmjs.com/package/buckstream-client).

```bash
# npm
npm install buckstream-client

# bun
bun add buckstream-client
```

### C. Python Client SDK (`PyPI`)
Published on PyPI as [`buckstream-client`](https://pypi.org/project/buckstream-client/).

```bash
pip install buckstream-client
```

### D. Demo React Playground (`demo/`)
```bash
cd demo
npm install
npm run dev
```

---

## 📡 3. API Reference (Deploy, Upload, List, Delete)

All API endpoints expect Bearer Token authentication via the `Authorization: Bearer <TOKEN>` header.

### 🚀 Static Site Deployment APIs

#### 1. Deploy Static Site
Upload a zipped static site. The ZIP filename becomes the subdomain name (e.g. `blog.zip` → `blog.domain.com`).
* **Endpoint**: `POST /api/deploy`
* **Header**: `Authorization: Bearer <DEPLOY_TOKEN>`
* **Body**: `multipart/form-data` with `file=@dist.zip`
* **Response**:
  ```json
  {
    "name": "blog",
    "url": "http://blog.localhost:8080"
  }
  ```

#### 2. List Deployed Sites
* **Endpoint**: `GET /api/deploy/list`
* **Header**: `Authorization: Bearer <DEPLOY_TOKEN>`
* **Response**:
  ```json
  {
    "status": "success",
    "objects": ["sites/blog.zip", "sites/portfolio.zip"]
  }
  ```

#### 3. Delete Deployed Site
Deletes the deployment archive and invalidates the RAM cache instantly.
* **Endpoint**: `DELETE /api/deploy/delete?key=sites/blog.zip`
* **Header**: `Authorization: Bearer <DEPLOY_TOKEN>`
* **Response**:
  ```json
  {
    "status": "success",
    "key": "sites/blog.zip",
    "message": "Object deleted successfully"
  }
  ```

---

### 📤 Media & File Upload APIs

#### 1. Negotiate Upload Intent
Determines whether file stream flows through broker (≤5MB) or directly to S3 via pre-signed URL (>5MB).
* **Endpoint**: `POST /api/upload-intent`
* **Header**: `Authorization: Bearer <UPLOAD_TOKEN>`
* **Body** (`application/json`):
  ```json
  {
    "filename": "avatar.jpg",
    "content_type": "image/jpeg",
    "size": 102400
  }
  ```
* **Response (Local Storage or Small Files)**:
  ```json
  {
    "action": "proxy",
    "upload_url": "/api/upload/proxy?key=uploads/avatar.jpg&content_type=image/jpeg",
    "key": "uploads/avatar.jpg"
  }
  ```
* **Response (Real S3 Large Files > 5MB)**:
  ```json
  {
    "action": "direct",
    "upload_url": "https://my-bucket.s3.us-east-1.amazonaws.com/uploads/large-video.mp4?X-Amz-Signature=...",
    "key": "uploads/large-video.mp4"
  }
  ```

#### 2. Stream Upload Proxy (Small Files or Local Storage)
* **Endpoint**: `POST /api/upload/proxy?key=uploads/avatar.jpg&content_type=image/jpeg`
* **Header**: `Authorization: Bearer <UPLOAD_TOKEN>`
* **Body**: Binary file stream

#### 3. List Uploaded Files
* **Endpoint**: `GET /api/list`
* **Header**: `Authorization: Bearer <UPLOAD_TOKEN>`
* **Response**:
  ```json
  {
    "status": "success",
    "objects": ["uploads/avatar.jpg", "uploads/document.pdf"]
  }
  ```

#### 4. Delete Uploaded File
* **Endpoint**: `DELETE /api/delete?key=uploads/avatar.jpg`
* **Header**: `Authorization: Bearer <UPLOAD_TOKEN>`
* **Response**:
  ```json
  {
    "status": "success",
    "key": "uploads/avatar.jpg",
    "message": "Object deleted successfully"
  }
  ```

#### 5. Download / Public Stream Asset
* **Endpoint**: `GET /api/download/uploads/avatar.jpg`
* **Access**: Public

---

## 🛠️ 4. SDK Usage

### TypeScript / JavaScript
```typescript
import { BuckStreamClient } from "buckstream-client";

const client = new BuckStreamClient("http://localhost:8080", "dev_upload_token_secret");

// Upload file
const uploadRes = await client.Upload(fileBuffer, "uploads/photo.jpg", "image/jpeg");

// List files
const listRes = await client.List();

// Delete file
await client.Delete("uploads/photo.jpg");
```

### Python
```python
from buckstream import BuckStreamClient

client = BuckStreamClient("http://localhost:8080", "dev_upload_token_secret")

# Upload file
with open("photo.jpg", "rb") as f:
    client.upload(f.read(), "uploads/photo.jpg", "image/jpeg")

# List files
files = client.list()

# Delete file
client.delete("uploads/photo.jpg")
```

---

## 🌐 5. Static Site Deployment Workflows

### A. Local Deployment (CLI / cURL)

1. **Build static site:**
   ```bash
   cd my-app
   npm run build
   ```

2. **Package output folder to ZIP:**
   ```bash
   cd dist
   zip -r ../my-app.zip .
   cd ..
   ```

3. **Deploy to local BuckStream broker:**
   ```bash
   curl -X POST http://localhost:8080/api/deploy \
     -H "Authorization: Bearer dev_deploy_token_secret" \
     -F "file=@my-app.zip"
   ```

4. **Access in browser:**
   Open `http://my-app.localhost:8080` (modern browsers automatically route `*.localhost` to `127.0.0.1`, no wildcard DNS setup needed).

---

### B. GitHub Actions Automated CI/CD Pipeline

Add `.github/workflows/deploy.yml` to your static site repository:

```yaml
name: Deploy to BuckStream

on:
  push:
    branches: [main]

jobs:
  deploy:
    name: Build & Deploy Static Site
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: npm

      - name: Install Dependencies
        run: npm ci

      - name: Build Static Site
        run: npm run build

      - name: Zip Dist Output
        run: |
          cd dist
          zip -r ../${{ secrets.BUCKSTREAM_SITE_NAME }}.zip .
          cd ..

      - name: Deploy to BuckStream Gateway
        run: |
          curl -f -X POST "${{ secrets.BUCKSTREAM_BROKER_URL }}/api/deploy" \
            -H "Authorization: Bearer ${{ secrets.BUCKSTREAM_DEPLOY_TOKEN }}" \
            -F "file=@${{ secrets.BUCKSTREAM_SITE_NAME }}.zip"
```

#### GitHub Repository Secrets Required:
* `BUCKSTREAM_BROKER_URL`: URL of your deployed broker (e.g. `https://broker.yourdomain.com`).
* `BUCKSTREAM_DEPLOY_TOKEN`: Secret matching `DEPLOY_TOKEN` in BuckStream `.env`.
* `BUCKSTREAM_SITE_NAME`: Desired subdomain name (e.g. `blog` or `dashboard`).
