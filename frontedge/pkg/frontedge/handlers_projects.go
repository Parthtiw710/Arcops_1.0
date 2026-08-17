package frontedge

import (
	"fmt"
	"io"
	"net/http"
)

// List Cloudflare Pages Projects
func (s *Service) handleListProjects(w http.ResponseWriter, r *http.Request) {
	if s.cfAccountID == "" || s.cfAPIToken == "" {
		http.Error(w, "Cloudflare credentials not configured", http.StatusBadRequest)
		return
	}

	cfURL := fmt.Sprintf("https://api.cloudflare.com/client/v4/accounts/%s/pages/projects", s.cfAccountID)
	req, err := http.NewRequest(http.MethodGet, cfURL, nil)
	if err != nil {
		http.Error(w, "Failed to create projects request", http.StatusInternalServerError)
		return
	}
	req.Header.Set("Authorization", "Bearer "+s.cfAPIToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		http.Error(w, "Cloudflare API request failed", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}
