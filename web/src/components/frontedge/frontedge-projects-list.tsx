import React from "react";
import {
  Globe,
  Plus,
  Search,
  ExternalLink,
  ShieldCheck,
  Zap,
  ArrowRight,
  Loader2,
  GitBranch,
} from "lucide-react";
import { CloudflareProject, FrontedgeStatus } from "./frontedge-types";

interface FrontedgeProjectsListProps {
  status: FrontedgeStatus | null;
  projects: CloudflareProject[];
  loadingProjects: boolean;
  search: string;
  setSearch: (val: string) => void;
  onSelectProject: (proj: CloudflareProject) => void;
  onNavigateNewProject: () => void;
  timeAgo: (dateStr: string) => string;
}

export const FrontedgeProjectsList: React.FC<FrontedgeProjectsListProps> = ({
  status,
  projects,
  loadingProjects,
  search,
  setSearch,
  onSelectProject,
  onNavigateNewProject,
  timeAgo,
}) => {
  const filteredProjects = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.subdomain.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* System Configuration Status Banner */}
      <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-2xl p-6 backdrop-blur-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Globe size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-white">Frontedge Edge Deployer</h2>
              <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-mono">
                Tier-1 Raw CDN ($0 Egress)
              </span>
            </div>
            <p className="text-zinc-500 text-xs mt-0.5">
              Direct upload deployments to Cloudflare Pages & Edge CDNs with zero markups.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {status?.github_configured ? (
            <span className="text-xs bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full flex items-center gap-1.5 font-medium">
              <ShieldCheck size={13} /> GitHub PAT Connected
            </span>
          ) : (
            <span className="text-xs bg-amber-500/10 border border-amber-500/20 text-amber-400 px-3 py-1 rounded-full flex items-center gap-1.5 font-medium">
              <Zap size={13} /> PAT Required
            </span>
          )}
          {status?.cloudflare_configured && (
            <span className="text-xs bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 px-3 py-1 rounded-full flex items-center gap-1.5 font-medium">
              <Globe size={13} /> Cloudflare API Connected
            </span>
          )}
        </div>
      </div>

      {/* Projects Dashboard Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search deployed projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-zinc-950/80 border border-zinc-800/80 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500/50 transition-colors"
          />
        </div>

        <button
          onClick={onNavigateNewProject}
          className="bg-white hover:bg-zinc-200 text-black font-semibold text-xs px-4 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-white/5"
        >
          <Plus size={15} /> Deploy New Project
        </button>
      </div>

      {/* Projects Grid */}
      {loadingProjects ? (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-500 text-sm">
          <Loader2 className="animate-spin text-indigo-500 mb-3" size={28} />
          Fetching edge projects from Cloudflare Pages...
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="bg-zinc-950/50 border border-zinc-800/60 rounded-2xl p-12 text-center">
          <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 mx-auto mb-4">
            <Globe size={24} />
          </div>
          <h3 className="text-base font-semibold text-white font-['Outfit']">No Edge Projects Found</h3>
          <p className="text-zinc-500 text-xs mt-1 max-w-sm mx-auto">
            Connect a GitHub repository to deploy your first Vite/React app directly to Cloudflare Pages edge network.
          </p>
          <button
            onClick={onNavigateNewProject}
            className="mt-5 bg-white hover:bg-zinc-200 text-black font-semibold text-xs px-5 py-2.5 rounded-xl transition-all inline-flex items-center gap-2 cursor-pointer"
          >
            <Plus size={15} /> Deploy First App
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProjects.map((proj) => {
            const projectUrl = proj.subdomain ? `https://${proj.subdomain}` : `https://${proj.name}.pages.dev`;
            return (
              <div
                key={proj.id || proj.name}
                onClick={() => onSelectProject(proj)}
                className="group bg-zinc-950/80 hover:bg-zinc-900/90 border border-zinc-800/80 hover:border-zinc-700/80 rounded-2xl p-5 backdrop-blur-xl transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300 group-hover:border-zinc-700 transition-colors">
                        <Globe size={16} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white font-['Outfit'] group-hover:text-indigo-400 transition-colors">
                          {proj.name}
                        </h4>
                        <span className="text-[11px] text-zinc-500 font-mono block">
                          {proj.subdomain || `${proj.name}.pages.dev`}
                        </span>
                      </div>
                    </div>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5" />
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-zinc-400 mt-4 font-mono">
                    <span className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-md px-2 py-0.5">
                      <GitBranch size={11} className="text-zinc-500" /> {proj.production_branch || "main"}
                    </span>
                    <span className="text-zinc-500">• Deployed {timeAgo(proj.created_on)}</span>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-zinc-900 flex items-center justify-between text-xs text-zinc-400 group-hover:text-white transition-colors">
                  <span className="flex items-center gap-1 font-medium text-[11px]">
                    View Console <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                  </span>
                  <a
                    href={projectUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-zinc-500 hover:text-emerald-400 p-1 transition-colors"
                  >
                    <ExternalLink size={13} />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
