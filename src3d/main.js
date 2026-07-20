import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createWorld, WORLD_CENTER } from './world.js';
import { CameraRig } from './cameraRig.js';
import { createDragon } from './dragons/DragonFactory.js';
import { DRAGON_TYPES_BY_ID } from './data/dragonTypes.js';
import { PlayerController } from './player/PlayerController.js';
import { CompanionManager } from './companions/CompanionManager.js';

const GROUND_Y = 2; // dragons' feet rest here on the grass

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

// Environment map so metallic / glass / crystal dragon skins have something
// to reflect (matches the gallery's setup).
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  1,
  5000
);

const world = createWorld(scene);
const { colliders, bounds } = world;

// — Player: the starter dragon (Phillis) —
const playerDragon = createDragon(DRAGON_TYPES_BY_ID.phillis);
playerDragon.group.position.set(WORLD_CENTER.x, GROUND_Y, WORLD_CENTER.z);
scene.add(playerDragon.group);

const player = new PlayerController(playerDragon, camera, canvas, {
  colliders,
  bounds,
  groundY: GROUND_Y,
});

// — Two test companions trailing the player —
const companions = new CompanionManager({ colliders, bounds, groundY: GROUND_Y });
const testCompanions = ['fire', 'water'];
testCompanions.forEach((id, i) => {
  const dragon = createDragon(DRAGON_TYPES_BY_ID[id]);
  // Spawn just behind the player so they fall into the follow chain.
  dragon.group.position.set(
    WORLD_CENTER.x + (i - 0.5) * 40,
    GROUND_Y,
    WORLD_CENTER.z - 55 - i * 40
  );
  scene.add(dragon.group);
  companions.add(dragon);
});

const cameraRig = new CameraRig(camera, playerDragon.group, canvas);

// Debug hook for automated verification (harmless in normal play).
window.__game = { player, companions, playerDragon };

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
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;

  world.update(time);
  player.update(dt);
  companions.update(dt, player.position);

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
