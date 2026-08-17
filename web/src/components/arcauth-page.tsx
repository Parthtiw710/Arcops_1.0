import React, { useState } from "react";
import {
  ShieldCheck,
  KeyRound,
  Lock,
  Mail,
  Smartphone,
  Fingerprint,
  Copy,
  Check,
  ArrowRight,
  Zap,
  Users,
  Activity,
  Key,
} from "lucide-react";

function GithubIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

function GoogleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
    </svg>
  );
}

const R = "#f43f5e"; // rose accent
const R_DIM = "rgba(244,63,94,0.12)";
const R_LIGHT = "#fb7185";

const AUTH_METHODS = [
  { id: "otp",     label: "Email OTP",       icon: <Mail size={16} />,        color: "#38bdf8" },
  { id: "sms",     label: "SMS OTP",          icon: <Smartphone size={16} />, color: "#a78bfa" },
  { id: "magic",   label: "Magic Link",       icon: <Zap size={16} />,         color: "#fbbf24" },
  { id: "oauth",   label: "GitHub OAuth",     icon: <GithubIcon size={16} />,  color: "#e2e8f0" },
  { id: "google",  label: "Google OAuth",     icon: <GoogleIcon size={16} />,  color: "#34d399" },
  { id: "apikey",  label: "API Key (SHA-256)", icon: <Key size={16} />,        color: "#f97316" },
];

const FEATURES = [
  {
    stat: "< 1ms",
    label: "Token Validation",
    desc: "JWT verified locally via HMAC-SHA256 — no DB roundtrip on every request.",
    color: "#f43f5e",
  },
  {
    stat: "Argon2id",
    label: "Password Hashing",
    desc: "Memory-hard Argon2id for password storage. Resistant to GPU brute-force attacks.",
    color: "#a78bfa",
  },
  {
    stat: "6 Methods",
    label: "Auth Channels",
    desc: "Password, OTP email, OTP SMS, Magic Link, GitHub OAuth, Google OAuth — all in one service.",
    color: "#38bdf8",
  },
  {
    stat: "Redis TTL",
    label: "OTP Rate Limiting",
    desc: "OTP codes are stored in Redis with automatic expiry, replay protection, and attempt throttling.",
    color: "#fbbf24",
  },
  {
    stat: "SHA-256",
    label: "API Key Vault",
    desc: "API keys are hashed before storage. Raw keys only shown once at generation time.",
    color: "#34d399",
  },
  {
    stat: "7-day",
    label: "Session JWT",
    desc: "HS256 signed JWTs include sub, email, role. Configurable expiry via JWT_SECRET.",
    color: "#f97316",
  },
];

