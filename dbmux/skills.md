# 🤖 DBMux Skills & Deployment Guide

This document contains the complete `docker-compose.yml` deployment specification for DBMux, configuration guidelines for modifying database setups, and SDK installation instructions directly from GitHub across supported programming languages.

---

## 🐳 Docker Compose Configuration (`docker-compose.yml`)

Save the following content as `docker-compose.yml` in your project root:

```yaml
# =============================================================================
# DBMux Complete Multi-Database Development & Production Deployment
# Image: ghcr.io/parthtiw710/arcops-dbmux:latest
# Preserves exact CPU and Memory limits from test matrix
# =============================================================================

services:

  # ---------------------------------------------------------------------------
  # 1. PostgreSQL + pgvector (Single Container Postgres + Vector DB)
  # Image: pgvector/pgvector:pg16 or postgres:alpine
  # Limit: 1.50 CPU | 256MB RAM
  # Note: Setting PGVECTOR_ENABLED=true enables both Postgres and Vector DB in a single container! If using pgvector image then delete quadrant service otherwise use postgres-alphine image.
  # ---------------------------------------------------------------------------
  postgres:
    image: pgvector/pgvector:pg16
    container_name: dbmux-postgres
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_USER=testuser
      - POSTGRES_PASSWORD=testpass
      - POSTGRES_DB=testdb
    command: postgres -c max_connections=40 -c shared_buffers=64MB -c work_mem=4MB
    volumes:
      - dbmux_postgres_data:/var/lib/postgresql/data
    deploy:
      resources:
        limits:
          memory: 256M
          cpus: "1.50"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U testuser -d testdb"]
      interval: 3s
      timeout: 3s
      retries: 10
      start_period: 5s

  # ---------------------------------------------------------------------------
  # 2. MySQL 8.4 LTS
  # Limit: 0.75 CPU | 512MB RAM
  # ---------------------------------------------------------------------------
  mysql:
    image: mysql:8.4
    container_name: dbmux-mysql
    ports:
      - "3306:3306"
    environment:
      - MYSQL_ROOT_PASSWORD=testpass
      - MYSQL_DATABASE=testdb
      - MYSQL_USER=testuser
      - MYSQL_PASSWORD=testpass
    command: --max_connections=40 --innodb_buffer_pool_size=64M
    volumes:
      - dbmux_mysql_data:/var/lib/mysql
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: "0.75"
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "127.0.0.1", "-u", "root", "-ptestpass"]
      interval: 5s
      timeout: 5s
      retries: 30
      start_period: 30s

  # ---------------------------------------------------------------------------
  # 3. Redis / Valkey
  # Limit: 1.00 CPU | 128MB RAM
  # ---------------------------------------------------------------------------
  redis:
    image: valkey/valkey:latest
    container_name: dbmux-redis
    ports:
      - "6379:6379"
    command: valkey-server --maxmemory 16mb --maxmemory-policy allkeys-lru
    volumes:
      - dbmux_redis_data:/data
    deploy:
      resources:
        limits:
          memory: 128M
          cpus: "1.00"
    healthcheck:
      test: ["CMD", "valkey-cli", "ping"]
      interval: 3s
      timeout: 3s
      retries: 5
      start_period: 3s

  # ---------------------------------------------------------------------------
  # 4. MongoDB
  # Limit: 0.50 CPU | 512MB RAM
  # ---------------------------------------------------------------------------
  mongo:
    image: mongo:latest
    container_name: dbmux-mongo
    ports:
      - "27017:27017"
    volumes:
      - dbmux_mongo_data:/data/db
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: "0.50"
    healthcheck:
      test: ["CMD", "mongosh", "--quiet", "--eval", "db.runCommand({ping:1}).ok"]
      interval: 5s
      timeout: 5s
      retries: 30
      start_period: 20s

  # ---------------------------------------------------------------------------
  # 5. Qdrant Vector DB
  # Limit: 0.25 CPU | 128MB RAM
  # ---------------------------------------------------------------------------
  qdrant:
    image: qdrant/qdrant:latest
    container_name: dbmux-qdrant
    ports:
      - "6333:6333"
    volumes:
      - dbmux_qdrant_data:/qdrant/storage
    deploy:
      resources:
        limits:
          memory: 128M
          cpus: "0.25"

  # ---------------------------------------------------------------------------
  # 6. OpenTelemetry Jaeger Tracing Collector & UI
  # Limit: 0.25 CPU | 128MB RAM
  # ---------------------------------------------------------------------------
  jaeger-otel:
    image: jaegertracing/all-in-one:latest
    container_name: dbmux-jaeger-otel
    environment:
      - SPAN_STORAGE_TYPE=badger
      - BADGER_EPHEMERAL=false
      - BADGER_DIRECTORY_VALUE=/badger/data
      - BADGER_DIRECTORY_KEY=/badger/data
    volumes:
      - dbmux_jaeger_data:/badger/data
    ports:
      - "8082:16686" # Jaeger Web UI -> http://localhost:8082
      - "4317:4317"   # OTLP gRPC collector port
      - "4318:4318"   # OTLP HTTP collector port
    deploy:
      resources:
        limits:
          memory: 128M
          cpus: "0.25"
    healthcheck:
      test: ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:16686 || exit 1"]
      interval: 2s
      timeout: 3s
      retries: 10
      start_period: 3s

  # ---------------------------------------------------------------------------
  # 7. DBMux Gateway Server (Using GHCR image: ghcr.io/parthtiw710/arcops-dbmux:latest)
  # Limit: 2.00 CPU | 256MB RAM
  # ---------------------------------------------------------------------------
  dbmux:
    image: ghcr.io/parthtiw710/arcops-dbmux:latest
    build:
      context: .
      dockerfile: Dockerfile
    container_name: dbmux-gateway
    ports:
      - "8082:8082"
    environment:
      - DBMUX_ANON_KEY=dbmux_anon_public_key_demo123
      - DBMUX_SERVICE_ROLE_KEY=dbmux_service_role_secret_admin_key_demo123
      - DBMUX_JWT_SECRET=super_secret_jwt_key_change_me_in_production
      - SQLITE_DATA_DIR=/var/lib/dbmux/sqlite
      - POSTGRES_DSN=postgres://testuser:testpass@postgres:5432/testdb?sslmode=disable
      - MYSQL_DSN=testuser:testpass@tcp(mysql:3306)/testdb
      - REDIS_DSN=redis://redis:6379
      - MONGO_DSN=mongodb://mongo:27017
      - SQLITE_DSN=
      - PGVECTOR_ENABLED=true # Enable pgvector inside PostgreSQL (Single container for Postgres + Vector DB)
      - AUTH_PROVIDER=auto
      - OTEL_EXPORTER_OTLP_ENDPOINT=api.arcops.dev # Standard OTel OTLP collector host (Port 443) via Traefik
      - OTEL_EXPORTER_OTLP_COMPRESSION=gzip
      - OTEL_EXPORTER_OTLP_PROTOCOL=grpc
      - OTEL_SERVICE_NAME=dbmux-server
      - DISABLE_TELEMETRY=false # Set to true to disable background OpenTelemetry trace streaming
    volumes:
      - dbmux_sqlite_data:/var/lib/dbmux/sqlite
    deploy:
      resources:
        limits:
          memory: 256M
          cpus: "2.00"
    healthcheck:
      test: ["CMD", "/dbmux-server", "-healthcheck"]
      interval: 2s
      timeout: 2s
      retries: 5
      start_period: 2s
    depends_on:
      postgres:
        condition: service_healthy
      mysql:
        condition: service_healthy
      redis:
        condition: service_healthy
      mongo:
        condition: service_healthy
      jaeger-otel:
        condition: service_healthy

volumes:
  dbmux_sqlite_data:
  dbmux_postgres_data:
  dbmux_mysql_data:
  dbmux_redis_data:
  dbmux_mongo_data:
  dbmux_qdrant_data:
  dbmux_jaeger_data:
```

