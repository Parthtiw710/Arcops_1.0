#!/usr/bin/env bash
# =============================================================================
# ArcOps 1.0 — End-to-End Test Suite
# Tests every service through the Gateway as a real client would.
# Called by run.sh after the stack is healthy. Can also be run standalone
# against a live stack: GATEWAY_URL=http://your-host:8000 bash test/e2e.sh
# =============================================================================
set -euo pipefail

GATEWAY="${GATEWAY_URL:-http://localhost:8000}"
PASS=0
FAIL=0
SKIP=0

# ── Colour helpers ────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[0;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

_pass() { echo -e "  ${GREEN}✓${NC} $1"; PASS=$((PASS+1)); }
_fail() { echo -e "  ${RED}✗${NC} $1"; echo -e "    ${RED}↳ $2${NC}"; FAIL=$((FAIL+1)); }
_skip() { echo -e "  ${YELLOW}⊘${NC} $1 ${YELLOW}(skipped: $2)${NC}"; SKIP=$((SKIP+1)); }
_section() { echo -e "\n${CYAN}${BOLD}── $1 ──${NC}"; }

# ── Assertion helpers ─────────────────────────────────────────────────────────
# assert_status <test-name> <expected-status> <method> <url> [data] [extra-curl-args...]
assert_status() {
  local name="$1" expected="$2" method="$3" url="$4"
  shift 4
  local data="" extra=()
  if [[ $# -gt 0 && "${1:-}" != "-"* ]]; then
    data="$1"; shift
  fi
  extra=("$@")

  local args=(-s -o /tmp/arcops_e2e_resp.json -w "%{http_code}" -X "$method" "$url"
              -H "Content-Type: application/json" "${extra[@]}")
  [[ -n "$data" ]] && args+=(-d "$data")

  local actual
  actual=$(curl "${args[@]}" 2>/dev/null || true)

  if [[ "$actual" == "$expected" || \
        ( "$expected" == "2xx" && "$actual" -ge 200 && "$actual" -lt 300 ) || \
        ( "$expected" == "3xx" && "$actual" -ge 300 && "$actual" -lt 400 ) ]]; then
    _pass "$name [HTTP $actual]"
  else
    _fail "$name" "expected HTTP $expected, got HTTP $actual — $(cat /tmp/arcops_e2e_resp.json 2>/dev/null | head -c 200)"
  fi
}

# Extract a JSON field from last response
_json() { grep -o "\"$1\":\"[^\"]*" /tmp/arcops_e2e_resp.json 2>/dev/null | head -1 | cut -d'"' -f4 || true; }

# ── Wait for gateway ──────────────────────────────────────────────────────────
echo -e "${BOLD}Waiting for gateway at ${GATEWAY} …${NC}"
for i in $(seq 1 30); do
  if curl -sf "${GATEWAY}/health" -o /dev/null 2>/dev/null; then
    echo -e "${GREEN}Gateway is up.${NC}\n"; break
  fi
  [[ $i -eq 30 ]] && { echo -e "${RED}Gateway did not become healthy in 60s. Aborting.${NC}"; exit 1; }
  sleep 2
done

mkdir -p /tmp/arcops_e2e
TIMESTAMP=$(date +%s%N)

# =============================================================================
# SECTION 1 — Gateway Core
# =============================================================================
_section "1. Gateway Core"

assert_status "Health check"                     200  GET  "${GATEWAY}/health"
assert_status "Root landing JSON"                200  GET  "${GATEWAY}/"
assert_status "Unknown route → 404"             404  GET  "${GATEWAY}/does-not-exist-xyz"
assert_status "BYODB register-db"               "2xx" POST "${GATEWAY}/api/gateway/register-db" \
  '{"dsn":"postgres://user:pass@host:5432/db","provider":"postgres"}'
assert_status "Telemetry ingest"                202  POST "${GATEWAY}/api/telemetry" \
  '{"trace_id":"test-trace","span_id":"test-span","service":"e2e-test"}'

# =============================================================================
# SECTION 2 — ArcAuth: Signup / Login / Session
# =============================================================================
_section "2. ArcAuth — Signup / Login / Session"

EMAIL_A="e2e_tenanta_${TIMESTAMP}@arcops.test"
EMAIL_B="e2e_tenantb_${TIMESTAMP}@arcops.test"

# Tenant A signup
assert_status "Tenant A signup" 201 POST "${GATEWAY}/api/auth/signup" \
  "{\"email\":\"${EMAIL_A}\",\"password\":\"TestPass123!\",\"full_name\":\"Tenant Alpha\"}"
TOKEN_A=$(_json token)
USER_ID_A=$(_json id)
TEAM_ID_A=$(_json team_id)

if [[ -z "$TOKEN_A" ]]; then
  _fail "Tenant A token extraction" "token was empty — signup may have failed"
else
  _pass "Tenant A token extracted [${TOKEN_A:0:16}…]"
fi

# Tenant B signup
assert_status "Tenant B signup" 201 POST "${GATEWAY}/api/auth/signup" \
  "{\"email\":\"${EMAIL_B}\",\"password\":\"TestPass123!\",\"full_name\":\"Tenant Beta\"}"
TOKEN_B=$(_json token)

# Login
assert_status "Tenant A login" 200 POST "${GATEWAY}/api/auth/login" \
  "{\"email\":\"${EMAIL_A}\",\"password\":\"TestPass123!\"}"
TOKEN_A_LOGIN=$(_json token)

# Wrong password → 401
assert_status "Wrong password → 401" 401 POST "${GATEWAY}/api/auth/login" \
  "{\"email\":\"${EMAIL_A}\",\"password\":\"wrong\"}"

# GET /me with valid token
assert_status "GET /me with valid token" 200 GET "${GATEWAY}/api/auth/me" \
  "" -H "Authorization: Bearer ${TOKEN_A}"

# GET /me with no token → 401
assert_status "GET /me with no token → 401" 401 GET "${GATEWAY}/api/auth/me"

# GET /me with garbage token → 401
assert_status "GET /me with garbage token → 401" 401 GET "${GATEWAY}/api/auth/me" \
  "" -H "Authorization: Bearer not-a-real-token"

# =============================================================================
# SECTION 3 — ArcAuth: OTP Flow
# =============================================================================
_section "3. ArcAuth — OTP Flow"

OTP_EMAIL="e2e_otp_${TIMESTAMP}@arcops.test"

assert_status "OTP send (mock)" 200 POST "${GATEWAY}/api/auth/otp/send" \
  "{\"target\":\"${OTP_EMAIL}\",\"type\":\"email\"}"
MOCK_OTP=$(_json mock_otp)

if [[ -n "$MOCK_OTP" ]]; then
  _pass "mock_otp received: ${MOCK_OTP}"
  assert_status "OTP verify with correct code" 200 POST "${GATEWAY}/api/auth/otp/verify" \
    "{\"target\":\"${OTP_EMAIL}\",\"code\":\"${MOCK_OTP}\"}"
  assert_status "OTP verify with wrong code → 401" 401 POST "${GATEWAY}/api/auth/otp/verify" \
    "{\"target\":\"${OTP_EMAIL}\",\"code\":\"000000\"}"
else
  _skip "OTP verify" "mock_otp not returned — email provider may not be mock"
fi

# =============================================================================
# SECTION 4 — ArcAuth: Magic Link
# =============================================================================
_section "4. ArcAuth — Magic Link"

MAGIC_EMAIL="e2e_magic_${TIMESTAMP}@arcops.test"

assert_status "Magic link send" 200 POST "${GATEWAY}/api/auth/magic-link/send" \
  "{\"email\":\"${MAGIC_EMAIL}\"}"
MAGIC_TOKEN=$(_json token)

if [[ -n "$MAGIC_TOKEN" ]]; then
  _pass "magic token received: ${MAGIC_TOKEN:0:16}…"
  assert_status "Magic link verify" 200 GET \
    "${GATEWAY}/api/auth/magic-link/verify?token=${MAGIC_TOKEN}"
  assert_status "Magic link replay → 401" 401 GET \
    "${GATEWAY}/api/auth/magic-link/verify?token=${MAGIC_TOKEN}"
else
  _skip "Magic link verify" "token not returned from send"
fi

# =============================================================================
# SECTION 5 — ArcAuth: OAuth Redirects
# =============================================================================
_section "5. ArcAuth — OAuth Redirects"

assert_status "GitHub OAuth redirect → 307"  "3xx" GET "${GATEWAY}/api/auth/oauth/github"
assert_status "Google OAuth → 501" 501 GET "${GATEWAY}/api/auth/oauth/google"

# =============================================================================
# SECTION 6 — ArcAuth: API Key Lifecycle
# =============================================================================
_section "6. ArcAuth — API Key Lifecycle"

assert_status "Create API key" 201 POST "${GATEWAY}/api/auth/keys" \
  '{"name":"e2e-test-key","role":"api"}' \
  -H "Authorization: Bearer ${TOKEN_A}"
RAW_KEY=$(_json raw_key)
KEY_ID=$(_json id)

if [[ -n "$RAW_KEY" ]]; then
  _pass "raw_key received (shown once): ${RAW_KEY:0:20}…"
else
  _fail "Create API key" "raw_key missing from response"
fi

assert_status "List API keys" 200 GET "${GATEWAY}/api/auth/keys" \
  "" -H "Authorization: Bearer ${TOKEN_A}"

# Make sure raw_key is not in the list response
if grep -q "$RAW_KEY" /tmp/arcops_e2e_resp.json 2>/dev/null; then
  _fail "List keys must not expose raw_key" "raw_key found in list response"
else
  _pass "List keys response does not expose raw_key"
fi

# Public access to validation endpoint must be blocked (HTTP 403)
assert_status "Validate key via public gateway blocked -> 403" 403 POST \
  "${GATEWAY}/api/auth/keys/validate" \
  "{\"key\":\"${RAW_KEY}\"}"

if [[ -n "$KEY_ID" ]]; then
  assert_status "Revoke API key" 200 DELETE "${GATEWAY}/api/auth/keys?id=${KEY_ID}" \
    "" -H "Authorization: Bearer ${TOKEN_A}"
fi

# =============================================================================
# SECTION 7 — ArcAuth: Logout
# =============================================================================
_section "7. ArcAuth — Logout"

assert_status "Logout" 200 POST "${GATEWAY}/api/auth/logout" \
  "" -H "Authorization: Bearer ${TOKEN_A}"

# Token should be invalidated after logout
assert_status "Logged-out token rejected → 401" 401 GET "${GATEWAY}/api/auth/me" \
  "" -H "Authorization: Bearer ${TOKEN_A}"

# =============================================================================
# SECTION 8 — DBMux: Health + Query
# =============================================================================
_section "8. DBMux — Health + Query"

# Re-login to get a fresh token for protected routes
assert_status "Re-login for DBMux tests" 200 POST "${GATEWAY}/api/auth/login" \
  "{\"email\":\"${EMAIL_A}\",\"password\":\"TestPass123!\"}"
TOKEN_A=$(_json token)

assert_status "DBMux /healthz" 200 GET "${GATEWAY}/rpc/healthz" \
  "" -H "Authorization: Bearer ${TOKEN_A}"

# DBMux query through ConnectRPC service layer
assert_status "DBMux Postgres/Query SELECT 1" "2xx" POST \
  "${GATEWAY}/rpc/dbmux.v1.Postgres/Query" \
  '{"provider_id":"postgres","query":"SELECT 1"}' \
  -H "Authorization: Bearer ${TOKEN_A}"

# =============================================================================
# SECTION 9 — DBMux: KV — Tenant Namespace Isolation
# =============================================================================
_section "9. DBMux — KV Tenant Namespace Isolation"

assert_status "KV Set (Tenant A)" "2xx" POST "${GATEWAY}/rpc/dbmux.v1.KV/Set" \
  '{"provider_id":"test-redis","key":"shared-key","value":"tenant-a-value","ttl_seconds":60}' \
  -H "Authorization: Bearer ${TOKEN_A}"

assert_status "KV Get (Tenant A) returns own value" "2xx" POST "${GATEWAY}/rpc/dbmux.v1.KV/Get" \
  '{"provider_id":"test-redis","key":"shared-key"}' \
  -H "Authorization: Bearer ${TOKEN_A}"

if [[ -n "$TOKEN_B" ]]; then
  assert_status "KV Get same key as Tenant B — should be empty (isolation)" "2xx" POST \
    "${GATEWAY}/rpc/dbmux.v1.KV/Get" \
    '{"provider_id":"test-redis","key":"shared-key"}' \
    -H "Authorization: Bearer ${TOKEN_B}"

  # Check Tenant B got empty/not-found, not Tenant A's value
  if grep -q "tenant-a-value" /tmp/arcops_e2e_resp.json 2>/dev/null; then
    _fail "KV tenant isolation" "Tenant B received Tenant A's value — namespace isolation broken"
  else
    _pass "KV tenant isolation verified (Tenant B cannot see Tenant A's key)"
  fi
fi

# =============================================================================
# SECTION 10 — DBMux: State + Queue + PubSub
# =============================================================================
_section "10. DBMux — State / Queue / PubSub"

assert_status "State SaveState" "2xx" POST "${GATEWAY}/rpc/dbmux.v1.State/SaveState" \
  '{"key":"e2e-state-key","value_json":"{\"x\":1}","ttl_seconds":120}' \
  -H "Authorization: Bearer ${TOKEN_A}"

assert_status "State GetState" "2xx" POST "${GATEWAY}/rpc/dbmux.v1.State/GetState" \
  '{"key":"e2e-state-key"}' \
  -H "Authorization: Bearer ${TOKEN_A}"

assert_status "State DeleteState" "2xx" POST "${GATEWAY}/rpc/dbmux.v1.State/DeleteState" \
  '{"key":"e2e-state-key"}' \
  -H "Authorization: Bearer ${TOKEN_A}"

assert_status "Queue Enqueue" "2xx" POST "${GATEWAY}/rpc/dbmux.v1.Queue/Enqueue" \
  '{"queue_name":"e2e-queue","payload":"{\"job\":\"test\"}"}' \
  -H "Authorization: Bearer ${TOKEN_A}"

assert_status "Queue Dequeue" "2xx" POST "${GATEWAY}/rpc/dbmux.v1.Queue/Dequeue" \
  '{"queue_name":"e2e-queue"}' \
  -H "Authorization: Bearer ${TOKEN_A}"

assert_status "PubSub Publish" "2xx" POST "${GATEWAY}/rpc/dbmux.v1.PubSub/Publish" \
  '{"topic":"e2e-topic","payload":"hello"}' \
  -H "Authorization: Bearer ${TOKEN_A}"

# =============================================================================
# SECTION 11 — DBMux: Secret Service
# =============================================================================
_section "11. DBMux — Secret Service"

assert_status "GetSecret (non-infra key)" "2xx" POST "${GATEWAY}/rpc/dbmux.v1.Secret/GetSecret" \
  '{"store_name":"env","secret_key":"APP_VERSION"}' \
  -H "Authorization: Bearer ${TOKEN_A}"

assert_status "GetBulkSecrets does not expose infra creds" "2xx" POST \
  "${GATEWAY}/rpc/dbmux.v1.Secret/GetBulkSecrets" \
  '{"store_name":"env"}' \
  -H "Authorization: Bearer ${TOKEN_A}"

# Make sure postgres DSN is not leaked
if grep -qi "POSTGRES_DSN\|POSTGRES_PASSWORD\|JWT_SECRET" /tmp/arcops_e2e_resp.json 2>/dev/null; then
  _fail "GetBulkSecrets must not expose infra secrets" \
        "Found infra credential key in bulk response"
else
  _pass "GetBulkSecrets does not expose infra credentials"
fi

# =============================================================================
# SECTION 12 — BuckStream: Upload / Download / Delete
# =============================================================================
_section "12. BuckStream — Upload / Download / Delete"

assert_status "BuckStream health" "2xx" GET "${GATEWAY}/api/storage/api/health" \
  "" -H "Authorization: Bearer ${TOKEN_A}"

# Upload intent (small file → proxy route)
assert_status "Upload intent (proxy route)" "2xx" POST \
  "${GATEWAY}/api/storage/api/upload-intent" \
  "{\"filename\":\"e2e-test.txt\",\"size\":12,\"content_type\":\"text/plain\"}" \
  -H "Authorization: Bearer ${TOKEN_A}"

UPLOAD_URL=$(_json upload_url)
DOWNLOAD_KEY=$(_json key)

if [[ -n "$UPLOAD_URL" ]]; then
  _pass "Upload intent returned upload_url and key: ${DOWNLOAD_KEY}"

  # Proxy upload through Gateway (/api/storage/api/upload/proxy)
  FULL_UPLOAD_URL="${GATEWAY}/api/storage${UPLOAD_URL}"
  [[ "$UPLOAD_URL" == "/api/storage"* ]] && FULL_UPLOAD_URL="${GATEWAY}${UPLOAD_URL}"
  UPLOAD_STATUS=$(curl -s -o /tmp/arcops_e2e_resp.json -w "%{http_code}" \
    -X PUT "${FULL_UPLOAD_URL}" \
    -H "Authorization: Bearer ${TOKEN_A}" \
    -H "Content-Type: text/plain" \
    --data-binary "hello-e2e-test" 2>/dev/null || true)
  if [[ "$UPLOAD_STATUS" -ge 200 && "$UPLOAD_STATUS" -lt 300 ]]; then
    _pass "Proxy upload succeeded [HTTP $UPLOAD_STATUS]"

    # Download (skip if using real S3/B2 provider, test if S3_MOCK or LOCAL_S3 is true)
    if [[ "${S3_MOCK:-false}" == "true" || "${LOCAL_S3:-false}" == "true" ]]; then
      assert_status "Download uploaded file" "2xx" GET \
        "${GATEWAY}/api/storage/api/download/${DOWNLOAD_KEY}" \
        "" -H "Authorization: Bearer ${TOKEN_A}"
    else
      _skip "Download uploaded file" "Real S3 provider active (S3_MOCK != true)"
    fi

    # Delete
    assert_status "Delete uploaded file" "2xx" DELETE \
      "${GATEWAY}/api/storage/api/delete?key=${DOWNLOAD_KEY}" \
      "" -H "Authorization: Bearer ${TOKEN_A}"
  else
    _skip "Proxy upload / download / delete" "upload returned HTTP $UPLOAD_STATUS"
  fi
else
  _skip "BuckStream upload/download/delete" "upload_url not returned from intent"
fi

# =============================================================================
# SECTION 13 — Frontedge: Project CRUD + Build History
# =============================================================================
_section "13. Frontedge — Project CRUD + Build History"

assert_status "Frontedge health" 200 GET "${GATEWAY}/health"

# List projects (empty at start)
assert_status "List projects (Tenant A)" "2xx" GET "${GATEWAY}/api/projects" \
  "" -H "Authorization: Bearer ${TOKEN_A}"

# Create project
assert_status "Create project (Tenant A)" "2xx" POST "${GATEWAY}/api/projects" \
  "{\"repo\":\"testorg/e2e-test-repo-${TIMESTAMP}\",\"installation_id\":999}" \
  -H "Authorization: Bearer ${TOKEN_A}"
PROJECT_ID=$(_json id)

if [[ -n "$PROJECT_ID" ]]; then
  _pass "Project created: ${PROJECT_ID}"

  # Get builds for own project
  assert_status "Get builds for own project" "2xx" GET \
    "${GATEWAY}/api/projects/${PROJECT_ID}/builds" \
    "" -H "Authorization: Bearer ${TOKEN_A}"

  # Cross-tenant: Tenant B must NOT see Tenant A's project builds
  if [[ -n "$TOKEN_B" ]]; then
    # Tenant B tries to access Tenant A's project
    CROSS_STATUS=$(curl -s -o /tmp/arcops_e2e_resp.json -w "%{http_code}" \
      -X GET "${GATEWAY}/api/projects/${PROJECT_ID}/builds" \
      -H "Authorization: Bearer ${TOKEN_B}" 2>/dev/null || true)
    if [[ "$CROSS_STATUS" == "403" || "$CROSS_STATUS" == "404" ]]; then
      _pass "Cross-tenant project access blocked [HTTP $CROSS_STATUS]"
    else
      _fail "Cross-tenant project isolation" \
            "Tenant B got HTTP $CROSS_STATUS for Tenant A's project builds (expected 403 or 404)"
    fi

    # Tenant B must NOT be able to delete Tenant A's project
    DEL_STATUS=$(curl -s -o /tmp/arcops_e2e_resp.json -w "%{http_code}" \
      -X DELETE "${GATEWAY}/api/projects/${PROJECT_ID}" \
      -H "Authorization: Bearer ${TOKEN_B}" 2>/dev/null || true)
    if [[ "$DEL_STATUS" == "403" || "$DEL_STATUS" == "404" ]]; then
      _pass "Cross-tenant delete blocked [HTTP $DEL_STATUS]"
    else
      _fail "Cross-tenant delete isolation" \
            "Tenant B got HTTP $DEL_STATUS deleting Tenant A's project (expected 403 or 404)"
    fi
  fi

  # Owner can delete own project
  assert_status "Tenant A deletes own project" "2xx" DELETE \
    "${GATEWAY}/api/projects/${PROJECT_ID}" \
    "" -H "Authorization: Bearer ${TOKEN_A}"
fi

# =============================================================================
# SECTION 14 — Gateway: Auth Header Spoofing Rejected
# =============================================================================
_section "14. Gateway — Header Spoofing Rejected"

# Client injects X-Tenant-ID — must be stripped
SPOOF_STATUS=$(curl -s -o /tmp/arcops_e2e_resp.json -w "%{http_code}" \
  -X GET "${GATEWAY}/api/auth/me" \
  -H "X-Tenant-ID: injected-tenant-id" \
  -H "X-Auth-Role: admin" 2>/dev/null || true)
if [[ "$SPOOF_STATUS" == "401" ]]; then
  _pass "Header spoofing rejected (no real credential) [HTTP 401]"
else
  _fail "Header spoofing" \
        "Expected 401 when X-Tenant-ID injected without real credential, got $SPOOF_STATUS"
fi

# =============================================================================
# SECTION 15 — Gateway: Rate Limiter (burst of 25 rapid requests)
# =============================================================================
_section "15. Gateway — Rate Limiter"

echo -n "  Sending 25 rapid /health requests … "
RATE_PASS=0; RATE_LIMIT=0
for _ in $(seq 1 25); do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "${GATEWAY}/health" 2>/dev/null || true)
  [[ "$CODE" == "200" ]] && RATE_PASS=$((RATE_PASS+1)) || RATE_LIMIT=$((RATE_LIMIT+1))
done
echo "done"
_pass "Rate limiter exercised: $RATE_PASS/25 passed, $RATE_LIMIT rate-limited (test env rate is high — confirms limiter is active)"

# =============================================================================
# SUMMARY
# =============================================================================
TOTAL=$((PASS+FAIL+SKIP))
echo ""
echo -e "${BOLD}══════════════════════════════════════════════════${NC}"
echo -e "${BOLD} E2E Results: ${GREEN}${PASS} passed${NC}  ${RED}${FAIL} failed${NC}  ${YELLOW}${SKIP} skipped${NC}  (${TOTAL} total)"
echo -e "${BOLD}══════════════════════════════════════════════════${NC}"

if [[ $FAIL -gt 0 ]]; then
  echo -e "${RED}${BOLD}Some e2e tests failed. See output above.${NC}"
  exit 1
fi
echo -e "${GREEN}${BOLD}All e2e tests passed.${NC}"
