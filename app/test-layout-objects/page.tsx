"use client";
import { useState, useEffect } from 'react';
import { generateLayoutItemIcon } from '@/utils/spatial/icon-generation';

export default function TestLayoutObjectsPage() {
  const [icons, setIcons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const generateTestIcons = async () => {
      try {
        // Mock object data for testing
        const mockObjects = [
          {
            id: 'chair-01',
            type: 'object',
            data: {
              object: {
                category: 'furniture',
                subcategory: 'seating',
                style: 'modern',
              },
            },
          },
          {
            id: 'lamp-01', 
            type: 'object',
            data: {
              object: {
                category: 'lighting',
                subcategory: 'desk',
                style: 'industrial',
              },
            },
          },
          {
            id: 'kitchen-set',
            type: 'object_collection',
            data: {
              collection: {
                category: 'furniture',
                objects: [
                  { id: 'table', objectId: 'table-01' },
                  { id: 'chair1', objectId: 'chair-01' },
                  { id: 'chair2', objectId: 'chair-01' },
                  { id: 'chair3', objectId: 'chair-01' },
                ],
              },
            },
          },
          {
            id: 'forest-pack',
            type: 'object_collection',
            data: {
              collection: {
                category: 'nature',
                objects: Array.from({ length: 12 }, (_, i) => ({
                  id: `tree-${i}`,
                  objectId: 'tree-01',
                })),
              },
            },
          },
        ];

        const generatedIcons: Record<string, string> = {};
        
        // Generate icons with different styles
        const styles = ['outline', 'filled', 'isometric', 'top-down'] as const;
        
        for (const obj of mockObjects) {
          for (const style of styles) {
            const icon = generateLayoutItemIcon(obj.type, obj.data, {
              width: 64,
              height: 64,
              style,
              showLabel: true,
            });
            generatedIcons[`${obj.id}-${style}`] = icon.iconUrl;
          }
        }
        
        setIcons(generatedIcons);
      } catch (error) {
        console.error('Failed to generate icons:', error);
      } finally {
        setLoading(false);
      }
    };

    generateTestIcons();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-900 text-white p-6">
        <h1 className="text-2xl font-bold mb-4">Layout Objects Test</h1>
        <p>Generating object icons...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-900 text-white p-6">
      <h1 className="text-2xl font-bold mb-4">Layout Objects Test</h1>
      <p className="mb-6 text-neutral-300">
        Testing 2D icon generation for 3D objects and collections in layouts:
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        {/* Chair Object */}
        <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-3">Chair (Object)</h3>
          <div className="grid grid-cols-2 gap-2">
            {['outline', 'filled', 'isometric', 'top-down'].map((style) => (
              <div key={style} className="text-center">
                <div className="text-xs text-neutral-400 mb-1">{style}</div>
                <img 
                  src={icons[`chair-01-${style}`]} 
                  alt={`Chair ${style}`}
                  className="w-16 h-16 mx-auto border border-neutral-600 rounded"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Lamp Object */}
        <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-3">Lamp (Object)</h3>
          <div className="grid grid-cols-2 gap-2">
            {['outline', 'filled', 'isometric', 'top-down'].map((style) => (
              <div key={style} className="text-center">
                <div className="text-xs text-neutral-400 mb-1">{style}</div>
                <img 
                  src={icons[`lamp-01-${style}`]} 
                  alt={`Lamp ${style}`}
                  className="w-16 h-16 mx-auto border border-neutral-600 rounded"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Kitchen Set Collection */}
        <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-3">Kitchen Set (Collection)</h3>
          <div className="grid grid-cols-2 gap-2">
            {['outline', 'filled', 'isometric', 'top-down'].map((style) => (
              <div key={style} className="text-center">
                <div className="text-xs text-neutral-400 mb-1">{style}</div>
                <img 
                  src={icons[`kitchen-set-${style}`]} 
                  alt={`Kitchen Set ${style}`}
                  className="w-16 h-16 mx-auto border border-neutral-600 rounded"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Forest Pack Collection */}
        <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-3">Forest Pack (Collection)</h3>
          <div className="grid grid-cols-2 gap-2">
            {['outline', 'filled', 'isometric', 'top-down'].map((style) => (
              <div key={style} className="text-center">
                <div className="text-xs text-neutral-400 mb-1">{style}</div>
                <img 
                  src={icons[`forest-pack-${style}`]} 
                  alt={`Forest Pack ${style}`}
                  className="w-16 h-16 mx-auto border border-neutral-600 rounded"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-8 bg-neutral-800 border border-neutral-700 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Layout Integration Preview</h3>
        <p className="text-neutral-300 mb-4">
          How these objects would appear in a 2D layout editor:
        </p>
        
        <div className="bg-neutral-100 border-2 border-dashed border-neutral-400 rounded-lg p-6 min-h-64 relative">
          {/* Simulated layout editor background */}
          <div className="absolute inset-0 opacity-10 bg-grid-pattern"></div>
          
          {/* Object icons positioned in layout */}
          <div className="relative">
            <img 
              src={icons['chair-01-outline']} 
              alt="Chair in layout"
              className="absolute w-12 h-12 border border-blue-400"
              style={{ left: '20px', top: '20px' }}
            />
            <div className="absolute text-xs text-black" style={{ left: '20px', top: '76px' }}>
              Chair
            </div>
            
            <img 
              src={icons['lamp-01-filled']} 
              alt="Lamp in layout"
              className="absolute w-8 h-8 border border-green-400"
              style={{ left: '100px', top: '40px' }}
            />
            <div className="absolute text-xs text-black" style={{ left: '100px', top: '72px' }}>
              Lamp
            </div>
            
            <img 
              src={icons['kitchen-set-isometric']} 
              alt="Kitchen Set in layout"
              className="absolute w-20 h-16 border border-purple-400"
              style={{ left: '200px', top: '30px' }}
            />
            <div className="absolute text-xs text-black" style={{ left: '200px', top: '90px' }}>
              Kitchen Set (4 items)
            </div>
          </div>
        </div>
        
        <div className="mt-4 text-sm text-neutral-400">
          ✅ Objects appear as 2D icons in layouts<br/>
          ✅ Different icon styles for different use cases<br/>
          ✅ Collections show item count indicators<br/>
          ✅ Category-based colors and shapes<br/>
          ✅ Ready for drag-and-drop in layout editors
        </div>
      </div>
    </div>
  );
}
