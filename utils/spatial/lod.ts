import * as THREE from 'three';

export type LODLevel = 'hidden' | 'low' | 'medium' | 'high' | 'full';

export interface LODConfig {
  hideDistance: number;
  lowDistance: number;
  mediumDistance: number;
  highDistance: number;
  fullDistance: number;
}

export const DEFAULT_LOD_CONFIG: LODConfig = {
  hideDistance: 100,   // Don't render beyond 100 units
  lowDistance: 50,     // 64x64px textures, simple geometry
  mediumDistance: 25,  // 256x256px textures, reduced geometry
  highDistance: 10,    // 512x512px textures, normal geometry
  fullDistance: 0,     // Original resolution, full geometry
};

/**
 * Calculate LOD level based on distance from camera
 */
export function calculateLODLevel(distance: number, config: LODConfig = DEFAULT_LOD_CONFIG): LODLevel {
  if (distance >= config.hideDistance) return 'hidden';
  if (distance >= config.lowDistance) return 'low';
  if (distance >= config.mediumDistance) return 'medium';
  if (distance >= config.highDistance) return 'high';
  return 'full';
}

/**
 * Calculate distance between camera and object
 */
export function calculateDistance(
  cameraPosition: [number, number, number],
  objectPosition: [number, number, number]
): number {
  const dx = cameraPosition[0] - objectPosition[0];
  const dy = cameraPosition[1] - objectPosition[1];
  const dz = cameraPosition[2] - objectPosition[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Get texture size for LOD level
 */
export function getTextureSize(lodLevel: LODLevel): number {
  switch (lodLevel) {
    case 'hidden': return 0;
    case 'low': return 64;
    case 'medium': return 256;
    case 'high': return 512;
    case 'full': return 1024;
    default: return 256;
  }
}

/**
 * Get geometry detail level for LOD
 */
export function getGeometryDetail(lodLevel: LODLevel): number {
  switch (lodLevel) {
    case 'hidden': return 0;
    case 'low': return 0.2;      // 20% detail
    case 'medium': return 0.5;   // 50% detail
    case 'high': return 0.8;     // 80% detail
    case 'full': return 1.0;     // 100% detail
    default: return 0.5;
  }
}

/**
 * Check if object is within camera frustum
 */
export function isInFrustum(
  object: THREE.Object3D,
  camera: THREE.Camera,
  frustum?: THREE.Frustum
): boolean {
  if (!frustum) {
    frustum = new THREE.Frustum();
    const matrix = new THREE.Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    frustum.setFromProjectionMatrix(matrix);
  }

  // Get object bounding sphere
  const box = new THREE.Box3().setFromObject(object);
  const sphere = new THREE.Sphere();
  box.getBoundingSphere(sphere);

  return frustum.intersectsSphere(sphere);
}

/**
 * LOD Manager class for efficient distance-based rendering
 */
export class LODManager {
  private config: LODConfig;
  private frustum: THREE.Frustum;
  private matrix: THREE.Matrix4;
  private lastCameraPosition: THREE.Vector3;
  private lastCameraUpdateTime: number;
  private updateThreshold: number; // Minimum distance to trigger update

  constructor(config: LODConfig = DEFAULT_LOD_CONFIG, updateThreshold = 1.0) {
    this.config = config;
    this.frustum = new THREE.Frustum();
    this.matrix = new THREE.Matrix4();
    this.lastCameraPosition = new THREE.Vector3();
    this.lastCameraUpdateTime = 0;
    this.updateThreshold = updateThreshold;
  }

  /**
   * Update frustum from camera (call once per frame)
   */
  updateFrustum(camera: THREE.Camera): boolean {
    const currentTime = performance.now();
    const currentPosition = camera.position.clone();
    
    // Only update if camera moved significantly or enough time passed
    const distanceMoved = currentPosition.distanceTo(this.lastCameraPosition);
    const timeSinceUpdate = currentTime - this.lastCameraUpdateTime;
    
    if (distanceMoved < this.updateThreshold && timeSinceUpdate < 100) {
      return false; // Skip update
    }

    this.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.matrix);
    
    this.lastCameraPosition.copy(currentPosition);
    this.lastCameraUpdateTime = currentTime;
    
    return true; // Updated
  }

  /**
   * Calculate LOD info for an object
   */
  calculateObjectLOD(
    objectPosition: [number, number, number],
    cameraPosition: [number, number, number],
    object?: THREE.Object3D
  ): {
    lodLevel: LODLevel;
    distance: number;
    inFrustum: boolean;
    shouldRender: boolean;
  } {
    const distance = calculateDistance(cameraPosition, objectPosition);
    const lodLevel = calculateLODLevel(distance, this.config);
    
    let inFrustum = true;
    if (object) {
      inFrustum = isInFrustum(object, { position: new THREE.Vector3(...cameraPosition) } as THREE.Camera, this.frustum);
    }

    const shouldRender = lodLevel !== 'hidden' && inFrustum;

    return {
      lodLevel,
      distance,
      inFrustum,
      shouldRender,
    };
  }

  /**
   * Get optimized texture URL with size parameter
   */
  getOptimizedTextureURL(baseURL: string, lodLevel: LODLevel): string {
    const size = getTextureSize(lodLevel);
    if (size === 0) return '';
    
    // Add size parameters to URL
    const separator = baseURL.includes('?') ? '&' : '?';
    return `${baseURL}${separator}w=${size}&h=${size}`;
  }

  /**
   * Update LOD configuration
   */
  updateConfig(config: Partial<LODConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