---

## ⚡ Single-Container PostgreSQL + Vector DB (`pgvector`)

By using `pgvector/pgvector:pg16` for PostgreSQL and setting `PGVECTOR_ENABLED=true` in `dbmux` environment variables, both **PostgreSQL** and **Vector DB** are hosted inside a **single container**:

```yaml
# Environment Variable in DBMux Service:
- PGVECTOR_ENABLED=true # Auto-initializes pgvector over PostgreSQL connection pool
```

### Key Advantages:
1. **0 MB Extra RAM Overhead**: Uses the existing PostgreSQL memory pool instead of requiring a separate 512MB-1GB standalone vector container.
2. **Unified Relational & Vector Search**: Perform native SQL vector similarity queries (`1 - (embedding <=> $1)`) alongside standard relational queries.
3. **Single Container Deployment**: Simplifies deployment and reduces server infrastructure costs.

---

## ⚠️ Database Modification & Resource Allocation Rules

> [!CAUTION]
> **CRITICAL WARNING ON RESOURCE LIMITS (`deploy.resources.limits`)**:
> **DO NOT** adjust, alter, or remove the CPU (`cpus`) and Memory (`memory`) limits defined under `deploy.resources.limits`. 
> Modifying these hardware limits can break container isolation, cause thread starvation, lead to Out-Of-Memory (OOM) kills, or degrade high-throughput ConnectRPC multiplexing performance.

