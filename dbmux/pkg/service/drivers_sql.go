//go:build sql || !custom_build

package service

import (
	dbmuxv1 "dbmux/gen/dbmux/v1"
	"dbmux/pkg/providers"
	"dbmux/pkg/providers/sql"
)

func init() {
	registerDriverFactory(dbmuxv1.DBCategory_DB_CATEGORY_POSTGRES, func(id, dsn string) (providers.Provider, error) {
		return sql.NewPostgresProvider(id, dsn)
	})
	registerDriverFactory(dbmuxv1.DBCategory_DB_CATEGORY_MYSQL, func(id, dsn string) (providers.Provider, error) {
		return sql.NewMySQLProvider(id, dsn)
	})
	registerDriverFactory(dbmuxv1.DBCategory_DB_CATEGORY_SQLITE, func(id, dsn string) (providers.Provider, error) {
		return sql.NewLibSQLProvider(id, dsn)
	})
}
