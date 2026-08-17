package service_test

import (
	"context"
	"testing"

	"connectrpc.com/connect"
	dbmuxv1 "dbmux/gen/dbmux/v1"
	"dbmux/pkg/registry"
	"dbmux/pkg/service"
)

type MockSQLProvider struct {
	id string
}

func (m *MockSQLProvider) ID() string                  { return m.id }
func (m *MockSQLProvider) Category() dbmuxv1.DBCategory { return dbmuxv1.DBCategory_DB_CATEGORY_POSTGRES }
func (m *MockSQLProvider) Close() error                 { return nil }
func (m *MockSQLProvider) Query(ctx context.Context, q string, p []string) (*dbmuxv1.SQLRow, error) {
	return nil, nil
}

func TestListProviders_DbFlags(t *testing.T) {
	reg := registry.NewRegistry()
	mockPG := &MockSQLProvider{id: "postgres-main"}
	_ = reg.Register(mockPG)

	server := service.NewServer(reg)
	ctx := context.Background()

	res, err := server.Registry.ListProviders(ctx, connect.NewRequest(&dbmuxv1.ListProvidersRequest{}))
	if err != nil {
		t.Fatalf("ListProviders failed: %v", err)
	}

	// db_flags order: [0:Postgres, 1:MySQL, 2:SQLite, 3:Redis, 4:Mongo, 5:Vector]
	expectedFlags := "100000"
	if res.Msg.DbFlags != expectedFlags {
		t.Fatalf("expected db_flags %s, got %s", expectedFlags, res.Msg.DbFlags)
	}
}
