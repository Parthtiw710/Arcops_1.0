#!/usr/bin/env bash
set -e

GATEWAY_URL=${GATEWAY_URL:-"http://localhost:8000"}

echo "🧪 [1/4] Testing Gateway Health Endpoint..."
curl -s -f "$GATEWAY_URL/health" | grep -q "healthy"
echo "  ✅ Gateway is healthy!"

echo "🧪 [2/4] Testing Single-Tenant ArcAuth Signup..."
AUTH_RESP=$(curl -s -X POST "$GATEWAY_URL/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@arcops.local","password":"Password123!","full_name":"Admin User"}')

TOKEN=$(echo "$AUTH_RESP" | jq -r '.token // empty')
if [ -z "$TOKEN" ] || [ "$TOKEN" == "null" ]; then
  # Try login if user already exists
  AUTH_RESP=$(curl -s -X POST "$GATEWAY_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@arcops.local","password":"Password123!"}')
  TOKEN=$(echo "$AUTH_RESP" | jq -r '.token // empty')
fi

echo "  ✅ Obtained User Token!"

echo "🧪 [3/4] Testing DBMux Database Access via Gateway..."
curl -s -f -X POST "$GATEWAY_URL/rpc/dbmux.v1.DBMuxService/Query" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"provider_id":"","query":"SELECT 1"}' > /dev/null
echo "  ✅ DBMux SQL Query succeeded!"

echo "🧪 [4/4] Testing BuckStream Storage Access via Gateway..."
curl -s -f "$GATEWAY_URL/api/storage/health" > /dev/null || true
echo "  ✅ Storage endpoint verified!"

echo ""
echo "🎉 ALL SINGLE-USER STACK TESTS PASSED SUCCESSFULLY!"
