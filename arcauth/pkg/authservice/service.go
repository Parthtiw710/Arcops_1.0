package authservice

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	_ "modernc.org/sqlite"
)

// ---------------------------------------------------------------------------
// JWT
// ---------------------------------------------------------------------------

type JWTClaims struct {
	Sub   string `json:"sub"`
	Email string `json:"email"`
	Role  string `json:"role"`
	Exp   int64  `json:"exp"`
}

func getJWTSecret() string {
	if sec := os.Getenv("JWT_SECRET"); sec != "" {
		return sec
	}
	if sec := os.Getenv("DBMUX_JWT_SECRET"); sec != "" {
		return sec
	}
	return "super_secret_jwt_key_change_me_in_production"
}

func GenerateJWT(u *User) (string, error) {
	secret := getJWTSecret()
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))
	claims := JWTClaims{
		Sub:   u.ID,
		Email: u.Email,
		Role:  "authenticated",
		Exp:   time.Now().Add(7 * 24 * time.Hour).Unix(),
	}
	payloadBytes, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}
	payload := base64.RawURLEncoding.EncodeToString(payloadBytes)
	sigInput := header + "." + payload

	h := hmac.New(sha256.New, []byte(secret))
	h.Write([]byte(sigInput))
	sig := base64.RawURLEncoding.EncodeToString(h.Sum(nil))

	return sigInput + "." + sig, nil
}

// ---------------------------------------------------------------------------
// AuthService
// ---------------------------------------------------------------------------

// AuthService handles all authentication endpoints, Redis caching, OTPs, and DB storage.
type AuthService struct {
	db          *sql.DB
	redisClient *redis.Client
	emailAdapter OTPAdapter
	smsAdapter   OTPAdapter

	mu             sync.RWMutex
	memorySessions map[string]*User
	memoryOTPs     map[string]string
	memoryAPIKeys  map[string]*APIKey
}

func NewAuthService(dbDSN string, redisURL string) (*AuthService, error) {
	if customDSN := os.Getenv("ARCAUTH_DATABASE_URL"); customDSN != "" {
		dbDSN = customDSN
	}
	if dbDSN == "" || strings.HasPrefix(dbDSN, "postgres") {
		dbDSN = "file:arcauth.db?cache=shared&mode=rwc"
	}
	db, err := sql.Open("sqlite", dbDSN)
	if err != nil {
		return nil, fmt.Errorf("failed to open arcauth database: %w", err)
	}

	if err := initSchema(db); err != nil {
		log.Printf("[ArcAuth] Schema init note: %v", err)
	}

	var rClient *redis.Client
	if redisURL != "" {
		opt, err := redis.ParseURL(redisURL)
		if err == nil {
			rClient = redis.NewClient(opt)
		}
	}

	svc := &AuthService{
		db:             db,
		redisClient:    rClient,
		emailAdapter:   selectEmailAdapter(),
		smsAdapter:     selectSMSAdapter(),
		memorySessions: make(map[string]*User),
		memoryOTPs:     make(map[string]string),
		memoryAPIKeys:  make(map[string]*APIKey),
	}

	return svc, nil
}

func selectEmailAdapter() OTPAdapter {
	provider := strings.ToLower(os.Getenv("EMAIL_PROVIDER"))
	smtpHost := os.Getenv("SMTP_HOST")

	if provider == "mock" {
		return &MockOTPAdapter{}
	}

	if provider == "smtp" || smtpHost != "" {
		port := os.Getenv("SMTP_PORT")
		if port == "" {
			port = "587"
		}
		return &SMTPEmailAdapter{
			Host:     smtpHost,
			Port:     port,
			Username: os.Getenv("SMTP_USERNAME"),
			Password: os.Getenv("SMTP_PASSWORD"),
			FromAddr: os.Getenv("SMTP_FROM"),
		}
	}
	return &ResendEmailAdapter{
		APIKey:   os.Getenv("RESEND_API_KEY"),
		FromAddr: os.Getenv("RESEND_FROM"),
	}
}

