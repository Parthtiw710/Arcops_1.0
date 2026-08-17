package main

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"flag"
	"fmt"
	"os"
)

func mintKey(role, secret string) string {
	bytes := make([]byte, 16)
	_, _ = rand.Read(bytes)
	payload := role + "_" + hex.EncodeToString(bytes)

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(payload))
	hmacHex := hex.EncodeToString(mac.Sum(nil))

	return payload + "." + hmacHex
}

func main() {
	secret := flag.String("secret", "", "Signing secret from .env (required)")
	role := flag.String("role", "admin", "Key role: admin | anon | sbx | api")
	flag.Parse()

	if *secret == "" {
		fmt.Fprintln(os.Stderr, "Usage: go run ./scripts/generate_keys.go -secret <jwt_or_signing_secret> [-role admin|anon|sbx|api]")
		os.Exit(1)
	}

	key := mintKey(*role, *secret)
	fmt.Printf("🔑 Generated Single-User %s key:\n  %s\n", *role, key)

	switch *role {
	case "admin":
		fmt.Printf("\nAdd to .env:\n  ADMIN_TOKEN=%s\n", key)
	case "anon":
		fmt.Printf("\nAdd to .env / Client:\n  ARCOPS_ANON_KEY=%s\n", key)
	case "sbx":
		fmt.Printf("\nSend in request header:\n  X-Sandbox-Key: %s\n", key)
	case "api":
		fmt.Printf("\nSend in request header:\n  Authorization: Bearer %s\n", key)
	}
}
