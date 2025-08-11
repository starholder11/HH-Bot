"use client";
import React, { useEffect, useMemo, useState } from 'react';
import type { PinnedItem, UnifiedSearchResult } from '../../types';
import * as generateService from '../../services/generateService';
import { getResultMediaUrl } from '../../utils/mediaUrl';
import LoraSelector from './LoraSelector';

type FalModel = { id: string; name: string; provider: 'fal'; category: 'image'|'audio'|'video'|'text'; description: string; inputSchema: any; defaults?: Record<string, any> };

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
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Unknown error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true };
  }, []);
  return { models, loading, error } as const;
}

export default function GeneratePanel({
  pinned,
  availableLoras = [],
  onPinResult,
  onGenStart,
  onGenResult,
}: {
  pinned: PinnedItem[];
  availableLoras?: Array<{ id: string; path: string; label: string; scale?: number }>;
  onPinResult: (r: UnifiedSearchResult) => void;
  onGenStart: () => void;
  onGenResult: (mode: 'image' | 'video' | 'audio' | 'text', url: string | undefined, raw: any) => void;
}) {
  const { models } = useFalModels();
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<FalModel | null>(null);
  const [values, setValues] = useState<Record<string, any>>({});
  const [useRefs, setUseRefs] = useState(true);
  const [uploadedRefs, setUploadedRefs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedLoras, setSelectedLoras] = useState<Array<{ id: string; path: string; scale: number; selected: boolean; label: string }>>([]);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState('');
  const [projects, setProjects] = useState<Array<{ project_id: string; name: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/projects');
        if (res.ok) {
          const json = await res.json();
          if (!cancelled) setProjects((json.projects || []).map((p: any) => ({ project_id: p.project_id, name: p.name })));
        }
      } catch {}
    })();
    return () => { cancelled = true };
  }, []);

  // Map availableLoras into local list
  useEffect(() => {
    const next = (availableLoras || []).map((l) => ({ id: l.id, path: l.path, label: l.label, scale: typeof l.scale === 'number' ? l.scale : 1, selected: false }));
    setSelectedLoras(next);
  }, [availableLoras]);
  const filtered = useMemo(() => {
    const q = filter.toLowerCase();
    return models.filter((m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q));
  }, [models, filter]);

  async function handleGenerate() {
    if (!selected) return;
    const prompt = values.prompt || values.text || '';
    if (!prompt || busy) return;
    onGenStart();
    setBusy(true);
    setPreviewUrl(null);
    try {
      const refs = [
        ...(useRefs ? pinned.map((p) => getResultMediaUrl(p.result)).filter(Boolean) as string[] : []),
        ...uploadedRefs,
      ];
      const mode = selected.category as 'image'|'audio'|'video'|'text';
      const body = { mode, model: selected.id, prompt, refs, options: Object.fromEntries(Object.entries(values).filter(([k]) => k !== 'prompt')) } as any;
      if (mode === 'image' && selectedLoras.some((l) => l.selected)) {
        body.model = 'fal-ai/flux-lora';
        body.options = body.options || {};
        body.options.loras = selectedLoras.filter((l) => l.selected).map((l) => ({ path: l.path, scale: l.scale }));
      }
      const json = await generateService.runGenerate(body);
      const url = (json as any)?.url || (json as any)?.result?.images?.[0]?.url || (json as any)?.result?.video?.url || (json as any)?.result?.audio?.url;
      if (url) setPreviewUrl(url);
      onGenResult(mode, url, (json as any)?.result ?? json);
    } catch (e) {
      // noop for now
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveToLibrary() {
    if (!previewUrl) return;
    try {
      setSaveStatus('saving');
      const resp = await fetch('/api/import/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: previewUrl, mediaType: (selected?.category || 'image'), originalFilename: title || 'generated', projectId: projectId || undefined }),
      });
      const json = await resp.json().catch(() => ({}));
      if (resp.ok) {
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 1500);
      } else {
        // eslint-disable-next-line no-console
        console.error('Save failed:', (json as any)?.error || 'Save failed');
        setSaveStatus('error');
        setTimeout(() => setSaveStatus('idle'), 1500);
      }
    } catch (e) {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 1500);
    }
  }

  return (
    <div className="space-y-3">
      <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter models" className="w-full px-2 py-1.5 rounded-md border border-neutral-800 bg-neutral-900 text-neutral-100" />
      <select value={selected?.id || ''} onChange={(e) => setSelected(models.find((m) => m.id === e.target.value) || null)} className="w-full px-2 py-1.5 rounded-md border border-neutral-800 bg-neutral-900 text-neutral-100">
        <option value="">Select a model…</option>
        {filtered.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
      <textarea value={values.prompt || ''} onChange={(e) => setValues((p) => ({ ...p, prompt: e.target.value }))} rows={4} className="w-full px-2 py-1.5 rounded-md border border-neutral-800 bg-neutral-900 text-neutral-100" placeholder="Prompt" />
      {/* Refs uploader */}
      <div className="rounded-md border border-neutral-800 p-2">
        <div className="text-xs text-neutral-400 mb-2">Reference images</div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-neutral-400 inline-flex items-center gap-2">
            <input type="checkbox" checked={useRefs} onChange={(e) => setUseRefs(e.target.checked)} />
            Use pinned as refs
          </label>
          <label className="px-2 py-1 text-sm rounded-md border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-100 cursor-pointer">
            Attach image
            <input type="file" accept="image/*" hidden onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const fd = new FormData();
              fd.append('file', file);
              fd.append('type', 'image');
              fd.append('directory', 'public/uploads');
              try {
                const res = await fetch('/api/upload', { method: 'POST', body: fd });
                const json = await res.json();
                if (res.ok && json?.url) setUploadedRefs((prev) => [...prev, json.url]);
              } catch {}
            }} />
          </label>
        </div>
        {uploadedRefs.length > 0 && (
          <div className="mt-2 grid grid-cols-3 gap-2">
            {uploadedRefs.map((u, idx) => (
              <div key={idx} className="relative">
                <img src={u} className="w-full h-20 object-cover rounded border border-neutral-800" alt="ref" />
                <button className="absolute top-1 right-1 text-xs px-1.5 py-0.5 rounded bg-neutral-900/80 border border-neutral-700" onClick={() => setUploadedRefs((p) => p.filter((x) => x !== u))}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
      <LoraSelector loras={selectedLoras} onChange={setSelectedLoras} />
      <div className="flex items-center gap-2">
        <label className="text-xs text-neutral-400 inline-flex items-center gap-2">
          <input type="checkbox" checked={useRefs} onChange={(e) => setUseRefs(e.target.checked)} />
          Use pinned as refs
        </label>
        <button onClick={handleGenerate} disabled={!selected || busy} className="px-3 py-1.5 text-sm rounded-md border border-neutral-800 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">Generate</button>
      </div>
      {previewUrl && (
        <div className="rounded-md border border-neutral-800 p-2 space-y-2">
          <div className="text-xs text-neutral-400">Preview</div>
          <img src={previewUrl} className="max-h-[320px] object-contain w-full"/>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
            <div className="md:col-span-2">
              <label className="text-xs text-neutral-400">Title / Filename</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full px-2 py-1.5 rounded-md border border-neutral-800 bg-neutral-900 text-neutral-100" placeholder="Untitled" />
            </div>
            <div>
              <label className="text-xs text-neutral-400">Project</label>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="mt-1 w-full px-2 py-1.5 rounded-md border border-neutral-800 bg-neutral-900 text-neutral-100">
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.project_id} value={p.project_id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSaveToLibrary} disabled={saveStatus === 'saving'} className={`px-3 py-1.5 text-sm rounded-md border transition-all duration-300 disabled:opacity-50 ${
              saveStatus === 'saved'
                ? 'border-green-600 bg-green-600 text-white transform scale-105'
                : saveStatus === 'error'
                ? 'border-red-600 bg-red-600 text-white'
                : saveStatus === 'saving'
                ? 'border-blue-600 bg-blue-600 text-white animate-pulse'
                : 'border-neutral-800 bg-neutral-950 hover:bg-neutral-800 text-neutral-100'
            }`}>
              {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : saveStatus === 'error' ? 'Failed' : 'Save to library'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}



