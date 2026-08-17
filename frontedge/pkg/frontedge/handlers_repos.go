package frontedge

import (
	"fmt"
	"io"
	"net/http"
)

// List GitHub Repositories
func (s *Service) handleListRepos(w http.ResponseWriter, r *http.Request) {
	if s.githubPAT == "" {
		http.Error(w, "GITHUB_PAT is not configured in .env", http.StatusBadRequest)
		return
	}

	req, _ := http.NewRequest(http.MethodGet, "https://api.github.com/user/repos?sort=updated&per_page=50", nil)
	req.Header.Set("Authorization", "Bearer "+s.githubPAT)
	req.Header.Set("User-Agent", "Frontedge-Deployer")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		http.Error(w, "Failed to connect to GitHub API", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		http.Error(w, fmt.Sprintf("GitHub API error (%d): %s", resp.StatusCode, string(body)), http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_, _ = io.Copy(w, resp.Body)
}
