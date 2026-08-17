package secrets

import (
	"context"
	"fmt"
	"os"
	"strings"
	"sync"

	"dbmux/pkg/auth"
)

// SecretEngine provides unified, zero-bloat access to application secrets across Environment variables, Cloud IAM, and K8s.
type SecretEngine struct{}

func NewSecretEngine() *SecretEngine {
	return &SecretEngine{}
}

// GetSecret retrieves a secret by key from environment variables or Cloud Metadata IAM.
func (se *SecretEngine) GetSecret(ctx context.Context, storeName, secretKey string) (string, bool, error) {
	// Priority 1: Check Environment variables & .env
	if val := os.Getenv(secretKey); val != "" {
		return val, true, nil
	}

	// Priority 2: Check Cloud Metadata / IAM Auto-Provider Token
	if secretKey == "CLOUD_IAM_TOKEN" {
		if token, err := auth.ResolveAuthToken(ctx, "auto"); err == nil && token != "" {
			return token, true, nil
		}
	}

	return "", false, nil
}

// GetBulkSecrets returns all environment & configured secrets as a map.
func (se *SecretEngine) GetBulkSecrets(ctx context.Context, storeName string) (map[string]string, error) {
	secretsMap := make(map[string]string)
	for _, env := range os.Environ() {
		pair := strings.SplitN(env, "=", 2)
		if len(pair) == 2 {
			secretsMap[pair[0]] = pair[1]
		}
	}
	return secretsMap, nil
}

var (
	dynamicSecrets   = make(map[string]string)
	dynamicSecretsMu sync.RWMutex
)

func (se *SecretEngine) SetSecret(ctx context.Context, storeName, secretKey, secretValue string) error {
	if secretKey == "" {
		return fmt.Errorf("invalid secret key")
	}
	dynamicSecretsMu.Lock()
	dynamicSecrets[secretKey] = secretValue
	dynamicSecretsMu.Unlock()
	return nil
}

func (se *SecretEngine) DeleteSecret(ctx context.Context, storeName, secretKey string) error {
	if secretKey == "" {
		return nil
	}
	dynamicSecretsMu.Lock()
	delete(dynamicSecrets, secretKey)
	dynamicSecretsMu.Unlock()
	return nil
}
