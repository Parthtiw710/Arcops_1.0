package state

import (
	"context"
	"fmt"
	"time"

	dbmuxv1 "dbmux/gen/dbmux/v1"
	"dbmux/pkg/providers"
	"dbmux/pkg/registry"
)

// L2Priority represents the persistent storage provider priority hierarchy.
type L2Priority string

const (
	PriorityPostgres L2Priority = "postgres"
	PriorityMySQL    L2Priority = "mysql"
	PriorityMongo    L2Priority = "mongodb"
	PrioritySQLite   L2Priority = "sqlite"
)

// StateEngine coordinates L1 Redis compulsory caching and L2 Priority DB persistence.
type StateEngine struct {
	reg *registry.Registry
}

func NewStateEngine(reg *registry.Registry) *StateEngine {
	return &StateEngine{reg: reg}
}

// FindL1KVProvider retrieves the compulsory L1 Redis/Valkey provider if registered.
func (se *StateEngine) FindL1KVProvider() (providers.KVProvider, bool) {
	for _, p := range se.reg.List() {
		if p.Category == dbmuxv1.DBCategory_DB_CATEGORY_REDIS {
			if prov, ok := se.reg.Get(p.ProviderId); ok {
				if kvProv, ok := prov.(providers.KVProvider); ok {
					return kvProv, true
				}
			}
		}
	}
	return nil, false
}

// FindL2PersistentProvider resolves the highest priority database registered:
// Priority: PostgreSQL > MySQL > MongoDB > SQLite
func (se *StateEngine) FindL2PersistentProvider() (providers.Provider, L2Priority, bool) {
	var postgresProv, mysqlProv, sqliteProv providers.Provider
	var mongoProv providers.Provider

	for _, p := range se.reg.List() {
		prov, ok := se.reg.Get(p.ProviderId)
		if !ok {
			continue
		}
		switch p.Category {
		case dbmuxv1.DBCategory_DB_CATEGORY_POSTGRES:
			if postgresProv == nil {
				postgresProv = prov
			}
		case dbmuxv1.DBCategory_DB_CATEGORY_MYSQL:
			if mysqlProv == nil {
				mysqlProv = prov
			}
		case dbmuxv1.DBCategory_DB_CATEGORY_MONGO:
			if mongoProv == nil {
				mongoProv = prov
			}
		case dbmuxv1.DBCategory_DB_CATEGORY_SQLITE:
			if sqliteProv == nil {
				sqliteProv = prov
			}
		}
	}

	if postgresProv != nil {
		return postgresProv, PriorityPostgres, true
	}
	if mysqlProv != nil {
		return mysqlProv, PriorityMySQL, true
	}
	if mongoProv != nil {
		return mongoProv, PriorityMongo, true
	}
	if sqliteProv != nil {
		return sqliteProv, PrioritySQLite, true
	}

	return nil, "", false
}

