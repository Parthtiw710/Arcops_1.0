package main

import (
	"context"
	"embed"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"BuckStream/pkg/config"
	"BuckStream/pkg/handler"
	"BuckStream/pkg/middleware"
	"BuckStream/pkg/storage"
)

//go:embed public
var publicFS embed.FS

func main() {
	// 1. Load the configuration
	cfg := config.LoadConfig()

	log.Println("⚙️ BuckStream configuration loaded successfully.")
	log.Printf("   - S3 IAM: %t | GCS IAM: %t | Token Auth: %t",
		cfg.S3ByIAM, cfg.GCSByIAM, cfg.S3CompatibleByToken)

	if cfg.BucketName == "" {
		log.Fatalf("❌ Error: BUCKET_NAME is not set in environment configurations.")
	}

	// 2. Initialize the correct storage provider client
	ctx := context.Background()
	provider, err := storage.NewProvider(ctx, cfg)
	if err != nil {
		log.Fatalf("❌ Failed to initialize storage client: %v", err)
	}

	// 3. Initialize HTTP handlers context
	h := handler.NewHandler(cfg, provider, cfg.BucketName)

	// 4. Register HTTP routes
	deployAuth := middleware.AuthRequired(cfg.DeployToken)
	uploadAuth := middleware.AuthRequired(cfg.UploadToken)
	corsMiddleware := middleware.CORSMiddleware(cfg.AllowedDomains)

	// Deploy: Token Auth only (CORS excluded)
	http.Handle("/api/deploy", deployAuth(http.HandlerFunc(h.HandleDeploy)))
	http.Handle("/api/deploy/delete", deployAuth(h.HandleDeleteObject("sites/")))
	http.Handle("/api/deploy/list", deployAuth(h.HandleListObjects("sites/")))

	// Public Health Check
	http.Handle("/api/health", corsMiddleware(http.HandlerFunc(h.HandleHealth)))

	// Upload & Downloads: CORS + Token Auth
	http.Handle("/api/upload-intent", corsMiddleware(uploadAuth(http.HandlerFunc(h.HandleUploadIntent))))
	http.Handle("/api/upload/proxy", corsMiddleware(uploadAuth(http.HandlerFunc(h.HandleUploadProxy))))
	http.Handle("/api/delete", corsMiddleware(uploadAuth(h.HandleDeleteObject("uploads/"))))
	http.Handle("/api/list", corsMiddleware(uploadAuth(h.HandleListObjects("uploads/"))))
	http.Handle("/api/download/", corsMiddleware(http.HandlerFunc(h.HandleProxyOrStatic)))

	// Serve static files from embedded FS (favicon.ico etc.)
	http.Handle("/public/", http.FileServer(http.FS(publicFS)))

	// Mount landing page on / for main domain requests, or pass to HandleProxyOrStatic for subdomains
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		host := r.Host
		if xfh := r.Header.Get("X-Forwarded-Host"); xfh != "" {
			host = xfh
		}
		hostName := host
		if idx := strings.Index(host, ":"); idx != -1 {
			hostName = host[:idx]
		}
		isSubdomain, _ := h.IsSubdomain(hostName)

		if isSubdomain {
			corsMiddleware(http.HandlerFunc(h.HandleProxyOrStatic)).ServeHTTP(w, r)
			return
		}

		// Serve index.html from embedded FS for main domain requests
		indexContent, err := publicFS.ReadFile("public/index.html")
		if err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(indexContent)
	})

	// 5. Start HTTP Server with Graceful Shutdown
	srv := &http.Server{
		Addr:    ":8080",
		Handler: nil, // Uses http.DefaultServeMux
	}

	go func() {
		log.Println("🚀 BuckStream storage broker listening on :8080...")
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	// Wait for interrupt signal to gracefully shut down the server
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)
	<-quit

	log.Println("⚠️ Shutting down BuckStream storage broker gracefully...")

	// 15 seconds shutdown timeout context
	ctxShutdown, cancelShutdown := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancelShutdown()

	if err := srv.Shutdown(ctxShutdown); err != nil {
		log.Fatalf("❌ Server forced to shutdown: %v", err)
	}

	log.Println("✅ BuckStream storage broker exited cleanly.")
}
