/**
 * 2D Icon Generation for 3D Objects in Layouts
 * 
 * Generates 2D icon representations of 3D objects and collections
 * for display in layout editors
 */

export interface ObjectIconConfig {
  width: number;
  height: number;
  style: 'outline' | 'filled' | 'isometric' | 'top-down';
  backgroundColor?: string;
  foregroundColor?: string;
  showLabel?: boolean;
  labelPosition?: 'top' | 'bottom' | 'center';
}

export interface GeneratedIcon {
  iconUrl: string;      // Data URL or path to generated icon
  previewUrl?: string;  // Optional 3D preview thumbnail
  boundingBox2D: {
    width: number;
    height: number;
  };
  metadata: {
    generatedAt: string;
    style: string;
    category: string;
    subcategory?: string;
  };
}

const DEFAULT_ICON_CONFIG: ObjectIconConfig = {
  width: 64,
  height: 64,
  style: 'outline',
  backgroundColor: '#f3f4f6',
  foregroundColor: '#374151',
  showLabel: true,
  labelPosition: 'bottom',
};

/**
 * Generate 2D icon for an object asset
 */
export function generateObjectIcon(
  objectData: any, // ObjectAsset
  config: Partial<ObjectIconConfig> = {}
): GeneratedIcon {
  const finalConfig = { ...DEFAULT_ICON_CONFIG, ...config };
  
  const category = objectData.object?.category || 'unknown';
  const subcategory = objectData.object?.subcategory;
  
  // Generate icon based on category
  const iconUrl = generateCategoryIcon(category, subcategory, finalConfig);
  
  return {
    iconUrl,
    boundingBox2D: {
      width: finalConfig.width,
      height: finalConfig.height,
    },
    metadata: {
      generatedAt: new Date().toISOString(),
      style: finalConfig.style,
      category,
      subcategory,
    },
  };
}

/**
 * Generate 2D icon for a collection asset
 */
export function generateCollectionIcon(
  collectionData: any, // ObjectCollection
  config: Partial<ObjectIconConfig> = {}
): GeneratedIcon {
  const finalConfig = { ...DEFAULT_ICON_CONFIG, ...config };
  
  const category = collectionData.collection?.category || 'collection';
  const itemCount = collectionData.collection?.objects?.length || 0;
  
  // Generate collection icon with item count indicator
  const iconUrl = generateCollectionCategoryIcon(category, itemCount, finalConfig);
  
  return {
    iconUrl,
    boundingBox2D: {
      width: finalConfig.width,
      height: finalConfig.height,
    },
    metadata: {
      generatedAt: new Date().toISOString(),
      style: finalConfig.style,
      category,
      subcategory: `${itemCount} items`,
    },
  };
}

/**
 * Generate category-based icon (SVG data URL)
 */
