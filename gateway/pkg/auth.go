package pkg

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

// ---------------------------------------------------------------------------
// In-process Key Cache (for ArcAuth API key lookups)
// ---------------------------------------------------------------------------

type cachedKeyResult struct {
	UserID    string
	Role      string
	ExpiresAt time.Time
}

var (
	keyCache    = map[string]*cachedKeyResult{}
	keyCacheMu  sync.RWMutex
	keyCacheTTL = 60 * time.Second
)

func getCachedKey(hash string) (*cachedKeyResult, bool) {
	keyCacheMu.RLock()
	defer keyCacheMu.RUnlock()
	v, ok := keyCache[hash]
	if !ok || time.Now().After(v.ExpiresAt) {
		return nil, false
	}
	return v, true
}

func setCachedKey(hash string, userID, role string) {
	keyCacheMu.Lock()
	defer keyCacheMu.Unlock()
	keyCache[hash] = &cachedKeyResult{
		UserID:    userID,
		Role:      role,
		ExpiresAt: time.Now().Add(keyCacheTTL),
	}
}

func validateAPIKey(ctx context.Context, arcAuthURL, rawKey string) (userID, role string) {
	sum := sha256.Sum256([]byte(rawKey))
	keyHash := hex.EncodeToString(sum[:])

	if cached, ok := getCachedKey(keyHash); ok {
		return cached.UserID, cached.Role
	}

	body, _ := json.Marshal(map[string]string{"key_hash": keyHash})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		arcAuthURL+"/api/auth/keys/validate",
		bytes.NewReader(body),
	)
	if err != nil {
		return "", ""
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		if resp != nil {
			_, _ = io.Copy(io.Discard, resp.Body)
			resp.Body.Close()
		}
		return "", ""
	}
	defer resp.Body.Close()

	var result struct {
		UserID string `json:"user_id"`
		Role   string `json:"role"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", ""
	}

	setCachedKey(keyHash, result.UserID, result.Role)
	return result.UserID, result.Role
}

// ---------------------------------------------------------------------------
// Local JWT Verification & Email Extraction
// ---------------------------------------------------------------------------

type JWTClaims struct {
	Sub   string `json:"sub"`
	Email string `json:"email"`
	Role  string `json:"role"`
	Exp   int64  `json:"exp"`
}

func parseJWTClaims(tokenStr, secret string) *JWTClaims {
	tokenStr = strings.TrimPrefix(tokenStr, "Bearer ")
	parts := strings.Split(tokenStr, ".")
	if len(parts) != 3 {
		return nil
	}

	sigInput := parts[0] + "." + parts[1]
	h := hmac.New(sha256.New, []byte(secret))
	h.Write([]byte(sigInput))
	expectedSig := base64.RawURLEncoding.EncodeToString(h.Sum(nil))

	if !hmac.Equal([]byte(parts[2]), []byte(expectedSig)) {
		return nil
	}

	payload := parts[1]
	switch len(payload) % 4 {
	case 2:
		payload += "=="
	case 3:
		payload += "="
	}
	decoded, err := base64.URLEncoding.DecodeString(payload)
	if err != nil {
		return nil
	}
	var claims JWTClaims
	if err := json.Unmarshal(decoded, &claims); err != nil {
		return nil
	}
	if claims.Exp > 0 && time.Now().Unix() > claims.Exp {
		return nil
	}
	return &claims
}

func getHeaderVal(header http.Header, keys ...string) string {
	for _, k := range keys {
		if val := header.Get(k); val != "" {
			return strings.TrimSpace(val)
		}
	}
	return ""
}

func sanitizeEmailToken(s string) string {
	s = strings.ToLower(s)
	s = strings.ReplaceAll(s, "\r", "")
	s = strings.ReplaceAll(s, "\n", "")
	s = strings.ReplaceAll(s, "\t", "")
	return strings.Trim(s, " \"'")
}

func isEmailInAdminList(email, adminEmailsList string) bool {
	if email == "" || adminEmailsList == "" {
		return false
	}
	email = sanitizeEmailToken(email)
	if email == "" {
		return false
	}
	for _, admin := range strings.Split(adminEmailsList, ",") {
		admin = sanitizeEmailToken(admin)
		if admin == "" {
			continue
		}
		if admin == email {
			return true
		}
		if strings.HasPrefix(admin, "@") && strings.HasSuffix(email, admin) {
			return true
		}
		if strings.HasPrefix(admin, "*@") && strings.HasSuffix(email, strings.TrimPrefix(admin, "*")) {
			return true
		}
	}
	return false
}

// ---------------------------------------------------------------------------
// EnforceAuthMiddleware
// ---------------------------------------------------------------------------

func EnforceAuthMiddleware(cfg GatewayConfig, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			next.ServeHTTP(w, r)
			return
		}

		path := r.URL.Path

		// Public endpoints (Auth endpoints, Landing page, Health check, Public downloads)
		if path == "/health" || path == "/healthz" ||
			strings.HasPrefix(path, "/api/auth/") ||
			strings.HasPrefix(path, "/public/") {
			next.ServeHTTP(w, r)
			return
		}

		// Strip client identity headers
		r.Header.Del("X-Tenant-ID")
		r.Header.Del("X-User-ID")
		authHeader := strings.TrimSpace(r.Header.Get("Authorization"))
		adminKey := getHeaderVal(r.Header, "X-Admin-Key", "X-Service-Role-Key")
		anonKey := getHeaderVal(r.Header, "X-Anon-Key")
		sandboxKey := getHeaderVal(r.Header, "X-Sandbox-Key", "X-Sandbox-ID")

		// 1. TOP PRIORITY #1: ADMIN JWT BEARER / COOKIE SESSION OVERRIDE
		var tokenCandidate string
		if strings.HasPrefix(authHeader, "Bearer ") {
			tokenCandidate = strings.TrimPrefix(authHeader, "Bearer ")
		} else if cookie, err := r.Cookie("arcauth_session"); err == nil && cookie.Value != "" {
			tokenCandidate = cookie.Value
		} else if cookie, err := r.Cookie("authx_session"); err == nil && cookie.Value != "" {
			tokenCandidate = cookie.Value
		}

		if tokenCandidate != "" {
			claims := parseJWTClaims(tokenCandidate, cfg.JWTSecret)
			if claims != nil {
				userID := claims.Sub
				if userID == "" {
					userID = claims.Email
				}
				// If JWT contains Admin Email or Admin Role -> HIGHEST ROOT PRIVILEGE OVERRIDE
				if (claims.Email != "" && isEmailInAdminList(claims.Email, cfg.AdminEmails)) || claims.Role == "admin" {
					r.Header.Set("X-User-ID", userID)
					r.Header.Set("X-Auth-Role", "admin")
					next.ServeHTTP(w, r)
					return
				}
			}
		}

		// 2. ADMIN API KEY (X-Admin-Key, Authorization: Bearer <ARCOPS_ADMIN_KEY>)
		if adminKey != "" || (strings.HasPrefix(authHeader, "Bearer ") && cfg.AdminKey != "" && strings.TrimPrefix(authHeader, "Bearer ") == cfg.AdminKey) {
			token := adminKey
			if token == "" {
				token = strings.TrimPrefix(authHeader, "Bearer ")
			}

			if cfg.AdminKey != "" && token == cfg.AdminKey {
				r.Header.Set("X-User-ID", "admin")
				r.Header.Set("X-Auth-Role", "admin")
				next.ServeHTTP(w, r)
				return
			}
			if userID, role := validateAPIKey(r.Context(), cfg.ArcAuthURL, token); userID != "" && (role == "admin" || role == "api") {
				r.Header.Set("X-User-ID", userID)
				r.Header.Set("X-Auth-Role", role)
				next.ServeHTTP(w, r)
				return
			}
		}

		// 2. ANON KEY
		if anonKey != "" {
			if cfg.AnonKey != "" && anonKey == cfg.AnonKey {
				r.Header.Set("X-User-ID", "anon")
				r.Header.Set("X-Auth-Role", "anon")
				next.ServeHTTP(w, r)
				return
			}
			if userID, role := validateAPIKey(r.Context(), cfg.ArcAuthURL, anonKey); userID != "" && role == "anon" {
				r.Header.Set("X-User-ID", userID)
				r.Header.Set("X-Auth-Role", "anon")
				next.ServeHTTP(w, r)
				return
			}
		}

		// 3. SANDBOX KEY
		if sandboxKey != "" {
			if cfg.SandboxKey != "" && sandboxKey == cfg.SandboxKey {
				r.Header.Set("X-User-ID", "sandbox")
				r.Header.Set("X-Auth-Role", "sbx")
				next.ServeHTTP(w, r)
				return
			}
			if userID, role := validateAPIKey(r.Context(), cfg.ArcAuthURL, sandboxKey); userID != "" && role == "sbx" {
				r.Header.Set("X-User-ID", userID)
				r.Header.Set("X-Auth-Role", "sbx")
				next.ServeHTTP(w, r)
				return
			}
		}

		// 5. REGULAR AUTHENTICATED USER JWT or API KEY FALLBACK
		if tokenCandidate != "" {
			claims := parseJWTClaims(tokenCandidate, cfg.JWTSecret)
			if claims != nil && claims.Sub != "" {
				r.Header.Set("X-User-ID", claims.Sub)
				r.Header.Set("X-Auth-Role", "authenticated")
				next.ServeHTTP(w, r)
				return
			}

			// Fallback check via ArcAuth API key validation
			if userID, role := validateAPIKey(r.Context(), cfg.ArcAuthURL, tokenCandidate); userID != "" {
				r.Header.Set("X-User-ID", userID)
				r.Header.Set("X-Auth-Role", role)
				next.ServeHTTP(w, r)
				return
			}
		}

		// Reject
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"code":    "unauthorized",
			"message": "Missing or invalid authentication credential",
		})
	})
}
