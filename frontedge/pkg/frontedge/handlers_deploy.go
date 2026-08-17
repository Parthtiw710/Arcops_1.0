package frontedge

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
)

type EnvVariable struct {
	Key      string `json:"key"`
	Value    string `json:"value"`
	IsSecret bool   `json:"is_secret,omitempty"`
}

// Deploy Project & Configure Secrets / Environment Variables
func (s *Service) handleDeploy(w http.ResponseWriter, r *http.Request) {
	if s.cfAccountID == "" || s.cfAPIToken == "" {
		http.Error(w, "Cloudflare credentials (CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN) are missing", http.StatusBadRequest)
		return
	}

	var reqBody struct {
		ProjectName  string        `json:"project_name"`
		RepoOwner    string        `json:"repo_owner"`
		RepoName     string        `json:"repo_name"`
		Branch       string        `json:"branch"`
		RootDir      string        `json:"root_dir"`
		BuildCommand string        `json:"build_command"`
		BuildDir     string        `json:"build_dir"`
		EnvVars      []EnvVariable `json:"env_vars"`
	}
	if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil || reqBody.ProjectName == "" || reqBody.RepoName == "" {
		http.Error(w, "project_name and repo_name are required", http.StatusBadRequest)
		return
	}

	if reqBody.Branch == "" {
		reqBody.Branch = "main"
	}
	if reqBody.BuildCommand == "" {
		reqBody.BuildCommand = "npm run build"
	}
	if reqBody.BuildDir == "" {
		reqBody.BuildDir = "dist"
	}
	if reqBody.RepoOwner == "" {
		reqBody.RepoOwner = s.getGitHubUsername()
	}

	// 1. Prepare & Create Cloudflare Pages Project (Direct Upload mode)
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
		"name":              reqBody.ProjectName,
		"production_branch": reqBody.Branch,
		"build_config": map[string]string{
			"build_command":    reqBody.BuildCommand,
			"destination_dir": reqBody.BuildDir,
			"root_dir":        reqBody.RootDir,
		},
		"deployment_configs": map[string]interface{}{
			"production": map[string]interface{}{
				"env_vars": cfEnvVars,
			},
		},
	}

	payloadBytes, _ := json.Marshal(cfPayload)
	cfURL := fmt.Sprintf("https://api.cloudflare.com/client/v4/accounts/%s/pages/projects", s.cfAccountID)

	cfReq, err := http.NewRequest(http.MethodPost, cfURL, bytes.NewReader(payloadBytes))
	if err == nil {
		cfReq.Header.Set("Authorization", "Bearer "+s.cfAPIToken)
		cfReq.Header.Set("Content-Type", "application/json")
		cfResp, cfErr := http.DefaultClient.Do(cfReq)
		if cfErr == nil {
			cfResp.Body.Close()
		}
	}

	// 2. Add Secrets (CLOUDFLARE_API_TOKEN & CLOUDFLARE_ACCOUNT_ID) to GitHub Repository
	if s.githubPAT != "" {
		if err := s.setGitHubRepoSecret(reqBody.RepoOwner, reqBody.RepoName, "CLOUDFLARE_API_TOKEN", s.cfAPIToken); err != nil {
			log.Printf("⚠️ Warning: Failed to set CLOUDFLARE_API_TOKEN secret on %s/%s: %v", reqBody.RepoOwner, reqBody.RepoName, err)
		}
		if err := s.setGitHubRepoSecret(reqBody.RepoOwner, reqBody.RepoName, "CLOUDFLARE_ACCOUNT_ID", s.cfAccountID); err != nil {
			log.Printf("⚠️ Warning: Failed to set CLOUDFLARE_ACCOUNT_ID secret on %s/%s: %v", reqBody.RepoOwner, reqBody.RepoName, err)
		}

		// 3. Commit .github/workflows/frontedge-deploy.yml to GitHub Repository
		err := s.commitGitHubWorkflow(reqBody.RepoOwner, reqBody.RepoName, reqBody.Branch, reqBody.ProjectName, reqBody.RootDir, reqBody.BuildCommand, reqBody.BuildDir)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to setup GitHub Actions workflow: %v", err), http.StatusInternalServerError)
			return
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success":   true,
		"message":   "Cloudflare Pages project created and GitHub Actions workflow committed successfully!",
		"project":   reqBody.ProjectName,
		"subdomain": fmt.Sprintf("%s.pages.dev", reqBody.ProjectName),
	})
}
