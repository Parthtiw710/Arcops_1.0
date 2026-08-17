package main

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"connectrpc.com/connect"
	"connectrpc.com/grpchealth"
	"connectrpc.com/grpcreflect"
	"dbmux/gen/dbmux/v1/dbmuxv1connect"
	"dbmux/pkg/auth"
	"dbmux/pkg/registry"
	"dbmux/pkg/service"
	"dbmux/pkg/telemetry"

	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"
)

//go:embed public
var publicFS embed.FS

type jsonCodec struct{}

func (c jsonCodec) Name() string { return "json" }
func (c jsonCodec) Marshal(v any) ([]byte, error) {
	return json.Marshal(v)
}
func (c jsonCodec) Unmarshal(b []byte, v any) error {
	return json.Unmarshal(b, v)
}

func main() {
	// ---------------------------------------------------------------------------
	// CLI: -healthcheck flag for Docker scratch container health probes
	// ---------------------------------------------------------------------------
	// Check for healthcheck flag in os.Args (handles Docker ENTRYPOINT + CMD concatenation)
	for _, arg := range os.Args[1:] {
		if arg == "-healthcheck" || arg == "--healthcheck" {
			client := &http.Client{Timeout: 2 * time.Second}
			resp, err := client.Get("http://127.0.0.1:8080/healthz")
			if err != nil || resp.StatusCode != 200 {
				os.Exit(1)
			}
			os.Exit(0)
		}
	}

	// Auto-load .env configuration file if present
	auth.LoadEnv(".env")

	// Initialize OpenTelemetry distributed tracing (if OTEL_EXPORTER_OTLP_ENDPOINT is configured)
	shutdownTelemetry, err := telemetry.InitTelemetry(context.Background())
	if err != nil {
		log.Printf("[Warning] Failed to initialize telemetry: %v", err)
	}
	defer shutdownTelemetry()

	// Read master auth keys and secrets from environment
	anonKey := os.Getenv("DBMUX_ANON_KEY")
	serviceKey := os.Getenv("DBMUX_SERVICE_ROLE_KEY")
	jwtSecret := os.Getenv("DBMUX_JWT_SECRET")

	// Initialize thread-safe dynamic Provider Registry
	reg := registry.NewRegistry()

	// Initialize DBMux Connect-Go RPC Server
	server := service.NewServer(reg)

	// Auto-register default environment providers if DSN env vars are present
	service.AutoRegisterEnvProviders(context.Background(), reg)

	// Create ConnectRPC Recovery, Auth & Capability Interceptors
	recoveryInterceptor := auth.NewRecoveryInterceptor()
	authInterceptor := auth.NewAuthInterceptor(anonKey, serviceKey, jwtSecret)
	capInterceptor := auth.NewCapabilityInterceptor(reg)
	handlerOpts := []connect.HandlerOption{
		connect.WithInterceptors(recoveryInterceptor, authInterceptor, capInterceptor),
		connect.WithCodec(jsonCodec{}),
	}

	// Configure standard Go net/http router
	mux := http.NewServeMux()

	// Health check endpoint (used by Docker, k6 setup(), and Kubernetes probes)
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("OK"))
	})

	// Register modular Connect-Go RPC Handlers with Auth Interceptor onto net/http mux
	regPath, regHandler := dbmuxv1connect.NewRegistryHandler(server.Registry, handlerOpts...)
	mux.Handle(regPath, regHandler)

	pgPath, pgHandler := dbmuxv1connect.NewPostgresHandler(server.Postgres, handlerOpts...)
	mux.Handle(pgPath, pgHandler)

	myPath, myHandler := dbmuxv1connect.NewMySQLHandler(server.MySQL, handlerOpts...)
	mux.Handle(myPath, myHandler)

	sqPath, sqHandler := dbmuxv1connect.NewSQLiteHandler(server.SQLite, handlerOpts...)
	mux.Handle(sqPath, sqHandler)

	kvPath, kvHandler := dbmuxv1connect.NewKVHandler(server.KV, handlerOpts...)
	mux.Handle(kvPath, kvHandler)

	mongoPath, mongoHandler := dbmuxv1connect.NewMongoHandler(server.Mongo, handlerOpts...)
	mux.Handle(mongoPath, mongoHandler)

	vecPath, vecHandler := dbmuxv1connect.NewVectorHandler(server.Vector, handlerOpts...)
	mux.Handle(vecPath, vecHandler)

	statePath, stateHandler := dbmuxv1connect.NewStateHandler(server.State, handlerOpts...)
	mux.Handle(statePath, stateHandler)

	cronPath, cronHandler := dbmuxv1connect.NewCronHandler(server.Cron, handlerOpts...)
	mux.Handle(cronPath, cronHandler)

	secretPath, secretHandler := dbmuxv1connect.NewSecretHandler(server.Secret, handlerOpts...)
	mux.Handle(secretPath, secretHandler)

	pubsubPath, pubsubHandler := dbmuxv1connect.NewPubSubHandler(server.PubSub, handlerOpts...)
	mux.Handle(pubsubPath, pubsubHandler)

	queuePath, queueHandler := dbmuxv1connect.NewQueueHandler(server.Queue, handlerOpts...)
	mux.Handle(queuePath, queueHandler)

	// Serve public static assets (index.html at /, index.png) from embedded FS
	if publicSubFS, err := fs.Sub(publicFS, "public"); err == nil {
		fileServer := http.FileServer(http.FS(publicSubFS))
		mux.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/" {
				r.URL.Path = "/index.html"
			}
			fileServer.ServeHTTP(w, r)
		}))
	}

	// ---------------------------------------------------------------------------
	// gRPC Health Check (grpc.health.v1.Health/Check) — standard gRPC protocol
	// Enables native gRPC clients and load balancers to probe readiness.
	// ConnectRPC serves this on the same port alongside all other handlers.
	// ---------------------------------------------------------------------------
	healthChecker := grpchealth.NewStaticChecker(
		dbmuxv1connect.RegistryName,
		dbmuxv1connect.PostgresName,
		dbmuxv1connect.MySQLName,
		dbmuxv1connect.SQLiteName,
		dbmuxv1connect.KVName,
		dbmuxv1connect.MongoName,
		dbmuxv1connect.VectorName,
	)
	grpcHealthPath, grpcHealthHandler := grpchealth.NewHandler(healthChecker)
	mux.Handle(grpcHealthPath, grpcHealthHandler)

	// ---------------------------------------------------------------------------
	// gRPC Server Reflection — enables grpcurl, Postman, and gRPC CLI discovery.
	// Controlled by DBMUX_ENABLE_REFLECTION env var (default: enabled).
	// ---------------------------------------------------------------------------
	if os.Getenv("DBMUX_ENABLE_REFLECTION") != "false" {
		reflector := grpcreflect.NewStaticReflector(
			dbmuxv1connect.RegistryName,
			dbmuxv1connect.PostgresName,
			dbmuxv1connect.MySQLName,
			dbmuxv1connect.SQLiteName,
			dbmuxv1connect.KVName,
			dbmuxv1connect.MongoName,
			dbmuxv1connect.VectorName,
		)
		reflectPath1, reflectHandler1 := grpcreflect.NewHandlerV1(reflector)
		reflectPath1Alpha, reflectHandler1Alpha := grpcreflect.NewHandlerV1Alpha(reflector)
		mux.Handle(reflectPath1, reflectHandler1)
		mux.Handle(reflectPath1Alpha, reflectHandler1Alpha)
		fmt.Println("   - gRPC Reflection:   [Enabled]")
	}

	// ---------------------------------------------------------------------------
	// CORS middleware for gRPC-Web browser clients
	// ConnectRPC handles gRPC/gRPC-Web/Connect protocol auto-detection on every
	// handler — the protocol priority (gRPC > gRPC-Web > Connect HTTP) is
	// determined by the client's Content-Type header, not the server.
	// ---------------------------------------------------------------------------
	corsHandler := withCORS(mux)

	port := ":8080"
	fmt.Printf("🚀 dbmux Gateway listening on http://localhost%s\n", port)
	fmt.Println("   Protocol Support: gRPC | gRPC-Web | Connect (HTTP/JSON)")
	fmt.Println("   Security Settings:")
	if anonKey != "" {
		fmt.Println("   - Public Anon Key:       [Configured]")
	}
	if serviceKey != "" {
		fmt.Println("   - Service Role Key:     [Configured]")
	}
	fmt.Println("   Modular Connect-Go Endpoints:")
	fmt.Printf("   - Registry: %s\n", regPath)
	fmt.Printf("   - Postgres: %s\n", pgPath)
	fmt.Printf("   - MySQL:    %s\n", myPath)
	fmt.Printf("   - SQLite:   %s\n", sqPath)
	fmt.Printf("   - KV:       %s\n", kvPath)
	fmt.Printf("   - Mongo:    %s\n", mongoPath)
	fmt.Printf("   - Vector:   %s\n", vecPath)
	fmt.Printf("   - Health:   %s\n", grpcHealthPath)

	// Wrap net/http router with h2c (HTTP/2 without TLS requirement for gRPC/HTTP2)
	h2cHandler := h2c.NewHandler(corsHandler, &http2.Server{})

	srv := &http.Server{
		Addr:    port,
		Handler: h2cHandler,
	}

	// ---------------------------------------------------------------------------
	// Graceful shutdown: close all DB connections cleanly on SIGINT/SIGTERM
	// ---------------------------------------------------------------------------
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		sig := <-sigCh
		fmt.Printf("\n🛑 Received %s — shutting down gracefully...\n", sig)

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		// Stop accepting new connections, drain in-flight requests
		if err := srv.Shutdown(ctx); err != nil {
			log.Printf("HTTP server shutdown error: %v", err)
		}

		// Close all database provider connections
		reg.CloseAll()
		fmt.Println("✅ All providers closed. Goodbye!")
	}()

	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Server failed: %v", err)
	}
}

// withCORS adds permissive CORS headers for gRPC-Web browser clients.
// In production, restrict AllowedOrigins to your actual frontend domains.
func withCORS(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin == "" {
			origin = "*"
		}
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers",
			"Content-Type, Connect-Protocol-Version, Connect-Timeout-Ms, Grpc-Timeout, X-Grpc-Web, X-User-Agent, X-Anon-Key, X-Service-Role-Key, Authorization")
		w.Header().Set("Access-Control-Expose-Headers",
			"Grpc-Status, Grpc-Message, Grpc-Status-Details-Bin")
		w.Header().Set("Access-Control-Max-Age", "7200")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		h.ServeHTTP(w, r)
	})
}
