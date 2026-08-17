import React, { useState, useRef, useEffect, useCallback } from "react";
import { X, Play, Table, Check } from "lucide-react";
import { dbmux } from "@/lib/dbmux";

interface SqlDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const PLACEHOLDER = "-- Write your SQL query here";

export function SqlDrawer({ isOpen, onClose }: SqlDrawerProps) {
  // LeetCode-style auto-save: Lazy initialization from localStorage
  const [query, setQuery] = useState(() => {
    try {
      const draft = localStorage.getItem("arcops_sql_draft");
      if (!draft || draft.includes("auth_users")) {
        return "SELECT * FROM telemetry_metrics LIMIT 10;";
      }
      return draft;
    } catch {
      return "SELECT * FROM telemetry_metrics LIMIT 10;";
    }
  });

  const [results, setResults] = useState<any[] | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [execTime, setExecTime] = useState<number | null>(null);
  const [executing, setExecuting] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  const lineNums = (query.split("\n") || [""]).map((_, i) => i + 1);

  // Listen for custom SQL query pre-fill events (e.g. from New table button)
  useEffect(() => {
    const handleSetQuery = (e: Event) => {
      const customEv = e as CustomEvent<{ query: string }>;
      if (customEv.detail?.query) {
        setQuery(customEv.detail.query);
      }
    };
    window.addEventListener("set_sql_query", handleSetQuery);
    return () => window.removeEventListener("set_sql_query", handleSetQuery);
  }, []);

  // Auto-save query draft to localStorage as user types (LeetCode / CodePen logic)
  useEffect(() => {
    try {
      localStorage.setItem("arcops_sql_draft", query);
    } catch {
      // Ignore storage errors
    }
  }, [query]);

  // Lock background page scroll when SQL drawer is open & redirect unauthenticated users
  useEffect(() => {
    const token = localStorage.getItem("arcauth_token") || localStorage.getItem("authx_token");
    if (isOpen && !token) {
      onClose();
      window.location.href = "/login";
      return;
    }
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  const syncScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const runQuery = useCallback(async () => {
    const start = performance.now();
    setExecuting(true);
    try {
      const res = await dbmux.executeSQL(query);
      const elapsed = +(performance.now() - start).toFixed(1);
      setExecTime(elapsed);
      if (Array.isArray(res)) {
        setResults(res);
        if (res.length > 0) {
          setColumns(Object.keys(res[0]));
        } else {
          setColumns([]);
        }
      } else {
        setResults([]);
        setColumns([]);
      }
    } catch {
      setResults([]);
      setColumns([]);
      setExecTime(0);
    } finally {
      setExecuting(false);
    }
  }, [query]);

  // Global Ctrl+Enter shortcut to execute SQL query
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isOpen && (e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        runQuery();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, runQuery]);

  useEffect(() => {
    if (isOpen && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 80);
    }
  }, [isOpen]);

  const hasToken = !!(localStorage.getItem("arcauth_token") || localStorage.getItem("authx_token"));
  if (!isOpen || !hasToken) return null;

  return (
    <>
      {/* High-level Backdrop - Blurs the entire page above floating navbar */}
      <div
        className="fixed inset-0 z-[99] bg-black/75 backdrop-blur-md transition-all duration-300"
        onClick={onClose}
      />

      {/* Full-Height Drawer Container - Above navbar (z-100) */}
      <div className="fixed inset-y-0 right-0 z-[100] flex flex-col h-screen w-full max-w-[720px] md:w-[48vw] min-w-[360px] bg-[#111115] border-l border-[#24242e] shadow-2xl transition-all duration-300 ease-in-out">
        {/* ── Header Bar ── */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#24242e] bg-[#16161c] shrink-0">
          <span className="text-sm font-semibold text-zinc-100 tracking-tight font-sans">
            SQL Editor
          </span>

          <button
            onClick={onClose}
            title="Close drawer (Esc)"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-[#24242e] transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* ── Code Editor Area (Top ~55%) ── */}
        <div className="flex flex-col bg-[#111115] border-b border-[#24242e]" style={{ height: "55%" }}>
          {/* Editor Grid with Line Numbers */}
          <div className="flex flex-1 overflow-hidden font-mono text-[13px] leading-[22px] pt-1">
            {/* Line Numbers */}
            <div
              ref={lineNumbersRef}
              className="select-none py-3 pr-3 pl-4 text-right text-[#3e3e4e] overflow-hidden shrink-0 border-r border-[#1a1a22]"
              style={{ minWidth: "3.2rem" }}
            >
              {lineNums.map((n) => (
                <div key={n} style={{ lineHeight: "22px" }}>
                  {n}
                </div>
              ))}
            </div>

            {/* Main Textarea */}
            <textarea
              ref={textareaRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onScroll={syncScroll}
              onKeyDown={(e) => {
                if (e.key === "Tab") {
                  e.preventDefault();
                  const s = e.currentTarget.selectionStart;
                  const newVal = query.slice(0, s) + "  " + query.slice(e.currentTarget.selectionEnd);
                  setQuery(newVal);
                  setTimeout(() => {
                    if (textareaRef.current) {
                      textareaRef.current.selectionStart = textareaRef.current.selectionEnd = s + 2;
                    }
                  }, 0);
                }
              }}
              spellCheck={false}
              placeholder={PLACEHOLDER}
              className="flex-1 resize-none bg-transparent text-[#e4e4ed] placeholder-[#383846] focus:outline-none py-3 px-4 caret-purple-400 overflow-auto"
              style={{ lineHeight: "22px", fontFamily: "ui-monospace, 'Geist Mono', Consolas, monospace" }}
            />
          </div>

          {/* Editor Action Bar (Bottom Right: Run Button ONLY + Auto-save indicator) */}
          <div className="px-5 py-3 border-t border-[#24242e] flex items-center justify-between bg-[#14141a] shrink-0">
            <div className="flex items-center gap-3 text-xs text-zinc-500 font-mono">
              <span>
                Press <kbd className="px-1 py-0.5 rounded bg-[#202028] text-zinc-400 border border-[#2e2e38] text-[10px]">Ctrl</kbd>{" "}
                <kbd className="px-1 py-0.5 rounded bg-[#202028] text-zinc-400 border border-[#2e2e38] text-[10px]">↵</kbd> to run
              </span>
              <span className="text-zinc-600">•</span>
              <span className="flex items-center gap-1 text-emerald-400/80 font-mono text-[11px]">
                <Check className="size-3" /> Auto-saved draft
              </span>
            </div>

            <button
              type="button"
              onClick={runQuery}
              disabled={executing}
              className="flex items-center gap-2 px-4.5 py-1.5 rounded-lg text-xs font-bold bg-[#7950ee] hover:bg-[#683ee3] active:scale-95 text-white transition-all cursor-pointer shadow-md shadow-purple-950/40"
            >
              <Play className="size-3.5 fill-current text-white" />
              <span>Run</span>
              <span className="text-[10px] opacity-80 font-mono">Ctrl ↵</span>
            </button>
          </div>
        </div>

        {/* ── Results Area (Bottom ~45%) ── */}
        <div className="flex-1 flex flex-col overflow-hidden bg-[#0d0d11]">
          {/* Results Header */}
          <div className="px-5 py-2.5 border-b border-[#24242e] shrink-0 flex items-center justify-between bg-[#121217]">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest font-mono">
              Results
            </span>
            {execTime !== null && results && (
              <span className="text-xs font-mono text-emerald-400 font-semibold">
                {results.length} row{results.length !== 1 ? "s" : ""} · {execTime}ms
              </span>
            )}
          </div>

          {/* Results Table Content */}
          <div className="flex-1 overflow-auto">
            {results === null ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-6 py-12">
                <Table className="size-10 text-zinc-700" strokeWidth={1.2} />
                <div>
                  <p className="text-sm font-semibold text-zinc-400">No Query Executed Yet</p>
                  <p className="text-xs text-zinc-600 mt-1 font-mono">
                    Click "Run" or press Ctrl ↵ to execute SQL against DBMux
                  </p>
                </div>
              </div>
            ) : results.length === 0 ? (
              <div className="p-8 text-center text-xs font-mono text-zinc-500">0 rows returned.</div>
            ) : (
              <table className="w-full text-left text-xs font-mono border-collapse">
                <thead className="sticky top-0 bg-[#16161c] z-10 shadow-sm">
                  <tr className="border-b border-[#24242e]">
                    {columns.map((col) => (
                      <th
                        key={col}
                        className="py-2.5 px-4 text-[11px] font-bold uppercase tracking-wider text-zinc-400 whitespace-nowrap"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1a1a22]">
                  {results.map((row, idx) => (
                    <tr key={idx} className="hover:bg-[#181822] transition-colors">
                      {columns.map((col) => (
                        <td key={col} className="py-2 px-4 text-zinc-200 whitespace-nowrap">
                          {row[col] === null ? (
                            <span className="text-zinc-600 italic">null</span>
                          ) : typeof row[col] === "boolean" ? (
                            <span className={row[col] ? "text-emerald-400" : "text-zinc-500"}>
                              {String(row[col])}
                            </span>
                          ) : (
                            String(row[col])
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
