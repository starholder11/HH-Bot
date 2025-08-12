"use client";
import React, { useMemo } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  useDraggable,
  useDroppable,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  restrictToParentElement,
  restrictToWindowEdges,
} from '@dnd-kit/modifiers';
import type { PinnedItem, UnifiedSearchResult } from '../../types';
import { getResultMediaUrl } from '../../utils/mediaUrl';
import { stripCircularDescription } from '../../utils/textCleanup';

// Helper function to build snippet just like ResultCard does
function buildSnippet(r: UnifiedSearchResult, opts?: { wordLimit?: number; charLimit?: number }) {
  const wordLimit = opts?.wordLimit ?? 70;
  const charLimit = opts?.charLimit ?? 100;

  try {
    // Use the same logic as ResultCard for consistency
    let base = r.preview ?? r.description;

    // For text content, also check searchable_text which contains the actual content
    if (!base && r.content_type === 'text') {
      // Check searchable_text first (main content), then metadata fields
      base = (r as any).searchable_text
        ?? (r as any).metadata?.content_text
        ?? (r as any).metadata?.content
        ?? (r as any).metadata?.description
        ?? (r as any).metadata?.summary;
    }

    const raw = typeof base === 'string' ? base : (base ? JSON.stringify(base) : '');
    const cleaned = stripCircularDescription(raw, { id: r.id, title: String(r.title ?? ''), type: r.content_type });

    if (r.content_type === 'text') {
      const words = cleaned.split(/\s+/);
      return words.length > wordLimit ? words.slice(0, wordLimit).join(' ') + '...' : cleaned;
    }
    return cleaned.length > charLimit ? cleaned.slice(0, charLimit - 3) + '...' : cleaned;
  } catch {
    return '';
  }
}

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

  // For text content, don't show media preview - content goes in description section
  return null;
}

function DraggableCard({
  item,
  onRemove,
  onOpen,
  onResize,
  onToggleView,
}: {
  item: PinnedItem;
  onRemove: (id: string) => void;
  onOpen: (r: UnifiedSearchResult) => void;
  onResize?: (id: string, width: number, height: number) => void;
  onToggleView?: (id: string, expanded: boolean) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: item.id,
  });

  const isExpanded = (item as any).expanded || false;

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  const toggleExpanded = () => {
    const newExpanded = !isExpanded;
    onToggleView?.(item.id, newExpanded);
  };

  if (!isExpanded) {
    // Thumbnail view
    return (
      <div
        ref={setNodeRef}
        style={{
          ...style,
          position: 'absolute',
          left: item.x,
          top: item.y,
          width: 200,
          height: 160,
          zIndex: item.z,
          opacity: isDragging ? 0.5 : 1,
        }}
        {...listeners}
        {...attributes}
        className="rounded-lg border border-neutral-700 bg-neutral-900/60 shadow-md overflow-hidden cursor-pointer hover:border-neutral-600 transition-colors"
        onClick={toggleExpanded}
      >
        <div className="w-full h-full relative">
          <MediaPreview r={item.result} expanded={false} />

          {/* For text content, show snippet since no media */}
          {item.result.content_type === 'text' && (
            <div className="w-full h-full p-2 rounded-md border border-neutral-800 bg-neutral-900 text-neutral-200 text-xs overflow-y-auto">
              <p className="line-clamp-6">{buildSnippet(item.result, { wordLimit: 20 })}</p>
            </div>
          )}

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

  // Expanded view
  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        position: 'absolute',
        left: item.x,
        top: item.y,
        width: item.width,
        height: item.height,
        zIndex: item.z,
        opacity: isDragging ? 0.5 : 1,
      }}
      {...listeners}
      {...attributes}
      className="rounded-xl border border-neutral-800 bg-neutral-900/40 shadow-lg overflow-hidden"
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
        <div className="text-sm font-medium text-neutral-100 line-clamp-2" title={item.result.title}>
          {item.result.title || 'Untitled'}
        </div>
      </div>

      {/* Media Content (only for non-text) */}
      {item.result.content_type !== 'text' && (
        <div className="p-3" style={{ height: 'calc(100% - 180px)' }}>
          <div className="w-full h-full">
            <MediaPreview r={item.result} expanded={true} />
          </div>
        </div>
      )}

      {/* Description/Content */}
      <div className={`p-3 ${item.result.content_type === 'text' ? 'pt-0' : ''} overflow-hidden ${item.result.content_type === 'text' ? 'flex-1' : 'h-16'}`}>
        {(() => {
          const snippet = buildSnippet(item.result, {
            wordLimit: item.result.content_type === 'text' ? 200 : 30,
            charLimit: 100
          });

          return snippet ? (
            <p className={`text-xs text-neutral-300 ${item.result.content_type === 'text' ? 'line-clamp-12' : 'line-clamp-2'}`}>
              {snippet}
            </p>
          ) : null;
        })()}
      </div>

      {/* Resize Handle */}
      {onResize && (
        <div
          className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize bg-neutral-700 hover:bg-neutral-600 opacity-60 hover:opacity-100 transition-opacity"
          style={{
            clipPath: 'polygon(100% 0%, 0% 100%, 100% 100%)',
          }}
          title="Drag to resize"
          onPointerDown={(e) => {
            e.stopPropagation();
            // Implement resize logic if needed
          }}
        />
      )}
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
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  );

  // Calculate dynamic height based on item positions
  const canvasHeight = useMemo(() => {
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

  const [activeId, setActiveId] = React.useState<string | null>(null);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, delta } = event;

    if (delta.x !== 0 || delta.y !== 0) {
      const item = items.find(i => i.id === active.id);
      if (item) {
        // Calculate new position with bounds checking
        const newX = Math.max(0, item.x + delta.x);
        const newY = Math.max(0, item.y + delta.y);
        onMove(item.id, newX, newY);
      }
    }

    setActiveId(null);
  }

  const {
    setNodeRef: setDroppableRef,
  } = useDroppable({
    id: 'canvas-droppable',
  });

  const activeItem = activeId ? items.find(item => item.id === activeId) : null;

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
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            modifiers={[restrictToParentElement]}
          >
            <div
              ref={setDroppableRef}
              className="relative w-full bg-neutral-950 overflow-auto"
              style={{ height: `${canvasHeight}px` }}
            >
              {items.map((item) => (
                <DraggableCard
                  key={item.id}
                  item={item}
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

            <DragOverlay>
              {activeItem ? (
                <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 shadow-lg opacity-75">
                  <div className="p-2 text-center text-neutral-300 text-sm">
                    Moving {activeItem.result.title || 'Item'}...
                  </div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      </div>
    );
  }

  // Non-modal version
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToParentElement]}
    >
      <div
        ref={setDroppableRef}
        className="relative w-full h-[640px] rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden"
      >
        {items.map((item) => (
          <DraggableCard
            key={item.id}
            item={item}
            onRemove={onRemove}
            onOpen={onOpen}
            onResize={onResize}
            onToggleView={onToggleView}
          />
        ))}
      </div>

      <DragOverlay>
        {activeItem ? (
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 shadow-lg opacity-75">
            <div className="p-2 text-center text-neutral-300 text-sm">
              Moving {activeItem.result.title || 'Item'}...
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
