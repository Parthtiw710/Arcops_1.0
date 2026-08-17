package pkg

import "os"

type GatewayConfig struct {
	Port          string
	ArcAuthURL    string
	DBMuxURL      string
	BuckStreamURL string
	FrontedgeURL  string
	WebURL        string
	AdminEmails   string
	AdminKey      string
	AnonKey       string
	SandboxKey    string
	JWTSecret     string
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

func LoadConfig() GatewayConfig {
	return GatewayConfig{
		Port:          getEnv("GATEWAY_PORT", "8000"),
		ArcAuthURL:    getEnv("ARCAUTH_URL", "http://localhost:8081"),
		DBMuxURL:      getEnv("DBMUX_URL", "http://localhost:8080"),
		BuckStreamURL: getEnv("BUCKSTREAM_URL", "http://localhost:8082"),
		FrontedgeURL:  getEnv("FRONTEDGE_URL", "http://localhost:8083"),
		WebURL:        getEnv("WEB_URL", "http://localhost:3000"),
		AdminEmails:   getEnv("ADMIN_EMAILS", "admin@arcops.local"),
		AdminKey:      getEnv("ARCOPS_ADMIN_KEY", getEnv("ADMIN_TOKEN", "")),
		AnonKey:       getEnv("ARCOPS_ANON_KEY", getEnv("DBMUX_ANON_KEY", "")),
		SandboxKey:    getEnv("ARCOPS_SANDBOX_KEY", ""),
		JWTSecret:     getEnv("JWT_SECRET", "super_secret_jwt_key_change_me_in_production"),
	}
}
