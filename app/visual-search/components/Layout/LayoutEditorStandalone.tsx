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
import dynamic from 'next/dynamic';
const ReactQuill = dynamic(() => import('react-quill'), { ssr: false });
const TransformPanel = dynamic(() => import('./TransformPanel'), { ssr: false });
import 'react-quill/dist/quill.snow.css';
import 'katex/dist/katex.min.css';
import hljs from 'highlight.js';
import yaml from 'js-yaml';
import 'highlight.js/styles/atom-one-dark.css';
import { TransformComponents } from './transforms';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ImageIcon, BoxesIcon, TrophyIcon, GridIcon, FileTextIcon, TargetIcon, DownloadIcon, SquareIcon } from 'lucide-react';

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
  const isDraggingRef = React.useRef(false);
  const lastPointerClientYRef = React.useRef(0);
  const scrollRAFRef = React.useRef<number | null>(null);
  const [showRteModal, setShowRteModal] = useState(false);
  const [rteTargetId, setRteTargetId] = useState<string | null>(null);
  const [rteHtml, setRteHtml] = useState<string>('');
  const [rteMode, setRteMode] = useState<'html' | 'markdown'>('html');
  const [rteMarkdown, setRteMarkdown] = useState<string>('');
  // RTE metadata (for Markdown mode)
  const [rteTitle, setRteTitle] = useState<string>('Document Title');
  const [rteSlug, setRteSlug] = useState<string>('');
  const [rteCategories, setRteCategories] = useState<string>('');
  const [showTransformPanel, setShowTransformPanel] = useState(false);
  const [transformTargetId, setTransformTargetId] = useState<string | null>(null);
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [imageModalTargetId, setImageModalTargetId] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitle, setEditingTitle] = useState(edited.title);

    const openRteForId = React.useCallback(async (id: string, forceMarkdown?: boolean) => {
    setSelectedId(id);
    setSelectedIds(new Set([id]));
    const item = edited.layout_data.items.find(i => i.id === id) as any;

    // Check if this is a text content_ref (text asset)
    const isTextAsset = item?.type === 'content_ref' && item?.contentType === 'text';
    const isAsset = forceMarkdown || isTextAsset;

    console.log('[RTE DEBUG] Opening RTE for item:', { id, type: item?.type, contentType: item?.contentType, isTextAsset, isAsset, item });
    setRteMode(isAsset ? 'markdown' : 'html');

    if (isAsset) {
      // For text assets, extract slug from refId/contentId and load from GitHub
      let slug = '';
      const refId = item?.refId || item?.contentId || '';
      if (refId.includes('text_timeline/')) {
        slug = refId.replace('text_timeline/', '');
      } else if (refId.startsWith('text_')) {
        slug = refId.replace('text_', '');
      } else {
        slug = refId;
      }

      console.log('[RTE DEBUG] Loading text asset with slug:', slug);

      if (slug) {
        try {
          const res = await fetch(`/api/internal/get-content/${encodeURIComponent(slug)}`);
          if (res.ok) {
            const data = await res.json();
            if (data.success) {
              const parsed = yaml.load(data.metadata) as any;
              setRteTitle(parsed.title || 'Document Title');
              setRteSlug(parsed.slug || slug);
              setRteCategories(Array.isArray(parsed.categories) ? parsed.categories.join(', ') : '');
              setRteMarkdown(data.content || '');
              console.log('[RTE DEBUG] Loaded text asset:', { title: parsed.title, slug: parsed.slug, contentLength: data.content?.length });
            }
          } else {
            console.log('[RTE DEBUG] Text asset not found, using defaults');
            setRteTitle('Document Title');
            setRteSlug(slug || 'new-document');
            setRteCategories('');
            setRteMarkdown('# Document Title\n\nStart writing...');
          }
        } catch (e) {
          console.warn('[RTE DEBUG] Failed to load text asset:', e);
          setRteTitle('Document Title');
          setRteSlug(slug || 'new-document');
          setRteCategories('');
          setRteMarkdown('# Document Title\n\nStart writing...');
        }
      } else {
        // New text asset
        setRteTitle('Document Title');
        setRteSlug('new-document');
        setRteCategories('');
        setRteMarkdown('# Document Title\n\nStart writing...');
      }
    } else {
      const existing = item ? getRichTextHtmlForItem(item) : '';
      setRteHtml(existing);
      console.log('[RTE DEBUG] Using HTML mode with content:', existing);
    }
    setRteTargetId(id);
    setShowRteModal(true);
  }, [edited.layout_data.items]);

  // Expose openRteForId globally for the DOC button
  React.useEffect(() => {
    (window as any).__openRteForId = openRteForId;
    return () => {
      delete (window as any).__openRteForId;
    };
  }, [openRteForId]);

  const openTransformForId = React.useCallback((id: string) => {
    setSelectedId(id);
    setSelectedIds(new Set([id]));
    setTransformTargetId(id);
    setShowTransformPanel(true);
  }, []);

  const handleTransformChange = React.useCallback((transform: any) => {
    if (!transformTargetId) return;

    setEdited(prev => ({
      ...prev,
      layout_data: {
        ...prev.layout_data,
        items: prev.layout_data.items.map(item =>
          item.id === transformTargetId
            ? { ...item, transform }
            : item
        )
      },
      updated_at: new Date().toISOString()
    } as LayoutAsset));
  }, [transformTargetId]);

  // Keep layout in sync when prop changes
  useEffect(() => {
    setEdited(layout);
  }, [layout]);

  // Load preview URLs for content_ref items
  useEffect(() => {
    const loadPreviews = async () => {
      for (const item of edited.layout_data.items) {
        if (item.type === 'content_ref') {
          const contentType = (item as any).contentType || 'unknown';
          const assetId = (item as any).contentId || (item as any).refId;

          // Handle text content using the same approach as visual-search
          if (contentType === 'text' && assetId && !(item as any).fullTextContent) {
            setLoadingMap(prev => ({ ...prev, [item.id]: true }));
            try {
              // Extract slug from text asset ID (same logic as visual-search DetailsOverlay)
              let slug = assetId;
              if (assetId.startsWith('text_')) {
                const after = assetId.split('text_')[1] ?? '';
                const beforeHash = after.split('#')[0] ?? '';
                const subParts = beforeHash.split('/');
                slug = subParts.length > 1 ? subParts[subParts.length - 1] : beforeHash || assetId;
              }

              console.log('[TEXT CONTENT] Fetching full text for slug:', slug);
              const response = await fetch(`/api/internal/get-content/${encodeURIComponent(slug)}`);
              if (response.ok) {
                const data = await response.json();
                if (data.success && data.content) {
                  // Attach full text content to the item
                  setEdited(prev => ({
                    ...prev,
                    layout_data: {
                      ...prev.layout_data,
                      items: prev.layout_data.items.map(i => i.id === item.id ?
                        ({ ...i, fullTextContent: data.content, textMetadata: data.metadata }) as any : i)
                    }
                  } as LayoutAsset));
                  console.log('[TEXT CONTENT] Loaded full text content for:', slug);
                }
              }
            } catch (error) {
              console.error('Failed to load text content for', assetId, error);
            } finally {
              setLoadingMap(prev => ({ ...prev, [item.id]: false }));
            }
            continue;
          }

          // Handle media assets (non-text)
          if (contentType !== 'text') {
            // First check if we already have a mediaUrl directly
            if ((item as any).mediaUrl && !previewUrls[item.id]) {
              setPreviewUrls(prev => ({ ...prev, [item.id]: (item as any).mediaUrl }));
              continue;
            }

            // Otherwise try to fetch by contentId or refId
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
      }
    };
    loadPreviews();
  }, [edited.layout_data.items]);

  const cellSize = edited.layout_data.cellSize || 20;

  // Use breakpoint-specific design sizes
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

  // Auto-scroll window while dragging near viewport edges
  const startAutoScrollLoop = React.useCallback(() => {
    if (typeof window === 'undefined') return;
    if (scrollRAFRef.current != null) return;
    const step = () => {
      if (!isDraggingRef.current) {
        if (scrollRAFRef.current != null) {
          cancelAnimationFrame(scrollRAFRef.current);
          scrollRAFRef.current = null;
        }
        return;
      }
      const pointerY = lastPointerClientYRef.current;
      const vh = window.innerHeight || 0;
      const threshold = Math.max(40, Math.floor(vh * 0.08));
      const maxStep = 24; // px per frame
      const nearTop = pointerY < threshold;
      const nearBottom = pointerY > vh - threshold;
      if (nearTop) {
        window.scrollBy(0, -maxStep);
      } else if (nearBottom) {
        window.scrollBy(0, maxStep);
      }
      scrollRAFRef.current = requestAnimationFrame(step);
    };
    scrollRAFRef.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => {
    return () => {
      if (scrollRAFRef.current != null) {
        cancelAnimationFrame(scrollRAFRef.current);
        scrollRAFRef.current = null;
      }
    };
  }, []);

  // Keyboard shortcuts: delete, duplicate, nudge for multi-select, escape to clear
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Don't interfere with text editing or modals
      if (isEditingText || showRteModal || showTransformPanel) return;

      const isMeta = e.metaKey || e.ctrlKey;

      // Escape to clear selection
      if (e.key === 'Escape') {
        e.preventDefault();
        setSelectedId(null);
        setSelectedIds(new Set());
        return;
      }

      if (selectedIds.size === 0) return;

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
    // Use current breakpoint design size for block placement
    const design = breakpointSizes[currentBreakpoint];

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
        let blockTypeStr = typeof blockType === 'string' ? blockType : 'content_ref';
        if (typeof blockType === 'object' && blockType.contentType === 'text') {
          blockTypeStr = 'content_ref_text';
        }
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
      // Use specific sizing for text content
      const sizeKey = blockType.contentType === 'text' ? 'content_ref_text' : 'content_ref';
      const { w, h } = getBlockSize(sizeKey, cellSize);
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

  const handleTitleSave = async () => {
    if (editingTitle.trim() && editingTitle !== edited.title) {
      const updatedLayout = {
        ...edited,
        title: editingTitle.trim(),
        updated_at: new Date().toISOString()
      };

      setEdited(updatedLayout);

      // Auto-save the title change
      try {
        const response = await fetch(`/api/media-assets/${edited.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedLayout),
        });

        if (!response.ok) throw new Error('Title save failed');

        onSaved?.(updatedLayout);
      } catch (error) {
        console.error('Failed to save title:', error);
        // Revert on error
        setEditingTitle(edited.title);
      }
    }
    setIsEditingTitle(false);
  };

  const headerHeightPx = 56; // h-14

  return (
    <div className="bg-black text-white" style={{ height: `${design.height + headerHeightPx}px` }}>
      {/* Header */}
      <div className="sticky top-0 z-50 h-14 border-b border-neutral-700 bg-black flex items-center justify-between px-4">
        <div className="flex items-center gap-4 ml-32">
          {isEditingTitle ? (
            <input
              value={editingTitle}
              onChange={(e) => setEditingTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleTitleSave();
                }
                if (e.key === 'Escape') {
                  setEditingTitle(edited.title);
                  setIsEditingTitle(false);
                }
              }}
              autoFocus
              className="text-lg font-medium bg-transparent border border-neutral-600 rounded px-2 py-1 text-white min-w-[200px]"
              placeholder="Layout title"
            />
          ) : (
            <h2
              className="text-lg font-medium text-white cursor-pointer hover:text-neutral-300 transition-colors"
              onDoubleClick={() => {
                setIsEditingTitle(true);
                setEditingTitle(edited.title);
              }}
              title="Double-click to edit title"
            >
              {edited.title}
            </h2>
          )}
          <div className="text-xs text-white">• {edited.layout_data.items.length} items</div>
          <div className="text-xs text-white">• {design.width}×{design.height}px</div>
          {onBack && (
            <Button variant="outline" size="sm" onClick={() => {
              // Set the layouts tab to be active when returning to visual-search
              try {
                localStorage.setItem('visual-search-active-tab', 'layouts');
              } catch (e) {
                console.warn('Failed to set localStorage:', e);
              }

              // Navigate to visual-search
              window.location.href = '/visual-search';
            }} className="bg-neutral-800 border-neutral-700 text-white hover:bg-neutral-700">
              Layouts
            </Button>
          )}
          {selectedId && (
            <div className="text-xs text-white">
              • 1 selected
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={working} size="sm" className="bg-neutral-700 text-white hover:bg-neutral-600">
            {working ? 'Saving…' : 'Save'}
          </Button>

          <Button
            onClick={async () => {
              try {
                await handleSave();
              } finally {
                window.open(`/L7/${edited.id}`, '_blank');
              }
            }}
            title="Save and open live published layout"
            size="sm"
            className="bg-blue-700 text-white hover:bg-blue-600"
          >
            🚀 Publish
          </Button>

          <Button onClick={(e)=>{e.preventDefault(); e.stopPropagation(); duplicateSelected();}} size="sm" className="bg-neutral-800 border-neutral-700 text-white hover:bg-neutral-700">Duplicate</Button>
          <Button onClick={(e)=>{e.preventDefault(); e.stopPropagation(); deleteSelected();}} size="sm" className="bg-red-900 border-red-800 text-white hover:bg-red-800">Delete</Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {/* Canvas area */}
        <div className="flex-1 p-2">
          <div
            className="mx-auto border border-neutral-800 relative layout-canvas rounded-md bg-neutral-950"
            style={{
              width: design.width,
              height: design.height,
              backgroundColor: edited.layout_data.styling?.colors?.background || '#171717',
              color: edited.layout_data.styling?.colors?.text || '#ffffff',
              fontFamily: edited.layout_data.styling?.typography?.fontFamily || 'inherit'
            }}
            onMouseDown={(e) => {
              if (e.button !== 0) return;
              // Clicking canvas background clears selection
              if (e.target === e.currentTarget) {
                console.log('Canvas clicked - clearing selection');
                setSelectedId(null);
                setSelectedIds(new Set());
              }
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
                      cellSize,
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
              draggableCancel={'input, textarea, select, button, .content-editable, .rsw-editor, .rsw-editor *, .rsw-ce, .ql-container, .ql-editor, .quill-container'}
              margin={[1, 1]}
              containerPadding={[2, 2]}
              useCSSTransforms={true}
              preventCollision={snapToGrid}
              compactType={null}
              isBounded={false}
              transformScale={1}
              onDragStart={(layout: any, oldItem: any, newItem: any, placeholder: any, e: any) => {
                isDraggingRef.current = true;
                lastPointerClientYRef.current = (e?.clientY as number) || 0;
                startAutoScrollLoop();
              }}
              onDrag={(layout: any, oldItem: any, newItem: any, placeholder: any, e: any) => {
                lastPointerClientYRef.current = (e?.clientY as number) || lastPointerClientYRef.current;
              }}
              onDragStop={() => {
                isDraggingRef.current = false;
              }}
            >
                            {visibleItems.map((it) => (
                <div
                  key={it.id}
                  data-item-id={it.id}
                  className={`relative rounded-sm overflow-hidden border ${selectedIds.has(it.id) ? 'border-blue-500' : 'border-blue-400/40'}`}
                  onMouseDownCapture={(e) => {
                    if (e.button !== 0) return;
                    const isMeta = e.metaKey || e.ctrlKey;
                    const isShift = e.shiftKey;

                    if (isMeta || isShift) {
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
                  onDoubleClickCapture={() => {
                    if (it.type === 'inline_text') {
                      setSelectedId(it.id);
                      setSelectedIds(new Set([it.id]));
                      setDraftText(it.inlineContent?.text || '');
                      setIsEditingText(true);
                    } else if ((['text_section','hero','cta','footer'] as const).includes((it as any).blockType)) {
                      openRteForId(it.id);
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
                  {/* Drag handle bar with actions */}
                  <div className="drag-handle h-6 px-2 flex items-center justify-between text-xs bg-neutral-800/70 border-b border-neutral-800 select-none">
                    <span className="text-neutral-300 truncate">{it.type === 'content_ref' ? it.contentType : it.type}</span>
                    <div className="flex items-center gap-1">
                      {(['text_section','hero','cta','footer'] as const).includes((it as any).blockType) && (
                        <button
                          className="px-1.5 py-0.5 text-[10px] rounded bg-neutral-900/80 border border-neutral-700 text-neutral-200 hover:bg-neutral-800"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); openRteForId(it.id); }}
                          title="Edit rich text"
                        >
                          ✎ Edit
                        </button>
                      )}
                      {it.type === 'content_ref' && it.contentType === 'text' && (
                        <button
                          className="px-1.5 py-0.5 text-[10px] rounded bg-neutral-900/80 border border-neutral-700 text-neutral-200 hover:bg-neutral-800"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); openRteForId(it.id); }}
                          title="Edit text asset"
                        >
                          ✎ Edit
                        </button>
                      )}
                      <button
                        className="px-1.5 py-0.5 text-[10px] rounded bg-neutral-900/80 border border-neutral-700 text-neutral-200 hover:bg-neutral-800"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); openTransformForId(it.id); }}
                        title="Add animation/effect"
                      >
                        ✨ FX
                      </button>
                      <span className="text-neutral-500">drag</span>
                    </div>
                  </div>

                  <div className="block-content h-full w-full">
                    {renderItem(it, previewUrls[it.id], loadingMap[it.id], {
                      isSelected: selectedIds.has(it.id),
                      isEditing: isEditingText && selectedId === it.id,
                      draftText,
                      setDraftText,
                      onCommitText: (txt: string) => { updateInlineText(it.id, txt, setEdited); setIsEditingText(false); },
                      onCancelEdit: () => setIsEditingText(false),
                    })}
                  </div>
                </div>
              ))}
            </ResponsiveGridLayout>
          </div>
        </div>

        {/* Right inspector */}
        <div className="w-64 bg-black border border-neutral-700 p-3 space-y-3 flex-shrink-0 overflow-y-auto text-white rounded-md !bg-black" style={{backgroundColor: '#000000'}}>
          {/* Layout Dimensions */}
          <LayoutDimensions edited={edited} setEdited={setEdited} />

          {/* Block Library */}
          <div>
            <div className="text-xs text-white mb-2">Block Library</div>
            <div className="grid grid-cols-2 gap-2">
              <Button className="h-auto justify-start bg-neutral-800 border-neutral-700 text-white hover:bg-neutral-700" onClick={(e)=>{e.preventDefault(); e.stopPropagation(); addBlock('inline_image');}}>
                <ImageIcon className="w-4 h-4" />
                <span className="text-xs ml-2">Image</span>
              </Button>
              <Button className="h-auto justify-start bg-neutral-700 border-neutral-600 text-white hover:bg-neutral-600" onClick={(e)=>{e.preventDefault(); e.stopPropagation(); setShowAssetModal(true);}}>
                <BoxesIcon className="w-4 h-4" />
                <span className="text-xs ml-2">Assets</span>
              </Button>
              <Button className="h-auto justify-start bg-blue-700 border-blue-600 text-white hover:bg-blue-600" onClick={(e)=>{
                e.preventDefault(); e.stopPropagation();
                console.log('[DOC] Creating text asset block...');

                                // Create the block as a content_ref to a text asset (not inline)
                const id = `text_section_${Date.now().toString(36)}`;
                const cellSize = edited.layout_data.cellSize || 20;
                const design = breakpointSizes[currentBreakpoint];
                const { w, h } = getBlockSize('text_section', cellSize);

                const newItem = {
                  id,
                  type: 'content_ref',
                  contentType: 'text',
                  refId: '', // Will be set after save
                  snippet: 'New Document',
                  x: 0, y: 0, w, h,
                  nx: 0, ny: 0,
                  nw: (w * cellSize) / design.width,
                  nh: (h * cellSize) / design.height,
                  z: 1,
                } as any;

                setEdited(prev => ({
                  ...prev,
                  layout_data: {
                    ...prev.layout_data,
                    items: [...prev.layout_data.items, newItem]
                  },
                  updated_at: new Date().toISOString()
                } as LayoutAsset));

                // Select and open markdown editor immediately
                setSelectedId(id);
                setSelectedIds(new Set([id]));
                setRteMode('markdown');
                setRteMarkdown('# Document Title\n\nStart writing...');
                setRteTitle('Document Title');
                setRteSlug('document-title');
                setRteCategories('');
                setRteTargetId(id);
                setShowRteModal(true);
                console.log('[DOC] Opened markdown editor for:', id);
              }}>
                <FileTextIcon className="w-4 h-4" />
                <span className="text-xs ml-2">DOC</span>
              </Button>
              <Button className="h-auto justify-start bg-neutral-800 border-neutral-700 text-white hover:bg-neutral-700" onClick={(e)=>{e.preventDefault(); e.stopPropagation(); addBlock('media_grid');}}>
                <GridIcon className="w-4 h-4" />
                <span className="text-xs ml-2">Media Grid</span>
              </Button>
              <Button className="h-auto justify-start bg-neutral-800 border-neutral-700 text-white hover:bg-neutral-700" onClick={(e)=>{e.preventDefault(); e.stopPropagation(); addBlock('text_section');}}>
                <FileTextIcon className="w-4 h-4" />
                <span className="text-xs ml-2">Rich Text</span>
              </Button>
              <Button className="h-auto justify-start bg-neutral-800 border-neutral-700 text-white hover:bg-neutral-700" onClick={(e)=>{e.preventDefault(); e.stopPropagation(); addBlock('cta');}}>
                <TargetIcon className="w-4 h-4" />
                <span className="text-xs ml-2">CTA</span>
              </Button>
              <Button className="h-auto justify-start bg-neutral-800 border-neutral-700 text-white hover:bg-neutral-700" onClick={(e)=>{e.preventDefault(); e.stopPropagation(); addBlock('footer');}}>
                <DownloadIcon className="w-4 h-4" />
                <span className="text-xs ml-2">Footer</span>
              </Button>
              <Button className="h-auto justify-start bg-neutral-800 border-neutral-700 text-white hover:bg-neutral-700" onClick={(e)=>{e.preventDefault(); e.stopPropagation(); addBlock('spacer');}}>
                <SquareIcon className="w-4 h-4" />
                <span className="text-xs ml-2">Spacer</span>
              </Button>
            </div>
          </div>

          {/* Theme Selector */}
          <ThemeSelector edited={edited} setEdited={setEdited} />

          {/* Breakpoint Controls */}
          <div>
            <div className="text-xs text-white mb-2">Breakpoints</div>
            <div className="flex gap-1 border border-neutral-700 rounded overflow-hidden">
              {(['desktop', 'tablet', 'mobile'] as const).map(bp => (
                <Button
                  key={bp}
                  onClick={() => setCurrentBreakpoint(bp)}
                  size="sm"
                  className={currentBreakpoint === bp ? 'bg-neutral-600 text-white flex-1' : 'bg-neutral-800 text-white hover:bg-neutral-700 flex-1'}
                >
                  {bp === 'desktop' ? '🖥️' : bp === 'tablet' ? '📱' : '📱'} {bp}
                </Button>
              ))}
            </div>
          </div>

          {/* Editor Settings */}
          <div>
            <div className="text-xs text-white mb-2">Editor Settings</div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs text-white">
                <input type="checkbox" checked={snapToGrid} onChange={e => setSnapToGrid(e.target.checked)} className="rounded" />
                Snap to Grid
              </label>
              <label className="flex items-center gap-2 text-xs text-white">
                <input type="checkbox" checked={showAlignmentGuides} onChange={e => setShowAlignmentGuides(e.target.checked)} className="rounded" />
                Show Alignment Guides
              </label>

            </div>
          </div>

          {selectedIds.size === 0 ? (
            <div className="text-xs text-white">Select an item to edit.</div>
          ) : selectedIds.size === 1 && selectedId ? (
            <ItemInspector
              item={edited.layout_data.items.find(i => i.id === selectedId)!}
              cellSize={cellSize}
              onChange={(up) => setEdited(prev => ({ ...prev, layout_data: { ...prev.layout_data, items: prev.layout_data.items.map(i => i.id === selectedId ? { ...i, ...up } as Item : i) } }))}
              onZ={(dir) => setEdited(prev => ({ ...prev, layout_data: { ...prev.layout_data, items: bringZ(prev.layout_data.items, selectedId, dir) } }))}
              onEditImage={(itemId) => {
                setImageModalTargetId(itemId);
                setShowImageModal(true);
              }}
            />
          ) : (
            <div className="text-xs text-white">{selectedIds.size} items selected</div>
          )}
        </div>
      </div>
      {showRteModal && rteTargetId && (
        <RteModal
          initialHtml={rteHtml}
          initialMarkdown={rteMarkdown}
          mode={rteMode}
          initialTitle={rteTitle}
          initialSlug={rteSlug}
          initialCategories={rteCategories}
          rteTargetId={rteTargetId}
          setEdited={setEdited}
          onClose={() => {
            setShowRteModal(false);
            setRteTargetId(null);
          }}
          onSave={(content) => {
            setEdited(prev => ({
              ...prev,
              layout_data: {
                ...prev.layout_data,
                items: prev.layout_data.items.map(i => {
                  if (i.id !== rteTargetId) return i;
                  if (rteMode === 'markdown') {
                    const cfg = { ...((i as any).config || {}), content_markdown: content };
                    delete (cfg as any).content;
                    return { ...(i as any), config: cfg } as Item;
                  } else {
                    return applyRichTextHtmlToItem(i as any, content) as Item;
                  }
                })
              },
              updated_at: new Date().toISOString(),
            } as LayoutAsset));
            setShowRteModal(false);
            setRteTargetId(null);
          }}
        />
      )}

      {showTransformPanel && transformTargetId && (
        <TransformPanel
          transform={edited.layout_data.items.find(i => i.id === transformTargetId)?.transform}
          onTransformChange={handleTransformChange}
          onClose={() => {
            setShowTransformPanel(false);
            setTransformTargetId(null);
          }}
        />
      )}

      {showAssetModal && (
        <AssetSearchModal
          onClose={() => setShowAssetModal(false)}
          onSelect={(asset) => {
            console.log('[ASSET SEARCH] Adding asset to layout:', asset);
            addBlock({
              type: 'content_ref',
              contentId: asset.id,
              contentType: asset.type || asset.content_type || 'image',
              mediaUrl: asset.cloudflare_url || asset.url || asset.s3_url,
              snippet: asset.title || asset.filename || asset.description || 'Asset'
            });
            console.log('[ASSET SEARCH] Closing modal after asset add');
            setShowAssetModal(false);
          }}
        />
      )}

      {showImageModal && imageModalTargetId && (
        <ImageModal
          item={edited.layout_data.items.find(i => i.id === imageModalTargetId)}
          onClose={() => {
            setShowImageModal(false);
            setImageModalTargetId(null);
          }}
          onSave={(imageUrl) => {
            setEdited(prev => ({
              ...prev,
              layout_data: {
                ...prev.layout_data,
                items: prev.layout_data.items.map(i =>
                  i.id === imageModalTargetId
                    ? { ...i, inlineContent: { ...(i.inlineContent || {}), imageUrl } } as Item
                    : i
                )
              },
              updated_at: new Date().toISOString(),
            } as LayoutAsset));
            setShowImageModal(false);
            setImageModalTargetId(null);
          }}
        />
      )}
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
  cellSize: number,
  breakpoint: 'desktop' | 'tablet' | 'mobile'
): any {
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
    case 'content_ref_text': return { w: Math.max(6, Math.round(300 / cellSize)), h: Math.max(8, Math.round(400 / cellSize)) };
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
    return { ...baseItem, type: 'inline_text', textKind: 'layout_inline', inlineContent: { text: 'Edit me' } } as any;
  }
  if (blockType === 'inline_image') {
    return { ...baseItem, type: 'inline_image', inlineContent: { imageUrl: '', alt: 'Image' } } as any;
  }

  return {
    ...baseItem,
    type: 'block',
    textKind: 'layout_inline',
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

function getRichTextHtmlForItem(item: any): string {
  const bt = item?.blockType;
  const cfg = item?.config || {};
  if (bt === 'text_section') {
    return cfg.content || '';
  }
  if (bt === 'hero') {
    const title = cfg.title ? `<h1>${cfg.title}</h1>` : '';
    const subtitle = cfg.subtitle ? `<p>${cfg.subtitle}</p>` : '';
    return `${title}${subtitle}`;
  }
  if (bt === 'cta') {
    const title = cfg.title ? `<h3>${cfg.title}</h3>` : '';
    const descr = cfg.description ? `<p>${cfg.description}</p>` : '';
    const button = cfg.buttonText ? `<p><strong>${cfg.buttonText}</strong></p>` : '';
    return `${title}${descr}${button}`;
  }
  if (bt === 'footer') {
    const copyright = cfg.copyright ? `<p>${cfg.copyright}</p>` : '';
    const links = Array.isArray(cfg.links) && cfg.links.length
      ? `<ul>${cfg.links.map((l: any) => `<li>${l.text || ''}</li>`).join('')}</ul>`
      : '';
    return `${copyright}${links}`;
  }
  return '';
}

function applyRichTextHtmlToItem(item: any, html: string): any {
  const bt = item?.blockType;
  const cfg = { ...(item?.config || {}) };
  if (bt === 'text_section') {
    return { ...item, config: { ...cfg, content: html } };
  }
  // For hero/cta/footer, store raw HTML too and also try to extract plain text fallbacks
  const temp = document.createElement('div');
  temp.innerHTML = html || '';
  const getText = (sel: string) => temp.querySelector(sel)?.textContent?.trim() || '';
  if (bt === 'hero') {
    return {
      ...item,
      config: {
        ...cfg,
        title: getText('h1, h2, h3') || cfg.title || '',
        subtitle: getText('p') || cfg.subtitle || '',
        content: html,
      }
    };
  }
  if (bt === 'cta') {
    return {
      ...item,
      config: {
        ...cfg,
        title: getText('h1, h2, h3') || cfg.title || '',
        description: getText('p') || cfg.description || '',
        buttonText: cfg.buttonText || '',
        content: html,
      }
    };
  }
  if (bt === 'footer') {
    const lis = Array.from(temp.querySelectorAll('li')).map(el => ({ text: el.textContent || '' }));
    return {
      ...item,
      config: {
        ...cfg,
        copyright: getText('p') || cfg.copyright || '',
        links: lis.length ? lis : (cfg.links || []),
        content: html,
      }
    };
  }
  return { ...item, config: { ...cfg, content: html } };
}

function renderWithTransform(content: React.ReactNode, transform?: any) {
  if (!transform?.component || typeof window === 'undefined') {
    return content;
  }

  const TransformComponent = TransformComponents[transform.component];
  if (!TransformComponent) {
    console.warn(`Transform component "${transform.component}" not found`);
    return content;
  }

  const transformProps = { ...transform.props };

  // Apply container styles if specified
  const containerStyle: React.CSSProperties = {};
  if (transform.container) {
    if (transform.container.overflow) containerStyle.overflow = transform.container.overflow;
    if (transform.container.background) containerStyle.background = transform.container.background;
    if (transform.container.border) containerStyle.border = transform.container.border;
    if (transform.container.borderRadius) containerStyle.borderRadius = transform.container.borderRadius;
  }

  return (
    <TransformComponent {...transformProps} style={containerStyle}>
      {content}
    </TransformComponent>
  );
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
    const blockContent = renderBlockItem(it as any, opts);
    return renderWithTransform(blockContent, it.transform);
  }

    if (it.type === 'inline_text' && it.inlineContent?.text) {
    const textContent = (
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
    return renderWithTransform(textContent, it.transform);
  }

  if (it.type === 'inline_image' && (it.inlineContent?.imageUrl || it.inlineContent?.imageData || url)) {
    const src = it.inlineContent?.imageUrl || it.inlineContent?.imageData || url || '';
    const imageContent = (
      <div className="h-full w-full flex items-center justify-center bg-black/50">
        <img src={src} alt="inline" className="max-w-full max-h-full object-contain" draggable={false} />
      </div>
    );
    return renderWithTransform(imageContent, it.transform);
  }

  // Handle content_ref items (from S3)
  if (it.type === 'content_ref') {
    const src = url || (it as any).mediaUrl || '';
    const contentType = (it as any).contentType || 'unknown';
    const assetId = (it as any).contentId || (it as any).refId || '';

    // Render text content using the same approach as visual-search
    if (contentType === 'text') {
      const fullTextContent = (it as any).fullTextContent || '';
      const title = (it as any).snippet || (it as any).title || '';

      if (fullTextContent) {
        // Render full content like visual-search DetailsOverlay
        const textContent = (
          <div className="h-full w-full p-4 bg-white text-black overflow-auto">
            <div className="prose prose-sm max-w-none">
              <h3 className="text-lg font-semibold mb-3 text-black">{title}</h3>
              <div className="text-sm leading-relaxed whitespace-pre-wrap text-gray-800">
                {fullTextContent}
              </div>
            </div>
          </div>
        );
        return renderWithTransform(textContent, it.transform);
      }

      // Loading state or fallback
      if (loading) {
        const loadingContent = (
          <div className="h-full w-full flex items-center justify-center text-xs text-neutral-400 bg-neutral-800/20">
            Loading text content...
          </div>
        );
        return renderWithTransform(loadingContent, it.transform);
      }

      // Fallback to available title/snippet if full content not yet loaded
      const fallbackContent = (
        <div className="h-full w-full p-4 bg-white text-black overflow-auto">
          <div className="prose prose-sm max-w-none">
            <div className="text-sm leading-relaxed text-gray-800">{title || 'Loading text content...'}</div>
          </div>
        </div>
      );
      return renderWithTransform(fallbackContent, it.transform);
    }

    if (loading) {
      const loadingContent = (
        <div className="h-full w-full flex items-center justify-center text-xs text-neutral-400 bg-neutral-800/20">
          Loading {contentType}...
        </div>
      );
      return renderWithTransform(loadingContent, it.transform);
    }

    if (!src) {
      const noSourceContent = (
        <div className="h-full w-full flex items-center justify-center text-xs text-neutral-400 bg-red-900/20">
          No source for {contentType}
        </div>
      );
      return renderWithTransform(noSourceContent, it.transform);
    }

    if (contentType === 'image' || src.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) {
      const imageContent = (
        <div className="h-full w-full flex items-center justify-center bg-black/50">
          <img src={src} alt={(it as any).snippet || 'Content'} className="max-w-full max-h-full object-contain" draggable={false} />
        </div>
      );
      return renderWithTransform(imageContent, it.transform);
    }

    if (contentType === 'video' || src.match(/\.(mp4|webm|mov|avi)$/i)) {
      const videoContent = (
        <div className="h-full w-full flex items-center justify-center bg-black/50">
          <video src={src} className="max-w-full max-h-full object-contain" controls muted />
        </div>
      );
      return renderWithTransform(videoContent, it.transform);
    }

    const fallbackContent = (
      <div className="h-full w-full flex items-center justify-center text-xs text-neutral-300 bg-green-900/20">
        <div className="text-center">
          <div className="text-neutral-200 font-medium">{(it as any).snippet || 'Asset'}</div>
          <div className="text-neutral-400">{contentType}</div>
        </div>
      </div>
    );
    return renderWithTransform(fallbackContent, it.transform);
  }

  const unknownContent = (
    <div className="h-full w-full flex items-center justify-center text-xs text-neutral-300 bg-blue-500/10">
      {label}
    </div>
  );
  return renderWithTransform(unknownContent, it.transform);
}

function renderBlockItem(it: any, opts?: any) {
  const config = it.config || {};

  switch (it.blockType) {
    case 'hero':
      return (
        <div className="h-full w-full p-4 text-white bg-gradient-to-r from-blue-600 to-purple-600 overflow-hidden">
          <div className="h-full flex flex-col justify-center">
            {config.content ? (
              <div className="ql-editor" dangerouslySetInnerHTML={{ __html: config.content }} />
            ) : (
              <div className="text-center">
                <h1 className="text-2xl font-bold mb-2">{config.title || 'Hero Title'}</h1>
                <p className="text-lg opacity-90 mb-4">{config.subtitle || 'Hero subtitle'}</p>
                <button className="bg-white text-blue-600 px-4 py-2 rounded font-medium">
                  {config.ctaText || 'Get Started'}
                </button>
              </div>
            )}
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
        <div className="h-full w-full p-4 bg-gradient-to-r from-green-600 to blue-600 text-white flex flex-col justify-center items-center text-center">
          {config.content ? (
            <div className="ql-editor" dangerouslySetInnerHTML={{ __html: config.content }} />
          ) : (
            <>
              <h3 className="text-xl font-bold mb-2">{config.title || 'Call to Action'}</h3>
              <p className="text-sm opacity-90 mb-4">{config.description || 'Description'}</p>
              <button className="bg-white text-green-600 px-4 py-2 rounded font-medium">
                {config.buttonText || 'Click Here'}
              </button>
            </>
          )}
        </div>
      );

    case 'footer':
      return (
        <div className="h-full w-full p-4 bg-neutral-800 text-neutral-200">
          {config.content ? (
            <div className="ql-editor" dangerouslySetInnerHTML={{ __html: config.content }} />
          ) : (
            <div className="flex items-center justify-between">
              <div className="text-xs">{config.copyright || '© 2024 Your Company'}</div>
              <div className="flex gap-4 text-xs">
                {(config.links || []).map((link: any, i: number) => (
                  <span key={i} className="text-blue-400">{link.text}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      );

    case 'text_section':
      return (
        <div className="h-full w-full p-4 bg-white text-neutral-900 overflow-auto">
          <div className="ql-editor" dangerouslySetInnerHTML={{ __html: config.content || '' }} />
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



function LayoutDimensions({ edited, setEdited }: { edited: LayoutAsset; setEdited: React.Dispatch<React.SetStateAction<LayoutAsset>> }) {
  const currentDesign = edited.layout_data.designSize || { width: 400, height: 1000 };

  const [localWidth, setLocalWidth] = React.useState<string>(String(currentDesign.width));
  const [localHeight, setLocalHeight] = React.useState<string>(String(currentDesign.height));

  // Keep local inputs in sync when external design changes
  React.useEffect(() => {
    setLocalWidth(String(currentDesign.width ?? 400));
    setLocalHeight(String(currentDesign.height ?? 1000));
  }, [currentDesign.width, currentDesign.height]);

  const commit = (wStr: string, hStr: string) => {
    const parsedW = Number.parseInt(wStr, 10);
    const parsedH = Number.parseInt(hStr, 10);

    const nextW = Number.isFinite(parsedW) ? parsedW : (currentDesign.width ?? 400);
    const nextH = Number.isFinite(parsedH) ? parsedH : (currentDesign.height ?? 1000);

    setEdited(prev => ({
      ...prev,
      layout_data: {
        ...prev.layout_data,
        designSize: { width: nextW, height: nextH }
      },
      updated_at: new Date().toISOString()
    } as LayoutAsset));
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === 'Enter') {
      commit(localWidth, localHeight);
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <div>
      <div className="text-xs text-white mb-2">Layout Dimensions</div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-white">Width</label>
          <Input
            type="number"
            value={localWidth}
            onChange={(e) => setLocalWidth(e.target.value)}
            onBlur={() => commit(localWidth, localHeight)}
            onKeyDown={handleKeyDown}
            className="bg-neutral-800 border-neutral-700 text-white"
          />
        </div>
        <div>
          <label className="text-xs text-white">Height</label>
          <Input
            type="number"
            value={localHeight}
            onChange={(e) => setLocalHeight(e.target.value)}
            onBlur={() => commit(localWidth, localHeight)}
            onKeyDown={handleKeyDown}
            className="bg-neutral-800 border-neutral-700 text-white"
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
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['image','video','audio','text','object']);
  const [mounted, setMounted] = useState(false);
  const controllerRef = React.useRef<AbortController | null>(null);
  const debounceRef = React.useRef<number | null>(null);
  const lastRequestIdRef = React.useRef<number>(0);

  const searchAssets = async (query: string, overrideTypes?: string[]) => {
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
        const activeTypes = overrideTypes && overrideTypes.length ? overrideTypes : selectedTypes;
        const typeParam = activeTypes.join(',');
        console.log('[ASSET SEARCH] Query:', q, 'Types:', activeTypes, 'Param:', typeParam);
        const json = await searchService.get(q, { type: typeParam, limit: 50, signal: controller.signal });
        if (controller.signal.aborted || requestId !== lastRequestIdRef.current) return;
        const results = (json as any)?.results || {};
        console.log('[ASSET SEARCH] Raw results:', results);
        // Choose list to show based on active filters
        const onlyText = activeTypes.length === 1 && activeTypes[0] === 'text';
        const onlyMedia = activeTypes.every(t => ['image','video','audio'].includes(t)) && !activeTypes.includes('text');
        const baseList = onlyText ? results.text : onlyMedia ? results.media : (results.all || []);
        console.log('[ASSET SEARCH] Base list:', baseList?.length, 'items from', onlyText ? 'text' : onlyMedia ? 'media' : 'all');
        const allow = new Set<string>(activeTypes.includes('text') && activeTypes.length === 1 ? ['text'] : activeTypes);
        const filtered = (Array.isArray(baseList) ? baseList : []).filter((r: any) => allow.has((r.content_type || r.type || '').toLowerCase()));
        console.log('[ASSET SEARCH] Filtered results:', filtered.length, 'items, first 3 types:', filtered.slice(0, 3).map((r: any) => r.content_type || r.type));
        setSearchResults(filtered);
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
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-medium text-neutral-100">Search Assets</h2>
            <select
              value={(() => {
                const all = ['image','video','audio','text','object'];
                if (selectedTypes.length === all.length && all.every(t => selectedTypes.includes(t))) {
                  return 'all';
                }
                const first = selectedTypes.find(t => all.includes(t));
                return first || 'all';
              })()}
              onChange={(e) => {
                const val = e.target.value;
                const next = val === 'all' ? ['image','video','audio','text','object'] : [val];
                setSelectedTypes(next);
                void searchAssets(searchQuery, next);
              }}
              className="px-3 py-1.5 text-xs rounded-md border border-neutral-700 bg-neutral-800 text-neutral-100"
            >
              <option value="all">All</option>
              <option value="image">Image</option>
              <option value="video">Video</option>
              <option value="audio">Audio</option>
              <option value="text">Text</option>
              <option value="object">Object</option>
            </select>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-neutral-800 rounded text-neutral-400 hover:text-neutral-200"
          >
            ✕
          </button>
        </div>

        {/* Search Input */}
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
                    <VSResultCard
                      r={r}
                      onPin={() => {}}
                      onOpen={() => onSelect(r)}
                      hidePin
                    />
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

function ImageModal({ item, onClose, onSave }: { item: Item | undefined; onClose: () => void; onSave: (imageUrl: string) => void }) {
  const [imageUrl, setImageUrl] = useState(item?.inlineContent?.imageUrl || '');
  const [uploading, setUploading] = useState(false);

  if (!item) return null;

  const handleFileUpload = async (file: File) => {
    if (!file) return;

    try {
      setUploading(true);

      // Create form data for upload
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'image');
      formData.append('directory', 'public/uploads');

      // Upload the file
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (response.ok && result?.url) {
        setImageUrl(result.url);
      } else {
        throw new Error(result?.error || 'Upload failed');
      }
    } catch (error) {
      console.error('Upload failed:', error);
      alert(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setUploading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
      <div className="bg-black border border-neutral-700 rounded-lg w-[500px] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-700">
          <h2 className="text-lg font-medium text-white">Edit Image</h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Image URL
            </label>
            <Input
              type="text"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="Enter image URL or upload a file..."
              className="bg-neutral-800 border-neutral-700 text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Or Upload File
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
              }}
              disabled={uploading}
              className="w-full text-white file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-neutral-700 file:text-white hover:file:bg-neutral-600"
            />
            {uploading && <div className="text-sm text-neutral-400 mt-2">Uploading...</div>}
          </div>

          {imageUrl && (
            <div>
              <label className="block text-sm font-medium text-white mb-2">Preview</label>
              <img src={imageUrl} alt="Preview" className="max-w-full h-32 object-contain bg-neutral-800 rounded" />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-neutral-700">
          <Button onClick={onClose} className="bg-neutral-700 text-white hover:bg-neutral-600">
            Cancel
          </Button>
          <Button
            onClick={() => onSave(imageUrl)}
            disabled={!imageUrl}
            className="bg-blue-700 text-white hover:bg-blue-600"
          >
            Save
          </Button>
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
      <div className="text-xs text-white mb-2">Theme</div>
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
        className="w-full px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-sm text-white"
      >
        {LAYOUT_THEMES.map(theme => (
          <option key={theme.id} value={theme.id}>{theme.name}</option>
        ))}
      </select>
      <div className="mt-2 space-y-2">
        <div>
          <label className="text-xs text-white">Background Color</label>
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
          <label className="text-xs text-white">Text Color</label>
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

// ReactQuill toolbar config
const quillModules = {
  syntax: {
    highlight: (text: string) => hljs.highlightAuto(text).value,
  },
  toolbar: [
    [{ font: [] }, { size: [] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ color: [] }, { background: [] }],
    [{ script: 'sub' }, { script: 'super' }],
    [{ header: 1 }, { header: 2 }, 'blockquote', 'code-block'],
    [{ list: 'ordered' }, { list: 'bullet' }, { indent: '-1' }, { indent: '+1' }],
    [{ direction: 'rtl' }, { align: [] }],
    ['link', 'image', 'video', 'formula'],
    ['clean']
  ]
};
const quillFormats = [
  'font', 'size', 'bold', 'italic', 'underline', 'strike', 'color', 'background', 'script',
  'header', 'blockquote', 'code-block', 'list', 'indent', 'direction', 'align', 'link', 'image', 'video', 'formula'
];

function RteModal({ initialHtml, onClose, onSave, mode = 'html', initialMarkdown, initialTitle, initialSlug, initialCategories, rteTargetId, setEdited }: { initialHtml: string; onClose: () => void; onSave: (html: string) => void; mode?: 'html' | 'markdown'; initialMarkdown?: string; initialTitle?: string; initialSlug?: string; initialCategories?: string; rteTargetId?: string | null; setEdited?: React.Dispatch<React.SetStateAction<LayoutAsset>> }) {
  const [mounted, setMounted] = useState(false);
  const [html, setHtml] = useState(initialHtml || '');
  const [md, setMd] = useState(initialMarkdown || '');
  const [title, setTitle] = useState(initialTitle || 'Document Title');
  const [slug, setSlug] = useState(initialSlug || '');
  const [categories, setCategories] = useState(initialCategories || '');
  const [saving, setSaving] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || typeof document === 'undefined') return null;

  const isMarkdown = mode === 'markdown';

  return createPortal(
    <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onMouseDown={(e)=>{ if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-neutral-900 border border-neutral-700 rounded-lg w-[70vw] h-[70vh] flex flex-col">
          <div className="flex items-center justify-between p-3 border-b border-neutral-700">
            <div className="text-neutral-200 text-sm">{isMarkdown ? 'Edit Markdown' : 'Edit Rich Text'}</div>
            <div className="flex gap-2">
              <button className="px-2 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 rounded" onClick={() => onClose()}>Cancel</button>
              {isMarkdown ? (
                <button
                  disabled={saving}
                  className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 rounded text-white"
                  onClick={async () => {
                    try {
                      setSaving(true);
                      const slugify = (v: string) => (v || '')
                        .toString()
                        .trim()
                        .toLowerCase()
                        .replace(/[^a-z0-9\s-]/g, '')
                        .replace(/\s+/g, '-')
                        .replace(/-+/g, '-');

                      const finalTitle = (title || 'Untitled').trim();
                      const finalSlug = (slug && slug.trim()) ? slug.trim() : slugify(finalTitle);
                      if (!finalSlug) {
                        alert('Please provide a title or slug.');
                        return;
                      }
                      const cats = categories.split(',').map(s => s.trim()).filter(Boolean);
                      const payload = { slug: finalSlug, title: finalTitle, categories: cats, source: 'layout', status: 'draft', mdx: md };
                      console.log('[DOC] Saving text asset payload:', payload);
                      const res = await fetch('/api/text-assets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                      let json: any = null;
                      try { json = await res.json(); } catch {}
                      console.log('[DOC] Save response:', { ok: res.ok, status: res.status, json });
                      if (!res.ok || !json?.success) {
                        const errMsg = (json && (json.error || json.message)) || res.statusText || 'Unknown error';
                        console.error('[DOC] Save failed', { status: res.status, json });
                        alert(`Failed to save text asset: ${errMsg}`);
                        return;
                      }
                      // Update item to reference the text asset by ID
                      if (setEdited && rteTargetId) {
                        setEdited(prev => ({
                          ...prev,
                          layout_data: {
                            ...prev.layout_data,
                            items: prev.layout_data.items.map(i => {
                              if (i.id !== rteTargetId) return i;
                              return {
                                ...i,
                                refId: `text_timeline/${json.slug}`,
                                contentId: `text_timeline/${json.slug}`,
                                snippet: finalTitle || 'Document'
                              } as Item;
                            })
                          },
                          updated_at: new Date().toISOString(),
                        } as LayoutAsset));
                      }
                      onSave(md);
                    } catch (e) {
                      console.error('[DOC] Save error', e);
                      alert(`Error saving text asset: ${e instanceof Error ? e.message : 'Unknown error'}`);
                    } finally {
                      setSaving(false);
                    }
                  }}
                >{saving ? 'Saving…' : 'Save'}</button>
              ) : (
                <button className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 rounded text-white" onClick={() => onSave(html)}>Save</button>
              )}
            </div>
          </div>
        <div className="flex-1 overflow-hidden p-3">
          {isMarkdown ? (
            <div className="h-full w-full grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <input className="px-2 py-1 bg-white border border-neutral-300 rounded text-sm" placeholder="Title" value={title} onChange={(e)=>setTitle(e.target.value)} />
                <input className="px-2 py-1 bg-white border border-neutral-300 rounded text-sm" placeholder="Slug (optional)" value={slug} onChange={(e)=>setSlug(e.target.value)} />
                <input className="px-2 py-1 bg-white border border-neutral-300 rounded text-sm" placeholder="Categories (comma separated)" value={categories} onChange={(e)=>setCategories(e.target.value)} />
                <textarea
                  className="w-full h-full px-2 py-1 bg-white text-neutral-900 border border-neutral-300 rounded text-sm font-mono"
                  value={md}
                  onChange={(e) => setMd(e.target.value)}
                  placeholder="# Title\n\nBody..."
                />
              </div>
              <div className="w-full h-full bg-white text-neutral-900 border border-neutral-300 rounded text-sm p-3 overflow-auto">
                <pre className="whitespace-pre-wrap break-words text-sm">{md}</pre>
              </div>
            </div>
          ) : (
            <div className="h-full w-full flex flex-col bg-white rounded border border-neutral-300 text-neutral-900">
              <div className="flex-1 overflow-auto quill-container">
                <ReactQuill
                  theme="snow"
                  modules={quillModules}
                  formats={quillFormats}
                  value={html}
                  onChange={setHtml}
                  placeholder="Start typing…"
                  className="h-full"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}



function ItemInspector({
  item,
  cellSize,
  onChange,
  onZ,
  onEditImage,
}: {
  item: Item;
  cellSize: number;
  onChange: (updates: Partial<Item>) => void;
  onZ: (dir: 'front' | 'back' | 'up' | 'down') => void;
  onEditImage: (itemId: string) => void;
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
          <div className="text-xs text-white mb-1">Text Content</div>
          <textarea
            value={item.inlineContent?.text || ''}
            onChange={(e) => onChange({
              inlineContent: { ...(item.inlineContent || {}), text: e.target.value }
            })}
            className="w-full h-20 px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-sm text-white"
            placeholder="Enter text content..."
          />
          <div className="mt-2">
            <div className="text-xs text-white mb-1">Text Kind</div>
            <select
              className="w-full px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-sm text-white"
              value={(item as any).textKind || 'layout_inline'}
              onChange={(e) => onChange({ ...(item as any), textKind: e.target.value as any })}
            >
              <option value="layout_inline">Layout Inline</option>
              <option value="asset">Text Asset</option>
            </select>
          </div>
        </div>
      )}

      {item.type === 'inline_image' && (
        <div>
          <div className="text-xs text-white mb-1">Image</div>
          <Button
            onClick={() => onEditImage(item.id)}
            className="w-full bg-neutral-800 border-neutral-700 text-white hover:bg-neutral-700"
            size="sm"
          >
            {item.inlineContent?.imageUrl ? 'Edit Image' : 'Set Image'}
          </Button>
          {item.inlineContent?.imageUrl && (
            <div className="mt-2 text-xs text-neutral-400 truncate">
              {item.inlineContent.imageUrl}
            </div>
          )}
        </div>
      )}

      {/* Text Kind selector for block rich-text items */}
      {item.type === 'block' && (['text_section','hero','cta','footer'] as const).includes((item as any).blockType) && (
        <div>
          <div className="text-xs text-white mb-1">Text Kind</div>
          <select
            className="w-full px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-sm text-white"
            value={(item as any).textKind || 'layout_inline'}
            onChange={(e) => onChange({ ...(item as any), textKind: e.target.value as any })}
          >
            <option value="layout_inline">Layout Inline</option>
            <option value="asset">Text Asset</option>
          </select>
        </div>
      )}

      {/* Position controls second */}
      <div>
        <div className="text-xs text-white mb-1">Position & Size</div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <label className="text-white">X</label>
            <input
              type="number"
              value={item.x || 0}
              onChange={(e) => onChange({ x: parseInt(e.target.value) || 0 })}
              className="w-full px-2 py-1 bg-neutral-800 rounded text-white"
            />
          </div>
          <div>
            <label className="text-white">Y</label>
            <input
              type="number"
              value={item.y || 0}
              onChange={(e) => onChange({ y: parseInt(e.target.value) || 0 })}
              className="w-full px-2 py-1 bg-neutral-800 rounded text-white"
            />
          </div>
          <div>
            <label className="text-white">W</label>
            <input
              type="number"
              value={item.w || ''}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '') {
                  onChange({ w: '' as any });
                } else {
                  const num = parseInt(val);
                  if (!isNaN(num) && num > 0) {
                    onChange({ w: num });
                  }
                }
              }}
              className="w-full px-2 py-1 bg-neutral-800 rounded text-white"
              placeholder="Width"
            />
          </div>
          <div>
            <label className="text-white">H</label>
            <input
              type="number"
              value={item.h || ''}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '') {
                  onChange({ h: '' as any });
                } else {
                  const num = parseInt(val);
                  if (!isNaN(num) && num > 0) {
                    onChange({ h: num });
                  }
                }
              }}
              className="w-full px-2 py-1 bg-neutral-800 rounded text-white"
              placeholder="Height"
            />
          </div>
        </div>
      </div>

      <div>
        <div className="text-xs text-white mb-1">Z-Index</div>
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
