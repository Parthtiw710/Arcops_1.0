package queue

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	dbmuxv1 "dbmux/gen/dbmux/v1"
	"dbmux/pkg/providers"
	"dbmux/pkg/registry"

	"github.com/redis/go-redis/v9"
	_ "github.com/jackc/pgx/v5/stdlib"
)

// QueueEngine provides at-least-once queue operations backed by Redis RPUSH/LPOP first,
// falling back to Postgres table with SKIP LOCKED for durable delivery.
type QueueEngine struct {
	reg *registry.Registry
}

func NewQueueEngine(reg *registry.Registry) *QueueEngine {
	return &QueueEngine{reg: reg}
}

// findRedis returns the first registered *redis.Client, or nil.
func (e *QueueEngine) findRedis() *redis.Client {
	for _, p := range e.reg.List() {
		if p.Category == dbmuxv1.DBCategory_DB_CATEGORY_REDIS {
			if prov, ok := e.reg.Get(p.ProviderId); ok {
				if kv, ok := prov.(providers.KVProvider); ok {
					if rc, ok := kv.RawClient().(*redis.Client); ok {
						return rc
					}
				}
			}
		}
	}
	return nil
}

// findPostgres returns the first registered Postgres SQL provider, or nil.
func (e *QueueEngine) findPostgres() providers.SQLProvider {
	for _, p := range e.reg.List() {
		if p.Category == dbmuxv1.DBCategory_DB_CATEGORY_POSTGRES {
			if prov, ok := e.reg.Get(p.ProviderId); ok {
				if sqlProv, ok := prov.(providers.SQLProvider); ok {
					return sqlProv
				}
			}
		}
	}
	return nil
}

// Enqueue pushes a payload to the named queue.
// Uses Redis RPUSH first; falls back to Postgres table INSERT.
func (e *QueueEngine) Enqueue(ctx context.Context, queueName, payload string) (string, error) {
	if rc := e.findRedis(); rc != nil {
		if err := rc.RPush(ctx, "dbmux:queue:"+queueName, payload).Err(); err != nil {
			return "", fmt.Errorf("redis RPUSH failed: %w", err)
		}
		return "redis", nil
	}

	if sqlProv := e.findPostgres(); sqlProv != nil {
		if err := e.pgEnqueue(ctx, sqlProv, queueName, payload); err != nil {
			return "", err
		}
		return "postgres", nil
	}

	return "", fmt.Errorf("no queue backend available: register a Redis or Postgres provider")
}

// Dequeue atomically pops one item from the named queue.
// Uses Redis LPOP first; falls back to Postgres DELETE ... RETURNING with SKIP LOCKED.
func (e *QueueEngine) Dequeue(ctx context.Context, queueName string) (string, bool, string, error) {
	if rc := e.findRedis(); rc != nil {
		val, err := rc.LPop(ctx, "dbmux:queue:"+queueName).Result()
		if err == redis.Nil {
			return "", false, "redis", nil // Queue is empty
		}
		if err != nil {
			return "", false, "", fmt.Errorf("redis LPOP failed: %w", err)
		}
		return val, true, "redis", nil
	}

	if sqlProv := e.findPostgres(); sqlProv != nil {
		payload, found, err := e.pgDequeue(ctx, sqlProv, queueName)
		if err != nil {
			return "", false, "", err
		}
		return payload, found, "postgres", nil
	}

	return "", false, "", fmt.Errorf("no queue backend available: register a Redis or Postgres provider")
}

// --- Postgres fallback queue (durable, SKIP LOCKED) ---

// pgEnqueue inserts a job into the dbmux_queue table (auto-created if missing).
func (e *QueueEngine) pgEnqueue(ctx context.Context, sqlProv providers.SQLProvider, queueName, payload string) error {
	// Auto-create table on first use
	createSQL := `CREATE TABLE IF NOT EXISTS dbmux_queue (
		id          BIGSERIAL PRIMARY KEY,
		queue_name  TEXT        NOT NULL,
		payload     TEXT        NOT NULL,
		enqueued_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	)`
	if _, err := sqlProv.Exec(ctx, createSQL, nil); err != nil {
		return fmt.Errorf("postgres queue table creation failed: %w", err)
	}
	if _, err := sqlProv.Exec(ctx,
		"INSERT INTO dbmux_queue (queue_name, payload, enqueued_at) VALUES ($1, $2, $3)",
		[]string{queueName, payload, time.Now().UTC().Format(time.RFC3339)},
	); err != nil {
		return fmt.Errorf("postgres enqueue failed: %w", err)
	}
	return nil
}

