"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from 'next/dynamic';

// Dynamically import AgentChat to avoid SSR issues
const AgentChat = dynamic(() => import('../../components/AgentChat'), { ssr: false });

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

// ---------------- FAL Models Types ----------------
type JsonSchema = {
  type: 'object';
  required?: string[];
  properties: Record<string, any>;
};

type FalModel = {
  id: string;
  name: string;
  provider: 'fal';
  category: 'image' | 'audio' | 'video' | 'text';
  description: string;
  inputSchema: JsonSchema;
  defaults?: Record<string, any>;
};

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
      }
    ) => {
      if (!query || query.trim().length === 0) return;
      setLoading(true);
      setError(null);
      try {
        // Use the unified-search GET interface explicitly
        const limit = opts?.limit ?? DEFAULT_LIMIT;
        const selectedTypes = (opts?.types || []).filter((t) => t !== "all");
        const typeParam = selectedTypes.length === 1 ? `&type=${encodeURIComponent(String(selectedTypes[0]))}` : "";
        const url = `/api/unified-search?q=${encodeURIComponent(query)}&limit=${limit}${typeParam}`;
        const res = await fetch(url, { method: "GET" });
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

function getResultMediaUrl(r: UnifiedSearchResult): string | undefined {
  return (
    (r.metadata?.cloudflare_url as string | undefined) ||
    (r.metadata?.s3_url as string | undefined) ||
    (r.url as string | undefined) ||
    (r.s3_url as string | undefined) ||
    (r.cloudflare_url as string | undefined)
  );
}

function useFalModels() {
  const [models, setModels] = useState<FalModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/fal/models');
        if (!res.ok) throw new Error(`Failed to load models: ${res.status}`);
        const json = await res.json();
        if (!cancelled) setModels(json.models || []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { models, loading, error } as const;
}

function FieldRenderer({
  schema,
  values,
  setValues,
}: {
  schema: JsonSchema;
  values: Record<string, any>;
  setValues: (fn: (prev: Record<string, any>) => Record<string, any>) => void;
}) {
  const entries = Object.entries(schema.properties || {});
  return (
    <div className="space-y-3">
      {entries.map(([key, def]) => {
        const title: string = def.title || key;
        const isRequired = schema.required?.includes(key);
        const common = {
          id: `fld-${key}`,
          value: values[key] ?? '',
          onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
            setValues((prev) => ({ ...prev, [key]: e.target.value })),
        };

        if (def.enum && Array.isArray(def.enum)) {
          return (
            <div key={key} className="flex flex-col gap-1">
              <label htmlFor={common.id} className="text-xs text-neutral-400">
                {title}{isRequired ? ' *' : ''}
              </label>
              <select
                {...(common as any)}
                className="px-2 py-1.5 rounded-md border border-neutral-800 bg-neutral-900 text-neutral-100"
              >
                <option value="">Select…</option>
                {def.enum.map((opt: string) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          );
        }

        if (def.type === 'number' || typeof def.default === 'number') {
          return (
            <div key={key} className="flex flex-col gap-1">
              <label htmlFor={common.id} className="text-xs text-neutral-400">
                {title}{isRequired ? ' *' : ''}
              </label>
              <input
                {...(common as any)}
                type="number"
                className="px-2 py-1.5 rounded-md border border-neutral-800 bg-neutral-900 text-neutral-100"
              />
            </div>
          );
        }

        if (key.toLowerCase().includes('prompt') || def.type === 'string') {
          const isTextArea = key.toLowerCase().includes('prompt') || (def.multiline as boolean);
          if (isTextArea) {
            return (
              <div key={key} className="flex flex-col gap-1">
                <label htmlFor={common.id} className="text-xs text-neutral-400">
                  {title}{isRequired ? ' *' : ''}
                </label>
                <textarea
                  {...(common as any)}
                  rows={3}
                  className="px-2 py-1.5 rounded-md border border-neutral-800 bg-neutral-900 text-neutral-100 resize-y"
                />
              </div>
            );
          }
          return (
            <div key={key} className="flex flex-col gap-1">
              <label htmlFor={common.id} className="text-xs text-neutral-400">
                {title}{isRequired ? ' *' : ''}
              </label>
              <input
                {...(common as any)}
                type="text"
                className="px-2 py-1.5 rounded-md border border-neutral-800 bg-neutral-900 text-neutral-100"
              />
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}

function GenerationPanel({
  pinned,
  onPinResult,
  onGenStart,
  onGenResult,
}: {
  pinned: PinnedItem[];
  onPinResult: (r: UnifiedSearchResult) => void;
  onGenStart: () => void;
  onGenResult: (mode: 'image' | 'video' | 'audio' | 'text', url: string | undefined, raw: any) => void;
}) {
  const { models, loading } = useFalModels();
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<FalModel | null>(null);
  const [values, setValues] = useState<Record<string, any>>({});
  const [useRefs, setUseRefs] = useState(true);
  const [uploadedRefs, setUploadedRefs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [genPreviewUrl, setGenPreviewUrl] = useState<string | null>(null);
  const [genText, setGenText] = useState<string | null>(null);
  const [category, setCategory] = useState<null | FalModel['category']>('image');
  const [advancedModelId, setAdvancedModelId] = useState<string>('');

  const filtered = useMemo(() => {
    const q = filter.toLowerCase();
    return models
      .filter((m) => (category ? m.category === category : true))
      .filter((m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q));
  }, [models, filter, category]);

  useEffect(() => {
    // Clear selection if it doesn't match current category
    if (selected && category && selected.category !== category) {
      setSelected(null);
      setValues({});
      setGenPreviewUrl(null);
      setGenText(null);
    }
  }, [category, selected]);

  useEffect(() => {
    if (selected) {
      const init: Record<string, any> = { ...(selected.defaults || {}) };
      Object.entries(selected.inputSchema.properties || {}).forEach(([k, def]) => {
        if (init[k] == null && def.default != null) init[k] = def.default;
      });
      setValues(init);
      setAdvancedModelId(selected.id);
    }
  }, [selected]);

  const categoryToMode = (c: FalModel['category']): 'image' | 'audio' | 'video' | 'text' => c;

  async function handleGenerate() {
    if (!selected) return;
    const prompt = values.prompt || values.text || '';
    if (!prompt || busy) return;
    // Notify parent to show Output tab with spinner
    if (typeof window !== 'undefined') {
      try { (window as any).__onGenStart?.(); } catch {}
    }
    onGenStart();
    setBusy(true);
    setGenPreviewUrl(null);
    setGenText(null);
    try {
      const pinnedRefs = useRefs
        ? pinned.map((p) => getResultMediaUrl(p.result)).filter(Boolean)
        : [];
      const refs = [...uploadedRefs, ...pinnedRefs] as string[];

      const mode = categoryToMode(selected.category);
      const body = {
        mode,
        model: advancedModelId || selected.id,
        prompt,
        refs,
        options: Object.fromEntries(Object.entries(values).filter(([k]) => k !== 'prompt')),
      };
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Generation failed');

      // Try multiple common locations for media URL
      const candidates = [
        json.url,
        json.result?.url,
        json.result?.images?.[0]?.url,
        json.result?.image?.url,
        json.result?.audio?.url,
        json.result?.video?.url,
        json.result?.output?.url,
        json.result?.output?.[0]?.url,
        json.result?.output?.[0]?.content?.[0]?.url,
        json.result?.outputs?.[0]?.url,
        json.result?.data?.[0]?.url,
        json.result?.data?.images?.[0]?.url,
        json.result?.data?.video?.url,
      ].filter(Boolean) as string[];
      const url = candidates[0];

      if (mode === 'text' || !url) {
        setGenText(JSON.stringify(json.result, null, 2));
      }
      if (url) setGenPreviewUrl(url);
      // propagate to parent right-pane state
      onGenResult(mode, url, json.result ?? json);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveToLibrary() {
    if (!selected) return;
    const mode = categoryToMode(selected.category);
    const url = genPreviewUrl;
    if (!url) return;
    const filename = `${selected.category}-generated-${Date.now()}`;
    const resp = await fetch('/api/import/url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, mediaType: mode, originalFilename: filename }),
    });
    const json = await resp.json();
    if (!resp.ok) {
      alert(json?.error || 'Save failed');
    } else {
      alert('Saved to library');
    }
  }

  function handlePinGenerated() {
    if (!selected) return;
    if (!genPreviewUrl) return;
    const mode = categoryToMode(selected.category);
    const r: UnifiedSearchResult = {
      id: `generated-${Date.now()}`,
      content_type: mode as any,
      title: values.prompt || 'Generated',
      score: 1,
      metadata: { source_url: genPreviewUrl },
      url: genPreviewUrl,
    } as any;
    onPinResult(r);
  }

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold">Generate</div>
        <label className="text-xs text-neutral-400 flex items-center gap-2">
          <input type="checkbox" className="accent-neutral-400" checked={useRefs} onChange={(e) => setUseRefs(e.target.checked)} />
          Use pinned as refs
        </label>
      </div>

      {/* Category toggles */}
      <div className="mt-3 flex flex-wrap gap-2">
        {(['image','video','audio','text'] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={classNames(
              'px-2.5 py-1.5 text-sm rounded-full border',
              category === c ? 'border-neutral-700 bg-neutral-800 text-neutral-100' : 'border-neutral-800 bg-neutral-950 text-neutral-400 hover:bg-neutral-900'
            )}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Model selector, shown after category chosen */}
      <div className="mt-3">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={category ? `Filter ${category} models…` : 'Filter models…'}
          className="w-full px-2 py-1.5 rounded-md border border-neutral-800 bg-neutral-900 text-neutral-100 placeholder-neutral-500"
        />
        <div className="mt-2 max-h-40 overflow-auto rounded-md border border-neutral-800">
          {loading ? (
            <div className="p-2 text-sm text-neutral-400">Loading models…</div>
          ) : filtered.length === 0 ? (
            <div className="p-2 text-sm text-neutral-500">No models</div>
          ) : (
            filtered.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelected(m)}
                className={classNames(
                  'w-full text-left px-3 py-2 text-sm border-b border-neutral-800 hover:bg-neutral-800',
                  selected?.id === m.id && 'bg-neutral-800'
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium text-neutral-100">{m.name}</div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full border border-neutral-700 bg-neutral-800/60 text-neutral-300">{m.category}</span>
                </div>
                <div className="text-xs text-neutral-400 mt-0.5 line-clamp-1">{m.description}</div>
                <div className="text-[10px] text-neutral-500 mt-0.5">{m.id}</div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Input fields appear only after model selection */}
      {selected && (
        <div className="mt-4 space-y-3">
          {/* Reference images */}
          <div className="space-y-2">
            <div className="text-xs text-neutral-400">Reference images</div>
            <div className="flex flex-wrap gap-2">
              {uploadedRefs.map((u, idx) => (
                <div key={`${u}-${idx}`} className="relative">
                  <img src={u} className="w-16 h-16 object-cover rounded border border-neutral-800" />
                  <button
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-neutral-900 border border-neutral-700 text-neutral-200"
                    onClick={() => setUploadedRefs((prev) => prev.filter((x) => x !== u))}
                    title="Remove"
                  >×</button>
                </div>
              ))}
              <label className="px-2 py-1.5 text-sm rounded-md border border-neutral-800 bg-neutral-950 hover:bg-neutral-800 text-neutral-100 cursor-pointer">
                + Upload
                <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  // Upload via existing /api/upload to get a CDN URL
                  const fd = new FormData();
                  fd.append('file', file);
                  fd.append('type', 'image');
                  fd.append('directory', 'images');
                  const resp = await fetch('/api/upload', { method: 'POST', body: fd });
                  const json = await resp.json();
                  if (resp.ok && json.url) {
                    setUploadedRefs((prev) => [...prev, json.url as string]);
                  } else {
                    alert(json?.error || 'Upload failed');
                  }
                }} />
              </label>
            </div>
            {useRefs && pinned.length > 0 && (
              <div className="text-[11px] text-neutral-500">Pinned items will also be used as references.</div>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-400">Model ID (advanced)</label>
            <input
              value={advancedModelId}
              onChange={(e) => setAdvancedModelId(e.target.value)}
              className="px-2 py-1.5 rounded-md border border-neutral-800 bg-neutral-900 text-neutral-100"
              placeholder="fal-ai/fast-sdxl"
            />
          </div>
          <FieldRenderer schema={selected.inputSchema} values={values} setValues={setValues} />
          <div className="flex gap-2">
            <button
              onClick={handleGenerate}
              disabled={busy}
              className="px-3 py-1.5 text-sm rounded-md border border-neutral-800 bg-neutral-950 hover:bg-neutral-800 text-neutral-100 disabled:opacity-50"
            >
              {busy ? 'Generating…' : 'Generate'}
            </button>
            <button
              onClick={handlePinGenerated}
              disabled={!genPreviewUrl}
              className="px-3 py-1.5 text-sm rounded-md border border-neutral-800 bg-neutral-950 hover:bg-neutral-800 text-neutral-100 disabled:opacity-50"
            >
              Pin result
            </button>
            <button
              onClick={handleSaveToLibrary}
              disabled={!genPreviewUrl}
              className="px-3 py-1.5 text-sm rounded-md border border-neutral-800 bg-neutral-950 hover:bg-neutral-800 text-neutral-100 disabled:opacity-50"
            >
              Save to library
            </button>
          </div>

          {/* Preview */}
          {genPreviewUrl && selected.category === 'image' && (
            <div className="mt-2">
              <img src={genPreviewUrl} className="w-full h-48 object-cover rounded-md border border-neutral-800" alt="generated" />
            </div>
          )}
          {genPreviewUrl && selected.category === 'audio' && (
            <div className="mt-2 border border-neutral-800 rounded-md p-2 bg-neutral-950">
              <audio src={genPreviewUrl} controls className="w-full" />
            </div>
          )}
          {genPreviewUrl && selected.category === 'video' && (
            <div className="mt-2 border border-neutral-800 rounded-md p-2 bg-black">
              <video src={genPreviewUrl} controls className="w-full" />
            </div>
          )}
          {genText && selected.category === 'text' && (
            <pre className="mt-2 max-h-48 overflow-auto text-xs border border-neutral-800 rounded-md p-2 bg-neutral-950 text-neutral-200">{genText}</pre>
          )}
          {genText && selected.category !== 'text' && !genPreviewUrl && (
            <details className="mt-2">
              <summary className="text-xs text-neutral-400 cursor-pointer">Show raw result</summary>
              <pre className="mt-2 max-h-48 overflow-auto text-xs border border-neutral-800 rounded-md p-2 bg-neutral-950 text-neutral-200">{genText}</pre>
            </details>
          )}
        </div>
      )}
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
  // Right pane tab and generation output state
  const [rightTab, setRightTab] = useState<'results' | 'canvas' | 'output'>('results');
  const [genLoading, setGenLoading] = useState(false);
  const [genUrl, setGenUrl] = useState<string | null>(null);
  const [genMode, setGenMode] = useState<'image' | 'video' | 'audio' | 'text' | null>(null);
  const [genRaw, setGenRaw] = useState<any>(null);
  // Bridge for agent → UI actions
  useEffect(() => {
    (window as any).__agentApi = {
      // Called by client after tool pinToCanvas returns
      pin: (payload: { id?: string; title?: string; url?: string }) => {
        if (!payload?.url && !payload?.id) return;
        // Minimal pin by URL
        const fake: UnifiedSearchResult = {
          id: payload.id || `agent-${Date.now()}`,
          content_type: 'image',
          title: payload.title || 'Pinned by Agent',
          description: '',
          score: 0,
          metadata: { cloudflare_url: payload.url, media_type: 'image' } as any,
          preview: payload.title || payload.url || '',
        } as any;
        pinResult(fake);
        setRightTab('canvas');
      },
    };
  }, []);

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

  function handleGenStart() {
    setGenLoading(true);
    setGenUrl(null);
    setGenRaw(null);
    setRightTab('output');
  }

  function handleGenResult(mode: 'image' | 'video' | 'audio' | 'text', url: string | undefined, raw: any) {
    setGenMode(mode);
    setGenUrl(url || null);
    setGenRaw(raw);
    setGenLoading(false);
    setRightTab('output');
  }

  function RightPane({
    results,
    loading,
    totalResults,
    onPin,
    onOpen,
    canvasRef,
    pinned,
    movePinned,
    removePinned,
    tab,
    setTab,
    genLoading,
    genUrl,
    genMode,
    genRaw,
    onPinGenerated,
    onSaveGenerated,
  }: {
    results: UnifiedSearchResult[];
    loading: boolean;
    totalResults: number;
    onPin: (r: UnifiedSearchResult) => void;
    onOpen: (r: UnifiedSearchResult) => void;
    canvasRef: React.MutableRefObject<HTMLDivElement | null>;
    pinned: PinnedItem[];
    movePinned: (id: string, x: number, y: number) => void;
    removePinned: (id: string) => void;
    tab: 'results' | 'canvas' | 'output';
    setTab: (t: 'results' | 'canvas' | 'output') => void;
    genLoading: boolean;
    genUrl: string | null;
    genMode: 'image' | 'video' | 'audio' | 'text' | null;
    genRaw: any;
    onPinGenerated: () => void;
    onSaveGenerated: () => void;
  }) {
    return (
      <div className="lg:col-span-8">
        <div className="flex items-center justify-between">
          <div className="text-sm text-neutral-400">{totalResults ? `${totalResults} raw hits` : ''}</div>
          <div className="flex gap-2">
            <button
              onClick={() => setTab('results')}
              className={classNames(
                'px-3 py-1.5 text-sm rounded-md border',
                tab === 'results' ? 'border-neutral-700 bg-neutral-800' : 'border-neutral-800 bg-neutral-950 hover:bg-neutral-900'
              )}
            >
              Results
            </button>
            <button
              onClick={() => setTab('canvas')}
              className={classNames(
                'px-3 py-1.5 text-sm rounded-md border',
                tab === 'canvas' ? 'border-neutral-700 bg-neutral-800' : 'border-neutral-800 bg-neutral-950 hover:bg-neutral-900'
              )}
            >
              Canvas
            </button>
            <button
              onClick={() => setTab('output')}
              className={classNames(
                'px-3 py-1.5 text-sm rounded-md border',
                tab === 'output' ? 'border-neutral-700 bg-neutral-800' : 'border-neutral-800 bg-neutral-950 hover:bg-neutral-900'
              )}
            >
              Output
            </button>
          </div>
        </div>

        {tab === 'results' ? (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {results.map((r) => (
              <ResultCard key={`${r.id}-${r.score}`} r={r} onPin={onPin} onOpen={onOpen} />
            ))}
            {!loading && results.length === 0 && (
              <div className="col-span-full text-neutral-400 text-sm">Try a search to see results.</div>
            )}
          </div>
        ) : tab === 'canvas' ? (
          <div className="mt-3">
            <div className="text-sm text-neutral-400 mb-2">Canvas</div>
            <div
              ref={canvasRef}
              className="relative h-[640px] w-full rounded-xl border border-neutral-800 bg-[radial-gradient(circle_at_20%_0%,rgba(66,66,66,0.25),transparent_35%),radial-gradient(circle_at_80%_100%,rgba(66,66,66,0.25),transparent_35%)] overflow-hidden"
            >
              {pinned.map((p) => (
                <DraggablePinned key={p.id} item={p} onMove={movePinned} onRemove={removePinned} onOpen={onOpen} />
              ))}
              {pinned.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-neutral-500 text-sm">
                  Pin results here to build a visual board.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {genLoading ? (
              <div className="h-[640px] w-full flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950">
                <div className="flex items-center gap-3 text-neutral-300">
                  <div className="w-5 h-5 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
                  Generating…
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-neutral-800 p-3 bg-neutral-900/40">
                {genUrl && genMode === 'image' && (
                  <img src={genUrl} className="w-full max-h-[640px] object-contain rounded-md border border-neutral-800 bg-black" alt="output" />
                )}
                {genUrl && genMode === 'video' && (
                  <video src={genUrl} controls className="w-full max-h-[640px] rounded-md border border-neutral-800 bg-black" />
                )}
                {genUrl && genMode === 'audio' && (
                  <div className="p-4">
                    <audio src={genUrl} controls className="w-full" />
                  </div>
                )}
                {!genUrl && (
                  <div className="text-sm text-neutral-400">No output URL found. See raw result below.</div>
                )}

                <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                  <div className="md:col-span-2">
                    <label className="text-xs text-neutral-400">Title / Filename</label>
                    <input id="gen-title-input" className="mt-1 w-full px-2 py-1.5 rounded-md border border-neutral-800 bg-neutral-900 text-neutral-100" placeholder="Untitled" />
                  </div>
                  <ProjectPicker />
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={onPinGenerated}
                    disabled={!genUrl || !genMode}
                    className="px-3 py-1.5 text-sm rounded-md border border-neutral-800 bg-neutral-950 hover:bg-neutral-800 text-neutral-100 disabled:opacity-50"
                  >
                    Pin result
                  </button>
                  <button
                    onClick={onSaveGenerated}
                    disabled={!genUrl || !genMode}
                    className="px-3 py-1.5 text-sm rounded-md border border-neutral-800 bg-neutral-950 hover:bg-neutral-800 text-neutral-100 disabled:opacity-50"
                  >
                    Save to library
                  </button>
                </div>
              </div>
            )}

            <details className="rounded-xl border border-neutral-800 bg-neutral-900/40">
              <summary className="px-3 py-2 text-sm text-neutral-300 cursor-pointer">Show raw result</summary>
              <pre className="p-3 text-xs text-neutral-200 whitespace-pre-wrap overflow-auto max-h-80">{JSON.stringify(genRaw, null, 2)}</pre>
            </details>
          </div>
        )}
      </div>
    );
  }

  function ProjectPicker() {
    const [projects, setProjects] = useState<Array<{ project_id: string; name: string }>>([])
    const [loading, setLoading] = useState(false)
    useEffect(() => {
      let cancelled = false
      ;(async () => {
        try {
          setLoading(true)
          const res = await fetch('/api/projects')
          if (res.ok) {
            const json = await res.json()
            if (!cancelled) setProjects((json.projects || []).map((p: any) => ({ project_id: p.project_id, name: p.name })))
          }
        } finally {
          if (!cancelled) setLoading(false)
        }
      })()
      return () => { cancelled = true }
    }, [])
    return (
      <div>
        <label className="text-xs text-neutral-400">Project</label>
        <select id="gen-project-select" className="mt-1 w-full px-2 py-1.5 rounded-md border border-neutral-800 bg-neutral-900 text-neutral-100">
          <option value="">No project</option>
          {projects.map((p) => (
            <option key={p.project_id} value={p.project_id}>{p.name}</option>
          ))}
        </select>
      </div>
    )
  }

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

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Generation panel (left) */}
          <div className="lg:col-span-4">
            <GenerationPanel
              pinned={pinned}
              onPinResult={pinResult}
              onGenStart={handleGenStart}
              onGenResult={handleGenResult}
            />
            <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
              <div className="text-sm text-neutral-400 mb-2">Agent</div>
              <AgentChat />
            </div>
          </div>

          {/* Right main area with tabs */}
          <RightPane
            results={results}
            loading={loading}
            totalResults={data?.total_results || 0}
            onPin={pinResult}
            onOpen={setSelected}
            canvasRef={canvasRef}
            pinned={pinned}
            movePinned={movePinned}
            removePinned={removePinned}
            tab={rightTab}
            setTab={setRightTab}
            genLoading={genLoading}
            genUrl={genUrl}
            genMode={genMode}
            genRaw={genRaw}
            onPinGenerated={() => {
              if (!genUrl || !genMode) return;
              const r: UnifiedSearchResult = {
                id: `generated-${Date.now()}`,
                content_type: genMode,
                title: 'Generated',
                score: 1,
                metadata: { source_url: genUrl },
                url: genUrl,
              } as any;
              pinResult(r);
            }}
            onSaveGenerated={async () => {
              if (!genUrl || !genMode) return;
              const inputEl = document.getElementById('gen-title-input') as HTMLInputElement | null
              const selectEl = document.getElementById('gen-project-select') as HTMLSelectElement | null
              const filename = inputEl?.value?.trim() || `${genMode}-generated-${Date.now()}`
              const projectId = selectEl?.value || undefined
              try {
                const resp = await fetch('/api/import/url', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ url: genUrl, mediaType: genMode, originalFilename: filename, projectId }),
                });
                if (!resp.ok) {
                  const j = await resp.json();
                  alert(j?.error || 'Save failed');
                } else {
                  alert('Saved to library');
                }
              } catch (e) {
                alert((e as Error).message);
              }
            }}
          />
        </div>
      </div>

      <DetailsOverlay r={selected} onClose={() => setSelected(null)} />
    </div>
  );
}


