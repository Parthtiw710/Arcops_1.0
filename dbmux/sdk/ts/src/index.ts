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
  /** Optional ConnectRPC Transport for browser frontend (e.g. @connectrpc/connect-web) */
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
  public capabilitiesMask: number = 0;

  // Dedicated Engine Sub-Clients
  public postgres: PostgresSubClient;
  public mysql: MySQLSubClient;
  public sqlite: SQLiteSubClient;
  public redis: RedisSubClient;
  public mongo: MongoSubClient;
  public vector: VectorSubClient;
  public pubsub: PubSubSubClient;
  public queue: QueueSubClient;
  public state: StateSubClient;
  public cron: CronSubClient;
  public secret: SecretSubClient;

  constructor(options: DBMuxClientOptions = {}) {
    this.baseUrl = (options.baseUrl || "http://localhost:8080").replace(/\/$/, "");
    this.serviceKey = options.serviceKey;
    this.anonKey = options.anonKey;
    this.authToken = options.authToken;

    this.postgres = new PostgresSubClient(this);
    this.mysql = new MySQLSubClient(this);
    this.sqlite = new SQLiteSubClient(this);
    this.redis = new RedisSubClient(this);
    this.mongo = new MongoSubClient(this);
    this.vector = new VectorSubClient(this);
    this.pubsub = new PubSubSubClient(this);
    this.queue = new QueueSubClient(this);
    this.state = new StateSubClient(this);
    this.cron = new CronSubClient(this);
    this.secret = new SecretSubClient(this);
  }

  public async init(): Promise<number> {
    await this.doRequest("/dbmux.v1.Registry/ListProviders", {});
    return this.capabilitiesMask;
  }

  public hasCapability(capBit: number): boolean {
    return this.capabilitiesMask === 0 || (this.capabilitiesMask & capBit) !== 0;
  }

  public async doRequest(path: string, payload: Record<string, any>): Promise<any> {
    if (this.transport && typeof this.transport.unary === "function") {
      // ConnectRPC Transport execution for Connect-Web in browsers
      const res = await this.transport.unary(path, payload);
      return res.message;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Connect-Protocol-Version": "1",
    };
    if (this.serviceKey) headers["X-Service-Role-Key"] = this.serviceKey;
    if (this.anonKey) headers["X-Anon-Key"] = this.anonKey;
    if (this.authToken) headers["Authorization"] = `Bearer ${this.authToken}`;

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    // Header-piggybacked capability bitmask sync
    const capHeader = response.headers.get("X-DBMux-Capabilities");
    if (capHeader) {
      const parsed = parseInt(capHeader, 10);
      if (!isNaN(parsed)) {
        this.capabilitiesMask = parsed;
      }
    }

    if (!response.ok) {
      const text = await response.text();
      throw new DBMuxError(`RPC ${path} failed (${response.status}): ${text}`);
    }

    return await response.json();
  }
}

// --- Sub-Clients ---

export class PostgresSubClient {
  private client: DBMuxClient;
  constructor(client: DBMuxClient) { this.client = client; }
  async query(providerId: string, query: string, params: string[] = []) {
    if (!this.client.hasCapability(CAP_POSTGRES)) {
      throw new DBMuxError("PostgreSQL provider is not configured on server");
    }
    return this.client.doRequest("/dbmux.v1.Postgres/Query", { provider_id: providerId, query, params });
  }
  async exec(providerId: string, query: string, params: string[] = []) {
    if (!this.client.hasCapability(CAP_POSTGRES)) {
      throw new DBMuxError("PostgreSQL provider is not configured on server");
    }
    return this.client.doRequest("/dbmux.v1.Postgres/Exec", { provider_id: providerId, query, params });
  }
}

export class MySQLSubClient {
  private client: DBMuxClient;
  constructor(client: DBMuxClient) { this.client = client; }
  async query(providerId: string, query: string, params: string[] = []) {
    if (!this.client.hasCapability(CAP_MYSQL)) {
      throw new DBMuxError("MySQL provider is not configured on server");
    }
    return this.client.doRequest("/dbmux.v1.MySQL/Query", { provider_id: providerId, query, params });
  }
  async exec(providerId: string, query: string, params: string[] = []) {
    if (!this.client.hasCapability(CAP_MYSQL)) {
      throw new DBMuxError("MySQL provider is not configured on server");
    }
    return this.client.doRequest("/dbmux.v1.MySQL/Exec", { provider_id: providerId, query, params });
  }
}

