import * as THREE from 'three';

export interface InstanceData {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  id?: string;
}

/**
 * Creates an instanced mesh for efficient rendering of repeated objects
 */
export function createInstancedMesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  instances: InstanceData[],
  maxCount?: number
): THREE.InstancedMesh {
  const count = Math.min(instances.length, maxCount || 1000);
  const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
  
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Euler();
  const scale = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    const instance = instances[i];
    
    position.set(...instance.position);
    rotation.set(...instance.rotation);
    scale.set(...instance.scale);
    
    matrix.compose(position, new THREE.Quaternion().setFromEuler(rotation), scale);
    instancedMesh.setMatrixAt(i, matrix);
  }

  instancedMesh.instanceMatrix.needsUpdate = true;
  return instancedMesh;
}

/**
 * Updates instances in an existing instanced mesh
 */
export function updateInstancedMesh(
  instancedMesh: THREE.InstancedMesh,
  instances: InstanceData[]
): void {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Euler();
  const scale = new THREE.Vector3();

  const count = Math.min(instances.length, instancedMesh.count);

  for (let i = 0; i < count; i++) {
    const instance = instances[i];
    
    position.set(...instance.position);
    rotation.set(...instance.rotation);
    scale.set(...instance.scale);
    
    matrix.compose(position, new THREE.Quaternion().setFromEuler(rotation), scale);
    instancedMesh.setMatrixAt(i, matrix);
  }

  instancedMesh.instanceMatrix.needsUpdate = true;
}

/**
 * Generates instance positions for common patterns
 */
export function generateInstancePattern(
  pattern: 'grid' | 'circle' | 'line' | 'random',
  count: number,
  spacing: number = 2,
  bounds?: { min: [number, number, number]; max: [number, number, number] }
): InstanceData[] {
  const instances: InstanceData[] = [];

  switch (pattern) {
    case 'grid':
      const gridSize = Math.ceil(Math.sqrt(count));
      for (let i = 0; i < count; i++) {
        const x = (i % gridSize) * spacing - (gridSize * spacing) / 2;
        const z = Math.floor(i / gridSize) * spacing - (gridSize * spacing) / 2;
        instances.push({
          position: [x, 0, z],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        });
      }
      break;

    case 'circle':
      const radius = count * spacing / (2 * Math.PI);
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        instances.push({
          position: [x, 0, z],
          rotation: [0, angle, 0],
          scale: [1, 1, 1],
        });
      }
      break;

    case 'line':
      for (let i = 0; i < count; i++) {
        const x = (i - count / 2) * spacing;
        instances.push({
          position: [x, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        });
      }
      break;

    case 'random':
      const min = bounds?.min || [-10, 0, -10];
      const max = bounds?.max || [10, 5, 10];
      for (let i = 0; i < count; i++) {
        instances.push({
          position: [
            min[0] + Math.random() * (max[0] - min[0]),
            min[1] + Math.random() * (max[1] - min[1]),
            min[2] + Math.random() * (max[2] - min[2]),
          ],
          rotation: [0, Math.random() * Math.PI * 2, 0],
          scale: [1, 1, 1],
        });
      }
      break;
  }

  return instances;
}
