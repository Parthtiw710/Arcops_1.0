package dbmux_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	dbmux "dbmux/sdk/go"
)

// TestGoSDK_CapabilityBitmaskGuard verifies fast client-side fail guard when Redis capability bit is 0.
func TestGoSDK_CapabilityBitmaskGuard(t *testing.T) {
	// Mock server returning capabilities header = 1 (Postgres only, Redis missing)
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-DBMux-Capabilities", "1") // Postgres=1, Redis=0
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"providers": []}`))
	}))
	defer ts.Close()

	client, err := dbmux.NewClient(dbmux.Options{BaseURL: ts.URL})
	if err != nil {
		t.Fatalf("NewClient failed: %v", err)
	}

	// Init fetches capabilities mask = 1
	if err := client.Init(context.Background()); err != nil {
		t.Fatalf("Init failed: %v", err)
	}

	// PubSub should fail immediately on client side with ErrRedisNotConfigured
	_, err = client.PubSub.Publish(context.Background(), "orders", "payload")
	if err != dbmux.ErrRedisNotConfigured {
		t.Fatalf("expected ErrRedisNotConfigured, got %v", err)
	}
	t.Logf("Got expected fast client-side error: %v", err)
}

// TestGoSDK_HeaderPiggybackSync verifies response header X-DBMux-Capabilities dynamically updates bitmask.
func TestGoSDK_HeaderPiggybackSync(t *testing.T) {
	var currentCap uint32 = 1 // Starts with Postgres=1
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		val := "1"
		if atomic.LoadUint32(&currentCap) == 9 {
			val = "9"
		}
		w.Header().Set("X-DBMux-Capabilities", val)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"success": true}`))
	}))
	defer ts.Close()

	client, _ := dbmux.NewClient(dbmux.Options{BaseURL: ts.URL})
	_ = client.Init(context.Background())

	// PubSub fails initially (Redis=0)
	_, err := client.PubSub.Publish(context.Background(), "orders", "payload")
	if err != dbmux.ErrRedisNotConfigured {
		t.Fatalf("expected ErrRedisNotConfigured initially, got %v", err)
	}

	// Server dynamically registers Redis -> CapMask becomes 9 (Postgres=1 + Redis=8)
	atomic.StoreUint32(&currentCap, 9)

	// Make any request (e.g. State) -> piggybacked header updates SDK bitmask to 9
	_, err = client.State.SaveState(context.Background(), "default", "k", "v", 60)
	if err != nil {
		t.Fatalf("SaveState failed: %v", err)
	}

	if mask := client.GetCapabilitiesMask(); mask != 9 {
		t.Fatalf("expected capabilities mask 9 after header sync, got %d", mask)
	}

	// PubSub now passes client-side preflight check!
	_, err = client.PubSub.Publish(context.Background(), "orders", "payload")
	if err != nil {
		t.Fatalf("PubSub failed after header sync: %v", err)
	}
}
