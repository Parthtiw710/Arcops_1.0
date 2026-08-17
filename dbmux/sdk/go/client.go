package dbmux

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"sync/atomic"
	"time"
)

const (
	CapPostgres uint32 = 1 << 0 // 1
	CapMySQL    uint32 = 1 << 1 // 2
	CapSQLite   uint32 = 1 << 2 // 4
	CapRedis    uint32 = 1 << 3 // 8
	CapMongo    uint32 = 1 << 4 // 16
	CapVector   uint32 = 1 << 5 // 32
)

var (
	ErrPostgresNotConfigured = errors.New("[DBMux SDK] PostgreSQL provider is not configured on server")
	ErrMySQLNotConfigured    = errors.New("[DBMux SDK] MySQL provider is not configured on server")
	ErrSQLiteNotConfigured   = errors.New("[DBMux SDK] SQLite provider is not configured on server")
	ErrRedisNotConfigured    = errors.New("[DBMux SDK] Redis/Valkey provider is not configured on server")
	ErrMongoNotConfigured    = errors.New("[DBMux SDK] MongoDB provider is not configured on server")
	ErrVectorNotConfigured   = errors.New("[DBMux SDK] Vector provider is not configured on server")
	ErrQueueNotConfigured    = errors.New("[DBMux SDK] Neither Redis nor Postgres provider is configured for Queue")
)

type Options struct {
	BaseURL    string
	ServiceKey string
	AnonKey    string
	AuthToken  string
	HTTPClient *http.Client
}

type Client struct {
	opts             Options
	httpClient       *http.Client
	capabilitiesMask uint32

	// Dedicated Engine Sub-Clients
	Postgres *PostgresClient
	MySQL    *MySQLClient
	SQLite   *SQLiteClient
	Redis    *RedisClient
	Mongo    *MongoClient
	Vector   *VectorClient
	PubSub   *PubSubClient
	Queue    *QueueClient
	State    *StateClient
	Cron     *CronClient
	Secret   *SecretClient
}

func NewClient(opts Options) (*Client, error) {
	if opts.BaseURL == "" {
		opts.BaseURL = "http://localhost:8080"
	}
	hc := opts.HTTPClient
	if hc == nil {
		hc = &http.Client{Timeout: 30 * time.Second}
	}

	c := &Client{
		opts:       opts,
		httpClient: hc,
	}

	c.Postgres = &PostgresClient{c: c}
	c.MySQL = &MySQLClient{c: c}
	c.SQLite = &SQLiteClient{c: c}
	c.Redis = &RedisClient{c: c}
	c.Mongo = &MongoClient{c: c}
	c.Vector = &VectorClient{c: c}
	c.PubSub = &PubSubClient{c: c}
	c.Queue = &QueueClient{c: c}
	c.State = &StateClient{c: c}
	c.Cron = &CronClient{c: c}
	c.Secret = &SecretClient{c: c}

	return c, nil
}

// Init fetches the server's initial capabilities bitmask.
func (c *Client) Init(ctx context.Context) error {
	_, err := c.doRequest(ctx, "/dbmux.v1.Registry/ListProviders", map[string]any{})
	if err != nil {
		return fmt.Errorf("failed to discover server capabilities: %w", err)
	}
	return nil
}

func (c *Client) GetCapabilitiesMask() uint32 {
	return atomic.LoadUint32(&c.capabilitiesMask)
}

func (c *Client) HasCapability(capBit uint32) bool {
	mask := atomic.LoadUint32(&c.capabilitiesMask)
	return mask == 0 || (mask&capBit) != 0
}

func (c *Client) doRequest(ctx context.Context, path string, body map[string]any) ([]byte, error) {
	jsonBytes, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", c.opts.BaseURL+path, bytes.NewReader(jsonBytes))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Connect-Protocol-Version", "1")
	if c.opts.ServiceKey != "" {
		req.Header.Set("X-Service-Role-Key", c.opts.ServiceKey)
	}
	if c.opts.AnonKey != "" {
		req.Header.Set("X-Anon-Key", c.opts.AnonKey)
	}
	if c.opts.AuthToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.opts.AuthToken)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	// Sync capabilities bitmask from response header if present
	if capStr := resp.Header.Get("X-DBMux-Capabilities"); capStr != "" {
		if val, err := strconv.ParseUint(capStr, 10, 32); err == nil {
			atomic.StoreUint32(&c.capabilitiesMask, uint32(val))
		}
	}

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("RPC failed with HTTP %d: %s", resp.StatusCode, string(respBytes))
	}

	return respBytes, nil
}

// --- Dedicated Engine Sub-Clients ---

type PostgresClient struct{ c *Client }

func (p *PostgresClient) Query(ctx context.Context, providerID, query string, params []string) ([]byte, error) {
	if !p.c.HasCapability(CapPostgres) {
		return nil, ErrPostgresNotConfigured
	}
	return p.c.doRequest(ctx, "/dbmux.v1.Postgres/Query", map[string]any{
		"provider_id": providerID,
		"query":       query,
		"params":      params,
	})
}

