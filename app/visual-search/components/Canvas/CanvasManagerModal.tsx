"use client";
import React, { useEffect, useState } from 'react';
import { useCanvasStore } from '../../store/canvasStore';
import * as canvasService from '../../services/canvasService';

export default function CanvasManagerModal({
  onLoad,
  onDelete,
  onRename,
  onTrainLora
}: {
  onLoad: (id: string) => void;
  onDelete?: (id: string) => void;
  onRename?: (id: string, newName: string) => void;
  onTrainLora?: (id: string) => void;
}) {
  const { canvases, setCanvases } = useCanvasStore();
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const refreshCanvases = async () => {
    try {
      setLoading(true);
      const j = await canvasService.listCanvases();
      setCanvases((j.items || []).map((x: any) => ({ id: x.id, name: x.name, key: x.key, updatedAt: x.updatedAt })));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshCanvases();
  }, [setCanvases]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-neutral-400">Loading canvases...</div>
      </div>
    );
  }

  if (canvases.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-neutral-400 mb-2">No canvases found</div>
        <div className="text-sm text-neutral-500">
          Create canvases by pinning results and saving
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-neutral-100">Saved Canvases ({canvases.length})</h3>
        <button
          onClick={refreshCanvases}
          className="px-2 py-1 text-xs rounded border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-neutral-300"
        >
          Refresh
        </button>
      </div>

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {canvases.map((c) => (
          <div
            key={c.id}
            className="relative rounded-lg border border-neutral-700 bg-neutral-800/40 hover:bg-neutral-800/60 p-3 cursor-pointer transition-all"
            onClick={() => c.id && onLoad(c.id)}
          >
            <div className="flex items-start gap-3">
              {/* Canvas Preview Placeholder */}
              <div className="flex-shrink-0 w-16 h-12 rounded border border-neutral-600 bg-neutral-900 relative overflow-hidden flex items-center justify-center">
                <div className="text-xs text-neutral-500">🎨</div>
              </div>

              {/* Canvas Info */}
              <div className="flex-1 min-w-0">
                {editingId === c.id ? (
                  <input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={() => {
                      if (editingName.trim() && editingName !== c.name && c.id) {
                        onRename?.(c.id, editingName.trim());
                        setTimeout(() => void refreshCanvases(), 500);
                      }
                      setEditingId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (editingName.trim() && editingName !== c.name && c.id) {
                          onRename?.(c.id, editingName.trim());
                          setTimeout(() => void refreshCanvases(), 500);
                        }
                        setEditingId(null);
                      }
                      if (e.key === 'Escape') {
                        setEditingId(null);
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                    className="w-full px-2 py-1 rounded border border-neutral-700 bg-neutral-800 text-neutral-100 text-sm"
                  />
                ) : (
                  <div>
                    <div className="font-medium text-neutral-100 truncate">
                      {c.name || c.id}
                    </div>
                    <div className="text-xs text-neutral-500 truncate mt-1">
                      {c.id}
                    </div>
                    {c.updatedAt && (
                      <div className="text-xs text-neutral-600 mt-1">
                        canvas • {new Date(c.updatedAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex-shrink-0 flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    c.id && onLoad(c.id);
                  }}
                  className="px-1.5 py-1 text-xs rounded border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-neutral-100"
                  title="Load canvas"
                >
                  Load
                </button>

                {onTrainLora && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      c.id && onTrainLora(c.id);
                    }}
                    className="px-1.5 py-1 text-xs rounded border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-neutral-100"
                    title="Train LoRA from this canvas"
                  >
                    Train
                  </button>
                )}

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (c.id) {
                      setEditingId(c.id);
                      setEditingName(c.name || c.id);
                    }
                  }}
                  className="px-1.5 py-1 text-xs rounded border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-neutral-100"
                  title="Rename canvas"
                >
                  Rename
                </button>

                {onDelete && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (c.id && confirm(`Delete canvas "${c.name || c.id}"? This cannot be undone.`)) {
                        onDelete(c.id);
                        setTimeout(() => void refreshCanvases(), 500);
                      }
                    }}
                    className="p-1 rounded text-neutral-400 hover:text-red-400 hover:bg-red-900/20"
                    title="Delete canvas"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}



