"use client";
import React, { useRef, useState } from 'react';
import type { PinnedItem, UnifiedSearchResult } from '../../types';
import { getResultMediaUrl } from '../../utils/mediaUrl';
import { stripCircularDescription } from '../../utils/textCleanup';

function MediaPreview({ r }: { r: UnifiedSearchResult }) {
  const mediaUrl = getResultMediaUrl(r);
  if (r.content_type === 'image' && mediaUrl) {
    return (
      <img
        src={mediaUrl}
        alt={r.title}
        className="w-full h-32 object-cover rounded-md border border-neutral-800"
        draggable={false}
        loading="lazy"
      />
    );
  }
  if (r.content_type === 'video' && mediaUrl) {
    return (
      <video src={mediaUrl} controls className="w-full h-32 object-cover rounded-md border border-neutral-800 bg-black" />
    );
  }
  if (r.content_type === 'audio' && mediaUrl) {
    return (
      <div className="w-full h-32 flex items-center justify-center rounded-md border border-neutral-800 bg-neutral-950">
        <audio src={mediaUrl} controls className="w-full px-2" />
      </div>
    );
  }
  return null;
}

export default function CanvasBoard({
  items,
  onMove,
  onRemove,
  onOpen,
  onResize,
  onToggleView,
}: {
  items: PinnedItem[];
  onMove: (id: string, x: number, y: number) => void;
  onRemove: (id: string) => void;
  onOpen: (r: UnifiedSearchResult) => void;
  onResize?: (id: string, width: number, height: number) => void;
  onToggleView?: (id: string, expanded: boolean) => void;
}) {
  return (
    <div className="relative w-full h-[640px] rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden">
      {items.map((item) => (
        <Pinned 
          key={item.id} 
          item={item} 
          items={items}
          onMove={onMove} 
          onRemove={onRemove} 
          onOpen={onOpen}
          onResize={onResize}
          onToggleView={onToggleView}
        />
      ))}
    </div>
  );
}

