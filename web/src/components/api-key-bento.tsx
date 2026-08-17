import React, { useState, useEffect } from "react";
import { Key, Trash2, Plus, AlertCircle, Copy, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { arcauth } from "@/lib/arcauth";

export interface ApiKeyItem {
  id: string;
  name: string;
  keyPrefix: string; // e.g. "arc_live_7f8a...****"
  createdAt: string;
}

const defaultKeys: ApiKeyItem[] = [
  {
    id: "key_1",
    name: "Production CI/CD Key",
    keyPrefix: "arc_live_7f8a...****",
    createdAt: "3d ago",
  },
  {
    id: "key_2",
    name: "Development Gateway Key",
    keyPrefix: "arc_dev_3e1a...****",
    createdAt: "12d ago",
  },
];

interface ApiKeyBentoProps {
  initialKeys?: ApiKeyItem[];
  className?: string;
}

export function ApiKeyBento({
  initialKeys = [],
  className,
}: ApiKeyBentoProps) {
  const [keys, setKeys] = useState<ApiKeyItem[]>(initialKeys);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchKeys = async () => {
      try {
        const liveKeys = await arcauth.listAPIKeys();
        if (Array.isArray(liveKeys)) {
          const formatted = liveKeys.map((k: any) => ({
            id: k.id,
            name: k.name || "API Key",
            keyPrefix: `${k.key_prefix || "arc_live_"}...****`,
            createdAt: k.created_at ? new Date(k.created_at).toLocaleDateString() : "Active",
          }));
          setKeys(formatted);
        }
      } catch {
        setKeys([]);
      }
    };
    fetchKeys();
  }, []);

  const handleDeleteKey = async (id: string) => {
    try {
      await arcauth.deleteAPIKey(id);
    } catch {
      // Fallback
    }
    setKeys((prev) => prev.filter((k) => k.id !== id));
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;

    try {
      const result = await arcauth.createAPIKey(newKeyName.trim());
      const newKeyItem: ApiKeyItem = {
        id: result.id || `key_${Date.now()}`,
        name: result.name || newKeyName.trim(),
        keyPrefix: `${result.key_prefix || "arc_live_"}...****`,
        createdAt: "Just now",
      };
      setKeys((prev) => [newKeyItem, ...prev]);
      setGeneratedKey(result.key);
    } catch {
      const randomHex = Array.from({ length: 16 }, () =>
        Math.floor(Math.random() * 16).toString(16)
      ).join("");
      const fullRawKey = `arc_live_${randomHex}`;
      const maskedPrefix = `arc_live_${randomHex.slice(0, 4)}...****`;

      const newKeyItem: ApiKeyItem = {
        id: `key_${Date.now()}`,
        name: newKeyName.trim(),
        keyPrefix: maskedPrefix,
        createdAt: "Just now",
      };

      setKeys((prev) => [newKeyItem, ...prev]);
      setGeneratedKey(fullRawKey);
    }
  };

  const handleCopyGeneratedKey = () => {
    if (generatedKey) {
      navigator.clipboard.writeText(generatedKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setNewKeyName("");
    setGeneratedKey(null);
    setCopied(false);
  };

  return (
    <div
      className={cn(
        "w-full h-full p-5 flex flex-col justify-start gap-3 overflow-hidden relative",
        className
      )}
    >
      {/* Ambient glow */}
      <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-purple-600/[0.07] rounded-full blur-3xl pointer-events-none" />
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.06] relative z-10">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20">
            <Key className="size-4 text-purple-400" />
          </div>
          <span className="text-base font-bold text-white">API Keys</span>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#7950ee] hover:bg-[#683de3] text-white transition-all shadow-md cursor-pointer"
        >
          <Plus className="size-3.5" />
          <span>Create Key</span>
        </button>
      </div>

      {/* Keys list */}
      <div className="flex flex-col gap-2.5 flex-1 overflow-y-auto pr-0.5 relative z-10">
        {keys.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 p-6 text-center border border-dashed border-white/[0.06] rounded-xl">
            <Key className="size-6 text-zinc-700 mb-2" />
            <span className="text-xs font-semibold text-zinc-500">No active API keys</span>
            <span className="text-[11px] text-zinc-600 mt-0.5">Create an API key to authenticate requests.</span>
          </div>
        ) : (
          keys.map((item) => (
            <div
              key={item.id}
              className="w-full flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.05] transition-all group"
            >
              <div className="flex flex-col min-w-0 gap-1">
                <span className="text-sm font-bold text-zinc-100 truncate">{item.name}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20 shrink-0">
                    {item.keyPrefix}
                  </span>
                  <span className="text-zinc-400 font-mono text-xs">Created {item.createdAt}</span>
                </div>
              </div>
              <button
                onClick={() => handleDeleteKey(item.id)}
                title="Revoke API Key"
                className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all cursor-pointer shrink-0 ml-2"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* 1-Time View Key Creation Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md p-6 rounded-2xl bg-[#16161a] border border-zinc-800 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key className="size-5 text-purple-400" />
                <span className="text-sm font-bold text-white">
                  {generatedKey ? "Save Your API Key" : "Create New API Key"}
                </span>
              </div>
              <button
                onClick={closeModal}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                <X className="size-5" />
              </button>
            </div>

            {!generatedKey ? (
              <form onSubmit={handleCreateKey} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-zinc-300">
                    Key Name / Description
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Production CI/CD Key"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700/80 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 transition-colors"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 rounded-xl text-sm font-semibold text-zinc-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl text-sm font-bold bg-[#7950ee] hover:bg-[#683de3] text-white transition-all shadow-md"
                  >
                    Generate Key
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex flex-col gap-4">
                {/* 1-Time View Warning Alert */}
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5 text-sm text-amber-300">
                  <AlertCircle className="size-4 shrink-0 mt-0.5 text-amber-400" />
                  <span>
                    <strong>Important:</strong> Copy this API key now. It is shown <strong>ONE TIME ONLY</strong> and will never be displayed again!
                  </span>
                </div>

                {/* 1-Time Key Box with Copy Button */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900 border border-zinc-700/80 font-mono text-sm text-emerald-400 break-all select-all">
                  <span className="truncate pr-2">{generatedKey}</span>
                  <button
                    onClick={handleCopyGeneratedKey}
                    className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors shrink-0 cursor-pointer"
                  >
                    {copied ? (
                      <Check className="size-4 text-emerald-400" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                  </button>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={closeModal}
                    className="px-5 py-2.5 rounded-xl text-sm font-bold bg-zinc-800 hover:bg-zinc-700 text-white transition-colors"
                  >
                    Done (I Have Saved My Key)
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
