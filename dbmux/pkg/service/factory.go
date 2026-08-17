package service

import (
	"context"
	"fmt"
	"os"
	"strings"
	"sync"

	dbmuxv1 "dbmux/gen/dbmux/v1"
	"dbmux/pkg/auth"
	"dbmux/pkg/providers"
	"dbmux/pkg/registry"
)

type DriverFactoryFunc func(ctx context.Context, id, dsn string) (providers.Provider, error)

var (
	factoriesMu sync.RWMutex
	factories   = make(map[dbmuxv1.DBCategory]DriverFactoryFunc)
)

func registerDriverFactory(category dbmuxv1.DBCategory, fn func(id, dsn string) (providers.Provider, error)) {
	factoriesMu.Lock()
	defer factoriesMu.Unlock()
	factories[category] = func(ctx context.Context, id, dsn string) (providers.Provider, error) {
		return fn(id, dsn)
	}
}

func registerDriverFactoryCtx(category dbmuxv1.DBCategory, fn DriverFactoryFunc) {
	factoriesMu.Lock()
	defer factoriesMu.Unlock()
	factories[category] = fn
}

func createProviderWithMetadata(ctx context.Context, category dbmuxv1.DBCategory, id, dsn string, metadata map[string]string) (providers.Provider, error) {
	// Extract explicit auth_token, api_key, or password from metadata if passed separately
	var token string
	if metadata != nil {
		for _, key := range []string{"auth_token", "authToken", "token", "api_key", "apiKey", "password"} {
			if v, ok := metadata[key]; ok && v != "" {
				token = v
				break
			}
		}
	}

	// Auto-resolve IAM/K8s cloud token if $TOKEN / {TOKEN} placeholder is present
	if strings.Contains(dsn, "$TOKEN") || strings.Contains(dsn, "{TOKEN}") {
		resolvedTok, err := auth.ResolveAuthToken(ctx, "")
		if err == nil && resolvedTok != "" {
			token = resolvedTok
		}
	}

	if token != "" {
		if strings.Contains(dsn, "$TOKEN") || strings.Contains(dsn, "{TOKEN}") {
			dsn = strings.ReplaceAll(dsn, "$TOKEN", token)
			dsn = strings.ReplaceAll(dsn, "{TOKEN}", token)
		} else {
			// Append token to URL based on DB Category if not already in DSN
			switch category {
			case dbmuxv1.DBCategory_DB_CATEGORY_SQLITE: // Turso / LibSQL
				if !strings.Contains(dsn, "authToken=") {
					if strings.Contains(dsn, "?") {
						dsn += "&authToken=" + token
					} else {
						dsn += "?authToken=" + token
					}
				}
			case dbmuxv1.DBCategory_DB_CATEGORY_VECTOR: // Qdrant / Vector
				if !strings.Contains(dsn, "api_key=") {
					if strings.Contains(dsn, "?") {
						dsn += "&api_key=" + token
					} else {
						dsn += "?api_key=" + token
					}
				}
			}
		}
	}

	factoriesMu.RLock()
	fn, ok := factories[category]
	factoriesMu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("driver category %v is not compiled into this binary build", category)
	}

	return fn(ctx, id, dsn)
}

func createProvider(ctx context.Context, category dbmuxv1.DBCategory, id, dsn string) (providers.Provider, error) {
	return createProviderWithMetadata(ctx, category, id, dsn, nil)
}

// AutoRegisterEnvProviders inspects environment variables and pre-registers default database connection pools.
func AutoRegisterEnvProviders(ctx context.Context, reg *registry.Registry) {
	envMappings := []struct {
		envKey   string
		id       string
		category dbmuxv1.DBCategory
	}{
		{"POSTGRES_DSN", "test-postgres", dbmuxv1.DBCategory_DB_CATEGORY_POSTGRES},
		{"MYSQL_DSN", "test-mysql", dbmuxv1.DBCategory_DB_CATEGORY_MYSQL},
		{"REDIS_DSN", "test-redis", dbmuxv1.DBCategory_DB_CATEGORY_REDIS},
		{"MONGO_DSN", "test-mongo", dbmuxv1.DBCategory_DB_CATEGORY_MONGO},
		{"SQLITE_DSN", "test-sqlite", dbmuxv1.DBCategory_DB_CATEGORY_SQLITE},
	}

	for _, item := range envMappings {
		dsn := getEnvTrimmed(item.envKey)
		// Register if DSN is set, or if it's SQLite (which auto-resolves if DSN is empty)
		if dsn != "" || item.category == dbmuxv1.DBCategory_DB_CATEGORY_SQLITE {
			p, err := createProvider(ctx, item.category, item.id, dsn)
			if err == nil && p != nil {
				_ = reg.Register(p)
				fmt.Printf("   - Auto-registered Provider: %s (%v)\n", item.id, item.category)
			}
		}
	}
}

func getEnvTrimmed(key string) string {
	return strings.TrimSpace(os.Getenv(key))
}
