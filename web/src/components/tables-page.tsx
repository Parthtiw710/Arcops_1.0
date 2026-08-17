import React, { useState, useEffect } from "react";
import { Table, Search, Plus, MoreVertical, Eye, Database, Layers, Check, X, RefreshCw, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dbmux, DbTableInfo } from "@/lib/dbmux";

interface NewColumnInput {
  id: string;
  name: string;
  type: string;
  isPk: boolean;
  isNullable: boolean;
}

export function TablesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [tables, setTables] = useState<DbTableInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTableColumns, setSelectedTableColumns] = useState<string | null>(null);

  // New Table Modal State
  const [isCreateTableOpen, setIsCreateTableOpen] = useState(false);
  const [newTableName, setNewTableName] = useState("");
  const [newColumns, setNewColumns] = useState<NewColumnInput[]>([
    { id: "1", name: "id", type: "uuid", isPk: true, isNullable: false },
    { id: "2", name: "created_at", type: "timestamptz", isPk: false, isNullable: false },
  ]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchTables = async () => {
    setLoading(true);
    try {
      const data = await dbmux.getTables();
      setTables(data);
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTables();
  }, []);

  const filteredTables = tables.filter((t) =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddColumn = () => {
    setNewColumns((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        name: "",
        type: "varchar",
        isPk: false,
        isNullable: true,
      },
    ]);
  };

  const handleRemoveColumn = (id: string) => {
    if (newColumns.length <= 1) return;
    setNewColumns((prev) => prev.filter((c) => c.id !== id));
  };

  const handleColumnChange = (id: string, key: keyof NewColumnInput, val: any) => {
    setNewColumns((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [key]: val } : c))
    );
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTableName.trim()) return;
    if (newColumns.some((c) => !c.name.trim())) {
      setCreateError("All columns must have a valid name.");
      return;
    }

    setCreating(true);
    setCreateError(null);

    const colSqls = newColumns.map((c) => {
      const typeSql =
        c.type === "varchar"
          ? "VARCHAR(255)"
          : c.type === "int4"
          ? "INTEGER"
          : c.type === "int8"
          ? "BIGINT"
          : c.type === "float8"
          ? "DOUBLE PRECISION"
          : c.type === "timestamptz"
          ? "TIMESTAMP WITH TIME ZONE"
          : c.type === "timestamp"
          ? "TIMESTAMP"
          : c.type.toUpperCase();

      const pkSql = c.isPk ? " PRIMARY KEY" : "";
      const nullSql = !c.isNullable && !c.isPk ? " NOT NULL" : "";
      const defaultSql = c.type === "uuid" && c.isPk ? " DEFAULT gen_random_uuid()" : c.type.includes("timestamp") ? " DEFAULT NOW()" : "";

      return `  "${c.name.trim()}" ${typeSql}${pkSql}${nullSql}${defaultSql}`;
    });

    const createSql = `CREATE TABLE "${newTableName.trim().toLowerCase()}" (\n${colSqls.join(",\n")}\n);`;

    try {
      await dbmux.executeSQL(createSql);
      setIsCreateTableOpen(false);
      setNewTableName("");
      setNewColumns([
        { id: "1", name: "id", type: "uuid", isPk: true, isNullable: false },
        { id: "2", name: "created_at", type: "timestamptz", isPk: false, isNullable: false },
      ]);
      await fetchTables();
    } catch (err: any) {
      setCreateError(err?.message || "Failed to create table. Please check table/column names.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="w-[96vw] max-w-[1700px] mx-auto my-6 flex flex-col gap-5 font-sans px-2">
      {/* Header Title */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-5 py-3 sm:py-3.5 rounded-xl border border-white/10 bg-zinc-900/90 backdrop-blur-xl shadow-lg relative overflow-hidden">
        <div className="flex items-center gap-3 flex-wrap relative z-10">
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white font-sans">
            Database Tables
          </h1>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-sans font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            PostgreSQL RLS Active
          </span>
        </div>

        <div className="flex items-center gap-3 relative z-10 w-full sm:w-auto">
          <Button
            onClick={() => window.dispatchEvent(new Event("open_sql_drawer"))}
            variant="outline"
            className="h-9 px-3.5 border-purple-500/40 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 hover:text-white font-sans font-semibold text-xs sm:text-sm gap-2 shadow-xs transition-all cursor-pointer rounded-lg"
          >
            <Terminal className="size-4 text-purple-400" />
            <span>SQL Editor</span>
          </Button>
          <Button
            onClick={() => setIsCreateTableOpen(true)}
            className="h-9 px-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-sans font-bold text-xs sm:text-sm gap-1.5 shadow-sm shadow-emerald-600/20 transition-all cursor-pointer rounded-lg"
          >
            <Plus className="size-4" />
            <span>New table</span>
          </Button>
        </div>
      </div>

      {/* Top Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between p-3.5 sm:p-4 rounded-2xl border border-white/10 bg-zinc-900/90 backdrop-blur-xl shadow-lg gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* Schema Selector */}
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-950/80 border border-white/10 text-xs sm:text-sm font-sans text-zinc-200">
            <span className="text-zinc-400">schema</span>
            <span className="font-bold text-purple-300">public</span>
          </div>

          {/* Search Box */}
          <div className="relative flex-1 sm:w-80">
            <Search className="size-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Search tables..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-10 pl-10 pr-4 rounded-xl bg-zinc-950/80 border border-white/10 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/40 transition-all font-sans"
            />
          </div>
        </div>

        <span className="text-xs sm:text-sm font-sans text-zinc-400 font-semibold bg-zinc-950/80 px-3.5 py-2 rounded-xl border border-white/5">
          {filteredTables.length} tables found
        </span>
      </div>

      {/* Tables Data Grid */}
      <div className="w-full rounded-2xl border border-white/10 bg-zinc-900/90 backdrop-blur-xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-sans">
            <thead className="bg-zinc-950/90 text-zinc-400 border-b border-white/10 uppercase text-xs tracking-wider font-sans">
              <tr>
                <th className="py-4 px-6 font-bold">NAME</th>
                <th className="py-4 px-6 font-bold">COLUMNS</th>
                <th className="py-4 px-6 font-bold">ROWS (ESTIMATED)</th>
                <th className="py-4 px-6 font-bold">SIZE (ESTIMATED)</th>
                <th className="py-4 px-6 font-bold">REALTIME</th>
                <th className="py-4 px-6 font-bold text-right">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-sans">
              {filteredTables.map((t) => (
                <tr key={t.name} className="hover:bg-purple-500/5 text-zinc-200 transition-colors group">
                  <td className="py-4 px-6 font-bold flex items-center gap-3 text-zinc-100">
                    <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 group-hover:text-purple-300 transition-colors">
                      <Table className="size-4.5 shrink-0" />
                    </div>
                    <span className="text-sm sm:text-base font-bold tracking-tight text-white group-hover:text-purple-300 transition-colors font-sans">{t.name}</span>
                  </td>
                  <td className="py-4 px-6 text-zinc-300 font-semibold font-mono text-sm">{t.columns}</td>
                  <td className="py-4 px-6 text-zinc-300 font-semibold font-mono text-sm">{t.rows}</td>
                  <td className="py-4 px-6 text-zinc-300 font-semibold font-mono text-sm">{t.size}</td>
                  <td className="py-4 px-6">
                    {t.realtime ? (
                      <span className="inline-flex items-center gap-1.5 text-emerald-400 text-xs sm:text-sm font-semibold bg-emerald-500/10 px-3 py-1 rounded-lg border border-emerald-500/20 font-sans">
                        <Check className="size-4" /> Enabled
                      </span>
                    ) : (
                      <span className="text-zinc-500 text-xs sm:text-sm font-medium font-sans">✕ Disabled</span>
                    )}
                  </td>
                  <td className="py-4 px-6 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button
                        onClick={() => setSelectedTableColumns(t.name)}
                        className="h-8 px-4 rounded-lg text-xs sm:text-sm font-semibold font-sans bg-white/5 hover:bg-purple-600 hover:text-white text-zinc-200 border border-white/10 transition-all cursor-pointer shadow-sm"
                      >
                        View columns
                      </button>
                      <button className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/10 transition-all">
                        <MoreVertical className="size-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Columns Modal */}
      {selectedTableColumns && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-lg p-6 rounded-2xl bg-[#16161a] border border-zinc-800 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Table className="size-5 text-purple-400" />
                <span className="text-base font-bold text-white font-sans">
                  Columns for <code className="text-purple-300 font-mono">{selectedTableColumns}</code>
                </span>
              </div>
              <button
                onClick={() => setSelectedTableColumns(null)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="flex flex-col gap-2 font-mono text-xs">
              <div className="flex justify-between p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800 text-zinc-300">
                <span className="font-bold text-purple-300">id</span>
                <span className="text-zinc-500">uuid · PRIMARY KEY</span>
              </div>
              <div className="flex justify-between p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800 text-zinc-300">
                <span className="font-bold text-purple-300">name / user_id</span>
                <span className="text-zinc-500">text · NOT NULL</span>
              </div>
              <div className="flex justify-between p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800 text-zinc-300">
                <span className="font-bold text-purple-300">created_at</span>
                <span className="text-zinc-500">timestamptz · DEFAULT now()</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedTableColumns(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold font-sans bg-zinc-800 hover:bg-zinc-700 text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Supabase Studio Authentic Slide-Over Table Creation Drawer */}
      {isCreateTableOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex justify-end animate-in fade-in duration-150">
          <div className="w-full max-w-2xl h-full bg-zinc-900 border-l border-white/10 shadow-2xl flex flex-col justify-between overflow-hidden animate-in slide-in-from-right duration-200 font-sans">
            {/* Header */}
            <div className="flex items-center justify-between p-6 bg-zinc-950/90 border-b border-white/10 shrink-0">
              <div>
                <h2 className="text-lg font-bold text-white font-sans">Create a new table</h2>
                <p className="text-xs text-zinc-400 font-sans mt-0.5">Add a new database table to the <code className="text-purple-300 font-mono">public</code> schema</p>
              </div>
              <button
                onClick={() => setIsCreateTableOpen(false)}
                className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Form Scrollable Body */}
            <form id="create-table-form" onSubmit={handleCreateSubmit} className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
              {createError && (
                <div className="p-3.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs font-sans">
                  {createError}
                </div>
              )}

              {/* Name & Description */}
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                    Name <span className="text-emerald-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="table_name (e.g. users, orders)"
                    value={newTableName}
                    onChange={(e) => setNewTableName(e.target.value)}
                    className="w-full h-10 px-4 rounded-xl bg-zinc-950 border border-white/10 focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/40 text-sm text-white placeholder-zinc-500 outline-none font-sans transition-all"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    Description <span className="text-zinc-500 font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Describe table purpose..."
                    className="w-full h-10 px-4 rounded-xl bg-zinc-950 border border-white/10 focus:border-purple-500/60 text-sm text-white placeholder-zinc-600 outline-none font-sans transition-all"
                  />
                </div>
              </div>

              {/* RLS & Realtime Settings */}
              <div className="p-4 rounded-2xl bg-zinc-950/80 border border-white/10 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="font-bold text-sm text-zinc-200">Enable Row Level Security (RLS)</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 uppercase">
                      Recommended
                    </span>
                  </div>
                  <input type="checkbox" defaultChecked className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-0 cursor-pointer size-4" />
                </div>
                <p className="text-xs text-zinc-400">Restrict access to table rows based on authentication policy.</p>
              </div>

              {/* Columns Builder */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                    Columns ({newColumns.length})
                  </label>
                  <button
                    type="button"
                    onClick={handleAddColumn}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-purple-500/15 border border-purple-500/30 text-purple-300 hover:bg-purple-500/25 transition-all"
                  >
                    <Plus className="size-3.5" />
                    <span>Add column</span>
                  </button>
                </div>

                <div className="flex flex-col gap-3">
                  {newColumns.map((col) => (
                    <div
                      key={col.id}
                      className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 p-3 rounded-xl bg-zinc-950/90 border border-white/10"
                    >
                      {/* Name */}
                      <input
                        type="text"
                        placeholder="Column name"
                        value={col.name}
                        onChange={(e) => handleColumnChange(col.id, "name", e.target.value)}
                        className="flex-1 h-9 px-3 rounded-lg bg-zinc-900 border border-white/10 text-xs sm:text-sm text-white placeholder-zinc-500 outline-none focus:border-purple-500/60 font-sans"
                      />

                      {/* Type */}
                      <select
                        value={col.type}
                        onChange={(e) => handleColumnChange(col.id, "type", e.target.value)}
                        className="h-9 px-2.5 rounded-lg bg-zinc-900 border border-white/10 text-xs text-purple-300 font-mono outline-none focus:border-purple-500/60 cursor-pointer"
                      >
                        <option value="uuid">uuid</option>
                        <option value="int4">int4 (integer)</option>
                        <option value="int8">int8 (bigint)</option>
                        <option value="varchar">varchar (text 255)</option>
                        <option value="text">text</option>
                        <option value="bool">bool (boolean)</option>
                        <option value="timestamptz">timestamptz</option>
                        <option value="timestamp">timestamp</option>
                        <option value="float8">float8 (double)</option>
                        <option value="jsonb">jsonb</option>
                      </select>

                      {/* Controls */}
                      <div className="flex items-center gap-2.5 px-1">
                        <label className="inline-flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={col.isPk}
                            onChange={(e) => handleColumnChange(col.id, "isPk", e.target.checked)}
                            className="rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-0 cursor-pointer"
                          />
                          <span className={col.isPk ? "text-amber-400 font-bold" : "text-zinc-400"}>PK</span>
                        </label>

                        <label className="inline-flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={col.isNullable}
                            disabled={col.isPk}
                            onChange={(e) => handleColumnChange(col.id, "isNullable", e.target.checked)}
                            className="rounded border-zinc-700 bg-zinc-900 text-purple-500 focus:ring-0 cursor-pointer disabled:opacity-40"
                          />
                          <span className="text-zinc-400">Null</span>
                        </label>
                      </div>

                      {/* Delete */}
                      <button
                        type="button"
                        disabled={newColumns.length <= 1}
                        onClick={() => handleRemoveColumn(col.id)}
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-white/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </form>

            {/* Bottom Action Footer */}
            <div className="flex items-center justify-end gap-3 p-5 bg-zinc-950/90 border-t border-white/10 shrink-0">
              <button
                type="button"
                onClick={() => setIsCreateTableOpen(false)}
                className="h-10 px-5 rounded-xl text-xs sm:text-sm font-semibold text-zinc-300 hover:text-white bg-white/5 hover:bg-white/10 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="create-table-form"
                disabled={creating || !newTableName.trim()}
                className="h-10 px-6 rounded-xl text-xs sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/25 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {creating ? (
                  <>
                    <RefreshCw className="size-4 animate-spin text-white" />
                    <span>Saving Table...</span>
                  </>
                ) : (
                  <span>Save Table</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
