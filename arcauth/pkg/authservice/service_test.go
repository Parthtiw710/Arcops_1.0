package authservice

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestAuthXFullFlow(t *testing.T) {
	t.Setenv("ARCAUTH_DATABASE_URL", "file::memory:?cache=shared&mode=memory")
	t.Setenv("EMAIL_PROVIDER", "mock")
	t.Setenv("SMTP_HOST", "")
	t.Setenv("ARCOPS_KEY_SIGNING_SECRET", "test-signing-secret-for-unit-tests")
	svc, err := NewAuthService("", "")
	if err != nil {
		t.Fatalf("Failed to create AuthService: %v", err)
	}

	mux := http.NewServeMux()
	svc.RegisterRoutes(mux)
	server := httptest.NewServer(mux)
	defer server.Close()

	client := server.Client()

	// Use a unique email per run so repeated test executions don't collide on
	// the shared in-memory SQLite instance.
	testEmail := "test_" + NewUUID()[:8] + "@authx.dev"

	// 1. TEST SIGNUP
	signupPayload := map[string]string{
		"email":     testEmail,
		"password":  "SuperSecurePass123!",
		"full_name": "AuthX Engineer",
		"mobile":    "+15550199283",
	}
	body, _ := json.Marshal(signupPayload)
	resp, err := client.Post(server.URL+"/api/auth/signup", "application/json", bytes.NewBuffer(body))
	if err != nil {
		t.Fatalf("Signup request failed: %v", err)
	}
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("Expected status 201 Created, got %d", resp.StatusCode)
	}

	var signupRes struct {
		User  User   `json:"user"`
		Token string `json:"token"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&signupRes)
	resp.Body.Close()

	if signupRes.User.Email != testEmail {
		t.Fatalf("Expected email %s, got %s", testEmail, signupRes.User.Email)
	}
	if signupRes.User.PlanTier != 0 {
		t.Fatalf("Expected Free PlanTier 0, got %d", signupRes.User.PlanTier)
	}
	if signupRes.Token == "" {
		t.Fatalf("Expected valid session token")
	}

	// 2. TEST LOGIN
	loginPayload := map[string]string{
		"email":    testEmail,
		"password": "SuperSecurePass123!",
	}
	body, _ = json.Marshal(loginPayload)
	resp, err = client.Post(server.URL+"/api/auth/login", "application/json", bytes.NewBuffer(body))
	if err != nil {
		t.Fatalf("Login request failed: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected status 200 OK, got %d", resp.StatusCode)
	}

	var loginRes struct {
		User  User   `json:"user"`
		Token string `json:"token"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&loginRes)
	resp.Body.Close()

	sessionToken := loginRes.Token

	// 3. TEST GET /api/auth/me WITH BEARER TOKEN
	req, _ := http.NewRequest("GET", server.URL+"/api/auth/me", nil)
	req.Header.Set("Authorization", "Bearer "+sessionToken)
	resp, err = client.Do(req)
	if err != nil {
		t.Fatalf("GET /api/auth/me failed: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected status 200 OK for /me, got %d", resp.StatusCode)
	}
	resp.Body.Close()

	// 4. TEST OTP SEND & VERIFY (EMAIL & SMS)
	otpSendPayload := map[string]string{
		"target": testEmail,
		"type":   "email",
	}
	body, _ = json.Marshal(otpSendPayload)
	resp, err = client.Post(server.URL+"/api/auth/otp/send", "application/json", bytes.NewBuffer(body))
	if err != nil {
		t.Fatalf("OTP Send failed: %v", err)
	}
	var otpSendRes struct {
		MockOTP string `json:"mock_otp"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&otpSendRes)
	resp.Body.Close()

	if otpSendRes.MockOTP == "" {
		t.Fatalf("Expected non-empty OTP code")
	}

	otpVerifyPayload := map[string]string{
		"target": testEmail,
		"code":   otpSendRes.MockOTP,
	}
	body, _ = json.Marshal(otpVerifyPayload)
	resp, err = client.Post(server.URL+"/api/auth/otp/verify", "application/json", bytes.NewBuffer(body))
	if err != nil {
		t.Fatalf("OTP Verify failed: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected status 200 OK for OTP verify, got %d", resp.StatusCode)
	}
	resp.Body.Close()

	// 5. TEST API KEY GENERATION FOR BUCKSTREAM CLI / DBMUX LEASE
	keyPayload := map[string]string{
		"name": "Production CLI Key",
	}
	body, _ = json.Marshal(keyPayload)
	req, _ = http.NewRequest("POST", server.URL+"/api/auth/keys", bytes.NewBuffer(body))
	req.Header.Set("Authorization", "Bearer "+sessionToken)
	resp, err = client.Do(req)
	if err != nil {
		t.Fatalf("API Key creation failed: %v", err)
	}
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("Expected status 201 Created for API Key, got %d", resp.StatusCode)
	}
	var keyRes struct {
		RawKey string `json:"raw_key"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&keyRes)
	resp.Body.Close()

	if keyRes.RawKey == "" {
		t.Fatalf("Expected non-empty raw_key")
	}

	// 6. TEST AUTHENTICATION VIA THE GENERATED API KEY
	req, _ = http.NewRequest("GET", server.URL+"/api/auth/me", nil)
	req.Header.Set("Authorization", "Bearer "+keyRes.RawKey)
	resp, err = client.Do(req)
	if err != nil {
		t.Fatalf("GET /api/auth/me via API key failed: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected status 200 OK for API Key auth, got %d", resp.StatusCode)
	}
	resp.Body.Close()

	// 7. TEST LOGOUT
	req, _ = http.NewRequest("POST", server.URL+"/api/auth/logout", nil)
	req.Header.Set("Authorization", "Bearer "+sessionToken)
	resp, err = client.Do(req)
	if err != nil {
		t.Fatalf("Logout failed: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected status 200 OK for logout, got %d", resp.StatusCode)
	}
	resp.Body.Close()
}

