/**
 * Unit tests for scene conversion
 * 
 * Tests bidirectional conversion between SpaceAsset and Three.js scene formats
 */

import {
  convertSpaceToThreeJSScene,
  convertThreeJSSceneToSpace,
  validateConversionIntegrity,
  testRoundTripConversion,
} from '../../lib/spatial/scene-conversion';
import type { SpaceAsset } from '../../lib/media-storage';

describe('Scene Conversion', () => {
  const mockSpaceAsset: SpaceAsset = {
    id: 'test-space-001',
    filename: 'test-space.json',
    media_type: 'space',
    space_type: 'gallery',
    metadata: { item_count: 2 },
    space: {
      environment: {
        backgroundColor: '#111217',
        lighting: 'studio',
        fog: { color: '#000000', density: 0.01 },
      },
      camera: {
        position: [4, 3, 6],
        target: [0, 0, 0],
        fov: 50,
        controls: 'orbit',
      },
      items: [
        {
          id: 'item-1',
          assetId: 'image-001',
          assetType: 'image',
          position: [0, 1, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          opacity: 1,
          visible: true,
          clickable: true,
          hoverEffect: 'glow',
        },
        {
          id: 'item-2',
          assetId: 'object-001',
          assetType: 'object',
          position: [2, 0, -1],
          rotation: [0, Math.PI / 4, 0],
          scale: [0.8, 0.8, 0.8],
          opacity: 1,
          visible: true,
          clickable: true,
          hoverEffect: 'scale',
          objectProperties: {
            showComponents: true,
            interactionLevel: 'object',
          },
        },
      ],
      relationships: [],
      zones: [],
    },
    s3_url: 'spaces/test-space-001.json',
    cloudflare_url: '',
    processing_status: {
      created: 'completed',
      spatial_preview: 'completed',
      thumbnail: 'completed',
    },
    timestamps: {
      created: '2024-01-01T00:00:00Z',
      updated: '2024-01-01T00:00:00Z',
    },
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    title: 'Test Space',
    description: 'Test space for conversion',
    ai_labels: { scenes: [], objects: [], style: [], mood: [], themes: [], confidence_scores: {} },
    manual_labels: { scenes: [], objects: [], style: [], mood: [], themes: [], custom_tags: [] },
    processing_status: {
      upload: 'completed',
      metadata_extraction: 'completed',
      ai_labeling: 'not_started',
      manual_review: 'pending',
    },
    timestamps: {
      uploaded: '2024-01-01T00:00:00Z',
      metadata_extracted: '2024-01-01T00:00:00Z',
      labeled_ai: null,
      labeled_reviewed: null,
    },
    labeling_complete: false,
    project_id: null,
  };

  describe('convertSpaceToThreeJSScene', () => {
    test('should convert space asset to valid Three.js scene', () => {
      const scene = convertSpaceToThreeJSScene(mockSpaceAsset);
      
      expect(scene.metadata.version).toBe('4.3');
      expect(scene.metadata.type).toBe('Object');
      expect(scene.object.uuid).toBe('test-space-001');
      expect(scene.object.type).toBe('Scene');
      expect(scene.object.children).toHaveLength(2);
    });

    test('should preserve space metadata in userData', () => {
      const scene = convertSpaceToThreeJSScene(mockSpaceAsset, { includeMetadata: true });
      
      expect(scene.object.userData).toBeDefined();
      expect(scene.object.userData.spaceMetadata.environment).toEqual(mockSpaceAsset.space.environment);
      expect(scene.object.userData.spaceMetadata.camera).toEqual(mockSpaceAsset.space.camera);
    });

    test('should generate geometries and materials for items', () => {
      const scene = convertSpaceToThreeJSScene(mockSpaceAsset);
      
      expect(scene.geometries.length).toBeGreaterThan(0);
      expect(scene.materials.length).toBeGreaterThan(0);
    });
  });

  describe('convertThreeJSSceneToSpace', () => {
    test('should convert Three.js scene back to space asset', () => {
      const scene = convertSpaceToThreeJSScene(mockSpaceAsset);
      const reconvertedSpace = convertThreeJSSceneToSpace(scene, 'test-space-001');
      
      expect(reconvertedSpace.id).toBe('test-space-001');
      expect(reconvertedSpace.media_type).toBe('space');
      expect(reconvertedSpace.space.items).toHaveLength(2);
    });

    test('should preserve item positions and transforms', () => {
      const scene = convertSpaceToThreeJSScene(mockSpaceAsset);
      const reconvertedSpace = convertThreeJSSceneToSpace(scene, 'test-space-001');
      
      const originalItem = mockSpaceAsset.space.items[0];
      const reconvertedItem = reconvertedSpace.space.items[0];
      
      expect(reconvertedItem.assetId).toBe(originalItem.assetId);
      expect(reconvertedItem.assetType).toBe(originalItem.assetType);
      // Position should be preserved (with small tolerance for floating point)
      expect(reconvertedItem.position[0]).toBeCloseTo(originalItem.position[0], 3);
      expect(reconvertedItem.position[1]).toBeCloseTo(originalItem.position[1], 3);
      expect(reconvertedItem.position[2]).toBeCloseTo(originalItem.position[2], 3);
    });
  });

  describe('Round-trip conversion', () => {
    test('should maintain data integrity through full round-trip', () => {
      const result = testRoundTripConversion(mockSpaceAsset);
      
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.performance.spaceToScene).toBeGreaterThan(0);
      expect(result.performance.sceneToSpace).toBeGreaterThan(0);
    });

    test('should validate conversion integrity', () => {
      const scene = convertSpaceToThreeJSScene(mockSpaceAsset);
      const reconvertedSpace = convertThreeJSSceneToSpace(scene, 'test-space-001');
      const validation = validateConversionIntegrity(mockSpaceAsset, scene, reconvertedSpace);
      
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });

  describe('Edge cases', () => {
    test('should handle empty space', () => {
      const emptySpace = {
        ...mockSpaceAsset,
        space: {
          ...mockSpaceAsset.space,
          items: [],
        },
      };
      
      const scene = convertSpaceToThreeJSScene(emptySpace);
      expect(scene.object.children).toHaveLength(0);
      
      const reconverted = convertThreeJSSceneToSpace(scene, emptySpace.id);
      expect(reconverted.space.items).toHaveLength(0);
    });

    test('should handle malformed items gracefully', () => {
      const malformedSpace = {
        ...mockSpaceAsset,
        space: {
          ...mockSpaceAsset.space,
          items: [
            {
              id: 'malformed-item',
              assetId: 'missing-asset',
              assetType: 'unknown',
              position: [null, undefined, 'invalid'],
              rotation: [],
              scale: [1],
            } as any,
          ],
        },
      };
      
      expect(() => {
        const scene = convertSpaceToThreeJSScene(malformedSpace);
        convertThreeJSSceneToSpace(scene, malformedSpace.id);
      }).not.toThrow();
    });
  });
});
