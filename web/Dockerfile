# Multi-stage Dockerfile for ArcOps Web Dashboard using Bun
FROM oven/bun:alpine AS builder

WORKDIR /app

# Copy package manifests & lockfile for layer caching
COPY package.json bun.lock* ./

# Install dependencies using Bun
RUN bun install

# Copy source files
COPY . .

# Build static production bundle into dist/
RUN bun run build

# Stage 2: Serve static production assets with Nginx
FROM nginx:alpine

# Copy built dist artifacts to Nginx html folder
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose HTTP port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
