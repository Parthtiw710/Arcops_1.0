package com.dbmux.sdk;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * High-performance, zero-dependency Java 11+ DBMux SDK client with capability bitmask discovery.
 */
public class DBMuxClient {

    public static final int CAP_POSTGRES = 1 << 0; // 1
    public static final int CAP_MYSQL    = 1 << 1; // 2
    public static final int CAP_SQLITE   = 1 << 2; // 4
    public static final int CAP_REDIS    = 1 << 3; // 8
    public static final int CAP_MONGO    = 1 << 4; // 16
    public static final int CAP_VECTOR   = 1 << 5; // 32

    private final String baseUrl;
    private final String serviceKey;
    private final String anonKey;
    private final String authToken;
    private final HttpClient httpClient;
    private final AtomicInteger capabilitiesMask = new AtomicInteger(0);

    public final PostgresSubClient postgres;
    public final MySQLSubClient mysql;
    public final SQLiteSubClient sqlite;
    public final RedisSubClient redis;
    public final MongoSubClient mongo;
    public final VectorSubClient vector;
    public final PubSubSubClient pubsub;
    public final QueueSubClient queue;
    public final StateSubClient state;
    public final CronSubClient cron;
    public final SecretSubClient secret;

    public DBMuxClient(String baseUrl, String serviceKey) {
        this(baseUrl, serviceKey, null, null);
    }

    public DBMuxClient(String baseUrl, String serviceKey, String anonKey, String authToken) {
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.serviceKey = serviceKey;
        this.anonKey = anonKey;
        this.authToken = authToken;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();

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

    public int init() throws IOException, InterruptedException {
        doRequest("/dbmux.v1.Registry/ListProviders", "{}");
        return capabilitiesMask.get();
    }

    public boolean hasCapability(int capBit) {
        int mask = capabilitiesMask.get();
        return mask == 0 || (mask & capBit) != 0;
    }

    public String doRequest(String path, String jsonBody) throws IOException, InterruptedException {
        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + path))
                .header("Content-Type", "application/json")
                .header("Connect-Protocol-Version", "1")
                .POST(HttpRequest.BodyPublishers.ofString(jsonBody));

        if (serviceKey != null && !serviceKey.isEmpty()) {
            builder.header("X-Service-Role-Key", serviceKey);
        }
        if (anonKey != null && !anonKey.isEmpty()) {
            builder.header("X-Anon-Key", anonKey);
        }
        if (authToken != null && !authToken.isEmpty()) {
            builder.header("Authorization", "Bearer " + authToken);
        }

