import {
  FolderGit2,
  Terminal,
  Loader2,
  Zap,
  Folder,
  ShieldCheck,
  Globe,
  CheckCircle2,
} from "lucide-react";

export interface GitHubRepo {
  full_name: string;
  name: string;
  private: boolean;
  html_url: string;
}

export interface CloudflareProject {
  id: string;
  name: string;
  subdomain: string;
  domains: string[];
  created_on: string;
  production_branch: string;
  canonical_deployment?: {
    id: string;
    url: string;
    created_on: string;
  };
  latest_deployment?: {
    id: string;
    url: string;
    created_on: string;
    latest_stage?: {
      name: string;
      status: string;
    };
  };
}

export interface Deployment {
  id: string;
  short_id: string;
  project_name: string;
  environment: string;
  url: string;
  created_on: string;
  latest_stage?: {
    name: string;
    status: string;
    started_on?: string;
    ended_on?: string;
  };
}

export interface EnvVar {
  key: string;
  value: string;
  is_secret?: boolean;
}

export interface FrontedgeStatus {
  status: string;
  fully_configured: boolean;
  github_configured: boolean;
  cloudflare_configured: boolean;
  github_username: string;
  missing_variables: string[];
}

export const MILESTONES = [
  { key: "Checkout", label: "Source Code Checkout", icon: FolderGit2 },
  { key: "Setup", label: "Environment & Tooling Setup", icon: Terminal },
  { key: "Build", label: "Build & Asset Compilation", icon: Zap },
  { key: "Deploy", label: "Edge Infrastructure Deployment", icon: Globe },
  { key: "Complete", label: "Deployment Verified & Active", icon: CheckCircle2 },
];
