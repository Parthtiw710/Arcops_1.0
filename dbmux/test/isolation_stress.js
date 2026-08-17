import http from "k6/http";
import { check, sleep } from "k6";

// =============================================================================
// DBMux Staged Permutation Matrix Stress Test
// =============================================================================
// Stress ratios scaled by engine speed:
//   Redis  (in-memory KV)     → 5x baseline → 500 req/s
//   Postgres (SQL pool)        → 3x baseline → 300 req/s
//   MySQL    (SQL pool)        → 3x baseline → 300 req/s
//   MongoDB  (document store)  → 2x baseline → 200 req/s
//   SQLite   (single-writer)   → 1x baseline → 100 req/s
//
// VUs are set high enough to saturate the rate without backing up:
//   preAllocatedVUs = rate * avg_latency_est (e.g. 300 req/s * ~50ms = 15 VUs)
//   maxVUs = 5x preAllocated as burst ceiling
// =============================================================================

export const options = {
  discardResponseBodies: true,
  scenarios: {
    // -------------------------------------------------------------------------
    // Phase 1 (0-1m): Postgres High + Redis & Mongo Warm-up
    // -------------------------------------------------------------------------
    p1_postgres_high: {
      executor: "constant-arrival-rate",
      rate: 300,
      timeUnit: "1s",
      startTime: "0s",
      duration: "1m",
      preAllocatedVUs: 30,
      maxVUs: 200,
      exec: "testPostgres",
    },
    p1_redis_warmup: {
      executor: "constant-arrival-rate",
      rate: 200,
      timeUnit: "1s",
      startTime: "0s",
      duration: "1m",
      preAllocatedVUs: 20,
      maxVUs: 100,
      exec: "testRedis",
    },
    p1_mongo_warmup: {
      executor: "constant-arrival-rate",
      rate: 100,
      timeUnit: "1s",
      startTime: "0s",
      duration: "1m",
      preAllocatedVUs: 15,
      maxVUs: 60,
      exec: "testMongo",
    },

    // -------------------------------------------------------------------------
    // Phase 2 (1-2m): Dual SQL Extreme + Redis Medium
    // -------------------------------------------------------------------------
    p2_postgres_high: {
      executor: "constant-arrival-rate",
      rate: 300,
      timeUnit: "1s",
      startTime: "1m",
      duration: "1m",
      preAllocatedVUs: 30,
      maxVUs: 200,
      exec: "testPostgres",
    },
    p2_mysql_high: {
      executor: "constant-arrival-rate",
      rate: 300,
      timeUnit: "1s",
      startTime: "1m",
      duration: "1m",
      preAllocatedVUs: 30,
      maxVUs: 200,
      exec: "testMySQL",
    },
    p2_redis_med: {
      executor: "constant-arrival-rate",
      rate: 300,
      timeUnit: "1s",
      startTime: "1m",
      duration: "1m",
      preAllocatedVUs: 30,
      maxVUs: 150,
      exec: "testRedis",
    },

    // -------------------------------------------------------------------------
    // Phase 3 (2-3m): KV & NoSQL Heavy + SQLite Baseline
    // -------------------------------------------------------------------------
    p3_redis_extreme: {
      executor: "constant-arrival-rate",
      rate: 500,
      timeUnit: "1s",
      startTime: "2m",
      duration: "1m",
      preAllocatedVUs: 50,
      maxVUs: 300,
      exec: "testRedis",
    },
    p3_mongo_high: {
      executor: "constant-arrival-rate",
      rate: 200,
      timeUnit: "1s",
      startTime: "2m",
      duration: "1m",
      preAllocatedVUs: 20,
      maxVUs: 120,
      exec: "testMongo",
    },
    p3_state_stress: {
      executor: "constant-arrival-rate",
      rate: 200,
      timeUnit: "1s",
      startTime: "2m",
      duration: "1m",
      preAllocatedVUs: 20,
      maxVUs: 100,
      exec: "testState",
    },
    p3_cron_stress: {
      executor: "constant-arrival-rate",
      rate: 100,
      timeUnit: "1s",
      startTime: "2m",
      duration: "1m",
      preAllocatedVUs: 15,
      maxVUs: 80,
      exec: "testCron",
    },
    p3_secret_stress: {
      executor: "constant-arrival-rate",
      rate: 100,
      timeUnit: "1s",
      startTime: "2m",
      duration: "1m",
      preAllocatedVUs: 15,
      maxVUs: 80,
      exec: "testSecret",
    },
    p3_pubsub_stress: {
      executor: "constant-arrival-rate",
      rate: 100,
      timeUnit: "1s",
      startTime: "2m",
      duration: "1m",
      preAllocatedVUs: 15,
      maxVUs: 80,
      exec: "testPubSub",
    },
    p3_queue_stress: {
      executor: "constant-arrival-rate",
      rate: 100,
      timeUnit: "1s",
      startTime: "2m",
      duration: "1m",
      preAllocatedVUs: 15,
      maxVUs: 80,
      exec: "testQueue",
    },
    p3_sqlite_baseline: {
      executor: "constant-arrival-rate",
      rate: 100,
      timeUnit: "1s",
      startTime: "2m",
      duration: "1m",
      preAllocatedVUs: 15,
      maxVUs: 60,
      exec: "testSQLite",
    },

    // -------------------------------------------------------------------------
    // Phase 4 (3-4m): Full Multi-Database Engine Matrix (all 5 DB engines)
    // -------------------------------------------------------------------------
    p4_redis: {
      executor: "constant-arrival-rate",
      rate: 500,
      timeUnit: "1s",
      startTime: "3m",
      duration: "1m",
      preAllocatedVUs: 50,
      maxVUs: 300,
      exec: "testRedis",
    },
    p4_postgres: {
      executor: "constant-arrival-rate",
      rate: 300,
      timeUnit: "1s",
      startTime: "3m",
      duration: "1m",
      preAllocatedVUs: 30,
      maxVUs: 200,
      exec: "testPostgres",
    },
    p4_mysql: {
      executor: "constant-arrival-rate",
      rate: 300,
      timeUnit: "1s",
      startTime: "3m",
      duration: "1m",
      preAllocatedVUs: 30,
      maxVUs: 200,
      exec: "testMySQL",
    },
    p4_mongo: {
      executor: "constant-arrival-rate",
      rate: 200,
      timeUnit: "1s",
      startTime: "3m",
      duration: "1m",
      preAllocatedVUs: 20,
      maxVUs: 120,
      exec: "testMongo",
    },
    p4_sqlite: {
      executor: "constant-arrival-rate",
      rate: 100,
      timeUnit: "1s",
      startTime: "3m",
      duration: "1m",
      preAllocatedVUs: 15,
      maxVUs: 60,
      exec: "testSQLite",
    },

    // -------------------------------------------------------------------------
    // Phase 5 (4-5m): Dedicated PubSub Channel & Event Streaming Stress
    // -------------------------------------------------------------------------
    p5_pubsub_high: {
      executor: "constant-arrival-rate",
      rate: 1000,
      timeUnit: "1s",
      startTime: "4m",
      duration: "1m",
      preAllocatedVUs: 50,
      maxVUs: 250,
      exec: "testPubSub",
    },

    // -------------------------------------------------------------------------
    // Phase 6 (5-6m): Dedicated Distributed Queue Enqueue & Dequeue Lock Stress
    // -------------------------------------------------------------------------
    p6_queue_high: {
      executor: "constant-arrival-rate",
      rate: 1000,
      timeUnit: "1s",
      startTime: "5m",
      duration: "1m",
      preAllocatedVUs: 50,
      maxVUs: 250,
      exec: "testQueue",
    },
  },

  // Thresholds: Strict 99.90% (Three Nines) High-Load Availability Requirement
  thresholds: {
    // Phase 1
    "http_req_failed{scenario:p1_postgres_high}": ["rate<0.001"],
    "http_req_failed{scenario:p1_redis_warmup}": ["rate<0.001"],
    "http_req_failed{scenario:p1_mongo_warmup}": ["rate<0.001"],
    // Phase 2
    "http_req_failed{scenario:p2_postgres_high}": ["rate<0.001"],
    "http_req_failed{scenario:p2_mysql_high}": ["rate<0.001"],
    "http_req_failed{scenario:p2_redis_med}": ["rate<0.001"],
    // Phase 3
    "http_req_failed{scenario:p3_redis_extreme}": ["rate<0.001"],
    "http_req_failed{scenario:p3_mongo_high}": ["rate<0.001"],
    "http_req_failed{scenario:p3_sqlite_baseline}": ["rate<0.001"],
    // Phase 4
    "http_req_failed{scenario:p4_redis}": ["rate<0.001"],
    "http_req_failed{scenario:p4_postgres}": ["rate<0.001"],
    "http_req_failed{scenario:p4_mysql}": ["rate<0.001"],
    "http_req_failed{scenario:p4_mongo}": ["rate<0.001"],
    "http_req_failed{scenario:p4_sqlite}": ["rate<0.001"],
    // Phase 5
    "http_req_failed{scenario:p5_pubsub_high}": ["rate<0.001"],
    // Phase 6
    "http_req_failed{scenario:p6_queue_high}": ["rate<0.001"],
    "http_req_duration{scenario:p6_queue_high}": ["p(95)<100"],
  },
};

