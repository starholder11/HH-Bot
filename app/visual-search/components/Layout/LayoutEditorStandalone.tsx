'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LayoutAsset } from '@/app/visual-search/types';
import type { UnifiedSearchResult } from '@/app/visual-search/types';
import { LAYOUT_THEMES } from './themes';
import { Responsive, WidthProvider } from 'react-grid-layout';
import * as searchService from '@/app/visual-search/services/searchService';
import { getResultMediaUrl } from '@/app/visual-search/utils/mediaUrl';

// Import CSS
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import VSResultCard from '../ResultCard/ResultCard';
import ResultsGrid from '@/app/visual-search/components/ResultsGrid';

const ResponsiveGridLayout = WidthProvider(Responsive);

type Item = LayoutAsset['layout_data']['items'][number];

interface StandaloneProps {
  layout: LayoutAsset;
  onBack?: () => void;
  onSaved?: (updated: LayoutAsset) => void;
}

export default function LayoutEditorStandalone({ layout, onBack, onSaved }: StandaloneProps) {
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

  // Keep layout in sync when prop changes
  useEffect(() => {
    setEdited(layout);
  }, [layout]);

  // Load preview URLs for content_ref items
  useEffect(() => {
    const loadPreviews = async () => {
      for (const item of edited.layout_data.items) {
        if (item.type === 'content_ref') {
          // First check if we already have a mediaUrl directly
          if ((item as any).mediaUrl && !previewUrls[item.id]) {
            setPreviewUrls(prev => ({ ...prev, [item.id]: (item as any).mediaUrl }));
            continue;
          }

          // Otherwise try to fetch by contentId or refId
          const assetId = (item as any).contentId || (item as any).refId;
          if (assetId && !previewUrls[item.id]) {
            setLoadingMap(prev => ({ ...prev, [item.id]: true }));
            try {
              const response = await fetch(`/api/media-assets/${assetId}`);
              if (response.ok) {
                const data = await response.json();
                const url = data.asset?.cloudflare_url || data.asset?.s3_url || data.asset?.url;
                if (url) {
                  setPreviewUrls(prev => ({ ...prev, [item.id]: url }));
                }
              }
            } catch (error) {
              console.error('Failed to load preview for', assetId, error);
            } finally {
              setLoadingMap(prev => ({ ...prev, [item.id]: false }));
            }
          }
        }
      }
    };
    loadPreviews();
  }, [edited.layout_data.items]);

  const cellSize = edited.layout_data.cellSize || 20;

  // Use actual layout design size, not hardcoded breakpoint sizes
  const design = edited.layout_data.designSize || { width: 1200, height: 800 };
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
      // Don't interfere with text editing
      if (isEditingText) return;
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
  }, [selectedIds, isEditingText]);

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
          x, y, w, h,
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

  function addBlock(blockType: any) {
    const id = typeof blockType === 'string' ? `${blockType}_${Date.now().toString(36)}` : `asset_${Date.now().toString(36)}`;
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
        const blockTypeStr = typeof blockType === 'string' ? blockType : 'content_ref';
        const { w: testW, h: testH } = getBlockSize(blockTypeStr, cellSize);

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

    let newItem: Item;

    if (typeof blockType === 'object') {
      // This is a content_ref from asset search
      const { w, h } = getBlockSize('content_ref', cellSize);
      newItem = {
        id,
        type: 'content_ref',
        contentId: blockType.contentId,
        contentType: blockType.contentType,
        mediaUrl: blockType.mediaUrl,
        snippet: blockType.snippet,
        x, y, w, h,
        nx: (x * cellSize) / design.width,
        ny: (y * cellSize) / design.height,
        nw: (w * cellSize) / design.width,
        nh: (h * cellSize) / design.height,
        z: 1,
      } as any;
    } else {
      // Regular block type
      const { w, h } = getBlockSize(blockType, cellSize);
      newItem = createBlockItem(blockType, id, x, y, w, h, cellSize, design);
    }

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

  const handleSave = async () => {
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
  };

  const headerHeightPx = 56; // h-14

  return (
    <div className="bg-neutral-950 text-neutral-100" style={{ height: `${design.height + headerHeightPx}px` }}>
      {/* Header */}
      <div className="sticky top-0 z-50 h-14 border-b border-neutral-800 bg-neutral-900/80 backdrop-blur flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          {onBack && (
            <button
              onClick={onBack}
              className="px-3 py-1.5 rounded border border-neutral-600 bg-neutral-700 hover:bg-neutral-600 text-white"
            >
              Back
            </button>
          )}
          <h2 className="text-lg font-medium text-white">{edited.title}</h2>
          <div className="text-xs text-neutral-500">• {edited.layout_data.items.length} items</div>
          {selectedId && (
            <div className="text-xs text-blue-400">
              • 1 selected
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Breakpoint toggles */}
          <div className="flex gap-1 border border-neutral-700 rounded overflow-hidden">
            {(['desktop', 'tablet', 'mobile'] as const).map(bp => (
              <button
                key={bp}
                onClick={() => setCurrentBreakpoint(bp)}
                className={`px-2 py-1 text-xs ${
                  currentBreakpoint === bp
                    ? 'bg-blue-600 text-white'
                    : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'
                }`}
              >
                {bp === 'desktop' ? '🖥️' : bp === 'tablet' ? '📱' : '📱'} {bp}
              </button>
            ))}
          </div>

          {/* Snap / Guides */}
          <label className="flex items-center gap-1 text-xs text-neutral-300">
            <input type="checkbox" checked={snapToGrid} onChange={e => setSnapToGrid(e.target.checked)} />
            Snap
          </label>
          <label className="flex items-center gap-1 text-xs text-neutral-300">
            <input type="checkbox" checked={showAlignmentGuides} onChange={e => setShowAlignmentGuides(e.target.checked)} />
            Guides
          </label>

          <button
            onClick={handleSave}
            disabled={working}
            className="px-3 py-1.5 rounded border border-green-600 bg-green-700 hover:bg-green-600 text-white disabled:opacity-50"
          >
            {working ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex" style={{ height: `${design.height}px` }}>
        {/* Canvas area */}
        <div className="flex-1 p-2">
          <div
            className="mx-auto border border-neutral-800 relative layout-canvas"
            style={{
              width: design.width,
              height: design.height,
              backgroundColor: edited.layout_data.styling?.colors?.background || '#171717',
              color: edited.layout_data.styling?.colors?.text || '#ffffff',
              fontFamily: edited.layout_data.styling?.typography?.fontFamily || 'inherit'
            }}
          >
            {/* Grid overlay */}
            {snapToGrid && (
              <div className="absolute inset-0 pointer-events-none" style={{
                backgroundColor: edited.layout_data.styling?.colors?.background || '#0b0b0b',
                backgroundImage: `linear-gradient(rgba(75, 85, 99, 0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(75, 85, 99, 0.3) 1px, transparent 1px)`,
                backgroundSize: `${cellSize}px ${cellSize}px`
              }} />
            )}

            {/* Alignment guides */}
            {showAlignmentGuides && (
              <AlignmentGuides
                items={visibleItems}
                selectedIds={selectedIds}
                cellSize={cellSize}
                designSize={design}
              />
            )}

            <ResponsiveGridLayout
              className="layout"
              layouts={{ lg: rglLayout, md: rglLayout, sm: rglLayout, xs: rglLayout, xxs: rglLayout }}
              breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
              cols={{ lg: cols, md: cols, sm: cols, xs: cols, xxs: cols }}
              rowHeight={rowHeight}
              width={design.width}
              style={{ height: design.height, backgroundColor: edited.layout_data.styling?.colors?.background || '#0b0b0b' }}
              autoSize={false}
              onLayoutChange={(currentLayout: any, allLayouts: any) => {
                // Handle layout changes
                const newItems = edited.layout_data.items.map(item => {
                  const layoutItem = currentLayout.find((l: any) => l.i === item.id);
                  if (layoutItem) {
                    return updateItemPositionWithBreakpoint(
                      item,
                      layoutItem.x,
                      layoutItem.y,
                      layoutItem.w,
                      layoutItem.h,
                      edited.layout_data,
                      currentBreakpoint
                    );
                  }
                  return item;
                });

                setEdited(prev => ({
                  ...prev,
                  layout_data: { ...prev.layout_data, items: newItems },
                  updated_at: new Date().toISOString(),
                } as LayoutAsset));
              }}
              isDraggable={true}
              isResizable={true}
              draggableCancel={'input, textarea, select, button'}
              margin={[1, 1]}
              containerPadding={[2, 2]}
              useCSSTransforms={true}
              preventCollision={snapToGrid}
              compactType={null}
              verticalCompact={false}
              isBounded={false}
              transformScale={1}
            >
                            {visibleItems.map((it) => (
                <div
                  key={it.id}
                  className={`rounded-sm overflow-hidden border ${selectedIds.has(it.id) ? 'border-blue-500' : 'border-blue-400/40'}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    const isMeta = e.metaKey || e.ctrlKey;
                    const isShift = e.shiftKey;

                    if (isMeta || isShift) {
                      // Multi-select mode
                      const next = new Set(selectedIds);
                      if (next.has(it.id)) {
                        next.delete(it.id);
                        if (selectedId === it.id) setSelectedId(next.size > 0 ? Array.from(next)[0] : null);
                      } else {
                        next.add(it.id);
                        setSelectedId(it.id);
                      }
                      setSelectedIds(next);
                    } else {
                      setSelectedId(it.id);
                      const next = new Set([it.id]);
                      setSelectedIds(next);
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
                  style={{
                    zIndex: it.z || 1,
                    userSelect: 'none',
                    willChange: 'transform',
                    margin: 0,
                    padding: 0,
                    backfaceVisibility: 'hidden',
                    WebkitBackfaceVisibility: 'hidden'
                  }}
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
            </ResponsiveGridLayout>
          </div>
        </div>

        {/* Right inspector */}
        <div className="w-64 border-l border-neutral-800 bg-neutral-900/60 backdrop-blur p-2 space-y-2 flex-shrink-0" style={{ height: `${design.height}px` }}>
          <div className="flex items-center justify-between">
            <div className="text-sm text-neutral-300 font-medium">Inspector</div>
            <div className="flex gap-1">
              <button onClick={(e)=>{e.preventDefault(); e.stopPropagation(); duplicateSelected();}} disabled={selectedIds.size === 0} className="px-2 py-1 text-xs rounded border border-neutral-700 hover:bg-neutral-800 disabled:opacity-50">Duplicate</button>
              <button onClick={(e)=>{e.preventDefault(); e.stopPropagation(); deleteSelected();}} disabled={selectedIds.size === 0} className="px-2 py-1 text-xs rounded border border-red-700 hover:bg-red-800 text-red-200 disabled:opacity-50">Delete</button>
            </div>
          </div>

          {/* Layout Dimensions */}
          <LayoutDimensions edited={edited} setEdited={setEdited} />

          {/* Block Library */}
          <BlockLibrary onAddBlock={addBlock} />

          {/* Theme Selector */}
          <ThemeSelector edited={edited} setEdited={setEdited} />

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

// Helper functions and components
function clamp(v: number) {
  if (Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function normalizeAllItems(layout: LayoutAsset): LayoutAsset {
  const cellSize = layout.layout_data.cellSize || 20;
  const design = layout.layout_data.designSize || { width: 1200, height: 800 };
  const gridCols = Math.floor(design.width / cellSize);
  const gridRows = Math.floor(design.height / cellSize);

  const items = layout.layout_data.items.map(it => {
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

  const gridCols = Math.floor(design.width / cellSize);
  const gridRows = Math.floor(design.height / cellSize);
  const maxX = Math.max(0, gridCols - w);
  const maxY = Math.max(0, gridRows - h);
  const clampedX = Math.max(0, Math.min(x, maxX));
  const clampedY = Math.max(0, Math.min(y, maxY));

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
    ...(breakpoint === 'desktop' ? {
      x: clampedX, y: clampedY, w, h,
      nx: clamp((clampedX * cellSize) / design.width),
      ny: clamp((clampedY * cellSize) / design.height),
      nw: clamp((w * cellSize) / design.width),
      nh: clamp((h * cellSize) / design.height),
    } : {})
  };
}

function getBlockSize(blockType: string, cellSize: number) {
  switch (blockType) {
    case 'hero': return { w: Math.max(8, Math.round(600 / cellSize)), h: Math.max(6, Math.round(400 / cellSize)) };
    case 'media_grid': return { w: Math.max(8, Math.round(600 / cellSize)), h: Math.max(6, Math.round(400 / cellSize)) };
    case 'cta': return { w: Math.max(6, Math.round(400 / cellSize)), h: Math.max(4, Math.round(200 / cellSize)) };
    case 'footer': return { w: Math.max(12, Math.round(800 / cellSize)), h: Math.max(3, Math.round(120 / cellSize)) };
    case 'text_section': return { w: Math.max(8, Math.round(500 / cellSize)), h: Math.max(6, Math.round(300 / cellSize)) };
    case 'spacer': return { w: Math.max(4, Math.round(200 / cellSize)), h: Math.max(2, Math.round(80 / cellSize)) };
    case 'inline_text': return { w: Math.max(6, Math.round(400 / cellSize)), h: Math.max(3, Math.round(120 / cellSize)) };
    case 'inline_image': return { w: Math.max(4, Math.round(300 / cellSize)), h: Math.max(4, Math.round(200 / cellSize)) };
    case 'content_ref': return { w: Math.max(4, Math.round(300 / cellSize)), h: Math.max(4, Math.round(200 / cellSize)) };
    default: return { w: 4, h: 3 };
  }
}

function createBlockItem(blockType: string, id: string, x: number, y: number, w: number, h: number, cellSize: number, design: any): Item {
  const baseItem = {
    id,
    x, y, w, h,
    nx: (x * cellSize) / design.width,
    ny: (y * cellSize) / design.height,
    nw: (w * cellSize) / design.width,
    nh: (h * cellSize) / design.height,
    z: 1,
  };

  if (blockType === 'inline_text') {
    return { ...baseItem, type: 'inline_text', inlineContent: { text: 'Edit me' } } as any;
  }
  if (blockType === 'inline_image') {
    return { ...baseItem, type: 'inline_image', inlineContent: { imageUrl: '', alt: 'Image' } } as any;
  }

  return {
    ...baseItem,
    type: 'block',
    blockType,
    config: getDefaultBlockConfig(blockType)
  } as any;
}

function getDefaultBlockConfig(blockType: string) {
  switch (blockType) {
    case 'hero': return { title: 'Hero Title', subtitle: 'Hero subtitle', ctaText: 'Get Started' };
    case 'media_grid': return { columns: 3, rows: 2, items: [] };
    case 'cta': return { title: 'Call to Action', description: 'Description', buttonText: 'Click Here' };
    case 'footer': return { copyright: '© 2024 Your Company', links: [] };
    case 'text_section': return { title: 'Section Title', content: 'Content goes here' };
    case 'spacer': return { height: 80, backgroundColor: 'transparent' };
    default: return {};
  }
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
      <div className="h-full w-full p-2 overflow-auto">
        <div className="text-xs opacity-60 mb-1">{label}</div>
        {opts?.isEditing ? (
          <textarea
            className="content-editable whitespace-pre-wrap leading-snug text-sm bg-neutral-800/50 rounded p-2 outline-none w-full h-full"
            value={opts?.draftText ?? it.inlineContent?.text ?? ''}
            onChange={(e) => opts?.setDraftText?.(e.target.value)}
            onBlur={() => opts?.onCommitText?.(opts?.draftText ?? '')}
            autoFocus
          />
        ) : (
          <div className="whitespace-pre-wrap leading-snug text-sm">
            {it.inlineContent.text}
          </div>
        )}
      </div>
    );
  }

  if (it.type === 'inline_image' && (it.inlineContent?.imageUrl || it.inlineContent?.imageData || url)) {
    const src = it.inlineContent?.imageUrl || it.inlineContent?.imageData || url || '';
    return (
      <div className="h-full w-full flex items-center justify-center bg-black/50">
        <img src={src} alt="inline" className="max-w-full max-h-full object-contain" draggable={false} />
      </div>
    );
  }

  // Handle content_ref items (from S3)
  if (it.type === 'content_ref') {
    const src = url || (it as any).mediaUrl || '';
    const contentType = (it as any).contentType || 'unknown';

    if (loading) {
      return (
        <div className="h-full w-full flex items-center justify-center text-xs text-neutral-400 bg-neutral-800/20">
          Loading {contentType}...
        </div>
      );
    }

    if (!src) {
      return (
        <div className="h-full w-full flex items-center justify-center text-xs text-neutral-400 bg-red-900/20">
          No source for {contentType}
        </div>
      );
    }

    if (contentType === 'image' || src.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) {
      return (
        <div className="h-full w-full flex items-center justify-center bg-black/50">
          <img src={src} alt={(it as any).snippet || 'Content'} className="max-w-full max-h-full object-contain" draggable={false} />
        </div>
      );
    }

    if (contentType === 'video' || src.match(/\.(mp4|webm|mov|avi)$/i)) {
      return (
        <div className="h-full w-full flex items-center justify-center bg-black/50">
          <video src={src} className="max-w-full max-h-full object-contain" controls muted />
        </div>
      );
    }

    return (
      <div className="h-full w-full flex items-center justify-center text-xs text-neutral-300 bg-green-900/20">
        <div className="text-center">
          <div className="text-neutral-200 font-medium">{(it as any).snippet || 'Asset'}</div>
          <div className="text-neutral-400">{contentType}</div>
        </div>
      </div>
    );
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

function BlockLibrary({ onAddBlock }: { onAddBlock: (blockType: any) => void }) {
  const [showAssetModal, setShowAssetModal] = useState(false);

  const blocks = [
    { type: 'inline_image', name: 'Image', icon: '🖼️', description: 'Image block' },
    { type: 'assets', name: 'Assets', icon: '📦', description: 'Search and add media assets', isSpecial: true },
    { type: 'hero', name: 'Hero', icon: '🏆', description: 'Hero section with title, subtitle, and CTA' },
    { type: 'media_grid', name: 'Media Grid', icon: '⊞', description: 'Grid of media items' },
    { type: 'text_section', name: 'Rich Text', icon: '📄', description: 'Rich text content section' },
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
              if (block.type === 'assets') {
                setShowAssetModal(true);
              } else {
                onAddBlock(block.type);
              }
            }}
            className={`p-2 text-left rounded border transition-colors ${
              block.isSpecial
                ? 'border-blue-600 hover:border-blue-500 hover:bg-blue-900/20 bg-blue-900/10'
                : 'border-neutral-700 hover:border-neutral-600 hover:bg-neutral-800/50'
            }`}
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

      {showAssetModal && (
        <AssetSearchModal
          onClose={() => setShowAssetModal(false)}
          onSelect={(asset) => {
            onAddBlock({
              type: 'content_ref',
              contentId: asset.id,
              contentType: asset.type || asset.content_type || 'image',
              mediaUrl: asset.cloudflare_url || asset.url || asset.s3_url,
              snippet: asset.title || asset.filename || asset.description || 'Asset'
            });
            setShowAssetModal(false);
          }}
        />
      )}
    </div>
  );
}

function LayoutDimensions({ edited, setEdited }: { edited: LayoutAsset; setEdited: React.Dispatch<React.SetStateAction<LayoutAsset>> }) {
  const currentDesign = edited.layout_data.designSize || { width: 1200, height: 800 };

  const updateDimensions = (width: number | string, height: number | string) => {
    const w = typeof width === 'string' ? (width === '' ? 400 : parseInt(width)) : width;
    const h = typeof height === 'string' ? (height === '' ? 300 : parseInt(height)) : height;

    setEdited(prev => ({
      ...prev,
      layout_data: {
        ...prev.layout_data,
        designSize: { width: w || 400, height: h || 300 }
      },
      updated_at: new Date().toISOString()
    } as LayoutAsset));
  };

  return (
    <div>
      <div className="text-xs text-neutral-400 mb-2">Layout Dimensions</div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-neutral-400">Width</label>
          <input
            type="number"
            value={currentDesign.width}
            onChange={(e) => updateDimensions(e.target.value, currentDesign.height)}
            className="w-full px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-sm text-neutral-200"
          />
        </div>
        <div>
          <label className="text-xs text-neutral-400">Height</label>
          <input
            type="number"
            value={currentDesign.height}
            onChange={(e) => updateDimensions(currentDesign.width, e.target.value)}
            className="w-full px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-sm text-neutral-200"
          />
        </div>
      </div>
    </div>
  );
}

function AssetSearchModal({ onClose, onSelect }: { onClose: () => void; onSelect: (asset: any) => void }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const controllerRef = React.useRef<AbortController | null>(null);
  const debounceRef = React.useRef<number | null>(null);
  const lastRequestIdRef = React.useRef<number>(0);

  const searchAssets = async (query: string) => {
    const q = query.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      // Abort any in-flight request and start a new one
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      // Track request ordering to prevent stale responses overwriting newer ones
      const requestId = (lastRequestIdRef.current += 1);
      setIsLoading(true);
      try {
        const json = await searchService.get(q, { type: 'media', limit: 50, signal: controller.signal });
        if (controller.signal.aborted || requestId !== lastRequestIdRef.current) return;
        const all = (json as any)?.results?.all || (json as any)?.results?.media || [];
        setSearchResults(Array.isArray(all) ? all : []);
      } catch (error: any) {
        // Ignore abort errors; they are expected during fast typing
        if (error?.name !== 'AbortError') {
          // eslint-disable-next-line no-console
          console.error('Asset search failed:', error);
          // Do NOT clear existing results on transient errors
        }
      } finally {
        if (requestId === lastRequestIdRef.current) setIsLoading(false);
      }
    }, 200);
  };

    // Ensure portal target exists
  useEffect(() => { 
    setMounted(true); 
  }, []);

  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-700 rounded-lg w-[66vw] h-[66vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-700">
          <h2 className="text-lg font-medium text-neutral-100">Search Assets</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-neutral-800 rounded text-neutral-400 hover:text-neutral-200"
          >
            ✕
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-neutral-700">
          <input
            type="text"
            placeholder="Search for images, videos, and other media..."
            value={searchQuery}
            onChange={(e) => {
              const v = e.target.value;
              setSearchQuery(v);
              void searchAssets(v);
            }}
            className="w-full px-3 py-2 bg-neutral-800 border border-neutral-600 rounded text-neutral-200 placeholder-neutral-400"
            autoFocus
          />
        </div>

        {/* Results */}
        <div className="flex-1 overflow-auto p-4">
          {isLoading && (
            <div className="text-center py-8 text-neutral-400">
              Searching assets...
            </div>
          )}

          {!isLoading && searchResults.length === 0 && (
            <div className="text-center py-8 text-neutral-400">
              {searchQuery ? 'No assets found matching your search.' : 'Start typing to search for assets.'}
            </div>
          )}

          {!isLoading && searchResults.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {searchResults.map((r: any) => (
                <div key={r.id}>
                  <VSResultCard r={r} onPin={() => {}} onOpen={() => onSelect(r)} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function ThemeSelector({ edited, setEdited }: { edited: LayoutAsset; setEdited: React.Dispatch<React.SetStateAction<LayoutAsset>> }) {
  const currentTheme = edited.layout_data.styling?.theme || 'minimal';

  return (
    <div>
      <div className="text-xs text-neutral-400 mb-2">Theme</div>
      <select
        value={currentTheme}
        onChange={(e) => {
          const theme = LAYOUT_THEMES.find(t => t.id === e.target.value) || LAYOUT_THEMES[0];
          setEdited(prev => ({
            ...prev,
            layout_data: {
              ...prev.layout_data,
              styling: {
                ...prev.layout_data.styling,
                theme: theme.id,
                colors: {
                  ...prev.layout_data.styling?.colors,
                  background: theme.colors.background,
                  text: theme.colors.text
                },
                typography: {
                  ...prev.layout_data.styling?.typography,
                  fontFamily: theme.typography.fontFamily
                }
              }
            },
            updated_at: new Date().toISOString()
          } as LayoutAsset));
        }}
        className="w-full px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-sm text-neutral-200"
      >
        {LAYOUT_THEMES.map(theme => (
          <option key={theme.id} value={theme.id}>{theme.name}</option>
        ))}
      </select>
      <div className="mt-2 space-y-2">
        <div>
          <label className="text-xs text-neutral-400">Background Color</label>
          <input
            type="color"
            value={edited.layout_data.styling?.colors?.background || '#171717'}
            onChange={(e) => setEdited(prev => ({
              ...prev,
              layout_data: {
                ...prev.layout_data,
                styling: {
                  ...prev.layout_data.styling,
                  colors: {
                    ...prev.layout_data.styling?.colors,
                    background: e.target.value
                  }
                }
              },
              updated_at: new Date().toISOString()
            } as LayoutAsset))}
            className="w-full h-8 rounded border border-neutral-700"
          />
        </div>
        <div>
          <label className="text-xs text-neutral-400">Text Color</label>
          <input
            type="color"
            value={edited.layout_data.styling?.colors?.text || '#ffffff'}
            onChange={(e) => setEdited(prev => ({
              ...prev,
              layout_data: {
                ...prev.layout_data,
                styling: {
                  ...prev.layout_data.styling,
                  colors: {
                    ...prev.layout_data.styling?.colors,
                    text: e.target.value
                  }
                }
              },
              updated_at: new Date().toISOString()
            } as LayoutAsset))}
            className="w-full h-8 rounded border border-neutral-700"
          />
        </div>
      </div>
    </div>
  );
}

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
      {/* Primary content editing first */}
      {item.type === 'inline_text' && (
        <div>
          <div className="text-xs text-neutral-400 mb-1">Text Content</div>
          <textarea
            value={item.inlineContent?.text || ''}
            onChange={(e) => onChange({
              inlineContent: { ...(item.inlineContent || {}), text: e.target.value }
            })}
            className="w-full h-20 px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-sm text-neutral-200"
            placeholder="Enter text content..."
          />
        </div>
      )}

      {item.type === 'inline_image' && (
        <div>
          <div className="text-xs text-neutral-400 mb-1">Image URL</div>
          <input
            type="text"
            value={localImageUrl}
            onChange={(e) => handleImageUrlChange(e.target.value)}
            placeholder="Enter image URL or upload..."
            className="w-full px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-sm text-neutral-200"
          />
          <input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              // Upload logic would go here
              // For now, just show the file name
              handleImageUrlChange(`uploaded/${file.name}`);
            }}
            className="w-full mt-2 text-xs text-neutral-400"
          />
        </div>
      )}

      {/* Position controls second */}
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
    </div>
  );
}

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

  return (
    <div className="absolute inset-0 pointer-events-none">
      {guides.map((guide, i) => (
        <div
          key={i}
          className="absolute border-dashed border-blue-400"
          style={{
            ...(guide.type === 'vertical'
              ? {
                  left: guide.position,
                  top: 0,
                  bottom: 0,
                  borderLeft: '1px dashed',
                  borderColor: guide.color,
                }
              : {
                  top: guide.position,
                  left: 0,
                  right: 0,
                  borderTop: '1px dashed',
                  borderColor: guide.color,
                }),
          }}
        />
      ))}
    </div>
  );
}