func (p *PostgresClient) Exec(ctx context.Context, providerID, query string, params []string) ([]byte, error) {
	if !p.c.HasCapability(CapPostgres) {
		return nil, ErrPostgresNotConfigured
	}
	return p.c.doRequest(ctx, "/dbmux.v1.Postgres/Exec", map[string]any{
		"provider_id": providerID,
		"query":       query,
		"params":      params,
	})
}

type MySQLClient struct{ c *Client }

func (m *MySQLClient) Query(ctx context.Context, providerID, query string, params []string) ([]byte, error) {
	if !m.c.HasCapability(CapMySQL) {
		return nil, ErrMySQLNotConfigured
	}
	return m.c.doRequest(ctx, "/dbmux.v1.MySQL/Query", map[string]any{
		"provider_id": providerID,
		"query":       query,
		"params":      params,
	})
}

func (m *MySQLClient) Exec(ctx context.Context, providerID, query string, params []string) ([]byte, error) {
	if !m.c.HasCapability(CapMySQL) {
		return nil, ErrMySQLNotConfigured
	}
	return m.c.doRequest(ctx, "/dbmux.v1.MySQL/Exec", map[string]any{
		"provider_id": providerID,
		"query":       query,
		"params":      params,
	})
}

type SQLiteClient struct{ c *Client }

func (s *SQLiteClient) Query(ctx context.Context, providerID, query string, params []string) ([]byte, error) {
	if !s.c.HasCapability(CapSQLite) {
		return nil, ErrSQLiteNotConfigured
	}
	return s.c.doRequest(ctx, "/dbmux.v1.SQLite/Query", map[string]any{
		"provider_id": providerID,
		"query":       query,
		"params":      params,
	})
}

func (s *SQLiteClient) Exec(ctx context.Context, providerID, query string, params []string) ([]byte, error) {
	if !s.c.HasCapability(CapSQLite) {
		return nil, ErrSQLiteNotConfigured
	}
	return s.c.doRequest(ctx, "/dbmux.v1.SQLite/Exec", map[string]any{
		"provider_id": providerID,
		"query":       query,
		"params":      params,
	})
}

type RedisClient struct{ c *Client }

func (r *RedisClient) Get(ctx context.Context, providerID, key string) ([]byte, error) {
	if !r.c.HasCapability(CapRedis) {
		return nil, ErrRedisNotConfigured
	}
	if providerID == "" {
		providerID = "redis"
	}
	return r.c.doRequest(ctx, "/dbmux.v1.KV/Get", map[string]any{"provider_id": providerID, "key": key})
}

func (r *RedisClient) Set(ctx context.Context, providerID, key, value string, ttlSeconds int64) ([]byte, error) {
	if !r.c.HasCapability(CapRedis) {
		return nil, ErrRedisNotConfigured
	}
	if providerID == "" {
		providerID = "redis"
	}
	return r.c.doRequest(ctx, "/dbmux.v1.KV/Set", map[string]any{
		"provider_id": providerID,
		"key":         key,
		"value":       value,
		"ttl_seconds": ttlSeconds,
	})
}

func (r *RedisClient) Del(ctx context.Context, providerID, key string) ([]byte, error) {
	if !r.c.HasCapability(CapRedis) {
		return nil, ErrRedisNotConfigured
	}
	if providerID == "" {
		providerID = "redis"
	}
	return r.c.doRequest(ctx, "/dbmux.v1.KV/Del", map[string]any{"provider_id": providerID, "key": key})
}

type MongoClient struct{ c *Client }

func (m *MongoClient) Find(ctx context.Context, providerID, dbName, collection, filterJSON string, limit int64) ([]byte, error) {
	if !m.c.HasCapability(CapMongo) {
		return nil, ErrMongoNotConfigured
	}
	if providerID == "" {
		providerID = "mongo"
	}
	return m.c.doRequest(ctx, "/dbmux.v1.Mongo/DocFind", map[string]any{
		"provider_id": providerID,
		"db_name":     dbName,
		"collection":  collection,
		"filter_json": filterJSON,
		"limit":       limit,
	})
}

func (m *MongoClient) Insert(ctx context.Context, providerID, dbName, collection, documentJSON string) ([]byte, error) {
	if !m.c.HasCapability(CapMongo) {
		return nil, ErrMongoNotConfigured
	}
	if providerID == "" {
		providerID = "mongo"
	}
	return m.c.doRequest(ctx, "/dbmux.v1.Mongo/Insert", map[string]any{
		"provider_id":   providerID,
		"db_name":       dbName,
		"collection":    collection,
		"document_json": documentJSON,
	})
}

type VectorClient struct{ c *Client }

