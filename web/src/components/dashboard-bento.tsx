import React, { useState, useEffect } from "react";
import { DbBento } from "@/components/db-bento";
import { ApiKeyBento } from "@/components/api-key-bento";
import { Upload, FileText, CheckCircle2, HardDrive, Download, Activity, Zap, BarChart3, Trash2 } from "lucide-react";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { dbmux } from "@/lib/dbmux";
import { buckstream } from "@/lib/buckstream";

const tooltipStyle = {
  backgroundColor: "#0f0f12",
  borderColor: "#27272a",
  fontSize: "11px",
  borderRadius: "8px",
  color: "#fafafa",
  boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
};

function StatPill({
  label,
  value,
  color,
  icon: Icon,
}: {
  label: string;
  value: string;
  color: string;
  icon: React.ElementType;
}) {
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border ${color} bg-opacity-10`}>
      <Icon className="size-3 shrink-0" />
      <span className="text-xs font-mono font-bold">{value}</span>
      <span className="text-[11px] text-zinc-400 font-medium">{label}</span>
    </div>
  );
}

function ChartsBentoContent() {
  const [throughputData, setThroughputData] = useState<any[]>([]);
  const [latencyData, setLatencyData] = useState<any[]>([]);
  const [leasesData, setLeasesData] = useState<any[]>([]);

  useEffect(() => {
    const fetchTelemetry = async () => {
      const token = localStorage.getItem("arcauth_token") || localStorage.getItem("authx_token");
      if (!token) {
        setThroughputData([]);
        setLatencyData([]);
        setLeasesData([]);
        return;
      }

      try {
        const metrics = await dbmux.getTelemetryMetrics();
        if (metrics.throughput && metrics.throughput.length > 0) {
          setThroughputData(metrics.throughput);
        } else {
          setThroughputData([]);
        }
        if (metrics.latency && metrics.latency.length > 0) {
          setLatencyData(metrics.latency);
        } else {
          setLatencyData([]);
        }
        if (metrics.leases && metrics.leases.length > 0) {
          setLeasesData(metrics.leases);
        } else {
          setLeasesData([]);
        }
      } catch {
        setThroughputData([]);
        setLatencyData([]);
        setLeasesData([]);
      }
    };

    fetchTelemetry();
    window.addEventListener("arcauth_login_success", fetchTelemetry);
    window.addEventListener("arcauth_logout", fetchTelemetry);
    window.addEventListener("authx_login_success", fetchTelemetry);
    window.addEventListener("authx_logout", fetchTelemetry);
    return () => {
      window.removeEventListener("arcauth_login_success", fetchTelemetry);
      window.removeEventListener("arcauth_logout", fetchTelemetry);
      window.removeEventListener("authx_login_success", fetchTelemetry);
      window.removeEventListener("authx_logout", fetchTelemetry);
    };
  }, []);

  const latestThroughput = throughputData.length > 0 ? `${throughputData[throughputData.length - 1].reqs}/s` : "0/s";
  const latestLatency = latencyData.length > 0 ? `${latencyData[latencyData.length - 1].ms}ms` : "0ms";
  const maxLease = leasesData.length > 0 ? `${Math.max(...leasesData.map(l => l.active))} leases` : "0 leases";

  return (
    <div className="flex flex-col h-full w-full p-5 gap-5">
      {/* Top stat hero pills */}
      <div className="flex items-center gap-3 flex-wrap">
        <StatPill label="throughput" value={latestThroughput} color="border-purple-500/30 text-purple-300 bg-purple-500/10 shadow-[0_0_15px_rgba(168,85,247,0.15)]" icon={Activity} />
        <StatPill label="p99 latency" value={latestLatency} color="border-emerald-500/30 text-emerald-300 bg-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.15)]" icon={Zap} />
        <StatPill label="db pool" value={maxLease} color="border-indigo-500/30 text-indigo-300 bg-indigo-500/10 shadow-[0_0_15px_rgba(99,102,241,0.15)]" icon={BarChart3} />
      </div>

      <div className="flex flex-col lg:flex-row gap-5 flex-1 min-h-0">
        {/* Left column: 2 stacked charts */}
        <div className="flex flex-col gap-5 w-full lg:w-[60%] h-full justify-between">
          {/* Bento 1.1: Throughput chart */}
          <div className="flex-1 rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-900/90 via-zinc-900/70 to-zinc-950/90 p-5 flex flex-col justify-between overflow-hidden min-h-[250px] relative backdrop-blur-xl shadow-xl transition-all hover:border-purple-500/30">
            <div className="absolute -top-8 -right-8 w-36 h-36 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />
            <div className="flex items-center justify-between mb-3 relative z-10">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.9)] animate-pulse" />
                <span className="text-xs font-bold text-zinc-100 tracking-wide uppercase font-mono">Throughput</span>
              </div>
              <span className="text-xs font-mono text-purple-300 font-bold bg-purple-500/15 border border-purple-500/30 px-2.5 py-1 rounded-lg shadow-sm">
                {latestThroughput}
              </span>
            </div>
            <div className="w-full h-[190px] relative z-10">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={throughputData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                  <defs>
                    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ stroke: "#a855f7", strokeWidth: 1, strokeDasharray: "4 4" }} contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="reqs" stroke="#a855f7" strokeWidth={2.5} fill="url(#areaGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Bento 1.2: Latency chart */}
          <div className="flex-1 rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-900/90 via-zinc-900/70 to-zinc-950/90 p-5 flex flex-col justify-between overflow-hidden min-h-[250px] relative backdrop-blur-xl shadow-xl transition-all hover:border-emerald-500/30">
            <div className="absolute -bottom-8 -right-8 w-32 h-32 bg-emerald-600/15 rounded-full blur-3xl pointer-events-none" />
            <div className="flex items-center justify-between mb-3 relative z-10">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] animate-pulse" />
                <span className="text-xs font-bold text-zinc-100 tracking-wide uppercase font-mono">P99 Latency</span>
              </div>
              <span className="text-xs font-mono text-emerald-300 font-bold bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 rounded-lg shadow-sm">
                {latestLatency}
              </span>
            </div>
            <div className="w-full h-[190px] relative z-10">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={latencyData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                  <XAxis dataKey="time" stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ stroke: "#34d399", strokeWidth: 1, strokeDasharray: "4 4" }} contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="ms" stroke="#34d399" strokeWidth={2.5} dot={{ r: 3, fill: "#34d399", strokeWidth: 0 }} activeDot={{ r: 6, fill: "#34d399" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Right column: Bar chart */}
        <div className="flex flex-col justify-center items-center w-full lg:w-[40%] h-full my-auto self-center">
          <div className="w-full rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-900/90 via-zinc-900/70 to-zinc-950/90 p-5 flex flex-col justify-between overflow-hidden my-auto relative backdrop-blur-xl shadow-xl transition-all hover:border-indigo-500/30">
            <div className="absolute -top-6 -left-6 w-32 h-32 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
            <div className="flex items-center justify-between mb-4 relative z-10">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.9)] animate-pulse" />
                <span className="text-xs font-bold text-zinc-100 tracking-wide uppercase font-mono">Active Leases</span>
              </div>
              <span className="text-xs font-mono text-indigo-300 font-bold bg-indigo-500/15 border border-indigo-500/30 px-2.5 py-1 rounded-lg shadow-sm">DBMux Pool</span>
            </div>
            <div className="w-full h-[240px] relative z-10">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={leasesData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                  <defs>
                    <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#a5b4fc" stopOpacity={1} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0.8} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="db" stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} contentStyle={tooltipStyle} />
                  <Bar dataKey="active" fill="url(#barGrad)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface AssetItemProps {
  name: string;
  rawKey: string;
  size: string;
  time: string;
  downloadUrl?: string;
  onDelete?: (rawKey: string) => void;
}

function AssetItem({ name, rawKey, size, time, downloadUrl = "#", onDelete }: AssetItemProps) {
  return (
    <tr className="hover:bg-white/[0.03] transition-colors group border-b border-white/[0.04] last:border-0">
      <td className="py-2.5 pr-3">
        <div className="flex items-center gap-2 font-mono max-w-[200px] sm:max-w-[260px]">
          <FileText className="size-3.5 text-purple-400 group-hover:text-purple-300 shrink-0 transition-colors" />
          <span className="text-xs font-bold text-zinc-200 group-hover:text-white transition-colors truncate" title={name}>
            {name}
          </span>
        </div>
      </td>
      <td className="py-2.5 pr-3 text-zinc-400 font-mono text-xs whitespace-nowrap">{size}</td>
      <td className="py-2.5 pr-3 text-zinc-500 font-mono text-xs whitespace-nowrap">{time}</td>
      <td className="py-2.5 text-right whitespace-nowrap">
        <div className="inline-flex items-center gap-1.5">
          <a
            href={downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-white/[0.06] hover:bg-purple-600 text-zinc-200 hover:text-white border border-white/[0.08] transition-all cursor-pointer shadow-xs"
          >
            <Download className="size-3" />
            <span>Get</span>
          </a>
          {onDelete && (
            <button
              onClick={() => onDelete(rawKey)}
              className="p-1 rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all cursor-pointer"
              title="Delete object"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

import { getBuckStreamClient } from "@/lib/buckstream";

function BuckstreamBentoContent() {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [assets, setAssets] = React.useState<AssetItemProps[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [uploadedFileName, setUploadedFileName] = React.useState<string | null>(null);

  const BROKER_URL = `${import.meta.env.VITE_GATEWAY_URL || "http://localhost:8000"}/api/storage`;

  const fetchAssets = async () => {
    try {
      const client = getBuckStreamClient();
      const res = await client.List();
      const keys: string[] = res.objects || [];
      if (keys.length > 0) {
        setAssets(keys.map((k) => ({
          name: k.replace(/^uploads\/(tenant_[^/]+\/)?/, "").replace(/^sandbox\/(prj_[^/]+\/)?/, ""),
          rawKey: k,
          size: "S3 Object",
          time: "Just now",
          downloadUrl: `${BROKER_URL}/api/download/${k}`,
        })));
      } else {
        setAssets([]);
      }
    } catch {
      setAssets([]);
    }
  };

  React.useEffect(() => {
    fetchAssets();
    window.addEventListener("arcauth_login_success", fetchAssets);
    return () => window.removeEventListener("arcauth_login_success", fetchAssets);
  }, []);

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    setUploadedFileName(file.name);
    try {
      const client = getBuckStreamClient();
      await client.Upload(file, file.name, file.type || "application/octet-stream");
      await fetchAssets();
    } catch (err) {
      console.error("Buckstream upload error:", err);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (rawKey: string) => {
    try {
      const client = getBuckStreamClient();
      await client.Delete(rawKey);
      await fetchAssets();
    } catch (err) {
      console.error("BuckStream delete error:", err);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files?.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 w-full h-full p-4">
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => {
          if (e.target.files?.length) handleFileUpload(e.target.files[0]);
        }}
        className="hidden"
      />

      {/* Files table (Bento 4.1 - Increased height and text size) */}
      <div className="min-w-0 flex-1 min-h-[420px] rounded-2xl border border-white/[0.06] bg-gradient-to-br from-[#141418] to-[#0f0f12] p-5 flex flex-col gap-4 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-48 h-48 bg-purple-600/[0.06] rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20">
              <HardDrive className="size-4 text-purple-400" />
            </div>
            <div>
              <span className="text-base font-bold text-white">Stored Assets</span>
              <span className="ml-2.5 text-xs text-zinc-400 font-mono">Buckstream S3</span>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
            <CheckCircle2 className="size-3.5" />
            Active
          </span>
        </div>

        <div className="w-full overflow-x-auto relative z-10">
          {assets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-500 font-mono text-xs gap-2">
              <HardDrive className="size-8 opacity-40" />
              <span>No S3 assets uploaded yet. Drag & drop files on the right to upload to Backblaze.</span>
            </div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="text-zinc-400 text-xs font-mono uppercase tracking-wider border-b border-white/[0.08]">
                  <th className="pb-3 font-bold">Asset Name</th>
                  <th className="pb-3 font-bold">Size</th>
                  <th className="pb-3 font-bold">Uploaded</th>
                  <th className="pb-3 font-bold text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((asset) => (
                  <AssetItem key={asset.name} {...asset} onDelete={handleDelete} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Upload card */}
      <div
        onClick={() => fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className="w-full lg:w-[280px] shrink-0 my-auto self-center rounded-2xl border border-dashed border-white/[0.1] bg-gradient-to-br from-[#141418] to-[#0f0f12] hover:border-purple-500/50 hover:bg-[#161620] flex flex-col items-center justify-center gap-3.5 p-8 cursor-pointer transition-all group active:scale-[0.98]"
      >
        <div className="w-14 h-14 rounded-2xl border border-white/[0.08] bg-white/[0.03] group-hover:bg-purple-500/10 group-hover:border-purple-500/30 flex items-center justify-center transition-all shadow-inner">
          <Upload className="size-6 text-zinc-400 group-hover:text-purple-300 transition-colors" />
        </div>
        <div className="text-center">
          <p className="text-sm font-bold text-zinc-200 group-hover:text-white transition-colors">
            {uploading ? "Uploading to Backblaze..." : "Upload a file"}
          </p>
          <p className="text-xs text-zinc-500 mt-1">Drag & drop or browse</p>
          {uploadedFileName && (
            <p className="text-[10px] font-mono text-purple-400 mt-2 truncate max-w-[200px]" title={uploadedFileName}>
              {uploading ? "Uploading: " : "Last: "}{uploadedFileName}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function DashboardBento() {
  return (
    <div className="w-[96vw] max-w-[1700px] mx-auto pt-20 pb-6 px-2">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Bento 1: Charts */}
        <div className="lg:col-span-7 rounded-2xl border border-white/10 bg-[#0d0d11]/90 overflow-hidden shadow-2xl backdrop-blur-xl min-h-[560px] transition-all duration-300 hover:border-purple-500/20">
          <ChartsBentoContent />
        </div>

        {/* Bento 2: DB Clusters */}
        <div className="lg:col-span-5 rounded-2xl border border-white/10 bg-[#0d0d11]/90 overflow-hidden shadow-2xl backdrop-blur-xl self-start transition-all duration-300 hover:border-indigo-500/20">
          <DbBento />
        </div>

        {/* Bento 3: API Keys */}
        <div className="lg:col-span-5 rounded-2xl border border-white/10 bg-[#0d0d11]/90 overflow-hidden shadow-2xl backdrop-blur-xl self-start transition-all duration-300 hover:border-purple-500/20">
          <ApiKeyBento className="h-full min-h-[420px]" />
        </div>

        {/* Bento 4: Buckstream Assets */}
        <div className="lg:col-span-7 rounded-2xl border border-white/10 bg-[#0d0d11]/90 overflow-hidden shadow-2xl backdrop-blur-xl transition-all duration-300 hover:border-emerald-500/20">
          <BuckstreamBentoContent />
        </div>
      </div>
    </div>
  );
}