export class SQLiteSubClient {
  private client: DBMuxClient;
  constructor(client: DBMuxClient) { this.client = client; }
  async query(providerId: string, query: string, params: string[] = []) {
    if (!this.client.hasCapability(CAP_SQLITE)) {
      throw new DBMuxError("SQLite provider is not configured on server");
    }
    return this.client.doRequest("/dbmux.v1.SQLite/Query", { provider_id: providerId, query, params });
  }
  async exec(providerId: string, query: string, params: string[] = []) {
    if (!this.client.hasCapability(CAP_SQLITE)) {
      throw new DBMuxError("SQLite provider is not configured on server");
    }
    return this.client.doRequest("/dbmux.v1.SQLite/Exec", { provider_id: providerId, query, params });
  }
}

export class RedisSubClient {
  private client: DBMuxClient;
  constructor(client: DBMuxClient) { this.client = client; }
  async get(key: string, providerId: string = "redis") {
    if (!this.client.hasCapability(CAP_REDIS)) {
      throw new DBMuxError("Redis provider is not configured on server");
    }
    return this.client.doRequest("/dbmux.v1.KV/Get", { provider_id: providerId, key });
  }
  async set(key: string, value: string, ttlSeconds: number = 0, providerId: string = "redis") {
    if (!this.client.hasCapability(CAP_REDIS)) {
      throw new DBMuxError("Redis provider is not configured on server");
    }
    return this.client.doRequest("/dbmux.v1.KV/Set", { provider_id: providerId, key, value, ttl_seconds: ttlSeconds });
  }
  async del(key: string, providerId: string = "redis") {
    if (!this.client.hasCapability(CAP_REDIS)) {
      throw new DBMuxError("Redis provider is not configured on server");
    }
    return this.client.doRequest("/dbmux.v1.KV/Del", { provider_id: providerId, key });
  }
  async exists(key: string, providerId: string = "redis") {
    if (!this.client.hasCapability(CAP_REDIS)) {
      throw new DBMuxError("Redis provider is not configured on server");
    }
    return this.client.doRequest("/dbmux.v1.KV/Exists", { provider_id: providerId, key });
  }
  async expire(key: string, ttlSeconds: number, providerId: string = "redis") {
    if (!this.client.hasCapability(CAP_REDIS)) {
      throw new DBMuxError("Redis provider is not configured on server");
    }
    return this.client.doRequest("/dbmux.v1.KV/Expire", { provider_id: providerId, key, ttl_seconds: ttlSeconds });
  }
  async incr(key: string, delta: number = 1, providerId: string = "redis") {
    if (!this.client.hasCapability(CAP_REDIS)) {
      throw new DBMuxError("Redis provider is not configured on server");
    }
    return this.client.doRequest("/dbmux.v1.KV/Incr", { provider_id: providerId, key, delta });
  }
}

export class MongoSubClient {
  private client: DBMuxClient;
  constructor(client: DBMuxClient) { this.client = client; }
  async find(dbName: string, collection: string, filterJson: string, limit: number = 100, providerId: string = "mongo") {
    if (!this.client.hasCapability(CAP_MONGO)) {
      throw new DBMuxError("MongoDB provider is not configured on server");
    }
    return this.client.doRequest("/dbmux.v1.Mongo/DocFind", { provider_id: providerId, database: dbName, collection, filter_json: filterJson, limit });
  }
  async insert(dbName: string, collection: string, documentJson: string, providerId: string = "mongo") {
    if (!this.client.hasCapability(CAP_MONGO)) {
      throw new DBMuxError("MongoDB provider is not configured on server");
    }
    return this.client.doRequest("/dbmux.v1.Mongo/Insert", { provider_id: providerId, database: dbName, collection, document_json: documentJson });
  }
  async update(dbName: string, collection: string, filterJson: string, updateJson: string, providerId: string = "mongo") {
    if (!this.client.hasCapability(CAP_MONGO)) {
      throw new DBMuxError("MongoDB provider is not configured on server");
    }
    return this.client.doRequest("/dbmux.v1.Mongo/Update", { provider_id: providerId, db_name: dbName, collection, filter_json: filterJson, update_json: updateJson });
  }
  async delete(dbName: string, collection: string, filterJson: string, providerId: string = "mongo") {
    if (!this.client.hasCapability(CAP_MONGO)) {
      throw new DBMuxError("MongoDB provider is not configured on server");
    }
    return this.client.doRequest("/dbmux.v1.Mongo/Delete", { provider_id: providerId, db_name: dbName, collection, filter_json: filterJson });
  }
  async count(dbName: string, collection: string, filterJson: string, providerId: string = "mongo") {
    if (!this.client.hasCapability(CAP_MONGO)) {
      throw new DBMuxError("MongoDB provider is not configured on server");
    }
    return this.client.doRequest("/dbmux.v1.Mongo/Count", { provider_id: providerId, db_name: dbName, collection, filter_json: filterJson });
  }
}

