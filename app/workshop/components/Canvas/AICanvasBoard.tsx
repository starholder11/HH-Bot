"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { WidthProvider, Responsive, type Layout, type Layouts } from "react-grid-layout";
import type { PinnedItem, UnifiedSearchResult } from "../../types";
import { useAILayout, type ContentItem } from "../../services/AILayoutService";
import CanvasCard from "./CanvasBoardRGL";

const ResponsiveGridLayout = WidthProvider(Responsive);

// Grid configuration matching your existing setup
const CELL = 20;
const MARGIN: [number, number] = [8, 8];

interface AICanvasBoardProps {
  pinned: PinnedItem[];
  onLayoutChange?: (layout: Layout[], allLayouts: Layouts) => void;
  onRemove?: (id: string) => void;
  onOpen?: (result: UnifiedSearchResult) => void;
  className?: string;
  autoLayout?: boolean;
  onAutoLayoutComplete?: (layouts: Layout[]) => void;
}

export default function AICanvasBoard({
  pinned,
  onLayoutChange,
  onRemove,
  onOpen,
  className = "",
  autoLayout = false,
  onAutoLayoutComplete
}: AICanvasBoardProps) {
  const { generateLayout } = useAILayout();
  const [layouts, setLayouts] = useState<Layout[]>([]);
  const [isGeneratingLayout, setIsGeneratingLayout] = useState(false);
  const [aiReasoning, setAiReasoning] = useState<Record<string, string>>({});
  const containerRef = useRef<HTMLDivElement>(null);

  // Convert pinned items to ContentItem format for AI analysis
  const convertToContentItems = useCallback((pinnedItems: PinnedItem[]): ContentItem[] => {
    return pinnedItems.map(item => ({
      id: item.id,
      type: item.result.content_type as 'image' | 'text' | 'audio' | 'video',
      title: item.result.title || 'Untitled',
      description: item.result.description || '',
      tags: [], // You can extract tags from your existing data
      importance: 'medium', // You can determine this based on your logic
      size: { width: 300, height: 200 } // Default size, you can calculate real sizes
    }));
  }, []);

  // Generate AI-powered layout
  const handleAutoLayout = useCallback(async () => {
    if (pinned.length === 0) return;

    setIsGeneratingLayout(true);
    try {
      const contentItems = convertToContentItems(pinned);
      const container = containerRef.current;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const containerWidth = containerRect.width;
      const containerHeight = Math.max(800, pinned.length * 200); // Estimate height

      const aiLayouts = await generateLayout(contentItems, containerWidth, containerHeight);

      // Store AI reasoning for display
      const reasoningMap: Record<string, string> = {};
      aiLayouts.forEach(layout => {
        // In a real implementation, you'd get this from the AI response
        reasoningMap[layout.i] = "AI positioned for optimal narrative flow";
      });

      setAiReasoning(reasoningMap);
      setLayouts(aiLayouts);
      onAutoLayoutComplete?.(aiLayouts);

    } catch (error) {
      console.error('AI layout generation failed:', error);
      // Fallback to simple grid layout
      generateFallbackLayout();
    } finally {
      setIsGeneratingLayout(false);
    }
  }, [pinned, generateLayout, convertToContentItems, onAutoLayoutComplete]);

  // Fallback layout when AI fails
  const generateFallbackLayout = useCallback(() => {
    const fallbackLayouts: Layout[] = pinned.map((item, index) => {
      const cols = 4; // 4 columns
      const x = index % cols;
      const y = Math.floor(index / cols);

      return {
        i: item.id,
        x: x * 3, // 3 units wide
        y: y * 4, // 4 units tall
        w: 3,
        h: 4,
        minW: 2,
        minH: 2,
        maxW: 12,
        maxH: 12,
        isDraggable: true,
        isResizable: true
      };
    });

    setLayouts(fallbackLayouts);
    setAiReasoning({});
  }, [pinned]);

  // Auto-generate layout when autoLayout is enabled or pinned items change
  useEffect(() => {
    if (autoLayout && pinned.length > 0) {
      handleAutoLayout();
    } else if (pinned.length > 0 && layouts.length === 0) {
      generateFallbackLayout();
    }
  }, [autoLayout, pinned.length, handleAutoLayout, generateFallbackLayout, layouts.length]);

  // Handle layout changes from user interaction
  const handleLayoutChange = useCallback((currentLayout: Layout[], allLayouts: Layouts) => {
    setLayouts(currentLayout);
    onLayoutChange?.(currentLayout, allLayouts);

    // Clear AI reasoning when user manually adjusts
    if (Object.keys(aiReasoning).length > 0) {
      setAiReasoning({});
    }
  }, [onLayoutChange, aiReasoning]);

  return (
    <div ref={containerRef} className={`w-full ${className}`}>
      {/* AI Layout Controls */}
      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={handleAutoLayout}
          disabled={isGeneratingLayout || pinned.length === 0}
          className="px-3 py-1.5 text-sm rounded-md border border-blue-600 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 disabled:border-blue-600/50 text-white font-medium flex items-center gap-2"
        >
          {isGeneratingLayout ? (
            <>
              <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></div>
              Generating Layout...
            </>
          ) : (
            <>
              🤖 Auto Layout
            </>
          )}
        </button>

        {Object.keys(aiReasoning).length > 0 && (
          <div className="text-xs text-blue-400 flex items-center gap-1">
            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
            AI-powered layout active
          </div>
        )}
      </div>

      {/* Canvas Grid */}
      <ResponsiveGridLayout
        className="layout"
        layouts={{ lg: layouts }}
        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
        cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
        rowHeight={CELL}
        margin={MARGIN}
        containerPadding={[0, 0]}
        onLayoutChange={handleLayoutChange}
        isDraggable={true}
        isResizable={true}
        draggableHandle=".drag-handle"
        resizeHandles={['se']}
      >
        {pinned.map((item) => (
          <div key={item.id} className="drag-handle">
            <CanvasCard
              item={item}
              onRemove={onRemove}
              onOpen={onOpen}
              aiReasoning={aiReasoning[item.id]}
            />
          </div>
        ))}
      </ResponsiveGridLayout>

      {/* Empty State */}
      {pinned.length === 0 && (
        <div className="flex items-center justify-center h-64 text-neutral-400">
          <div className="text-center">
            <div className="text-2xl mb-2">📋</div>
            <div className="text-sm">Add content to see AI-powered layouts</div>
          </div>
        </div>
      )}
    </div>
  );
}

