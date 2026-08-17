# 🎨 ArcOps Web — Unified Frontend Dashboard

**ArcOps Web** is the state-of-the-art frontend application powering the **ArcOps** cloud platform. Built with React 19, TypeScript, Vite, TailwindCSS, and Lucide Icons, it provides a Vercel-grade developer experience for managing edge deployments, object storage, databases, and authentication.

---

## ✨ Features & Consoles

### 1. ⚡ Frontedge Console (`/frontedge`)
- Vercel-style deployment workflow for GitHub repositories.
- Custom **Root Directory** selector (`./apps/web`).
- Bulk `.env` paste parser for secrets and environment variables.
- 8-stage pipeline milestone parser and Geist dark canvas terminal log viewer.
- Smooth wheel scrolling with `data-lenis-prevent="true"`.

### 2. 🗄️ DBMux Console (`/dbmux`)
- Interactive SQL Query Runner & Schema Visualizer for PostgreSQL, MySQL, SQLite, and MongoDB.
- Real-time ConnectRPC streaming for query execution.

### 3. 📦 BuckStream Console (`/buckstream`)
- Drag-and-drop S3 Object Storage bucket explorer.
- File upload, preview, link generation, and bucket management.

### 4. 🔐 ArcAuth Console (`/arcauth`)
- User management, API token generation, OAuth 2.0 connection badges.

---

## 🚀 Tech Stack

- **Framework**: React 19 + TypeScript + Vite 8
- **Styling**: Vanilla CSS + TailwindCSS + Lenis Smooth Scroll
- **Icons**: Lucide React
- **Charts**: Recharts
- **Build Output**: Optimized production bundle (`dist/`) compiled in < 700ms

---

## 🛠️ Local Development

```bash
# Install dependencies
npm install

# Run Vite dev server
npm run dev

# Build production bundle
npm run build
```
