"use client";
import React, { useRef, useState } from 'react';
import type { PinnedItem, UnifiedSearchResult } from '../../types';
import { getResultMediaUrl } from '../../utils/mediaUrl';
import { stripCircularDescription } from '../../utils/textCleanup';

function MediaPreview({ r, expanded = false }: { r: UnifiedSearchResult; expanded?: boolean }) {
  const mediaUrl = getResultMediaUrl(r);
  const heightClass = expanded ? "h-full" : "h-32";
  
  if (r.content_type === 'image' && mediaUrl) {
    return (
      <img
        src={mediaUrl}
        alt={r.title}
        className={`w-full ${heightClass} object-cover rounded-md border border-neutral-800`}
        draggable={false}
        loading="lazy"
      />
    );
  }
  if (r.content_type === 'video' && mediaUrl) {
    return (
      <video 
        src={mediaUrl} 
        controls 
        className={`w-full ${heightClass} object-cover rounded-md border border-neutral-800 bg-black`} 
      />
    );
  }
  if (r.content_type === 'audio' && mediaUrl) {
    return (
      <div className={`w-full ${heightClass} flex items-center justify-center rounded-md border border-neutral-800 bg-neutral-950`}>
        <audio src={mediaUrl} controls className="w-full px-2" />
      </div>
    );
  }
  if (r.content_type === 'text') {
    // Debug: Log the entire result object to see what we're working with
    console.log('DEBUG: Text card result object:', r);
    
    // Try multiple sources for text content with extensive debugging
    let content = '';
    let debugInfo = [];
    
    // Check every possible property
    const possibleSources = ['preview', 'description', 'content', 'text', 'body', 'summary', 'excerpt'];
    
    for (const prop of possibleSources) {
      const value = (r as any)[prop];
      debugInfo.push(`${prop}: ${typeof value} - ${value ? String(value).substring(0, 50) : 'null/undefined'}`);
      
      if (value && typeof value === 'string' && value.trim()) {
        content = value;
        console.log(`DEBUG: Found text content in ${prop}:`, value.substring(0, 100));
        break;
      } else if (value && typeof value === 'object') {
        for (const subProp of ['content', 'text', 'body', 'value']) {
          if (value[subProp] && typeof value[subProp] === 'string' && value[subProp].trim()) {
            content = value[subProp];
            console.log(`DEBUG: Found text content in ${prop}.${subProp}:`, content.substring(0, 100));
            break;
          }
        }
        if (content) break;
      }
    }
    
    // Fallback to title
    if (!content && r.title && typeof r.title === 'string' && r.title.trim()) {
      content = r.title;
      debugInfo.push('Used title as fallback');
    }
    
    console.log('DEBUG: Text extraction info:', debugInfo);
    
    // Clean the text
    const cleanedText = content ? stripCircularDescription(content, {
      id: r.id,
      title: String(r.title ?? ''),
      type: r.content_type
    }) : '';
    
    return (
      <div className={`w-full ${heightClass} p-3 rounded-md border border-neutral-800 bg-neutral-900 text-neutral-200 text-sm overflow-y-auto`}>
        <div className="whitespace-pre-wrap leading-relaxed">
          {cleanedText || (
            <div>
              <div>DEBUG: No text content found</div>
              <div className="text-xs mt-2 opacity-50">
                {debugInfo.join('; ')}
              </div>
              <div className="text-xs mt-1 opacity-50">
                Title: {r.title || 'none'}
              </div>
            </div>
          )}
        </div>
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
  isModal = false,
  onClose,
}: {
  items: PinnedItem[];
  onMove: (id: string, x: number, y: number) => void;
  onRemove: (id: string) => void;
  onOpen: (r: UnifiedSearchResult) => void;
  onResize?: (id: string, width: number, height: number) => void;
  onToggleView?: (id: string, expanded: boolean) => void;
  isModal?: boolean;
  onClose?: () => void;
}) {
  // Calculate dynamic height based on item positions
  const canvasHeight = React.useMemo(() => {
    if (!isModal) return 640;
    
    const minHeight = 800;
    let maxY = minHeight;
    
    items.forEach(item => {
      const itemBottom = item.y + item.height + 100; // Add 100px padding
      if (itemBottom > maxY) {
        maxY = itemBottom;
      }
    });
    
    return Math.max(minHeight, maxY);
  }, [items, isModal]);

  if (isModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/80 backdrop-blur-sm">
        <div className="w-full max-w-7xl mx-auto mt-8 mb-8 bg-neutral-950 rounded-xl border border-neutral-800 shadow-2xl overflow-hidden">
          {/* Modal Header */}
          <div className="flex items-center justify-between p-4 border-b border-neutral-800 bg-neutral-900/50">
            <h2 className="text-lg font-semibold text-neutral-100">Freeform Canvas</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors"
              title="Close canvas"
            >
              ❌
            </button>
          </div>
          
          {/* Canvas Area */}
          <div 
            className="relative w-full bg-neutral-950 overflow-auto"
            style={{ height: `${canvasHeight}px` }}
          >
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
            
            {/* Grid overlay for visual reference */}
            <div 
              className="absolute inset-0 pointer-events-none opacity-10"
              style={{
                backgroundImage: `
                  linear-gradient(to right, #374151 1px, transparent 1px),
                  linear-gradient(to bottom, #374151 1px, transparent 1px)
                `,
                backgroundSize: '50px 50px'
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  // Non-modal version (fallback)
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
  const SNAP_DISTANCE = 25;

  // Find nearby cards and borders for snapping
  const findSnapPosition = (newX: number, newY: number) => {
    console.log(`DEBUG: findSnapPosition called with newX=${newX}, newY=${newY}`);
    
    let snapX = newX;
    let snapY = newY;
    
    // Get canvas dimensions
    const canvasElement = ref.current?.parentElement;
    if (!canvasElement) {
      console.log('DEBUG: No canvas element found');
      return { x: snapX, y: snapY };
    }
    
    const canvasRect = canvasElement.getBoundingClientRect();
    const canvasWidth = canvasRect.width;
    const canvasHeight = canvasRect.height;
    
    console.log(`DEBUG: Canvas dimensions: ${canvasWidth}x${canvasHeight}`);

    const currentRight = newX + item.width;
    const currentBottom = newY + item.height;

    // Snap to canvas borders
    const leftDist = Math.abs(newX - 0);
    const rightDist = Math.abs(currentRight - canvasWidth);
    const topDist = Math.abs(newY - 0);
    const bottomDist = Math.abs(currentBottom - canvasHeight);
    
    console.log(`DEBUG: Border distances - left:${leftDist}, right:${rightDist}, top:${topDist}, bottom:${bottomDist}`);

    if (leftDist < SNAP_DISTANCE) {
      snapX = 0;
      console.log('DEBUG: Snapped to left border');
    }
    if (rightDist < SNAP_DISTANCE) {
      snapX = canvasWidth - item.width;
      console.log('DEBUG: Snapped to right border');
    }
    if (topDist < SNAP_DISTANCE) {
      snapY = 0;
      console.log('DEBUG: Snapped to top border');
    }
    if (bottomDist < SNAP_DISTANCE) {
      snapY = canvasHeight - item.height;
      console.log('DEBUG: Snapped to bottom border');
    }

    // Snap to other cards - ONLY if no border snap occurred
    if (snapX === newX && snapY === newY) {
      for (const otherItem of items) {
        if (otherItem.id === item.id) continue;

        const otherRight = otherItem.x + otherItem.width;
        const otherBottom = otherItem.y + otherItem.height;

        // Simple adjacent snapping - place cards next to each other
        
        // Horizontal snapping (left/right of other card)
        const leftEdgeDist = Math.abs(currentRight - otherItem.x);
        const rightEdgeDist = Math.abs(newX - otherRight);
        
        if (leftEdgeDist < SNAP_DISTANCE) {
          // Check if there's vertical overlap that would make this placement valid
          const verticalOverlap = !(currentBottom <= otherItem.y || newY >= otherBottom);
          if (verticalOverlap) {
            snapX = otherItem.x - item.width; // Place to the left
            console.log(`DEBUG: Snapped to left of card ${otherItem.id}`);
          }
        }
        
        if (rightEdgeDist < SNAP_DISTANCE) {
          const verticalOverlap = !(currentBottom <= otherItem.y || newY >= otherBottom);
          if (verticalOverlap) {
            snapX = otherRight; // Place to the right
            console.log(`DEBUG: Snapped to right of card ${otherItem.id}`);
          }
        }

        // Vertical snapping (above/below other card)
        const topEdgeDist = Math.abs(currentBottom - otherItem.y);
        const bottomEdgeDist = Math.abs(newY - otherBottom);
        
        if (topEdgeDist < SNAP_DISTANCE) {
          const horizontalOverlap = !(currentRight <= otherItem.x || newX >= otherRight);
          if (horizontalOverlap) {
            snapY = otherItem.y - item.height; // Place above
            console.log(`DEBUG: Snapped above card ${otherItem.id}`);
          }
        }
        
        if (bottomEdgeDist < SNAP_DISTANCE) {
          const horizontalOverlap = !(currentRight <= otherItem.x || newX >= otherRight);
          if (horizontalOverlap) {
            snapY = otherBottom; // Place below
            console.log(`DEBUG: Snapped below card ${otherItem.id}`);
          }
        }
      }
    }

    console.log(`DEBUG: Final snap position: ${snapX}, ${snapY}`);
    return { x: snapX, y: snapY };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!ref.current || resizing.current) return;
    
    const rect = ref.current.getBoundingClientRect();
    const isResizeHandle = (e.target as Element).classList.contains('resize-handle');
    
    console.log(`DEBUG: PointerDown - isResizeHandle: ${isResizeHandle}`);
    
    if (isResizeHandle) {
      resizing.current = true;
      offset.current = { x: e.clientX, y: e.clientY };
      console.log('DEBUG: Set resizing mode');
    } else {
      dragging.current = true;
      offset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      console.log('DEBUG: Set dragging mode');
    }
    
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const parentRect = ref.current?.parentElement?.getBoundingClientRect();
    if (!parentRect) return;

    if (resizing.current && onResize) {
      console.log('DEBUG: Resizing...');
      const deltaX = e.clientX - offset.current.x;
      const deltaY = e.clientY - offset.current.y;
      const newWidth = Math.max(200, item.width + deltaX);
      const newHeight = Math.max(150, item.height + deltaY);
      
      onResize(item.id, newWidth, newHeight);
      offset.current = { x: e.clientX, y: e.clientY };
    } 
    else if (dragging.current) {
      console.log('DEBUG: Dragging detected...');
      const newX = e.clientX - offset.current.x - parentRect.left;
      const newY = e.clientY - offset.current.y - parentRect.top;
      
      console.log(`DEBUG: Raw position: ${newX}, ${newY}`);
      const snappedPos = findSnapPosition(Math.max(0, newX), Math.max(0, newY));
      console.log(`DEBUG: Calling onMove with: ${snappedPos.x}, ${snappedPos.y}`);
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
        style={{ left: item.x, top: item.y, width: 200, height: 160, zIndex: item.z }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onClick={toggleExpanded}
      >
        <div className="w-full h-full relative">
          <MediaPreview r={item.result} expanded={false} />
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
      <div className="p-3 border-b border-neutral-800 bg-neutral-900/50">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="text-xs px-2 py-1 border border-neutral-700 bg-neutral-800/60 text-neutral-300">
            {item.result.content_type}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={toggleExpanded}
              className="w-6 h-6 flex items-center justify-center text-neutral-400 hover:text-neutral-200 text-xs"
              title="Minimize to thumbnail"
            >
              📐
            </button>
            <button
              onClick={() => {
                // Expand the card to show more content
                if (onResize) {
                  const newWidth = Math.min(item.width * 1.5, 800);
                  const newHeight = Math.min(item.height * 1.5, 600);
                  onResize(item.id, newWidth, newHeight);
                }
              }}
              className="w-6 h-6 flex items-center justify-center text-neutral-400 hover:text-neutral-200 text-xs"
              title="Expand card size"
            >
              ➕
            </button>
            <button
              onClick={() => {
                try {
                  if (item?.result && typeof item.result === 'object' && (item.result as any).id) {
                    onOpen(item.result);
                  }
                } catch (e) {
                  console.error('Canvas detail view error:', e);
                }
              }}
              className="w-6 h-6 flex items-center justify-center text-neutral-400 hover:text-neutral-200 text-xs"
              title="View details"
            >
              🔍
            </button>
            <button 
              onClick={() => onRemove(item.id)} 
              className="w-6 h-6 flex items-center justify-center text-neutral-400 hover:text-neutral-200 text-xs"
              title="Remove"
            >
              ❌
            </button>
          </div>
        </div>
        {/* Title */}
        <div className="text-sm font-medium text-neutral-100 line-clamp-2" title={item.result.title}>
          {item.result.title || 'Untitled'}
        </div>
      </div>

      {/* Media Content */}
      <div className="p-3" style={{ height: 'calc(100% - 120px)' }}>
        <div className="w-full h-full">
          <MediaPreview r={item.result} expanded={true} />
        </div>
      </div>

      {/* Description */}
      <div className="p-3 pt-0 h-16 overflow-hidden">
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



