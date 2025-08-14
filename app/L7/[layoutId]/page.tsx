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
        
      } catch (err) {
        console.error('[L7] Error:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [params.layoutId]);

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
    <div className="min-h-screen bg-gray-900">
      <div className="p-4 text-white">
        <h1 className="text-2xl font-bold mb-2">{data.title}</h1>
        <p className="text-sm opacity-70 mb-4">
          Layout: {designSize.width}×{designSize.height} | Items: {items.length}
        </p>
      </div>
      
      <div 
        className="mx-auto relative bg-gray-800 border border-gray-600"
        style={{ 
          width: `${designSize.width}px`, 
          height: `${designSize.height}px`
        }}
      >
        {items.map((item: any, index: number) => {
          const cellSize = layout_data.cellSize || 20;
          const x = (item.x || 0) * cellSize;
          const y = (item.y || 0) * cellSize;
          const w = (item.w || 1) * cellSize;
          const h = (item.h || 1) * cellSize;

          return (
            <div
              key={item.id || `item-${index}`}
              className="absolute border border-blue-500 bg-blue-900/20 text-white text-xs p-2 overflow-hidden"
              style={{
                left: `${x}px`,
                top: `${y}px`,
                width: `${w}px`,
                height: `${h}px`,
                zIndex: item.z || 1,
              }}
            >
              <div className="font-bold">{item.type || 'unknown'}</div>
              <div className="opacity-70">{item.contentType || ''}</div>
              <div className="text-xs opacity-50 mt-1">
                {item.snippet || item.title || 'No content'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}