#!/usr/bin/env bash
# =============================================================================
# ArcOps 1.0 — Master Test Orchestrator
#
# Runs all test stages in order. Each stage must pass before the next starts.
#
#   Stage 1 — Unit tests        : go test -race for every service
#   Stage 2 — Build & boot      : docker compose builds images, spins up stack
#   Stage 3 — E2E tests         : e2e.sh fires curl assertions against gateway
#   Stage 4 — Load test         : k6 low-load smoke (optional, --skip-load to omit)
#   Stage 5 — Teardown          : docker compose down, cleanup
#
# Usage:
#   bash test/run.sh               # full suite (unit + e2e + load)
#   bash test/run.sh --skip-load   # unit + e2e only (faster, no k6 needed)
#   bash test/run.sh --skip-unit   # skip go test (useful if already ran them)
#   bash test/run.sh --no-cleanup  # leave containers running for inspection
#
# Requirements:
#   - Go >= 1.22
#   - Docker + Docker Compose v2  (docker compose, not docker-compose)
#   - k6 OR Docker (k6 runs in container by default)
#   - bash or zsh
# =============================================================================
set -euo pipefail

# ── Resolve paths ─────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.test.yml"
REPORTS_DIR="${SCRIPT_DIR}/reports"

# ── Parse flags ───────────────────────────────────────────────────────────────
SKIP_UNIT=0
SKIP_LOAD=0
NO_CLEANUP=0
for arg in "$@"; do
  case "$arg" in
    --skip-unit)  SKIP_UNIT=1 ;;
    --skip-load)  SKIP_LOAD=1 ;;
    --no-cleanup) NO_CLEANUP=1 ;;
    --help|-h)
      sed -n '3,20p' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    *)
      echo "Unknown flag: $arg  (use --help)"
      exit 1
      ;;
  esac
done

# ── Colour helpers ────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[0;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

_header()  { echo -e "\n${CYAN}${BOLD}╔══ $1 ══╗${NC}"; }
_ok()      { echo -e "${GREEN}${BOLD}  ✓ $1${NC}"; }
_fail()    { echo -e "${RED}${BOLD}  ✗ $1${NC}"; }
_info()    { echo -e "  ${YELLOW}→${NC} $1"; }
_divider() { echo -e "${CYAN}──────────────────────────────────────────────────${NC}"; }

# ── Timing helper ─────────────────────────────────────────────────────────────
_elapsed() {
  local secs=$(($(date +%s) - START_EPOCH))
  printf "%dm%02ds" $((secs/60)) $((secs%60))
}

# ── Cleanup on exit ───────────────────────────────────────────────────────────
cleanup() {
  local exit_code=$?
  if [[ $NO_CLEANUP -eq 0 ]]; then
    echo ""
    _info "Tearing down test containers …"
    docker compose -f "$COMPOSE_FILE" down -v --remove-orphans 2>/dev/null || true
    _info "Containers removed."
  else
    _info "--no-cleanup set: containers left running."
    _info "Stop manually: docker compose -f test/docker-compose.test.yml down -v"
  fi
  echo ""
  if [[ $exit_code -ne 0 ]]; then
    _fail "Test suite failed (exit $exit_code). Elapsed: $(_elapsed)"
  else
    _ok "All stages completed. Elapsed: $(_elapsed)"
  fi
  echo ""
}
trap cleanup EXIT

START_EPOCH=$(date +%s)
mkdir -p "$REPORTS_DIR"

# Track per-stage results
STAGE_RESULTS=()

# ── Dependency checks ─────────────────────────────────────────────────────────
_header "Dependency Check"
MISSING=0
for dep in go docker curl; do
  if command -v "$dep" &>/dev/null; then
    _ok "$dep found ($(command -v $dep))"
  else
    _fail "$dep not found — required"
    MISSING=$((MISSING+1))
  fi
done
if ! docker compose version &>/dev/null; then
  _fail "Docker Compose v2 not found ('docker compose' must work, not 'docker-compose')"
  MISSING=$((MISSING+1))
