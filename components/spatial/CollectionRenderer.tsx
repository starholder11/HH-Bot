"use client";
import { useRef, useState, useEffect, useMemo } from "react";
import { generateInstancePattern, createInstancedMesh, type InstanceData } from "@/utils/spatial/instancing";

export interface CollectionObject {
  objectId: string;
  transform: {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
  };
  quantity?: number;
  pattern?: 'grid' | 'circle' | 'line' | 'random' | 'manual';
}

export interface CollectionAssetData {
  id: string;
  collection: {
    objects: CollectionObject[];
    subCollections?: string[]; // references to other collections
    boundingBox: { min: [number, number, number]; max: [number, number, number] };
    category: string;
    style?: string;
    tags: string[];
  };
}

export interface CollectionRendererProps {
  assetData: CollectionAssetData;
  showComponents?: boolean;
  interactionLevel?: 'collection' | 'object' | 'component';
  useInstancing?: boolean;
  onObjectSelect?: (objectId: string) => void;
  onObjectHover?: (objectId: string | null) => void;
}

export default function CollectionRenderer({
  assetData,
  showComponents = true,
  interactionLevel = 'collection',
  useInstancing = true,
  onObjectSelect,
  onObjectHover,
}: CollectionRendererProps) {
  const groupRef = useRef<any>(null);
  const [r3f, setR3F] = useState<any>(null);
  const [hoveredObject, setHoveredObject] = useState<string | null>(null);
  const [selectedObjects, setSelectedObjects] = useState<Set<string>>(new Set());

  // Load R3F components
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [fiber, drei] = await Promise.all([
          import("@react-three/fiber"),
          import("@react-three/drei"),
        ]);
        if (!mounted) return;
        setR3F({
          useGLTF: drei.useGLTF,
          Clone: drei.Clone,
        });
      } catch (err) {
        console.error("CollectionRenderer failed to load R3F:", err);
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  const handleObjectClick = (objectId: string) => {
    if (interactionLevel === 'object') {
      const newSelection = new Set(selectedObjects);
      if (newSelection.has(objectId)) {
        newSelection.delete(objectId);
      } else {
        newSelection.add(objectId);
      }
      setSelectedObjects(newSelection);
      onObjectSelect?.(objectId);
    }
  };

  const handleObjectHover = (objectId: string | null) => {
    if (interactionLevel === 'object') {
      setHoveredObject(objectId);
      onObjectHover?.(objectId);
    }
  };

  // Generate instances for objects with quantity > 1
  const instancedObjects = useMemo(() => {
    const result: Record<string, InstanceData[]> = {};
    
    assetData.collection.objects.forEach((obj) => {
      if (obj.quantity && obj.quantity > 1) {
        const pattern = obj.pattern || 'grid';
        const spacing = 2; // Could be configurable
        const instances = generateInstancePattern(pattern, obj.quantity, spacing);
        
        // Apply base transform to all instances
        result[obj.objectId] = instances.map((instance) => ({
          position: [
            instance.position[0] + obj.transform.position[0],
            instance.position[1] + obj.transform.position[1],
            instance.position[2] + obj.transform.position[2],
          ] as [number, number, number],
          rotation: [
            instance.rotation[0] + obj.transform.rotation[0],
            instance.rotation[1] + obj.transform.rotation[1],
            instance.rotation[2] + obj.transform.rotation[2],
          ] as [number, number, number],
          scale: [
            instance.scale[0] * obj.transform.scale[0],
            instance.scale[1] * obj.transform.scale[1],
            instance.scale[2] * obj.transform.scale[2],
          ] as [number, number, number],
          id: `${obj.objectId}_${instances.indexOf(instance)}`,
        }));
      }
    });
    
    return result;
  }, [assetData.collection.objects]);

  if (!r3f) return null;

  return (
    <group ref={groupRef}>
      {/* Render individual objects */}
      {assetData.collection.objects.map((obj) => {
        // If quantity > 1 and instancing is enabled, use instanced rendering
        if (obj.quantity && obj.quantity > 1 && useInstancing) {
          return (
            <InstancedObjectRenderer
              key={obj.objectId}
              objectId={obj.objectId}
              instances={instancedObjects[obj.objectId] || []}
              selected={selectedObjects.has(obj.objectId)}
              hovered={hoveredObject === obj.objectId}
              onClick={() => handleObjectClick(obj.objectId)}
              onHover={() => handleObjectHover(obj.objectId)}
              onHoverOut={() => handleObjectHover(null)}
            />
          );
        }

        // Single object or manual positioning
        return (
          <group
            key={obj.objectId}
            position={obj.transform.position}
            rotation={obj.transform.rotation}
            scale={obj.transform.scale}
            onClick={() => handleObjectClick(obj.objectId)}
            onPointerOver={() => handleObjectHover(obj.objectId)}
            onPointerOut={() => handleObjectHover(null)}
          >
            <ObjectPlaceholder
              objectId={obj.objectId}
              selected={selectedObjects.has(obj.objectId)}
              hovered={hoveredObject === obj.objectId}
            />
          </group>
        );
      })}

      {/* Render sub-collections */}
      {showComponents && assetData.collection.subCollections?.map((subCollectionId) => (
        <group key={subCollectionId} position={[0, 0, 0]}>
          {/* Placeholder for sub-collection - would load recursively in real implementation */}
          <mesh>
            <boxGeometry args={[2, 0.1, 2]} />
            <meshStandardMaterial color="#9333ea" wireframe />
          </mesh>
        </group>
      ))}

      {/* Collection bounding box */}
      {showComponents && interactionLevel === 'collection' && (
        <mesh>
          <boxGeometry args={[
            assetData.collection.boundingBox.max[0] - assetData.collection.boundingBox.min[0],
            assetData.collection.boundingBox.max[1] - assetData.collection.boundingBox.min[1],
            assetData.collection.boundingBox.max[2] - assetData.collection.boundingBox.min[2],
          ]} />
          <meshBasicMaterial color="#2563eb" wireframe opacity={0.3} transparent />
        </mesh>
      )}
    </group>
  );
}

