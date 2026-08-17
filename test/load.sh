#!/usr/bin/env bash
# =============================================================================
# ArcOps 1.0 — Load Test Runner
# Runs the k6 load_scenarios.js script either:
#   a) Inside Docker (default) — spins up the k6 container in the test compose
#   b) Against an external stack — set GATEWAY_URL and USE_LOCAL_K6=1
#
# Called by run.sh after e2e passes, or standalone:
#   bash test/load.sh
#   GATEWAY_URL=http://staging:8000 USE_LOCAL_K6=1 bash test/load.sh
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.test.yml"
REPORTS_DIR="${SCRIPT_DIR}/reports"
GATEWAY="${GATEWAY_URL:-http://gateway:8000}"   # default for in-compose run

GREEN='\033[0;32m'; RED='\033[0;31m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

mkdir -p "$REPORTS_DIR"

echo -e "\n${CYAN}${BOLD}── Load Test ──────────────────────────────────────────${NC}"
echo -e "   Script  : load_scenarios.js"
echo -e "   Gateway : ${GATEWAY_URL:-http://localhost:8000 (via compose network)}"
echo -e "   Report  : ${REPORTS_DIR}/load_results.json"
echo -e "   Summary : ${REPORTS_DIR}/load_summary.txt"
echo ""

# ── Decide how to run k6 ─────────────────────────────────────────────────────
if [[ "${USE_LOCAL_K6:-0}" == "1" ]]; then
  # ── Mode B: local k6 binary (must be installed) ────────────────────────────
  if ! command -v k6 &>/dev/null; then
    echo -e "${RED}k6 not found. Install from https://k6.io/docs/getting-started/installation/ or unset USE_LOCAL_K6.${NC}"
    exit 1
  fi

  echo -e "Running k6 locally against ${GATEWAY_URL:-http://localhost:8000} …"
  k6 run \
    --env GATEWAY_URL="${GATEWAY_URL:-http://localhost:8000}" \
    --out json="${REPORTS_DIR}/load_results.json" \
    "${SCRIPT_DIR}/load_scenarios.js" \
    2>&1 | tee "${REPORTS_DIR}/load_summary.txt"

else
  # ── Mode A: run k6 as a Docker container inside the test compose network ───
  echo -e "Running k6 via Docker inside the test compose network …"

  docker compose \
    -f "$COMPOSE_FILE" \
    --profile load \
    run --rm \
    -e GATEWAY_URL=http://gateway:8000 \
    k6 \
    2>&1 | tee "${REPORTS_DIR}/load_summary.txt"
fi

# ── Parse summary from the output ────────────────────────────────────────────
echo ""
echo -e "${CYAN}${BOLD}── Load Test Summary ──────────────────────────────────${NC}"

# Pull key numbers from the k6 stdout summary we teed above.
if grep -q "✓\|✗\|http_req_failed\|http_req_duration" "${REPORTS_DIR}/load_summary.txt" 2>/dev/null; then
  grep -E "✓|✗|http_req_failed|http_req_duration|iterations|vus_max|auth_errors|dbmux_errors|storage_errors" \
    "${REPORTS_DIR}/load_summary.txt" 2>/dev/null | head -30 || true
fi

# ── Threshold check ───────────────────────────────────────────────────────────
# k6 exits non-zero when any threshold is breached.
# We propagate that exit code so run.sh can detect failures.
LOAD_EXIT=${PIPESTATUS[0]:-0}
if [[ $LOAD_EXIT -ne 0 ]]; then
  echo -e "\n${RED}${BOLD}Load test thresholds breached — review ${REPORTS_DIR}/load_summary.txt${NC}"
  exit $LOAD_EXIT
fi

echo -e "\n${GREEN}${BOLD}Load test passed — all thresholds met.${NC}"
echo -e "   Full JSON results : ${REPORTS_DIR}/load_results.json"
echo -e "   Full text summary : ${REPORTS_DIR}/load_summary.txt"
