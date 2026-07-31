import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createDragon } from '../dragons/DragonFactory.js';

// One-shot 3D snapshots of dragon types for the store grid: each type is
// built with the factory, posed at a 3/4 angle in a tiny offscreen scene, and
// rendered once to a PNG data URL. Snapshots beat live per-tile renderers —
// the browser caps concurrent WebGL contexts well below the 16 the grid needs.

const SIZE = 256; // square pixels per thumbnail

/** Render every type in `types` once; returns Map<type.id, dataURL>. */
export function makeDragonThumbnails(types) {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true, // transparent background so tiles show through
    preserveDrawingBuffer: true, // needed for toDataURL after render
  });
  renderer.setSize(SIZE, SIZE, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xdfefff, 0x506b50, 0.9));
  const sun = new THREE.DirectionalLight(0xfff2cf, 1.6);
  sun.position.set(60, 90, 80);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(35, 1, 1, 500);

  const box = new THREE.Box3();
  const center = new THREE.Vector3();
  const sphere = new THREE.Sphere();
  const thumbs = new Map();

  for (const type of types) {
    const dragon = createDragon(type);
    dragon.group.rotation.y = Math.PI * 0.82; // 3/4 view, facing viewer-left
    dragon.update(0.016); // settle the idle pose once
    scene.add(dragon.group);

    // Frame the camera on the dragon's bounding sphere so every type fills
    // the tile the same amount regardless of its scale.
    box.setFromObject(dragon.group);
    box.getCenter(center);
    box.getBoundingSphere(sphere);
    const dist = (sphere.radius * 1.15) / Math.tan((camera.fov * Math.PI) / 360);
    camera.position.set(center.x, center.y + sphere.radius * 0.35, center.z + dist);
    camera.lookAt(center);

    renderer.render(scene, camera);
    thumbs.set(type.id, canvas.toDataURL('image/png'));

    scene.remove(dragon.group);
    dragon.group.traverse((obj) => {
      obj.geometry?.dispose();
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
      else obj.material?.dispose();
    });
  }

  pmrem.dispose();
  renderer.dispose();
  return thumbs;
}
