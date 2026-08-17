package storage

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"strings"
	"time"

	appconfig "BuckStream/pkg/config"
)

// GCSProvider implements StorageProvider for Google Cloud Storage using direct REST APIs
// without Google Cloud SDK dependencies.
type GCSProvider struct {
	client *http.Client
}

// NewGCSProvider creates a new zero-dependency REST GCSProvider.
func NewGCSProvider(ctx context.Context, cfg *appconfig.Config) (*GCSProvider, error) {
	return &GCSProvider{
		client: &http.Client{Timeout: 30 * time.Second},
	}, nil
}

// Get GCP Metadata Server Value
func (g *GCSProvider) getMetadata(path string) (string, error) {
	req, err := http.NewRequest("GET", "http://metadata.google.internal/computeMetadata/v1/"+path, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Metadata-Flavor", "Google")
	resp, err := g.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("metadata server returned status %d", resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	return strings.TrimSpace(string(body)), err
}

// Get temporary OAuth2 token from Google Metadata Server (or local gcloud CLI fallback)
func (g *GCSProvider) getAccessToken() (string, error) {
	tokenJSON, err := g.getMetadata("instance/service-accounts/default/token")
	if err != nil {
		// FALLBACK: If running locally, fetch access token from active gcloud CLI session
		out, err := exec.Command("gcloud", "auth", "print-access-token").Output()
		if err != nil {
			return "", fmt.Errorf("metadata server offline and local gcloud fallback failed: %w", err)
		}
		return strings.TrimSpace(string(out)), nil
	}
	var res struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.Unmarshal([]byte(tokenJSON), &res); err != nil {
		return "", err
	}
	return res.AccessToken, nil
}

// Get Service Account email (or local gcloud CLI fallback)
func (g *GCSProvider) getServiceAccountEmail() (string, error) {
	if envSA := os.Getenv("GCS_SERVICE_ACCOUNT_EMAIL"); envSA != "" {
		return envSA, nil
	}
	email, err := g.getMetadata("instance/service-accounts/default/email")
	if err != nil {
		// FALLBACK: If running locally, fetch active account email from gcloud CLI config
		out, err := exec.Command("gcloud", "config", "get-value", "account").Output()
		if err != nil {
			return "", fmt.Errorf("metadata server offline and local gcloud fallback failed: %w", err)
		}
		return strings.TrimSpace(string(out)), nil
	}
	return email, nil
}

// Generate GCS Signed URL using GCP signBlob REST API
func (g *GCSProvider) generateSignedURL(method, bucket, key, contentType string, expires time.Duration) (string, error) {
	saEmail, err := g.getServiceAccountEmail()
	if err != nil {
		return "", fmt.Errorf("failed to get service account email: %w", err)
	}

	expiry := time.Now().Add(expires).Unix()
	resource := fmt.Sprintf("/%s/%s", bucket, key)
	// V2 Signature format: Method \n Content-MD5 \n Content-Type \n Expires \n Resource
	stringToSign := fmt.Sprintf("%s\n\n%s\n%d\n%s", method, contentType, expiry, resource)

	// Call GCP signBlob REST API to sign this string keylessly
	accessToken, err := g.getAccessToken()
	if err != nil {
		return "", err
	}

	urlSign := fmt.Sprintf("https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/%s:signBlob", saEmail)
	reqBody, _ := json.Marshal(map[string]string{
		"payload": base64.StdEncoding.EncodeToString([]byte(stringToSign)),
	})

	req, err := http.NewRequest("POST", urlSign, bytes.NewBuffer(reqBody))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := g.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("signBlob failed with code %d: %s", resp.StatusCode, string(body))
	}

	var res struct {
		SignedBlob string `json:"signedBlob"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return "", err
	}

	signatureBytes, err := base64.StdEncoding.DecodeString(res.SignedBlob)
	if err != nil {
		return "", err
	}
	signature := url.QueryEscape(base64.StdEncoding.EncodeToString(signatureBytes))

	return fmt.Sprintf("https://storage.googleapis.com/%s/%s?GoogleAccessId=%s&Expires=%d&Signature=%s",
		bucket, key, saEmail, expiry, signature), nil
}

func (g *GCSProvider) GenerateUploadURL(ctx context.Context, intent UploadIntent) (string, error) {
	return g.generateSignedURL("PUT", intent.Bucket, intent.Key, intent.ContentType, intent.Expires)
}

func (g *GCSProvider) GenerateDownloadURL(ctx context.Context, bucket, key string, expires time.Duration) (string, error) {
	return g.generateSignedURL("GET", bucket, key, "", expires)
}

func (g *GCSProvider) UploadStream(ctx context.Context, intent UploadIntent, reader io.Reader) error {
	token, err := g.getAccessToken()
	if err != nil {
		return err
	}

	urlStr := fmt.Sprintf("https://www.googleapis.com/upload/storage/v1/b/%s/o?uploadType=media&name=%s",
		intent.Bucket, url.QueryEscape(intent.Key))

	req, err := http.NewRequestWithContext(ctx, "POST", urlStr, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", intent.ContentType)

	resp, err := g.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("GCS upload failed with status %d: %s", resp.StatusCode, string(body))
	}
	return nil
}

func (g *GCSProvider) DownloadStream(ctx context.Context, bucket, key string) (io.ReadCloser, *ObjectMetadata, error) {
	token, err := g.getAccessToken()
	if err != nil {
		return nil, nil, err
	}

	// 1. Fetch metadata
	urlMeta := fmt.Sprintf("https://www.googleapis.com/storage/v1/b/%s/o/%s", bucket, url.QueryEscape(key))
	reqMeta, err := http.NewRequestWithContext(ctx, "GET", urlMeta, nil)
	if err != nil {
		return nil, nil, err
	}
	reqMeta.Header.Set("Authorization", "Bearer "+token)
	respMeta, err := g.client.Do(reqMeta)
	if err != nil {
		return nil, nil, err
	}
	defer respMeta.Body.Close()

	if respMeta.StatusCode != http.StatusOK {
		return nil, nil, fmt.Errorf("GCS metadata fetch failed with status %d", respMeta.StatusCode)
	}

	var metaRes struct {
		ContentType string    `json:"contentType"`
		Size        int64     `json:"size,string"`
		Etag        string    `json:"etag"`
		Updated     time.Time `json:"updated"`
	}
	if err := json.NewDecoder(respMeta.Body).Decode(&metaRes); err != nil {
		return nil, nil, err
	}

	// 2. Fetch media data stream
	urlMedia := fmt.Sprintf("https://www.googleapis.com/storage/v1/b/%s/o/%s?alt=media", bucket, url.QueryEscape(key))
	reqMedia, err := http.NewRequestWithContext(ctx, "GET", urlMedia, nil)
	if err != nil {
		return nil, nil, err
	}
	reqMedia.Header.Set("Authorization", "Bearer "+token)
	respMedia, err := g.client.Do(reqMedia)
	if err != nil {
		return nil, nil, err
	}

	if respMedia.StatusCode != http.StatusOK {
		respMedia.Body.Close()
		return nil, nil, fmt.Errorf("GCS media download failed with status %d", respMedia.StatusCode)
	}

	meta := &ObjectMetadata{
		ContentType:   metaRes.ContentType,
		ContentLength: metaRes.Size,
		ETag:          metaRes.Etag,
		LastModified:  metaRes.Updated,
	}

	return respMedia.Body, meta, nil
}

// GetStaticWebsiteURL returns the raw GCS endpoint domain.
func (g *GCSProvider) GetStaticWebsiteURL(bucket, siteID string) (string, error) {
	return "storage.googleapis.com", nil
}

func (g *GCSProvider) DeleteObject(ctx context.Context, bucket, key string) error {
	token, err := g.getAccessToken()
	if err != nil {
		return err
	}

	urlStr := fmt.Sprintf("https://www.googleapis.com/storage/v1/b/%s/o/%s", bucket, url.QueryEscape(key))

	req, err := http.NewRequestWithContext(ctx, "DELETE", urlStr, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := g.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("GCS delete failed with status %d: %s", resp.StatusCode, string(body))
	}
	return nil
}

func (g *GCSProvider) ListObjects(ctx context.Context, bucket, prefix string) ([]string, error) {
	token, err := g.getAccessToken()
	if err != nil {
		return nil, err
	}

	urlStr := fmt.Sprintf("https://www.googleapis.com/storage/v1/b/%s/o?prefix=%s", bucket, url.QueryEscape(prefix))
	req, err := http.NewRequestWithContext(ctx, "GET", urlStr, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := g.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result struct {
		Items []struct {
			Name string `json:"name"`
		} `json:"items"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	keys := make([]string, 0, len(result.Items))
	for _, item := range result.Items {
		keys = append(keys, item.Name)
	}
	return keys, nil
}
