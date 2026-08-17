package pubsub_test

import (
	"context"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	"dbmux/pkg/providers/kv"
	"dbmux/pkg/pubsub"
	"dbmux/pkg/registry"
)

// TestPubSub_NoRedis_PublishReturnsError verifies that Publish returns a clear error
// when no Redis provider is registered, instead of panicking or hanging.
func TestPubSub_NoRedis_PublishReturnsError(t *testing.T) {
	reg := registry.NewRegistry()
	engine := pubsub.NewPubSubEngine(reg)

	_, err := engine.Publish(context.Background(), "orders", `{"order_id": 1}`)
	if err == nil {
		t.Fatal("expected error when no Redis provider registered, got nil")
	}
	t.Logf("Got expected error: %v", err)
}

// TestPubSub_NoRedis_SubscribeReturnsError verifies Subscribe also fails cleanly.
func TestPubSub_NoRedis_SubscribeReturnsError(t *testing.T) {
	reg := registry.NewRegistry()
	engine := pubsub.NewPubSubEngine(reg)

	err := engine.Subscribe(context.Background(), "orders", func(topic, payload string, ts time.Time) error {
		return nil
	})
	if err == nil {
		t.Fatal("expected error when no Redis provider registered, got nil")
	}
	t.Logf("Got expected error: %v", err)
}

// TestPubSub_SubscribeFn_Cancellation verifies that Subscribe returns cleanly when ctx is cancelled.
func TestPubSub_SubscribeFn_Cancellation(t *testing.T) {
	reg := registry.NewRegistry()
	engine := pubsub.NewPubSubEngine(reg)

	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		_ = engine.Subscribe(ctx, "test-topic", func(topic, payload string, ts time.Time) error {
			return fmt.Errorf("should not be called")
		})
	}()

	wg.Wait()
}

// TestPubSub_LiveRedis_PublishAndSubscribe tests live Redis Pub/Sub round-trip if a Redis instance is available.
func TestPubSub_LiveRedis_PublishAndSubscribe(t *testing.T) {
	redisDSN := os.Getenv("REDIS_DSN")
	if redisDSN == "" {
		redisDSN = "redis://127.0.0.1:6379/0"
	}

	kvProv, err := kv.NewKVProvider("test-redis", redisDSN)
	if err != nil {
		t.Skipf("Skipping live Redis test (cannot create client for %s): %v", redisDSN, err)
	}
	defer kvProv.Close()

	// Verify ping connection before proceeding
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()
	if _, err := kvProv.Get(ctx, "__ping__"); err != nil {
		t.Skipf("Skipping live Redis test (Redis server not responding at %s): %v", redisDSN, err)
	}

	reg := registry.NewRegistry()
	if err := reg.Register(kvProv); err != nil {
		t.Fatalf("failed to register kv provider: %v", err)
	}

	engine := pubsub.NewPubSubEngine(reg)
	subTopic := "live_test_topic"
	expectedPayload := `{"hello": "world"}`

	subCtx, subCancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer subCancel()

	receivedCh := make(chan string, 1)

	// Start subscriber goroutine
	go func() {
		_ = engine.Subscribe(subCtx, subTopic, func(topic, payload string, ts time.Time) error {
			if topic == subTopic {
				receivedCh <- payload
				subCancel() // stop stream after receiving
			}
			return nil
		})
	}()

	// Small pause to allow Redis SUBSCRIBE handshake to complete
	time.Sleep(100 * time.Millisecond)

	// Publish message
	receivers, err := engine.Publish(context.Background(), subTopic, expectedPayload)
	if err != nil {
		t.Fatalf("Publish failed: %v", err)
	}
	if receivers < 1 {
		t.Logf("Warning: receivers count is %d (handshake timing)", receivers)
	}

	select {
	case msg := <-receivedCh:
		if msg != expectedPayload {
			t.Errorf("expected payload %q, got %q", expectedPayload, msg)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for pub/sub message delivery")
	}
}
