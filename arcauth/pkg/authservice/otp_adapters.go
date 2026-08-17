package authservice

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/smtp"
	"net/url"
	"strings"
	"time"
)

// OTPAdapter interface for pluggable Email & SMS REST providers
type OTPAdapter interface {
	SendOTP(ctx context.Context, target string, code string) error
	ProviderName() string
}

// -----------------------------------------------------------------------------
// EMAIL PROVIDERS
// -----------------------------------------------------------------------------

// ResendEmailAdapter sends Email OTP via Resend REST API
type ResendEmailAdapter struct {
	APIKey   string
	FromAddr string
}

func (r *ResendEmailAdapter) ProviderName() string { return "resend" }
func (r *ResendEmailAdapter) SendOTP(ctx context.Context, toEmail string, code string) error {
	if r.APIKey == "" {
		return fmt.Errorf("resend API key not configured")
	}
	from := r.FromAddr
	if from == "" {
		from = "onboarding@resend.dev"
	}
	body := map[string]interface{}{
		"from":    from,
		"to":      []string{toEmail},
		"subject": fmt.Sprintf("[%s] Your Verification Code", code),
		"html":    fmt.Sprintf("<p>Your security verification code is: <strong>%s</strong>. It expires in 5 minutes.</p>", code),
	}
	jsonBytes, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, "POST", "https://api.resend.com/emails", bytes.NewBuffer(jsonBytes))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+r.APIKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		var errResp struct {
			Message string `json:"message"`
			Name    string `json:"name"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&errResp)
		return fmt.Errorf("resend returned status code %d: [%s] %s", resp.StatusCode, errResp.Name, errResp.Message)
	}
	return nil
}

func (r *ResendEmailAdapter) SendMagicLink(ctx context.Context, toEmail string, magicURL string) error {
	if r.APIKey == "" {
		return fmt.Errorf("resend API key not configured")
	}
	from := r.FromAddr
	if from == "" {
		from = "onboarding@resend.dev"
	}
	body := map[string]interface{}{
		"from":    from,
		"to":      []string{toEmail},
		"subject": "🪄 Your ArcOps Magic Login Link",
		"html":    fmt.Sprintf("<div style='font-family:sans-serif;padding:20px;'><h2 style='color:#6366f1;'>Log in to ArcOps</h2><p>Click the button below to log in instantly without a password:</p><p><a href='%s' style='background:#6366f1;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;'>Log In Instantly</a></p><p style='color:#888;font-size:12px;'>Or copy and paste this URL: %s</p></div>", magicURL, magicURL),
	}
	jsonBytes, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, "POST", "https://api.resend.com/emails", bytes.NewBuffer(jsonBytes))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+r.APIKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		var errResp struct {
			Message string `json:"message"`
			Name    string `json:"name"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&errResp)
		return fmt.Errorf("resend returned status code %d: [%s] %s", resp.StatusCode, errResp.Name, errResp.Message)
	}
	return nil
}

// SMTPEmailAdapter sends Email OTP via standard SMTP protocol (SendGrid, Mailgun, AWS SES, Custom SMTP)
type SMTPEmailAdapter struct {
	Host     string
	Port     string
	Username string
	Password string
	FromAddr string
}

func (s *SMTPEmailAdapter) ProviderName() string { return "smtp" }
func (s *SMTPEmailAdapter) SendOTP(ctx context.Context, toEmail string, code string) error {
	if s.Host == "" || s.Port == "" {
		return fmt.Errorf("SMTP host and port not configured")
	}
	from := s.FromAddr
	if from == "" {
		from = "auth@authx.dev"
	}
	var auth smtp.Auth
	if s.Username != "" && s.Password != "" {
		auth = smtp.PlainAuth("", s.Username, s.Password, s.Host)
	}
	msg := []byte(fmt.Sprintf("From: %s\r\n"+
		"To: %s\r\n"+
		"Subject: [%s] Your Security Verification Code\r\n"+
		"MIME-Version: 1.0\r\n"+
		"Content-Type: text/html; charset=UTF-8\r\n\r\n"+
		"<p>Your security verification code is: <strong>%s</strong>. It expires in 5 minutes.</p>",
		from, toEmail, code, code))

	addr := fmt.Sprintf("%s:%s", s.Host, s.Port)
	return smtp.SendMail(addr, auth, from, []string{toEmail}, msg)
}

// -----------------------------------------------------------------------------
// SMS PROVIDERS
// -----------------------------------------------------------------------------

// TwilioSMSAdapter sends SMS OTP via Twilio REST API
type TwilioSMSAdapter struct {
	AccountSID string
	AuthToken  string
	FromPhone  string
}