export class VectorSubClient {
  private client: DBMuxClient;
  constructor(client: DBMuxClient) { this.client = client; }
  async search(collection: string, vector: number[], limit: number = 10, providerId: string = "qdrant") {
    if (!this.client.hasCapability(CAP_VECTOR)) {
      throw new DBMuxError("Vector provider is not configured on server");
    }
    return this.client.doRequest("/dbmux.v1.Vector/VectorSearch", { provider_id: providerId, collection_name: collection, vector, limit });
  }
}

export class PubSubSubClient {
  private client: DBMuxClient;
  constructor(client: DBMuxClient) { this.client = client; }
  async publish(topic: string, payload: string) {
    return this.client.doRequest("/dbmux.v1.PubSub/Publish", { topic, payload });
  }
}

export class QueueSubClient {
  private client: DBMuxClient;
  constructor(client: DBMuxClient) { this.client = client; }
  async enqueue(queueName: string, payload: string) {
    return this.client.doRequest("/dbmux.v1.Queue/Enqueue", { queue_name: queueName, payload });
  }
  async dequeue(queueName: string) {
    return this.client.doRequest("/dbmux.v1.Queue/Dequeue", { queue_name: queueName });
  }
  async size(queueName: string) {
    return this.client.doRequest("/dbmux.v1.Queue/Size", { queue_name: queueName });
  }
  async peek(queueName: string) {
    return this.client.doRequest("/dbmux.v1.Queue/Peek", { queue_name: queueName });
  }
  async purge(queueName: string) {
    return this.client.doRequest("/dbmux.v1.Queue/Purge", { queue_name: queueName });
  }
}

export class StateSubClient {
  private client: DBMuxClient;
  constructor(client: DBMuxClient) { this.client = client; }
  async saveState(key: string, valueJson: string, ttlSeconds: number = 3600) {
    return this.client.doRequest("/dbmux.v1.State/SaveState", { store_name: "default", key, value_json: valueJson, ttl_seconds: ttlSeconds });
  }
  async getState(key: string, storeName: string = "default") {
    return this.client.doRequest("/dbmux.v1.State/GetState", { store_name: storeName, key });
  }
  async deleteState(key: string, storeName: string = "default") {
    return this.client.doRequest("/dbmux.v1.State/DeleteState", { store_name: storeName, key });
  }
}

export class CronSubClient {
  private client: DBMuxClient;
  constructor(client: DBMuxClient) { this.client = client; }
  async register(cronId: string, schedule: string, payloadJson: string) {
    return this.client.doRequest("/dbmux.v1.Cron/RegisterCron", { cron_id: cronId, schedule, payload_json: payloadJson });
  }
  async trigger(cronId: string) {
    return this.client.doRequest("/dbmux.v1.Cron/TriggerCron", { cron_id: cronId });
  }
  async list() {
    return this.client.doRequest("/dbmux.v1.Cron/ListCrons", {});
  }
  async delete(cronId: string) {
    return this.client.doRequest("/dbmux.v1.Cron/DeleteCron", { cron_id: cronId });
  }
}

export class SecretSubClient {
  private client: DBMuxClient;
  constructor(client: DBMuxClient) { this.client = client; }
  async getSecret(storeName: string, secretKey: string) {
    return this.client.doRequest("/dbmux.v1.Secret/GetSecret", { store_name: storeName, secret_key: secretKey });
  }
  async getBulkSecrets(storeName: string) {
    return this.client.doRequest("/dbmux.v1.Secret/GetBulkSecrets", { store_name: storeName });
  }
  async setSecret(storeName: string, secretKey: string, secretValue: string) {
    return this.client.doRequest("/dbmux.v1.Secret/SetSecret", { store_name: storeName, secret_key: secretKey, secret_value: secretValue });
  }
  async deleteSecret(storeName: string, secretKey: string) {
    return this.client.doRequest("/dbmux.v1.Secret/DeleteSecret", { store_name: storeName, secret_key: secretKey });
  }
}
