import React, { useState } from "react";
import {
  Zap,
  Check,
  Copy,
  ArrowRight,
  GitBranch,
  Globe,
  Terminal,
  Key,
  RefreshCw,
  ShieldCheck,
  Code2,
  Activity,
  Cpu,
  Layers,
  Lock,
} from "lucide-react";
import { Link } from "react-router-dom";

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

const ACCENT = "#f97316"; // orange for Frontedge
const ACCENT_LIGHT = "#fb923c";
const ACCENT_DIM = "rgba(249,115,22,0.15)";

const API_INSPECTOR_ITEMS = [
  {
    id: "status",
    method: "GET",
    path: "/api/frontedge/status",
    color: "#34d399",
    label: "Status & Identity",
    desc: "Auto-detects GitHub user via GITHUB_PAT and verifies Cloudflare credentials. Never exposes raw tokens.",
    payload: `{
  "status": "ok",
  "fully_configured": true,
  "github_configured": true,
  "cloudflare_configured": true,
  "github_username": "parthtiw710",
  "missing_variables": []
}`,
  },
  {
    id: "repos",
    method: "GET",
    path: "/api/frontedge/repos",
    color: "#34d399",
    label: "GitHub Repositories",
    desc: "Lists GitHub repositories accessible via configured PAT token for 1-click import.",
    payload: `[
  {
    "name": "my-web-app",
    "full_name": "parthtiw710/my-web-app",
    "private": true,
    "html_url": "https://github.com/parthtiw710/my-web-app"
  }
]`,
  },
  {
    id: "deploy",
    method: "POST",
    path: "/api/frontedge/deploy",
    color: "#fb923c",
    label: "Dispatch Deployment",
    desc: "Creates Cloudflare Pages project and dispatches build with custom root dir, build command, and env vars.",
    payload: `{
  "project_name": "my-web-app",
  "repo_owner": "parthtiw710",
  "repo_name": "my-web-app",
  "branch": "main",
  "build_command": "npm run build",
  "build_dir": "dist",
  "env_vars": [
    { "key": "API_URL", "value": "https://api.arcops.dev", "is_secret": false }
  ]
}`,
  },
  {
    id: "deployments",
    method: "GET",
    path: "/api/frontedge/deployments",
    color: "#34d399",
    label: "Deployments List",
    desc: "Lists deployment history for a project with deployment IDs, build statuses, and live .pages.dev URLs.",
    payload: `{
  "result": [
    {
      "id": "dep_891273ab",
      "short_id": "891273ab",
      "url": "https://my-web-app-891.pages.dev",
      "created_on": "2026-08-15T18:00:00Z",
      "latest_stage": { "name": "deploy", "status": "success" }
    }
  ]
}`,
  },
  {
    id: "logs",
    method: "GET",
    path: "/api/frontedge/logs",
    color: "#34d399",
    label: "ID-Wise Build Logs",
    desc: "Fetches step-by-step terminal build logs for a specific deployment ID (?project=...&id=...).",
    payload: `{
  "result": {
    "data": [
      { "line": "[18:00:01] Cloning repository parthtiw710/my-web-app..." },
      { "line": "[18:00:04] Executing build command: npm run build..." },
      { "line": "[18:00:10] Assets uploaded to 300+ Edge locations." },
      { "line": "[18:00:11] Deployed: https://my-web-app.pages.dev" }
    ]
  }
}`,
  },
  {
    id: "env",
    method: "PATCH",
    path: "/api/frontedge/env",
    color: "#a78bfa",
    label: "Secrets & Env PATCH",
    desc: "Updates or resets environment variables and encrypted secrets on an existing Cloudflare Pages project.",
    payload: `{
  "env_vars": [
    { "key": "DATABASE_SECRET", "value": "sec_live_991823", "is_secret": true }
  ]
}`,
  },
  {
    id: "retry",
    method: "POST",
    path: "/api/frontedge/retry",
    color: "#fb923c",
    label: "1-Click Build Retry",
    desc: "Triggers instant build retry for a specific deployment ID without requiring any code re-push.",
    payload: `{
  "success": true,
  "deployment_id": "dep_891273ab",
  "status": "queued"
}`,
  },
];

