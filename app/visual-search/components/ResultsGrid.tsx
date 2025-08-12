"use client";
import React, { useMemo } from 'react';
import type { UnifiedSearchResult } from '../types';
import { FixedSizeGrid as Grid } from 'react-window';
import { GRID_CONSTANTS } from '../constants';

function useContainerSize(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [w, setW] = React.useState<number>(GRID_CONSTANTS.MAX_WIDTH);
  
  React.useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        // Use the container's actual width, constrained by our max
        const containerWidth = containerRef.current.getBoundingClientRect().width;
        setW(Math.min(containerWidth - 32, GRID_CONSTANTS.MAX_WIDTH)); // Subtract padding
      }
    };
    
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [containerRef]);
  
  return w;
}

type Props = {
  results: UnifiedSearchResult[];
  renderCard: (r: UnifiedSearchResult, idx: number) => React.ReactNode;
};

export default function ResultsGrid({ results, renderCard }: Props) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const width = useContainerSize(containerRef);
  
  const { columnCount, columnWidth, rowHeight, rowCount } = useMemo(() => {
    const cols = GRID_CONSTANTS.BREAKPOINTS.find((b) => width >= b.min)?.cols || 1;
    const availableWidth = width - (GRID_CONSTANTS.GUTTER * (cols - 1));
    const cw = Math.floor(availableWidth / cols);
    const rc = Math.ceil(results.length / cols);
    return {
      columnCount: cols,
      columnWidth: cw,
      rowHeight: GRID_CONSTANTS.ROW_HEIGHT,
      rowCount: rc
    };
  }, [width, results.length]);

  const Cell = ({ columnIndex, rowIndex, style }: any) => {
    const idx = rowIndex * columnCount + columnIndex;
    if (idx >= results.length) return null;
    const r = results[idx];
    return (
      <div style={{ 
        ...style, 
        left: (style.left as number) + (columnIndex * GRID_CONSTANTS.GUTTER), 
        width: (style.width as number) - GRID_CONSTANTS.GUTTER 
      }}>
        {renderCard(r, idx)}
      </div>
    );
  };

  return (
    <div ref={containerRef} className="w-full">
      <Grid
        columnCount={columnCount}
        columnWidth={columnWidth}
        // Use full content height so the page scrolls instead of the inner grid
        height={rowHeight * Math.max(rowCount, 1)}
        rowCount={rowCount}
        rowHeight={rowHeight}
        width={width}
      >
        {Cell}
      </Grid>
    </div>
  );
}

// Exported directly; wrap at a higher level to avoid per-cell boundary overhead


