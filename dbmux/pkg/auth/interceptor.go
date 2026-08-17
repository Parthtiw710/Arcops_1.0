package auth

import (
	"context"
	"crypto/hmac"
	"fmt"
	"os"
	"strings"

	"connectrpc.com/connect"
)

type authContextKey struct{}

// AuthContext holds client authentication, key types, and JWT user details for RLS enforcement.
type AuthContext struct {
	IsAdmin         bool
	IsAuthenticated bool
	UserID          string
	Role            string
	TenantID        string
	ApiKey          string
}

// WithAuthContext attaches an AuthContext to the Go context.
func WithAuthContext(ctx context.Context, auth *AuthContext) context.Context {
	return context.WithValue(ctx, authContextKey{}, auth)
}

// AuthFromContext retrieves the AuthContext from the Go context.
func AuthFromContext(ctx context.Context) *AuthContext {
	if auth, ok := ctx.Value(authContextKey{}).(*AuthContext); ok {
		return auth
	}
	return nil
}

// NewAuthInterceptor creates a ConnectRPC UnaryInterceptor for checking Public (Anon) vs Private (ServiceRole) keys
// and extracting JWT claims for Row-Level Security (RLS).
func NewAuthInterceptor(anonKey, serviceRoleKey, jwtSecret string) connect.UnaryInterceptorFunc {
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			header := req.Header()

			// Check headers for keys
			providedAnonKey := getHeaderValue(header, "X-Anon-Key", "x-anon-key")
			providedServiceKey := getHeaderValue(header, "X-Service-Role-Key", "x-service-role-key")
			authHeader := getHeaderValue(header, "Authorization", "authorization")

			authCtx := &AuthContext{
				Role: "authenticated",
			}

			// If no keys configured in server env (dev mode), grant admin access by default
			if anonKey == "" && serviceRoleKey == "" {
				authCtx.IsAdmin = true
				return next(WithAuthContext(ctx, authCtx), req)
			}

			// 1. Check Service Role Key (Backend / Admin Access - Bypasses RLS)
			// Constant-time comparison to prevent timing side-channel attacks
			if serviceRoleKey != "" && hmac.Equal([]byte(providedServiceKey), []byte(serviceRoleKey)) {
				authCtx.IsAdmin = true
				authCtx.Role = "service_role"
				authCtx.ApiKey = providedServiceKey
				return next(WithAuthContext(ctx, authCtx), req)
			}

			// 2. Check Public Anon Key (Frontend Access - Enforces RLS via JWT)
			// Constant-time comparison to prevent timing side-channel attacks
			if anonKey != "" && hmac.Equal([]byte(providedAnonKey), []byte(anonKey)) {
				authCtx.IsAdmin = false
				authCtx.ApiKey = providedAnonKey

				// Parse and verify user JWT token from Authorization header if present
				if authHeader != "" {
					claims, err := ParseAndVerifyJWT(authHeader, jwtSecret)
					if err != nil {
						return nil, connect.NewError(connect.CodeUnauthenticated, fmt.Errorf("invalid authentication token: %w", err))
					}
					authCtx.IsAuthenticated = true
					authCtx.UserID = claims.Sub
					authCtx.TenantID = claims.TenantID
					if claims.Role != "" {
						authCtx.Role = claims.Role
					}
				}

				return next(WithAuthContext(ctx, authCtx), req)
			}

			// 3. Fallback: Reject request if neither key matched
			return nil, connect.NewError(connect.CodeUnauthenticated, fmt.Errorf("unauthorized: missing or invalid API key"))
		}
	}
}

func getHeaderValue(header map[string][]string, keys ...string) string {
	for _, k := range keys {
		if vals, ok := header[k]; ok && len(vals) > 0 {
			return strings.TrimSpace(vals[0])
		}
		// Case-insensitive fallback
		for hk, vals := range header {
			if strings.EqualFold(hk, k) && len(vals) > 0 {
				return strings.TrimSpace(vals[0])
			}
		}
	}
	return ""
}

// NewRecoveryInterceptor catches unexpected panics inside query worker goroutines,
// logs the stack trace cleanly to stderr, and prevents the server process from crashing.
func NewRecoveryInterceptor() connect.UnaryInterceptorFunc {
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (resp connect.AnyResponse, err error) {
			defer func() {
				if r := recover(); r != nil {
					fmt.Fprintf(os.Stderr, "🚨 [DBMUX PANIC RECOVERED] Procedure: %s | Error: %v\n", req.Spec().Procedure, r)
					err = connect.NewError(connect.CodeInternal, fmt.Errorf("internal server error during RPC execution"))
				}
			}()
			return next(ctx, req)
		}
	}
}

// NewCapabilityInterceptor injects X-DBMux-Capabilities header into every ConnectRPC response.
func NewCapabilityInterceptor(reg interface{ CapabilityMask() uint32 }) connect.UnaryInterceptorFunc {
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			resp, err := next(ctx, req)
			if resp != nil {
				resp.Header().Set("X-DBMux-Capabilities", fmt.Sprintf("%d", reg.CapabilityMask()))
			}
			return resp, err
		}
	}
}

