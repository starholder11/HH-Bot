"use client";
import React from 'react';
import type { LayoutAsset } from '../../types';

interface LayoutViewerProps {
  layout: LayoutAsset;
  onClose?: () => void;
  className?: string;
}

export default function LayoutViewer({ layout, onClose, className = '' }: LayoutViewerProps) {
  const { layout_data } = layout;
  const { designSize, styling, items } = layout_data;

  // Calculate scale to fit viewport
  const maxViewportWidth = 1200;
  const maxViewportHeight = 800;
  const scale = Math.min(
    maxViewportWidth / designSize.width,
    maxViewportHeight / designSize.height,
    1 // Don't scale up
  );

  const scaledWidth = designSize.width * scale;
  const scaledHeight = designSize.height * scale;

  return (
    <div className={`bg-neutral-950 rounded-lg border border-neutral-800 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-neutral-800">
        <div>
          <h3 className="text-lg font-medium text-neutral-100">{layout.title}</h3>
          <div className="text-sm text-neutral-400 mt-1">
            {layout.layout_type === 'canvas_export' && 'Canvas Export'} 
            {layout.layout_type === 'blueprint_composer' && 'Blueprint Composer'}
            {layout.layout_type === 'imported' && 'Imported Layout'}
            {' • '}
            {items.length} items
            {' • '}
            {designSize.width}×{designSize.height}
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-neutral-100"
          >
            Close
          </button>
        )}
      </div>

      {/* Layout Preview */}
      <div className="p-4">
        <div 
          className="relative border border-neutral-700 bg-neutral-900 mx-auto"
          style={{
            width: scaledWidth,
            height: scaledHeight,
            backgroundColor: styling.colors?.background || '#0a0a0a'
          }}
        >
          {/* Grid overlay for reference */}
          <div
            className="absolute inset-0 pointer-events-none opacity-10"
            style={{
              backgroundImage: `
                linear-gradient(to right, #374151 1px, transparent 1px),
                linear-gradient(to bottom, #374151 1px, transparent 1px)
              `,
              backgroundSize: `${(layout_data.cellSize || 20) * scale}px ${(layout_data.cellSize || 20) * scale}px`
            }}
          />

          {/* Layout Items */}
          {items.map((item) => {
            const itemX = item.nx * scaledWidth;
            const itemY = item.ny * scaledHeight;
            const itemW = item.nw * scaledWidth;
            const itemH = item.nh * scaledHeight;

            return (
              <div
                key={item.id}
                className="absolute border border-neutral-600 bg-neutral-800/50 rounded"
                style={{
                  left: itemX,
                  top: itemY,
                  width: itemW,
                  height: itemH,
                  zIndex: item.z || 1
                }}
              >
                <div className="p-2 h-full flex flex-col justify-between text-xs">
                  {/* Item Type Badge */}
                  <div className="flex items-center justify-between">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                      item.type === 'content_ref' ? 'bg-blue-600 text-blue-100' :
                      item.type === 'inline_text' ? 'bg-green-600 text-green-100' :
                      item.type === 'inline_image' ? 'bg-purple-600 text-purple-100' :
                      'bg-gray-600 text-gray-100'
                    }`}>
                      {item.type === 'content_ref' ? item.contentType || 'ref' :
                       item.type === 'inline_text' ? 'text' :
                       item.type === 'inline_image' ? 'image' :
                       item.blockType || 'block'}
                    </span>
                    
                    {item.transform && (
                      <span className="px-1 py-0.5 rounded bg-yellow-600 text-yellow-100 text-xs">
                        T
                      </span>
                    )}
                  </div>

                  {/* Item Content Preview */}
                  <div className="text-neutral-300 truncate">
                    {item.type === 'content_ref' ? (
                      <div>
                        <div className="font-medium truncate">{item.snippet || item.refId}</div>
                        {item.mediaUrl && (
                          <div className="text-neutral-500 text-xs truncate">{item.mediaUrl.split('/').pop()}</div>
                        )}
                      </div>
                    ) : item.type === 'inline_text' ? (
                      <div className="font-mono text-xs">
                        {item.inlineContent?.text?.substring(0, 50) || 'Text content'}
                        {(item.inlineContent?.text?.length || 0) > 50 && '...'}
                      </div>
                    ) : item.type === 'inline_image' ? (
                      <div className="text-center">
                        📷 Image
                        {item.inlineContent?.imageUrl && (
                          <div className="text-xs text-neutral-500 truncate">
                            {item.inlineContent.imageUrl.split('/').pop()}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>Block: {item.blockType}</div>
                    )}
                  </div>

                  {/* Item Position Info */}
                  <div className="text-neutral-500 text-xs">
                    {item.x},{item.y} ({item.w}×{item.h})
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Scale Info */}
        {scale < 1 && (
          <div className="text-center text-neutral-400 text-xs mt-2">
            Scaled to {Math.round(scale * 100)}% • Original: {designSize.width}×{designSize.height}
          </div>
        )}
      </div>

      {/* Layout Details */}
      <div className="p-4 border-t border-neutral-800 bg-neutral-900/50">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          
          {/* Basic Info */}
          <div>
            <h4 className="font-medium text-neutral-100 mb-2">Details</h4>
            <div className="space-y-1 text-neutral-400">
              <div>Type: {layout.layout_type}</div>
              <div>Items: {items.length}</div>
              <div>Size: {designSize.width}×{designSize.height}</div>
              <div>Cell: {layout_data.cellSize || 20}px</div>
              {layout.project_id && <div>Project: {layout.project_id}</div>}
            </div>
          </div>

          {/* Styling Info */}
          <div>
            <h4 className="font-medium text-neutral-100 mb-2">Styling</h4>
            <div className="space-y-1 text-neutral-400">
              <div>Theme: {styling.theme || 'default'}</div>
              {styling.typography?.fontFamily && (
                <div>Font: {styling.typography.fontFamily}</div>
              )}
              {styling.colors?.background && (
                <div className="flex items-center gap-2">
                  Background: 
                  <div 
                    className="w-4 h-4 rounded border border-neutral-600"
                    style={{ backgroundColor: styling.colors.background }}
                  />
                  <span className="text-xs">{styling.colors.background}</span>
                </div>
              )}
            </div>
          </div>

          {/* Content Summary */}
          <div>
            <h4 className="font-medium text-neutral-100 mb-2">Content</h4>
            <div className="space-y-1 text-neutral-400">
              {Object.entries(
                items.reduce((acc, item) => {
                  const type = item.type === 'content_ref' ? item.contentType || 'ref' : item.type;
                  acc[type] = (acc[type] || 0) + 1;
                  return acc;
                }, {} as Record<string, number>)
              ).map(([type, count]) => (
                <div key={type}>{type}: {count}</div>
              ))}
              
              {layout.metadata?.has_inline_content && (
                <div className="text-green-400">✓ Inline content</div>
              )}
              {layout.metadata?.has_transforms && (
                <div className="text-yellow-400">✓ Transforms</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
