"use client";
import React, { useEffect, useState } from 'react';
import { useCanvasStore } from '../../store/canvasStore';
import * as canvasService from '../../services/canvasService';

export default function CanvasManagerModal({ onClose, onLoad }: { onClose: () => void; onLoad: (id: string) => void }) {
  const { canvases, setCanvases } = useCanvasStore();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const j = await canvasService.listCanvases();
        if (!cancelled) setCanvases((j.items || []).map((x: any) => ({ id: x.id, name: x.name, key: x.key, updatedAt: x.updatedAt })));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true };
  }, [setCanvases]);

  return (
    <div className="fixed inset-0 z-[110]">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute inset-x-0 top-12 mx-auto max-w-2xl rounded-xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-neutral-200 font-medium">Load Canvas</div>
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-md border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-100">Close</button>
        </div>
        {loading ? (
          <div className="text-neutral-400 text-sm">Loading…</div>
        ) : canvases.length === 0 ? (
          <div className="text-neutral-400 text-sm">No canvases.</div>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-auto">
            {canvases.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-md border border-neutral-800 p-2 hover:bg-neutral-900">
                <div>
                  <div className="text-neutral-200">{c.name || c.id}</div>
                  <div className="text-xs text-neutral-500">{c.id}</div>
                </div>
                <button onClick={() => c.id && onLoad(c.id)} className="px-2.5 py-1 text-sm rounded-md border border-neutral-800 bg-blue-600 hover:bg-blue-700 text-white">Load</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}