export function ArcAuthPage() {
  const [activeMethod, setActiveMethod] = useState("otp");
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState<"idle" | "sent" | "done">("idle");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("admin@arcops.dev");
  const [code, setCode] = useState("");
  const [resultToken, setResultToken] = useState("");

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSend = () => {
    if (!email) return;
    setLoading(true);
    setTimeout(() => {
      setStep("sent");
      setLoading(false);
    }, 400);
  };

  const handleVerify = () => {
    setLoading(true);
    setTimeout(() => {
      setResultToken(`arc_jwt_eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(JSON.stringify({ sub: "usr_99182", email: email || "admin@arcops.dev", role: "admin", exp: Math.floor(Date.now() / 1000) + 604800 }))}.mock_sig_9f8d`);
      setStep("done");
      setLoading(false);
    }, 400);
  };

  return (
    <div className="min-h-screen text-[#e8e8f0] relative overflow-hidden"
      style={{ background: "#050507" }}>
      {/* Rose radial glow */}
      <div className="fixed inset-0 pointer-events-none z-0" style={{
        background: "radial-gradient(ellipse 60% 50% at 5% 50%, rgba(244,63,94,0.09) 0%, transparent 65%), radial-gradient(ellipse 40% 40% at 95% 20%, rgba(167,139,250,0.07) 0%, transparent 60%)"
      }} />

      <div className="relative z-10">
        {/* ─── SPLIT HERO ─── */}
        <section className="max-w-7xl mx-auto px-6 lg:px-10 pt-16 pb-12 grid lg:grid-cols-2 gap-12 items-center">
          {/* Left — text */}
          <div className="space-y-7">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-sm font-semibold"
              style={{ borderColor: `${R}44`, background: R_DIM, color: R_LIGHT }}>
              <ShieldCheck size={15} /> Single-User Auth Engine
            </div>

            <h1 className="text-6xl xl:text-7xl font-extrabold leading-[1.05] tracking-tight text-white">
              Identity that{" "}
              <span className="relative inline-block">
                <span className="relative z-10" style={{ color: R_LIGHT }}>never</span>
                <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full" style={{ background: R_LIGHT }} />
              </span>{" "}
              sleeps.
            </h1>

            <p className="text-xl text-zinc-400 leading-relaxed max-w-lg">
              ArcAuth is a Go-native passwordless identity engine. OTP, OAuth, Magic Links,
              and API Keys — all routed through a single sub-millisecond JWT issuer.
            </p>

            <div className="flex flex-wrap gap-3">
              <a href="https://github.com/Parthtiw710/arcops" target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-base font-bold text-white transition-all shadow-lg"
                style={{ background: `linear-gradient(135deg, ${R}, #be123c)`, boxShadow: `0 4px 24px ${R}40` }}>
                <ShieldCheck size={18} /> Explore ArcAuth
              </a>
              <button onClick={() => handleCopy(`POST /api/auth/otp/send\n{ "target": "user@example.com", "type": "email" }`)}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-mono bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white transition-all">
                {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                POST /api/auth/otp/send
              </button>
            </div>

            {/* Auth method pills */}
            <div className="flex flex-wrap gap-2 pt-2">
              {AUTH_METHODS.map((m) => (
                <button key={m.id} onClick={() => setActiveMethod(m.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer"
                  style={{
                    borderColor: activeMethod === m.id ? m.color + "66" : "rgba(255,255,255,0.08)",
                    background: activeMethod === m.id ? m.color + "18" : "transparent",
                    color: activeMethod === m.id ? m.color : "#71717a",
                  }}>
                  {m.icon} {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Right — live OTP terminal */}
          <div className="bg-[#0c0c10] border border-zinc-800/80 rounded-2xl overflow-hidden shadow-2xl">
            {/* Terminal header */}
            <div className="flex items-center gap-2 px-5 py-3 bg-[#111115] border-b border-zinc-800">
              <div className="w-3 h-3 rounded-full bg-[#f43f5e]/70" />
              <div className="w-3 h-3 rounded-full bg-[#fbbf24]/70" />
              <div className="w-3 h-3 rounded-full bg-[#34d399]/70" />
              <span className="ml-3 text-xs font-mono text-zinc-500">arcauth · email OTP demo</span>
            </div>
            <div className="p-6 font-mono text-sm space-y-4 min-h-[360px]">
              {step === "idle" && (
                <>
                  <div className="text-zinc-500"># Step 1 — Enter your email</div>
                  <input
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2.5 text-white text-sm outline-none focus:border-rose-500/60"
                    placeholder="user@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <button onClick={handleSend} disabled={loading}
                    className="w-full py-2.5 rounded-lg text-sm font-bold text-white transition-all"
                    style={{ background: `linear-gradient(135deg, ${R}, #be123c)` }}>
                    {loading ? "Sending..." : "Send OTP →"}
                  </button>
                </>
              )}
              {step === "sent" && (
                <>
                  <div className="text-emerald-400">✓ OTP sent to {email}</div>
                  <div className="text-zinc-500"># Step 2 — Enter 6-digit code</div>
                  <input
                    className="w-full bg-zinc-950 border border-rose-500/40 rounded-lg px-4 py-2.5 text-white text-center text-xl tracking-widest font-mono outline-none focus:border-rose-400"
                    placeholder="· · · · · ·"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                  <button onClick={handleVerify} disabled={loading}
                    className="w-full py-2.5 rounded-lg text-sm font-bold text-white transition-all"
                    style={{ background: `linear-gradient(135deg, ${R}, #be123c)` }}>
                    {loading ? "Verifying..." : "Verify & Get JWT →"}
                  </button>
                </>
              )}
              {step === "done" && (
                <>
                  <div className="text-emerald-400">✓ Authenticated!</div>
                  <div className="text-zinc-500">Token issued (7-day expiry):</div>
                  <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs text-rose-300 break-all leading-relaxed">
                    {resultToken}
                  </div>
                  <div className="text-zinc-500 text-xs">sub · email · role · exp embedded in JWT claims</div>
                  <button onClick={() => { setStep("idle"); setCode(""); setResultToken(""); }}
                    className="text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer">
                    ↩ Reset demo
                  </button>
                </>
              )}
            </div>
          </div>
        </section>

        {/* ─── FEATURE STATS GRID ─── */}
        <section className="max-w-7xl mx-auto px-6 lg:px-10 py-12">
          <div className="mb-10">
            <div className="text-sm font-mono uppercase tracking-widest mb-2" style={{ color: R_LIGHT }}>CAPABILITIES</div>
            <h2 className="text-5xl font-extrabold text-white">Built without compromise.</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f) => (
              <div key={f.label} className="p-6 rounded-2xl border bg-[#0c0c10] hover:bg-[#111115] transition-all group"
                style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                <div className="text-5xl font-extrabold mb-3 font-mono" style={{ color: f.color }}>{f.stat}</div>
                <h3 className="text-lg font-bold text-white mb-2">{f.label}</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ─── FLOW DIAGRAM (vertical pill chain) ─── */}
        <section className="max-w-4xl mx-auto px-6 lg:px-10 py-12">
          <div className="text-center mb-10">
            <div className="text-sm font-mono uppercase tracking-widest mb-2" style={{ color: R_LIGHT }}>AUTH FLOW</div>
            <h2 className="text-4xl font-extrabold text-white">Request → Token in 3 steps.</h2>
          </div>

          <div className="relative">
            {/* vertical connector */}
            <div className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2"
              style={{ background: `linear-gradient(to bottom, transparent, ${R}60, ${R}60, transparent)` }} />

            {[
              { n: "01", title: "Identity Request", desc: "Client sends credentials via OTP / OAuth / Password / Magic Link to POST /api/auth/authenticate", color: "#38bdf8" },
              { n: "02", title: "ArcAuth Kernel", desc: "Go service validates credentials: Argon2id hash check, OTP Redis lookup, or OAuth token exchange. Rate-limited per IP.", color: R },
              { n: "03", title: "JWT Issued", desc: "HS256 signed JWT returned with sub, email, role claims. Validated locally by Gateway with no DB call on subsequent requests.", color: "#34d399" },
            ].map((s, i) => (
              <div key={s.n} className={`relative flex items-start gap-6 mb-12 ${i % 2 === 1 ? "flex-row-reverse" : ""}`}>
                <div className="flex-1" style={{ textAlign: i % 2 === 1 ? "right" : "left" }}>
                  <div className="inline-block p-6 rounded-2xl border bg-[#0c0c10]"
                    style={{ borderColor: s.color + "33" }}>
                    <div className="text-xs font-mono mb-1" style={{ color: s.color }}>{s.n}</div>
                    <h3 className="text-xl font-bold text-white mb-1">{s.title}</h3>
                    <p className="text-sm text-zinc-400 leading-relaxed max-w-xs">{s.desc}</p>
                  </div>
                </div>
                {/* Center dot */}
                <div className="absolute left-1/2 -translate-x-1/2 mt-6 w-4 h-4 rounded-full border-2 z-10"
                  style={{ borderColor: s.color, background: "#050507", boxShadow: `0 0 12px ${s.color}66` }} />
                <div className="flex-1" />
              </div>
            ))}
          </div>
        </section>

        {/* ─── CTA ─── */}
        <section className="text-center py-16 px-6">
          <h2 className="text-6xl font-extrabold text-white mb-5">
            Auth without the{" "}
            <span style={{ color: R_LIGHT }}>overhead.</span>
          </h2>
          <p className="text-xl text-zinc-400 mb-8 max-w-lg mx-auto">
            No Auth0, no Clerk, no third-party. Your users, your JWT, your rules.
          </p>
          <a href="/login"
            className="inline-flex items-center gap-2.5 px-8 py-4 rounded-2xl text-lg font-bold text-white transition-all shadow-xl"
            style={{ background: `linear-gradient(135deg, ${R}, #be123c)`, boxShadow: `0 6px 32px ${R}50` }}>
            <ShieldCheck size={20} /> Try ArcAuth Login <ArrowRight size={20} />
          </a>
        </section>
      </div>
    </div>
  );
}
