package frontedge

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
)

var (
	tsRegex   = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s*`)
	ansiRegex = regexp.MustCompile(`\x1b\[[0-9;]*[a-zA-Z]`)
)

func sanitizeGHLogs(raw string) string {
	lines := strings.Split(raw, "\n")
	var cleaned []string
	for _, l := range lines {
		// Strip ISO timestamp
		l = tsRegex.ReplaceAllString(l, "")
		// Strip ANSI color codes
		l = ansiRegex.ReplaceAllString(l, "")
		// Filter out GitHub Actions internal runner noise
		if strings.HasPrefix(l, "##[group]") || strings.HasPrefix(l, "##[endgroup]") {
			continue
		}
		if strings.HasPrefix(l, "Post job cleanup") || strings.HasPrefix(l, "Cleaning up orphan processes") || strings.HasPrefix(l, "Deletable secrets") {
			continue
		}
		cleaned = append(cleaned, l)
	}
	return strings.Join(cleaned, "\n")
}

// ---------------------------------------------------------------------------
// GitHub Actions Workflow Dispatch (Redeploy Button) & GitHub Build Logs
// ---------------------------------------------------------------------------

// Trigger GitHub Actions Workflow Dispatch (Redeploy without new commit)
func (s *Service) handleRedeploy(w http.ResponseWriter, r *http.Request) {
	if s.githubPAT == "" {
		http.Error(w, "github PAT is not configured", http.StatusBadRequest)
		return
	}

	var reqBody struct {
		Owner  string `json:"owner"`
		Repo   string `json:"repo"`
		Branch string `json:"branch"`
	}
	if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil || reqBody.Owner == "" || reqBody.Repo == "" {
		http.Error(w, "owner and repo are required", http.StatusBadRequest)
		return
	}
	if reqBody.Branch == "" {
		reqBody.Branch = "main"
	}

	dispatchURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/actions/workflows/frontedge-deploy.yml/dispatches", reqBody.Owner, reqBody.Repo)
	payload := map[string]string{"ref": reqBody.Branch}
	pBytes, _ := json.Marshal(payload)

	req, err := http.NewRequest(http.MethodPost, dispatchURL, bytes.NewReader(pBytes))
	if err != nil {
		http.Error(w, "Failed to create dispatch request", http.StatusInternalServerError)
		return
	}
	req.Header.Set("Authorization", "Bearer "+s.githubPAT)
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		http.Error(w, "Failed to connect to GitHub API", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		http.Error(w, fmt.Sprintf("GitHub API error (%d): %s", resp.StatusCode, string(body)), http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "GitHub Actions workflow dispatch triggered successfully!",
	})
}

// List GitHub Actions Workflow Runs for a Repo
func (s *Service) handleListGHWorkflowRuns(w http.ResponseWriter, r *http.Request) {
	if s.githubPAT == "" {
		http.Error(w, "github PAT is not configured", http.StatusBadRequest)
		return
	}

	owner := r.URL.Query().Get("owner")
	repo := r.URL.Query().Get("repo")
	if owner == "" || repo == "" {
		http.Error(w, "owner and repo parameters are required", http.StatusBadRequest)
		return
	}

	runsURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/actions/runs?per_page=15", owner, repo)
	req, err := http.NewRequest(http.MethodGet, runsURL, nil)
	if err != nil {
		http.Error(w, "Failed to create request", http.StatusInternalServerError)
		return
	}
	req.Header.Set("Authorization", "Bearer "+s.githubPAT)
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		http.Error(w, "Failed to connect to GitHub API", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

// Fetch GitHub Actions Job Logs for a Workflow Run (Sanitized & Vercel-Style)
func (s *Service) handleGetGHJobLogs(w http.ResponseWriter, r *http.Request) {
	if s.githubPAT == "" {
		http.Error(w, "github PAT is not configured", http.StatusBadRequest)
		return
	}

	owner := r.URL.Query().Get("owner")
	repo := r.URL.Query().Get("repo")
	jobID := r.URL.Query().Get("job_id")
	runID := r.URL.Query().Get("run_id")

	if owner == "" || repo == "" {
		http.Error(w, "owner and repo parameters are required", http.StatusBadRequest)
		return
	}

	if jobID == "" && runID != "" {
		jobsURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/actions/runs/%s/jobs", owner, repo, runID)
		jReq, _ := http.NewRequest(http.MethodGet, jobsURL, nil)
		jReq.Header.Set("Authorization", "Bearer "+s.githubPAT)
		jReq.Header.Set("Accept", "application/vnd.github.v3+json")
		jResp, jErr := http.DefaultClient.Do(jReq)
		if jErr == nil && jResp.StatusCode == http.StatusOK {
			var jobsData struct {
				Jobs []struct {
					ID int64 `json:"id"`
				} `json:"jobs"`
			}
			if err := json.NewDecoder(jResp.Body).Decode(&jobsData); err == nil && len(jobsData.Jobs) > 0 {
				jobID = fmt.Sprintf("%d", jobsData.Jobs[0].ID)
			}
			jResp.Body.Close()
		}
	}

	if jobID == "" {
		http.Error(w, "job_id or valid run_id required", http.StatusBadRequest)
		return
	}

	logsURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/actions/jobs/%s/logs", owner, repo, jobID)
	req, err := http.NewRequest(http.MethodGet, logsURL, nil)
	if err != nil {
		http.Error(w, "Failed to create logs request", http.StatusInternalServerError)
		return
	}
	req.Header.Set("Authorization", "Bearer "+s.githubPAT)
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		http.Error(w, "Failed to fetch job logs", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	rawBytes, _ := io.ReadAll(resp.Body)
	cleanLogs := sanitizeGHLogs(string(rawBytes))

	w.Header().Set("Content-Type", "text/plain")
	w.WriteHeader(resp.StatusCode)
	_, _ = w.Write([]byte(cleanLogs))
}
