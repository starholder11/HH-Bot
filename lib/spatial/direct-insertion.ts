/**
 * Direct Insertion Workflows
 * 
 * Handles direct insertion of objects and collections into layouts and spaces
 * without going through the import/export workflow
 */

import { generateLayoutItemIcon } from '@/utils/spatial/icon-generation';
import { getMediaAsset, saveMediaAsset } from '../media-storage';
import type { LayoutAsset, SpaceAsset, ObjectAsset, ObjectCollection } from '../media-storage';

export interface InsertionPosition {
  x: number;
  y: number;
  z?: number; // For 3D spaces
}

export interface InsertionConfig {
  // For layout insertion
  iconStyle?: 'outline' | 'filled' | 'isometric' | 'top-down';
  iconSize?: { width: number; height: number };
  showLabel?: boolean;
  
  // For space insertion
  defaultScale?: [number, number, number];
  defaultRotation?: [number, number, number];
  snapToFloor?: boolean;
  
  // Common
  generateId?: boolean;
}

export interface InsertionResult {
  success: boolean;
  itemId: string;
  assetId: string;
  position: InsertionPosition;
  metadata: {
    insertionType: 'layout' | 'space';
    assetType: 'object' | 'object_collection';
    timestamp: string;
  };
}

const DEFAULT_CONFIG: InsertionConfig = {
  iconStyle: 'outline',
  iconSize: { width: 64, height: 64 },
  showLabel: true,
  defaultScale: [1, 1, 1],
  defaultRotation: [0, 0, 0],
  snapToFloor: true,
  generateId: true,
};

/**
 * Add object to layout as 2D icon
 */
