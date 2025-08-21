/**
 * 2D → 3D Coordinate Transformation
 * 
 * Transforms 2D layout coordinates to 3D space coordinates following
 * the exact formulas from PHASE 3: SPATIAL WORK.md lines 1005-1021
 */

export interface LayoutItem {
  id: string;
  x: number;      // Pixel X position (left)
  y: number;      // Pixel Y position (top)
  w: number;      // Pixel width
  h: number;      // Pixel height
  nx?: number;    // Normalized X (0-1)
  ny?: number;    // Normalized Y (0-1)
  nw?: number;    // Normalized width (0-1)
  nh?: number;    // Normalized height (0-1)
  refId?: string; // Reference to media asset
  contentType: string;
  opacity?: number;
}

export interface LayoutDesignSize {
  width: number;  // Layout width in pixels
  height: number; // Layout height in pixels
}

export interface SpaceItem {
  id: string;
  assetId: string;
  assetType: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  opacity?: number;
  visible?: boolean;
  importMetadata?: {
    originalLayoutId?: string;
    originalItemId?: string;
    originalPosition?: { x: number; y: number };
    originalDimensions?: { w: number; h: number };
    importTimestamp?: string;
  };
}

export interface TransformConfig {
  floorSize: number;          // World floor size in meters (width)
  itemHeight?: number;        // Base height above floor (meters)
  thickness?: number;         // Item thickness (meters)
  preserveAspectRatio?: boolean;
}

export interface TransformResult {
  spaceItems: SpaceItem[];
  transformationMatrix: number[];
  originalBounds: { width: number; height: number };
  scaleFactor: number;
  floorDimensions: { width: number; depth: number };
}

const DEFAULT_CONFIG: TransformConfig = {
  floorSize: 20,
  itemHeight: 0.1,
  thickness: 0.01,
  preserveAspectRatio: true,
};

/**
 * Transform 2D layout coordinates to 3D space coordinates
 * Following exact formulas from spec lines 1005-1021
 */
export function transformLayoutToSpace(
  items: LayoutItem[],
  designSize: LayoutDesignSize,
  config: Partial<TransformConfig> = {},
  layoutId?: string
): TransformResult {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  
  // Calculate floor dimensions (preserve aspect ratio)
  const aspectRatio = designSize.height / designSize.width;
  const floorWidth = finalConfig.floorSize;
  const floorDepth = finalConfig.preserveAspectRatio 
    ? floorWidth * aspectRatio 
    : finalConfig.floorSize;

  // Calculate scale factor for transformation matrix
  const scaleFactor = Math.min(
    floorWidth / designSize.width,
    floorDepth / designSize.height
  );

  // Transform each layout item to 3D space
  const spaceItems: SpaceItem[] = items.map((item, index) => {
    const transform = calculateItemTransform(item, designSize, {
      floorWidth,
      floorDepth,
      itemHeight: finalConfig.itemHeight!,
      thickness: finalConfig.thickness!,
    });

    return {
      id: `space_item_${item.id}_${index}`,
      assetId: item.refId || item.id,
      assetType: item.contentType,
      position: transform.position,
      rotation: transform.rotation,
      scale: transform.scale,
      opacity: item.opacity || 1,
      visible: true,
      importMetadata: {
        originalLayoutId: layoutId,
        originalItemId: item.id,
        originalPosition: { x: item.x, y: item.y },
        originalDimensions: { w: item.w, h: item.h },
        importTimestamp: new Date().toISOString(),
      },
    };
  });

  return {
    spaceItems,
    transformationMatrix: createTransformationMatrix(scaleFactor, floorWidth, floorDepth),
    originalBounds: { width: designSize.width, height: designSize.height },
    scaleFactor,
    floorDimensions: { width: floorWidth, depth: floorDepth },
  };
}

/**
 * Calculate 3D transform for a single layout item
 * Using exact formulas from spec lines 1005-1021
 */
