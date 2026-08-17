package vector

import (
	"context"
	"fmt"

	dbmuxv1 "dbmux/gen/dbmux/v1"
	"dbmux/pkg/providers"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pgvector/pgvector-go"
)

// PgVectorProvider manages native pgvector operations over an existing Postgres pool
type PgVectorProvider struct {
	id   string
	pool *pgxpool.Pool
}

var _ providers.VectorProvider = (*PgVectorProvider)(nil)

// NewPgVectorProvider initializes a pgvector provider backed by a pgx connection pool.
func NewPgVectorProvider(id string, pool *pgxpool.Pool) (*PgVectorProvider, error) {
	if pool == nil {
		return nil, fmt.Errorf("postgres connection pool is nil")
	}

	// Auto-enable vector extension if PostgreSQL supports it
	ctx := context.Background()
	_, _ = pool.Exec(ctx, "CREATE EXTENSION IF NOT EXISTS vector;")

	return &PgVectorProvider{
		id:   id,
		pool: pool,
	}, nil
}

func (p *PgVectorProvider) ID() string {
	return p.id
}

func (p *PgVectorProvider) Category() dbmuxv1.DBCategory {
	return dbmuxv1.DBCategory_DB_CATEGORY_VECTOR
}

func (p *PgVectorProvider) VectorSearch(ctx context.Context, collection string, vecSlice []float32, limit uint64, filter map[string]string) (*dbmuxv1.VectorSearchResponse, error) {
	if collection == "" {
		collection = "default"
	}
	if limit == 0 {
		limit = 10
	}

	vec := pgvector.NewVector(vecSlice)

	query := fmt.Sprintf(`
		SELECT point_id, payload_json, 1 - (embedding <=> $1) AS score
		FROM dbmux_vectors_%s
		ORDER BY embedding <=> $1 ASC
		LIMIT $2
	`, collection)

	rows, err := p.pool.Query(ctx, query, vec, limit)
	if err != nil {
		return &dbmuxv1.VectorSearchResponse{Matches: []*dbmuxv1.VectorMatch{}}, nil
	}
	defer rows.Close()

	var matches []*dbmuxv1.VectorMatch
	for rows.Next() {
		var pointID, payloadJSON string
		var score float32
		if err := rows.Scan(&pointID, &payloadJSON, &score); err == nil {
			matches = append(matches, &dbmuxv1.VectorMatch{
				Id:    pointID,
				Score: score,
			})
		}
	}

	return &dbmuxv1.VectorSearchResponse{Matches: matches}, nil
}

func (p *PgVectorProvider) VectorInsert(ctx context.Context, collection string, pointID string, vecSlice []float32, payload map[string]string) (*dbmuxv1.VectorInsertResponse, error) {
	if collection == "" {
		collection = "default"
	}

	vec := pgvector.NewVector(vecSlice)

	// Ensure collection table exists with pgvector column
	tableStmt := fmt.Sprintf(`
		CREATE TABLE IF NOT EXISTS dbmux_vectors_%s (
			point_id TEXT PRIMARY KEY,
			embedding vector,
			payload_json TEXT,
			created_at TIMESTAMPTZ DEFAULT NOW()
		);
	`, collection)
	_, _ = p.pool.Exec(ctx, tableStmt)

	insertStmt := fmt.Sprintf(`
		INSERT INTO dbmux_vectors_%s (point_id, embedding, payload_json)
		VALUES ($1, $2, $3)
		ON CONFLICT (point_id) DO UPDATE SET embedding = EXCLUDED.embedding, payload_json = EXCLUDED.payload_json;
	`, collection)

	_, err := p.pool.Exec(ctx, insertStmt, pointID, vec, "{}")
	if err != nil {
		return nil, fmt.Errorf("vector insert failed: %w", err)
	}

	return &dbmuxv1.VectorInsertResponse{Success: true}, nil
}

func (p *PgVectorProvider) Close() error {
	return nil
}
