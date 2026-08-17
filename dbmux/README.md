# 🚀 DBMux — Dynamic Database Multiplexer & ConnectRPC Gateway

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![DCO](https://img.shields.io/badge/DCO-Signed--off-success.svg)](CONTRIBUTING.md)

> A high-performance, ultra-lightweight **Database Multiplexer & Gateway Proxy** built with **Go** and **ConnectRPC (HTTP/2)**.
> Multiplexes queries across PostgreSQL, MySQL, SQLite, MongoDB, Redis, and Vector DBs over a **single TCP socket** with zero client SDK driver overhead, native PostgreSQL RLS, and Cloud IAM Metadata authentication.

![DBMux Dashboard](public/index.png)

---

## 🏛️ System Architecture

```
                                  HTTP/2.0 STREAM MULTIPLEXING
Client Application               (Single TCP Socket - Zero Connection Sprawl)         DBMux Backend (Go Gateway)
┌──────────────────────────┐                                                         ┌──────────────────────────┐
│ Lightweight ConnectRPC / │ ══════════════════════════════════════════════════════> │  DBMux ConnectRPC Server │
│ gRPC-Web Client SDK      │ <══════════════════════════════════════════════════════ │  (Per-Query Goroutines)  │
└──────────────────────────┘                                                         └────────────┬─────────────┘
                                                                                                  │
                                           ┌──────────────────────┬──────────────────────┬────────┴─────────────┬──────────────────────┐
                                           ▼                      ▼                      ▼                      ▼                      ▼
                                    ┌──────────────┐       ┌──────────────┐       ┌──────────────┐       ┌──────────────┐       ┌──────────────┐
                                    │ PostgreSQL   │       │ MySQL        │       │ Redis / KV   │       │ MongoDB      │       │ SQLite       │
                                    │ Driver Pool  │       │ Driver Pool  │       │ Client Pool  │       │ Driver Pool  │       │ WAL Mode     │
                                    └──────────────┘       └──────────────┘       └──────────────┘       └──────────────┘       └──────────────┘
```

---

## ✨ Key Features

- **HTTP/2 Stream Multiplexing**: Route queries across 5+ database engines simultaneously over a single multiplexed TCP connection using ConnectRPC.
- **Zero Client SDK Driver Overhead**: Browsers and microservices use a lightweight ConnectRPC client — no native DB driver dependencies.
- **Engine Isolation**: Dedicated driver pools per DB category. If PostgreSQL hits connection limits or crashes, Redis, MongoDB, and SQLite continue running at 100% speed.
- **Row Level Security (RLS)**:
  - **PostgreSQL**: Automatic transaction session variable injection (`SET LOCAL request.jwt.claim.sub = 'user_id'`).
  - **MongoDB & Redis**: Automatic gateway-level filter injection (`user_id` query merging & key namespacing).
- **Cloud IAM Metadata Resolution**: Integrated IMDS metadata resolver for AWS, GCP, Azure, and Kubernetes (`AUTH_PROVIDER=auto`).
- **Scratch Docker Image**: Compiled into an ultra-minimal **25 MB static scratch image** with zero OS dependencies and zero CVE vulnerabilities.

---

## 🧪 CI Pipeline & Functional & Automation QA Architecture

DBMux includes an automated, self-contained **CI (Continuous Integration)** & **QA (Quality Assurance)** test suite. Everything runs inside a resource-constrained Docker environment (~2.5 GiB total RAM budget) tailored to run safely on machines with ~3-4 GB available spare RAM.

```
zsh test/run_stress_tests.sh
   │
   ├── 🛡️ PILLAR 1: Code Quality & Static Analysis (go vet ./...)
   ├── 🛡️ PILLAR 2: Security & Vulnerability Scan (govulncheck ./...)
   ├── 🧪 PILLAR 3A: Functional QA — Unit Tests with Race Detector (go test -race ./...)
   ├── 🚀 PILLAR 4: Scratch Docker Production Artifact Building (dbmux:test)
   ├── 🐳 ENVIRONMENT BOOT: Floci Cloud IAM + 5 DBs + DBMux Gateway (`up -d --wait`)
   ├── 🔥 PILLAR 3B: Performance QA — Proportional Multi-DB Stress Matrix (k6)
   └── ⚡ PILLAR 3C: Performance QA — gRPC ConnectRPC Benchmark (ghz - 10,000 requests)
```

---

### **QA Testing Spectrum Covered**

| QA Category | Tool | Description |
| :--- | :--- | :--- |
| **Code Quality & Static Analysis** | `go vet` | Catches unkeyed literals, format string bugs, and lock copying. |
| **Security Scanning** | `govulncheck` | Scans Go dependencies for known CVE vulnerabilities. |
| **Functional QA** | `go test -race` | Verifies JWT verification, anon vs service keys, thread safety, and DSN token substitution. |
| **Integration QA** | `Floci IMDS` + `Testcontainers` | Verifies Cloud IAM token resolution and database driver interaction. |
| **Performance QA (Stress)** | `grafana/k6` | Runs a 4-stage matrix with proportional engine stress ratios (Redis 5x: 500 req/s, Postgres/MySQL 3x: 300 req/s, Mongo 2x: 200 req/s, SQLite 1x: 100 req/s). |
| **Performance QA (Load)** | `bojand/ghz` | Benchmarks 10,000 ConnectRPC requests over HTTP/2 at 200 concurrency. |

---

## ⚡ Single-Command Execution Guide

Run the complete 4-Pillar CI Pipeline and Functional & Automation QA suite with a single command:

```zsh
zsh test/run_stress_tests.sh
```

or via `bash`:

```bash
bash test/run_stress_tests.sh
```

---

## 🐳 Docker Compose Test Environment (`test/docker-compose.test.yml`)

```yaml
# 9-Container Isolated Test Stack (~2.5 GiB RAM budget)
floci:           floci/floci:latest (AWS/GCP/Azure IAM Emulator - 128M limit)
dbmux:           dbmux:test (Scratch Image Gateway - 256M limit)
postgres-stress: postgres:alpine (max_connections=5 - 128M limit)
mysql-stress:    mysql:8.4 (max_connections=5 - 512M limit)
redis-stress:    valkey/valkey:latest (maxmemory 16MB - 64M limit)
mongo-stress:    mongo:latest (WiredTiger Engine - 512M limit)
qdrant-stress:   qdrant/qdrant:latest (Vector DB - 128M limit)
k6-stress:       grafana/k6:latest (Proportional Multi-DB Load Matrix - 256M limit)
ghz-stress:      Dockerfile.ghz (Local Go gRPC Benchmark)
```

### **Manual Docker Commands**

```bash
# Start all containers in background
docker compose -f test/docker-compose.test.yml up -d

# Check memory footprint
docker stats --no-stream

# Clean up environment
docker compose -f test/docker-compose.test.yml down -v
```

---

## 📄 License & Contributing

- **License**: [MIT License](LICENSE) — Free to use, modify, and distribute.
- **Contributions**: Contributions require **Developer Certificate of Origin (DCO)** sign-off (`git commit -s`). See [CONTRIBUTING.md](CONTRIBUTING.md) for details.
