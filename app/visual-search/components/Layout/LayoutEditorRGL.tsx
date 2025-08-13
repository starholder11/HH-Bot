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

  // Render item content
  const renderItem = useCallback((item: Item) => {
    if (item.type === 'inline_text') {
      return (
        <div className="p-2 text-sm text-white bg-gray-800 h-full overflow-hidden">
          {item.inlineContent?.text || 'Text block'}
        </div>
      );
    }

    if (item.type === 'inline_image') {
      const imageUrl = item.inlineContent?.imageUrl || item.inlineContent?.imageData;
      return (
        <div className="bg-gray-800 h-full flex items-center justify-center">
          {imageUrl ? (
            <img 
              src={imageUrl} 
              alt="Content" 
              className="max-w-full max-h-full object-contain"
              draggable={false}
            />
          ) : (
            <span className="text-gray-400 text-xs">Image block</span>
          )}
        </div>
      );
    }

    if (item.type === 'content_ref' && item.mediaUrl) {
      return (
        <div className="bg-gray-800 h-full flex items-center justify-center">
          <img 
            src={item.mediaUrl} 
            alt={item.snippet || 'Content'} 
            className="max-w-full max-h-full object-contain"
            draggable={false}
          />
        </div>
      );
    }

    return (
      <div className="bg-gray-700 h-full flex items-center justify-center text-xs text-gray-300">
        {item.type}
      </div>
    );
  }, []);

  // Memoize children for performance
  const children = useMemo(() => {
    return edited.layout_data.items.map(item => (
      <div key={item.id} className="border border-blue-400 rounded">
        {renderItem(item)}
      </div>
    ));
  }, [edited.layout_data.items, renderItem]);

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 h-14 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between px-4 z-10">
        <h2 className="text-lg font-medium text-white">{edited.title}</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={working}
            className="px-3 py-1.5 rounded border border-green-600 bg-green-700 hover:bg-green-600 text-white disabled:opacity-50"
          >
            {working ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded border border-neutral-600 bg-neutral-700 hover:bg-neutral-600 text-white"
          >
            Close
          </button>
        </div>
      </div>

      {/* Canvas area */}
      <div className="absolute top-14 bottom-0 inset-x-0 p-4 overflow-auto">
        <div 
          className="mx-auto border border-neutral-800 bg-neutral-900"
          style={{ width: design.width, height: design.height }}
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
            isResizable={true}
            margin={[0, 0]}
            containerPadding={[0, 0]}
            useCSSTransforms={true}
            preventCollision={false}
            compactType="vertical"
          >
            {children}
          </ResponsiveGridLayout>
        </div>
      </div>
    </div>
  );
}
