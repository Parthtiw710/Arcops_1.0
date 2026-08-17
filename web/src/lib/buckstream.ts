/**
 * BuckStream SDK Client
 * Uses the official `buckstream-client` npm package.
 *
 * The Gateway proxies /api/storage/* → BuckStream /api/*
 * So SDK brokerUrl = http://localhost:8000/api/storage
 * Which maps: SDK calls /api/list → gateway /api/storage/api/list → buckstream /api/list ✓
 *
 * Multi-tenancy: The user's ArcAuth JWT is forwarded as the Authorization Bearer token.
 * The BuckStream backend extracts the tenant_id from it and prefixes every S3 key with
 * uploads/<tenant_id>/ so files are strictly isolated per user.
 */
import { BuckStreamClient } from "buckstream-client";
import { GATEWAY_URL } from "../config";

// Gateway proxies /api/storage/* → buckstream internal /api/*
const BROKER_URL = `${GATEWAY_URL}/api/storage`;

/** Returns the current user's JWT from localStorage (updated on every call) */
export function getAuthToken(): string {
  const raw =
    localStorage.getItem("arcauth_token") ||
    localStorage.getItem("authx_token") ||
    "";
  return raw.replace(/^Bearer\s+/i, "").trim();
}

/**
 * Returns a BuckStreamClient authenticated with the current user's JWT.
 * Call this per-request (not once at module load) so the token is always fresh.
 */
export function getBuckStreamClient(): BuckStreamClient {
  return new BuckStreamClient(BROKER_URL, getAuthToken());
}

// Convenience singleton — only use for health checks where auth is not required
export const buckstream = new BuckStreamClient(BROKER_URL, "");

// Typed result interfaces
export interface StorageObject {
  key: string;
  size: number;
  lastModified: string;
  contentType?: string;
}

export interface StorageBucket {
  name: string;
  createdAt: string;
  objectsCount: number;
}
