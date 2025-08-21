"use client";
import { useState } from 'react';
import { useDragAndDropWithPreview } from '@/hooks/useDragAndDrop';

export default function TestDirectInsertionPage() {
  const [insertionResults, setInsertionResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const { dragState, makeDraggableWithPreview, makeDropTarget, showPreview } = useDragAndDropWithPreview({
    onDragStart: (data) => console.log('Drag started:', data),
    onDragEnd: (result) => {
      console.log('Drag ended:', result);
      if (result.success) {
        setInsertionResults(prev => [...prev, { ...result, timestamp: new Date().toISOString() }]);
      }
    },
    onDrop: (data, target, position) => console.log('Dropped:', data, target, position),
  });

  const mockObjects = [
    {
      id: 'chair-modern',
      type: 'object' as const,
      name: 'Modern Chair',
      category: 'furniture',
      data: {
        object: {
          category: 'furniture',
          subcategory: 'seating',
          style: 'modern',
          boundingBox: { min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5] },
        },
      },
    },
    {
      id: 'desk-lamp',
      type: 'object' as const,
      name: 'Desk Lamp',
      category: 'lighting',
      data: {
        object: {
          category: 'lighting',
          subcategory: 'desk',
          style: 'industrial',
          boundingBox: { min: [-0.2, 0, -0.2], max: [0.2, 0.8, 0.2] },
        },
      },
    },
    {
      id: 'office-set',
      type: 'object_collection' as const,
      name: 'Office Set',
      category: 'furniture',
      data: {
        collection: {
          category: 'furniture',
          style: 'office',
          objects: [
            { id: 'desk', objectId: 'desk-01' },
            { id: 'chair', objectId: 'chair-01' },
            { id: 'lamp', objectId: 'lamp-01' },
          ],
          boundingBox: { min: [-2, 0, -1], max: [2, 1, 1] },
        },
      },
    },
  ];

  const testDirectInsertion = async (targetType: 'layout' | 'space') => {
    setLoading(true);
    
    try {
      // Test direct insertion via API
      const mockTargetId = targetType === 'layout' ? 'demo-layout' : 'demo-space';
      const mockObject = mockObjects[0];
      
      const endpoint = targetType === 'layout' 
        ? `/api/layouts/${mockTargetId}/add-object`
        : `/api/spaces/${mockTargetId}/add-object`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          objectId: mockObject.id,
          objectType: mockObject.type,
          position: targetType === 'layout' 
            ? { x: 100, y: 100, w: 64, h: 64 }
            : { x: 2, y: 0, z: 2 },
          config: {
            iconStyle: 'outline',
            showLabel: true,
          },
        }),
      });

      const result = await response.json();
      setInsertionResults(prev => [...prev, { 
        ...result, 
        targetType, 
        timestamp: new Date().toISOString() 
      }]);
      
    } catch (error) {
      console.error('Direct insertion test failed:', error);
      setInsertionResults(prev => [...prev, { 
        error: error instanceof Error ? error.message : 'Test failed',
        targetType,
        timestamp: new Date().toISOString() 
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-900 text-white p-6">
      <h1 className="text-2xl font-bold mb-4">Direct Insertion Workflows Test</h1>
      <p className="mb-6 text-neutral-300">
        Testing direct insertion of objects into layouts and spaces with drag-and-drop:
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Object Browser (Source) */}
        <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Object Browser</h3>
          <p className="text-sm text-neutral-400 mb-4">Drag objects to targets below:</p>
          
          <div className="space-y-3">
            {mockObjects.map((obj) => (
              <div
                key={obj.id}
                {...makeDraggableWithPreview(obj.id, obj.type, obj.data)}
                className="bg-neutral-700 border border-neutral-600 rounded p-3 cursor-grab active:cursor-grabbing hover:bg-neutral-600 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-neutral-600 rounded flex items-center justify-center text-sm">
                    {obj.type === 'object' ? '📦' : '📚'}
                  </div>
                  <div>
                    <div className="font-medium">{obj.name}</div>
                    <div className="text-xs text-neutral-400">{obj.category}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {dragState.isDragging && (
            <div className="mt-4 bg-blue-600/20 border border-blue-600 rounded p-3">
              <div className="text-blue-400 text-sm">
                Dragging: {dragState.dragData?.objectType} {dragState.dragData?.objectId}
              </div>
            </div>
          )}
        </div>

        {/* Layout Target */}
        <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Layout Target</h3>
          
          <div
            {...makeDropTarget('demo-layout', 'layout', { 
              layout_data: { 
                designSize: { width: 400, height: 300 },
                items: [] 
              } 
            })}
            className={`
              bg-neutral-100 border-2 border-dashed rounded-lg h-64 relative
              ${dragState.dropTarget?.targetType === 'layout' 
                ? (dragState.validDrop ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50')
                : 'border-neutral-400'
              }
            `}
          >
            <div className="absolute inset-0 flex items-center justify-center text-neutral-600">
              Drop objects here for 2D layout
            </div>
            
            {/* Preview position */}
            {dragState.dropTarget?.targetType === 'layout' && dragState.previewPosition && (
              <div
                className="absolute w-4 h-4 bg-blue-500 rounded border-2 border-white shadow-lg"
                style={{
                  left: `${(dragState.previewPosition.x / 400) * 100}%`,
                  top: `${(dragState.previewPosition.y / 300) * 100}%`,
                  transform: 'translate(-50%, -50%)',
                }}
              />
            )}
          </div>
          
          <button
            onClick={() => testDirectInsertion('layout')}
            disabled={loading}
            className="mt-4 w-full bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-600 text-white px-4 py-2 rounded text-sm"
          >
            Test API Insertion
          </button>
        </div>

        {/* Space Target */}
        <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Space Target</h3>
          
          <div
            {...makeDropTarget('demo-space', 'space', { 
              space: { 
                items: [],
                camera: { position: [5, 3, 5] }
              } 
            })}
            className={`
              bg-neutral-700 border-2 border-dashed rounded-lg h-64 relative overflow-hidden
              ${dragState.dropTarget?.targetType === 'space' 
                ? (dragState.validDrop ? 'border-green-400 bg-green-900/20' : 'border-red-400 bg-red-900/20')
                : 'border-neutral-500'
              }
            `}
          >
            {/* Simulated 3D grid */}
            <div className="absolute inset-0 opacity-20">
              <svg width="100%" height="100%" className="text-neutral-400">
                <defs>
                  <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                    <path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" strokeWidth="1"/>
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
              </svg>
            </div>
            
            <div className="absolute inset-0 flex items-center justify-center text-neutral-300">
              Drop objects here for 3D space
            </div>
            
            {/* Preview position */}
            {dragState.dropTarget?.targetType === 'space' && dragState.previewPosition && (
              <div
                className="absolute w-6 h-6 bg-green-500 rounded-full border-2 border-white shadow-lg"
                style={{
                  left: `${((dragState.previewPosition.x + 10) / 20) * 100}%`,
                  top: `${((dragState.previewPosition.z! + 10) / 20) * 100}%`,
                  transform: 'translate(-50%, -50%)',
                }}
              />
            )}
          </div>
          
          <button
            onClick={() => testDirectInsertion('space')}
            disabled={loading}
            className="mt-4 w-full bg-green-600 hover:bg-green-700 disabled:bg-neutral-600 text-white px-4 py-2 rounded text-sm"
          >
            Test API Insertion
          </button>
        </div>
      </div>

      {/* Drag Preview */}
      {showPreview && dragState.isDragging && (
        <div className="fixed top-4 right-4 bg-black/80 text-white p-3 rounded shadow-lg z-50">
          <div className="text-sm">
            Dragging: {dragState.dragData?.objectType}
          </div>
          <div className="text-xs text-neutral-300">
            {dragState.dragData?.objectId}
          </div>
          {dragState.conflicts.length > 0 && (
            <div className="text-xs text-red-400 mt-1">
              Conflicts: {dragState.conflicts.length}
            </div>
          )}
        </div>
      )}

      {/* Results */}
      <div className="mt-8 bg-neutral-800 border border-neutral-700 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Insertion Results</h3>
        
        {insertionResults.length === 0 ? (
          <div className="text-neutral-400 text-sm">
            No insertions yet. Try dragging objects to targets or clicking test buttons.
          </div>
        ) : (
          <div className="space-y-3">
            {insertionResults.map((result, index) => (
              <div
                key={index}
                className={`p-3 rounded border ${
                  result.success 
                    ? 'bg-green-600/20 border-green-600' 
                    : 'bg-red-600/20 border-red-600'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className={`font-medium ${result.success ? 'text-green-400' : 'text-red-400'}`}>
                      {result.success ? '✅ Success' : '❌ Failed'}
                    </div>
                    <div className="text-sm text-neutral-300">
                      {result.targetType}: {result.result?.itemId || result.error}
                    </div>
                  </div>
                  <div className="text-xs text-neutral-400">
                    {new Date(result.timestamp).toLocaleTimeString()}
                  </div>
                </div>
                
                {result.success && result.result && (
                  <div className="mt-2 text-xs text-neutral-400">
                    Position: {JSON.stringify(result.result.position)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Features Overview */}
      <div className="mt-8 bg-neutral-800 border border-neutral-700 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Direct Insertion Features</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium text-neutral-200 mb-2">Layout Insertion</h4>
            <ul className="text-sm text-neutral-300 space-y-1">
              <li>✅ Objects appear as 2D icons</li>
              <li>✅ Automatic icon generation (4 styles)</li>
              <li>✅ Category-based colors</li>
              <li>✅ Label display options</li>
              <li>✅ Collision detection</li>
              <li>✅ Smart grid positioning</li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-medium text-neutral-200 mb-2">Space Insertion</h4>
            <ul className="text-sm text-neutral-300 space-y-1">
              <li>✅ Objects appear as 3D models</li>
              <li>✅ Automatic floor snapping</li>
              <li>✅ Spiral placement algorithm</li>
              <li>✅ 3D collision detection</li>
              <li>✅ Default scaling/rotation</li>
              <li>✅ Physics properties</li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-medium text-neutral-200 mb-2">Drag & Drop</h4>
            <ul className="text-sm text-neutral-300 space-y-1">
              <li>✅ Visual drag preview</li>
              <li>✅ Drop target highlighting</li>
              <li>✅ Real-time position preview</li>
              <li>✅ Conflict validation</li>
              <li>✅ Success/error feedback</li>
              <li>✅ Multiple object support</li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-medium text-neutral-200 mb-2">API Integration</h4>
            <ul className="text-sm text-neutral-300 space-y-1">
              <li>✅ POST /api/layouts/[id]/add-object</li>
              <li>✅ POST /api/spaces/[id]/add-object</li>
              <li>✅ Zod validation</li>
              <li>✅ Error handling</li>
              <li>✅ Batch operations</li>
              <li>✅ Position validation</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
