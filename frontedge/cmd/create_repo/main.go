package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
)

func main() {
	pat := os.Getenv("GITHUB_PAT")
	if pat == "" {
		fmt.Println("❌ GITHUB_PAT environment variable is required")
		os.Exit(1)
	}

	repoName := "test"
	if len(os.Args) > 1 && os.Args[1] != "" {
		repoName = os.Args[1]
	}

	fmt.Printf("🚀 Creating GitHub Repository '%s' with Latest Vite 6 + React 19 + TS template...\n", repoName)

	// 1. Create Repository via GitHub API
	createURL := "https://api.github.com/user/repos"
	createPayload := map[string]interface{}{
		"name":        repoName,
		"description": "Latest Vite 6 + React 19 + TypeScript template created via Frontedge Go Command",
		"private":     false,
		"auto_init":   true,
	}
	createBytes, _ := json.Marshal(createPayload)

	req, _ := http.NewRequest(http.MethodPost, createURL, bytes.NewReader(createBytes))
	req.Header.Set("Authorization", "Bearer "+pat)
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		fmt.Printf("❌ Error connecting to GitHub API: %v\n", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		fmt.Printf("⚠️ GitHub Repo Notice (HTTP %d): %s\n", resp.StatusCode, string(body))
	} else {
		fmt.Printf("✅ GitHub Repository '%s' created successfully!\n", repoName)
	}

	// Fetch GitHub Username
	userReq, _ := http.NewRequest(http.MethodGet, "https://api.github.com/user", nil)
	userReq.Header.Set("Authorization", "Bearer "+pat)
	userReq.Header.Set("Accept", "application/vnd.github.v3+json")
	userResp, err := http.DefaultClient.Do(userReq)
	if err != nil {
		fmt.Printf("❌ Error fetching user: %v\n", err)
		return
	}
	defer userResp.Body.Close()
	var userData struct {
		Login string `json:"login"`
	}
	_ = json.NewDecoder(userResp.Body).Decode(&userData)
	owner := userData.Login
	fmt.Printf("👤 Repository Owner: %s\n", owner)

	// 2. Commit Latest Vite 6 + React 19 Template Files
	files := map[string]string{
		"package.json": `{
  "name": "` + repoName + `",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "~5.7.2",
    "vite": "^6.0.5"
  }
}`,
		"index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>` + repoName + ` — Vite 6 + React 19</title>
  </head>
  <body style="margin:0; background:#09090b; color:#fff; font-family:sans-serif;">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`,
		"vite.config.ts": `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})`,
		"tsconfig.json": `{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true
  },
  "include": ["src"]
}`,
		"src/main.tsx": `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)`,
		"src/App.tsx": `import React from 'react'

export default function App() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #09090b 0%, #18181b 100%)',
      color: '#fff',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      textAlign: 'center',
      padding: '2rem'
    }}>
      <h1 style={{
        fontSize: '3.5rem',
        fontWeight: 900,
        margin: '0 0 1rem 0',
        background: 'linear-gradient(to right, #6366f1, #a855f7, #ec4899)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        letterSpacing: '-0.03em'
      }}>
        ⚡ ` + repoName + `
      </h1>
      <p style={{ color: '#a1a1aa', fontSize: '1.25rem', maxWidth: '520px', lineHeight: 1.6, margin: '0 0 2rem 0' }}>
        Latest <strong>Vite 6</strong> + <strong>React 19</strong> + <strong>TypeScript</strong> application deployed via <strong>ArcOps Frontedge</strong>.
      </p>
      <div style={{
        padding: '0.85rem 1.75rem',
        background: 'rgba(99, 102, 241, 0.12)',
        border: '1px solid rgba(99, 102, 241, 0.35)',
        borderRadius: '9999px',
        color: '#a5b4fc',
        fontFamily: 'monospace',
        fontSize: '0.95rem',
        fontWeight: 600
      }}>
        Vite v6.0.5 • React v19.0.0 • TypeScript v5.7
      </div>
    </div>
  )
}`,
		"src/vite-env.d.ts": `/// <reference types="vite/client" />`,
	}

	for path, content := range files {
		commitURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/contents/%s", owner, repoName, path)

		var sha string
		getReq, _ := http.NewRequest(http.MethodGet, commitURL, nil)
		getReq.Header.Set("Authorization", "Bearer "+pat)
		getReq.Header.Set("Accept", "application/vnd.github.v3+json")
		if getResp, getErr := http.DefaultClient.Do(getReq); getErr == nil {
			if getResp.StatusCode == http.StatusOK {
				var meta struct {
					SHA string `json:"sha"`
				}
				_ = json.NewDecoder(getResp.Body).Decode(&meta)
				sha = meta.SHA
			}
			getResp.Body.Close()
		}

		payload := map[string]interface{}{
			"message": "feat: add " + path + " (Vite 6 + React 19 template)",
			"content": base64.StdEncoding.EncodeToString([]byte(content)),
			"branch":  "main",
		}
		if sha != "" {
			payload["sha"] = sha
		}
		pBytes, _ := json.Marshal(payload)

		putReq, _ := http.NewRequest(http.MethodPut, commitURL, bytes.NewReader(pBytes))
		putReq.Header.Set("Authorization", "Bearer "+pat)
		putReq.Header.Set("Accept", "application/vnd.github.v3+json")
		putReq.Header.Set("Content-Type", "application/json")

		putResp, err := http.DefaultClient.Do(putReq)
		if err != nil {
			fmt.Printf("❌ Failed to commit %s: %v\n", path, err)
			continue
		}
		putResp.Body.Close()
		if putResp.StatusCode == http.StatusOK || putResp.StatusCode == http.StatusCreated {
			fmt.Printf("  📄 Committed %s\n", path)
		} else {
			fmt.Printf("  ⚠️ Commit warning on %s (HTTP %d)\n", path, putResp.StatusCode)
		}
	}

	fmt.Printf("\n🎉 Success! Repo 'https://github.com/%s/%s' is created with latest Vite 6 & React 19!\n", owner, repoName)
}
