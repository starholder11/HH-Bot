"use client";
import { useRef, useState, useMemo, useEffect } from "react";
import { useSpaceAsset, type SpaceAssetData } from "@/hooks/useSpaceAsset";
import ObjectRenderer from "./ObjectRenderer";
import CollectionRenderer from "./CollectionRenderer";
import { type LODManager, calculateLODLevel } from "@/utils/spatial/lod";

type SpaceItemProps = {
  item: SpaceAssetData;
  cameraPosition?: [number, number, number];
  lodManager?: LODManager;
  onSelect?: (item: SpaceAssetData) => void;
  onHover?: (item: SpaceAssetData | null) => void;
};

export default function SpaceItem({ item, cameraPosition = [0, 0, 0], lodManager, onSelect, onHover }: SpaceItemProps) {
  const meshRef = useRef<any>(null);
  const [hovered, setHovered] = useState(false);
  const [selected, setSelected] = useState(false);
  const [r3f, setR3F] = useState<any>(null);
  
  const { data: assetData, loading, error } = useSpaceAsset(item.assetId, item.assetType);

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
          useFrame: fiber.useFrame,
          useLoader: fiber.useLoader,
          useTexture: drei.useTexture,
          useGLTF: drei.useGLTF,
          Text: drei.Text,
          Html: drei.Html,
        });
      } catch (err) {
        console.error("SpaceItem failed to load R3F:", err);
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  // Calculate distance for LOD
  const distance = useMemo(() => {
    if (!cameraPosition) return 10;
    const dx = item.position[0] - cameraPosition[0];
    const dy = item.position[1] - cameraPosition[1];
    const dz = item.position[2] - cameraPosition[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }, [item.position, cameraPosition]);

  // LOD quality based on distance (enhanced with LOD manager)
  const lodQuality = useMemo(() => {
    if (lodManager) {
      const lodInfo = lodManager.calculateObjectLOD(item.position, cameraPosition);
      return lodInfo.lodLevel;
    }
    
    // Fallback to simple distance-based LOD
    return calculateLODLevel(distance);
  }, [distance, lodManager, item.position, cameraPosition]);

  const handleClick = () => {
    setSelected(!selected);
    onSelect?.(item);
  };

  const handlePointerOver = () => {
    setHovered(true);
    onHover?.(item);
  };

  const handlePointerOut = () => {
    setHovered(false);
    onHover?.(null);
  };

  if (!item.visible) return null;
  if (!r3f) return null; // Wait for R3F to load

  const { useTexture, useGLTF, Text, Html } = r3f;

  // Render different asset types
  const renderAssetContent = () => {
    if (loading) {
      return (
        <mesh>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#666" wireframe />
        </mesh>
      );
    }

    if (error) {
      return (
        <mesh>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="red" />
        </mesh>
      );
    }

    switch (item.assetType) {
      case 'image':
        return <ImageAsset assetData={assetData} lodQuality={lodQuality} useTexture={useTexture} />;
      
      case 'video':
        return <VideoAsset assetData={assetData} lodQuality={lodQuality} />;
      
      case 'object':
        return (
          <ObjectRenderer 
            assetData={assetData} 
            showComponents={item.objectProperties?.showComponents !== false}
            interactionLevel={item.objectProperties?.interactionLevel || 'object'}
            onComponentSelect={(component) => console.log('Component selected:', component)}
            onComponentHover={(component) => console.log('Component hovered:', component)}
          />
        );
      
      case 'object_collection':
        return (
          <CollectionRenderer 
            assetData={assetData}
            showComponents={item.objectProperties?.showComponents !== false}
            interactionLevel={item.objectProperties?.interactionLevel || 'collection'}
            useInstancing={true}
            onObjectSelect={(objectId) => console.log('Object selected:', objectId)}
            onObjectHover={(objectId) => console.log('Object hovered:', objectId)}
          />
        );
      
      case 'text':
        return <TextAsset assetData={assetData} Text={Text} />;
      
      default:
        return (
          <mesh>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#333" />
          </mesh>
        );
    }
  };

  // Apply hover/selection effects
  const effectScale = hovered ? 1.05 : 1;
  const effectColor = selected ? "#4ade80" : hovered ? "#60a5fa" : "#ffffff";

  return (
    <group
      ref={meshRef}
      position={item.position}
      rotation={item.rotation}
      scale={[item.scale[0] * effectScale, item.scale[1] * effectScale, item.scale[2] * effectScale]}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      {renderAssetContent()}
      
      {/* Selection outline */}
      {(selected || hovered) && (
        <mesh>
          <boxGeometry args={[1.1, 1.1, 1.1]} />
          <meshBasicMaterial color={effectColor} wireframe />
        </mesh>
      )}
      
      {/* Debug label */}
      {distance < 15 && (
        <Html position={[0, 1, 0]} center>
          <div className="bg-black/60 text-white text-xs px-1 py-0.5 rounded pointer-events-none">
            {item.assetType} | {lodQuality} | {distance.toFixed(1)}m
          </div>
        </Html>
      )}
    </group>
  );
}

// Asset-specific renderers
function ImageAsset({ assetData, lodQuality, useTexture }: any) {
  if (!assetData?.cloudflare_url) return null;
  
  // Don't render if hidden by LOD
  if (lodQuality === 'hidden') return null;
  
  // Construct LOD URL
  const getImageUrl = () => {
    const baseUrl = assetData.cloudflare_url;
    switch (lodQuality) {
      case 'low': return `${baseUrl}?w=64&h=64`;
      case 'medium': return `${baseUrl}?w=256&h=256`;
      case 'high': return `${baseUrl}?w=512&h=512`;
      case 'full': return `${baseUrl}?w=1024&h=1024`;
      default: return baseUrl;
    }
  };

  try {
    const texture = useTexture(getImageUrl());
    return (
      <mesh>
        <planeGeometry args={[2, 2]} />
        <meshStandardMaterial map={texture} transparent opacity={0.9} />
      </mesh>
    );
  } catch (error) {
    return (
      <mesh>
        <planeGeometry args={[2, 2]} />
        <meshStandardMaterial color="#666" />
      </mesh>
    );
  }
}

function VideoAsset({ assetData, lodQuality }: any) {
  // For now, render as a placeholder plane
  return (
    <mesh>
      <planeGeometry args={[2, 1.5]} />
      <meshStandardMaterial color="#444" />
    </mesh>
  );
}



function TextAsset({ assetData, Text }: any) {
  const content = assetData?.content || assetData?.title || "Text Asset";
  
  return (
    <Text
      fontSize={0.5}
      color="#ffffff"
      anchorX="center"
      anchorY="middle"
    >
      {content}
    </Text>
  );
}
