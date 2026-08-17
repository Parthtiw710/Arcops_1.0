import React, { useState } from "react";
import {
  Database,
  Cpu,
  Server,
  Zap,
  ShieldCheck,
  Activity,
  Layers,
  ArrowRight,
  CheckCircle2,
  Terminal,
  Copy,
  Check,
  Clock,
  Radio,
  MessageSquare,
  KeyRound,
  BarChart3,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

export function DBMuxPage() {
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(id);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  return (
    <div className="min-h-screen bg-[#060608] text-[#e8e8f0] relative overflow-hidden">
      {/* Ambient Mesh Background */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% 10%, rgba(168, 85, 247, 0.12) 0%, transparent 70%), radial-gradient(ellipse 60% 40% at 20% 80%, rgba(56, 189, 248, 0.08) 0%, transparent 60%)",
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-10 space-y-14">
        {/* ─── 1. HERO HEADER ─── */}
        <section className="text-center max-w-3xl mx-auto space-y-6 pt-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-purple-500/40 bg-purple-500/10 text-sm font-semibold text-purple-300">
            <Cpu className="size-4" />
            <span>High-Performance Database Multiplexer & Proxy</span>
          </div>

          <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight leading-tight text-white">
            Multiplex Thousands of DB Connections Into One.
          </h1>

          <p className="text-xl text-zinc-400 leading-relaxed">
            DBMux combines multiple database pools (PostgreSQL, MySQL, Redis, MongoDB) into a single zero-overhead multiplexed channel, slashing connection exhaustion and latency.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <a
              href="https://github.com/parthtiw710/dbmux"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-base font-bold text-white transition-all shadow-lg"
              style={{ background: "linear-gradient(135deg, #a855f7, #7c3aed)", boxShadow: "0 4px 24px rgba(168,85,247,0.35)" }}
            >
              <GithubIcon className="size-5" /> GitHub
            </a>
            <a
              href="https://github.com/parthtiw710/dbmux/blob/main/skills.md"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-base font-semibold bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white transition-all"
            >
              <BookOpen className="size-5" /> Documentation
            </a>

            <div
              onClick={() => handleCopy("dbmux --config config.yaml", "hero-cli")}
              className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-black/80 border border-zinc-800 font-mono text-sm text-purple-300 cursor-pointer hover:border-purple-500/40 transition-colors"
            >
              <span>dbmux --config config.yaml</span>
              {copiedCmd === "hero-cli" ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4 text-zinc-500" />}
            </div>
          </div>
        </section>

        {/* ─── 2. MULTIPLEXER ENGINE ANIMATED CANVAS ─── */}
        <section className="p-6 sm:p-10 rounded-3xl border border-purple-500/30 bg-gradient-to-b from-purple-950/20 via-zinc-950/80 to-black relative shadow-2xl overflow-hidden">
          <div className="mb-6 pb-3 border-b border-zinc-800 flex items-center justify-between">
            <div>
              <div className="text-xs font-mono text-purple-400 uppercase tracking-widest font-bold">
                DBMUX MULTIPLEXER ENGINE
              </div>
              <h2 className="text-2xl font-bold text-white mt-1">Live Connection Merging & ConnectRPC Streaming</h2>
            </div>
            <span className="text-xs font-mono bg-purple-500/10 border border-purple-500/30 text-purple-300 px-3 py-1 rounded-full font-semibold">
              gRPC & ConnectRPC Native
            </span>
          </div>

          <svg
            viewBox="0 0 900 640"
            className="w-full h-auto"
            fill="none"
          >
            <defs>
              <linearGradient id="beam-pg" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#38bdf8" stopOpacity="0.85"/><stop offset="100%" stopColor="#7c6dfa" stopOpacity="0.9"/></linearGradient>
              <linearGradient id="beam-mysql" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#06b6d4" stopOpacity="0.85"/><stop offset="100%" stopColor="#7c6dfa" stopOpacity="0.9"/></linearGradient>
              <linearGradient id="beam-sqlite" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#f59e0b" stopOpacity="0.85"/><stop offset="100%" stopColor="#7c6dfa" stopOpacity="0.9"/></linearGradient>
              <linearGradient id="beam-vector" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#d946ef" stopOpacity="0.85"/><stop offset="100%" stopColor="#7c6dfa" stopOpacity="0.9"/></linearGradient>
              <linearGradient id="beam-redis" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#f43f5e" stopOpacity="0.85"/><stop offset="100%" stopColor="#7c6dfa" stopOpacity="0.9"/></linearGradient>
              <linearGradient id="beam-mongo" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#10b981" stopOpacity="0.85"/><stop offset="100%" stopColor="#7c6dfa" stopOpacity="0.9"/></linearGradient>
              <linearGradient id="beam-bundle" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#a855f7"/><stop offset="50%" stopColor="#ec4899"/><stop offset="100%" stopColor="#3b82f6"/></linearGradient>
              <linearGradient id="beam-crpc" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#a855f7"/><stop offset="100%" stopColor="#f59e0b"/></linearGradient>
            </defs>

            {/* TOP FEATURE CONNECTOR LINES */}
            <path d="M 235 48 C 235 135, 450 135, 450 210" stroke="#38bdf8" strokeWidth="1" strokeDasharray="5 5" opacity="0.25"/>
            <path d="M 470 48 C 470 140, 450 140, 450 210" stroke="#d946ef" strokeWidth="1" strokeDasharray="5 5" opacity="0.25"/>
            <path d="M 782 48 C 782 135, 530 135, 450 210" stroke="#10b981" strokeWidth="1" strokeDasharray="5 5" opacity="0.25"/>

            {/* TOP FEATURE PILLS */}
            <rect x="140" y="6" width="190" height="42" rx="21" fill="rgba(14,165,233,0.09)" stroke="rgba(14,165,233,0.38)" strokeWidth="1"/>
            <circle cx="175" cy="27" r="9" fill="none" stroke="#38bdf8" strokeWidth="1.8"/>
            <polyline points="175,20 175,27 179,30" fill="none" stroke="#38bdf8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <text x="192" y="32" fill="#7dd3fc" fontSize="13" fontWeight="600" fontFamily="system-ui,sans-serif">Cron Scheduler</text>

            <rect x="405" y="6" width="130" height="42" rx="21" fill="rgba(217,70,239,0.09)" stroke="rgba(217,70,239,0.38)" strokeWidth="1"/>
            <circle cx="441" cy="27" r="2.5" fill="#e879f9"/>
            <path d="M446.5 21.5a8 8 0 0 1 0 11.3" fill="none" stroke="#e879f9" strokeWidth="1.8" strokeLinecap="round"/>
            <path d="M435.5 21.5a8 8 0 0 0 0 11.3" fill="none" stroke="#e879f9" strokeWidth="1.8" strokeLinecap="round"/>
            <text x="453" y="32" fill="#f0abfc" fontSize="13" fontWeight="600" fontFamily="system-ui,sans-serif">Pub / Sub</text>

            <rect x="695" y="6" width="184" height="42" rx="21" fill="rgba(16,185,129,0.09)" stroke="rgba(16,185,129,0.38)" strokeWidth="1"/>
            <rect x="722" y="18" width="18" height="14" rx="3" fill="none" stroke="#34d399" strokeWidth="1.8"/>
            <polyline points="722,29 719,35 727,32" fill="none" stroke="#34d399" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <text x="745" y="32" fill="#6ee7b7" fontSize="13" fontWeight="600" fontFamily="system-ui,sans-serif">Message Queue</text>

            {/* INCOMING BEAMS */}
            {[
              { y: 123, grad: "beam-pg",     speed: "1.5s" },
              { y: 197, grad: "beam-mysql",  speed: "1.2s" },
              { y: 271, grad: "beam-sqlite", speed: "1.6s" },
              { y: 345, grad: "beam-vector", speed: "1.1s" },
              { y: 419, grad: "beam-redis",  speed: "1.8s" },
              { y: 493, grad: "beam-mongo",  speed: "1.4s" },
            ].map(({ y, grad, speed }) => (
              <path
                key={grad}
                d={`M 178 ${y} C 280 ${y}, 320 310, 345 310`}
                stroke={`url(#${grad})`}
                strokeWidth="3.5"
                strokeDasharray="9 5"
                style={{ animation: `dash ${speed} linear infinite` }}
              />
            ))}

            {/* BUNDLED TRUNK */}
            <path
              d="M 345 310 L 555 310"
              stroke="url(#beam-bundle)"
              strokeWidth="14"
              strokeLinecap="round"
              style={{ filter: "drop-shadow(0 0 16px rgba(168,85,247,0.95))" }}
            />

            {/* OUTGOING BEAMS */}
            {[
              { y: 181, grad: "beam-bundle", speed: "1.0s", w: "3", da: "7 4" },
              { y: 267, grad: "beam-bundle", speed: "1.3s", w: "3", da: "7 4" },
              { y: 353, grad: "beam-crpc",   speed: "0.8s", w: "4", da: "5 2" },
              { y: 439, grad: "beam-bundle", speed: "1.1s", w: "3", da: "7 4" },
            ].map(({ y, grad, speed, w, da }) => (
              <path
                key={`r-${y}`}
                d={`M 555 310 C 630 310, 660 ${y}, 722 ${y}`}
                stroke={`url(#${grad})`}
                strokeWidth={w}
                strokeDasharray={da}
                style={{
                  animation: `dash ${speed} linear infinite`,
                  filter: grad === "beam-crpc" ? "drop-shadow(0 0 10px rgba(245,158,11,0.7))" : undefined,
                }}
              />
            ))}

            {/* LEFT NODE CARDS */}
            {([
              { y: 90,  label: "PostgreSQL",      sub: "Connection Pool",   border: "#38bdf8", iconColor: "#38bdf8" },
              { y: 164, label: "MySQL",           sub: "Connection Pool",   border: "#06b6d4", iconColor: "#06b6d4" },
              { y: 238, label: "SQLite / LibSQL", sub: "Embedded / Remote",  border: "#f59e0b", iconColor: "#f59e0b" },
              { y: 312, label: "Vector DB",       sub: "Qdrant / Pgvector", border: "#d946ef", iconColor: "#d946ef" },
              { y: 386, label: "Redis Cache",     sub: "Cache & Pub/Sub",   border: "#f43f5e", iconColor: "#f43f5e" },
              { y: 460, label: "MongoDB",         sub: "Document Proxy",    border: "#10b981", iconColor: "#10b981" },
            ] as const).map(({ y, label, sub, border, iconColor }) => (
              <foreignObject key={label} x="0" y={y} width="178" height="66">
                <div style={{
                  display: "flex", alignItems: "center", gap: "10px",
                  padding: "8px 12px", borderRadius: "12px",
                  border: `1px solid ${border}45`,
                  background: "rgba(9,9,11,0.93)",
                  height: "66px", boxSizing: "border-box",
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>
                    <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/>
                  </svg>
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: "700", color: "#f4f4f5", lineHeight: "1.2" }}>{label}</div>
                    <div style={{ fontSize: "11px", fontFamily: "monospace", color: "#71717a", marginTop: "2px" }}>{sub}</div>
                  </div>
                </div>
              </foreignObject>
            ))}

            {/* CENTER ENGINE CARD */}
            <foreignObject x="345" y="210" width="210" height="200">
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                padding: "20px 16px", borderRadius: "18px",
                border: "2px solid #a855f7",
                background: "linear-gradient(to bottom, rgba(88,28,135,0.38), rgba(0,0,0,0.96))",
                boxShadow: "0 0 48px rgba(168,85,247,0.5)",
                textAlign: "center", height: "200px", boxSizing: "border-box",
              }}>
                <div style={{
                  width: "50px", height: "50px", borderRadius: "14px",
                  background: "rgba(168,85,247,0.2)", border: "1px solid rgba(192,132,252,0.4)",
                  display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "12px",
                }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#c084fc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2M15 20v2M2 15h2M20 15h2M2 9h2M20 9h2M9 2v2M9 20v2"/>
                  </svg>
                </div>
                <div style={{ fontSize: "15px", fontWeight: "700", color: "#fff", letterSpacing: "0.02em" }}>DBMux Core Engine</div>
                <div style={{ fontSize: "12px", fontFamily: "monospace", color: "#c084fc", marginTop: "5px" }}>Multiplexed Socket Pipe</div>
                <div style={{
                  marginTop: "12px", padding: "4px 12px", borderRadius: "999px",
                  background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.4)",
                  fontSize: "11px", fontWeight: "700", color: "#fcd34d",
                }}>
                  ConnectRPC (gRPC) Stream
                </div>
              </div>
            </foreignObject>

            {/* RIGHT NODE CARDS */}
            {([
              { y: 148, label: "gRPC-Web Clients",   sub: "Browser & App SDKs", border: "#a855f7", iconColor: "#a855f7", type: "web" },
              { y: 234, label: "Microservices",      sub: "Pooled Socket Pipe", border: "#a855f7", iconColor: "#a855f7", type: "server" },
              { y: 320, label: "ConnectRPC Stream",  sub: "Live Event Stream",  border: "#f59e0b", iconColor: "#f59e0b", type: "stream" },
              { y: 406, label: "Serverless & Edge", sub: "Zero Pool Exhaustion", border: "#a855f7", iconColor: "#a855f7", type: "activity" },
            ] as const).map(({ y, label, sub, border, iconColor, type }) => (
              <foreignObject key={label} x="722" y={y} width="178" height="66">
                <div style={{
                  display: "flex", alignItems: "center", gap: "10px",
                  padding: "8px 12px", borderRadius: "12px",
                  border: `1px solid ${border}60`,
                  background: type === "stream"
                    ? "linear-gradient(to right, rgba(120,53,15,0.45), rgba(9,9,11,0.96))"
                    : "rgba(12,12,16,0.96)",
                  height: "66px", boxSizing: "border-box",
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>
                    {type === "web"      && <><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></>}
                    {type === "server"   && <><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></>}
                    {type === "stream"   && <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></>}
                    {type === "activity" && <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></>}
                  </svg>
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: "700", color: type === "stream" ? "#fcd34d" : "#ffffff", lineHeight: "1.2" }}>{label}</div>
                    <div style={{ fontSize: "11px", fontFamily: "monospace", color: type === "stream" ? "#fbbf24" : "#a1a1aa", marginTop: "2px", fontWeight: "600" }}>{sub}</div>
                  </div>
                </div>
              </foreignObject>
            ))}

            {/* BOTTOM FEATURE CONNECTOR LINES */}
            <path d="M 230 596 C 230 508, 450 508, 450 410" stroke="#f43f5e" strokeWidth="1" strokeDasharray="5 5" opacity="0.25"/>
            <path d="M 686 596 C 686 508, 450 508, 450 410" stroke="#f97316" strokeWidth="1" strokeDasharray="5 5" opacity="0.25"/>

            {/* BOTTOM FEATURE PILLS */}
            <rect x="140" y="594" width="178" height="42" rx="21" fill="rgba(244,63,94,0.09)" stroke="rgba(244,63,94,0.38)" strokeWidth="1"/>
            <circle cx="170" cy="612" r="5" fill="none" stroke="#fb7185" strokeWidth="1.8"/>
            <line x1="175" y1="617" x2="185" y2="617" stroke="#fb7185" strokeWidth="1.8" strokeLinecap="round"/>
            <line x1="183" y1="617" x2="183" y2="620" stroke="#fb7185" strokeWidth="1.8" strokeLinecap="round"/>
            <text x="193" y="619" fill="#fda4af" fontSize="13" fontWeight="600" fontFamily="system-ui,sans-serif">Secrets API</text>

            <rect x="597" y="594" width="164" height="42" rx="21" fill="rgba(249,115,22,0.09)" stroke="rgba(249,115,22,0.38)" strokeWidth="1"/>
            <line x1="627" y1="622" x2="627" y2="614" stroke="#fb923c" strokeWidth="2" strokeLinecap="round"/>
            <line x1="633" y1="622" x2="633" y2="608" stroke="#fb923c" strokeWidth="2" strokeLinecap="round"/>
            <line x1="639" y1="622" x2="639" y2="616" stroke="#fb923c" strokeWidth="2" strokeLinecap="round"/>
            <text x="648" y="619" fill="#fdba74" fontSize="13" fontWeight="600" fontFamily="system-ui,sans-serif">OpenTelemetry</text>
          </svg>

          {/* STATS BAR BELOW ENGINE */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8 pt-6 border-t border-zinc-800 text-center font-mono">
            <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/20">
              <div className="text-xs text-purple-300/70 uppercase">Pooled Connections</div>
              <div className="text-2xl font-extrabold text-purple-300 mt-1">Dynamic Pool</div>
            </div>
            <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
              <div className="text-xs text-emerald-400/70 uppercase">Upstream Sockets</div>
              <div className="text-2xl font-extrabold text-emerald-400 mt-1">Multiplexed</div>
            </div>
            <div className="p-3 rounded-xl bg-sky-500/5 border border-sky-500/20">
              <div className="text-xs text-sky-400/70 uppercase">Latency Overhead</div>
              <div className="text-2xl font-extrabold text-sky-400 mt-1">Sub-Millisecond</div>
            </div>
            <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
              <div className="text-xs text-amber-300/70 uppercase">Memory Footprint</div>
              <div className="text-2xl font-extrabold text-amber-300 mt-1">Lightweight Go</div>
            </div>
          </div>
        </section>

        {/* ─── 3. CORE ENGINE FEATURES GRID ─── */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-xs font-mono text-zinc-500 uppercase tracking-widest">
            <span className="w-4 h-px bg-zinc-700" />
            Core Engine Capabilities
            <span className="flex-1 h-px bg-zinc-700/50" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-950/80 hover:border-purple-500/40 transition-colors shadow-lg">
              <div className="size-11 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center mb-4 text-purple-400">
                <Zap className="size-6" />
              </div>
              <h3 className="text-lg font-bold mb-2 text-white">Multiplexing & Pooling</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Multiplex hundreds of client queries over one persistent TCP connection — zero connection leaks.
              </p>
            </div>

            <div className="p-6 rounded-2xl border border-amber-500/30 bg-gradient-to-b from-amber-950/20 to-zinc-950/80 hover:border-amber-400/50 transition-colors shadow-lg">
              <div className="size-11 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-4 text-amber-400">
                <Activity className="size-6" />
              </div>
              <h3 className="text-lg font-bold mb-2 text-amber-300">ConnectRPC & gRPC Stream</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Native server-streaming (<code className="text-amber-300 font-mono text-xs">stream SubscribeEvent</code>). Zero-config, lightweight vs google/grpc.
              </p>
            </div>

            <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-950/80 hover:border-purple-500/40 transition-colors shadow-lg">
              <div className="size-11 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center mb-4 text-purple-400">
                <ShieldCheck className="size-6" />
              </div>
              <h3 className="text-lg font-bold mb-2 text-white">Dynamic Lease Management</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Ephemeral connection leases for edge workers with TTL expiry and automatic secret revocation.
              </p>
            </div>

            <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-950/80 hover:border-purple-500/40 transition-colors shadow-lg">
              <div className="size-11 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center mb-4 text-purple-400">
                <Database className="size-6" />
              </div>
              <h3 className="text-lg font-bold mb-2 text-white">Query Health Metrics</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Real-time telemetry and query profiling — no database plugins or agent overhead required.
              </p>
            </div>
          </div>
        </section>

        {/* ─── 4. QUICK LAUNCH & MANIFEST CARD ─── */}
        <section className="p-8 rounded-3xl border border-purple-500/30 bg-gradient-to-r from-purple-950/30 via-zinc-950 to-zinc-950 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-2xl">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-purple-300 uppercase tracking-wider mb-2 font-bold">
              <Cpu className="size-4" /> Self-Host Deployment Manifest
            </div>
            <h3 className="text-2xl font-extrabold text-white mb-1">Launch DBMux Proxy Service</h3>
            <p className="text-sm text-zinc-400">Deploy DBMux via official <code className="text-purple-300 font-mono">skills.md</code> configuration manifest.</p>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="https://github.com/parthtiw710/dbmux/blob/main/skills.md"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-base font-bold transition-all shadow-lg shadow-purple-600/30 cursor-pointer"
            >
              <Terminal className="size-5" />
              <span>View skills.md Guide</span>
              <ArrowRight className="size-4" />
            </a>
          </div>
        </section>
      </div>

      {/* Inline Animation keyframes for SVG dash motion */}
      <style>{`
        @keyframes dash {
          to {
            stroke-dashoffset: -24;
          }
        }
      `}</style>
    </div>
  );
}
