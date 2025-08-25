"use client";
import { useParams } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import SpaceEditor from "@/components/spatial/SpaceEditor";
import AssetImportModal from "@/components/spatial/AssetImportModal";
import LayoutImportModal from "@/components/spatial/LayoutImportModal";
import Link from "next/link";

export default function SpaceEditPage() {
  const params = useParams();
  const spaceId = (params?.id as string) || "demo";
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  // Removed editor switching - using only Three.js Editor

  // Space data and name editing
  const [spaceData, setSpaceData] = useState<any>(null);
  const [spaceName, setSpaceName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Ref for Three.js Editor save functionality
  const spaceEditorRef = useRef<any>(null);

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

      // Trigger save from Three.js Editor
      if (spaceEditorRef.current?.saveScene) {
        await spaceEditorRef.current.saveScene();
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

    console.log('[SpaceEditor] Saving space name:', spaceName.trim());
    console.log('[SpaceEditor] Current spaceData:', spaceData);

    const updatedSpace = {
      ...spaceData,
      title: spaceName.trim(),
      updated_at: new Date().toISOString()
    };

    console.log('[SpaceEditor] Updated space data:', updatedSpace);

    const response = await fetch(`/api/spaces/${spaceId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedSpace)
    });

    console.log('[SpaceEditor] API response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[SpaceEditor] API error response:', errorText);
      throw new Error(`Failed to save space name: ${response.statusText} - ${errorText}`);
    }

    const savedSpace = await response.json();
    console.log('[SpaceEditor] Saved space data:', savedSpace);
    setSpaceData(savedSpace);
    // Ensure the spaceName state is updated to match the saved data
    setSpaceName(savedSpace.title);
  };

  const handleNameSave = async () => {
    if (spaceName.trim() && spaceName !== spaceData?.title) {
      try {
        await saveSpaceName();
        setHasUnsavedChanges(false);
        // Force UI update by ensuring spaceName matches the saved data
        setSpaceName(spaceName.trim());
      } catch (error) {
        console.error('Name save failed:', error);
        // Revert to original name on error
        setSpaceName(spaceData?.title || '');
      }
    }
    setIsEditingName(false);
  };

  // Removed editor switching - using only Three.js Editor

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
    <div className="min-h-screen bg-neutral-900 text-white">
      <div className="max-w-7xl mx-auto px-6 py-6">
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
          </div>

          <div className="flex items-center gap-3">
          {/* Actions */}
          <button
            className="px-3 py-1.5 text-xs rounded bg-neutral-700 hover:bg-neutral-600 text-neutral-200"
            onClick={() => setShowImportAsset(true)}
          >
            Import Asset
          </button>
          <button
            className="px-3 py-1.5 text-xs rounded bg-neutral-700 hover:bg-neutral-600 text-neutral-200"
            onClick={() => setShowImportLayout(true)}
          >
            Import Layout
          </button>

          {/* Clear and Delete buttons */}
          <button
            className="px-3 py-1.5 text-xs rounded bg-neutral-700 hover:bg-neutral-600 text-neutral-200"
            onClick={() => {
              if (spaceEditorRef.current) {
                // Send clear command to editor
                spaceEditorRef.current.sendCommand?.({ type: 'clear_scene', data: {} });
              }
            }}
          >
            Clear
          </button>
          <button
            className="px-3 py-1.5 text-xs rounded bg-red-700 hover:bg-red-800 text-white"
            onClick={async () => {
              if (!confirm('Delete this space? This cannot be undone.')) return;
              try {
                const res = await fetch(`/api/spaces/${spaceId}`, { method: 'DELETE' });
                if (!res.ok) {
                  const msg = await res.text();
                  throw new Error(`${res.status} ${res.statusText}: ${msg}`);
                }
                window.location.href = '/workshop';
              } catch (e: any) {
                console.error('Delete space failed:', e);
                alert('Failed to delete space: ' + e.message);
              }
            }}
          >
            Delete
          </button>

          {/* Publish button */}
          <button
            className="px-3 py-1.5 text-xs rounded bg-purple-600 hover:bg-purple-700 text-white"
            onClick={async () => {
              try {
                await handleSave();
              } catch {}
              window.open(`/view/${spaceId}`, '_blank');
            }}
          >
            Publish
          </button>

          {/* Save Status */}
          {saveStatus === 'saving' && (
            <span className="text-blue-400 text-sm">Saving...</span>
          )}
          {saveStatus === 'saved' && (
            <span className="text-green-400 text-sm">Saved!</span>
          )}
          {saveStatus === 'error' && (
            <span className="text-red-400 text-sm">Save failed</span>
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

      <div className="bg-neutral-800">
        <SpaceEditor
          ref={spaceEditorRef}
          spaceId={spaceId}
          onSceneChange={handleSceneChange}
          onSelectionChange={handleSelectionChange}
          onError={handleError}
        />
      </div>

      <div className="mt-4 text-xs text-neutral-400">
        <p>Use the Three.js Editor above to manipulate 3D objects directly.</p>
        <p>Changes are automatically synced back to the space asset.</p>
      </div>

      {/* Import Modals */}
      {showImportAsset && (
        <AssetImportModal
          onClose={() => setShowImportAsset(false)}
          onSelect={async (asset: any) => {
            setShowImportAsset(false);
            await spaceEditorRef.current?.addAsset?.(asset);
            setHasUnsavedChanges(true);
          }}
        />
      )}

      {showImportLayout && (
        <LayoutImportModal
          onClose={() => setShowImportLayout(false)}
          onSelect={async (layout: any) => {
            setShowImportLayout(false);
            await spaceEditorRef.current?.addLayout?.(layout);
            setHasUnsavedChanges(true);
          }}
        />
      )}

      
      </div>
    </div>
  );
}