export async function addObjectToLayout(
  layoutId: string,
  objectId: string,
  objectType: 'object' | 'object_collection',
  position: InsertionPosition,
  config: InsertionConfig = {}
): Promise<InsertionResult> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  // 1. Load layout
  const layout = await getMediaAsset(layoutId);
  if (!layout || layout.media_type !== 'layout') {
    throw new Error(`Layout not found: ${layoutId}`);
  }

  // 2. Load object/collection
  const objectAsset = await getMediaAsset(objectId);
  if (!objectAsset || (objectAsset.media_type !== 'object' && objectAsset.media_type !== 'object_collection')) {
    throw new Error(`Object not found: ${objectId}`);
  }

  // 3. Generate 2D icon
  const icon = generateLayoutItemIcon(objectType, objectAsset, {
    width: finalConfig.iconSize!.width,
    height: finalConfig.iconSize!.height,
    style: finalConfig.iconStyle,
    showLabel: finalConfig.showLabel,
  });

  // 4. Calculate layout coordinates
  const layoutData = (layout as any).layout_data || (layout as any).layout;
  const designSize = layoutData.designSize || { width: 1440, height: 1024 };
  
  const itemWidth = finalConfig.iconSize!.width;
  const itemHeight = finalConfig.iconSize!.height;
  
  // Calculate normalized coordinates
  const nx = position.x / designSize.width;
  const ny = position.y / designSize.height;
  const nw = itemWidth / designSize.width;
  const nh = itemHeight / designSize.height;

  // 5. Create layout item
  const itemId = finalConfig.generateId 
    ? `${objectType}_${objectId}_${Date.now()}`
    : `${objectType}_${objectId}`;

  const newItem = {
    id: itemId,
    type: 'content_ref' as const,
    x: position.x,
    y: position.y,
    w: itemWidth,
    h: itemHeight,
    nx,
    ny,
    nw,
    nh,
    refId: objectId,
    contentType: objectType,
    snippet: (objectAsset as any).filename || `${objectType} asset`,
    objectLayoutProperties: {
      iconUrl: icon.iconUrl,
      previewUrl: icon.previewUrl,
      boundingBox2D: icon.boundingBox2D,
      showLabel: finalConfig.showLabel!,
      category: (objectAsset as any).object?.category || (objectAsset as any).collection?.category,
      subcategory: (objectAsset as any).object?.subcategory || (objectAsset as any).collection?.style,
    },
  };

  // 6. Update layout
  const updatedLayout = {
    ...layout,
    layout_data: {
      ...layoutData,
      items: [...(layoutData.items || []), newItem],
    },
    metadata: {
      ...(layout as any).metadata,
      item_count: ((layout as any).metadata?.item_count || 0) + 1,
    },
    updated_at: new Date().toISOString(),
  };

  // 7. Save layout
  await saveMediaAsset(updatedLayout);

  return {
    success: true,
    itemId,
    assetId: objectId,
    position,
    metadata: {
      insertionType: 'layout',
      assetType: objectType,
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Add object to space as 3D model
 */
export async function addObjectToSpace(
  spaceId: string,
  objectId: string,
  objectType: 'object' | 'object_collection',
  position: InsertionPosition,
  config: InsertionConfig = {}
): Promise<InsertionResult> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  // 1. Load space
  const space = await getMediaAsset(spaceId);
  if (!space || space.media_type !== 'space') {
    throw new Error(`Space not found: ${spaceId}`);
  }

  // 2. Load object/collection
  const objectAsset = await getMediaAsset(objectId);
  if (!objectAsset || (objectAsset.media_type !== 'object' && objectAsset.media_type !== 'object_collection')) {
    throw new Error(`Object not found: ${objectId}`);
  }

  // 3. Calculate 3D positioning
  const spacePosition: [number, number, number] = [
    position.x,
    finalConfig.snapToFloor ? 0 : (position.y || 0),
    position.z || 0,
  ];

  // 4. Create space item
  const itemId = finalConfig.generateId 
    ? `${objectType}_${objectId}_${Date.now()}`
    : `${objectType}_${objectId}`;

  const newItem = {
    id: itemId,
    assetId: objectId,
    assetType: objectType,
    position: spacePosition,
    rotation: finalConfig.defaultRotation!,
    scale: finalConfig.defaultScale!,
    opacity: 1,
    visible: true,
    clickable: true,
    hoverEffect: 'glow' as const,
    objectProperties: {
      showComponents: true,
      interactionLevel: 'object' as const,
      lodLevel: 1,
      physics: { enabled: false },
    },
  };

  // 5. Update space
  const updatedSpace = {
    ...space,
    space: {
      ...(space as SpaceAsset).space,
      items: [...(space as SpaceAsset).space.items, newItem],
    },
    metadata: {
      ...(space as any).metadata,
      item_count: ((space as any).metadata?.item_count || 0) + 1,
    },
    updated_at: new Date().toISOString(),
  };

  // 6. Save space
  await saveMediaAsset(updatedSpace);

  return {
    success: true,
    itemId,
    assetId: objectId,
    position,
    metadata: {
      insertionType: 'space',
      assetType: objectType,
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Calculate smart default position for insertion
 */
export function calculateDefaultPosition(
  targetType: 'layout' | 'space',
  targetData: any, // LayoutAsset or SpaceAsset
  objectData: any, // ObjectAsset or ObjectCollection
  existingItems: any[]
): InsertionPosition {
  if (targetType === 'layout') {
    return calculateLayoutDefaultPosition(targetData, objectData, existingItems);
  } else {
    return calculateSpaceDefaultPosition(targetData, objectData, existingItems);
  }
}

/**
 * Calculate default position in layout (avoid overlaps)
 */
function calculateLayoutDefaultPosition(
  layout: any,
  objectData: any,
  existingItems: any[]
): InsertionPosition {
  const designSize = layout.layout_data?.designSize || layout.layout?.designSize || { width: 1440, height: 1024 };
  const iconSize = 64; // Default icon size
  
  // Try to place in a grid pattern, avoiding existing items
  const gridCols = Math.floor(designSize.width / (iconSize + 20));
  const gridRows = Math.floor(designSize.height / (iconSize + 20));
  
  const occupiedPositions = new Set(
    existingItems.map(item => `${Math.floor(item.x / (iconSize + 20))},${Math.floor(item.y / (iconSize + 20))}`)
  );

  // Find first available grid position
  for (let row = 0; row < gridRows; row++) {
    for (let col = 0; col < gridCols; col++) {
      const gridKey = `${col},${row}`;
      if (!occupiedPositions.has(gridKey)) {
        return {
          x: col * (iconSize + 20) + 10,
          y: row * (iconSize + 20) + 10,
        };
      }
    }
  }

  // Fallback to random position if grid is full
  return {
    x: Math.random() * (designSize.width - iconSize),
    y: Math.random() * (designSize.height - iconSize),
  };
}

/**
 * Calculate default position in space (avoid overlaps)
 */
function calculateSpaceDefaultPosition(
  space: any,
  objectData: any,
  existingItems: any[]
): InsertionPosition {
  const spaceData = space.space;
  const boundingBox = objectData.object?.boundingBox || objectData.collection?.boundingBox;
  
  // Calculate object footprint
  const objectSize = boundingBox ? {
    width: boundingBox.max[0] - boundingBox.min[0],
    depth: boundingBox.max[2] - boundingBox.min[2],
  } : { width: 1, depth: 1 };

  // Try to place in a spiral pattern around origin
  const spiralRadius = 2;
  const maxAttempts = 20;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const angle = (attempt / maxAttempts) * Math.PI * 2;
    const radius = spiralRadius + (attempt * 0.5);
    
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    
    // Check for overlaps with existing items
    const hasOverlap = existingItems.some(item => {
      const distance = Math.sqrt(
        Math.pow(item.position[0] - x, 2) + 
        Math.pow(item.position[2] - z, 2)
      );
      return distance < (objectSize.width + 1); // 1m buffer
    });

    if (!hasOverlap) {
      return { x, y: 0, z };
    }
  }

  // Fallback to random position
  return {
    x: (Math.random() - 0.5) * 20,
    y: 0,
    z: (Math.random() - 0.5) * 20,
  };
}

/**
 * Batch insert multiple objects
 */
export async function batchInsertObjects(
  targetId: string,
  targetType: 'layout' | 'space',
  objects: Array<{
    objectId: string;
    objectType: 'object' | 'object_collection';
    position?: InsertionPosition;
    config?: InsertionConfig;
  }>
): Promise<{
  results: InsertionResult[];
  errors: Array<{ objectId: string; error: string }>;
  summary: {
    successful: number;
    failed: number;
  };
}> {
  const results: InsertionResult[] = [];
  const errors: Array<{ objectId: string; error: string }> = [];

  for (const obj of objects) {
    try {
      let result: InsertionResult;
      
      if (targetType === 'layout') {
        result = await addObjectToLayout(
          targetId,
          obj.objectId,
          obj.objectType,
          obj.position || { x: 0, y: 0 },
          obj.config
        );
      } else {
        result = await addObjectToSpace(
          targetId,
          obj.objectId,
          obj.objectType,
          obj.position || { x: 0, y: 0, z: 0 },
          obj.config
        );
      }
      
      results.push(result);
    } catch (error) {
      errors.push({
        objectId: obj.objectId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return {
    results,
    errors,
    summary: {
      successful: results.length,
      failed: errors.length,
    },
  };
}

/**
 * Remove object from layout or space
 */
export async function removeObjectFromTarget(
  targetId: string,
  targetType: 'layout' | 'space',
  itemId: string
): Promise<{
  success: boolean;
  removedItem?: any;
}> {
  // Load target asset
  const target = await getMediaAsset(targetId);
  if (!target) {
    throw new Error(`${targetType} not found: ${targetId}`);
  }

  if (targetType === 'layout' && target.media_type === 'layout') {
    // Remove from layout
    const layoutData = (target as any).layout_data || (target as any).layout;
    const items = layoutData.items || [];
    const itemIndex = items.findIndex((item: any) => item.id === itemId);
    
    if (itemIndex === -1) {
      return { success: false };
    }

    const removedItem = items[itemIndex];
    const updatedItems = items.filter((_: any, index: number) => index !== itemIndex);

    const updatedLayout = {
      ...target,
      layout_data: {
        ...layoutData,
        items: updatedItems,
      },
      metadata: {
        ...(target as any).metadata,
        item_count: Math.max(0, ((target as any).metadata?.item_count || 1) - 1),
      },
      updated_at: new Date().toISOString(),
    };

    await saveMediaAsset(updatedLayout);
    
    return { success: true, removedItem };

  } else if (targetType === 'space' && target.media_type === 'space') {
    // Remove from space
    const spaceData = (target as SpaceAsset).space;
    const items = spaceData.items || [];
    const itemIndex = items.findIndex(item => item.id === itemId);
    
    if (itemIndex === -1) {
      return { success: false };
    }

    const removedItem = items[itemIndex];
    const updatedItems = items.filter((_, index) => index !== itemIndex);

    const updatedSpace = {
      ...target,
      space: {
        ...spaceData,
        items: updatedItems,
      },
      metadata: {
        ...(target as any).metadata,
        item_count: Math.max(0, ((target as any).metadata?.item_count || 1) - 1),
      },
      updated_at: new Date().toISOString(),
    };

    await saveMediaAsset(updatedSpace);
    
    return { success: true, removedItem };
  }

  throw new Error(`Invalid target type or media type mismatch`);
}

/**
 * Move object within layout or space
 */
export async function moveObjectInTarget(
  targetId: string,
  targetType: 'layout' | 'space',
  itemId: string,
  newPosition: InsertionPosition
): Promise<{
  success: boolean;
  updatedItem?: any;
}> {
  // Load target asset
  const target = await getMediaAsset(targetId);
  if (!target) {
    throw new Error(`${targetType} not found: ${targetId}`);
  }

  if (targetType === 'layout' && target.media_type === 'layout') {
    // Update position in layout
    const layoutData = (target as any).layout_data || (target as any).layout;
    const items = layoutData.items || [];
    const itemIndex = items.findIndex((item: any) => item.id === itemId);
    
    if (itemIndex === -1) {
      return { success: false };
    }

    const designSize = layoutData.designSize || { width: 1440, height: 1024 };
    const item = items[itemIndex];
    
    // Update coordinates
    const updatedItem = {
      ...item,
      x: newPosition.x,
      y: newPosition.y,
      nx: newPosition.x / designSize.width,
      ny: newPosition.y / designSize.height,
    };

    const updatedItems = [...items];
    updatedItems[itemIndex] = updatedItem;

    const updatedLayout = {
      ...target,
      layout_data: {
        ...layoutData,
        items: updatedItems,
      },
      updated_at: new Date().toISOString(),
    };

    await saveMediaAsset(updatedLayout);
    
    return { success: true, updatedItem };

  } else if (targetType === 'space' && target.media_type === 'space') {
    // Update position in space
    const spaceData = (target as SpaceAsset).space;
    const items = spaceData.items || [];
    const itemIndex = items.findIndex(item => item.id === itemId);
    
    if (itemIndex === -1) {
      return { success: false };
    }

    const item = items[itemIndex];
    
    // Update 3D coordinates
    const updatedItem = {
      ...item,
      position: [newPosition.x, newPosition.y || item.position[1], newPosition.z || item.position[2]] as [number, number, number],
    };

    const updatedItems = [...items];
    updatedItems[itemIndex] = updatedItem;

    const updatedSpace = {
      ...target,
      space: {
        ...spaceData,
        items: updatedItems,
      },
      updated_at: new Date().toISOString(),
    };

    await saveMediaAsset(updatedSpace);
    
    return { success: true, updatedItem };
  }

  throw new Error(`Invalid target type or media type mismatch`);
}

/**
 * Validate insertion position doesn't overlap with existing items
 */
export function validateInsertionPosition(
  position: InsertionPosition,
  targetType: 'layout' | 'space',
  targetData: any,
  objectData: any,
  existingItems: any[]
): {
  valid: boolean;
  conflicts: string[];
  suggestions?: InsertionPosition[];
} {
  const conflicts: string[] = [];
  
  if (targetType === 'layout') {
    // Check for overlaps in 2D
    const iconSize = 64; // Default icon size
    
    existingItems.forEach(item => {
      const overlap = !(
        position.x + iconSize < item.x ||
        position.x > item.x + item.w ||
        position.y + iconSize < item.y ||
        position.y > item.y + item.h
      );
      
      if (overlap) {
        conflicts.push(`Overlaps with item ${item.id}`);
      }
    });
  } else {
    // Check for overlaps in 3D
    const objectSize = objectData.object?.boundingBox || objectData.collection?.boundingBox;
    const radius = objectSize ? 
      Math.max(
        objectSize.max[0] - objectSize.min[0],
        objectSize.max[2] - objectSize.min[2]
      ) / 2 : 1;

    existingItems.forEach(item => {
      const distance = Math.sqrt(
        Math.pow(position.x - item.position[0], 2) +
        Math.pow((position.z || 0) - item.position[2], 2)
      );
      
      if (distance < radius + 1) { // 1m buffer
        conflicts.push(`Too close to item ${item.id}`);
      }
    });
  }

  return {
    valid: conflicts.length === 0,
    conflicts,
    // Could add position suggestions here
  };
}
