"use client";

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

// Avoid SSR for heavy 3D editors
const NativeSpaceEditor = dynamic(() => import('@/components/spatial/NativeSpaceEditor'), { ssr: false });
const SpaceEditor = dynamic(() => import('@/components/spatial/SpaceEditor'), { ssr: false });

export default function SpacesTab() {
  const [spaces, setSpaces] = useState<any[]>([]);
  const [currentSpaceId, setCurrentSpaceId] = useState<string | null>(null);
  const [editorType, setEditorType] = useState<'native' | 'threejs'>('native');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load available spaces
  useEffect(() => {
    loadSpaces();
  }, []);

  const loadSpaces = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/spaces');
      if (response.ok) {
        const spacesData = await response.json();
        setSpaces(spacesData);
        // Auto-select first space if available
        if (spacesData.length > 0 && !currentSpaceId) {
          setCurrentSpaceId(spacesData[0].id);
        }
      } else {
        console.warn('Failed to load spaces:', response.statusText);
        setSpaces([]);
      }
    } catch (err) {
      console.error('Error loading spaces:', err);
      setError('Failed to load spaces');
      setSpaces([]);
    } finally {
      setLoading(false);
    }
  };

  const createNewSpace = async () => {
    try {
      const newSpace = {
        title: `New Space ${Date.now()}`,
        space_type: 'mixed',
        space: {
          items: [],
          environment: { preset: 'city', background: true },
          camera: { position: [4, 3, 6], target: [0, 0, 0], fov: 50 }
        }
      };

      const response = await fetch('/api/spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSpace)
      });

      if (response.ok) {
        const createdSpace = await response.json();
        setSpaces(prev => [createdSpace, ...prev]);
        setCurrentSpaceId(createdSpace.id);
      } else {
        setError('Failed to create space');
      }
    } catch (err) {
      console.error('Error creating space:', err);
      setError('Failed to create space');
    }
  };

  const handleSceneChange = (sceneData: any) => {
    console.log('Space scene changed:', sceneData);
  };

  const handleSelectionChange = (selectedObjects: string[]) => {
    console.log('Space selection changed:', selectedObjects);
  };

  const handleError = (errorMsg: string) => {
    setError(errorMsg);
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-neutral-400">Loading spaces...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Spaces Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <select
            value={currentSpaceId || ''}
            onChange={(e) => setCurrentSpaceId(e.target.value || null)}
            className="px-3 py-1.5 text-sm bg-neutral-800 border border-neutral-700 rounded text-white"
          >
            <option value="">Select a space...</option>
            {spaces.map(space => (
              <option key={space.id} value={space.id}>
                {space.title}
              </option>
            ))}
          </select>

          <button
            onClick={createNewSpace}
            className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded"
          >
            New Space
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditorType('native')}
            className={`px-3 py-1.5 text-xs rounded ${
              editorType === 'native'
                ? 'bg-blue-600 text-white'
                : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-300'
            }`}
          >
            Native R3F
          </button>
          <button
            onClick={() => setEditorType('threejs')}
            className={`px-3 py-1.5 text-xs rounded ${
              editorType === 'threejs'
                ? 'bg-blue-600 text-white'
                : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-300'
            }`}
          >
            Three.js Editor
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-4 p-3 bg-red-900/20 border border-red-700 rounded text-red-400 text-sm">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 text-red-300 hover:text-red-100"
          >
            ×
          </button>
        </div>
      )}

      {/* Space Editor */}
      <div className="flex-1 rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden">
        {currentSpaceId ? (
          editorType === 'native' ? (
            <NativeSpaceEditor
              spaceId={currentSpaceId}
              onSceneChange={handleSceneChange}
              onSelectionChange={handleSelectionChange}
            />
          ) : (
            <SpaceEditor
              spaceId={currentSpaceId}
              onSceneChange={handleSceneChange}
              onSelectionChange={handleSelectionChange}
              onError={handleError}
            />
          )
        ) : (
          <div className="h-full flex items-center justify-center text-neutral-400">
            {spaces.length === 0 ? (
              <div className="text-center">
                <div className="mb-2">No spaces found</div>
                <button
                  onClick={createNewSpace}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
                >
                  Create Your First Space
                </button>
              </div>
            ) : (
              'Select a space to edit'
            )}
          </div>
        )}
      </div>
    </div>
  );
}
