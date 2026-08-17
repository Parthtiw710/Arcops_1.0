# @dbmux/sdk (TypeScript / JavaScript SDK)

Polyglot DBMux TypeScript SDK with **ConnectRPC Web** support for browser frontend frameworks (React, Next.js, Vue, Svelte, Angular) and Node.js backend services.

---

## ⚡ Installation

```bash
npm install @dbmux/sdk @connectrpc/connect @connectrpc/connect-web
```

---

## 🌐 Usage in Frontend Frameworks (React, Next.js, Vue, Svelte)

Using Connect-Web (`@connectrpc/connect-web`):

```typescript
import { DBMuxClient } from "@dbmux/sdk";
import { createConnectTransport } from "@connectrpc/connect-web";

// Initialize ConnectRPC Web Transport for Browsers
const transport = createConnectTransport({
  baseUrl: "http://localhost:8080",
});

const client = new DBMuxClient({
  baseUrl: "http://localhost:8080",
  serviceKey: "your_service_role_key",
  transport: transport, // Uses @connectrpc/connect-web under the hood!
});

// Auto-discover capabilities & fail-fast locally if database is missing
await client.init();

// Use dedicated engine clients
await client.postgres.query("my-pg-db", "SELECT * FROM users");
await client.pubsub.publish("events", JSON.stringify({ action: "user_login" }));
await client.queue.enqueue("jobs", JSON.stringify({ task: "send_email" }));
```

---

## 🖥️ Usage in Node.js / Bun / Deno (Zero-Dependency Mode)

```typescript
import { DBMuxClient } from "@dbmux/sdk";

const client = new DBMuxClient({
  baseUrl: "http://localhost:8080",
  serviceKey: "admin_key",
});

await client.init();

const res = await client.postgres.query("prod-pg", "SELECT NOW()");
```

---

## 🛡️ Capability Bitmask & Header Sync

The SDK automatically receives `X-DBMux-Capabilities` response headers from the server to update its 6-bit binary mask in memory (`client.capabilitiesMask`).

If a database (e.g. Redis) is not configured on the server, `client.pubsub.publish()` immediately throws a local `DBMuxError` **without sending a network request**.
