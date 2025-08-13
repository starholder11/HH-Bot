'use client';

import React, { useState, useCallback, useMemo } from 'react';
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
    const wrapperClass = "w-full h-full overflow-hidden bg-neutral-800 flex items-center justify-center";
    
    if (item.type === 'inline_text') {
      return (
        <div className={`${wrapperClass} p-1`}>
          <div className="text-xs text-white text-center leading-tight truncate">
            {item.inlineContent?.text || 'Text block'}
          </div>
        </div>
      );
    }

    if (item.type === 'inline_image') {
      const imageUrl = item.inlineContent?.imageUrl || item.inlineContent?.imageData;
      return (
        <div className={wrapperClass}>
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
        <div className={wrapperClass}>
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
        className={`rounded-sm overflow-hidden border ${selectedId === item.id ? 'border-blue-500' : 'border-blue-400/40'}`}
        style={{ 
          margin: 0, 
          padding: 0,
          willChange: 'transform',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden'
        }}
        onMouseDown={() => setSelectedId(item.id)}
      >
        {renderItem(item)}
      </div>
    ));
  }, [edited.layout_data.items, renderItem, selectedId]);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      <div className="w-[min(1400px,100%)] h-[min(90vh,100%)] bg-neutral-950 rounded-xl border border-neutral-800 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="h-14 shrink-0 bg-neutral-900/80 backdrop-blur border-b border-neutral-800 flex items-center justify-between px-4">
          <div className="text-sm text-neutral-200 font-medium truncate pr-4">{edited.title}</div>
          <div className="flex items-center gap-2">
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
            <div className="mx-auto bg-neutral-900 border border-neutral-800 rounded-lg" style={{ width: design.width, height: design.height }}>
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
              >
                {children}
              </ResponsiveGridLayout>
            </div>
          </div>

          {/* Inspector */}
          <div className="w-[320px] shrink-0 border-l border-neutral-800 bg-neutral-900/70 backdrop-blur p-3 overflow-auto">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-neutral-300 font-medium">Inspector</div>
              {selectedId && (
                <div className="flex gap-1">
                  <button onClick={() => duplicateItem(selectedId)} className="px-2 py-1 text-xs rounded border border-neutral-700 hover:bg-neutral-800">Duplicate</button>
                  <button onClick={() => deleteItem(selectedId)} className="px-2 py-1 text-xs rounded border border-red-700 text-red-300 hover:bg-red-900/30">Delete</button>
                </div>
              )}
            </div>

            {!selectedId ? (
              <div className="text-xs text-neutral-400">Select an item to edit its properties.</div>
            ) : (
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
