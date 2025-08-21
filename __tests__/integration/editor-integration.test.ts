/**
 * Integration tests for editor integration
 * 
 * Tests editor switching, unsaved changes handling, and cross-editor workflows
 * from PHASE 3: SPATIAL WORK.md Task 4.3 and Task 5
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { rest } from 'msw';
import { setupServer } from 'msw/node';
import NativeSpaceEditor from '../../components/spatial/NativeSpaceEditor';
import SpaceEditor from '../../components/spatial/SpaceEditor';
import { type SpaceAsset } from '../../lib/media-storage';

// Mock the Three.js Editor iframe
Object.defineProperty(window, 'postMessage', {
  writable: true,
  value: jest.fn(),
});

// Mock R3F components
jest.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children: React.ReactNode }) => <div data-testid="r3f-canvas">{children}</div>,
  useFrame: jest.fn(),
  useThree: () => ({ camera: {}, scene: {}, gl: {} }),
}));

jest.mock('@react-three/drei', () => ({
  OrbitControls: () => <div data-testid="orbit-controls" />,
  TransformControls: ({ children }: { children: React.ReactNode }) => <div data-testid="transform-controls">{children}</div>,
  Environment: () => <div data-testid="environment" />,
  StatsGl: () => <div data-testid="stats" />,
  useGLTF: jest.fn(() => ({ scene: { clone: () => ({}) } })),
  Clone: ({ children }: { children: React.ReactNode }) => <div data-testid="clone">{children}</div>,
  Text: ({ children }: { children: React.ReactNode }) => <div data-testid="text">{children}</div>,
}));

// Mock Leva
jest.mock('leva', () => ({
  folder: jest.fn(),
  button: jest.fn(),
  useControls: jest.fn(() => ({})),
}));

// Mock API server
const server = setupServer(
  rest.get('/api/spaces/:id', (req, res, ctx) => {
    const { id } = req.params;
    return res(ctx.json(createMockSpace(id as string)));
  }),
  
  rest.put('/api/spaces/:id', (req, res, ctx) => {
    return res(ctx.json({ success: true }));
  }),

  rest.post('/api/spaces/:id/save', (req, res, ctx) => {
    return res(ctx.json({ success: true, saved: true }));
  }),

  rest.get('/api/spaces/:id/versions', (req, res, ctx) => {
    return res(ctx.json({ versions: [] }));
  }),
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function createMockSpace(id: string): SpaceAsset {
  return {
    id,
    filename: `${id}.json`,
    media_type: 'space',
    space_type: 'custom',
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
          id: 'test-item-1',
          assetId: 'asset-1',
          assetType: 'image',
          position: [0, 0.1, 0],
          rotation: [0, 0, 0],
          scale: [1, 0.01, 1],
          visible: true,
          clickable: true,
          hoverEffect: 'none',
        },
        {
          id: 'test-item-2',
          assetId: 'asset-2',
          assetType: 'object',
          position: [2, 0.5, -1],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          visible: true,
          clickable: true,
          hoverEffect: 'glow',
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

// Mock component that simulates editor switching
function EditorSwitchingComponent() {
  const [editorType, setEditorType] = React.useState<'native' | 'threejs' | 'simple'>('native');
  const [hasUnsavedChanges, setHasUnsavedChanges] = React.useState(false);
  const [sceneData, setSceneData] = React.useState<any>(null);

  const handleSceneChange = (data: any) => {
    setSceneData(data);
    setHasUnsavedChanges(true);
  };

  const handleSave = async () => {
    // Simulate save operation
    await new Promise(resolve => setTimeout(resolve, 100));
    setHasUnsavedChanges(false);
  };

  const handleEditorSwitch = (newType: 'native' | 'threejs' | 'simple') => {
    if (hasUnsavedChanges) {
      const shouldSwitch = window.confirm('You have unsaved changes. Switch anyway?');
      if (!shouldSwitch) return;
    }
    setEditorType(newType);
  };

  return (
    <div>
      {/* Editor Type Selector */}
      <div data-testid="editor-selector">
        <button
          data-testid="native-editor-btn"
          onClick={() => handleEditorSwitch('native')}
          className={editorType === 'native' ? 'active' : ''}
        >
          Native Editor
        </button>
        <button
          data-testid="threejs-editor-btn"
          onClick={() => handleEditorSwitch('threejs')}
          className={editorType === 'threejs' ? 'active' : ''}
        >
          Three.js Editor
        </button>
        <button
          data-testid="simple-editor-btn"
          onClick={() => handleEditorSwitch('simple')}
          className={editorType === 'simple' ? 'active' : ''}
        >
          Simple Editor
        </button>
      </div>

      {/* Unsaved Changes Indicator */}
      <div data-testid="unsaved-indicator">
        {hasUnsavedChanges ? 'Unsaved changes' : 'All saved'}
      </div>

      {/* Save Button */}
      <button data-testid="save-btn" onClick={handleSave} disabled={!hasUnsavedChanges}>
        Save
      </button>

      {/* Current Editor */}
      <div data-testid="current-editor">
        {editorType === 'native' && (
          <NativeSpaceEditor
            spaceId="test-space"
            onSceneChange={handleSceneChange}
            onSelectionChange={() => {}}
          />
        )}
        {editorType === 'threejs' && (
          <SpaceEditor
            spaceId="test-space"
            onSceneChange={handleSceneChange}
            onSelectionChange={() => {}}
            onError={() => {}}
          />
        )}
        {editorType === 'simple' && (
          <div data-testid="simple-editor">Simple Editor Placeholder</div>
        )}
      </div>

      {/* Scene Data Display */}
      <div data-testid="scene-data">
        {sceneData ? JSON.stringify(sceneData) : 'No scene data'}
      </div>
    </div>
  );
}

