package sql

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"time"

	dbmuxv1 "dbmux/gen/dbmux/v1"
	"dbmux/pkg/providers"

	_ "modernc.org/sqlite"
)

// LibSQLProvider manages connections to a SQLite database.
// If SQLITE_DATA_DIR is set and the directory exists (persistent volume mounted),
// it uses a file-based database with WAL mode for concurrent reads.
// Otherwise it falls back to an in-memory database.
type LibSQLProvider struct {
	id string
	db *sql.DB
}

var _ providers.SQLProvider = (*LibSQLProvider)(nil)

// resolveSQLiteDSN returns a file-based DSN if a persistent volume is detected,
// otherwise returns an in-memory DSN. No bloat — single os.Stat call.
func resolveSQLiteDSN(id string) string {
	if dir := os.Getenv("SQLITE_DATA_DIR"); dir != "" {
		if _, err := os.Stat(dir); err == nil {
			// Volume is mounted — use WAL mode for concurrent readers, no race on writes
			path := filepath.Join(dir, id+".db")
			return path + "?_journal_mode=WAL&_busy_timeout=5000&_synchronous=NORMAL"
		}
	}
	// No volume — safe in-memory fallback
	return "file:" + id + "?mode=memory&cache=shared&_journal_mode=WAL"
}

// NewLibSQLProvider opens a SQLite connection with race-safe settings.
// MaxOpenConns(1) enforces single-writer access (SQLite allows many readers, one writer).
func NewLibSQLProvider(id, dsn string) (*LibSQLProvider, error) {
	if dsn == "" {
		dsn = resolveSQLiteDSN(id)
	}

	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("sqlite open failed: %w", err)
	}

	// Single writer enforced — prevents SQLITE_BUSY race conditions
	db.SetMaxOpenConns(1)

	return &LibSQLProvider{id: id, db: db}, nil
}

func (p *LibSQLProvider) ID() string {
	return p.id
}

func (p *LibSQLProvider) Category() dbmuxv1.DBCategory {
	return dbmuxv1.DBCategory_DB_CATEGORY_SQLITE
}

func (p *LibSQLProvider) Query(ctx context.Context, query string, params []string) (*providers.SQLResult, error) {
	args := make([]any, len(params))
	for i, v := range params {
		args[i] = v
	}

	rows, err := p.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("libsql query failed: %w", err)
	}
	defer rows.Close()

	cols, err := rows.Columns()
	if err != nil {
		return nil, fmt.Errorf("failed to get result columns: %w", err)
	}

	var resultRows []*dbmuxv1.SQLRow
	var rowCount int64

	for rows.Next() {
		values := make([]any, len(cols))
		scanArgs := make([]any, len(cols))
		for i := range values {
			scanArgs[i] = &values[i]
		}

		if err := rows.Scan(scanArgs...); err != nil {
			return nil, fmt.Errorf("failed to scan libsql row: %w", err)
		}

		rowMap := make(map[string]string)
		for i, colName := range cols {
			val := values[i]
			if val == nil {
				rowMap[colName] = ""
				continue
			}

			switch v := val.(type) {
			case []byte:
				rowMap[colName] = string(v)
			case time.Time:
				rowMap[colName] = v.Format(time.RFC3339)
			default:
				rowMap[colName] = fmt.Sprintf("%v", v)
			}
		}

		resultRows = append(resultRows, &dbmuxv1.SQLRow{Values: rowMap})
		rowCount++
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("libsql rows iteration error: %w", err)
	}

	return &providers.SQLResult{
		Columns:      cols,
		Rows:         resultRows,
		RowsReturned: rowCount,
	}, nil
}

func (p *LibSQLProvider) Exec(ctx context.Context, query string, params []string) (*providers.SQLResult, error) {
	args := make([]any, len(params))
	for i, v := range params {
		args[i] = v
	}

	res, err := p.db.ExecContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("libsql exec failed: %w", err)
	}

	rowsAffected, _ := res.RowsAffected()
	lastInsertId, _ := res.LastInsertId()

	return &providers.SQLResult{
		RowsAffected: rowsAffected,
		LastInsertId: lastInsertId,
	}, nil
}

func (p *LibSQLProvider) Close() error {
	if p.db != nil {
		return p.db.Close()
	}
	return nil
}
