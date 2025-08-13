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
  // Style panel is always visible in Inspector; no toggle to avoid discoverability issues

  const design = edited.layout_data.designSize || { width: 1200, height: 800 };
  const cellSize = edited.layout_data.cellSize || 20;

  // Convert our layout items to RGL format
  const layouts = useMemo(() => {
    const rglLayout: Layout[] = edited.layout_data.items.map(item => ({
      i: item.id,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
      minW: 1,
      minH: 1,
    }));

    return {
      lg: rglLayout,
      md: rglLayout,
      sm: rglLayout,
      xs: rglLayout,
      xxs: rglLayout,
    };
  }, [edited.layout_data.items]);

  // Handle layout changes - this is the key to smooth operation
  const handleLayoutChange = useCallback((currentLayout: Layout[], allLayouts: { [key: string]: Layout[] }) => {
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

  // Memoize children for performance - optimized containers
  const children = useMemo(() => {
    return edited.layout_data.items.map(item => (
      <div
        key={item.id}
        className={`rounded-sm overflow-hidden border ${selectedIds.has(item.id) ? 'border-blue-500' : 'border-blue-400/40'}`}
        style={{
          margin: 0,
          padding: 0,
          willChange: 'transform',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden'
        }}
        onMouseDown={(e) => {
          setSelectedId(item.id);
          setSelectedIds(prev => {
            const next = new Set(prev);
            if (e.metaKey || e.ctrlKey) {
              if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
              return next;
            }
            if (e.shiftKey) {
              next.add(item.id);
              return next;
            }
            return new Set([item.id]);
          });
        }}
      >
        {renderItem(item)}
      </div>
    ));
  }, [edited.layout_data.items, renderItem, selectedIds]);

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

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const anySelected = selectedIds.size > 0 || !!selectedId;
      if (!anySelected) return;
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
            <div className="mx-auto border border-neutral-800 rounded-lg" style={{ width: design.width, height: design.height, background: edited.layout_data.styling?.colors?.background || '#0a0a0a', color: edited.layout_data.styling?.colors?.text || '#ffffff', fontFamily: edited.layout_data.styling?.typography?.fontFamily || undefined }}>
              <ResponsiveGridLayout
                className="layout"
                layouts={layouts}
                breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
                cols={{ lg: Math.floor(design.width / cellSize), md: Math.floor(design.width / cellSize), sm: Math.floor(design.width / cellSize), xs: Math.floor(design.width / cellSize), xxs: Math.floor(design.width / cellSize) }}
                rowHeight={cellSize}
                width={design.width}
                onLayoutChange={handleLayoutChange}
                isDraggable={true}
                isResizable={true}
                draggableCancel={'input, textarea, select, button'}
                margin={[1, 1]}
                containerPadding={[2, 2]}
                useCSSTransforms={true}
                preventCollision={true}
                compactType={null}
                verticalCompact={false}
                isBounded={true}
                transformScale={1}
                onDragStart={(currentLayout, oldItem, newItem) => {
                  if (newItem?.i && !selectedIds.has(newItem.i)) {
                    setSelectedIds(new Set([newItem.i]));
                    setSelectedId(newItem.i);
                  }
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
