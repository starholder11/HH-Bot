/**
 * Unit tests for scene conversion
 * 
 * Tests the round-trip integrity between SpaceAsset and Three.js scenes
 * from PHASE 3: SPATIAL WORK.md Task 4.2
 */

import {
  convertSpaceToThreeJSScene,
  convertThreeJSSceneToSpace,
  type ThreeJSSceneData,
  type ConversionOptions,
} from '../../lib/spatial/scene-conversion';
import { type SpaceAsset } from '../../lib/media-storage';

describe('Scene Conversion', () => {
  // Helper to create test SpaceAsset
  const createTestSpaceAsset = (): SpaceAsset => ({
    id: 'test-space',
    filename: 'test-space.json',
    media_type: 'space',
    space_type: 'custom',
    metadata: { item_count: 3 },
    space: {
      environment: {
        backgroundColor: '#111217',
        lighting: 'studio',
        fog: { enabled: true, color: '#ffffff', density: 0.01 },
        skybox: 'city',
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
          assetId: 'asset-1',
          assetType: 'image',
          position: [0, 0.1, 0],
          rotation: [0, 0, 0],
          scale: [1, 0.01, 1],
          visible: true,
          clickable: true,
          hoverEffect: 'glow',
        },
        {
          id: 'item-2',
          assetId: 'asset-2',
          assetType: 'object',
          position: [2, 0.5, -1],
          rotation: [0, Math.PI / 4, 0],
          scale: [1.5, 1.5, 1.5],
          visible: true,
          clickable: true,
          hoverEffect: 'scale',
          objectProperties: {
            showComponents: true,
            interactionLevel: 'component',
            lodLevel: 1,
            physics: { enabled: false },
          },
        },
        {
          id: 'item-3',
          assetId: 'asset-3',
          assetType: 'object_collection',
          position: [-2, 0.1, 1],
          rotation: [0, -Math.PI / 6, 0],
          scale: [0.8, 0.8, 0.8],
          visible: false,
          clickable: false,
          hoverEffect: 'none',
          objectProperties: {
            showComponents: false,
            interactionLevel: 'collection',
            lodLevel: 2,
            physics: { enabled: true },
          },
        },
      ],
    },
    s3_url: 'spaces/test-space.json',
    cloudflare_url: '',
    processing_status: {
      created: 'completed',
      spatial_preview: 'completed',
      thumbnail: 'completed',
    },
    timestamps: {
      created: '2023-01-01T00:00:00Z',
      updated: '2023-01-01T00:00:00Z',
    },
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
  });

  // Helper to create test Three.js scene data
  const createTestThreeJSScene = (): ThreeJSSceneData => ({
    metadata: {
      version: '4.3',
      type: 'Object',
      generator: 'Object3D.toJSON',
    },
    geometries: [
      {
        uuid: 'geo-1',
        type: 'PlaneGeometry',
        width: 1,
        height: 1,
      },
      {
        uuid: 'geo-2',
        type: 'BoxGeometry',
        width: 1,
        height: 1,
        depth: 1,
      },
    ],
    materials: [
      {
        uuid: 'mat-1',
        type: 'MeshBasicMaterial',
        color: 0xffffff,
        transparent: true,
        opacity: 1,
      },
      {
        uuid: 'mat-2',
        type: 'MeshStandardMaterial',
        color: 0x808080,
        roughness: 0.5,
        metalness: 0.1,
      },
    ],
    object: {
      uuid: 'scene-root',
      type: 'Scene',
      name: 'Scene',
      children: [
        {
          uuid: 'item-1',
          type: 'Mesh',
          name: 'item-1',
          geometry: 'geo-1',
          material: 'mat-1',
          position: [0, 0.1, 0],
          rotation: [0, 0, 0],
          scale: [1, 0.01, 1],
          visible: true,
          userData: {
            assetId: 'asset-1',
            assetType: 'image',
            clickable: true,
            hoverEffect: 'glow',
          },
        },
        {
          uuid: 'item-2',
          type: 'Group',
          name: 'item-2',
          position: [2, 0.5, -1],
          rotation: [0, Math.PI / 4, 0],
          scale: [1.5, 1.5, 1.5],
          visible: true,
          userData: {
            assetId: 'asset-2',
            assetType: 'object',
            clickable: true,
            hoverEffect: 'scale',
            objectProperties: {
              showComponents: true,
              interactionLevel: 'component',
              lodLevel: 1,
              physics: { enabled: false },
            },
          },
          children: [
            {
              uuid: 'item-2-mesh',
              type: 'Mesh',
              name: 'ObjectMesh',
              geometry: 'geo-2',
              material: 'mat-2',
              position: [0, 0, 0],
              rotation: [0, 0, 0],
              scale: [1, 1, 1],
            },
          ],
        },
        {
          uuid: 'item-3',
          type: 'Group',
          name: 'item-3',
          position: [-2, 0.1, 1],
          rotation: [0, -Math.PI / 6, 0],
          scale: [0.8, 0.8, 0.8],
          visible: false,
          userData: {
            assetId: 'asset-3',
            assetType: 'object_collection',
            clickable: false,
            hoverEffect: 'none',
            objectProperties: {
              showComponents: false,
              interactionLevel: 'collection',
              lodLevel: 2,
              physics: { enabled: true },
            },
          },
          children: [],
        },
      ],
    },
    environment: {
      backgroundColor: '#111217',
      lighting: 'studio',
      fog: { enabled: true, color: '#ffffff', density: 0.01 },
      skybox: 'city',
    },
    camera: {
      position: [4, 3, 6],
      target: [0, 0, 0],
      fov: 50,
      controls: 'orbit',
    },
  });

  describe('convertSpaceToThreeJSScene', () => {
    test('should convert SpaceAsset to ThreeJS scene format', () => {
      const spaceAsset = createTestSpaceAsset();
      const options: ConversionOptions = {
        includeEnvironment: true,
        includeCamera: true,
        generateGeometries: true,
        generateMaterials: true,
      };

      const result = convertSpaceToThreeJSScene(spaceAsset, options);

      // Check metadata
      expect(result.metadata.type).toBe('Object');
      expect(result.metadata.generator).toBe('Object3D.toJSON');

      // Check environment
      expect(result.environment).toEqual(spaceAsset.space.environment);

      // Check camera
      expect(result.camera).toEqual(spaceAsset.space.camera);

      // Check scene structure
      expect(result.object.type).toBe('Scene');
      expect(result.object.children).toHaveLength(3);

      // Check first item (image)
      const item1 = result.object.children[0];
      expect(item1.name).toBe('item-1');
      expect(item1.position).toEqual([0, 0.1, 0]);
      expect(item1.userData.assetId).toBe('asset-1');
      expect(item1.userData.assetType).toBe('image');

      // Check second item (object with components)
      const item2 = result.object.children[1];
      expect(item2.name).toBe('item-2');
      expect(item2.type).toBe('Group'); // Objects become groups
      expect(item2.userData.objectProperties).toBeDefined();

      // Check third item (collection)
      const item3 = result.object.children[2];
      expect(item3.name).toBe('item-3');
      expect(item3.visible).toBe(false);
      expect(item3.userData.assetType).toBe('object_collection');
    });

    test('should generate appropriate geometries and materials', () => {
      const spaceAsset = createTestSpaceAsset();
      const options: ConversionOptions = {
        generateGeometries: true,
        generateMaterials: true,
      };

      const result = convertSpaceToThreeJSScene(spaceAsset, options);

      // Should have geometries for different asset types
      expect(result.geometries.length).toBeGreaterThan(0);
      expect(result.materials.length).toBeGreaterThan(0);

      // Check geometry types
      const geometryTypes = result.geometries.map(geo => geo.type);
      expect(geometryTypes).toContain('PlaneGeometry'); // For images
      expect(geometryTypes).toContain('BoxGeometry'); // For fallback objects

      // Check material types
      const materialTypes = result.materials.map(mat => mat.type);
      expect(materialTypes).toContain('MeshBasicMaterial');
    });

    test('should handle minimal conversion options', () => {
      const spaceAsset = createTestSpaceAsset();
      const options: ConversionOptions = {
        includeEnvironment: false,
        includeCamera: false,
        generateGeometries: false,
        generateMaterials: false,
      };

      const result = convertSpaceToThreeJSScene(spaceAsset, options);

      expect(result.environment).toBeUndefined();
      expect(result.camera).toBeUndefined();
      expect(result.geometries).toHaveLength(0);
      expect(result.materials).toHaveLength(0);

      // Should still have scene structure
      expect(result.object.children).toHaveLength(3);
    });

    test('should preserve custom userData', () => {
      const spaceAsset = createTestSpaceAsset();
      spaceAsset.space.items[0].customData = { customProp: 'test-value' };

      const result = convertSpaceToThreeJSScene(spaceAsset);

      const item1 = result.object.children[0];
      expect(item1.userData.customData).toEqual({ customProp: 'test-value' });
    });

    test('should handle empty space', () => {
      const spaceAsset = createTestSpaceAsset();
      spaceAsset.space.items = [];

      const result = convertSpaceToThreeJSScene(spaceAsset);

      expect(result.object.children).toHaveLength(0);
      expect(result.geometries).toHaveLength(0);
      expect(result.materials).toHaveLength(0);
    });
  });

  describe('convertThreeJSSceneToSpace', () => {
    test('should convert ThreeJS scene to SpaceAsset format', () => {
      const threeJSScene = createTestThreeJSScene();
      const options: ConversionOptions = {
        preserveHierarchy: true,
        extractEnvironment: true,
        extractCamera: true,
      };

      const result = convertThreeJSSceneToSpace(threeJSScene, 'converted-space', options);

      // Check basic structure
      expect(result.id).toBe('converted-space');
      expect(result.media_type).toBe('space');
      expect(result.space_type).toBe('imported');

      // Check environment
      expect(result.space.environment).toEqual(threeJSScene.environment);

      // Check camera
      expect(result.space.camera).toEqual(threeJSScene.camera);

      // Check items
      expect(result.space.items).toHaveLength(3);

      // Check first item
      const item1 = result.space.items[0];
      expect(item1.id).toBe('item-1');
      expect(item1.assetId).toBe('asset-1');
      expect(item1.assetType).toBe('image');
      expect(item1.position).toEqual([0, 0.1, 0]);
      expect(item1.visible).toBe(true);

      // Check second item (group with object properties)
      const item2 = result.space.items[1];
      expect(item2.id).toBe('item-2');
      expect(item2.assetType).toBe('object');
      expect(item2.objectProperties).toBeDefined();
      expect(item2.objectProperties?.interactionLevel).toBe('component');

      // Check third item
      const item3 = result.space.items[2];
      expect(item3.id).toBe('item-3');
      expect(item3.visible).toBe(false);
      expect(item3.assetType).toBe('object_collection');
    });

    test('should handle nested hierarchies', () => {
      const threeJSScene = createTestThreeJSScene();
      
      // Add nested structure
      threeJSScene.object.children[1].children = [
        {
          uuid: 'nested-item',
          type: 'Mesh',
          name: 'NestedMesh',
          geometry: 'geo-2',
          material: 'mat-2',
          position: [0.5, 0, 0],
          rotation: [0, 0, 0],
          scale: [0.5, 0.5, 0.5],
          userData: {
            assetId: 'nested-asset',
            assetType: 'object',
          },
        },
      ];

      const options: ConversionOptions = {
        preserveHierarchy: true,
        flattenHierarchy: false,
      };

      const result = convertThreeJSSceneToSpace(threeJSScene, 'nested-space', options);

      // Should preserve hierarchy in some way (implementation dependent)
      expect(result.space.items.length).toBeGreaterThan(0);
      
      // Check that nested items are handled
      const hasNestedData = result.space.items.some(item => 
        item.id.includes('nested') || 
        (item.objectProperties && item.objectProperties.children)
      );
      expect(hasNestedData).toBe(true);
    });

    test('should extract materials and geometries info', () => {
      const threeJSScene = createTestThreeJSScene();
      const options: ConversionOptions = {
        extractMaterials: true,
        extractGeometries: true,
      };

      const result = convertThreeJSSceneToSpace(threeJSScene, 'material-space', options);

      // Should have material/geometry info in metadata or items
      expect(result.metadata.item_count).toBe(3);
      
      // Items should have material/geometry references
      const itemsWithMaterials = result.space.items.filter(item => 
        item.renderingProperties?.materialId || item.renderingProperties?.geometryId
      );
      expect(itemsWithMaterials.length).toBeGreaterThan(0);
    });

    test('should handle missing environment and camera', () => {
      const threeJSScene = createTestThreeJSScene();
      delete threeJSScene.environment;
      delete threeJSScene.camera;

      const result = convertThreeJSSceneToSpace(threeJSScene, 'minimal-space');

      // Should use defaults
      expect(result.space.environment).toBeDefined();
      expect(result.space.camera).toBeDefined();
      expect(result.space.environment.backgroundColor).toBeDefined();
      expect(result.space.camera.position).toBeDefined();
    });
  });

  describe('Round-trip conversion integrity', () => {
    test('should maintain data integrity through round-trip conversion', () => {
      const originalSpace = createTestSpaceAsset();
      
      // Convert to Three.js and back
      const threeJSScene = convertSpaceToThreeJSScene(originalSpace);
      const convertedSpace = convertThreeJSSceneToSpace(threeJSScene, originalSpace.id);

      // Check environment preservation
      expect(convertedSpace.space.environment.backgroundColor)
        .toBe(originalSpace.space.environment.backgroundColor);
      expect(convertedSpace.space.environment.lighting)
        .toBe(originalSpace.space.environment.lighting);

      // Check camera preservation
      expect(convertedSpace.space.camera.position)
        .toEqual(originalSpace.space.camera.position);
      expect(convertedSpace.space.camera.fov)
        .toBe(originalSpace.space.camera.fov);

      // Check item count
      expect(convertedSpace.space.items).toHaveLength(originalSpace.space.items.length);

      // Check specific item properties
      const originalItem1 = originalSpace.space.items[0];
      const convertedItem1 = convertedSpace.space.items.find(item => item.id === originalItem1.id);
      
      expect(convertedItem1).toBeDefined();
      expect(convertedItem1!.assetId).toBe(originalItem1.assetId);
      expect(convertedItem1!.assetType).toBe(originalItem1.assetType);
      expect(convertedItem1!.position).toEqual(originalItem1.position);
      expect(convertedItem1!.visible).toBe(originalItem1.visible);
    });

    test('should handle precision loss gracefully', () => {
      const originalSpace = createTestSpaceAsset();
      
      // Add high-precision values
      originalSpace.space.items[0].position = [1.123456789, 2.987654321, -3.456789012];
      originalSpace.space.items[0].rotation = [0.123456789, 1.987654321, -2.456789012];

      const threeJSScene = convertSpaceToThreeJSScene(originalSpace);
      const convertedSpace = convertThreeJSSceneToSpace(threeJSScene, originalSpace.id);

      const originalItem = originalSpace.space.items[0];
      const convertedItem = convertedSpace.space.items.find(item => item.id === originalItem.id);

      // Should be close but may have some precision loss
      expect(convertedItem!.position[0]).toBeCloseTo(originalItem.position[0], 5);
      expect(convertedItem!.position[1]).toBeCloseTo(originalItem.position[1], 5);
      expect(convertedItem!.position[2]).toBeCloseTo(originalItem.position[2], 5);
    });

    test('should preserve custom properties through round-trip', () => {
      const originalSpace = createTestSpaceAsset();
      
      // Add custom properties
      originalSpace.space.items[0].customData = {
        userNotes: 'This is a test note',
        tags: ['important', 'demo'],
        metadata: { version: 1.2 },
      };

      const threeJSScene = convertSpaceToThreeJSScene(originalSpace);
      const convertedSpace = convertThreeJSSceneToSpace(threeJSScene, originalSpace.id);

      const convertedItem = convertedSpace.space.items.find(item => 
        item.id === originalSpace.space.items[0].id
      );

      expect(convertedItem!.customData).toEqual(originalSpace.space.items[0].customData);
    });

    test('should handle multiple round-trips without degradation', () => {
      let currentSpace = createTestSpaceAsset();
      
      // Perform multiple round-trips
      for (let i = 0; i < 3; i++) {
        const threeJSScene = convertSpaceToThreeJSScene(currentSpace);
        currentSpace = convertThreeJSSceneToSpace(threeJSScene, `space-${i}`);
      }

      const originalSpace = createTestSpaceAsset();

      // Core properties should remain stable
      expect(currentSpace.space.items).toHaveLength(originalSpace.space.items.length);
      expect(currentSpace.space.environment.backgroundColor)
        .toBe(originalSpace.space.environment.backgroundColor);
      
      // Positions should be close (allowing for accumulated precision loss)
      const originalItem = originalSpace.space.items[0];
      const finalItem = currentSpace.space.items.find(item => 
        item.assetId === originalItem.assetId
      );
      
      expect(finalItem!.position[0]).toBeCloseTo(originalItem.position[0], 3);
      expect(finalItem!.position[1]).toBeCloseTo(originalItem.position[1], 3);
      expect(finalItem!.position[2]).toBeCloseTo(originalItem.position[2], 3);
    });
  });

  describe('Error handling and edge cases', () => {
    test('should handle malformed Three.js scene data', () => {
      const malformedScene = {
        metadata: { version: '4.3' },
        object: {
          type: 'Scene',
          children: [
            {
              // Missing required properties
              uuid: 'broken-item',
              type: 'Mesh',
            },
          ],
        },
      } as ThreeJSSceneData;

      expect(() => {
        convertThreeJSSceneToSpace(malformedScene, 'broken-space');
      }).not.toThrow();

      const result = convertThreeJSSceneToSpace(malformedScene, 'broken-space');
      expect(result.space.items).toHaveLength(1);
      expect(result.space.items[0].id).toBe('broken-item');
    });

    test('should handle empty Three.js scene', () => {
      const emptyScene: ThreeJSSceneData = {
        metadata: { version: '4.3', type: 'Object', generator: 'Test' },
        geometries: [],
        materials: [],
        object: {
          uuid: 'empty-scene',
          type: 'Scene',
          name: 'EmptyScene',
          children: [],
        },
      };

      const result = convertThreeJSSceneToSpace(emptyScene, 'empty-space');

      expect(result.space.items).toHaveLength(0);
      expect(result.metadata.item_count).toBe(0);
    });

    test('should handle very large scenes', () => {
      const largeSpace = createTestSpaceAsset();
      
      // Add many items
      for (let i = 0; i < 1000; i++) {
        largeSpace.space.items.push({
          id: `large-item-${i}`,
          assetId: `large-asset-${i}`,
          assetType: 'image',
          position: [i % 100, 0.1, Math.floor(i / 100)],
          rotation: [0, 0, 0],
          scale: [1, 0.01, 1],
          visible: true,
          clickable: true,
          hoverEffect: 'none',
        });
      }

      const threeJSScene = convertSpaceToThreeJSScene(largeSpace);
      const convertedSpace = convertThreeJSSceneToSpace(threeJSScene, 'large-converted');

      expect(convertedSpace.space.items).toHaveLength(1003); // Original 3 + 1000 new
      expect(convertedSpace.metadata.item_count).toBe(1003);
    });
  });
});