package handler

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"BuckStream/pkg/config"
	"BuckStream/pkg/storage"
)

type cachedFile struct {
	content     []byte
	contentType string
	etag        string
}

// Handler handles incoming HTTP API and static file proxy requests.
type Handler struct {
	cfg      *config.Config
	provider storage.StorageProvider
	bucket   string
	cache    *LRUCache
	loadMu   sync.Mutex // Serializes S3/GCS downloads on cache misses
}

// NewHandler creates a new Handler instance with an initialized cache.
func NewHandler(cfg *config.Config, provider storage.StorageProvider, bucket string) *Handler {
	h := &Handler{
		cfg:      cfg,
		provider: provider,
		bucket:   bucket,
		cache:    NewLRUCache(cfg.MaxCachedSites),
	}

	// Start background cache cleaner/janitor (sweeps every 5 minutes, evicts inactive sites after 1 hour)
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		for range ticker.C {
			h.cache.EvictExpired(1 * time.Hour)
		}
	}()

	return h
}

// IsSubdomain checks if a hostName is a subdomain request relative to the configured root domain.
// It returns whether it is a subdomain and the extracted subdomain/siteID string.
func (h *Handler) IsSubdomain(hostName string) (bool, string) {
	// Clean port if any
	if idx := strings.Index(hostName, ":"); idx != -1 {
		hostName = hostName[:idx]
	}

	rootDomain := h.cfg.RootDomain
	if idx := strings.Index(rootDomain, ":"); idx != -1 {
		rootDomain = rootDomain[:idx]
	}

	if rootDomain == "" {
		// Fallback to split-by-dot logic if root domain is not configured
		hostParts := strings.Split(hostName, ".")
		if len(hostParts) > 2 {
			return true, hostParts[0]
		}
		if len(hostParts) == 2 && hostParts[1] == "localhost" {
			return true, hostParts[0]
		}
		return false, ""
	}

	if hostName == rootDomain {
		return false, ""
	}

	suffix := "." + rootDomain
	if strings.HasSuffix(hostName, suffix) {
		siteID := strings.TrimSuffix(hostName, suffix)
		// Extract only the first segment if there are nested subdomains (e.g. a.b.root -> siteID is a)
		if idx := strings.Index(siteID, "."); idx != -1 {
			siteID = siteID[:idx]
		}
		return true, siteID
	}

	// Fallback to make sure localhost:8080 and subdomains work even if ROOT_DOMAIN is configured differently
	if rootDomain != "localhost" && (hostName == "localhost" || strings.HasSuffix(hostName, ".localhost")) {
		hostParts := strings.Split(hostName, ".")
		if len(hostParts) == 2 && hostParts[1] == "localhost" {
			return true, hostParts[0]
		}
	}

	return false, ""
}

// HandleHealth responds with a simple plain-text health check status.
func (h *Handler) HandleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("api is healthy"))
}

// writeJSONError formats and sends a structured JSON error response.
func writeJSONError(w http.ResponseWriter, message string, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": status,
		"error":  message,
	})
}

// loadSiteCache downloads the site ZIP from the bucket, unzips it in memory, and caches it.
func (h *Handler) loadSiteCache(ctx context.Context, siteName string) (map[string]cachedFile, error) {
	if siteCache, exists := h.cache.Get(siteName); exists {
		return siteCache, nil
	}

	h.loadMu.Lock()
	defer h.loadMu.Unlock()

	// Double-check after acquiring write lock
	if siteCache, exists := h.cache.Get(siteName); exists {
		return siteCache, nil
	}

	log.Printf("📦 [Cache] Downloading sites/%s.zip from bucket...", siteName)
	stream, _, err := h.provider.DownloadStream(ctx, h.bucket, fmt.Sprintf("sites/%s.zip", siteName))
	if err != nil {
		return nil, fmt.Errorf("failed to download site zip: %w", err)
	}
	defer stream.Close()

	var buf bytes.Buffer
	if _, err := io.Copy(&buf, stream); err != nil {
		return nil, fmt.Errorf("failed to read site zip bytes: %w", err)
	}

	zipReader, err := zip.NewReader(bytes.NewReader(buf.Bytes()), int64(buf.Len()))
	if err != nil {
		return nil, fmt.Errorf("failed to parse zip archive: %w", err)
	}

	newSiteCache := make(map[string]cachedFile)
	for _, file := range zipReader.File {
		if file.FileInfo().IsDir() {
			continue
		}

		err := func() error {
			rc, err := file.Open()
			if err != nil {
				return err
			}
			defer rc.Close()

			fileBytes, err := io.ReadAll(rc)
			if err != nil {
				return err
			}

			// Generate ETag from file content hash
			hash := sha1.Sum(fileBytes)
			etag := fmt.Sprintf(`"%s"`, hex.EncodeToString(hash[:]))

			// Detect content type
			ext := filepath.Ext(file.Name)
			contentType := mime.TypeByExtension(ext)
			if contentType == "" {
				contentType = "application/octet-stream"
			}

			// Normalize paths to ensure leading slash/direct matching
			normalizedPath := strings.TrimPrefix(file.Name, "/")
			newSiteCache[normalizedPath] = cachedFile{
				content:     fileBytes,
				contentType: contentType,
				etag:        etag,
			}
			return nil
		}()
		if err != nil {
			return nil, fmt.Errorf("failed to read zip file %s: %w", file.Name, err)
		}
	}

	h.cache.Put(siteName, newSiteCache)
	log.Printf("✅ [Cache] Successfully loaded and cached %d files for site: %s", len(newSiteCache), siteName)
	return newSiteCache, nil
}