func (t *TwilioSMSAdapter) ProviderName() string { return "twilio" }
func (t *TwilioSMSAdapter) SendOTP(ctx context.Context, toPhone string, code string) error {
	if t.AccountSID == "" || t.AuthToken == "" {
		return fmt.Errorf("twilio credentials not configured")
	}
	endpoint := fmt.Sprintf("https://api.twilio.com/2010-04-01/Accounts/%s/Messages.json", t.AccountSID)
	toPhoneFormatted := strings.TrimSpace(toPhone)
	if !strings.HasPrefix(toPhoneFormatted, "+") {
		toPhoneFormatted = "+" + toPhoneFormatted
	}
	data := url.Values{}
	data.Set("To", toPhoneFormatted)
	if strings.HasPrefix(t.FromPhone, "MG") {
		data.Set("MessagingServiceSid", t.FromPhone)
	} else {
		data.Set("From", t.FromPhone)
	}
	data.Set("Body", fmt.Sprintf("Your AuthX security code is: %s", code))

	req, err := http.NewRequestWithContext(ctx, "POST", endpoint, strings.NewReader(data.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	authHeader := "Basic " + base64.StdEncoding.EncodeToString([]byte(t.AccountSID+":"+t.AuthToken))
	req.Header.Set("Authorization", authHeader)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		var errResp struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
			Detail  string `json:"detail"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&errResp)
		return fmt.Errorf("twilio returned status code %d: [code %d] %s %s", resp.StatusCode, errResp.Code, errResp.Message, errResp.Detail)
	}
	return nil
}

// TwilioVerifyAdapter sends SMS OTP via Twilio Verify REST API
type TwilioVerifyAdapter struct {
	AccountSID string
	AuthToken  string
	ServiceSID string
}

func (tv *TwilioVerifyAdapter) ProviderName() string { return "twilio_verify" }
func (tv *TwilioVerifyAdapter) SendOTP(ctx context.Context, toPhone string, code string) error {
	if tv.AccountSID == "" || tv.AuthToken == "" || tv.ServiceSID == "" {
		return fmt.Errorf("twilio verify credentials not configured")
	}
	endpoint := fmt.Sprintf("https://verify.twilio.com/v2/Services/%s/Verifications", tv.ServiceSID)
	data := url.Values{}
	data.Set("To", toPhone)
	data.Set("Channel", "sms")

	req, err := http.NewRequestWithContext(ctx, "POST", endpoint, strings.NewReader(data.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	authHeader := "Basic " + base64.StdEncoding.EncodeToString([]byte(tv.AccountSID+":"+tv.AuthToken))
	req.Header.Set("Authorization", authHeader)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("twilio verify returned status code %d", resp.StatusCode)
	}
	return nil
}

// MessagebirdSMSAdapter sends SMS OTP via Messagebird REST API
type MessagebirdSMSAdapter struct {
	AccessKey string
	Originator string
}

func (m *MessagebirdSMSAdapter) ProviderName() string { return "messagebird" }
func (m *MessagebirdSMSAdapter) SendOTP(ctx context.Context, toPhone string, code string) error {
	if m.AccessKey == "" {
		return fmt.Errorf("messagebird access key not configured")
	}
	orig := m.Originator
	if orig == "" {
		orig = "AuthX"
	}
	body := map[string]interface{}{
		"recipients": []string{toPhone},
		"originator": orig,
		"body":       fmt.Sprintf("Your AuthX security code is: %s", code),
	}
	jsonBytes, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, "POST", "https://rest.messagebird.com/messages", bytes.NewBuffer(jsonBytes))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "AccessKey "+m.AccessKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("messagebird returned status code %d", resp.StatusCode)
	}
	return nil
}

// VonageSMSAdapter sends SMS OTP via Vonage (Nexmo) REST API
type VonageSMSAdapter struct {
	APIKey    string
	APISecret string
	From      string
}

func (v *VonageSMSAdapter) ProviderName() string { return "vonage" }
func (v *VonageSMSAdapter) SendOTP(ctx context.Context, toPhone string, code string) error {
	if v.APIKey == "" || v.APISecret == "" {
		return fmt.Errorf("vonage credentials not configured")
	}
	from := v.From
	if from == "" {
		from = "AuthX"
	}
	body := map[string]interface{}{
		"api_key":    v.APIKey,
		"api_secret": v.APISecret,
		"to":         toPhone,
		"from":       from,
		"text":       fmt.Sprintf("Your AuthX security code is: %s", code),
	}
	jsonBytes, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, "POST", "https://rest.nexmo.com/sms/json", bytes.NewBuffer(jsonBytes))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("vonage returned status code %d", resp.StatusCode)
	}
	return nil
}

// TextlocalSMSAdapter sends SMS OTP via Textlocal REST API
type TextlocalSMSAdapter struct {
	APIKey string
	Sender string
}

func (tl *TextlocalSMSAdapter) ProviderName() string { return "textlocal" }
func (tl *TextlocalSMSAdapter) SendOTP(ctx context.Context, toPhone string, code string) error {
	if tl.APIKey == "" {
		return fmt.Errorf("textlocal API key not configured")
	}
	sender := tl.Sender
	if sender == "" {
		sender = "TXTLCL"
	}
	data := url.Values{}
	data.Set("apikey", tl.APIKey)
	data.Set("numbers", toPhone)
	data.Set("sender", sender)
	data.Set("message", fmt.Sprintf("Your AuthX code is %s", code))

	req, err := http.NewRequestWithContext(ctx, "POST", "https://api.textlocal.in/send/", strings.NewReader(data.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("textlocal returned status code %d", resp.StatusCode)
	}
	return nil
}

// MockOTPAdapter for local testing without external API calls
type MockOTPAdapter struct {
	LastSentTarget string
	LastSentCode   string
}

func (m *MockOTPAdapter) ProviderName() string { return "mock" }
func (m *MockOTPAdapter) SendOTP(ctx context.Context, target string, code string) error {
	m.LastSentTarget = target
	m.LastSentCode = code
	return nil
}
