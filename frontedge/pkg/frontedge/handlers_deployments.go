package frontedge

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

// Update / Reset Environment Variables & Secrets
func (s *Service) handleUpdateEnv(w http.ResponseWriter, r *http.Request) {
	if s.cfAccountID == "" || s.cfAPIToken == "" {
		http.Error(w, "Cloudflare credentials not configured", http.StatusBadRequest)
		return
	}

	projectName := r.URL.Query().Get("project")
	if projectName == "" {
		http.Error(w, "project query parameter is required", http.StatusBadRequest)
		return
	}

	var reqBody struct {
		EnvVars []EnvVariable `json:"env_vars"`
	}
	if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
		http.Error(w, "Invalid payload", http.StatusBadRequest)
		return
	}

	cfEnvVars := make(map[string]interface{})
	for _, env := range reqBody.EnvVars {
		if env.Key != "" {
			valType := "plain_text"
			if env.IsSecret {
				valType = "secret_text"
			}
			cfEnvVars[env.Key] = map[string]string{
				"type":  valType,
				"value": env.Value,
			}
		}
	}

	cfPayload := map[string]interface{}{
		"deployment_configs": map[string]interface{}{
			"production": map[string]interface{}{
				"env_vars": cfEnvVars,
			},
		},
	}

	payloadBytes, _ := json.Marshal(cfPayload)
	cfURL := fmt.Sprintf("https://api.cloudflare.com/client/v4/accounts/%s/pages/projects/%s", s.cfAccountID, projectName)

	req, err := http.NewRequest(http.MethodPatch, cfURL, bytes.NewReader(payloadBytes))
	if err != nil {
		http.Error(w, "Failed to create update request", http.StatusInternalServerError)
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

	respBody, _ := io.ReadAll(resp.Body)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	_, _ = w.Write(respBody)
}

// List Cloudflare Deployments Status
func (s *Service) handleListDeployments(w http.ResponseWriter, r *http.Request) {
	if s.cfAccountID == "" || s.cfAPIToken == "" {
		http.Error(w, "Cloudflare credentials not configured", http.StatusBadRequest)
		return
	}

	projectName := r.URL.Query().Get("project")
	if projectName == "" {
		http.Error(w, "project query parameter required", http.StatusBadRequest)
		return
	}

	cfURL := fmt.Sprintf("https://api.cloudflare.com/client/v4/accounts/%s/pages/projects/%s/deployments", s.cfAccountID, projectName)
	req, _ := http.NewRequest(http.MethodGet, cfURL, nil)
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

// Get Build Logs for a Specific Deployment ID
func (s *Service) handleGetLogs(w http.ResponseWriter, r *http.Request) {
	if s.cfAccountID == "" || s.cfAPIToken == "" {
		http.Error(w, "Cloudflare credentials not configured", http.StatusBadRequest)
		return
	}

	projectName := r.URL.Query().Get("project")
	deploymentID := r.URL.Query().Get("id")
	if deploymentID == "" {
		deploymentID = r.URL.Query().Get("deployment_id")
	}

	if projectName == "" || deploymentID == "" {
		http.Error(w, "project and id query parameters are required", http.StatusBadRequest)
		return
	}

	cfURL := fmt.Sprintf("https://api.cloudflare.com/client/v4/accounts/%s/pages/projects/%s/deployments/%s/history/logs",
		s.cfAccountID, projectName, deploymentID)

	req, err := http.NewRequest(http.MethodGet, cfURL, nil)
	if err != nil {
		http.Error(w, "Failed to create log request", http.StatusInternalServerError)
		return
	}
	req.Header.Set("Authorization", "Bearer "+s.cfAPIToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		http.Error(w, "Cloudflare Log API request failed", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

// Retry a Specific Build Deployment by ID
func (s *Service) handleRetryDeployment(w http.ResponseWriter, r *http.Request) {
	if s.cfAccountID == "" || s.cfAPIToken == "" {
		http.Error(w, "Cloudflare credentials not configured", http.StatusBadRequest)
		return
	}

	projectName := r.URL.Query().Get("project")
	deploymentID := r.URL.Query().Get("id")
	if deploymentID == "" {
		deploymentID = r.URL.Query().Get("deployment_id")
	}

	if projectName == "" || deploymentID == "" {
		http.Error(w, "project and id query parameters are required", http.StatusBadRequest)
		return
	}

	cfURL := fmt.Sprintf("https://api.cloudflare.com/client/v4/accounts/%s/pages/projects/%s/deployments/%s/retry",
		s.cfAccountID, projectName, deploymentID)

	req, err := http.NewRequest(http.MethodPost, cfURL, nil)
	if err != nil {
		http.Error(w, "Failed to create retry request", http.StatusInternalServerError)
		return
	}
	req.Header.Set("Authorization", "Bearer "+s.cfAPIToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		http.Error(w, "Cloudflare Retry API request failed", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	_, _ = w.Write(respBody)
}