// pgDequeue atomically dequeues one item using SELECT ... FOR UPDATE SKIP LOCKED.
func (e *QueueEngine) pgDequeue(ctx context.Context, sqlProv providers.SQLProvider, queueName string) (string, bool, error) {
	// Use a raw connection via providers.SQLProvider.RawDB() if available, else fall back to Query
	// Since SQLProvider.Exec handles parameterized queries, use it directly:
	result, err := sqlProv.Query(ctx,
		`DELETE FROM dbmux_queue
		  WHERE id = (
		    SELECT id FROM dbmux_queue
		    WHERE queue_name = $1
		    ORDER BY id ASC
		    FOR UPDATE SKIP LOCKED
		    LIMIT 1
		  )
		RETURNING payload`,
		[]string{queueName},
	)
	if err != nil {
		// Table might not exist yet (no items ever enqueued)
		if isTableNotExist(err) {
			return "", false, nil
		}
		return "", false, fmt.Errorf("postgres dequeue failed: %w", err)
	}
	if result == nil || len(result.Rows) == 0 {
		return "", false, nil
	}
	payload := result.Rows[0].Values["payload"]
	return payload, true, nil
}

func (e *QueueEngine) Size(ctx context.Context, queueName string) (int64, error) {
	if rc := e.findRedis(); rc != nil {
		return rc.LLen(ctx, "queue:"+queueName).Result()
	}
	if pg := e.findPostgres(); pg != nil {
		res, err := pg.Query(ctx, "SELECT COUNT(*) FROM dbmux_queue WHERE queue_name = $1;", []string{queueName})
		if err != nil || len(res.Rows) == 0 {
			return 0, nil
		}
		var count int64
		fmt.Sscanf(res.Rows[0].Values["count"], "%d", &count)
		return count, nil
	}
	return 0, nil
}

func (e *QueueEngine) Peek(ctx context.Context, queueName string) (string, bool, error) {
	if rc := e.findRedis(); rc != nil {
		val, err := rc.LIndex(ctx, "queue:"+queueName, 0).Result()
		if err == redis.Nil {
			return "", false, nil
		} else if err != nil {
			return "", false, err
		}
		return val, true, nil
	}
	if pg := e.findPostgres(); pg != nil {
		res, err := pg.Query(ctx, "SELECT payload FROM dbmux_queue WHERE queue_name = $1 ORDER BY id ASC LIMIT 1;", []string{queueName})
		if err != nil || len(res.Rows) == 0 {
			return "", false, nil
		}
		return res.Rows[0].Values["payload"], true, nil
	}
	return "", false, nil
}

func (e *QueueEngine) Purge(ctx context.Context, queueName string) error {
	if rc := e.findRedis(); rc != nil {
		return rc.Del(ctx, "queue:"+queueName).Err()
	}
	if pg := e.findPostgres(); pg != nil {
		_, err := pg.Exec(ctx, "DELETE FROM dbmux_queue WHERE queue_name = $1;", []string{queueName})
		return err
	}
	return nil
}

// findRawDB is a helper for providers that expose their underlying *sql.DB.
// Kept for future use when SQLProvider gains RawDB() method.
var _ = (*sql.DB)(nil)

func isTableNotExist(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return len(msg) > 0 && (containsStr(msg, "does not exist") || containsStr(msg, "no such table"))
}

func containsStr(s, sub string) bool {
	return len(s) >= len(sub) && func() bool {
		for i := 0; i <= len(s)-len(sub); i++ {
			if s[i:i+len(sub)] == sub {
				return true
			}
		}
		return false
	}()
}
