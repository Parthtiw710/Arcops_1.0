package storage

import (
	"archive/zip"
	"bytes"
	"context"
	"fmt"
	"mime"
	"path/filepath"
	"sync"
)

// DeployZip extracts a zip file in memory and streams its files to the cloud bucket concurrently.
func DeployZip(ctx context.Context, provider StorageProvider, bucket string, siteID string, zipData []byte) error {
	zipReader, err := zip.NewReader(bytes.NewReader(zipData), int64(len(zipData)))
	if err != nil {
		return fmt.Errorf("failed to parse zip archive: %w", err)
	}

	// Create a cancelable context to abort other uploads if one fails
	cancelCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	var wg sync.WaitGroup
	errChan := make(chan error, len(zipReader.File))
	
	// Limit concurrency to 10 parallel uploads
	sem := make(chan struct{}, 10)

	for _, file := range zipReader.File {
		// Skip directories as we only upload files to object storage
		if file.FileInfo().IsDir() {
			continue
		}

		wg.Add(1)
		go func(f *zip.File) {
			defer wg.Done()

			// Acquire concurrency token or exit if context cancelled
			select {
			case sem <- struct{}{}:
			case <-cancelCtx.Done():
				return
			}
			defer func() { <-sem }()

			err := func() error {
				rc, err := f.Open()
				if err != nil {
					return fmt.Errorf("failed to open file %s from zip: %w", f.Name, err)
				}
				defer rc.Close()

				// Construct the bucket object key (e.g., sites/my-portfolio/assets/index.js)
				destKey := fmt.Sprintf("sites/%s/%s", siteID, f.Name)
				contentType := DetectContentType(f.Name)

				intent := UploadIntent{
					Bucket:      bucket,
					Key:         destKey,
					ContentType: contentType,
				}

				// Stream upload directly to S3/GCS
				err = provider.UploadStream(cancelCtx, intent, rc)
				if err != nil {
					return fmt.Errorf("failed to upload %s: %w", f.Name, err)
				}
				return nil
			}()

			if err != nil {
				cancel() // Trigger context cancellation for other goroutines
				errChan <- err
			}
		}(file)
	}

	// Wait for all uploads to complete
	wg.Wait()
	close(errChan)

	// Check if any errors occurred
	select {
	case err := <-errChan:
		if err != nil {
			return err
		}
	default:
	}

	return nil
}

// DetectContentType determines the correct MIME type based on file extension
// to ensure browsers render HTML, CSS, and JS correctly.
func DetectContentType(filename string) string {
	ext := filepath.Ext(filename)
	contentType := mime.TypeByExtension(ext)
	if contentType == "" {
		return "application/octet-stream"
	}
	return contentType
}
