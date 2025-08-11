"use client";
import React, { useMemo } from 'react';
import type { UnifiedSearchResult } from '../types';
import { FixedSizeGrid as Grid } from 'react-window';
import { GRID_CONSTANTS } from '../constants';

function useContainerSize() {
  const [w, setW] = React.useState<number>(typeof window !== 'undefined' ? window.innerWidth : GRID_CONSTANTS.MAX_WIDTH);
  React.useEffect(() => {
    const onResize = () => setW(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return w;
}

type Props = {
  results: UnifiedSearchResult[];
  renderCard: (r: UnifiedSearchResult, idx: number) => React.ReactNode;
};

export default function ResultsGrid({ results, renderCard }: Props) {
  const width = useContainerSize();
  const { columnCount, columnWidth, rowHeight, rowCount } = useMemo(() => {
    const cols = GRID_CONSTANTS.BREAKPOINTS.find((b) => width >= b.min)?.cols || 1;
    const cw = Math.floor((Math.min(width, GRID_CONSTANTS.MAX_WIDTH) - GRID_CONSTANTS.GUTTER * (cols - 1)) / cols);
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
      <div style={{ ...style, left: (style.left as number) + (columnIndex > 0 ? GRID_CONSTANTS.GUTTER * columnIndex : 0), width: (style.width as number) - GRID_CONSTANTS.GUTTER }}>
        {renderCard(r, idx)}
      </div>
    );
  };

  return (
    <Grid
      columnCount={columnCount}
      columnWidth={columnWidth}
      height={Math.min(GRID_CONSTANTS.MAX_HEIGHT, rowHeight * Math.min(rowCount, GRID_CONSTANTS.MAX_VISIBLE_ROWS))}
      rowCount={rowCount}
      rowHeight={rowHeight}
      width={Math.min(GRID_CONSTANTS.MAX_WIDTH, width)}
    >
      {Cell}
    </Grid>
  );
}

// Exported directly; wrap at a higher level to avoid per-cell boundary overhead


