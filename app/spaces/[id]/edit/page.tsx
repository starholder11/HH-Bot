"use client";
import { useParams } from "next/navigation";
import { useState } from "react";
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

  const handleSceneChange = (sceneData: any) => {
    setHasUnsavedChanges(true);
    console.log('Scene changed:', sceneData);
    // TODO: Auto-save or debounce saves
  };

  const handleSelectionChange = (selectedObjects: string[]) => {
    console.log('Selection changed:', selectedObjects);
  };

  const handleError = (error: string) => {
    console.error('Editor error:', error);
  };

  const handleSave = async () => {
    try {
      // TODO: Implement save logic
      setLastSaved(new Date().toLocaleTimeString());
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Save failed:', error);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-900 text-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link 
            href={`/spaces/${spaceId}`}
            className="text-neutral-400 hover:text-white text-sm"
          >
            ← Back to Space
          </Link>
          <h1 className="text-2xl font-bold">Edit Space: {spaceId}</h1>
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
              onClick={() => setEditorType('native')}
            >
              Native R3F
            </button>
            <button
              className={`px-3 py-1.5 text-xs rounded ${
                editorType === 'threejs' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-300'
              }`}
              onClick={() => setEditorType('threejs')}
            >
              Three.js Editor
            </button>
            <button
              className={`px-3 py-1.5 text-xs rounded ${
                editorType === 'simple' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-300'
              }`}
              onClick={() => setEditorType('simple')}
            >
              Simple Editor
            </button>
          </div>
          
          {hasUnsavedChanges && (
            <span className="text-amber-400 text-sm">Unsaved changes</span>
          )}
          {lastSaved && (
            <span className="text-neutral-400 text-xs">
              Last saved: {lastSaved}
            </span>
          )}
          <button
            className={`px-4 py-2 text-sm rounded ${
              hasUnsavedChanges 
                ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                : 'bg-neutral-700 text-neutral-300 cursor-not-allowed'
            }`}
            onClick={handleSave}
            disabled={!hasUnsavedChanges}
          >
            Save
          </button>
        </div>
      </div>

      <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-6">
        {editorType === 'native' ? (
          <NativeSpaceEditor
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
