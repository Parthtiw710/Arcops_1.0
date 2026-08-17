// =============================================================================
// ArcOps 1.0 — Low-Load Smoke & Baseline Test (k6)
//
// Goals:
//   - Confirm every key gateway route stays healthy under sustained light load
//   - Capture p95 latency baselines for future comparison
//   - Keep resource usage low enough to run on a CI runner (2 vCPU / 4 GB RAM)
//
// Stages (total ~3 min):
//   0–30s  : ramp from 0 → 10 VUs  (warm-up)
//   30s–2m : hold at 10 VUs         (steady-state)
//   2m–3m  : ramp from 10 → 0 VUs  (cool-down)
//
// Thresholds (hard failures):
//   - http_req_failed  < 1%      (99%+ success rate)
//   - http_req_duration p(95) < 800ms  (all routes combined)
//   - Per-scenario p(95) limits below
// =============================================================================

import http from "k6/http";
import { check, sleep, group } from "k6";
import { Rate, Trend } from "k6/metrics";

// ── Custom metrics ────────────────────────────────────────────────────────────
const authErrors   = new Rate("auth_errors");
const dbmuxErrors  = new Rate("dbmux_errors");
const storageErrors = new Rate("storage_errors");
const gatewayP95   = new Trend("gateway_p95_ms", true);

// ── Config ────────────────────────────────────────────────────────────────────
const GATEWAY = __ENV.GATEWAY_URL || "http://localhost:8000";

// A pre-seeded test account created during the setup() phase.
// The token is shared across all VUs (read-only after setup).
let sharedToken = "";
let sharedProjectId = "";

// ── k6 options ────────────────────────────────────────────────────────────────
export const options = {
  stages: [
    { duration: "30s", target: 10 },   // ramp up
    { duration: "90s", target: 10 },   // steady state
    { duration: "60s", target: 0  },   // cool down
  ],
  thresholds: {
    // Overall
    http_req_failed:          ["rate<0.01"],          // < 1% errors
    http_req_duration:        ["p(95)<800"],           // p95 < 800 ms

    // Custom per-area rates
    auth_errors:              ["rate<0.01"],
    dbmux_errors:             ["rate<0.01"],
    storage_errors:           ["rate<0.05"],           // storage slightly relaxed

    // Specific route trends
    "http_req_duration{route:health}":   ["p(95)<100"],
    "http_req_duration{route:auth_me}":  ["p(95)<300"],
    "http_req_duration{route:kv}":       ["p(95)<400"],
    "http_req_duration{route:state}":    ["p(95)<400"],
    "http_req_duration{route:projects}": ["p(95)<600"],
  },
};

// ── Setup: register a test user and obtain a JWT token ────────────────────────
// Runs once before any VU starts. Return value is passed to default() and teardown().
export function setup() {
  const ts = Date.now();
  const email = `k6_load_${ts}@arcops.test`;
  const password = "LoadTest123!";

  const signupRes = http.post(
    `${GATEWAY}/api/auth/signup`,
    JSON.stringify({ email, password, full_name: "k6 Load Tester" }),
    { headers: { "Content-Type": "application/json" } }
  );

  if (signupRes.status !== 201) {
    console.error(`[setup] Signup failed: ${signupRes.status} — ${signupRes.body}`);
    return { token: "", projectId: "" };
  }

  const body = JSON.parse(signupRes.body);
  const token = body.token || "";

  // Create a project so project-route tests have something to read.
  let projectId = "";
  if (token) {
    const projRes = http.post(
      `${GATEWAY}/api/projects`,
      JSON.stringify({ repo: `k6org/load-test-repo-${ts}`, installation_id: 1 }),
      { headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } }
    );
    if (projRes.status >= 200 && projRes.status < 300) {
      try { projectId = JSON.parse(projRes.body).id || ""; } catch (_) {}
    }
  }

  console.log(`[setup] token=${token.substring(0, 16)}… projectId=${projectId}`);
  return { token, projectId };
}

// ── Teardown: clean up the project created in setup ───────────────────────────
export function teardown(data) {
  if (data.token && data.projectId) {
    http.del(
      `${GATEWAY}/api/projects/${data.projectId}`,
      null,
      { headers: { Authorization: `Bearer ${data.token}` } }
    );
  }
}

