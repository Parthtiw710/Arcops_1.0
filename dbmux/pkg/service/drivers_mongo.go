//go:build mongo || !custom_build

package service

import (
	"context"

	dbmuxv1 "dbmux/gen/dbmux/v1"
	"dbmux/pkg/providers"
	"dbmux/pkg/providers/nosql"
)

func init() {
	registerDriverFactoryCtx(dbmuxv1.DBCategory_DB_CATEGORY_MONGO, func(ctx context.Context, id, dsn string) (providers.Provider, error) {
		return nosql.NewMongoProvider(ctx, id, dsn)
	})
}
