"use client";
import { useParams } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import SpaceEditor from "@/components/spatial/SpaceEditor";
import NativeSpaceEditor from "@/components/spatial/NativeSpaceEditor";
import SimpleThreeEditor from "@/components/spatial/SimpleThreeEditor";
import Link from "next/link";

export default function SpaceEditPage() {
  const params = useParams();
  const spaceId = (params?.id as string) || "demo";
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [editorType, setEditorType] = useState<'native' | 'threejs' | 'simple'>('native');
  const [switchingEditor, setSwitchingEditor] = useState(false);

  // Space data and name editing
  const [spaceData, setSpaceData] = useState<any>(null);
  const [spaceName, setSpaceName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Refs for editor save functionality
  const spaceEditorRef = useRef<any>(null);
  const nativeEditorRef = useRef<any>(null);

  // Import modal states
  const [showImportAsset, setShowImportAsset] = useState(false);
  const [showImportLayout, setShowImportLayout] = useState(false);

  // Load space data on mount
  useEffect(() => {
    loadSpaceData();
  }, [spaceId]);

  const loadSpaceData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/spaces/${spaceId}`);
      if (!response.ok) {
        throw new Error(`Failed to load space: ${response.statusText}`);
      }
      const space = await response.json();
      setSpaceData(space);
      setSpaceName(space.title || space.id);
      setError(null);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load space';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleSceneChange = (sceneData: any) => {
    setHasUnsavedChanges(true);
    console.log('Scene changed:', sceneData);
    // Update space data if it's the full space object
    if (sceneData && sceneData.id === spaceId) {
      setSpaceData(sceneData);
    }
  };

  const handleSelectionChange = (selectedObjects: string[]) => {
    console.log('Selection changed:', selectedObjects);
  };

  const handleError = (error: string) => {
    console.error('Editor error:', error);
    setError(error);
  };

  const handleSave = async () => {
    try {
      setSaveStatus('saving');

      // Trigger save from the appropriate editor
      if (editorType === 'threejs' && spaceEditorRef.current?.saveScene) {
        await spaceEditorRef.current.saveScene();
      } else if (editorType === 'native' && nativeEditorRef.current?.saveSpace) {
        await nativeEditorRef.current.saveSpace();
      } else {
        // Fallback: save name changes if any
        await saveSpaceName();
      }

      setLastSaved(new Date().toLocaleTimeString());
      setHasUnsavedChanges(false);
      setSaveStatus('saved');

      // Reset status after 2 seconds
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('Save failed:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const saveSpaceName = async () => {
    if (!spaceData || !spaceName.trim()) return;

    const updatedSpace = {
      ...spaceData,
      title: spaceName.trim(),
      updated_at: new Date().toISOString()
    };

    const response = await fetch(`/api/spaces/${spaceId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedSpace)
    });

    if (!response.ok) {
      throw new Error(`Failed to save space name: ${response.statusText}`);
    }

    const savedSpace = await response.json();
    setSpaceData(savedSpace);
  };

  const handleNameSave = async () => {
    if (spaceName.trim() && spaceName !== spaceData?.title) {
      try {
        await saveSpaceName();
        setHasUnsavedChanges(false);
      } catch (error) {
        console.error('Name save failed:', error);
      }
    }
    setIsEditingName(false);
  };

  const handleEditorSwitch = async (newEditorType: 'native' | 'threejs' | 'simple') => {
    if (newEditorType === editorType) return;
    
    setSwitchingEditor(true);
    
    try {
      // Save current editor state if there are unsaved changes
      if (hasUnsavedChanges) {
        console.log('[Editor Switch] Saving current state before switch');
        await handleSave();
      }
      
      // Switch editor
      setEditorType(newEditorType);
      
      // Reload space data after a brief delay to ensure new editor is mounted
      setTimeout(() => {
        loadSpaceData();
        setSwitchingEditor(false);
      }, 100);
      
    } catch (error) {
      console.error('Editor switch failed:', error);
      setSwitchingEditor(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-900 text-white p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg mb-2">Loading Space...</div>
          <div className="text-neutral-400 text-sm">Fetching space data</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-neutral-900 text-white p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-400 text-lg mb-2">Error Loading Space</div>
          <div className="text-red-300 text-sm mb-4">{error}</div>
          <button
            onClick={loadSpaceData}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-900 text-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Space Name - Editable like Canvas - TOP LEFT */}
          <div className="min-w-0">
            {!isEditingName ? (
              <h1
                className="text-2xl font-bold cursor-text truncate text-white"
                title={spaceName || 'Untitled Space'}
                onDoubleClick={() => setIsEditingName(true)}
              >
                {spaceName || 'Untitled Space'}
              </h1>
            ) : (
              <input
                value={spaceName}
                onChange={(e) => {
                  setSpaceName(e.target.value);
                  setHasUnsavedChanges(true);
                }}
                onBlur={handleNameSave}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleNameSave();
                  }
                  if (e.key === 'Escape') {
                    setSpaceName(spaceData?.title || '');
                    setIsEditingName(false);
                  }
                }}
                autoFocus
                className="text-2xl font-bold w-full px-2 py-1 rounded border border-neutral-700 bg-neutral-800 text-white"
                placeholder="Space name"
              />
            )}
          </div>

          <Link
            href="/workshop"
            className="text-neutral-400 hover:text-white text-sm"
          >
            ← Back to Workshop
          </Link>
        </div>

        <div className="flex items-center gap-3">
          {/* Editor Type Selector */}
          <div className="flex gap-1">
            <button
              className={`px-3 py-1.5 text-xs rounded ${
                editorType === 'native'
                  ? 'bg-blue-600 text-white'
                  : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-300'
              }`}
              onClick={() => handleEditorSwitch('native')}
              disabled={switchingEditor}
            >
              Native R3F
            </button>
            <button
              className={`px-3 py-1.5 text-xs rounded ${
                editorType === 'threejs'
                  ? 'bg-blue-600 text-white'
                  : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-300'
              }`}
              onClick={() => handleEditorSwitch('threejs')}
              disabled={switchingEditor}
            >
              Three.js Editor
            </button>
            <button
              className={`px-3 py-1.5 text-xs rounded ${
                editorType === 'simple'
                  ? 'bg-blue-600 text-white'
                  : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-300'
              }`}
              onClick={() => handleEditorSwitch('simple')}
              disabled={switchingEditor}
            >
              Simple Editor
            </button>
          </div>

          {/* Save Status */}
          {switchingEditor && (
            <span className="text-orange-400 text-sm">Switching editors...</span>
          )}
          {!switchingEditor && saveStatus === 'saving' && (
            <span className="text-blue-400 text-sm">Saving...</span>
          )}
          {saveStatus === 'saved' && (
            <span className="text-green-400 text-sm">Saved!</span>
          )}
          {saveStatus === 'error' && (
            <span className="text-red-400 text-sm">Save failed</span>
          )}
          {hasUnsavedChanges && saveStatus === 'idle' && (
            <span className="text-amber-400 text-sm">Unsaved changes</span>
          )}
          {lastSaved && saveStatus === 'idle' && !hasUnsavedChanges && (
            <span className="text-neutral-400 text-xs">
              Last saved: {lastSaved}
            </span>
          )}

          <button
            className={`px-4 py-2 text-sm rounded ${
              hasUnsavedChanges || saveStatus === 'saving'
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-neutral-700 text-neutral-300 cursor-not-allowed'
            }`}
            onClick={handleSave}
            disabled={(!hasUnsavedChanges && saveStatus !== 'saving') || saveStatus === 'saving'}
          >
            {saveStatus === 'saving' ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-6">
        {editorType === 'native' ? (
          <NativeSpaceEditor
            ref={nativeEditorRef}
            spaceId={spaceId}
            onSceneChange={handleSceneChange}
            onSelectionChange={handleSelectionChange}
          />
        ) : editorType === 'simple' ? (
          <SimpleThreeEditor
            spaceId={spaceId}
            onSave={handleSceneChange}
          />
        ) : (
          <SpaceEditor
            ref={spaceEditorRef}
            spaceId={spaceId}
            onSceneChange={handleSceneChange}
            onSelectionChange={handleSelectionChange}
            onError={handleError}
          />
        )}
      </div>

      <div className="mt-4 text-xs text-neutral-400">
        <p>Use the Three.js Editor above to manipulate 3D objects directly.</p>
        <p>Changes are automatically synced back to the space asset.</p>
      </div>
    </div>
  );
}
