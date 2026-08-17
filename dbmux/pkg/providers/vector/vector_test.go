package vector_test

import (
	"context"
	"testing"

	dbmuxv1 "dbmux/gen/dbmux/v1"
	"dbmux/pkg/providers/vector"
)

func TestPgVectorProvider_Interface(t *testing.T) {
	// Test PgVectorProvider initialization validation with nil pool
	_, err := vector.NewPgVectorProvider("test-pgvector", nil)
	if err == nil {
		t.Fatalf("expected error when initializing PgVectorProvider with nil pool, got nil")
	}
}

func TestQdrantVectorProvider_Category(t *testing.T) {
	qProv, err := vector.NewQdrantVectorProvider("test-qdrant", "localhost", 6334, "")
	if err != nil {
		t.Fatalf("failed to create QdrantVectorProvider: %v", err)
	}

	if qProv.ID() != "test-qdrant" {
		t.Errorf("expected ID 'test-qdrant', got %s", qProv.ID())
	}

	if qProv.Category() != dbmuxv1.DBCategory_DB_CATEGORY_VECTOR {
		t.Errorf("expected Category DB_CATEGORY_VECTOR, got %v", qProv.Category())
	}

	ctx := context.Background()
	res, err := qProv.VectorSearch(ctx, "test_collection", []float32{0.1, 0.2}, 5, nil)
	if err != nil {
		t.Errorf("unexpected error on VectorSearch: %v", err)
	}
	if res == nil {
		t.Errorf("expected non-nil VectorSearchResponse")
	}
}
