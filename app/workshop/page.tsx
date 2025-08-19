"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { UnifiedSearchResult, UnifiedSearchResponse, ContentType, PinnedItem, LayoutAsset } from './types';
import { getResultMediaUrl } from './utils/mediaUrl';
import { stripCircularDescription } from './utils/textCleanup';
import * as searchService from './services/searchService';
import { useResults } from './hooks/useResults';
import { useAgentStream } from './hooks/useAgentStream';
import { cacheStore } from './services/cacheStore';
import ResultsGrid from './components/ResultsGrid';
import VirtualResultsGrid from './components/VirtualResultsGrid';
import Pagination from './components/Pagination';
import VSResultCard from './components/ResultCard/ResultCard';
import OptimizedResultCard from './components/ResultCard/OptimizedResultCard';
import SkeletonCard from './components/SkeletonCard';
import DetailsOverlay from './components/DetailsOverlay';
// Dynamically import CanvasBoardRGL to avoid SSR issues with react-grid-layout
const CanvasBoard = dynamic(() => import('./components/Canvas/CanvasBoardRGL'), {
  ssr: false,
  loading: () => (
    <div className="relative w-full min-h-[640px] rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden flex items-center justify-center">
      <div className="text-neutral-400">Loading canvas...</div>
    </div>
  )
});
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

// Dynamically import Layout components
const LayoutsBrowser = dynamic(() => import('./components/Layout/LayoutsBrowser'), { ssr: false });

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

