/**
 * Polyglot DBMux TypeScript SDK
 * Supports ConnectRPC Web Transport for Browser Frontend (@connectrpc/connect-web)
 */

export const CAP_POSTGRES = 1 << 0; // 1
export const CAP_MYSQL    = 1 << 1; // 2
export const CAP_SQLITE   = 1 << 2; // 4
export const CAP_REDIS    = 1 << 3; // 8
export const CAP_MONGO    = 1 << 4; // 16
export const CAP_VECTOR   = 1 << 5; // 32

export interface DBMuxClientOptions {
  baseUrl?: string;
  serviceKey?: string;
  anonKey?: string;
  authToken?: string;
  /** ConnectRPC Transport for browser frontend (@connectrpc/connect-web) */
  transport?: any;
}

export class DBMuxError extends Error {
  constructor(message: string) {
    super(`[DBMux SDK Error] ${message}`);
    this.name = "DBMuxError";
  }
}

export class DBMuxClient {
  private baseUrl: string;
  private serviceKey?: string;
  private anonKey?: string;
  private authToken?: string;
  private transport?: any;
  public capabilitiesMask: number = 0;

  // Dedicated Engine Sub-Clients
  public postgres: PostgresSubClient;
  public mysql: MySQLSubClient;
  public sqlite: SQLiteSubClient;
  public redis: RedisSubClient;
  public mongo: MongoSubClient;
  public vector: VectorSubClient;

  constructor(options: DBMuxClientOptions = {}) {
    this.baseUrl = (options.baseUrl || "http://localhost:8000/rpc").replace(/\/$/, "");
    this.serviceKey = options.serviceKey;
    this.anonKey = options.anonKey;
    this.authToken = options.authToken;
    this.transport = options.transport;

    this.postgres = new PostgresSubClient(this);
    this.mysql = new MySQLSubClient(this);
    this.sqlite = new SQLiteSubClient(this);
    this.redis = new RedisSubClient(this);
    this.mongo = new MongoSubClient(this);
    this.vector = new VectorSubClient(this);
  }

  public async init(): Promise<number> {
    await this.doRequest("/dbmux.v1.Registry/ListProviders", {});
    return this.capabilitiesMask;
  }

  public hasCapability(capBit: number): boolean {
    return this.capabilitiesMask === 0 || (this.capabilitiesMask & capBit) !== 0;
  }

  public async doRequest(path: string, payload: Record<string, any>): Promise<any> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Connect-Protocol-Version": "1",
    };
    if (this.serviceKey) headers["X-Service-Role-Key"] = this.serviceKey;
    if (this.anonKey) headers["X-Anon-Key"] = this.anonKey;

    // Always read JWT dynamically from localStorage (user may have logged in after SDK init)
    const rawToken =
      (typeof localStorage !== "undefined" &&
        (localStorage.getItem("arcauth_token") || localStorage.getItem("authx_token"))) ||
      this.authToken || "";
    const cleanToken = rawToken.replace(/^Bearer\s+/i, "").trim();
    if (cleanToken) headers["Authorization"] = `Bearer ${cleanToken}`;

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new DBMuxError(`RPC ${path} failed (${response.status}): ${text}`);
    }

    return await response.json();
  }
}

export class PostgresSubClient {
  private client: DBMuxClient;
  constructor(client: DBMuxClient) { this.client = client; }
  async query(providerId: string, query: string, params: string[] = []) {
    return this.client.doRequest("/dbmux.v1.Postgres/Query", { provider_id: providerId, query, params });
  }
}

export class MySQLSubClient {
  private client: DBMuxClient;
  constructor(client: DBMuxClient) { this.client = client; }
  async query(providerId: string, query: string, params: string[] = []) {
    return this.client.doRequest("/dbmux.v1.MySQL/Query", { provider_id: providerId, query, params });
  }
}

export class SQLiteSubClient {
  private client: DBMuxClient;
  constructor(client: DBMuxClient) { this.client = client; }
  async query(providerId: string, query: string, params: string[] = []) {
    return this.client.doRequest("/dbmux.v1.SQLite/Query", { provider_id: providerId, query, params });
  }
}

export class RedisSubClient {
  private client: DBMuxClient;
  constructor(client: DBMuxClient) { this.client = client; }
  async get(key: string) {
    return this.client.doRequest("/dbmux.v1.KV/Get", { key });
  }
}

export class MongoSubClient {
  private client: DBMuxClient;
  constructor(client: DBMuxClient) { this.client = client; }
  async find(dbName: string, collection: string, filterJson: string, limit: number = 100) {
    return this.client.doRequest("/dbmux.v1.Mongo/DocFind", { db_name: dbName, collection, filter_json: filterJson, limit });
  }
}

export class VectorSubClient {
  private client: DBMuxClient;
  constructor(client: DBMuxClient) { this.client = client; }
  async search(collection: string, vector: number[], limit: number = 10) {
    return this.client.doRequest("/dbmux.v1.Vector/VectorSearch", { collection, vector, limit });
  }
}