function Pinned({
  item,
  items,
  onMove,
  onRemove,
  onOpen,
  onResize,
  onToggleView,
}: {
  item: PinnedItem;
  items: PinnedItem[];
  onMove: (id: string, x: number, y: number) => void;
  onRemove: (id: string) => void;
  onOpen: (r: UnifiedSearchResult) => void;
  onResize?: (id: string, width: number, height: number) => void;
  onToggleView?: (id: string, expanded: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);
  const resizing = useRef(false);
  const offset = useRef({ x: 0, y: 0 });
  const [isExpanded, setIsExpanded] = useState((item as any).expanded || false);

  // Snap settings
  const SNAP_DISTANCE = 20;
  const SNAP_TOLERANCE = 10;

  // Find nearby cards for snapping
  const findSnapPosition = (newX: number, newY: number) => {
    let snapX = newX;
    let snapY = newY;

    for (const otherItem of items) {
      if (otherItem.id === item.id) continue;

      const otherRight = otherItem.x + otherItem.width;
      const otherBottom = otherItem.y + otherItem.height;
      const currentRight = newX + item.width;
      const currentBottom = newY + item.height;

      // Horizontal snapping
      if (Math.abs(newY - otherItem.y) < SNAP_TOLERANCE || 
          Math.abs(currentBottom - otherBottom) < SNAP_TOLERANCE ||
          (newY < otherBottom && currentBottom > otherItem.y)) {
        
        // Snap to left edge
        if (Math.abs(newX - otherRight) < SNAP_DISTANCE) {
          snapX = otherRight;
        }
        // Snap to right edge  
        else if (Math.abs(currentRight - otherItem.x) < SNAP_DISTANCE) {
          snapX = otherItem.x - item.width;
        }
      }

      // Vertical snapping
      if (Math.abs(newX - otherItem.x) < SNAP_TOLERANCE ||
          Math.abs(currentRight - otherRight) < SNAP_TOLERANCE ||
          (newX < otherRight && currentRight > otherItem.x)) {
        
        // Snap to top edge
        if (Math.abs(newY - otherBottom) < SNAP_DISTANCE) {
          snapY = otherBottom;
        }
        // Snap to bottom edge
        else if (Math.abs(currentBottom - otherItem.y) < SNAP_DISTANCE) {
          snapY = otherItem.y - item.height;
        }
      }
    }

    return { x: snapX, y: snapY };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!ref.current || resizing.current) return;
    
    const rect = ref.current.getBoundingClientRect();
    const isResizeHandle = (e.target as Element).classList.contains('resize-handle');
    
    if (isResizeHandle) {
      resizing.current = true;
      offset.current = { x: e.clientX, y: e.clientY };
    } else {
      dragging.current = true;
      offset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const parentRect = ref.current?.parentElement?.getBoundingClientRect();
    if (!parentRect) return;

    if (resizing.current && onResize) {
      const deltaX = e.clientX - offset.current.x;
      const deltaY = e.clientY - offset.current.y;
      const newWidth = Math.max(200, item.width + deltaX);
      const newHeight = Math.max(150, item.height + deltaY);
      
      onResize(item.id, newWidth, newHeight);
      offset.current = { x: e.clientX, y: e.clientY };
    } 
    else if (dragging.current) {
      const newX = e.clientX - offset.current.x - parentRect.left;
      const newY = e.clientY - offset.current.y - parentRect.top;
      
      const snappedPos = findSnapPosition(Math.max(0, newX), Math.max(0, newY));
      onMove(item.id, snappedPos.x, snappedPos.y);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    dragging.current = false;
    resizing.current = false;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  };

  const toggleExpanded = () => {
    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);
    onToggleView?.(item.id, newExpanded);
  };

    if (!isExpanded) {
    // Thumbnail view - minimal card with just image/media
    return (
      <div
        ref={ref}
        className="absolute rounded-lg border border-neutral-700 bg-neutral-900/60 shadow-md overflow-hidden cursor-pointer hover:border-neutral-600 transition-colors"
        style={{ left: item.x, top: item.y, width: 120, height: 100, zIndex: item.z }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onClick={toggleExpanded}
      >
        <div className="w-full h-full relative">
          <MediaPreview r={item.result} />
          <div className="absolute top-1 left-1 text-[8px] px-1 py-0.5 bg-black/70 text-white rounded">
            {item.result.content_type}
          </div>
          <div className="absolute top-1 right-1">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onRemove(item.id);
              }}
              className="w-4 h-4 flex items-center justify-center text-neutral-300 hover:text-white bg-black/70 rounded text-[8px]"
              title="Remove"
            >
              ❌
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Expanded view - full card with all content
  return (
    <div
      ref={ref}
      className="absolute rounded-xl border border-neutral-800 bg-neutral-900/40 shadow-lg overflow-hidden"
      style={{ left: item.x, top: item.y, width: item.width, height: item.height, zIndex: item.z }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Header */}
      <div className="p-2 border-b border-neutral-800 flex items-center justify-between gap-2 bg-neutral-900/50">
        <div className="flex items-center gap-2">
          <div className="text-[10px] px-1.5 py-0.5 border border-neutral-700 bg-neutral-800/60 text-neutral-300">
            {item.result.content_type}
          </div>
          <div className="text-xs text-neutral-300 truncate" title={item.result.title}>
            {item.result.title}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleExpanded}
            className="w-4 h-4 flex items-center justify-center text-neutral-400 hover:text-neutral-200 text-[10px]"
            title="Minimize to thumbnail"
          >
            📐
          </button>
          <button
            onClick={() => {
              try {
                if (item?.result && typeof item.result === 'object' && (item.result as any).id) {
                  onOpen(item.result);
                }
              } catch (e) {
                console.error('Canvas expand error:', e);
              }
            }}
            className="w-4 h-4 flex items-center justify-center text-neutral-400 hover:text-neutral-200 text-[10px]"
            title="Full expand"
          >
            ➕
          </button>
          <button 
            onClick={() => onRemove(item.id)} 
            className="w-4 h-4 flex items-center justify-center text-neutral-400 hover:text-neutral-200 text-[10px]"
            title="Remove"
          >
            ❌
          </button>
        </div>
      </div>

      {/* Media Content */}
      <div className="p-2" style={{ height: 'calc(100% - 80px)' }}>
        <div className="w-full h-full">
          <MediaPreview r={item.result} />
        </div>
      </div>

      {/* Description */}
      <div className="p-2 pt-0 h-12 overflow-hidden">
        {(() => {
          const base = item.result.preview ?? item.result.description ?? '';
          const raw = typeof base === 'string' ? base : JSON.stringify(base);
          const cleaned = stripCircularDescription(raw, { 
            id: item.result.id, 
            title: String(item.result.title ?? ''), 
            type: item.result.content_type 
          });
          
          const snippet = item.result.content_type === 'text' 
            ? (cleaned.split(/\s+/).length > 30 ? cleaned.split(/\s+/).slice(0, 30).join(' ') + '...' : cleaned)
            : (cleaned.length > 60 ? cleaned.substring(0, 57) + '...' : cleaned);
            
          return snippet ? (
            <p className="text-xs text-neutral-300 line-clamp-2">
              {snippet}
            </p>
          ) : null;
        })()}
      </div>

      {/* Resize Handle */}
      {onResize && (
        <div 
          className="resize-handle absolute bottom-0 right-0 w-4 h-4 cursor-se-resize bg-neutral-700 hover:bg-neutral-600 opacity-60 hover:opacity-100 transition-opacity"
          style={{ 
            clipPath: 'polygon(100% 0%, 0% 100%, 100% 100%)',
          }}
          title="Drag to resize"
        />
      )}
    </div>
  );
}