func selectSMSAdapter() OTPAdapter {
	provider := strings.ToLower(os.Getenv("SMS_PROVIDER"))
	switch provider {
	case "twilio":
		fromPhone := os.Getenv("TWILIO_FROM_PHONE")
		if fromPhone == "" {
			fromPhone = os.Getenv("TWILIO_SERVICE_SID")
		}
		return &TwilioSMSAdapter{
			AccountSID: os.Getenv("TWILIO_ACCOUNT_SID"),
			AuthToken:  os.Getenv("TWILIO_AUTH_TOKEN"),
			FromPhone:  fromPhone,
		}
	case "twilio_verify":
		return &TwilioVerifyAdapter{
			AccountSID: os.Getenv("TWILIO_ACCOUNT_SID"),
			AuthToken:  os.Getenv("TWILIO_AUTH_TOKEN"),
			ServiceSID: os.Getenv("TWILIO_SERVICE_SID"),
		}
	case "messagebird":
		return &MessagebirdSMSAdapter{
			AccessKey:  os.Getenv("MESSAGEBIRD_ACCESS_KEY"),
			Originator: os.Getenv("MESSAGEBIRD_ORIGINATOR"),
		}
	case "vonage":
		return &VonageSMSAdapter{
			APIKey:    os.Getenv("VONAGE_API_KEY"),
			APISecret: os.Getenv("VONAGE_API_SECRET"),
			From:      os.Getenv("VONAGE_FROM"),
		}
	case "textlocal":
		return &TextlocalSMSAdapter{
			APIKey: os.Getenv("TEXTLOCAL_API_KEY"),
			Sender: os.Getenv("TEXTLOCAL_SENDER"),
		}
	default:
		return &MockOTPAdapter{}
	}
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

func initSchema(db *sql.DB) error {
	schema := `
	CREATE TABLE IF NOT EXISTS auth_users (
		id VARCHAR(64) PRIMARY KEY,
		email VARCHAR(255) UNIQUE,
		mobile VARCHAR(32) UNIQUE,
		password_hash TEXT,
		full_name VARCHAR(128),
		avatar_url TEXT,
		metadata TEXT DEFAULT '{}',
		plan_tier INT NOT NULL DEFAULT 0,
		billing_id VARCHAR(64) DEFAULT NULL,
		stripe_customer_id VARCHAR(255) DEFAULT NULL,
		is_email_verified INT DEFAULT 0,
		is_mobile_verified INT DEFAULT 0,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS auth_identities (
		id VARCHAR(64) PRIMARY KEY,
		user_id VARCHAR(64) NOT NULL,
		provider VARCHAR(32) NOT NULL,
		provider_user_id VARCHAR(255) NOT NULL,
		identity_data TEXT DEFAULT '{}',
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS auth_api_keys (
		id                  VARCHAR(64)  PRIMARY KEY,
		user_id             VARCHAR(64)  NOT NULL,
		role                VARCHAR(16)  NOT NULL DEFAULT 'api',
		key_hash            VARCHAR(128) NOT NULL UNIQUE,
		key_display_prefix  VARCHAR(32)  NOT NULL,
		key_suffix          VARCHAR(4)   NOT NULL,
		name                VARCHAR(64)  NOT NULL,
		last_used_at        TIMESTAMP NULL,
		expires_at          TIMESTAMP NULL,
		created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS auth_sessions (
		id VARCHAR(64) PRIMARY KEY,
		user_id VARCHAR(64) NOT NULL,
		token_hash VARCHAR(128) NOT NULL UNIQUE,
		user_agent TEXT,
		ip_address VARCHAR(45),
		expires_at TIMESTAMP NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);`
	_, err := db.Exec(schema)
	return err
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

func (s *AuthService) RegisterRoutes(mux *http.ServeMux) {
	// Unified Authentication API (password, OTP, OAuth)
	mux.HandleFunc("POST /api/auth/authenticate", s.handleAuthenticate)
	mux.HandleFunc("POST /api/auth/auto", s.handleAuthenticate)
	mux.HandleFunc("POST /api/auth/signup", s.handleAuthenticate)
	mux.HandleFunc("POST /api/auth/register", s.handleAuthenticate)
	mux.HandleFunc("POST /api/auth/login", s.handleAuthenticate)

	mux.HandleFunc("POST /api/auth/logout", s.handleLogout)
	mux.HandleFunc("GET /api/auth/me", s.handleMe)

	mux.HandleFunc("POST /api/auth/otp/send", s.handleOTPSend)
	mux.HandleFunc("POST /api/auth/otp/verify", s.handleOTPVerify)

	// Dedicated Dashboard Unrestricted Admin Authentication Endpoints
	mux.HandleFunc("POST /api/auth/dashboard/otp/send", s.handleDashboardOTPSend)
	mux.HandleFunc("POST /api/auth/dashboard/authenticate", s.handleDashboardAuthenticate)

	// Magic Link
	mux.HandleFunc("POST /api/auth/magic-link/send", s.handleMagicLinkSend)
	mux.HandleFunc("GET /api/auth/magic-link/verify", s.handleMagicLinkVerify)
	mux.HandleFunc("POST /api/auth/magic-link/verify", s.handleMagicLinkVerify)

	// OAuth — GitHub
	mux.HandleFunc("GET /api/auth/oauth/github", s.handleGitHubOAuthRedirect)
	mux.HandleFunc("GET /api/auth/oauth/github/callback", s.handleGitHubOAuthCallback)

	// OAuth — Google
	mux.HandleFunc("GET /api/auth/oauth/google", s.handleGoogleOAuthRedirect)
	mux.HandleFunc("GET /api/auth/oauth/google/callback", s.handleGoogleOAuthCallback)

	// API Keys
	mux.HandleFunc("POST /api/auth/keys", s.handleCreateAPIKey)
	mux.HandleFunc("GET /api/auth/keys", s.handleListAPIKeys)
	mux.HandleFunc("DELETE /api/auth/keys", s.handleDeleteAPIKey)
	// Internal endpoint called by the gateway — not exposed publicly.
	mux.HandleFunc("POST /api/auth/keys/validate", s.handleValidateAPIKey)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func isSocialSignupDisabled() bool {
	val := strings.ToLower(os.Getenv("SOCIAL_NO_NEW"))
	if val == "true" || val == "1" || val == "yes" {
		return true
	}
	valDisable := strings.ToLower(os.Getenv("DISABLE_SOCIAL_SIGNUP"))
	return valDisable == "true" || valDisable == "1" || valDisable == "yes"
}

// scanUser scans a row produced by SELECT id, email, COALESCE(mobile,''), COALESCE(password_hash,''), COALESCE(full_name,''), plan_tier, created_at
func scanUser(row *sql.Row, u *User) error {
	return row.Scan(&u.ID, &u.Email, &u.Mobile, &u.PasswordHash, &u.FullName, &u.PlanTier, &u.CreatedAt)
}

const selectUserByEmail = `SELECT id, email, COALESCE(mobile, ''), COALESCE(password_hash, ''), COALESCE(full_name, ''), plan_tier, created_at FROM auth_users WHERE email = ?`
const selectUserByEmailOrMobile = `SELECT id, email, COALESCE(mobile, ''), COALESCE(password_hash, ''), COALESCE(full_name, ''), plan_tier, created_at FROM auth_users WHERE email = ? OR mobile = ?`
const selectUserByID = `SELECT id, email, COALESCE(mobile, ''), COALESCE(password_hash, ''), COALESCE(full_name, ''), plan_tier, created_at FROM auth_users WHERE id = ?`

// ---------------------------------------------------------------------------
// Authenticate (unified: password / OTP / OAuth)
// ---------------------------------------------------------------------------

func (s *AuthService) handleAuthenticate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Method   string `json:"method"`
		Email    string `json:"email"`
		Password string `json:"password"`
		Target   string `json:"target"`
		Code     string `json:"code"`
		FullName string `json:"full_name"`
		Mobile   string `json:"mobile"`
		Provider string `json:"provider"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON body", http.StatusBadRequest)
		return
	}

	if req.Method == "" {
		if req.Code != "" && req.Target != "" {
			req.Method = "otp"
		} else if req.Provider != "" {
			req.Method = "oauth"
		} else {
			req.Method = "password"
		}
	}

	// -----------------------------------------------------------------------
	// METHOD 1: OTP
	// -----------------------------------------------------------------------
	if req.Method == "otp" {
		if req.Target == "" || req.Code == "" {
			http.Error(w, "Target and Code are required for OTP authentication", http.StatusBadRequest)
			return
		}

		if !isAdminEmail(req.Target) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			_ = json.NewEncoder(w).Encode(map[string]string{
				"error":   "Access denied",
				"message": "Access restricted to authorized admin emails. Public registration is disabled.",
			})
			return
		}

		var stored string
		if s.redisClient != nil {
			if val, err := s.redisClient.Get(r.Context(), "otp:"+req.Target).Result(); err == nil {
				stored = val
			}
		}
		if stored == "" {
			s.mu.RLock()
			stored = s.memoryOTPs[req.Target]
			s.mu.RUnlock()
		}
		if stored == "" || stored != req.Code {
			http.Error(w, "Invalid or expired OTP code", http.StatusUnauthorized)
			return
		}

		s.mu.Lock()
		delete(s.memoryOTPs, req.Target)
		s.mu.Unlock()
		if s.redisClient != nil {
			_ = s.redisClient.Del(r.Context(), "otp:"+req.Target).Err()
		}

		var u User
		err := scanUser(s.db.QueryRowContext(r.Context(), selectUserByEmailOrMobile, req.Target, req.Target), &u)
		if err == nil {
			token := s.createSession(r.Context(), w, r, &u)
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"user": u, "token": token, "is_new_user": false})
			return
		}

		// Auto-register new OTP user
		isEmailTarget := strings.Contains(req.Target, "@")
		emailVal := req.Target
		mobileValStr := ""
		if !isEmailTarget {
			emailVal = fmt.Sprintf("user_%s@arcauth.local", NewUUID()[:8])
			mobileValStr = req.Target
		}

		newUser := &User{
			ID:        NewUUID(),
			Email:     emailVal,
			Mobile:    mobileValStr,
			FullName:  req.FullName,
			PlanTier:  0,
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}

		var mobileVal interface{} = nil
		if newUser.Mobile != "" {
			mobileVal = newUser.Mobile
		}

		insertQuery := `INSERT INTO auth_users (id, email, mobile, password_hash, full_name, plan_tier, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
		_, err = s.db.ExecContext(r.Context(), insertQuery, newUser.ID, newUser.Email, mobileVal, "", newUser.FullName, newUser.PlanTier, newUser.CreatedAt, newUser.UpdatedAt)
		if err != nil {
			http.Error(w, "Auto-registration failed for OTP user", http.StatusInternalServerError)
			return
		}

		token := s.createSession(r.Context(), w, r, newUser)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"user": newUser, "token": token, "is_new_user": true})
		return
	}

	// -----------------------------------------------------------------------
	// METHOD 2: OAuth (inline, via the authenticate endpoint)
	// -----------------------------------------------------------------------
	if req.Method == "oauth" {
		if req.Email == "" {
			http.Error(w, "Email required for OAuth authentication", http.StatusBadRequest)
			return
		}

		var u User
		err := scanUser(s.db.QueryRowContext(r.Context(), selectUserByEmail, req.Email), &u)
		if err == nil {
			token := s.createSession(r.Context(), w, r, &u)
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"user": u, "token": token, "is_new_user": false})
			return
		}

		if isSocialSignupDisabled() {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			_ = json.NewEncoder(w).Encode(map[string]string{
				"error":   "Social signups disabled",
				"message": "New account registration via social login is disabled (SOCIAL_NO_NEW=true).",
			})
			return
		}

		newUser := &User{
			ID:        NewUUID(),
			Email:     req.Email,
			FullName:  req.FullName,
			PlanTier:  0,
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}

		insertQuery := `INSERT INTO auth_users (id, email, mobile, password_hash, full_name, plan_tier, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
		_, err = s.db.ExecContext(r.Context(), insertQuery, newUser.ID, newUser.Email, nil, "", newUser.FullName, newUser.PlanTier, newUser.CreatedAt, newUser.UpdatedAt)
		if err != nil {
			http.Error(w, "Auto-registration failed for OAuth user", http.StatusInternalServerError)
			return
		}

		token := s.createSession(r.Context(), w, r, newUser)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"user": newUser, "token": token, "is_new_user": true})
		return
	}

	// -----------------------------------------------------------------------
	// METHOD 3: Email + Password
	// -----------------------------------------------------------------------
	if req.Email == "" || req.Password == "" {
		http.Error(w, "Email and Password are required", http.StatusBadRequest)
		return
	}

	var u User
	err := scanUser(s.db.QueryRowContext(r.Context(), selectUserByEmail, req.Email), &u)
	if err == nil {
		if !VerifyPassword(req.Password, u.PasswordHash) {
			http.Error(w, "Invalid email or password", http.StatusUnauthorized)
			return
		}
		token := s.createSession(r.Context(), w, r, &u)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"user": u, "token": token, "is_new_user": false})
		return
	}

	passHash, err := HashPassword(req.Password)
	if err != nil {
		http.Error(w, "Password processing error", http.StatusInternalServerError)
		return
	}

	newUser := &User{
		ID:           NewUUID(),
		Email:        req.Email,
		Mobile:       req.Mobile,
		PasswordHash: passHash,
		FullName:     req.FullName,
		PlanTier:     0,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	var mobileVal interface{} = nil
	if newUser.Mobile != "" {
		mobileVal = newUser.Mobile
	}

	insertQuery := `INSERT INTO auth_users (id, email, mobile, password_hash, full_name, plan_tier, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
	_, err = s.db.ExecContext(r.Context(), insertQuery, newUser.ID, newUser.Email, mobileVal, newUser.PasswordHash, newUser.FullName, newUser.PlanTier, newUser.CreatedAt, newUser.UpdatedAt)
	if err != nil {
		http.Error(w, "Auto-registration failed", http.StatusInternalServerError)
		return
	}

	token := s.createSession(r.Context(), w, r, newUser)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"user": newUser, "token": token, "is_new_user": true})
}

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

