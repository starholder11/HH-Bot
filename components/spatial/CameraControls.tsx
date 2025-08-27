"use client";
import { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { FlyControls, FirstPersonControls, PointerLockControls } from 'three/examples/jsm/Addons.js';
import * as THREE from 'three';

export type CameraMode = 'orbit' | 'fly' | 'firstPerson' | 'pointerLock';

interface CameraControlsProps {
  mode: CameraMode;
  enabled?: boolean;
}

export function FlyControlsComponent({ enabled = true }: { enabled?: boolean }) {
  const { camera, gl } = useThree();
  const controlsRef = useRef<FlyControls>();
  const clockRef = useRef(new THREE.Clock());

  useEffect(() => {
    if (!enabled) return;

    const controls = new FlyControls(camera, gl.domElement);
    controls.movementSpeed = 50;
    controls.rollSpeed = Math.PI / 12;
    controls.autoForward = false;
    controls.dragToLook = false;
    controlsRef.current = controls;

    return () => {
      controls.dispose();
    };
  }, [camera, gl, enabled]);

  useFrame(() => {
    if (controlsRef.current && enabled) {
      controlsRef.current.update(clockRef.current.getDelta());
    }
  });

  return null;
}

export function FirstPersonControlsComponent({ enabled = true }: { enabled?: boolean }) {
  const { camera, gl } = useThree();
  const controlsRef = useRef<FirstPersonControls>();
  const clockRef = useRef(new THREE.Clock());

  useEffect(() => {
    if (!enabled) return;

    const controls = new FirstPersonControls(camera, gl.domElement);
    controls.lookSpeed = 0.1;
    controls.movementSpeed = 20;
    controls.noFly = true;
    controls.lookVertical = true;
    controls.constrainVertical = true;
    controls.verticalMin = 1.0;
    controls.verticalMax = 2.0;
    controlsRef.current = controls;

    return () => {
      controls.dispose();
    };
  }, [camera, gl, enabled]);

  useFrame(() => {
    if (controlsRef.current && enabled) {
      controlsRef.current.update(clockRef.current.getDelta());
    }
  });

  return null;
}

export function PointerLockControlsComponent({ enabled = true }: { enabled?: boolean }) {
  const { camera, gl } = useThree();
  const controlsRef = useRef<PointerLockControls>();
  const velocity = useRef(new THREE.Vector3());
  const direction = useRef(new THREE.Vector3());
  const keysPressed = useRef<{ [key: string]: boolean }>({});

  useEffect(() => {
    if (!enabled) return;

    const controls = new PointerLockControls(camera, gl.domElement);
    controlsRef.current = controls;

    const handleKeyDown = (event: KeyboardEvent) => {
      keysPressed.current[event.code] = true;
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      keysPressed.current[event.code] = false;
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    return () => {
      controls.dispose();
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [camera, gl, enabled]);

  useFrame((state, delta) => {
    if (!controlsRef.current || !enabled) return;

    const controls = controlsRef.current;
    const keys = keysPressed.current;

    velocity.current.x -= velocity.current.x * 10.0 * delta;
    velocity.current.z -= velocity.current.z * 10.0 * delta;
    velocity.current.y -= 9.8 * 100.0 * delta; // gravity

    direction.current.z = Number(keys['KeyW']) - Number(keys['KeyS']);
    direction.current.x = Number(keys['KeyD']) - Number(keys['KeyA']);
    direction.current.normalize();

    if (keys['KeyW'] || keys['KeyS']) velocity.current.z -= direction.current.z * 400.0 * delta;
    if (keys['KeyA'] || keys['KeyD']) velocity.current.x -= direction.current.x * 400.0 * delta;
    if (keys['Space']) velocity.current.y = 350;

    controls.moveRight(-velocity.current.x * delta);
    controls.moveForward(-velocity.current.z * delta);
    controls.getObject().position.y += velocity.current.y * delta;

    if (controls.getObject().position.y < 10) {
      velocity.current.y = 0;
      controls.getObject().position.y = 10;
    }
  });

  return null;
}

export function CameraControlsManager({ mode, enabled = true }: CameraControlsProps) {
  return (
    <>
      {mode === 'fly' && <FlyControlsComponent enabled={enabled} />}
      {mode === 'firstPerson' && <FirstPersonControlsComponent enabled={enabled} />}
      {mode === 'pointerLock' && <PointerLockControlsComponent enabled={enabled} />}
    </>
  );
}