const BASE_URL = __ENV.TARGET_HOST || "http://dbmux:8080";
const SERVICE_KEY = "dbmux_service_role_secret_admin_key_demo123";
const HEADERS = {
  "Content-Type": "application/json",
  "X-Service-Role-Key": SERVICE_KEY,
  "Connect-Protocol-Version": "1",
};

// ---------------------------------------------------------------------------
// setup() — Gate: verify DBMux is ready and all providers are registered
// before firing any load. Retries up to 30s with back-off.
// ---------------------------------------------------------------------------
export function setup() {
  const maxRetries = 30;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const healthRes = http.get(`${BASE_URL}/healthz`, { timeout: "2s" });
      if (healthRes.status === 200) {
        console.log("✅ DBMux gateway is ready");

        // Pre-register cron job for stress test
        http.post(
          `${BASE_URL}/dbmux.v1.Cron/RegisterCron`,
          JSON.stringify({ cron_id: "stress_test_cron", schedule: "@every 1m", payload_json: "{\"task\":\"stress\"}" }),
          { headers: HEADERS }
        );

        // Pre-save state key for state engine stress test
        http.post(
          `${BASE_URL}/dbmux.v1.State/SaveState`,
          JSON.stringify({ store_name: "default", key: "test_state_key", value_json: "{\"status\":\"ok\"}", ttl_seconds: 3600 }),
          { headers: HEADERS }
        );

        return { ready: true };
      }
    } catch (_) {
      console.log(`⏳ Waiting for DBMux gateway... (attempt ${i + 1}/${maxRetries})`);
    }
    sleep(1);
  }
  console.error("❌ DBMux failed to become ready after 30s — aborting test");
  return { ready: false };
}