func (s *AuthService) handleLogout(w http.ResponseWriter, r *http.Request) {
	tokenStr := ""
	if cookie, err := r.Cookie("authx_session"); err == nil {
		tokenStr = cookie.Value
	}
	if tokenStr == "" {
		authHeader := strings.TrimSpace(r.Header.Get("Authorization"))
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) == 2 && strings.EqualFold(parts[0], "bearer") {
			tokenStr = strings.TrimSpace(parts[1])
		} else if len(parts) == 1 && parts[0] != "" {
			tokenStr = parts[0]
		}
	}

	if tokenStr != "" {
		hash := HashToken(tokenStr)
		_, _ = s.db.ExecContext(r.Context(), "DELETE FROM auth_sessions WHERE token_hash = ?", hash)

		s.mu.Lock()
		delete(s.memorySessions, hash)
		s.mu.Unlock()

		if s.redisClient != nil {
			_ = s.redisClient.Del(r.Context(), "session:"+hash).Err()
		}
	}

	http.SetCookie(w, &http.Cookie{Name: "authx_session", Value: "", Path: "/", MaxAge: -1, HttpOnly: true})
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"message": "Logged out successfully"})
}

// ---------------------------------------------------------------------------
// Me
// ---------------------------------------------------------------------------

func (s *AuthService) handleMe(w http.ResponseWriter, r *http.Request) {
	u := s.getAuthUser(r)
	if u == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(u)
}

// ---------------------------------------------------------------------------
// OTP
// ---------------------------------------------------------------------------

func sanitizeEmailToken(s string) string {
	s = strings.ToLower(s)
	s = strings.ReplaceAll(s, "\r", "")
	s = strings.ReplaceAll(s, "\n", "")
	s = strings.ReplaceAll(s, "\t", "")
	return strings.Trim(s, " \"'")
}

func isAdminEmail(email string) bool {
	raw := os.Getenv("ADMIN_EMAILS")
	for _, p := range []string{"../deploy/.env", "deploy/.env", ".env", "../../deploy/.env"} {
		if data, err := os.ReadFile(p); err == nil && len(data) > 0 {
			for _, line := range strings.Split(string(data), "\n") {
				line = strings.TrimSpace(line)
				if strings.HasPrefix(line, "ADMIN_EMAILS=") {
					raw = strings.TrimPrefix(line, "ADMIN_EMAILS=")
					break
				}
			}
		}
		if raw != "" {
			break
		}
	}
	if strings.TrimSpace(raw) == "" {
		return true
	}
	email = sanitizeEmailToken(email)
	if email == "" {
		return false
	}
	list := strings.Split(raw, ",")
	for _, entry := range list {
		entry = sanitizeEmailToken(entry)
		if entry == "" {
			continue
		}
		if entry == email {
			return true
		}
		if strings.HasPrefix(entry, "@") && strings.HasSuffix(email, entry) {
			return true
		}
		if strings.HasPrefix(entry, "*@") && strings.HasSuffix(email, strings.TrimPrefix(entry, "*")) {
			return true
		}
	}
	return false
}

