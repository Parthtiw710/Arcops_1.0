import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Database,
  HardDrive,
  ShieldCheck,
  Zap,
  ArrowRight,
  Terminal,
  Cpu,
  Layers,
  Code2,
  CheckCircle2,
  Sparkles,
  Lock,
  Globe,
  ChevronRight,
  Boxes,
} from "lucide-react";

export function LandingPage() {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeTab, setActiveTab] = useState<"dbmux" | "buckstream" | "arcauth" | "frontedge">("dbmux");

  useEffect(() => {
    const token = localStorage.getItem("arcauth_token") || localStorage.getItem("authx_token");
    setIsLoggedIn(!!token);
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-white flex flex-col font-sans selection:bg-purple-500 selection:text-white relative overflow-hidden">
      {/* Background Glow Orbs */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-gradient-to-b from-purple-600/15 via-indigo-600/10 to-transparent blur-[120px] pointer-events-none rounded-full" />
      <div className="absolute top-[800px] -right-40 w-[600px] h-[600px] bg-emerald-600/10 blur-[150px] pointer-events-none rounded-full" />

      {/* Main Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center max-w-7xl mx-auto px-6 pt-24 md:pt-32 pb-24 relative z-10 text-center">
        {/* Hero Title */}
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold tracking-tight max-w-5xl leading-[1.1] text-white">
          Build Your Frontend. <span className="bg-gradient-to-r from-purple-400 via-indigo-300 to-emerald-400 bg-clip-text text-transparent">We Handle Everything Else.</span>
        </h1>

        {/* Subtitle */}
        <p className="mt-6 text-base md:text-lg text-neutral-400 max-w-2xl leading-relaxed font-normal">
          High-performance, lightweight backend APIs for all your core tasks paired with an instant frontend deployer featuring unlimited bandwidth — unified under a single API gateway.
        </p>

        {/* CTA Buttons */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            to={isLoggedIn ? "/dashboard" : "/login"}
            className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 hover:opacity-95 text-white font-semibold text-sm shadow-[0_0_30px_rgba(168,85,247,0.4)] transition-all flex items-center gap-2.5"
          >
            {isLoggedIn ? "Open Workspace Dashboard" : "Start Building for Free"}
            <ArrowRight className="size-4" />
          </Link>
          <a
            href="#products"
            className="px-6 py-3.5 rounded-xl border border-neutral-800 bg-[#121215] hover:bg-neutral-800/80 text-neutral-300 font-medium text-sm transition-all flex items-center gap-2"
          >
            Explore Products
          </a>
        </div>

        {/* Hero Interactive Code / Product Architecture Showcase */}
        <div className="mt-16 w-full max-w-5xl rounded-2xl border border-neutral-800/80 bg-[#121215]/90 p-4 md:p-6 shadow-2xl backdrop-blur-xl relative overflow-hidden text-left">
          <div className="flex items-center justify-between border-b border-neutral-800/80 pb-4 mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className="size-3 rounded-full bg-red-500/80" />
              <div className="size-3 rounded-full bg-yellow-500/80" />
              <div className="size-3 rounded-full bg-green-500/80" />
              <span className="text-xs font-mono text-neutral-400 ml-2">arcops-architecture.ts</span>
            </div>

            <div className="flex items-center gap-1 bg-[#18181b] p-1 rounded-lg border border-neutral-800 text-xs font-medium">
              <button
                type="button"
                onClick={() => setActiveTab("dbmux")}
                className={`px-3 py-1 rounded-md transition-all ${activeTab === "dbmux" ? "bg-purple-600 text-white font-semibold" : "text-neutral-400 hover:text-neutral-200"}`}
              >
                DBMux
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("buckstream")}
                className={`px-3 py-1 rounded-md transition-all ${activeTab === "buckstream" ? "bg-indigo-600 text-white font-semibold" : "text-neutral-400 hover:text-neutral-200"}`}
              >
                BuckStream
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("arcauth")}
                className={`px-3 py-1 rounded-md transition-all ${activeTab === "arcauth" ? "bg-emerald-600 text-white font-semibold" : "text-neutral-400 hover:text-neutral-200"}`}
              >
                ArcAuth
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("frontedge")}
                className={`px-3 py-1 rounded-md transition-all ${activeTab === "frontedge" ? "bg-blue-600 text-white font-semibold" : "text-neutral-400 hover:text-neutral-200"}`}
              >
                Frontedge
              </button>
            </div>
          </div>

          <pre className="font-mono text-xs md:text-sm text-neutral-300 overflow-x-auto p-4 rounded-xl bg-[#0a0a0c] border border-neutral-900 leading-relaxed">
            {activeTab === "dbmux" && (
              <code>
                <span className="text-purple-400">import</span> {"{"} DBMuxClient {"}"} <span className="text-purple-400">from</span> <span className="text-emerald-300">"@arcops/dbmux"</span>;{"\n\n"}
                <span className="text-neutral-500">// Connect through central DBMux gateway with tenant isolation</span>{"\n"}
                <span className="text-purple-400">const</span> db = <span className="text-purple-400">new</span> DBMuxClient({"{"} baseUrl: <span className="text-emerald-300">"http://localhost:8000/rpc"</span> {"}"});{"\n\n"}
                <span className="text-purple-400">const</span> result = <span className="text-purple-400">await</span> db.postgres.query({"{"}{"\n"}
                {"  "}sql: <span className="text-emerald-300">"SELECT * FROM telemetry_metrics ORDER BY created_at DESC;"</span>{"\n"}
                {"}"});{"\n"}
                <span className="text-neutral-500">// Result automatically routed to tenant DB db_user_&lt;tenant_id&gt; (~15ms)</span>
              </code>
            )}
            {activeTab === "buckstream" && (
              <code>
                <span className="text-purple-400">import</span> {"{"} BuckStreamClient {"}"} <span className="text-purple-400">from</span> <span className="text-emerald-300">"buckstream-client"</span>;{"\n\n"}
                <span className="text-neutral-500">// BuckStream S3 object broker with automatic tenant folder scoping</span>{"\n"}
                <span className="text-purple-400">const</span> storage = <span className="text-purple-400">new</span> BuckStreamClient(<span className="text-emerald-300">"http://localhost:8000/api/storage"</span>, userToken);{"\n\n"}
                <span className="text-purple-400">await</span> storage.Upload(fileObj, <span className="text-emerald-300">"avatar.png"</span>, <span className="text-emerald-300">"image/png"</span>);{"\n"}
                <span className="text-neutral-500">// S3 Key isolated under: uploads/&lt;tenant_id&gt;/avatar.png</span>
              </code>
            )}
            {activeTab === "arcauth" && (
              <code>
                <span className="text-purple-400">import</span> {"{"} ArcAuth {"}"} <span className="text-purple-400">from</span> <span className="text-emerald-300">"@arcops/auth"</span>;{"\n\n"}
                <span className="text-neutral-500">// Passwordless Email OTP & 1-Click OAuth identity engine</span>{"\n"}
                <span className="text-purple-400">const</span> auth = <span className="text-purple-400">new</span> ArcAuth({"{"} endpoint: <span className="text-emerald-300">"http://localhost:8000/api/auth"</span> {"}"});{"\n\n"}
                <span className="text-purple-400">await</span> auth.sendOTP({"{"} email: <span className="text-emerald-300">"user@company.com"</span> {"}"});{"\n"}
                <span className="text-purple-400">const</span> session = <span className="text-purple-400">await</span> auth.verifyOTP({"{"} code: <span className="text-emerald-300">"123456"</span> {"}"});{"\n"}
                <span className="text-neutral-500">// Returns signed multi-tenant JWT with tenant_id claims</span>
              </code>
            )}
            {activeTab === "frontedge" && (
              <code>
                <span className="text-purple-400">import</span> {"{"} FrontedgeDeployer {"}"} <span className="text-purple-400">from</span> <span className="text-emerald-300">"@arcops/frontedge"</span>;{"\n\n"}
                <span className="text-neutral-500">// Deploy web apps & AI code builder projects to the global edge</span>{"\n"}
                <span className="text-purple-400">const</span> deployment = <span className="text-purple-400">await</span> FrontedgeDeployer.deploy({"{"}{"\n"}
                {"  "}projectDir: <span className="text-emerald-300">"./dist"</span>,{"\n"}
                {"  "}domain: <span className="text-emerald-300">"my-app.frontedge.app"</span>,{"\n"}
                {"}"});{"\n"}
                <span className="text-neutral-500">// Instant global SSL edge routing & asset distribution</span>
              </code>
            )}
          </pre>
        </div>

        {/* Product Showcase Bento Grid */}
        <section id="products" className="mt-32 w-full text-left">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-white">
              Four Core Engines. <span className="text-purple-400">One Unified Stack.</span>
            </h2>
            <p className="mt-4 text-neutral-400 text-sm md:text-base">
              Engineered for developer experience, security, and multi-tenant scale out of the box.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 1. DBMux Card */}
            <div id="dbmux" className="rounded-2xl border border-neutral-800/80 bg-gradient-to-br from-[#121215] to-[#18181c] p-8 backdrop-blur-xl relative overflow-hidden group hover:border-purple-500/40 transition-all shadow-xl">
              <div className="absolute top-0 right-0 p-8 text-purple-500/10 group-hover:text-purple-500/20 transition-all">
                <Database className="size-24" />
              </div>
              <div className="inline-flex p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 mb-6">
                <Boxes className="size-6" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">DBMux</h3>
              <p className="text-xs font-mono text-purple-300 mb-4 uppercase tracking-wider">Multi-Tenant Database Multiplexer</p>
              <p className="text-sm text-neutral-400 leading-relaxed mb-6">
                Auto-provisions isolated PostgreSQL, Redis, MySQL, MongoDB, and Vector DB instances per tenant in ~15ms with full connection pool routing.
              </p>
              <ul className="space-y-2.5 text-xs text-neutral-300 mb-6">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-purple-400 shrink-0" />
                  Database-per-Tenant isolation (`db_user_&lt;tenant_id&gt;`)
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-purple-400 shrink-0" />
                  Dynamic connection pooling & execution timeout safety
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-purple-400 shrink-0" />
                  ConnectRPC Web & gRPC transport protocol
                </li>
              </ul>
            </div>

            {/* 2. BuckStream Card */}
            <div id="buckstream" className="rounded-2xl border border-neutral-800/80 bg-gradient-to-br from-[#121215] to-[#18181c] p-8 backdrop-blur-xl relative overflow-hidden group hover:border-indigo-500/40 transition-all shadow-xl">
              <div className="absolute top-0 right-0 p-8 text-indigo-500/10 group-hover:text-indigo-500/20 transition-all">
                <HardDrive className="size-24" />
              </div>
              <div className="inline-flex p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 mb-6">
                <HardDrive className="size-6" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">BuckStream</h3>
              <p className="text-xs font-mono text-indigo-300 mb-4 uppercase tracking-wider">S3 Storage & Media Broker</p>
              <p className="text-sm text-neutral-400 leading-relaxed mb-6">
                High-performance S3 file storage and streaming broker with strict directory path isolation (`uploads/&lt;tenant_id&gt;/`).
              </p>
              <ul className="space-y-2.5 text-xs text-neutral-300 mb-6">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-indigo-400 shrink-0" />
                  Tenant-scoped object storage & media streaming
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-indigo-400 shrink-0" />
                  S3 API compatibility & signed download URLs
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-indigo-400 shrink-0" />
                  Automatic AI sandbox file isolation
                </li>
              </ul>
            </div>

            {/* 3. ArcAuth Card */}
            <div id="arcauth" className="rounded-2xl border border-neutral-800/80 bg-gradient-to-br from-[#121215] to-[#18181c] p-8 backdrop-blur-xl relative overflow-hidden group hover:border-emerald-500/40 transition-all shadow-xl">
              <div className="absolute top-0 right-0 p-8 text-emerald-500/10 group-hover:text-emerald-500/20 transition-all">
                <ShieldCheck className="size-24" />
              </div>
              <div className="inline-flex p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-6">
                <ShieldCheck className="size-6" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">ArcAuth</h3>
              <p className="text-xs font-mono text-emerald-300 mb-4 uppercase tracking-wider">Passwordless Identity & Auth</p>
              <p className="text-sm text-neutral-400 leading-relaxed mb-6">
                Unified passwordless authentication with verified Email OTP, Google OAuth, and GitHub OAuth issuing multi-tenant JWT claims.
              </p>
              <ul className="space-y-2.5 text-xs text-neutral-300 mb-6">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
                  Passwordless 6-digit Email OTP verification
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
                  1-Click Google & GitHub OAuth integration
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
                  Unified `team_id` account lookup by verified email
                </li>
              </ul>
            </div>

            {/* 4. Frontedge Card */}
            <div id="frontedge" className="rounded-2xl border border-neutral-800/80 bg-gradient-to-br from-[#121215] to-[#18181c] p-8 backdrop-blur-xl relative overflow-hidden group hover:border-blue-500/40 transition-all shadow-xl">
              <div className="absolute top-0 right-0 p-8 text-blue-500/10 group-hover:text-blue-500/20 transition-all">
                <Globe className="size-24" />
              </div>
              <div className="inline-flex p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 mb-6">
                <Globe className="size-6" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Frontedge</h3>
              <p className="text-xs font-mono text-blue-300 mb-4 uppercase tracking-wider">Edge Web Application Hosting</p>
              <p className="text-sm text-neutral-400 leading-relaxed mb-6">
                Instant edge deployment engine for web applications, frontend frameworks, and AI code builder projects with automatic SSL routing.
              </p>
              <ul className="space-y-2.5 text-xs text-neutral-300 mb-6">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-blue-400 shrink-0" />
                  Global SSL edge deployment & CDN asset distribution
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-blue-400 shrink-0" />
                  Native hosting for AI code builder sandboxes
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-blue-400 shrink-0" />
                  Sub-second cold starts & edge cache routing
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* CTA Footer Banner */}
        <div className="mt-32 w-full rounded-2xl border border-purple-500/30 bg-gradient-to-r from-purple-900/20 via-indigo-900/20 to-purple-900/20 p-12 text-center relative overflow-hidden backdrop-blur-xl shadow-2xl">
          <div className="absolute -top-24 -left-24 size-64 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
          <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
            Ready to Build on ArcOps?
          </h2>
          <p className="text-neutral-400 text-sm max-w-xl mx-auto mb-8">
            Deploy your multi-tenant database, storage, auth, and frontend edge in under two minutes.
          </p>
          <Link
            to={isLoggedIn ? "/dashboard" : "/login"}
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-white text-black font-semibold text-sm hover:bg-neutral-200 transition-all shadow-xl"
          >
            {isLoggedIn ? "Open Dashboard" : "Get Started Now"} <ArrowRight className="size-4" />
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-neutral-800/80 bg-[#0a0a0c] py-8 relative z-20 text-xs text-neutral-500">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-purple-400" />
            <span className="font-bold text-neutral-300">ArcOps Infrastructure Stack</span>
          </div>
          <p>© 2026 ArcOps Inc. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
