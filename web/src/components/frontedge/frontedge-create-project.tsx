import React, { useState, useEffect } from "react";
import {
  ArrowLeft,
  Search,
  FolderGit2,
  Folder,
  Globe,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Edit2,
  Check,
  GitBranch,
  Zap,
  X,
  AlertCircle,
} from "lucide-react";
import { GitHubRepo, EnvVar } from "./frontedge-types";

interface FrontedgeCreateProjectProps {
  repos: GitHubRepo[];
  loadingRepos: boolean;
  selectedRepo: GitHubRepo | null;
  setSelectedRepo: (repo: GitHubRepo | null) => void;
  onDeploy: (params: {
    repoOwner: string;
    repoName: string;
    projectName: string;
    branch: string;
    rootDir: string;
    buildCommand: string;
    buildDir: string;
    envVars: EnvVar[];
  }) => Promise<void>;
  deploying: boolean;
  error: string;
  onBack: () => void;
}

const DRAFT_KEY = "frontedge_create_project_draft";

export const FrontedgeCreateProject: React.FC<FrontedgeCreateProjectProps> = ({
  repos,
  loadingRepos,
  selectedRepo,
  setSelectedRepo,
  onDeploy,
  deploying,
  error,
  onBack,
}) => {
  const [search, setSearch] = useState("");
  const [projectName, setProjectName] = useState("");
  const [branch, setBranch] = useState("main");
  const [rootDir, setRootDir] = useState("");
  const [editingRootDir, setEditingRootDir] = useState(false);
  const [buildCommand, setBuildCommand] = useState("npm run build");
  const [buildDir, setBuildDir] = useState("dist");
  const [installCommand, setInstallCommand] = useState("npm install");
  const [envVars, setEnvVars] = useState<EnvVar[]>([{ key: "", value: "", is_secret: false }]);
  const [showBuildSettings, setShowBuildSettings] = useState(false);
  const [showEnvVars, setShowEnvVars] = useState(false);

  // Restore draft from sessionStorage on mount
  useEffect(() => {
    try {
      const savedDraft = sessionStorage.getItem(DRAFT_KEY);
      if (savedDraft) {
        const parsed = JSON.parse(savedDraft);
        if (parsed.projectName) setProjectName(parsed.projectName);
        if (parsed.branch) setBranch(parsed.branch);
        if (parsed.rootDir !== undefined) setRootDir(parsed.rootDir);
        if (parsed.buildCommand) setBuildCommand(parsed.buildCommand);
        if (parsed.buildDir) setBuildDir(parsed.buildDir);
        if (parsed.installCommand) setInstallCommand(parsed.installCommand);
        if (parsed.envVars && Array.isArray(parsed.envVars)) setEnvVars(parsed.envVars);
        if (parsed.selectedRepo) setSelectedRepo(parsed.selectedRepo);
        if (parsed.search) setSearch(parsed.search);
      }
    } catch (e) {
      console.error("Failed to load project creation draft from sessionStorage:", e);
    }
  }, []);

  // Persist form state to sessionStorage on every change
  useEffect(() => {
    try {
      const draftPayload = {
        projectName,
        branch,
        rootDir,
        editingRootDir,
        showBuildSettings,
        buildCommand,
        buildDir,
        installCommand,
        showEnvVars,
        envVars,
        selectedRepo,
        search,
      };
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draftPayload));
    } catch (e) {
      console.error("Failed to save project creation draft to sessionStorage:", e);
    }
  }, [
    selectedRepo,
    projectName,
    branch,
    rootDir,
    editingRootDir,
    showBuildSettings,
    buildCommand,
    buildDir,
    installCommand,
    showEnvVars,
    envVars,
    search,
  ]);

  const handleSelectRepo = (repo: GitHubRepo) => {
    setSelectedRepo(repo);
    setProjectName(repo.name.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
  };

  const handlePasteEnv = (e: React.ClipboardEvent<HTMLInputElement>, startIndex: number) => {
    const pastedText = e.clipboardData.getData("text");
    if (!pastedText.includes("\n") && !pastedText.includes("=")) {
      return; // Normal single text paste
    }
    e.preventDefault();

    const lines = pastedText.split("\n");
    const parsed: EnvVar[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx !== -1) {
        const key = trimmed.substring(0, eqIdx).trim();
        let value = trimmed.substring(eqIdx + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.substring(1, value.length - 1);
        }
        if (key) {
          parsed.push({ key, value, is_secret: key.includes("SECRET") || key.includes("KEY") || key.includes("TOKEN") });
        }
      }
    }

    if (parsed.length > 0) {
      setEnvVars((prev) => {
        const updated = [...prev];
        let idx = startIndex;
        for (const item of parsed) {
          if (idx < updated.length) {
            updated[idx] = item;
          } else {
            updated.push(item);
          }
          idx++;
        }
        return updated.filter((item, i) => item.key || item.value || i === updated.length - 1);
      });
    }
  };

  const addEnvVar = () => setEnvVars([...envVars, { key: "", value: "", is_secret: false }]);
  const updateEnvVar = (idx: number, key: string, value: string, is_secret?: boolean) => {
    const updated = [...envVars];
    updated[idx] = { key, value, is_secret: is_secret ?? updated[idx].is_secret };
    setEnvVars(updated);
  };
  const removeEnvVar = (idx: number) => setEnvVars(envVars.filter((_, i) => i !== idx));

  const handleDeployClick = async () => {
    if (!selectedRepo) return;
    const [repoOwner, repoName] = selectedRepo.full_name.split("/");
    await onDeploy({
      repoOwner,
      repoName,
      projectName: projectName || repoName,
      branch,
      rootDir,
      buildCommand,
      buildDir,
      envVars: envVars.filter((ev) => ev.key.trim() !== ""),
    });
    sessionStorage.removeItem(DRAFT_KEY);
  };

  const filteredRepos = repos.filter((r) => r.full_name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={onBack}
          className="bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors flex items-center gap-2 cursor-pointer shrink-0"
        >
          <ArrowLeft size={18} /> Back
        </button>
        <div>
          <h1 className="text-3xl font-bold text-white font-['Outfit']">New Project</h1>
          <p className="text-zinc-400 text-base font-medium mt-1">Build your frontend. We handle everything else.</p>
        </div>
      </div>

      {/* Step 1: Select Repository (if not selected) */}
      {!selectedRepo ? (
        <div className="space-y-5">
          <div className="relative">
            <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              className="w-full bg-zinc-950/90 border border-zinc-800 rounded-xl text-white placeholder-zinc-500 text-base pl-12 pr-4 py-4 outline-none focus:border-indigo-500/60 transition-colors"
              placeholder="Search repositories..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Tailwind Scrollable Repo Box */}
          <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-2xl overflow-hidden backdrop-blur-xl">
            <div
              data-lenis-prevent="true"
              data-lenis-prevent-wheel="true"
              data-lenis-prevent-touch="true"
              className="max-h-[480px] overflow-y-auto divide-y divide-zinc-800/50 custom-scrollbar"
            >
              {loadingRepos ? (
                <div className="py-10 text-center text-zinc-400 text-sm">
                  <Loader2 className="animate-spin text-indigo-500 mx-auto mb-2.5" size={26} />
                  Loading authorized repositories...
                </div>
              ) : filteredRepos.length === 0 ? (
                <div className="py-10 text-center text-zinc-400 text-sm">No matching repositories found</div>
              ) : (
                filteredRepos.map((repo) => (
                  <div
                    key={repo.full_name}
                    className="flex items-center justify-between px-6 py-4.5 hover:bg-zinc-900/50 transition-colors"
                  >
                    <div className="flex items-center gap-3.5">
                      <Folder size={22} className="text-zinc-300 shrink-0" />
                      <div>
                        <div className="text-white text-base font-bold tracking-tight">{repo.name}</div>
                        <div className="text-zinc-400 text-sm mt-0.5">
                          {repo.full_name} {repo.private ? "· Private" : "· Public"}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleSelectRepo(repo)}
                      className="bg-white text-black font-bold text-sm px-5 py-2.5 rounded-xl hover:bg-zinc-200 transition-colors cursor-pointer shrink-0"
                    >
                      Import
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Step 2: Vercel-style Import Config Card (Exact replica of Arcops_1.0_mt) */
        <div className="space-y-6">
          <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-2xl p-7 backdrop-blur-xl space-y-6">
            {/* Header subcard banner */}
            <div className="bg-black/60 border border-zinc-800 rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-zinc-400 font-semibold uppercase tracking-wider font-mono">Importing from GitHub</div>
                <div className="text-white font-bold text-base mt-1 flex items-center gap-2.5">
                  <FolderGit2 size={18} className="text-indigo-400" />
                  <span>{selectedRepo.full_name}</span>
                  <span className="text-xs text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 rounded-md px-2 py-0.5 inline-flex items-center gap-1 font-mono">
                    <GitBranch size={12} /> {branch || "main"}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedRepo(null)}
                className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white text-sm font-medium px-3.5 py-2 rounded-xl transition-colors cursor-pointer"
              >
                Change Repo
              </button>
            </div>

            <p className="text-zinc-400 text-sm font-medium">
              Choose where you want to create the project and give it a name.
            </p>

            {/* Form Fields */}
            <div className="space-y-5">
              {/* Project Name */}
              <div>
                <label className="text-sm font-semibold text-zinc-300 block mb-2">Project Name</label>
                <input
                  className="w-full bg-black/40 border border-zinc-800 rounded-xl text-white text-base px-4 py-3.5 outline-none focus:border-indigo-500/60 transition-colors font-medium"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                />
              </div>

              {/* Root Directory */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-zinc-300">Root Directory</label>
                  <button
                    onClick={() => setEditingRootDir(!editingRootDir)}
                    className="text-sm text-indigo-400 hover:text-indigo-300 font-bold cursor-pointer"
                  >
                    {editingRootDir ? "Done" : "Edit"}
                  </button>
                </div>
                {editingRootDir ? (
                  <input
                    className="w-full bg-black/40 border border-zinc-800 rounded-xl text-white text-base px-4 py-3.5 outline-none focus:border-indigo-500/60 transition-colors font-medium"
                    placeholder="e.g. demo, apps/web"
                    value={rootDir}
                    onChange={(e) => setRootDir(e.target.value)}
                  />
                ) : (
                  <div className="w-full bg-black/30 border border-zinc-800/80 rounded-xl text-zinc-300 text-base px-4 py-3.5 font-mono">
                    {rootDir ? `./${rootDir}` : "./"}
                  </div>
                )}
              </div>

              {/* Accordion 1: Build and Output Settings */}
              <div className="border border-zinc-800 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowBuildSettings(!showBuildSettings)}
                  className="w-full bg-zinc-900/40 hover:bg-zinc-900/70 px-5 py-3.5 flex items-center justify-between text-white text-sm font-semibold transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    {showBuildSettings ? <ChevronDown size={18} /> : <ChevronRight size={18} />} Build and Output Settings
                  </span>
                  <span className="text-xs text-zinc-400 font-medium">{showBuildSettings ? "Hide" : "Show"}</span>
                </button>
                {showBuildSettings && (
                  <div className="p-5 space-y-4 bg-black/30 border-t border-zinc-800">
                    <div>
                      <label className="text-xs font-medium text-zinc-400 block mb-1.5">Build Command</label>
                      <input
                        className="w-full bg-black/40 border border-zinc-800 rounded-xl text-white text-sm px-4 py-2.5 outline-none font-mono"
                        value={buildCommand}
                        onChange={(e) => setBuildCommand(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-zinc-400 block mb-1.5">Output Directory</label>
                      <input
                        className="w-full bg-black/40 border border-zinc-800 rounded-xl text-white text-sm px-4 py-2.5 outline-none font-mono"
                        value={buildDir}
                        onChange={(e) => setBuildDir(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-zinc-400 block mb-1.5">Install Command</label>
                      <input
                        className="w-full bg-black/40 border border-zinc-800 rounded-xl text-white text-sm px-4 py-2.5 outline-none font-mono"
                        value={installCommand}
                        onChange={(e) => setInstallCommand(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Accordion 2: Environment Variables */}
              <div className="border border-zinc-800 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowEnvVars(!showEnvVars)}
                  className="w-full bg-zinc-900/40 hover:bg-zinc-900/70 px-5 py-3.5 flex items-center justify-between text-white text-sm font-semibold transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    {showEnvVars ? <ChevronDown size={18} /> : <ChevronRight size={18} />} Environment Variables
                  </span>
                  <span className="text-xs text-zinc-400 font-medium">{envVars.length} set</span>
                </button>
                {showEnvVars && (
                  <div className="p-5 space-y-4 bg-black/30 border-t border-zinc-800">
                    {/* Tip banner */}
                    <div className="bg-indigo-950/40 border border-indigo-500/40 rounded-xl p-4 flex items-center gap-3 text-sm text-zinc-200">
                      <Zap size={18} className="text-indigo-400 shrink-0" />
                      <span>
                        <strong className="text-white font-semibold">Tip:</strong> Paste your entire{" "}
                        <code className="bg-black border border-indigo-500/50 rounded-md px-2 py-0.5 font-mono text-xs text-indigo-300 font-bold">
                          .env
                        </code>{" "}
                        file directly into any <strong className="text-white font-bold">KEY</strong> input field below to auto-populate all fields.
                      </span>
                    </div>

                    {envVars.map((v, i) => (
                      <div key={i} className="flex gap-2.5">
                        <input
                          className="flex-1 bg-black/40 border border-zinc-800 rounded-xl text-white text-sm px-4 py-2.5 outline-none font-mono focus:border-indigo-500/60 transition-colors"
                          placeholder="KEY (e.g. VITE_API_URL)"
                          value={v.key}
                          onChange={(e) => updateEnvVar(i, e.target.value, v.value)}
                          onPaste={(e) => handlePasteEnv(e, i)}
                        />
                        <input
                          className="flex-1 bg-black/40 border border-zinc-800 rounded-xl text-white text-sm px-4 py-2.5 outline-none font-mono focus:border-indigo-500/60 transition-colors"
                          placeholder="VALUE"
                          value={v.value}
                          onChange={(e) => updateEnvVar(i, v.key, e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={() => removeEnvVar(i)}
                          className="bg-zinc-900 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 border border-zinc-800 rounded-xl px-3 transition-colors cursor-pointer"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={addEnvVar}
                        className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 text-xs font-semibold px-3.5 py-2 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Plus size={14} /> Add Variable
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm font-medium flex items-center gap-2">
                  <AlertCircle size={18} /> {error}
                </div>
              )}

              {/* Deploy Button */}
              <button
                type="button"
                onClick={handleDeployClick}
                disabled={deploying}
                className="w-full bg-white hover:bg-zinc-200 text-black font-bold text-base py-4 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {deploying ? (
                  <>
                    <Loader2 className="animate-spin" size={20} /> Deploying Project...
                  </>
                ) : (
                  "Deploy"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