export function FrontedgePage() {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedApiIndex, setSelectedApiIndex] = useState(0);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const currentApi = API_INSPECTOR_ITEMS[selectedApiIndex];

  return (
    <div className="min-h-screen text-[#e8e8f0] relative overflow-hidden" style={{ background: "#050403" }}>
      {/* Warm amber radial glow background */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          background:
            "radial-gradient(ellipse 65% 50% at 95% 5%, rgba(249,115,22,0.12) 0%, transparent 60%), radial-gradient(ellipse 50% 45% at 5% 90%, rgba(251,191,36,0.07) 0%, transparent 60%)",
        }}
      />

      <div className="relative z-10 space-y-16 max-w-7xl mx-auto px-6 lg:px-10 py-10">
        {/* ─── 1. FULL-WIDTH SPLIT HERO (Matches Image 1 layout) ─── */}
        <section className="grid lg:grid-cols-5 gap-10 items-start pt-6">
          {/* Left 3 cols — text & CTAs */}
          <div className="lg:col-span-3 space-y-7">
            <div
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-sm font-semibold"
              style={{ borderColor: `${ACCENT}44`, background: ACCENT_DIM, color: ACCENT_LIGHT }}
            >
              <Zap size={15} /> GitHub → Cloudflare Pages in One Click
            </div>

            <h1 className="text-6xl xl:text-7xl font-extrabold leading-[1.05] tracking-tight text-white">
              Deploy Frontends to{" "}
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: `linear-gradient(90deg, ${ACCENT}, ${ACCENT_LIGHT}, #fbbf24)` }}
              >
                Edge CDN.
              </span>
            </h1>

            <p className="text-xl text-zinc-400 leading-relaxed max-w-xl">
              Frontedge connects your GitHub repository to Cloudflare Pages using only a PAT and an API token.
              No GitHub App. No webhooks. Build logs by ID. Secrets management. Retry any build.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link
                to="/frontedge-console"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-base font-bold text-white transition-all shadow-lg cursor-pointer"
                style={{ background: `linear-gradient(135deg, ${ACCENT}, #ea580c)`, boxShadow: `0 4px 24px ${ACCENT}40` }}
              >
                <Zap size={18} /> Open Console
              </Link>
              <a
                href="https://github.com/Parthtiw710/arcops"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-base font-semibold bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white transition-all"
              >
                <GithubIcon className="size-5" /> GitHub
              </a>
            </div>

            {/* Quick route chips */}
            <div className="flex flex-wrap gap-2 pt-1">
              {API_INSPECTOR_ITEMS.map((api, idx) => (
                <button
                  key={api.path}
                  onClick={() => {
                    setSelectedApiIndex(idx);
                    const el = document.getElementById("api-inspector");
                    if (el) el.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-xs border cursor-pointer transition-all hover:scale-105"
                  style={{ borderColor: `${ACCENT}33`, background: `${ACCENT}0d`, color: ACCENT_LIGHT }}
                >
                  <Copy size={12} /> {api.method} {api.path.replace("/api/frontedge", "")}
                </button>
              ))}
            </div>
          </div>

          {/* Right 2 cols — .env config terminal card */}
          <div className="lg:col-span-2">
            <div
              className="bg-[#0a0806] border rounded-2xl overflow-hidden shadow-2xl backdrop-blur-xl"
              style={{ borderColor: `${ACCENT}33` }}
            >
              <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: `${ACCENT}22`, background: ACCENT_DIM }}>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: ACCENT }} />
                  <span className="text-xs font-mono font-semibold" style={{ color: ACCENT_LIGHT }}>
                    deploy/.env · 3 tokens required
                  </span>
                </div>
              </div>
              <div className="p-5 font-mono text-sm leading-loose">
                <div className="text-zinc-600"># GitHub Personal Access Token</div>
                <div>
                  <span style={{ color: ACCENT_LIGHT }}>GITHUB_PAT</span>
                  <span className="text-zinc-600">=</span>
                  <span className="text-emerald-400">ghp_xxxxxxxxxxxxxxxxxxxx</span>
                </div>
                <div className="h-3" />
                <div className="text-zinc-600"># Cloudflare Account</div>
                <div>
                  <span style={{ color: ACCENT_LIGHT }}>CLOUDFLARE_ACCOUNT_ID</span>
                  <span className="text-zinc-600">=</span>
                  <span className="text-yellow-400">abc123def456...</span>
                </div>
                <div>
                  <span style={{ color: ACCENT_LIGHT }}>CLOUDFLARE_API_TOKEN</span>
                  <span className="text-zinc-600">=</span>
                  <span className="text-yellow-400">your_cf_token</span>
                </div>
                <div className="h-3" />
                <div className="text-zinc-600"># Username auto-detected via PAT</div>
                <div className="text-zinc-700"># No GitHub App. No webhooks.</div>
              </div>
              <div className="px-5 py-3 border-t flex items-center justify-between" style={{ borderColor: `${ACCENT}22`, background: "black/40" }}>
                <span className="text-xs text-emerald-400 font-mono flex items-center gap-1.5 font-semibold">✓ Ready for 1-click deployments</span>
                <span className="text-xs text-zinc-500 font-mono">Port 8083</span>
              </div>
            </div>
          </div>
        </section>

        {/* ─── 2. ARCHITECTURE PIPELINE CARD ─── */}
        <section
          className="p-8 sm:p-10 rounded-3xl border relative shadow-2xl overflow-hidden"
          style={{ borderColor: `${ACCENT}33`, background: `linear-gradient(160deg, ${ACCENT_DIM} 0%, rgba(9,9,11,0.92) 60%, black 100%)` }}
        >
          <div className="mb-6 pb-3 border-b border-zinc-800 flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="text-xs font-mono uppercase tracking-widest" style={{ color: ACCENT_LIGHT }}>
                FRONTEDGE DEPLOYMENT PIPELINE
              </div>
              <h2 className="text-2xl font-bold text-zinc-100 mt-1">GitHub Repo → Cloudflare Edge CDN — Token Powered</h2>
            </div>
            <span className="text-xs font-mono bg-orange-500/10 border border-orange-500/30 text-orange-400 px-3 py-1.5 rounded-full font-semibold">
              300+ Edge POPs
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
            {/* Stage 1 */}
            <div className="p-5 rounded-2xl border border-zinc-800 bg-black/70 space-y-2.5">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-orange-400 font-bold">1. SOURCE REPOSITORY</span>
                <GitBranch size={16} className="text-zinc-500" />
              </div>
              <div className="text-base font-bold text-white">GitHub PAT Authentication</div>
              <p className="text-xs text-zinc-400 leading-relaxed">Reads repository list, branches, and code archives using your Personal Access Token without GitHub App webhook overhead.</p>
            </div>

            {/* Stage 2 */}
            <div className="p-5 rounded-2xl border border-orange-500/40 bg-orange-500/10 space-y-2.5 relative">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-amber-300 font-bold">2. FRONTEDGE SERVICE</span>
                <Cpu size={16} className="text-amber-300" />
              </div>
              <div className="text-base font-bold text-white">Go Deployer Kernel (:8083)</div>
              <p className="text-xs text-zinc-300 leading-relaxed">Orchestrates Cloudflare Pages API,Streams step-by-step build logs by ID, handles secrets PATCH & build retries.</p>
            </div>

            {/* Stage 3 */}
            <div className="p-5 rounded-2xl border border-zinc-800 bg-black/70 space-y-2.5">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-emerald-400 font-bold">3. GLOBAL EDGE</span>
                <Globe size={16} className="text-zinc-500" />
              </div>
              <div className="text-base font-bold text-white">Cloudflare Edge Network</div>
              <p className="text-xs text-zinc-400 leading-relaxed">Deploys compiled static output directly to Cloudflare Pages edge locations under your production *.pages.dev domain.</p>
            </div>
          </div>
        </section>

        {/* ─── 3. UNIFIED ENGINE FEATURES & INTERACTIVE REST API INSPECTOR ─── */}
        <section
          id="api-inspector"
          className="rounded-3xl border border-zinc-800 bg-zinc-950/90 overflow-hidden shadow-2xl p-6 sm:p-8 space-y-6"
        >
          <div className="flex items-center justify-between flex-wrap gap-4 border-b border-zinc-800 pb-4">
            <div>
              <div className="text-xs font-mono uppercase tracking-widest" style={{ color: ACCENT_LIGHT }}>
                REST API ENGINE
              </div>
              <h2 className="text-2xl font-extrabold text-white mt-0.5">Token-Based API Infrastructure</h2>
            </div>
            <span className="text-xs font-mono bg-zinc-900 border border-zinc-800 text-zinc-400 px-3 py-1 rounded-full">
              Gateway Proxy: /api/frontedge/*
            </span>
          </div>

          {/* Horizontal Route Pills */}
          <div className="flex flex-wrap gap-2.5 pb-3 border-b border-zinc-800/60">
            {API_INSPECTOR_ITEMS.map((item, idx) => (
              <button
                key={item.id}
                onClick={() => setSelectedApiIndex(idx)}
                className={`px-3.5 py-2 rounded-xl font-mono text-xs sm:text-sm border transition-all cursor-pointer flex items-center gap-2 ${
                  selectedApiIndex === idx
                    ? "bg-orange-500/25 border-orange-500/80 text-orange-200 font-bold shadow-md"
                    : "bg-black/50 border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:text-white"
                }`}
              >
                <span
                  className="px-2 py-0.5 rounded text-xs font-bold"
                  style={{ background: `${item.color}25`, color: item.color }}
                >
                  {item.method}
                </span>
                <span className="font-semibold">{item.path.replace("/api/frontedge", "")}</span>
              </button>
            ))}
          </div>

          {/* Compact 2-Column Inspector (Low Height, High Contrast Fonts) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Info Column (5 cols) */}
            <div className="lg:col-span-5 space-y-3.5">
              <div className="flex items-center gap-2.5">
                <span
                  className="px-2.5 py-1 rounded text-xs font-bold font-mono"
                  style={{ background: `${currentApi.color}25`, color: currentApi.color, border: `1px solid ${currentApi.color}40` }}
                >
                  {currentApi.method}
                </span>
                <span className="text-base sm:text-lg font-bold text-white font-mono">{currentApi.path}</span>
              </div>

              <div className="text-base font-bold text-zinc-100">{currentApi.label}</div>
              <p className="text-sm text-zinc-300 leading-relaxed font-sans">{currentApi.desc}</p>

              <button
                onClick={() => handleCopy(`${currentApi.method} ${currentApi.path}\n${currentApi.payload}`, "inspector")}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs sm:text-sm font-bold text-orange-400 hover:text-orange-300 transition-colors font-mono cursor-pointer shadow-sm"
              >
                {copiedId === "inspector" ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                <span>{copiedId === "inspector" ? "Copied Payload" : "Copy Payload Structure"}</span>
              </button>
            </div>

            {/* Right JSON Preview Column (7 cols) */}
            <div className="lg:col-span-7 bg-black/90 border border-zinc-800 rounded-2xl p-5 font-mono space-y-2.5 shadow-xl">
              <div className="text-xs font-mono text-zinc-400 uppercase tracking-widest flex items-center justify-between font-semibold">
                <span>JSON Payload Response</span>
                <span className="text-emerald-400 font-bold">200 OK</span>
              </div>
              <div className="bg-[#060504] p-4 rounded-xl border border-zinc-800/80 text-xs sm:text-sm text-orange-300 overflow-y-auto max-h-[230px] leading-relaxed custom-scrollbar font-mono">
                <pre>{currentApi.payload}</pre>
              </div>
            </div>
          </div>
        </section>

        {/* ─── 4. BOTTOM CTA ─── */}
        <section className="text-center py-12 bg-gradient-to-r from-orange-950/30 via-zinc-950 to-orange-950/30 border border-orange-500/20 rounded-3xl p-10 space-y-4">
          <h2 className="text-4xl sm:text-5xl font-extrabold text-white">
            Ready to deploy your frontend to Cloudflare Edge?
          </h2>
          <p className="text-base text-zinc-400 max-w-lg mx-auto">
            Connect your GitHub repository and dispatch your first deployment in under 60 seconds.
          </p>
          <Link
            to="/frontedge-console"
            className="inline-flex items-center gap-2.5 px-8 py-4 rounded-2xl text-base font-bold text-white transition-all shadow-xl cursor-pointer"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, #ea580c)`, boxShadow: `0 6px 32px ${ACCENT}50` }}
          >
            <Zap size={18} /> Open Frontedge Console <ArrowRight size={18} />
          </Link>
        </section>
      </div>
    </div>
  );
}
