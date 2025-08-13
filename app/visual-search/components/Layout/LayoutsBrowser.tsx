'use client';

import { useState, useEffect } from 'react';
import { LayoutAsset } from '@/app/visual-search/types';

interface LayoutsBrowserProps {
  onSelectLayout: (layout: LayoutAsset) => void;
  selectedLayoutId?: string | null;
}

export default function LayoutsBrowser({ onSelectLayout, selectedLayoutId }: LayoutsBrowserProps) {
  const [layouts, setLayouts] = useState<LayoutAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load layouts from API
  const loadLayouts = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch layouts directly from layouts API
      const response = await fetch(`/api/layouts?ts=${Date.now()}`, { cache: 'no-store' });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to load layouts');
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to load layouts');
      }

      setLayouts(data.layouts || []);
    } catch (err) {
      console.error('Failed to load layouts:', err);
      setError(err instanceof Error ? err.message : 'Failed to load layouts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLayouts();
  }, []);

  // Expose a manual refresh method via a custom event to allow other parts to trigger reload after export
  useEffect(() => {
    const handler = () => loadLayouts();
    window.addEventListener('layouts:refresh', handler);
    return () => window.removeEventListener('layouts:refresh', handler);
  }, []);

  // Delete layout
  const deleteLayout = async (layoutId: string) => {
    if (!confirm('Are you sure you want to delete this layout?')) return;

    try {
      const response = await fetch(`/api/media-assets/${layoutId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to delete layout');
      }

      // Optimistically remove locally
      setLayouts(prev => prev.filter(l => l.id !== layoutId));
      try { window.dispatchEvent(new Event('layouts:refresh')); } catch {}

      // Non-blocking refresh to sync from backend
      loadLayouts().catch((e) => console.warn('Background refresh failed after delete:', e));
    } catch (err) {
      console.error('Failed to delete layout:', err);
      // Only alert if the DELETE call itself failed; do not alert on refresh failures
      if (err instanceof Error && err.message.includes('Failed to delete layout')) {
        alert('Failed to delete layout: ' + err.message);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-neutral-400">Loading layouts...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-800 bg-red-900/20 p-4">
        <div className="text-red-400">Error: {error}</div>
        <button
          onClick={loadLayouts}
          className="mt-2 px-3 py-1 text-sm rounded-md border border-red-700 bg-red-900/40 hover:bg-red-800/40 text-red-300"
        >
          Retry
        </button>
      </div>
    );
  }

  if (layouts.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-neutral-400 mb-2">No layouts found</div>
        <div className="text-sm text-neutral-500">
          Create layouts by exporting from the Canvas tab
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-neutral-100">Saved Layouts ({layouts.length})</h3>
        <button
          onClick={loadLayouts}
          className="px-2 py-1 text-xs rounded border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-neutral-300"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 max-h-96 overflow-y-auto">
        {layouts.map((layout) => {
          const layoutData = (layout as any).layout_data || {};
          const { items = [], designSize = { width: 1200, height: 800 } } = layoutData;
          const isSelected = selectedLayoutId === layout.id;

          return (
            <div
              key={layout.id}
              className={`
                relative rounded-lg border p-3 cursor-pointer transition-all
                ${isSelected
                  ? 'border-blue-600 bg-blue-900/20'
                  : 'border-neutral-700 bg-neutral-800/40 hover:bg-neutral-800/60'
                }
              `}
              onClick={() => onSelectLayout(layout)}
            >
              {/* Layout Preview */}
              <div className="flex items-start gap-3">
                {/* Mini Grid Preview */}
                <div
                  className="flex-shrink-0 w-16 h-12 rounded border border-neutral-600 bg-neutral-900 relative overflow-hidden"
                  style={{
                    backgroundImage: `
                      linear-gradient(to right, #374151 1px, transparent 1px),
                      linear-gradient(to bottom, #374151 1px, transparent 1px)
                    `,
                    backgroundSize: '4px 4px'
                  }}
                >
                  {/* Mini items */}
                  {items.slice(0, 6).map((item: any, idx: number) => (
                    <div
                      key={idx}
                      className="absolute bg-blue-500/60 rounded-sm"
                      style={{
                        left: `${(item.nx || 0) * 100}%`,
                        top: `${(item.ny || 0) * 100}%`,
                        width: `${Math.max(8, (item.nw || 0.1) * 100)}%`,
                        height: `${Math.max(6, (item.nh || 0.1) * 100)}%`,
                      }}
                    />
                  ))}
                </div>

                {/* Layout Info */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-neutral-100 truncate">
                    {layout.title}
                  </div>
                  <div className="text-sm text-neutral-400 mt-1">
                    {items.length} items • {designSize.width}×{designSize.height}
                  </div>
                  <div className="text-xs text-neutral-500 mt-1">
                    {(layout as any).layout_type || 'layout'} • {new Date(layout.created_at).toLocaleDateString()}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex-shrink-0 flex items-center gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteLayout(layout.id);
                    }}
                    className="p-1 rounded text-neutral-400 hover:text-red-400 hover:bg-red-900/20"
                    title="Delete layout"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Selected indicator */}
              {isSelected && (
                <div className="absolute inset-0 rounded-lg border-2 border-blue-500 pointer-events-none" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
