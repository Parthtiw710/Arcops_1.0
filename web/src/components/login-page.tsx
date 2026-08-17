"use client";

import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, AlertCircle, Sparkles, Mail, ShieldCheck, ExternalLink } from "lucide-react";
import { GATEWAY_URL } from "../config";
import { arcauth } from "../lib/arcauth";

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Form states
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);

  // Status states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  React.useEffect(() => {
    // Check URL query parameters for OAuth error codes (e.g. ?error=403 or ?code=403)
    const errParam = searchParams.get("error") || searchParams.get("message");
    const codeParam = searchParams.get("code") || searchParams.get("status");

    if (errParam || codeParam === "403") {
      setError(errParam || "403 Forbidden: Access restricted to authorized admin emails configured in ADMIN_EMAILS.");
    }

    // Immediate session logout upon invoking the /login route
    const currentToken = localStorage.getItem("arcauth_token") || localStorage.getItem("authx_token");
    arcauth.logout();

    // Revoke backend session if token exists
    if (currentToken) {
      fetch(`${GATEWAY_URL}/api/auth/logout`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${currentToken}`,
        },
        credentials: "include",
      }).catch(() => { });
    }
  }, [searchParams]);

  // Handle Send OTP via ?auth=dashboard
  const handleSendOTP = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!email) {
      setError("Please enter a valid admin email address.");
      return;
    }

    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const res = await fetch(`${GATEWAY_URL}/api/auth/otp/send?auth=dashboard`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Auth-Scope": "dashboard",
        },
        credentials: "include",
        body: JSON.stringify({ target: email, type: "email" }),
      });

      const data = await res.json();
      if (!res.ok) {
        const errMsg = data.message || data.error || `HTTP ${res.status}: Failed to send OTP code`;
        if (res.status === 403 || res.status === 401 || res.status === 429 || res.status >= 500) {
          navigate(`/error?code=${res.status}&message=${encodeURIComponent(errMsg)}`);
          return;
        }
        throw new Error(errMsg);
      }

      setOtpSent(true);
      setSuccess(`6-Digit OTP code sent to ${email}! Please check your inbox.`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle Verify OTP via ?auth=dashboard
  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode || otpCode.length < 6) {
      setError("Please enter the 6-digit OTP code sent to your email.");
      return;
    }

    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const res = await fetch(`${GATEWAY_URL}/api/auth/authenticate?auth=dashboard`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Auth-Scope": "dashboard",
        },
        credentials: "include",
        body: JSON.stringify({
          method: "otp",
          target: email,
          code: otpCode,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        const errMsg = data.message || data.error || `HTTP ${res.status}: OTP verification failed`;
        if (res.status === 403 || res.status === 401 || res.status === 429 || res.status >= 500) {
          navigate(`/error?code=${res.status}&message=${encodeURIComponent(errMsg)}`);
          return;
        }
        throw new Error(errMsg);
      }

      if (data.token) {
        localStorage.setItem("arcauth_token", data.token);
        localStorage.setItem("authx_token", data.token);
        if (data.user) {
          localStorage.setItem("arcauth_user", JSON.stringify(data.user));
          localStorage.setItem("authx_user", JSON.stringify(data.user));
        }
        window.dispatchEvent(new Event("arcauth_login_success"));
        window.dispatchEvent(new Event("authx_login_success"));
        setSuccess("Dashboard Admin authenticated successfully! Redirecting...");
        setTimeout(() => navigate("/"), 1000);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle Social OAuth Redirect via ?auth=dashboard
  const handleSocialOAuth = (provider: "github" | "google") => {
    const returnUrl = encodeURIComponent(window.location.origin);
    window.location.href = `${GATEWAY_URL}/api/auth/oauth/${provider}?auth=dashboard&redirect_url=${returnUrl}`;
  };

  const isForbiddenError = error && (
    error.toLowerCase().includes("forbidden") ||
    error.toLowerCase().includes("access denied") ||
    error.toLowerCase().includes("403") ||
    error.toLowerCase().includes("restricted")
  );

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-white flex flex-col justify-center items-center px-4 relative overflow-hidden font-sans">
      {/* Background ambient lighting glow */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-purple-900/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-900/20 rounded-full blur-3xl pointer-events-none" />

      {/* Top back button */}
      <div className="absolute top-6 left-6">
        <Link
          to="/"
          className="flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="size-4" /> Go to Home
        </Link>
      </div>

      {/* Main Login Card */}
      <div className="w-full max-w-md bg-[#121215] border border-neutral-800/80 rounded-2xl p-8 shadow-2xl backdrop-blur-xl relative z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center size-12 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 mb-3">
            <Sparkles className="size-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Welcome to ArcOps</h1>
          <p className="text-sm text-neutral-400 mt-1">Single-User Authorized Admin Sign In</p>
        </div>

        {/* Error / Success Notifications with 403.svg Visual */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-purple-950/30 border border-purple-500/30 text-purple-300 text-xs flex flex-col items-center gap-3 text-center shadow-lg animate-in fade-in duration-200">
            {isForbiddenError ? (
              <>
                <div className="w-full h-36 flex items-center justify-center p-1 rounded-lg bg-black/40 border border-purple-500/20 overflow-hidden">
                  <img
                    src="/403.svg"
                    alt="403 Forbidden"
                    className="w-full h-full object-contain filter drop-shadow-[0_0_15px_rgba(168,85,247,0.4)]"
                    onError={(e) => { (e.target as HTMLImageElement).src = "/error.svg"; }}
                  />
                </div>
                <div className="flex items-center gap-1.5 text-red-400 font-semibold text-xs">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>HTTP 403 FORBIDDEN</span>
                </div>
                <p className="text-[11px] text-neutral-300 leading-relaxed font-mono bg-black/40 p-2.5 rounded-lg border border-purple-900/40 text-left w-full">
                  {error}
                </p>
                <Link
                  to="/error?code=403"
                  className="inline-flex items-center gap-1 text-[11px] text-purple-400 hover:text-purple-300 underline font-medium"
                >
                  View full error details <ExternalLink className="size-3" />
                </Link>
              </>
            ) : (
              <div className="flex items-center gap-2 text-red-400 text-xs w-full text-left">
                <AlertCircle className="size-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}

        {success && (
          <div className="mb-5 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* EMAIL OTP FORM */}
        <form onSubmit={otpSent ? handleVerifyOTP : handleSendOTP} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5 flex items-center gap-1.5">
              <Mail className="size-3.5 text-neutral-400" /> Admin Email Address
            </label>
            <input
              type="email"
              required
              disabled={otpSent}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@arcops.local"
              className="w-full bg-[#18181b] border border-neutral-800 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-600 transition-colors disabled:opacity-60"
            />
          </div>

          {otpSent && (
            <div className="animate-in fade-in duration-200">
              <label className="block text-xs font-medium text-neutral-300 mb-1.5 flex items-center gap-1.5">
                <ShieldCheck className="size-3.5 text-purple-400" /> 6-Digit Email OTP Code
              </label>
              <input
                type="text"
                required
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                placeholder="123456"
                className="w-full bg-[#18181b] border border-purple-500/40 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500 transition-colors text-center tracking-widest font-mono text-lg shadow-[0_0_15px_rgba(168,85,247,0.15)]"
              />
              <div className="flex justify-between items-center mt-2">
                <button
                  type="button"
                  onClick={() => { setOtpSent(false); setOtpCode(""); setError(null); setSuccess(null); }}
                  className="text-[11px] text-neutral-400 hover:text-white transition-colors"
                >
                  Change Email
                </button>
                <button
                  type="button"
                  onClick={() => handleSendOTP()}
                  className="text-[11px] text-purple-400 hover:text-purple-300 font-medium transition-colors"
                >
                  Resend Code
                </button>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-white text-black font-semibold py-2.5 px-4 rounded-lg hover:bg-neutral-200 transition-all text-sm shadow-md mt-2 disabled:opacity-50 cursor-pointer"
          >
            {loading ? "Processing..." : otpSent ? "Verify Code & Sign In" : "Send Email OTP"}
          </button>
        </form>

        {/* HORIZONTAL DIVIDER */}
        <div className="relative my-6 text-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-neutral-800" />
          </div>
          <span className="relative bg-[#121215] px-3 text-xs text-neutral-500 font-medium">
            Or continue with Admin OAuth
          </span>
        </div>

        {/* SOCIAL LOGINS (Google) */}
        <div className="flex items-center justify-center">
          {/* Google Button */}
          <button
            type="button"
            onClick={() => handleSocialOAuth("google")}
            title="Continue with Google"
            className="w-full py-2.5 px-4 rounded-xl bg-[#18181b] border border-neutral-800 flex items-center justify-center gap-3 hover:bg-neutral-800 hover:border-neutral-700 transition-all cursor-pointer shadow-sm group text-xs font-medium text-neutral-200"
          >
            <svg className="size-4 shrink-0 transition-transform group-hover:scale-110" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            Continue with Google
          </button>
        </div>
      </div>
    </div>
  );
}
