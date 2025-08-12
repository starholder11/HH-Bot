"use client";
import React, { useMemo } from "react";
import type { PinnedItem, UnifiedSearchResult } from "../../types";
import { getResultMediaUrl } from "../../utils/mediaUrl";
import { stripCircularDescription } from "../../utils/textCleanup";
import { WidthProvider, Responsive, type Layout, type Layouts } from "react-grid-layout";

const ResponsiveGridLayout = WidthProvider(Responsive);

// Grid cell size - small to feel freeform-ish but prevent collision hell
const CELL = 20;
const MARGIN: [number, number] = [8, 8];

// Reuse exact snippet logic from ResultCard
function buildSnippet(r: UnifiedSearchResult): string {
  try {
    const base = r.preview ?? r.description ?? "";
    const raw = typeof base === "string" ? base : JSON.stringify(base);
    const cleaned = stripCircularDescription(raw, { id: r.id, title: String(r.title ?? ""), type: r.content_type });

    if (r.content_type === "text") {
      const words = cleaned.split(/\s+/);
      return words.length > 70 ? words.slice(0, 70).join(" ") + "..." : cleaned;
    } else {
      return cleaned.length > 100 ? cleaned.substring(0, 97) + "..." : cleaned;
    }
  } catch {
    return "";
  }
}

function CanvasCard({
  item,
  onRemove,
  onOpen,
  onToggleView
}: {
  item: PinnedItem & { expanded?: boolean };
  onRemove: (id: string) => void;
  onOpen: (r: UnifiedSearchResult) => void;
  onToggleView?: (id: string, expanded: boolean) => void;
}) {
  const r = item.result;
  const mediaUrl = getResultMediaUrl(r);
  const snippet = buildSnippet(r);
  const isExpanded = (item as any).expanded ?? false;

  return (
    <div className="h-full w-full rounded-xl border border-neutral-800 bg-neutral-900/40 shadow overflow-hidden flex flex-col hover:bg-neutral-900 transition-colors">
      {/* Header */}
      <div className="p-2 border-b border-neutral-800 bg-neutral-900/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="text-[10px] px-2 py-0.5 border border-neutral-700 bg-neutral-800/60 text-neutral-300">
            {r.content_type}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {onToggleView && (
            <button
              onClick={() => onToggleView(item.id, !isExpanded)}
              className="w-6 h-6 flex items-center justify-center text-neutral-400 hover:text-neutral-200 text-xs"
              title={isExpanded ? "Minimize" : "Expand"}
            >
              {isExpanded ? "📐" : "➕"}
            </button>
          )}
          <button
            onClick={() => onOpen(r)}
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
      <div className="px-2 py-1">
        <div className="text-xs font-medium text-neutral-100 line-clamp-1" title={r.title}>
          {r.title}
        </div>
      </div>

      {/* Content */}
      <div className="p-2 flex-1 overflow-auto">
        {/* Media */}
        {r.content_type === "image" && mediaUrl && (
          <img
            src={mediaUrl}
            alt={r.title}
            className="w-full max-h-40 object-contain rounded border border-neutral-800 mb-2"
            draggable={false}
          />
        )}
        {r.content_type === "video" && mediaUrl && (
          <video
            src={mediaUrl}
            controls={isExpanded}
            className="w-full max-h-40 object-contain rounded border border-neutral-800 bg-black mb-2"
          />
        )}
        {r.content_type === "audio" && (
          <div className="w-full mb-2">
            {mediaUrl && isExpanded ? (
              <audio src={mediaUrl} controls className="w-full" />
            ) : (
              <div className="text-sm text-neutral-400 text-center py-4">🎵 Audio</div>
            )}
          </div>
        )}

        {/* Text/snippet */}
        {snippet && (
          <p className="text-xs text-neutral-300 whitespace-pre-wrap leading-relaxed line-clamp-3">
            {snippet}
          </p>
        )}
      </div>
    </div>
  );
}

