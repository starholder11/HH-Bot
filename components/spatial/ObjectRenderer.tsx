"use client";
import { useRef, useState, useEffect, useMemo } from "react";

export interface ObjectComponent {
  id: string;
  objectId: string; // reference to another ObjectAsset
  transform: {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
  };
  role: string;
  required: boolean;
}

export interface ObjectAssetData {
  id: string;
  object_type: 'atomic' | 'composite';
  object: {
    modelUrl?: string;
    boundingBox: { min: [number, number, number]; max: [number, number, number] };
    components?: ObjectComponent[];
    materials?: Array<{ name: string; properties: Record<string, any> }>;
    category: string;
    subcategory?: string;
    style?: string;
    tags: string[];
  };
}

export interface ObjectRendererProps {
  assetData: ObjectAssetData;
  showComponents?: boolean;
  interactionLevel?: 'collection' | 'object' | 'component';
  onComponentSelect?: (component: ObjectComponent) => void;
  onComponentHover?: (component: ObjectComponent | null) => void;
}

export default function ObjectRenderer({
  assetData,
  showComponents = true,
  interactionLevel = 'object',
  onComponentSelect,
  onComponentHover,
}: ObjectRendererProps) {
  const groupRef = useRef<any>(null);
  const [r3f, setR3F] = useState<any>(null);
  const [hoveredComponent, setHoveredComponent] = useState<string | null>(null);
  const [selectedComponents, setSelectedComponents] = useState<Set<string>>(new Set());

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
          Text: drei.Text,
        });
      } catch (err) {
        console.error("ObjectRenderer failed to load R3F:", err);
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  const handleComponentClick = (component: ObjectComponent) => {
    if (interactionLevel === 'component') {
      const newSelection = new Set(selectedComponents);
      if (newSelection.has(component.id)) {
        newSelection.delete(component.id);
      } else {
        newSelection.add(component.id);
      }
      setSelectedComponents(newSelection);
      onComponentSelect?.(component);
    }
  };

  const handleComponentHover = (component: ObjectComponent | null) => {
    if (interactionLevel === 'component') {
      setHoveredComponent(component?.id || null);
      onComponentHover?.(component);
    }
  };

  if (!r3f) return null;

  const { useGLTF, Clone, Text } = r3f;

  // Render atomic object (single model)
  if (assetData.object_type === 'atomic') {
    return <AtomicObjectRenderer assetData={assetData} useGLTF={useGLTF} />;
  }

  // Render composite object (multiple components)
  return (
    <group ref={groupRef}>
      {/* Main object model if it has one */}
      {assetData.object.modelUrl && (
        <AtomicObjectRenderer assetData={assetData} useGLTF={useGLTF} />
      )}

      {/* Render components if showComponents is enabled */}
      {showComponents && assetData.object.components?.map((component) => (
        <group
          key={component.id}
          position={component.transform.position}
          rotation={component.transform.rotation}
          scale={component.transform.scale}
          onClick={() => handleComponentClick(component)}
          onPointerOver={() => handleComponentHover(component)}
          onPointerOut={() => handleComponentHover(null)}
        >
          {/* Component placeholder - in real implementation, this would load the referenced object */}
          <mesh>
            <boxGeometry args={[0.5, 0.5, 0.5]} />
            <meshStandardMaterial 
              color={
                selectedComponents.has(component.id) ? "#4ade80" :
                hoveredComponent === component.id ? "#60a5fa" :
                component.required ? "#f59e0b" : "#6b7280"
              }
              wireframe={!component.required}
            />
          </mesh>

          {/* Component label */}
          {interactionLevel === 'component' && Text && (
            <Text
              position={[0, 0.8, 0]}
              fontSize={0.15}
              color="#fff"
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.01}
              outlineColor="#000"
            >
              {component.role}
            </Text>
          )}
        </group>
      ))}

      {/* Bounding box visualization */}
      {showComponents && (
        <mesh>
          <boxGeometry args={[
            assetData.object.boundingBox.max[0] - assetData.object.boundingBox.min[0],
            assetData.object.boundingBox.max[1] - assetData.object.boundingBox.min[1],
            assetData.object.boundingBox.max[2] - assetData.object.boundingBox.min[2],
          ]} />
          <meshBasicMaterial color="#ffffff" wireframe opacity={0.2} transparent />
        </mesh>
      )}
    </group>
  );
}

// Atomic object renderer
function AtomicObjectRenderer({ assetData, useGLTF }: any) {
  if (!assetData.object.modelUrl) {
    // Fallback to category-based placeholder
    const color = getCategoryColor(assetData.object.category);
    return (
      <mesh>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={color} />
      </mesh>
    );
  }

  try {
    const { scene } = useGLTF(assetData.object.modelUrl);
    return <primitive object={scene.clone()} />;
  } catch (error) {
    console.error("Failed to load glTF model:", error);
    const color = getCategoryColor(assetData.object.category);
    return (
      <mesh>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={color} />
      </mesh>
    );
  }
}

// Category-based color coding
function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    'furniture': '#8B4513',
    'lighting': '#FFD700',
    'electronics': '#4169E1',
    'props': '#32CD32',
    'architectural': '#708090',
    'toys': '#FF69B4',
    'vehicles': '#DC143C',
    'nature': '#228B22',
    'tools': '#B22222',
    'default': '#696969',
  };
  
  return colors[category.toLowerCase()] || colors.default;
}
