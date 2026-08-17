"use client";

import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export function ErrorPage() {
  const [searchParams] = useSearchParams();
  const code = searchParams.get("code") || searchParams.get("status") || "403";
  const messageParam = searchParams.get("message") || searchParams.get("error");

  const svgMap: Record<string, string> = {
    "400": "/400.svg",
    "403": "/403.svg",
    "404": "/404.svg",
    "429": "/429.svg",
    "500": "/500.svg",
  };

  const svgSrc = svgMap[code] || "/403.svg";
  const errorMessage = messageParam || (code === "403" ? "Access forbidden: Your email is not authorized in ADMIN_EMAILS." : `Error ${code}`);

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-white flex flex-col justify-center items-center px-4 py-8 relative overflow-hidden font-sans">
      {/* Subtle Background Glow */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-purple-900/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-900/20 rounded-full blur-3xl pointer-events-none" />

      {/* Main Big SVG Display */}
      <div className="w-full max-w-3xl flex flex-col items-center justify-center relative z-10 text-center">
        <img
          src={svgSrc}
          alt={`Error ${code}`}
          className="w-full max-w-2xl h-auto max-h-[62vh] object-contain drop-shadow-[0_0_35px_rgba(168,85,247,0.35)] mb-6 transition-transform hover:scale-102"
          onError={(e) => {
            (e.target as HTMLImageElement).src = "/error.svg";
          }}
        />

        {/* Error message text */}
        {errorMessage && (
          <p className="text-sm font-mono text-neutral-400 max-w-lg mb-8 leading-relaxed bg-[#121215] px-4 py-2.5 rounded-xl border border-neutral-800/80">
            {errorMessage}
          </p>
        )}

        {/* Clean Go to Home Link */}
        <Link
          to="/"
          className="inline-flex items-center gap-2.5 px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium text-sm transition-all shadow-lg shadow-purple-600/30 hover:shadow-purple-600/50 cursor-pointer"
        >
          <ArrowLeft className="size-4" /> Go to Home
        </Link>
      </div>
    </div>
  );
}