export default function CanvasBoardRGL({
  items,
  onMove,
  onRemove,
  onOpen,
  onResize,
  onToggleView,
  isModal = false,
  onClose,
}: {
  items: (PinnedItem & { expanded?: boolean })[];
  onMove: (id: string, x: number, y: number) => void;
  onRemove: (id: string) => void;
  onOpen: (r: UnifiedSearchResult) => void;
  onResize?: (id: string, width: number, height: number) => void;
  onToggleView?: (id: string, expanded: boolean) => void;
  isModal?: boolean;
  onClose?: () => void;
}) {
  // Convert PinnedItem px coordinates to RGL grid cells
  const layouts: Layouts = useMemo(() => {
    const lg: Layout[] = items.map((p) => {
      // Default sizes based on expanded state
      const isExpanded = (p as any).expanded ?? false;
      const defaultW = isExpanded ? Math.max(10, Math.round(560 / CELL)) : Math.max(6, Math.round(280 / CELL));
      const defaultH = isExpanded ? Math.max(8, Math.round(440 / CELL)) : Math.max(6, Math.round(220 / CELL));

      const wCells = Math.max(4, Math.round((p.width || (isExpanded ? 560 : 280)) / CELL));
      const hCells = Math.max(4, Math.round((p.height || (isExpanded ? 440 : 220)) / CELL));
      const xCells = Math.max(0, Math.round((p.x || 0) / CELL));
      const yCells = Math.max(0, Math.round((p.y || 0) / CELL));

      return {
        i: p.id,
        x: xCells,
        y: yCells,
        w: wCells,
        h: hCells,
        static: false,
        minW: 4,
        minH: 4
      };
    });
    return { lg, md: lg, sm: lg, xs: lg, xxs: lg };
  }, [items]);

  const handleDragStop = (_: Layout[], __: Layout, newItem: Layout) => {
    const id = newItem.i;
    const xPx = newItem.x * CELL;
    const yPx = newItem.y * CELL;
    onMove(id, xPx, yPx);
  };

  const handleResizeStop = (_: Layout[], __: Layout, newItem: Layout) => {
    const id = newItem.i;
    const wPx = newItem.w * CELL;
    const hPx = newItem.h * CELL;
    onResize?.(id, wPx, hPx);
  };

  // Calculate dynamic height for modal
  const canvasHeight = useMemo(() => {
    if (!isModal) return 640;

    const minHeight = 800;
    let maxY = minHeight;

    items.forEach(item => {
      const itemBottom = (item.y || 0) + (item.height || 220) + 100;
      if (itemBottom > maxY) {
        maxY = itemBottom;
      }
    });

    return Math.max(minHeight, maxY);
  }, [items, isModal]);

  const gridComponent = (
    <div className="bg-neutral-950" style={{ minHeight: isModal ? canvasHeight : 640 }}>
      <ResponsiveGridLayout
        className="layout"
        layouts={layouts}
        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
        cols={{ lg: 72, md: 60, sm: 48, xs: 36, xxs: 24 }}
        rowHeight={CELL}
        margin={MARGIN}
        containerPadding={MARGIN}
        preventCollision={true}  // ← BULLETPROOF COLLISION PREVENTION
        compactType={null}       // ← No auto-compacting that fights user intent
        autoSize={true}
        isDraggable={true}
        isResizable={true}
        onDragStop={handleDragStop}
        onResizeStop={handleResizeStop}
        measureBeforeMount={false}
        useCSSTransforms={true}
      >
        {items.map((p) => (
          <div key={p.id}>
            <CanvasCard
              item={p}
              onRemove={onRemove}
              onOpen={onOpen}
              onToggleView={onToggleView}
            />
          </div>
        ))}
      </ResponsiveGridLayout>

      {/* Grid overlay for visual feedback */}
      <div
        className="absolute inset-0 pointer-events-none opacity-5"
        style={{
          backgroundImage: `
            linear-gradient(to right, #374151 1px, transparent 1px),
            linear-gradient(to bottom, #374151 1px, transparent 1px)
          `,
          backgroundSize: `${CELL}px ${CELL}px`
        }}
      />
    </div>
  );

  if (isModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/80 backdrop-blur-sm">
        <div className="w-full max-w-7xl mx-auto mt-8 mb-8 bg-neutral-950 rounded-xl border border-neutral-800 shadow-2xl overflow-hidden">
          {/* Modal Header */}
          <div className="flex items-center justify-between p-4 border-b border-neutral-800 bg-neutral-900/50">
            <h2 className="text-lg font-semibold text-neutral-100">Canvas (RGL)</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors"
              title="Close canvas"
            >
              ❌
            </button>
          </div>

          {/* Canvas Area */}
          <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
            {gridComponent}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-800 overflow-hidden">
      {gridComponent}
    </div>
  );
}
