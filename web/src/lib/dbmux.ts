/**
 * DBMux Client - Uses official DBMux TypeScript SDK & ConnectRPC Web Transport (@connectrpc/connect-web)
 */

import { DBMuxClient } from "./dbmux-sdk";
import { createConnectTransport } from "@connectrpc/connect-web";
import { GATEWAY_URL } from "../config";

// ConnectRPC Web Transport for browser environment with dynamic Authorization header interceptor
const connectTransport = createConnectTransport({
  baseUrl: `${GATEWAY_URL}/rpc`,
  interceptors: [
    (next) => async (req) => {
      const token = localStorage.getItem("arcauth_token") || localStorage.getItem("authx_token");
      if (token && !req.header.has("Authorization")) {
        req.header.set("Authorization", `Bearer ${token}`);
      }
      return await next(req);
    },
  ],
});

// Official DBMux Client instance configured with ConnectRPC Web transport
export const sdk = new DBMuxClient({
  baseUrl: `${GATEWAY_URL}/rpc`,
  transport: connectTransport,
});

export interface DbTableInfo {
  name: string;
  columns: number;
  rows: number;
  size: string;
  realtime: boolean;
}

export interface TableColumnSchema {
  name: string;
  type: string;
  nullable: boolean;
  isPrimary: boolean;
}

function splitSqlStatements(sql: string): string[] {
  // Remove block comments and line comments
  const cleanSql = sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "");

  const rawParts = cleanSql.split(";");
  const result: string[] = [];

  let current = "";
  for (const part of rawParts) {
    current += (current ? ";" : "") + part;
    const singleQuotes = (current.match(/'/g) || []).length;
    // Ensure we don't split semicolons inside single-quoted string literals
    if (singleQuotes % 2 === 0 && current.trim().length > 0) {
      // Strip leading/trailing semicolons and whitespace from individual statement
      const trimmed = current.trim().replace(/^;+/, "").replace(/;+$/, "").trim();
      if (trimmed) result.push(trimmed);
      current = "";
    }
  }

  if (current.trim().length > 0) {
    const trimmed = current.trim().replace(/^;+/, "").replace(/;+$/, "").trim();
    if (trimmed) result.push(trimmed);
  }

  return result;
}

function getTenantId(): string | null {
  try {
    const rawUser = localStorage.getItem("arcauth_user") || localStorage.getItem("authx_user");
    if (rawUser) {
      const u = JSON.parse(rawUser);
      if (u.team_id || u.teamId || u.id) return u.team_id || u.teamId || u.id;
    }
    const token = localStorage.getItem("arcauth_token") || localStorage.getItem("authx_token");
    if (token) {
      const parts = token.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
        return payload.tenant_id || payload.sub || null;
      }
    }
  } catch {}
  return null;
}

export class DBMuxWrapper {
  private client: DBMuxClient;

  constructor(client = sdk) {
    this.client = client;
  }

  // Check DBMux Health via Gateway
  async checkHealth(): Promise<{ status: string }> {
    try {
      const res = await fetch(`${GATEWAY_URL}/rpc/healthz`, { credentials: "include" });
      if (res.ok) return { status: "online" };
    } catch {}
    return { status: "offline" };
  }

  // Execute Raw SQL Query via official SDK postgres sub-client (handles multi-command semicolon splits)
  async executeSQL(sql: string, providerId?: string): Promise<{ columns: string[]; rows: any[][]; rowCount: number }> {
    const activeProvider = providerId || getTenantId() || "";
    if (!activeProvider) {
      return { columns: [], rows: [], rowCount: 0 };
    }
    const statements = splitSqlStatements(sql);

    if (statements.length === 0) {
      return { columns: [], rows: [], rowCount: 0 };
    }

    let lastResult = { columns: [] as string[], rows: [] as any[][], rowCount: 0 };
    for (const stmt of statements) {
      const res = await this.client.postgres.query(activeProvider, stmt);
      const cols: string[] = res.columns || [];
      const rawRows: any[] = res.rows || [];
      const rows = rawRows.map((r: any) => cols.map((c) => r.values?.[c] ?? r[c] ?? ""));
      lastResult = { columns: cols, rows, rowCount: Number(res.rows_returned) || rows.length };
    }
    return lastResult;
  }

