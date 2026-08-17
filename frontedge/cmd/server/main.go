package main

import (
	"log"
	"net/http"
	"os"

	"frontedge/pkg/frontedge"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8083"
	}

	log.Printf("🚀 Starting Frontedge Single-User Deployer Service on port :%s", port)

	svc := frontedge.NewService()
	mux := http.NewServeMux()
	svc.RegisterRoutes(mux)

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"healthy","service":"Frontedge Single-User Deployer"}`))
	})

	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}
