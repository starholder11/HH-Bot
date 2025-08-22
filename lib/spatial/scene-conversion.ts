/**
 * Scene Conversion Functions
 * Converts between SpaceAsset format and Three.js Scene format
 */

// Three.js Scene format interfaces
export interface ThreeJSScene {
  metadata: {
    version: number;
    type: string;
    generator: string;
  };
  geometries: any[];
  materials: any[];
  textures: any[];
  images: any[];
  object: {
    uuid: string;
    type: string;
    name: string;
    children: ThreeJSObject[];
  };
  userData: {
    spaceId: string;
    spaceType: string;
    environment: any;
    camera: any;
  };
}

export interface ThreeJSObject {
  uuid: string;
  type: string;
  name: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  geometry?: string;
  material?: string;
  visible?: boolean;
  userData: {
    spaceItemId: string;
    assetId: string;
    assetType: string;
    importMetadata?: any;
  };
}

// Placeholder for SpaceAsset type - will be properly defined in Task 1.1
interface SpaceAsset {
  id: string;
  title: string;
  space_type: string;
  space: {
    items: SpaceItem[];
    environment: any;
    camera: any;
  };
  updated_at: string;
}

interface SpaceItem {
  id: string;
  assetId: string;
  assetType: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  opacity?: number;
  visible?: boolean;
  importMetadata?: any;
}

/**
 * Convert SpaceAsset to Three.js Scene format
 */
export function convertSpaceToThreeJSScene(space: SpaceAsset): ThreeJSScene {
  // Handle different possible data structures
  const items = space.space?.items || space.items || [];
  
  console.log('[Scene Conversion] Converting space with items:', items);
  
  return {
    metadata: {
      version: 4.5,
      type: "Object",
      generator: "HH-Bot Spatial CMS"
    },
    geometries: [],
    materials: generateMaterialsFromSpace(space),
    textures: generateTexturesFromSpace(space),
    images: generateImagesFromSpace(space),
    object: {
      uuid: space.id,
      type: "Scene",
      name: space.title,
      children: items.map((item: any) => ({
        uuid: item.id,
        type: "Mesh",
        name: item.assetId || item.title || item.id,
        position: item.position || [0, 0, 0],
        rotation: item.rotation || [0, 0, 0],
        scale: item.scale || [1, 1, 1],
        geometry: generateGeometryForItem(item),
        material: generateMaterialForItem(item),
        visible: item.visible !== false,
        userData: {
          spaceItemId: item.id,
          assetId: item.assetId,
          assetType: item.assetType,
          mediaUrl: (item as any).mediaUrl,
          importMetadata: item.importMetadata
        }
      }))
    },
    userData: {
      spaceId: space.id,
      spaceType: space.space_type,
      environment: space.space?.environment,
      camera: space.space?.camera
    }
  };
}

/**
 * Convert Three.js Scene back to SpaceAsset format
 */
export function convertThreeJSSceneToSpace(scene: ThreeJSScene, existingSpace: SpaceAsset): SpaceAsset {
  console.log('[Scene Conversion] Converting Three.js scene to SpaceAsset:', scene);
  console.log('[Scene Conversion] Existing space:', existingSpace);
  
  if (!scene || !scene.object || !scene.object.children) {
    console.error('[Scene Conversion] Invalid scene structure:', scene);
    throw new Error('Invalid scene structure for conversion');
  }

  const items = scene.object.children.map(child => {
    console.log('[Scene Conversion] Processing child:', child);
    return {
      id: child.userData.spaceItemId || child.uuid,
      assetId: child.userData.assetId,
      assetType: child.userData.assetType || 'unknown',
      position: child.position ? [child.position.x, child.position.y, child.position.z] : [0, 0, 0],
      rotation: child.rotation ? [child.rotation.x, child.rotation.y, child.rotation.z] : [0, 0, 0],
      scale: child.scale ? [child.scale.x, child.scale.y, child.scale.z] : [1, 1, 1],
      opacity: 1, // TODO: Extract from material
      visible: child.visible !== false,
      importMetadata: child.userData.importMetadata
    };
  });

  console.log('[Scene Conversion] Converted items:', items);

  const result = {
    ...existingSpace,
    space: {
      ...existingSpace.space,
      items,
      environment: scene.userData.environment || existingSpace.space?.environment,
      camera: scene.userData.camera || existingSpace.space?.camera
    },
    updated_at: new Date().toISOString()
  };

  console.log('[Scene Conversion] Final result:', result);
  return result;
}

// Helper functions for material/texture generation
function generateMaterialsFromSpace(space: SpaceAsset): any[] {
  // TODO: Generate materials based on space items
  return [];
}

function generateTexturesFromSpace(space: SpaceAsset): any[] {
  // TODO: Generate textures based on space items
  return [];
}

function generateImagesFromSpace(space: SpaceAsset): any[] {
  // TODO: Generate images based on space items
  return [];
}

function generateGeometryForItem(item: SpaceItem): string {
  // TODO: Generate geometry reference based on item type
  switch (item.assetType) {
    case 'image':
    case 'video':
      return 'plane-geometry';
    case 'object':
      return 'gltf-geometry';
    case 'object_collection':
      return 'collection-geometry';
    default:
      return 'box-geometry';
  }
}

function generateMaterialForItem(item: SpaceItem): string {
  // TODO: Generate material reference based on item type
  switch (item.assetType) {
    case 'image':
    case 'video':
      return 'texture-material';
    case 'object':
      return 'gltf-material';
    case 'object_collection':
      return 'collection-material';
    default:
      return 'basic-material';
  }
}