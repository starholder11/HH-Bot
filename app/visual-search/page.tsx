"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from 'next/dynamic';
import type { UnifiedSearchResult, UnifiedSearchResponse, ContentType, PinnedItem } from './types';
import { getResultMediaUrl } from './utils/mediaUrl';
import { stripCircularDescription } from './utils/textCleanup';
import * as searchService from './services/searchService';
import { useResults } from './hooks/useResults';
import { cacheStore } from './services/cacheStore';
import ResultsGrid from './components/ResultsGrid';
import VSResultCard from './components/ResultCard/ResultCard';
import DetailsOverlay from './components/DetailsOverlay';
import CanvasBoard from './components/Canvas/CanvasBoard';
import GridPinned from './components/Canvas/GridPinned';
import CanvasToolbar from './components/Canvas/CanvasToolbar';
import CanvasManagerModal from './components/Canvas/CanvasManagerModal';
// Legacy Generate UI is embedded in this file to match previous behavior
import { debug } from './utils/log';
import { useResultsStore } from './store/resultsStore';
import { useUiStore } from './store/uiStore';
import { useCanvasStore } from './store/canvasStore';

// Dynamically import AgentChat to avoid SSR issues
const AgentChat = dynamic(() => import('../../components/AgentChat'), { ssr: false });

// Moved types to ./types

const DEFAULT_LIMIT = 1000;

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





// getResultMediaUrl now in utils/mediaUrl

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

