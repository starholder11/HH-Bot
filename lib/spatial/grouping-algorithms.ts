/**
 * Grouping Algorithms for Layout-to-Space Conversion
 * 
 * Implements various strategies for organizing 2D layout items in 3D space
 */

import { SpaceItem } from './coordinate-transform';

export type GroupingStrategy = 'flat' | 'clustered' | 'elevated' | 'timeline' | 'grid';

export interface GroupingConfig {
  strategy: GroupingStrategy;
  clusterRadius?: number;     // Radius for clustered grouping
  elevationStep?: number;     // Height step for elevated grouping
  timelineSpacing?: number;   // Spacing for timeline grouping
  gridSpacing?: number;       // Spacing for grid grouping
  maxItemsPerCluster?: number; // Maximum items per cluster
}

export interface SpaceGroup {
  id: string;
  items: SpaceItem[];
  centerPosition: [number, number, number];
  boundingBox: {
    min: [number, number, number];
    max: [number, number, number];
  };
  groupType: string;
}

const DEFAULT_CONFIG: GroupingConfig = {
  strategy: 'flat',
  clusterRadius: 3,
  elevationStep: 0.5,
  timelineSpacing: 2,
  gridSpacing: 1.5,
  maxItemsPerCluster: 8,
};

/**
 * Apply grouping strategy to space items
 */
export function applyGroupingStrategy(
  items: SpaceItem[],
  config: Partial<GroupingConfig> = {}
): SpaceItem[] {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  
  switch (finalConfig.strategy) {
    case 'flat':
      return applyFlatGrouping(items);
    
    case 'clustered':
      return applyClusteredGrouping(items, finalConfig);
    
    case 'elevated':
      return applyElevatedGrouping(items, finalConfig);
    
    case 'timeline':
      return applyTimelineGrouping(items, finalConfig);
    
    case 'grid':
      return applyGridGrouping(items, finalConfig);
    
    default:
      return items;
  }
}

/**
 * Flat grouping - keep original positions (default)
 */
export function applyFlatGrouping(items: SpaceItem[]): SpaceItem[] {
  return items.map(item => ({
    ...item,
    groupId: 'flat_layout',
  }));
}

/**
 * Clustered grouping - group nearby items together
 */
export function applyClusteredGrouping(
  items: SpaceItem[],
  config: GroupingConfig
): SpaceItem[] {
  const clusters = createClusters(items, config.clusterRadius!, config.maxItemsPerCluster!);
  const processedItems: SpaceItem[] = [];

  clusters.forEach((cluster, clusterIndex) => {
    const clusterCenter = calculateClusterCenter(cluster.items);
    
    cluster.items.forEach((item, itemIndex) => {
      // Offset items within cluster
      const angle = (itemIndex / cluster.items.length) * Math.PI * 2;
      const radius = Math.min(1, cluster.items.length * 0.2);
      
      const offsetX = Math.cos(angle) * radius;
      const offsetZ = Math.sin(angle) * radius;
      
      processedItems.push({
        ...item,
        position: [
          item.position[0] + offsetX,
          item.position[1],
          item.position[2] + offsetZ,
        ],
        groupId: `cluster_${clusterIndex}`,
      });
    });
  });

  return processedItems;
}

/**
 * Elevated grouping - arrange items at different heights
 */
export function applyElevatedGrouping(
  items: SpaceItem[],
  config: GroupingConfig
): SpaceItem[] {
  // Sort items by size (larger items lower)
  const sortedItems = [...items].sort((a, b) => {
    const aSize = a.scale[0] * a.scale[2]; // X * Z footprint
    const bSize = b.scale[0] * b.scale[2];
    return bSize - aSize; // Descending
  });

  return sortedItems.map((item, index) => ({
    ...item,
    position: [
      item.position[0],
      item.position[1] + (index * config.elevationStep!),
      item.position[2],
    ],
    groupId: `elevation_${Math.floor(index / 3)}`, // Group every 3 items
  }));
}

/**
 * Timeline grouping - arrange items in chronological order
 */
export function applyTimelineGrouping(
  items: SpaceItem[],
  config: GroupingConfig
): SpaceItem[] {
  // Sort by creation time or position
  const sortedItems = [...items].sort((a, b) => {
    const aTime = a.importMetadata?.importTimestamp || '0';
    const bTime = b.importMetadata?.importTimestamp || '0';
    return aTime.localeCompare(bTime);
  });

  return sortedItems.map((item, index) => {
    const timelineX = (index - sortedItems.length / 2) * config.timelineSpacing!;
    
    return {
      ...item,
      position: [
        timelineX,
        item.position[1],
        0, // All on center line
      ],
      groupId: `timeline_segment_${Math.floor(index / 5)}`,
    };
  });
}

/**
 * Grid grouping - arrange items in a regular grid
 */
export function applyGridGrouping(
  items: SpaceItem[],
  config: GroupingConfig
): SpaceItem[] {
  const gridSize = Math.ceil(Math.sqrt(items.length));
  const spacing = config.gridSpacing!;
  
  return items.map((item, index) => {
    const row = Math.floor(index / gridSize);
    const col = index % gridSize;
    
    const gridX = (col - gridSize / 2) * spacing;
    const gridZ = (row - gridSize / 2) * spacing;
    
    return {
      ...item,
      position: [gridX, item.position[1], gridZ],
      groupId: `grid_${row}_${col}`,
    };
  });
}

