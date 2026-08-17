// @ts-nocheck
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  MarkerType,
  NodeProps,
  Edge,
  Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Table2,
  Key,
  Search,
  Copy,
  Check,
  MoreVertical,
  ChevronDown,
  Sparkles,
  Layers,
  Fingerprint,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { dbmux } from "@/lib/dbmux";

export interface ColumnMeta {
  name: string;
  type: string;
  isNullable: boolean;
  isIdentity: boolean;
  isPk: boolean;
  isUnique: boolean;
}

export interface TableMeta {
  id: string;
  name: string;
  columns: ColumnMeta[];
}

export interface FKRelation {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
}

export type SupabaseNode = Node<{ label: string; columns: ColumnMeta[] }, "supabaseTable">;

function formatPgDataType(rawType: string): string {
  const t = rawType.toLowerCase().trim();
  if (t === "character varying" || t.startsWith("varchar")) return "varchar";
  if (t === "double precision") return "float8";
  if (t === "timestamp without time zone") return "timestamp";
  if (t === "timestamp with time zone") return "timestamptz";
  if (t === "integer") return "int4";
  if (t === "bigint") return "int8";
  if (t === "smallint") return "int2";
  if (t === "boolean") return "bool";
  if (t === "user-defined") return "enum";
  return t;
}

