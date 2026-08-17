package auth

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"os"

	dbmuxv1 "dbmux/gen/dbmux/v1"
)

// BuildTLSConfig resolves TLS configuration using a 3-tier strategy:
// 1. In-Memory PEM strings (primary for dynamic Docker/K8s containers)
// 2. File paths on disk (if mounted volume specified)
// 3. OS System Root Certificates (default fallback for public managed clouds)
func BuildTLSConfig(settings *dbmuxv1.TLSSettings) (*tls.Config, error) {
	if settings == nil || !settings.Enabled {
		return nil, nil
	}

	// Step 1: Initialize System Root Certificates
	caPool, err := x509.SystemCertPool()
	if err != nil || caPool == nil {
		caPool = x509.NewCertPool()
	}

	// Step 2: Check for In-Memory PEM CA certificate string
	if settings.CaCertPem != "" {
		if !caPool.AppendCertsFromPEM([]byte(settings.CaCertPem)) {
			return nil, fmt.Errorf("failed to parse in-memory CA PEM certificate")
		}
	}

	tlsConfig := &tls.Config{
		RootCAs:            caPool,
		InsecureSkipVerify: settings.InsecureSkipVerify,
		MinVersion:         tls.VersionTLS12,
	}

	// Step 3: Handle mTLS Client Certificate & Private Key if provided in RAM
	if settings.ClientCertPem != "" && settings.ClientKeyPem != "" {
		clientCert, err := tls.X509KeyPair([]byte(settings.ClientCertPem), []byte(settings.ClientKeyPem))
		if err != nil {
			return nil, fmt.Errorf("failed to parse mTLS client certificate/key pair: %w", err)
		}
		tlsConfig.Certificates = []tls.Certificate{clientCert}
	}

	return tlsConfig, nil
}

// LoadCertFromFile helper loads CA cert from disk if needed
func LoadCertFromFile(caPath string) (*tls.Config, error) {
	pemBytes, err := os.ReadFile(caPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read CA file %s: %w", caPath, err)
	}

	caPool := x509.NewCertPool()
	if !caPool.AppendCertsFromPEM(pemBytes) {
		return nil, fmt.Errorf("failed to parse CA PEM file from %s", caPath)
	}

	return &tls.Config{
		RootCAs:    caPool,
		MinVersion: tls.VersionTLS12,
	}, nil
}
