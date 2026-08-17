# ⚡ Frontedge — Open-Source Universal Deployment Engine

**Frontedge** is a provider-agnostic, developer-first deployment engine. It automates repository provisioning, NaCl Box secret injection, and GitHub Actions workflow generation to deploy **any frontend, backend microservice, or custom application** directly to Tier-1 Cloud Infrastructure (Cloudflare Pages, AWS CloudFront/S3/EC2, Fastly, Bunny.net, Fly.io, DigitalOcean).

---

## 🎯 Universal Pipeline: Run ANY Custom Workflow (Frontend, Backend & Microservices)

Frontedge is **100% stack and cloud neutral**. While the default preset deploys frontend apps to Cloudflare Pages, **you can deploy ANY stack** (React, Next.js, Go APIs, Rust binaries, Python microservices, Docker containers) to **ANY cloud provider** by changing just two touchpoints:

1. **`workflow_template.yml`** — Defines your custom build & deployment steps.
2. **`handlers_deploy.go`** — Defines which encrypted secrets are injected into the target GitHub repository.

---

## 🎯 Project Mission: Eliminating Commercial PaaS Markups

Traditional commercial PaaS platforms charge **massive bandwidth markups ($40–$55+ per 100 GB)** for what is essentially a 30-second setup wrapper on top of raw cloud infrastructure.

### The 30-Second Setup Comparison

| Metric | Commercial PaaS (Reseller Wrappers) | ArcOps Frontedge + Tier-1 CDN |
| :--- | :--- | :--- |
| **Setup Time** | 30 Seconds | **30 Seconds** (Identical) |
| **Bandwidth (Egress) Cost** | 🔴 **$40 – $55+ / 100 GB** | 🟢 **$0 / GB** (Cloudflare Pages) |
| **Middleman Markup** | 🔴 Up to 50x Markup | 🟢 **$0 (Zero Markup)** |
| **Supported Workflows** | 🔒 Vendor Lock-In | 🔓 **100% Any Custom Workflow / Any Stack** |

---

## 🚀 How to Customize Secrets & Run Any Custom Workflow

### Step 1: Update the Encrypted Secrets in Go (`handlers_deploy.go`)

To send your own custom secrets (AWS keys, Bunny API tokens, Docker credentials) to the user's GitHub repository, edit `handlers_deploy.go` inside `handleDeploy`:

```go
// Location: pkg/frontedge/handlers_deploy.go

if s.githubPAT != "" {
    // Example A: AWS CloudFront + S3 Secrets
    _ = s.setGitHubRepoSecret(reqBody.RepoOwner, reqBody.RepoName, "AWS_ACCESS_KEY_ID", os.Getenv("AWS_ACCESS_KEY_ID"))
    _ = s.setGitHubRepoSecret(reqBody.RepoOwner, reqBody.RepoName, "AWS_SECRET_ACCESS_KEY", os.Getenv("AWS_SECRET_ACCESS_KEY"))
    
    // Example B: Bunny.net CDN Secret
    // _ = s.setGitHubRepoSecret(reqBody.RepoOwner, reqBody.RepoName, "BUNNY_API_KEY", os.Getenv("BUNNY_API_KEY"))

    // Example C: Docker Hub / Registry Credentials (Backend Services)
    // _ = s.setGitHubRepoSecret(reqBody.RepoOwner, reqBody.RepoName, "DOCKER_USERNAME", os.Getenv("DOCKER_USERNAME"))
    // _ = s.setGitHubRepoSecret(reqBody.RepoOwner, reqBody.RepoName, "DOCKER_PASSWORD", os.Getenv("DOCKER_PASSWORD"))

    // Commit your updated workflow template:
    err := s.commitGitHubWorkflow(reqBody.RepoOwner, reqBody.RepoName, reqBody.Branch, reqBody.ProjectName, reqBody.RootDir, reqBody.BuildCommand, reqBody.BuildDir)
}
```

---

### Step 2: Customize the Workflow Template (`workflow_template.yml`)

Modify `pkg/frontedge/workflow_template.yml` to define your custom build and deployment pipeline.

#### Example A: Cloudflare Pages Deployment (Default Frontend Preset)

```yaml
      - name: Publish to Cloudflare Pages via Wrangler CLI
        run: npx wrangler pages deploy {{OUTPUT_DIR}} --project-name="{{PROJECT_NAME}}" --branch="{{BRANCH}}" --commit-dirty=true
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

#### Example B: AWS S3 + CloudFront Deployment

```yaml
name: Deploy to AWS CloudFront

on:
  push:
    branches:
      - {{BRANCH}}
  workflow_dispatch:

jobs:
  deploy:
    name: Deploy to AWS Infrastructure
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Sync static bundle to S3
        run: aws s3 sync {{OUTPUT_DIR}} s3://my-bucket-name/ --delete
```

#### Example C: Backend Microservice (Go / Rust / Docker)

```yaml
name: Build & Push Backend Container

on:
  push:
    branches:
      - {{BRANCH}}
  workflow_dispatch:

jobs:
  build-backend:
    name: Build & Deploy Microservice
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build Go / Rust Binary
        run: go build -o app ./cmd/server
      - name: Deploy Container / Binary
        run: ./deploy-script.sh
```

---

## 🔒 Security & Secret Encryption

Frontedge uses **NaCl Box Anonymous Sealed Encryption** (`golang.org/x/crypto/nacl/box`) to encrypt secrets using the target GitHub repository's public key before transmitting them over GitHub's REST API:

```
[ Frontedge Backend ]
         │
  1. Fetch Repo Public Key (GET /repos/{owner}/{repo}/actions/secrets/public-key)
  2. Encrypt Secret via NaCl Sealed Box (Curve25519-XSalsa20-Poly1305)
  3. Transmit Encrypted Payload (PUT /repos/{owner}/{repo}/actions/secrets/{name})
         │
         ▼
[ Target GitHub Repository Secrets ] (Stored securely for GitHub Actions runner)
```

---

## 📁 Package Directory Structure

```
pkg/frontedge/
├── routes.go               # Service struct & HTTP route definitions
├── handlers_deploy.go      # Project deploy & secret injection logic
├── handlers_redeploy.go    # GitHub Actions workflow dispatch & log sanitizer
├── handlers_projects.go    # List active edge projects
├── handlers_deployments.go # Build history & Cloudflare deployment handlers
├── handlers_repos.go       # GitHub repo listing
├── handlers_status.go      # Health check & credential verification
├── github.go               # NaCl secret encryption & workflow commit engine
└── workflow_template.yml   # Embedded GitHub Actions YAML template (go:embed)
```
