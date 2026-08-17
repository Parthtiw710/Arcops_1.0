package providers

import (
	"context"
	dbmuxv1 "dbmux/gen/dbmux/v1"
)

// Provider is the base interface that all dbmux provider drivers implement
type Provider interface {
	ID() string
	Category() dbmuxv1.DBCategory
	Close() error
}

// Common SQL result struct
type SQLResult struct {
	Columns      []string
	Rows         []*dbmuxv1.SQLRow
	RowsReturned int64
	RowsAffected int64
	LastInsertId int64
}

// SQLProvider defines operations for relational databases (Postgres, MySQL, LibSQL)
type SQLProvider interface {
	Provider
	Query(ctx context.Context, query string, params []string) (*SQLResult, error)
	Exec(ctx context.Context, query string, params []string) (*SQLResult, error)
}

// KVProvider defines operations for Redis and Valkey
type KVProvider interface {
	Provider
	Get(ctx context.Context, key string) (*dbmuxv1.KVGetResponse, error)
	Set(ctx context.Context, key string, value string, ttlSeconds int64) (*dbmuxv1.KVSetResponse, error)
	Del(ctx context.Context, key string) (*dbmuxv1.KVDelResponse, error)
	Exists(ctx context.Context, key string) (bool, error)
	Expire(ctx context.Context, key string, ttlSeconds int64) (bool, error)
	Incr(ctx context.Context, key string, delta int64) (int64, error)
	// RawClient returns the underlying *redis.Client for pub/sub and queue list operations.
	RawClient() any
}

// NoSQLProvider defines document CRUD operations for MongoDB
type NoSQLProvider interface {
	Provider
	DocFind(ctx context.Context, dbName, collection, filterJSON string, limit int64) (*dbmuxv1.MongoFindResponse, error)
	DocInsert(ctx context.Context, dbName, collection, docJSON string) (*dbmuxv1.MongoInsertResponse, error)
	DocUpdate(ctx context.Context, dbName, collection, filterJSON, updateJSON string) (int64, error)
	DocDelete(ctx context.Context, dbName, collection, filterJSON string) (int64, error)
	DocCount(ctx context.Context, dbName, collection, filterJSON string) (int64, error)
}

// VectorProvider defines vector similarity search for Qdrant and Pgvector
type VectorProvider interface {
	Provider
	VectorSearch(ctx context.Context, collection string, vector []float32, limit uint64, filter map[string]string) (*dbmuxv1.VectorSearchResponse, error)
	VectorInsert(ctx context.Context, collection string, pointID string, vector []float32, payload map[string]string) (*dbmuxv1.VectorInsertResponse, error)
}
