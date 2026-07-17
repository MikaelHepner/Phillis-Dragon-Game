import * as THREE from 'three';
import { createWorld, WORLD_CENTER } from './world.js';
import { CameraRig } from './cameraRig.js';

const canvas = document.getElementById('game-canvas');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x7ec8e3);
scene.fog = new THREE.Fog(0x7ec8e3, 900, 2600);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  1,
  5000
);

const world = createWorld(scene);

// Placeholder "player" — replaced by the starter dragon in Batch 3.
const player = new THREE.Mesh(
  new THREE.CapsuleGeometry(6, 12, 6, 12),
  new THREE.MeshLambertMaterial({ color: 0xf2a541 })
);
player.position.set(WORLD_CENTER.x, 12, WORLD_CENTER.z);
player.castShadow = true;
scene.add(player);

const cameraRig = new CameraRig(camera, player, canvas);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Lightweight FPS readout in the HTML HUD.
const fpsEl = document.getElementById('fps');
let frames = 0;
let fpsTimer = 0;

const clock = new THREE.Clock();

function animate() {
  const dt = clock.getDelta();
  const time = clock.elapsedTime;

  world.update(time);

  // Idle bob so the scene reads as alive before real animations arrive.
  player.position.y = 12 + Math.sin(time * 2.2) * 1.2;

  cameraRig.update();
  renderer.render(scene, camera);

  frames++;
  fpsTimer += dt;
  if (fpsTimer >= 1) {
    fpsEl.textContent = `${Math.round(frames / fpsTimer)} fps`;
    frames = 0;
    fpsTimer = 0;
  }
}

renderer.setAnimationLoop(animate);
