# 🔐 AuthX — High-Performance Identity & Authentication Microservice

**AuthX** is a ultra-lightweight, high-performance Go authentication microservice built for the **ArcOps** platform (powering **DBMux** connection multiplexing and **BuckStream** S3 streaming).

---

## ✨ Key Features

- ⚡ **Ultra-Fast & Lightweight**: Compiled statically in Go (~8 MB binary, < 20 MB RAM, < 10 ms startup time).
- 🍪 **HttpOnly Session Security**: `HttpOnly`, `Secure`, `SameSite=Lax` cookie session management with Redis TTL caching (`< 0.1 ms`).
- 🔑 **Scoped Bearer API Keys**: Prefix-based Bearer tokens (`arc_live_...`) hashed with SHA-256 for BuckStream CLI uploads & DBMux connection leases.
- 📱 **REST SMS OTP Adapters (5 Providers)**:
  - 🔴 Twilio
  - 🔴 Twilio Verify
  - 🐦 Messagebird
  - 🔲 Vonage (Nexmo)
  - 💬 Textlocal
- 📧 **Email OTP & Password Reset Adapters**:
  - ⚡ Standard **SMTP Protocol** (SendGrid, Mailgun, Postmark, AWS SES, or Custom SMTP server)
  - 📬 **Resend REST API** (`POST https://api.resend.com/emails`)
- 🌐 **OAuth 2.0 Login**: GitHub & Google Social Logins.
- 🗄️ **Multi-DB Storage Support**: PostgreSQL, MySQL, and zero-config embedded SQLite.

---

## 🚀 Quick Start (Self-Hosted Docker Compose)

```bash
docker-compose up -d
```

---

## 🧪 Testing

Run the automated integration test suite:

```bash
go test -v ./pkg/authservice/...
```