// UploadIntentRequest represents the incoming request to check file size.
type UploadIntentRequest struct {
	Filename    string `json:"filename"`
	ContentType string `json:"content_type"`
	Size        int64  `json:"size"`
}

// HandleUploadIntent inspects size and returns either the broker proxy URL or a direct S3 presigned URL.
func (h *Handler) HandleUploadIntent(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req UploadIntentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	destKey := fmt.Sprintf("uploads/%s", req.Filename)
	w.Header().Set("Content-Type", "application/json")

	// Under 5MB: Route through the broker proxy stream
	if req.Size <= 5*1024*1024 {
		log.Printf("📥 [Upload Intent] File: %s (%d bytes) <= 5MB -> Routing via PROXY", req.Filename, req.Size)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"action":     "proxy",
			"key":        destKey,
			"url":        fmt.Sprintf("/api/download/%s", destKey),
			"upload_url": fmt.Sprintf("/api/upload/proxy?key=%s&content_type=%s", destKey, req.ContentType),
		})
		return
	}

	// Over 5MB: Direct presigned PUT URL
	log.Printf("📥 [Upload Intent] File: %s (%d bytes) > 5MB -> Routing via DIRECT (Presigned URL)", req.Filename, req.Size)
	intent := storage.UploadIntent{
		Bucket:      h.bucket,
		Key:         destKey,
		ContentType: req.ContentType,
		Expires:     15 * time.Minute,
	}

	uploadURL, err := h.provider.GenerateUploadURL(r.Context(), intent)
	if err != nil {
		log.Printf("❌ Failed to generate upload URL: %v", err)
		writeJSONError(w, "Failed to initialize upload", http.StatusInternalServerError)
		return
	}

	// LocalProvider returns a relative /api/... path — client must treat it as proxy (broker-hosted upload).
	// All other providers (S3, GCS, R2) return absolute https:// presigned URLs → direct upload.
	action := "direct"
	if strings.HasPrefix(uploadURL, "/") {
		action = "proxy"
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"action":     action,
		"key":        destKey,
		"url":        fmt.Sprintf("/api/download/%s", destKey),
		"upload_url": uploadURL,
	})
}

// HandleUploadProxy receives the streamed file body and writes it directly to S3/GCS.
func (h *Handler) HandleUploadProxy(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut && r.Method != http.MethodPost {
		writeJSONError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	key := r.URL.Query().Get("key")
	contentType := r.URL.Query().Get("content_type")

	if key == "" {
		writeJSONError(w, "Missing 'key' query parameter", http.StatusBadRequest)
		return
	}

	intent := storage.UploadIntent{
		Bucket:      h.bucket,
		Key:         key,
		ContentType: contentType,
	}

	log.Printf("📤 [Proxy Stream] Starting upload stream for: %s", key)

	// Stream upload the request body directly to S3/GCS
	err := h.provider.UploadStream(r.Context(), intent, r.Body)
	if err != nil {
		log.Printf("❌ [Proxy Stream] Upload failed: %v", err)
		writeJSONError(w, "Failed to complete proxy stream upload", http.StatusInternalServerError)
		return
	}

	log.Printf("✅ [Proxy Stream] Successfully uploaded: %s", key)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status": "success",
		"key":    key,
		"url":    fmt.Sprintf("/api/download/%s", key),
	})
}