func (v *VectorClient) Search(ctx context.Context, providerID, collection string, vector []float32, limit uint64) ([]byte, error) {
	if !v.c.HasCapability(CapVector) {
		return nil, ErrVectorNotConfigured
	}
	if providerID == "" {
		providerID = "qdrant"
	}
	return v.c.doRequest(ctx, "/dbmux.v1.Vector/VectorSearch", map[string]any{
		"provider_id":     providerID,
		"collection_name": collection,
		"vector":          vector,
		"limit":           limit,
	})
}

func (v *VectorClient) Insert(ctx context.Context, providerID, collection, pointID string, vector []float32, payload map[string]string) ([]byte, error) {
	if !v.c.HasCapability(CapVector) {
		return nil, ErrVectorNotConfigured
	}
	if providerID == "" {
		providerID = "qdrant"
	}
	return v.c.doRequest(ctx, "/dbmux.v1.Vector/Insert", map[string]any{
		"provider_id":     providerID,
		"collection_name": collection,
		"point_id":        pointID,
		"vector":          vector,
		"payload":         payload,
	})
}

type PubSubClient struct{ c *Client }

func (ps *PubSubClient) Publish(ctx context.Context, topic, payload string) ([]byte, error) {
	if !ps.c.HasCapability(CapRedis) {
		return nil, ErrRedisNotConfigured
	}
	return ps.c.doRequest(ctx, "/dbmux.v1.PubSub/Publish", map[string]any{
		"topic":   topic,
		"payload": payload,
	})
}

func (ps *PubSubClient) Subscribe(ctx context.Context, topic string, timeoutSeconds int64) ([]byte, error) {
	if !ps.c.HasCapability(CapRedis) {
		return nil, ErrRedisNotConfigured
	}
	return ps.c.doRequest(ctx, "/dbmux.v1.PubSub/Subscribe", map[string]any{
		"topic":           topic,
		"timeout_seconds": timeoutSeconds,
	})
}

type QueueClient struct{ c *Client }

func (q *QueueClient) Enqueue(ctx context.Context, queueName, payload string) ([]byte, error) {
	if !q.c.HasCapability(CapRedis) && !q.c.HasCapability(CapPostgres) {
		return nil, ErrQueueNotConfigured
	}
	return q.c.doRequest(ctx, "/dbmux.v1.Queue/Enqueue", map[string]any{
		"queue_name": queueName,
		"payload":    payload,
	})
}

func (q *QueueClient) Dequeue(ctx context.Context, queueName string) ([]byte, error) {
	if !q.c.HasCapability(CapRedis) && !q.c.HasCapability(CapPostgres) {
		return nil, ErrQueueNotConfigured
	}
	return q.c.doRequest(ctx, "/dbmux.v1.Queue/Dequeue", map[string]any{
		"queue_name": queueName,
	})
}

type StateClient struct{ c *Client }

func (st *StateClient) SaveState(ctx context.Context, storeName, key, valJSON string, ttlSeconds int64) ([]byte, error) {
	if storeName == "" {
		storeName = "default"
	}
	return st.c.doRequest(ctx, "/dbmux.v1.State/SaveState", map[string]any{
		"store_name":  storeName,
		"key":         key,
		"value_json":  valJSON,
		"ttl_seconds": ttlSeconds,
	})
}

func (st *StateClient) GetState(ctx context.Context, storeName, key string) ([]byte, error) {
	if storeName == "" {
		storeName = "default"
	}
	return st.c.doRequest(ctx, "/dbmux.v1.State/GetState", map[string]any{
		"store_name": storeName,
		"key":        key,
	})
}

func (st *StateClient) DeleteState(ctx context.Context, storeName, key string) ([]byte, error) {
	if storeName == "" {
		storeName = "default"
	}
	return st.c.doRequest(ctx, "/dbmux.v1.State/DeleteState", map[string]any{
		"store_name": storeName,
		"key":        key,
	})
}

type CronClient struct{ c *Client }

func (cr *CronClient) Register(ctx context.Context, cronID, schedule, payloadJSON string) ([]byte, error) {
	return cr.c.doRequest(ctx, "/dbmux.v1.Cron/RegisterCron", map[string]any{
		"cron_id":      cronID,
		"schedule":     schedule,
		"payload_json": payloadJSON,
	})
}

func (cr *CronClient) Trigger(ctx context.Context, cronID string) ([]byte, error) {
	return cr.c.doRequest(ctx, "/dbmux.v1.Cron/TriggerCron", map[string]any{
		"cron_id": cronID,
	})
}

type SecretClient struct{ c *Client }

func (sc *SecretClient) GetSecret(ctx context.Context, storeName, key string) ([]byte, error) {
	return sc.c.doRequest(ctx, "/dbmux.v1.Secret/GetSecret", map[string]any{
		"store_name": storeName,
		"secret_key": key,
	})
}

func (sc *SecretClient) GetBulkSecrets(ctx context.Context, storeName string) ([]byte, error) {
	return sc.c.doRequest(ctx, "/dbmux.v1.Secret/GetBulkSecrets", map[string]any{
		"store_name": storeName,
	})
}

