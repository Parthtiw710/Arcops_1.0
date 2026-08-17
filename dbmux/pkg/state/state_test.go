package state_test

import (
	"context"
	"testing"

	dbmuxv1 "dbmux/gen/dbmux/v1"
	"dbmux/pkg/registry"
	"dbmux/pkg/state"
)

// MockKVProvider implements providers.KVProvider for testing L1 cache.
type MockKVProvider struct {
	data map[string]string
}

func (m *MockKVProvider) ID() string                        { return "redis-test" }
func (m *MockKVProvider) Category() dbmuxv1.DBCategory       { return dbmuxv1.DBCategory_DB_CATEGORY_REDIS }
func (m *MockKVProvider) Close() error                       { return nil }
func (m *MockKVProvider) Get(ctx context.Context, key string) (*dbmuxv1.KVGetResponse, error) {
	val, ok := m.data[key]
	return &dbmuxv1.KVGetResponse{Found: ok, Key: key, Value: val}, nil
}
func (m *MockKVProvider) Set(ctx context.Context, key, val string, ttl int64) (*dbmuxv1.KVSetResponse, error) {
	if m.data == nil {
		m.data = make(map[string]string)
	}
	m.data[key] = val
	return &dbmuxv1.KVSetResponse{Success: true}, nil
}
func (m *MockKVProvider) Del(ctx context.Context, key string) (*dbmuxv1.KVDelResponse, error) {
	delete(m.data, key)
	return &dbmuxv1.KVDelResponse{Success: true, KeysDeleted: 1}, nil
}
func (m *MockKVProvider) Exists(ctx context.Context, key string) (bool, error) {
	_, ok := m.data[key]
	return ok, nil
}
func (m *MockKVProvider) Expire(ctx context.Context, key string, ttl int64) (bool, error) {
	return true, nil
}
func (m *MockKVProvider) Incr(ctx context.Context, key string, delta int64) (int64, error) {
	return 1, nil
}
func (m *MockKVProvider) RawClient() any { return nil }

func TestStateEngine_L1RedisSaveGetDelete(t *testing.T) {
	reg := registry.NewRegistry()
	mockRedis := &MockKVProvider{data: make(map[string]string)}

	if err := reg.Register(mockRedis); err != nil {
		t.Fatalf("failed to register mock redis: %v", err)
	}

	se := state.NewStateEngine(reg)
	ctx := context.Background()

	// 1. Save State
	key := "user_session_99"
	valJSON := `{"user_id": 99, "role": "admin"}`

	err := se.SaveState(ctx, key, valJSON, 3600)
	if err != nil {
		t.Fatalf("SaveState failed: %v", err)
	}

	// 2. Get State
	val, found, err := se.GetState(ctx, key)
	if err != nil {
		t.Fatalf("GetState failed: %v", err)
	}
	if !found {
		t.Fatalf("expected state key %s to be found", key)
	}
	if val != valJSON {
		t.Fatalf("expected val %s, got %s", valJSON, val)
	}

	// 3. Delete State
	err = se.DeleteState(ctx, key)
	if err != nil {
		t.Fatalf("DeleteState failed: %v", err)
	}

	_, foundAfterDel, _ := se.GetState(ctx, key)
	if foundAfterDel {
		t.Fatalf("expected key %s to be deleted", key)
	}
}
