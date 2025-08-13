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
        className="border border-blue-400/50 rounded-sm overflow-hidden"
        style={{ 
          margin: 0, 
          padding: 0,
          willChange: 'transform',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden'
        }}
      >
        {renderItem(item)}
      </div>
    ));
  }, [edited.layout_data.items, renderItem]);

  return (
    <div className="w-full h-full flex flex-col bg-neutral-950">
      {/* Integrated Header */}
      <div className="flex items-center justify-between p-3 bg-neutral-900/50 border-b border-neutral-800/50">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
            title="Back to layouts"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h2 className="text-sm font-medium text-white">{edited.title}</h2>
            <p className="text-xs text-neutral-400">{edited.layout_data.items.length} items • {design.width}×{design.height}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={working}
            className="px-3 py-1.5 text-sm rounded bg-green-600 hover:bg-green-500 text-white disabled:opacity-50 transition-colors"
          >
            {working ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Canvas area - fits in page flow */}
      <div className="flex-1 overflow-auto p-4">
        <div className="flex justify-center">
          <div 
            className="border border-neutral-700 bg-neutral-900 shadow-xl rounded-lg overflow-hidden"
            style={{ 
              width: typeof window !== 'undefined' ? Math.min(design.width, window.innerWidth - 100) : design.width, 
              height: typeof window !== 'undefined' ? Math.min(design.height, window.innerHeight - 200) : design.height 
            }}
          >
            <ResponsiveGridLayout
              className="layout"
              layouts={layouts}
              breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
              cols={{ lg: Math.floor(design.width / cellSize), md: Math.floor(design.width / cellSize), sm: Math.floor(design.width / cellSize), xs: Math.floor(design.width / cellSize), xxs: Math.floor(design.width / cellSize) }}
              rowHeight={cellSize}
              width={typeof window !== 'undefined' ? Math.min(design.width, window.innerWidth - 100) : design.width}
              onLayoutChange={handleLayoutChange}
              isDraggable={true}
              isResizable={true}
              margin={[1, 1]}
              containerPadding={[2, 2]}
              useCSSTransforms={true}
              preventCollision={true}
              compactType={null}
              verticalCompact={false}
              isBounded={true}
              transformScale={typeof window !== 'undefined' ? Math.min(1, (window.innerWidth - 100) / design.width) : 1}
            >
              {children}
            </ResponsiveGridLayout>
          </div>
        </div>
      </div>
    </div>
  );
}
