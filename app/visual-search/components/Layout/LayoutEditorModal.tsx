'use client';

import dynamic from 'next/dynamic';
import React, { useMemo, useState } from 'react';
import type { LayoutAsset } from '@/app/visual-search/types';

const ReactGridLayout = dynamic(() => import('react-grid-layout'), { ssr: false }) as any;

type Item = LayoutAsset['layout_data']['items'][number];

export default function LayoutEditorModal({
  layout,
  onClose,
  onSaved,
}: {
  layout: LayoutAsset;
  onClose: () => void;
  onSaved?: (updated: LayoutAsset) => void;
}) {
  const [working, setWorking] = useState(false);
  const [edited, setEdited] = useState<LayoutAsset>(layout);

  const cellSize = edited.layout_data.cellSize || 20;
  const design = edited.layout_data.designSize || { width: 1200, height: 800 };
  const cols = Math.max(12, Math.round(design.width / cellSize));
  const rowHeight = cellSize;

  const rglLayout = useMemo(
    () =>
      edited.layout_data.items.map((it) => ({
        i: it.id,
        x: it.x,
        y: it.y,
        w: Math.max(1, it.w),
        h: Math.max(1, it.h),
      })),
    [edited.layout_data.items]
  );

  function handleDragStop(_: any, item: any) {
    setEdited((prev) => updateItemGrid(prev, item.i, item.x, item.y, item.w, item.h));
  }
  function handleResizeStop(_: any, item: any) {
    setEdited((prev) => updateItemGrid(prev, item.i, item.x, item.y, item.w, item.h));
  }

  async function handleSave() {
    try {
      setWorking(true);
      const res = await fetch(`/api/media-assets/${edited.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(edited),
      });
      if (!res.ok) throw new Error('Failed to save layout');
      const data = await res.json();
      try { window.dispatchEvent(new Event('layouts:refresh')); } catch {}
      onSaved?.(data.asset as LayoutAsset);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 flex">
      <div className="relative m-0 w-full h-full bg-neutral-950 text-neutral-100">
        {/* Header */}
        <div className="absolute top-0 inset-x-0 h-14 border-b border-neutral-800 bg-neutral-900/80 backdrop-blur flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-2 py-1 rounded border border-neutral-700 hover:bg-neutral-800">Close</button>
            <div className="font-medium">{edited.title}</div>
            <div className="text-xs text-neutral-400">{edited.layout_type} • {edited.layout_data.items.length} items</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={working}
              className="px-3 py-1.5 rounded border border-green-600 bg-green-700 hover:bg-green-600 text-white disabled:opacity-50"
            >
              {working ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        {/* Canvas area */}
        <div className="absolute top-14 bottom-0 inset-x-0 p-4 overflow-auto">
          <div
            className="mx-auto border border-neutral-800 bg-neutral-900 relative"
            style={{ width: design.width, height: design.height }}
          >
            <ReactGridLayout
              className="layout"
              layout={rglLayout}
              cols={cols}
              rowHeight={rowHeight}
              width={design.width}
              margin={[0, 0]}
              containerPadding={[0, 0]}
              isDraggable
              isResizable
              preventCollision={true}
              compactType={null}
              onDragStop={handleDragStop}
              onResizeStop={handleResizeStop}
            >
              {edited.layout_data.items.map((it) => (
                <div key={it.id} className="border border-blue-500/50 bg-blue-500/10 overflow-hidden">
                  <div className="h-full w-full flex items-center justify-center text-xs text-neutral-300">
                    {it.type}{it.contentType ? ` • ${it.contentType}` : ''}
                  </div>
                </div>
              ))}
            </ReactGridLayout>
          </div>
        </div>
      </div>
    </div>
  );
}

function updateItemGrid(layout: LayoutAsset, id: string, x: number, y: number, w: number, h: number): LayoutAsset {
  const cellSize = layout.layout_data.cellSize || 20;
  const design = layout.layout_data.designSize || { width: 1200, height: 800 };
  const pxW = w * cellSize;
  const pxH = h * cellSize;
  const pxX = x * cellSize;
  const pxY = y * cellSize;

  const items = layout.layout_data.items.map((it) =>
    it.id === id
      ? ({
          ...it,
          x, y, w, h,
          nx: clamp(pxX / design.width),
          ny: clamp(pxY / design.height),
          nw: clamp(pxW / design.width),
          nh: clamp(pxH / design.height),
        } as Item)
      : it
  );

  return {
    ...layout,
    layout_data: { ...layout.layout_data, items },
    updated_at: new Date().toISOString(),
  } as LayoutAsset;
}

function clamp(v: number) {
  if (Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(1, v));
}