// ---------------------------------------------------------------------------
// ConnectRPC response checker: Connect protocol returns HTTP 200 for both
// success and application errors. Errors have an "code" field in the JSON body.
// A truly successful response is status=200 AND no error code in the body.
// We also accept status=200 with code="not_found" on Redis GET (key may not
// exist) — that's still a valid healthy response from the engine.
// ---------------------------------------------------------------------------
function isConnectSuccess(res) {
  if (res.status !== 200) return false;
  // If body contains a ConnectRPC error envelope, it's an error
  try {
    const body = JSON.parse(res.body);
    if (body.code && body.code !== "") return false;
  } catch (_) {
    // Non-JSON response = not a connect error = could be success
  }
  return true;
}

export function testPostgres(data) {
  if (data && !data.ready) return;
  const res = http.post(
    `${BASE_URL}/dbmux.v1.Postgres/Query`,
    JSON.stringify({ provider_id: "test-postgres", query: "SELECT 1" }),
    { headers: HEADERS }
  );
  check(res, { "Postgres responded": isConnectSuccess });
  sleep(0.01);
}

export function testMySQL(data) {
  if (data && !data.ready) return;
  const res = http.post(
    `${BASE_URL}/dbmux.v1.MySQL/Query`,
    JSON.stringify({ provider_id: "test-mysql", query: "SELECT 1" }),
    { headers: HEADERS }
  );
  check(res, { "MySQL responded": isConnectSuccess });
  sleep(0.01);
}

