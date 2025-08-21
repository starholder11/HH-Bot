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
            // For other types, we'll implement later
            setData({ id: assetId, type: assetType, placeholder: true });
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
