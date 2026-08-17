import React, { useState } from "react";
import {
  HardDrive,
  Check,
  Copy,
  Download,
  BookOpen,
  ArrowRight,
  Zap,
  Globe,
  Database,
  Cloud,
  Server,
  Box,
  Code2,
  Terminal,
  Cpu,
  Layers,
  ShieldCheck,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

export function BuckStreamPage() {
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(id);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  const downloadWorkflow = () => {
    const yaml = `name: Deploy to BuckStream
on:
  push:
    branches: [main]
jobs:
  deploy:
    name: Build & Deploy Static Site
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
      - run: npm ci && npm run build
      - run: cd dist && zip -r ../site.zip . && cd ..
      - name: Upload to BuckStream Broker
        run: |
          curl -X POST https://broker.yourdomain.com/api/deploy \\
            -F "file=@site.zip" \\
            -F "name=my-app"
`;
    const blob = new Blob([yaml], { type: "text/yaml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "deploy-buckstream.yml";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="min-h-screen bg-[#030508] text-[#e8e8f0] relative overflow-hidden">
      {/* Sky/teal ambient glow background */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 0% 80%, rgba(14,165,233,0.12) 0%, transparent 60%), radial-gradient(ellipse 50% 40% at 90% 15%, rgba(6,182,212,0.07) 0%, transparent 65%)",
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-10 space-y-12">
        {/* ─── 1. HERO SECTION ─── */}
        <section className="pt-6 pb-2 grid lg:grid-cols-2 gap-10 items-center">
          {/* Left — Headline & Action Buttons */}
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#0ea5e9]/40 bg-[#0ea5e9]/10 text-sm font-semibold text-[#38bdf8]">
              <HardDrive className="size-4" />
              <span>Private S3 & Static Site Broker</span>
            </div>

            <h1 className="text-5xl sm:text-6xl xl:text-7xl font-extrabold leading-[1.05] tracking-tight text-white">
              Buckets without{" "}
              <span className="bg-gradient-to-r from-[#0ea5e9] via-[#38bdf8] to-[#06b6d4] bg-clip-text text-transparent">
                borders.
              </span>
            </h1>

            <p className="text-lg text-zinc-400 leading-relaxed max-w-lg">
              Deploy static sites to instant wildcard subdomains and stream raw assets directly from private S3, GCS, or MinIO buckets. Zero IAM exposure, RAM caching, and zero config.
            </p>

            <div className="flex flex-wrap gap-3">
              <a
                href="https://github.com/Parthtiw710/buckstream"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-base font-bold text-white transition-all shadow-lg"
                style={{ background: "linear-gradient(135deg, #0ea5e9, #0284c7)", boxShadow: "0 4px 24px rgba(14,165,233,0.35)" }}
              >
                <GithubIcon className="size-5" /> GitHub
              </a>
              <a
                href="https://github.com/Parthtiw710/buckstream/blob/main/README.md"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-base font-semibold bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white transition-all"
              >
                <BookOpen className="size-5" /> Docs
              </a>
            </div>

            <div
              onClick={() => handleCopy('curl -X POST https://broker.yourdomain.com/api/deploy -F "file=@dist.zip"', "hero-curl")}
              className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-black/60 border border-zinc-800 font-mono text-sm text-[#38bdf8] cursor-pointer hover:border-[#0ea5e9]/40 transition-colors w-fit"
            >
              <span>curl .../api/deploy -F "file=@dist.zip"</span>
              {copiedCmd === "hero-curl" ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5 text-zinc-500" />}
            </div>
          </div>

          {/* Right — 2x2 Metric Cards */}
          <div className="grid grid-cols-2 gap-4">
            {[
              { val: "Sub-ms", label: "RAM Latency", sub: "In-Memory Stream", color: "#0ea5e9" },
              { val: "100%", label: "IAM Isolation", sub: "Private S3 Keys", color: "#06b6d4" },
              { val: "*.domain", label: "Wildcard Subdomain", sub: "Instant DNS Route", color: "#38bdf8" },
              { val: "Zero", label: "Egress Fees", sub: "Self-Hosted Broker", color: "#7dd3fc" },
            ].map((s) => (
              <div
                key={s.label}
                className="p-5 rounded-2xl border bg-[#05080f] flex flex-col justify-between hover:border-[#0ea5e9]/40 transition-all"
                style={{ borderColor: `${s.color}25` }}
              >
                <div className="text-4xl font-extrabold font-mono mb-2" style={{ color: s.color }}>
                  {s.val}
                </div>
                <div>
                  <div className="text-base font-bold text-white">{s.label}</div>
                  <div className="text-xs text-zinc-500 mt-0.5 font-mono">{s.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ─── 2. CONCISE CORE CAPABILITIES ─── */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Card A: Wildcard Subdomain Static Hosting */}
          <div className="p-6 rounded-2xl border border-[#0ea5e9]/30 bg-gradient-to-b from-[#0ea5e9]/10 via-[#05080f] to-black space-y-4 shadow-xl relative overflow-hidden">
            <div className="flex items-center justify-between pb-2.5 border-b border-zinc-800/80">
              <div className="flex items-center gap-2">
                <Globe className="size-5 text-[#38bdf8]" />
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#38bdf8]">STATIC HOSTING</span>
              </div>
              <span className="px-2.5 py-1 rounded text-xs font-mono font-semibold bg-sky-500/10 border border-sky-500/30 text-sky-400">
                POST /api/deploy
              </span>
            </div>

            <h3 className="text-2xl font-bold text-white">Instant Wildcard Subdomain Hosting</h3>
            <p className="text-sm text-zinc-300 leading-relaxed">
              Upload static ZIP archives directly into RAM/disk cache. Instantly provisions routes like <code className="text-[#38bdf8] font-bold">my-site.yourdomain.com</code>.
            </p>

            <div className="bg-black/90 border border-zinc-800 rounded-xl p-3.5 font-mono text-sm text-zinc-200 space-y-1.5">
              <div className="text-[#38bdf8] font-semibold">cd dist && zip -r ../site.zip .</div>
              <div className="text-emerald-400 font-semibold">curl -X POST .../api/deploy -F "file=@site.zip" -F "name=dashboard"</div>
              <div className="text-zinc-400 text-xs">// Live site: https://dashboard.yourdomain.com</div>
            </div>
          </div>

          {/* Card B: Private S3 Object Streaming Proxy */}
          <div className="p-6 rounded-2xl border border-[#06b6d4]/30 bg-gradient-to-b from-[#06b6d4]/10 via-[#05080f] to-black space-y-4 shadow-xl relative overflow-hidden">
            <div className="flex items-center justify-between pb-2.5 border-b border-zinc-800/80">
              <div className="flex items-center gap-2">
                <Server className="size-5 text-[#06b6d4]" />
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#06b6d4]">S3 ASSET PROXY</span>
              </div>
              <span className="px-2.5 py-1 rounded text-xs font-mono font-semibold bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                GET /api/download
              </span>
            </div>

            <h3 className="text-2xl font-bold text-white">Private S3 Asset Proxy & Range Streaming</h3>
            <p className="text-sm text-zinc-300 leading-relaxed">
              Stream assets from AWS S3, MinIO, or GCS through a Go proxy layer with HTTP Range support. IAM secrets stay 100% hidden inside broker memory.
            </p>

            <div className="bg-black/90 border border-zinc-800 rounded-xl p-3.5 font-mono text-sm text-zinc-200 space-y-1.5">
              <div className="text-[#06b6d4] font-semibold">POST /api/upload -F "file=@video.mp4"</div>
              <div className="text-emerald-400 font-semibold">GET /api/download?key=uploads/video.mp4</div>
              <div className="text-zinc-400 text-xs">// Zero credentials exposed over client connection</div>
            </div>
          </div>
        </section>

        {/* ─── 3. HIGH-DENSITY ENDPOINT REFERENCE GRID WITH BIGGER FONTS ─── */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Object Storage Functions */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2 text-base font-bold text-white">
                <HardDrive className="size-5 text-[#38bdf8]" />
                <span>Object Storage Functions</span>
              </div>
              <span className="px-2.5 py-0.5 rounded text-xs font-mono bg-[#0ea5e9]/10 text-[#38bdf8] border border-[#0ea5e9]/30 font-semibold">
                SDK Methods
              </span>
            </div>

            <div className="space-y-2.5 font-mono">
              {[
                { name: "client.Upload(file, key)", action: "Upload", color: "#34d399", bg: "bg-emerald-500/20", desc: "Streams file content to S3 under uploads/ prefix." },
                { name: "client.List()", action: "List", color: "#38bdf8", bg: "bg-sky-500/20", desc: "Lists all stored objects with authenticated broker token." },
                { name: "client.Download(key)", action: "Download", color: "#06b6d4", bg: "bg-cyan-500/20", desc: "Streams binary object with Range headers & RAM caching." },
                { name: "client.Delete(key)", action: "Delete", color: "#f43f5e", bg: "bg-rose-500/20", desc: "Removes object from S3 bucket and clears RAM cache." },
              ].map((fn) => (
                <div key={fn.name} className="px-3.5 py-2.5 rounded-xl border border-zinc-800/80 bg-black/60 flex items-center justify-between gap-4 hover:border-zinc-700 transition-colors">
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${fn.bg}`} style={{ color: fn.color }}>
                      {fn.action}
                    </span>
                    <span className="text-white font-bold text-sm">{fn.name}</span>
                  </div>
                  <span className="text-xs font-sans text-zinc-300 font-medium truncate">{fn.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Deployment Engine Endpoints */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2 text-base font-bold text-white">
                <Globe className="size-5 text-[#06b6d4]" />
                <span>Wildcard Deployment Engine</span>
              </div>
              <span className="px-2.5 py-0.5 rounded text-xs font-mono bg-zinc-800 text-zinc-300 border border-zinc-700 font-semibold">
                POST · GET · DELETE
              </span>
            </div>

            <div className="space-y-2.5 font-mono">
              {[
                { method: "POST", color: "#34d399", bg: "bg-emerald-500/20", route: "/api/deploy", desc: "Upload ZIP archive to RAM cache → site.yourdomain.com." },
                { method: "GET", color: "#38bdf8", bg: "bg-sky-500/20", route: "/api/deploy/list", desc: "Returns array of all active deployed subdomains." },
                { method: "DELETE", color: "#f43f5e", bg: "bg-rose-500/20", route: "/api/deploy/delete?name=...", desc: "Destroys site deployment and clears RAM cache instantly." },
              ].map((api) => (
                <div key={api.route} className="px-3.5 py-2.5 rounded-xl border border-zinc-800/80 bg-black/60 flex items-center justify-between gap-4 hover:border-zinc-700 transition-colors">
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${api.bg}`} style={{ color: api.color }}>
                      {api.method}
                    </span>
                    <span className="text-white font-bold text-sm">{api.route}</span>
                  </div>
                  <span className="text-xs font-sans text-zinc-300 font-medium truncate">{api.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── 4. CI/CD & CLIENT SDK SECTION WITH LARGER FONTS ─── */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* GitHub Action */}
          <div className="p-6 sm:p-8 rounded-3xl border border-[#0ea5e9]/30 bg-gradient-to-br from-[#0ea5e9]/10 to-cyan-500/5 space-y-4 shadow-xl">
            <div className="text-xs font-bold tracking-widest text-[#38bdf8] uppercase font-mono">CI/CD AUTOMATION</div>
            <h3 className="text-2xl font-bold text-white">Push to Deploy GitHub Action</h3>
            <p className="text-zinc-300 text-sm leading-relaxed">
              Every push to <code className="text-[#38bdf8] font-bold">main</code> builds, zips, and deploys your static output directly to BuckStream.
            </p>
            <Button
              onClick={downloadWorkflow}
              size="sm"
              className="bg-gradient-to-r from-[#0ea5e9] to-[#0284c7] text-white hover:opacity-90 flex items-center gap-2 font-bold cursor-pointer text-xs py-2.5 px-4"
            >
              <Download className="size-4" />
              <span>Download deploy-buckstream.yml</span>
            </Button>
          </div>

          {/* Client SDK Install Commands */}
          <div className="p-6 sm:p-8 rounded-3xl border border-zinc-800 bg-zinc-950/80 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2 text-base font-bold text-white">
                <Code2 className="size-5 text-[#38bdf8]" />
                <span>Client SDK Packages</span>
              </div>
              <span className="text-xs font-mono text-zinc-300 font-semibold">npm / pip</span>
            </div>

            <div className="space-y-3 pt-1">
              <div
                onClick={() => handleCopy("npm install buckstream-client", "sdk-npm")}
                className="flex items-center justify-between px-4 py-3 rounded-xl bg-black/90 border border-zinc-800 font-mono text-sm text-[#38bdf8] cursor-pointer hover:border-zinc-700 transition-colors font-bold"
              >
                <span>npm install buckstream-client</span>
                {copiedCmd === "sdk-npm" ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4 text-zinc-500" />}
              </div>

              <div
                onClick={() => handleCopy("pip install buckstream-client", "sdk-pip")}
                className="flex items-center justify-between px-4 py-3 rounded-xl bg-black/90 border border-zinc-800 font-mono text-sm text-[#06b6d4] cursor-pointer hover:border-zinc-700 transition-colors font-bold"
              >
                <span>pip install buckstream-client</span>
                {copiedCmd === "sdk-pip" ? <Check className="size-4 text-emerald-400" /> : <Copy size={4} className="text-zinc-500" />}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
