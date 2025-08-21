"use client";
import { useEffect, useState, useRef } from 'react';
import { buildLevaStore, getDefaultEnvironment, getDefaultCamera, type LevaStoreConfig } from '@/utils/spatial/leva-store';
import { type SpaceAssetData } from '@/hooks/useSpaceAsset';

export interface PropertiesPanelProps {
  selectedObjects: SpaceAssetData[];
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
  onEnvironmentChange: (key: string, value: any) => void;
  onCameraChange: (key: string, value: any) => void;
  onObjectChange: (objectId: string, key: string, value: any) => void;
  onAction: (action: string, data?: any) => void;
}

export default function PropertiesPanel({
  selectedObjects,
  environment,
  camera,
  onEnvironmentChange,
  onCameraChange,
  onObjectChange,
  onAction,
}: PropertiesPanelProps) {
  const [leva, setLeva] = useState<any>(null);
  const [levaStore, setLevaStore] = useState<any>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const levaRootRef = useRef<HTMLDivElement>(null);

  // Load Leva dynamically
  useEffect(() => {
    let mounted = true;
    const loadLeva = async () => {
      try {
        const levaModule = await import('leva');
        if (!mounted) return;
        setLeva(levaModule);
      } catch (err) {
        console.error('PropertiesPanel failed to load Leva:', err);
      }
    };
    loadLeva();
    return () => { mounted = false; };
  }, []);

  // Build Leva store when dependencies change
  useEffect(() => {
    if (!leva) return;

    const config: LevaStoreConfig = {
      environment,
      camera,
      selectedObjects,
      onEnvironmentChange,
      onCameraChange,
      onObjectChange,
      onAction,
    };

    const newStore = buildLevaStore(config);
    setLevaStore(newStore);
  }, [leva, selectedObjects, environment, camera, onEnvironmentChange, onCameraChange, onObjectChange, onAction]);

  // Render Leva panel
  useEffect(() => {
    if (!leva || !levaStore || !levaRootRef.current) return;

    try {
      // Clear existing Leva instance
      levaRootRef.current.innerHTML = '';

      // Create new Leva instance
      const { Leva } = leva;
      
      // Note: Leva doesn't support React rendering directly, so we'll use the imperative API
      // This is a simplified approach - in production, you might want to use leva's store API more directly
      
    } catch (err) {
      console.error('Failed to render Leva panel:', err);
    }
  }, [leva, levaStore]);

  if (!leva) {
    return (
      <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-4">
        <div className="text-center">
          <div className="text-white text-lg mb-2">Loading Properties Panel...</div>
          <div className="text-neutral-300 text-sm">Initializing Leva controls</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-neutral-800 border border-neutral-700 rounded-lg">
      {/* Header */}
      <div className="p-4 border-b border-neutral-700">
        <h3 className="text-lg font-semibold text-white mb-2">Properties Panel</h3>
        <div className="text-sm text-neutral-300">
          {selectedObjects.length > 0 ? (
            <span>Selected: {selectedObjects.length} object{selectedObjects.length !== 1 ? 's' : ''}</span>
          ) : (
            <span>No objects selected</span>
          )}
        </div>
      </div>

      {/* Leva Controls Container */}
      <div className="p-4">
        <div ref={levaRootRef} className="leva-container" />
        
        {/* Fallback Manual Controls */}
        <div className="space-y-6">
          {/* Environment Controls */}
          <div>
            <h4 className="text-md font-semibold text-white mb-3">Environment</h4>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-neutral-300 mb-1">Background Color</label>
                <input
                  type="color"
                  value={environment.backgroundColor}
                  onChange={(e) => onEnvironmentChange('backgroundColor', e.target.value)}
                  className="w-full h-8 rounded border border-neutral-600"
                />
              </div>
              <div>
                <label className="block text-sm text-neutral-300 mb-1">Lighting</label>
                <select
                  value={environment.lighting}
                  onChange={(e) => onEnvironmentChange('lighting', e.target.value as 'studio' | 'natural' | 'dramatic')}
                  className="w-full p-2 rounded bg-neutral-700 border border-neutral-600 text-white"
                >
                  <option value="studio">Studio</option>
                  <option value="natural">Natural</option>
                  <option value="dramatic">Dramatic</option>
                </select>
              </div>
              <div>
                <label className="flex items-center text-sm text-neutral-300 mb-2">
                  <input
                    type="checkbox"
                    checked={environment.fog.enabled}
                    onChange={(e) => onEnvironmentChange('fog.enabled', e.target.checked)}
                    className="mr-2"
                  />
                  Enable Fog
                </label>
                {environment.fog.enabled && (
                  <div className="space-y-2 ml-6">
                    <div>
                      <label className="block text-xs text-neutral-400 mb-1">Fog Color</label>
                      <input
                        type="color"
                        value={environment.fog.color}
                        onChange={(e) => onEnvironmentChange('fog.color', e.target.value)}
                        className="w-full h-6 rounded border border-neutral-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-neutral-400 mb-1">Density: {environment.fog.density.toFixed(3)}</label>
                      <input
                        type="range"
                        min="0"
                        max="0.1"
                        step="0.001"
                        value={environment.fog.density}
                        onChange={(e) => onEnvironmentChange('fog.density', parseFloat(e.target.value))}
                        className="w-full"
                      />
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm text-neutral-300 mb-1">Skybox</label>
                <select
                  value={environment.skybox}
                  onChange={(e) => onEnvironmentChange('skybox', e.target.value)}
                  className="w-full p-2 rounded bg-neutral-700 border border-neutral-600 text-white"
                >
                  <option value="city">City</option>
                  <option value="dawn">Dawn</option>
                  <option value="forest">Forest</option>
                  <option value="lobby">Lobby</option>
                  <option value="night">Night</option>
                  <option value="park">Park</option>
                  <option value="studio">Studio</option>
                  <option value="sunset">Sunset</option>
                  <option value="warehouse">Warehouse</option>
                </select>
              </div>
            </div>
          </div>

          {/* Camera Controls */}
          <div>
            <h4 className="text-md font-semibold text-white mb-3">Camera</h4>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs text-neutral-400 mb-1">X: {camera.position[0].toFixed(1)}</label>
                  <input
                    type="range"
                    min="-20"
                    max="20"
                    step="0.1"
                    value={camera.position[0]}
                    onChange={(e) => {
                      const newPos = [...camera.position];
                      newPos[0] = parseFloat(e.target.value);
                      onCameraChange('position', newPos);
                    }}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs text-neutral-400 mb-1">Y: {camera.position[1].toFixed(1)}</label>
                  <input
                    type="range"
                    min="-20"
                    max="20"
                    step="0.1"
                    value={camera.position[1]}
                    onChange={(e) => {
                      const newPos = [...camera.position];
                      newPos[1] = parseFloat(e.target.value);
                      onCameraChange('position', newPos);
                    }}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs text-neutral-400 mb-1">Z: {camera.position[2].toFixed(1)}</label>
                  <input
                    type="range"
                    min="-20"
                    max="20"
                    step="0.1"
                    value={camera.position[2]}
                    onChange={(e) => {
                      const newPos = [...camera.position];
                      newPos[2] = parseFloat(e.target.value);
                      onCameraChange('position', newPos);
                    }}
                    className="w-full"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-neutral-300 mb-1">FOV: {camera.fov}°</label>
                <input
                  type="range"
                  min="10"
                  max="120"
                  step="1"
                  value={camera.fov}
                  onChange={(e) => onCameraChange('fov', parseInt(e.target.value))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm text-neutral-300 mb-1">Controls</label>
                <select
                  value={camera.controls}
                  onChange={(e) => onCameraChange('controls', e.target.value as 'orbit' | 'first-person' | 'fly')}
                  className="w-full p-2 rounded bg-neutral-700 border border-neutral-600 text-white"
                >
                  <option value="orbit">Orbit</option>
                  <option value="first-person">First Person</option>
                  <option value="fly">Fly</option>
                </select>
              </div>
            </div>
          </div>

          {/* Selected Object Controls */}
          {selectedObjects.length > 0 && (
            <div>
              <h4 className="text-md font-semibold text-white mb-3">
                Selected Object{selectedObjects.length !== 1 ? 's' : ''} ({selectedObjects.length})
              </h4>
              {selectedObjects.map((obj, index) => (
                <div key={obj.id} className="mb-4 p-3 bg-neutral-700 rounded border border-neutral-600">
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="text-sm font-medium text-white">{obj.id}</h5>
                    <span className="text-xs text-neutral-400">{obj.assetType}</span>
                  </div>
                  
                  <div className="space-y-2">
                    {/* Position */}
                    <div>
                      <label className="block text-xs text-neutral-400 mb-1">Position</label>
                      <div className="grid grid-cols-3 gap-1">
                        {['X', 'Y', 'Z'].map((axis, i) => (
                          <div key={axis}>
                            <input
                              type="number"
                              value={obj.position[i].toFixed(2)}
                              onChange={(e) => {
                                const newPos = [...obj.position];
                                newPos[i] = parseFloat(e.target.value) || 0;
                                onObjectChange(obj.id, 'position', newPos);
                              }}
                              className="w-full p-1 text-xs rounded bg-neutral-600 border border-neutral-500 text-white"
                              step="0.1"
                            />
                            <label className="block text-xs text-neutral-500 text-center">{axis}</label>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Scale */}
                    <div>
                      <label className="block text-xs text-neutral-400 mb-1">Scale</label>
                      <div className="grid grid-cols-3 gap-1">
                        {['X', 'Y', 'Z'].map((axis, i) => (
                          <div key={axis}>
                            <input
                              type="number"
                              value={obj.scale[i].toFixed(2)}
                              onChange={(e) => {
                                const newScale = [...obj.scale];
                                newScale[i] = parseFloat(e.target.value) || 0.1;
                                onObjectChange(obj.id, 'scale', newScale);
                              }}
                              className="w-full p-1 text-xs rounded bg-neutral-600 border border-neutral-500 text-white"
                              step="0.1"
                              min="0.1"
                            />
                            <label className="block text-xs text-neutral-500 text-center">{axis}</label>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Properties */}
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex items-center text-xs text-neutral-300">
                        <input
                          type="checkbox"
                          checked={obj.visible !== false}
                          onChange={(e) => onObjectChange(obj.id, 'visible', e.target.checked)}
                          className="mr-1"
                        />
                        Visible
                      </label>
                      <label className="flex items-center text-xs text-neutral-300">
                        <input
                          type="checkbox"
                          checked={obj.clickable !== false}
                          onChange={(e) => onObjectChange(obj.id, 'clickable', e.target.checked)}
                          className="mr-1"
                        />
                        Clickable
                      </label>
                    </div>

                    {/* Opacity */}
                    <div>
                      <label className="block text-xs text-neutral-400 mb-1">Opacity: {(obj.opacity || 1).toFixed(2)}</label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={obj.opacity || 1}
                        onChange={(e) => onObjectChange(obj.id, 'opacity', parseFloat(e.target.value))}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div>
            <h4 className="text-md font-semibold text-white mb-3">Actions</h4>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onAction('resetCamera')}
                className="px-3 py-2 text-sm rounded bg-blue-600 hover:bg-blue-700 text-white"
              >
                Reset Camera
              </button>
              <button
                onClick={() => onAction('resetEnvironment')}
                className="px-3 py-2 text-sm rounded bg-green-600 hover:bg-green-700 text-white"
              >
                Reset Environment
              </button>
              <button
                onClick={() => onAction('exportScene')}
                className="px-3 py-2 text-sm rounded bg-purple-600 hover:bg-purple-700 text-white"
              >
                Export Scene
              </button>
              <button
                onClick={() => onAction('clearScene')}
                className="px-3 py-2 text-sm rounded bg-red-600 hover:bg-red-700 text-white"
              >
                Clear Scene
              </button>
              <button
                onClick={() => onAction('importAsset')}
                className="px-3 py-2 text-sm rounded bg-orange-600 hover:bg-orange-700 text-white"
              >
                Import Asset
              </button>
              <button
                onClick={() => onAction('importLayout')}
                className="px-3 py-2 text-sm rounded bg-teal-600 hover:bg-teal-700 text-white"
              >
                Import Layout
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
