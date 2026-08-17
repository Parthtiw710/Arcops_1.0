package cron_test

import (
	"context"
	"testing"

	dbmuxv1 "dbmux/gen/dbmux/v1"
	"dbmux/pkg/cron"
	"dbmux/pkg/registry"
	"dbmux/pkg/state"
)

type MockKVProvider struct {
	data map[string]string
}

func (m *MockKVProvider) ID() string                        { return "redis-cron-test" }
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

func TestDistributedCronScheduler_RegisterAndTrigger(t *testing.T) {
	reg := registry.NewRegistry()
	mockRedis := &MockKVProvider{data: make(map[string]string)}
	_ = reg.Register(mockRedis)

	se := state.NewStateEngine(reg)
	cs := cron.NewDistributedCronScheduler(se)
	ctx := context.Background()

	cronID := "daily_cleanup"
	schedule := "0 0 * * *"
	payload := `{"task": "cleanup_temp_files"}`

	// 1. Register Cron Job
	job, err := cs.RegisterCron(cronID, schedule, payload)
	if err != nil {
		t.Fatalf("RegisterCron failed: %v", err)
	}
	if job.ID != cronID {
		t.Fatalf("expected job ID %s, got %s", cronID, job.ID)
	}

	// 2. Trigger Cron Job
	executed, acquiredLock, msg, err := cs.TriggerCron(ctx, cronID)
	if err != nil {
		t.Fatalf("TriggerCron returned error: %v", err)
	}
	if !executed || !acquiredLock {
		t.Fatalf("expected cron execution and lock acquisition, got executed=%v, locked=%v, msg=%s", executed, acquiredLock, msg)
	}
}