function generateCategoryIcon(
  category: string,
  subcategory: string | undefined,
  config: ObjectIconConfig
): string {
  const { width, height, style, backgroundColor, foregroundColor, showLabel } = config;
  
  // Category-specific shapes and colors
  const categoryIcons: Record<string, { shape: string; color: string; emoji: string }> = {
    furniture: { shape: 'rect', color: '#8B4513', emoji: '🪑' },
    lighting: { shape: 'circle', color: '#FFD700', emoji: '💡' },
    electronics: { shape: 'rect', color: '#4169E1', emoji: '📱' },
    props: { shape: 'polygon', color: '#32CD32', emoji: '🎭' },
    architectural: { shape: 'rect', color: '#708090', emoji: '🏛️' },
    toys: { shape: 'circle', color: '#FF69B4', emoji: '🧸' },
    vehicles: { shape: 'rect', color: '#DC143C', emoji: '🚗' },
    nature: { shape: 'circle', color: '#228B22', emoji: '🌳' },
    tools: { shape: 'rect', color: '#B22222', emoji: '🔧' },
    default: { shape: 'rect', color: '#696969', emoji: '📦' },
  };

  const iconData = categoryIcons[category.toLowerCase()] || categoryIcons.default;
  
  // Generate SVG based on style
  let svgContent = '';
  
  if (style === 'outline') {
    svgContent = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="${backgroundColor}" stroke="none"/>
        <rect x="8" y="8" width="${width-16}" height="${height-24}" 
              fill="none" stroke="${iconData.color}" stroke-width="2" rx="4"/>
        <text x="${width/2}" y="${height-6}" text-anchor="middle" 
              font-family="system-ui" font-size="10" fill="${foregroundColor}">
          ${showLabel ? (subcategory || category) : ''}
        </text>
      </svg>
    `;
  } else if (style === 'filled') {
    svgContent = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="${backgroundColor}" stroke="none"/>
        <rect x="8" y="8" width="${width-16}" height="${height-24}" 
              fill="${iconData.color}" stroke="none" rx="4"/>
        <text x="${width/2}" y="${height-6}" text-anchor="middle" 
              font-family="system-ui" font-size="10" fill="${foregroundColor}">
          ${showLabel ? (subcategory || category) : ''}
        </text>
      </svg>
    `;
  } else if (style === 'isometric') {
    // Simple isometric cube
    svgContent = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="${backgroundColor}" stroke="none"/>
        <g transform="translate(${width/2}, ${height/2})">
          <polygon points="-12,-8 0,-16 12,-8 12,8 0,16 -12,8" 
                   fill="${iconData.color}" stroke="${foregroundColor}" stroke-width="1"/>
          <polygon points="-12,-8 0,-16 12,-8 0,0 -12,8" 
                   fill="${iconData.color}" opacity="0.8"/>
        </g>
        ${showLabel ? `
          <text x="${width/2}" y="${height-4}" text-anchor="middle" 
                font-family="system-ui" font-size="9" fill="${foregroundColor}">
            ${subcategory || category}
          </text>
        ` : ''}
      </svg>
    `;
  } else { // top-down
    svgContent = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="${backgroundColor}" stroke="none"/>
        <circle cx="${width/2}" cy="${height/2-8}" r="${Math.min(width, height)/3}" 
                fill="${iconData.color}" stroke="${foregroundColor}" stroke-width="2"/>
        <text x="${width/2}" y="${height-6}" text-anchor="middle" 
              font-family="system-ui" font-size="10" fill="${foregroundColor}">
          ${showLabel ? (subcategory || category) : ''}
        </text>
      </svg>
    `;
  }

  // Convert SVG to data URL
  const encodedSvg = encodeURIComponent(svgContent.trim());
  return `data:image/svg+xml,${encodedSvg}`;
}

/**
 * Generate collection-specific icon with item count
 */
