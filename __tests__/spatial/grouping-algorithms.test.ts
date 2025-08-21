/**
 * Unit tests for grouping algorithms
 * 
 * Tests the 3D grouping strategies from PHASE 3: SPATIAL WORK.md
 * lines 641-702: flat, clustered, elevated, timeline, grid
 */

import {
  applyFlatGrouping,
  applyClusteredGrouping,
  applyElevatedGrouping,
  applyTimelineGrouping,
  applyGridGrouping,
  type SpaceItem,
  type GroupingConfig,
} from '../../lib/spatial/grouping-algorithms';

describe('Grouping Algorithms', () => {
  // Helper to create test space items
  const createTestItems = (count: number): SpaceItem[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `item-${i}`,
      assetId: `asset-${i}`,
      assetType: 'image' as const,
      position: [i, 0.1, i] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: [1, 0.01, 1] as [number, number, number],
      visible: true,
      clickable: true,
      hoverEffect: 'none' as const,
      importMetadata: {
        originalLayoutId: 'test-layout',
        originalItemId: `layout-item-${i}`,
        originalPosition: { x: i * 100, y: i * 100 },
        originalDimensions: { w: 100, h: 100 },
        importTimestamp: new Date().toISOString(),
      },
    }));
  };

  describe('applyFlatGrouping', () => {
    test('should maintain original positions with slight adjustments', () => {
      const items = createTestItems(3);
      const config: GroupingConfig = {
        strategy: 'flat',
        spacing: 0.5,
        floorBounds: { width: 20, depth: 20 },
      };

      const result = applyFlatGrouping(items, config);

      expect(result).toHaveLength(3);
      
      // Should maintain relative positions but with spacing adjustments
      result.forEach((item, index) => {
        expect(item.position[1]).toBe(0.1); // Y should remain at floor level
        expect(item.id).toBe(`item-${index}`);
      });

      // Items should be spaced apart
      const distances = result.map((item, i) => 
        i > 0 ? Math.sqrt(
          Math.pow(item.position[0] - result[i-1].position[0], 2) +
          Math.pow(item.position[2] - result[i-1].position[2], 2)
        ) : 0
      );
      
      distances.slice(1).forEach(distance => {
        expect(distance).toBeGreaterThanOrEqual(config.spacing);
      });
    });

    test('should handle collision detection', () => {
      const items = [
        ...createTestItems(2),
        // Add overlapping item
        {
          ...createTestItems(1)[0],
          id: 'overlapping-item',
          position: [0, 0.1, 0] as [number, number, number], // Same as first item
        }
      ];

      const config: GroupingConfig = {
        strategy: 'flat',
        spacing: 1.0,
        floorBounds: { width: 20, depth: 20 },
        avoidCollisions: true,
      };

      const result = applyFlatGrouping(items, config);

      // No two items should be closer than spacing
      for (let i = 0; i < result.length; i++) {
        for (let j = i + 1; j < result.length; j++) {
          const distance = Math.sqrt(
            Math.pow(result[i].position[0] - result[j].position[0], 2) +
            Math.pow(result[i].position[2] - result[j].position[2], 2)
          );
          expect(distance).toBeGreaterThanOrEqual(config.spacing);
        }
      }
    });

    test('should respect floor bounds', () => {
      const items = createTestItems(10);
      const config: GroupingConfig = {
        strategy: 'flat',
        spacing: 0.5,
        floorBounds: { width: 5, depth: 5 },
        respectBounds: true,
      };

      const result = applyFlatGrouping(items, config);

      result.forEach(item => {
        expect(item.position[0]).toBeGreaterThanOrEqual(-2.5);
        expect(item.position[0]).toBeLessThanOrEqual(2.5);
        expect(item.position[2]).toBeGreaterThanOrEqual(-2.5);
        expect(item.position[2]).toBeLessThanOrEqual(2.5);
      });
    });
  });

  describe('applyClusteredGrouping', () => {
    test('should group items by content type', () => {
      const items = [
        { ...createTestItems(1)[0], assetType: 'image' as const },
        { ...createTestItems(1)[0], id: 'item-video', assetType: 'video' as const },
        { ...createTestItems(1)[0], id: 'item-image2', assetType: 'image' as const },
        { ...createTestItems(1)[0], id: 'item-text', assetType: 'text' as const },
      ];

      const config: GroupingConfig = {
        strategy: 'clustered',
        clusterBy: 'contentType',
        clusterSpacing: 3.0,
        itemSpacing: 0.5,
        floorBounds: { width: 20, depth: 20 },
      };

      const result = applyClusteredGrouping(items, config);

      // Should have same number of items
      expect(result).toHaveLength(4);

      // Items of same type should be closer together
      const imageItems = result.filter(item => item.assetType === 'image');
      const videoItems = result.filter(item => item.assetType === 'video');
      const textItems = result.filter(item => item.assetType === 'text');

      expect(imageItems).toHaveLength(2);
      expect(videoItems).toHaveLength(1);
      expect(textItems).toHaveLength(1);

      // Distance between image items should be less than cluster spacing
      if (imageItems.length === 2) {
        const distance = Math.sqrt(
          Math.pow(imageItems[0].position[0] - imageItems[1].position[0], 2) +
          Math.pow(imageItems[0].position[2] - imageItems[1].position[2], 2)
        );
        expect(distance).toBeLessThan(config.clusterSpacing);
      }
    });

    test('should create distinct clusters', () => {
      const items = [
        { ...createTestItems(1)[0], assetType: 'image' as const },
        { ...createTestItems(1)[0], id: 'item-video', assetType: 'video' as const },
      ];

      const config: GroupingConfig = {
        strategy: 'clustered',
        clusterBy: 'contentType',
        clusterSpacing: 5.0,
        itemSpacing: 0.5,
        floorBounds: { width: 20, depth: 20 },
      };

      const result = applyClusteredGrouping(items, config);

      // Distance between different types should be at least cluster spacing
      const imageItem = result.find(item => item.assetType === 'image')!;
      const videoItem = result.find(item => item.assetType === 'video')!;

      const distance = Math.sqrt(
        Math.pow(imageItem.position[0] - videoItem.position[0], 2) +
        Math.pow(imageItem.position[2] - videoItem.position[2], 2)
      );

      expect(distance).toBeGreaterThanOrEqual(config.clusterSpacing);
    });

    test('should handle clustering by size', () => {
      const items = [
        { ...createTestItems(1)[0], scale: [1, 0.01, 1] as [number, number, number] }, // Small
        { ...createTestItems(1)[0], id: 'item-large', scale: [3, 0.01, 3] as [number, number, number] }, // Large
        { ...createTestItems(1)[0], id: 'item-small2', scale: [1, 0.01, 1] as [number, number, number] }, // Small
      ];

      const config: GroupingConfig = {
        strategy: 'clustered',
        clusterBy: 'size',
        clusterSpacing: 4.0,
        itemSpacing: 0.5,
        floorBounds: { width: 20, depth: 20 },
      };

      const result = applyClusteredGrouping(items, config);

      expect(result).toHaveLength(3);

      // Small items should be clustered together
      const smallItems = result.filter(item => 
        item.scale[0] === 1 && item.scale[2] === 1
      );
      const largeItems = result.filter(item => 
        item.scale[0] === 3 && item.scale[2] === 3
      );

      expect(smallItems).toHaveLength(2);
      expect(largeItems).toHaveLength(1);
    });
  });

  describe('applyElevatedGrouping', () => {
    test('should create multiple elevation levels', () => {
      const items = createTestItems(6);
      const config: GroupingConfig = {
        strategy: 'elevated',
        elevationLevels: 3,
        levelHeight: 2.0,
        itemsPerLevel: 2,
        floorBounds: { width: 20, depth: 20 },
      };

      const result = applyElevatedGrouping(items, config);

      expect(result).toHaveLength(6);

      // Should have items at different Y levels
      const yLevels = [...new Set(result.map(item => item.position[1]))];
      expect(yLevels).toHaveLength(3);

      // Levels should be spaced by levelHeight
      yLevels.sort((a, b) => a - b);
      for (let i = 1; i < yLevels.length; i++) {
        expect(yLevels[i] - yLevels[i-1]).toBeCloseTo(config.levelHeight, 2);
      }

      // Each level should have the specified number of items
      yLevels.forEach(level => {
        const itemsAtLevel = result.filter(item => 
          Math.abs(item.position[1] - level) < 0.01
        );
        expect(itemsAtLevel.length).toBeLessThanOrEqual(config.itemsPerLevel);
      });
    });

    test('should distribute items evenly across levels', () => {
      const items = createTestItems(9);
      const config: GroupingConfig = {
        strategy: 'elevated',
        elevationLevels: 3,
        levelHeight: 1.5,
        itemsPerLevel: 3,
        floorBounds: { width: 20, depth: 20 },
      };

      const result = applyElevatedGrouping(items, config);

      // Count items per level
      const levelCounts = new Map<number, number>();
      result.forEach(item => {
        const level = Math.round(item.position[1] * 10) / 10; // Round to avoid floating point issues
        levelCounts.set(level, (levelCounts.get(level) || 0) + 1);
      });

      // Should have exactly 3 items per level
      levelCounts.forEach(count => {
        expect(count).toBe(3);
      });
    });

    test('should handle overflow items', () => {
      const items = createTestItems(10); // More items than can fit evenly
      const config: GroupingConfig = {
        strategy: 'elevated',
        elevationLevels: 3,
        levelHeight: 1.0,
        itemsPerLevel: 3,
        floorBounds: { width: 20, depth: 20 },
      };

      const result = applyElevatedGrouping(items, config);

      expect(result).toHaveLength(10);

      // Should create additional level or distribute overflow
      const yLevels = [...new Set(result.map(item => item.position[1]))];
      expect(yLevels.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('applyTimelineGrouping', () => {
    test('should arrange items chronologically', () => {
      const items = [
        { 
          ...createTestItems(1)[0], 
          importMetadata: { 
            ...createTestItems(1)[0].importMetadata,
            importTimestamp: '2023-01-01T00:00:00Z' 
          }
        },
        { 
          ...createTestItems(1)[0], 
          id: 'item-newer',
          importMetadata: { 
            ...createTestItems(1)[0].importMetadata,
            importTimestamp: '2023-01-03T00:00:00Z' 
          }
        },
        { 
          ...createTestItems(1)[0], 
          id: 'item-middle',
          importMetadata: { 
            ...createTestItems(1)[0].importMetadata,
            importTimestamp: '2023-01-02T00:00:00Z' 
          }
        },
      ];

      const config: GroupingConfig = {
        strategy: 'timeline',
        timelineAxis: 'x',
        timelineSpacing: 2.0,
        sortBy: 'importTimestamp',
        floorBounds: { width: 20, depth: 20 },
      };

      const result = applyTimelineGrouping(items, config);

      expect(result).toHaveLength(3);

      // Should be sorted by timestamp along X axis
      const sortedByX = [...result].sort((a, b) => a.position[0] - b.position[0]);
      
      expect(sortedByX[0].importMetadata?.importTimestamp).toBe('2023-01-01T00:00:00Z');
      expect(sortedByX[1].importMetadata?.importTimestamp).toBe('2023-01-02T00:00:00Z');
      expect(sortedByX[2].importMetadata?.importTimestamp).toBe('2023-01-03T00:00:00Z');

      // Items should be spaced along timeline axis
      for (let i = 1; i < sortedByX.length; i++) {
        const spacing = sortedByX[i].position[0] - sortedByX[i-1].position[0];
        expect(spacing).toBeCloseTo(config.timelineSpacing, 1);
      }
    });

    test('should handle Z-axis timeline', () => {
      const items = createTestItems(3);
      const config: GroupingConfig = {
        strategy: 'timeline',
        timelineAxis: 'z',
        timelineSpacing: 1.5,
        sortBy: 'importTimestamp',
        floorBounds: { width: 20, depth: 20 },
      };

      const result = applyTimelineGrouping(items, config);

      // Should be arranged along Z axis
      const zPositions = result.map(item => item.position[2]);
      const sortedZ = [...zPositions].sort((a, b) => a - b);
      
      for (let i = 1; i < sortedZ.length; i++) {
        const spacing = sortedZ[i] - sortedZ[i-1];
        expect(spacing).toBeCloseTo(config.timelineSpacing, 1);
      }
    });

    test('should handle missing timestamps gracefully', () => {
      const items = [
        { ...createTestItems(1)[0] }, // No timestamp
        { 
          ...createTestItems(1)[0], 
          id: 'item-with-timestamp',
          importMetadata: { 
            ...createTestItems(1)[0].importMetadata,
            importTimestamp: '2023-01-01T00:00:00Z' 
          }
        },
      ];

      const config: GroupingConfig = {
        strategy: 'timeline',
        timelineAxis: 'x',
        timelineSpacing: 2.0,
        sortBy: 'importTimestamp',
        floorBounds: { width: 20, depth: 20 },
      };

      const result = applyTimelineGrouping(items, config);

      expect(result).toHaveLength(2);
      // Should not throw error and should arrange items somehow
    });
  });

  describe('applyGridGrouping', () => {
    test('should arrange items in regular grid', () => {
      const items = createTestItems(9);
      const config: GroupingConfig = {
        strategy: 'grid',
        gridColumns: 3,
        gridSpacing: 2.0,
        floorBounds: { width: 20, depth: 20 },
      };

      const result = applyGridGrouping(items, config);

      expect(result).toHaveLength(9);

      // Should form a 3x3 grid
      const positions = result.map(item => ({ x: item.position[0], z: item.position[2] }));
      
      // Check that we have exactly 3 unique X positions and 3 unique Z positions
      const uniqueX = [...new Set(positions.map(p => Math.round(p.x * 10) / 10))];
      const uniqueZ = [...new Set(positions.map(p => Math.round(p.z * 10) / 10))];
      
      expect(uniqueX).toHaveLength(3);
      expect(uniqueZ).toHaveLength(3);

      // Check spacing
      uniqueX.sort((a, b) => a - b);
      uniqueZ.sort((a, b) => a - b);
      
      for (let i = 1; i < uniqueX.length; i++) {
        expect(uniqueX[i] - uniqueX[i-1]).toBeCloseTo(config.gridSpacing, 1);
      }
      
      for (let i = 1; i < uniqueZ.length; i++) {
        expect(uniqueZ[i] - uniqueZ[i-1]).toBeCloseTo(config.gridSpacing, 1);
      }
    });

    test('should handle non-square grids', () => {
      const items = createTestItems(6);
      const config: GroupingConfig = {
        strategy: 'grid',
        gridColumns: 2,
        gridSpacing: 1.5,
        floorBounds: { width: 20, depth: 20 },
      };

      const result = applyGridGrouping(items, config);

      expect(result).toHaveLength(6);

      // Should form a 2x3 grid (2 columns, 3 rows)
      const positions = result.map(item => ({ x: item.position[0], z: item.position[2] }));
      
      const uniqueX = [...new Set(positions.map(p => Math.round(p.x * 10) / 10))];
      const uniqueZ = [...new Set(positions.map(p => Math.round(p.z * 10) / 10))];
      
      expect(uniqueX).toHaveLength(2); // 2 columns
      expect(uniqueZ).toHaveLength(3); // 3 rows
    });

    test('should center grid within bounds', () => {
      const items = createTestItems(4);
      const config: GroupingConfig = {
        strategy: 'grid',
        gridColumns: 2,
        gridSpacing: 2.0,
        floorBounds: { width: 10, depth: 10 },
        centerGrid: true,
      };

      const result = applyGridGrouping(items, config);

      // Grid should be centered around origin
      const positions = result.map(item => ({ x: item.position[0], z: item.position[2] }));
      
      const avgX = positions.reduce((sum, p) => sum + p.x, 0) / positions.length;
      const avgZ = positions.reduce((sum, p) => sum + p.z, 0) / positions.length;
      
      expect(avgX).toBeCloseTo(0, 1);
      expect(avgZ).toBeCloseTo(0, 1);
    });

    test('should handle single column', () => {
      const items = createTestItems(5);
      const config: GroupingConfig = {
        strategy: 'grid',
        gridColumns: 1,
        gridSpacing: 1.0,
        floorBounds: { width: 20, depth: 20 },
      };

      const result = applyGridGrouping(items, config);

      // Should form a single column (line)
      const positions = result.map(item => ({ x: item.position[0], z: item.position[2] }));
      
      const uniqueX = [...new Set(positions.map(p => Math.round(p.x * 10) / 10))];
      const uniqueZ = [...new Set(positions.map(p => Math.round(p.z * 10) / 10))];
      
      expect(uniqueX).toHaveLength(1); // Single column
      expect(uniqueZ).toHaveLength(5); // 5 rows
    });
  });

  describe('Edge cases and error handling', () => {
    test('should handle empty item arrays', () => {
      const config: GroupingConfig = {
        strategy: 'flat',
        spacing: 1.0,
        floorBounds: { width: 20, depth: 20 },
      };

      const result = applyFlatGrouping([], config);
      expect(result).toEqual([]);
    });

    test('should handle single item', () => {
      const items = createTestItems(1);
      const config: GroupingConfig = {
        strategy: 'clustered',
        clusterBy: 'contentType',
        clusterSpacing: 2.0,
        itemSpacing: 0.5,
        floorBounds: { width: 20, depth: 20 },
      };

      const result = applyClusteredGrouping(items, config);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('item-0');
    });

    test('should handle very small floor bounds', () => {
      const items = createTestItems(3);
      const config: GroupingConfig = {
        strategy: 'grid',
        gridColumns: 2,
        gridSpacing: 1.0,
        floorBounds: { width: 1, depth: 1 },
        respectBounds: true,
      };

      const result = applyGridGrouping(items, config);
      
      // Should still work but items might be very close together
      expect(result).toHaveLength(3);
      
      result.forEach(item => {
        expect(item.position[0]).toBeGreaterThanOrEqual(-0.5);
        expect(item.position[0]).toBeLessThanOrEqual(0.5);
        expect(item.position[2]).toBeGreaterThanOrEqual(-0.5);
        expect(item.position[2]).toBeLessThanOrEqual(0.5);
      });
    });

    test('should preserve item properties during grouping', () => {
      const items = createTestItems(2);
      items[0].opacity = 0.5;
      items[0].hoverEffect = 'glow';
      items[1].visible = false;

      const config: GroupingConfig = {
        strategy: 'flat',
        spacing: 1.0,
        floorBounds: { width: 20, depth: 20 },
      };

      const result = applyFlatGrouping(items, config);

      expect(result[0].opacity).toBe(0.5);
      expect(result[0].hoverEffect).toBe('glow');
      expect(result[1].visible).toBe(false);
    });
  });
});
