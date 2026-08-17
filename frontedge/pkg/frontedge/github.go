package frontedge

import (
	"bytes"
	"crypto/rand"
	_ "embed"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"golang.org/x/crypto/nacl/box"
)

//go:embed workflow_template.yml
var rawWorkflowTemplate string

func encryptGitHubSecret(pubKeyBase64 string, secretValue string) (string, error) {
	keyBytes, err := base64.StdEncoding.DecodeString(pubKeyBase64)
	if err != nil || len(keyBytes) != 32 {
		return "", fmt.Errorf("invalid public key length")
	}
	var recipientPubKey [32]byte
	copy(recipientPubKey[:], keyBytes)

	encrypted, err := box.SealAnonymous(nil, []byte(secretValue), &recipientPubKey, rand.Reader)
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(encrypted), nil
}

func (s *Service) setGitHubRepoSecret(owner, repo, secretName, secretValue string) error {
	if s.githubPAT == "" {
		return fmt.Errorf("github PAT not configured")
	}

	keyURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/actions/secrets/public-key", owner, repo)
	req, err := http.NewRequest(http.MethodGet, keyURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+s.githubPAT)
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("failed to get public key: %s", string(respBody))
	}

	var keyData struct {
		KeyID string `json:"key_id"`
		Key   string `json:"key"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&keyData); err != nil {
		return err
	}

	encryptedVal, err := encryptGitHubSecret(keyData.Key, secretValue)
	if err != nil {
		return fmt.Errorf("failed to encrypt secret: %w", err)
	}

	putURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/actions/secrets/%s", owner, repo, secretName)
	payload := map[string]string{
		"encrypted_value": encryptedVal,
		"key_id":          keyData.KeyID,
	}
	pBytes, _ := json.Marshal(payload)

	putReq, err := http.NewRequest(http.MethodPut, putURL, bytes.NewReader(pBytes))
	if err != nil {
		return err
	}
	putReq.Header.Set("Authorization", "Bearer "+s.githubPAT)
	putReq.Header.Set("Accept", "application/vnd.github.v3+json")
	putReq.Header.Set("Content-Type", "application/json")

	putResp, err := http.DefaultClient.Do(putReq)
	if err != nil {
		return err
	}
	defer putResp.Body.Close()

	if putResp.StatusCode != http.StatusCreated && putResp.StatusCode != http.StatusNoContent {
		body, _ := io.ReadAll(putResp.Body)
		return fmt.Errorf("failed to put secret %s: %s", secretName, string(body))
	}
	return nil
}

func (s *Service) commitGitHubWorkflow(owner, repo, branch, projectName, rootDir, buildCmd, buildDir string) error {
	if s.githubPAT == "" {
		return fmt.Errorf("github PAT not configured")
	}

	outputDir := buildDir
	if rootDir != "" && rootDir != "." {
		outputDir = fmt.Sprintf("%s/%s", strings.Trim(rootDir, "/"), strings.Trim(buildDir, "/"))
	}

	cdCmd := ""
	if rootDir != "" && rootDir != "." {
		cdCmd = fmt.Sprintf("cd %s && ", rootDir)
	}

	workflowYAML := strings.ReplaceAll(rawWorkflowTemplate, "{{BRANCH}}", branch)
	workflowYAML = strings.ReplaceAll(workflowYAML, "{{CD_CMD}}", cdCmd)
	workflowYAML = strings.ReplaceAll(workflowYAML, "{{BUILD_CMD}}", buildCmd)
	workflowYAML = strings.ReplaceAll(workflowYAML, "{{OUTPUT_DIR}}", outputDir)
	workflowYAML = strings.ReplaceAll(workflowYAML, "{{PROJECT_NAME}}", projectName)

	contentBase64 := base64.StdEncoding.EncodeToString([]byte(workflowYAML))
	workflowPath := ".github/workflows/frontedge-deploy.yml"
	githubURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/contents/%s", owner, repo, workflowPath)

	var existingSHA string
	getReq, _ := http.NewRequest(http.MethodGet, githubURL+"?ref="+branch, nil)
	getReq.Header.Set("Authorization", "Bearer "+s.githubPAT)
	getReq.Header.Set("Accept", "application/vnd.github.v3+json")
	if getResp, err := http.DefaultClient.Do(getReq); err == nil {
		if getResp.StatusCode == http.StatusOK {
			var fileMeta struct {
				SHA string `json:"sha"`
			}
			_ = json.NewDecoder(getResp.Body).Decode(&fileMeta)
			existingSHA = fileMeta.SHA
		}
		getResp.Body.Close()
	}

	commitPayload := map[string]interface{}{
		"message": "ci: configure Frontedge Cloudflare Pages deployment workflow",
		"content": contentBase64,
		"branch":  branch,
	}
	if existingSHA != "" {
		commitPayload["sha"] = existingSHA
	}

	cBytes, _ := json.Marshal(commitPayload)
	putReq, err := http.NewRequest(http.MethodPut, githubURL, bytes.NewReader(cBytes))
	if err != nil {
		return err
	}
	putReq.Header.Set("Authorization", "Bearer "+s.githubPAT)
	putReq.Header.Set("Accept", "application/vnd.github.v3+json")
	putReq.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(putReq)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("failed to commit workflow: %s", string(body))
	}

	return nil
}