// SaveState writes state key-value data to L1 Redis cache (if present) and L2 Persistent DB (Priority: PG > MySQL > Mongo > SQLite).
func (se *StateEngine) SaveState(ctx context.Context, key string, valJSON string, ttlSeconds int64) error {
	// 1. Write to L1 Compulsory Cache (Redis / Valkey)
	if l1, ok := se.FindL1KVProvider(); ok {
		_, _ = l1.Set(ctx, key, valJSON, ttlSeconds)
	}

	// 2. Write to L2 Persistent DB Store based on priority hierarchy
	l2Prov, prio, ok := se.FindL2PersistentProvider()
	if !ok {
		// If no L2 persistent database is registered, state is preserved in L1 Redis
		return nil
	}

	switch prio {
	case PriorityPostgres:
		sqlProv, _ := l2Prov.(providers.SQLProvider)
		query := `
			CREATE TABLE IF NOT EXISTS dbmux_state (
				key TEXT PRIMARY KEY,
				value JSONB NOT NULL,
				updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
				expire_at TIMESTAMP WITH TIME ZONE NULL
			);
		`
		_, _ = sqlProv.Exec(ctx, query, nil)

		var expireAt *string
		if ttlSeconds > 0 {
			exp := time.Now().Add(time.Duration(ttlSeconds) * time.Second).Format(time.RFC3339)
			expireAt = &exp
		}

		upsertQuery := `
			INSERT INTO dbmux_state (key, value, expire_at)
			VALUES ($1, $2::jsonb, $3)
			ON CONFLICT (key) DO UPDATE
			SET value = EXCLUDED.value, expire_at = EXCLUDED.expire_at, updated_at = CURRENT_TIMESTAMP;
		`
		expVal := ""
		if expireAt != nil {
			expVal = *expireAt
		}
		_, err := sqlProv.Exec(ctx, upsertQuery, []string{key, valJSON, expVal})
		return err

	case PriorityMySQL:
		sqlProv, _ := l2Prov.(providers.SQLProvider)
		query := `
			CREATE TABLE IF NOT EXISTS dbmux_state (
				` + "`key`" + ` VARCHAR(255) PRIMARY KEY,
				` + "`value`" + ` JSON NOT NULL,
				` + "`updated_at`" + ` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
				` + "`expire_at`" + ` DATETIME NULL
			);
		`
		_, _ = sqlProv.Exec(ctx, query, nil)

		upsertQuery := `
			INSERT INTO dbmux_state (` + "`key`" + `, ` + "`value`" + `, ` + "`expire_at`" + `)
			VALUES (?, ?, ?)
			ON DUPLICATE KEY UPDATE ` + "`value`" + ` = VALUES(` + "`value`" + `), ` + "`expire_at`" + ` = VALUES(` + "`expire_at`" + `);
		`
		expVal := ""
		if ttlSeconds > 0 {
			expVal = time.Now().Add(time.Duration(ttlSeconds) * time.Second).Format("2006-01-02 15:04:05")
		}
		_, err := sqlProv.Exec(ctx, upsertQuery, []string{key, valJSON, expVal})
		return err

	case PriorityMongo:
		noSqlProv, _ := l2Prov.(providers.NoSQLProvider)
		docJSON := fmt.Sprintf(`{"_id": "%s", "value": %s}`, key, valJSON)
		_, err := noSqlProv.DocInsert(ctx, "dbmux", "state", docJSON)
		return err

	case PrioritySQLite:
		sqlProv, _ := l2Prov.(providers.SQLProvider)
		query := `
			CREATE TABLE IF NOT EXISTS dbmux_state (
				key TEXT PRIMARY KEY,
				value TEXT NOT NULL,
				updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				expire_at DATETIME NULL
			);
		`
		_, _ = sqlProv.Exec(ctx, query, nil)

		upsertQuery := `
			INSERT INTO dbmux_state (key, value, expire_at)
			VALUES (?, ?, ?)
			ON CONFLICT(key) DO UPDATE
			SET value = excluded.value, expire_at = excluded.expire_at, updated_at = CURRENT_TIMESTAMP;
		`
		expVal := ""
		if ttlSeconds > 0 {
			expVal = time.Now().Add(time.Duration(ttlSeconds) * time.Second).Format(time.RFC3339)
		}
		_, err := sqlProv.Exec(ctx, upsertQuery, []string{key, valJSON, expVal})
		return err
	}

	return nil
}