fi
if [[ $MISSING -gt 0 ]]; then
  echo -e "\n${RED}${BOLD}$MISSING required dependency/ies missing. Aborting.${NC}"
  exit 1
fi

echo ""
echo -e "${BOLD}ArcOps 1.0 — Test Suite${NC}"
echo -e "Root    : ${ROOT_DIR}"
echo -e "Reports : ${REPORTS_DIR}"
echo -e "Flags   : skip-unit=${SKIP_UNIT}  skip-load=${SKIP_LOAD}  no-cleanup=${NO_CLEANUP}"
_divider

# =============================================================================
# STAGE 1 — Unit Tests (go test -race, no external deps, in-memory only)
# =============================================================================
if [[ $SKIP_UNIT -eq 0 ]]; then
  _header "Stage 1 — Unit Tests"

  UNIT_FAIL=0

  declare -A SERVICES=(
    [arcauth]="arcauth"
    [dbmux]="dbmux"
    [buckstream]="buckstream"
    [gateway]="gateway"
    [frontedge]="frontedge"
  )

  for dir in arcauth dbmux buckstream gateway frontedge; do
    svc_path="${ROOT_DIR}/${dir}"
    if [[ ! -f "${svc_path}/go.mod" ]]; then
      _info "${dir}: no go.mod found, skipping"
      continue
    fi

    echo -e "\n  ${BOLD}${dir}${NC}"

    # Set required env vars for tests that need them (in-memory only)
    (
      export ARCAUTH_DATABASE_URL="file::memory:?cache=shared&mode=memory"
      export EMAIL_PROVIDER="mock"
      export SMTP_HOST=""
      export ARCOPS_KEY_SIGNING_SECRET="test-signing-secret-for-unit-tests"
      export JWT_SECRET="test-jwt-secret"
      export GOOGLE_CLIENT_ID=""
      export GITHUB_CLIENT_ID="test-github-client-id"

      cd "$svc_path"
      if go test -race -count=1 -timeout 60s ./... \
           2>&1 | tee "${REPORTS_DIR}/unit_${dir}.txt" | \
           grep -E "^(ok|FAIL|---)" | sed 's/^/    /'; then
        _ok "${dir} unit tests passed"
      else
        _fail "${dir} unit tests FAILED — see ${REPORTS_DIR}/unit_${dir}.txt"
        UNIT_FAIL=$((UNIT_FAIL+1))
      fi
    ) || UNIT_FAIL=$((UNIT_FAIL+1))
  done

  if [[ $UNIT_FAIL -gt 0 ]]; then
    STAGE_RESULTS+=("Stage 1 (Unit): FAILED")
    _fail "Unit tests failed ($UNIT_FAIL service(s)). Stopping."
    exit 1
  fi

  STAGE_RESULTS+=("Stage 1 (Unit): PASSED")
  _ok "All unit tests passed."
else
  _info "Stage 1 (Unit): SKIPPED (--skip-unit)"
  STAGE_RESULTS+=("Stage 1 (Unit): SKIPPED")
fi

_divider

# =============================================================================
# STAGE 2 — Build & Boot (docker compose builds images from source)
# =============================================================================
_header "Stage 2 — Build & Boot"

_info "Building all service images and starting infrastructure …"
_info "This takes ~2–5 min on first run (Go compilation + Docker layers)."
echo ""

# Build all images (parallel where possible)
docker compose -f "$COMPOSE_FILE" build \
  2>&1 | tee "${REPORTS_DIR}/build.txt" | \
  grep -E "^(#[0-9]|\[|=>|ERROR|WARN)" | tail -40 | sed 's/^/  /'

_ok "Images built."
echo ""

# Start all services (excluding load profile) and wait for all healthchecks
_info "Starting containers (waiting for all healthchecks) …"
docker compose -f "$COMPOSE_FILE" up -d --wait \
  2>&1 | tee -a "${REPORTS_DIR}/build.txt" | \
  grep -E "healthy|started|Error" | sed 's/^/  /' || true

