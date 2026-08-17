package kv

import (
	"context"
	"fmt"
	"time"

	dbmuxv1 "dbmux/gen/dbmux/v1"
	"dbmux/pkg/providers"

	"github.com/redis/go-redis/v9"
)

// KVProviderImpl manages connection pools to Redis / Valkey instances.
type KVProviderImpl struct {
	id     string
	client *redis.Client
}

var _ providers.KVProvider = (*KVProviderImpl)(nil)

// NewKVProvider initializes a Redis/Valkey client pool.
func NewKVProvider(id, dsn string) (*KVProviderImpl, error) {
	opts, err := redis.ParseURL(dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to parse redis/valkey dsn: %w", err)
	}

	opts.PoolSize = 20
	client := redis.NewClient(opts)

	return &KVProviderImpl{
		id:     id,
		client: client,
	}, nil
}

func (p *KVProviderImpl) ID() string {
	return p.id
}

func (p *KVProviderImpl) Category() dbmuxv1.DBCategory {
	return dbmuxv1.DBCategory_DB_CATEGORY_REDIS
}

func (p *KVProviderImpl) Get(ctx context.Context, key string) (*dbmuxv1.KVGetResponse, error) {
	val, err := p.client.Get(ctx, key).Result()
	if err == redis.Nil {
		return &dbmuxv1.KVGetResponse{Key: key, Found: false}, nil
	} else if err != nil {
		return nil, err
	}
	return &dbmuxv1.KVGetResponse{Key: key, Value: val, Found: true}, nil
}

func (p *KVProviderImpl) Set(ctx context.Context, key string, value string, ttlSeconds int64) (*dbmuxv1.KVSetResponse, error) {
	ttl := time.Duration(ttlSeconds) * time.Second
	err := p.client.Set(ctx, key, value, ttl).Err()
	if err != nil {
		return nil, err
	}
	return &dbmuxv1.KVSetResponse{Success: true}, nil
}

func (p *KVProviderImpl) Del(ctx context.Context, key string) (*dbmuxv1.KVDelResponse, error) {
	deleted, err := p.client.Del(ctx, key).Result()
	if err != nil {
		return nil, err
	}
	return &dbmuxv1.KVDelResponse{Success: true, KeysDeleted: deleted}, nil
}

func (p *KVProviderImpl) Exists(ctx context.Context, key string) (bool, error) {
	n, err := p.client.Exists(ctx, key).Result()
	return n > 0, err
}

func (p *KVProviderImpl) Expire(ctx context.Context, key string, ttlSeconds int64) (bool, error) {
	return p.client.Expire(ctx, key, time.Duration(ttlSeconds)*time.Second).Result()
}

func (p *KVProviderImpl) Incr(ctx context.Context, key string, delta int64) (int64, error) {
	return p.client.IncrBy(ctx, key, delta).Result()
}

// RawClient returns the underlying *redis.Client for Pub/Sub and Queue list operations.
func (p *KVProviderImpl) RawClient() any {
	return p.client
}

func (p *KVProviderImpl) Close() error {
	if p.client != nil {
		return p.client.Close()
	}
	return nil
}