// ── Default function: runs per VU per iteration ───────────────────────────────
export default function (data) {
  const token     = data.token || "";
  const projectId = data.projectId || "";
  const authHdr   = token ? { Authorization: `Bearer ${token}` } : {};
  const jsonHdr   = { "Content-Type": "application/json" };

  // ── Group 1: Gateway core ───────────────────────────────────────────────────
  group("gateway_core", () => {
    const res = http.get(`${GATEWAY}/health`, { tags: { route: "health" } });
    gatewayP95.add(res.timings.duration);
    check(res, { "health 200": (r) => r.status === 200 }) ||
      authErrors.add(1);
  });

  sleep(0.1);

  // ── Group 2: ArcAuth — /me (session token verify) ──────────────────────────
  if (token) {
    group("auth_me", () => {
      const res = http.get(`${GATEWAY}/api/auth/me`, {
        headers: authHdr,
        tags: { route: "auth_me" },
      });
      check(res, { "me 200": (r) => r.status === 200 }) ||
        authErrors.add(1);
    });
  }

  sleep(0.1);

  // ── Group 3: DBMux — KV Set + Get ──────────────────────────────────────────
  if (token) {
    group("dbmux_kv", () => {
      const vuKey = `k6-kv-${__VU}-${__ITER}`;

      const setRes = http.post(
        `${GATEWAY}/rpc/dbmux.v1.KV/Set`,
        JSON.stringify({ provider_id: "test-redis", key: vuKey, value: "load-test-value", ttl_seconds: 30 }),
        { headers: { ...authHdr, ...jsonHdr }, tags: { route: "kv" } }
      );
      check(setRes, { "kv set 2xx": (r) => r.status >= 200 && r.status < 300 }) ||
        dbmuxErrors.add(1);

      const getRes = http.post(
        `${GATEWAY}/rpc/dbmux.v1.KV/Get`,
        JSON.stringify({ provider_id: "test-redis", key: vuKey }),
        { headers: { ...authHdr, ...jsonHdr }, tags: { route: "kv" } }
      );
      check(getRes, { "kv get 2xx": (r) => r.status >= 200 && r.status < 300 }) ||
        dbmuxErrors.add(1);

      // Del to keep Redis tidy across iterations
      http.post(
        `${GATEWAY}/rpc/dbmux.v1.KV/Del`,
        JSON.stringify({ provider_id: "test-redis", key: vuKey }),
        { headers: { ...authHdr, ...jsonHdr } }
      );
    });
  }

  sleep(0.1);

  // ── Group 4: DBMux — State SaveState + GetState ────────────────────────────
  if (token) {
    group("dbmux_state", () => {
      const stateKey = `k6-state-${__VU}`;

      const saveRes = http.post(
        `${GATEWAY}/rpc/dbmux.v1.State/SaveState`,
        JSON.stringify({ key: stateKey, value_json: `{"vu":${__VU},"iter":${__ITER}}`, ttl_seconds: 60 }),
        { headers: { ...authHdr, ...jsonHdr }, tags: { route: "state" } }
      );
      check(saveRes, { "state save 2xx": (r) => r.status >= 200 && r.status < 300 }) ||
        dbmuxErrors.add(1);

      const getRes = http.post(
        `${GATEWAY}/rpc/dbmux.v1.State/GetState`,
        JSON.stringify({ key: stateKey }),
        { headers: { ...authHdr, ...jsonHdr }, tags: { route: "state" } }
      );
      check(getRes, { "state get 2xx": (r) => r.status >= 200 && r.status < 300 }) ||
        dbmuxErrors.add(1);
    });
  }

  sleep(0.1);

  // ── Group 5: DBMux — Queue Enqueue + Dequeue ───────────────────────────────
  if (token) {
    group("dbmux_queue", () => {
      const enqRes = http.post(
        `${GATEWAY}/rpc/dbmux.v1.Queue/Enqueue`,
        JSON.stringify({ queue_name: `k6-queue-${__VU}`, payload: `{"iter":${__ITER}}` }),
        { headers: { ...authHdr, ...jsonHdr } }
      );
      check(enqRes, { "queue enqueue 2xx": (r) => r.status >= 200 && r.status < 300 }) ||
        dbmuxErrors.add(1);

      const deqRes = http.post(
        `${GATEWAY}/rpc/dbmux.v1.Queue/Dequeue`,
        JSON.stringify({ queue_name: `k6-queue-${__VU}` }),
        { headers: { ...authHdr, ...jsonHdr } }
      );
      check(deqRes, { "queue dequeue 2xx": (r) => r.status >= 200 && r.status < 300 }) ||
        dbmuxErrors.add(1);
    });
  }

  sleep(0.1);

  // ── Group 6: DBMux — SQLite/Query SELECT 1 ────────────────────────────────
  if (token) {
    group("dbmux_sqlite", () => {
      const res = http.post(
        `${GATEWAY}/dbmux.v1.SQLite/Query`,
        JSON.stringify({ provider_id: "test-sqlite", query: "SELECT 1" }),
        { headers: { ...authHdr, ...jsonHdr } }
      );
      check(res, { "sqlite query 2xx": (r) => r.status >= 200 && r.status < 300 }) ||
        dbmuxErrors.add(1);
    });
  }

  sleep(0.1);

  // ── Group 7: BuckStream — Upload intent ────────────────────────────────────
  if (token) {
    group("buckstream_intent", () => {
      const res = http.post(
        `${GATEWAY}/api/storage/api/upload-intent`,
        JSON.stringify({
          filename: `k6-load-${__VU}-${__ITER}.txt`,
          size: 11,
          content_type: "text/plain",
        }),
        { headers: { ...authHdr, ...jsonHdr } }
      );
      // Upload intent can legitimately return 200 or 201
      check(res, { "upload intent 2xx": (r) => r.status >= 200 && r.status < 300 }) ||
        storageErrors.add(1);
    });
  }

  sleep(0.1);

  // ── Group 8: Frontedge — List projects ────────────────────────────────────
  if (token) {
    group("frontedge_projects", () => {
      const res = http.get(`${GATEWAY}/api/projects`, {
        headers: authHdr,
        tags: { route: "projects" },
      });
      check(res, { "list projects 2xx": (r) => r.status >= 200 && r.status < 300 }) ||
        authErrors.add(1);
    });
  }

  sleep(0.2);
}