export function calculateItemTransform(
  item: LayoutItem,
  designSize: LayoutDesignSize,
  floorConfig: {
    floorWidth: number;
    floorDepth: number;
    itemHeight: number;
    thickness: number;
  }
): {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
} {
  const { floorWidth, floorDepth, itemHeight, thickness } = floorConfig;
  const { width: Wpx, height: Hpx } = designSize;
  const Wm = floorWidth;
  const Dm = floorDepth;

  // Use normalized fields if available, otherwise calculate from pixels
  let nx: number, ny: number, nw: number, nh: number;
  
  if (item.nx !== undefined && item.ny !== undefined && 
      item.nw !== undefined && item.nh !== undefined) {
    // Use existing normalized coordinates
    nx = item.nx + item.nw / 2; // Center X
    ny = item.ny + item.nh / 2; // Center Y
    nw = item.nw;
    nh = item.nh;
  } else {
    // Calculate from pixel coordinates
    const cx = item.x + item.w / 2; // Center in pixels
    const cy = item.y + item.h / 2;
    
    nx = cx / Wpx; // Normalized center X
    ny = cy / Hpx; // Normalized center Y
    nw = item.w / Wpx; // Normalized width
    nh = item.h / Hpx; // Normalized height
  }

  // World position using spec formulas (lines 1009-1012)
  const posX = (nx - 0.5) * Wm;
  const posZ = (0.5 - ny) * Dm;  // Invert Y because layout Y grows downward
  const posY = itemHeight;

  // World scale using spec formulas (lines 1013-1016)
  const scaleX = nw * Wm;
  const scaleZ = nh * Dm;
  const scaleY = thickness;

  return {
    position: [posX, posY, posZ],
    rotation: [0, 0, 0], // No rotation for basic import
    scale: [scaleX, scaleY, scaleZ],
  };
}

/**
 * Create transformation matrix for the import
 */
export function createTransformationMatrix(
  scaleFactor: number,
  floorWidth: number,
  floorDepth: number
): number[] {
  // 4x4 transformation matrix (column-major order)
  return [
    scaleFactor, 0, 0, 0,
    0, scaleFactor, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ];
}

/**
 * Test vectors from spec lines 1025-1061 for validation
 */
export const TEST_VECTORS = [
  {
    name: "Case A: Centered item in 1440×1024 layout",
    designSize: { width: 1440, height: 1024 },
    floorSize: 20,
    item: {
      id: "test-a",
      x: 576,
      y: 409.5,
      w: 288,
      h: 205,
      contentType: "image",
    },
    expected: {
      position: [0, 0.1, 0],
      scale: [4.0, 0.01, 2.844444444444444],
    },
  },
  {
    name: "Case B: Top-left 10% tile",
    designSize: { width: 1440, height: 1024 },
    floorSize: 20,
    item: {
      id: "test-b",
      x: 0,
      y: 0,
      w: 144,
      h: 102,
      contentType: "image",
    },
    expected: {
      position: [-9, 0.1, 6.40278],
      scale: [2.0, 0.01, 1.41667],
    },
  },
  {
    name: "Case C: Bottom-right 10% tile",
    designSize: { width: 1440, height: 1024 },
    floorSize: 20,
    item: {
      id: "test-c",
      x: 1296,
      y: 922,
      w: 144,
      h: 102,
      contentType: "image",
    },
    expected: {
      position: [9, 0.1, -6.40278],
      scale: [2.0, 0.01, 1.41667],
    },
  },
  {
    name: "Case D: Non-square layout 1920×1080, 25% centered",
    designSize: { width: 1920, height: 1080 },
    floorSize: 20,
    item: {
      id: "test-d",
      x: 720,
      y: 405,
      w: 480,
      h: 270,
      contentType: "image",
    },
    expected: {
      position: [0, 0.1, 0],
      scale: [5.0, 0.01, 2.8125],
    },
  },
  {
    name: "Case E: Banner in wide layout 2000×500",
    designSize: { width: 2000, height: 500 },
    floorSize: 20,
    item: {
      id: "test-e",
      x: 0,
      y: 0,
      w: 2000,
      h: 100,
      contentType: "image",
    },
    expected: {
      position: [0, 0.1, 2],
      scale: [20, 0.01, 1],
    },
  },
] as const;
