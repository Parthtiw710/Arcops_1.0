package frontedge

import (
	"encoding/json"
	"net/http"
	"time"
)

// Status Check Handler
func (s *Service) handleStatus(w http.ResponseWriter, r *http.Request) {
	ghConfigured := s.githubPAT != ""
	cfConfigured := s.cfAccountID != "" && s.cfAPIToken != ""

	var missing []string
	if s.githubPAT == "" {
		missing = append(missing, "GITHUB_PAT")
	}
	if s.cfAccountID == "" {
		missing = append(missing, "CLOUDFLARE_ACCOUNT_ID")
	}
	if s.cfAPIToken == "" {
		missing = append(missing, "CLOUDFLARE_API_TOKEN")
	}

	ghUser := ""
	if ghConfigured {
		ghUser = s.getGitHubUsername()
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"status":                "ready",
		"fully_configured":      ghConfigured && cfConfigured,
		"github_configured":     ghConfigured,
		"cloudflare_configured": cfConfigured,
		"github_username":       ghUser,
		"missing_variables":     missing,
	})
}

func (s *Service) getGitHubUsername() string {
	s.mu.RLock()
	if s.cachedGHUser != "" && time.Since(s.cachedUserTime) < 10*time.Minute {
		defer s.mu.RUnlock()
		return s.cachedGHUser
	}
	s.mu.RUnlock()

	req, err := http.NewRequest(http.MethodGet, "https://api.github.com/user", nil)
	if err != nil {
		return ""
	}
	req.Header.Set("Authorization", "Bearer "+s.githubPAT)
	req.Header.Set("User-Agent", "Frontedge-Deployer")

	resp, err := http.DefaultClient.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		if resp != nil {
			resp.Body.Close()
		}
		return ""
	}
	defer resp.Body.Close()

	var res struct {
		Login string `json:"login"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&res); err == nil && res.Login != "" {
		s.mu.Lock()
		s.cachedGHUser = res.Login
		s.cachedUserTime = time.Now()
		s.mu.Unlock()
		return res.Login
	}
	return ""
}
