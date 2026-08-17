package storage

// local_provider.go — Production-ready local persistent volume storage provider.
// Uses Go standard library only. Zero new dependencies.
// Activated by setting LOCAL_S3_DIR env var to the path of a mounted persistent volume.

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	appconfig "BuckStream/pkg/config"
)

// LocalProvider implements StorageProvider by reading/writing directly
// to a local persistent volume directory. No S3 protocol, no Docker, no extra process.
type LocalProvider struct {
	baseDir string     // Root of the mounted PV (e.g. /mnt/data or tmp/local_s3)
	mu      sync.RWMutex // Protects concurrent file writes
}

// NewLocalProvider initializes a LocalProvider and ensures the base directory exists.
func NewLocalProvider(_ context.Context, cfg *appconfig.Config) (*LocalProvider, error) {
	dir := cfg.LocalS3Dir
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create local storage dir %s: %w", dir, err)
	}
	return &LocalProvider{baseDir: dir}, nil
}

// filePath resolves the absolute path for a given bucket + key on the PV.
func (p *LocalProvider) filePath(bucket, key string) string {
	// filepath.Clean prevents path traversal attacks (../../etc/passwd)
	return filepath.Join(p.baseDir, filepath.Clean("/"+bucket+"/"+key))
}

// UploadStream writes the reader stream directly to the PV as a regular file.
// Thread-safe: concurrent writes to different keys are safe; same-key writes are serialized.
func (p *LocalProvider) UploadStream(_ context.Context, intent UploadIntent, reader io.Reader) error {
	target := p.filePath(intent.Bucket, intent.Key)

	p.mu.Lock()
	defer p.mu.Unlock()

	if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
		return fmt.Errorf("failed to create directory for %s: %w", intent.Key, err)
	}

	file, err := os.Create(target)
	if err != nil {
		return fmt.Errorf("failed to create file %s: %w", intent.Key, err)
	}
	defer file.Close()

	if _, err := io.Copy(file, reader); err != nil {
		return fmt.Errorf("failed to write file %s: %w", intent.Key, err)
	}
	return nil
}

// DownloadStream opens the file from the PV and returns it as a stream.
func (p *LocalProvider) DownloadStream(_ context.Context, bucket, key string) (io.ReadCloser, *ObjectMetadata, error) {
	target := p.filePath(bucket, key)

	p.mu.RLock()
	defer p.mu.RUnlock()

	info, err := os.Stat(target)
	if err != nil {
		return nil, nil, fmt.Errorf("object not found: %s/%s", bucket, key)
	}

	file, err := os.Open(target)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to open file %s: %w", key, err)
	}

	meta := &ObjectMetadata{
		ContentType:   "application/octet-stream",
		ContentLength: info.Size(),
		ETag:          fmt.Sprintf(`"%x"`, info.ModTime().UnixNano()),
		LastModified:  info.ModTime(),
	}
	return file, meta, nil
}

// GenerateUploadURL returns a relative BuckStream proxy URL for large file uploads.
// The handler detects the leading "/" and converts action to "proxy" automatically,
// so large files also flow through the broker — no external S3 endpoint needed.
func (p *LocalProvider) GenerateUploadURL(_ context.Context, intent UploadIntent) (string, error) {
	// Return relative path → handler.go detects this and returns action:"proxy" to client
	return fmt.Sprintf("/api/upload/proxy?key=%s&content_type=%s",
		intent.Key, intent.ContentType), nil
}

// GenerateDownloadURL returns BuckStream's own download proxy path.
// Since we're talking to a PV, all downloads go through the broker.
func (p *LocalProvider) GenerateDownloadURL(_ context.Context, bucket, key string, _ time.Duration) (string, error) {
	return fmt.Sprintf("/api/download/%s", key), nil
}

// GetStaticWebsiteURL returns an empty string — the broker itself serves static sites.
func (p *LocalProvider) GetStaticWebsiteURL(_, _ string) (string, error) {
	return "", nil
}

// DeleteObject removes the file from the PV.
func (p *LocalProvider) DeleteObject(_ context.Context, bucket, key string) error {
	target := p.filePath(bucket, key)
	if err := os.Remove(target); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to delete %s: %w", key, err)
	}
	return nil
}

// ListObjects returns all keys in the bucket matching the given prefix.
func (p *LocalProvider) ListObjects(_ context.Context, bucket, prefix string) ([]string, error) {
	bucketDir := filepath.Join(p.baseDir, bucket)

	p.mu.RLock()
	defer p.mu.RUnlock()

	var keys []string
	err := filepath.Walk(bucketDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		// Convert absolute disk path → relative S3-style key
		rel, err := filepath.Rel(bucketDir, path)
		if err != nil {
			return nil
		}
		key := filepath.ToSlash(rel)
		if prefix == "" || strings.HasPrefix(key, prefix) {
			keys = append(keys, key)
		}
		return nil
	})
	if err != nil && !os.IsNotExist(err) {
		return nil, fmt.Errorf("failed to list objects: %w", err)
	}
	return keys, nil
}
