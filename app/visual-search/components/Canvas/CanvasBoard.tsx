"use client";
import React, { useEffect, useRef, useState } from 'react';
import { Draggable } from '@shopify/draggable';
import type { PinnedItem, UnifiedSearchResult } from '../../types';
import { getResultMediaUrl } from '../../utils/mediaUrl';
import { stripCircularDescription } from '../../utils/textCleanup';

// Reuse exact snippet logic from ResultCard
function buildSnippet(r: UnifiedSearchResult): string {
  try {
    const base = r.preview ?? r.description ?? '';
    const raw = typeof base === 'string' ? base : JSON.stringify(base);
    const cleaned = stripCircularDescription(raw, { id: r.id, title: String(r.title ?? ''), type: r.content_type });
    
    if (r.content_type === 'text') {
      const words = cleaned.split(/\s+/);
      return words.length > 70 ? words.slice(0, 70).join(' ') + '...' : cleaned;
    } else {
      return cleaned.length > 100 ? cleaned.substring(0, 97) + '...' : cleaned;
    }
  } catch {
    return '';
  }
}

function CanvasCard({
  item,
  onRemove,
  onOpen,
  onToggleView,
}: {
  item: PinnedItem;
  onRemove: (id: string) => void;
  onOpen: (r: UnifiedSearchResult) => void;
  onToggleView?: (id: string, expanded: boolean) => void;
}) {
  const isExpanded = (item as any).expanded || false;
  const mediaUrl = getResultMediaUrl(item.result);
  const snippet = buildSnippet(item.result);

  if (!isExpanded) {
    // Thumbnail mode - small, click to expand
    return (
      <div 
        className="canvas-card draggable rounded-lg border border-neutral-700 bg-neutral-900/60 shadow-md overflow-hidden cursor-pointer hover:border-neutral-600 transition-colors"
        data-id={item.id}
        data-width="200"
        data-height="160"
        style={{
          position: 'absolute',
          left: item.x,
          top: item.y,
          width: 200,
          height: 160,
          zIndex: item.z,
        }}
        onClick={() => onToggleView?.(item.id, true)}
      >
        {/* Content based on type - EXACTLY like ResultCard */}
        <div className="p-2">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[8px] px-1 py-0.5 border border-neutral-700 bg-neutral-800/60 text-neutral-300">
              {item.result.content_type}
            </div>
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
          <div className="text-xs font-medium text-neutral-100 line-clamp-1 mb-1">
            {item.result.title}
          </div>
          
          {/* Media or text preview */}
          {item.result.content_type === 'image' && mediaUrl && (
            <img
              src={mediaUrl}
              alt={item.result.title}
              className="w-full h-20 object-cover rounded border border-neutral-800"
              draggable={false}
            />
          )}
          {item.result.content_type === 'video' && mediaUrl && (
            <video
              src={mediaUrl}
              className="w-full h-20 object-cover rounded border border-neutral-800 bg-black"
              muted
            />
          )}
          {item.result.content_type === 'audio' && (
            <div className="w-full h-20 flex items-center justify-center rounded border border-neutral-800 bg-neutral-950">
              <div className="text-xs text-neutral-400">🎵 Audio</div>
            </div>
          )}
          {item.result.content_type === 'text' && (
            <div className="w-full h-20 p-2 rounded border border-neutral-800 bg-neutral-900 text-neutral-200 text-[10px] overflow-hidden">
              <p className="line-clamp-6">{snippet}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Expanded mode - full card with controls
  return (
    <div
      className="canvas-card draggable rounded-xl border border-neutral-800 bg-neutral-900/40 shadow-lg overflow-hidden"
      data-id={item.id}
      data-width={item.width}
      data-height={item.height}
      style={{
        position: 'absolute',
        left: item.x,
        top: item.y,
        width: item.width,
        height: item.height,
        zIndex: item.z,
      }}
    >
      {/* Header */}
      <div className="p-3 border-b border-neutral-800 bg-neutral-900/50">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="text-xs px-2 py-1 border border-neutral-700 bg-neutral-800/60 text-neutral-300">
            {item.result.content_type}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onToggleView?.(item.id, false)}
              className="w-6 h-6 flex items-center justify-center text-neutral-400 hover:text-neutral-200 text-xs"
              title="Minimize"
            >
              📐
            </button>
            <button
              onClick={() => onOpen(item.result)}
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
        <div className="text-sm font-medium text-neutral-100 line-clamp-2">
          {item.result.title || 'Untitled'}
        </div>
      </div>

      {/* Content area */}
      <div className="p-3 h-full overflow-auto" style={{ height: 'calc(100% - 80px)' }}>
        {/* Media content */}
        {item.result.content_type === 'image' && mediaUrl && (
          <img
            src={mediaUrl}
            alt={item.result.title}
            className="w-full max-h-60 object-contain rounded border border-neutral-800 mb-3"
            draggable={false}
          />
        )}
        {item.result.content_type === 'video' && mediaUrl && (
          <video
            src={mediaUrl}
            controls
            className="w-full max-h-60 object-contain rounded border border-neutral-800 bg-black mb-3"
          />
        )}
        {item.result.content_type === 'audio' && mediaUrl && (
          <div className="w-full mb-3">
            <audio src={mediaUrl} controls className="w-full" />
          </div>
        )}
        
        {/* Text content/description */}
        {snippet && (
          <div className="text-sm text-neutral-300">
            <p className="whitespace-pre-wrap leading-relaxed">{snippet}</p>
          </div>
        )}
      </div>
    </div>
  );
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
  const canvasRef = useRef<HTMLDivElement>(null);
  const draggableRef = useRef<Draggable | null>(null);
  const [isClient, setIsClient] = useState(false);

  // Ensure we're on the client side
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Calculate dynamic height for modal
  const canvasHeight = React.useMemo(() => {
    if (!isModal) return 640;
    
    const minHeight = 800;
    let maxY = minHeight;
    
    items.forEach(item => {
      const itemBottom = item.y + item.height + 100;
      if (itemBottom > maxY) {
        maxY = itemBottom;
      }
    });
    
    return Math.max(minHeight, maxY);
  }, [items, isModal]);

  // Simple collision detection without external library
  const checkCollision = (x1: number, y1: number, w1: number, h1: number, x2: number, y2: number, w2: number, h2: number) => {
    return !(x1 + w1 <= x2 || x2 + w2 <= x1 || y1 + h1 <= y2 || y2 + h2 <= y1);
  };

  // Initialize draggable
  useEffect(() => {
    if (!canvasRef.current || !isClient) return;

    // Initialize Shopify Draggable
    draggableRef.current = new Draggable(canvasRef.current, {
      draggable: '.draggable',
      delay: { mouse: 0, drag: 0, touch: 150 },
    });

    // Handle drag events with collision detection
    draggableRef.current.on('drag:move', (event) => {
      const target = event.source;
      const itemId = target.getAttribute('data-id');
      if (!itemId) return;

      const rect = target.getBoundingClientRect();
      const canvasRect = canvasRef.current!.getBoundingClientRect();
      
      // Calculate new position relative to canvas
      const newX = rect.left - canvasRect.left;
      const newY = rect.top - canvasRect.top;
      
      // Get item dimensions
      const width = parseInt(target.getAttribute('data-width') || '200');
      const height = parseInt(target.getAttribute('data-height') || '160');
      
      // Check for collisions with other cards
      let hasCollision = false;
      for (const item of items) {
        if (item.id === itemId) continue;
        
        const otherWidth = (item as any).expanded ? item.width : 200;
        const otherHeight = (item as any).expanded ? item.height : 160;
        
        if (checkCollision(newX, newY, width, height, item.x, item.y, otherWidth, otherHeight)) {
          hasCollision = true;
          break;
        }
      }
      
      // If collision detected, find a snap position
      if (hasCollision) {
        const snapPosition = findSnapPosition(itemId, newX, newY, width, height);
        // Prevent the default drag and update position manually
        target.style.transform = `translate3d(${snapPosition.x}px, ${snapPosition.y}px, 0)`;
        onMove(itemId, snapPosition.x, snapPosition.y);
      } else {
        // Check canvas boundaries
        const canvasWidth = canvasRef.current!.offsetWidth;
        const canvasHeight = canvasRef.current!.offsetHeight;
        const boundedX = Math.max(0, Math.min(newX, canvasWidth - width));
        const boundedY = Math.max(0, Math.min(newY, canvasHeight - height));
        
        if (boundedX !== newX || boundedY !== newY) {
          target.style.transform = `translate3d(${boundedX}px, ${boundedY}px, 0)`;
          onMove(itemId, boundedX, boundedY);
        }
      }
    });

    draggableRef.current.on('drag:stop', (event) => {
      const target = event.source;
      const itemId = target.getAttribute('data-id');
      if (!itemId) return;

      const rect = target.getBoundingClientRect();
      const canvasRect = canvasRef.current!.getBoundingClientRect();
      
      const finalX = rect.left - canvasRect.left;
      const finalY = rect.top - canvasRect.top;
      
      onMove(itemId, finalX, finalY);
    });

    return () => {
      if (draggableRef.current) {
        draggableRef.current.destroy();
      }
    };
  }, [items, onMove, isClient]);

  const findSnapPosition = (movingId: string, x: number, y: number, width: number, height: number) => {
    const GAP = 12;
    let bestPosition = { x, y };
    let minDistance = Infinity;

    for (const item of items) {
      if (item.id === movingId) continue;
      
      const itemWidth = (item as any).expanded ? item.width : 200;
      const itemHeight = (item as any).expanded ? item.height : 160;
      
      // Try snapping to the 4 sides of this card
      const snapPositions = [
        { x: item.x - width - GAP, y: item.y }, // Left
        { x: item.x + itemWidth + GAP, y: item.y }, // Right
        { x: item.x, y: item.y - height - GAP }, // Top
        { x: item.x, y: item.y + itemHeight + GAP }, // Bottom
      ];

      for (const snapPos of snapPositions) {
        // Ensure position is within canvas bounds
        const canvasWidth = canvasRef.current?.offsetWidth || 800;
        const canvasHeight = canvasRef.current?.offsetHeight || 640;
        const boundedX = Math.max(0, Math.min(snapPos.x, canvasWidth - width));
        const boundedY = Math.max(0, Math.min(snapPos.y, canvasHeight - height));
        
        // Check if this position would cause overlap with other items
        let wouldCollide = false;
        
        for (const item of items) {
          if (item.id === movingId) continue;
          
          const otherWidth = (item as any).expanded ? item.width : 200;
          const otherHeight = (item as any).expanded ? item.height : 160;
          
          if (checkCollision(boundedX, boundedY, width, height, item.x, item.y, otherWidth, otherHeight)) {
            wouldCollide = true;
            break;
          }
        }
        
        if (!wouldCollide) {
          const distance = Math.sqrt(Math.pow(boundedX - x, 2) + Math.pow(boundedY - y, 2));
          if (distance < minDistance) {
            minDistance = distance;
            bestPosition = { x: boundedX, y: boundedY };
          }
        }
      }
    }

    return bestPosition;
  };

  // Show loading state during SSR
  if (!isClient) {
    return (
      <div className="relative w-full h-[640px] rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden flex items-center justify-center">
        <div className="text-neutral-400">Loading canvas...</div>
      </div>
    );
  }

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
            ref={canvasRef}
            className="relative w-full bg-neutral-950 overflow-auto"
            style={{ height: `${canvasHeight}px` }}
          >
            {items.map((item) => (
              <CanvasCard
                key={item.id}
                item={item}
                onRemove={onRemove}
                onOpen={onOpen}
                onToggleView={onToggleView}
              />
            ))}
            
            {/* Grid overlay */}
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

  // Non-modal version
  return (
    <div 
      ref={canvasRef}
      className="relative w-full h-[640px] rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden"
    >
      {items.map((item) => (
        <CanvasCard
          key={item.id}
          item={item}
          onRemove={onRemove}
          onOpen={onOpen}
          onToggleView={onToggleView}
        />
      ))}
      
      {/* Grid overlay */}
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
  );
}