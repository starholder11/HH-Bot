import { useState, useEffect } from 'react';

export type SpaceAssetType = 'image' | 'video' | 'audio' | 'text' | 'layout' | 'canvas' | 'object' | 'object_collection';

export type SpaceAssetData = {
  id: string;
  assetId: string;
  assetType: SpaceAssetType;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  opacity?: number;
  visible?: boolean;
  clickable?: boolean;
  hoverEffect?: 'glow' | 'scale' | 'none';
  // Asset-specific data loaded from APIs
  assetData?: any;
};

export function useSpaceAsset(assetId: string, assetType: SpaceAssetType) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!assetId || !assetType) {
      setLoading(false);
      return;
    }

    const loadAsset = async () => {
      try {
        setLoading(true);
        setError(null);

        let response;
        switch (assetType) {
          case 'object':
            response = await fetch(`/api/objects/${assetId}`);
            break;
          case 'object_collection':
            response = await fetch(`/api/object-collections/${assetId}`);
            break;
          case 'image':
          case 'video':
          case 'audio':
            // For media assets, we'll use the media-labeling API
            response = await fetch(`/api/media-labeling/assets/${assetId}`);
            break;
          default:
            // For demo and other types, provide mock data
            setData(generateMockAssetData(assetId, assetType));
            setLoading(false);
            return;
        }

        if (!response.ok) {
          throw new Error(`Failed to load ${assetType} asset: ${response.statusText}`);
        }

        const assetData = await response.json();
        setData(assetData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        console.error('useSpaceAsset error:', err);
      } finally {
        setLoading(false);
      }
    };

    loadAsset();
  }, [assetId, assetType]);

  return { data, loading, error };
}

// Generate mock asset data for demo purposes
function generateMockAssetData(assetId: string, assetType: SpaceAssetType): any {
  switch (assetType) {
    case 'object':
      if (assetId === 'demo-composite') {
        return {
          id: assetId,
          object_type: 'composite',
          object: {
            boundingBox: { min: [-1, -1, -1], max: [1, 2, 1] },
            components: [
              {
                id: 'seat',
                objectId: 'chair-seat',
                transform: { position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 0.2, 1] },
                role: 'seat',
                required: true,
              },
              {
                id: 'back',
                objectId: 'chair-back', 
                transform: { position: [0, 1, -0.4], rotation: [0, 0, 0], scale: [1, 1, 0.2] },
                role: 'back',
                required: true,
              },
              {
                id: 'legs',
                objectId: 'chair-legs',
                transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
                role: 'legs',
                required: true,
              },
              {
                id: 'armrest-left',
                objectId: 'chair-armrest',
                transform: { position: [-0.4, 0.8, 0], rotation: [0, 0, 0], scale: [0.2, 0.6, 0.8] },
                role: 'armrest',
                required: false,
              },
              {
                id: 'armrest-right',
                objectId: 'chair-armrest',
                transform: { position: [0.4, 0.8, 0], rotation: [0, 0, 0], scale: [0.2, 0.6, 0.8] },
                role: 'armrest',
                required: false,
              },
            ],
            category: 'furniture',
            subcategory: 'seating',
            style: 'modern',
            tags: ['chair', 'composite', 'furniture'],
          },
        };
      }
      return {
        id: assetId,
        object_type: 'atomic',
        object: {
          modelUrl: '/models/reference/threejs/DamagedHelmet.glb',
          boundingBox: { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] },
          category: 'props',
          subcategory: 'helmet',
          style: 'damaged',
          tags: ['helmet', 'prop', 'demo'],
        },
      };

    case 'object_collection':
      if (assetId === 'demo-instanced') {
        return {
          id: assetId,
          collection: {
            objects: [
              {
                objectId: 'tree-01',
                transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
                quantity: 8,
                pattern: 'circle',
              },
              {
                objectId: 'rock-01',
                transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [0.5, 0.5, 0.5] },
                quantity: 12,
                pattern: 'random',
              },
            ],
            boundingBox: { min: [-5, 0, -5], max: [5, 3, 5] },
            category: 'nature',
            style: 'forest',
            tags: ['trees', 'rocks', 'instanced', 'nature'],
          },
        };
      }
      return {
        id: assetId,
        collection: {
          objects: [
            {
              objectId: 'cube-01',
              transform: { position: [-1, 0, -1], rotation: [0, 0, 0], scale: [0.8, 0.8, 0.8] },
            },
            {
              objectId: 'cube-02',
              transform: { position: [1, 0, -1], rotation: [0, Math.PI/4, 0], scale: [0.8, 0.8, 0.8] },
            },
            {
              objectId: 'cube-03',
              transform: { position: [0, 0, 1], rotation: [0, Math.PI/2, 0], scale: [0.8, 0.8, 0.8] },
            },
          ],
          subCollections: ['demo-sub-collection'],
          boundingBox: { min: [-2, 0, -2], max: [2, 1, 2] },
          category: 'demo',
          style: 'geometric',
          tags: ['cubes', 'collection', 'demo'],
        },
      };

    case 'text':
      return {
        id: assetId,
        title: 'Text Asset',
        content: 'Demo Text Content',
        type: assetType,
      };

    case 'image':
      return {
        id: assetId,
        cloudflare_url: 'https://picsum.photos/512/512',
        type: assetType,
        title: 'Demo Image',
      };

    default:
      return { id: assetId, type: assetType, placeholder: true };
  }
}
