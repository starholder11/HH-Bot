/**
 * Integration tests for cross-system workflows
 * 
 * Tests the complete workflows that span multiple systems from PHASE 3: SPATIAL WORK.md
 * including layout→space export, versioned re-export, direct insertion, and drag-and-drop
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { rest } from 'msw';
import { setupServer } from 'msw/node';
import { type LayoutAsset, type SpaceAsset, type ObjectAsset } from '../../lib/media-storage';
import { importLayoutToSpace } from '../../lib/spatial/layout-import';
import { exportLayoutToSpace, reExportLayoutToSpace } from '../../lib/spatial/export-workflows';
import { addObjectToLayout, addObjectToSpace } from '../../lib/spatial/direct-insertion';
import { useDragAndDrop } from '../../hooks/useDragAndDrop';

// Mock API server for integration testing
const server = setupServer(
  // Layout API endpoints
  rest.get('/api/layouts/:id', (req, res, ctx) => {
    const { id } = req.params;
    return res(ctx.json(createMockLayout(id as string)));
  }),
  
  rest.put('/api/layouts/:id', (req, res, ctx) => {
    return res(ctx.json({ success: true }));
  }),

  rest.post('/api/layouts/:id/add-object', (req, res, ctx) => {
    return res(ctx.json({ 
      success: true, 
      layoutItem: { id: 'new-layout-item', x: 100, y: 100, w: 50, h: 50 }
    }));
  }),

  // Space API endpoints
  rest.get('/api/spaces/:id', (req, res, ctx) => {
    const { id } = req.params;
    return res(ctx.json(createMockSpace(id as string)));
  }),

  rest.put('/api/spaces/:id', (req, res, ctx) => {
    return res(ctx.json({ success: true }));
  }),

  rest.post('/api/spaces/:id/add-object', (req, res, ctx) => {
    return res(ctx.json({ 
      success: true, 
      spaceItem: { id: 'new-space-item', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
    }));
  }),

  // Export workflow endpoints
  rest.post('/api/spaces/export-layout', (req, res, ctx) => {
    return res(ctx.json({ 
      success: true,
      result: { spaceId: 'exported-space', version: 1, summary: { added: 3, modified: 0, removed: 0 } },
      spaceAsset: createMockSpace('exported-space')
    }));
  }),

  // Object API endpoints
  rest.get('/api/objects', (req, res, ctx) => {
    return res(ctx.json({ 
      assets: [createMockObject('test-object-1'), createMockObject('test-object-2')]
    }));
  }),

  rest.get('/api/objects/:id', (req, res, ctx) => {
    const { id } = req.params;
    return res(ctx.json(createMockObject(id as string)));
  }),
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Mock data helpers
function createMockLayout(id: string): LayoutAsset {
  return {
    id,
    filename: `${id}.json`,
    media_type: 'layout',
    layout_type: 'blueprint_composer',
    metadata: {
      file_size: 1024,
      width: 1440,
      height: 1024,
      cellSize: 10,
      item_count: 3,
      has_inline_content: false,
      has_transforms: false,
    },
    layout_data: {
      designSize: { width: 1440, height: 1024 },
      cellSize: 10,
      styling: {},
      items: [
        {
          id: 'layout-item-1',
          type: 'content_ref',
          x: 100, y: 100, w: 200, h: 150,
          nx: 0, ny: 0, nw: 0, nh: 0,
          contentType: 'image',
          refId: 'image-asset-1',
        },
        {
          id: 'layout-item-2',
          type: 'content_ref',
          x: 400, y: 200, w: 300, h: 200,
          nx: 0, ny: 0, nw: 0, nh: 0,
          contentType: 'video',
          refId: 'video-asset-1',
        },
        {
          id: 'layout-item-3',
          type: 'content_ref',
          x: 700, y: 300, w: 150, h: 100,
          nx: 0, ny: 0, nw: 0, nh: 0,
          contentType: 'object',
          refId: 'object-asset-1',
        },
      ],
    },
    s3_url: `layouts/${id}.json`,
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
    processing_status: {
      upload: 'completed',
      metadata_extraction: 'completed',
      ai_labeling: 'completed',
      manual_review: 'completed',
      html_generation: 'completed',
    },
    timestamps: {
      uploaded: '2023-01-01T00:00:00Z',
      metadata_extracted: '2023-01-01T00:00:00Z',
      labeled_ai: '2023-01-01T00:00:00Z',
      labeled_reviewed: '2023-01-01T00:00:00Z',
      html_generated: '2023-01-01T00:00:00Z',
    },
  };
}

function createMockSpace(id: string): SpaceAsset {
  return {
    id,
    filename: `${id}.json`,
    media_type: 'space',
    space_type: 'imported',
    metadata: { item_count: 2 },
    space: {
      environment: {
        backgroundColor: '#111217',
        lighting: 'studio',
        fog: { enabled: false, color: '#ffffff', density: 0.01 },
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
          id: 'space-item-1',
          assetId: 'image-asset-1',
          assetType: 'image',
          position: [0, 0.1, 0],
          rotation: [0, 0, 0],
          scale: [1, 0.01, 1],
          visible: true,
          clickable: true,
          hoverEffect: 'none',
          importMetadata: {
            originalLayoutId: id.replace('space', 'layout'),
            originalItemId: 'layout-item-1',
            originalPosition: { x: 100, y: 100 },
            originalDimensions: { w: 200, h: 150 },
            importTimestamp: '2023-01-01T00:00:00Z',
          },
        },
        {
          id: 'space-item-2',
          assetId: 'video-asset-1',
          assetType: 'video',
          position: [2, 0.1, -1],
          rotation: [0, 0, 0],
          scale: [1.5, 0.01, 1],
          visible: true,
          clickable: true,
          hoverEffect: 'glow',
          importMetadata: {
            originalLayoutId: id.replace('space', 'layout'),
            originalItemId: 'layout-item-2',
            originalPosition: { x: 400, y: 200 },
            originalDimensions: { w: 300, h: 200 },
            importTimestamp: '2023-01-01T00:00:00Z',
          },
        },
      ],
    },
    s3_url: `spaces/${id}.json`,
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
  };
}

function createMockObject(id: string): ObjectAsset {
  return {
    id,
    filename: `${id}.glb`,
    media_type: 'object',
    object_type: 'atomic',
    object: {
      modelUrl: `/models/test/${id}.glb`,
      boundingBox: {
        min: [-0.5, -0.5, -0.5],
        max: [0.5, 0.5, 0.5],
      },
      category: 'furniture',
      subcategory: 'chair',
      style: 'modern',
      tags: ['test', 'mock'],
    },
    s3_url: `objects/${id}.json`,
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
  };
}

describe('Cross-System Workflows', () => {
  describe('Layout to Space Export Workflow', () => {
    test('should export layout with mixed content types to space', async () => {
      const layout = createMockLayout('test-layout');
      
      const result = await exportLayoutToSpace(layout.id, undefined, {
        groupingStrategy: 'flat',
        preserveRelativePositions: true,
        floorSize: 20,
      });

      expect(result.success).toBe(true);
      expect(result.spaceAsset).toBeDefined();
      expect(result.spaceAsset!.space.items).toHaveLength(3);

      // Check that different content types are handled
      const spaceItems = result.spaceAsset!.space.items;
      const imageItem = spaceItems.find(item => item.assetType === 'image');
      const videoItem = spaceItems.find(item => item.assetType === 'video');
      const objectItem = spaceItems.find(item => item.assetType === 'object');

      expect(imageItem).toBeDefined();
      expect(videoItem).toBeDefined();
      expect(objectItem).toBeDefined();

      // Check import metadata preservation
      expect(imageItem!.importMetadata).toBeDefined();
      expect(imageItem!.importMetadata!.originalLayoutId).toBe('test-layout');
      expect(imageItem!.importMetadata!.originalItemId).toBe('layout-item-1');
    });

    test('should handle export with different grouping strategies', async () => {
      const layout = createMockLayout('grouped-layout');
      
      // Test clustered grouping
      const clusteredResult = await exportLayoutToSpace(layout.id, undefined, {
        groupingStrategy: 'clustered',
        clusterBy: 'contentType',
        clusterSpacing: 3.0,
      });

      expect(clusteredResult.success).toBe(true);
      expect(clusteredResult.spaceAsset!.space.items).toHaveLength(3);

      // Test elevated grouping
      const elevatedResult = await exportLayoutToSpace(layout.id, undefined, {
        groupingStrategy: 'elevated',
        elevationLevels: 2,
        levelHeight: 2.0,
      });

      expect(elevatedResult.success).toBe(true);
      
      // Items should be at different Y levels
      const yLevels = [...new Set(elevatedResult.spaceAsset!.space.items.map(item => item.position[1]))];
      expect(yLevels.length).toBeGreaterThan(1);
    });

    test('should create source mappings for tracking', async () => {
      const layout = createMockLayout('mapped-layout');
      
      const result = await exportLayoutToSpace(layout.id, undefined, {
        createSourceMappings: true,
      });

      expect(result.success).toBe(true);
      expect(result.sourceMappings).toBeDefined();
      expect(result.sourceMappings).toHaveLength(3);

      result.sourceMappings!.forEach(mapping => {
        expect(mapping.sourceType).toBe('layout');
        expect(mapping.sourceId).toBe('mapped-layout');
        expect(mapping.spaceItemId).toBeDefined();
        expect(mapping.sourceItemId).toBeDefined();
      });
    });

    test('should handle export errors gracefully', async () => {
      // Mock API error
      server.use(
        rest.post('/api/spaces/export-layout', (req, res, ctx) => {
          return res(ctx.status(500), ctx.json({ error: 'Export failed' }));
        })
      );

      const result = await exportLayoutToSpace('failing-layout', undefined, {});

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Export failed');
    });
  });

  describe('Versioned Re-Export Workflow', () => {
    test('should preserve manual edits during re-export', async () => {
      const layout = createMockLayout('versioned-layout');
      const existingSpace = createMockSpace('existing-space');
      
      // Simulate manual edits to the space
      existingSpace.space.items[0].position = [5, 0.1, 5]; // User moved this
      existingSpace.space.items[0].scale = [2, 0.01, 2]; // User scaled this
      existingSpace.space.environment.backgroundColor = '#ff0000'; // User changed this

      const result = await reExportLayoutToSpace(layout.id, existingSpace.id, {
        preserveManualEdits: true,
        conflictResolution: 'prefer-manual',
      });

      expect(result.success).toBe(true);
      expect(result.conflicts).toBeDefined();
      
      // Manual edits should be preserved
      const updatedSpace = result.spaceAsset!;
      const editedItem = updatedSpace.space.items.find(item => 
        item.importMetadata?.originalItemId === 'layout-item-1'
      );
      
      expect(editedItem!.position).toEqual([5, 0.1, 5]); // Manual edit preserved
      expect(editedItem!.scale).toEqual([2, 0.01, 2]); // Manual edit preserved
      expect(updatedSpace.space.environment.backgroundColor).toBe('#ff0000'); // Manual edit preserved
    });

    test('should detect and report conflicts', async () => {
      const layout = createMockLayout('conflict-layout');
      const existingSpace = createMockSpace('conflict-space');
      
      // Modify layout item (simulating layout changes)
      layout.layout_data.items[0].w = 400; // Changed width
      layout.layout_data.items[0].h = 300; // Changed height
      
      // Simulate manual edits to corresponding space item
      existingSpace.space.items[0].scale = [3, 0.01, 3]; // User scaled differently

      const result = await reExportLayoutToSpace(layout.id, existingSpace.id, {
        preserveManualEdits: true,
        conflictResolution: 'detect-only',
      });

      expect(result.success).toBe(true);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts![0].type).toBe('dimension-mismatch');
      expect(result.conflicts![0].spaceItemId).toBe('space-item-1');
      expect(result.conflicts![0].layoutItemId).toBe('layout-item-1');
    });

    test('should handle version tracking', async () => {
      const layout = createMockLayout('version-layout');
      const existingSpace = createMockSpace('version-space');
      
      const result = await reExportLayoutToSpace(layout.id, existingSpace.id, {
        createBackup: true,
        versionDescription: 'Re-export with layout changes',
      });

      expect(result.success).toBe(true);
      expect(result.backupVersionId).toBeDefined();
      expect(result.newVersion).toBeDefined();
      expect(result.newVersion!.description).toBe('Re-export with layout changes');
    });

    test('should handle added and removed layout items', async () => {
      const layout = createMockLayout('modified-layout');
      const existingSpace = createMockSpace('modified-space');
      
      // Add new item to layout
      layout.layout_data.items.push({
        id: 'new-layout-item',
        type: 'content_ref',
        x: 800, y: 400, w: 100, h: 100,
        nx: 0, ny: 0, nw: 0, nh: 0,
        contentType: 'text',
        refId: 'text-asset-1',
      });
      
      // Remove one item from space (simulating deleted layout item)
      existingSpace.space.items = existingSpace.space.items.slice(0, 1);

      const result = await reExportLayoutToSpace(layout.id, existingSpace.id, {
        handleAddedItems: true,
        handleRemovedItems: true,
      });

      expect(result.success).toBe(true);
      expect(result.summary!.added).toBe(2); // New item + restored removed item
      expect(result.summary!.removed).toBe(0); // Nothing removed (restoration mode)
    });
  });

  describe('Direct Object Insertion Workflow', () => {
    test('should insert object into layout as 2D icon', async () => {
      const layout = createMockLayout('insertion-layout');
      const object = createMockObject('insertion-object');
      
      const result = await addObjectToLayout(layout.id, object.id, {
        position: { x: 500, y: 300 },
        iconStyle: 'outline',
        showLabel: true,
        autoSize: true,
      });

      expect(result.success).toBe(true);
      expect(result.layoutItem).toBeDefined();
      expect(result.layoutItem!.contentType).toBe('object');
      expect(result.layoutItem!.refId).toBe(object.id);
      expect(result.layoutItem!.x).toBe(500);
      expect(result.layoutItem!.y).toBe(300);
      expect(result.iconGenerated).toBe(true);
    });

    test('should insert object into space as 3D model', async () => {
      const space = createMockSpace('insertion-space');
      const object = createMockObject('insertion-object-3d');
      
      const result = await addObjectToSpace(space.id, object.id, {
        position: { x: 2, y: 0, z: -1 },
        snapToFloor: true,
        autoOrient: true,
      });

      expect(result.success).toBe(true);
      expect(result.spaceItem).toBeDefined();
      expect(result.spaceItem!.assetType).toBe('object');
      expect(result.spaceItem!.assetId).toBe(object.id);
      expect(result.spaceItem!.position).toEqual([2, 0, -1]);
    });

    test('should handle collision detection during insertion', async () => {
      const layout = createMockLayout('collision-layout');
      const object = createMockObject('collision-object');
      
      // Try to insert at position that would overlap with existing item
      const result = await addObjectToLayout(layout.id, object.id, {
        position: { x: 100, y: 100 }, // Same as existing item
        avoidCollisions: true,
        collisionPadding: 10,
      });

      expect(result.success).toBe(true);
      expect(result.layoutItem!.x).not.toBe(100); // Should be moved to avoid collision
      expect(result.collisionDetected).toBe(true);
      expect(result.adjustedPosition).toBeDefined();
    });

    test('should validate insertion constraints', async () => {
      const layout = createMockLayout('constraint-layout');
      const object = createMockObject('constraint-object');
      
      // Try to insert outside layout bounds
      const result = await addObjectToLayout(layout.id, object.id, {
        position: { x: 2000, y: 2000 }, // Outside 1440x1024 layout
        respectBounds: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('outside bounds');
    });

    test('should handle batch insertion', async () => {
      const space = createMockSpace('batch-space');
      const objects = [
        createMockObject('batch-object-1'),
        createMockObject('batch-object-2'),
        createMockObject('batch-object-3'),
      ];
      
      const results = await Promise.all(
        objects.map((obj, index) => 
          addObjectToSpace(space.id, obj.id, {
            position: { x: index * 2, y: 0, z: 0 },
            snapToFloor: true,
          })
        )
      );

      expect(results.every(r => r.success)).toBe(true);
      expect(results).toHaveLength(3);
      
      // Check spacing
      results.forEach((result, index) => {
        expect(result.spaceItem!.position[0]).toBe(index * 2);
      });
    });
  });

  describe('Drag-and-Drop Workflow', () => {
    // Mock component for testing drag-and-drop
    function TestDragDropComponent() {
      const { dragState, startDrag, handleDragOver, handleDrop, endDrag } = useDragAndDrop({
        onDragStart: (data) => console.log('Drag started:', data),
        onDragEnd: (result) => console.log('Drag ended:', result),
      });

      const mockObject = createMockObject('drag-object');
      const mockLayout = createMockLayout('drop-layout');
      const mockSpace = createMockSpace('drop-space');

      return (
        <div>
          {/* Draggable object */}
          <div
            data-testid="draggable-object"
            draggable
            onDragStart={() => startDrag({
              objectId: mockObject.id,
              objectType: 'object',
              objectData: mockObject,
            })}
            onDragEnd={endDrag}
          >
            Drag me
          </div>

          {/* Layout drop target */}
          <div
            data-testid="layout-drop-target"
            onDragOver={(e) => handleDragOver(e, {
              id: mockLayout.id,
              type: 'layout',
              data: mockLayout,
            })}
            onDrop={(e) => handleDrop(e, mockLayout.id, 'layout', mockLayout)}
          >
            Drop on Layout
          </div>

          {/* Space drop target */}
          <div
            data-testid="space-drop-target"
            onDragOver={(e) => handleDragOver(e, {
              id: mockSpace.id,
              type: 'space',
              data: mockSpace,
            })}
            onDrop={(e) => handleDrop(e, mockSpace.id, 'space', mockSpace)}
          >
            Drop on Space
          </div>

          {/* Drag state display */}
          <div data-testid="drag-state">
            {dragState.isDragging ? 'Dragging' : 'Not dragging'}
          </div>
        </div>
      );
    }

    test('should handle drag from object browser to layout', async () => {
      const user = userEvent.setup();
      render(<TestDragDropComponent />);

      const draggable = screen.getByTestId('draggable-object');
      const dropTarget = screen.getByTestId('layout-drop-target');

      // Start drag
      await user.click(draggable);
      fireEvent.dragStart(draggable);

      // Check drag state
      expect(screen.getByTestId('drag-state')).toHaveTextContent('Dragging');

      // Drag over target
      fireEvent.dragOver(dropTarget);

      // Drop
      fireEvent.drop(dropTarget);

      // Wait for API call to complete
      await waitFor(() => {
        expect(screen.getByTestId('drag-state')).toHaveTextContent('Not dragging');
      });
    });

    test('should handle drag from object browser to space', async () => {
      const user = userEvent.setup();
      render(<TestDragDropComponent />);

      const draggable = screen.getByTestId('draggable-object');
      const dropTarget = screen.getByTestId('space-drop-target');

      // Start drag
      fireEvent.dragStart(draggable);

      // Drag over space target
      fireEvent.dragOver(dropTarget);

      // Drop
      fireEvent.drop(dropTarget);

      // Wait for API call
      await waitFor(() => {
        expect(screen.getByTestId('drag-state')).toHaveTextContent('Not dragging');
      });
    });

    test('should show visual feedback during drag', async () => {
      render(<TestDragDropComponent />);

      const draggable = screen.getByTestId('draggable-object');
      const dropTarget = screen.getByTestId('layout-drop-target');

      // Start drag
      fireEvent.dragStart(draggable);
      expect(screen.getByTestId('drag-state')).toHaveTextContent('Dragging');

      // Drag over valid target
      fireEvent.dragOver(dropTarget);
      
      // Should show valid drop state (implementation dependent)
      // This would be tested through CSS classes or data attributes
    });

    test('should handle invalid drop targets', async () => {
      render(<TestDragDropComponent />);

      const draggable = screen.getByTestId('draggable-object');

      // Start drag
      fireEvent.dragStart(draggable);

      // Try to drop on invalid target (document body)
      fireEvent.drop(document.body);

      // Should end drag without action
      expect(screen.getByTestId('drag-state')).toHaveTextContent('Not dragging');
    });

    test('should handle drag cancellation', async () => {
      render(<TestDragDropComponent />);

      const draggable = screen.getByTestId('draggable-object');

      // Start drag
      fireEvent.dragStart(draggable);
      expect(screen.getByTestId('drag-state')).toHaveTextContent('Dragging');

      // Cancel drag (ESC key or drag end without drop)
      fireEvent.dragEnd(draggable);

      expect(screen.getByTestId('drag-state')).toHaveTextContent('Not dragging');
    });
  });

  describe('Multi-Step Workflow Integration', () => {
    test('should complete full layout-to-space-to-edit workflow', async () => {
      // Step 1: Export layout to space
      const layout = createMockLayout('workflow-layout');
      const exportResult = await exportLayoutToSpace(layout.id, undefined, {
        groupingStrategy: 'flat',
      });

      expect(exportResult.success).toBe(true);
      const space = exportResult.spaceAsset!;

      // Step 2: Add object directly to space
      const object = createMockObject('workflow-object');
      const insertResult = await addObjectToSpace(space.id, object.id, {
        position: { x: 0, y: 0, z: 3 },
      });

      expect(insertResult.success).toBe(true);

      // Step 3: Re-export layout with changes
      layout.layout_data.items[0].w = 250; // Modify layout
      const reExportResult = await reExportLayoutToSpace(layout.id, space.id, {
        preserveManualEdits: true,
      });

      expect(reExportResult.success).toBe(true);
      expect(reExportResult.conflicts).toBeDefined();

      // Manual addition should be preserved
      const finalSpace = reExportResult.spaceAsset!;
      const manualObject = finalSpace.space.items.find(item => 
        item.assetId === object.id
      );
      expect(manualObject).toBeDefined();
    });

    test('should handle concurrent workflow operations', async () => {
      const layout = createMockLayout('concurrent-layout');
      
      // Simulate concurrent operations
      const operations = [
        exportLayoutToSpace(layout.id, undefined, { groupingStrategy: 'flat' }),
        exportLayoutToSpace(layout.id, undefined, { groupingStrategy: 'clustered' }),
        exportLayoutToSpace(layout.id, undefined, { groupingStrategy: 'elevated' }),
      ];

      const results = await Promise.allSettled(operations);
      const successful = results.filter(r => r.status === 'fulfilled');

      // At least one should succeed
      expect(successful.length).toBeGreaterThan(0);
    });

    test('should maintain data consistency across operations', async () => {
      const layout = createMockLayout('consistency-layout');
      
      // Export to space
      const exportResult = await exportLayoutToSpace(layout.id, undefined, {});
      const space = exportResult.spaceAsset!;

      // Verify source mappings
      space.space.items.forEach(item => {
        expect(item.importMetadata).toBeDefined();
        expect(item.importMetadata!.originalLayoutId).toBe(layout.id);
        
        // Find corresponding layout item
        const layoutItem = layout.layout_data.items.find(li => 
          li.id === item.importMetadata!.originalItemId
        );
        expect(layoutItem).toBeDefined();
        expect(layoutItem!.refId).toBe(item.assetId);
      });
    });

    test('should handle workflow rollback on errors', async () => {
      const layout = createMockLayout('rollback-layout');
      
      // Mock partial failure during export
      server.use(
        rest.post('/api/spaces/export-layout', (req, res, ctx) => {
          return res(ctx.status(500), ctx.json({ 
            error: 'Partial failure',
            partialResult: { spaceId: 'partial-space', itemsProcessed: 1 }
          }));
        })
      );

      const result = await exportLayoutToSpace(layout.id, undefined, {
        rollbackOnError: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.rollbackPerformed).toBe(true);
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle large layout export efficiently', async () => {
      const largeLayout = createMockLayout('large-layout');
      
      // Add many items
      for (let i = 0; i < 100; i++) {
        largeLayout.layout_data.items.push({
          id: `large-item-${i}`,
          type: 'content_ref',
          x: (i % 10) * 100,
          y: Math.floor(i / 10) * 100,
          w: 80, h: 80,
          nx: 0, ny: 0, nw: 0, nh: 0,
          contentType: 'image',
          refId: `image-${i}`,
        });
      }

      const startTime = Date.now();
      const result = await exportLayoutToSpace(largeLayout.id, undefined, {
        groupingStrategy: 'grid',
        batchSize: 20,
      });
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(result.spaceAsset!.space.items).toHaveLength(103); // Original 3 + 100 new
      expect(endTime - startTime).toBeLessThan(10000); // Should complete within 10 seconds
    });

    test('should handle batch object insertion', async () => {
      const space = createMockSpace('batch-space');
      const objects = Array.from({ length: 50 }, (_, i) => 
        createMockObject(`batch-object-${i}`)
      );

      const startTime = Date.now();
      const results = await Promise.all(
        objects.map((obj, index) => 
          addObjectToSpace(space.id, obj.id, {
            position: { 
              x: (index % 10) * 2, 
              y: 0, 
              z: Math.floor(index / 10) * 2 
            },
          })
        )
      );
      const endTime = Date.now();

      expect(results.every(r => r.success)).toBe(true);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });

    test('should handle memory efficiently during large operations', async () => {
      const layout = createMockLayout('memory-layout');
      
      // Add items with large metadata
      for (let i = 0; i < 1000; i++) {
        largeLayout.layout_data.items.push({
          id: `memory-item-${i}`,
          type: 'content_ref',
          x: i, y: i, w: 100, h: 100,
          nx: 0, ny: 0, nw: 0, nh: 0,
          contentType: 'image',
          refId: `image-${i}`,
          metadata: {
            largeData: 'x'.repeat(1000), // 1KB per item
          },
        });
      }

      // Monitor memory usage (simplified)
      const initialMemory = process.memoryUsage().heapUsed;
      
      const result = await exportLayoutToSpace(layout.id, undefined, {
        streamProcessing: true,
        memoryLimit: 100 * 1024 * 1024, // 100MB limit
      });

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      expect(result.success).toBe(true);
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // Should not exceed 50MB increase
    });
  });
});
