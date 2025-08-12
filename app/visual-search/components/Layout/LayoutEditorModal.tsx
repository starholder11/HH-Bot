'use client';

import dynamic from 'next/dynamic';
import React, { useEffect, useMemo, useState } from 'react';
import type { LayoutAsset } from '@/app/visual-search/types';

const ReactGridLayout = dynamic(() => import('react-grid-layout'), { ssr: false }) as any;

type Item = LayoutAsset['layout_data']['items'][number];

export default function LayoutEditorModal({
  layout,
  onClose,
  onSaved,
}: {
  layout: LayoutAsset;
  onClose: () => void;
  onSaved?: (updated: LayoutAsset) => void;
}) {
  const [working, setWorking] = useState(false);
  const [edited, setEdited] = useState<LayoutAsset>(layout);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isEditingText, setIsEditingText] = useState(false);
  const [draftText, setDraftText] = useState('');

  const cellSize = edited.layout_data.cellSize || 20;
  const design = edited.layout_data.designSize || { width: 1200, height: 800 };
  const cols = Math.max(12, Math.round(design.width / cellSize));
  const rowHeight = cellSize;

  const rglLayout = useMemo(
    () =>
      edited.layout_data.items.map((it) => ({
        i: it.id,
        x: it.x,
        y: it.y,
        w: Math.max(1, it.w),
        h: Math.max(1, it.h),
      })),
    [edited.layout_data.items]
  );

  // Load content preview URLs
  useEffect(() => {
    let cancelled = false;
    async function hydratePreviews() {
      const next: Record<string, string> = {};
      const loading: Record<string, boolean> = {};
      await Promise.all(
        edited.layout_data.items.map(async (it) => {
          if (it.mediaUrl) {
            next[it.id] = it.mediaUrl;
            return;
          }
          if (it.refId) {
            try {
              loading[it.id] = true;
              const res = await fetch(`/api/media-assets/${it.refId}`);
              if (!res.ok) return;
              const data = await res.json();
              const a = data.asset || {};
              const url = a.url || a.s3_url || a.cloudflare_url || '';
              if (url) next[it.id] = url;
            } catch {}
          }
        })
      );
      if (!cancelled) {
        setPreviewUrls(next);
        setLoadingMap(loading);
      }
    }
    hydratePreviews();
    return () => {
      cancelled = true;
    };
  }, [edited.layout_data.items]);

  function handleDragStop(_: any, item: any) {
    setEdited((prev) => updateItemGrid(prev, item.i, item.x, item.y, item.w, item.h));
  }
  function handleResizeStop(_: any, item: any) {
    setEdited((prev) => updateItemGrid(prev, item.i, item.x, item.y, item.w, item.h));
  }

  async function handleSave() {
    try {
      setWorking(true);
      // Ensure inline text edits are committed to state before save
      let toSave = edited;
      if (isEditingText && selectedId) {
        toSave = commitCurrentText(toSave, selectedId, draftText);
      }
      const res = await fetch(`/api/media-assets/${toSave.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toSave),
      });
      if (!res.ok) throw new Error('Failed to save layout');
      const data = await res.json();
      try { window.dispatchEvent(new Event('layouts:refresh')); } catch {}
      onSaved?.(data.asset as LayoutAsset);
      setIsEditingText(false);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setWorking(false);
    }
  }

  const { addTextBlock, duplicateSelected, deleteSelected } = useCommands(edited, setEdited, selectedId);

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 flex">
      <div className="relative m-0 w-full h-full bg-neutral-950 text-neutral-100">
        {/* Header */}
        <div className="absolute top-0 inset-x-0 h-14 border-b border-neutral-800 bg-neutral-900/80 backdrop-blur flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-2 py-1 rounded border border-neutral-700 hover:bg-neutral-800">Close</button>
            <div className="font-medium">{edited.title}</div>
            <div className="text-xs text-neutral-400">{edited.layout_type} • {edited.layout_data.items.length} items</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); void handleSave(); }}
              disabled={working}
              className="px-3 py-1.5 rounded border border-green-600 bg-green-700 hover:bg-green-600 text-white disabled:opacity-50"
            >
              {working ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        {/* Canvas area */}
        <div className="absolute top-14 bottom-0 inset-x-0 p-4 overflow-auto">
          <div
            className="mx-auto border border-neutral-800 bg-neutral-900 relative"
            style={{ width: design.width, height: design.height }}
          >
            <ReactGridLayout
              className="layout"
              layout={rglLayout}
              cols={cols}
              rowHeight={rowHeight}
              width={design.width}
              margin={[0, 0]}
              containerPadding={[0, 0]}
              isDraggable
              isResizable
              draggableCancel={'.content-editable'}
              preventCollision={true}
              compactType={null}
              onDragStop={handleDragStop}
              onResizeStop={handleResizeStop}
            >
              {edited.layout_data.items.map((it) => (
                <div
                  key={it.id}
                  className={`border bg-neutral-900 overflow-hidden ${selectedId === it.id ? 'border-blue-500' : 'border-blue-500/30'}`}
                  onMouseDown={() => { setSelectedId(it.id); setIsEditingText(false); }}
                  onDoubleClick={() => {
                    if (it.type === 'inline_text') {
                      setSelectedId(it.id);
                      setDraftText(it.inlineContent?.text || '');
                      setIsEditingText(true);
                    }
                  }}
                  style={{ zIndex: it.z || 1 }}
                >
                  {renderItem(it, previewUrls[it.id], loadingMap[it.id], {
                    isSelected: selectedId === it.id,
                    isEditing: isEditingText && selectedId === it.id,
                    draftText,
                    setDraftText,
                    onCommitText: (txt: string) => { updateInlineText(it.id, txt, setEdited); setIsEditingText(false); },
                    onCancelEdit: () => setIsEditingText(false),
                  })}
                </div>
              ))}
            </ReactGridLayout>
          </div>
        </div>

        {/* Right inspector */}
        <div className="absolute right-0 top-14 bottom-0 w-72 border-l border-neutral-800 bg-neutral-900/60 backdrop-blur p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-neutral-300 font-medium">Inspector</div>
            <div className="flex gap-1">
              <button onClick={(e)=>{e.preventDefault(); e.stopPropagation(); addTextBlock();}} className="px-2 py-1 text-xs rounded border border-neutral-700 hover:bg-neutral-800">+ Text</button>
              <button onClick={(e)=>{e.preventDefault(); e.stopPropagation(); duplicateSelected();}} disabled={!selectedId} className="px-2 py-1 text-xs rounded border border-neutral-700 hover:bg-neutral-800 disabled:opacity-50">Duplicate</button>
              <button onClick={(e)=>{e.preventDefault(); e.stopPropagation(); deleteSelected();}} disabled={!selectedId} className="px-2 py-1 text-xs rounded border border-red-700 hover:bg-red-800 text-red-200 disabled:opacity-50">Delete</button>
            </div>
          </div>
          {selectedId ? (
            <ItemInspector
              item={edited.layout_data.items.find(i => i.id === selectedId)!}
              cellSize={cellSize}
              onChange={(up) => setEdited(prev => ({ ...prev, layout_data: { ...prev.layout_data, items: prev.layout_data.items.map(i => i.id === selectedId ? { ...i, ...up } as Item : i) } }))}
              onZ={(dir) => setEdited(prev => ({ ...prev, layout_data: { ...prev.layout_data, items: bringZ(prev.layout_data.items, selectedId, dir) } }))}
            />
          ) : (
            <div className="text-xs text-neutral-500">Select an item to edit.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function updateItemGrid(layout: LayoutAsset, id: string, x: number, y: number, w: number, h: number): LayoutAsset {
  const cellSize = layout.layout_data.cellSize || 20;
  const design = layout.layout_data.designSize || { width: 1200, height: 800 };
  const pxW = w * cellSize;
  const pxH = h * cellSize;
  const pxX = x * cellSize;
  const pxY = y * cellSize;

  const items = layout.layout_data.items.map((it) =>
    it.id === id
      ? ({
          ...it,
          x, y, w, h,
          nx: clamp(pxX / design.width),
          ny: clamp(pxY / design.height),
          nw: clamp(pxW / design.width),
          nh: clamp(pxH / design.height),
        } as Item)
      : it
  );

  return {
    ...layout,
    layout_data: { ...layout.layout_data, items },
    updated_at: new Date().toISOString(),
  } as LayoutAsset;
}

function clamp(v: number) {
  if (Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function renderItem(
  it: Item,
  url?: string,
  loading?: boolean,
  opts?: { isSelected?: boolean; isEditing?: boolean; draftText?: string; setDraftText?: (t: string) => void; onCommitText?: (t: string) => void; onCancelEdit?: () => void }
) {
  const label = `${it.type}${it.contentType ? ` • ${it.contentType}` : ''}`;
  if (it.type === 'inline_text' && it.inlineContent?.text) {
    return (
      <div className="h-full w-full p-2 text-neutral-200 overflow-auto">
        <div className="text-xs text-neutral-400 mb-1">{label}</div>
        {opts?.isEditing ? (
          <textarea
            className="content-editable whitespace-pre-wrap leading-snug text-sm bg-neutral-800/50 rounded p-2 outline-none w-full h-full"
            value={opts?.draftText ?? it.inlineContent?.text ?? ''}
            onChange={(e) => opts?.setDraftText?.(e.target.value)}
            onBlur={() => opts?.onCommitText?.(opts?.draftText ?? '')}
            autoFocus
          />
        ) : (
          <div className="whitespace-pre-wrap leading-snug text-sm">{it.inlineContent.text}</div>
        )}
      </div>
    );
  }
  if (it.type === 'inline_image' && (it.inlineContent?.imageUrl || it.inlineContent?.imageData || url)) {
    const src = it.inlineContent?.imageUrl || it.inlineContent?.imageData || url || '';
    return (
      <div className="h-full w-full flex items-center justify-center bg-black/50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="inline" className="max-w-full max-h-full object-contain" />
      </div>
    );
  }
  if (it.type === 'content_ref') {
    if (loading) {
      return (
        <div className="h-full w-full flex items-center justify-center text-neutral-400 text-xs">Loading…</div>
      );
    }
    if (it.contentType === 'image' && url) {
      return (
        <div className="h-full w-full flex items-center justify-center bg-black/50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="image" className="max-w-full max-h-full object-contain" />
        </div>
      );
    }
    if (it.contentType === 'video' && url) {
      return (
        <video src={url} controls className="h-full w-full object-contain bg-black" />
      );
    }
    if (it.contentType === 'audio' && url) {
      return (
        <div className="h-full w-full flex items-center justify-center p-2 bg-black/30">
          <audio src={url} controls className="w-full" />
        </div>
      );
    }
  }
  return (
    <div className="h-full w-full flex items-center justify-center text-xs text-neutral-300 bg-blue-500/10">
      {label}
    </div>
  );
}

function updateInlineText(id: string, text: string, setEdited: React.Dispatch<React.SetStateAction<LayoutAsset>>) {
  setEdited(prev => ({
    ...prev,
    layout_data: {
      ...prev.layout_data,
      items: prev.layout_data.items.map(i => i.id === id ? ({ ...i, inlineContent: { ...(i.inlineContent || {}), text } }) as Item : i)
    },
    updated_at: new Date().toISOString(),
  } as LayoutAsset));
}

function commitCurrentText(layout: LayoutAsset, id: string, text: string): LayoutAsset {
  return {
    ...layout,
    layout_data: {
      ...layout.layout_data,
      items: layout.layout_data.items.map(i => i.id === id ? ({ ...i, inlineContent: { ...(i.inlineContent || {}), text } }) as Item : i)
    },
    updated_at: new Date().toISOString(),
  } as LayoutAsset;
}

function bringZ(items: Item[], id: string, dir: 'front' | 'back' | 'up' | 'down'): Item[] {
  const current = items.find(i => i.id === id);
  if (!current) return items;
  const maxZ = Math.max(1, ...items.map(i => i.z || 1));
  const minZ = Math.min(1, ...items.map(i => i.z || 1));
  const delta = dir === 'up' ? 1 : dir === 'down' ? -1 : 0;
  return items.map(i => {
    if (i.id !== id) return i;
    if (dir === 'front') return { ...i, z: maxZ + 1 } as Item;
    if (dir === 'back') return { ...i, z: Math.max(1, minZ - 1) } as Item;
    return { ...i, z: Math.max(1, (i.z || 1) + delta) } as Item;
  });
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function ItemInspector({ item, cellSize, onChange, onZ }: { item: Item; cellSize: number; onChange: (up: Partial<Item>) => void; onZ: (dir: 'front' | 'back' | 'up' | 'down') => void }) {
  const fields: Array<{ k: keyof Item; label: string; type?: 'number' | 'text' }>
    = [
      { k: 'x', label: 'x', type: 'number' },
      { k: 'y', label: 'y', type: 'number' },
      { k: 'w', label: 'w', type: 'number' },
      { k: 'h', label: 'h', type: 'number' },
    ];
  return (
    <div className="space-y-2 text-sm">
      <div className="text-neutral-400 text-xs">{item.id}</div>
      <div className="grid grid-cols-2 gap-2">
        {fields.map(f => (
          <label key={String(f.k)} className="flex flex-col gap-1">
            <span className="text-xs text-neutral-400">{f.label}</span>
            <input
              type="number"
              className="px-2 py-1 rounded border border-neutral-700 bg-neutral-900 text-neutral-100"
              value={Number(item[f.k] as any)}
              onChange={(e) => onChange({ [f.k]: Number(e.target.value) } as Partial<Item>)}
            />
          </label>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-neutral-400">z</span>
        <button onClick={() => onZ('back')} className="px-2 py-1 text-xs rounded border border-neutral-700 hover:bg-neutral-800">Back</button>
        <button onClick={() => onZ('down')} className="px-2 py-1 text-xs rounded border border-neutral-700 hover:bg-neutral-800">Down</button>
        <button onClick={() => onZ('up')} className="px-2 py-1 text-xs rounded border border-neutral-700 hover:bg-neutral-800">Up</button>
        <button onClick={() => onZ('front')} className="px-2 py-1 text-xs rounded border border-neutral-700 hover:bg-neutral-800">Front</button>
      </div>
      {item.type === 'inline_text' && (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-neutral-400">Text</span>
          <textarea
            rows={4}
            className="px-2 py-1 rounded border border-neutral-700 bg-neutral-900 text-neutral-100"
            value={item.inlineContent?.text || ''}
            onChange={(e) => onChange({ inlineContent: { ...(item.inlineContent || {}), text: e.target.value } as any })}
          />
        </label>
      )}
    </div>
  );
}

// Commands wired to state using closures
function useCommands(
  edited: LayoutAsset,
  setEdited: React.Dispatch<React.SetStateAction<LayoutAsset>>,
  selectedId: string | null,
) {
  function addTextBlock() {
    const id = `inline_${Date.now().toString(36)}`;
    const cellSize = edited.layout_data.cellSize || 20;
    const newItem: Item = {
      id,
      type: 'inline_text',
      x: 0, y: 0, w: Math.max(6, Math.round(400 / cellSize)), h: Math.max(3, Math.round(120 / cellSize)),
      nx: 0, ny: 0, nw: 0.33, nh: 0.15,
      inlineContent: { text: 'Edit me' },
    } as any;
    setEdited(prev => ({ ...prev, layout_data: { ...prev.layout_data, items: [...prev.layout_data.items, newItem] }, updated_at: new Date().toISOString() } as LayoutAsset));
  }
  function duplicateSelected() {
    if (!selectedId) return;
    setEdited(prev => {
      const it = prev.layout_data.items.find(i => i.id === selectedId);
      if (!it) return prev;
      const copy = { ...it, id: `${it.id}_copy_${Math.random().toString(36).slice(2,6)}`, x: (it.x || 0) + 1, y: (it.y || 0) + 1 } as Item;
      return { ...prev, layout_data: { ...prev.layout_data, items: [...prev.layout_data.items, copy] }, updated_at: new Date().toISOString() } as LayoutAsset;
    });
  }
  function deleteSelected() {
    if (!selectedId) return;
    setEdited(prev => ({ ...prev, layout_data: { ...prev.layout_data, items: prev.layout_data.items.filter(i => i.id !== selectedId) }, updated_at: new Date().toISOString() } as LayoutAsset));
  }
  return { addTextBlock, duplicateSelected, deleteSelected };
}


