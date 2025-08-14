'use client';

import React, { useEffect, useState } from 'react';

interface LiveLayoutPageProps {
  params: { layoutId: string };
}

export default function LiveLayoutPage({ params }: LiveLayoutPageProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        console.log('[L7] Loading layout:', params.layoutId);

        const response = await fetch(`/api/media-assets/${params.layoutId}`);
        console.log('[L7] Response status:', response.status);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const responseData = await response.json();
        console.log('[L7] Full response:', responseData);

        // Handle both wrapped and direct responses
        const asset = responseData.asset || responseData;
        console.log('[L7] Asset data:', asset);
        console.log('[L7] Media type:', asset?.media_type);

        if (!asset) {
          throw new Error('No asset data in response');
        }

        if (asset.media_type !== 'layout') {
          throw new Error(`Expected layout, got: ${asset.media_type}`);
        }

        if (!asset.layout_data) {
          throw new Error('No layout_data in asset');
        }

        setData(asset);
        console.log('[L7] Layout loaded successfully');

        // Load full content for all items
        if (asset.layout_data?.items) {
          loadAllContent(asset);
        }

      } catch (err) {
        console.error('[L7] Error:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [params.layoutId]);

  async function loadAllContent(asset: any) {
    const contentItems = asset.layout_data.items.filter((item: any) =>
      item.type === 'content_ref'
    );

    for (const item of contentItems) {
      try {
        const assetId = item.contentId || item.refId || '';

        if (item.contentType === 'text') {
          // Handle text content
          console.log('[L7] Raw assetId for text:', assetId);

          // Extract slug from various possible formats
          let slug = '';
          if (assetId.includes('content_ref_')) {
            slug = assetId.replace('content_ref_', '');
          } else if (assetId.includes('text_timeline/')) {
            // Handle text_timeline/slug#anchor format
            const timelineMatch = assetId.match(/text_timeline\/([^#]+)/);
            slug = timelineMatch ? timelineMatch[1] : '';
          } else {
            slug = assetId;
          }

          console.log('[L7] Extracted slug:', slug);

          if (slug) {
            console.log('[L7] Loading text content for slug:', slug);
            const response = await fetch(`/api/internal/get-content/${encodeURIComponent(slug)}`);
            if (response.ok) {
              const textData = await response.json();
              console.log('[L7] Loaded text data:', textData);

              // Update the item with full text content
              setData((prev: any) => ({
                ...prev,
                layout_data: {
                  ...prev.layout_data,
                  items: prev.layout_data.items.map((i: any) =>
                    i.id === item.id
                      ? { ...i, fullTextContent: textData.content, textMetadata: textData.metadata }
                      : i
                  )
                }
              }));
            } else {
              console.error('[L7] Failed to load text content, status:', response.status);
            }
          }
        } else if (assetId && (item.contentType === 'video' || item.contentType === 'image' || item.contentType === 'audio')) {
          // Handle media content - get the asset to find mediaUrl
          console.log('[L7] Loading media asset for:', assetId);
          const response = await fetch(`/api/media-assets/${assetId}`);
          if (response.ok) {
            const responseData = await response.json();
            const mediaAsset = responseData.asset || responseData;
            const mediaUrl = mediaAsset.cloudflare_url || mediaAsset.s3_url || mediaAsset.url;

            console.log('[L7] Loaded media URL:', mediaUrl);

            // Update the item with media URL
            setData((prev: any) => ({
              ...prev,
              layout_data: {
                ...prev.layout_data,
                items: prev.layout_data.items.map((i: any) =>
                  i.id === item.id
                    ? { ...i, mediaUrl, assetData: mediaAsset }
                    : i
                )
              }
            }));
          }
        }
      } catch (error) {
        console.error('[L7] Failed to load content for item:', item.id, error);
      }
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div>Loading layout {params.layoutId}...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-red-900 text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Error Loading Layout</h1>
          <p className="text-lg">{error}</p>
          <p className="text-sm mt-4 opacity-70">Layout ID: {params.layoutId}</p>
        </div>
      </div>
    );
  }

  if (!data?.layout_data?.items) {
    return (
      <div className="min-h-screen bg-yellow-900 text-white flex items-center justify-center">
        <div>No layout items found</div>
      </div>
    );
  }

  const { layout_data } = data;
  const { designSize = { width: 1200, height: 800 }, items = [] } = layout_data;

  const cellSize = layout_data.cellSize || 20;
  const cols = Math.floor(designSize.width / cellSize);
  const rowHeight = cellSize;
  const rows = Math.ceil(designSize.height / cellSize);

  // Compute a collision-free layout at render time without mutating the saved data
  function computeNonOverlappingLayout(rawItems: any[]) {
    // Extract base grid rects
    type Rect = { id: string; x: number; y: number; w: number; h: number; item: any };
    const rects: Rect[] = rawItems.map((it: any, idx: number) => ({
      id: it.id || `item-${idx}`,
      x: Math.max(0, it.x ?? 0),
      y: Math.max(0, it.y ?? 0),
      w: Math.max(1, it.w ?? 1),
      h: Math.max(1, it.h ?? 1),
      item: it
    }));

    // Identify the first four non-text items closest to the top (original intent grid)
    const nonTextSorted = rects
      .filter(r => r.item.contentType !== 'text')
      .sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));
    const topFourIds = new Set(nonTextSorted.slice(0, 4).map(r => r.id));

    // Priority tiers:
    // 0 → top four non-text (stay at the top)
    // 1 → all text content (go below the first four)
    // 2 → remaining items (e.g., trailing inline image)
    const priority = (r: Rect) => (topFourIds.has(r.id) ? 0 : r.item.contentType === 'text' ? 1 : 2);

    rects.sort((a, b) => {
      const pa = priority(a);
      const pb = priority(b);
      if (pa !== pb) return pa - pb;
      if (a.y !== b.y) return a.y - b.y;
      return a.x - b.x;
    });

    const placed: Rect[] = [];
    const overlaps = (r1: Rect, r2: Rect) => {
      return !(
        r1.x + r1.w <= r2.x ||
        r1.x >= r2.x + r2.w ||
        r1.y + r1.h <= r2.y ||
        r1.y >= r2.y + r2.h
      );
    };

    for (const r of rects) {
      // Shift down until no overlap
      let currentY = r.y;
      // Clamp within grid
      const maxY = Math.max(0, rows - r.h);
      while (true) {
        const test: Rect = { ...r, y: currentY };
        const colliders = placed.filter(p => overlaps(test, p));
        if (colliders.length === 0) break;
        // Move below the lowest collider
        const nextY = Math.max(...colliders.map(p => p.y + p.h));
        if (nextY > maxY) {
          currentY = maxY;
          break;
        }
        if (nextY === currentY) {
          // Prevent infinite loop
          currentY = Math.min(maxY, currentY + 1);
        } else {
          currentY = nextY;
        }
      }
      placed.push({ ...r, y: currentY });
    }

    // Build lookup map
    const byId: Record<string, { x: number; y: number; w: number; h: number }> = {};
    placed.forEach(p => {
      byId[p.id] = { x: p.x, y: p.y, w: p.w, h: p.h };
    });
    return byId;
  }

  const computedLayout = computeNonOverlappingLayout(items);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center py-8">
      <div
        className="relative border border-gray-600"
        style={{
          width: `${designSize.width}px`,
          height: `${designSize.height}px`,
          backgroundColor: layout_data.styling?.colors?.background || '#171717',
          color: layout_data.styling?.colors?.text || '#ffffff',
          fontFamily: layout_data.styling?.typography?.fontFamily || 'inherit'
        }}
      >
        {/* Force a new paint when layout id changes to bust any client cache */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} data-layout-version={params.layoutId} />
        {items.map((item: any, index: number) => {
          // Use computed non-overlapping positions derived from editor coords
          const key = item.id || `item-${index}`;
          const fallback = { x: Math.max(0, item.x ?? 0), y: Math.max(0, item.y ?? 0), w: Math.max(1, item.w ?? 1), h: Math.max(1, item.h ?? 1) };
          const pos = computedLayout[key] || fallback;
          const gridX = pos.x;
          const gridY = pos.y;
          const gridW = pos.w;
          const gridH = pos.h;

          // Convert to pixel-based absolute positioning for bulletproof rendering
          const leftPx = gridX * cellSize;
          const topPx = gridY * cellSize;
          const widthPx = gridW * cellSize;
          const heightPx = gridH * cellSize;

          // Debug logging with expanded coordinates and pixel values
          console.log(`[L7] Item ${item.id || index}:`,
            `type=${item.type}`,
            `contentType=${item.contentType || 'none'}`,
            `grid=(${gridX}, ${gridY}, ${gridW}×${gridH})`,
            `px=(${leftPx}, ${topPx}, ${widthPx}×${heightPx})`,
            `cell=${cellSize}px`,
            '[published-layout]'
          );

          return (
            <div
              key={item.id || `