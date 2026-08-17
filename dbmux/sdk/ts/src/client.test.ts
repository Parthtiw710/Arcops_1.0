import { DBMuxClient, DBMuxError } from "./index";
import assert from "node:assert";
import test from "node:test";

test("TypeScript/JS SDK Capability Bitmask Guard", async () => {
  const client = new DBMuxClient({ baseUrl: "http://localhost:8080" });
  client.capabilitiesMask = 1; // Postgres=1, Redis=0

  await assert.rejects(
    async () => {
      await client.pubsub.publish("orders", "payload");
    },
    (err: any) => {
      return err instanceof DBMuxError && err.message.includes("Redis provider is not configured");
    }
  );
});
