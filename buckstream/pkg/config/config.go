package config

import (
	"log"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	AllowedDomains           string
	RootDomain               string
	S3ByIAM                  bool
	GCSByIAM                 bool
	S3CompatibleByToken      bool
	S3CompatibleEndpoint     string
	S3CompatibleRegion       string
	S3CompatibleAccessKey    string
	S3CompatibleAccessSecret string
	BucketName               string
	DeployToken              string
	UploadToken              string
	MaxCachedSites           int
	LocalS3     bool   // LOCAL_S3: enable local persistent volume storage
	LocalS3Dir  string // LOCAL_S3_DIR: optional custom path (defaults to ./tmp/local_s3)
}

func LoadConfig() *Config {
	err := godotenv.Load()
	if err != nil {
		log.Println("No .env file found, using system environment variables")
	}
	return &Config{
		AllowedDomains:           os.Getenv("ALLOWED_DOMAINS"),
		RootDomain:               os.Getenv("ROOT_DOMAIN"),
		S3ByIAM:                  parseBoolEnv("S3_BY_IAM", false),
		GCSByIAM:                 parseBoolEnv("GCS_BY_IAM", false),
		S3CompatibleByToken:      parseBoolEnv("S3_COMPATIBLE_BY_TOKEN", false),
		S3CompatibleEndpoint:     os.Getenv("S3_COMPATIBLE_ENDPOINT"),
		S3CompatibleRegion:       getEnv("S3_COMPATIBLE_REGION", "us-east-1"),
		S3CompatibleAccessKey:    os.Getenv("S3_COMPATIBLE_ACCESS_KEY"),
		S3CompatibleAccessSecret: os.Getenv("S3_COMPATIBLE_ACCESS_SECRET"),
		BucketName:               os.Getenv("BUCKET_NAME"),
		DeployToken:              os.Getenv("DEPLOY_TOKEN"),
		UploadToken:              os.Getenv("UPLOAD_TOKEN"),
		MaxCachedSites: parseIntEnv("MAX_CACHED_SITES", 10),
		LocalS3:        parseBoolEnv("LOCAL_S3", false),
		LocalS3Dir:     getEnv("LOCAL_S3_DIR", "./tmp/local_s3"),
	}
}

func parseBoolEnv(key string, fallback bool) bool {
	val := os.Getenv(key)
	if val == "" {
		return fallback
	}
	b, err := strconv.ParseBool(val)
	if err != nil {
		return fallback
	}
	return b
}

func parseIntEnv(key string, fallback int) int {
	val := os.Getenv(key)
	if val == "" {
		return fallback
	}
	i, err := strconv.Atoi(val)
	if err != nil {
		return fallback
	}
	return i
}

func getEnv(key, fallback string) string {
	val := os.Getenv(key)
	if val == "" {
		return fallback
	}
	return val
}
