package auth

import (
	"context"
	"fmt"
	"os"
	"strings"
)

// ResolveAuthToken reads the AUTH_PROVIDER (or AUTH_BY) environment variable or provided override string
// to fetch the IAM / Auth token for AWS, GCP, Azure, Kubernetes, or static token.
//
// Supported AUTH_PROVIDER values:
// - "aws"        -> AWS IMDSv2 IAM Credentials
// - "gcp"        -> GCP Instance Metadata OAuth2 Token
// - "azure"      -> Azure Managed Identity IMDS Token
// - "kubernetes" / "k8s" -> In-Pod K8s ServiceAccount JWT
// - "token" / "pem"     -> Static Token or PEM from AUTH_TOKEN env
// - "auto" (Default)    -> Auto-detects in order: K8s -> GCP -> AWS -> Azure
func ResolveAuthToken(ctx context.Context, authProvider string) (string, error) {
	if authProvider == "" {
		authProvider = os.Getenv("AUTH_PROVIDER")
		if authProvider == "" {
			authProvider = os.Getenv("AUTH_BY")
		}
	}

	authProvider = strings.ToLower(strings.TrimSpace(authProvider))

	switch authProvider {
	case "gcp":
		token, err := FetchGCPMetadataToken()
		if err != nil {
			return "", fmt.Errorf("AUTH_PROVIDER=gcp resolution failed: %w", err)
		}
		return token, nil
	case "aws":
		creds, err := FetchAWSMetadataCredentials()
		if err != nil {
			return "", fmt.Errorf("AUTH_PROVIDER=aws resolution failed: %w", err)
		}
		return creds.Token, nil
	case "azure":
		token, err := FetchAzureMetadataToken()
		if err != nil {
			return "", fmt.Errorf("AUTH_PROVIDER=azure resolution failed: %w", err)
		}
		return token, nil
	case "k8s", "kubernetes":
		token, err := FetchK8sServiceAccountToken()
		if err != nil {
			return "", fmt.Errorf("AUTH_PROVIDER=k8s resolution failed: %w", err)
		}
		return token, nil
	case "token", "pem":
		token := os.Getenv("AUTH_TOKEN")
		if token == "" {
			return "", fmt.Errorf("AUTH_PROVIDER=token set but AUTH_TOKEN environment variable is empty")
		}
		return token, nil
	case "auto", "":
		return autoDetectToken(ctx)
	default:
		return "", fmt.Errorf("unsupported AUTH_PROVIDER option: '%s' (supported: aws, gcp, azure, kubernetes, token, auto)", authProvider)
	}
}

func autoDetectToken(ctx context.Context) (string, error) {
	// 1. Check Kubernetes Pod ServiceAccount token first
	if token, err := FetchK8sServiceAccountToken(); err == nil && token != "" {
		return token, nil
	}

	// 2. Check GCP Metadata
	if token, err := FetchGCPMetadataToken(); err == nil && token != "" {
		return token, nil
	}

	// 3. Check AWS IMDSv2
	if creds, err := FetchAWSMetadataCredentials(); err == nil && creds.Token != "" {
		return creds.Token, nil
	}

	// 4. Check Azure IMDS
	if token, err := FetchAzureMetadataToken(); err == nil && token != "" {
		return token, nil
	}

	return "", fmt.Errorf("auto-detection failed: no valid IAM or K8s metadata token endpoint reached")
}
