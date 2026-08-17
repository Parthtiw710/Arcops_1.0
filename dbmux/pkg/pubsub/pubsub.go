package pubsub

import (
	"context"
	"fmt"
	"time"

	dbmuxv1 "dbmux/gen/dbmux/v1"
	"dbmux/pkg/providers"
	"dbmux/pkg/registry"

	"github.com/redis/go-redis/v9"
)

// PubSubEngine provides fire-and-forget Pub/Sub backed exclusively by Redis/Valkey.
// If no Redis provider is registered, Publish and Subscribe return an error.
// For durable delivery without Redis, use the Queue engine (Postgres fallback) instead.
type PubSubEngine struct {
	reg *registry.Registry
}

func NewPubSubEngine(reg *registry.Registry) *PubSubEngine {
	return &PubSubEngine{reg: reg}
}

// findRedis returns the first registered Redis/Valkey *redis.Client, or nil.
func (e *PubSubEngine) findRedis() *redis.Client {
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

// Publish sends a message on the given topic via Redis PUBLISH.
// Returns the number of active subscribers that received the message.
func (e *PubSubEngine) Publish(ctx context.Context, topic, payload string) (int64, error) {
	rc := e.findRedis()
	if rc == nil {
		return 0, fmt.Errorf("pub/sub requires Redis: no Redis provider registered — use Queue.Enqueue for durable delivery")
	}
	n, err := rc.Publish(ctx, topic, payload).Result()
	if err != nil {
		return 0, fmt.Errorf("redis PUBLISH failed: %w", err)
	}
	return n, nil
}

// SubscribeFn is called for each received message. Return non-nil to stop the loop.
type SubscribeFn func(topic, payload string, ts time.Time) error

// Subscribe blocks, calling fn for every message on topic until ctx is cancelled.
func (e *PubSubEngine) Subscribe(ctx context.Context, topic string, fn SubscribeFn) error {
	rc := e.findRedis()
	if rc == nil {
		return fmt.Errorf("pub/sub requires Redis: no Redis provider registered — use Queue.Dequeue for durable delivery")
	}

	sub := rc.Subscribe(ctx, topic)
	defer sub.Close()

	ch := sub.Channel()
	for {
		select {
		case <-ctx.Done():
			return nil
		case msg, ok := <-ch:
			if !ok {
				return nil
			}
			if err := fn(msg.Channel, msg.Payload, time.Now()); err != nil {
				return err
			}
		}
	}
}
