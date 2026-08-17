package secrets_test

import (
	"context"
	"os"
	"testing"

	"dbmux/pkg/secrets"
)

func TestSecretEngine_GetSecret(t *testing.T) {
	se := secrets.NewSecretEngine()
	ctx := context.Background()

	// Set test environment variable
	key := "TEST_DBMUX_SECRET_KEY"
	expectedVal := "secret_val_12345"
	os.Setenv(key, expectedVal)
	defer os.Unsetenv(key)

	val, found, err := se.GetSecret(ctx, "env", key)
	if err != nil {
		t.Fatalf("GetSecret failed: %v", err)
	}
	if !found {
		t.Fatalf("expected secret key %s to be found", key)
	}
	if val != expectedVal {
		t.Fatalf("expected secret val %s, got %s", expectedVal, val)
	}
}

func TestSecretEngine_GetBulkSecrets(t *testing.T) {
	se := secrets.NewSecretEngine()
	ctx := context.Background()

	key := "TEST_BULK_KEY_ABC"
	expectedVal := "bulk_secret_val_xyz"
	os.Setenv(key, expectedVal)
	defer os.Unsetenv(key)

	secMap, err := se.GetBulkSecrets(ctx, "env")
	if err != nil {
		t.Fatalf("GetBulkSecrets failed: %v", err)
	}
	if secMap[key] != expectedVal {
		t.Fatalf("expected bulk secret map[%s] = %s, got %s", key, expectedVal, secMap[key])
	}
}