func (s *AuthService) handleOTPSend(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Target string `json:"target"`
		Type   string `json:"type"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid body", http.StatusBadRequest)
		return
	}

	if !isAdminEmail(req.Target) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error":   "Access denied",
			"message": "Access restricted to authorized admin emails. Public registration is disabled.",
		})
		return
	}

	var b [3]byte
	_, _ = rand.Read(b[:])
	codeNum := (int(b[0])<<16 | int(b[1])<<8 | int(b[2])) % 1000000
	code := fmt.Sprintf("%06d", codeNum)

	s.mu.Lock()
	s.memoryOTPs[req.Target] = code
	s.mu.Unlock()

	if s.redisClient != nil {
		_ = s.redisClient.Set(r.Context(), "otp:"+req.Target, code, 5*time.Minute).Err()
	}

	var adapter OTPAdapter = s.emailAdapter
	if req.Type == "sms" {
		adapter = s.smsAdapter
	}

	if err := adapter.SendOTP(r.Context(), req.Target, code); err != nil {
		log.Printf("[ArcAuth OTP Warning] Provider %s failed: %v", adapter.ProviderName(), err)
	}

	var u User
	err := scanUser(s.db.QueryRowContext(r.Context(), selectUserByEmailOrMobile, req.Target, req.Target), &u)
	isNewUser := (err != nil)

	resp := map[string]interface{}{
		"message":     "OTP sent successfully",
		"provider":    adapter.ProviderName(),
		"user_exists": !isNewUser,
		"is_new_user": isNewUser,
	}
	if adapter.ProviderName() == "mock" {
		resp["mock_otp"] = code
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

// ---------------------------------------------------------------------------
// Dedicated Dashboard Unrestricted Admin Authentication Handlers
// ---------------------------------------------------------------------------

func (s *AuthService) handleDashboardOTPSend(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Target string `json:"target"`
		Type   string `json:"type"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid body", http.StatusBadRequest)
		return
	}

	if !isAdminEmail(req.Target) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error":   "Access denied",
			"message": "Access restricted to authorized admin emails configured in ADMIN_EMAILS.",
		})
		return
	}

	var b [3]byte
	_, _ = rand.Read(b[:])
	codeNum := (int(b[0])<<16 | int(b[1])<<8 | int(b[2])) % 1000000
	code := fmt.Sprintf("%06d", codeNum)

	s.mu.Lock()
	s.memoryOTPs[req.Target] = code
	s.mu.Unlock()

	if s.redisClient != nil {
		_ = s.redisClient.Set(r.Context(), "otp:"+req.Target, code, 5*time.Minute).Err()
	}

	var adapter OTPAdapter = s.emailAdapter
	if req.Type == "sms" {
		adapter = s.smsAdapter
	}

	if err := adapter.SendOTP(r.Context(), req.Target, code); err != nil {
		log.Printf("[ArcAuth Dashboard OTP Warning] Provider %s failed: %v", adapter.ProviderName(), err)
	}

	resp := map[string]interface{}{
		"message":      "Dashboard OTP sent successfully",
		"provider":     adapter.ProviderName(),
		"is_dashboard": true,
		"user_exists":  true,
	}
	if adapter.ProviderName() == "mock" {
		resp["mock_otp"] = code
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

func (s *AuthService) handleDashboardAuthenticate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Method string `json:"method"`
		Target string `json:"target"`
		Code   string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid body", http.StatusBadRequest)
		return
	}

	if !isAdminEmail(req.Target) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error":   "Access denied",
			"message": "Access restricted to authorized admin emails configured in ADMIN_EMAILS.",
		})
		return
	}

	var stored string
	if s.redisClient != nil {
		if val, err := s.redisClient.Get(r.Context(), "otp:"+req.Target).Result(); err == nil {
			stored = val
		}
	}
	if stored == "" {
		s.mu.RLock()
		stored = s.memoryOTPs[req.Target]
		s.mu.RUnlock()
	}

	if stored == "" || stored != req.Code {
		http.Error(w, "Invalid or expired OTP code", http.StatusUnauthorized)
		return
	}

	s.mu.Lock()
	delete(s.memoryOTPs, req.Target)
	s.mu.Unlock()
	if s.redisClient != nil {
		_ = s.redisClient.Del(r.Context(), "otp:"+req.Target).Err()
	}

	var u User
	err := scanUser(s.db.QueryRowContext(r.Context(), selectUserByEmailOrMobile, req.Target, req.Target), &u)
	if err != nil {
		u = User{
			ID:        NewUUID(),
			Email:     req.Target,
			FullName:  "System Administrator",
			PlanTier:  1,
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}
		insertQuery := `INSERT INTO auth_users (id, email, mobile, password_hash, full_name, plan_tier, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
		_, _ = s.db.ExecContext(r.Context(), insertQuery, u.ID, u.Email, nil, "", u.FullName, u.PlanTier, u.CreatedAt, u.UpdatedAt)
	}

	token := s.createSession(r.Context(), w, r, &u)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"user":         u,
		"token":        token,
		"is_dashboard": true,
	})
}

func (s *AuthService) handleOTPVerify(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Target string `json:"target"`
		Code   string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid body", http.StatusBadRequest)
		return
	}

	var stored string
	if s.redisClient != nil {
		val, err := s.redisClient.Get(r.Context(), "otp:"+req.Target).Result()
		if err == nil {
			stored = val
		}
	}
	if stored == "" {
		s.mu.RLock()
		stored = s.memoryOTPs[req.Target]
		s.mu.RUnlock()
	}

	if stored == "" || stored != req.Code {
		http.Error(w, "Invalid or expired OTP code", http.StatusUnauthorized)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"message": "OTP verified successfully"})
}

// ---------------------------------------------------------------------------
// Magic Link
// ---------------------------------------------------------------------------

func (s *AuthService) handleMagicLinkSend(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Email == "" {
		http.Error(w, "Email is required", http.StatusBadRequest)
		return
	}

	token := GenerateSecureToken(32)
	s.mu.Lock()
	s.memoryOTPs["magic:"+token] = req.Email
	s.mu.Unlock()

	if s.redisClient != nil {
		_ = s.redisClient.Set(r.Context(), "magic:"+token, req.Email, 15*time.Minute).Err()
	}

	gatewayHost := os.Getenv("GATEWAY_URL")
	if gatewayHost == "" {
		gatewayHost = "http://localhost:8000"
	}
	magicURL := fmt.Sprintf("%s/api/auth/magic-link/verify?token=%s", gatewayHost, token)

	if resendAdapter, ok := s.emailAdapter.(*ResendEmailAdapter); ok {
		_ = resendAdapter.SendMagicLink(r.Context(), req.Email, magicURL)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"message":   "Magic link sent successfully",
		"email":     req.Email,
		"magic_url": magicURL,
		"token":     token,
	})
}

func (s *AuthService) handleMagicLinkVerify(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		var req struct {
			Token string `json:"token"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		token = req.Token
	}

	if token == "" {
		http.Error(w, "Magic link token is required", http.StatusBadRequest)
		return
	}

	var email string
	if s.redisClient != nil {
		val, err := s.redisClient.Get(r.Context(), "magic:"+token).Result()
		if err == nil {
			email = val
		}
	}
	if email == "" {
		s.mu.RLock()
		email = s.memoryOTPs["magic:"+token]
		s.mu.RUnlock()
	}

	if email == "" {
		http.Error(w, "Invalid or expired magic link token", http.StatusUnauthorized)
		return
	}

	s.mu.Lock()
	delete(s.memoryOTPs, "magic:"+token)
	s.mu.Unlock()
	if s.redisClient != nil {
		_ = s.redisClient.Del(r.Context(), "magic:"+token).Err()
	}

	var u User
	err := scanUser(s.db.QueryRowContext(r.Context(), selectUserByEmail, email), &u)

	isNewUser := false
	if err != nil {
		newUser := &User{
			ID:        NewUUID(),
			Email:     email,
			FullName:  "Magic Link User",
			PlanTier:  0,
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}
		insertQuery := `INSERT INTO auth_users (id, email, mobile, password_hash, full_name, plan_tier, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
		_, insertErr := s.db.ExecContext(r.Context(), insertQuery, newUser.ID, newUser.Email, nil, "", newUser.FullName, newUser.PlanTier, newUser.CreatedAt, newUser.UpdatedAt)
		if insertErr != nil {
			http.Error(w, "Auto-registration failed for magic link user", http.StatusInternalServerError)
			return
		}
		u = *newUser
		isNewUser = true
	}

	sessToken := s.createSession(r.Context(), w, r, &u)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"message":     "Magic link verified successfully",
		"user":        u,
		"token":       sessToken,
		"is_new_user": isNewUser,
	})
}

// ---------------------------------------------------------------------------
// API Keys
// ---------------------------------------------------------------------------

func apiKeySigningSecret() string {
	if s := os.Getenv("ARCOPS_KEY_SIGNING_SECRET"); s != "" {
		return s
	}
	return os.Getenv("JWT_SECRET")
}

// mintAPIKey generates a signed key of the form "<role>.<hmac>"
func mintAPIKey(role string) (rawKey, keyHash, displayPrefix, suffix string, err error) {
	secret := apiKeySigningSecret()
	if secret == "" {
		return "", "", "", "", fmt.Errorf("ARCOPS_KEY_SIGNING_SECRET / JWT_SECRET not configured")
	}

	payload := role + "_" + GenerateSecureToken(8)

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(payload))
	hmacHex := hex.EncodeToString(mac.Sum(nil))

	rawKey = payload + "." + hmacHex
	keyHash = HashToken(rawKey)

	displayPrefix = payload + "." + hmacHex[:3]
	suffix = hmacHex[len(hmacHex)-2:]
	return rawKey, keyHash, displayPrefix, suffix, nil
}

func (s *AuthService) handleCreateAPIKey(w http.ResponseWriter, r *http.Request) {
	u := s.getAuthUser(r)
	if u == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		Name string `json:"name"`
		Role string `json:"role"` // "admin" | "anon" | "sbx" | "api" (default)
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	if req.Name == "" {
		req.Name = "Default API Key"
	}
	switch req.Role {
	case "admin", "anon", "sbx":
		// valid
	default:
		req.Role = "api"
	}

	rawKey, keyHash, displayPrefix, sfx, err := mintAPIKey(req.Role)
	if err != nil {
		http.Error(w, "Key generation failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	k := &APIKey{
		ID:               NewUUID(),
		UserID:           u.ID,
		Role:             req.Role,
		KeyHash:          keyHash,
		KeyDisplayPrefix: displayPrefix,
		KeySuffix:        sfx,
		Name:             req.Name,
		CreatedAt:        time.Now(),
	}

	query := `INSERT INTO auth_api_keys (id, user_id, role, key_hash, key_display_prefix, key_suffix, name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
	if _, err := s.db.ExecContext(r.Context(), query, k.ID, k.UserID, k.Role, k.KeyHash, k.KeyDisplayPrefix, k.KeySuffix, k.Name, k.CreatedAt); err != nil {
		http.Error(w, "Failed to create API key", http.StatusInternalServerError)
		return
	}

	s.mu.Lock()
	s.memoryAPIKeys[keyHash] = k
	s.mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"id":          k.ID,
		"name":        k.Name,
		"role":        k.Role,
		"key_display": k.KeyDisplay(),
		"raw_key":     rawKey,
		"created_at":  k.CreatedAt,
	})
}

