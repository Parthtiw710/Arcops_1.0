package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// JWTClaims represents standard JWT claims extracted for dbmux RLS user isolation.
type JWTClaims struct {
	Sub      string `json:"sub"`
	Role     string `json:"role"`
	TenantID string `json:"tenant_id,omitempty"`
	Exp      int64  `json:"exp"`
}

// ParseAndVerifyJWT parses a JWT string and optionally verifies its HMAC-SHA256 signature if secret is provided.
func ParseAndVerifyJWT(tokenStr, secret string) (*JWTClaims, error) {
	tokenStr = strings.TrimPrefix(strings.TrimSpace(tokenStr), "Bearer ")
	parts := strings.Split(tokenStr, ".")
	if len(parts) != 3 {
		return nil, fmt.Errorf("invalid jwt format")
	}

	// Verify HMAC-SHA256 signature if secret is configured
	if secret != "" {
		sigInput := parts[0] + "." + parts[1]
		expectedSig := computeHmacSha256(sigInput, secret)
		actualSig := parts[2]
		if !hmac.Equal([]byte(expectedSig), []byte(actualSig)) {
			return nil, fmt.Errorf("invalid jwt signature")
		}
	} else {
		// If secret is not configured on server, reject signed/unsigned JWT tokens
		return nil, fmt.Errorf("jwt secret is not configured on server")
	}

	// Decode payload
	payloadBytes, err := decodeBase64URL(parts[1])
	if err != nil {
		return nil, fmt.Errorf("failed to decode jwt payload: %w", err)
	}

	var claims JWTClaims
	if err := json.Unmarshal(payloadBytes, &claims); err != nil {
		return nil, fmt.Errorf("failed to parse jwt claims json: %w", err)
	}

	// Check expiration if present
	if claims.Exp > 0 && time.Now().Unix() > claims.Exp {
		return nil, fmt.Errorf("jwt token has expired")
	}

	return &claims, nil
}

func computeHmacSha256(message, secret string) string {
	h := hmac.New(sha256.New, []byte(secret))
	h.Write([]byte(message))
	return base64.RawURLEncoding.EncodeToString(h.Sum(nil))
}

func decodeBase64URL(input string) ([]byte, error) {
	// Add padding if missing
	if m := len(input) % 4; m != 0 {
		input += strings.Repeat("=", 4-m)
	}
	return base64.URLEncoding.DecodeString(input)
}
