package auth

import (
	"fmt"
	"os"
	"strings"
)

const defaultK8sTokenPath = "/var/run/secrets/kubernetes.io/serviceaccount/token"

// FetchK8sServiceAccountToken reads the projected ServiceAccount JWT token directly from the pod filesystem.
// Zero network calls, 0 ms latency.
func FetchK8sServiceAccountToken() (string, error) {
	tokenPath := os.Getenv("K8S_TOKEN_PATH")
	if tokenPath == "" {
		tokenPath = defaultK8sTokenPath
	}

	tokenBytes, err := os.ReadFile(tokenPath)
	if err != nil {
		return "", fmt.Errorf("failed to read k8s serviceaccount token from %s: %w", tokenPath, err)
	}

	return strings.TrimSpace(string(tokenBytes)), nil
}
