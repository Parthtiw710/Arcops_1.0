package authservice

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

// User represents the core user record (single-tenant — no team_id)
type User struct {
	ID               string    `json:"id"`
	Email            string    `json:"email"`
	Mobile           string    `json:"mobile,omitempty"`
	PasswordHash     string    `json:"-"`
	FullName         string    `json:"full_name"`
	AvatarURL        string    `json:"avatar_url"`
	Metadata         string    `json:"metadata"`
	PlanTier         int       `json:"plan_tier"` // 0: Free, 1: Pro, 2: Enterprise
	BillingID        string    `json:"billing_id,omitempty"`
	StripeCustomerID string    `json:"stripe_customer_id,omitempty"`
	IsEmailVerified  bool      `json:"is_email_verified"`
	IsMobileVerified bool      `json:"is_mobile_verified"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

// UserIdentity represents a linked OAuth provider identity (GitHub / Google)
type UserIdentity struct {
	ID             string    `json:"id"`
	UserID         string    `json:"user_id"`
	Provider       string    `json:"provider"`
	ProviderUserID string    `json:"provider_user_id"`
	IdentityData   string    `json:"identity_data"`
	CreatedAt      time.Time `json:"created_at"`
}

// APIKey represents a scoped Bearer token (no tenant scope — single-user)
type APIKey struct {
	ID               string     `json:"id"`
	UserID           string     `json:"user_id"`
	Role             string     `json:"role"`             // "admin" | "anon" | "sbx" | "api"
	KeyHash          string     `json:"-"`                // SHA-256 of raw key — never serialised
	KeyDisplayPrefix string     `json:"-"`
	KeySuffix        string     `json:"-"`
	Name             string     `json:"name"`
	LastUsedAt       *time.Time `json:"last_used_at,omitempty"`
	ExpiresAt        *time.Time `json:"expires_at,omitempty"`
	CreatedAt        time.Time  `json:"created_at"`
}

// KeyDisplay returns the masked representation safe to show in the dashboard.
func (k *APIKey) KeyDisplay() string {
	return k.KeyDisplayPrefix + strings.Repeat("•", 10) + k.KeySuffix
}

// Session represents an active web session
type Session struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	TokenHash string    `json:"-"`
	UserAgent string    `json:"user_agent"`
	IPAddress string    `json:"ip_address"`
	ExpiresAt time.Time `json:"expires_at"`
	CreatedAt time.Time `json:"created_at"`
}

// Security Helpers
func HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(bytes), err
}

func VerifyPassword(password, encodedHash string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(encodedHash), []byte(password))
	return err == nil
}

func HashToken(rawToken string) string {
	sum := sha256.Sum256([]byte(rawToken))
	return hex.EncodeToString(sum[:])
}

func GenerateSecureToken(length int) string {
	b := make([]byte, length)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func NewUUID() string {
	return uuid.NewString()
}
