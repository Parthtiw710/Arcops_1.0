import React, { useState } from "react";
import {
  ArrowLeft,
  ExternalLink,
  RefreshCw,
  Key,
  ChevronDown,
  ChevronRight,
  Terminal,
  Loader2,
  Plus,
  Trash2,
  X,
  Lock,
} from "lucide-react";
import {
  CloudflareProject,
  Deployment,
  EnvVar,
  MILESTONES,
} from "./frontedge-types";

interface FrontedgeProjectDetailProps {
  activeProject: string;
  currentProjectObj: CloudflareProject | null;
  liveUrl: string;
  rootDir: string;
  deployments: Deployment[];
  expandedBuildId: string | null;
  setExpandedBuildId: React.Dispatch<React.SetStateAction<string | null>>;
  buildLogs: Record<string, string[]>;
  loadingLogs: Record<string, boolean>;
  redeploying: boolean;
  onRedeploy: () => Promise<void>;
  onRefreshBuilds: () => void;
  onBack: () => void;
  onSaveSecrets: (vars: EnvVar[]) => Promise<void>;
  savingSecrets: boolean;
  timeAgo: (dateStr: string) => string;
}

export const FrontedgeProjectDetail: React.FC<FrontedgeProjectDetailProps> = ({
  activeProject,
  currentProjectObj,
  liveUrl,
  rootDir,
  deployments,
  expandedBuildId,
  setExpandedBuildId,
  buildLogs,
  loadingLogs,
  redeploying,
  onRedeploy,
  onRefreshBuilds,
  onBack,
  onSaveSecrets,
  savingSecrets,
  timeAgo,
}) => {
  const [showSecretModal, setShowSecretModal] = useState(false);
  const [modalEnvVars, setModalEnvVars] = useState<EnvVar[]>([
    { key: "", value: "", is_secret: false },
  ]);

  const handleModalAddEnv = () => {
    setModalEnvVars((prev) => [...prev, { key: "", value: "", is_secret: false }]);
  };

  const handleModalRemoveEnv = (idx: number) => {
    setModalEnvVars((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleModalUpdateEnv = (idx: number, field: keyof EnvVar, val: any) => {
    setModalEnvVars((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val };
      return next;
    });
  };

  const handleSaveModalSecrets = async () => {
    const valid = modalEnvVars.filter((e) => e.key.trim() !== "");
    await onSaveSecrets(valid);
    setShowSecretModal(false);
  };

  const statusLabel = (st: string) => {
    const lower = (st || "").toLowerCase();
    if (lower === "success" || lower === "active") return "SUCCESS";
    if (lower === "failure" || lower === "failed") return "FAILED";
    if (lower === "building" || lower === "in_progress") return "BUILDING";
    return "SUCCESS";
  };

  const statusColor = (st: string) => {
    const s = statusLabel(st);
    if (s === "SUCCESS") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    if (s === "FAILED") return "bg-red-500/10 text-red-400 border-red-500/20";
    return "bg-amber-500/10 text-amber-400 border-amber-500/20";
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Header & Navigation Bar */}
      <div className="flex items-center justify-between gap-4 bg-zinc-950/80 border border-zinc-800/80 rounded-2xl p-5 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors flex items-center gap-2 cursor-pointer"
          >
            <ArrowLeft size={14} /> Back
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-zinc-500 text-xs font-medium">Frontedge /</span>
              <h1 className="text-xl font-bold text-white font-['Outfit']">{activeProject}</h1>
              {rootDir && (
                <span className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md px-2 py-0.5 font-mono">
                  📁 {rootDir}
                </span>
              )}
            </div>
            <p className="text-zinc-500 text-[11px] mt-0.5 font-mono">{liveUrl.replace("https://", "")}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => window.open(liveUrl, "_blank")}
            className="bg-zinc-900 text-zinc-200 hover:text-white border border-zinc-800 hover:border-zinc-700 rounded-xl px-4 py-2 text-xs font-medium transition-all flex items-center gap-2 cursor-pointer"
          >
            Visit Site <ExternalLink size={13} />
          </button>
          <button
            onClick={onRedeploy}
            disabled={redeploying}
            className="bg-white hover:bg-zinc-200 text-black font-semibold text-xs px-4 py-2 rounded-xl transition-all flex items-center gap-2 cursor-pointer disabled:opacity-60"
          >
            <RefreshCw size={13} className={redeploying ? "animate-spin" : ""} />
            {redeploying ? "Triggering..." : "Redeploy Project"}
          </button>
          <button
            onClick={() => setShowSecretModal(true)}
            className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Key size={13} className="text-indigo-400" /> Manage Secrets & Env
          </button>
        </div>
      </div>

      {/* Hero Card: Status & Compact 240x135 Vercel Preview Card */}
      <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-2xl p-6 backdrop-blur-xl flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="space-y-3 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                deployments[0]?.latest_stage?.status === "active" || deployments[0]?.latest_stage?.status === "building"
                  ? "bg-amber-400 animate-pulse"
                  : "bg-emerald-500"
              }`}
            />
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              {deployments[0]?.latest_stage?.status === "active" || deployments[0]?.latest_stage?.status === "building"
                ? "Building Edge Deployment..."
                : "Live Edge Deployment"}
            </span>
          </div>

          <div>
            <a
              href={liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-lg font-bold text-white hover:text-emerald-400 transition-colors font-mono flex items-center gap-2 group"
            >
              {liveUrl.replace("https://", "")}{" "}
              <ExternalLink size={15} className="opacity-60 group-hover:opacity-100 transition-opacity" />
            </a>
            <p className="text-zinc-500 text-xs mt-1">
              Deployed to Cloudflare Edge CDN • Unlimited Bandwidth • $0 Egress Charges
            </p>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <span className={`text-xs border rounded-full px-3 py-0.5 ${statusColor(deployments[0]?.latest_stage?.status || "SUCCESS")}`}>
              ● {statusLabel(deployments[0]?.latest_stage?.status || "SUCCESS")}
            </span>
            <span className="text-zinc-500 text-xs">
              Last updated {timeAgo(deployments[0]?.created_on || "")}
            </span>
          </div>
        </div>

        {/* Compact Vercel Preview Box (240px X 135px card) */}
        <div
          onClick={() => window.open(liveUrl, "_blank")}
          className="group relative w-[240px] h-[135px] rounded-xl overflow-hidden border border-zinc-800 hover:border-indigo-500/50 bg-zinc-900/90 shadow-2xl transition-all cursor-pointer flex-shrink-0"
        >
          <div className="w-full h-full p-4 flex flex-col justify-between bg-gradient-to-br from-indigo-950/40 via-zinc-900 to-zinc-950 group-hover:scale-105 transition-transform duration-300">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-zinc-400 truncate max-w-[150px]">
                {activeProject}.pages.dev
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>

            <div className="space-y-1">
              <span className="text-xs font-bold text-white block group-hover:text-indigo-300 transition-colors">
                Production Preview
              </span>
              <span className="text-[10px] text-zinc-500 block font-mono">
                Cloudflare Pages Edge CDN
              </span>
            </div>

            <div className="flex items-center justify-between text-[10px] text-indigo-400 font-semibold pt-1 border-t border-zinc-800/80">
              <span>Click to view live site</span>
              <ExternalLink size={10} />
            </div>
          </div>
        </div>
      </div>

      {/* Deployment History & Vercel-Clean Terminal Log Drawer */}
      <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-2xl p-6 backdrop-blur-xl space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
          <div>
            <h3 className="text-sm font-bold text-white font-['Outfit']">Deployment History & Terminal Logs</h3>
            <p className="text-zinc-500 text-xs mt-0.5">Click any build to view clean Vercel-style build terminal logs</p>
          </div>
          <button
            onClick={onRefreshBuilds}
            className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium cursor-pointer"
          >
            <RefreshCw size={12} /> Refresh History
          </button>
        </div>

        {deployments.length === 0 ? (
          <div className="text-center py-8 text-zinc-500 text-xs">No build history recorded yet.</div>
        ) : (
          <div className="space-y-3">
            {deployments.map((dep) => {
              const isExpanded = expandedBuildId === dep.id;
              const logs = buildLogs[dep.id] || [];
              const isLoadingThisLog = loadingLogs[dep.id];

              return (
                <div
                  key={dep.id}
                  className="border border-zinc-800/80 rounded-xl overflow-hidden transition-all bg-zinc-950"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedBuildId(isExpanded ? null : dep.id)}
                    className="w-full bg-zinc-900/60 hover:bg-zinc-900 p-4 text-left flex items-center justify-between gap-4 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`text-xs border rounded-full px-2.5 py-0.5 ${statusColor(dep.latest_stage?.status || "SUCCESS")}`}>
                        ● {statusLabel(dep.latest_stage?.status || "SUCCESS")}
                      </span>
                      <div>
                        <span className="text-xs font-bold text-white font-mono block">
                          Build #{dep.short_id || dep.id.substring(0, 7)}
                        </span>
                        <span className="text-[11px] text-zinc-500 block mt-0.5">
                          Triggered {timeAgo(dep.created_on)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-[11px] text-zinc-400 font-mono hidden sm:inline">
                        {dep.latest_stage?.name || "Deploy to Cloudflare Pages"}
                      </span>
                      {isExpanded ? <ChevronDown size={15} className="text-zinc-400" /> : <ChevronRight size={15} className="text-zinc-400" />}
                    </div>
                  </button>

                  {/* Expanded Milestone Parser & Clean Vercel Terminal Box */}
                  {isExpanded && (
                    <div className="p-5 border-t border-zinc-800/80 bg-zinc-950 space-y-6">
                      {/* 8-Stage Pipeline Milestones */}
                      <div className="space-y-2">
                        <span className="text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
                          Pipeline Milestones
                        </span>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                          {MILESTONES.map((m) => {
                            const IconComp = m.icon;
                            const isDone = true;
                            return (
                              <div
                                key={m.key}
                                className="bg-zinc-900/80 border border-zinc-800/80 rounded-lg p-2.5 flex items-center gap-2"
                              >
                                <div className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center flex-shrink-0">
                                  <IconComp size={11} />
                                </div>
                                <span className="text-[11px] font-medium text-zinc-300 truncate">
                                  {m.label}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Clean Vercel-Style Terminal Log Viewer */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-zinc-400">
                          <span className="font-mono text-zinc-400 flex items-center gap-1.5">
                            <Terminal size={13} className="text-emerald-400" /> Terminal Build Output
                          </span>
                          <span className="text-[10px] text-zinc-500 font-mono">Clean Vercel Log Format</span>
                        </div>

                        <div
                          data-lenis-prevent="true"
                          className="bg-black border border-zinc-800 rounded-xl p-4 font-mono text-xs text-zinc-300 h-80 overflow-y-auto space-y-1 select-text scrollbar-thin scrollbar-thumb-zinc-800"
                        >
                          {isLoadingThisLog ? (
                            <div className="flex items-center gap-2 text-zinc-500 py-4">
                              <Loader2 className="animate-spin text-indigo-500" size={16} />
                              Loading sanitized GitHub Actions build logs...
                            </div>
                          ) : logs.length === 0 ? (
                            <div className="text-zinc-600 italic py-4">No log output available for this build run.</div>
                          ) : (
                            logs.map((line, idx) => (
                              <div key={idx} className="leading-relaxed hover:bg-zinc-900/50 px-1 rounded flex gap-3">
                                <span className="text-zinc-700 select-none w-8 text-right flex-shrink-0">{idx + 1}</span>
                                <span className={line.toLowerCase().includes("error") ? "text-red-400" : line.toLowerCase().includes("warn") ? "text-amber-300" : line.toLowerCase().includes("built in") || line.toLowerCase().includes("done") ? "text-emerald-400" : "text-zinc-300"}>
                                  {line}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Manage Secrets & Env Variables Modal */}
      {showSecretModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 max-w-xl w-full space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Key size={18} className="text-indigo-400" />
                <h3 className="text-base font-bold text-white font-['Outfit']">
                  Environment Secrets — {activeProject}
                </h3>
              </div>
              <button
                onClick={() => setShowSecretModal(false)}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-zinc-400">
              Secrets are encrypted with NaCl Sealed Box and injected directly into GitHub Actions repository secrets and Cloudflare Pages env.
            </p>

            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {modalEnvVars.map((env, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="KEY"
                    value={env.key}
                    onChange={(e) => handleModalUpdateEnv(idx, "key", e.target.value)}
                    className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500/50"
                  />
                  <input
                    type={env.is_secret ? "password" : "text"}
                    placeholder="VALUE"
                    value={env.value}
                    onChange={(e) => handleModalUpdateEnv(idx, "value", e.target.value)}
                    className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500/50"
                  />
                  <label className="flex items-center gap-1 text-xs text-zinc-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!env.is_secret}
                      onChange={(e) => handleModalUpdateEnv(idx, "is_secret", e.target.checked)}
                      className="rounded bg-zinc-900 border-zinc-800 text-indigo-500 focus:ring-0"
                    />
                    Secret
                  </label>
                  <button
                    type="button"
                    onClick={() => handleModalRemoveEnv(idx)}
                    className="text-zinc-500 hover:text-red-400 p-1 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={handleModalAddEnv}
                className="text-xs bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Plus size={13} /> Add Variable
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowSecretModal(false)}
                  className="text-xs text-zinc-400 hover:text-white px-4 py-2 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingSecrets}
                  onClick={handleSaveModalSecrets}
                  className="bg-white hover:bg-zinc-200 text-black font-semibold text-xs px-4 py-2 rounded-xl transition-all disabled:opacity-60 flex items-center gap-2"
                >
                  {savingSecrets ? <Loader2 className="animate-spin" size={13} /> : <Lock size={13} />}
                  Save Secrets
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
