package sql

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	dbmuxv1 "dbmux/gen/dbmux/v1"
	"dbmux/pkg/providers"

	_ "github.com/go-sql-driver/mysql"
)

// MySQLProvider manages a connection pool to a MySQL database.
type MySQLProvider struct {
	id string
	db *sql.DB
}

var _ providers.SQLProvider = (*MySQLProvider)(nil)

// NewMySQLProvider initializes a MySQL connection pool with go-sql-driver/mysql.
func NewMySQLProvider(id, dsn string) (*MySQLProvider, error) {
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open mysql connection: %w", err)
	}

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(3 * time.Minute)

	return &MySQLProvider{
		id: id,
		db: db,
	}, nil
}

func (p *MySQLProvider) ID() string {
	return p.id
}

func (p *MySQLProvider) Category() dbmuxv1.DBCategory {
	return dbmuxv1.DBCategory_DB_CATEGORY_MYSQL
}

func (p *MySQLProvider) Query(ctx context.Context, query string, params []string) (*providers.SQLResult, error) {
	args := make([]any, len(params))
	for i, v := range params {
		args[i] = v
	}

	rows, err := p.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("mysql query failed: %w", err)
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
			return nil, fmt.Errorf("failed to scan mysql row: %w", err)
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
		return nil, fmt.Errorf("mysql rows iteration error: %w", err)
	}

	return &providers.SQLResult{
		Columns:      cols,
		Rows:         resultRows,
		RowsReturned: rowCount,
	}, nil
}

func (p *MySQLProvider) Exec(ctx context.Context, query string, params []string) (*providers.SQLResult, error) {
	args := make([]any, len(params))
	for i, v := range params {
		args[i] = v
	}

	res, err := p.db.ExecContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("mysql exec failed: %w", err)
	}

	rowsAffected, _ := res.RowsAffected()
	lastInsertId, _ := res.LastInsertId()

	return &providers.SQLResult{
		RowsAffected: rowsAffected,
		LastInsertId: lastInsertId,
	}, nil
}

func (p *MySQLProvider) Close() error {
	if p.db != nil {
		return p.db.Close()
	}
	return nil
}