// ArcOps themed Table Node Component
function SupabaseTableNode({ data }: NodeProps<SupabaseNode>) {
  return (
    <div className="w-96 rounded-2xl bg-zinc-900/95 border border-white/10 shadow-2xl overflow-hidden font-sans select-none hover:border-purple-500/60 transition-all backdrop-blur-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-zinc-950/90 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-purple-500/15 border border-purple-500/30 text-purple-300">
            <Table2 className="size-4.5" />
          </div>
          <span className="font-bold text-white text-base font-sans truncate max-w-[240px]">{data.label}</span>
        </div>
        <button type="button" className="text-zinc-400 hover:text-white transition-colors p-1 rounded-md hover:bg-white/10">
          <MoreVertical className="size-4.5" />
        </button>
      </div>

      {/* Columns */}
      <div className="flex flex-col divide-y divide-white/5 bg-zinc-900/60 font-sans">
        {data.columns.map((col) => (
          <div
            key={col.name}
            className="relative flex items-center justify-between px-5 py-3 hover:bg-purple-500/10 transition-colors group"
          >
            {/* Left Connect Handle */}
            <Handle
              type="target"
              position={Position.Left}
              id={`${col.name}-left`}
              className="!w-3 !h-3 !bg-purple-500 !border-none !-left-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
            />

            {/* Icon + Column Name */}
            <div className="flex items-center gap-2.5 min-w-0 pr-2">
              {col.isPk ? (
                <span title="Primary Key" className="flex items-center justify-center shrink-0">
                  <Key className="size-4 text-amber-400" />
                </span>
              ) : col.isUnique ? (
                <span title="Unique" className="flex items-center justify-center shrink-0">
                  <Fingerprint className="size-4 text-emerald-400" />
                </span>
              ) : col.isNullable ? (
                <span className="inline-block size-2 rounded-full border border-zinc-400 shrink-0 ml-0.5" title="Nullable" />
              ) : (
                <span className="inline-block size-2 rounded-full bg-zinc-200 shrink-0 ml-0.5" title="Non-Nullable" />
              )}
              <span className="font-bold text-zinc-100 group-hover:text-white transition-colors truncate font-sans text-sm sm:text-base">{col.name}</span>
            </div>

            {/* Data Type */}
            <span className="text-xs sm:text-sm text-purple-300 font-mono font-bold shrink-0">{col.type}</span>

            {/* Right Connect Handle */}
            <Handle
              type="source"
              position={Position.Right}
              id={`${col.name}-right`}
              className="!w-3 !h-3 !bg-purple-500 !border-none !-right-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SchemaVisualizerPage() {
  const [nodes, setNodes, onNodesChange] = useNodesState<SupabaseNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [rawTables, setRawTables] = useState<TableMeta[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedSql, setCopiedSql] = useState(false);
  const [loading, setLoading] = useState(true);

  const nodeTypes = useMemo(() => ({ supabaseTable: SupabaseTableNode }), []);

  const fetchLiveSchema = useCallback(async () => {
    setLoading(true);
    try {
      const colSql = `
        SELECT
          t.table_name,
          c.column_name,
          c.data_type,
          c.is_nullable,
          c.column_default,
          tc.constraint_type
        FROM information_schema.tables t
        JOIN information_schema.columns c ON t.table_name = c.table_name AND t.table_schema = c.table_schema
        LEFT JOIN information_schema.key_column_usage kcu ON t.table_name = kcu.table_name AND c.column_name = kcu.column_name AND t.table_schema = kcu.table_schema
        LEFT JOIN information_schema.table_constraints tc ON kcu.constraint_name = tc.constraint_name AND t.table_schema = tc.table_schema
        WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
        ORDER BY t.table_name, c.ordinal_position;
      `;

      const fkSql = `
        SELECT
          kcu.table_name AS from_table,
          kcu.column_name AS from_column,
          ccu.table_name AS to_table,
          ccu.column_name AS to_column
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public';
      `;

      const [colRes, fkRes] = await Promise.all([
        dbmux.executeSQL(colSql),
        dbmux.executeSQL(fkSql).catch(() => ({ rows: [] })),
      ]);

      const tableMap: Record<string, TableMeta> = {};
      if (colRes && colRes.rows) {
        colRes.rows.forEach((row) => {
          const tableName = String(row[0]);
          const colName = String(row[1]);
          const dataType = formatPgDataType(String(row[2]));
          const isNullable = String(row[3]) === "YES";
          const colDefault = String(row[4] || "");
          const constraintType = String(row[5] || "");

          if (!tableMap[tableName]) {
            tableMap[tableName] = { id: tableName, name: tableName, columns: [] };
          }

          const existingCol = tableMap[tableName].columns.find((c) => c.name === colName);
          if (!existingCol) {
            tableMap[tableName].columns.push({
              name: colName,
              type: dataType,
              isNullable,
              isIdentity: colDefault.includes("nextval") || colDefault.includes("identity"),
              isPk: constraintType === "PRIMARY KEY",
              isUnique: constraintType === "UNIQUE",
            });
          } else {
            if (constraintType === "PRIMARY KEY") existingCol.isPk = true;
            if (constraintType === "UNIQUE") existingCol.isUnique = true;
          }
        });
      }

      const tablesList = Object.values(tableMap);
      setRawTables(tablesList);

      const fks: FKRelation[] = (fkRes?.rows || []).map((r) => ({
        fromTable: String(r[0]),
        fromColumn: String(r[1]),
        toTable: String(r[2]),
        toColumn: String(r[3]),
      }));

      const flowNodes: SupabaseNode[] = tablesList.map((t, idx) => ({
        id: t.id,
        type: "supabaseTable",
        position: {
          x: 100 + (idx % 3) * 400,
          y: 80 + Math.floor(idx / 3) * 440,
        },
        data: {
          label: t.name,
          columns: t.columns,
        },
      }));

      const flowEdges: Edge[] = fks.map((fk, idx) => ({
        id: `fk-${idx}`,
        source: fk.fromTable,
        target: fk.toTable,
        sourceHandle: `${fk.fromColumn}-right`,
        targetHandle: `${fk.toColumn}-left`,
        type: "smoothstep",
        animated: true,
        style: { stroke: "#a855f7", strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#a855f7" },
      }));

      setNodes(flowNodes);
      setEdges(flowEdges);
    } catch (err) {
      console.error("Schema query error:", err);
      setRawTables([]);
      setNodes([]);
      setEdges([]);
    } finally {
      setLoading(false);
    }
  }, [setNodes, setEdges]);

  useEffect(() => {
    fetchLiveSchema();
    window.addEventListener("arcauth_login_success", fetchLiveSchema);
    return () => window.removeEventListener("arcauth_login_success", fetchLiveSchema);
  }, [fetchLiveSchema]);

  const filteredNodes = useMemo(() => {
    if (!searchQuery.trim()) return nodes;
    return nodes.filter((n) =>
      String(n.data.label || "").toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [nodes, searchQuery]);

  const handleAutoLayout = () => {
    setNodes((prev) =>
      prev.map((node, idx) => ({
        ...node,
        position: {
          x: 100 + (idx % 3) * 400,
          y: 80 + Math.floor(idx / 3) * 440,
        },
      }))
    );
  };

  const handleCopySql = () => {
    if (rawTables.length === 0) return;
    const ddl = rawTables
      .map((tbl) => {
        const cols = tbl.columns
          .map(
            (c) =>
              `  ${c.name} ${c.type.toUpperCase()}${c.isPk ? " PRIMARY KEY" : ""}${!c.isNullable ? " NOT NULL" : ""}`
          )
          .join(",\n");
        return `CREATE TABLE ${tbl.name} (\n${cols}\n);`;
      })
      .join("\n\n");

    navigator.clipboard.writeText(ddl);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  return (
    <div className="w-[98vw] max-w-[1850px] mx-auto my-3 h-[calc(100vh-100px)] overflow-hidden flex flex-col gap-3 font-sans px-2">
      {/* ReactFlow Controls Dark Theme Override Styles */}
      <style>{`
        .react-flow__controls {
          background-color: rgba(18, 18, 22, 0.9) !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          border-radius: 12px !important;
          box-shadow: 0 20px 30px -10px rgba(0, 0, 0, 0.6) !important;
          backdrop-filter: blur(16px) !important;
          overflow: hidden !important;
        }
        .react-flow__controls-button {
          background-color: transparent !important;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
          fill: #a1a1aa !important;
          color: #a1a1aa !important;
          width: 32px !important;
          height: 32px !important;
        }
        .react-flow__controls-button:last-child {
          border-bottom: none !important;
        }
        .react-flow__controls-button:hover {
          background-color: rgba(168, 85, 247, 0.15) !important;
          fill: #ffffff !important;
          color: #ffffff !important;
        }
        .react-flow__controls-button svg {
          max-width: 14px !important;
          max-height: 14px !important;
          fill: currentColor !important;
        }
      `}</style>

      {/* Ultra-Minimal Header */}
      <div className="flex items-center justify-between px-5 py-3.5 rounded-xl border border-white/10 bg-zinc-900/90 backdrop-blur-xl shadow-lg shrink-0">
        <div className="flex items-center gap-3.5">
          <div className="p-2 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-300">
            <Workflow className="size-5" />
          </div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg sm:text-xl font-extrabold text-white font-sans tracking-tight">
              Schema Visualizer
            </h1>
            <span className="text-sm text-zinc-400 font-sans font-medium">· public schema</span>
          </div>
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Find table..."
              className="w-full h-10 bg-zinc-950/80 border border-white/10 focus:border-purple-500/60 rounded-xl pl-10 pr-4 text-xs sm:text-sm text-white placeholder-zinc-500 outline-none transition-all font-sans"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleCopySql}
            disabled={rawTables.length === 0}
            className="h-10 px-4 text-xs sm:text-sm font-sans font-semibold gap-2 bg-zinc-950/80 border-white/10 hover:bg-white/10 hover:text-white text-zinc-200 shadow-xs transition-all cursor-pointer"
          >
            {copiedSql ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4 text-zinc-400" />}
            <span>{copiedSql ? "Copied" : "Copy DDL"}</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleAutoLayout}
            className="h-10 px-4 text-xs sm:text-sm font-sans font-bold gap-2 bg-purple-600 hover:bg-purple-500 text-white border-transparent shadow-sm shadow-purple-600/20 transition-all cursor-pointer"
          >
            <Sparkles className="size-4 text-purple-200" />
            <span>Auto layout</span>
          </Button>
        </div>
      </div>

      {/* Main Large Interactive ReactFlow Canvas */}
      <div data-lenis-prevent className="w-full flex-1 min-h-0 rounded-2xl border border-white/10 bg-zinc-950/90 relative overflow-hidden shadow-2xl backdrop-blur-xl">
        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-zinc-400 font-mono text-xs z-30 bg-zinc-950/95">
            <Layers className="size-8 text-purple-400 animate-pulse" />
            <span>Connecting to PostgreSQL schema via DBMux ConnectRPC...</span>
          </div>
        ) : (
          <ReactFlow
            nodes={filteredNodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ maxZoom: 0.85, padding: 0.5 }}
            minZoom={0.2}
            maxZoom={1.5}
            proOptions={{ hideAttribution: true }}
            className="bg-zinc-950"
          >
            {/* Fine Dot Matrix Pattern */}
            <Background color="#3f3f46" gap={24} size={1} />
            <Controls className="!bg-zinc-900/90 !border-white/10 !text-zinc-200 !rounded-2xl overflow-hidden shadow-2xl" />

            {/* Dark MiniMap */}
            <MiniMap
              nodeColor="#3f3f46"
              maskColor="rgba(9, 9, 11, 0.85)"
              className="!bg-zinc-900/90 !border-white/10 !rounded-2xl !shadow-2xl overflow-hidden"
              zoomable
              pannable
            />

            {/* Dark Legend Panel */}
            <Panel position="bottom-center" className="!mb-4">
              <div className="flex items-center gap-6 px-5 py-2.5 rounded-2xl bg-zinc-900/90 backdrop-blur-xl border border-white/10 text-xs font-mono text-zinc-300 shadow-2xl">
                <div className="flex items-center gap-1.5">
                  <Key className="size-3.5 text-amber-400" />
                  <span className="text-zinc-200 font-medium">Primary key</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Fingerprint className="size-3.5 text-emerald-400" />
                  <span className="text-zinc-200 font-medium">Unique</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block size-2 rounded-full border border-zinc-400" />
                  <span className="text-zinc-200 font-medium">Nullable</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block size-2 rounded-full bg-zinc-300" />
                  <span className="text-zinc-200 font-medium">Non-Nullable</span>
                </div>
              </div>
            </Panel>
          </ReactFlow>
        )}
      </div>
    </div>
  );
}
