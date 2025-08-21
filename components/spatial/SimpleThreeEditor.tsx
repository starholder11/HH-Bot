"use client";
import { useEffect, useRef, useState } from 'react';

export interface SimpleThreeEditorProps {
  spaceId: string;
  onSave?: (sceneData: any) => void;
  onClose?: () => void;
}

export default function SimpleThreeEditor({ spaceId, onSave, onClose }: SimpleThreeEditorProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [r3f, setR3F] = useState<any>(null);
  const [selectedObject, setSelectedObject] = useState<any>(null);
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale'>('translate');
  const sceneRef = useRef<any>(null);
  const rendererRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const controlsRef = useRef<any>(null);
  const transformControlsRef = useRef<any>(null);

  useEffect(() => {
    let mounted = true;
    const loadR3F = async () => {
      try {
        const [THREE, { OrbitControls }, { TransformControls }] = await Promise.all([
          import('three'),
          import('three/examples/jsm/controls/OrbitControls.js'),
          import('three/examples/jsm/controls/TransformControls.js'),
        ]);
        
        if (!mounted) return;
        setR3F({ THREE, OrbitControls, TransformControls });
      } catch (err) {
        console.error('Failed to load Three.js:', err);
      }
    };
    loadR3F();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!r3f || !mountRef.current) return;

    const { THREE, OrbitControls, TransformControls } = r3f;
    const container = mountRef.current;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x2a2a2a);
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(5, 5, 5);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 10, 5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Grid
    const gridHelper = new THREE.GridHelper(20, 20);
    scene.add(gridHelper);

    // Axes
    const axesHelper = new THREE.AxesHelper(5);
    scene.add(axesHelper);

    // Sample objects
    const geometry1 = new THREE.BoxGeometry(1, 1, 1);
    const material1 = new THREE.MeshLambertMaterial({ color: 0x00ff00 });
    const cube = new THREE.Mesh(geometry1, material1);
    cube.position.set(-2, 0.5, 0);
    cube.name = 'Green Cube';
    scene.add(cube);

    const geometry2 = new THREE.SphereGeometry(0.7, 16, 16);
    const material2 = new THREE.MeshLambertMaterial({ color: 0xff0000 });
    const sphere = new THREE.Mesh(geometry2, material2);
    sphere.position.set(2, 0.7, 0);
    sphere.name = 'Red Sphere';
    scene.add(sphere);

    const geometry3 = new THREE.CylinderGeometry(0.5, 0.5, 2, 16);
    const material3 = new THREE.MeshLambertMaterial({ color: 0x0000ff });
    const cylinder = new THREE.Mesh(geometry3, material3);
    cylinder.position.set(0, 1, -2);
    cylinder.name = 'Blue Cylinder';
    scene.add(cylinder);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    // Transform controls
    const transformControls = new TransformControls(camera, renderer.domElement);
    transformControls.addEventListener('dragging-changed', (event) => {
      controls.enabled = !event.value;
    });
    transformControls.addEventListener('objectChange', () => {
      if (transformControls.object) {
        console.log('Object transformed:', transformControls.object.name, transformControls.object.position, transformControls.object.rotation, transformControls.object.scale);
      }
    });
    scene.add(transformControls);
    transformControlsRef.current = transformControls;

    // Raycaster for selection
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onMouseClick = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);

      if (intersects.length > 0) {
        const object = intersects[0].object;
        if (object.type === 'Mesh' && object !== gridHelper && object !== axesHelper) {
          setSelectedObject(object);
          transformControls.attach(object);
        }
      } else {
        setSelectedObject(null);
        transformControls.detach();
      }
    };

    renderer.domElement.addEventListener('click', onMouseClick);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize handler
    const handleResize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('click', onMouseClick);
      container.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, [r3f]);

  useEffect(() => {
    if (transformControlsRef.current) {
      transformControlsRef.current.setMode(transformMode);
    }
  }, [transformMode]);

  const handleSave = () => {
    if (!sceneRef.current) return;
    
    const sceneData = {
      objects: sceneRef.current.children
        .filter((child: any) => child.type === 'Mesh' && child.name)
        .map((child: any) => ({
          name: child.name,
          type: child.geometry.type,
          position: child.position.toArray(),
          rotation: child.rotation.toArray(),
          scale: child.scale.toArray(),
          color: child.material.color.getHex(),
        })),
    };
    
    console.log('Saving scene data:', sceneData);
    onSave?.(sceneData);
  };

  const addObject = (type: 'box' | 'sphere' | 'cylinder') => {
    if (!r3f || !sceneRef.current) return;

    const { THREE } = r3f;
    let geometry: any;
    let name: string;

    switch (type) {
      case 'box':
        geometry = new THREE.BoxGeometry(1, 1, 1);
        name = `Box ${Date.now()}`;
        break;
      case 'sphere':
        geometry = new THREE.SphereGeometry(0.7, 16, 16);
        name = `Sphere ${Date.now()}`;
        break;
      case 'cylinder':
        geometry = new THREE.CylinderGeometry(0.5, 0.5, 2, 16);
        name = `Cylinder ${Date.now()}`;
        break;
    }

    const material = new THREE.MeshLambertMaterial({ 
      color: Math.random() * 0xffffff 
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(
      (Math.random() - 0.5) * 8,
      Math.random() * 3 + 0.5,
      (Math.random() - 0.5) * 8
    );
    mesh.name = name;
    sceneRef.current.add(mesh);
  };

  const deleteSelected = () => {
    if (selectedObject && sceneRef.current) {
      sceneRef.current.remove(selectedObject);
      transformControlsRef.current?.detach();
      setSelectedObject(null);
    }
  };

  if (!r3f) {
    return (
      <div className="h-full flex items-center justify-center bg-neutral-800 text-white">
        <div className="text-center">
          <div className="mb-4">🔧</div>
          <div>Loading Simple Three.js Editor...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-neutral-900">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-3 bg-neutral-800 border-b border-neutral-700">
        <div className="flex items-center gap-2">
          <h3 className="text-white font-medium">Simple Three.js Editor</h3>
          <span className="text-neutral-400 text-sm">Space: {spaceId}</span>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Transform Mode */}
          <div className="flex bg-neutral-700 rounded">
            {(['translate', 'rotate', 'scale'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setTransformMode(mode)}
                className={`px-3 py-1 text-sm capitalize ${
                  transformMode === mode 
                    ? 'bg-blue-600 text-white' 
                    : 'text-neutral-300 hover:text-white'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          {/* Add Objects */}
          <div className="flex gap-1">
            <button
              onClick={() => addObject('box')}
              className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded"
              title="Add Box"
            >
              📦
            </button>
            <button
              onClick={() => addObject('sphere')}
              className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded"
              title="Add Sphere"
            >
              🔴
            </button>
            <button
              onClick={() => addObject('cylinder')}
              className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded"
              title="Add Cylinder"
            >
              🥫
            </button>
          </div>

          {/* Actions */}
          <button
            onClick={deleteSelected}
            disabled={!selectedObject}
            className="px-3 py-1 bg-red-600 hover:bg-red-700 disabled:bg-neutral-600 disabled:cursor-not-allowed text-white text-sm rounded"
          >
            Delete
          </button>
          
          <button
            onClick={handleSave}
            className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded"
          >
            Save
          </button>
          
          {onClose && (
            <button
              onClick={onClose}
              className="px-3 py-1 bg-neutral-600 hover:bg-neutral-700 text-white text-sm rounded"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Info Panel */}
      {selectedObject && (
        <div className="p-2 bg-neutral-800 border-b border-neutral-700 text-sm text-white">
          <strong>Selected:</strong> {selectedObject.name} | 
          <span className="ml-2">Position: ({selectedObject.position.x.toFixed(2)}, {selectedObject.position.y.toFixed(2)}, {selectedObject.position.z.toFixed(2)})</span>
        </div>
      )}

      {/* 3D Viewport */}
      <div ref={mountRef} className="flex-1 relative">
        <div className="absolute bottom-3 left-3 text-xs text-neutral-400 bg-black/50 px-2 py-1 rounded">
          Click objects to select • {transformMode} mode • Mouse: orbit, zoom, pan
        </div>
      </div>
    </div>
  );
}
