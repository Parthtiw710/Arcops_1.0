//go:build kv || !custom_build

package service

import (
	dbmuxv1 "dbmux/gen/dbmux/v1"
	"dbmux/pkg/providers"
	"dbmux/pkg/providers/kv"
)

func init() {
	registerDriverFactory(dbmuxv1.DBCategory_DB_CATEGORY_REDIS, func(id, dsn string) (providers.Provider, error) {
		return kv.NewKVProvider(id, dsn)
	})
}
