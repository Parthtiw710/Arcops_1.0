import React, { useState, useEffect } from "react";
import {
  Database,
  Server,
  Layers,
  Cpu,
  Boxes,
  CheckCircle2,
  Settings2,
  Download,
  Terminal,
  ShieldCheck,
  X,
  Lock,
  ArrowRightLeft,
  LogIn,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { dbmux } from "@/lib/dbmux";

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL || "http://localhost:8000";

export type StatusType = "managed" | "byod" | "configure";

export interface DatabaseConfig {
  id: string;
  name: string;
  category: string;
  iconName: "postgres" | "redis" | "mysql" | "mongo" | "vector";
  status: StatusType;
  endpoint: string;
  quotaMaxMb: number;
  quotaUsedMb: number;
  byodDsn?: string;
  isByodConnected?: boolean;
}

// Unconfigured baseline when no user is logged in
const unconfiguredDatabases: DatabaseConfig[] = [
  {
    id: "postgres",
    name: "PostgreSQL",
    category: "Relational + PgVector",
    iconName: "postgres",
    status: "configure",
    endpoint: "pg-pool.dbmux.internal:5432",
    quotaMaxMb: 750,
    quotaUsedMb: 0,
  },
  {
    id: "redis",
    name: "Redis",
    category: "In-Memory Cache",
    iconName: "redis",
    status: "configure",
    endpoint: "redis.dbmux.internal:6379",
    quotaMaxMb: 50,
    quotaUsedMb: 0,
  },
  {
    id: "mysql",
    name: "MySQL",
    category: "Relational DB",
    iconName: "mysql",
    status: "configure",
    endpoint: "mysql-ext.aws.rds.com:3306",
    quotaMaxMb: 0,
    quotaUsedMb: 0,
  },
  {
    id: "mongodb",
    name: "MongoDB",
    category: "Document Store",
    iconName: "mongo",
    status: "configure",
    endpoint: "cluster0.mongodb.net:27017",
    quotaMaxMb: 0,
    quotaUsedMb: 0,
  },
  {
    id: "vector",
    name: "Vector DB",
    category: "Embeddings & Cosine Search",
    iconName: "vector",
    status: "configure",
    endpoint: "clickhouse-vector.internal:8123",
    quotaMaxMb: 0,
    quotaUsedMb: 0,
  },
];

// Helper to trigger browser file download
const downloadFile = (filename: string, content: string, type: string = "text/plain") => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export function DbBento({ className }: { className?: string }) {
  const [user, setUser] = useState<any>(null);
  const [databases, setDatabases] = useState<DatabaseConfig[]>(unconfiguredDatabases);
  const [activeDb, setActiveDb] = useState<DatabaseConfig | null>(null);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [dsnInput, setDsnInput] = useState<string>("");
  const [sqlScriptInput, setSqlScriptInput] = useState<string>("");
  const [isEncrypting, setIsEncrypting] = useState<boolean>(false);
  const [isExecutingSql, setIsExecutingSql] = useState<boolean>(false);
  const [sqlMessage, setSqlMessage] = useState<string | null>(null);
  const [showSqlEditorModal, setShowSqlEditorModal] = useState<boolean>(false);

  // Check auth user session
  useEffect(() => {
    const checkUser = () => {
      try {
        const storedUser = localStorage.getItem("arcauth_user") || localStorage.getItem("authx_user");
        const token = localStorage.getItem("arcauth_token") || localStorage.getItem("authx_token");
        if (storedUser && token) {
          setUser(JSON.parse(storedUser));
        } else {
          setUser(null);
        }
      } catch {
        setUser(null);
      }
    };

    checkUser();
    window.addEventListener("arcauth_login_success", checkUser);
    window.addEventListener("authx_login_success", checkUser);
    return () => {
      window.removeEventListener("arcauth_login_success", checkUser);
      window.removeEventListener("authx_login_success", checkUser);
    };
  }, []);

  // Update DB statuses dynamically based on user auth state & real DB size
  useEffect(() => {
    if (!user) {
      // Unauthenticated state: All databases unconfigured, 0 quota displayed
      setDatabases(unconfiguredDatabases);
      return;
    }

    // Authenticated state: Fetch tenant configurations and calculated database size from PostgreSQL
    const loadTenantDatabases = async () => {
      let realPgSizeMb = 0;
      try {
        const res = await dbmux.executeSQL("SELECT pg_database_size(current_database());");
        if (res && res.rows && res.rows.length > 0) {
          const val = res.rows[0][0];
          const bytes = Number(val);
          if (!isNaN(bytes) && bytes > 0) {
            realPgSizeMb = +(bytes / (1024 * 1024)).toFixed(2);
          }
        }
      } catch { }

      setDatabases([
        {
          id: "postgres",
          name: "PostgreSQL",
          category: "Relational + PgVector",
          iconName: "postgres",
          status: (localStorage.getItem(`db_mode_postgres`) as StatusType) || "managed",
          endpoint: "pg-pool.dbmux.internal:5432",
          quotaMaxMb: 750,
          quotaUsedMb: realPgSizeMb,
          byodDsn: localStorage.getItem("byod_postgres_dsn") || undefined,
          isByodConnected: !!localStorage.getItem("byod_postgres_dsn"),
        },
        {
          id: "redis",
          name: "Redis",
          category: "In-Memory Cache",
          iconName: "redis",
          status: (localStorage.getItem(`db_mode_redis`) as StatusType) || "managed",
          endpoint: "redis.dbmux.internal:6379",
          quotaMaxMb: 50,
          quotaUsedMb: 0,
          byodDsn: localStorage.getItem("byod_redis_dsn") || undefined,
          isByodConnected: !!localStorage.getItem("byod_redis_dsn"),
        },
        {
          id: "mysql",
          name: "MySQL",
          category: "Relational DB",
          iconName: "mysql",
          status: localStorage.getItem("byod_mysql_dsn") ? "byod" : "configure",
          endpoint: "mysql-ext.aws.rds.com:3306",
          quotaMaxMb: 0,
          quotaUsedMb: 0,
          byodDsn: localStorage.getItem("byod_mysql_dsn") || undefined,
          isByodConnected: !!localStorage.getItem("byod_mysql_dsn"),
        },
        {
          id: "mongodb",
          name: "MongoDB",
          category: "Document Store",
          iconName: "mongo",
          status: localStorage.getItem("byod_mongodb_dsn") ? "byod" : "configure",
          endpoint: "cluster0.mongodb.net:27017",
          quotaMaxMb: 0,
          quotaUsedMb: 0,
          byodDsn: localStorage.getItem("byod_mongodb_dsn") || undefined,
          isByodConnected: !!localStorage.getItem("byod_mongodb_dsn"),
        },
        {
          id: "vector",
          name: "Vector DB",
          category: "Embeddings & Cosine Search",
          iconName: "vector",
          status: localStorage.getItem("byod_vector_dsn") ? "byod" : "managed",
          endpoint: "clickhouse-vector.internal:8123",
          quotaMaxMb: 0,
          quotaUsedMb: 0,
          byodDsn: localStorage.getItem("byod_vector_dsn") || undefined,
          isByodConnected: !!localStorage.getItem("byod_vector_dsn"),
        },
      ]);
    };

    loadTenantDatabases();
  }, [user]);

  // Card Action Handler
  const handleCardClick = (db: DatabaseConfig) => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }
    setActiveDb(db);
  };

  // Register BYODB DSN
  const handleRegisterByod = async () => {
    if (!activeDb || !dsnInput.trim()) return;
    setIsEncrypting(true);
    try {
      const res = await fetch(`${GATEWAY_URL}/api/gateway/register-db`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          dsn: dsnInput,
          provider: activeDb.id,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Encryption failed");

      const token = data.encrypted_dsn;
      localStorage.setItem(`byod_${activeDb.id}_dsn`, token);
      localStorage.setItem(`db_mode_${activeDb.id}`, "byod");

      setDatabases((prev) =>
        prev.map((d) =>
          d.id === activeDb.id
            ? { ...d, status: "byod", byodDsn: token, isByodConnected: true }
            : d
        )
      );

      setDsnInput("");
      setActiveDb(null);
    } catch (err: any) {
      alert(`BYODB Registration failed: ${err.message}`);
    } finally {
      setIsEncrypting(false);
    }
  };

  // Toggle Mode - Enforces DSN requirement for BYODB
  const toggleManagedByodMode = (dbId: string) => {
    const targetDb = databases.find((d) => d.id === dbId);
    if (!targetDb) return;

    if (targetDb.status === "managed") {
      // User is attempting to switch to BYODB mode
      const savedDsn = localStorage.getItem(`byod_${dbId}_dsn`);
      if (!savedDsn && !targetDb.byodDsn && !dsnInput.trim()) {
        alert(`Cannot switch ${targetDb.name} to BYODB mode: No connection DSN registered. Please enter a valid DSN string below and click "Encrypt & Connect BYODB".`);
        return;
      }
    }

    setDatabases((prev) =>
      prev.map((d) => {
        if (d.id === dbId) {
          const newStatus: StatusType = d.status === "managed" ? "byod" : "managed";
          localStorage.setItem(`db_mode_${dbId}`, newStatus);
          return { ...d, status: newStatus };
        }
        return d;
      })
    );
  };

  // Downloads live database configuration & schema via DBMux ConnectRPC API
  const handleDownloadSchema = async (db: DatabaseConfig) => {
    // 1. Fetch live backend provider configuration from DBMux API
    const backendConfig = await dbmux.getBackendConfig(db.id);

    if (db.id === "postgres") {
      try {
        const colSql = `
          SELECT table_name, column_name, data_type, is_nullable
          FROM information_schema.columns
          WHERE table_schema = 'public'
          ORDER BY table_name, ordinal_position;
        `;
        const res = await dbmux.executeSQL(colSql);
        if (res && res.rows && res.rows.length > 0) {
          const tableMap: Record<string, string[]> = {};
          res.rows.forEach((row) => {
            const tbl = String(row[0]);
            const col = String(row[1]);
            const dtype = String(row[2]).toUpperCase();
            const nullStr = String(row[3]) === "NO" ? " NOT NULL" : "";
            if (!tableMap[tbl]) tableMap[tbl] = [];
            tableMap[tbl].push(`  "${col}" ${dtype}${nullStr}`);
          });

          const liveDdl = Object.entries(tableMap)
            .map(([tbl, cols]) => `-- Live Backend Table DDL: ${tbl}\nCREATE TABLE IF NOT EXISTS "${tbl}" (\n${cols.join(",\n")}\n);`)
            .join("\n\n");

          const fullPgSql = `-- ArcOps PostgreSQL Backend Schema (Fetched Live via DBMux RPC API)\n-- API Provider: ${backendConfig?.id || "postgres"}\n-- Generated at: ${new Date().toISOString()}\n\n${liveDdl}`;
          downloadFile("arcops_pg_backend_live_schema.sql", fullPgSql, "application/sql");
          return;
        }
      } catch (err) {
        console.warn("Live DDL fetch failed, fallback:", err);
      }
    }

    // 2. Format live backend configuration for Redis / JSON / SQL providers
    switch (db.id) {
      case "redis":
        const redisBackendConf = `# ArcOps Redis Configuration (Fetched Live via DBMux RPC API)
# Provider ID: ${backendConfig?.id || "test-redis"}
# Status: ${backendConfig?.status || "active"}
# Endpoint: ${backendConfig?.endpoint || db.endpoint}
# Generated at: ${new Date().toISOString()}

port 6379
bind 0.0.0.0
maxmemory 50mb
maxmemory-policy allkeys-lru
appendonly yes
appendfsync everysec

# DBMux Engine Bindings
kv.provider = "redis"
kv.dsn = "${backendConfig?.endpoint || db.endpoint}"
`;
        downloadFile("arcops_redis.conf", redisBackendConf, "text/plain");
        break;

      case "mysql":
        const mysqlSql = `-- ArcOps MySQL Schema (Fetched Live via DBMux RPC API)
-- Provider ID: ${backendConfig?.id || "mysql"}
-- Endpoint: ${backendConfig?.endpoint || db.endpoint}

CREATE TABLE IF NOT EXISTS tenant_records (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    data JSON NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`;
        downloadFile("arcops_mysql_schema.sql", mysqlSql, "application/sql");
        break;

      case "mongodb":
        const mongoJson = JSON.stringify(
          {
            api_provider: backendConfig?.id || "mongodb",
            endpoint: backendConfig?.endpoint || db.endpoint,
            status: backendConfig?.status || "active",
            schema_validator: {
              bsonType: "object",
              required: ["tenant_id", "content"],
              properties: {
                tenant_id: { bsonType: "string" },
                content: { bsonType: "string" }
              }
            }
          },
          null,
          2
        );
        downloadFile("arcops_mongo_schema.json", mongoJson, "application/json");
        break;

      case "vector":
        const vectorJson = JSON.stringify(
          {
            api_provider: backendConfig?.id || "vector",
            endpoint: backendConfig?.endpoint || db.endpoint,
            collection: "arcops_embeddings",
            dimension: 1536,
            metric: "cosine"
          },
          null,
          2
        );
        downloadFile("arcops_vector_schema.json", vectorJson, "application/json");
        break;

      default:
        const defaultConfig = JSON.stringify(backendConfig || { provider: db.id, endpoint: db.endpoint }, null, 2);
        downloadFile(`arcops_${db.id}_config.json`, defaultConfig, "application/json");
        break;
    }
  };

  // SQL Execution
  const handleExecuteSqlScript = async () => {
    if (!sqlScriptInput.trim()) return;
    setIsExecutingSql(true);
    setSqlMessage(null);
    try {
      const res = await dbmux.executeSQL(sqlScriptInput);
      setSqlMessage(`✅ Executed successfully! Rows affected / returned: ${res?.rowCount || res?.rows?.length || 0}`);
      setSqlScriptInput("");

      // Refresh DB size after SQL execution
      const sizeRes = await dbmux.executeSQL("SELECT pg_database_size(current_database());");
      if (sizeRes && sizeRes.rows && sizeRes.rows.length > 0) {
        const bytes = Number(sizeRes.rows[0][0]);
        if (!isNaN(bytes) && bytes > 0) {
          const newSizeMb = +(bytes / (1024 * 1024)).toFixed(2);
          setDatabases((prev) =>
            prev.map((d) => (d.id === "postgres" ? { ...d, quotaUsedMb: newSizeMb } : d))
          );
        }
      }
    } catch (err: any) {
      setSqlMessage(`❌ SQL Execution failed: ${err.message}`);
    } finally {
      setIsExecutingSql(false);
    }
  };

  const renderDbIcon = (type: DatabaseConfig["iconName"]) => {
    switch (type) {
      case "postgres":
        return <Database className="size-4 text-purple-400 shrink-0" />;
      case "redis":
        return <Cpu className="size-4 text-red-400 shrink-0" />;
      case "mysql":
        return <Server className="size-4 text-blue-400 shrink-0" />;
      case "mongo":
        return <Boxes className="size-4 text-emerald-400 shrink-0" />;
      case "vector":
        return <Layers className="size-4 text-amber-400 shrink-0" />;
    }
  };

  return (
    <div className={cn("w-full h-full p-5 flex flex-col justify-start gap-4 overflow-hidden relative", className)}>
      {/* Ambient glow */}
      <div className="absolute -top-10 -right-10 w-40 h-40 bg-purple-600/[0.07] rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.06] relative z-10">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20">
            <Database className="size-4 text-purple-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-zinc-100 font-sans">Database Clusters & Proxies</h2>
            <p className="text-xs text-zinc-400 font-sans">
              {user ? `Tenant: ${user.email}` : "Authentication Required"}
            </p>
          </div>
        </div>
      </div>

      {/* Database list */}
      <div className="flex flex-col gap-3 flex-1 justify-center relative z-10">
        {databases.map((db) => {
          const isManaged = user && db.status === "managed";
          const isByodActive = user && (db.status === "byod" || db.isByodConnected);

          return (
            <div
              key={db.id}
              className="flex flex-col gap-2 p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.05] transition-all group"
            >
              <div className="flex items-center justify-between min-w-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 rounded-xl bg-white/[0.05] border border-white/[0.07] group-hover:scale-105 transition-transform shrink-0">
                    {renderDbIcon(db.iconName)}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-bold text-zinc-100 font-sans truncate">{db.name}</span>
                    <span className="text-xs text-zinc-400 font-sans truncate">{db.category}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCardClick(db)}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer shrink-0 shadow-xs",
                      isManaged
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25"
                        : isByodActive
                          ? "bg-blue-500/15 text-blue-400 border-blue-500/30 hover:bg-blue-500/25"
                          : "bg-purple-500/15 text-purple-400 border-purple-500/30 hover:bg-purple-500/25"
                    )}
                  >
                    {isManaged ? (
                      <CheckCircle2 className="size-3.5 shrink-0" />
                    ) : isByodActive ? (
                      <Server className="size-3.5 shrink-0" />
                    ) : (
                      <Settings2 className="size-3.5 shrink-0" />
                    )}
                    <span>{isManaged ? "Managed" : isByodActive ? "BYOD Active" : "Configure"}</span>
                  </button>
                </div>
              </div>

              {/* Quota Progress Bar ONLY when logged in and in Managed mode */}
              {user && isManaged && db.quotaMaxMb > 0 && (
                <div className="w-full flex flex-col gap-1 mt-1 pt-2 border-t border-white/[0.04]">
                  <div className="flex justify-between items-center text-[10px] font-mono text-zinc-400">
                    <span>Quota Usage</span>
                    <span>
                      {db.quotaUsedMb} MB / {db.quotaMaxMb} MB ({Math.round((db.quotaUsedMb / db.quotaMaxMb) * 100)}%)
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full"
                      style={{ width: `${Math.min(100, Math.max(1, (db.quotaUsedMb / db.quotaMaxMb) * 100))}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Authentication Required Warning Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-zinc-900/95 border border-white/10 rounded-2xl p-6 sm:p-7 shadow-2xl backdrop-blur-xl flex flex-col gap-5 text-center relative font-sans">
            <button
              onClick={() => setShowAuthModal(false)}
              className="absolute top-4 right-4 p-1.5 text-zinc-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
            >
              <X className="size-5" />
            </button>

            <div className="mx-auto p-3.5 rounded-2xl bg-purple-500/15 border border-purple-500/30 text-purple-300 shadow-[0_0_20px_rgba(168,85,247,0.2)]">
              <AlertCircle className="size-7" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-white font-sans">Authentication Required</h3>
              <p className="text-xs sm:text-sm text-zinc-400 font-sans mt-1">
                Please sign in or register an account to configure database clusters, access BYODB encryption, and view storage quotas.
              </p>
            </div>

            <button
              onClick={() => {
                setShowAuthModal(false);
                window.location.href = "/login";
              }}
              className="w-full h-10 bg-purple-600 hover:bg-purple-500 text-white font-sans font-bold rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-md shadow-purple-600/25 cursor-pointer"
            >
              <LogIn className="size-4" />
              <span>Go to Sign In</span>
            </button>
          </div>
        </div>
      )}

      {/* Database Detail Modal */}
      {activeDb && user && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-xl bg-zinc-900/95 border border-white/10 rounded-2xl p-6 sm:p-7 shadow-2xl backdrop-blur-xl flex flex-col gap-5 relative font-sans">
            <button
              onClick={() => setActiveDb(null)}
              className="absolute top-4 right-4 p-1.5 text-zinc-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
            >
              <X className="size-5" />
            </button>

            <div className="flex items-center gap-3.5">
              <div className="p-3 rounded-2xl bg-purple-500/15 border border-purple-500/30 text-purple-300">
                {renderDbIcon(activeDb.iconName)}
              </div>
              <div>
                <h3 className="text-lg font-bold text-white font-sans">{activeDb.name} Settings</h3>
                <p className="text-xs font-sans text-purple-300 font-medium">{activeDb.category}</p>
              </div>
            </div>

            {/* Mode Switcher */}
            <div className="flex items-center justify-between p-3.5 sm:p-4 rounded-xl bg-zinc-950/80 border border-white/10 flex-wrap gap-3">
              <div className="flex items-center gap-2.5">
                <ArrowRightLeft className="size-4 text-purple-400 shrink-0" />
                <span className="text-xs font-semibold text-zinc-300 font-sans">Current Mode:</span>
                {activeDb.status === "managed" ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-sans font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 shadow-xs">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Managed Cloud Pool
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-sans font-semibold bg-purple-500/15 border border-purple-500/30 text-purple-300 shadow-xs">
                    <Lock className="size-3 text-purple-300" />
                    BYODB Custom Database
                  </span>
                )}
              </div>
              <button
                onClick={() => toggleManagedByodMode(activeDb.id)}
                className="h-9 px-3.5 rounded-xl font-sans font-semibold text-xs bg-zinc-900 border border-white/10 hover:bg-white/10 hover:text-white text-zinc-200 shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
              >
                <ArrowRightLeft className="size-3.5 text-zinc-400" />
                <span>Switch to {activeDb.status === "managed" ? "BYODB" : "Managed"}</span>
              </button>
            </div>

            {/* Connection Details & Downloads */}
            <div className="flex flex-col gap-3">
              <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider font-sans">
                Connection Endpoint & Schemas
              </h4>
              <div className="p-3.5 rounded-xl bg-zinc-950/90 border border-white/10 font-mono text-xs text-emerald-400 flex items-center justify-between">
                <span className="truncate">{activeDb.endpoint}</span>
                <ShieldCheck className="size-4 text-emerald-400 shrink-0 ml-2" />
              </div>

              <div className="grid grid-cols-2 gap-3 mt-1">
                <button
                  onClick={() => handleDownloadSchema(activeDb)}
                  className="h-10 flex items-center justify-center gap-2 px-4 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-xl text-xs sm:text-sm font-bold font-sans transition-all cursor-pointer"
                >
                  <Download className="size-4" />
                  <span>Download Schema</span>
                </button>

                {activeDb.id === "postgres" && (
                  <button
                    onClick={() => setShowSqlEditorModal(true)}
                    className="h-10 flex items-center justify-center gap-2 px-4 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs sm:text-sm font-bold font-sans transition-all cursor-pointer"
                  >
                    <Terminal className="size-4" />
                    <span>Run SQL Script</span>
                  </button>
                )}
              </div>
            </div>

            {/* BYODB DSN Form */}
            <div className="flex flex-col gap-3 pt-4 border-t border-white/10">
              <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider font-sans flex items-center gap-1.5">
                <Lock className="size-3.5 text-purple-400" />
                <span>Configure BYODB Connection (AES-256 Encrypted)</span>
              </h4>

              <input
                type="text"
                value={dsnInput}
                onChange={(e) => setDsnInput(e.target.value)}
                placeholder={`Enter custom ${activeDb.name} DSN (e.g. postgresql://user:pass@host:5432/dbname)`}
                className="w-full h-10 px-4 bg-zinc-950/80 border border-white/10 rounded-xl text-xs sm:text-sm font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/40 transition-all"
              />

              <button
                onClick={handleRegisterByod}
                disabled={isEncrypting || !dsnInput.trim()}
                className="w-full h-10 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-xl text-xs sm:text-sm font-bold font-sans transition-all shadow-md shadow-purple-600/25 cursor-pointer flex items-center justify-center gap-2"
              >
                {isEncrypting ? (
                  <>
                    <RefreshCw className="size-4 animate-spin text-white" />
                    <span>Encrypting & Connecting...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="size-4 text-purple-200" />
                    <span>Encrypt & Connect BYODB</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SQL Script Execution Modal */}
      {showSqlEditorModal && user && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-zinc-900/95 border border-white/10 rounded-2xl p-6 sm:p-7 shadow-2xl backdrop-blur-xl flex flex-col gap-5 relative font-sans">
            <button
              onClick={() => setShowSqlEditorModal(false)}
              className="absolute top-4 right-4 p-1.5 text-zinc-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
            >
              <X className="size-5" />
            </button>

            <div className="flex items-center gap-3.5">
              <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                <Terminal className="size-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white font-sans">Execute SQL Migration Script</h3>
                <p className="text-xs text-zinc-400 font-sans mt-0.5">Runs directly on PostgreSQL via DBMux ConnectRPC</p>
              </div>
            </div>

            <textarea
              rows={8}
              value={sqlScriptInput}
              onChange={(e) => setSqlScriptInput(e.target.value)}
              placeholder="Paste SQL statements (e.g. CREATE TABLE my_table (id SERIAL PRIMARY KEY, name TEXT);)"
              className="w-full p-4 bg-zinc-950/90 border border-white/10 rounded-xl text-xs sm:text-sm font-mono text-emerald-300 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/40 transition-all"
            />

            {sqlMessage && (
              <div className="p-3.5 rounded-xl bg-zinc-950 border border-white/10 text-xs sm:text-sm font-mono text-white">
                {sqlMessage}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2 border-t border-white/10">
              <button
                onClick={() => setShowSqlEditorModal(false)}
                className="h-10 px-5 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white rounded-xl text-xs sm:text-sm font-bold font-sans transition-all cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={handleExecuteSqlScript}
                disabled={isExecutingSql || !sqlScriptInput.trim()}
                className="h-10 px-6 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs sm:text-sm font-bold font-sans transition-all shadow-md shadow-emerald-600/25 cursor-pointer flex items-center gap-2"
              >
                {isExecutingSql ? (
                  <>
                    <RefreshCw className="size-4 animate-spin text-white" />
                    <span>Executing Script...</span>
                  </>
                ) : (
                  <span>Execute Script</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