// =============================================================================
// OAuth Tests
// =============================================================================

func TestGitHubOAuthRedirect(t *testing.T) {
	t.Setenv("ARCAUTH_DATABASE_URL", "file::memory:?cache=shared&mode=memory")
	t.Setenv("GITHUB_CLIENT_ID", "test-gh-client-id")
	// Clear any redirect URI override so the dynamic path is exercised.
	t.Setenv("GITHUB_REDIRECT_URI", "")

	svc, err := NewAuthService("", "")
	if err != nil {
		t.Fatalf("NewAuthService: %v", err)
	}
	mux := http.NewServeMux()
	svc.RegisterRoutes(mux)
	server := httptest.NewServer(mux)
	defer server.Close()

	// Use a non-redirecting client so we can inspect the 307 response directly.
	client := &http.Client{
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	resp, err := client.Get(server.URL + "/api/auth/oauth/github?redirect_url=http://localhost:3000/dashboard")
	if err != nil {
		t.Fatalf("GET /api/auth/oauth/github: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusTemporaryRedirect {
		t.Fatalf("expected 307 TemporaryRedirect, got %d", resp.StatusCode)
	}

	location := resp.Header.Get("Location")
	if location == "" {
		t.Fatal("expected Location header, got none")
	}

	parsed, err := url.Parse(location)
	if err != nil {
		t.Fatalf("could not parse Location URL: %v", err)
	}

	if parsed.Host != "github.com" {
		t.Errorf("expected github.com host, got %q", parsed.Host)
	}
	q := parsed.Query()
	if q.Get("client_id") != "test-gh-client-id" {
		t.Errorf("expected client_id=test-gh-client-id, got %q", q.Get("client_id"))
	}
	if !strings.Contains(q.Get("scope"), "user:email") {
		t.Errorf("expected scope to contain user:email, got %q", q.Get("scope"))
	}
	if q.Get("state") == "" {
		t.Error("expected non-empty state parameter")
	}
	if q.Get("redirect_uri") == "" {
		t.Error("expected non-empty redirect_uri parameter")
	}
}

func TestGoogleOAuthRedirect(t *testing.T) {
	t.Setenv("ARCAUTH_DATABASE_URL", "file::memory:?cache=shared&mode=memory")
	t.Setenv("GOOGLE_CLIENT_ID", "test-google-client-id")
	t.Setenv("GOOGLE_REDIRECT_URI", "")

	svc, err := NewAuthService("", "")
	if err != nil {
		t.Fatalf("NewAuthService: %v", err)
	}
	mux := http.NewServeMux()
	svc.RegisterRoutes(mux)
	server := httptest.NewServer(mux)
	defer server.Close()

	client := &http.Client{
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	resp, err := client.Get(server.URL + "/api/auth/oauth/google?redirect_url=http://localhost:3000/dashboard")
	if err != nil {
		t.Fatalf("GET /api/auth/oauth/google: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusTemporaryRedirect {
		t.Fatalf("expected 307 TemporaryRedirect, got %d", resp.StatusCode)
	}

	location := resp.Header.Get("Location")
	parsed, err := url.Parse(location)
	if err != nil {
		t.Fatalf("could not parse Location URL: %v", err)
	}

	if parsed.Host != "accounts.google.com" {
		t.Errorf("expected accounts.google.com host, got %q", parsed.Host)
	}
	q := parsed.Query()
	if q.Get("client_id") != "test-google-client-id" {
		t.Errorf("expected client_id=test-google-client-id, got %q", q.Get("client_id"))
	}
	if !strings.Contains(q.Get("scope"), "email") {
		t.Errorf("expected scope to contain email, got %q", q.Get("scope"))
	}
	if q.Get("state") == "" {
		t.Error("expected non-empty state parameter")
	}
	if q.Get("redirect_uri") == "" {
		t.Error("expected non-empty redirect_uri parameter")
	}
}

func TestGoogleOAuthRedirect_NotConfigured(t *testing.T) {
	t.Setenv("ARCAUTH_DATABASE_URL", "file::memory:?cache=shared&mode=memory")
	t.Setenv("GOOGLE_CLIENT_ID", "")

	svc, err := NewAuthService("", "")
	if err != nil {
		t.Fatalf("NewAuthService: %v", err)
	}
	mux := http.NewServeMux()
	svc.RegisterRoutes(mux)
	server := httptest.NewServer(mux)
	defer server.Close()

	resp, err := server.Client().Get(server.URL + "/api/auth/oauth/google")
	if err != nil {
		t.Fatalf("GET /api/auth/oauth/google: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNotImplemented {
		t.Errorf("expected 501 NotImplemented when GOOGLE_CLIENT_ID unset, got %d", resp.StatusCode)
	}
}

// TestProcessOAuthUser_IdentityLinking exercises three scenarios:
//
//  1. New provider identity → creates auth_users row + auth_identities row, returns session token.
//  2. Same (provider, providerUserID) → resolves existing user via identity table (no new rows).
//  3. Different provider, same email → links a second auth_identities row to the same user.
func TestProcessOAuthUser_IdentityLinking(t *testing.T) {
	t.Setenv("ARCAUTH_DATABASE_URL", "file::memory:?cache=shared&mode=memory")
	t.Setenv("FRONTEND_URL", "http://localhost:3000")
	t.Setenv("SOCIAL_NO_NEW", "false")

	svc, err := NewAuthService("", "")
	if err != nil {
		t.Fatalf("NewAuthService: %v", err)
	}

	// --- helper: call processOAuthUser and capture the redirect HTML response ---
	callProcess := func(provider, providerUID, email, name string) *httptest.ResponseRecorder {
		req := httptest.NewRequest("GET", "/callback?state=http://localhost:3000", nil)
		rr := httptest.NewRecorder()
		processOAuthUser(svc, req.Context(), rr, req, provider, providerUID, email, name, "")
		return rr
	}

	// ------------------------------------------------------------------
	// Scenario 1: brand-new GitHub user with provider ID "gh-111"
	// ------------------------------------------------------------------
	rr := callProcess("github", "gh-111", "alice@example.com", "Alice")
	if rr.Code != http.StatusOK {
		t.Fatalf("scenario 1: expected 200, got %d", rr.Code)
	}
	// Verify auth_users row was created.
	var userID string
	err = svc.db.QueryRow(`SELECT id FROM auth_users WHERE email = ?`, "alice@example.com").Scan(&userID)
	if err != nil {
		t.Fatalf("scenario 1: auth_users row missing: %v", err)
	}
	// Verify auth_identities row was created.
	var identCount int
	err = svc.db.QueryRow(
		`SELECT COUNT(*) FROM auth_identities WHERE provider = 'github' AND provider_user_id = 'gh-111'`,
	).Scan(&identCount)
	if err != nil || identCount != 1 {
		t.Fatalf("scenario 1: expected 1 auth_identities row for github/gh-111, got %d (err=%v)", identCount, err)
	}
	// Response must contain a redirect to the frontend with a token.
	body := rr.Body.String()
	if !strings.Contains(body, "localhost:3000") {
		t.Errorf("scenario 1: expected frontend URL in redirect HTML, got:\n%s", body)
	}

	// ------------------------------------------------------------------
	// Scenario 2: same GitHub provider ID "gh-111" logs in again.
	//             Must resolve the existing user — no duplicate rows.
	// ------------------------------------------------------------------
	rr2 := callProcess("github", "gh-111", "alice@example.com", "Alice")
	if rr2.Code != http.StatusOK {
		t.Fatalf("scenario 2: expected 200, got %d", rr2.Code)
	}
	var userCount int
	err = svc.db.QueryRow(`SELECT COUNT(*) FROM auth_users WHERE email = ?`, "alice@example.com").Scan(&userCount)
	if err != nil || userCount != 1 {
		t.Fatalf("scenario 2: expected exactly 1 auth_users row, got %d", userCount)
	}
	err = svc.db.QueryRow(
		`SELECT COUNT(*) FROM auth_identities WHERE provider = 'github' AND provider_user_id = 'gh-111'`,
	).Scan(&identCount)
	if err != nil || identCount != 1 {
		t.Fatalf("scenario 2: expected exactly 1 auth_identities row, got %d", identCount)
	}

	// ------------------------------------------------------------------
	// Scenario 3: same email, different provider (Google) → second
	//             identity row linked to the same user.
	// ------------------------------------------------------------------
	rr3 := callProcess("google", "gg-999", "alice@example.com", "Alice G")
	if rr3.Code != http.StatusOK {
		t.Fatalf("scenario 3: expected 200, got %d", rr3.Code)
	}
	// Still only one user.
	err = svc.db.QueryRow(`SELECT COUNT(*) FROM auth_users WHERE email = ?`, "alice@example.com").Scan(&userCount)
	if err != nil || userCount != 1 {
		t.Fatalf("scenario 3: expected exactly 1 auth_users row, got %d", userCount)
	}
	// Now two identity rows total for this user.
	var totalIdents int
	err = svc.db.QueryRow(
		`SELECT COUNT(*) FROM auth_identities WHERE user_id = ?`, userID,
	).Scan(&totalIdents)
	if err != nil || totalIdents != 2 {
		t.Fatalf("scenario 3: expected 2 auth_identities rows for user, got %d", totalIdents)
	}
	// Google identity specifically.
	err = svc.db.QueryRow(
		`SELECT COUNT(*) FROM auth_identities WHERE provider = 'google' AND provider_user_id = 'gg-999'`,
	).Scan(&identCount)
	if err != nil || identCount != 1 {
		t.Fatalf("scenario 3: expected 1 auth_identities row for google/gg-999, got %d", identCount)
	}
}