// Move GenerationPanel outside the main component to avoid scope conflicts
function GenerationPanel({
  pinned,
  onPinResult,
  onGenStart,
  onGenResult,
  canvasLoras = [],
  allLoras = [],
  onUpdateAllLoras,
  canvasLabel,
  setRightTab,
  saveStatus,
  setSaveStatus,
}: {
  pinned: PinnedItem[];
  onPinResult: (r: UnifiedSearchResult) => void;
  onGenStart: () => void;
  onGenResult: (mode: 'image' | 'video' | 'audio' | 'text', url: string | undefined, raw: any) => void;
  canvasLoras?: any[];
  allLoras?: Array<{
    canvasId: string;
    canvasName: string;
    loraId: string;
    path: string;
    triggerWord: string;
    scale: number;
    artifactUrl: string;
    status: string;
  }>;
  onUpdateAllLoras?: (updater: (prev: any[]) => any[]) => void;
  canvasLabel?: string;
  setRightTab?: (tab: 'results' | 'canvas' | 'output' | 'generate') => void;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  setSaveStatus: (status: 'idle' | 'saving' | 'saved' | 'error') => void;
}) {
  const { models, loading } = useFalModels();
  const [filter, setFilter] = useState('');
  const [selectedModel, setSelectedModel] = useState<FalModel | null>(null);
  const [values, setValues] = useState<Record<string, any>>({});
  const [useRefs, setUseRefs] = useState(true);
  const [uploadedRefs, setUploadedRefs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [genPreviewUrl, setGenPreviewUrl] = useState<string | null>(null);
  const [genText, setGenText] = useState<string | null>(null);
  const [category, setCategory] = useState<null | FalModel['category']>('image');
  const [advancedModelId, setAdvancedModelId] = useState<string>('');
  // Manual LoRA selection UI state
  const [selectedLoras, setSelectedLoras] = useState<Array<{ id: string; path: string; scale: number; selected: boolean; label: string }>>([])
  const [loraSelect, setLoraSelect] = useState<string>('')

  const filtered = useMemo(() => {
    const q = filter.toLowerCase();
    return models
      .filter((m) => (category ? m.category === category : true))
      .filter((m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q));
  }, [models, filter, category]);

  useEffect(() => {
    // Clear selection if it doesn't match current category
    if (selectedModel && category && selectedModel.category !== category) {
      setSelectedModel(null);
      setValues({});
      setGenPreviewUrl(null);
      setGenText(null);
    }
  }, [category, selectedModel]);

  useEffect(() => {
    if (selectedModel) {
      const init: Record<string, any> = { ...(selectedModel.defaults || {}) };
      Object.entries(selectedModel.inputSchema.properties || {}).forEach(([k, def]) => {
        if (init[k] == null && def.default != null) init[k] = def.default;
      });
      setValues(init);
      setAdvancedModelId(selectedModel.id);

      // If user has a completed canvas LoRA and selected an image model that includes 'flux', auto-switch model id to 'fal-ai/flux-lora'
      try {
        const hasCompleted = (canvasLoras || []).some((l: any) => l.status === 'completed' && (l.artifactUrl || l.path))
        if (hasCompleted && selectedModel.category === 'image' && /flux/i.test(selectedModel.id)) {
          setAdvancedModelId('fal-ai/flux-lora');
        }
      } catch {}
    }
  }, [selectedModel, canvasLoras]);

  // Sync selectedLoras from all available LoRAs
  useEffect(() => {
    try {
      const completed = (allLoras || []).filter((l: any) => l.status === 'completed' && (l.artifactUrl || l.path))
      const mapped = completed.map((l: any, idx: number) => ({
        id: l.loraId || l.requestId || String(idx),
        path: l.artifactUrl || l.path,
        scale: l.scale || 1.0,
        selected: false,
        label: `${l.canvasName || 'Canvas'} • ${l.triggerWord || 'LoRA'}`,
      }))
      setSelectedLoras(mapped)
    } catch {}
  }, [allLoras])

  // If agent provided loras in options via prepare, reflect in selection UI
  useEffect(() => {
    try {
      const lorasFromValues: any[] | undefined = (values as any)?.loras
      if (Array.isArray(lorasFromValues) && lorasFromValues.length > 0) {
        setSelectedLoras((prev) => {
          const byPath = new Map(prev.map((p) => [p.path, p]))
          const next: typeof prev = []
          for (const l of lorasFromValues) {
            const existing = byPath.get(l.path)
            if (existing) {
              next.push({ ...existing, selected: true, scale: typeof l.scale === 'number' ? l.scale : existing.scale })
              byPath.delete(l.path)
            } else {
              next.push({ id: l.path, path: l.path, scale: typeof l.scale === 'number' ? l.scale : 1.0, selected: true, label: 'LoRA' })
            }
          }
          // Keep any remaining known loras
          for (const remain of Array.from(byPath.values())) next.push(remain)
          // Force model to flux-lora when explicit selection present
          if (next.some((x) => x.selected)) setAdvancedModelId('fal-ai/flux-lora')
          return next
        })
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values?.loras])

  const categoryToMode = (c: FalModel['category']): 'image' | 'audio' | 'video' | 'text' => c;

  // Imperative bridge for agent → GenerationPanel
  useEffect(() => {
    (window as any).__genPanel = {
      prepare: async (payload: { type?: 'image'|'video'|'audio'|'text'; model?: string; prompt?: string; refs?: string[]; options?: any; autoRun?: boolean }) => {
        try {
          if (payload?.type) setCategory(payload.type);
          if (payload?.model) setAdvancedModelId(payload.model);
          if (payload?.prompt) setValues((prev) => ({ ...prev, prompt: payload.prompt }));
          if (Array.isArray(payload?.refs) && payload.refs.length > 0) setUploadedRefs(payload.refs);
          if (payload?.options && typeof payload.options === 'object') setValues((prev) => ({ ...prev, ...payload.options }));
          // Try to select a model by id if present in loaded list
          const match = (models || []).find((m) => m.id === payload?.model);
          if (match) setSelectedModel(match);
          // Auto-run only after a model is selected and prompt exists
          if (payload?.autoRun) {
            const waitAndRun = () => {
              const hasPrompt = !!(values.prompt || values.text || payload?.prompt);
              if (hasPrompt && (match || selectedModel)) {
                setTimeout(() => { void handleGenerate(); }, 50);
              } else {
                setTimeout(waitAndRun, 50);
              }
            };
            waitAndRun();
          }
        } catch {}
      },
    };
    return () => { try { delete (window as any).__genPanel; } catch {} };
  }, [models, selectedModel, values.prompt, values.text]);

  async function handleGenerate() {
    if (!selectedModel) return;
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

      const mode = categoryToMode(selectedModel.category);
      const body: any = {
        mode,
        model: advancedModelId || selectedModel.id,
        prompt,
        refs,
        options: Object.fromEntries(Object.entries(values).filter(([k]) => k !== 'prompt')),
      };

      // Apply manual LoRA selection if any
      const chosen = selectedLoras.filter((x) => x.selected).map((x) => ({ path: x.path, scale: x.scale }))
      if (mode === 'image' && chosen.length > 0) {
        body.options = body.options || {}
        body.options.loras = chosen
        // Ensure model is flux-lora when loras are explicitly selected
        body.model = 'fal-ai/flux-lora'
      } else {
        // Otherwise fallback: attach all completed canvas LoRAs if present
        try {
          const completed = (canvasLoras || []).filter((l: any) => l.status === 'completed' && (l.artifactUrl || l.path))
          if (completed.length > 0 && mode === 'image') {
            body.options = body.options || {}
            body.options.loras = completed.map((l: any) => ({ path: l.artifactUrl || l.path, scale: 1.0 }))
          }
        } catch {}
      }
      const json = await (await import('./services/generateService')).runGenerate(body);

      // Try multiple common locations for media URL
      const candidates = [
        (json as any)?.url,
        (json as any)?.result?.video?.url,
        (json as any)?.result?.url,
        (json as any)?.result?.images?.[0]?.url,
        (json as any)?.result?.image?.url,
        (json as any)?.result?.audio?.url,
        (json as any)?.result?.output?.url,
        (json as any)?.result?.output?.[0]?.url,
        (json as any)?.result?.data?.images?.[0]?.url,
        (json as any)?.result?.data?.video?.url,
      ].filter(Boolean) as string[];
      const url = candidates[0];

      if (mode === 'text' || !url) {
        setGenText(JSON.stringify(json.result, null, 2));
      }
      if (url) setGenPreviewUrl(url);
      // propagate to parent right-pane state
      onGenResult(mode, url, json.result ?? json);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Generation failed:', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveToLibrary() {
    if (!selectedModel) return;
    const mode = categoryToMode(selectedModel.category);
    const url = genPreviewUrl;
    if (!url) return;

    setSaveStatus('saving');

    try {
      const filename = `${selectedModel.category}-generated-${Date.now()}`;
      const resp = await fetch('/api/import/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, mediaType: mode, originalFilename: filename }),
      });
      const json = await resp.json();

      if (resp.ok) {
        setSaveStatus('saved');
        // Reset to idle after 2 seconds
        setTimeout(() => setSaveStatus('idle'), 2000);
        // eslint-disable-next-line no-console
        console.log('Saved to library');
      } else {
        setSaveStatus('error');
        setTimeout(() => setSaveStatus('idle'), 2000);
        // eslint-disable-next-line no-console
        console.error('Save failed:', json?.error || 'Save failed');
      }
    } catch (error) {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2000);
      // eslint-disable-next-line no-console
      console.error('Error saving to library:', error);
    }
  }

  function handlePinGenerated() {
    if (!selectedModel) return;
    if (!genPreviewUrl) return;
    const mode = categoryToMode(selectedModel.category);
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
                onClick={() => setSelectedModel(m)}
                className={classNames(
                  'w-full text-left px-3 py-2 text-sm border-b border-neutral-800 hover:bg-neutral-800',
                  selectedModel?.id === m.id && 'bg-neutral-800'
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

      {/* LoRA selector (image only) */}
      {category === 'image' && (
        <div className="mt-4 rounded-md border border-neutral-800 p-3 bg-neutral-900/30">
          <div className="text-sm font-medium text-neutral-200">Available LoRAs</div>
          {selectedLoras.length === 0 ? (
            <div className="mt-1 text-xs text-neutral-500">No completed LoRAs found.</div>
          ) : (
            <div className="mt-2 flex items-center gap-3">
              <select
                value={loraSelect}
                onChange={(e) => {
                  const val = e.target.value
                  setLoraSelect(val)
                  if (val) {
                    const chosen = selectedLoras.find((x) => x.id === val)
                    if (chosen) {
                      setAdvancedModelId('fal-ai/flux-lora')
                      setValues((prev) => ({ ...prev, loras: [{ path: chosen.path, scale: chosen.scale }] }))
                      const m = models.find((m) => m.id === 'fal-ai/flux-lora')
                      if (m) {
                        setSelectedModel(m)
                      } else {
                        // If model not found, create a temporary one to enable the prompt UI
                        setSelectedModel({
                          id: 'fal-ai/flux-lora',
                          name: 'FLUX LoRA',
                          provider: 'fal' as const,
                          category: 'image' as const,
                          description: 'FLUX with LoRA support',
                          inputSchema: {
                            type: 'object',
                            properties: {
                              prompt: {
                                type: 'string',
                                title: 'Prompt',
                                multiline: true
                              },
                              width: {
                                type: 'number',
                                title: 'Width',
                                default: 1024
                              },
                              height: {
                                type: 'number',
                                title: 'Height',
                                default: 1024
                              },
                              steps: {
                                type: 'number',
                                title: 'Steps',
                                default: 28
                              },
                              seed: {
                                type: 'number',
                                title: 'Seed'
                              }
                            },
                            required: ['prompt']
                          }
                        })
                      }
                      // Switch to Generate tab when LoRA is selected
                      setRightTab?.('generate')
                    }
                  } else {
                    setValues((prev) => ({ ...prev, loras: [] }))
                  }
                }}
                className="px-2 py-1 rounded-md border border-neutral-800 bg-neutral-900 text-neutral-100 min-w-[260px]"
              >
                <option value="">Select a LoRA…</option>
                {selectedLoras.map((l) => (
                  <option key={l.id} value={l.id}>{l.label}</option>
                ))}
              </select>
              {loraSelect && (
                <div className="flex items-center gap-2 text-xs text-neutral-400">
                  <span>Scale</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="2"
                    value={selectedLoras.find((x) => x.id === loraSelect)?.scale ?? 1}
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(2, Number(e.target.value) || 0))
                      setSelectedLoras((prev) => prev.map((p) => p.id === loraSelect ? { ...p, scale: v } : p))
                      const chosen = selectedLoras.find((x) => x.id === loraSelect)
                      if (chosen) setValues((prev) => ({ ...prev, loras: (prev.loras || []).map((lr: any) => lr.path === chosen.path ? { ...lr, scale: v } : lr) }))
                    }}
                    className="w-16 px-2 py-1 rounded border border-neutral-800 bg-neutral-900 text-neutral-100"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Input fields appear only after model selection */}
      {selectedModel && (
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
                    console.error('Upload failed:', json?.error || 'Upload failed');
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
          {selectedModel ? (
            <FieldRenderer schema={selectedModel.inputSchema} values={values} setValues={setValues} />
          ) : (
            <div className="text-xs text-neutral-400">Select a model to configure its options.</div>
          )}
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
              disabled={!genPreviewUrl || saveStatus === 'saving'}
              className={`px-3 py-1.5 text-sm rounded-md border transition-all duration-300 disabled:opacity-50 ${
                saveStatus === 'saved'
                  ? 'border-green-600 bg-green-600 text-white transform scale-105'
                  : saveStatus === 'error'
                  ? 'border-red-600 bg-red-600 text-white'
                  : saveStatus === 'saving'
                  ? 'border-blue-600 bg-blue-600 text-white animate-pulse'
                  : 'border-neutral-800 bg-neutral-950 hover:bg-neutral-800 text-neutral-100'
              }`}
            >
              {saveStatus === 'saving' && (
                <svg className="animate-spin -ml-1 mr-2 h-3 w-3 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              )}
              {saveStatus === 'saved' && '✓ '}
              {saveStatus === 'error' && '✗ '}
              {saveStatus === 'saving' ? 'Saving...'
                : saveStatus === 'saved' ? 'Saved!'
                : saveStatus === 'error' ? 'Failed'
                : 'Save to library'}
            </button>
          </div>

          {/* Preview */}
          {selectedModel && genPreviewUrl && selectedModel.category === 'image' && (
            <div className="mt-2">
              <img src={genPreviewUrl} className="w-full h-48 object-cover rounded-md border border-neutral-800" alt="generated" />
            </div>
          )}
          {selectedModel && genPreviewUrl && selectedModel.category === 'audio' && (
            <div className="mt-2 border border-neutral-800 rounded-md p-2 bg-neutral-950">
              <audio src={genPreviewUrl} controls className="w-full" />
            </div>
          )}
          {selectedModel && genPreviewUrl && selectedModel.category === 'video' && (
            <div className="mt-2 border border-neutral-800 rounded-md p-2 bg-black">
              <video src={genPreviewUrl} controls className="w-full" />
            </div>
          )}
          {genText && selectedModel && selectedModel.category === 'text' && (
            <pre className="mt-2 max-h-48 overflow-auto text-xs border border-neutral-800 rounded-md p-2 bg-neutral-950 text-neutral-200">{genText}</pre>
          )}
          {genText && selectedModel && selectedModel.category !== 'text' && !genPreviewUrl && (
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

// Removed inline ResultCard - now using extracted component

// Removed orphaned LegacyDetailsOverlay - using components/DetailsOverlay.tsx instead

// DraggablePinned and GridPinned moved to components/Canvas

// Project picker moved to top-level to avoid remount issues
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

// RightPane moved to top-level to preserve input focus within it
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
  selectedIds,
  multiSelect,
  toggleSelect,
  page,
  setPage,
  executeSearch,
  query,
  setQuery,
  // Canvas props
  isEditingName,
  setIsEditingName,
  canvasName,
  setCanvasName,
  autoSaveCanvas,
  canvasProjectId,
  setCanvasProjectId,
  projectsList,
  saveCanvas,
  setShowCanvasManager,
  clearCanvas,
  canvasLayout,
  setCanvasLayout,
  reorderPinned,
  canvasNote,
  setCanvasNote,
  canvasId,
  handleNoteSave,
  pinSelected,
  onParentGenStart,
  onParentGenResult,
  // LoRA props
  canvasLoras,
  loraTraining,
  trainCanvasLora,
  allLoras,
  setAllLoras,
  saveStatus,
  setSaveStatus,
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
  tab: 'results' | 'canvas' | 'output' | 'generate';
  setTab: (t: 'results' | 'canvas' | 'output' | 'generate') => void;
  genLoading: boolean;
  genUrl: string | null;
  genMode: 'image' | 'video' | 'audio' | 'text' | null;
  genRaw: any;
  onPinGenerated: () => void;
  onSaveGenerated: () => void;
  selectedIds: Set<string>;
  multiSelect: boolean;
  toggleSelect: (r: UnifiedSearchResult, shiftKey?: boolean) => void;
  page: number;
  setPage: (p: number) => void;
  executeSearch: (q: string, nextPage?: number) => void;
  query: string;
  setQuery: (q: string) => void;
  isEditingName: boolean;
  setIsEditingName: (v: boolean) => void;
  canvasName: string;
  setCanvasName: (v: string) => void;
  autoSaveCanvas: () => Promise<void> | void;
  canvasProjectId: string;
  setCanvasProjectId: (v: string) => void;
  projectsList: Array<{ project_id: string; name: string }>;
  saveCanvas: () => Promise<void> | void;
  setShowCanvasManager: (v: boolean) => void;
  clearCanvas: () => void;
  canvasLayout: 'grid' | 'freeform';
  setCanvasLayout: (v: 'grid' | 'freeform') => void;
  reorderPinned: (fromIndex: number, toIndex: number) => void;
  canvasNote: string;
  setCanvasNote: (v: string) => void;
  canvasId: string | null;
  handleNoteSave: () => Promise<void> | void;
  pinSelected: () => void;
  onParentGenStart: () => void;
  onParentGenResult: (m: 'image' | 'video' | 'audio' | 'text', url: string | undefined, raw: any) => void;
  // LoRA props
  canvasLoras: any[];
  loraTraining: null | { status: string; requestId?: string };
  trainCanvasLora: () => Promise<void>;
  allLoras: Array<{
    canvasId: string;
    canvasName: string;
    loraId: string;
    path: string;
    triggerWord: string;
    scale: number;
    artifactUrl: string;
    status: string;
  }>;
  setAllLoras: (updater: (prev: any[]) => any[]) => void;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  setSaveStatus: (status: 'idle' | 'saving' | 'saved' | 'error') => void;
}) {
  return (
    <div className="w-full overflow-hidden">
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
          <button
            onClick={() => setTab('generate')}
            className={classNames(
              'px-3 py-1.5 text-sm rounded-md border',
              tab === 'generate' ? 'border-neutral-700 bg-neutral-800' : 'border-neutral-800 bg-neutral-950 hover:bg-neutral-900'
            )}
          >
            Generate
          </button>
        </div>
      </div>

      {tab === 'results' ? (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="text-xs text-neutral-400">
                {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Shift+click to select multiple'}
              </div>
              {selectedIds.size > 0 && (
                <button
                  onClick={pinSelected}
                  className="px-3 py-1.5 text-sm rounded-md border border-neutral-700 bg-blue-600 hover:bg-blue-700 text-white font-medium"
                >Pin {selectedIds.size} to canvas</button>
              )}
            </div>
            <div className="text-xs text-neutral-500">{totalResults} total</div>
          </div>
          <div className="mt-2">
            <ResultsGrid
              results={results}
              renderCard={(r) => (
                <VSResultCard
                  r={r}
                  onPin={onPin}
                  onOpen={onOpen}
                  onLabelClick={(label) => {
                    setQuery(label);
                    executeSearch(label, 1);
                    setTab('results');
                  }}
                  selectionEnabled={multiSelect}
                  selected={selectedIds.has(r.id)}
                  onToggleSelect={toggleSelect}
                />
              )}
            />
            {!loading && results.length === 0 && (
              <div className="text-neutral-400 text-sm mt-2">Try a search to see results.</div>
            )}
          </div>
        </div>
      ) : tab === 'canvas' ? (
        <div className="mt-3">
          <div className="text-sm text-neutral-400 mb-2">Canvas</div>
          <CanvasToolbar
            isEditingName={isEditingName}
            setIsEditingName={setIsEditingName}
            canvasName={canvasName}
            setCanvasName={setCanvasName}
            autoSaveCanvas={autoSaveCanvas}
            canvasProjectId={canvasProjectId}
            setCanvasProjectId={setCanvasProjectId}
            projectsList={projectsList}
            saveCanvas={saveCanvas}
            setShowCanvasManager={setShowCanvasManager}
            clearCanvas={clearCanvas}
            canvasLayout={canvasLayout}
            setCanvasLayout={setCanvasLayout}
            loraTraining={loraTraining}
            trainCanvasLora={trainCanvasLora}
            canvasLoras={canvasLoras}
          />
          {canvasLayout === 'grid' ? (
            <div className="rounded-xl border border-neutral-800 p-2 bg-neutral-950 h-[640px]">
              {pinned.length === 0 ? (
                <div className="h-full flex items-center justify-center text-neutral-500 text-sm">Pin results here to build a visual board.</div>
              ) : (
                <GridPinned items={pinned} onReorder={reorderPinned} onRemove={removePinned} onOpen={onOpen} />
              )}
            </div>
          ) : (
            <div ref={canvasRef}>
              <CanvasBoard items={pinned} onMove={movePinned} onRemove={removePinned} onOpen={onOpen} />
            </div>
          )}
          <div className="mt-3">
            <label className="text-xs text-neutral-400 block mb-1">Notes</label>
            <textarea
              value={canvasNote}
              onChange={(e) => setCanvasNote(e.target.value)}
              rows={6}
              className="w-full px-2 py-1.5 rounded-md border border-neutral-800 bg-black text-white"
              placeholder="Add notes about this canvas..."
            />
            <div className="mt-2 flex justify-end">
              <button
                onClick={() => void handleNoteSave()}
                className="px-3 py-1.5 text-sm rounded-md border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-100"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : tab === 'output' ? (
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
                  disabled={!genUrl || !genMode || saveStatus === 'saving'}
                  className={`px-3 py-1.5 text-sm rounded-md border transition-all duration-300 disabled:opacity-50 ${
                    saveStatus === 'saved'
                      ? 'border-green-600 bg-green-600 text-white transform scale-105'
                      : saveStatus === 'error'
                      ? 'border-red-600 bg-red-600 text-white'
                      : saveStatus === 'saving'
                      ? 'border-blue-600 bg-blue-600 text-white animate-pulse'
                      : 'border-neutral-800 bg-neutral-950 hover:bg-neutral-800 text-neutral-100'
                  }`}
                >
                  {saveStatus === 'saving' && (
                    <svg className="animate-spin -ml-1 mr-2 h-3 w-3 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  )}
                  {saveStatus === 'saved' && '✓ '}
                  {saveStatus === 'error' && '✗ '}
                  {saveStatus === 'saving' ? 'Saving...'
                    : saveStatus === 'saved' ? 'Saved!'
                    : saveStatus === 'error' ? 'Failed'
                    : 'Save to library'}
                </button>
              </div>
            </div>
          )}

          <details className="rounded-xl border border-neutral-800 bg-neutral-900/40">
            <summary className="px-3 py-2 text-sm text-neutral-300 cursor-pointer">Show raw result</summary>
            <pre className="p-3 text-xs text-neutral-200 whitespace-pre-wrap overflow-auto max-h-80">{JSON.stringify(genRaw, null, 2)}</pre>
          </details>
        </div>
      ) : (
        <div className="mt-3">
          {/* Generate Tab - Full Legacy Generate UI */}
          <GenerationPanel
            pinned={pinned}
            onPinResult={onPin}
            onGenStart={onParentGenStart}
            onGenResult={onParentGenResult}
            canvasLoras={canvasLoras.filter(l => l.status === 'completed')}
            allLoras={allLoras}
            setRightTab={setTab}
            saveStatus={saveStatus}
            setSaveStatus={setSaveStatus}
          />
        </div>
      )}
      {tab === 'results' && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            onClick={() => { const p = Math.max(1, page - 1); setPage(p); executeSearch(query, p); }}
            disabled={page <= 1 || loading}
            className="px-3 py-1.5 text-sm rounded-md border border-neutral-800 bg-neutral-950 hover:bg-neutral-800 text-neutral-100 disabled:opacity-50"
          >Prev</button>
          <div className="text-sm text-neutral-400">Page {page}</div>
          <button
            onClick={() => { const maxPage = Math.max(1, Math.ceil(totalResults / DEFAULT_LIMIT)); const p = Math.min(maxPage, page + 1); setPage(p); executeSearch(query, p); }}
            disabled={loading || results.length < DEFAULT_LIMIT}
            className="px-3 py-1.5 text-sm rounded-md border border-neutral-800 bg-neutral-950 hover:bg-neutral-800 text-neutral-100 disabled:opacity-50"
          >Next</button>
        </div>
      )}
    </div>
  );
}

export default function VisualSearchPage() {
  const { executeSearch } = useResults();
  const { query, page, results, total, setQuery, setPage, setResults } = useResultsStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { rightTab, setRightTab, multiSelect, selectedIds, toggleMultiSelect, setSelectedIds, toggleSelectedId } = useUiStore();
  const [types, setTypes] = useState<Array<ContentType | "media" | "all">>(["all"]);
  // Use persistent cache that survives component re-renders
  const getGlobalCache = (): Map<string, UnifiedSearchResult> => {
    const obj = cacheStore.get<Record<string, UnifiedSearchResult>>('globalResultsCache');
    return new Map(Object.entries(obj || {}));
  };

  const setGlobalCache = (cache: Map<string, UnifiedSearchResult>) => {
    const data = Object.fromEntries(cache.entries());
    cacheStore.set('globalResultsCache', data);
  };
  // page/total/multiSelect/selectedIds now from stores
  const [canvasLayout, setCanvasLayout] = useState<'grid' | 'freeform'>('grid');
  const [canvasId, setCanvasId] = useState<string | null>(null);
  const [canvases, setCanvases] = useState<Array<{ id: string; name: string; key: string; updatedAt?: string }>>([])
  const [showCanvasManager, setShowCanvasManager] = useState(false)
  const [editingCanvas, setEditingCanvas] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  // Canvas editor controlled fields
  const [canvasName, setCanvasName] = useState<string>('')
  const [canvasProjectId, setCanvasProjectId] = useState<string>('')
  const [canvasLoras, setCanvasLoras] = useState<any[]>([])
  const [loraTraining, setLoraTraining] = useState<null | { status: string; requestId?: string }>(null)
  const [allLoras, setAllLoras] = useState<Array<{
    canvasId: string;
    canvasName: string;
    loraId: string;
    path: string;
    triggerWord: string;
    scale: number;
    artifactUrl: string;
    status: string;
  }>>([]);
  const [canvasNote, setCanvasNote] = useState<string>('')

  // Fetch global LoRAs on mount and when rightTab changes to generate
  useEffect(() => {
    if (rightTab === 'generate') {
      const fetchAllLoras = async () => {
        try {
          const response = await fetch('/api/loras');
          if (response.ok) {
            const loras = await response.json();
            setAllLoras(Array.isArray(loras) ? loras : []);
            debug('vs:loras', 'Fetched', loras.length, 'global LoRAs');
          }
        } catch (error) {
          debug('vs:loras', 'Failed to fetch global LoRAs:', error);
        }
      };
      void fetchAllLoras();
    }
  }, [rightTab]);
  const [isEditingName, setIsEditingName] = useState<boolean>(false)
  const [projectsList, setProjectsList] = useState<Array<{ project_id: string; name: string }>>([])
  const [selected, setSelected] = useState<UnifiedSearchResult | null>(null);
  const { pinned, addPin, movePin, removePin, reorderPinned, setPinned: setPinnedInStore } = useCanvasStore();
  const pinnedRef = useRef<PinnedItem[]>([]);

  // Keep ref in sync with state
  useEffect(() => {
    pinnedRef.current = pinned;
  }, [pinned]);
  // zCounter now handled in store
  const canvasRef = useRef<HTMLDivElement | null>(null);
  // Right pane tab and generation output state
  // rightTab now from uiStore
  const [genLoading, setGenLoading] = useState(false);
  const [genUrl, setGenUrl] = useState<string | null>(null);
  const [genMode, setGenMode] = useState<'image' | 'video' | 'audio' | 'text' | null>(null);
  const [genRaw, setGenRaw] = useState<any>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const agentRunLockRef = useRef(false);
  // Bridge for agent → UI actions
  useEffect(() => {
    (window as any).__agentApi = {
      // Called by client after tool pinToCanvas returns
      pin: (payload: { id?: string; title?: string; url?: string; needsLookup?: boolean }) => {
        // debug: agent pin bridge invoked
        if (!payload?.url && !payload?.id) return;

        debug('vs:agent:pin', 'payload', payload);

        let targetResult: UnifiedSearchResult | null = null;

                // Try to find the content in current search results or global cache if no URL provided
        if (!payload.url && payload.id) {
          debug('vs:agent:pin', 'lookup id', payload.id, 'results', results.length);

          // Load persistent cache
          const globalResultsCache = getGlobalCache();
          debug('vs:agent:cache', 'size', globalResultsCache.size, 'has?', globalResultsCache.has(payload.id));

          // Helpful error if cache is empty
          if (globalResultsCache.size === 0 && results.length === 0) {
            debug('vs:agent:cache', 'no cache, search first');
          }

          // First try current results
          targetResult = results.find((r: UnifiedSearchResult) => r.id === payload.id || r.title === payload.id) || null;
          debug('vs:agent:pin', 'found in results', !!targetResult);

          // If not found, try persistent global cache
          if (!targetResult) {
            targetResult = globalResultsCache.get(payload.id) || null;
            debug('vs:agent:cache', 'found in cache', !!targetResult);
            if (targetResult) {
              debug('vs:agent:cache', 'hit url', targetResult.metadata?.cloudflare_url);
            }

            // Debug: check all cache keys for partial matches
            if (!targetResult && payload.id) {
              const cacheKeys = Array.from(globalResultsCache.keys());
              debug('vs:agent:cache', 'keys sample', cacheKeys.slice(0, 20));
              const matchingKeys = cacheKeys.filter(key => key.includes(payload.id!) || payload.id!.includes(key));
              debug('vs:agent:cache', 'partial keys', matchingKeys);

              // Try to find by any matching key
              if (matchingKeys.length > 0) {
                targetResult = globalResultsCache.get(matchingKeys[0]) || null;
                debug('vs:agent:cache', 'found by partial match', !!targetResult);
                if (targetResult) {
                  debug('vs:agent:cache', 'partial url', targetResult.metadata?.cloudflare_url);
                }
              }
            }
          }

          debug('vs:agent:pin', 'final result', targetResult?.id);
        }

        // Create pin object from found result or payload
        const pinObject: UnifiedSearchResult = targetResult ? {
          ...targetResult,
          title: payload.title || targetResult.title,
        } : {
          id: payload.id || `agent-${Date.now()}`,
          content_type: 'image',
          title: payload.title || 'Pinned by Agent',
          description: '',
          score: 0,
          metadata: {
            cloudflare_url: payload.url || '',
            media_type: 'image'
          } as any,
          preview: payload.title || payload.url || '',
        } as any;

        debug('vs:agent:pin', 'pinning', pinObject?.id);
        pinResult(pinObject);
        setRightTab('canvas');
      },
      // Helper to expose current pinned image URLs to the agent/chat
      getPinnedRefs: () => {
        try {
          return (pinnedRef.current || [])
            .map((p) => getResultMediaUrl(p.result))
            .filter(Boolean);
        } catch { return []; }
      },
      showResults: (resp: any) => {
        try {
          debug('vs:agent:results', 'showResults payload');
          // Handle multiple possible structures:
          // 1. Direct payload from agent: {results: {all: [...]}}
          // 2. Nested payload: {results: {all: [...]}}
          // 3. Direct array: [...]
          const all: UnifiedSearchResult[] =
            resp?.results?.all ||
            resp?.all ||
            resp?.results ||
            (Array.isArray(resp) ? resp : []);

          debug('vs:agent:results', 'extracted', all.length);

          if (Array.isArray(all) && all.length > 0) {
            setResults(all, all.length);
            setRightTab('results');

            // Cache all results globally for pin lookup using persistent storage
            const existingCache = getGlobalCache();
            const newCache = new Map(existingCache);

            all.forEach(item => {
              if (item.id) newCache.set(item.id, item);
              if (item.title) newCache.set(item.title, item);
              debug('vs:cache', 'caching', item.id, item.title);
            });

            setGlobalCache(newCache);
            debug('vs:cache', 'cached', all.length, 'total', newCache.size);

            // Debug: Check if 2068-odyssey is specifically cached
            newCache.get('2068-odyssey');

            debug('vs:agent:results', 'updated UI');
          } else {
            debug('vs:agent:results', 'no valid results');
          }
        } catch (e) {
          console.error('🔴 Bridge: showResults failed:', e);
        }
      },
      // Surface server tool messages (e.g., no LoRA found) to the user
      showMessage: (payload: any) => {
        try {
          const level = (payload?.level || 'info').toString();
          const text = (payload?.text || '').toString();
          if (text) {
            // Basic UI fallback: alert + console log; avoids silent failures
            console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log']('[agent]', text);
            if (typeof window !== 'undefined') {
              try { window.alert(text); } catch {}
            }
          }
        } catch {}
      },
      // Simplified path: run generation directly using the plan; show Output
      prepareGenerate: async (payload: any) => {
        debug('vs:agent:gen', 'prepareGenerate');
        try {
          if (agentRunLockRef.current || genLoading) return; agentRunLockRef.current = true;
          const mode = payload?.type as 'image' | 'video' | 'audio' | 'text' | undefined;
          const model = payload?.model as string | undefined;
          const prompt = payload?.prompt as string | undefined;
          const planRefs: string[] = Array.isArray(payload?.refs) ? payload.refs : [];
          const pinnedUrls = (pinnedRef.current || []).map((p) => getResultMediaUrl(p.result)).filter(Boolean);

          // Convert planRefs IDs to actual URLs by looking them up in pinned items or cache
          const resolvedPlanRefs: string[] = [];
          for (const ref of planRefs) {
            // Check if ref is already a URL
            if (ref.startsWith('http')) {
              resolvedPlanRefs.push(ref);
            } else {
              // Look up the URL by content ID in pinned items
              const pinnedItem = (pinnedRef.current || []).find(p => p.result.id === ref || p.result.title === ref);
              if (pinnedItem) {
                const url = getResultMediaUrl(pinnedItem.result);
                if (url) {
                  resolvedPlanRefs.push(url);
                  debug('vs:agent:gen', 'resolved id', ref);
                } else {
                  // eslint-disable-next-line no-console
                  console.warn('Bridge: missing url for pinned', ref);
                }
              } else {
                // Try to find in global cache
                const globalResultsCache = getGlobalCache();
                const cachedItem = globalResultsCache.get(ref);
                if (cachedItem) {
                  const url = getResultMediaUrl(cachedItem);
                  if (url) {
                    resolvedPlanRefs.push(url);
                    debug('vs:agent:gen', 'resolved from cache', ref);
                  } else {
                    // eslint-disable-next-line no-console
                    console.warn('Bridge: missing url for cache', ref);
                  }
                } else {
                  // eslint-disable-next-line no-console
                  console.warn('Bridge: could not resolve id', ref);
                }
              }
            }
          }

          const refs: string[] = (resolvedPlanRefs.length > 0 ? resolvedPlanRefs : pinnedUrls) as string[];

          debug('vs:agent:gen', 'refs', { plan: planRefs.length, resolved: resolvedPlanRefs.length, pinned: pinnedUrls.length, final: refs.length });

          if (!mode || !prompt) return;
          // Update status API
          try {
            await fetch('/api/agent/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ generation: { running: true, startedAt: new Date().toISOString(), params: { mode, model, prompt, refs } } }) });
          } catch {}
          setGenLoading(true);
          setGenUrl(null);
          setGenRaw(null);
          setRightTab('output');

          const body = { mode, model, prompt, refs, options: payload?.options || {} } as any;
          debug('vs:agent:gen', 'sending');
          const json = await (await import('./services/generateService')).runGenerate(body);

          debug('vs:agent:gen', 'response');

          const candidates = [
            (json as any)?.url,
            (json as any)?.result?.video?.url,
            (json as any)?.result?.url,
            (json as any)?.result?.images?.[0]?.url,
            (json as any)?.result?.image?.url,
            (json as any)?.result?.audio?.url,
            (json as any)?.result?.output?.url,
            (json as any)?.result?.output?.[0]?.url,
            (json as any)?.result?.data?.images?.[0]?.url,
            (json as any)?.result?.data?.video?.url,
          ].filter(Boolean) as string[];

          debug('vs:agent:gen', 'url candidates', candidates.length);

          setGenMode(mode);
          const out = candidates[0] || null;
          setGenUrl(out);
          setGenRaw(json?.result ?? json);
          setGenLoading(false);

          debug('vs:agent:gen', 'final url', !!out, mode);

          // Check for errors in the response
          // Log note if present
          // note can be displayed in UI if desired

          try {
            await fetch('/api/agent/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ generation: { running: false, finishedAt: new Date().toISOString(), url: out, mode, params: { mode, model, prompt, refs }, success: !!out } }) });
          } catch {}
        } catch (e) {
          setGenLoading(false);
          console.error('🔴 Bridge: Generation failed with error:', e);
          console.error('🔴 Bridge: Error details:', {
            message: (e as any)?.message,
            stack: (e as any)?.stack,
            name: (e as any)?.name
          });
          try {
            await fetch('/api/agent/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ generation: { running: false, finishedAt: new Date().toISOString(), error: (e as any)?.message || 'Unknown error' } }) });
          } catch {}
        } finally { agentRunLockRef.current = false; }
      },
      showOutput: (payload: any) => {
        try {
          const t = payload?.type as 'image' | 'video' | 'audio' | 'text';
          const j = payload?.response;
          const pinnedRefs: string[] = (pinnedRef.current || [])
            .map((p) => getResultMediaUrl(p.result))
            .filter(Boolean) as string[];
          const candidates = [
            j?.url,
            j?.result?.url,
            j?.result?.images?.[0]?.url,
            j?.result?.image?.url,
            j?.result?.audio?.url,
            j?.result?.video?.url,
            j?.result?.output?.url,
            j?.result?.output?.[0]?.url,
            j?.result?.data?.images?.[0]?.url,
            j?.result?.data?.video?.url,
            ...pinnedRefs,
          ].filter(Boolean) as string[];
          setGenMode(t);
          setGenUrl(candidates[0] || null);
          setGenRaw(j?.result ?? j);
          setGenLoading(false);
          setRightTab('output');
        } catch {}
      },
      // When server requests pinned refs, call /api/generate on client using current pins
      requestPinnedThenGenerate: async (payload: any) => {
        try {
          const refs: string[] = (pinnedRef.current || [])
            .map((p) => getResultMediaUrl(p.result))
            .filter(Boolean) as string[];
          const body = {
            mode: payload?.type,
            model: payload?.model,
            prompt: payload?.prompt,
            refs,
            options: payload?.options || {},
          };
          if (agentRunLockRef.current || genLoading) return; agentRunLockRef.current = true; setGenLoading(true);
          setRightTab('output');
          const res = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          const json = await res.json();
          const candidates = [
            json?.url,
            json?.result?.url,
            json?.result?.images?.[0]?.url,
            json?.result?.image?.url,
            json?.result?.audio?.url,
            json?.result?.video?.url,
            json?.result?.data?.images?.[0]?.url,
            json?.result?.data?.video?.url,
          ].filter(Boolean) as string[];
          setGenMode(payload?.type);
          setGenUrl(candidates[0] || null);
          setGenRaw(json?.result ?? json);
          setGenLoading(false);
        } catch (e) {
          setGenLoading(false);
          console.error(e);
        } finally { agentRunLockRef.current = false; }
      },
    };
  }, []);

  // Results are now managed by useResults hook and resultsStore

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      try {
        setLoading(true);
        setError(null);
        await executeSearch(query);
      } catch (err: any) {
        setError(err.message || 'Search failed');
      } finally {
        setLoading(false);
      }
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

  const toggleSelect = (r: UnifiedSearchResult, shiftKey: boolean = false) => {
    if (shiftKey) {
      toggleMultiSelect(true);
    }
    toggleSelectedId(r.id);
  };

  const pinSelected = () => {
    const toPin = results.filter((r: UnifiedSearchResult) => selectedIds.has(r.id));
    toPin.forEach((r: UnifiedSearchResult) => pinResult(r));
    setSelectedIds(new Set());
    toggleMultiSelect(false);
    setRightTab('canvas');
  };

  const pinResult = (r: UnifiedSearchResult) => {
    const canvas = canvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    const baseX = Math.max(0, (rect?.width || 800) * 0.05 + Math.random() * 60);
    const baseY = Math.max(0, (rect?.height || 500) * 0.05 + Math.random() * 60);
    addPin(r, baseX, baseY);
  };

  // movePinned from store

  // removePinned from store

  const clearCanvas = () => {
    setPinnedInStore(() => [])
    setCanvasName('')
    setCanvasNote('')
    setCanvasProjectId('')
    setCanvasLoras([])
    setLoraTraining(null)
  };

  const refreshCurrentCanvas = async () => {
    if (!canvasId) return
    try {
      const j = await (await import('./services/canvasService')).getCanvasLoras(canvasId)
      setCanvasLoras(Array.isArray(j.loras) ? j.loras : [])
      await fetchAllLoras()
    } catch (e) {
      console.error('Canvas refresh failed:', e)
    }
  }
  // reorderPinned from store

  const collectCanvasPayload = (override?: { name?: string; note?: string; projectId?: string }) => {
    return {
      id: `canvas-${Date.now()}`,
      name: (override?.name ?? canvasName ?? 'Untitled Canvas').trim(),
      note: override?.note ?? canvasNote ?? '',
      projectId: (override?.projectId ?? canvasProjectId) || undefined,
      items: pinned.map((p: PinnedItem, idx: number) => ({
        id: p.result.id,
        type: p.result.content_type,
        position: { x: p.x, y: p.y, w: p.width, h: p.height, z: p.z },
        order: idx,
        metadata: p.result.metadata,
      })),
      createdAt: new Date().toISOString(),
    }
  }

  const saveCanvas = async (override?: { name?: string; note?: string; projectId?: string }) => {
    try {
      const base = collectCanvasPayload(override)
      const payload = { ...base, id: canvasId || base.id }
      const json = await (await import('./services/canvasService')).saveCanvas(payload)
      setCanvasId(payload.id)
      try { if (typeof window !== 'undefined') localStorage.setItem('lastCanvasId', payload.id) } catch {}
      void refreshCanvases()
      debug('vs:canvas', 'saved')
    } catch (e) {
      console.error('Canvas save failed:', (e as Error).message)
    }
  }

  const autoSaveCanvas = async () => {
    if (!canvasId) {
      // Create first, then future edits will update
      await saveCanvas();
      return;
    }
    try {
      const base = collectCanvasPayload()
      const payload = { ...base, id: canvasId }
      await (await import('./services/canvasService')).updateCanvas(payload)
      debug('vs:canvas', 'auto-saved')
    } catch (e) {
      console.error('Canvas auto-save failed:', (e as Error).message)
    }
  }

  const refreshCanvases = async () => {
    try {
      const j = await (await import('./services/canvasService')).listCanvases()
      setCanvases((j.items || []).map((x: any) => ({ id: x.id, name: x.name, key: x.key, updatedAt: x.updatedAt })))
    } catch {}
  }

  useEffect(() => {
    void refreshCanvases()
    void fetchAllLoras()
  }, [])

  // Fetch all LoRAs from the global catalog
  const fetchAllLoras = async () => {
    try {
      const loras = await (await import('./services/canvasService')).listAllLoras()
      setAllLoras(loras)
    } catch (error) {
      console.error('Failed to fetch all LoRAs:', error)
    }
  }

  // Refresh current canvas LoRAs when canvasId changes
  useEffect(() => {
    if (canvasId) {
      void refreshCurrentCanvas()
    }
  }, [canvasId])

  const loadCanvas = async (id: string) => {
    try {
      const j = await (await import('./services/canvasService')).getCanvas(id)
      const c = j.canvas
      setCanvasId(c.id)
      try { if (typeof window !== 'undefined') localStorage.setItem('lastCanvasId', c.id) } catch {}
      // Load pinned from items
      setPinnedInStore(() => (c.items || []).map((it: any, idx: number) => ({
        id: `${it.id}-${idx}-${Math.random().toString(36).slice(2,6)}`,
        result: {
          id: it.id,
          content_type: it.type,
          title: (it.metadata?.title || it.id),
          score: 1,
          metadata: it.metadata || {},
          url: it.metadata?.cloudflare_url || it.metadata?.s3_url,
        } as any,
        x: it.position?.x ?? 0,
        y: it.position?.y ?? 0,
        z: it.position?.z ?? (idx + 1),
        width: it.position?.w ?? 280,
        height: it.position?.h ?? 220,
      })));
      // Name + note + project into controlled state
      setCanvasName(c.name || '')
      setCanvasNote(c.note || '')
      setCanvasProjectId(c.projectId || '')
      setCanvasLoras(Array.isArray(c.loras) ? c.loras : [])
      setRightTab('canvas')
    } catch (e) {
      console.error('Canvas load failed:', (e as Error).message)
    }
  }

  // On mount: if a specific canvas is requested via ?canvas=, load it; otherwise do nothing
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const param = params.get('canvas')
    if (!param) return
    ;(async () => {
      try {
        // Try direct id
        let ok = false
        try {
          const r = await fetch(`/api/canvas?id=${encodeURIComponent(param)}`)
          if (r.ok) { await loadCanvas(param); ok = true }
        } catch {}
        if (ok) return
        // Resolve by name via index
        const idxRes = await fetch('/api/canvas')
        const idx = await idxRes.json()
        const items: any[] = idx.items || []
        const match = items.find((it) => (it.name || '').toLowerCase() === param.toLowerCase())
        if (match?.id) await loadCanvas(match.id)
      } catch {}
    })()
  }, [])

  // If there are training LoRAs on loaded canvas, poll their status until completion
  const polledReqIdsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!canvasId) return
    const pending = (canvasLoras || []).filter((l: any) => l?.status === 'training' && l?.requestId)
    pending.forEach((l: any) => {
      const rid = l.requestId
      if (!rid || polledReqIdsRef.current.has(rid)) return
      polledReqIdsRef.current.add(rid)
      const tick = async () => {
        try {
          const sj = await (await import('./services/canvasService')).getTrainStatus(rid, canvasId)
          if (sj?.status === 'COMPLETED' || (sj as any)?.lora) {
            // Refresh
            await loadCanvas(canvasId)
            return
          }
        } catch {}
        setTimeout(tick, 5000)
      }
      setTimeout(tick, 1000)
    })
  }, [canvasId, canvasLoras])

  async function trainCanvasLora() {
    try {
      // Ensure canvas exists
      if (!canvasId) {
        await saveCanvas();
      }
      const id = canvasId || ''
      if (!id) throw new Error('Canvas ID missing')
      setLoraTraining({ status: 'starting' })
      const j = await (await import('./services/canvasService')).trainLora(id, 'CANVAS_STYLE')
      const reqId = j.requestId as string
      setLoraTraining({ status: 'queued', requestId: reqId })
      // Add training LoRA to current state immediately
      if (j.lora) {
        setCanvasLoras(prev => [...prev.filter(l => l.requestId !== reqId), j.lora])
      }
      // Poll status
      const poll = async () => {
        try {
          const s = await fetch(`/api/canvas/train-status?requestId=${encodeURIComponent(reqId)}&canvasId=${encodeURIComponent(id)}`)
          const sj = await s.json()
          if (s.ok) {
            const st = (sj?.status || '').toString()
            setLoraTraining({ status: st || 'IN_PROGRESS', requestId: reqId })
            // Update LoRA in state when status changes
            if (sj.lora) {
              setCanvasLoras(prev => prev.map(l => l.requestId === reqId ? sj.lora : l))
            }
            if (st === 'COMPLETED') {
              // Refresh loras quickly
              await refreshCurrentCanvas()
              return
            }
          }
        } catch {}
        setTimeout(poll, 5000)
      }
      setTimeout(poll, 3000)
    } catch (e) {
      console.error('LoRA training failed:', (e as Error).message)
      setLoraTraining({ status: 'failed' })
    }
  }

  const deleteCanvas = async (id: string) => {
    try {
      const res = await fetch(`/api/canvas?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      const j = await res.json()
      if (!res.ok) throw new Error(j?.error || 'Delete failed')
      if (canvasId === id) setCanvasId(null)
      void refreshCanvases()
    } catch (e) {
      console.error('Delete failed:', e)
    }
  }

  const renameCanvas = async (id: string, newName: string) => {
    try {
      const res = await fetch('/api/canvas', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, name: newName }) })
      const j = await res.json()
      if (!res.ok) throw new Error(j?.error || 'Rename failed')
      void refreshCanvases()
      setEditingCanvas(null)
    } catch (e) {
      console.error('Rename failed:', e)
    }
  }

  const startEdit = (canvas: { id: string; name: string }) => {
    setEditingCanvas(canvas.id)
    setEditingName(canvas.name)
  }

  const cancelEdit = () => {
    setEditingCanvas(null)
    setEditingName('')
  }

  const saveEdit = () => {
    if (editingCanvas && editingName.trim()) {
      renameCanvas(editingCanvas, editingName.trim())
    }
  }

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

  // Fetch projects once and keep in state for controlled select
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/projects')
        if (!res.ok) return
        const json = await res.json()
        if (!cancelled) setProjectsList((json.projects || []).map((p: any) => ({ project_id: p.project_id, name: p.name })))
      } catch (e) {
        console.error('Failed to load projects:', e)
      }
    })()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="min-h-screen w-full bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-7xl px-6 py-6">

        <form onSubmit={handleSubmit} className="mt-2 flex flex-col sm:flex-row gap-3">
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

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Left: Agent */}
          <div className="lg:col-span-2">
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
              <div className="text-sm text-neutral-400 mb-2">Agent</div>
              <AgentChat />
            </div>
          </div>

          {/* Right main area with tabs (now includes Generate) */}
          <div className="lg:col-span-3">
            <RightPane
            results={results}
            loading={loading}
            totalResults={total}
            onPin={pinResult}
            onOpen={(result) => {
              try {
                if (result && typeof result === 'object' && result.id) {
                  setSelected(result);
                } else {
                  console.warn('Invalid result passed to onOpen:', result);
                }
              } catch (error) {
                console.error('Error setting selected result:', error);
              }
            }}
            canvasRef={canvasRef}
            pinned={pinned}
            movePinned={movePin}
            removePinned={removePin}
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

              setSaveStatus('saving');

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

                if (resp.ok) {
                  setSaveStatus('saved');
                  setTimeout(() => setSaveStatus('idle'), 2000);
                  debug('vs:gen', 'saved to library')
                } else {
                  const j = await resp.json();
                  setSaveStatus('error');
                  setTimeout(() => setSaveStatus('idle'), 2000);
                  console.error('Save failed:', j?.error || 'Save failed');
                }
              } catch (e) {
                setSaveStatus('error');
                setTimeout(() => setSaveStatus('idle'), 2000);
                console.error('Save failed:', (e as Error).message);
              }
            }}
            selectedIds={selectedIds}
            multiSelect={multiSelect}
            toggleSelect={toggleSelect}
            page={page}
            setPage={setPage}
            executeSearch={executeSearch}
            query={query}
            setQuery={setQuery}
            isEditingName={isEditingName}
            setIsEditingName={setIsEditingName}
            canvasName={canvasName}
            setCanvasName={setCanvasName}
            autoSaveCanvas={autoSaveCanvas}
            canvasProjectId={canvasProjectId}
            setCanvasProjectId={setCanvasProjectId}
            projectsList={projectsList}
            saveCanvas={() => saveCanvas()}
            setShowCanvasManager={setShowCanvasManager}
            clearCanvas={clearCanvas}
            canvasLayout={canvasLayout}
            setCanvasLayout={setCanvasLayout}
            reorderPinned={reorderPinned}
            canvasNote={canvasNote}
            setCanvasNote={setCanvasNote}
            canvasId={canvasId}
            handleNoteSave={async () => {
              if (!canvasId) return;
              try {
                await fetch('/api/canvas', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    id: canvasId,
                    name: canvasName || 'Untitled Canvas',
                    note: canvasNote,
                    projectId: canvasProjectId,
                    items: pinnedRef.current.map((p, idx) => ({
                      id: p.result.id,
                      type: p.result.content_type,
                      position: { x: p.x, y: p.y, w: p.width, h: p.height, z: p.z },
                      order: idx,
                      metadata: p.result.metadata,
                    })),
                    createdAt: new Date().toISOString(),
                  })
                });
              } catch (e) {
                console.error('Note save failed:', e);
              }
            }}
            pinSelected={pinSelected}
            onParentGenStart={handleGenStart}
            onParentGenResult={handleGenResult}
            canvasLoras={canvasLoras}
            loraTraining={loraTraining}
            trainCanvasLora={trainCanvasLora}
            allLoras={allLoras}
            setAllLoras={setAllLoras}
            saveStatus={saveStatus}
            setSaveStatus={setSaveStatus}
          />
          </div>
        </div>
      </div>

      <DetailsOverlay r={selected} onClose={() => setSelected(null)} />

      {showCanvasManager && (
        <CanvasManagerModal onClose={() => setShowCanvasManager(false)} onLoad={(id) => { setShowCanvasManager(false); void loadCanvas(id) }} />
      )}
    </div>
  );
}


