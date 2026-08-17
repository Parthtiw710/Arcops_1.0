package queue_test

import (
	"context"
	"os"
	"testing"
	"time"

	"dbmux/pkg/providers/kv"
	"dbmux/pkg/providers/sql"
	"dbmux/pkg/queue"
	"dbmux/pkg/registry"
)

// TestQueue_NoBackend_EnqueueReturnsError verifies Enqueue returns a clear error
// when neither Redis nor Postgres is registered.
func TestQueue_NoBackend_EnqueueReturnsError(t *testing.T) {
	reg := registry.NewRegistry()
	engine := queue.NewQueueEngine(reg)

	_, err := engine.Enqueue(context.Background(), "jobs", `{"task": "send_email"}`)
	if err == nil {
		t.Fatal("expected error when no backend registered, got nil")
	}
	t.Logf("Got expected error: %v", err)
}

// TestQueue_NoBackend_DequeueReturnsError verifies Dequeue returns a clear error
// when neither Redis nor Postgres is registered.
func TestQueue_NoBackend_DequeueReturnsError(t *testing.T) {
	reg := registry.NewRegistry()
	engine := queue.NewQueueEngine(reg)

	_, _, _, err := engine.Dequeue(context.Background(), "jobs")
	if err == nil {
		t.Fatal("expected error when no backend registered, got nil")
	}
	t.Logf("Got expected error: %v", err)
}

// TestQueue_LiveRedis_EnqueueAndDequeue tests live Redis Queue round-trip if a Redis instance is available.
func TestQueue_LiveRedis_EnqueueAndDequeue(t *testing.T) {
	redisDSN := os.Getenv("REDIS_DSN")
	if redisDSN == "" {
		redisDSN = "redis://127.0.0.1:6379/0"
	}

	kvProv, err := kv.NewKVProvider("test-redis-q", redisDSN)
	if err != nil {
		t.Skipf("Skipping live Redis queue test: %v", err)
	}
	defer kvProv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()
	if _, err := kvProv.Get(ctx, "__ping__"); err != nil {
		t.Skipf("Skipping live Redis queue test (Redis server not responding): %v", err)
	}

	reg := registry.NewRegistry()
	_ = reg.Register(kvProv)

	engine := queue.NewQueueEngine(reg)
	queueName := "live_unit_queue"
	payload := `{"job_id": 42}`

	backend, err := engine.Enqueue(context.Background(), queueName, payload)
	if err != nil {
		t.Fatalf("Enqueue failed: %v", err)
	}
	if backend != "redis" {
		t.Errorf("expected backend 'redis', got %q", backend)
	}

	deqPayload, found, deqBackend, err := engine.Dequeue(context.Background(), queueName)
	if err != nil {
		t.Fatalf("Dequeue failed: %v", err)
	}
	if !found {
		t.Fatal("expected found=true, got false")
	}
	if deqPayload != payload {
		t.Errorf("expected payload %q, got %q", payload, deqPayload)
	}
	if deqBackend != "redis" {
		t.Errorf("expected backend 'redis', got %q", deqBackend)
	}
}

// TestQueue_LivePostgres_FallbackEnqueueAndDequeue tests live Postgres Queue fallback if Postgres is available.
func TestQueue_LivePostgres_FallbackEnqueueAndDequeue(t *testing.T) {
	pgDSN := os.Getenv("POSTGRES_DSN")
	if pgDSN == "" {
		pgDSN = "postgres://postgres:postgres@127.0.0.1:5432/postgres?sslmode=disable"
	}

	pgProv, err := sql.NewPostgresProvider("test-pg-q", pgDSN)
	if err != nil {
		t.Skipf("Skipping live Postgres queue test: %v", err)
	}
	defer pgProv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()
	if _, err := pgProv.Exec(ctx, "SELECT 1", nil); err != nil {
		t.Skipf("Skipping live Postgres queue test (Postgres server not responding): %v", err)
	}

	// Register ONLY Postgres (no Redis) to test fallback
	reg := registry.NewRegistry()
	_ = reg.Register(pgProv)

	engine := queue.NewQueueEngine(reg)
	queueName := "fallback_unit_queue"
	payload := `{"task": "pg_fallback_task"}`

	backend, err := engine.Enqueue(context.Background(), queueName, payload)
	if err != nil {
		t.Fatalf("Postgres Fallback Enqueue failed: %v", err)
	}
	if backend != "postgres" {
		t.Errorf("expected backend 'postgres', got %q", backend)
	}

	deqPayload, found, deqBackend, err := engine.Dequeue(context.Background(), queueName)
	if err != nil {
		t.Fatalf("Postgres Fallback Dequeue failed: %v", err)
	}
	if !found {
		t.Fatal("expected found=true, got false")
	}
	if deqPayload != payload {
		t.Errorf("expected payload %q, got %q", payload, deqPayload)
	}
	if deqBackend != "postgres" {
		t.Errorf("expected backend 'postgres', got %q", deqBackend)
	}
}
