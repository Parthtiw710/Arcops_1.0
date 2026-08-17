package storage

import (
	appconfig "BuckStream/pkg/config"
	"context"
	"fmt"
	"io"
	"log"
	"time"
)

// ObjectMetadata holds key file attributes returned from S3/GCS.
type ObjectMetadata struct {
	ContentType   string
	ContentLength int64
	ETag          string
	LastModified  time.Time
}

type UploadIntent struct {
	Bucket      string        // Target bucket name (dynamic, or fallback to default)
	Key         string        // Destination file path inside the bucket (e.g., "uploads/avatar.jpg")
	Size        int64         // Size of the file in bytes (used to check the 5MB limit)
	ContentType string        // Mime-type of the file (e.g., "image/jpeg")
	Expires     time.Duration // Expiration duration for presigned URLs (e.g., 15 * time.Minute)
}

// StorageProvider defines the unified interface for interacting with cloud storage providers (S3, GCS, etc.).
type StorageProvider interface {
	// GenerateUploadURL creates a presigned PUT URL for files > 5MB.
	GenerateUploadURL(ctx context.Context, intent UploadIntent) (string, error)

	// DeleteObject removes a file from the bucket (e.g., sites/name.zip).
	DeleteObject(ctx context.Context, bucket, key string) error

	// UploadStream uploads a streamed file directly from the broker to S3/GCS.
	UploadStream(ctx context.Context, intent UploadIntent, reader io.Reader) error

	// GenerateDownloadURL creates a presigned GET URL for secure, temporary downloads.
	GenerateDownloadURL(ctx context.Context, bucket, key string, expires time.Duration) (string, error)

	// DownloadStream retrieves the file stream and metadata directly from the bucket for proxying.
	DownloadStream(ctx context.Context, bucket, key string) (io.ReadCloser, *ObjectMetadata, error)

	// GetStaticWebsiteURL returns the provider-specific expiry-less static website URL.
	GetStaticWebsiteURL(bucket, siteID string) (string, error)

	// ListObjects returns a list of object keys in the bucket matching the prefix.
	ListObjects(ctx context.Context, bucket, prefix string) ([]string, error)
}

// NewProvider resolves the correct StorageProvider based on runtime configuration.
// Priority: LOCAL_S3_DIR → S3_BY_IAM → GCS_BY_IAM → S3_COMPATIBLE_BY_TOKEN
func NewProvider(ctx context.Context, cfg *appconfig.Config) (StorageProvider, error) {
	if cfg.LocalS3 {
		log.Printf("📦 Storage Provider: Local Persistent Volume → %s", cfg.LocalS3Dir)
		return NewLocalProvider(ctx, cfg)
	}
	if cfg.S3ByIAM {
		log.Println("📦 Storage Provider: Amazon S3 (IAM Task/Instance Role)")
		return NewS3Provider(ctx, cfg)
	}
	if cfg.GCSByIAM {
		log.Println("📦 Storage Provider: Google Cloud Storage (REST)")
		return NewGCSProvider(ctx, cfg)
	}
	if cfg.S3CompatibleByToken {
		log.Println("📦 Storage Provider: S3-Compatible Token Endpoint")
		return NewS3Provider(ctx, cfg)
	}
	return nil, fmt.Errorf("no storage provider configured — set LOCAL_S3_DIR, S3_BY_IAM, GCS_BY_IAM, or S3_COMPATIBLE_BY_TOKEN")
}
