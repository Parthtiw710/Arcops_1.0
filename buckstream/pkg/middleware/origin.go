package middleware

import (
	"net/http"
	"strings"
)

// CORSMiddleware manages Cross-Origin Resource Sharing (CORS) headers.
func CORSMiddleware(allowedDomains string) func(http.Handler) http.Handler {
	// Parse allowed domains into a map for O(1) lookup
	originsMap := make(map[string]bool)
	allowAll := false

	if allowedDomains == "*" || allowedDomains == "" {
		allowAll = true
	} else {
		domains := strings.Split(allowedDomains, ",")
		for _, d := range domains {
			trimmed := strings.TrimSpace(d)
			if trimmed != "" {
				originsMap[trimmed] = true
				// Also support protocol prefixes
				if !strings.HasPrefix(trimmed, "http://") && !strings.HasPrefix(trimmed, "https://") {
					originsMap["http://"+trimmed] = true
					originsMap["https://"+trimmed] = true
				}
			}
		}
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")

			// Check if the request origin is allowed
			if origin != "" {
				if allowAll || originsMap[origin] {
					w.Header().Set("Access-Control-Allow-Origin", origin)
					w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
					w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
					w.Header().Set("Access-Control-Max-Age", "86400") // Cache CORS preflight for 24 hours
				}
			}

			// If it's an OPTIONS preflight request, respond immediately with 204
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
