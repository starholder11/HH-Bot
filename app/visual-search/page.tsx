"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ContentType = "video" | "image" | "audio" | "text";

type UnifiedSearchResult = {
  id: string;
  content_type: ContentType;
  title: string;
  description?: string;
  score: number;
  metadata: any;
  url?: string;
  s3_url?: string;
  cloudflare_url?: string;
  preview?: string;
};

type UnifiedSearchResponse = {
  success: boolean;
  query: string;
  total_results: number;
  results: {
    media: UnifiedSearchResult[];
    text: UnifiedSearchResult[];
    all: UnifiedSearchResult[];
  };
};

type PinnedItem = {
  result: UnifiedSearchResult;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  id: string; // local id (stable across pins)
};

const DEFAULT_LIMIT = 18;

function classNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function useUnifiedSearch() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<UnifiedSearchResponse | null>(null);

  const search = useCallback(
    async (
      query: string,
      opts?: {
        limit?: number;
        types?: ContentType[] | ("media" | "all")[];
        filters?: Record<string, unknown>;
      }
    ) => {
      if (!query || query.trim().length === 0) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/unified-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query,
            limit: opts?.limit ?? DEFAULT_LIMIT,
            content_types: opts?.types ?? [],
            filters: opts?.filters ?? {},
          }),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Search failed: ${res.status} ${text}`);
        }
        const json: UnifiedSearchResponse = await res.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { loading, error, data, search } as const;
}

function MediaPreview({ r }: { r: UnifiedSearchResult }) {
  const mediaUrl: string | undefined =
    (r.metadata?.cloudflare_url as string | undefined) ||
    (r.metadata?.s3_url as string | undefined) ||
    (r.url as string | undefined) ||
    (r.s3_url as string | undefined) ||
    (r.cloudflare_url as string | undefined);

  if (r.content_type === "image" && mediaUrl) {
    return (
      <img
        src={mediaUrl}
        alt={r.title}
        className="w-full h-40 object-cover rounded-md border border-neutral-800"
        draggable={false}
      />
    );
  }
  if (r.content_type === "video" && mediaUrl) {
    return (
      <video
        src={mediaUrl}
        controls
        className="w-full h-40 object-cover rounded-md border border-neutral-800 bg-black"
      />
    );
  }
  if (r.content_type === "audio" && mediaUrl) {
    return (
      <div className="w-full h-40 flex items-center justify-center rounded-md border border-neutral-800 bg-neutral-950">
        <audio src={mediaUrl} controls className="w-full px-2" />
      </div>
    );
  }

  // text fallback – generate a little decorative card
  return (
    <div className="w-full h-40 rounded-md border border-neutral-800 bg-gradient-to-br from-neutral-900 to-neutral-950 p-3 overflow-hidden">
      <div className="text-xs uppercase tracking-wide text-neutral-400">Text</div>
      <div className="mt-2 text-sm line-clamp-5 text-neutral-200">
        {r.preview || r.description || "No preview available"}
      </div>
    </div>
  );
}

function ResultCard({
  r,
  onPin,
  onOpen,
}: {
  r: UnifiedSearchResult;
  onPin: (r: UnifiedSearchResult) => void;
  onOpen: (r: UnifiedSearchResult) => void;
}) {
  const scorePct = Math.round((Math.max(0, Math.min(1, r.score)) || 0) * 100);
  const labels: string[] = useMemo(() => {
    const collected: string[] = [];
    try {
      const ai = r.metadata?.ai_labels || {};
      ["scenes", "objects", "style", "mood", "themes"].forEach((k) => {
        const arr = ai?.[k];
        if (Array.isArray(arr)) collected.push(...arr.slice(0, 3));
      });
    } catch {}
    return collected.slice(0, 6);
  }, [r.metadata]);

  return (
    <div className="group rounded-xl border border-neutral-800 bg-neutral-900/40 hover:bg-neutral-900 transition-colors overflow-hidden flex flex-col">
      <div className="p-3 pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs px-2 py-0.5 rounded-full border border-neutral-700 bg-neutral-800/60 text-neutral-300">
            {r.content_type}
          </div>
          <div className="text-[10px] text-neutral-400">{scorePct}%</div>
        </div>
        <div className="mt-2 font-medium text-neutral-100 line-clamp-1" title={r.title}>
          {r.title}
        </div>
      </div>
      <div className="px-3">
        <MediaPreview r={r} />
      </div>
      <div className="p-3 grow">
        <p className="text-sm text-neutral-300 line-clamp-3">
          {r.preview || r.description || ""}
        </p>
        {labels.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {labels.map((l, idx) => (
              <span
                key={`${l}-${idx}`}
                className="text-[10px] px-2 py-0.5 rounded-full border border-neutral-800 bg-neutral-950 text-neutral-400"
              >
                {l}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="p-3 pt-0 flex gap-2">
        <button
          onClick={() => onPin(r)}
          className="px-3 py-1.5 text-sm rounded-md border border-neutral-800 bg-neutral-950 hover:bg-neutral-800 text-neutral-100"
        >
          Pin to canvas
        </button>
        <button
          onClick={() => onOpen(r)}
          className="px-3 py-1.5 text-sm rounded-md border border-neutral-800 bg-neutral-950 hover:bg-neutral-800 text-neutral-100"
        >
          Expand
        </button>
      </div>
    </div>
  );
}

function DetailsOverlay({
  r,
  onClose,
}: {
  r: UnifiedSearchResult | null;
  onClose: () => void;
}) {
  if (!r) return null;

  const mediaUrl: string | undefined =
    (r.metadata?.cloudflare_url as string | undefined) ||
    (r.metadata?.s3_url as string | undefined) ||
    (r.url as string | undefined) ||
    (r.s3_url as string | undefined) ||
    (r.cloudflare_url as string | undefined);

  const sourceUrl: string | undefined =
    (r.metadata?.source_url as string | undefined) || mediaUrl || r.url;

  return (
    <div className="fixed inset-0 z-[100]">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="absolute right-0 top-0 h-full w-full sm:w-[560px] bg-neutral-950 border-l border-neutral-800 shadow-xl flex flex-col">
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
          <div>
            <div className="text-xs text-neutral-400">{r.content_type}</div>
            <div className="text-lg font-semibold text-neutral-100">{r.title}</div>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-md border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-100"
          >
            Close
          </button>
        </div>
        <div className="p-4 space-y-4 overflow-auto">
          <MediaPreview r={r} />
          <div className="text-sm leading-6 text-neutral-200 whitespace-pre-wrap">
            {r.preview || r.description || "No additional preview available."}
          </div>
          {sourceUrl && (
            <div>
              <a
                href={sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-100"
              >
                Open source
                <span className="text-neutral-500">↗</span>
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DraggablePinned({
  item,
  onMove,
  onRemove,
  onOpen,
}: {
  item: PinnedItem;
  onMove: (id: string, x: number, y: number) => void;
  onRemove: (id: string) => void;
  onOpen: (r: UnifiedSearchResult) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!ref.current) return;
    dragging.current = true;
    const rect = ref.current.getBoundingClientRect();
    offset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const newX = e.clientX - offset.current.x - (ref.current?.parentElement?.getBoundingClientRect().left || 0);
    const newY = e.clientY - offset.current.y - (ref.current?.parentElement?.getBoundingClientRect().top || 0);
    onMove(item.id, Math.max(0, newX), Math.max(0, newY));
  };
  const handlePointerUp = (e: React.PointerEvent) => {
    dragging.current = false;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  };

  return (
    <div
      ref={ref}
      className="absolute rounded-xl border border-neutral-800 bg-neutral-950 shadow-lg overflow-hidden"
      style={{ left: item.x, top: item.y, width: item.width, height: item.height, zIndex: item.z }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div className="p-2 border-b border-neutral-800 flex items-center justify-between gap-2 bg-neutral-900/50">
        <div className="text-xs text-neutral-300 truncate" title={item.result.title}>
          {item.result.title}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onOpen(item.result)}
            className="px-2 py-1 text-xs rounded-md border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-100"
          >
            Expand
          </button>
          <button
            onClick={() => onRemove(item.id)}
            className="px-2 py-1 text-xs rounded-md border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-100"
          >
            Remove
          </button>
        </div>
      </div>
      <div className="p-2 h-[calc(100%-40px)]">
        <MediaPreview r={item.result} />
      </div>
    </div>
  );
}

export default function VisualSearchPage() {
  const { loading, error, data, search } = useUnifiedSearch();
  const [query, setQuery] = useState("");
  const [types, setTypes] = useState<Array<ContentType | "media" | "all">>(["all"]);
  const [results, setResults] = useState<UnifiedSearchResult[]>([]);
  const [selected, setSelected] = useState<UnifiedSearchResult | null>(null);
  const [pinned, setPinned] = useState<PinnedItem[]>([]);
  const [zCounter, setZCounter] = useState(10);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setResults(data?.results?.all || []);
  }, [data]);

  const executeSearch = useCallback(
    (q: string) => {
      const effectiveTypes = types.includes("all") ? [] : types;
      search(q, { limit: DEFAULT_LIMIT, types: effectiveTypes as any });
    },
    [search, types]
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      executeSearch(query);
    },
    [executeSearch, query]
  );

  const toggleType = (t: ContentType | "media" | "all") => {
    setTypes((prev) => {
      if (t === "all") return ["all"]; // reset
      const withoutAll = prev.filter((x) => x !== "all");
      if (withoutAll.includes(t)) return withoutAll.filter((x) => x !== t);
      return [...withoutAll, t];
    });
  };

  const pinResult = (r: UnifiedSearchResult) => {
    const canvas = canvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    const baseX = Math.max(0, (rect?.width || 800) * 0.05 + Math.random() * 60);
    const baseY = Math.max(0, (rect?.height || 500) * 0.05 + Math.random() * 60);
    const newId = `${r.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setPinned((prev) => [
      ...prev,
      {
        id: newId,
        result: r,
        x: baseX,
        y: baseY,
        z: zCounter + 1,
        width: 280,
        height: 220,
      },
    ]);
    setZCounter((z) => z + 1);
  };

  const movePinned = (id: string, x: number, y: number) => {
    setPinned((prev) => prev.map((p) => (p.id === id ? { ...p, x, y, z: zCounter + 1 } : p)));
    setZCounter((z) => z + 1);
  };

  const removePinned = (id: string) => {
    setPinned((prev) => prev.filter((p) => p.id !== id));
  };

  const clearCanvas = () => setPinned([]);

  return (
    <div className="min-h-[100dvh] w-full bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs text-neutral-400">Experimental</div>
            <h1 className="text-2xl font-semibold">Visual Unified Search</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={clearCanvas}
              className="px-3 py-1.5 text-sm rounded-md border border-neutral-800 bg-neutral-900 hover:bg-neutral-800"
            >
              Clear canvas
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col sm:flex-row gap-3">
          <div className="flex-1 flex items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search across media and text…"
              className="w-full px-3 py-2 rounded-md border border-neutral-800 bg-neutral-900 text-neutral-100 placeholder-neutral-500 outline-none focus:ring-2 ring-neutral-700"
            />
            <button
              type="submit"
              className={classNames(
                "px-4 py-2 rounded-md border border-neutral-800",
                loading ? "bg-neutral-800" : "bg-neutral-900 hover:bg-neutral-800"
              )}
              disabled={loading}
            >
              {loading ? "Searching…" : "Search"}
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {(["all", "media", "video", "image", "audio", "text"] as const).map((t) => (
              <button
                type="button"
                key={t}
                onClick={() => toggleType(t)}
                className={classNames(
                  "px-2.5 py-1.5 text-sm rounded-full border",
                  types.includes(t)
                    ? "border-neutral-700 bg-neutral-800 text-neutral-100"
                    : "border-neutral-800 bg-neutral-950 text-neutral-400 hover:bg-neutral-900"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </form>

        {error && (
          <div className="mt-4 text-sm text-red-400 border border-red-900 bg-red-950/20 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Results panel */}
          <div>
            <div className="flex items-center justify-between">
              <div className="text-sm text-neutral-400">
                {data?.total_results ? `${data.total_results} raw hits` : ""}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {results.map((r) => (
                <ResultCard key={`${r.id}-${r.score}`} r={r} onPin={pinResult} onOpen={setSelected} />
              ))}
              {!loading && results.length === 0 && (
                <div className="col-span-full text-neutral-400 text-sm">
                  Try a search to see results.
                </div>
              )}
            </div>
          </div>

          {/* Canvas panel */}
          <div>
            <div className="text-sm text-neutral-400 mb-2">Canvas</div>
            <div
              ref={canvasRef}
              className="relative h-[640px] w-full rounded-xl border border-neutral-800 bg-[radial-gradient(circle_at_20%_0%,rgba(66,66,66,0.25),transparent_35%),radial-gradient(circle_at_80%_100%,rgba(66,66,66,0.25),transparent_35%)] overflow-hidden"
            >
              {pinned.map((p) => (
                <DraggablePinned
                  key={p.id}
                  item={p}
                  onMove={movePinned}
                  onRemove={removePinned}
                  onOpen={setSelected}
                />)
              )}
              {pinned.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-neutral-500 text-sm">
                  Pin results here to build a visual board.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <DetailsOverlay r={selected} onClose={() => setSelected(null)} />
    </div>
  );
}


