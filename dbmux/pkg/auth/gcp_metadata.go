package auth

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"
)

type GCPMetadataToken struct {
	AccessToken string `json:"access_token"`
	ExpiresIn   int    `json:"expires_in"`
	TokenType   string `json:"token_type"`
}

// FetchGCPMetadataToken retrieves an OAuth2 access token directly from the GCP Instance Metadata Server URL.
// Supports custom metadata endpoint override via GCP_METADATA_HOST env var for LocalStack/CLI testing.
func FetchGCPMetadataToken() (string, error) {
	host := os.Getenv("GCP_METADATA_HOST")
	if host == "" {
		host = "metadata.google.internal"
	}

	url := fmt.Sprintf("http://%s/computeMetadata/v1/instance/service-accounts/default/token", host)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return "", fmt.Errorf("failed to create GCP metadata request: %w", err)
	}

	// Mandatory GCP Metadata header
	req.Header.Set("Metadata-Flavor", "Google")

	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("gcp metadata server unreachable (%s): %w", host, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("gcp metadata server returned HTTP status %d", resp.StatusCode)
	}

	var token GCPMetadataToken
	if err := json.NewDecoder(resp.Body).Decode(&token); err != nil {
		return "", fmt.Errorf("failed to parse GCP metadata token JSON: %w", err)
	}

	return token.AccessToken, nil
}