  // Fetch List of Database Tables for logged in user's tenant DB
  async getTables(): Promise<DbTableInfo[]> {
    const tenantId = getTenantId();
    if (!tenantId) return [];

    const sql = `
      SELECT 
        t.table_name AS name,
        COUNT(c.column_name)::int AS columns,
        COALESCE(s.n_live_tup, 0)::int AS rows,
        pg_size_pretty(COALESCE(pg_total_relation_size(c2.oid), 0)) AS size
      FROM information_schema.tables t
      LEFT JOIN information_schema.columns c ON t.table_name = c.table_name AND t.table_schema = c.table_schema
      LEFT JOIN pg_stat_user_tables s ON s.relname = t.table_name
      LEFT JOIN pg_class c2 ON c2.relname = t.table_name
      WHERE t.table_schema = 'public'
      GROUP BY t.table_name, s.n_live_tup, c2.oid;
    `;
    const res = await this.executeSQL(sql, tenantId);
    if (res.rows && res.rows.length > 0) {
      return res.rows.map((r) => ({
        name: String(r[0]),
        columns: Number(r[1]) || 0,
        rows: Number(r[2]) || 0,
        size: String(r[3] || "16 kB"),
        realtime: true,
      }));
    }
    return [];
  }

  // Fetch Full Schema Tables & Columns for Visualizer
  async getSchemaTables(): Promise<any[]> {
    const tenantId = getTenantId();
    if (!tenantId) return [];

    const sql = `
      SELECT 
        t.table_name,
        c.column_name,
        c.data_type,
        (SELECT COUNT(*) > 0 FROM information_schema.table_constraints tc 
         JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
         WHERE tc.constraint_type = 'PRIMARY KEY' AND ccu.table_name = t.table_name AND ccu.column_name = c.column_name) AS is_pk
      FROM information_schema.tables t
      JOIN information_schema.columns c ON t.table_name = c.table_name AND t.table_schema = c.table_schema
      WHERE t.table_schema = 'public'
      ORDER BY t.table_name, c.ordinal_position;
    `;
    const res = await this.executeSQL(sql, tenantId);
    if (res.rows && res.rows.length > 0) {
      const tableMap: Record<string, any> = {};
      res.rows.forEach((r) => {
        const tableName = String(r[0]);
        const colName = String(r[1]);
        const dataType = String(r[2]);
        const isPk = Boolean(r[3]);

        if (!tableMap[tableName]) {
          tableMap[tableName] = { id: tableName, name: tableName, columns: [] };
        }
        tableMap[tableName].columns.push({
          name: colName,
          type: dataType,
          isPk: isPk,
        });
      });
      return Object.values(tableMap);
    }
    return [];
  }


  // Fetch Telemetry Graph Metrics
  async getTelemetryMetrics(): Promise<{ throughput: any[]; latency: any[]; leases: any[] }> {
    try {
      const sql = `SELECT DISTINCT ON (metric_name, time_label) metric_name, time_label, metric_value FROM telemetry_metrics ORDER BY metric_name, time_label, id ASC;`;
      const res = await this.executeSQL(sql);
      if (res && res.rows && res.rows.length > 0) {
        const throughput: any[] = [];
        const latency: any[] = [];
        const leases: any[] = [];

        res.rows.forEach((r) => {
          const metricName = String(r[0]);
          const label = String(r[1]);
          const val = Number(r[2]);

          if (metricName === "throughput") throughput.push({ time: label, reqs: val });
          if (metricName === "latency") latency.push({ time: label, ms: val });
          if (metricName === "leases") leases.push({ db: label, active: val });
        });

        if (throughput.length > 0) {
          return { throughput, latency, leases };
        }
      }
    } catch {}

    return { throughput: [], latency: [], leases: [] };
  }

  // Fetch Backend Provider Configuration via DBMux ConnectRPC
  async getBackendConfig(providerId: string): Promise<any> {
    try {
      const res = await this.client.doRequest("/dbmux.v1.Registry/ListProviders", {});
      const providers = res?.providers || [];
      const found = providers.find((p: any) => p.id === providerId || p.category?.toLowerCase()?.includes(providerId));
      return found || { id: providerId, category: providerId, status: "active", endpoint: `grpc://${providerId}.internal:8000` };
    } catch {
      return { id: providerId, category: providerId, status: "active", endpoint: `grpc://${providerId}.internal:8000` };
    }
  }
}

export const dbmux = new DBMuxWrapper();
