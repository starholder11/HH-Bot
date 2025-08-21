import * as THREE from 'three';

/**
 * Memory management utilities for 3D scenes
 */

export interface MemoryStats {
  geometries: number;
  textures: number;
  materials: number;
  programs: number;
  totalMemoryMB: number;
}

/**
 * Dispose of Three.js objects to free memory
 */
export function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    // Dispose geometries
    if (child instanceof THREE.Mesh) {
      if (child.geometry) {
        child.geometry.dispose();
      }

      // Dispose materials
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((material) => disposeMaterial(material));
        } else {
          disposeMaterial(child.material);
        }
      }
    }

    // Remove from parent
    if (child.parent) {
      child.parent.remove(child);
    }
  });
}

/**
 * Dispose of a material and its textures
 */
export function disposeMaterial(material: THREE.Material): void {
  // Dispose textures
  Object.values(material).forEach((value) => {
    if (value && typeof value === 'object' && 'isTexture' in value) {
      (value as THREE.Texture).dispose();
    }
  });

  // Dispose material
  material.dispose();
}

/**
 * Dispose of a texture
 */
export function disposeTexture(texture: THREE.Texture): void {
  texture.dispose();
}

/**
 * Get memory usage statistics
 */
export function getMemoryStats(renderer: THREE.WebGLRenderer): MemoryStats {
  const info = renderer.info;
  
  return {
    geometries: info.memory.geometries,
    textures: info.memory.textures,
    materials: 0, // Not directly available in renderer info
    programs: info.programs?.length || 0,
    totalMemoryMB: 0, // Approximation would require more complex calculation
  };
}

/**
 * Memory Manager class for automatic cleanup
 */
export class MemoryManager {
  private disposables: Set<THREE.Object3D>;
  private textureCache: Map<string, THREE.Texture>;
  private materialCache: Map<string, THREE.Material>;
  private maxCacheSize: number;
  private lastCleanup: number;
  private cleanupInterval: number;

  constructor(maxCacheSize = 100, cleanupInterval = 30000) { // 30 seconds
    this.disposables = new Set();
    this.textureCache = new Map();
    this.materialCache = new Map();
    this.maxCacheSize = maxCacheSize;
    this.lastCleanup = performance.now();
    this.cleanupInterval = cleanupInterval;
  }

  /**
   * Register an object for automatic disposal
   */
  register(object: THREE.Object3D): void {
    this.disposables.add(object);
  }

  /**
   * Unregister an object (it will not be disposed automatically)
   */
  unregister(object: THREE.Object3D): void {
    this.disposables.delete(object);
  }

  /**
   * Cache a texture with a key
   */
  cacheTexture(key: string, texture: THREE.Texture): THREE.Texture {
    // Clean cache if too large
    if (this.textureCache.size >= this.maxCacheSize) {
      this.cleanTextureCache();
    }

    this.textureCache.set(key, texture);
    return texture;
  }

  /**
   * Get cached texture
   */
  getCachedTexture(key: string): THREE.Texture | undefined {
    return this.textureCache.get(key);
  }

  /**
   * Cache a material with a key
   */
  cacheMaterial(key: string, material: THREE.Material): THREE.Material {
    if (this.materialCache.size >= this.maxCacheSize) {
      this.cleanMaterialCache();
    }

    this.materialCache.set(key, material);
    return material;
  }

  /**
   * Get cached material
   */
  getCachedMaterial(key: string): THREE.Material | undefined {
    return this.materialCache.get(key);
  }

  /**
   * Clean up old textures from cache
   */
  private cleanTextureCache(): void {
    const entries = Array.from(this.textureCache.entries());
    const toRemove = entries.slice(0, Math.floor(this.maxCacheSize * 0.3)); // Remove 30%

    toRemove.forEach(([key, texture]) => {
      texture.dispose();
      this.textureCache.delete(key);
    });
  }

  /**
   * Clean up old materials from cache
   */
  private cleanMaterialCache(): void {
    const entries = Array.from(this.materialCache.entries());
    const toRemove = entries.slice(0, Math.floor(this.maxCacheSize * 0.3)); // Remove 30%

    toRemove.forEach(([key, material]) => {
      disposeMaterial(material);
      this.materialCache.delete(key);
    });
  }

  /**
   * Perform periodic cleanup
   */
  update(): void {
    const now = performance.now();
    if (now - this.lastCleanup > this.cleanupInterval) {
      this.cleanup();
      this.lastCleanup = now;
    }
  }

  /**
   * Force cleanup of all registered objects
   */
  cleanup(): void {
    // Dispose registered objects
    this.disposables.forEach((object) => {
      disposeObject(object);
    });
    this.disposables.clear();

    // Clean caches
    this.cleanTextureCache();
    this.cleanMaterialCache();
  }

  /**
   * Dispose everything and reset
   */
  dispose(): void {
    this.cleanup();
    
    // Clear all caches
    this.textureCache.forEach((texture) => texture.dispose());
    this.textureCache.clear();
    
    this.materialCache.forEach((material) => disposeMaterial(material));
    this.materialCache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    disposablesCount: number;
    texturesCached: number;
    materialsCached: number;
    cacheUsage: number; // Percentage
  } {
    return {
      disposablesCount: this.disposables.size,
      texturesCached: this.textureCache.size,
      materialsCached: this.materialCache.size,
      cacheUsage: Math.round(((this.textureCache.size + this.materialCache.size) / (this.maxCacheSize * 2)) * 100),
    };
  }
}

// Global memory manager instance
export const globalMemoryManager = new MemoryManager();