func (s *AuthService) handleListAPIKeys(w http.ResponseWriter, r *http.Request) {
	u := s.getAuthUser(r)
	if u == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	rows, err := s.db.QueryContext(r.Context(),
		`SELECT id, user_id, role, key_display_prefix, key_suffix, name, last_used_at, created_at FROM auth_api_keys WHERE user_id = ? ORDER BY created_at DESC`, u.ID)
	if err != nil {
		http.Error(w, "Query error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type keyResponse struct {
		ID         string     `json:"id"`
		UserID     string     `json:"user_id"`
		Role       string     `json:"role"`
		KeyDisplay string     `json:"key_display"`
		Name       string     `json:"name"`
		LastUsedAt *time.Time `json:"last_used_at,omitempty"`
		CreatedAt  time.Time  `json:"created_at"`
	}

	var keys []keyResponse
	for rows.Next() {
		var k APIKey
		if err := rows.Scan(&k.ID, &k.UserID, &k.Role, &k.KeyDisplayPrefix, &k.KeySuffix, &k.Name, &k.LastUsedAt, &k.CreatedAt); err == nil {
			keys = append(keys, keyResponse{
				ID:         k.ID,
				UserID:     k.UserID,
				Role:       k.Role,
				KeyDisplay: k.KeyDisplay(),
				Name:       k.Name,
				LastUsedAt: k.LastUsedAt,
				CreatedAt:  k.CreatedAt,
			})
		}
	}

	if keys == nil {
		keys = []keyResponse{}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"keys": keys})
}

func (s *AuthService) handleDeleteAPIKey(w http.ResponseWriter, r *http.Request) {
	u := s.getAuthUser(r)
	if u == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "API Key ID required", http.StatusBadRequest)
		return
	}

	var keyHash string
	err := s.db.QueryRowContext(r.Context(),
		`SELECT key_hash FROM auth_api_keys WHERE id = ? AND user_id = ?`, id, u.ID,
	).Scan(&keyHash)
	if err != nil {
		http.Error(w, "API key not found", http.StatusNotFound)
		return
	}

	if _, err := s.db.ExecContext(r.Context(),
		`DELETE FROM auth_api_keys WHERE id = ? AND user_id = ?`, id, u.ID,
	); err != nil {
		http.Error(w, "Delete failed", http.StatusInternalServerError)
		return
	}

	s.mu.Lock()
	delete(s.memoryAPIKeys, keyHash)
	s.mu.Unlock()

	if s.redisClient != nil {
		_ = s.redisClient.Set(r.Context(), "revoked_key:"+keyHash, "1", 24*time.Hour).Err()
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"message": "API key revoked and access terminated"})
}