        HttpResponse<String> resp = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());

        Optional<String> capHeader = resp.headers().firstValue("X-DBMux-Capabilities");
        if (capHeader.isPresent()) {
            try {
                capabilitiesMask.set(Integer.parseInt(capHeader.get()));
            } catch (NumberFormatException ignored) {}
        }

        if (resp.statusCode() != 200) {
            throw new DBMuxException("RPC " + path + " failed with HTTP " + resp.statusCode() + ": " + resp.body());
        }

        return resp.body();
    }

    public static class DBMuxException extends RuntimeException {
        public DBMuxException(String message) {
            super("[DBMux SDK Exception] " + message);
        }
    }

    // --- Sub-Clients ---

    public static class PostgresSubClient {
        private final DBMuxClient client;
        public PostgresSubClient(DBMuxClient client) { this.client = client; }
        public String query(String providerId, String query) throws IOException, InterruptedException {
            if (!client.hasCapability(CAP_POSTGRES)) {
                throw new DBMuxException("PostgreSQL provider is not configured on server");
            }
            return client.doRequest("/dbmux.v1.Postgres/Query",
                    String.format("{\"provider_id\":\"%s\",\"query\":\"%s\"}", providerId, query));
        }
    }

    public static class MySQLSubClient {
        private final DBMuxClient client;
        public MySQLSubClient(DBMuxClient client) { this.client = client; }
        public String query(String providerId, String query) throws IOException, InterruptedException {
            if (!client.hasCapability(CAP_MYSQL)) {
                throw new DBMuxException("MySQL provider is not configured on server");
            }
            return client.doRequest("/dbmux.v1.MySQL/Query",
                    String.format("{\"provider_id\":\"%s\",\"query\":\"%s\"}", providerId, query));
        }
    }

    public static class SQLiteSubClient {
        private final DBMuxClient client;
        public SQLiteSubClient(DBMuxClient client) { this.client = client; }
        public String query(String providerId, String query) throws IOException, InterruptedException {
            if (!client.hasCapability(CAP_SQLITE)) {
                throw new DBMuxException("SQLite provider is not configured on server");
            }
            return client.doRequest("/dbmux.v1.SQLite/Query",
                    String.format("{\"provider_id\":\"%s\",\"query\":\"%s\"}", providerId, query));
        }
    }

    public static class RedisSubClient {
        private final DBMuxClient client;
        public RedisSubClient(DBMuxClient client) { this.client = client; }
        public String get(String key) throws IOException, InterruptedException {
            if (!client.hasCapability(CAP_REDIS)) {
                throw new DBMuxException("Redis/Valkey provider is not configured on server");
            }
            return client.doRequest("/dbmux.v1.KV/Get", String.format("{\"key\":\"%s\"}", key));
        }
    }

    public static class MongoSubClient {
        private final DBMuxClient client;
        public MongoSubClient(DBMuxClient client) { this.client = client; }
        public String find(String dbName, String collection, String filterJson) throws IOException, InterruptedException {
            if (!client.hasCapability(CAP_MONGO)) {
                throw new DBMuxException("MongoDB provider is not configured on server");
            }
            return client.doRequest("/dbmux.v1.Mongo/DocFind",
                    String.format("{\"db_name\":\"%s\",\"collection\":\"%s\",\"filter_json\":\"%s\"}", dbName, collection, filterJson));
        }
    }

    public static class VectorSubClient {
        private final DBMuxClient client;
        public VectorSubClient(DBMuxClient client) { this.client = client; }
        public String search(String collection, float[] vector) throws IOException, InterruptedException {
            if (!client.hasCapability(CAP_VECTOR)) {
                throw new DBMuxException("Vector provider is not configured on server");
            }
            return client.doRequest("/dbmux.v1.Vector/VectorSearch",
                    String.format("{\"collection\":\"%s\",\"limit\":10}", collection));
        }
    }

    public static class PubSubSubClient {
        private final DBMuxClient client;
        public PubSubSubClient(DBMuxClient client) { this.client = client; }
        public String publish(String topic, String payload) throws IOException, InterruptedException {
            if (!client.hasCapability(CAP_REDIS)) {
                throw new DBMuxException("Redis/Valkey provider is not configured on server for PubSub");
            }
            return client.doRequest("/dbmux.v1.PubSub/Publish",
                    String.format("{\"topic\":\"%s\",\"payload\":\"%s\"}", topic, payload));
        }
    }

    public static class QueueSubClient {
        private final DBMuxClient client;
        public QueueSubClient(DBMuxClient client) { this.client = client; }
        public String enqueue(String queueName, String payload) throws IOException, InterruptedException {
            if (!client.hasCapability(CAP_REDIS) && !client.hasCapability(CAP_POSTGRES)) {
                throw new DBMuxException("Neither Redis nor Postgres provider is configured for Queue");
            }
            return client.doRequest("/dbmux.v1.Queue/Enqueue",
                    String.format("{\"queue_name\":\"%s\",\"payload\":\"%s\"}", queueName, payload));
        }
        public String dequeue(String queueName) throws IOException, InterruptedException {
            if (!client.hasCapability(CAP_REDIS) && !client.hasCapability(CAP_POSTGRES)) {
                throw new DBMuxException("Neither Redis nor Postgres provider is configured for Queue");
            }
            return client.doRequest("/dbmux.v1.Queue/Dequeue",
                    String.format("{\"queue_name\":\"%s\"}", queueName));
        }
    }

    public static class StateSubClient {
        private final DBMuxClient client;
        public StateSubClient(DBMuxClient client) { this.client = client; }
        public String saveState(String key, String valueJson) throws IOException, InterruptedException {
            return client.doRequest("/dbmux.v1.State/SaveState",
                    String.format("{\"store_name\":\"default\",\"key\":\"%s\",\"value_json\":\"%s\"}", key, valueJson));
        }
    }

    public static class CronSubClient {
        private final DBMuxClient client;
        public CronSubClient(DBMuxClient client) { this.client = client; }
        public String trigger(String cronId) throws IOException, InterruptedException {
            return client.doRequest("/dbmux.v1.Cron/TriggerCron",
                    String.format("{\"cron_id\":\"%s\"}", cronId));
        }
    }

    public static class SecretSubClient {
        private final DBMuxClient client;
        public SecretSubClient(DBMuxClient client) { this.client = client; }
        public String getSecret(String storeName, String secretKey) throws IOException, InterruptedException {
            return client.doRequest("/dbmux.v1.Secret/GetSecret",
                    String.format("{\"store_name\":\"%s\",\"secret_key\":\"%s\"}", storeName, secretKey));
        }
    }
}
