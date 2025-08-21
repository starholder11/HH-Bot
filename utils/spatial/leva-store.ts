"use client";
import { folder, button } from 'leva';
import { type SpaceAssetData } from '@/hooks/useSpaceAsset';

export interface LevaStoreConfig {
  environment: {
    backgroundColor: string;
    lighting: 'studio' | 'natural' | 'dramatic';
    fog: { enabled: boolean; color: string; density: number };
    skybox: string;
  };
  camera: {
    position: [number, number, number];
    target: [number, number, number];
    fov: number;
    controls: 'orbit' | 'first-person' | 'fly';
  };
  selectedObjects: SpaceAssetData[];
  onEnvironmentChange: (key: string, value: any) => void;
  onCameraChange: (key: string, value: any) => void;
  onObjectChange: (objectId: string, key: string, value: any) => void;
  onAction: (action: string, data?: any) => void;
}

export function buildLevaStore(config: LevaStoreConfig) {
  const store: any = {
    // Environment Controls
    Environment: folder({
      backgroundColor: { 
        value: config.environment.backgroundColor, 
        onChange: (value: string) => config.onEnvironmentChange('backgroundColor', value)
      },
      lighting: { 
        value: config.environment.lighting, 
        options: ['studio', 'natural', 'dramatic'],
        onChange: (value: 'studio' | 'natural' | 'dramatic') => config.onEnvironmentChange('lighting', value)
      },
      fogEnabled: { 
        value: config.environment.fog.enabled,
        onChange: (value: boolean) => config.onEnvironmentChange('fog.enabled', value)
      },
      fogColor: { 
        value: config.environment.fog.color,
        render: (get: any) => get('Environment.fogEnabled'),
        onChange: (value: string) => config.onEnvironmentChange('fog.color', value)
      },
      fogDensity: { 
        value: config.environment.fog.density, 
        min: 0, 
        max: 0.1, 
        step: 0.001,
        render: (get: any) => get('Environment.fogEnabled'),
        onChange: (value: number) => config.onEnvironmentChange('fog.density', value)
      },
      skybox: { 
        value: config.environment.skybox,
        options: ['city', 'dawn', 'forest', 'lobby', 'night', 'park', 'studio', 'sunset', 'warehouse'],
        onChange: (value: string) => config.onEnvironmentChange('skybox', value)
      },
    }),

    // Camera Controls
    Camera: folder({
      positionX: { 
        value: config.camera.position[0], 
        min: -20, 
        max: 20, 
        step: 0.1,
        onChange: (value: number) => {
          const newPos = [...config.camera.position];
          newPos[0] = value;
          config.onCameraChange('position', newPos);
        }
      },
      positionY: { 
        value: config.camera.position[1], 
        min: -20, 
        max: 20, 
        step: 0.1,
        onChange: (value: number) => {
          const newPos = [...config.camera.position];
          newPos[1] = value;
          config.onCameraChange('position', newPos);
        }
      },
      positionZ: { 
        value: config.camera.position[2], 
        min: -20, 
        max: 20, 
        step: 0.1,
        onChange: (value: number) => {
          const newPos = [...config.camera.position];
          newPos[2] = value;
          config.onCameraChange('position', newPos);
        }
      },
      targetX: { 
        value: config.camera.target[0], 
        min: -10, 
        max: 10, 
        step: 0.1,
        onChange: (value: number) => {
          const newTarget = [...config.camera.target];
          newTarget[0] = value;
          config.onCameraChange('target', newTarget);
        }
      },
      targetY: { 
        value: config.camera.target[1], 
        min: -10, 
        max: 10, 
        step: 0.1,
        onChange: (value: number) => {
          const newTarget = [...config.camera.target];
          newTarget[1] = value;
          config.onCameraChange('target', newTarget);
        }
      },
      targetZ: { 
        value: config.camera.target[2], 
        min: -10, 
        max: 10, 
        step: 0.1,
        onChange: (value: number) => {
          const newTarget = [...config.camera.target];
          newTarget[2] = value;
          config.onCameraChange('target', newTarget);
        }
      },
      fov: { 
        value: config.camera.fov, 
        min: 10, 
        max: 120, 
        step: 1,
        onChange: (value: number) => config.onCameraChange('fov', value)
      },
      controls: { 
        value: config.camera.controls,
        options: ['orbit', 'first-person', 'fly'],
        onChange: (value: 'orbit' | 'first-person' | 'fly') => config.onCameraChange('controls', value)
      },
    }),

    // Actions
    Actions: folder({
      resetCamera: button(() => config.onAction('resetCamera')),
      resetEnvironment: button(() => config.onAction('resetEnvironment')),
      exportScene: button(() => config.onAction('exportScene')),
      importScene: button(() => config.onAction('importScene')),
      clearScene: button(() => config.onAction('clearScene')),
    }),
  };

  // Add selected object controls
  if (config.selectedObjects.length > 0) {
    config.selectedObjects.forEach((obj, index) => {
      const objKey = config.selectedObjects.length === 1 ? 'Selected Object' : `Object ${index + 1}`;
      
      store[objKey] = folder({
        name: { value: obj.id, disabled: true },
        assetType: { value: obj.assetType, disabled: true },
        visible: { 
          value: obj.visible !== false,
          onChange: (value: boolean) => config.onObjectChange(obj.id, 'visible', value)
        },
        positionX: { 
          value: obj.position[0], 
          min: -20, 
          max: 20, 
          step: 0.1,
          onChange: (value: number) => {
            const newPos = [...obj.position];
            newPos[0] = value;
            config.onObjectChange(obj.id, 'position', newPos);
          }
        },
        positionY: { 
          value: obj.position[1], 
          min: -20, 
          max: 20, 
          step: 0.1,
          onChange: (value: number) => {
            const newPos = [...obj.position];
            newPos[1] = value;
            config.onObjectChange(obj.id, 'position', newPos);
          }
        },
        positionZ: { 
          value: obj.position[2], 
          min: -20, 
          max: 20, 
          step: 0.1,
          onChange: (value: number) => {
            const newPos = [...obj.position];
            newPos[2] = value;
            config.onObjectChange(obj.id, 'position', newPos);
          }
        },
        rotationX: { 
          value: obj.rotation[0], 
          min: -Math.PI, 
          max: Math.PI, 
          step: 0.01,
          onChange: (value: number) => {
            const newRot = [...obj.rotation];
            newRot[0] = value;
            config.onObjectChange(obj.id, 'rotation', newRot);
          }
        },
        rotationY: { 
          value: obj.rotation[1], 
          min: -Math.PI, 
          max: Math.PI, 
          step: 0.01,
          onChange: (value: number) => {
            const newRot = [...obj.rotation];
            newRot[1] = value;
            config.onObjectChange(obj.id, 'rotation', newRot);
          }
        },
        rotationZ: { 
          value: obj.rotation[2], 
          min: -Math.PI, 
          max: Math.PI, 
          step: 0.01,
          onChange: (value: number) => {
            const newRot = [...obj.rotation];
            newRot[2] = value;
            config.onObjectChange(obj.id, 'rotation', newRot);
          }
        },
        scaleX: { 
          value: obj.scale[0], 
          min: 0.1, 
          max: 5, 
          step: 0.1,
          onChange: (value: number) => {
            const newScale = [...obj.scale];
            newScale[0] = value;
            config.onObjectChange(obj.id, 'scale', newScale);
          }
        },
        scaleY: { 
          value: obj.scale[1], 
          min: 0.1, 
          max: 5, 
          step: 0.1,
          onChange: (value: number) => {
            const newScale = [...obj.scale];
            newScale[1] = value;
            config.onObjectChange(obj.id, 'scale', newScale);
          }
        },
        scaleZ: { 
          value: obj.scale[2], 
          min: 0.1, 
          max: 5, 
          step: 0.1,
          onChange: (value: number) => {
            const newScale = [...obj.scale];
            newScale[2] = value;
            config.onObjectChange(obj.id, 'scale', newScale);
          }
        },
        opacity: { 
          value: obj.opacity || 1, 
          min: 0, 
          max: 1, 
          step: 0.01,
          onChange: (value: number) => config.onObjectChange(obj.id, 'opacity', value)
        },
        clickable: { 
          value: obj.clickable !== false,
          onChange: (value: boolean) => config.onObjectChange(obj.id, 'clickable', value)
        },
        hoverEffect: { 
          value: obj.hoverEffect || 'none',
          options: ['none', 'glow', 'scale'],
          onChange: (value: 'none' | 'glow' | 'scale') => config.onObjectChange(obj.id, 'hoverEffect', value)
        },
        // Object-specific properties
        ...(obj.assetType === 'object' && {
          showComponents: { 
            value: obj.objectProperties?.showComponents !== false,
            onChange: (value: boolean) => config.onObjectChange(obj.id, 'objectProperties.showComponents', value)
          },
          interactionLevel: { 
            value: obj.objectProperties?.interactionLevel || 'object',
            options: ['object', 'component'],
            onChange: (value: 'object' | 'component') => config.onObjectChange(obj.id, 'objectProperties.interactionLevel', value)
          },
          lodLevel: { 
            value: obj.objectProperties?.lodLevel || 1,
            min: 0,
            max: 3,
            step: 1,
            onChange: (value: number) => config.onObjectChange(obj.id, 'objectProperties.lodLevel', value)
          },
        }),
        ...(obj.assetType === 'object_collection' && {
          showComponents: { 
            value: obj.objectProperties?.showComponents !== false,
            onChange: (value: boolean) => config.onObjectChange(obj.id, 'objectProperties.showComponents', value)
          },
          interactionLevel: { 
            value: obj.objectProperties?.interactionLevel || 'collection',
            options: ['collection', 'object', 'component'],
            onChange: (value: 'collection' | 'object' | 'component') => config.onObjectChange(obj.id, 'objectProperties.interactionLevel', value)
          },
        }),
      });
    });
  }

  return store;
}

export function getDefaultEnvironment() {
  return {
    backgroundColor: '#111217',
    lighting: 'studio' as const,
    fog: { enabled: false, color: '#ffffff', density: 0.01 },
    skybox: 'city',
  };
}

export function getDefaultCamera() {
  return {
    position: [4, 3, 6] as [number, number, number],
    target: [0, 0, 0] as [number, number, number],
    fov: 50,
    controls: 'orbit' as const,
  };
}
