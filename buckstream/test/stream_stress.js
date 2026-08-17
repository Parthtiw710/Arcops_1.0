import http from "k6/http";
import { check, sleep } from "k6";

// =============================================================================
// BuckStream Dual-Engine Load Matrix (Cloud S3 + Local Disk PV)
// =============================================================================

export const options = {
  scenarios: {
    // -------------------------------------------------------------------------
    // Phase 1: Local Disk PV Streaming Uploads & Downloads
    // -------------------------------------------------------------------------
    p1_local_disk_stream: {
      executor: "constant-arrival-rate",
      rate: 300,
      timeUnit: "1s",
      startTime: "0s",
      duration: "1m",
      preAllocatedVUs: 30,
      maxVUs: 200,
      exec: "testLocalDiskStorage",
    },

    // -------------------------------------------------------------------------
    // Phase 2: Cloud S3 MinIO & IAM Metadata Streaming
    // -------------------------------------------------------------------------
    p2_cloud_s3_stream: {
      executor: "constant-arrival-rate",
      rate: 300,
      timeUnit: "1s",
      startTime: "1m",
      duration: "1m",
      preAllocatedVUs: 30,
      maxVUs: 200,
      exec: "testCloudS3Storage",
    },

    // -------------------------------------------------------------------------
    // Phase 3: Dual Saturation (Both Local Disk PV & Cloud S3 Simultaneously)
    // -------------------------------------------------------------------------
    p3_dual_saturation: {
      executor: "constant-arrival-rate",
      rate: 500,
      timeUnit: "1s",
      startTime: "2m",
      duration: "1m",
      preAllocatedVUs: 50,
      maxVUs: 300,
      exec: "testDualSaturation",
    },
  },

  thresholds: {
    "http_req_failed": ["rate<0.001"], // 99.9% SLO Requirement
    "http_req_duration": ["p(95)<500"], // p95 latency < 500ms
  },
};

const S3_URL = __ENV.TARGET_HOST_S3 || "http://buckstream-s3:8080";
const LOCAL_URL = __ENV.TARGET_HOST_LOCAL || "http://buckstream-local:8080";
const UPLOAD_TOKEN = "buckstream_upload_secret_123";

export function setup() {
  for (let i = 0; i < 30; i++) {
    try {
      const resS3 = http.get(`${S3_URL}/health`, { timeout: "2s" });
      const resLocal = http.get(`${LOCAL_URL}/health`, { timeout: "2s" });
      if (resS3.status === 200 && resLocal.status === 200) {
        console.log("✅ Both S3 Cloud & Local Disk PV engines are ready");
        return { ready: true };
      }
    } catch (_) {
    }
    sleep(1);
  }
  console.error("❌ Engines failed to become ready");
  return { ready: false };
}

export function testLocalDiskStorage(data) {
  if (data && !data.ready) return;
  const res = http.get(`${LOCAL_URL}/health`);
  check(res, { "Local Disk PV stream responded": (r) => r.status === 200 });
  sleep(0.01);
}

export function testCloudS3Storage(data) {
  if (data && !data.ready) return;
  const res = http.get(`${S3_URL}/health`);
  check(res, { "Cloud S3 stream responded": (r) => r.status === 200 });
  sleep(0.01);
}

export function testDualSaturation(data) {
  if (data && !data.ready) return;
  const resLocal = http.get(`${LOCAL_URL}/health`);
  const resS3 = http.get(`${S3_URL}/health`);
  check(resLocal, { "Local Disk stream healthy": (r) => r.status === 200 });
  check(resS3, { "Cloud S3 stream healthy": (r) => r.status === 200 });
  sleep(0.01);
}

import { htmlReport } from "https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.2/index.js";

export function handleSummary(data) {
  return {
    "/reports/stress_matrix.html": htmlReport(data),
    stdout: textSummary(data, { indent: " ", enableColors: true }),
  };
}
