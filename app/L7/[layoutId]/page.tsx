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
    type Rect = { id: string; x: number; y: number; w: number; h: number; item: any; order: number };
    const rects: Rect[] = rawItems.map((it: any, idx: number) => ({
      id: it.id || `item-${idx}`,
      x: Math.max(0, it.x ?? 0),
      y: Math.max(0, it.y ?? 0),
      w: Math.max(1, it.w ?? 1),
      h: Math.max(1, it.h ?? 1),
      item: it,
      order: idx
    }));

    // General rule: sort by y asc, then x asc, then original order (stable)
    rects.sort((a, b) => {
      const aEnd = a.y + a.h;
      const bEnd = b.y + b.h;
      if (aEnd !== bEnd) return aEnd - bEnd;
      if (a.y !== b.y) return a.y - b.y;
      if (a.x !== b.x) return a.x - b.x;
      return a.order - b.order;
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
        // Move below the lowest collider we overlap with
        const nextY = Math.max(...colliders.map(p => p.y + p.h));
        if (nextY > maxY) {
          currentY = maxY;
          break;
        }
        if (nextY === currentY) {
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
              key={item.id || `item-${index}`}
              style={{
                position: 'absolute',
                left: leftPx,
                top: topPx,
                width: widthPx,
                height: heightPx,
                zIndex: 1,
                overflow: 'hidden'
              }}
            >
              {renderContent(item)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function renderContent(item: any) {
  // Handle video content
  if (item.contentType === 'video' && item.mediaUrl) {
    return (
      <div className="w-full h-full bg-black flex items-center justify-center">
        <video
          src={item.mediaUrl}
          className="max-w-full max-h-full object-contain"
          controls
          autoPlay
          muted
          loop
        />
      </div>
    );
  }

  // Handle image content
  if (item.contentType === 'image' && item.mediaUrl) {
    return (
      <div className="w-full h-full bg-black flex items-center justify-center">
        <img
          src={item.mediaUrl}
          alt={item.snippet || 'Image'}
          className="max-w-full max-h-full object-contain"
        />
      </div>
    );
  }

  // Handle inline_image
  if (item.type === 'inline_image') {
    const imageUrl = item.mediaUrl || item.inlineContent?.imageUrl || '';
    if (imageUrl) {
      return (
        <div className="w-full h-full bg-transparent flex items-center justify-center">
          <img
            src={imageUrl}
            alt={item.snippet || item.inlineContent?.alt || 'Image'}
            className="max-w-full max-h-full object-contain"
          />
        </div>
      );
    }
    return (
      <div className="w-full h-full bg-gray-200 flex items-center justify-center text-gray-500">
        No image
      </div>
    );
  }

  // Handle text content
  if (item.contentType === 'text') {
    const title = item.snippet || item.title || '';
    const content = item.fullTextContent || '';

    return (
      <div className="w-full h-full p-6 bg-white text-black overflow-hidden relative shadow-lg border border-gray-300">
        <div className="prose prose-lg max-w-none h-full overflow-y-auto">
          {title && <h1 className="text-2xl font-bold mb-6 text-black">{title}</h1>}
          {content ? (
            <div className="text-base leading-relaxed whitespace-pre-wrap text-gray-800">
              {content}
            </div>
          ) : (
            <div className="text-gray-500 italic">Loading text content...</div>
          )}
        </div>
      </div>
    );
  }

  // Handle block types
  if (item.type === 'block') {
    const config = item.config || {};

    switch (item.blockType) {
      case 'hero':
        return (
          <div className="w-full h-full p-8 text-white bg-gradient-to-r from-blue-600 to-purple-600 flex flex-col justify-center">
            <div className="text-center">
              <h1 className="text-4xl font-bold mb-4">{config.title || 'Hero Title'}</h1>
              <p className="text-xl opacity-90 mb-8">{config.subtitle || 'Hero subtitle'}</p>
              <button className="bg-white text-blue-600 px-8 py-3 rounded-lg font-semibold text-lg">
                {config.ctaText || 'Get Started'}
              </button>
            </div>
          </div>
        );

      case 'text_section':
        return (
          <div className="w-full h-full p-6 overflow-auto bg-gray-100 text-gray-900">
            <div className="prose prose-lg max-w-none">
              {config.content ? (
                <div dangerouslySetInnerHTML={{ __html: config.content }} />
              ) : (
                <p className="text-lg leading-relaxed">
                  {config.text || 'Text section content goes here.'}
                </p>
              )}
            </div>
          </div>
        );

      default:
        return (
          <div className="w-full h-full bg-gray-700 text-white flex items-center justify-center rounded">
            <div className="text-center">
              <div className="text-lg font-medium">{item.blockType || 'Block'}</div>
              <div className="text-sm opacity-70">Content Block</div>
            </div>
          </div>
        );
    }
  }

  // Fallback for unknown content
  return (
    <div className="w-full h-full border border-blue-500 bg-blue-900/20 text-white text-xs p-2 flex flex-col">
      <div className="font-bold">{item.type || 'unknown'}</div>
      <div className="opacity-70">{item.contentType || ''}</div>
      <div className="text-xs opacity-50 mt-1 flex-1 overflow-hidden">
        {item.snippet || item.title || 'No content'}
      </div>
    </div>
  );
}
