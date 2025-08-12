"use client";
import React, { useEffect, useState } from 'react';
import { useCanvasStore } from '../../store/canvasStore';
import * as canvasService from '../../services/canvasService';

export default function CanvasManagerModal({ 
  onClose, 
  onLoad, 
  onDelete, 
  onRename, 
  onTrainLora 
}: { 
  onClose: () => void; 
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
              <div key={c.id} className="flex items-center justify-between rounded-md border border-neutral-800 p-3 hover:bg-neutral-900">
                <div className="flex-1 min-w-0">
                  {editingId === c.id ? (
                    <input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={() => {
                        if (editingName.trim() && editingName !== c.name) {
                          onRename?.(c.id, editingName.trim());
                          setTimeout(() => void refreshCanvases(), 500);
                        }
                        setEditingId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          if (editingName.trim() && editingName !== c.name) {
                            onRename?.(c.id, editingName.trim());
                            setTimeout(() => void refreshCanvases(), 500);
                          }
                          setEditingId(null);
                        }
                        if (e.key === 'Escape') {
                          setEditingId(null);
                        }
                      }}
                      autoFocus
                      className="w-full px-2 py-1 rounded border border-neutral-700 bg-neutral-800 text-neutral-100 text-sm"
                    />
                  ) : (
                    <div 
                      className="cursor-pointer"
                      onDoubleClick={() => {
                        setEditingId(c.id);
                        setEditingName(c.name || c.id);
                      }}
                    >
                      <div className="text-neutral-200 truncate">{c.name || c.id}</div>
                      <div className="text-xs text-neutral-500 truncate">{c.id}</div>
                      {c.updatedAt && (
                        <div className="text-xs text-neutral-600">
                          {new Date(c.updatedAt).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                <div className="flex items-center gap-2 ml-3">
                  <button 
                    onClick={() => c.id && onLoad(c.id)} 
                    className="px-2.5 py-1 text-sm rounded border border-neutral-700 bg-blue-600 hover:bg-blue-700 text-white"
                    title="Load canvas"
                  >
                    Load
                  </button>
                  
                  {onTrainLora && (
                    <button 
                      onClick={() => c.id && onTrainLora(c.id)} 
                      className="px-2.5 py-1 text-sm rounded border border-neutral-700 bg-purple-600 hover:bg-purple-700 text-white"
                      title="Train LoRA from this canvas"
                    >
                      LoRA
                    </button>
                  )}
                  
                  <button 
                    onClick={() => {
                      setEditingId(c.id);
                      setEditingName(c.name || c.id);
                    }}
                    className="px-2.5 py-1 text-sm rounded border border-neutral-700 bg-neutral-700 hover:bg-neutral-600 text-neutral-100"
                    title="Rename canvas"
                  >
                    Rename
                  </button>
                  
                  {onDelete && (
                    <button 
                      onClick={() => {
                        if (confirm(`Delete canvas "${c.name || c.id}"? This cannot be undone.`)) {
                          onDelete(c.id);
                          setTimeout(() => void refreshCanvases(), 500);
                        }
                      }}
                      className="px-2.5 py-1 text-sm rounded border border-neutral-700 bg-red-600 hover:bg-red-700 text-white"
                      title="Delete canvas"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}



