package auth

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

type AWSIAMCredentials struct {
	AccessKeyID     string `json:"AccessKeyId"`
	SecretAccessKey string `json:"SecretAccessKey"`
	Token           string `json:"Token"`
	Expiration      string `json:"Expiration"`
}

// FetchAWSMetadataCredentials retrieves temporary IAM security credentials using AWS IMDSv2.
// Supports custom metadata endpoint override via AWS_METADATA_HOST env var for LocalStack/CLI testing.
func FetchAWSMetadataCredentials() (*AWSIAMCredentials, error) {
	host := os.Getenv("AWS_METADATA_HOST")
	if host == "" {
		host = "169.254.169.254"
	}

	client := &http.Client{Timeout: 3 * time.Second}

	// Step 1: Get IMDSv2 Session Token
	tokenURL := fmt.Sprintf("http://%s/latest/api/token", host)
	reqToken, err := http.NewRequest("PUT", tokenURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create AWS IMDSv2 token request: %w", err)
	}
	reqToken.Header.Set("X-aws-ec2-metadata-token-ttl-seconds", "21600")

	respToken, err := client.Do(reqToken)
	if err != nil {
		return nil, fmt.Errorf("aws imdsv2 endpoint unreachable (%s): %w", host, err)
	}
	defer respToken.Body.Close()

	if respToken.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("aws imdsv2 token endpoint returned HTTP %d", respToken.StatusCode)
	}

	sessionTokenBytes, err := io.ReadAll(respToken.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read AWS session token: %w", err)
	}
	sessionToken := string(sessionTokenBytes)

	// Step 2: Get IAM Role Name
	roleURL := fmt.Sprintf("http://%s/latest/meta-data/iam/security-credentials/", host)
	reqRole, err := http.NewRequest("GET", roleURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create AWS IAM role request: %w", err)
	}
	reqRole.Header.Set("X-aws-ec2-metadata-token", sessionToken)

	respRole, err := client.Do(reqRole)
	if err != nil {
		return nil, fmt.Errorf("aws iam role endpoint unreachable: %w", err)
	}
	defer respRole.Body.Close()

	if respRole.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("aws iam role endpoint returned HTTP %d", respRole.StatusCode)
	}

	roleNameBytes, err := io.ReadAll(respRole.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read AWS IAM role name: %w", err)
	}
	roleName := string(roleNameBytes)

	// Step 3: Fetch Security Credentials
	credsURL := fmt.Sprintf("http://%s/latest/meta-data/iam/security-credentials/%s", host, roleName)
	reqCreds, err := http.NewRequest("GET", credsURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create AWS credentials request: %w", err)
	}
	reqCreds.Header.Set("X-aws-ec2-metadata-token", sessionToken)

	respCreds, err := client.Do(reqCreds)
	if err != nil {
		return nil, fmt.Errorf("aws credentials endpoint unreachable: %w", err)
	}
	defer respCreds.Body.Close()

	if respCreds.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("aws credentials endpoint returned HTTP %d", respCreds.StatusCode)
	}

	var creds AWSIAMCredentials
	if err := json.NewDecoder(respCreds.Body).Decode(&creds); err != nil {
		return nil, fmt.Errorf("failed to parse AWS credentials JSON: %w", err)
	}

	return &creds, nil
}
