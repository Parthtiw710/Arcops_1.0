package main

import (
	"log"
	"net/http"
	"os"
	"strings"

	"gateway/pkg"
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
	cfg := pkg.LoadConfig()

	pkg.InitLimiter()

	log.Printf("🚀 Starting ArcOps Single-User Gateway on port :%s", cfg.Port)
	log.Printf(" ├── ArcAuth Service -> %s", cfg.ArcAuthURL)
	log.Printf(" ├── DBMux Service   -> %s", cfg.DBMuxURL)
	log.Printf(" └── BuckStream S3   -> %s", cfg.BuckStreamURL)

	mux := http.NewServeMux()

	// 1. Health check & landing
	mux.HandleFunc("/health", pkg.HandleHealth(cfg))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"healthy","service":"ArcOps Single-User Gateway"}`))
	})

	// 2. ArcAuth Reverse Proxy (/api/auth/*)
	arcauthProxy, err := pkg.CreateReverseProxy(cfg.ArcAuthURL)
	if err != nil {
		log.Fatalf("Failed to initialize ArcAuth proxy: %v", err)
	}
	mux.Handle("/api/auth/", pkg.CorsMiddleware(pkg.RateLimitMiddleware(arcauthProxy)))
	mux.Handle("/api/auth", pkg.CorsMiddleware(pkg.RateLimitMiddleware(arcauthProxy)))

	// 3. DBMux ConnectRPC Proxy (/rpc/* and /dbmux.v1.*) — Enforce Auth
	dbmuxProxy, err := pkg.CreateReverseProxy(cfg.DBMuxURL)
	if err != nil {
		log.Fatalf("Failed to initialize DBMux proxy: %v", err)
	}
	mux.Handle("/rpc/", pkg.CorsMiddleware(pkg.EnforceAuthMiddleware(cfg, pkg.RateLimitMiddleware(http.StripPrefix("/rpc", dbmuxProxy)))))
	mux.Handle("/rpc", pkg.CorsMiddleware(pkg.EnforceAuthMiddleware(cfg, pkg.RateLimitMiddleware(http.StripPrefix("/rpc", dbmuxProxy)))))
	mux.Handle("/dbmux.v1.", pkg.CorsMiddleware(pkg.EnforceAuthMiddleware(cfg, pkg.RateLimitMiddleware(dbmuxProxy))))

	// 4. BuckStream S3 Storage Proxy (/api/storage/*) — Enforce Auth
	buckstreamProxy, err := pkg.CreateBuckStreamProxy(cfg)
	if err != nil {
		log.Fatalf("Failed to initialize BuckStream proxy: %v", err)
	}
	mux.Handle("/api/storage/", pkg.CorsMiddleware(pkg.EnforceAuthMiddleware(cfg, pkg.RateLimitMiddleware(http.StripPrefix("/api/storage", buckstreamProxy)))))
	mux.Handle("/api/storage", pkg.CorsMiddleware(pkg.EnforceAuthMiddleware(cfg, pkg.RateLimitMiddleware(http.StripPrefix("/api/storage", buckstreamProxy)))))

	// 5. Frontedge Cloudflare Pages Deployer Proxy (/api/frontedge/*) — Enforce Auth
	frontedgeProxy, err := pkg.CreateReverseProxy(cfg.FrontedgeURL)
	if err != nil {
		log.Fatalf("Failed to initialize Frontedge proxy: %v", err)
	}
	mux.Handle("/api/frontedge/", pkg.CorsMiddleware(pkg.EnforceAuthMiddleware(cfg, pkg.RateLimitMiddleware(frontedgeProxy))))
	mux.Handle("/api/frontedge", pkg.CorsMiddleware(pkg.EnforceAuthMiddleware(cfg, pkg.RateLimitMiddleware(frontedgeProxy))))

	// 6. OpenTelemetry Ingestion
	mux.Handle("/api/telemetry", pkg.CorsMiddleware(pkg.HandleTelemetryIngest(cfg)))

	log.Printf("[Single-User Gateway] Running on http://0.0.0.0:%s", cfg.Port)
	if err := http.ListenAndServe(":"+cfg.Port, pkg.RecoveryMiddleware(mux)); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}
