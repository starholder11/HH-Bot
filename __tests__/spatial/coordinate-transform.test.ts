/**
 * Unit tests for coordinate transformation
 * 
 * Tests the exact formulas from PHASE 3: SPATIAL WORK.md
 * using the golden test vectors from lines 1025-1061
 */

import {
  calculateItemTransform,
  transformLayoutToSpace,
  TEST_VECTORS,
  type LayoutItem,
  type LayoutDesignSize,
} from '../../lib/spatial/coordinate-transform';

describe('Coordinate Transformation', () => {
  // Helper function to round numbers for comparison (avoiding floating point issues)
  const roundToThreeDecimals = (num: number) => Math.round(num * 1000) / 1000;
  const roundPosition = (pos: [number, number, number]): [number, number, number] => [
    roundToThreeDecimals(pos[0]),
    roundToThreeDecimals(pos[1]),
    roundToThreeDecimals(pos[2]),
  ];
  const roundScale = (scale: [number, number, number]): [number, number, number] => [
    roundToThreeDecimals(scale[0]),
    roundToThreeDecimals(scale[1]),
    roundToThreeDecimals(scale[2]),
  ];

  describe('calculateItemTransform', () => {
    test.each(TEST_VECTORS)(
      '$name',
      ({ designSize, floorSize, item, expected }) => {
        const aspectRatio = designSize.height / designSize.width;
        const floorDepth = floorSize * aspectRatio;
        
        const result = calculateItemTransform(
          item as LayoutItem,
          designSize,
          {
            floorWidth: floorSize,
            floorDepth,
            itemHeight: 0.1,
            thickness: 0.01,
          }
        );

        // Test position with ±0.001m precision as specified
        expect(roundPosition(result.position)).toEqual(
          roundPosition(expected.position as [number, number, number])
        );

        // Test scale with ±0.001m precision
        expect(roundScale(result.scale)).toEqual(
          roundScale(expected.scale as [number, number, number])
        );

        // Rotation should always be [0, 0, 0] for basic import
        expect(result.rotation).toEqual([0, 0, 0]);
      }
    );
  });

  describe('transformLayoutToSpace', () => {
    test('should transform multiple items correctly', () => {
      const designSize: LayoutDesignSize = { width: 1440, height: 1024 };
      const items: LayoutItem[] = [
        {
          id: 'item1',
          x: 576,
          y: 409.5,
          w: 288,
          h: 205,
          contentType: 'image',
        },
        {
          id: 'item2',
          x: 0,
          y: 0,
          w: 144,
          h: 102,
          contentType: 'image',
        },
      ];

      const result = transformLayoutToSpace(items, designSize, { floorSize: 20 });

      expect(result.spaceItems).toHaveLength(2);
      expect(result.originalBounds).toEqual({ width: 1440, height: 1024 });
      expect(result.floorDimensions.width).toBe(20);
      expect(result.floorDimensions.depth).toBeCloseTo(14.222, 3);

      // Check first item (centered)
      const item1 = result.spaceItems[0];
      expect(roundPosition(item1.position)).toEqual([0, 0.1, 0]);
      expect(roundScale(item1.scale)).toEqual([4, 0.01, 2.844]);

      // Check second item (top-left)
      const item2 = result.spaceItems[1];
      expect(roundPosition(item2.position)).toEqual([-9, 0.1, 6.403]);
      expect(roundScale(item2.scale)).toEqual([2, 0.01, 1.417]);
    });

    test('should preserve import metadata', () => {
      const designSize: LayoutDesignSize = { width: 1000, height: 1000 };
      const items: LayoutItem[] = [
        {
          id: 'test-item',
          x: 100,
          y: 200,
          w: 300,
          h: 400,
          contentType: 'image',
          refId: 'media-123',
          opacity: 0.8,
        },
      ];

      const result = transformLayoutToSpace(items, designSize, {}, 'layout-abc');

      const spaceItem = result.spaceItems[0];
      expect(spaceItem.assetId).toBe('media-123');
      expect(spaceItem.assetType).toBe('image');
      expect(spaceItem.opacity).toBe(0.8);
      expect(spaceItem.importMetadata).toEqual({
        originalLayoutId: 'layout-abc',
        originalItemId: 'test-item',
        originalPosition: { x: 100, y: 200 },
        originalDimensions: { w: 300, h: 400 },
        importTimestamp: expect.any(String),
      });
    });

    test('should handle normalized coordinates', () => {
      const designSize: LayoutDesignSize = { width: 1000, height: 1000 };
      const items: LayoutItem[] = [
        {
          id: 'normalized-item',
          x: 250, // This should be ignored
          y: 250, // This should be ignored
          w: 500, // This should be ignored
          h: 500, // This should be ignored
          nx: 0.25, // Use this instead
          ny: 0.25, // Use this instead
          nw: 0.5,  // Use this instead
          nh: 0.5,  // Use this instead
          contentType: 'image',
        },
      ];

      const result = transformLayoutToSpace(items, designSize, { floorSize: 10 });

      const spaceItem = result.spaceItems[0];
      
      // Center should be at nx + nw/2 = 0.25 + 0.25 = 0.5 (center of layout)
      // Position should be (0.5 - 0.5) * 10 = 0 for X
      // Position should be (0.5 - 0.5) * 10 = 0 for Z
      expect(roundPosition(spaceItem.position)).toEqual([0, 0.1, 0]);
      
      // Scale should be nw * floorWidth = 0.5 * 10 = 5 for X
      // Scale should be nh * floorDepth = 0.5 * 10 = 5 for Z
      expect(roundScale(spaceItem.scale)).toEqual([5, 0.01, 5]);
    });

    test('should handle custom configuration', () => {
      const designSize: LayoutDesignSize = { width: 1000, height: 1000 };
      const items: LayoutItem[] = [
        {
          id: 'custom-item',
          x: 0,
          y: 0,
          w: 1000,
          h: 1000,
          contentType: 'image',
        },
      ];

      const result = transformLayoutToSpace(items, designSize, {
        floorSize: 30,
        itemHeight: 0.5,
        thickness: 0.02,
        preserveAspectRatio: false,
      });

      const spaceItem = result.spaceItems[0];
      
      // Should use custom height and thickness
      expect(spaceItem.position[1]).toBe(0.5);
      expect(spaceItem.scale[1]).toBe(0.02);
      
      // Should use custom floor size
      expect(result.floorDimensions.width).toBe(30);
      expect(result.floorDimensions.depth).toBe(30); // Not preserving aspect ratio
    });
  });

  describe('Edge cases', () => {
    test('should handle zero-sized items gracefully', () => {
      const designSize: LayoutDesignSize = { width: 1000, height: 1000 };
      const items: LayoutItem[] = [
        {
          id: 'zero-item',
          x: 500,
          y: 500,
          w: 0,
          h: 0,
          contentType: 'image',
        },
      ];

      const result = transformLayoutToSpace(items, designSize);

      const spaceItem = result.spaceItems[0];
      expect(spaceItem.scale[0]).toBe(0);
      expect(spaceItem.scale[2]).toBe(0);
    });

    test('should handle items outside layout bounds', () => {
      const designSize: LayoutDesignSize = { width: 1000, height: 1000 };
      const items: LayoutItem[] = [
        {
          id: 'outside-item',
          x: 1500, // Outside bounds
          y: 1500, // Outside bounds
          w: 100,
          h: 100,
          contentType: 'image',
        },
      ];

      const result = transformLayoutToSpace(items, designSize);

      // Should still transform, but will be outside the expected floor area
      const spaceItem = result.spaceItems[0];
      expect(spaceItem.position[0]).toBeGreaterThan(10); // Outside normal range
      expect(spaceItem.position[2]).toBeLessThan(-10); // Outside normal range
    });

    test('should handle very small layouts', () => {
      const designSize: LayoutDesignSize = { width: 10, height: 10 };
      const items: LayoutItem[] = [
        {
          id: 'small-item',
          x: 5,
          y: 5,
          w: 2,
          h: 2,
          contentType: 'image',
        },
      ];

      const result = transformLayoutToSpace(items, designSize);

      // Should work without errors
      expect(result.spaceItems).toHaveLength(1);
      expect(result.spaceItems[0].position[1]).toBe(0.1); // Default height
    });

    test('should handle very large layouts', () => {
      const designSize: LayoutDesignSize = { width: 10000, height: 10000 };
      const items: LayoutItem[] = [
        {
          id: 'large-item',
          x: 5000,
          y: 5000,
          w: 1000,
          h: 1000,
          contentType: 'image',
        },
      ];

      const result = transformLayoutToSpace(items, designSize);

      // Should work and center the item
      const spaceItem = result.spaceItems[0];
      expect(roundPosition(spaceItem.position)).toEqual([0, 0.1, 0]);
    });
  });

  describe('Aspect ratio preservation', () => {
    test('should preserve aspect ratio by default', () => {
      const designSize: LayoutDesignSize = { width: 1920, height: 1080 };
      
      const result = transformLayoutToSpace([], designSize, { floorSize: 20 });
      
      const expectedDepth = 20 * (1080 / 1920);
      expect(result.floorDimensions.depth).toBeCloseTo(expectedDepth, 3);
    });

    test('should not preserve aspect ratio when disabled', () => {
      const designSize: LayoutDesignSize = { width: 1920, height: 1080 };
      
      const result = transformLayoutToSpace([], designSize, { 
        floorSize: 20,
        preserveAspectRatio: false,
      });
      
      expect(result.floorDimensions.depth).toBe(20);
    });
  });
});