// HandleProxyOrStatic hosts static files by pulling and unzipping the deployment ZIP from storage in memory.
func (h *Handler) HandleProxyOrStatic(w http.ResponseWriter, r *http.Request) {
	host := r.Host
	if xfh := r.Header.Get("X-Forwarded-Host"); xfh != "" {
		host = xfh
	}
	var siteID string
	var filePath string

	reqPath := strings.TrimPrefix(r.URL.Path, "/api/download")

	if strings.HasPrefix(reqPath, "/uploads/") {
		// Route direct uploads directly
		bucketKey := strings.TrimPrefix(reqPath, "/")
		stream, meta, err := h.provider.DownloadStream(r.Context(), h.bucket, bucketKey)
		if err != nil {
			http.Error(w, "404 Not Found", http.StatusNotFound)
			return
		}
		defer stream.Close()

		w.Header().Set("Content-Type", meta.ContentType)
		w.Header().Set("ETag", meta.ETag)
		io.Copy(w, stream)
		return
	}

	// Clean port from host to get pure domain
	hostName := host
	if idx := strings.Index(host, ":"); idx != -1 {
		hostName = host[:idx]
	}

	isSubdomain, parsedSiteID := h.IsSubdomain(hostName)

	if isSubdomain {
		siteID = parsedSiteID
		filePath = strings.TrimPrefix(reqPath, "/")
	} else if strings.HasPrefix(reqPath, "/site/") {
		parts := strings.SplitN(strings.TrimPrefix(reqPath, "/site/"), "/", 2)
		if len(parts) > 0 {
			siteID = parts[0]
		}
		if len(parts) > 1 {
			filePath = parts[1]
		}
	}

	// Referer-based fallback for assets requested via absolute paths on path-based preview URLs
	if siteID == "" {
		referer := r.Header.Get("Referer")
		if referer != "" {
			if idx := strings.Index(referer, "/site/"); idx != -1 {
				refPath := referer[idx+6:]
				parts := strings.SplitN(refPath, "/", 2)
				if len(parts) > 0 && parts[0] != "" {
					siteID = parts[0]
					filePath = strings.TrimPrefix(reqPath, "/")
				}
			}
		}
	}

	if siteID == "" {
		// Default landing index
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprintf(w, "<h1>Welcome to BuckStream</h1><p>Storage Broker is running.</p>")
		return
	}

	if siteID == "" {
		http.Error(w, "404 Not Found", http.StatusNotFound)
		return
	}

	// Load site files into RAM cache on-demand
	siteCache, err := h.loadSiteCache(r.Context(), siteID)
	if err != nil {
		log.Printf("⚠️ Failed to load site %s: %v", siteID, err)
		http.Error(w, "404 Not Found", http.StatusNotFound)
		return
	}

	// Normalize target path (default to index.html for directories)
	filePath = strings.TrimPrefix(filePath, "/")
	if filePath == "" || strings.HasSuffix(filePath, "/") {
		filePath = filepath.Join(filePath, "index.html")
	}

	// Search file in cache
	file, exists := siteCache[filePath]
	if !exists {
		// Fallback to index.html for SPA (Single Page App) client-side routing
		file, exists = siteCache["index.html"]
		if !exists {
			http.Error(w, "404 Not Found", http.StatusNotFound)
			return
		}
	}

	// Set headers and serve file content from memory cache
	w.Header().Set("Content-Type", file.contentType)
	w.Header().Set("ETag", file.etag)

	if strings.HasSuffix(filePath, "index.html") {
		w.Header().Set("Cache-Control", "no-cache, must-revalidate")
	} else {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	}

	w.Write(file.content)
}

// ClearSiteCache invalidates the RAM cache for a given site.
func (h *Handler) ClearSiteCache(siteName string) {
	h.cache.Delete(siteName)
	log.Printf("🧹 [Cache] Invalidated cache for site: %s", siteName)
}

// HandleDeleteObject returns a handler to delete a file under a specified prefix.
func (h *Handler) HandleDeleteObject(prefix string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete {
			writeJSONError(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		key := r.URL.Query().Get("key")
		if key == "" {
			writeJSONError(w, "Missing 'key' query parameter", http.StatusBadRequest)
			return
		}

		// Enforce folder prefix restriction
		if !strings.HasPrefix(key, prefix) {
			writeJSONError(w, fmt.Sprintf("Forbidden: Key must start with '%s'", prefix), http.StatusForbidden)
			return
		}

		// If deleting a deployment, enforce it ends with .zip
		if prefix == "sites/" && !strings.HasSuffix(key, ".zip") {
			writeJSONError(w, "Forbidden: Only ZIP files can be deleted under 'sites/'", http.StatusForbidden)
			return
		}

		log.Printf("🗑️ [Delete Object] Deleting key: %s from bucket: %s", key, h.bucket)

		err := h.provider.DeleteObject(r.Context(), h.bucket, key)
		if err != nil {
			log.Printf("❌ [Delete Object] Failed: %v", err)
			writeJSONError(w, fmt.Sprintf("Failed to delete object: %v", err), http.StatusInternalServerError)
			return
		}

		// Clear RAM cache if it's a deployment ZIP
		if prefix == "sites/" {
			siteName := strings.TrimSuffix(strings.TrimPrefix(key, "sites/"), ".zip")
			h.ClearSiteCache(siteName)
		}

		log.Printf("✅ [Delete Object] Successfully deleted key: %s", key)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":  "success",
			"key":     key,
			"message": "Object deleted successfully",
		})
	}
}

// HandleListObjects returns a handler to list all keys under a specified prefix.
func (h *Handler) HandleListObjects(prefix string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeJSONError(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		log.Printf("📋 [List Objects] Listing keys with prefix: %s", prefix)

		keys, err := h.provider.ListObjects(r.Context(), h.bucket, prefix)
		if err != nil {
			log.Printf("❌ [List Objects] Failed: %v", err)
			writeJSONError(w, fmt.Sprintf("Failed to list objects: %v", err), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":  "success",
			"objects": keys,
		})
	}
}
