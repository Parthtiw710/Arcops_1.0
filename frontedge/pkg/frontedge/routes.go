package frontedge

import (
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

type Service struct {
	cfAccountID string
	cfAPIToken  string
	githubPAT   string

	mu             sync.RWMutex
	cachedGHUser   string
	cachedUserTime time.Time
}

func loadEnvFiles() {
	possiblePaths := []string{
		"deploy/.env",
		"../deploy/.env",
		"../../deploy/.env",
		"frontedge/.env",
		"../frontedge/.env",
		".env",
		"../.env",
	}

	for _, path := range possiblePaths {
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		lines := strings.Split(string(data), "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			parts := strings.SplitN(line, "=", 2)
			if len(parts) == 2 {
				key := strings.TrimSpace(parts[0])
				val := strings.TrimSpace(parts[1])
				val = strings.Trim(val, `"'`)
				if os.Getenv(key) == "" {
					os.Setenv(key, val)
				}
			}
		}
	}
}

func NewService() *Service {
	loadEnvFiles()

	return &Service{
		cfAccountID: os.Getenv("CLOUDFLARE_ACCOUNT_ID"),
		cfAPIToken:  os.Getenv("CLOUDFLARE_API_TOKEN"),
		githubPAT:   os.Getenv("GITHUB_PAT"),
	}
}

func (s *Service) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/frontedge/status", s.handleStatus)
	mux.HandleFunc("GET /api/frontedge/repos", s.handleListRepos)
	mux.HandleFunc("GET /api/frontedge/projects", s.handleListProjects)
	mux.HandleFunc("POST /api/frontedge/deploy", s.handleDeploy)
	mux.HandleFunc("POST /api/frontedge/redeploy", s.handleRedeploy)
	mux.HandleFunc("GET /api/frontedge/deployments", s.handleListDeployments)
	mux.HandleFunc("GET /api/frontedge/gh-runs", s.handleListGHWorkflowRuns)
	mux.HandleFunc("GET /api/frontedge/logs", s.handleGetLogs)
	mux.HandleFunc("GET /api/frontedge/gh-logs", s.handleGetGHJobLogs)
	mux.HandleFunc("PATCH /api/frontedge/env", s.handleUpdateEnv)
	mux.HandleFunc("POST /api/frontedge/retry", s.handleRetryDeployment)
}
