package pkg

import (
	"encoding/json"
	"io"
	"net/http"
	"sync"
	"time"
)

func HandleHealth(cfg GatewayConfig) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"status":    "healthy",
			"service":   "ArcOps Single-User Gateway",
			"timestamp": time.Now().UTC().Format(time.RFC3339),
			"upstreams": map[string]string{
				"arcauth":    cfg.ArcAuthURL,
				"dbmux":      cfg.DBMuxURL,
				"buckstream": cfg.BuckStreamURL,
			},
		})
	}
}

var telemetryBuffer []map[string]interface{}
var telemetryMu sync.Mutex

func HandleTelemetryIngest(cfg GatewayConfig) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
			return
		}
		body, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "Failed to read payload", http.StatusBadRequest)
			return
		}
		var payload map[string]interface{}
		if err := json.Unmarshal(body, &payload); err == nil {
			telemetryMu.Lock()
			telemetryBuffer = append(telemetryBuffer, payload)
			if len(telemetryBuffer) > 500 {
				telemetryBuffer = telemetryBuffer[1:]
			}
			telemetryMu.Unlock()
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte(`{"status":"accepted"}`))
	}
}
