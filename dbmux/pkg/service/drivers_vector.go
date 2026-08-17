//go:build vector || !custom_build

package service

import (
	"context"
	"fmt"
	"os"
	"strings"

	dbmuxv1 "dbmux/gen/dbmux/v1"
	"dbmux/pkg/providers"
	"dbmux/pkg/providers/vector"

	"github.com/jackc/pgx/v5/pgxpool"
)

func init() {
	registerDriverFactoryCtx(dbmuxv1.DBCategory_DB_CATEGORY_VECTOR, func(ctx context.Context, id, dsn string) (providers.Provider, error) {
		pgVectorEnv := strings.ToLower(os.Getenv("PGVECTOR_ENABLED"))
		isPgVectorEnabled := pgVectorEnv == "true" || pgVectorEnv == "1" || pgVectorEnv == "yes"

		// Auto-detect if DSN specifies a postgres connection or if PGVECTOR_ENABLED is set
		if isPgVectorEnabled || strings.HasPrefix(dsn, "postgres://") || strings.HasPrefix(dsn, "postgresql://") {
			pgDSN := dsn
			if pgDSN == "" {
				pgDSN = os.Getenv("POSTGRES_DSN")
			}

			if pgDSN != "" {
				pool, err := pgxpool.New(ctx, pgDSN)
				if err == nil {
					fmt.Printf("   - [pgvector] Initialized vector provider '%s' on PostgreSQL pool\n", id)
					return vector.NewPgVectorProvider(id, pool)
				}
			}
		}

		// Fallback to Qdrant Vector Provider
		return vector.NewQdrantVectorProvider(id, "localhost", 6334, "")
	})
}
