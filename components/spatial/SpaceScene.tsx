"use client";
import { useState, useMemo } from "react";
import SpaceItem from "./SpaceItem";
import { type SpaceAssetData } from "@/hooks/useSpaceAsset";
import { type LODManager } from "@/utils/spatial/lod";

export type SpaceSceneProps = {
  items: SpaceAssetData[];
  cameraPosition?: [number, number, number];
  lodManager?: LODManager;
  onSelectItem?: (item: SpaceAssetData) => void;
  onHoverItem?: (item: SpaceAssetData | null) => void;
};

export default function SpaceScene({ 
  items, 
  cameraPosition = [0, 0, 0], 
  lodManager,
  onSelectItem, 
  onHoverItem 
}: SpaceSceneProps) {
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [hoveredItem, setHoveredItem] = useState<SpaceAssetData | null>(null);

  // Filter visible items and sort by distance for rendering optimization
  const visibleItems = useMemo(() => {
    return items
      .filter(item => {
        if (item.visible === false) return false;
        
        // Use LOD manager for frustum culling if available
        if (lodManager) {
          const lodInfo = lodManager.calculateObjectLOD(item.position, cameraPosition);
          return lodInfo.shouldRender;
        }
        
        return true;
      })
      .sort((a, b) => {
        // Calculate distances for sorting (far to near for transparency)
        const distA = Math.sqrt(
          Math.pow(a.position[0] - cameraPosition[0], 2) +
          Math.pow(a.position[1] - cameraPosition[1], 2) +
          Math.pow(a.position[2] - cameraPosition[2], 2)
        );
        const distB = Math.sqrt(
          Math.pow(b.position[0] - cameraPosition[0], 2) +
          Math.pow(b.position[1] - cameraPosition[1], 2) +
          Math.pow(b.position[2] - cameraPosition[2], 2)
        );
        return distB - distA; // Far to near
      });
  }, [items, cameraPosition, lodManager]);

  const handleSelectItem = (item: SpaceAssetData) => {
    const newSelection = new Set(selectedItems);
    if (newSelection.has(item.id)) {
      newSelection.delete(item.id);
    } else {
      newSelection.add(item.id);
    }
    setSelectedItems(newSelection);
    onSelectItem?.(item);
  };

  const handleHoverItem = (item: SpaceAssetData | null) => {
    setHoveredItem(item);
    onHoverItem?.(item);
  };

  return (
    <group>
      {visibleItems.map((item) => (
        <SpaceItem
          key={item.id}
          item={item}
          cameraPosition={cameraPosition}
          lodManager={lodManager}
          onSelect={handleSelectItem}
          onHover={handleHoverItem}
        />
      ))}
      
      {/* Debug info for selected/hovered items */}
      {hoveredItem && (
        <group position={[0, 5, 0]}>
          {/* This would be better as an HTML overlay, but keeping it simple for now */}
        </group>
      )}
    </group>
  );
}

// Demo data generator for testing
export function generateDemoSpaceItems(): SpaceAssetData[] {
  return [
    {
      id: "demo-image-1",
      assetId: "demo-img",
      assetType: "image",
      position: [-3, 1, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      visible: true,
      clickable: true,
      hoverEffect: "glow",
    },
    {
      id: "demo-object-1", 
      assetId: "DamagedHelmet", // try to match a real reference id if present
      assetType: "object",
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      visible: true,
      clickable: true,
      hoverEffect: "scale",
      objectProperties: {
        showComponents: true,
        interactionLevel: 'component',
        lodLevel: 1,
        physics: { enabled: false }
      },
    },
    {
      id: "demo-text-1",
      assetId: "demo-text",
      assetType: "text",
      position: [3, 1, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      visible: true,
      clickable: true,
      hoverEffect: "glow",
    },
    {
      id: "demo-collection-1",
      assetId: "reference-collection", // placeholder; renderer will show mock if not found
      assetType: "object_collection",
      position: [0, 0, -3],
      rotation: [0, Math.PI / 4, 0],
      scale: [1, 1, 1],
      visible: true,
      clickable: true,
      hoverEffect: "scale",
      objectProperties: {
        showComponents: true,
        interactionLevel: 'object',
        lodLevel: 1,
        physics: { enabled: false }
      },
    },
    {
      id: "demo-composite-object",
      assetId: "demo-composite",
      assetType: "object",
      position: [-2, 0, -2],
      rotation: [0, Math.PI / 6, 0],
      scale: [1, 1, 1],
      visible: true,
      clickable: true,
      hoverEffect: "scale",
      objectProperties: {
        showComponents: true,
        interactionLevel: 'component',
        lodLevel: 1,
        physics: { enabled: false }
      },
    },
    {
      id: "demo-instanced-collection",
      assetId: "demo-instanced",
      assetType: "object_collection",
      position: [2, 0, -2],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      visible: true,
      clickable: true,
      hoverEffect: "glow",
      objectProperties: {
        showComponents: true,
        interactionLevel: 'collection',
        lodLevel: 1,
        physics: { enabled: false }
      },
    },
  ];
}
