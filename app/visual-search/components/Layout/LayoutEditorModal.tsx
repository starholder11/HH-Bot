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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isEditingText, setIsEditingText] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const cellSize = edited.layout_data.cellSize || 20;
  const design = edited.layout_data.designSize || { width: 1200, height: 800 };
  const cols = Math.floor(design.width / cellSize); // Use exact floor to match bounds
  const rowHeight = cellSize;

  const rglLayout = useMemo(
    () =>
      edited.layout_data.items.map((it) => ({
        i: it.id,
        x: Math.max(0, it.x),
        y: Math.max(0, it.y),
        w: Math.max(1, it.w),
        h: Math.max(1, it.h),
        static: false,
      })),
    [edited.layout_data.items]
  );

  // Keyboard shortcuts: delete, duplicate, nudge for multi-select
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (selectedIds.size === 0) return;
      const isMeta = e.metaKey || e.ctrlKey;
      // Duplicate selection
      if (isMeta && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateSelected();
        return;
      }
      // Delete selection
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelected();
        return;
      }
      // Arrow nudging
      const step = 1;
      if (e.key === 'ArrowLeft') { e.preventDefault(); nudgeSelection(-step, 0); }
      if (e.key === 'ArrowRight') { e.preventDefault(); nudgeSelection(step, 0); }
      if (e.key === 'ArrowUp') { e.preventDefault(); nudgeSelection(0, -step); }
      if (e.key === 'ArrowDown') { e.preventDefault(); nudgeSelection(0, step); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedIds]);

  // Nudge all selected items by dx, dy grid units
  function nudgeSelection(dx: number, dy: number) {
    if (selectedIds.size === 0) return;
    setEdited(prev => {
      const cell = prev.layout_data.cellSize || 20;
      const designSize = prev.layout_data.designSize || { width: 1200, height: 800 };
      const gridCols = Math.floor(designSize.width / cell);
      const gridRows = Math.floor(designSize.height / cell);
      const items = prev.layout_data.items.map(it => {
        if (!selectedIds.has(it.id)) return it;
        const w = Math.max(1, it.w || 1);
        const h = Math.max(1, it.h || 1);
        const maxX = Math.max(0, gridCols - w);
        const maxY = Math.max(0, gridRows - h);
        const x = Math.max(0, Math.min((it.x || 0) + dx, maxX));
        const y = Math.max(0, Math.min((it.y || 0) + dy, maxY));
        const pxX = x * cell, pxY = y * cell, pxW = w * cell, pxH = h * cell;
        return {
          ...it,
          x, y,
          w, h,
          nx: clamp(pxX / designSize.width),
          ny: clamp(pxY / designSize.height),
          nw: clamp(pxW / designSize.width),
          nh: clamp(pxH / designSize.height),
        } as Item;
      });
      return { ...prev, layout_data: { ...prev.layout_data, items }, updated_at: new Date().toISOString() } as LayoutAsset;
    });
  }

  function duplicateSelected() {
    if (selectedIds.size === 0) return;
    setEdited(prev => {
      const copies: Item[] = [];
      const nowSuffix = Date.now().toString(36);
      for (const id of selectedIds) {
        const it = prev.layout_data.items.find(i => i.id === id);
        if (!it) continue;
        const copy = { ...it, id: `${it.id}_copy_${nowSuffix}_${Math.random().toString(36).slice(2,5)}`, x: (it.x || 0) + 1, y: (it.y || 0) + 1 } as Item;
        copies.push(copy);
      }
      const next = { ...prev, layout_data: { ...prev.layout_data, items: [...prev.layout_data.items, ...copies] }, updated_at: new Date().toISOString() } as LayoutAsset;
      // Select the new copies
      if (copies.length > 0) {
        setSelectedIds(new Set(copies.map(c => c.id)));
        setSelectedId(copies[copies.length - 1].id);
      }
      return next;
    });
  }

  function deleteSelected() {
    if (selectedIds.size === 0) return;
    setSelectedId(null);
    setIsEditingText(false);
    setDraftText('');
    setEdited(prev => {
      const filtered = prev.layout_data.items.filter(i => !selectedIds.has(i.id));
      const normalized = normalizeAllItems({ ...prev, layout_data: { ...prev.layout_data, items: filtered } } as LayoutAsset);
      return { ...normalized, updated_at: new Date().toISOString() } as LayoutAsset;
    });
    setSelectedIds(new Set());
  }

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

        // Keep layout controlled during interactions to avoid jump-back
  function handleLayoutChange(newLayout: any[]) {
    console.log('[LayoutEditor] handleLayoutChange called with:', newLayout.length, 'items');
    console.log('[LayoutEditor] New layout positions:', newLayout.map(l => ({ id: l.i, x: l.x, y: l.y, w: l.w, h: l.h })));

    // CRITICAL: Ignore layout changes during save to prevent overriding saved state
    if (isSaving) {
      console.log('[LayoutEditor] IGNORING handleLayoutChange - save in progress');
      return;
    }

    // Apply layout changes to all items at once to maintain consistency
    setEdited((prev) => {
      console.log('[LayoutEditor] handleLayoutChange - prev state items:', prev.layout_data.items.length);

      const updatedItems = prev.layout_data.items.map(item => {
        const layoutItem = newLayout.find(l => l.i === item.id);
        if (layoutItem) {
          const updated = updateItemPosition(item, layoutItem.x, layoutItem.y, layoutItem.w, layoutItem.h, prev.layout_data);
          console.log('[LayoutEditor] Updated item:', item.id, 'from', { x: item.x, y: item.y, w: item.w, h: item.h }, 'to', { x: updated.x, y: updated.y, w: updated.w, h: updated.h });
          return updated;
        }
        return item;
      });

      // Enforce bounds again on the full set to avoid drift on right edge
      const normalized = normalizeAllItems({ ...prev, layout_data: { ...prev.layout_data, items: updatedItems } } as LayoutAsset);

      console.log('[LayoutEditor] handleLayoutChange - final normalized items:', normalized.layout_data.items.length);

      return {
        ...normalized,
        updated_at: new Date().toISOString()
      } as LayoutAsset;
    });
  }

    async function handleSave() {
    try {
      setWorking(true);
      setIsSaving(true);
      console.log('[LayoutEditor] ===== SAVE START =====');
      console.log('[LayoutEditor] Initial edited state:', JSON.stringify(edited, null, 2));

      // Ensure inline text edits are committed to state before save
      let toSave = edited;
      if (isEditingText && selectedId) {
        console.log('[LayoutEditor] Committing current text edit for:', selectedId, 'text:', draftText);
        toSave = commitCurrentText(toSave, selectedId, draftText);
        console.log('[LayoutEditor] After text commit:', JSON.stringify(toSave.layout_data.items.find(i => i.id === selectedId), null, 2));
      }
      // Ensure normalized coords are consistent before persisting
      console.log('[LayoutEditor] Before normalization - items count:', toSave.layout_data.items.length);
      toSave = normalizeAllItems(toSave);
      console.log('[LayoutEditor] After normalization - items count:', toSave.layout_data.items.length);
      console.log('[LayoutEditor] Final payload to save:', JSON.stringify(toSave, null, 2));

      console.log('[LayoutEditor] Making PUT request to:', `/api/media-assets/${toSave.id}`);
      const res = await fetch(`/api/media-assets/${toSave.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toSave),
      });

      console.log('[LayoutEditor] PUT response status:', res.status, res.statusText);

      if (!res.ok) {
        const errorText = await res.text();
        console.error('[LayoutEditor] PUT failed - status:', res.status, 'response:', errorText);
        throw new Error(`Failed to save layout: ${res.status} ${errorText}`);
      }

      const putData = await res.json();
      console.log('[LayoutEditor] PUT successful - response:', JSON.stringify(putData, null, 2));

      // Re-fetch fresh copy from API to ensure persistence and kill any stale state
      const freshUrl = `/api/media-assets/${toSave.id}?ts=${Date.now()}`;
      console.log('[LayoutEditor] Re-fetching fresh copy from:', freshUrl);
      const fresh = await fetch(freshUrl, { cache: 'no-store' });
      console.log('[LayoutEditor] Fresh fetch status:', fresh.status, fresh.statusText);

      if (!fresh.ok) {
        console.warn('[LayoutEditor] Fresh fetch failed, using PUT response');
        var data = putData;
      } else {
        var data = await fresh.json();
        console.log('[LayoutEditor] Fresh fetch successful - response:', JSON.stringify(data, null, 2));
      }

      const savedAsset = (data.asset || toSave) as LayoutAsset;
      console.log('[LayoutEditor] Final saved asset to sync to editor:', JSON.stringify(savedAsset, null, 2));

      console.log('[LayoutEditor] Setting edited state to saved asset...');
      setEdited(savedAsset);
      console.log('[LayoutEditor] Editor state updated');

      // Clear any editing states
      console.log('[LayoutEditor] Clearing editing states...');
      setIsEditingText(false);
      setDraftText('');

      // Trigger refresh and notify parent with the saved asset
      console.log('[LayoutEditor] Dispatching layouts:refresh event...');
      try { window.dispatchEvent(new Event('layouts:refresh')); } catch {}

      console.log('[LayoutEditor] Calling onSaved callback with:', savedAsset.id);
      onSaved?.(savedAsset);

      console.log('[LayoutEditor] ===== SAVE COMPLETE =====');
    } catch (e) {
      console.error('[LayoutEditor] ===== SAVE ERROR =====', e);
      console.error('[LayoutEditor] Error stack:', (e as Error).stack);
      alert(`Save failed: ${(e as Error).message}`);
    } finally {
      console.log('[LayoutEditor] Setting working to false...');
      setWorking(false);
      setTimeout(() => {
        console.log('[LayoutEditor] Re-enabling layout changes after save...');
        setIsSaving(false);
      }, 100); // Brief delay to let React finish updating
    }
  }

  const { addTextBlock, addImageBlock } = useCommands(
    edited,
    setEdited,
    selectedId,
    setSelectedId,
    setIsEditingText,
    setDraftText
  );

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
              // Use a dedicated drag handle to avoid drag/resize conflicts
              draggableHandle={'.drag-handle'}
              draggableCancel={'.content-editable, input, textarea, select, button, .no-drag'}
              isBounded={true}
              verticalCompact={false}
              preventCollision={true}
              compactType={null}
              autoSize={false}
              useCSSTransforms={true}
              // Only sync state on drag/resize stop for smoother UX
              onDragStop={(layout: any[], oldItem: any, newItem: any) => {
                console.log('[LayoutEditor] onDragStop called with:', layout.length, 'items');
                console.log('[LayoutEditor] onDragStop positions:', layout.map(l => ({ id: l.i, x: l.x, y: l.y, w: l.w, h: l.h })));
                handleLayoutChange(layout);
                // Ensure selection includes dragged item if none or different
                if (!selectedIds.has(newItem?.i)) {
                  setSelectedIds(new Set([newItem?.i]));
                  setSelectedId(newItem?.i || null);
                }
              }}
              onResizeStop={(layout: any[]) => {
                console.log('[LayoutEditor] onResizeStop called with:', layout.length, 'items');
                handleLayoutChange(layout);
              }}
              onDragStart={(layout: any[], oldItem: any, newItem: any) => {
                console.log('[LayoutEditor] onDragStart - item:', newItem.i, 'from:', { x: oldItem.x, y: oldItem.y }, 'to:', { x: newItem.x, y: newItem.y });
                if (!selectedIds.has(newItem.i)) {
                  setSelectedIds(new Set([newItem.i]));
                  setSelectedId(newItem.i);
                }
              }}
              // Don't mutate state on every drag tick to avoid jank
              onResizeStart={(layout: any[], oldItem: any, newItem: any) => {
                console.log('[LayoutEditor] onResizeStart - item:', newItem.i, 'from:', { w: oldItem.w, h: oldItem.h }, 'to:', { w: newItem.w, h: newItem.h });
              }}
              onResize={(layout: any[], oldItem: any, newItem: any) => {
                console.log('[LayoutEditor] onResize - item:', newItem.i, 'size:', { w: newItem.w, h: newItem.h });
              }}
            >
              {edited.layout_data.items.map((it) => (
                <div
                  key={it.id}
                  className={`border bg-neutral-900 overflow-hidden ${selectedIds.has(it.id) ? 'border-blue-500' : 'border-blue-500/30'}`}
                  onMouseDown={(e) => {
                    // Multi-select: Cmd/Ctrl toggles, Shift adds, plain selects single
                    setIsEditingText(false);
                    setSelectedId(it.id);
                    setSelectedIds(prev => {
                      const next = new Set(prev);
                      if (e.metaKey || e.ctrlKey) {
                        if (next.has(it.id)) next.delete(it.id); else next.add(it.id);
                        return next;
                      }
                      if (e.shiftKey) {
                        next.add(it.id);
                        return next;
                      }
                      return new Set([it.id]);
                    });
                  }}
                  onDoubleClick={() => {
                    if (it.type === 'inline_text') {
                      setSelectedId(it.id);
                      setSelectedIds(new Set([it.id]));
                      setDraftText(it.inlineContent?.text || '');
                      setIsEditingText(true);
                    }
                  }}
                  style={{ zIndex: it.z || 1, userSelect: 'none', willChange: 'transform' }}
                >
                  {/* Drag handle bar */}
                  <div className="drag-handle h-6 px-2 flex items-center justify-between text-xs bg-neutral-800/70 border-b border-neutral-800 select-none">
                    <span className="text-neutral-300 truncate">{it.type === 'content_ref' ? it.contentType : it.type}</span>
                    <span className="text-neutral-500">drag</span>
                  </div>

                  {renderItem(it, previewUrls[it.id], loadingMap[it.id], {
                    isSelected: selectedIds.has(it.id),
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
              <button onClick={(e)=>{e.preventDefault(); e.stopPropagation(); addImageBlock();}} className="px-2 py-1 text-xs rounded border border-neutral-700 hover:bg-neutral-800">+ Image</button>
              <button onClick={(e)=>{e.preventDefault(); e.stopPropagation(); duplicateSelected();}} disabled={selectedIds.size === 0} className="px-2 py-1 text-xs rounded border border-neutral-700 hover:bg-neutral-800 disabled:opacity-50">Duplicate</button>
              <button onClick={(e)=>{e.preventDefault(); e.stopPropagation(); deleteSelected();}} disabled={selectedIds.size === 0} className="px-2 py-1 text-xs rounded border border-red-700 hover:bg-red-800 text-red-200 disabled:opacity-50">Delete</button>
            </div>
          </div>
          {selectedIds.size === 0 ? (
            <div className="text-xs text-neutral-500">Select an item to edit.</div>
          ) : selectedIds.size === 1 && selectedId ? (
            <ItemInspector
              item={edited.layout_data.items.find(i => i.id === selectedId)!}
              cellSize={cellSize}
              onChange={(up) => setEdited(prev => ({ ...prev, layout_data: { ...prev.layout_data, items: prev.layout_data.items.map(i => i.id === selectedId ? { ...i, ...up } as Item : i) } }))}
              onZ={(dir) => setEdited(prev => ({ ...prev, layout_data: { ...prev.layout_data, items: bringZ(prev.layout_data.items, selectedId, dir) } }))}
            />
          ) : (
            <div className="text-xs text-neutral-400">{selectedIds.size} items selected</div>
          )}
        </div>
      </div>
    </div>
  );
}

function updateItemPosition(item: Item, x: number, y: number, w: number, h: number, layoutData: LayoutAsset['layout_data']): Item {
  const cellSize = layoutData.cellSize || 20;
  const design = layoutData.designSize || { width: 1200, height: 800 };

  // Clamp to bounds to keep items inside canvas - use exact grid calculation
  const gridCols = Math.floor(design.width / cellSize);
  const gridRows = Math.floor(design.height / cellSize);
  const maxX = Math.max(0, gridCols - w);
  const maxY = Math.max(0, gridRows - h);
  const clampedX = Math.max(0, Math.min(x, maxX));
  const clampedY = Math.max(0, Math.min(y, maxY));
  const pxW = w * cellSize;
  const pxH = h * cellSize;
  const pxX = clampedX * cellSize;
  const pxY = clampedY * cellSize;

  return {
    ...item,
    x: clampedX, y: clampedY, w, h,
    nx: clamp(pxX / design.width),
    ny: clamp(pxY / design.height),
    nw: clamp(pxW / design.width),
    nh: clamp(pxH / design.height),
  } as Item;
}

function updateItemGrid(layout: LayoutAsset, id: string, x: number, y: number, w: number, h: number): LayoutAsset {
  const cellSize = layout.layout_data.cellSize || 20;
  const design = layout.layout_data.designSize || { width: 1200, height: 800 };
  // Clamp to bounds to keep items inside canvas - use exact grid calculation
  const gridCols = Math.floor(design.width / cellSize);
  const gridRows = Math.floor(design.height / cellSize);
  const maxX = Math.max(0, gridCols - w);
  const maxY = Math.max(0, gridRows - h);
  const clampedX = Math.max(0, Math.min(x, maxX));
  const clampedY = Math.max(0, Math.min(y, maxY));
  const pxW = w * cellSize;
  const pxH = h * cellSize;
  const pxX = clampedX * cellSize;
  const pxY = clampedY * cellSize;

  const items = layout.layout_data.items.map((it) =>
    it.id === id
      ? ({
          ...it,
          x: clampedX, y: clampedY, w, h,
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

// Normalize all items' normalized coords to match grid before persisting
function normalizeAllItems(layout: LayoutAsset): LayoutAsset {
  const cellSize = layout.layout_data.cellSize || 20;
  const design = layout.layout_data.designSize || { width: 1200, height: 800 };
  const gridCols = Math.floor(design.width / cellSize);
  const gridRows = Math.floor(design.height / cellSize);

  const items = layout.layout_data.items.map(it => {
    // Ensure grid positions are within bounds
    const clampedX = Math.max(0, Math.min(it.x || 0, gridCols - (it.w || 1)));
    const clampedY = Math.max(0, Math.min(it.y || 0, gridRows - (it.h || 1)));
    const pxW = (it.w || 1) * cellSize;
    const pxH = (it.h || 1) * cellSize;
    const pxX = clampedX * cellSize;
    const pxY = clampedY * cellSize;
    return {
      ...it,
      x: clampedX,
      y: clampedY,
      nx: clamp(pxX / design.width),
      ny: clamp(pxY / design.height),
      nw: clamp(pxW / design.width),
      nh: clamp(pxH / design.height),
    } as Item;
  });
  return { ...layout, layout_data: { ...layout.layout_data, items }, updated_at: new Date().toISOString() } as LayoutAsset;
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
        <img src={src} alt="inline" className="max-w-full max-h-full object-contain" draggable={false} />
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
          <img src={url} alt="image" className="max-w-full max-h-full object-contain" draggable={false} />
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



// Commands wired to state using closures
function useCommands(
  edited: LayoutAsset,
  setEdited: React.Dispatch<React.SetStateAction<LayoutAsset>>,
  selectedId: string | null,
  setSelectedId: React.Dispatch<React.SetStateAction<string | null>>,
  setIsEditingText: React.Dispatch<React.SetStateAction<boolean>>,
  setDraftText: React.Dispatch<React.SetStateAction<string>>,
) {
  function addTextBlock() {
    const id = `inline_${Date.now().toString(36)}`;
    const cellSize = edited.layout_data.cellSize || 20;
    const design = edited.layout_data.designSize || { width: 1200, height: 800 };

    // Find a good position that doesn't overlap
    const existingItems = edited.layout_data.items;
    let x = 0, y = 0;
    let foundSpot = false;

    // Simple placement algorithm: try positions until we find one that doesn't overlap
    for (let tryY = 0; tryY < 10 && !foundSpot; tryY++) {
      for (let tryX = 0; tryX < 10 && !foundSpot; tryX++) {
        const testX = tryX * 2;
        const testY = tryY * 2;
        const testW = Math.max(6, Math.round(400 / cellSize));
        const testH = Math.max(3, Math.round(120 / cellSize));

        // Check if this position overlaps with existing items
        const overlaps = existingItems.some(item => {
          const itemX = item.x || 0;
          const itemY = item.y || 0;
          const itemW = item.w || 1;
          const itemH = item.h || 1;

          return !(testX + testW <= itemX || testX >= itemX + itemW ||
                   testY + testH <= itemY || testY >= itemY + itemH);
        });

        if (!overlaps) {
          x = testX;
          y = testY;
          foundSpot = true;
        }
      }
    }

    const newItem: Item = {
      id,
      type: 'inline_text',
      x, y,
      w: Math.max(6, Math.round(400 / cellSize)),
      h: Math.max(3, Math.round(120 / cellSize)),
      nx: (x * cellSize) / design.width,
      ny: (y * cellSize) / design.height,
      nw: (Math.max(6, Math.round(400 / cellSize)) * cellSize) / design.width,
      nh: (Math.max(3, Math.round(120 / cellSize)) * cellSize) / design.height,
      inlineContent: { text: 'Edit me' },
    } as any;

    setEdited(prev => ({
      ...prev,
      layout_data: {
        ...prev.layout_data,
        items: [...prev.layout_data.items, newItem]
      },
      updated_at: new Date().toISOString()
    } as LayoutAsset));
  }

  function addImageBlock() {
    const id = `inline_img_${Date.now().toString(36)}`;
    const cellSize = edited.layout_data.cellSize || 20;
    const design = edited.layout_data.designSize || { width: 1200, height: 800 };

    // Find a good position that doesn't overlap
    const existingItems = edited.layout_data.items;
    let x = 0, y = 0;
    let foundSpot = false;

    // Simple placement algorithm: try positions until we find one that doesn't overlap
    for (let tryY = 0; tryY < 10 && !foundSpot; tryY++) {
      for (let tryX = 0; tryX < 10 && !foundSpot; tryX++) {
        const testX = tryX * 2;
        const testY = tryY * 2;
        const testW = Math.max(4, Math.round(300 / cellSize));
        const testH = Math.max(4, Math.round(200 / cellSize));

        // Check if this position overlaps with existing items
        const overlaps = existingItems.some(item => {
          const itemX = item.x || 0;
          const itemY = item.y || 0;
          const itemW = item.w || 1;
          const itemH = item.h || 1;

          return !(testX + testW <= itemX || testX >= itemX + itemW ||
                   testY + testH <= itemY || testY >= itemY + itemH);
        });

        if (!overlaps) {
          x = testX;
          y = testY;
          foundSpot = true;
        }
      }
    }

    const newItem: Item = {
      id,
      type: 'inline_image',
      x, y,
      w: Math.max(4, Math.round(300 / cellSize)),
      h: Math.max(4, Math.round(200 / cellSize)),
      nx: (x * cellSize) / design.width,
      ny: (y * cellSize) / design.height,
      nw: (Math.max(4, Math.round(300 / cellSize)) * cellSize) / design.width,
      nh: (Math.max(4, Math.round(200 / cellSize)) * cellSize) / design.height,
      inlineContent: { imageUrl: '', alt: 'Image' },
    } as any;

    setEdited(prev => ({
      ...prev,
      layout_data: {
        ...prev.layout_data,
        items: [...prev.layout_data.items, newItem]
      },
      updated_at: new Date().toISOString()
    } as LayoutAsset));
  }
  return { addTextBlock, addImageBlock, duplicateSelected: () => {}, deleteSelected: () => {} };
}

// Inspector for selected item properties
function ItemInspector({
  item,
  cellSize,
  onChange,
  onZ,
}: {
  item: Item;
  cellSize: number;
  onChange: (updates: Partial<Item>) => void;
  onZ: (dir: 'front' | 'back' | 'up' | 'down') => void;
}) {
  const [localImageUrl, setLocalImageUrl] = useState(item.inlineContent?.imageUrl || '');

  const handleImageUrlChange = (url: string) => {
    setLocalImageUrl(url);
    onChange({
      inlineContent: { ...(item.inlineContent || {}), imageUrl: url }
    });
  };

  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs text-neutral-400 mb-1">Position & Size</div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <label className="text-neutral-400">X</label>
            <input
              type="number"
              value={item.x || 0}
              onChange={(e) => onChange({ x: parseInt(e.target.value) || 0 })}
              className="w-full px-2 py-1 bg-neutral-800 rounded text-neutral-200"
            />
          </div>
          <div>
            <label className="text-neutral-400">Y</label>
            <input
              type="number"
              value={item.y || 0}
              onChange={(e) => onChange({ y: parseInt(e.target.value) || 0 })}
              className="w-full px-2 py-1 bg-neutral-800 rounded text-neutral-200"
            />
          </div>
          <div>
            <label className="text-neutral-400">W</label>
            <input
              type="number"
              value={item.w || 1}
              onChange={(e) => onChange({ w: Math.max(1, parseInt(e.target.value) || 1) })}
              className="w-full px-2 py-1 bg-neutral-800 rounded text-neutral-200"
            />
          </div>
          <div>
            <label className="text-neutral-400">H</label>
            <input
              type="number"
              value={item.h || 1}
              onChange={(e) => onChange({ h: Math.max(1, parseInt(e.target.value) || 1) })}
              className="w-full px-2 py-1 bg-neutral-800 rounded text-neutral-200"
            />
          </div>
        </div>
      </div>

      <div>
        <div className="text-xs text-neutral-400 mb-1">Z-Index</div>
        <div className="flex gap-1">
          <button onClick={() => onZ('front')} className="px-2 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 rounded">Front</button>
          <button onClick={() => onZ('up')} className="px-2 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 rounded">Up</button>
          <button onClick={() => onZ('down')} className="px-2 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 rounded">Down</button>
          <button onClick={() => onZ('back')} className="px-2 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 rounded">Back</button>
        </div>
      </div>

      {item.type === 'inline_image' && (
        <div>
          <div className="text-xs text-neutral-400 mb-1">Image URL</div>
          <input
            type="url"
            value={localImageUrl}
            onChange={(e) => handleImageUrlChange(e.target.value)}
            placeholder="https://example.com/image.jpg"
            className="w-full px-2 py-1 bg-neutral-800 rounded text-neutral-200 text-xs"
          />
          <div className="text-xs text-neutral-500 mt-1">
            Paste an image URL or upload to S3
          </div>
        </div>
      )}

      {item.type === 'content_ref' && (
        <div>
          <div className="text-xs text-neutral-400 mb-1">Content Reference</div>
          <div className="text-xs text-neutral-300">
            Type: {item.contentType}<br/>
            ID: {item.refId}<br/>
            {item.mediaUrl && <>URL: {item.mediaUrl.slice(0, 40)}...</>}
          </div>
        </div>
      )}

      <div>
        <div className="text-xs text-neutral-400 mb-1">Item Info</div>
        <div className="text-xs text-neutral-300">
          Type: {item.type}<br/>
          ID: {item.id}
        </div>
      </div>
    </div>
  );
}