### How to Remove an Unused Database:
If your deployment does **not** require a specific database (for example, if you don't need MongoDB or Qdrant):

1. **Delete only the service block** for that database from the `services` section in `docker-compose.yml`.
2. **Remove the corresponding environment variable** from the `dbmux` container (e.g., remove `MONGO_DSN` if removing MongoDB).
3. **Remove the dependency** from `depends_on` under the `dbmux` service.
4. **DO NOT modify resource limits** for remaining services.

---

## 📦 Direct GitHub SDK Installation Guide & Available Functions

### 💡 Complete SDK Method Reference (Sub-Clients)

All DBMux SDKs (Go, TypeScript, Python, Java) expose dedicated engine sub-clients on the main `DBMuxClient` instance. Below is the complete list of available sub-clients and their functions:

| Sub-Client | Method | Description |
| :--- | :--- | :--- |
| **`client.postgres`** | `.query(providerId, query, params)` | Execute raw or parameterized SELECT query on PostgreSQL |
| | `.exec(providerId, query, params)` | Execute INSERT/UPDATE/DELETE statement on PostgreSQL |
| **`client.mysql`** | `.query(providerId, query, params)` | Execute raw or parameterized SELECT query on MySQL |
| | `.exec(providerId, query, params)` | Execute INSERT/UPDATE/DELETE statement on MySQL |
| **`client.sqlite`** | `.query(providerId, query, params)` | Execute raw or parameterized SELECT query on SQLite |
| | `.exec(providerId, query, params)` | Execute INSERT/UPDATE/DELETE statement on SQLite |
| **`client.redis`** | `.get(key, providerId)` | Fetch a string value by key from Redis / Valkey |
| | `.set(key, value, ttlSeconds)` | Set string value with optional TTL expiry in Redis / Valkey |
| | `.del(key, providerId)` | Delete key from Redis / Valkey |
| | `.exists(key, providerId)` | Check if key exists in Redis / Valkey |
| | `.expire(key, ttlSeconds)` | Set TTL expiration on existing key |
| | `.incr(key, delta)` | Atomic integer increment or decrement |
| **`client.mongo`** | `.find(dbName, collection, filterJson, limit)` | Query MongoDB documents with JSON filter |
| | `.insert(dbName, collection, documentJson)` | Insert BSON/JSON document into MongoDB collection |
| | `.update(dbName, collection, filterJson, updateJson)` | Update MongoDB documents matching filter |
| | `.delete(dbName, collection, filterJson)` | Delete MongoDB documents matching filter |
| | `.count(dbName, collection, filterJson)` | Count MongoDB documents matching filter |
| **`client.vector`** | `.search(collection, vector, limit)` | Perform vector embedding similarity search on Qdrant |
| | `.insert(collection, pointId, vector, payload)` | Upsert vector point with payload into Qdrant |
| **`client.pubsub`** | `.publish(topic, payload)` | Publish message to Redis PubSub topic |
| | `.subscribe(topic, timeoutSeconds)` | Subscribe to live streamed PubSub events on a topic |
| **`client.queue`** | `.enqueue(queueName, payload)` | Enqueue task payload to queue (backed by Redis/Postgres) |
| | `.dequeue(queueName)` | Dequeue next task payload from queue |
| | `.size(queueName)` | Get total pending items count in queue |
| | `.peek(queueName)` | Read next task payload without dequeuing |
| | `.purge(queueName)` | Clear all pending items from queue |
| **`client.state`** | `.saveState(key, valueJson, ttlSeconds)` | Save application state key with TTL expiry |
| | `.getState(key, storeName)` | Retrieve saved state value by key |
| | `.deleteState(key, storeName)` | Delete state entry by key |
| **`client.cron`** | `.register(cronId, schedule, payload)` | Register a recurring distributed cron job |
| | `.trigger(cronId)` | Manually trigger a scheduled cron job |
| | `.list()` | List all active scheduled cron jobs |
| | `.delete(cronId)` | Remove a registered cron job |
| **`client.secret`** | `.getSecret(storeName, secretKey)` | Retrieve single secret from secret store |
| | `.getBulkSecrets(storeName)` | Retrieve all secrets from secret store |
| | `.setSecret(storeName, secretKey, secretValue)` | Store or update a secret in vault |
| | `.deleteSecret(storeName, secretKey)` | Delete a secret from vault |


#### 🔑 Core Client Methods & Capability Checking:
- **`client.init()`**: Connects to gateway and initializes the active database capability bitmask (`capabilitiesMask`).
- **`client.hasCapability(capBit)`**: Returns `true` if target provider (`CAP_POSTGRES`, `CAP_MYSQL`, `CAP_SQLITE`, `CAP_REDIS`, `CAP_MONGO`, `CAP_VECTOR`) is configured and healthy on the gateway.

---

Since SDK packages are hosted directly in the GitHub repository (`github.com/Parthtiw710/dbmux`), use the following commands to install them directly from GitHub for each language:

---

### 1. Go SDK (`sdk/go`)

#### Direct GitHub Installation:
```bash
go get github.com/Parthtiw710/dbmux/sdk/go
```

#### Usage Example:
```go
package main

import (
    "context"
    "fmt"
    "log"
    "github.com/Parthtiw710/dbmux/sdk/go"
)

func main() {
    ctx := context.Background()
    client, err := dbmux.NewClient(dbmux.Options{
        BaseURL: "http://localhost:8080",
        AnonKey: "dbmux_anon_public_key_demo123",
    })
    if err != nil {
        log.Fatalf("Failed to create client: %v", err)
    }

    // 1. SQL Query
    res, err := client.Postgres.Query(ctx, "postgres", "SELECT 1", nil)
    if err != nil {
        log.Fatalf("Query error: %v", err)
    }
    fmt.Println("Postgres Result:", string(res))

    // 2. Redis Key-Value Operations
    _, _ = client.Redis.Set(ctx, "redis", "user:100", "active", 3600)
    val, _ := client.Redis.Get(ctx, "redis", "user:100")
    fmt.Println("Redis Value:", string(val))

    // 3. PubSub & Message Queue
    _, _ = client.PubSub.Publish(ctx, "notifications", "Hello DBMux!")
    _, _ = client.Queue.Enqueue(ctx, "task_queue", `{"task": "send_email"}`)
}
```

---

### 2. TypeScript / Node.js SDK (`sdk/ts`)

#### Direct GitHub Installation:
```bash
npm install git+https://github.com/Parthtiw710/dbmux.git#main:sdk/ts
```

Or add directly to your project's `package.json`:
```json
"dependencies": {
  "@dbmux/sdk": "git+https://github.com/Parthtiw710/dbmux.git#main:sdk/ts"
}
```

#### Usage Example:
```typescript
import { DBMuxClient } from "@dbmux/sdk";

const client = new DBMuxClient({
  baseUrl: "http://localhost:8080",
  anonKey: "dbmux_anon_public_key_demo123"
});

async function run() {
  // 1. SQL Query
  const users = await client.postgres.query("postgres", "SELECT * FROM users LIMIT 10");
  console.log("Postgres Users:", users);

  // 2. Redis Key-Value
  await client.redis.set("session:abc", "active", 3600);
  const session = await client.redis.get("session:abc");
  console.log("Session:", session);

  // 3. PubSub & Queue
  await client.pubsub.publish("events", "User logged in");
  await client.queue.enqueue("jobs", JSON.stringify({ action: "export_pdf" }));
}

run();
```

---

### 3. Python SDK (`sdk/python`)

#### Direct GitHub Installation:
```bash
pip install git+https://github.com/Parthtiw710/dbmux.git#subdirectory=sdk/python
```

Or add to your `requirements.txt`:
```text
git+https://github.com/Parthtiw710/dbmux.git#subdirectory=sdk/python
```

#### Usage Example:
```python
from dbmux import DBMuxClient

client = DBMuxClient(
    base_url="http://localhost:8080",
    anon_key="dbmux_anon_public_key_demo123"
)

# 1. SQL Query
response = client.postgres.query(provider_id="postgres", query="SELECT 1")
print("Postgres Response:", response)

# 2. Redis Key-Value
client.redis.set(key="user:100", value="active", ttl_seconds=3600)
value = client.redis.get(key="user:100")
print("Redis Value:", value)

# 3. PubSub & Queue
client.pubsub.publish(topic="alerts", payload="System check OK")
client.queue.enqueue(queue_name="tasks", payload='{"action": "sync"}')
```

---

### 4. Java SDK (`sdk/java`)

#### Direct GitHub Installation via JitPack:

Add the JitPack repository and dependency to your build configuration:

##### Gradle (`build.gradle`):
```groovy
repositories {
    mavenCentral()
    maven { url 'https://jitpack.io' }
}

dependencies {
    implementation 'com.github.Parthtiw710.dbmux:sdk-java:main'
}
```

##### Maven (`pom.xml`):
```xml
<repositories>
    <repository>
        <id>jitpack.io</id>
        <url>https://jitpack.io</url>
    </repository>
</repositories>

<dependency>
    <groupId>com.github.Parthtiw710.dbmux</groupId>
    <artifactId>sdk-java</artifactId>
    <version>main-SNAPSHOT</version>
</dependency>
```

##### Alternative — Build Locally from GitHub:
```bash
git clone https://github.com/Parthtiw710/dbmux.git
cd dbmux/sdk/java
./gradlew publishToMavenLocal
```

#### Usage Example:
```java
import com.dbmux.sdk.DBMuxClient;

public class Main {
    public static void main(String[] args) throws Exception {
        DBMuxClient client = new DBMuxClient("http://localhost:8080", null, "dbmux_anon_public_key_demo123", null);

        // 1. SQL Query
        String pgResult = client.postgres.query("postgres", "SELECT 1");
        System.out.println("Postgres Result: " + pgResult);

        // 2. Redis Key-Value & PubSub
        client.redis.get("my_key");
        client.pubsub.publish("notifications", "Event triggered");
    }
}
```

