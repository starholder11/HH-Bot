"use client";
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { LayoutAsset } from '@/app/visual-search/types';

interface LayoutImportModalProps {
  onClose: () => void;
  onSelect: (layout: LayoutAsset) => void;
}

export default function LayoutImportModal({ onClose, onSelect }: LayoutImportModalProps) {
  const [layouts, setLayouts] = useState<LayoutAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    loadLayouts();
  }, []);

  const loadLayouts = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch('/api/layouts');
      if (!response.ok) throw new Error('Failed to fetch layouts');

      const data = await response.json();
      const layoutAssets = data.layouts || data.assets || [];
      console.log('[LAYOUT IMPORT] Loaded layouts:', layoutAssets.length);
      setLayouts(layoutAssets);
    } catch (error) {
      console.error('[LAYOUT IMPORT] Failed to load layouts:', error);
      setError(error instanceof Error ? error.message : 'Failed to load layouts');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectLayout = (layout: LayoutAsset) => {
    console.log('[LAYOUT IMPORT] Selected layout:', layout.id, layout.title);
    onSelect(layout);
  };

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-4xl h-[80vh] bg-neutral-900 border border-neutral-700 rounded-lg flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-700">
          <h2 className="text-lg font-semibold text-white">Import Layout</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-neutral-800 rounded text-neutral-400 hover:text-neutral-200"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {isLoading && (
            <div className="text-center py-8 text-neutral-400">
              Loading layouts...
            </div>
          )}

          {error && (
            <div className="text-center py-8">
              <div className="text-red-400 mb-4">{error}</div>
              <button
                onClick={loadLayouts}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
              >
                Retry
              </button>
            </div>
          )}

          {!isLoading && !error && layouts.length === 0 && (
            <div className="text-center py-8 text-neutral-400">
              No layouts found. Create some layouts first in the Workshop.
            </div>
          )}

          {!isLoading && !error && layouts.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {layouts.map((layout) => (
                <div
                  key={layout.id}
                  onClick={() => handleSelectLayout(layout)}
                  className="border border-neutral-700 rounded-lg p-4 bg-neutral-800 hover:bg-neutral-750 cursor-pointer transition-colors"
                >
                  {/* Layout Preview */}
                  <div className="aspect-video bg-neutral-900 rounded mb-3 flex items-center justify-center border border-neutral-600">
                    <div className="text-neutral-500 text-sm">
                      {layout.layout_data?.items?.length || 0} items
                    </div>
                  </div>

                  {/* Layout Info */}
                  <div>
                    <h3 className="text-white font-medium mb-1 truncate" title={layout.title}>
                      {layout.title}
                    </h3>
                    <div className="text-xs text-neutral-400 space-y-1">
                      <div>
                        Size: {layout.layout_data?.width || 1920} × {layout.layout_data?.height || 1080}
                      </div>
                      <div>
                        Items: {layout.layout_data?.items?.length || 0}
                      </div>
                      {layout.updated_at && (
                        <div>
                          Updated: {new Date(layout.updated_at).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