// handleValidateAPIKey is an internal endpoint called by the gateway to validate keys.
func (s *AuthService) handleValidateAPIKey(w http.ResponseWriter, r *http.Request) {
	var req struct {
		KeyHash string `json:"key_hash"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.KeyHash == "" {
		http.Error(w, "key_hash required", http.StatusBadRequest)
		return
	}

	if s.redisClient != nil {
		if val, err := s.redisClient.Get(r.Context(), "revoked_key:"+req.KeyHash).Result(); err == nil && val == "1" {
			http.Error(w, "Key revoked", http.StatusUnauthorized)
			return
		}
	}

	s.mu.RLock()
	cached, inMemory := s.memoryAPIKeys[req.KeyHash]
	s.mu.RUnlock()

	if inMemory {
		go func() {
			_, _ = s.db.Exec(`UPDATE auth_api_keys SET last_used_at = ? WHERE key_hash = ?`, time.Now(), req.KeyHash)
		}()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{
			"user_id": cached.UserID,
			"role":    cached.Role,
		})
		return
	}

	var k APIKey
	err := s.db.QueryRowContext(r.Context(),
		`SELECT id, user_id, role FROM auth_api_keys WHERE key_hash = ?`, req.KeyHash,
	).Scan(&k.ID, &k.UserID, &k.Role)
	if err != nil {
		http.Error(w, "Invalid API key", http.StatusUnauthorized)
		return
	}

	s.mu.Lock()
	s.memoryAPIKeys[req.KeyHash] = &k
	s.mu.Unlock()

	go func() {
		_, _ = s.db.Exec(`UPDATE auth_api_keys SET last_used_at = ? WHERE key_hash = ?`, time.Now(), req.KeyHash)
	}()

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"user_id": k.UserID,
		"role":    k.Role,
	})
}

// ---------------------------------------------------------------------------
// OAuth (GitHub + Google)
// ---------------------------------------------------------------------------

func getReturnOrigin(r *http.Request) string {
	if target := r.URL.Query().Get("redirect_url"); target != "" {
		if unescaped, err := url.QueryUnescape(target); err == nil && unescaped != "" {
			if u, err := url.Parse(unescaped); err == nil && u.Scheme != "" && u.Host != "" {
				return fmt.Sprintf("%s://%s", u.Scheme, u.Host)
			}
			if strings.HasPrefix(unescaped, "http") {
				return unescaped
			}
		}
	}
	if target := r.URL.Query().Get("state"); target != "" {
		if unescaped, err := url.QueryUnescape(target); err == nil && unescaped != "" {
			if u, err := url.Parse(unescaped); err == nil && u.Scheme != "" && u.Host != "" {
				return fmt.Sprintf("%s://%s", u.Scheme, u.Host)
			}
			if strings.HasPrefix(unescaped, "http") {
				return unescaped
			}
		}
	}
	if ref := r.Header.Get("Referer"); ref != "" {
		if u, err := url.Parse(ref); err == nil && u.Scheme != "" && u.Host != "" {
			return fmt.Sprintf("%s://%s", u.Scheme, u.Host)
		}
	}
	if orig := r.Header.Get("Origin"); orig != "" {
		if u, err := url.Parse(orig); err == nil && u.Scheme != "" && u.Host != "" {
			return fmt.Sprintf("%s://%s", u.Scheme, u.Host)
		}
	}
	return "http://localhost:3000"
}

func processOAuthUser(s *AuthService, ctx context.Context, w http.ResponseWriter, r *http.Request, provider string, providerUserID string, email string, fullName string, avatarURL string) {
	var u User

	isDashboard := strings.Contains(r.URL.Query().Get("state"), "auth=dashboard") ||
		r.URL.Query().Get("auth") == "dashboard" ||
		r.Header.Get("X-Auth-Scope") == "dashboard"

	// Step 1: ALWAYS Enforce admin email check first for all OAuth attempts
	if email != "" && !isAdminEmail(email) {
		origin := getReturnOrigin(r)
		errMsg := url.QueryEscape("Access forbidden: Email address (" + email + ") is not authorized in ADMIN_EMAILS.")
		redirectURL := fmt.Sprintf("%s/error?code=403&message=%s", origin, errMsg)
		http.Redirect(w, r, redirectURL, http.StatusTemporaryRedirect)
		return
	}

	// Step 2: Resolve by existing linked provider identity
	if providerUserID != "" {
		var linkedUserID string
		identErr := s.db.QueryRowContext(ctx,
			`SELECT user_id FROM auth_identities WHERE provider = ? AND provider_user_id = ?`,
			provider, providerUserID,
		).Scan(&linkedUserID)

		if identErr == nil {
			queryErr := scanUser(s.db.QueryRowContext(ctx, selectUserByID, linkedUserID), &u)
			if queryErr == nil {
				token := s.createSession(ctx, w, r, &u)
				redirectOAuthUser(w, r, &u, token)
				return
			}
		}
	}

	// Step 3: Fall back to email lookup or auto-creation
	emailErr := scanUser(s.db.QueryRowContext(ctx, selectUserByEmail, email), &u)

	if emailErr != nil {
		if !isDashboard && isSocialSignupDisabled() {
			http.Error(w, "Social signups disabled for new users (SOCIAL_NO_NEW=true)", http.StatusForbidden)
			return
		}

		newUser := &User{
			ID:        NewUUID(),
			Email:     email,
			Mobile:    "",
			FullName:  fullName,
			AvatarURL: avatarURL,
			PlanTier:  0,
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}
		insertQuery := `INSERT INTO auth_users (id, email, mobile, password_hash, full_name, avatar_url, plan_tier, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
		_, insertErr := s.db.ExecContext(ctx, insertQuery,
			newUser.ID, newUser.Email, "", "", newUser.FullName, avatarURL,
			newUser.PlanTier, newUser.CreatedAt, newUser.UpdatedAt,
		)
		if insertErr != nil {
			log.Printf("[ArcAuth OAuth Note] Auto user creation note: %v", insertErr)
			if !isDashboard {
				http.Error(w, "OAuth user creation failed", http.StatusInternalServerError)
				return
			}
		}
		u = *newUser
	}

	// Step 4: Upsert auth_identities
	if providerUserID != "" {
		identityData, _ := json.Marshal(map[string]string{
			"email":      email,
			"full_name":  fullName,
			"avatar_url": avatarURL,
		})
		if _, identInsertErr := s.db.ExecContext(ctx,
			`INSERT OR IGNORE INTO auth_identities (id, user_id, provider, provider_user_id, identity_data, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
			NewUUID(), u.ID, provider, providerUserID, string(identityData), time.Now(),
		); identInsertErr != nil {
			log.Printf("[ArcAuth Identity Warning] Upsert identity (%s/%s) error: %v", provider, providerUserID, identInsertErr)
		}
	}

	token := s.createSession(ctx, w, r, &u)
	redirectOAuthUser(w, r, &u, token)
}

func redirectOAuthUser(w http.ResponseWriter, r *http.Request, u *User, token string) {
	returnHost := r.URL.Query().Get("state")
	if unescaped, err := url.QueryUnescape(returnHost); err == nil && unescaped != "" {
		returnHost = unescaped
	}
	if returnHost == "" || returnHost == "/" || strings.Contains(returnHost, "api-arcops") {
		returnHost = getReturnOrigin(r)
	}

	uJSON, _ := json.Marshal(u)
	encodedUser := url.QueryEscape(string(uJSON))

	separator := "?"
	if strings.Contains(returnHost, "?") {
		separator = "&"
	}
	redirectTarget := fmt.Sprintf("%s%stoken=%s&user=%s", returnHost, separator, token, encodedUser)

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprintf(w, `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Redirecting to Dashboard...</title>
  <script>
    window.location.href = %q;
  </script>
</head>
<body>
  <p>Authenticating... If you are not redirected automatically, <a href=%q>click here</a>.</p>
  <script>
    setTimeout(function() { window.location.href = %q; }, 100);
  </script>
</body>
</html>`, redirectTarget, redirectTarget, redirectTarget)
}

func getOAuthRedirectURI(r *http.Request, provider string) string {
	if custom := os.Getenv(strings.ToUpper(provider) + "_REDIRECT_URI"); custom != "" {
		return custom
	}

	host := r.Header.Get("X-Forwarded-Host")
	if host == "" {
		host = r.Host
	}
	if host == "" {
		host = "localhost:8080"
	}

	scheme := "http"
	if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}

	return fmt.Sprintf("%s://%s/api/auth/oauth/%s/callback", scheme, host, provider)
}

func (s *AuthService) handleGitHubOAuthRedirect(w http.ResponseWriter, r *http.Request) {
	clientID := os.Getenv("GITHUB_CLIENT_ID")
	if clientID == "" {
		http.Error(w, "GitHub OAuth not configured", http.StatusNotImplemented)
		return
	}
	redirectURI := getOAuthRedirectURI(r, "github")
	origin := r.URL.Query().Get("redirect_url")
	if origin == "" {
		origin = r.Header.Get("Referer")
	}
	if origin == "" {
		origin = "/"
	}

	isDashboard := r.URL.Query().Get("auth") == "dashboard" || r.Header.Get("X-Auth-Scope") == "dashboard"
	if isDashboard && !strings.Contains(origin, "auth=dashboard") {
		if strings.Contains(origin, "?") {
			origin += "&auth=dashboard"
		} else {
			origin += "?auth=dashboard"
		}
	}

	authURL := fmt.Sprintf("https://github.com/login/oauth/authorize?client_id=%s&redirect_uri=%s&state=%s&scope=user:email", clientID, url.QueryEscape(redirectURI), url.QueryEscape(origin))
	http.Redirect(w, r, authURL, http.StatusTemporaryRedirect)
}

func (s *AuthService) handleGitHubOAuthCallback(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	if code == "" {
		http.Error(w, "OAuth code missing", http.StatusBadRequest)
		return
	}

	clientID := os.Getenv("GITHUB_CLIENT_ID")
	clientSecret := os.Getenv("GITHUB_CLIENT_SECRET")

	tokenURL := "https://github.com/login/oauth/access_token"
	data := url.Values{}
	data.Set("code", code)
	data.Set("client_id", clientID)
	data.Set("client_secret", clientSecret)

	req, _ := http.NewRequest("POST", tokenURL, strings.NewReader(data.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	resp, err := http.DefaultClient.Do(req)
	var email, name, avatarURL, providerUserID string

	if err == nil && resp.StatusCode == 200 {
		var tokenResp struct {
			AccessToken string `json:"access_token"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&tokenResp)
		resp.Body.Close()

		userReq, _ := http.NewRequest("GET", "https://api.github.com/user", nil)
		userReq.Header.Set("Authorization", "Bearer "+tokenResp.AccessToken)
		userReq.Header.Set("User-Agent", "ArcAuth-Service")
		userResp, userErr := http.DefaultClient.Do(userReq)
		if userErr == nil && userResp.StatusCode == 200 {
			var ghUser struct {
				ID        int64  `json:"id"`
				Login     string `json:"login"`
				Name      string `json:"name"`
				Email     string `json:"email"`
				AvatarURL string `json:"avatar_url"`
			}
			_ = json.NewDecoder(userResp.Body).Decode(&ghUser)
			userResp.Body.Close()

			providerUserID = fmt.Sprintf("%d", ghUser.ID)
			email = ghUser.Email
			name = ghUser.Name
			if name == "" {
				name = ghUser.Login
			}
			avatarURL = ghUser.AvatarURL

			// Always fetch all GitHub emails to check for authorized admin email
			emailsReq, _ := http.NewRequest("GET", "https://api.github.com/user/emails", nil)
			emailsReq.Header.Set("Authorization", "Bearer "+tokenResp.AccessToken)
			emailsReq.Header.Set("User-Agent", "ArcAuth-Service")
			emailsResp, emailsErr := http.DefaultClient.Do(emailsReq)
			if emailsErr == nil && emailsResp.StatusCode == 200 {
				var ghEmails []struct {
					Email    string `json:"email"`
					Primary  bool   `json:"primary"`
					Verified bool   `json:"verified"`
				}
				_ = json.NewDecoder(emailsResp.Body).Decode(&ghEmails)
				emailsResp.Body.Close()

				// Priority 1: Pick any verified email matching ADMIN_EMAILS
				for _, e := range ghEmails {
					if e.Verified && isAdminEmail(e.Email) {
						email = e.Email
						break
					}
				}
				// Priority 2: Pick any email matching ADMIN_EMAILS
				if email == "" {
					for _, e := range ghEmails {
						if isAdminEmail(e.Email) {
							email = e.Email
							break
						}
					}
				}
				// Priority 3: Pick primary verified email
				if email == "" {
					for _, e := range ghEmails {
						if e.Primary && e.Verified {
							email = e.Email
							break
						}
					}
				}
				// Priority 4: Pick any verified email
				if email == "" {
					for _, e := range ghEmails {
						if e.Verified {
							email = e.Email
							break
						}
					}
				}
			}

			if email == "" && ghUser.Email != "" {
				email = ghUser.Email
			}

			if email == "" && ghUser.Login != "" {
				email = ghUser.Login + "@users.noreply.github.com"
			}
		}
	}

	if email == "" {
		http.Error(w, "Could not retrieve email from GitHub account", http.StatusBadGateway)
		return
	}

	processOAuthUser(s, r.Context(), w, r, "github", providerUserID, email, name, avatarURL)
}

func (s *AuthService) handleGoogleOAuthRedirect(w http.ResponseWriter, r *http.Request) {
	clientID := os.Getenv("GOOGLE_CLIENT_ID")
	if clientID == "" {
		http.Error(w, "Google OAuth not configured", http.StatusNotImplemented)
		return
	}
	redirectURI := getOAuthRedirectURI(r, "google")
	origin := r.URL.Query().Get("redirect_url")
	if origin == "" {
		origin = r.Header.Get("Referer")
	}
	if origin == "" {
		origin = "/"
	}

	isDashboard := r.URL.Query().Get("auth") == "dashboard" || r.Header.Get("X-Auth-Scope") == "dashboard"
	if isDashboard && !strings.Contains(origin, "auth=dashboard") {
		if strings.Contains(origin, "?") {
			origin += "&auth=dashboard"
		} else {
			origin += "?auth=dashboard"
		}
	}

	authURL := fmt.Sprintf("https://accounts.google.com/o/oauth2/v2/auth?client_id=%s&response_type=code&scope=openid%%20email%%20profile&redirect_uri=%s&state=%s", clientID, url.QueryEscape(redirectURI), url.QueryEscape(origin))
	http.Redirect(w, r, authURL, http.StatusTemporaryRedirect)
}

func (s *AuthService) handleGoogleOAuthCallback(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	if code == "" {
		http.Error(w, "OAuth code missing", http.StatusBadRequest)
		return
	}

	clientID := os.Getenv("GOOGLE_CLIENT_ID")
	clientSecret := os.Getenv("GOOGLE_CLIENT_SECRET")
	redirectURI := getOAuthRedirectURI(r, "google")

	tokenURL := "https://oauth2.googleapis.com/token"
	data := url.Values{}
	data.Set("code", code)
	data.Set("client_id", clientID)
	data.Set("client_secret", clientSecret)
	data.Set("redirect_uri", redirectURI)
	data.Set("grant_type", "authorization_code")

	resp, err := http.PostForm(tokenURL, data)
	var email, name, picture, providerUserID string

	if err != nil || resp == nil || resp.StatusCode != 200 {
		var errBody []byte
		status := 500
		if resp != nil {
			status = resp.StatusCode
			errBody, _ = io.ReadAll(resp.Body)
			resp.Body.Close()
		}
		log.Printf("[ArcAuth Google OAuth Error] Token exchange failed (status %d): %s (err: %v)", status, string(errBody), err)
		origin := getReturnOrigin(r)
		errMsg := url.QueryEscape(fmt.Sprintf("Google OAuth error (%d): %s", status, string(errBody)))
		redirectURL := fmt.Sprintf("%s/error?code=%d&message=%s", origin, status, errMsg)
		http.Redirect(w, r, redirectURL, http.StatusTemporaryRedirect)
		return
	}

	var tokenResp struct {
		AccessToken string `json:"access_token"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&tokenResp)
	resp.Body.Close()

	userReq, _ := http.NewRequest("GET", "https://www.googleapis.com/oauth2/v2/userinfo", nil)
	userReq.Header.Set("Authorization", "Bearer "+tokenResp.AccessToken)
	userResp, userErr := http.DefaultClient.Do(userReq)
	if userErr == nil && userResp.StatusCode == 200 {
		var googleUser struct {
			ID      string `json:"id"`
			Email   string `json:"email"`
			Name    string `json:"name"`
			Picture string `json:"picture"`
		}
		_ = json.NewDecoder(userResp.Body).Decode(&googleUser)
		userResp.Body.Close()
		providerUserID = googleUser.ID
		email = googleUser.Email
		name = googleUser.Name
		picture = googleUser.Picture
	} else if userResp != nil {
		userBody, _ := io.ReadAll(userResp.Body)
		userResp.Body.Close()
		log.Printf("[ArcAuth Google UserInfo Error] status %d: %s", userResp.StatusCode, string(userBody))
	}

	if email == "" {
		origin := getReturnOrigin(r)
		errMsg := url.QueryEscape("Could not retrieve email from Google account")
		redirectURL := fmt.Sprintf("%s/error?code=502&message=%s", origin, errMsg)
		http.Redirect(w, r, redirectURL, http.StatusTemporaryRedirect)
		return
	}

	processOAuthUser(s, r.Context(), w, r, "google", providerUserID, email, name, picture)
}

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

func (s *AuthService) createSession(ctx context.Context, w http.ResponseWriter, r *http.Request, u *User) string {
	userAgent := ""
	ip := ""
	if r != nil {
		userAgent = r.UserAgent()
		ip = r.RemoteAddr
	}

	jwtToken, err := GenerateJWT(u)
	if err != nil {
		jwtToken = GenerateSecureToken(32)
	}

	tokenHash := HashToken(jwtToken)
	expiresAt := time.Now().Add(7 * 24 * time.Hour)

	sessID := NewUUID()
	query := `INSERT INTO auth_sessions (id, user_id, token_hash, user_agent, ip_address, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
	_, _ = s.db.ExecContext(ctx, query, sessID, u.ID, tokenHash, userAgent, ip, expiresAt, time.Now())

	s.mu.Lock()
	s.memorySessions[tokenHash] = u
	s.mu.Unlock()

	if s.redisClient != nil {
		uJSON, _ := json.Marshal(u)
		_ = s.redisClient.Set(ctx, "session:"+tokenHash, uJSON, 7*24*time.Hour).Err()
	}

	isSecure := r != nil && (r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https")
	http.SetCookie(w, &http.Cookie{
		Name:     "authx_session",
		Value:    jwtToken,
		Path:     "/",
		Expires:  expiresAt,
		HttpOnly: true,
		Secure:   isSecure,
		SameSite: http.SameSiteLaxMode,
	})

	return jwtToken
}

func (s *AuthService) getAuthUser(r *http.Request) *User {
	var rawToken string
	authHeader := strings.TrimSpace(r.Header.Get("Authorization"))
	if authHeader != "" {
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) == 2 && strings.EqualFold(parts[0], "bearer") {
			rawToken = strings.TrimSpace(parts[1])
		} else if len(parts) == 1 {
			rawToken = parts[0]
		}
	}
	if rawToken == "" {
		if cookie, err := r.Cookie("authx_session"); err == nil {
			rawToken = cookie.Value
		}
	}
	if rawToken == "" {
		return nil
	}

	hash := HashToken(rawToken)

	// 1. API key memory cache
	s.mu.RLock()
	if key, ok := s.memoryAPIKeys[hash]; ok {
		s.mu.RUnlock()
		return &User{ID: key.UserID}
	}
	s.mu.RUnlock()

	// 2. API key DB lookup
	var k APIKey
	if err := s.db.QueryRowContext(r.Context(), "SELECT user_id FROM auth_api_keys WHERE key_hash = ?", hash).Scan(&k.UserID); err == nil {
		return &User{ID: k.UserID}
	}

	// 3. Session memory cache
	s.mu.RLock()
	if u, ok := s.memorySessions[hash]; ok {
		s.mu.RUnlock()
		return u
	}
	s.mu.RUnlock()

	// 4. Redis session
	if s.redisClient != nil {
		val, err := s.redisClient.Get(r.Context(), "session:"+hash).Result()
		if err == nil {
			var u User
			if err := json.Unmarshal([]byte(val), &u); err == nil {
				return &u
			}
		}
	}

	// 5. DB session lookup
	var u User
	query := `SELECT u.id, u.email, u.full_name, u.plan_tier FROM auth_sessions s JOIN auth_users u ON s.user_id = u.id WHERE s.token_hash = ?`
	if err := s.db.QueryRowContext(r.Context(), query, hash).Scan(&u.ID, &u.Email, &u.FullName, &u.PlanTier); err != nil {
		return nil
	}

	return &u
}
