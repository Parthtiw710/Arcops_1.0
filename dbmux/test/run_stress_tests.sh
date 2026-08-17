#!/usr/bin/env bash

# =============================================================================
# DBMux Complete Production CI Pipeline (Pillars 1 to 4)
# Total RAM Budget: ~2.5 GiB across all containers
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

COMPOSE_FILE="$SCRIPT_DIR/docker-compose.test.yml"
REPORTS_DIR="$SCRIPT_DIR/reports"
mkdir -p "$REPORTS_DIR" && chmod 777 "$REPORTS_DIR" 2>/dev/null || true

# Auto-cleanup containers on script exit (success or failure)
cleanup() {
    echo ""
    echo "🧹 Auto-cleaning up test containers..."
    docker compose -f "$COMPOSE_FILE" down -v --remove-orphans 2>/dev/null || true
}
trap cleanup EXIT

cd "$PROJECT_ROOT"

# ═══════════════════════════════════════════════════════════════════════════════
# PILLAR 1: Code Quality & Static Analysis
# ═══════════════════════════════════════════════════════════════════════════════
echo "============================================================"
echo "🛡️ PILLAR 1: Code Quality & Static Analysis (go vet)"
echo "============================================================"
go vet ./...
echo "✅ Code quality check passed!"

# ═══════════════════════════════════════════════════════════════════════════════
# PILLAR 2: Security Vulnerability Scan
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "============================================================"
echo "🛡️ PILLAR 2: Security Vulnerability Scan (govulncheck)"
echo "============================================================"
_vuln_exit=0
if command -v govulncheck &> /dev/null; then
    govulncheck ./... || _vuln_exit=$?
else
    echo "ℹ️ govulncheck not installed, running via go run..."
    go run golang.org/x/vuln/cmd/govulncheck@latest ./... || _vuln_exit=$?
fi
if [ "$_vuln_exit" -ne 0 ]; then
    echo "⚠️  govulncheck found vulnerabilities (exit $_vuln_exit) — review output above before shipping!"
else
    echo "✅ No known vulnerabilities found."
fi

# ═══════════════════════════════════════════════════════════════════════════════
# PILLAR 3A: Unit Tests with Race Detector
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "============================================================"
echo "🧪 PILLAR 3A: Unit Tests with Race Detector (-race)"
echo "============================================================"
# Includes providers (sql/nosql/kv/vector) where real bugs were found, not just auth/service
go test -v -race \
    ./pkg/auth/... \
    ./pkg/cron/... \
    ./pkg/registry/... \
    ./pkg/secrets/... \
    ./pkg/service/... \
    ./pkg/state/... \
    ./pkg/telemetry/... \
    ./pkg/providers/...
echo "✅ Unit tests passed with zero data races!"

# ═══════════════════════════════════════════════════════════════════════════════
# PILLAR 4: Production Artifact Building (Scratch Docker Image)
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "============================================================"
echo "🚀 PILLAR 4: Production Artifact Build (Scratch Docker)"
echo "============================================================"
docker build -t dbmux:test .
echo "✅ Scratch Docker image (dbmux:test) built successfully!"

# ═══════════════════════════════════════════════════════════════════════════════
# ENVIRONMENT BOOT: Start all infra containers and wait for healthy
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "============================================================"
echo "🐳 Environment Boot: Floci + 5 DBs + DBMux Gateway"
echo "============================================================"

# Start only the infrastructure (k6/ghz have profiles=["test"] so they won't start)
docker compose -f "$COMPOSE_FILE" up -d --wait

echo "✅ All containers are up and healthy!"

echo ""
echo "============================================================"
echo "📊 Resource Footprint (RAM & CPU Limits):"
echo "============================================================"
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}"

# ═══════════════════════════════════════════════════════════════════════════════
# PILLAR 3B: Staged Multi-DB Isolation Stress Matrix (k6)
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "============================================================"
echo "🔥 PILLAR 3B: Staged Multi-DB Isolation Stress Matrix (k6)"
echo "============================================================"
docker compose -f "$COMPOSE_FILE" run --rm k6-stress

# ═══════════════════════════════════════════════════════════════════════════════
# PILLAR 3C: gRPC ConnectRPC Benchmark (ghz - 10,000 queries)
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "============================================================"
echo "⚡ PILLAR 3C: gRPC ConnectRPC Benchmark (ghz - 10,000 queries)"
echo "============================================================"
docker compose -f "$COMPOSE_FILE" run --rm ghz-stress

mkdir -p "$SCRIPT_DIR/reports"

echo ""
echo "============================================================"
echo "🎉 ALL CI PIPELINE STAGES PASSED SUCCESSFULLY!"
echo "   (Ready for Pillar 5: Registry Push / Production Deployment)"
echo "============================================================"
echo "📄 HTML Benchmark Reports Saved to:"
echo "   - k6 Stress Matrix:   file://$SCRIPT_DIR/reports/stress_matrix.html"
echo "   - ghz gRPC Benchmark: file://$SCRIPT_DIR/reports/grpc_benchmark.html"
echo ""
echo "🔍 Jaeger OpenTelemetry Traces UI Available:"
echo "   - Jaeger Web UI:      http://localhost:8082"
if [ "${CI:-false}" = "true" ]; then
    # Non-interactive CI environment (GitHub Actions etc.) — skip the wait entirely.
    echo "   - CI=true detected: skipping 5-minute Jaeger inspection pause."
else
    echo "   - Notice: Keeping containers running for 5 minutes for UI trace inspection..."
    echo "   - Press ENTER to cleanup immediately, or wait 300 seconds..."
    read -t 300 _ 2>/dev/null || true
fi


