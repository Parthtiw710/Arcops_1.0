package sql

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	dbmuxv1 "dbmux/gen/dbmux/v1"
	"dbmux/pkg/auth"
	"dbmux/pkg/providers"

	_ "github.com/jackc/pgx/v5/stdlib"
)

// PostgresProvider manages a connection pool to a PostgreSQL / Neon / Supabase database.
type PostgresProvider struct {
	id string
	db *sql.DB
}

var _ providers.SQLProvider = (*PostgresProvider)(nil)

// NewPostgresProvider initializes a PostgreSQL connection pool with pgx/v5.
func NewPostgresProvider(id, dsn string) (*PostgresProvider, error) {
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open postgres connection: %w", err)
	}

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)

	return &PostgresProvider{
		id: id,
		db: db,
	}, nil
}

func (p *PostgresProvider) ID() string {
	return p.id
}

func (p *PostgresProvider) Category() dbmuxv1.DBCategory {
	return dbmuxv1.DBCategory_DB_CATEGORY_POSTGRES
}

func (p *PostgresProvider) Query(ctx context.Context, query string, params []string) (*providers.SQLResult, error) {
	args := make([]any, len(params))
	for i, v := range params {
		args[i] = v
	}

	authCtx := auth.AuthFromContext(ctx)
	var rows *sql.Rows
	var err error

	// If request is from frontend (non-admin) with an authenticated UserID, execute within an RLS transaction
	if authCtx != nil && !authCtx.IsAdmin && authCtx.UserID != "" {
		tx, errTx := p.db.BeginTx(ctx, nil)
		if errTx != nil {
			return nil, fmt.Errorf("failed to begin RLS transaction: %w", errTx)
		}
		defer tx.Rollback()

		// Set PostgreSQL RLS session variables securely using parameterized set_config
		roleName := authCtx.Role
		if roleName == "" {
			roleName = "authenticated"
		}
		// Sanitize role identifier (must contain only alphanumeric and underscores)
		for _, r := range roleName {
			if !((r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_') {
				roleName = "authenticated"
				break
			}
		}

		if _, err := tx.ExecContext(ctx, "SELECT set_config('role', $1, true)", roleName); err != nil {
			// Fallback if role doesn't exist on server
			_ = err
		}
		_, _ = tx.ExecContext(ctx, "SELECT set_config('request.jwt.claim.sub', $1, true)", authCtx.UserID)

		rows, err = tx.QueryContext(ctx, query, args...)
		if err != nil {
			return nil, fmt.Errorf("postgres rls query failed: %w", err)
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
				return nil, fmt.Errorf("failed to scan postgres row: %w", err)
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

		if err := tx.Commit(); err != nil {
			return nil, fmt.Errorf("failed to commit rls transaction: %w", err)
		}

		return &providers.SQLResult{
			Columns:      cols,
			Rows:         resultRows,
			RowsReturned: rowCount,
		}, nil
	}

	// Non-RLS (Admin/Backend) Direct Query Execution
	rows, err = p.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("postgres query failed: %w", err)
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
			return nil, fmt.Errorf("failed to scan postgres row: %w", err)
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
		return nil, fmt.Errorf("postgres rows iteration error: %w", err)
	}

	return &providers.SQLResult{
		Columns:      cols,
		Rows:         resultRows,
		RowsReturned: rowCount,
	}, nil
}

func (p *PostgresProvider) Exec(ctx context.Context, query string, params []string) (*providers.SQLResult, error) {
	args := make([]any, len(params))
	for i, v := range params {
		args[i] = v
	}

	res, err := p.db.ExecContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("postgres exec failed: %w", err)
	}

	rowsAffected, _ := res.RowsAffected()

	return &providers.SQLResult{
		RowsAffected: rowsAffected,
	}, nil
}

func (p *PostgresProvider) Close() error {
	if p.db != nil {
		return p.db.Close()
	}
	return nil
}