# Verify gateway is reachable from host
echo ""
_info "Verifying gateway reachability on localhost:8000 …"
WAIT=0
until curl -sf http://localhost:8000/health -o /dev/null 2>/dev/null; do
  WAIT=$((WAIT+2))
  if [[ $WAIT -gt 120 ]]; then
    _fail "Gateway did not become reachable after 120s"
    docker compose -f "$COMPOSE_FILE" logs --tail=50
    exit 1
  fi
  sleep 2
done
_ok "Gateway is reachable at http://localhost:8000"

# Print container resource usage for reference
echo ""
_info "Container resource snapshot:"
docker stats --no-stream --format \
  "  {{printf \"%-30s\" .Name}}  mem: {{.MemUsage}}  cpu: {{.CPUPerc}}" \
  2>/dev/null || true

STAGE_RESULTS+=("Stage 2 (Boot): PASSED")
_divider

# =============================================================================
# STAGE 3 — End-to-End Tests
# =============================================================================
_header "Stage 3 — End-to-End Tests"

chmod +x "${SCRIPT_DIR}/e2e.sh"

if GATEWAY_URL=http://localhost:8000 bash "${SCRIPT_DIR}/e2e.sh" \
     2>&1 | tee "${REPORTS_DIR}/e2e.txt"; then
  STAGE_RESULTS+=("Stage 3 (E2E): PASSED")
  _ok "E2E tests passed."
else
  STAGE_RESULTS+=("Stage 3 (E2E): FAILED")
  _fail "E2E tests FAILED — see ${REPORTS_DIR}/e2e.txt"
  # Print last 30 lines for quick CI log inspection
  tail -30 "${REPORTS_DIR}/e2e.txt"
  exit 1
fi

_divider

# =============================================================================
# STAGE 4 — Load Test (optional, k6 via Docker inside compose network)
# =============================================================================
if [[ $SKIP_LOAD -eq 0 ]]; then
  _header "Stage 4 — Load Test (k6)"

  _info "VU ramp: 0 → 10 → 10 → 0  |  Duration: ~3 min  |  Target: gateway:8000"
  _info "Thresholds: error rate < 1%,  p95 < 800 ms"
  echo ""

  chmod +x "${SCRIPT_DIR}/load.sh"

  # Run k6 inside the compose network so it can reach 'gateway' hostname
  if bash "${SCRIPT_DIR}/load.sh" \
       2>&1 | tee "${REPORTS_DIR}/load_runner.txt"; then
    STAGE_RESULTS+=("Stage 4 (Load): PASSED")
    _ok "Load test passed — all thresholds met."
  else
    STAGE_RESULTS+=("Stage 4 (Load): FAILED")
    _fail "Load test FAILED — thresholds breached. See ${REPORTS_DIR}/load_summary.txt"
    tail -30 "${REPORTS_DIR}/load_summary.txt" 2>/dev/null || true
    # Load test failure is a warning, not a hard abort — uncomment the next
    # line to make it a hard failure:
    # exit 1
    echo -e "  ${YELLOW}(load test failure is non-blocking — fix before production)${NC}"
  fi
else
  _info "Stage 4 (Load): SKIPPED (--skip-load)"
  STAGE_RESULTS+=("Stage 4 (Load): SKIPPED")
fi

_divider

# =============================================================================
# FINAL SUMMARY
# =============================================================================
_header "Summary"
echo ""
for result in "${STAGE_RESULTS[@]}"; do
  if [[ "$result" == *PASSED* ]]; then
    _ok "$result"
  elif [[ "$result" == *SKIPPED* ]]; then
    echo -e "  ${YELLOW}⊘ ${result}${NC}"
  else
    _fail "$result"
  fi
done

echo ""
echo -e "  Reports saved to: ${REPORTS_DIR}/"
ls -1 "${REPORTS_DIR}"/*.txt 2>/dev/null | sed 's/^/    /' || true
ls -1 "${REPORTS_DIR}"/*.json 2>/dev/null | sed 's/^/    /' || true
echo ""
_ok "Test suite complete. Total time: $(_elapsed)"
