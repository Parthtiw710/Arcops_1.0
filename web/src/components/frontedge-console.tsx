import React, { useState, useEffect } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { GATEWAY_URL } from "../config";
import {
  CloudflareProject,
  Deployment,
  EnvVar,
  GitHubRepo,
  FrontedgeStatus,
} from "./frontedge/frontedge-types";
import { FrontedgeProjectsList } from "./frontedge/frontedge-projects-list";
import { FrontedgeCreateProject } from "./frontedge/frontedge-create-project";
import { FrontedgeProjectDetail } from "./frontedge/frontedge-project-detail";

const API = GATEWAY_URL;

const getAuthHeaders = () => {
  const token = localStorage.getItem("arcauth_token") || localStorage.getItem("authx_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

export const FrontedgeConsole: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { projectName: routeProjectName } = useParams<{ projectName?: string }>();

  // Determine active screen directly from Protected URL Route
  let screen: "dashboard" | "new_project" | "project_detail" = "dashboard";
  if (location.pathname.includes("/frontedge-console/new")) {
    screen = "new_project";
  } else if (location.pathname.includes("/frontedge-console/project/")) {
    screen = "project_detail";
  }

  // Active Project Name derived from URL Param /frontedge-console/project/:projectName
  const activeProject = routeProjectName || "";

  // System Status
  const [status, setStatus] = useState<FrontedgeStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  // Projects Grid State
  const [projects, setProjects] = useState<CloudflareProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [selectedProjectObj, setSelectedProjectObj] = useState<CloudflareProject | null>(null);

  // Repos state
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);

  // Deployment & Logs state
  const [deploying, setDeploying] = useState(false);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [expandedBuildId, setExpandedBuildId] = useState<string | null>(null);
  const [buildLogs, setBuildLogs] = useState<Record<string, string[]>>({});
  const [loadingLogs, setLoadingLogs] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [redeploying, setRedeploying] = useState(false);
  const [savingSecrets, setSavingSecrets] = useState(false);

  // 1. Fetch Frontedge status on mount
  useEffect(() => {
    fetchStatus();
  }, []);

  // 2. Fetch deployments if deep-linked to /frontedge-console/project/:projectName
  useEffect(() => {
    if (activeProject) {
      fetchDeployments(activeProject);
    }
  }, [activeProject]);

  const fetchStatus = async () => {
    setLoadingStatus(true);
    try {
      const res = await fetch(`${API}/api/frontedge/status`, { headers: getAuthHeaders() });
      const data = await res.json();
      setStatus(data);
      if (data.cloudflare_configured) {
        fetchProjects();
      }
      if (data.github_configured) {
        fetchRepos();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingStatus(false);
    }
  };

  const fetchProjects = async () => {
    setLoadingProjects(true);
    try {
      const res = await fetch(`${API}/api/frontedge/projects`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.result && Array.isArray(data.result)) {
        setProjects(data.result);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingProjects(false);
    }
  };

  const fetchRepos = async () => {
    setLoadingRepos(true);
    try {
      const res = await fetch(`${API}/api/frontedge/repos`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (Array.isArray(data)) {
        setRepos(data);
      } else if (data.repos) {
        setRepos(data.repos);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingRepos(false);
    }
  };

  const fetchDeployments = async (projName: string, repoFullName?: string) => {
    const ownerRepo = repoFullName || (selectedRepo ? selectedRepo.full_name : `${status?.github_username || "Parthtiw710"}/${projName}`);
    const [owner, repo] = ownerRepo.split("/");

    try {
      if (owner && repo) {
        const ghRes = await fetch(`${API}/api/frontedge/gh-runs?owner=${owner}&repo=${repo}`, { headers: getAuthHeaders() });
        if (ghRes.ok) {
          const ghData = await ghRes.json();
          if (ghData.workflow_runs && ghData.workflow_runs.length > 0) {
            const mappedRuns: Deployment[] = ghData.workflow_runs.map((r: any) => ({
              id: String(r.id),
              short_id: r.head_sha ? r.head_sha.substring(0, 7) : String(r.id),
              created_on: r.created_at,
              latest_stage: {
                name: r.name || "Deploy to Cloudflare Pages",
                status: r.status === "completed" ? (r.conclusion === "success" ? "success" : "failure") : "building",
              },
            }));
            setDeployments(mappedRuns);
            if (mappedRuns.length > 0) {
              setExpandedBuildId((prev) => prev || mappedRuns[0].id);
              fetchLogsById(projName, mappedRuns[0].id, owner, repo);
            }
            return;
          }
        }
      }

      const res = await fetch(`${API}/api/frontedge/deployments?project=${projName}`, { headers: getAuthHeaders() });
      const data = await res.json();
      let list: Deployment[] = [];
      if (data.result && Array.isArray(data.result)) {
        list = data.result;
      } else if (Array.isArray(data)) {
        list = data;
      }
      setDeployments(list);
      if (list.length > 0) {
        setExpandedBuildId((prev) => prev || list[0].id);
        fetchLogsById(projName, list[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchLogsById = async (projName: string, depId: string, ownerArg?: string, repoArg?: string) => {
    setLoadingLogs((prev) => ({ ...prev, [depId]: true }));
    try {
      const ownerRepo = selectedRepo ? selectedRepo.full_name : `${status?.github_username || "Parthtiw710"}/${projName}`;
      const owner = ownerArg || ownerRepo.split("/")[0];
      const repo = repoArg || ownerRepo.split("/")[1];

      if (owner && repo) {
        const ghRes = await fetch(`${API}/api/frontedge/gh-logs?owner=${owner}&repo=${repo}&run_id=${depId}`, { headers: getAuthHeaders() });
        if (ghRes.ok) {
          const rawLogsText = await ghRes.text();
          if (rawLogsText && rawLogsText.trim().length > 0) {
            const lines = rawLogsText.split("\n").filter((l) => l.trim() !== "");
            setBuildLogs((prev) => ({ ...prev, [depId]: lines }));
            return;
          }
        }
      }

      const res = await fetch(`${API}/api/frontedge/logs?project=${projName}&id=${depId}`, { headers: getAuthHeaders() });
      const data = await res.json();

      let lines: string[] = [];
      if (data.result && data.result.data) {
        lines = data.result.data.map((l: any) => l.line || (typeof l === "string" ? l : JSON.stringify(l)));
      } else if (Array.isArray(data)) {
        lines = data.map((l) => (typeof l === "string" ? l : l.line || JSON.stringify(l)));
      } else {
        lines = ["No build log history returned for this deployment."];
      }
      setBuildLogs((prev) => ({ ...prev, [depId]: lines }));
    } catch (e) {
      setBuildLogs((prev) => ({ ...prev, [depId]: ["Failed to load deployment build logs."] }));
    } finally {
      setLoadingLogs((prev) => ({ ...prev, [depId]: false }));
    }
  };

  const handleRedeploy = async () => {
    if (!activeProject) return;
    setRedeploying(true);
    try {
      const ownerRepo = selectedRepo ? selectedRepo.full_name : `${status?.github_username || "Parthtiw710"}/${activeProject}`;
      const [owner, repo] = ownerRepo.split("/");

      const res = await fetch(`${API}/api/frontedge/redeploy`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ owner, repo, branch: "main" }),
      });
      if (res.ok) {
        alert("🚀 Redeploy triggered via GitHub Actions workflow dispatch!");
        setTimeout(() => fetchDeployments(activeProject), 3000);
      } else {
        const errText = await res.text();
        alert(`Failed to trigger redeploy: ${errText}`);
      }
    } catch (e) {
      alert("Failed to trigger redeploy.");
    } finally {
      setRedeploying(false);
    }
  };

  const handleSelectProjectCard = (proj: CloudflareProject) => {
    setSelectedProjectObj(proj);
    navigate(`/frontedge-console/project/${proj.name}`);
  };

  const handleDeploy = async (params: {
    repoOwner: string;
    repoName: string;
    projectName: string;
    branch: string;
    rootDir: string;
    buildCommand: string;
    buildDir: string;
    envVars: EnvVar[];
  }) => {
    setDeploying(true);
    setError("");

    try {
      const res = await fetch(`${API}/api/frontedge/deploy`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          repo_owner: params.repoOwner,
          repo_name: params.repoName,
          project_name: params.projectName,
          branch: params.branch,
          root_dir: params.rootDir,
          build_command: params.buildCommand,
          build_dir: params.buildDir,
          env_vars: params.envVars,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || data.message || "Failed to deploy project");
        return;
      }

      fetchProjects();
      navigate(`/frontedge-console/project/${params.projectName}`);
    } catch (e: any) {
      setError(e.message || "Network error deploying project");
    } finally {
      setDeploying(false);
    }
  };

  const handleSaveSecrets = async (vars: EnvVar[]) => {
    if (!activeProject) return;
    setSavingSecrets(true);
    try {
      const res = await fetch(`${API}/api/frontedge/env`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          project: activeProject,
          env_vars: vars,
        }),
      });
      if (res.ok) {
        alert("Environment variables updated successfully!");
      } else {
        alert("Failed to update environment variables.");
      }
    } catch (e) {
      alert("Failed to update environment variables.");
    } finally {
      setSavingSecrets(false);
    }
  };

  const timeAgo = (dateStr: string) => {
    if (!dateStr) return "recently";
    const date = new Date(dateStr);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diffSec < 60) return "just now";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
  };

  if (loadingStatus) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-zinc-500 text-sm">
        <Loader2 className="animate-spin text-indigo-500 mb-3" size={32} />
        Connecting to Frontedge Cloudflare Deployer...
      </div>
    );
  }

  const currentProjectObj = projects.find((p) => p.name === activeProject) || selectedProjectObj;
  const liveUrl = currentProjectObj?.subdomain
    ? `https://${currentProjectObj.subdomain}`
    : activeProject
    ? `https://${activeProject}.pages.dev`
    : "";

  return (
    <div className="max-w-6xl mx-auto px-4 pt-24 pb-12 space-y-8">
      {/* ─── ROUTE 1: /frontedge-console (Dashboard) ───────────────────────── */}
      {screen === "dashboard" && (
        <FrontedgeProjectsList
          status={status}
          projects={projects}
          loadingProjects={loadingProjects}
          search={search}
          setSearch={setSearch}
          onSelectProject={handleSelectProjectCard}
          onNavigateNewProject={() => navigate("/frontedge-console/new")}
          timeAgo={timeAgo}
        />
      )}

      {/* ─── ROUTE 2: /frontedge-console/new (New Project Creation) ───────── */}
      {screen === "new_project" && (
        <FrontedgeCreateProject
          repos={repos}
          loadingRepos={loadingRepos}
          selectedRepo={selectedRepo}
          setSelectedRepo={setSelectedRepo}
          onDeploy={handleDeploy}
          deploying={deploying}
          error={error}
          onBack={() => navigate("/frontedge-console")}
        />
      )}

      {/* ─── ROUTE 3: /frontedge-console/project/:projectName (Project Detail) ─ */}
      {screen === "project_detail" && (
        <FrontedgeProjectDetail
          activeProject={activeProject}
          currentProjectObj={currentProjectObj}
          liveUrl={liveUrl}
          rootDir=""
          deployments={deployments}
          expandedBuildId={expandedBuildId}
          setExpandedBuildId={setExpandedBuildId}
          buildLogs={buildLogs}
          loadingLogs={loadingLogs}
          redeploying={redeploying}
          onRedeploy={handleRedeploy}
          onRefreshBuilds={() => fetchDeployments(activeProject)}
          onBack={() => navigate("/frontedge-console")}
          onSaveSecrets={handleSaveSecrets}
          savingSecrets={savingSecrets}
          timeAgo={timeAgo}
        />
      )}
    </div>
  );
};

export const FrontedgeConsolePage = FrontedgeConsole;
export default FrontedgeConsole;