function generateCollectionCategoryIcon(
  category: string,
  itemCount: number,
  config: ObjectIconConfig
): string {
  const { width, height, backgroundColor, foregroundColor, showLabel } = config;
  
  const svgContent = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="${backgroundColor}" stroke="none"/>
      
      <!-- Collection container -->
      <rect x="6" y="6" width="${width-12}" height="${height-20}" 
            fill="none" stroke="#2563eb" stroke-width="2" stroke-dasharray="4,2" rx="4"/>
      
      <!-- Item count indicator -->
      <circle cx="${width-12}" cy="12" r="8" fill="#2563eb"/>
      <text x="${width-12}" y="16" text-anchor="middle" 
            font-family="system-ui" font-size="8" fill="white" font-weight="bold">
        ${itemCount > 99 ? '99+' : itemCount}
      </text>
      
      <!-- Category label -->
      ${showLabel ? `
        <text x="${width/2}" y="${height-4}" text-anchor="middle" 
              font-family="system-ui" font-size="9" fill="${foregroundColor}">
          ${category}
        </text>
      ` : ''}
    </svg>
  `;

  const encodedSvg = encodeURIComponent(svgContent.trim());
  return `data:image/svg+xml,${encodedSvg}`;
}

/**
 * Generate icon for layout item based on asset type
 */
export function generateLayoutItemIcon(
  assetType: string,
  assetData: any,
  config: Partial<ObjectIconConfig> = {}
): GeneratedIcon {
  switch (assetType) {
    case 'object':
      return generateObjectIcon(assetData, config);
    
    case 'object_collection':
      return generateCollectionIcon(assetData, config);
    
    default:
      // For other asset types, generate a generic icon
      return generateGenericIcon(assetType, config);
  }
}

/**
 * Generate generic icon for non-object asset types
 */
function generateGenericIcon(
  assetType: string,
  config: Partial<ObjectIconConfig> = {}
): GeneratedIcon {
  const finalConfig = { ...DEFAULT_ICON_CONFIG, ...config };
  
  const typeIcons: Record<string, { color: string; emoji: string }> = {
    image: { color: '#10b981', emoji: '🖼️' },
    video: { color: '#f59e0b', emoji: '🎬' },
    audio: { color: '#8b5cf6', emoji: '🎵' },
    text: { color: '#6b7280', emoji: '📝' },
    layout: { color: '#3b82f6', emoji: '📋' },
    default: { color: '#6b7280', emoji: '❓' },
  };

  const iconData = typeIcons[assetType] || typeIcons.default;
  
  const svgContent = `
    <svg width="${finalConfig.width}" height="${finalConfig.height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="${finalConfig.backgroundColor}" stroke="none"/>
      <rect x="8" y="8" width="${finalConfig.width-16}" height="${finalConfig.height-24}" 
            fill="${iconData.color}" stroke="none" rx="4" opacity="0.8"/>
      <text x="${finalConfig.width/2}" y="${finalConfig.height-6}" text-anchor="middle" 
            font-family="system-ui" font-size="10" fill="${finalConfig.foregroundColor}">
        ${finalConfig.showLabel ? assetType : ''}
      </text>
    </svg>
  `;

  const encodedSvg = encodeURIComponent(svgContent.trim());
  
  return {
    iconUrl: `data:image/svg+xml,${encodedSvg}`,
    boundingBox2D: {
      width: finalConfig.width,
      height: finalConfig.height,
    },
    metadata: {
      generatedAt: new Date().toISOString(),
      style: finalConfig.style,
      category: assetType,
    },
  };
}

/**
 * Batch generate icons for multiple assets
 */
export async function batchGenerateIcons(
  assets: Array<{ id: string; type: string; data: any }>,
  config: Partial<ObjectIconConfig> = {}
): Promise<Map<string, GeneratedIcon>> {
  const results = new Map<string, GeneratedIcon>();
  
  for (const asset of assets) {
    try {
      const icon = generateLayoutItemIcon(asset.type, asset.data, config);
      results.set(asset.id, icon);
    } catch (error) {
      console.error(`Failed to generate icon for ${asset.id}:`, error);
      // Generate fallback icon
      const fallback = generateGenericIcon('unknown', config);
      results.set(asset.id, fallback);
    }
  }
  
  return results;
}

/**
 * Get optimal icon size for layout item dimensions
 */
export function getOptimalIconSize(
  itemWidth: number,
  itemHeight: number,
  maxSize: number = 128
): { width: number; height: number } {
  const aspectRatio = itemHeight / itemWidth;
  
  if (itemWidth >= itemHeight) {
    const width = Math.min(itemWidth, maxSize);
    const height = Math.round(width * aspectRatio);
    return { width, height };
  } else {
    const height = Math.min(itemHeight, maxSize);
    const width = Math.round(height / aspectRatio);
    return { width, height };
  }
}

/**
 * Cache for generated icons to avoid regeneration
 */
class IconCache {
  private cache = new Map<string, GeneratedIcon>();
  private maxSize = 500;

  generateCacheKey(assetId: string, config: ObjectIconConfig): string {
    return `${assetId}_${config.width}x${config.height}_${config.style}`;
  }

  get(assetId: string, config: ObjectIconConfig): GeneratedIcon | undefined {
    const key = this.generateCacheKey(assetId, config);
    return this.cache.get(key);
  }

  set(assetId: string, config: ObjectIconConfig, icon: GeneratedIcon): void {
    const key = this.generateCacheKey(assetId, config);
    
    // Clean cache if too large
    if (this.cache.size >= this.maxSize) {
      const entries = Array.from(this.cache.entries());
      entries.slice(0, Math.floor(this.maxSize * 0.3)).forEach(([k]) => {
        this.cache.delete(k);
      });
    }
    
    this.cache.set(key, icon);
  }

  clear(): void {
    this.cache.clear();
  }

  getStats(): { size: number; maxSize: number; usage: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      usage: Math.round((this.cache.size / this.maxSize) * 100),
    };
  }
}

// Global icon cache instance
export const globalIconCache = new IconCache();
