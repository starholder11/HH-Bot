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

  return (
    <div className="min-h-screen bg-black flex items-center justify-center py-8">
      <div 
        className="relative bg-gray-800 border border-gray-600"
        style={{ 
          width: `${designSize.width}px`, 
          height: `${designSize.height}px`
        }}
      >
        {items
          .sort((a: any, b: any) => {
            // Sort by z-index first, then by Y position, then by type
            const aZ = a.z || 1;
            const bZ = b.z || 1;
            if (aZ !== bZ) return aZ - bZ;
            
            const aY = a.y || 0;
            const bY = b.y || 0;
            if (aY !== bY) return aY - bY;
            
            // Render text content before inline images at the same Y level
            if (a.contentType === 'text' && b.type === 'inline_image') return -1;
            if (b.contentType === 'text' && a.type === 'inline_image') return 1;
            
            return 0;
          })
          .map((item: any, index: number) => {
          const cellSize = layout_data.cellSize || 20;
          const x = (item.x || 0) * cellSize;
          const y = (item.y || 0) * cellSize;
          const w = (item.w || 1) * cellSize;
          const h = (item.h || 1) * cellSize;

          // Debug logging with expanded coordinates
          console.log(`[L7] Item ${item.id || index}:`, 
            `type=${item.type}`,
            `contentType=${item.contentType || 'none'}`,
            `coords=(${item.x || 0}, ${item.y || 0}, ${item.w || 1}, ${item.h || 1})`,
            `pixels=(${x}, ${y}, ${w}, ${h})`,
            `z=${item.z || 1}`
          );

          return (
            <div
              key={item.id || `item-${index}`}
              className="absolute"
              style={{
                left: `${x}px`,
                top: `${y}px`,
                width: `${w}px`,
                height: `${h}px`,
                zIndex: item.z || 1,
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

  // Handle inline_image type (like the TV with moth)
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
      <div className="w-full h-full p-6 bg-white text-black overflow-auto">
        <div className="prose prose-lg max-w-none">
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