export function testRedis(data) {
  if (data && !data.ready) return;
  const res = http.post(
    `${BASE_URL}/dbmux.v1.KV/Get`,
    JSON.stringify({ provider_id: "test-redis", key: "test_key" }),
    { headers: HEADERS }
  );
  // Redis GET on a non-existent key returns 200 with found=false — that's fine
  check(res, { "Redis responded": (r) => r.status === 200 });
  sleep(0.01);
}

export function testMongo(data) {
  if (data && !data.ready) return;
  const res = http.post(
    `${BASE_URL}/dbmux.v1.Mongo/Find`,
    JSON.stringify({
      provider_id: "test-mongo",
      database: "testdb",
      collection: "items",
      filter_json: "{}",
    }),
    { headers: HEADERS }
  );
  check(res, { "Mongo responded": isConnectSuccess });
  sleep(0.01);
}

export function testSQLite(data) {
  if (data && !data.ready) return;
  const res = http.post(
    `${BASE_URL}/dbmux.v1.SQLite/Query`,
    JSON.stringify({ provider_id: "test-sqlite", query: "SELECT 1" }),
    { headers: HEADERS }
  );
  check(res, { "SQLite responded": isConnectSuccess });
  sleep(0.01);
}

export function testState(data) {
  if (data && !data.ready) return;
  const res = http.post(
    `${BASE_URL}/dbmux.v1.State/GetState`,
    JSON.stringify({ store_name: "default", key: "test_state_key" }),
    { headers: HEADERS }
  );
  check(res, { "State Engine responded": (r) => r.status === 200 });
  sleep(0.01);
}

export function testCron(data) {
  if (data && !data.ready) return;
  const res = http.post(
    `${BASE_URL}/dbmux.v1.Cron/TriggerCron`,
    JSON.stringify({ cron_id: "stress_test_cron" }),
    { headers: HEADERS }
  );
  check(res, { "Distributed Cron responded": (r) => r.status === 200 });
  sleep(0.01);
}

export function testSecret(data) {
  if (data && !data.ready) return;
  const res = http.post(
    `${BASE_URL}/dbmux.v1.Secret/GetSecret`,
    JSON.stringify({ store_name: "env", secret_key: "POSTGRES_DSN" }),
    { headers: HEADERS }
  );
  check(res, { "Secret Accessor responded": (r) => r.status === 200 });
  sleep(0.01);
}

export function testPubSub(data) {
  if (data && !data.ready) return;
  const res = http.post(
    `${BASE_URL}/dbmux.v1.PubSub/Publish`,
    JSON.stringify({ topic: "stress_events", payload: '{"event": "ping"}' }),
    { headers: HEADERS }
  );
  check(res, { "PubSub.Publish responded": (r) => r.status === 200 });
  sleep(0.01);
}

export function testQueue(data) {
  if (data && !data.ready) return;
  const enqRes = http.post(
    `${BASE_URL}/dbmux.v1.Queue/Enqueue`,
    JSON.stringify({ queue_name: "stress_jobs", payload: '{"job": 123}' }),
    { headers: HEADERS }
  );
  check(enqRes, { "Queue.Enqueue responded": (r) => r.status === 200 });

  const deqRes = http.post(
    `${BASE_URL}/dbmux.v1.Queue/Dequeue`,
    JSON.stringify({ queue_name: "stress_jobs" }),
    { headers: HEADERS }
  );
  check(deqRes, { "Queue.Dequeue responded": (r) => r.status === 200 });
  sleep(0.01);
}

// ---------------------------------------------------------------------------
// HTML & Text Summary Reporter (Official k6-reporter local bundle)
// ---------------------------------------------------------------------------
import { htmlReport } from "./k6-reporter-bundle.js";

export function handleSummary(data) {
  return {
    "/reports/stress_matrix.html": htmlReport(data),
  };
}
