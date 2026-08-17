package telemetry_test

import (
	"context"
	"os"
	"testing"

	"dbmux/pkg/telemetry"
)

func TestInitTelemetry_DormantWhenEmpty(t *testing.T) {
	os.Unsetenv("OTEL_EXPORTER_OTLP_ENDPOINT")

	ctx := context.Background()
	shutdown, err := telemetry.InitTelemetry(ctx)
	if err != nil {
		t.Fatalf("InitTelemetry failed: %v", err)
	}
	if shutdown == nil {
		t.Fatalf("expected non-nil shutdown function")
	}

	// Verify calling shutdown does not panic
	shutdown()
}