// GetState reads state key-value data from L1 Redis cache first, falling back to L2 Persistent DB.
func (se *StateEngine) GetState(ctx context.Context, key string) (string, bool, error) {
	// 1. Check L1 Compulsory Cache (Redis / Valkey)
	if l1, ok := se.FindL1KVProvider(); ok {
		res, err := l1.Get(ctx, key)
		if err == nil && res != nil && res.Found {
			return res.Value, true, nil
		}
	}

	// 2. Fallback to L2 Persistent DB Store based on priority hierarchy
	l2Prov, prio, ok := se.FindL2PersistentProvider()
	if !ok {
		return "", false, nil
	}

	switch prio {
	case PriorityPostgres:
		sqlProv, _ := l2Prov.(providers.SQLProvider)
		query := `SELECT value::text FROM dbmux_state WHERE key = $1 AND (expire_at IS NULL OR expire_at > CURRENT_TIMESTAMP);`
		res, err := sqlProv.Query(ctx, query, []string{key})
		if err == nil && len(res.Rows) > 0 {
			val := res.Rows[0].Values["value"]
			// Populate L1 cache
			if l1, ok := se.FindL1KVProvider(); ok {
				_, _ = l1.Set(ctx, key, val, 3600)
			}
			return val, true, nil
		}

	case PriorityMySQL:
		sqlProv, _ := l2Prov.(providers.SQLProvider)
		query := `SELECT ` + "`value`" + ` FROM dbmux_state WHERE ` + "`key`" + ` = ? AND (` + "`expire_at`" + ` IS NULL OR ` + "`expire_at`" + ` > NOW());`
		res, err := sqlProv.Query(ctx, query, []string{key})
		if err == nil && len(res.Rows) > 0 {
			val := res.Rows[0].Values["value"]
			if l1, ok := se.FindL1KVProvider(); ok {
				_, _ = l1.Set(ctx, key, val, 3600)
			}
			return val, true, nil
		}

	case PriorityMongo:
		noSqlProv, _ := l2Prov.(providers.NoSQLProvider)
		filterJSON := fmt.Sprintf(`{"_id": "%s"}`, key)
		res, err := noSqlProv.DocFind(ctx, "dbmux", "state", filterJSON, 1)
		if err == nil && len(res.DocumentsJson) > 0 {
			val := res.DocumentsJson[0]
			if l1, ok := se.FindL1KVProvider(); ok {
				_, _ = l1.Set(ctx, key, val, 3600)
			}
			return val, true, nil
		}

	case PrioritySQLite:
		sqlProv, _ := l2Prov.(providers.SQLProvider)
		query := `SELECT value FROM dbmux_state WHERE key = ? AND (expire_at IS NULL OR expire_at > CURRENT_TIMESTAMP);`
		res, err := sqlProv.Query(ctx, query, []string{key})
		if err == nil && len(res.Rows) > 0 {
			val := res.Rows[0].Values["value"]
			if l1, ok := se.FindL1KVProvider(); ok {
				_, _ = l1.Set(ctx, key, val, 3600)
			}
			return val, true, nil
		}
	}

	return "", false, nil
}

// DeleteState deletes state from both L1 cache and L2 Persistent DB.
func (se *StateEngine) DeleteState(ctx context.Context, key string) error {
	// 1. Delete from L1 Cache
	if l1, ok := se.FindL1KVProvider(); ok {
		_, _ = l1.Del(ctx, key)
	}

	// 2. Delete from L2 Persistent Store
	l2Prov, prio, ok := se.FindL2PersistentProvider()
	if !ok {
		return nil
	}

	switch prio {
	case PriorityPostgres:
		sqlProv, _ := l2Prov.(providers.SQLProvider)
		_, err := sqlProv.Exec(ctx, "DELETE FROM dbmux_state WHERE key = $1;", []string{key})
		return err

	case PriorityMySQL:
		sqlProv, _ := l2Prov.(providers.SQLProvider)
		_, err := sqlProv.Exec(ctx, "DELETE FROM dbmux_state WHERE `key` = ?;", []string{key})
		return err

	case PrioritySQLite:
		sqlProv, _ := l2Prov.(providers.SQLProvider)
		_, err := sqlProv.Exec(ctx, "DELETE FROM dbmux_state WHERE key = ?;", []string{key})
		return err
	}

	return nil
}
