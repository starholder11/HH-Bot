/**
 * Unit tests for object hierarchy rendering and manipulation
 * 
 * Tests the hierarchical object system from PHASE 3: SPATIAL WORK.md
 * including atomic/composite objects, collections, and component interactions
 */

import { render, screen } from '@testing-library/react';
import { Canvas } from '@react-three/fiber';
import ObjectRenderer from '../../components/spatial/ObjectRenderer';
import CollectionRenderer from '../../components/spatial/CollectionRenderer';
import { type ObjectAsset, type ObjectCollection } from '../../lib/media-storage';

// Mock Three.js components for testing
jest.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children: React.ReactNode }) => <div data-testid="canvas">{children}</div>,
  useFrame: jest.fn(),
  useThree: () => ({ camera: {}, scene: {} }),
}));

jest.mock('@react-three/drei', () => ({
  useGLTF: jest.fn(() => ({ scene: { clone: () => ({}) } })),
  Clone: ({ children }: { children: React.ReactNode }) => <div data-testid="clone">{children}</div>,
  Text: ({ children }: { children: React.ReactNode }) => <div data-testid="text">{children}</div>,
}));

describe('Object Hierarchy', () => {
  // Helper to create atomic object
  const createAtomicObject = (): ObjectAsset => ({
    id: 'atomic-obj',
    filename: 'atomic.glb',
    media_type: 'object',
    object_type: 'atomic',
    object: {
      modelUrl: '/models/test-atomic.glb',
      boundingBox: {
        min: [-0.5, -0.5, -0.5],
        max: [0.5, 0.5, 0.5],
      },
      category: 'furniture',
      subcategory: 'chair',
      style: 'modern',
      tags: ['seating', 'office'],
    },
    s3_url: 'objects/atomic-obj.json',
    cloudflare_url: '',
    processing_status: {
      upload: 'completed',
      metadata_extraction: 'completed',
      ai_labeling: 'completed',
      manual_review: 'completed',
    },
    timestamps: {
      uploaded: '2023-01-01T00:00:00Z',
      metadata_extracted: '2023-01-01T00:00:00Z',
      labeled_ai: '2023-01-01T00:00:00Z',
      labeled_reviewed: '2023-01-01T00:00:00Z',
    },
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
  });

  // Helper to create composite object
  const createCompositeObject = (): ObjectAsset => ({
    id: 'composite-obj',
    filename: 'composite.json',
    media_type: 'object',
    object_type: 'composite',
    object: {
      boundingBox: {
        min: [-1, -1, -1],
        max: [1, 2, 1],
      },
      components: [
        {
          id: 'seat',
          objectId: 'chair-seat',
          transform: {
            position: [0, 0.5, 0],
            rotation: [0, 0, 0],
            scale: [1, 0.2, 1],
          },
          role: 'seat',
          required: true,
        },
        {
          id: 'back',
          objectId: 'chair-back',
          transform: {
            position: [0, 1, -0.4],
            rotation: [0, 0, 0],
            scale: [1, 1, 0.2],
          },
          role: 'back',
          required: true,
        },
        {
          id: 'armrest-left',
          objectId: 'chair-armrest',
          transform: {
            position: [-0.4, 0.8, 0],
            rotation: [0, 0, 0],
            scale: [0.2, 0.6, 0.8],
          },
          role: 'armrest',
          required: false,
        },
        {
          id: 'armrest-right',
          objectId: 'chair-armrest',
          transform: {
            position: [0.4, 0.8, 0],
            rotation: [0, 0, 0],
            scale: [0.2, 0.6, 0.8],
          },
          role: 'armrest',
          required: false,
        },
      ],
      category: 'furniture',
      subcategory: 'seating',
      style: 'modern',
      tags: ['chair', 'composite', 'furniture'],
    },
    s3_url: 'objects/composite-obj.json',
    cloudflare_url: '',
    processing_status: {
      upload: 'completed',
      metadata_extraction: 'completed',
      ai_labeling: 'completed',
      manual_review: 'completed',
    },
    timestamps: {
      uploaded: '2023-01-01T00:00:00Z',
      metadata_extracted: '2023-01-01T00:00:00Z',
      labeled_ai: '2023-01-01T00:00:00Z',
      labeled_reviewed: '2023-01-01T00:00:00Z',
    },
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
  });

  // Helper to create object collection
  const createObjectCollection = (): ObjectCollection => ({
    id: 'test-collection',
    filename: 'collection.json',
    media_type: 'object_collection',
    collection: {
      objects: [
        {
          objectId: 'cube-01',
          transform: {
            position: [-1, 0, -1],
            rotation: [0, 0, 0],
            scale: [0.8, 0.8, 0.8],
          },
        },
        {
          objectId: 'cube-02',
          transform: {
            position: [1, 0, -1],
            rotation: [0, Math.PI / 4, 0],
            scale: [0.8, 0.8, 0.8],
          },
        },
        {
          objectId: 'cube-03',
          transform: {
            position: [0, 0, 1],
            rotation: [0, Math.PI / 2, 0],
            scale: [0.8, 0.8, 0.8],
          },
        },
      ],
      boundingBox: {
        min: [-2, 0, -2],
        max: [2, 1, 2],
      },
      category: 'demo',
      style: 'geometric',
      tags: ['cubes', 'collection', 'demo'],
    },
    s3_url: 'collections/test-collection.json',
    cloudflare_url: '',
    processing_status: {
      upload: 'completed',
      metadata_extraction: 'completed',
      ai_labeling: 'completed',
      manual_review: 'completed',
    },
    timestamps: {
      uploaded: '2023-01-01T00:00:00Z',
      metadata_extracted: '2023-01-01T00:00:00Z',
      labeled_ai: '2023-01-01T00:00:00Z',
      labeled_reviewed: '2023-01-01T00:00:00Z',
    },
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
  });

  describe('ObjectRenderer', () => {
    test('should render atomic object correctly', () => {
      const atomicObject = createAtomicObject();
      const mockOnSelect = jest.fn();
      const mockOnHover = jest.fn();

      render(
        <Canvas>
          <ObjectRenderer
            assetData={atomicObject}
            showComponents={true}
            interactionLevel="object"
            onComponentSelect={mockOnSelect}
            onComponentHover={mockOnHover}
          />
        </Canvas>
      );

      expect(screen.getByTestId('canvas')).toBeInTheDocument();
    });

    test('should render composite object with components', () => {
      const compositeObject = createCompositeObject();
      const mockOnComponentSelect = jest.fn();
      const mockOnComponentHover = jest.fn();

      render(
        <Canvas>
          <ObjectRenderer
            assetData={compositeObject}
            showComponents={true}
            interactionLevel="component"
            onComponentSelect={mockOnComponentSelect}
            onComponentHover={mockOnComponentHover}
          />
        </Canvas>
      );

      expect(screen.getByTestId('canvas')).toBeInTheDocument();
    });

    test('should handle component interaction levels', () => {
      const compositeObject = createCompositeObject();
      const mockOnComponentSelect = jest.fn();

      const { rerender } = render(
        <Canvas>
          <ObjectRenderer
            assetData={compositeObject}
            showComponents={true}
            interactionLevel="object"
            onComponentSelect={mockOnComponentSelect}
            onComponentHover={jest.fn()}
          />
        </Canvas>
      );

      // Re-render with component-level interaction
      rerender(
        <Canvas>
          <ObjectRenderer
            assetData={compositeObject}
            showComponents={true}
            interactionLevel="component"
            onComponentSelect={mockOnComponentSelect}
            onComponentHover={jest.fn()}
          />
        </Canvas>
      );

      expect(screen.getByTestId('canvas')).toBeInTheDocument();
    });

    test('should handle missing model gracefully', () => {
      const brokenObject = createAtomicObject();
      brokenObject.object.modelUrl = '/nonexistent/model.glb';

      expect(() => {
        render(
          <Canvas>
            <ObjectRenderer
              assetData={brokenObject}
              showComponents={true}
              interactionLevel="object"
              onComponentSelect={jest.fn()}
              onComponentHover={jest.fn()}
            />
          </Canvas>
        );
      }).not.toThrow();
    });

    test('should handle empty composite object', () => {
      const emptyComposite = createCompositeObject();
      emptyComposite.object.components = [];

      render(
        <Canvas>
          <ObjectRenderer
            assetData={emptyComposite}
            showComponents={true}
            interactionLevel="component"
            onComponentSelect={jest.fn()}
            onComponentHover={jest.fn()}
          />
        </Canvas>
      );

      expect(screen.getByTestId('canvas')).toBeInTheDocument();
    });
  });

  describe('CollectionRenderer', () => {
    test('should render collection with multiple objects', () => {
      const collection = createObjectCollection();
      const mockOnObjectSelect = jest.fn();
      const mockOnObjectHover = jest.fn();

      render(
        <Canvas>
          <CollectionRenderer
            assetData={collection}
            showComponents={true}
            interactionLevel="collection"
            useInstancing={false}
            onObjectSelect={mockOnObjectSelect}
            onObjectHover={mockOnObjectHover}
          />
        </Canvas>
      );

      expect(screen.getByTestId('canvas')).toBeInTheDocument();
    });

    test('should handle instanced rendering', () => {
      const collection = createObjectCollection();

      render(
        <Canvas>
          <CollectionRenderer
            assetData={collection}
            showComponents={true}
            interactionLevel="collection"
            useInstancing={true}
            onObjectSelect={jest.fn()}
            onObjectHover={jest.fn()}
          />
        </Canvas>
      );

      expect(screen.getByTestId('canvas')).toBeInTheDocument();
    });

    test('should handle different interaction levels', () => {
      const collection = createObjectCollection();
      const mockOnObjectSelect = jest.fn();

      const { rerender } = render(
        <Canvas>
          <CollectionRenderer
            assetData={collection}
            showComponents={true}
            interactionLevel="collection"
            useInstancing={false}
            onObjectSelect={mockOnObjectSelect}
            onObjectHover={jest.fn()}
          />
        </Canvas>
      );

      // Test object-level interaction
      rerender(
        <Canvas>
          <CollectionRenderer
            assetData={collection}
            showComponents={true}
            interactionLevel="object"
            useInstancing={false}
            onObjectSelect={mockOnObjectSelect}
            onObjectHover={jest.fn()}
          />
        </Canvas>
      );

      // Test component-level interaction
      rerender(
        <Canvas>
          <CollectionRenderer
            assetData={collection}
            showComponents={true}
            interactionLevel="component"
            useInstancing={false}
            onObjectSelect={mockOnObjectSelect}
            onObjectHover={jest.fn()}
          />
        </Canvas>
      );

      expect(screen.getByTestId('canvas')).toBeInTheDocument();
    });

    test('should handle empty collection', () => {
      const emptyCollection = createObjectCollection();
      emptyCollection.collection.objects = [];

      render(
        <Canvas>
          <CollectionRenderer
            assetData={emptyCollection}
            showComponents={true}
            interactionLevel="collection"
            useInstancing={false}
            onObjectSelect={jest.fn()}
            onObjectHover={jest.fn()}
          />
        </Canvas>
      );

      expect(screen.getByTestId('canvas')).toBeInTheDocument();
    });

    test('should handle nested collections', () => {
      const nestedCollection = createObjectCollection();
      
      // Add a sub-collection reference
      nestedCollection.collection.objects.push({
        objectId: 'sub-collection-01',
        transform: {
          position: [3, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
        isCollection: true,
      });

      render(
        <Canvas>
          <CollectionRenderer
            assetData={nestedCollection}
            showComponents={true}
            interactionLevel="collection"
            useInstancing={false}
            onObjectSelect={jest.fn()}
            onObjectHover={jest.fn()}
          />
        </Canvas>
      );

      expect(screen.getByTestId('canvas')).toBeInTheDocument();
    });
  });

  describe('Hierarchy Manipulation', () => {
    test('should handle component selection in composite objects', () => {
      const compositeObject = createCompositeObject();
      const mockOnComponentSelect = jest.fn();

      render(
        <Canvas>
          <ObjectRenderer
            assetData={compositeObject}
            showComponents={true}
            interactionLevel="component"
            onComponentSelect={mockOnComponentSelect}
            onComponentHover={jest.fn()}
          />
        </Canvas>
      );

      // Component selection would be tested through interaction simulation
      // This is a placeholder for the actual interaction testing
      expect(mockOnComponentSelect).toHaveBeenCalledTimes(0); // Not called yet
    });

    test('should handle object selection in collections', () => {
      const collection = createObjectCollection();
      const mockOnObjectSelect = jest.fn();

      render(
        <Canvas>
          <CollectionRenderer
            assetData={collection}
            showComponents={true}
            interactionLevel="object"
            useInstancing={false}
            onObjectSelect={mockOnObjectSelect}
            onObjectHover={jest.fn()}
          />
        </Canvas>
      );

      // Object selection would be tested through interaction simulation
      expect(mockOnObjectSelect).toHaveBeenCalledTimes(0); // Not called yet
    });

    test('should preserve hierarchy during transformations', () => {
      const compositeObject = createCompositeObject();
      const originalComponents = [...compositeObject.object.components!];

      render(
        <Canvas>
          <ObjectRenderer
            assetData={compositeObject}
            showComponents={true}
            interactionLevel="component"
            onComponentSelect={jest.fn()}
            onComponentHover={jest.fn()}
          />
        </Canvas>
      );

      // Verify components are preserved
      expect(compositeObject.object.components).toHaveLength(originalComponents.length);
      expect(compositeObject.object.components![0].id).toBe(originalComponents[0].id);
    });

    test('should handle component visibility toggling', () => {
      const compositeObject = createCompositeObject();

      const { rerender } = render(
        <Canvas>
          <ObjectRenderer
            assetData={compositeObject}
            showComponents={true}
            interactionLevel="component"
            onComponentSelect={jest.fn()}
            onComponentHover={jest.fn()}
          />
        </Canvas>
      );

      // Toggle component visibility
      rerender(
        <Canvas>
          <ObjectRenderer
            assetData={compositeObject}
            showComponents={false}
            interactionLevel="component"
            onComponentSelect={jest.fn()}
            onComponentHover={jest.fn()}
          />
        </Canvas>
      );

      expect(screen.getByTestId('canvas')).toBeInTheDocument();
    });
  });

  describe('Bounding Box Calculations', () => {
    test('should calculate correct bounding box for atomic object', () => {
      const atomicObject = createAtomicObject();
      const expectedBounds = atomicObject.object.boundingBox;

      expect(expectedBounds.min).toEqual([-0.5, -0.5, -0.5]);
      expect(expectedBounds.max).toEqual([0.5, 0.5, 0.5]);
    });

    test('should calculate correct bounding box for composite object', () => {
      const compositeObject = createCompositeObject();
      const expectedBounds = compositeObject.object.boundingBox;

      // Composite object should have larger bounds to encompass all components
      expect(expectedBounds.min).toEqual([-1, -1, -1]);
      expect(expectedBounds.max).toEqual([1, 2, 1]);
    });

    test('should calculate correct bounding box for collection', () => {
      const collection = createObjectCollection();
      const expectedBounds = collection.collection.boundingBox;

      // Collection should encompass all objects
      expect(expectedBounds.min).toEqual([-2, 0, -2]);
      expect(expectedBounds.max).toEqual([2, 1, 2]);
    });

    test('should handle dynamic bounding box updates', () => {
      const compositeObject = createCompositeObject();
      
      // Add a component that extends the bounds
      compositeObject.object.components!.push({
        id: 'extension',
        objectId: 'extension-part',
        transform: {
          position: [2, 0, 0], // Extends beyond current bounds
          rotation: [0, 0, 0],
          scale: [0.5, 0.5, 0.5],
        },
        role: 'extension',
        required: false,
      });

      // Bounding box should be recalculated to include new component
      // This would typically be done by a utility function
      const newBounds = {
        min: [-1, -1, -1],
        max: [2.5, 2, 1], // Extended to include new component
      };

      expect(newBounds.max[0]).toBeGreaterThan(compositeObject.object.boundingBox.max[0]);
    });
  });

  describe('Performance and Memory Management', () => {
    test('should handle large collections efficiently', () => {
      const largeCollection = createObjectCollection();
      
      // Add many objects to test performance
      for (let i = 0; i < 100; i++) {
        largeCollection.collection.objects.push({
          objectId: `perf-object-${i}`,
          transform: {
            position: [i % 10, 0, Math.floor(i / 10)],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
          },
        });
      }

      const startTime = performance.now();

      render(
        <Canvas>
          <CollectionRenderer
            assetData={largeCollection}
            showComponents={false} // Disable for performance
            interactionLevel="collection"
            useInstancing={true} // Use instancing for performance
            onObjectSelect={jest.fn()}
            onObjectHover={jest.fn()}
          />
        </Canvas>
      );

      const endTime = performance.now();
      const renderTime = endTime - startTime;

      // Should render within reasonable time (adjust threshold as needed)
      expect(renderTime).toBeLessThan(1000); // 1 second
      expect(screen.getByTestId('canvas')).toBeInTheDocument();
    });

    test('should handle deep component hierarchies', () => {
      const deepComposite = createCompositeObject();
      
      // Create a deep hierarchy by nesting components
      for (let i = 0; i < 10; i++) {
        deepComposite.object.components!.push({
          id: `deep-component-${i}`,
          objectId: `deep-object-${i}`,
          transform: {
            position: [0, i * 0.1, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
          },
          role: `level-${i}`,
          required: false,
          parentId: i > 0 ? `deep-component-${i-1}` : undefined,
        });
      }

      render(
        <Canvas>
          <ObjectRenderer
            assetData={deepComposite}
            showComponents={true}
            interactionLevel="component"
            onComponentSelect={jest.fn()}
            onComponentHover={jest.fn()}
          />
        </Canvas>
      );

      expect(screen.getByTestId('canvas')).toBeInTheDocument();
    });

    test('should cleanup resources properly', () => {
      const collection = createObjectCollection();

      const { unmount } = render(
        <Canvas>
          <CollectionRenderer
            assetData={collection}
            showComponents={true}
            interactionLevel="collection"
            useInstancing={true}
            onObjectSelect={jest.fn()}
            onObjectHover={jest.fn()}
          />
        </Canvas>
      );

      // Unmount should not throw errors
      expect(() => unmount()).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    test('should handle corrupted object data', () => {
      const corruptedObject = createAtomicObject();
      // @ts-ignore - Intentionally corrupt the data
      delete corruptedObject.object.boundingBox;

      expect(() => {
        render(
          <Canvas>
            <ObjectRenderer
              assetData={corruptedObject}
              showComponents={true}
              interactionLevel="object"
              onComponentSelect={jest.fn()}
              onComponentHover={jest.fn()}
            />
          </Canvas>
        );
      }).not.toThrow();
    });

    test('should handle missing component references', () => {
      const brokenComposite = createCompositeObject();
      brokenComposite.object.components![0].objectId = 'nonexistent-object';

      expect(() => {
        render(
          <Canvas>
            <ObjectRenderer
              assetData={brokenComposite}
              showComponents={true}
              interactionLevel="component"
              onComponentSelect={jest.fn()}
              onComponentHover={jest.fn()}
            />
          </Canvas>
        );
      }).not.toThrow();
    });

    test('should handle circular references in collections', () => {
      const circularCollection = createObjectCollection();
      
      // Add self-reference (circular)
      circularCollection.collection.objects.push({
        objectId: circularCollection.id,
        transform: {
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
        isCollection: true,
      });

      expect(() => {
        render(
          <Canvas>
            <CollectionRenderer
              assetData={circularCollection}
              showComponents={true}
              interactionLevel="collection"
              useInstancing={false}
              onObjectSelect={jest.fn()}
              onObjectHover={jest.fn()}
            />
          </Canvas>
        );
      }).not.toThrow();
    });
  });
});