// LayoutsTab component for managing and viewing layouts
function LayoutsTab() {
  const router = useRouter();
  const [selectedLayout, setSelectedLayout] = useState<LayoutAsset | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [loadingLayout, setLoadingLayout] = useState(false);

  const handleSelectLayout = async (layout: LayoutAsset) => {
    console.log('[LayoutsTab] Selecting layout:', layout.id, 'fetching fresh data...');
    setLoadingLayout(true);

    try {
      // Always fetch fresh layout data from API to avoid cache issues
      const response = await fetch(`/api/media-assets/${layout.id}?ts=${Date.now()}`, {
        cache: 'no-store'
      });

      if (!response.ok) {
        throw new Error(`Failed to load layout: ${response.status}`);
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to load layout');
      }

      console.log('[LayoutsTab] Fresh layout data loaded:', data.asset.id, 'items:', data.asset.layout_data.items.length);
      // Navigate to standalone editor page
      router.push(`/layout-editor/${data.asset.id}`);
    } catch (error) {
      console.error('[LayoutsTab] Failed to load fresh layout:', error);
      alert(`Failed to load layout: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoadingLayout(false);
    }
  };

  // Show the layouts browser by default; editor opens as overlay modal
  return (
    <div>
      <div className="text-sm text-neutral-400 mb-3">Layouts</div>
      {loadingLayout && (
        <div className="text-center p-4 text-neutral-400 text-sm">
          Loading fresh layout data...
        </div>
      )}
      <LayoutsBrowser onSelectLayout={handleSelectLayout} selectedLayoutId={selectedLayout ? (selectedLayout as LayoutAsset).id : null} />
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
  setRightTab?: (tab: 'results' | 'canvas' | 'layouts' | 'output' | 'generate') => void;
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
          if (payload?.options && typeof payload.options === 'object') {
            setValues((prev) => ({ ...prev, ...payload.options }));
            // If loras provided, also mirror them into selectedLoras so UI reflects selection
            try {
              const lorasIn = Array.isArray(payload.options.loras) ? payload.options.loras : [];
              if (lorasIn.length > 0) {
                setSelectedLoras(lorasIn.map((l: any, idx: number) => ({
                  id: l.id || String(idx),
                  path: l.artifactUrl || l.path,
                  scale: l.scale ?? 1.0,
                  selected: true,
                  label: l.triggerWord || l.canvasName || l.id || 'LoRA'
                })));
              }
            } catch {}
          }
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

      // Agent path: merge loras provided via values (from __genPanel.prepare)
      if (mode === 'image' && Array.isArray((values as any).loras) && (values as any).loras.length > 0) {
        body.options = body.options || {}
        const lvs = (values as any).loras as any[]
        body.options.loras = lvs.map((l: any) => ({ path: l.artifactUrl || l.path, scale: l.scale ?? 1.0 }))
        body.model = 'fal-ai/flux-lora'
      }
      // Debug: surface lora info in console for verification
      try { console.log('🧪 Generating with model:', body.model, 'loras:', body?.options?.loras); } catch {}
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
  resizePinned,
  setPinned,
  setShowCanvasModal,
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
  showCanvasManager,
  setShowCanvasManager,
  clearCanvas,
  // canvasLayout removed
  // setCanvasLayout removed
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
  exportAsLayout,
  // Canvas manager functions
  loadCanvas,
  deleteCanvas,
  refreshCanvases,
  renameCanvas,
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
  resizePinned: (id: string, width: number, height: number) => void;
  setPinned: (updater: (prev: PinnedItem[]) => PinnedItem[]) => void;
  setShowCanvasModal: (show: boolean) => void;
  tab: 'results' | 'canvas' | 'layouts' | 'output' | 'generate';
  setTab: (t: 'results' | 'canvas' | 'layouts' | 'output' | 'generate') => void;
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
  executeSearch: (q: string, nextPage?: number, type?: string, immediate?: boolean) => void;
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
  showCanvasManager: boolean;
  setShowCanvasManager: (v: boolean) => void;
  clearCanvas: () => void;
  // canvasLayout removed - only RGL canvas now
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
  exportAsLayout: () => Promise<void>;
  // Canvas manager functions
  loadCanvas: (id: string) => Promise<void>;
  deleteCanvas: (id: string) => Promise<void>;
  refreshCanvases: () => Promise<void>;
  renameCanvas: (id: string, newName: string) => Promise<void>;
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
            onClick={() => setTab('generate')}
            className={classNames(
              'px-3 py-1.5 text-sm rounded-md border',
              tab === 'generate' ? 'border-neutral-700 bg-neutral-800' : 'border-neutral-800 bg-neutral-950 hover:bg-neutral-900'
            )}
          >
            Generate
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
            onClick={() => setTab('canvas')}
            className={classNames(
              'px-3 py-1.5 text-sm rounded-md border',
              tab === 'canvas' ? 'border-neutral-700 bg-neutral-800' : 'border-neutral-800 bg-neutral-950 hover:bg-neutral-900'
            )}
          >
            Canvas
          </button>
          <button
            onClick={() => setTab('layouts')}
            className={classNames(
              'px-3 py-1.5 text-sm rounded-md border',
              tab === 'layouts' ? 'border-neutral-700 bg-neutral-800' : 'border-neutral-800 bg-neutral-950 hover:bg-neutral-900'
            )}
          >
            Layouts
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
            {/* Show results using virtual scrolling for performance */}
            {loading ? (
              <VirtualResultsGrid
                results={Array(12).fill(null).map((_, i) => ({
                  id: `skeleton-${i}`,
                  content_type: 'skeleton' as any,
                  title: '',
                  score: 0,
                  metadata: {}
                }))}
                renderCard={() => <SkeletonCard />}
              />
            ) : results.length > 0 ? (
              <>
                <VirtualResultsGrid
                  results={results}
                  renderCard={(r) => (
                    <OptimizedResultCard
                      r={r}
                      onPin={onPin}
                      onOpen={onOpen}
                      onLabelClick={(label) => {
                        setQuery(label);
                        executeSearch(label, 1, undefined, true);
                        setTab('results');
                      }}
                      selectionEnabled={multiSelect}
                      selected={selectedIds.has(r.id)}
                      onToggleSelect={toggleSelect}
                    />
                  )}
                />

                {/* Pagination Controls - simplified for now */}
                {results.length >= 100 && (
                  <div className="flex items-center justify-center gap-4 mt-6">
                    <button
                      onClick={() => executeSearch(query, Math.max(1, page - 1), undefined, true)}
                      disabled={page <= 1}
                      className="px-3 py-2 text-sm border border-neutral-700 bg-neutral-800 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-700 transition-colors"
                    >
                      Previous
                    </button>
                    <div className="text-sm text-neutral-400">
                      Page {page} • {results.length} results
                    </div>
                    <button
                      onClick={() => executeSearch(query, page + 1, undefined, true)}
                      disabled={results.length < 100}
                      className="px-3 py-2 text-sm border border-neutral-700 bg-neutral-800 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-700 transition-colors"
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            ) : (
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
            // canvasLayout removed
            loraTraining={loraTraining}
            trainCanvasLora={trainCanvasLora}
            canvasLoras={canvasLoras}
            exportAsLayout={exportAsLayout}
          />
          {/* Canvas Content Area - shows either canvas board or canvas manager */}
          <div className="rounded-xl border border-neutral-800 p-2 bg-neutral-950 min-h-[640px] h-auto">
            {showCanvasManager ? (
              <CanvasManagerModal
                onLoad={(id) => {
                  setShowCanvasManager(false); // Hide canvas manager
                  void loadCanvas(id); // Load the canvas
                }}
                onDelete={(id) => {
                  void deleteCanvas(id).then(() => {
                    void refreshCanvases()
                  })
                }}
                onRename={(id, newName) => {
                  void renameCanvas(id, newName).then(() => {
                    void refreshCanvases()
                  })
                }}
                onTrainLora={(id) => {
                  // Load the canvas first, then train LoRA
                  setShowCanvasManager(false); // Hide canvas manager
                  void loadCanvas(id).then(() => {
                    void trainCanvasLora()
                  })
                }}
              />
            ) : pinned.length === 0 ? (
              <div className="h-full flex items-center justify-center text-neutral-500 text-sm">Pin results here to build a visual board.</div>
            ) : (
              <GridPinned items={pinned} onReorder={reorderPinned} onRemove={removePinned} onOpen={onOpen} />
            )}
          </div>

          {/* RGL Canvas Modal Button */}
          <div className="mt-3 text-center">
            <button
              onClick={() => setShowCanvasModal(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              disabled={pinned.length === 0}
            >
              Open Canvas ({pinned.length} items)
            </button>
          </div>
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
      ) : tab === 'layouts' ? (
        <div className="mt-3 h-full">
          <LayoutsTab />
        </div>
      ) : tab === 'output' ? (
        <div className="mt-3 space-y-3">
          {genLoading ? (
            <div className="min-h-[640px] h-auto w-full flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950">
              <div className="flex items-center gap-3 text-neutral-300">
                <div className="w-5 h-5 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
                Generating…
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-neutral-800 p-3 bg-neutral-900/40">
              {genUrl && genMode === 'image' && (
                <img src={genUrl} className="w-full h-auto object-contain rounded-md border border-neutral-800 bg-black" alt="output" />
              )}
              {genUrl && genMode === 'video' && (
                <video src={genUrl} controls className="w-full h-auto rounded-md border border-neutral-800 bg-black" />
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
  const { query, results, setQuery, setResults, page, setPage } = useResultsStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { rightTab, setRightTab, multiSelect, selectedIds, toggleMultiSelect, setSelectedIds, toggleSelectedId } = useUiStore();
  const [types, setTypes] = useState<Array<ContentType | "media" | "all">>(["all"]);

  // Agent stream processing state
  const [agentMessages, setAgentMessages] = useState<Array<{ role: 'user' | 'assistant' | 'tool'; content: string }>>([]);

      // Check localStorage for active tab preference (e.g., from layout editor)
    useEffect(() => {
      try {
        const savedTab = localStorage.getItem('workshop-active-tab');
        if (savedTab === 'layouts' || savedTab === 'canvas' || savedTab === 'output' || savedTab === 'generate' || savedTab === 'results') {
          setRightTab(savedTab as any);
          // Clear the preference after using it
          localStorage.removeItem('workshop-active-tab');
        }
      } catch (e) {
        console.warn('Failed to read localStorage:', e);
      }
    }, [setRightTab]);
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
  // canvasLayout removed - only RGL canvas now
  const [showCanvasModal, setShowCanvasModal] = useState(false);
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
  const { pinned, addPin, movePin, removePin, resizePin, reorderPinned, setPinned: setPinnedInStore } = useCanvasStore();
  const pinnedRef = useRef<PinnedItem[]>([]);
  const lastNameRef = useRef<string | null>(null);

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
  const genUrlRef = useRef<string | null>(null); // Ref for handlers to access latest URL
  const [genMode, setGenMode] = useState<'image' | 'video' | 'audio' | 'text' | null>(null);
  const [genRaw, setGenRaw] = useState<any>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const agentRunLockRef = useRef(false);
  const genQueueRef = useRef<any[]>([]);
  // Bridge for agent → UI actions
  useEffect(() => {
    (window as any).__agentApi = {
            // Called by agent for searchUnified actions
      searchUnified: async (payload: { query?: string; correlationId?: string }) => {
        if (payload.query) {
          debug('vs:agent:search', 'executing search:', payload.query);
          console.log(`[${payload.correlationId}] UI: searchUnified handler called with query:`, payload.query);

          // Wait for search to actually complete before sending ack
          try {
            console.log(`[${payload.correlationId}] UI: Starting search execution...`);
            await executeSearch(payload.query, 1, undefined, true);
            setRightTab('results');
            console.log(`[${payload.correlationId}] UI: Search execution completed`);

            // Send ack after search completes
            console.log(`[${payload.correlationId}] UI: Sending searchUnified ack`);
            await fetch('/api/agent/ack', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                correlationId: payload?.correlationId || 'workshop',
                step: 'searchunified',
                artifacts: { query: payload.query }
              })
            });
            console.log(`[${payload.correlationId}] UI: ✅ searchUnified ack sent after search completion`);

            // Heuristic: if the original request asks to "pin", proactively trigger pinToCanvas
            try {
              const original = (payload as any)?.originalRequest || '';
              if (/\bpin\b/i.test(original)) {
                const lower = original.toLowerCase();
                const wordToNum: Record<string, number> = {
                  'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
                  'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
                  'couple': 2, 'a couple': 2, 'few': 3, 'a few': 3
                };
                let requested = 2;
                for (const [w, n] of Object.entries(wordToNum)) {
                  if (lower.includes(w)) { requested = n; break; }
                }
                const digit = lower.match(/\b(\d{1,2})\b/);
                if (digit) {
                  const n = parseInt(digit[1], 10);
                  if (!Number.isNaN(n) && n > 0) requested = n;
                }

                // Pull latest results directly from the store
                const all = useResultsStore.getState().allResults || [];
                const items = all.slice(0, Math.min(requested, all.length));
                if (items.length > 0) {
                  console.log(`[${payload.correlationId}] UI: Auto-triggering pinToCanvas with ${items.length} items (from store)`);
                  try {
                    await (window as any).__agentApi?.pinToCanvas?.({
                      items,
                      count: items.length,
                      originalRequest: original,
                      correlationId: payload.correlationId
                    });
                  } catch {}
                } else {
                  console.log(`[${payload.correlationId}] UI: No results available to auto-pin after search`);
                }
              }
            } catch {}
          } catch (e) {
            console.error(`[${payload.correlationId}] UI: ❌ Failed to execute search or send ack:`, e);
          }
        }
      },
      // EXECUTOR: Navigate to different pages
      navigate: async (payload: { page?: string; params?: any; correlationId?: string }) => {
        try {
          if (payload.page) {
            console.log(`[${payload.correlationId}] EXECUTE: Navigating to ${payload.page}`);
            window.location.href = `/${payload.page}${payload.params ? '?' + new URLSearchParams(payload.params).toString() : ''}`;
            
            // ACK: Navigation initiated
            await fetch('/api/agent/ack', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                correlationId: payload?.correlationId || 'workshop',
                step: 'navigate',
                artifacts: { page: payload.page, params: payload.params }
              })
            });
          }
        } catch (e) {
          console.error('navigate failed:', e);
        }
      },
      // EXECUTOR: Open modals and UI overlays
      openModal: async (payload: { modalType?: string; data?: any; correlationId?: string }) => {
        try {
          console.log(`[${payload.correlationId}] EXECUTE: Opening modal ${payload.modalType}`);
          if (payload.modalType === 'canvas') {
            setShowCanvasModal(true);
          }
          // Add other modal types as needed
          
          // ACK: Modal opened
          await fetch('/api/agent/ack', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              correlationId: payload?.correlationId || 'workshop',
              step: 'openmodal',
              artifacts: { modalType: payload.modalType, opened: true }
            })
          });
        } catch (e) {
          console.error('openModal failed:', e);
        }
      },
      // EXECUTOR: Change UI views and tabs
      changeView: async (payload: { viewType?: string; options?: any; correlationId?: string }) => {
        try {
          console.log(`[${payload.correlationId}] EXECUTE: Changing view to ${payload.viewType}`);
          if (payload.viewType === 'results') setRightTab('results');
          if (payload.viewType === 'canvas') setRightTab('canvas');
          if (payload.viewType === 'generate') setRightTab('generate');
          if (payload.viewType === 'output') setRightTab('output');
          if (payload.viewType === 'layouts') setRightTab('layouts');
          
          // ACK: View changed
          await fetch('/api/agent/ack', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              correlationId: payload?.correlationId || 'workshop',
              step: 'changeview',
              artifacts: { viewType: payload.viewType, changed: true }
            })
          });
        } catch (e) {
          console.error('changeView failed:', e);
        }
      },
      // EXECUTOR: Select content items
      selectContent: async (payload: { selectionAction?: string; itemIds?: string[]; correlationId?: string }) => {
        try {
          console.log(`[${payload.correlationId}] EXECUTE: Content selection:`, payload);
          // TODO: Implement actual content selection logic
          
          // ACK: Selection completed
          await fetch('/api/agent/ack', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              correlationId: payload?.correlationId || 'workshop',
              step: 'selectcontent',
              artifacts: { selectionAction: payload.selectionAction, itemIds: payload.itemIds, selected: true }
            })
          });
        } catch (e) {
          console.error('selectContent failed:', e);
        }
      },
      // EXECUTOR: Control spatial environment
      spatialControl: async (payload: { spatialAction?: string; parameters?: any; correlationId?: string }) => {
        try {
          console.log(`[${payload.correlationId}] EXECUTE: Spatial control:`, payload);
          // TODO: Implement actual spatial controls
          
          // ACK: Spatial control completed
          await fetch('/api/agent/ack', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              correlationId: payload?.correlationId || 'workshop',
              step: 'spatialcontrol',
              artifacts: { spatialAction: payload.spatialAction, parameters: payload.parameters, executed: true }
            })
          });
        } catch (e) {
          console.error('spatialControl failed:', e);
        }
      },
      // EXECUTOR: Manage workflows
      workflowControl: async (payload: { workflowId?: string; workflowAction?: string; correlationId?: string }) => {
        try {
          console.log(`[${payload.correlationId}] EXECUTE: Workflow control:`, payload);
          // TODO: Implement actual workflow management
          
          // ACK: Workflow control completed
          await fetch('/api/agent/ack', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              correlationId: payload?.correlationId || 'workshop',
              step: 'workflowcontrol',
              artifacts: { workflowId: payload.workflowId, workflowAction: payload.workflowAction, executed: true }
            })
          });
        } catch (e) {
          console.error('workflowControl failed:', e);
        }
      },
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

          // Check if agent applied a media type filter
          const appliedFilter = resp?.appliedFilter;

          if (Array.isArray(all) && all.length > 0) {
            setResults(all, all.length);
            setRightTab('results');

            // Update the UI filter state if agent applied a filter
            if (appliedFilter) {
              debug('vs:agent:filter', 'applied filter:', appliedFilter);
              // Update the types state to reflect the filter
              if (appliedFilter === 'media') {
                setTypes(['media']);
              } else if (['image', 'video', 'audio', 'text'].includes(appliedFilter)) {
                setTypes([appliedFilter as ContentType]);
              }
              // Show feedback to user about the applied filter
              console.log(`🔍 Agent automatically filtered results to show only: ${appliedFilter}`);
            }

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
      // Apply a LoRA from the agent
      useCanvasLora: (payload: { loraName?: string; strength?: number; trigger?: string }) => {
        try {
          const name = payload?.loraName || payload?.trigger || '';
          if (!name) return;
          // Try to find LoRA by trigger or canvas name
          const match = (allLoras || []).find((l) =>
            (l.triggerWord && name && name.toLowerCase().includes(String(l.triggerWord).toLowerCase())) ||
            (l.canvasName && name && name.toLowerCase().includes(String(l.canvasName).toLowerCase()))
          );
          if (match) {
            // Switch to Generate tab and prepare generation with this LoRA
            setRightTab('generate');
            const refUrlList = (window as any).__agentApi?.getPinnedRefs?.() || [];
            // Pass lora info into values so handleGenerate can attach correctly
            (window as any).__genPanel?.prepare?.({
              type: 'image',
              model: 'fal-ai/flux-lora',
              options: { loras: [{ path: match.artifactUrl || match.path, scale: payload?.strength || 1.0, triggerWord: match.triggerWord }] },
              refs: refUrlList,
              autoRun: false,
            });
          } else {
            console.log('LoRA not found for', name);
          }
        } catch (e) {
          console.warn('useCanvasLora bridge failed:', e);
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
      // EXECUTOR: Generate content and persist results
      prepareGenerate: async (payload: any) => {
        debug('vs:agent:gen', 'prepareGenerate');
        try {
          if (agentRunLockRef.current || genLoading) {
            debug('vs:agent:gen', 'queueing generate request');
            genQueueRef.current.push(payload);
            return;
          }
          agentRunLockRef.current = true;
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
          genUrlRef.current = out; // Update ref for handlers
          setGenRaw(json?.result ?? json);
          setGenLoading(false);

          debug('vs:agent:gen', 'final url', !!out, mode);

          // Check for errors in the response
          // Log note if present
          // note can be displayed in UI if desired

          try {
            await fetch('/api/agent/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ generation: { running: false, finishedAt: new Date().toISOString(), url: out, mode, params: { mode, model, prompt, refs }, success: !!out } }) });
            await fetch('/api/agent/ack', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ correlationId: payload?.correlationId || 'workshop', step: mode === 'video' ? 'generatecontent' : 'preparegenerate', artifacts: { url: out, mode } }) });

            // Set a flag so other handlers know image generation is complete
            if (mode === 'image') {
              (window as any).__imageGenerationComplete = true;
              console.log(`🎯 Image generation complete, genUrl should be: ${out}`);
            }
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
        } finally {
          agentRunLockRef.current = false;
          // Drain queued generation requests sequentially
          if (genQueueRef.current.length > 0) {
            const nextPayload = genQueueRef.current.shift();
            debug('vs:agent:gen', 'dequeue next generate request');
            setTimeout(() => {
              try { (window as any).__agentApi?.prepareGenerate?.(nextPayload); } catch {}
            }, 0);
          }
        }
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
          console.log(`🎬 requestPinnedThenGenerate called with payload:`, payload);
          // Collect refs from pinned items; if none, fall back to current output URL
          const pinnedUrls: string[] = (pinnedRef.current || [])
            .map((p) => getResultMediaUrl(p.result))
            .filter(Boolean) as string[];

                    // Always prefer current genUrl for video follow-up (most recent generation)
          const fallbackFromCurrent = (genUrlRef.current || genUrl) ? [genUrlRef.current || genUrl] : [];
          const refs: string[] = fallbackFromCurrent.length > 0 ? fallbackFromCurrent : pinnedUrls;

          console.log(`🎬 Video refs:`, { pinnedUrls: pinnedUrls.length, fallbackFromCurrent: fallbackFromCurrent.length, finalRefs: refs.length, genUrl, genUrlRef: genUrlRef.current });

                    // If we still don't have refs, wait for image generation to complete
          if (refs.length === 0) {
            console.log(`🎬 No refs available, waiting for image generation...`);

            // Poll for genUrl to become available (image generation in progress)
            let retryCount = 0;
            const pollForGenUrl = () => {
              retryCount++;
              const currentUrl = genUrlRef.current || genUrl;
              console.log(`🎬 Retry ${retryCount}: genUrl = ${currentUrl}`);

              if (currentUrl) {
                console.log(`🎬 Found genUrl, retrying video generation with ref: ${currentUrl}`);
                const retryPayload = { ...payload };
                (window as any).__agentApi?.requestPinnedThenGenerate?.(retryPayload);
              } else if (retryCount < 10) {
                setTimeout(pollForGenUrl, 500);
              } else {
                console.error(`🎬 Gave up waiting for genUrl after ${retryCount} retries`);
              }
            };

            setTimeout(pollForGenUrl, 500);
            return;
          }

          const body = {
            mode: payload?.type || 'video',
            model: payload?.model || 'fal-ai/wan-i2v',
            prompt: payload?.prompt,
            refs,
            options: payload?.options || {},
          };

          if (agentRunLockRef.current || genLoading) {
            debug('vs:agent:gen', 'queueing requestPinnedThenGenerate');
            genQueueRef.current.push({ __action: 'requestPinnedThenGenerate', payload });
            return;
          }
          agentRunLockRef.current = true; setGenLoading(true);
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
          try {
            await fetch('/api/agent/ack', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ correlationId: payload?.correlationId || 'workshop', step: 'requestpinnedthengenerate', artifacts: { url: candidates[0] || null, mode: payload?.type, refs } }) });
          } catch {}
        } catch (e) {
          setGenLoading(false);
          console.error(e);
        } finally {
          agentRunLockRef.current = false;
          // Drain queued generation requests sequentially
          if (genQueueRef.current.length > 0) {
            const next = genQueueRef.current.shift();
            setTimeout(() => {
              try {
                if (next?.__action === 'requestPinnedThenGenerate') {
                  (window as any).__agentApi?.requestPinnedThenGenerate?.(next.payload);
                } else {
                  (window as any).__agentApi?.prepareGenerate?.(next);
                }
              } catch {}
            }, 0);
          }
        }
      },
      // Name/save/pin handlers required for gated workflow
            nameImage: async (payload: any) => {
        try {
          console.log(`🏷️ nameImage called with payload:`, payload, `genUrl:`, genUrl, `genUrlRef:`, genUrlRef.current);

          // Wait for image generation to complete if it hasn't yet
          const currentUrl = genUrlRef.current || genUrl;
          if (!currentUrl && !(window as any).__imageGenerationComplete) {
            console.log(`🏷️ Waiting for image generation to complete...`);
            let retries = 0;
            while (retries < 20 && !genUrlRef.current && !(window as any).__imageGenerationComplete) {
              await new Promise(r => setTimeout(r, 250));
              retries++;
            }
            console.log(`🏷️ After waiting: genUrl = ${genUrl}, genUrlRef = ${genUrlRef.current}, imageComplete = ${(window as any).__imageGenerationComplete}`);
          }

          const name = payload?.name || 'Untitled';
          lastNameRef.current = name;
          
          // Update the UI title input field immediately
          const titleInput = document.getElementById('gen-title-input') as HTMLInputElement;
          if (titleInput) {
            titleInput.value = name;
            console.log(`🏷️ Updated UI title field to: ${name}`);
          }
          
          const finalUrl = genUrlRef.current || genUrl;
          if (finalUrl) {
            console.log(`🏷️ Naming current image: ${name}`);
            
            // EXECUTE: Store the name for the subsequent saveImage step
            // (nameImage doesn't persist by itself - it prepares for saveImage)
            console.log(`🏷️ Name stored for saveImage step: ${name}`);
            
            // ACK: Notify backend that naming is complete
            await fetch('/api/agent/ack', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                correlationId: payload?.correlationId || 'workshop',
                step: 'nameimage',
                artifacts: { name, url: finalUrl }
              })
            });
          } else {
            // Retry if URL not ready
            setTimeout(async () => {
              if (!genUrl) return;
              try {
                await fetch('/api/agent/ack', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ correlationId: payload?.correlationId || 'workshop', step: 'nameimage', artifacts: { name, url: genUrl } })
                });
              } catch {}
            }, 700);
          }
        } catch (e) {
          console.error('nameImage failed:', e);
        }
      },
      saveImage: async (payload: any) => {
        try {
                    console.log(`💾 saveImage called with payload:`, payload, `genUrl:`, genUrl, `genUrlRef:`, genUrlRef.current);

          // Wait for image generation to complete if it hasn't yet
          const currentUrl = genUrlRef.current || genUrl;
          if (!currentUrl && !(window as any).__imageGenerationComplete) {
            console.log(`💾 Waiting for image generation to complete...`);
            let retries = 0;
            while (retries < 20 && !genUrlRef.current && !(window as any).__imageGenerationComplete) {
              await new Promise(r => setTimeout(r, 250));
              retries++;
            }
            console.log(`💾 After waiting: genUrl = ${genUrl}, genUrlRef = ${genUrlRef.current}, imageComplete = ${(window as any).__imageGenerationComplete}`);
          }

          const finalUrl = genUrlRef.current || genUrl;
          if (finalUrl) {
            // Create a mock asset ID and ADD TO PINNED ITEMS so requestPinnedThenGenerate can find it
            const assetId = `asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const title = payload?.name || lastNameRef.current || 'Generated Image';
            console.log(`💾 EXECUTE: Saving image to database as: ${title}`);

            // EXECUTE: Use the same save logic as the UI "Save to library" button
            try {
              // Detect media type from URL
              const mediaType = finalUrl.includes('.mp4') || finalUrl.includes('video') || finalUrl.includes('kangaroo') ? 'video' : 'image';
              const filename = `${title.replace(/[^a-zA-Z0-9]/g, '_')}-${Date.now()}`;
              console.log(`💾 EXECUTE: Detected mediaType: ${mediaType} from URL: ${finalUrl}`);
              
              const saveResponse = await fetch('/api/import/url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  url: finalUrl, 
                  mediaType: mediaType, 
                  originalFilename: filename,
                  title: title // Pass the name so it gets saved with correct title
                }),
              });

              if (!saveResponse.ok) {
                throw new Error(`Failed to save asset: ${saveResponse.status}`);
              }

              const savedAsset = await saveResponse.json();
              console.log(`💾 EXECUTE: Asset saved via import/url:`, savedAsset);
            } catch (saveError) {
              console.error('💾 EXECUTE: Failed to save via import/url:', saveError);
              // Continue with UI update even if save fails
            }

            // Add to pinned items so video generation can use it as ref
            const mockResult = {
              id: assetId,
              title: title,
              url: finalUrl,
              type: 'image',
              metadata: { collection: payload?.collection || 'default' }
            };
            lastNameRef.current = null;

            // Update pinned state SYNCHRONOUSLY
            if (pinnedRef.current) {
              pinnedRef.current.push({ result: mockResult });
            } else {
              pinnedRef.current = [{ result: mockResult }];
            }

            console.log(`💾 saveImage: Added to pinned items, total pinned: ${pinnedRef.current.length}`);

            await fetch('/api/agent/ack', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                correlationId: payload?.correlationId || 'workshop',
                step: 'saveimage',
                artifacts: { assetId, url: finalUrl, collection: payload?.collection || 'default', pinned: true }
              })
            });
          } else {
            // Retry after a short delay if URL has not populated yet
            setTimeout(async () => {
              if (!genUrl) return;
              try {
                const assetId = `asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                const mockResult = {
                  id: assetId,
                  title: payload?.name || lastNameRef.current || 'Generated Image',
                  url: genUrl,
                  type: 'image',
                  metadata: { collection: payload?.collection || 'default' }
                };
                lastNameRef.current = null;

                if (pinnedRef.current) {
                  pinnedRef.current.push({ result: mockResult });
                } else {
                  pinnedRef.current = [{ result: mockResult }];
                }

                await fetch('/api/agent/ack', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ correlationId: payload?.correlationId || 'workshop', step: 'saveimage', artifacts: { assetId, url: genUrl, collection: payload?.collection || 'default', pinned: true } })
                });
              } catch {}
            }, 900);
          }
        } catch (e) {
          console.error('saveImage failed:', e);
        }
      },
      pinToCanvas: async (payload: any) => {
        try {
          console.log(`[${payload?.correlationId}] UI: pinToCanvas handler called with payload:`, JSON.stringify(payload));

          // Pin generated content if available
          if (genUrl) {
            console.log(`[${payload?.correlationId}] UI: Pinning generated content: ${genUrl}`);
            // Mock pinning - in real implementation, this would update canvas
            console.log(`Pinning generated content to canvas: ${payload?.canvasId || 'default'}`);
          } else if (payload?.items && Array.isArray(payload.items)) {
            // Pin search results
            console.log(`[${payload?.correlationId}] UI: Pinning ${payload.items.length} search results to canvas`);
            const globalResultsCache = getGlobalCache();
            for (const item of payload.items) {
              const key = item.id || item.contentId || item.title;
              console.log(`[${payload?.correlationId}] UI: Pinning item:`, key);

              // Prefer full result objects; otherwise try cache lookup; otherwise construct minimal
              const candidate = item.id && item.content_type ? item
                : (key ? (globalResultsCache.get(key) || null) : null);

              const resultToPin: UnifiedSearchResult = candidate || {
                id: key || `agent-${Date.now()}`,
                content_type: 'image',
                title: item.title || 'Pinned by Agent',
                description: item.description || '',
                score: 0,
                metadata: {
                  cloudflare_url: item.url || item.cloudflare_url || item.s3_url || '',
                  media_type: item.content_type || 'image'
                } as any,
                preview: item.preview || item.title || ''
              } as any;

              try { pinResult(resultToPin); } catch {}
            }
            try { setRightTab('canvas'); } catch {}
          } else {
            console.log(`[${payload?.correlationId}] UI: No content to pin - no genUrl and no items array`);
          }

          // Always send ack
          console.log(`[${payload?.correlationId}] UI: Sending pinToCanvas ack`);
          await fetch('/api/agent/ack', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              correlationId: payload?.correlationId || 'workshop',
              step: 'pintocanvas',
              artifacts: {
                pinned: true,
                url: genUrl,
                canvasId: payload?.canvasId,
                itemCount: payload?.items?.length || 0
              }
            })
          });
          console.log(`[${payload?.correlationId}] UI: ✅ pinToCanvas ack sent`);
        } catch (e) {
          console.error(`[${payload?.correlationId}] UI: ❌ pinToCanvas failed:`, e);
        }
      },
    };
  }, []);

  // Agent stream processing - handle tool actions from agent
  useAgentStream(
    agentMessages,
    (delta: string) => {
      // Handle text deltas if needed
      debug('agent:text', delta);
    },
    (toolAction: any) => {
      debug('agent:tool', toolAction);

      // Process agent tool actions
      if (toolAction?.action && (window as any).__agentApi) {
        const handler = (window as any).__agentApi[toolAction.action];
        if (handler && typeof handler === 'function') {
          console.log(`[agent] Calling UI handler: ${toolAction.action}`, toolAction.payload);
          handler(toolAction.payload);
        } else {
          console.warn(`[agent] No handler found for action: ${toolAction.action}`);
        }
      }
    },
    () => {
      debug('agent:done', 'Stream completed');
    }
  );

  // Results are now managed by useResults hook and resultsStore

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      try {
        setLoading(true);
        setError(null);

        // Check if this looks like a natural language agent request
        const agentTriggers = ['find', 'pin', 'show', 'get', 'search for', 'give me', 'display', 'create', 'generate', 'make', 'build', 'draw', 'paint', 'render', 'produce', 'name', 'save', 'call it'];
        const isAgentQuery = agentTriggers.some(trigger =>
          query.toLowerCase().includes(trigger.toLowerCase())
        );

        // Also trigger agent for queries that look like requests for multiple items
        const multiItemPatterns = [/\d+.*\w+/, /\w+.*pictures?/, /\w+.*images?/, /\w+.*videos?/, /\w+.*files?/];
        const isMultiItemQuery = multiItemPatterns.some(pattern => pattern.test(query.toLowerCase()));

        const shouldUseAgent = isAgentQuery || isMultiItemQuery;

        if (shouldUseAgent) {
          // Trigger agent stream processing
          console.log(`[workshop] Triggering agent for query: ${query}`);
          console.log(`[workshop] Agent triggers detected:`, agentTriggers.filter(t => query.toLowerCase().includes(t.toLowerCase())));
          setAgentMessages([{ role: 'user', content: query }]);
        } else {
          // Regular search
          // Convert types array to search type parameter
          let searchType: string | undefined;
          if (types.includes("all")) {
            searchType = undefined; // No filter
          } else if (types.length === 1) {
            searchType = types[0]; // Single type
          } else if (types.includes("media")) {
            // "media" means all media types (image, video, audio) but not text
            searchType = "media";
          } else {
            // Multiple specific types - join them
            searchType = types.filter(t => t !== "all" && t !== "media").join(",");
          }

          await executeSearch(query, undefined, searchType, true);
        }
      } catch (err: any) {
        setError(err.message || 'Search failed');
      } finally {
        setLoading(false);
      }
    },
    [executeSearch, query, types]
  );

  const toggleType = (t: ContentType | "media" | "all") => {
    setTypes((prev) => {
      const newTypes: Array<ContentType | "media" | "all"> = (() => {
        if (t === "all") return ["all"];
        const withoutAll = prev.filter((x) => x !== "all");
        if (withoutAll.includes(t)) return withoutAll.filter((x) => x !== t);
        return [...withoutAll, t];
      })();

      // Auto-search if there's already a query and types changed
      if (query.trim() && JSON.stringify(newTypes) !== JSON.stringify(prev)) {
        setTimeout(() => {
          // Convert new types to search type parameter
          let searchType: string | undefined;
          if (newTypes.includes("all")) {
            searchType = undefined;
          } else if (newTypes.length === 1) {
            searchType = newTypes[0];
          } else if (newTypes.includes("media")) {
            searchType = "media";
          } else {
            searchType = newTypes.filter(t => t !== "all" && t !== "media").join(",");
          }
          executeSearch(query, undefined, searchType);
        }, 100);
      }

      return newTypes;
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

  const exportAsLayout = async () => {
    try {
      console.log('[exportAsLayout] Pinned items:', pinned.length, pinned);
      if (pinned.length === 0) {
        alert('Canvas is empty. Add some items to export as layout.');
        return;
      }

      // Calculate design size based on canvas items
      const maxX = Math.max(...pinned.map(p => p.x + p.width));
      const maxY = Math.max(...pinned.map(p => p.y + p.height));
      const designSize = { width: Math.max(1200, maxX + 100), height: Math.max(800, maxY + 100) };
      const cellSize = 20; // RGL cell size

      // Generate layout asset
      const layoutId = `layout_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date().toISOString();

      const layoutAsset = {
        id: layoutId,
        filename: `${canvasName || 'canvas'}_layout.json`,
        title: `${canvasName || 'Untitled Canvas'} Layout`,
        description: `Layout exported from canvas: ${canvasName || 'Untitled Canvas'}`,
        media_type: 'layout' as const,
        layout_type: 'canvas_export' as const,
        s3_url: `layouts/${layoutId}.json`, // Will be set by API
        cloudflare_url: '',
        metadata: {
          file_size: 0, // Will be calculated
          width: designSize.width,
          height: designSize.height,
          cell_size: cellSize,
          item_count: pinned.length,
          has_inline_content: false,
          has_transforms: false
        },
        layout_data: {
          designSize,
          cellSize,
          styling: {
            theme: 'dark' as const,
            colors: {
              background: '#0a0a0a',
              text: '#ffffff',
              primary: '#3b82f6',
              secondary: '#6b7280'
            },
            typography: {
              fontFamily: 'Inter, sans-serif'
            }
          },
          items: pinned.map(p => {
            // Convert pixel coordinates to grid and normalized coordinates
            const gridX = Math.round(p.x / cellSize);
            const gridY = Math.round(p.y / cellSize);
            const gridW = Math.round(p.width / cellSize);
            const gridH = Math.round(p.height / cellSize);

            // Normalized coordinates (0-1 based)
            const nx = p.x / designSize.width;
            const ny = p.y / designSize.height;
            const nw = p.width / designSize.width;
            const nh = p.height / designSize.height;

            return {
              id: p.id,
              type: 'content_ref' as const,
              x: gridX, y: gridY, w: gridW, h: gridH,
              nx, ny, nw, nh,
              z: p.z,
              refId: p.result.id,
              contentType: p.result.content_type,
              mediaUrl: p.result.url || p.result.s3_url || p.result.cloudflare_url,
              snippet: p.result.description || p.result.title
            };
          })
        },
        ai_labels: {
          scenes: [],
          objects: [],
          style: ['layout', 'canvas_export'],
          mood: [],
          themes: [`canvas:${canvasName || 'untitled'}`],
          confidence_scores: {}
        },
        manual_labels: {
          scenes: [],
          objects: [],
          style: [],
          mood: [],
          themes: [],
          custom_tags: [`canvas-export-${canvasId || 'new'}`]
        },
        processing_status: {
          upload: 'completed' as const,
          metadata_extraction: 'completed' as const,
          ai_labeling: 'not_started' as const,
          manual_review: 'pending' as const,
          html_generation: 'pending' as const
        },
        timestamps: {
          uploaded: now,
          metadata_extracted: now,
          labeled_ai: null,
          labeled_reviewed: null,
          html_generated: null
        },
        labeling_complete: false,
        project_id: canvasProjectId || null,
        created_at: now,
        updated_at: now
      };

      // Save layout asset via API
      console.log('Exporting canvas as layout asset...', layoutAsset);

      const response = await fetch('/api/media-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(layoutAsset)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to export layout');
      }

      const result = await response.json();
      console.log('Layout export successful:', result);

      // Show success message
      alert(`Successfully exported canvas as layout: "${layoutAsset.title}"\n\nLayout ID: ${layoutId}\nItems: ${pinned.length}`);

      // Trigger layouts browser to refresh
      try { window.dispatchEvent(new Event('layouts:refresh')); } catch {}

    } catch (e) {
      console.error('Layout export failed:', e);
      alert(`Failed to export layout: ${(e as Error).message}`);
    }
  };

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
            totalResults={results.length}
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
            resizePinned={resizePin}
            setPinned={setPinnedInStore}
            setShowCanvasModal={setShowCanvasModal}
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
            showCanvasManager={showCanvasManager}
            setShowCanvasManager={setShowCanvasManager}
            clearCanvas={clearCanvas}
            // canvasLayout removed
            // setCanvasLayout removed
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
            exportAsLayout={exportAsLayout}
            loadCanvas={loadCanvas}
            deleteCanvas={deleteCanvas}
            refreshCanvases={refreshCanvases}
            renameCanvas={renameCanvas}
          />
        </div>
      </div>
              </div>

      <DetailsOverlay
        r={selected}
        onClose={() => setSelected(null)}
        onSearch={(query) => {
          setQuery(query);
          setSelected(null); // Close overlay
          // Trigger search by updating the form
          const form = document.querySelector('form') as HTMLFormElement;
          if (form) {
            form.requestSubmit();
          }
        }}
      />

      {showCanvasModal && (
        <CanvasBoard
          items={pinned}
          onMove={movePin}
          onRemove={removePin}
          onOpen={(r: UnifiedSearchResult) => {
            try {
              if (r && typeof r === 'object' && (r as any).id) {
                setSelected(r);
              }
            } catch (e) {
              console.error('Modal expand error:', e);
            }
          }}
          onResize={resizePin}
          onToggleView={(id, expanded) => {
            setPinnedInStore((prev: PinnedItem[]) =>
              prev.map((p: PinnedItem) =>
                p.id === id ? { ...p, expanded } : p
              )
            );
          }}
          isModal={true}
          onClose={() => setShowCanvasModal(false)}
        />
      )}
    </div>
  );
}


