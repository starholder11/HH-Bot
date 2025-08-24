/**
 * Level of Detail (LOD) Manager for optimizing 3D scene performance
 */

export interface LODInfo {
  lodLevel: number; // 0 = highest quality, 3 = lowest quality
  shouldRender: boolean;
  distance: number;
}

export interface LODSettings {
  maxDistance: number;
  frustumCulling: boolean;
  lodLevels: number[];
}

export class LODManager {
  private settings: LODSettings;

  constructor(settings?: Partial<LODSettings>) {
    this.settings = {
      maxDistance: 100,
      frustumCulling: true,
      lodLevels: [10, 25, 50, 100], // Distance thresholds for LOD levels
      ...settings
    };
  }

  /**
   * Calculate LOD level and rendering decision for an object
   */
  calculateObjectLOD(
    objectPosition: [number, number, number],
    cameraPosition: [number, number, number]
  ): LODInfo {
    const distance = this.calculateDistance(objectPosition, cameraPosition);
    
    // Determine LOD level based on distance
    let lodLevel = 0;
    for (let i = 0; i < this.settings.lodLevels.length; i++) {
      if (distance > this.settings.lodLevels[i]) {
        lodLevel = i + 1;
      } else {
        break;
      }
    }

    // Clamp LOD level
    lodLevel = Math.min(lodLevel, this.settings.lodLevels.length);

    // Determine if object should render
    const shouldRender = distance <= this.settings.maxDistance;

    return {
      lodLevel,
      shouldRender,
      distance
    };
  }

  /**
   * Calculate distance between two 3D points
   */
  private calculateDistance(
    pos1: [number, number, number],
    pos2: [number, number, number]
  ): number {
    const dx = pos1[0] - pos2[0];
    const dy = pos1[1] - pos2[1];
    const dz = pos1[2] - pos2[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Update LOD settings
   */
  updateSettings(newSettings: Partial<LODSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
  }

  /**
   * Get current LOD settings
   */
  getSettings(): LODSettings {
    return { ...this.settings };
  }
}

/**
 * Calculate LOD level based on distance (utility function)
 */
export function calculateLODLevel(distance: number): number {
  if (distance < 10) return 0; // High quality
  if (distance < 25) return 1; // Medium quality
  if (distance < 50) return 2; // Low quality
  return 3; // Very low quality
}
