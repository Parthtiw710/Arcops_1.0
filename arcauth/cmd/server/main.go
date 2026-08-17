package main

import (
	"log"
	"net/http"
	"os"
	"strings"

	"arcauth/pkg/authservice"
)

func loadDotEnv(filename string) {
	paths := []string{filename, "../deploy/.env", "deploy/.env", "../../deploy/.env"}
	var data []byte
	var err error
	for _, p := range paths {
		if data, err = os.ReadFile(p); err == nil && len(data) > 0 {
			break
		}
	}
	if len(data) == 0 {
		return
	}
	lines := strings.Split(string(data), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			key := strings.TrimSpace(parts[0])
			val := strings.TrimSpace(parts[1])
			val = strings.Trim(val, " \"'")
			if os.Getenv(key) == "" {
				os.Setenv(key, val)
			}
		}
	}
}

func main() {
	loadDotEnv(".env")

	port := os.Getenv("ARCAUTH_PORT")
	if port == "" {
		port = os.Getenv("AUTHX_PORT")
	}
	if port == "" {
		port = "8081"
	}

	dbDSN := os.Getenv("DATABASE_URL")
	redisURL := os.Getenv("REDIS_URL")

	svc, err := authservice.NewAuthService(dbDSN, redisURL)
	if err != nil {
		log.Fatalf("Failed to initialize ArcAuth microservice: %v", err)
	}

	mux := http.NewServeMux()

	// Health check endpoint for Docker & K8s probes
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("OK"))
	})

	svc.RegisterRoutes(mux)

	log.Printf("[ArcAuth] Microservice running on http://0.0.0.0:%s", port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatalf("Server shutdown error: %v", err)
	}
}