/**
 * Create clusters of nearby items using simple distance-based clustering
 */
function createClusters(
  items: SpaceItem[],
  clusterRadius: number,
  maxItemsPerCluster: number
): SpaceGroup[] {
  const clusters: SpaceGroup[] = [];
  const unassigned = [...items];

  while (unassigned.length > 0) {
    const seed = unassigned.shift()!;
    const clusterItems = [seed];
    
    // Find nearby items
    for (let i = unassigned.length - 1; i >= 0; i--) {
      if (clusterItems.length >= maxItemsPerCluster) break;
      
      const item = unassigned[i];
      const distance = calculateDistance(seed.position, item.position);
      
      if (distance <= clusterRadius) {
        clusterItems.push(item);
        unassigned.splice(i, 1);
      }
    }
    
    clusters.push({
      id: `cluster_${clusters.length}`,
      items: clusterItems,
      centerPosition: calculateClusterCenter(clusterItems),
      boundingBox: calculateBoundingBox(clusterItems),
      groupType: 'cluster',
    });
  }

  return clusters;
}

/**
 * Calculate center position of a cluster
 */
function calculateClusterCenter(items: SpaceItem[]): [number, number, number] {
  if (items.length === 0) return [0, 0, 0];
  
  const sum = items.reduce(
    (acc, item) => [
      acc[0] + item.position[0],
      acc[1] + item.position[1],
      acc[2] + item.position[2],
    ],
    [0, 0, 0]
  );
  
  return [
    sum[0] / items.length,
    sum[1] / items.length,
    sum[2] / items.length,
  ];
}

/**
 * Calculate bounding box for a group of items
 */
function calculateBoundingBox(items: SpaceItem[]): {
  min: [number, number, number];
  max: [number, number, number];
} {
  if (items.length === 0) {
    return { min: [0, 0, 0], max: [0, 0, 0] };
  }

  const positions = items.map(item => item.position);
  
  return {
    min: [
      Math.min(...positions.map(p => p[0])),
      Math.min(...positions.map(p => p[1])),
      Math.min(...positions.map(p => p[2])),
    ],
    max: [
      Math.max(...positions.map(p => p[0])),
      Math.max(...positions.map(p => p[1])),
      Math.max(...positions.map(p => p[2])),
    ],
  };
}

/**
 * Calculate distance between two 3D points
 */
function calculateDistance(
  pos1: [number, number, number],
  pos2: [number, number, number]
): number {
  const dx = pos1[0] - pos2[0];
  const dy = pos1[1] - pos2[1];
  const dz = pos1[2] - pos2[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Analyze layout for optimal grouping strategy
 */
export function analyzeLayoutForGrouping(items: SpaceItem[]): {
  recommendedStrategy: GroupingStrategy;
  confidence: number;
  reasoning: string;
} {
  const itemCount = items.length;
  const density = calculateLayoutDensity(items);
  const spread = calculateLayoutSpread(items);
  
  // Simple heuristics for strategy recommendation
  if (itemCount <= 5) {
    return {
      recommendedStrategy: 'flat',
      confidence: 0.9,
      reasoning: 'Few items work best with flat layout',
    };
  }
  
  if (density > 0.7 && itemCount > 10) {
    return {
      recommendedStrategy: 'clustered',
      confidence: 0.8,
      reasoning: 'High density layout benefits from clustering',
    };
  }
  
  if (spread > 15 && itemCount > 8) {
    return {
      recommendedStrategy: 'elevated',
      confidence: 0.7,
      reasoning: 'Wide spread layout works well with elevation',
    };
  }
  
  if (itemCount > 15) {
    return {
      recommendedStrategy: 'grid',
      confidence: 0.6,
      reasoning: 'Many items benefit from grid organization',
    };
  }
  
  return {
    recommendedStrategy: 'flat',
    confidence: 0.5,
    reasoning: 'Default flat layout for standard cases',
  };
}

/**
 * Calculate layout density (0-1)
 */
function calculateLayoutDensity(items: SpaceItem[]): number {
  if (items.length === 0) return 0;
  
  const boundingBox = calculateBoundingBox(items);
  const totalArea = (boundingBox.max[0] - boundingBox.min[0]) * 
                   (boundingBox.max[2] - boundingBox.min[2]);
  
  const itemArea = items.reduce((sum, item) => 
    sum + (item.scale[0] * item.scale[2]), 0);
  
  return totalArea > 0 ? Math.min(itemArea / totalArea, 1) : 0;
}

/**
 * Calculate layout spread (maximum distance between items)
 */
function calculateLayoutSpread(items: SpaceItem[]): number {
  if (items.length < 2) return 0;
  
  let maxDistance = 0;
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const distance = calculateDistance(items[i].position, items[j].position);
      maxDistance = Math.max(maxDistance, distance);
    }
  }
  
  return maxDistance;
}