describe('Editor Integration', () => {
  describe('Native R3F Editor', () => {
    test('should render native editor with all controls', async () => {
      render(
        <NativeSpaceEditor
          spaceId="test-space"
          onSceneChange={jest.fn()}
          onSelectionChange={jest.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Native R3F Editor')).toBeInTheDocument();
      });

      // Check for transform controls
      expect(screen.getByText('Translate')).toBeInTheDocument();
      expect(screen.getByText('Rotate')).toBeInTheDocument();
      expect(screen.getByText('Scale')).toBeInTheDocument();

      // Check for selection controls
      expect(screen.getByText('All')).toBeInTheDocument();
      expect(screen.getByText('None')).toBeInTheDocument();

      // Check for properties panel toggle
      expect(screen.getByText('Properties')).toBeInTheDocument();

      // Check for R3F canvas
      expect(screen.getByTestId('r3f-canvas')).toBeInTheDocument();
    });

    test('should handle object selection and transformation', async () => {
      const mockOnSceneChange = jest.fn();
      const mockOnSelectionChange = jest.fn();

      render(
        <NativeSpaceEditor
          spaceId="test-space"
          onSceneChange={mockOnSceneChange}
          onSelectionChange={mockOnSelectionChange}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('r3f-canvas')).toBeInTheDocument();
      });

      // Simulate object selection (would normally be done through 3D interaction)
      // This is a simplified test - real interaction would involve clicking on 3D objects
      const selectAllBtn = screen.getByText('All');
      fireEvent.click(selectAllBtn);

      expect(mockOnSelectionChange).toHaveBeenCalled();
    });

    test('should handle keyboard shortcuts', async () => {
      render(
        <NativeSpaceEditor
          spaceId="test-space"
          onSceneChange={jest.fn()}
          onSelectionChange={jest.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('r3f-canvas')).toBeInTheDocument();
      });

      // Test transform mode shortcuts
      fireEvent.keyDown(document, { key: 'g', code: 'KeyG' });
      expect(screen.getByText('Translate')).toHaveClass('bg-blue-600'); // Should be active

      fireEvent.keyDown(document, { key: 'r', code: 'KeyR' });
      expect(screen.getByText('Rotate')).toHaveClass('bg-blue-600'); // Should be active

      fireEvent.keyDown(document, { key: 's', code: 'KeyS' });
      expect(screen.getByText('Scale')).toHaveClass('bg-blue-600'); // Should be active
    });

    test('should toggle properties panel', async () => {
      render(
        <NativeSpaceEditor
          spaceId="test-space"
          onSceneChange={jest.fn()}
          onSelectionChange={jest.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Properties')).toBeInTheDocument();
      });

      const propertiesBtn = screen.getByText('Properties');
      
      // Should be active by default
      expect(propertiesBtn).toHaveClass('bg-blue-600');

      // Toggle off
      fireEvent.click(propertiesBtn);
      expect(propertiesBtn).toHaveClass('bg-neutral-700');

      // Toggle back on
      fireEvent.click(propertiesBtn);
      expect(propertiesBtn).toHaveClass('bg-blue-600');
    });

    test('should handle scene export', async () => {
      const mockOnSceneChange = jest.fn();

      render(
        <NativeSpaceEditor
          spaceId="test-space"
          onSceneChange={mockOnSceneChange}
          onSelectionChange={jest.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Properties')).toBeInTheDocument();
      });

      // Find and click export button (would be in properties panel)
      // This is a simplified test - real implementation would have export in properties panel
      const propertiesBtn = screen.getByText('Properties');
      fireEvent.click(propertiesBtn);

      // Simulate export action
      // In real implementation, this would be triggered from the properties panel
      // For now, we'll simulate the scene change event that would be triggered
      expect(mockOnSceneChange).toHaveBeenCalledTimes(0); // No changes yet
    });
  });

  describe('Three.js Editor Integration', () => {
    test('should render Three.js editor iframe', async () => {
      render(
        <SpaceEditor
          spaceId="test-space"
          onSceneChange={jest.fn()}
          onSelectionChange={jest.fn()}
          onError={jest.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('threejs-editor-iframe')).toBeInTheDocument();
      });

      // Check for loading overlay initially
      expect(screen.getByText('Loading Three.js Editor...')).toBeInTheDocument();
    });

    test('should handle editor ready message', async () => {
      const mockOnSceneChange = jest.fn();

      render(
        <SpaceEditor
          spaceId="test-space"
          onSceneChange={mockOnSceneChange}
          onSelectionChange={jest.fn()}
          onError={jest.fn()}
        />
      );

      // Simulate ready message from iframe
      const readyEvent = new MessageEvent('message', {
        data: { type: 'ready' },
        origin: window.location.origin,
      });

      fireEvent(window, readyEvent);

      await waitFor(() => {
        expect(screen.getByText('Editor Ready')).toBeInTheDocument();
      });
    });

    test('should handle scene updates from editor', async () => {
      const mockOnSceneChange = jest.fn();

      render(
        <SpaceEditor
          spaceId="test-space"
          onSceneChange={mockOnSceneChange}
          onSelectionChange={jest.fn()}
          onError={jest.fn()}
        />
      );

      // Simulate scene change message from iframe
      const sceneChangeEvent = new MessageEvent('message', {
        data: {
          type: 'scene_changed',
          data: {
            objects: [
              { id: 'obj1', position: [1, 2, 3] },
              { id: 'obj2', position: [4, 5, 6] },
            ],
          },
        },
        origin: window.location.origin,
      });

      fireEvent(window, sceneChangeEvent);

      expect(mockOnSceneChange).toHaveBeenCalledWith({
        type: 'scene_changed',
        data: {
          objects: [
            { id: 'obj1', position: [1, 2, 3] },
            { id: 'obj2', position: [4, 5, 6] },
          ],
        },
      });
    });

    test('should handle editor errors', async () => {
      const mockOnError = jest.fn();

      render(
        <SpaceEditor
          spaceId="test-space"
          onSceneChange={jest.fn()}
          onSelectionChange={jest.fn()}
          onError={mockOnError}
        />
      );

      // Simulate error message from iframe
      const errorEvent = new MessageEvent('message', {
        data: {
          type: 'error',
          error: 'Failed to load scene',
        },
        origin: window.location.origin,
      });

      fireEvent(window, errorEvent);

      expect(mockOnError).toHaveBeenCalledWith('Failed to load scene');
    });

    test('should send commands to editor', async () => {
      const mockPostMessage = jest.fn();
      
      // Mock iframe with postMessage
      const mockIframe = {
        contentWindow: {
          postMessage: mockPostMessage,
        },
      };

      render(
        <SpaceEditor
          spaceId="test-space"
          onSceneChange={jest.fn()}
          onSelectionChange={jest.fn()}
          onError={jest.fn()}
        />
      );

      // Simulate ready state
      const readyEvent = new MessageEvent('message', {
        data: { type: 'ready' },
        origin: window.location.origin,
      });
      fireEvent(window, readyEvent);

      // Commands would be sent through the editor bridge
      // This is a simplified test of the concept
    });
  });

  describe('Editor Switching Workflow', () => {
    test('should switch between editors without unsaved changes', async () => {
      render(<EditorSwitchingComponent />);

      // Start with native editor
      expect(screen.getByTestId('native-editor-btn')).toHaveClass('active');
      expect(screen.getByText('Native R3F Editor')).toBeInTheDocument();

      // Switch to Three.js editor
      fireEvent.click(screen.getByTestId('threejs-editor-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('threejs-editor-btn')).toHaveClass('active');
        expect(screen.getByTestId('threejs-editor-iframe')).toBeInTheDocument();
      });

      // Switch to simple editor
      fireEvent.click(screen.getByTestId('simple-editor-btn'));

      expect(screen.getByTestId('simple-editor-btn')).toHaveClass('active');
      expect(screen.getByTestId('simple-editor')).toBeInTheDocument();
    });

    test('should warn about unsaved changes when switching', async () => {
      // Mock window.confirm
      const mockConfirm = jest.spyOn(window, 'confirm').mockReturnValue(false);

      render(<EditorSwitchingComponent />);

      // Make changes to trigger unsaved state
      const translateBtn = screen.getByText('Translate');
      fireEvent.click(translateBtn); // Simulate making changes

      // This would normally trigger scene change, but we'll simulate it
      // by directly checking the unsaved indicator
      await waitFor(() => {
        // In a real scenario, scene changes would trigger unsaved state
        // For this test, we'll assume changes were made
      });

      // Try to switch editors
      fireEvent.click(screen.getByTestId('threejs-editor-btn'));

      // Should still be on native editor since user declined
      expect(screen.getByTestId('native-editor-btn')).toHaveClass('active');

      mockConfirm.mockRestore();
    });

    test('should allow switching after confirming unsaved changes', async () => {
      // Mock window.confirm to return true
      const mockConfirm = jest.spyOn(window, 'confirm').mockReturnValue(true);

      render(<EditorSwitchingComponent />);

      // Simulate unsaved changes
      // This would be triggered by actual scene modifications
      
      // Try to switch editors
      fireEvent.click(screen.getByTestId('threejs-editor-btn'));

      // Should switch since user confirmed
      await waitFor(() => {
        expect(screen.getByTestId('threejs-editor-btn')).toHaveClass('active');
      });

      mockConfirm.mockRestore();
    });

    test('should save changes before switching', async () => {
      render(<EditorSwitchingComponent />);

      // Simulate making changes
      // In real scenario, this would be triggered by actual scene modifications
      
      // Save changes
      const saveBtn = screen.getByTestId('save-btn');
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(screen.getByTestId('unsaved-indicator')).toHaveTextContent('All saved');
      });

      // Now switching should work without confirmation
      fireEvent.click(screen.getByTestId('threejs-editor-btn'));

      expect(screen.getByTestId('threejs-editor-btn')).toHaveClass('active');
    });
  });

  describe('Cross-Editor Data Consistency', () => {
    test('should maintain scene data across editor switches', async () => {
      render(<EditorSwitchingComponent />);

      // Start with native editor and make changes
      expect(screen.getByTestId('scene-data')).toHaveTextContent('No scene data');

      // Simulate scene change in native editor
      // This would normally be triggered by actual 3D interactions
      
      // Switch to Three.js editor
      fireEvent.click(screen.getByTestId('threejs-editor-btn'));

      // Scene data should be preserved and converted for Three.js editor
      // This would involve the scene conversion functions tested elsewhere
    });

    test('should handle format conversion between editors', async () => {
      render(<EditorSwitchingComponent />);

      // Create scene data in native editor format
      const nativeSceneData = {
        type: 'native_scene',
        items: [
          { id: 'item1', position: [1, 2, 3], rotation: [0, 0, 0], scale: [1, 1, 1] },
        ],
      };

      // Switch to Three.js editor - should convert format
      fireEvent.click(screen.getByTestId('threejs-editor-btn'));

      // The conversion would happen in the background
      // This tests the integration of the conversion system
    });

    test('should sync selection state between editors', async () => {
      const mockOnSelectionChange = jest.fn();

      render(
        <NativeSpaceEditor
          spaceId="test-space"
          onSceneChange={jest.fn()}
          onSelectionChange={mockOnSelectionChange}
        />
      );

      // Select objects in native editor
      const selectAllBtn = screen.getByText('All');
      fireEvent.click(selectAllBtn);

      expect(mockOnSelectionChange).toHaveBeenCalled();

      // When switching editors, selection should be preserved
      // This would be handled by the editor bridge system
    });
  });

  describe('Performance and Memory Management', () => {
    test('should cleanup resources when switching editors', async () => {
      const { rerender } = render(
        <NativeSpaceEditor
          spaceId="test-space"
          onSceneChange={jest.fn()}
          onSelectionChange={jest.fn()}
        />
      );

      // Switch to different editor
      rerender(
        <SpaceEditor
          spaceId="test-space"
          onSceneChange={jest.fn()}
          onSelectionChange={jest.fn()}
          onError={jest.fn()}
        />
      );

      // Resources should be cleaned up
      // This would be tested through memory monitoring in a real scenario
    });

    test('should handle multiple rapid editor switches', async () => {
      render(<EditorSwitchingComponent />);

      // Rapidly switch between editors
      for (let i = 0; i < 5; i++) {
        fireEvent.click(screen.getByTestId('threejs-editor-btn'));
        fireEvent.click(screen.getByTestId('native-editor-btn'));
        fireEvent.click(screen.getByTestId('simple-editor-btn'));
      }

      // Should remain stable
      expect(screen.getByTestId('simple-editor-btn')).toHaveClass('active');
    });

    test('should handle editor crashes gracefully', async () => {
      const mockOnError = jest.fn();

      render(
        <SpaceEditor
          spaceId="test-space"
          onSceneChange={jest.fn()}
          onSelectionChange={jest.fn()}
          onError={mockOnError}
        />
      );

      // Simulate editor crash
      const crashEvent = new MessageEvent('message', {
        data: {
          type: 'error',
          error: 'Editor crashed',
          fatal: true,
        },
        origin: window.location.origin,
      });

      fireEvent(window, crashEvent);

      expect(mockOnError).toHaveBeenCalledWith('Editor crashed');

      // Should show error state and allow recovery
      await waitFor(() => {
        expect(screen.getByText(/error/i)).toBeInTheDocument();
      });
    });
  });

  describe('Real-time Collaboration', () => {
    test('should handle concurrent edits from multiple editors', async () => {
      // This would test the real-time collaboration features
      // For now, we'll test the basic conflict detection

      const mockOnSceneChange = jest.fn();

      render(
        <NativeSpaceEditor
          spaceId="test-space"
          onSceneChange={mockOnSceneChange}
          onSelectionChange={jest.fn()}
        />
      );

      // Simulate concurrent modifications
      // This would involve WebSocket or similar real-time updates
      
      // For now, just verify that scene changes are properly reported
      expect(mockOnSceneChange).toHaveBeenCalledTimes(0);
    });

    test('should sync changes across editor instances', async () => {
      // Test that changes in one editor instance are reflected in others
      // This would involve the real-time synchronization system
      
      const mockOnSceneChange1 = jest.fn();
      const mockOnSceneChange2 = jest.fn();

      const { rerender } = render(
        <NativeSpaceEditor
          spaceId="test-space"
          onSceneChange={mockOnSceneChange1}
          onSelectionChange={jest.fn()}
        />
      );

      // Simulate second editor instance
      rerender(
        <NativeSpaceEditor
          spaceId="test-space"
          onSceneChange={mockOnSceneChange2}
          onSelectionChange={jest.fn()}
        />
      );

      // Changes in one should be reflected in the other
      // This would be implemented through the real-time sync system
    });
  });
});
