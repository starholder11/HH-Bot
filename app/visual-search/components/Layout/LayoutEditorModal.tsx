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
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [showAlignmentGuides, setShowAlignmentGuides] = useState(true);
  const [currentBreakpoint, setCurrentBreakpoint] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');

  const cellSize = edited.layout_data.cellSize || 20;

  // Get breakpoint-specific design size
  const breakpointSizes = {
    desktop: { width: 1200, height: 800 },
    tablet: { width: 768, height: 1024 },
    mobile: { width: 375, height: 667 }
  };

  const design = breakpointSizes[currentBreakpoint];
  const cols = Math.floor(design.width / cellSize);
  const rowHeight = cellSize;

  // Filter visible items for current breakpoint
  const visibleItems = useMemo(
    () => edited.layout_data.items.filter(it => {
      const breakpointData = (it as any).breakpoints?.[currentBreakpoint];
      return breakpointData?.visible ?? true;
    }),
    [edited.layout_data.items, currentBreakpoint]
  );

  const rglLayout = useMemo(
    () =>
      visibleItems.map((it) => {
        // Get breakpoint-specific position, fallback to desktop position
        const breakpointData = (it as any).breakpoints?.[currentBreakpoint] || {};
        const position = {
          x: breakpointData.x ?? it.x ?? 0,
          y: breakpointData.y ?? it.y ?? 0,
          w: breakpointData.w ?? it.w ?? 1,
          h: breakpointData.h ?? it.h ?? 1,
        };

        return {
          i: it.id,
          x: Math.max(0, position.x),
          y: Math.max(0, position.y),
          w: Math.max(1, position.w),
          h: Math.max(1, position.h),
          static: false,
        };
      }),
    [visibleItems, currentBreakpoint]
  );

  // Keyboard shortcuts: delete, duplicate, nudge for multi-select
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (selectedIds.size === 0) return;
      const isMeta = e.metaKey || e.ctrlKey;
      console.log('[LayoutEditorModal] key', { key: e.key, size: selectedIds.size, ids: Array.from(selectedIds) });
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
      Array.from(selectedIds).forEach((id) => {
        const it = prev.layout_data.items.find(i => i.id === id);
        if (!it) return;
        const copy = { ...it, id: `${it.id}_copy_${nowSuffix}_${Math.random().toString(36).slice(2,5)}`, x: (it.x || 0) + 1, y: (it.y || 0) + 1 } as Item;
        copies.push(copy);
      });
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

  // Alignment functions for multi-select
  function alignSelected(alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') {
    if (selectedIds.size < 2) return;

    setEdited(prev => {
      const selectedItems = prev.layout_data.items.filter(i => selectedIds.has(i.id));
      if (selectedItems.length < 2) return prev;

      // Get current positions for the selected breakpoint
      const getCurrentPosition = (item: any) => {
        const breakpointData = item.breakpoints?.[currentBreakpoint] || {};
        return {
          x: breakpointData.x ?? item.x ?? 0,
          y: breakpointData.y ?? item.y ?? 0,
          w: breakpointData.w ?? item.w ?? 1,
          h: breakpointData.h ?? item.h ?? 1,
        };
      };

      // Calculate alignment reference based on first selected item or bounds
      let alignRef: number;
      switch (alignment) {
        case 'left':
          alignRef = Math.min(...selectedItems.map(i => getCurrentPosition(i).x));
          break;
        case 'right': {
          const maxRight = Math.max(...selectedItems.map(i => {
            const pos = getCurrentPosition(i);
            return pos.x + pos.w;
          }));
          alignRef = maxRight;
          break;
        }
        case 'center': {
          const minX = Math.min(...selectedItems.map(i => getCurrentPosition(i).x));
          const maxX = Math.max(...selectedItems.map(i => {
            const pos = getCurrentPosition(i);
            return pos.x + pos.w;
          }));
          alignRef = Math.floor((minX + maxX) / 2);
          break;
        }
        case 'top':
          alignRef = Math.min(...selectedItems.map(i => getCurrentPosition(i).y));
          break;
        case 'bottom': {
          const maxBottom = Math.max(...selectedItems.map(i => {
            const pos = getCurrentPosition(i);
            return pos.y + pos.h;
          }));
          alignRef = maxBottom;
          break;
        }
        case 'middle': {
          const minY = Math.min(...selectedItems.map(i => getCurrentPosition(i).y));
          const maxY = Math.max(...selectedItems.map(i => {
            const pos = getCurrentPosition(i);
            return pos.y + pos.h;
          }));
          alignRef = Math.floor((minY + maxY) / 2);
          break;
        }
        default:
          return prev;
      }

      const cell = prev.layout_data.cellSize || 20;
      const gridCols = Math.floor(design.width / cell);
      const gridRows = Math.floor(design.height / cell);

      const updatedItems = prev.layout_data.items.map(item => {
        if (!selectedIds.has(item.id)) return item;

        const currentPos = getCurrentPosition(item);
        let newX = currentPos.x;
        let newY = currentPos.y;
        const w = currentPos.w;
        const h = currentPos.h;

        switch (alignment) {
          case 'left':
            newX = alignRef;
            break;
          case 'right':
            newX = alignRef - w;
            break;
          case 'center':
            newX = alignRef - Math.floor(w / 2);
            break;
          case 'top':
            newY = alignRef;
            break;
          case 'bottom':
            newY = alignRef - h;
            break;
          case 'middle':
            newY = alignRef - Math.floor(h / 2);
            break;
        }

        // Clamp to bounds
        const maxX = Math.max(0, gridCols - w);
        const maxY = Math.max(0, gridRows - h);
        newX = Math.max(0, Math.min(newX, maxX));
        newY = Math.max(0, Math.min(newY, maxY));

        // Update using breakpoint-aware function
        return updateItemPositionWithBreakpoint(item, newX, newY, w, h, prev.layout_data, currentBreakpoint);
      });

      return {
        ...prev,
        layout_data: { ...prev.layout_data, items: updatedItems },
        updated_at: new Date().toISOString()
      } as LayoutAsset;
    });
  }

  function distributeSelected(direction: 'horizontal' | 'vertical') {
    if (selectedIds.size < 3) return;

    setEdited(prev => {
      const selectedItems = prev.layout_data.items.filter(i => selectedIds.has(i.id));
      if (selectedItems.length < 3) return prev;

      // Sort items by position
      const sortedItems = direction === 'horizontal'
        ? selectedItems.sort((a, b) => (a.x || 0) - (b.x || 0))
        : selectedItems.sort((a, b) => (a.y || 0) - (b.y || 0));

      const first = sortedItems[0];
      const last = sortedItems[sortedItems.length - 1];

      // Calculate total space between first and last item
      const totalSpace = direction === 'horizontal'
        ? ((last.x || 0) + (last.w || 1)) - (first.x || 0)
        : ((last.y || 0) + (last.h || 1)) - (first.y || 0);

      // Calculate spacing between items
      const spacing = totalSpace / (sortedItems.length - 1);

      const cell = prev.layout_data.cellSize || 20;
      const designSize = prev.layout_data.designSize || { width: 1200, height: 800 };
      const gridCols = Math.floor(designSize.width / cell);
      const gridRows = Math.floor(designSize.height / cell);

      // Update item positions
      const updatedItems = prev.layout_data.items.map(item => {
        const itemIndex = sortedItems.findIndex(si => si.id === item.id);
        if (itemIndex === -1 || itemIndex === 0 || itemIndex === sortedItems.length - 1) {
          return item; // Don't move first and last items
        }

        let newX = item.x || 0;
        let newY = item.y || 0;
        const w = item.w || 1;
        const h = item.h || 1;

        if (direction === 'horizontal') {
          newX = Math.round((first.x || 0) + (spacing * itemIndex) - (w / 2));
        } else {
          newY = Math.round((first.y || 0) + (spacing * itemIndex) - (h / 2));
        }

        // Clamp to bounds
        const maxX = Math.max(0, gridCols - w);
        const maxY = Math.max(0, gridRows - h);
        newX = Math.max(0, Math.min(newX, maxX));
        newY = Math.max(0, Math.min(newY, maxY));

        const pxX = newX * cell;
        const pxY = newY * cell;
        const pxW = w * cell;
        const pxH = h * cell;

        return {
          ...item,
          x: newX,
          y: newY,
          nx: clamp(pxX / designSize.width),
          ny: clamp(pxY / designSize.height),
          nw: clamp(pxW / designSize.width),
          nh: clamp(pxH / designSize.height),
        } as Item;
      });

      return {
        ...prev,
        layout_data: { ...prev.layout_data, items: updatedItems },
        updated_at: new Date().toISOString()
      } as LayoutAsset;
    });
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
          const updated = updateItemPositionWithBreakpoint(item as any, layoutItem.x, layoutItem.y, layoutItem.w, layoutItem.h, prev.layout_data, currentBreakpoint);
          console.log('[LayoutEditor] Updated item:', item.id, 'for breakpoint:', currentBreakpoint, 'from', { x: item.x, y: item.y, w: item.w, h: item.h }, 'to position:', { x: layoutItem.x, y: layoutItem.y, w: layoutItem.w, h: layoutItem.h });
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

  const { addTextBlock, addImageBlock, addBlock } = useCommands(
    edited,
    setEdited,
    selectedId,
    setSelectedId,
    setSelectedIds,
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
            <LayoutManagementDropdown
              layout={edited}
              onRename={(newTitle) => setEdited(prev => ({ ...prev, title: newTitle, updated_at: new Date().toISOString() }))}
              onDuplicate={async () => {
                try {
                  const duplicated = await duplicateLayout(edited);
                  window.dispatchEvent(new Event('layouts:refresh'));
                  alert(`Layout duplicated: ${duplicated.title}`);
                } catch (error) {
                  alert(`Failed to duplicate: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
              }}
              onSaveAsTemplate={async () => {
                try {
                  const template = await saveAsTemplate(edited);
                  window.dispatchEvent(new Event('layouts:refresh'));
                  alert(`Template saved: ${template.title}`);
                } catch (error) {
                  alert(`Failed to save template: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
              }}
              onCreateVersion={async () => {
                try {
                  const version = await createVersion(edited);
                  window.dispatchEvent(new Event('layouts:refresh'));
                  alert(`Version created: ${version.title}`);
                } catch (error) {
                  alert(`Failed to create version: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
              }}
            />
          </div>

          {/* Alignment tools - shown when multiple items selected */}
          {selectedIds.size >= 2 && (
            <div className="flex items-center gap-1">
              <div className="text-xs text-neutral-400 mr-2">{selectedIds.size} selected</div>

              {/* Alignment buttons */}
              <div className="flex gap-1 border-r border-neutral-700 pr-2">
                <button
                  onClick={() => alignSelected('left')}
                  className="px-2 py-1 text-xs rounded border border-neutral-700 hover:bg-neutral-800"
                  title="Align Left"
                >
                  ⫷
                </button>
                <button
                  onClick={() => alignSelected('center')}
                  className="px-2 py-1 text-xs rounded border border-neutral-700 hover:bg-neutral-800"
                  title="Align Center"
                >
                  ≣
                </button>
                <button
                  onClick={() => alignSelected('right')}
                  className="px-2 py-1 text-xs rounded border border-neutral-700 hover:bg-neutral-800"
                  title="Align Right"
                >
                  ⫸
                </button>
                <button
                  onClick={() => alignSelected('top')}
                  className="px-2 py-1 text-xs rounded border border-neutral-700 hover:bg-neutral-800"
                  title="Align Top"
                >
                  ⫶
                </button>
                <button
                  onClick={() => alignSelected('middle')}
                  className="px-2 py-1 text-xs rounded border border-neutral-700 hover:bg-neutral-800"
                  title="Align Middle"
                >
                  ☰
                </button>
                <button
                  onClick={() => alignSelected('bottom')}
                  className="px-2 py-1 text-xs rounded border border-neutral-700 hover:bg-neutral-800"
                  title="Align Bottom"
                >
                  ⫷
                </button>
              </div>

              {/* Distribution buttons */}
              {selectedIds.size >= 3 && (
                <div className="flex gap-1 border-r border-neutral-700 pr-2">
                  <button
                    onClick={() => distributeSelected('horizontal')}
                    className="px-2 py-1 text-xs rounded border border-neutral-700 hover:bg-neutral-800"
                    title="Distribute Horizontally"
                  >
                    ⟷
                  </button>
                  <button
                    onClick={() => distributeSelected('vertical')}
                    className="px-2 py-1 text-xs rounded border border-neutral-700 hover:bg-neutral-800"
                    title="Distribute Vertically"
                  >
                    ↕
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            {/* Breakpoint selector */}
            <div className="flex items-center gap-1 text-xs border-r border-neutral-700 pr-2">
              <span className="text-neutral-400">View:</span>
              {(['desktop', 'tablet', 'mobile'] as const).map((bp) => (
                <button
                  key={bp}
                  onClick={() => setCurrentBreakpoint(bp)}
                  className={`px-2 py-1 rounded text-xs ${
                    currentBreakpoint === bp
                      ? 'bg-blue-600 text-white'
                      : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                  }`}
                  title={`${bp.charAt(0).toUpperCase() + bp.slice(1)} view (${breakpointSizes[bp].width}×${breakpointSizes[bp].height})`}
                >
                  {bp === 'desktop' ? '🖥️' : bp === 'tablet' ? '📱' : '📱'}
                  <span className="ml-1">{bp.charAt(0).toUpperCase() + bp.slice(1)}</span>
                </button>
              ))}
            </div>

            {/* Grid and snap controls */}
            <div className="flex items-center gap-2 text-xs border-r border-neutral-700 pr-2">
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={snapToGrid}
                  onChange={(e) => setSnapToGrid(e.target.checked)}
                  className="text-blue-500"
                />
                <span className="text-neutral-300">Snap</span>
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={showAlignmentGuides}
                  onChange={(e) => setShowAlignmentGuides(e.target.checked)}
                  className="text-blue-500"
                />
                <span className="text-neutral-300">Guides</span>
              </label>
            </div>

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
            {/* Grid overlay */}
            {snapToGrid && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  backgroundImage: `
                    linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px),
                    linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)
                  `,
                  backgroundSize: `${cellSize}px ${cellSize}px`
                }}
              />
            )}

            {/* Alignment guides */}
            {showAlignmentGuides && selectedIds.size > 0 && (
              <AlignmentGuides
                items={edited.layout_data.items}
                selectedIds={selectedIds}
                cellSize={cellSize}
                designSize={design}
              />
            )}
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
              // Disable internal RGL bounding so we can freely drag; we clamp to canvas bounds on drop
              isBounded={false}
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
              {visibleItems.map((it) => (
                <div
                  key={it.id}
                  className={`border bg-neutral-900 overflow-hidden ${selectedIds.has(it.id) ? 'border-blue-500' : 'border-blue-500/30'}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setIsEditingText(false);
                    const isToggle = e.metaKey || e.ctrlKey;
                    const isRange = e.shiftKey && !!selectedId;
                    console.log('[LayoutEditorModal] onMouseDown', { id: it.id, isToggle, isRange, selectedId, before: Array.from(selectedIds) });
                    if (isToggle) {
                      setSelectedIds(prev => {
                        const next = new Set(prev);
                        if (next.has(it.id)) {
                          next.delete(it.id);
                          if (selectedId === it.id) {
                            const remaining = Array.from(next);
                            setSelectedId(remaining.length > 0 ? remaining[remaining.length - 1] : null);
                          }
                        } else {
                          next.add(it.id);
                          setSelectedId(it.id);
                        }
                        console.log('[LayoutEditorModal] toggle -> after', Array.from(next));
                        return next;
                      });
                    } else if (isRange) {
                      const items = edited.layout_data.items;
                      const lastIndex = items.findIndex(item => item.id === selectedId);
                      const currentIndex = items.findIndex(item => item.id === it.id);
                      if (lastIndex !== -1 && currentIndex !== -1) {
                        const start = Math.min(lastIndex, currentIndex);
                        const end = Math.max(lastIndex, currentIndex);
                        const rangeIds = items.slice(start, end + 1).map(item => item.id);
                        setSelectedIds(prev => {
                          const next = new Set(prev);
                          rangeIds.forEach(id => next.add(id));
                          console.log('[LayoutEditorModal] range ->', { start, end, rangeIds, after: Array.from(next) });
                          return next;
                        });
                        setSelectedId(it.id);
                      }
                    } else {
                      setSelectedId(it.id);
                      const next = new Set([it.id]);
                      setSelectedIds(next);
                      console.log('[LayoutEditorModal] single -> after', Array.from(next));
                    }
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
              <button onClick={(e)=>{e.preventDefault(); e.stopPropagation(); duplicateSelected();}} disabled={selectedIds.size === 0} className="px-2 py-1 text-xs rounded border border-neutral-700 hover:bg-neutral-800 disabled:opacity-50">Duplicate</button>
              <button onClick={(e)=>{e.preventDefault(); e.stopPropagation(); deleteSelected();}} disabled={selectedIds.size === 0} className="px-2 py-1 text-xs rounded border border-red-700 hover:bg-red-800 text-red-200 disabled:opacity-50">Delete</button>
            </div>
          </div>

          {/* Block Library */}
          <BlockLibrary onAddBlock={addBlock} />
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

function updateItemPositionWithBreakpoint(
  item: any,
  x: number,
  y: number,
  w: number,
  h: number,
  layoutData: LayoutAsset['layout_data'],
  breakpoint: 'desktop' | 'tablet' | 'mobile'
): any {
  const cellSize = layoutData.cellSize || 20;
  const breakpointSizes = {
    desktop: { width: 1200, height: 800 },
    tablet: { width: 768, height: 1024 },
    mobile: { width: 375, height: 667 }
  };
  const design = breakpointSizes[breakpoint];

  // Clamp to bounds for the current breakpoint
  const gridCols = Math.floor(design.width / cellSize);
  const gridRows = Math.floor(design.height / cellSize);
  const maxX = Math.max(0, gridCols - w);
  const maxY = Math.max(0, gridRows - h);
  const clampedX = Math.max(0, Math.min(x, maxX));
  const clampedY = Math.max(0, Math.min(y, maxY));

  // Initialize breakpoints data if it doesn't exist
  const breakpoints = item.breakpoints || {};
  breakpoints[breakpoint] = {
    x: clampedX,
    y: clampedY,
    w,
    h,
    visible: breakpoints[breakpoint]?.visible ?? true
  };

  return {
    ...item,
    breakpoints,
    // Also update base position if this is desktop
    ...(breakpoint === 'desktop' ? {
      x: clampedX, y: clampedY, w, h,
      nx: clamp((clampedX * cellSize) / design.width),
      ny: clamp((clampedY * cellSize) / design.height),
      nw: clamp((w * cellSize) / design.width),
      nh: clamp((h * cellSize) / design.height),
    } : {})
  };
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
  const label = `${it.type}${it.contentType ? ` • ${it.contentType}` : ''}${(it as any).blockType ? ` • ${(it as any).blockType}` : ''}`;

  // Handle block types
  if (it.type === 'block' && (it as any).blockType) {
    return renderBlockItem(it as any, opts);
  }

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

function renderBlockItem(it: any, opts?: any) {
  const config = it.config || {};

  switch (it.blockType) {
    case 'hero':
      return (
        <div className="h-full w-full p-4 text-white bg-gradient-to-r from-blue-600 to-purple-600 overflow-hidden">
          <div className="text-center h-full flex flex-col justify-center">
            <h1 className="text-2xl font-bold mb-2">{config.title || 'Hero Title'}</h1>
            <p className="text-lg opacity-90 mb-4">{config.subtitle || 'Hero subtitle'}</p>
            <button className="bg-white text-blue-600 px-4 py-2 rounded font-medium">
              {config.ctaText || 'Get Started'}
            </button>
          </div>
        </div>
      );

    case 'media_grid':
      return (
        <div className="h-full w-full p-4 bg-neutral-800">
          <div
            className="grid h-full gap-2"
            style={{ gridTemplateColumns: `repeat(${config.columns || 3}, 1fr)` }}
          >
            {Array.from({ length: (config.columns || 3) * (config.rows || 2) }).map((_, i) => (
              <div key={i} className="bg-neutral-700 rounded flex items-center justify-center text-xs text-neutral-400">
                {config.items?.[i]?.title || `Item ${i + 1}`}
              </div>
            ))}
          </div>
        </div>
      );

    case 'cta':
      return (
        <div className="h-full w-full p-4 bg-gradient-to-r from-green-600 to-blue-600 text-white flex flex-col justify-center items-center text-center">
          <h3 className="text-xl font-bold mb-2">{config.title || 'Call to Action'}</h3>
          <p className="text-sm opacity-90 mb-4">{config.description || 'Description'}</p>
          <button className="bg-white text-green-600 px-4 py-2 rounded font-medium">
            {config.buttonText || 'Click Here'}
          </button>
        </div>
      );

    case 'footer':
      return (
        <div className="h-full w-full p-4 bg-neutral-800 text-neutral-200 flex items-center justify-between">
          <div className="text-xs">{config.copyright || '© 2024 Your Company'}</div>
          <div className="flex gap-4 text-xs">
            {(config.links || []).map((link: any, i: number) => (
              <span key={i} className="text-blue-400">{link.text}</span>
            ))}
          </div>
        </div>
      );

    case 'text_section':
      return (
        <div className="h-full w-full p-4 bg-white text-neutral-900 overflow-auto">
          <h2 className="text-lg font-bold mb-2">{config.title || 'Section Title'}</h2>
          <div className="text-sm leading-relaxed">{config.content || 'Content goes here'}</div>
        </div>
      );

    case 'spacer':
      return (
        <div
          className="h-full w-full border-2 border-dashed border-neutral-600 flex items-center justify-center text-xs text-neutral-500"
          style={{ backgroundColor: config.backgroundColor || 'transparent' }}
        >
          Spacer ({config.height || 80}px)
        </div>
      );

    default:
      return (
        <div className="h-full w-full flex items-center justify-center text-xs text-neutral-300 bg-purple-500/10">
          {it.blockType} block
        </div>
      );
  }
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
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>,
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

  function addBlock(blockType: 'hero' | 'media_grid' | 'cta' | 'footer' | 'text_section' | 'spacer' | 'inline_text' | 'inline_image') {
    const id = `${blockType}_${Date.now().toString(36)}`;
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

        // Get size based on block type
        const { w: testW, h: testH } = getBlockSize(blockType, cellSize);

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

    const { w, h } = getBlockSize(blockType, cellSize);
    const newItem: Item = createBlockItem(blockType, id, x, y, w, h, cellSize, design);

    setEdited(prev => ({
      ...prev,
      layout_data: {
        ...prev.layout_data,
        items: [...prev.layout_data.items, newItem]
      },
      updated_at: new Date().toISOString()
    } as LayoutAsset));

    // Select the newly created item
    setSelectedId(id);
    setSelectedIds(new Set([id]));
  }

  return { addTextBlock, addImageBlock, addBlock, duplicateSelected: () => {}, deleteSelected: () => {} };
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

      <div>
        <div className="text-xs text-neutral-400 mb-1">Responsive Visibility</div>
        <div className="space-y-1">
          {(['desktop', 'tablet', 'mobile'] as const).map(bp => {
            const isVisible = (item as any).breakpoints?.[bp]?.visible ?? true;
            return (
              <label key={bp} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={isVisible}
                  onChange={(e) => {
                    const breakpoints = (item as any).breakpoints || {};
                    breakpoints[bp] = { ...breakpoints[bp], visible: e.target.checked };
                    onChange({ breakpoints } as any);
                  }}
                  className="text-blue-500"
                />
                <span className="text-neutral-300 capitalize">{bp}</span>
                <span className="text-neutral-500">
                  {bp === 'desktop' ? '🖥️' : bp === 'tablet' ? '📱' : '📱'}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {item.type === 'inline_image' && (
        <ImageUploadSection
          imageUrl={localImageUrl}
          onImageChange={handleImageUrlChange}
        />
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

      {item.type === 'block' && (item as any).blockType && (
        <BlockInspector
          item={item as any}
          onChange={onChange}
        />
      )}

      <div>
        <div className="text-xs text-neutral-400 mb-1">Item Info</div>
        <div className="text-xs text-neutral-300">
          Type: {item.type}<br/>
          {(item as any).blockType && <>Block: {(item as any).blockType}<br/></>}
          ID: {item.id}
        </div>
      </div>
    </div>
  );
}

// Block Inspector for configuring block-specific properties
function BlockInspector({
  item,
  onChange,
}: {
  item: any;
  onChange: (updates: Partial<Item>) => void;
}) {
  const config = item.config || {};

  const updateConfig = (configUpdates: any) => {
    onChange({
      config: { ...config, ...configUpdates }
    });
  };

  switch (item.blockType) {
    case 'hero':
      return (
        <div>
          <div className="text-xs text-neutral-400 mb-1">Hero Configuration</div>
          <div className="space-y-2 text-xs">
            <div>
              <label className="text-neutral-400">Title</label>
              <input
                type="text"
                value={config.title || ''}
                onChange={(e) => updateConfig({ title: e.target.value })}
                className="w-full px-2 py-1 bg-neutral-800 rounded text-neutral-200"
              />
            </div>
            <div>
              <label className="text-neutral-400">Subtitle</label>
              <input
                type="text"
                value={config.subtitle || ''}
                onChange={(e) => updateConfig({ subtitle: e.target.value })}
                className="w-full px-2 py-1 bg-neutral-800 rounded text-neutral-200"
              />
            </div>
            <div>
              <label className="text-neutral-400">CTA Text</label>
              <input
                type="text"
                value={config.ctaText || ''}
                onChange={(e) => updateConfig({ ctaText: e.target.value })}
                className="w-full px-2 py-1 bg-neutral-800 rounded text-neutral-200"
              />
            </div>
            <div>
              <label className="text-neutral-400">CTA URL</label>
              <input
                type="url"
                value={config.ctaUrl || ''}
                onChange={(e) => updateConfig({ ctaUrl: e.target.value })}
                className="w-full px-2 py-1 bg-neutral-800 rounded text-neutral-200"
              />
            </div>
          </div>
        </div>
      );

    case 'media_grid':
      return (
        <div>
          <div className="text-xs text-neutral-400 mb-1">Media Grid Configuration</div>
          <div className="space-y-2 text-xs">
            <div>
              <label className="text-neutral-400">Columns</label>
              <input
                type="number"
                min="1"
                max="6"
                value={config.columns || 3}
                onChange={(e) => updateConfig({ columns: parseInt(e.target.value) || 3 })}
                className="w-full px-2 py-1 bg-neutral-800 rounded text-neutral-200"
              />
            </div>
            <div>
              <label className="text-neutral-400">Rows</label>
              <input
                type="number"
                min="1"
                max="4"
                value={config.rows || 2}
                onChange={(e) => updateConfig({ rows: parseInt(e.target.value) || 2 })}
                className="w-full px-2 py-1 bg-neutral-800 rounded text-neutral-200"
              />
            </div>
            <div>
              <label className="text-neutral-400">Gap (px)</label>
              <input
                type="number"
                min="0"
                value={config.gap || 16}
                onChange={(e) => updateConfig({ gap: parseInt(e.target.value) || 16 })}
                className="w-full px-2 py-1 bg-neutral-800 rounded text-neutral-200"
              />
            </div>
          </div>
        </div>
      );

    case 'cta':
      return (
        <div>
          <div className="text-xs text-neutral-400 mb-1">CTA Configuration</div>
          <div className="space-y-2 text-xs">
            <div>
              <label className="text-neutral-400">Title</label>
              <input
                type="text"
                value={config.title || ''}
                onChange={(e) => updateConfig({ title: e.target.value })}
                className="w-full px-2 py-1 bg-neutral-800 rounded text-neutral-200"
              />
            </div>
            <div>
              <label className="text-neutral-400">Description</label>
              <textarea
                value={config.description || ''}
                onChange={(e) => updateConfig({ description: e.target.value })}
                rows={2}
                className="w-full px-2 py-1 bg-neutral-800 rounded text-neutral-200"
              />
            </div>
            <div>
              <label className="text-neutral-400">Button Text</label>
              <input
                type="text"
                value={config.buttonText || ''}
                onChange={(e) => updateConfig({ buttonText: e.target.value })}
                className="w-full px-2 py-1 bg-neutral-800 rounded text-neutral-200"
              />
            </div>
            <div>
              <label className="text-neutral-400">Button URL</label>
              <input
                type="url"
                value={config.buttonUrl || ''}
                onChange={(e) => updateConfig({ buttonUrl: e.target.value })}
                className="w-full px-2 py-1 bg-neutral-800 rounded text-neutral-200"
              />
            </div>
          </div>
        </div>
      );

    case 'text_section':
      return (
        <div>
          <div className="text-xs text-neutral-400 mb-1">Text Section Configuration</div>
          <div className="space-y-2 text-xs">
            <div>
              <label className="text-neutral-400">Title</label>
              <input
                type="text"
                value={config.title || ''}
                onChange={(e) => updateConfig({ title: e.target.value })}
                className="w-full px-2 py-1 bg-neutral-800 rounded text-neutral-200"
              />
            </div>
            <div>
              <label className="text-neutral-400">Content</label>
              <textarea
                value={config.content || ''}
                onChange={(e) => updateConfig({ content: e.target.value })}
                rows={4}
                className="w-full px-2 py-1 bg-neutral-800 rounded text-neutral-200"
              />
            </div>
            <div>
              <label className="text-neutral-400">Text Alignment</label>
              <select
                value={config.textAlignment || 'left'}
                onChange={(e) => updateConfig({ textAlignment: e.target.value })}
                className="w-full px-2 py-1 bg-neutral-800 rounded text-neutral-200"
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </div>
          </div>
        </div>
      );

    case 'footer':
      return (
        <div>
          <div className="text-xs text-neutral-400 mb-1">Footer Configuration</div>
          <div className="space-y-2 text-xs">
            <div>
              <label className="text-neutral-400">Copyright</label>
              <input
                type="text"
                value={config.copyright || ''}
                onChange={(e) => updateConfig({ copyright: e.target.value })}
                className="w-full px-2 py-1 bg-neutral-800 rounded text-neutral-200"
              />
            </div>
            <div>
              <label className="text-neutral-400">Links (JSON)</label>
              <textarea
                value={JSON.stringify(config.links || [], null, 2)}
                onChange={(e) => {
                  try {
                    const links = JSON.parse(e.target.value);
                    updateConfig({ links });
                  } catch {}
                }}
                rows={3}
                className="w-full px-2 py-1 bg-neutral-800 rounded text-neutral-200 font-mono"
                placeholder='[{"text": "Privacy", "url": "#"}]'
              />
            </div>
          </div>
        </div>
      );

    case 'spacer':
      return (
        <div>
          <div className="text-xs text-neutral-400 mb-1">Spacer Configuration</div>
          <div className="space-y-2 text-xs">
            <div>
              <label className="text-neutral-400">Height (px)</label>
              <input
                type="number"
                min="20"
                value={config.height || 80}
                onChange={(e) => updateConfig({ height: parseInt(e.target.value) || 80 })}
                className="w-full px-2 py-1 bg-neutral-800 rounded text-neutral-200"
              />
            </div>
            <div>
              <label className="text-neutral-400">Background Color</label>
              <input
                type="text"
                value={config.backgroundColor || 'transparent'}
                onChange={(e) => updateConfig({ backgroundColor: e.target.value })}
                className="w-full px-2 py-1 bg-neutral-800 rounded text-neutral-200"
                placeholder="transparent, #ff0000, etc."
              />
            </div>
          </div>
        </div>
      );

    default:
      return (
        <div>
          <div className="text-xs text-neutral-400 mb-1">Block Configuration</div>
          <div className="text-xs text-neutral-500">No configuration available for {item.blockType}</div>
        </div>
      );
  }
}

// Image Upload Section with S3 integration
function ImageUploadSection({
  imageUrl,
  onImageChange,
}: {
  imageUrl: string;
  onImageChange: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [showImageLibrary, setShowImageLibrary] = useState(false);

  const handleFileUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      alert('Image file size must be less than 10MB.');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'image');
      formData.append('directory', 'layout-images');

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`);
      }

      const result = await response.json();
      if (result.url) {
        onImageChange(result.url);
      } else {
        throw new Error('No URL returned from upload');
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <div className="text-xs text-neutral-400 mb-1">Image</div>

      {/* Current image preview */}
      {imageUrl && (
        <div className="mb-2 relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Preview"
            className="w-full h-24 object-cover rounded border border-neutral-700"
          />
          <button
            onClick={() => onImageChange('')}
            className="absolute top-1 right-1 w-5 h-5 bg-red-600 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-700"
            title="Remove image"
          >
            ×
          </button>
        </div>
      )}

      {/* Upload options */}
      <div className="space-y-2">
        {/* File upload */}
        <label className="block">
          <div className={`w-full px-3 py-2 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors ${
            uploading
              ? 'border-blue-400 bg-blue-50/10 text-blue-400'
              : 'border-neutral-600 hover:border-neutral-500 text-neutral-400 hover:text-neutral-300'
          }`}>
            {uploading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-xs">Uploading...</span>
              </div>
            ) : (
              <div>
                <div className="text-lg mb-1">📁</div>
                <div className="text-xs">Click to upload image</div>
                <div className="text-xs text-neutral-500 mt-1">Max 10MB • JPG, PNG, GIF, WebP</div>
              </div>
            )}
          </div>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                handleFileUpload(file);
              }
            }}
            disabled={uploading}
          />
        </label>

        {/* URL input */}
        <div>
          <input
            type="url"
            value={imageUrl}
            onChange={(e) => onImageChange(e.target.value)}
            placeholder="https://example.com/image.jpg"
            className="w-full px-2 py-1 bg-neutral-800 rounded text-neutral-200 text-xs"
          />
          <div className="text-xs text-neutral-500 mt-1">
            Or paste an image URL
          </div>
        </div>

        {/* Image library button */}
        <button
          onClick={() => setShowImageLibrary(true)}
          className="w-full px-2 py-1 text-xs rounded border border-neutral-700 hover:bg-neutral-800 text-neutral-300"
        >
          Browse Image Library
        </button>
      </div>

      {/* Image Library Modal */}
      {showImageLibrary && (
        <ImageLibraryModal
          onSelect={(url) => {
            onImageChange(url);
            setShowImageLibrary(false);
          }}
          onClose={() => setShowImageLibrary(false)}
        />
      )}
    </div>
  );
}

// Image Library Modal for browsing existing images
function ImageLibraryModal({
  onSelect,
  onClose,
}: {
  onSelect: (url: string) => void;
  onClose: () => void;
}) {
  const [images, setImages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const loadImages = async () => {
      try {
        const response = await fetch('/api/media-assets?media_type=image&limit=50');
        if (response.ok) {
          const data = await response.json();
          setImages(data.assets || []);
        }
      } catch (error) {
        console.error('Failed to load images:', error);
      } finally {
        setLoading(false);
      }
    };

    loadImages();
  }, []);

  const filteredImages = images.filter(img =>
    img.title?.toLowerCase().includes(search.toLowerCase()) ||
    img.filename?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-neutral-900 rounded-lg border border-neutral-700 w-full max-w-4xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-neutral-700 flex items-center justify-between">
          <h3 className="text-lg font-medium text-neutral-100">Image Library</h3>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-200"
          >
            ×
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-neutral-700">
          <input
            type="text"
            placeholder="Search images..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 bg-neutral-800 rounded border border-neutral-600 text-neutral-100"
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="text-neutral-400">Loading images...</div>
            </div>
          ) : filteredImages.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <div className="text-neutral-500">
                {search ? 'No images found matching your search' : 'No images found'}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredImages.map((img) => (
                <button
                  key={img.id}
                  onClick={() => onSelect(img.cloudflare_url || img.s3_url)}
                  className="aspect-square rounded border border-neutral-600 hover:border-neutral-500 overflow-hidden group"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.cloudflare_url || img.s3_url}
                    alt={img.title || img.filename}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors"></div>
                  <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent">
                    <div className="text-xs text-white truncate">
                      {img.title || img.filename}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper functions for block creation
function getBlockSize(blockType: string, cellSize: number): { w: number; h: number } {
  switch (blockType) {
    case 'hero':
      return { w: Math.max(20, Math.round(800 / cellSize)), h: Math.max(8, Math.round(400 / cellSize)) };
    case 'media_grid':
      return { w: Math.max(15, Math.round(600 / cellSize)), h: Math.max(12, Math.round(480 / cellSize)) };
    case 'cta':
      return { w: Math.max(8, Math.round(320 / cellSize)), h: Math.max(4, Math.round(160 / cellSize)) };
    case 'footer':
      return { w: Math.max(20, Math.round(800 / cellSize)), h: Math.max(3, Math.round(120 / cellSize)) };
    case 'text_section':
      return { w: Math.max(12, Math.round(480 / cellSize)), h: Math.max(6, Math.round(240 / cellSize)) };
    case 'spacer':
      return { w: Math.max(4, Math.round(160 / cellSize)), h: Math.max(2, Math.round(80 / cellSize)) };
    case 'inline_text':
      return { w: Math.max(6, Math.round(240 / cellSize)), h: Math.max(3, Math.round(120 / cellSize)) };
    case 'inline_image':
      return { w: Math.max(6, Math.round(240 / cellSize)), h: Math.max(6, Math.round(240 / cellSize)) };
    default:
      return { w: 4, h: 3 };
  }
}

function createBlockItem(
  blockType: string,
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  cellSize: number,
  design: { width: number; height: number }
): Item {
  const baseItem = {
    id,
    x, y, w, h,
    nx: (x * cellSize) / design.width,
    ny: (y * cellSize) / design.height,
    nw: (w * cellSize) / design.width,
    nh: (h * cellSize) / design.height,
  };

  switch (blockType) {
    case 'hero':
      return {
        ...baseItem,
        type: 'block',
        blockType: 'hero',
        config: {
          title: 'Hero Title',
          subtitle: 'Hero subtitle text goes here',
          ctaText: 'Get Started',
          ctaUrl: '#',
          backgroundImage: '',
          textAlignment: 'center'
        }
      } as any;

    case 'media_grid':
      return {
        ...baseItem,
        type: 'block',
        blockType: 'media_grid',
        config: {
          columns: 3,
          rows: 2,
          gap: 16,
          items: []
        }
      } as any;

    case 'cta':
      return {
        ...baseItem,
        type: 'block',
        blockType: 'cta',
        config: {
          title: 'Call to Action',
          description: 'Compelling description here',
          buttonText: 'Click Here',
          buttonUrl: '#',
          style: 'primary'
        }
      } as any;

    case 'footer':
      return {
        ...baseItem,
        type: 'block',
        blockType: 'footer',
        config: {
          copyright: '© 2024 Your Company',
          links: [
            { text: 'Privacy', url: '#' },
            { text: 'Terms', url: '#' },
            { text: 'Contact', url: '#' }
          ]
        }
      } as any;

    case 'text_section':
      return {
        ...baseItem,
        type: 'block',
        blockType: 'text_section',
        config: {
          title: 'Section Title',
          content: 'Your content goes here. This is a text section block that can contain rich text content.',
          textAlignment: 'left'
        }
      } as any;

    case 'spacer':
      return {
        ...baseItem,
        type: 'block',
        blockType: 'spacer',
        config: {
          height: h * cellSize,
          backgroundColor: 'transparent'
        }
      } as any;

    case 'inline_text':
      return {
        ...baseItem,
        type: 'inline_text',
        inlineContent: { text: 'Edit me' }
      } as any;

    case 'inline_image':
      return {
        ...baseItem,
        type: 'inline_image',
        inlineContent: { imageUrl: '', alt: 'Image' }
      } as any;

    default:
      return baseItem as any;
  }
}

// Block Library component
function BlockLibrary({ onAddBlock }: { onAddBlock: (blockType: any) => void }) {
  const blocks = [
    { type: 'inline_text', name: 'Text', icon: 'T', description: 'Simple text block' },
    { type: 'inline_image', name: 'Image', icon: '🖼️', description: 'Image block' },
    { type: 'hero', name: 'Hero', icon: '🏆', description: 'Hero section with title, subtitle, and CTA' },
    { type: 'media_grid', name: 'Media Grid', icon: '⊞', description: 'Grid of media items' },
    { type: 'text_section', name: 'Text Section', icon: '📄', description: 'Rich text content section' },
    { type: 'cta', name: 'CTA', icon: '🎯', description: 'Call-to-action block' },
    { type: 'footer', name: 'Footer', icon: '⬇️', description: 'Footer with links and copyright' },
    { type: 'spacer', name: 'Spacer', icon: '⬜', description: 'Empty spacing block' }
  ];

  return (
    <div>
      <div className="text-xs text-neutral-400 mb-2">Block Library</div>
      <div className="grid grid-cols-2 gap-2">
        {blocks.map(block => (
          <button
            key={block.type}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onAddBlock(block.type);
            }}
            className="p-2 text-left rounded border border-neutral-700 hover:border-neutral-600 hover:bg-neutral-800/50 transition-colors"
            title={block.description}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">{block.icon}</span>
              <div>
                <div className="text-xs font-medium text-neutral-200">{block.name}</div>
                <div className="text-xs text-neutral-500 line-clamp-1">{block.description}</div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// Alignment guides component that shows visual snap lines
function AlignmentGuides({
  items,
  selectedIds,
  cellSize,
  designSize,
}: {
  items: Item[];
  selectedIds: Set<string>;
  cellSize: number;
  designSize: { width: number; height: number };
}) {
  const selectedItems = items.filter(item => selectedIds.has(item.id));
  const otherItems = items.filter(item => !selectedIds.has(item.id));

  if (selectedItems.length === 0) return null;

  const guides: Array<{ type: 'vertical' | 'horizontal'; position: number; color: string }> = [];

  // Add guides for other items that align with selected items
  selectedItems.forEach(selectedItem => {
    const selectedLeft = (selectedItem.x || 0) * cellSize;
    const selectedRight = ((selectedItem.x || 0) + (selectedItem.w || 1)) * cellSize;
    const selectedTop = (selectedItem.y || 0) * cellSize;
    const selectedBottom = ((selectedItem.y || 0) + (selectedItem.h || 1)) * cellSize;
    const selectedCenterX = selectedLeft + ((selectedItem.w || 1) * cellSize) / 2;
    const selectedCenterY = selectedTop + ((selectedItem.h || 1) * cellSize) / 2;

    otherItems.forEach(otherItem => {
      const otherLeft = (otherItem.x || 0) * cellSize;
      const otherRight = ((otherItem.x || 0) + (otherItem.w || 1)) * cellSize;
      const otherTop = (otherItem.y || 0) * cellSize;
      const otherBottom = ((otherItem.y || 0) + (otherItem.h || 1)) * cellSize;
      const otherCenterX = otherLeft + ((otherItem.w || 1) * cellSize) / 2;
      const otherCenterY = otherTop + ((otherItem.h || 1) * cellSize) / 2;

      // Vertical alignment guides
      if (Math.abs(selectedLeft - otherLeft) < 2) {
        guides.push({ type: 'vertical', position: selectedLeft, color: 'rgba(59, 130, 246, 0.6)' });
      }
      if (Math.abs(selectedRight - otherRight) < 2) {
        guides.push({ type: 'vertical', position: selectedRight, color: 'rgba(59, 130, 246, 0.6)' });
      }
      if (Math.abs(selectedCenterX - otherCenterX) < 2) {
        guides.push({ type: 'vertical', position: selectedCenterX, color: 'rgba(59, 130, 246, 0.8)' });
      }

      // Horizontal alignment guides
      if (Math.abs(selectedTop - otherTop) < 2) {
        guides.push({ type: 'horizontal', position: selectedTop, color: 'rgba(59, 130, 246, 0.6)' });
      }
      if (Math.abs(selectedBottom - otherBottom) < 2) {
        guides.push({ type: 'horizontal', position: selectedBottom, color: 'rgba(59, 130, 246, 0.6)' });
      }
      if (Math.abs(selectedCenterY - otherCenterY) < 2) {
        guides.push({ type: 'horizontal', position: selectedCenterY, color: 'rgba(59, 130, 246, 0.8)' });
      }
    });
  });

  // Remove duplicate guides
  const uniqueGuides = guides.filter((guide, index, arr) =>
    arr.findIndex(g => g.type === guide.type && Math.abs(g.position - guide.position) < 1) === index
  );

  return (
    <div className="absolute inset-0 pointer-events-none">
      {uniqueGuides.map((guide, index) => (
        <div
          key={index}
          className="absolute"
          style={{
            ...(guide.type === 'vertical' ? {
              left: guide.position,
              top: 0,
              bottom: 0,
              width: 1,
              borderLeft: `1px dashed ${guide.color}`,
            } : {
              top: guide.position,
              left: 0,
              right: 0,
              height: 1,
              borderTop: `1px dashed ${guide.color}`,
            })
          }}
        />
      ))}
    </div>
  );
}

// Layout Management Dropdown Component
function LayoutManagementDropdown({
  layout,
  onRename,
  onDuplicate,
  onSaveAsTemplate,
  onCreateVersion,
}: {
  layout: LayoutAsset;
  onRename: (newTitle: string) => void;
  onDuplicate: () => Promise<void>;
  onSaveAsTemplate: () => Promise<void>;
  onCreateVersion: () => Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newTitle, setNewTitle] = useState(layout.title);

  const handleRename = () => {
    if (newTitle.trim() && newTitle !== layout.title) {
      onRename(newTitle.trim());
    }
    setIsRenaming(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-2 py-1 text-xs rounded border border-neutral-700 hover:bg-neutral-800 flex items-center gap-1"
        title="Layout Management"
      >
        ⚙️ Manage
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-neutral-800 border border-neutral-700 rounded-md shadow-lg z-50">
          <div className="p-2 space-y-1">
            {/* Rename */}
            <div>
              {isRenaming ? (
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRename();
                      if (e.key === 'Escape') setIsRenaming(false);
                    }}
                    onBlur={handleRename}
                    className="flex-1 px-2 py-1 text-xs bg-neutral-900 rounded border border-neutral-600 text-neutral-200"
                    autoFocus
                  />
                </div>
              ) : (
                <button
                  onClick={() => {
                    setIsRenaming(true);
                    setNewTitle(layout.title);
                  }}
                  className="w-full px-2 py-1 text-xs text-left rounded hover:bg-neutral-700 text-neutral-300"
                >
                  ✏️ Rename Layout
                </button>
              )}
            </div>

            {/* Duplicate */}
            <button
              onClick={async () => {
                setIsOpen(false);
                await onDuplicate();
              }}
              className="w-full px-2 py-1 text-xs text-left rounded hover:bg-neutral-700 text-neutral-300"
            >
              📋 Duplicate Layout
            </button>

            {/* Create Version */}
            <button
              onClick={async () => {
                setIsOpen(false);
                await onCreateVersion();
              }}
              className="w-full px-2 py-1 text-xs text-left rounded hover:bg-neutral-700 text-neutral-300"
            >
              🏷️ Create Version
            </button>

            {/* Save as Template */}
            <button
              onClick={async () => {
                setIsOpen(false);
                await onSaveAsTemplate();
              }}
              className="w-full px-2 py-1 text-xs text-left rounded hover:bg-neutral-700 text-neutral-300"
            >
              📚 Save as Template
            </button>

            <div className="border-t border-neutral-700 pt-1 mt-1">
              <div className="px-2 py-1 text-xs text-neutral-500">
                Layout Info
              </div>
              <div className="px-2 py-1 text-xs text-neutral-400">
                Created: {new Date(layout.created_at).toLocaleDateString()}<br/>
                Updated: {new Date(layout.updated_at).toLocaleDateString()}<br/>
                Type: {layout.layout_type}<br/>
                Items: {layout.layout_data.items.length}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Click outside to close */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}

// Layout Management API Functions
async function duplicateLayout(originalLayout: LayoutAsset): Promise<LayoutAsset> {
  const now = new Date().toISOString();
  const duplicateId = `layout_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  
  const duplicate: LayoutAsset = {
    ...originalLayout,
    id: duplicateId,
    filename: `${duplicateId}.json`,
    title: `${originalLayout.title} (Copy)`,
    description: originalLayout.description ? `Copy of: ${originalLayout.description}` : `Copy of ${originalLayout.title}`,
    created_at: now,
    updated_at: now,
    // Reset processing status for new asset
    processing_status: {
      created: 'completed',
      html_generated: 'pending'
    },
    timestamps: {
      created: now,
      updated: now,
      html_generated: undefined
    },
    // Generate new IDs for all layout items to avoid conflicts
    layout_data: {
      ...originalLayout.layout_data,
      items: originalLayout.layout_data.items.map(item => ({
        ...item,
        id: `${item.type}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
      }))
    }
  };

  const response = await fetch('/api/media-assets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(duplicate)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to duplicate layout: ${error}`);
  }

  const result = await response.json();
  return result.asset;
}

async function createVersion(originalLayout: LayoutAsset): Promise<LayoutAsset> {
  const now = new Date().toISOString();
  const versionNumber = await getNextVersionNumber(originalLayout.title);
  const versionId = `layout_${Date.now().toString(36)}_v${versionNumber}`;
  
  const version: LayoutAsset = {
    ...originalLayout,
    id: versionId,
    filename: `${versionId}.json`,
    title: `${originalLayout.title} v${versionNumber}`,
    description: `Version ${versionNumber} of ${originalLayout.title}`,
    created_at: now,
    updated_at: now,
    processing_status: {
      created: 'completed',
      html_generated: 'pending'
    },
    timestamps: {
      created: now,
      updated: now,
      html_generated: undefined
    }
  };

  const response = await fetch('/api/media-assets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(version)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create version: ${error}`);
  }

  const result = await response.json();
  return result.asset;
}

async function saveAsTemplate(originalLayout: LayoutAsset): Promise<LayoutAsset> {
  const now = new Date().toISOString();
  const templateId = `template_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  
  const template: LayoutAsset = {
    ...originalLayout,
    id: templateId,
    filename: `${templateId}.json`,
    title: `${originalLayout.title} Template`,
    description: `Template based on ${originalLayout.title}`,
    layout_type: 'imported', // Use existing valid layout_type
    created_at: now,
    updated_at: now,
    processing_status: {
      created: 'completed',
      html_generated: 'pending'
    },
    timestamps: {
      created: now,
      updated: now,
      html_generated: undefined
    },
    // Clean up template data - remove specific content references
    layout_data: {
      ...originalLayout.layout_data,
      items: originalLayout.layout_data.items.map(item => {
        const cleanItem = { ...item };
        // Reset IDs for template
        cleanItem.id = `${item.type}_template_${Math.random().toString(36).slice(2, 6)}`;
        // Remove specific media references for templates
        if (cleanItem.type === 'content_ref') {
          delete cleanItem.refId;
          delete cleanItem.mediaUrl;
          cleanItem.snippet = 'Template placeholder content';
        }
        // Keep inline content but make it generic
        if (cleanItem.type === 'inline_text' && cleanItem.inlineContent?.text) {
          cleanItem.inlineContent.text = cleanItem.inlineContent.text.includes('Template') 
            ? cleanItem.inlineContent.text 
            : 'Template text content';
        }
        if (cleanItem.type === 'inline_image' && cleanItem.inlineContent?.imageUrl) {
          cleanItem.inlineContent.imageUrl = ''; // Clear specific images in templates
        }
        return cleanItem;
      })
    }
  };

  const response = await fetch('/api/media-assets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(template)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to save template: ${error}`);
  }

  const result = await response.json();
  return result.asset;
}

async function getNextVersionNumber(baseTitle: string): Promise<number> {
  try {
    // Search for existing versions
    const response = await fetch('/api/media-assets?media_type=layout&limit=100');
    if (!response.ok) return 1;
    
    const data = await response.json();
    const layouts = data.assets || [];
    
    // Find existing versions of this layout
    const versionPattern = new RegExp(`^${baseTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} v(\\d+)$`);
    const versions = layouts
      .map((layout: any) => {
        const match = layout.title.match(versionPattern);
        return match ? parseInt(match[1]) : 0;
      })
      .filter((v: number) => v > 0);
    
    return versions.length > 0 ? Math.max(...versions) + 1 : 1;
  } catch {
    return 1;
  }
}

