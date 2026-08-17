package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"BuckStream/pkg/storage"
)

// HandleDeploy parses a zip deployment upload, runs DNS checks, and extracts/uploads files.
func (h *Handler) HandleDeploy(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 10MB memory limit for multipart forms
	err := r.ParseMultipartForm(10 << 20)
	if err != nil {
		writeJSONError(w, "Failed to parse multipart form", http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeJSONError(w, "'file' zip archive parameter is required", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Extract siteName from ZIP filename (e.g. buckstream.zip -> buckstream)
	siteName := strings.TrimSuffix(header.Filename, filepath.Ext(header.Filename))
	if siteName == "" {
		writeJSONError(w, "Invalid zip archive filename", http.StatusBadRequest)
		return
	}

	var buf bytes.Buffer
	if _, err := io.Copy(&buf, file); err != nil {
		writeJSONError(w, "Failed to read zip upload", http.StatusInternalServerError)
		return
	}

	// Detect request scheme (http vs https)
	scheme := "http"
	if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}

	// Generate the subdomain URL dynamically based on the current request Host
	cdnURL := fmt.Sprintf("%s://%s.%s", scheme, siteName, r.Host)

	// Upload ZIP directly to the cloud storage bucket under sites/<siteName>.zip
	destKey := fmt.Sprintf("sites/%s.zip", siteName)
	intent := storage.UploadIntent{
		Bucket:      h.bucket,
		Key:         destKey,
		ContentType: "application/zip",
	}

	err = h.provider.UploadStream(r.Context(), intent, &buf)
	if err != nil {
		log.Printf("❌ [Deploy] Failed to upload zip: %v", err)
		writeJSONError(w, "Deployment failed due to an internal server error", http.StatusInternalServerError)
		return
	}

	// Invalidate RAM cache for this site first
	h.ClearSiteCache(siteName)

	// Pre-warm the cache asynchronously in the background so visitors get instant page loads
	go func(name string) {
		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
		defer cancel()
		log.Printf("🔥 [Cache] Pre-warming cache for newly deployed site: %s", name)
		if _, err := h.loadSiteCache(ctx, name); err != nil {
			log.Printf("⚠️ [Cache] Failed to pre-warm cache for site %s: %v", name, err)
		} else {
			log.Printf("✅ [Cache] Pre-warming complete for site: %s", name)
		}
	}(siteName)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"name": siteName,
		"url":  cdnURL,
	})
}
