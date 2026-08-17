#!/usr/bin/env bash

# Parallel, non-blocking service launcher for ArcOps local development

SCRIPT_PATH="${BASH_SOURCE[0]:-${(%):-%x}}"
[ -z "$SCRIPT_PATH" ] && SCRIPT_PATH="$0"
PROJECT_ROOT="$(cd "$(dirname "$SCRIPT_PATH")/.." && pwd)"
PID_FILE="$PROJECT_ROOT/.dev.pids"

cleanup() {
  echo ""
  echo "⚡ Stopping all ArcOps background services..."
  if [ -f "$PID_FILE" ]; then
    while read -r pid; do
      if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
        kill -9 "$pid" 2>/dev/null || true
      fi
    done < "$PID_FILE"
    rm -f "$PID_FILE"
  fi
  pkill -f "air" 2>/dev/null || true
  pkill -f "vite" 2>/dev/null || true
  docker compose -f "$PROJECT_ROOT/deploy/docker-compose.yml" down 2>/dev/null || true
  echo "✅ ArcOps ecosystem stopped cleanly."
  exit 0
}
trap cleanup INT TERM

> "$PID_FILE"

# Pre-execution cleanup of any old lingering processes & ports
pkill -f "vite" 2>/dev/null || true
pkill -f "air" 2>/dev/null || true
fuser -k 3000/tcp 8000/tcp 8080/tcp 8081/tcp 8082/tcp 8083/tcp 2>/dev/null || true

# Load environment variables & secrets from deploy/.env
ENV_FILE="$PROJECT_ROOT/deploy/.env"
if [ -f "$ENV_FILE" ]; then
  echo "🔑 Loading environment secrets from deploy/.env..."
  set -a
  source "$ENV_FILE"
  set +a
fi

# Dynamic deploy/.env Live File Watcher (re-exports environment variables on file updates)
(
  LAST_MD5=""
  while true; do
    if [ -f "$ENV_FILE" ]; then
      CURRENT_MD5=$(md5sum "$ENV_FILE" 2>/dev/null | awk '{print $1}')
      if [ -n "$LAST_MD5" ] && [ "$CURRENT_MD5" != "$LAST_MD5" ]; then
        echo ""
        echo "🔄 [dev_run] Detected live updates in deploy/.env — re-exporting secrets..."
        set -a
        source "$ENV_FILE"
        set +a
      fi
      LAST_MD5="$CURRENT_MD5"
    fi
    sleep 2
  done
) &
watcher_pid=$!
echo $watcher_pid >> "$PID_FILE"


# Export local service target URLs for Gateway proxying
export ARCAUTH_URL="http://localhost:8081"
export DBMUX_URL="http://localhost:8082"
export BUCKSTREAM_URL="http://localhost:8083"
export FRONTEDGE_URL="http://localhost:8084"
export WEB_URL="http://localhost:3000"

echo ""
echo "🚀 Launching ArcOps Development Ecosystem in PARALLEL..."
echo "=================================================================="

# ── 1. Docker: Postgres + Redis ───────────────────────────────────────────────
echo "📦 Starting Postgres (pgvector) + Redis..."
docker compose -f "$PROJECT_ROOT/deploy/docker-compose.yml" up -d postgres redis

# ── Helper: Start Go Microservice Asynchronously with nohup ───────────────────
start_go_parallel() {
  local name="$1"
  local dir="$2"
  local entry="$3"
  local svc_dir="$PROJECT_ROOT/$dir"

  if [ ! -d "$svc_dir" ]; then
    echo "  ❌ [$name] Directory not found: $svc_dir"
    return
  fi

  echo "⚡ [$name] Launching background runner..."
  (
    cd "$svc_dir"
    if command -v air > /dev/null 2>&1; then
      if [ -f .air.toml ]; then
        exec nohup air > "$PROJECT_ROOT/logs_${name}.log" 2>&1
      else
        exec nohup air --build.cmd "go build -o tmp/main $entry" --build.bin "./tmp/main" > "$PROJECT_ROOT/logs_${name}.log" 2>&1
      fi
    else
      exec nohup go run "$entry" > "$PROJECT_ROOT/logs_${name}.log" 2>&1
    fi
  ) &

  local pid=$!
  echo $pid >> "$PID_FILE"
  echo "  ✅ [$name] Started in background (PID $pid → logs_${name}.log)"
}

# ── 2. Start Go Microservices in Parallel ─────────────────────────────────────
start_go_parallel "dbmux"      "dbmux"      "./cmd/server"
start_go_parallel "buckstream" "buckstream" "./cmd/main.go"
start_go_parallel "arcauth"    "arcauth"    "./cmd/server"
start_go_parallel "frontedge"  "frontedge"  "./cmd/server"
start_go_parallel "gateway"    "gateway"    "./cmd/server/main.go"

# ── 3. Start Web Dashboard in Parallel with nohup ──────────────────────────────
echo "🎨 [web] Launching Web Dashboard on http://localhost:3000..."
(
  cd "$PROJECT_ROOT/web"
  exec nohup bun run dev > "$PROJECT_ROOT/logs_web.log" 2>&1
) &

web_pid=$!
echo $web_pid >> "$PID_FILE"
echo "  ✅ [web] Started in background (PID $web_pid → logs_web.log)"

echo ""
echo "=================================================================="
echo "  🎉 All ArcOps Services Running in Parallel!"
echo "=================================================================="
echo "  Web Dashboard:  http://localhost:3000"
echo "  Gateway API:    http://localhost:8000"
echo "  PostgreSQL:     localhost:5432"
echo "  Redis:          localhost:6379"
echo ""
echo "  📝 Streaming live Web logs below (Press Ctrl+C to stop everything)..."
echo "=================================================================="
echo ""

# Tail logs_web.log so user immediately sees live Vite dev output!
tail -f "$PROJECT_ROOT/logs_web.log" &
tail_pid=$!
echo $tail_pid >> "$PID_FILE"

while true; do sleep 2; done
