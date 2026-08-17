package auth

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"
)

type AzureMetadataToken struct {
	AccessToken string `json:"access_token"`
	ExpiresIn   string `json:"expires_in"`
	TokenType   string `json:"token_type"`
	Resource    string `json:"resource"`
}

// FetchAzureMetadataToken retrieves an OAuth2 token directly from Azure IMDS Managed Identity Endpoint.
// Supports custom metadata endpoint override via AZURE_METADATA_HOST env var for LocalStack/CLI testing.
func FetchAzureMetadataToken() (string, error) {
	host := os.Getenv("AZURE_METADATA_HOST")
	if host == "" {
		host = "169.254.169.254"
	}

	url := fmt.Sprintf("http://%s/metadata/identity/oauth2/token?api-version=2018-02-01&resource=https://database.windows.net/", host)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return "", fmt.Errorf("failed to create Azure IMDS request: %w", err)
	}

	// Mandatory Azure IMDS header
	req.Header.Set("Metadata", "true")

	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("azure imds endpoint unreachable (%s): %w", host, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("azure imds endpoint returned HTTP status %d", resp.StatusCode)
	}

	var token AzureMetadataToken
	if err := json.NewDecoder(resp.Body).Decode(&token); err != nil {
		return "", fmt.Errorf("failed to parse Azure metadata token JSON: %w", err)
	}

	return token.AccessToken, nil
}