// Instanced object renderer for performance with many objects
function InstancedObjectRenderer({ 
  objectId, 
  instances, 
  selected, 
  hovered, 
  onClick, 
  onHover, 
  onHoverOut 
}: {
  objectId: string;
  instances: InstanceData[];
  selected: boolean;
  hovered: boolean;
  onClick: () => void;
  onHover: () => void;
  onHoverOut: () => void;
}) {
  const meshRef = useRef<any>(null);
  
  useEffect(() => {
    // In a real implementation, this would create an actual InstancedMesh
    // For now, we'll render individual objects
  }, [instances]);

  return (
    <group onClick={onClick} onPointerOver={onHover} onPointerOut={onHoverOut}>
      {instances.map((instance, idx) => (
        <group
          key={idx}
          position={instance.position}
          rotation={instance.rotation}
          scale={instance.scale}
        >
          <ObjectPlaceholder
            objectId={objectId}
            selected={selected}
            hovered={hovered}
            instanceId={instance.id}
          />
        </group>
      ))}
    </group>
  );
}

// Placeholder object renderer
function ObjectPlaceholder({ 
  objectId, 
  selected, 
  hovered, 
  instanceId 
}: {
  objectId: string;
  selected: boolean;
  hovered: boolean;
  instanceId?: string;
}) {
  const color = selected ? "#4ade80" : hovered ? "#60a5fa" : "#2563eb";
  
  return (
    <mesh>
      <boxGeometry args={[0.8, 0.8, 0.8]} />
      <meshStandardMaterial 
        color={color} 
        wireframe={!!instanceId}
        opacity={instanceId ? 0.7 : 1}
        transparent={!!instanceId}
      />
    </mesh>
  );
}
