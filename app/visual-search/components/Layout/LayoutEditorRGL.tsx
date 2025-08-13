'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { LAYOUT_THEMES } from './themes';
import { Responsive, WidthProvider, Layout } from 'react-grid-layout';
import type { LayoutAsset } from '@/app/visual-search/types';

// Import CSS
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const ResponsiveGridLayout = WidthProvider(Responsive);

type Item = LayoutAsset['layout_data']['items'][number];

interface Props {
  layout: LayoutAsset;
  onClose: () => void;
  onSaved?: (updated: LayoutAsset) => void;
}

export default function LayoutEditorRGL({ layout, onClose, onSaved }: Props) {
  const [edited, setEdited] = useState<LayoutAsset>(layout);
  const [working, setWorking] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isShiftHeld, setIsShiftHeld] = useState<boolean>(false);
  const [dragStartPos, setDragStartPos] = useState<{x: number, y: number} | null>(null); // reserved
  const [isDragging, setIsDragging] = useState<boolean>(false); // reserved
  const [isGroupDrag, setIsGroupDrag] = useState<boolean>(false);

  // Dedicated layout state - single source of truth during drag operations
  const [layoutState, setLayoutState] = useState<Layout[]>(() => {
    return edited.layout_data.items.map(item => ({
      i: item.id,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
      minW: 1,
      minH: 1,
    }));
  });



  // Prevent layout prop changes from wiping selection state
  React.useEffect(() => {
    // Only update edited state if the layout ID actually changed
    if (layout.id !== edited.id) {
      setEdited(layout);
      // Clear selection when switching to different layout
      setSelectedIds(new Set());
      setSelectedId(null);
      // Update layout state to match new layout
      setLayoutState(layout.layout_data.items.map(item => ({
        i: item.id,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
        minW: 1,
        minH: 1,
      })));
      console.log('[LayoutEditorRGL] Layout changed, clearing selection and updating layoutState');
    }
  }, [layout.id, edited.id]);

  // Sync layoutState when edited.layout_data.items changes (but not during drag)
  React.useEffect(() => {
    if (!isGroupDrag && !isDragging) {
      setLayoutState(edited.layout_data.items.map(item => ({
        i: item.id,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
        minW: 1,
        minH: 1,
      })));
    }
  }, [edited.layout_data.items, isGroupDrag, isDragging]);

  // Bulk-drag tracking: store origin positions for selected items and the dragged item's origin
  const bulkDragOriginPositionsRef = React.useRef<Record<string, { x: number; y: number }>>({});
  const draggedItemOriginRef = React.useRef<{ x: number; y: number } | null>(null);
  const activeGroupIdsRef = React.useRef<Set<string> | null>(null);
  // Keep latest selection in refs so drag handlers don't read stale closures
  const selectedIdsRef = React.useRef<Set<string>>(selectedIds);
  const selectedIdRef = React.useRef<string | null>(selectedId);

  // Update refs immediately when state changes
  selectedIdsRef.current = selectedIds;
  selectedIdRef.current = selectedId;

  // Style panel is always visible in Inspector; no toggle to avoid discoverability issues

  const design = edited.layout_data.designSize || { width: 1200, height: 800 };
  const cellSize = edited.layout_data.cellSize || 20;

  // Convert layoutState to responsive format for RGL
  const layouts = useMemo(() => {
    return {
      lg: layoutState,
      md: layoutState,
      sm: layoutState,
      xs: layoutState,
      xxs: layoutState,
    };
  }, [layoutState]);

  // Handle layout changes - update layoutState first, then sync to edited
  const handleLayoutChange = useCallback((currentLayout: Layout[], allLayouts: { [key: string]: Layout[] }) => {
    // Update layoutState immediately
    setLayoutState(currentLayout);

    // Sync back to edited state
    const newItems = edited.layout_data.items.map(item => {
      const layoutItem = currentLayout.find(l => l.i === item.id);
      if (layoutItem) {
        // Convert grid coordinates to normalized
        const nx = layoutItem.x * cellSize / design.width;
        const ny = layoutItem.y * cellSize / design.height;
        const nw = layoutItem.w * cellSize / design.width;
        const nh = layoutItem.h * cellSize / design.height;

        return {
          ...item,
          x: layoutItem.x,
          y: layoutItem.y,
          w: layoutItem.w,
          h: layoutItem.h,
          nx: Math.max(0, Math.min(1, nx)),
          ny: Math.max(0, Math.min(1, ny)),
          nw: Math.max(0, Math.min(1, nw)),
          nh: Math.max(0, Math.min(1, nh)),
        };
      }
      return item;
    });

    setEdited(prev => ({
      ...prev,
      layout_data: {
        ...prev.layout_data,
        items: newItems,
      },
      updated_at: new Date().toISOString(),
    }));
  }, [edited.layout_data.items, cellSize, design.width, design.height]);

  // Save function
  const handleSave = useCallback(async () => {
    try {
      setWorking(true);

      const response = await fetch(`/api/media-assets/${edited.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(edited),
      });

      if (!response.ok) throw new Error('Save failed');

      const result = await response.json();
      onSaved?.(result.asset || edited);

    } catch (error) {
      alert(`Save failed: ${(error as Error).message}`);
    } finally {
      setWorking(false);
    }
  }, [edited, onSaved]);

  // Render item content - optimized for smooth dragging
  const renderItem = useCallback((item: Item) => {
    // Common wrapper styles for all content types - no padding, full fill
    // NOTE: Do NOT set background or text colors here so items inherit layout styling
    const wrapperClass = "w-full h-full overflow-hidden flex items-center justify-center";

    if (item.type === 'inline_text') {
      return (
        <div className={`${wrapperClass} p-1`}>
          <div className="text-xs text-center leading-tight truncate">
            {item.inlineContent?.text || 'Text block'}
          </div>
        </div>
      );
    }

    if (item.type === 'inline_image') {
      const imageUrl = item.inlineContent?.imageUrl || item.inlineContent?.imageData;
      return (
        <div className={`${wrapperClass}`}>
          {imageUrl ? (
            <img
              src={imageUrl}
              alt="Content"
              className="w-full h-full object-cover"
              draggable={false}
              style={{ userSelect: 'none', pointerEvents: 'none' }}
            />
          ) : (
            <span className="text-neutral-400 text-xs">Image</span>
          )}
        </div>
      );
    }

    if (item.type === 'content_ref' && item.mediaUrl) {
      return (
        <div className={`${wrapperClass}`}>
          <img
            src={item.mediaUrl}
            alt={item.snippet || 'Content'}
            className="w-full h-full object-cover"
            draggable={false}
            style={{ userSelect: 'none', pointerEvents: 'none' }}
          />
        </div>
      );
    }

    return (
      <div className={`${wrapperClass} text-xs text-neutral-400`}>
        {item.type}
      </div>
    );
  }, []);

      

  // Memoize children for performance - use mousedown for immediate selection
  const children = useMemo(() => {
    return edited.layout_data.items.map(item => (
      <div
        key={item.id}
        data-item-id={item.id}
        className={`rounded-sm overflow-hidden border selection-zone ${selectedIds.has(item.id) ? 'border-blue-500' : 'border-blue-400/40'}`}
        style={{
          margin: 0,
          padding: 0,
          willChange: 'transform',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          cursor: isGroupDrag ? 'grabbing' : 'pointer'
        }}
        onClick={(e) => {
          const isToggle = e.metaKey || e.ctrlKey;
          const isRange = e.shiftKey && !!selectedId;

          if (isToggle) {
            setSelectedIds(prev => {
              const next = new Set(prev);
              if (next.has(item.id)) {
                next.delete(item.id);
                if (selectedId === item.id) {
                  const remaining = Array.from(next);
                  setSelectedId(remaining.length > 0 ? remaining[remaining.length - 1] : null);
                }
              } else {
                next.add(item.id);
                setSelectedId(item.id);
              }
              console.log('[LayoutEditorRGL] CLICK TOGGLE', Array.from(next));
              return next;
            });
          } else if (isRange) {
            if (selectedId === item.id) return;
            const items = edited.layout_data.items;
            const lastIndex = items.findIndex(it => it.id === selectedId);
            const currentIndex = items.findIndex(it => it.id === item.id);
            if (lastIndex !== -1 && currentIndex !== -1) {
              const start = Math.min(lastIndex, currentIndex);
              const end = Math.max(lastIndex, currentIndex);
              const rangeIds = items.slice(start, end + 1).map(it => it.id);
              setSelectedIds(prev => {
                const next = new Set(prev);
                rangeIds.forEach(id => next.add(id));
                console.log('[LayoutEditorRGL] CLICK RANGE (' + (next.size) + ')', Array.from(next));
                return next;
              });
              setSelectedId(item.id);
            }
          } else {
            setSelectedId(item.id);
            const next = new Set([item.id]);
            setSelectedIds(next);
            console.log('[LayoutEditorRGL] CLICK SINGLE', Array.from(next));
          }
        }}
      >
        {renderItem(item)}
        {selectedIds.has(item.id) && selectedIds.size > 1 && (
          <div className="absolute top-1 right-1 bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center pointer-events-none">
            {selectedIds.size}
          </div>
        )}
      </div>
    ));
  }, [edited.layout_data.items, renderItem, selectedIds, selectedId, isGroupDrag]);

  // Helpers to update item fields safely
  const updateItem = useCallback((id: string, updates: Partial<Item>) => {
    setEdited(prev => ({
      ...prev,
      layout_data: {
        ...prev.layout_data,
        items: prev.layout_data.items.map(it => it.id === id ? ({ ...it, ...updates }) as Item : it)
      },
      updated_at: new Date().toISOString(),
    }));
  }, []);

  const deleteItem = useCallback((id: string) => {
    setEdited(prev => ({
      ...prev,
      layout_data: {
        ...prev.layout_data,
        items: prev.layout_data.items.filter(it => it.id !== id)
      },
      updated_at: new Date().toISOString(),
    }));
    setSelectedId(prev => (prev === id ? null : prev));
  }, []);

  const duplicateItem = useCallback((id: string) => {
    setEdited(prev => {
      const it = prev.layout_data.items.find(x => x.id === id);
      if (!it) return prev;
      const copy: Item = { ...it, id: `${id}_copy_${Date.now().toString(36)}`, x: (it.x || 0) + 1, y: (it.y || 0) + 1 } as Item;
      return {
        ...prev,
        layout_data: { ...prev.layout_data, items: [...prev.layout_data.items, copy] },
        updated_at: new Date().toISOString(),
      } as LayoutAsset;
    });
  }, []);

  // Keyboard shortcuts: arrows to nudge, Del to delete, Cmd/Ctrl+D duplicate
  const nudgeSelected = useCallback((dx: number, dy: number) => {
    if (!selectedId) return;
    setEdited(prev => {
      const it = prev.layout_data.items.find(x => x.id === selectedId);
      if (!it) return prev;
      const x = Math.max(0, (it.x || 0) + dx);
      const y = Math.max(0, (it.y || 0) + dy);
      const cell = prev.layout_data.cellSize || 20;
      const design = prev.layout_data.designSize || { width: 1200, height: 800 };
      const nx = (x * cell) / design.width;
      const ny = (y * cell) / design.height;
      return {
        ...prev,
        layout_data: {
          ...prev.layout_data,
          items: prev.layout_data.items.map(item => item.id === selectedId ? ({ ...item, x, y, nx, ny } as Item) : item)
        },
        updated_at: new Date().toISOString(),
      } as LayoutAsset;
    });
  }, [selectedId]);

  // Track Shift key to prevent onDragStart from interfering with range selection
  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Shift') {
        console.log('[LayoutEditorRGL] Shift DOWN - protecting range selection');
        setIsShiftHeld(true);
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === 'Shift') {
        console.log('[LayoutEditorRGL] Shift UP - allowing drag selection');
        setIsShiftHeld(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);



  // Multi-select functions
  const nudgeSelection = useCallback((dx: number, dy: number) => {
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
        return { ...it, x, y, nx: Math.max(0, Math.min(1, pxX / designSize.width)), ny: Math.max(0, Math.min(1, pxY / designSize.height)), nw: Math.max(0, Math.min(1, pxW / designSize.width)), nh: Math.max(0, Math.min(1, pxH / designSize.height)) } as Item;
      });
      return { ...prev, layout_data: { ...prev.layout_data, items }, updated_at: new Date().toISOString() } as LayoutAsset;
    });
  }, [selectedIds]);

  const duplicateSelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    setEdited(prev => {
      const copies: Item[] = [];
      const nowSuffix = Date.now().toString(36);
      Array.from(selectedIds).forEach((id) => {
        const it = prev.layout_data.items.find(i => i.id === id);
        if (!it) return;
        copies.push({ ...it, id: `${it.id}_copy_${nowSuffix}_${Math.random().toString(36).slice(2,5)}`, x: (it.x || 0) + 1, y: (it.y || 0) + 1 } as Item);
      });
      const next = { ...prev, layout_data: { ...prev.layout_data, items: [...prev.layout_data.items, ...copies] }, updated_at: new Date().toISOString() } as LayoutAsset;
      if (copies.length > 0) {
        setSelectedIds(new Set(copies.map(c => c.id)));
        setSelectedId(copies[copies.length - 1].id);
      }
      return next;
    });
  }, [selectedIds]);

  const deleteSelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    setEdited(prev => {
      const filtered = prev.layout_data.items.filter(i => !selectedIds.has(i.id));
      return { ...prev, layout_data: { ...prev.layout_data, items: filtered }, updated_at: new Date().toISOString() } as LayoutAsset;
    });
    setSelectedId(null);
    setSelectedIds(new Set());
  }, [selectedIds]);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const anySelected = selectedIds.size > 0 || !!selectedId;
      if (!anySelected) return;
      console.log('[LayoutEditorRGL] key', { key: e.key, size: selectedIds.size, ids: Array.from(selectedIds) });
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); return; }
      const step = 1;
      if (e.key === 'ArrowLeft') { e.preventDefault(); nudgeSelection(-step, 0); }
      if (e.key === 'ArrowRight') { e.preventDefault(); nudgeSelection(step, 0); }
      if (e.key === 'ArrowUp') { e.preventDefault(); nudgeSelection(0, -step); }
      if (e.key === 'ArrowDown') { e.preventDefault(); nudgeSelection(0, step); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelected(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, selectedIds, nudgeSelection, duplicateSelected, deleteSelected]);

  // --- Block creation helpers ---
  function gridSize() {
    const cols = Math.floor((edited.layout_data.designSize?.width || 1200) / (edited.layout_data.cellSize || 20));
    const rows = Math.floor((edited.layout_data.designSize?.height || 800) / (edited.layout_data.cellSize || 20));
    return { cols, rows };
  }

  function collides(a: {x:number;y:number;w:number;h:number}, b: {x:number;y:number;w:number;h:number}) {
    return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
  }

  function findSpot(w: number, h: number) {
    const items = edited.layout_data.items;
    const { cols, rows } = gridSize();
    for (let y = 0; y <= rows - h; y++) {
      for (let x = 0; x <= cols - w; x++) {
        const rect = { x, y, w, h };
        const hit = items.some(it => collides(rect, { x: it.x || 0, y: it.y || 0, w: it.w || 1, h: it.h || 1 }));
        if (!hit) return { x, y };
      }
    }
    return { x: 0, y: 0 };
  }

  function withNormalized(base: Partial<Item> & { id: string; x: number; y: number; w: number; h: number; type: Item['type'] }): Item {
    const design = edited.layout_data.designSize || { width: 1200, height: 800 };
    const cell = edited.layout_data.cellSize || 20;
    const pxX = base.x * cell, pxY = base.y * cell, pxW = base.w * cell, pxH = base.h * cell;
    const nx = Math.max(0, Math.min(1, pxX / design.width));
    const ny = Math.max(0, Math.min(1, pxY / design.height));
    const nw = Math.max(0, Math.min(1, pxW / design.width));
    const nh = Math.max(0, Math.min(1, pxH / design.height));
    return { z: 1, contentType: (base as any).contentType, mediaUrl: (base as any).mediaUrl, snippet: (base as any).snippet, refId: (base as any).refId, inlineContent: (base as any).inlineContent, ...base, nx, ny, nw, nh } as Item;
  }

  const addTextBlock = useCallback(() => {
    const id = `inline_${Date.now().toString(36)}`;
    const w = 12, h = 6;
    const { x, y } = findSpot(w, h);
    const item = withNormalized({ id, type: 'inline_text', x, y, w, h, inlineContent: { text: 'New text' } as any });
    setEdited(prev => ({
      ...prev,
      layout_data: { ...prev.layout_data, items: [...prev.layout_data.items, item] },
      updated_at: new Date().toISOString(),
    }));
    setSelectedId(id);
    setSelectedIds(new Set([id]));
  }, [edited.layout_data.items]);

  const addImageBlock = useCallback(() => {
    const id = `inline_${Date.now().toString(36)}`;
    const w = 10, h = 8;
    const { x, y } = findSpot(w, h);
    const item = withNormalized({ id, type: 'inline_image', x, y, w, h, inlineContent: { imageUrl: '' } as any });
    setEdited(prev => ({
      ...prev,
      layout_data: { ...prev.layout_data, items: [...prev.layout_data.items, item] },
      updated_at: new Date().toISOString(),
    }));
    setSelectedId(id);
    setSelectedIds(new Set([id]));
  }, [edited.layout_data.items]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      <div className="w-[min(1400px,100%)] h-[min(90vh,100%)] bg-neutral-950 rounded-xl border border-neutral-800 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="h-14 shrink-0 bg-neutral-900/80 backdrop-blur border-b border-neutral-800 flex items-center justify-between px-4">
          <div className="flex items-center gap-2 pr-4">
            <div className="text-sm text-neutral-200 font-medium truncate">{edited.title}</div>
            <div className="text-xs text-neutral-500">• {edited.layout_data.items.length} items</div>
            {selectedIds.size > 0 && (
              <div className="text-xs text-blue-400">
                • {selectedIds.size} selected
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={addTextBlock}
              className="px-2.5 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs border border-neutral-700"
            >
              + Text
            </button>
            <button
              onClick={addImageBlock}
              className="px-2.5 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs border border-neutral-700"
            >
              + Image
            </button>
            <button
              onClick={handleSave}
              disabled={working}
              className="px-3 py-1.5 rounded bg-green-600 hover:bg-green-500 text-white text-sm disabled:opacity-50"
            >
              {working ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-sm border border-neutral-700"
            >
              Close
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 flex">
          {/* Canvas */}
          <div className="flex-1 p-4 overflow-auto">
                                    <div
              className="mx-auto border border-neutral-800 rounded-lg"
              style={{ width: design.width, height: design.height, background: edited.layout_data.styling?.colors?.background || '#0a0a0a', color: edited.layout_data.styling?.colors?.text || '#ffffff', fontFamily: edited.layout_data.styling?.typography?.fontFamily || undefined }}

            >
              <ResponsiveGridLayout
                className="layout"
                layouts={layouts}
                breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
                cols={{ lg: Math.floor(design.width / cellSize), md: Math.floor(design.width / cellSize), sm: Math.floor(design.width / cellSize), xs: Math.floor(design.width / cellSize), xxs: Math.floor(design.width / cellSize) }}
                rowHeight={cellSize}
                width={design.width}
                onLayoutChange={handleLayoutChange}
                isDraggable={true}
                isResizable={!isGroupDrag}
                draggableCancel={'input, textarea, select, button'}
                margin={[1, 1]}
                containerPadding={[2, 2]}
                useCSSTransforms={true}
                preventCollision={isGroupDrag}
                compactType={null}
                verticalCompact={false}
                isBounded={true}
                transformScale={1}
                                onDragStart={(currentLayout, oldItem, newItem) => {
                  const sel = selectedIdsRef.current;
                  console.log('[LayoutEditorRGL] onDragStart', {
                    draggedItem: newItem?.i,
                    selectedIds: Array.from(sel),
                    selectedIdsSize: sel.size,
                    isInSelection: newItem?.i ? sel.has(newItem.i) : false,
                    shiftHeld: isShiftHeld
                  });

                  // Build stable group snapshot that always includes dragged item
                  if (newItem?.i) {
                    draggedItemOriginRef.current = { x: newItem.x, y: newItem.y };

                    // Determine group: if there's a selection, use it + dragged item
                    // Even if dragged item wasn't originally selected
                    let group: Set<string>;
                    if (sel.size > 0) {
                      group = new Set(sel);
                      group.add(newItem.i);
                    } else {
                      group = new Set([newItem.i]);
                    }
                    
                    // Determine if this is a group drag (more than 1 item total)
                    const isGroup = group.size > 1;
                    
                    if (isGroup) {
                      activeGroupIdsRef.current = group;
                      console.log('[LayoutEditorRGL] Group drag starting with items:', Array.from(group));
                    } else {
                      activeGroupIdsRef.current = new Set([newItem.i]);
                      console.log('[LayoutEditorRGL] Single item drag starting:', newItem.i);
                    }
                    
                    setIsGroupDrag(isGroup);

                    // Capture origin positions for all items in the group
                    const positions: Record<string, { x: number; y: number }> = {};
                    currentLayout.forEach(li => {
                      if (activeGroupIdsRef.current?.has(li.i)) {
                        positions[li.i] = { x: li.x, y: li.y };
                      }
                    });
                    bulkDragOriginPositionsRef.current = positions;
                    
                    console.log('[LayoutEditorRGL] Captured origin positions for:', Object.keys(positions));
                  }
                }}
                onDrag={(currentLayout, oldItem, newItem) => {
                  // Live-update other selected items during drag
                  if (!newItem?.i) return;
                  const draggedOrigin = draggedItemOriginRef.current;
                  if (!draggedOrigin) return;
                  const deltaX = (newItem.x || 0) - draggedOrigin.x;
                  const deltaY = (newItem.y || 0) - draggedOrigin.y;

                  const group = activeGroupIdsRef.current;
                  
                  console.log('[LayoutEditorRGL] onDrag', {
                    draggedItem: newItem.i,
                    groupSize: group?.size || 0,
                    groupItems: group ? Array.from(group) : [],
                    delta: { deltaX, deltaY },
                    draggedPosition: { x: newItem.x, y: newItem.y },
                    originPositions: Object.keys(bulkDragOriginPositionsRef.current)
                  });

                  // For group drags, always update positions when we have a group and movement
                  if (group && group.size > 1 && (deltaX !== 0 || deltaY !== 0)) {
                    const originPositions = bulkDragOriginPositionsRef.current;
                    console.log('[LayoutEditorRGL] Applying group movement: delta', { deltaX, deltaY });
                    
                    // Create complete updated layout with group movement
                    const updatedLayout = currentLayout.map(layoutItem => {
                      if (group.has(layoutItem.i)) {
                        const origin = originPositions[layoutItem.i];
                        if (origin) {
                          const newPos = {
                            x: Math.max(0, origin.x + deltaX),
                            y: Math.max(0, origin.y + deltaY)
                          };
                          return {
                            ...layoutItem,
                            x: newPos.x,
                            y: newPos.y
                          };
                        }
                      }
                      return layoutItem;
                    });
                    
                    // Force immediate layout state update
                    setLayoutState(updatedLayout);
                  }
                }}
                onDragStop={(currentLayout, oldItem, newItem) => {
                  const group = activeGroupIdsRef.current;
                  const sel = selectedIdsRef.current;
                  console.log('[LayoutEditorRGL] onDragStop', {
                    draggedItem: newItem?.i,
                    oldPos: { x: oldItem?.x, y: oldItem?.y },
                    newPos: { x: newItem?.x, y: newItem?.y },
                    groupSize: group?.size || 0,
                    groupItems: group ? Array.from(group) : [],
                    selectedIds: Array.from(sel),
                    wasGroupDrag: isGroupDrag
                  });

                  // Calculate the drag delta
                  const deltaX = (newItem?.x || 0) - (oldItem?.x || 0);
                  const deltaY = (newItem?.y || 0) - (oldItem?.y || 0);

                  console.log('[LayoutEditorRGL] drag delta:', { deltaX, deltaY });

                  // Final group drag synchronization
                  if (group && group.size > 1 && newItem?.i && group.has(newItem.i) && (deltaX !== 0 || deltaY !== 0)) {
                    console.log('[LayoutEditorRGL] Finalizing group drag for', group.size, 'items');

                    const finalLayout = currentLayout.map(layoutItem => {
                      // Apply final positions based on origin + total delta
                      if (group.has(layoutItem.i) && layoutItem.i !== newItem.i) {
                        const origin = bulkDragOriginPositionsRef.current[layoutItem.i];
                        if (origin) {
                          const finalPos = {
                            x: Math.max(0, origin.x + deltaX),
                            y: Math.max(0, origin.y + deltaY)
                          };
                          console.log('[LayoutEditorRGL] Final position for', layoutItem.i, ':', finalPos);
                          return {
                            ...layoutItem,
                            ...finalPos
                          };
                        }
                      }
                      return layoutItem;
                    });

                    handleLayoutChange(finalLayout, { lg: finalLayout });
                    console.log('[LayoutEditorRGL] Applied final group drag positions');
                  } else {
                    // Normal single item drag
                    handleLayoutChange(currentLayout, { lg: currentLayout });
                    console.log('[LayoutEditorRGL] Applied single item drag');
                  }

                  // Reset bulk drag state
                  draggedItemOriginRef.current = null;
                  bulkDragOriginPositionsRef.current = {};
                  setIsGroupDrag(false);
                  activeGroupIdsRef.current = null;
                  console.log('[LayoutEditorRGL] Reset drag state');
                }}
              >
                {children}
              </ResponsiveGridLayout>
            </div>
          </div>

          {/* Inspector */}
          <div className="w-[320px] shrink-0 border-l border-neutral-800 bg-neutral-900/70 backdrop-blur p-3 overflow-auto">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-neutral-300 font-medium">Inspector</div>
              {(selectedIds.size > 0) && (
                <div className="flex gap-1">
                  <button onClick={() => duplicateSelected()} className="px-2 py-1 text-xs rounded border border-neutral-700 hover:bg-neutral-800">Duplicate</button>
                  <button onClick={() => deleteSelected()} className="px-2 py-1 text-xs rounded border border-red-700 text-red-300 hover:bg-red-900/30">Delete</button>
                </div>
              )}
            </div>

            {/* Layout style controls - always shown */}
            {true && (
            <div className="mb-3 space-y-2 rounded border border-neutral-800 p-2 bg-neutral-900/60">
                <div className="text-xs text-neutral-400">Layout Style</div>
              <label className="block text-xs text-neutral-400">
                Theme
                <select
                  className="mt-1 w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-sm"
                  value={(() => {
                    const current = edited.layout_data.styling;
                    const match = LAYOUT_THEMES.find(t => t.colors.background === current?.colors?.background && t.colors.text === current?.colors?.text && t.typography.fontFamily === current?.typography?.fontFamily);
                    return match?.id || '';
                  })()}
                  onChange={e => {
                    const theme = LAYOUT_THEMES.find(t => t.id === e.target.value);
                    if (!theme) return;
                    setEdited(prev => ({
                      ...prev,
                      layout_data: { ...prev.layout_data, styling: { colors: theme.colors, typography: theme.typography } }
                    }));
                  }}
                >
                  <option value="">Custom…</option>
                  {LAYOUT_THEMES.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </label>
                <label className="flex items-center justify-between gap-2 text-xs text-neutral-400">
                  Background
                  <input type="color" className="w-8 h-6 bg-transparent border border-neutral-700 rounded"
                    value={edited.layout_data.styling?.colors?.background || '#0a0a0a'}
                    onChange={e => setEdited(prev => ({
                      ...prev,
                      layout_data: {
                        ...prev.layout_data,
                        styling: {
                          ...(prev.layout_data.styling || {}),
                          colors: { ...(prev.layout_data.styling?.colors || {}), background: e.target.value }
                        }
                      }
                    }))}
                  />
                </label>
                <label className="flex items-center justify-between gap-2 text-xs text-neutral-400">
                  Text
                  <input type="color" className="w-8 h-6 bg-transparent border border-neutral-700 rounded"
                    value={edited.layout_data.styling?.colors?.text || '#ffffff'}
                    onChange={e => setEdited(prev => ({
                      ...prev,
                      layout_data: {
                        ...prev.layout_data,
                        styling: {
                          ...(prev.layout_data.styling || {}),
                          colors: { ...(prev.layout_data.styling?.colors || {}), text: e.target.value }
                        }
                      }
                    }))}
                  />
                </label>
                <label className="block text-xs text-neutral-400">
                  Font Family
                  <input className="mt-1 w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-sm"
                    placeholder="Inter, sans-serif"
                    value={edited.layout_data.styling?.typography?.fontFamily || ''}
                    onChange={e => setEdited(prev => ({
                      ...prev,
                      layout_data: {
                        ...prev.layout_data,
                        styling: {
                          ...(prev.layout_data.styling || {}),
                          typography: { ...(prev.layout_data.styling?.typography || {}), fontFamily: e.target.value }
                        }
                      }
                    }))}
                  />
                </label>
              </div>
            )}

            {selectedIds.size === 0 ? (
              <div className="text-xs text-neutral-400">Select an item to edit its properties.</div>
            ) : (selectedIds.size === 1 && selectedId) ? (
              (() => {
                const it = edited.layout_data.items.find(x => x.id === selectedId)!;
                return (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-xs text-neutral-400">X
                        <input type="number" className="mt-1 w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-sm"
                          value={it.x || 0}
                          onChange={e => updateItem(it.id, { x: Number(e.target.value) })}
                        />
                      </label>
                      <label className="text-xs text-neutral-400">Y
                        <input type="number" className="mt-1 w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-sm"
                          value={it.y || 0}
                          onChange={e => updateItem(it.id, { y: Number(e.target.value) })}
                        />
                      </label>
                      <label className="text-xs text-neutral-400">W
                        <input type="number" className="mt-1 w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-sm"
                          value={it.w || 1}
                          onChange={e => updateItem(it.id, { w: Math.max(1, Number(e.target.value)) })}
                        />
                      </label>
                      <label className="text-xs text-neutral-400">H
                        <input type="number" className="mt-1 w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-sm"
                          value={it.h || 1}
                          onChange={e => updateItem(it.id, { h: Math.max(1, Number(e.target.value)) })}
                        />
                      </label>
                    </div>

                    <div>
                      <div className="text-xs text-neutral-400 mb-1">Z-Index</div>
                      <input type="number" className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-sm"
                        value={it.z || 1}
                        onChange={e => updateItem(it.id, { z: Number(e.target.value) })}
                      />
                    </div>

                    {it.type === 'inline_text' && (
                      <div>
                        <div className="text-xs text-neutral-400 mb-1">Text</div>
                        <textarea className="w-full h-28 bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-sm"
                          value={it.inlineContent?.text || ''}
                          onChange={e => updateItem(it.id, { inlineContent: { ...(it.inlineContent || {}), text: e.target.value } as any })}
                        />
                      </div>
                    )}

                    {it.type === 'inline_image' && (
                      <div>
                        <div className="text-xs text-neutral-400 mb-1">Image URL</div>
                        <input className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-sm"
                          value={it.inlineContent?.imageUrl || ''}
                          onChange={e => updateItem(it.id, { inlineContent: { ...(it.inlineContent || {}), imageUrl: e.target.value } as any })}
                        />
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              <div className="text-xs text-neutral-400">{selectedIds.size} items selected</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
