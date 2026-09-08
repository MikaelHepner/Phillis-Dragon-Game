import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { DRAGON_TYPES } from './data/dragonTypes.js';
import { createDragon } from './dragons/DragonFactory.js';
import { setRenderStyle } from './dragons/renderStyle.js';
import { preloadDragonModel } from './dragons/DragonModel.js';

// Dragon gallery debug page: every dragon type from dragonTypes.js in a grid,
// idling, with name/price labels. Toolbar switches the animation for all;
// clicking a dragon triggers its attack lunge. Visual-review tool only —
// nothing here is game code.

const COLS = 6;
const SPACING_X = 70;
const SPACING_Z = 90;

const canvas = document.getElementById('game-canvas');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
// Khronos PBR Neutral: rolls off highlights that used to clip to flat white,
// without the desaturation ACES would cost a deliberately colourful game.
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x3d566e);

// Environment map so metallic/glass/crystal materials have something to reflect.
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

scene.add(new THREE.HemisphereLight(0xdfefff, 0x506b50, 0.7));
const sun = new THREE.DirectionalLight(0xfff2cf, 1.4);
sun.position.set(180, 260, 160);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -350;
sun.shadow.camera.right = 350;
sun.shadow.camera.top = 350;
sun.shadow.camera.bottom = -350;
sun.shadow.camera.far = 900;
scene.add(sun);

// A/B switch between the original faceted low-poly look and the smooth render
// pass. ?style=old|new preselects one (handy for screenshots).
let smooth = new URLSearchParams(location.search).get('style') !== 'old';

function applyRenderStyle() {
  setRenderStyle({ smooth });
  renderer.toneMapping = smooth ? THREE.NeutralToneMapping : THREE.NoToneMapping;
  renderer.toneMappingExposure = smooth ? 1.15 : 1;
}

const rows = Math.ceil(DRAGON_TYPES.length / COLS);
const gridW = (COLS - 1) * SPACING_X;
const gridD = (rows - 1) * SPACING_Z;

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(gridW + 220, gridD + 220),
  new THREE.MeshStandardMaterial({ color: 0x4c9e3f, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Per-dragon display tile so each one reads as its own exhibit.
const tileMat = new THREE.MeshStandardMaterial({ color: 0x5aab4c, roughness: 1 });

function makeLabelSprite(type) {
  const canvas2d = document.createElement('canvas');
  canvas2d.width = 512;
  canvas2d.height = 128;
  const ctx = canvas2d.getContext('2d');
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.beginPath();
  ctx.roundRect(6, 6, 500, 116, 24);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 44px "Comic Sans MS", sans-serif';
  ctx.fillText(type.name, 256, 56);
  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold 32px "Comic Sans MS", sans-serif';
  const sub = type.cost != null ? `${type.cost} Coins` : type.enemy ? 'ENEMY' : 'Starter';
  ctx.fillText(sub, 256, 100);

  const texture = new THREE.CanvasTexture(canvas2d);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  sprite.scale.set(36, 9, 1);
  return sprite;
}

// Grid slot for each type — tiles and labels are built once and stay put;
// only the dragons themselves are rebuilt when the render style flips.
const slots = DRAGON_TYPES.map((type, i) => ({
  type,
  x: (i % COLS) * SPACING_X - gridW / 2,
  z: Math.floor(i / COLS) * SPACING_Z - gridD / 2,
}));

for (const { type, x, z } of slots) {
  const tile = new THREE.Mesh(new THREE.CylinderGeometry(26, 28, 1.6, 24), tileMat);
  tile.position.set(x, 0.8, z);
  tile.receiveShadow = true;
  scene.add(tile);

  const label = makeLabelSprite(type);
  label.position.set(x, 34, z);
  scene.add(label);
}

let dragons = [];
let currentAnim = 'idle';

// Tear down the current grid of dragons and build it again under whatever
// RENDER_STYLE now says. Geometry and materials are per-dragon here (the
// factory builds them fresh each call), so disposing is safe.
function spawnDragons() {
  for (const d of dragons) {
    scene.remove(d.group);
    d.group.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.dispose();
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
    });
  }

  dragons = slots.map(({ type, x, z }) => {
    const dragon = createDragon(type);
    dragon.group.position.set(x, 1.6, z);
    // Dragons are modeled facing +z, which is already toward the camera.
    scene.add(dragon.group);
    dragon.setAnimation(currentAnim);
    return dragon;
  });
}

// ?dragons=proc shows the procedural dragons instead of the glTF model.
await preloadDragonModel({
  enabled: new URLSearchParams(location.search).get('dragons') !== 'proc',
});

applyRenderStyle();
spawnDragons();

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 3000);
camera.position.set(0, 185, gridD / 2 + 265);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 10, 0);
controls.maxPolarAngle = Math.PI / 2.05;
controls.enableDamping = true;

// ?anim=walk|fly|attack|hurt preselects an animation (handy for screenshots).
const preset = new URLSearchParams(location.search).get('anim');
if (preset) dragons.forEach((d) => d.play(preset));

// Toolbar: idle/walk/fly set the base loop for all; attack/hurt fire one-shots.
const buttons = [...document.querySelectorAll('.anim-btn')];
buttons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const name = btn.dataset.anim;
    if (name === 'attack' || name === 'hurt') {
      dragons.forEach((d) => d.play(name));
      return;
    }
    buttons.forEach((b) => b.classList.toggle('active', b === btn));
    currentAnim = name;
    dragons.forEach((d) => d.setAnimation(name));
  });
});

// Render-style A/B: rebuild every dragon under the other look.
const styleBtn = document.getElementById('style-btn');
function paintStyleBtn() {
  styleBtn.textContent = smooth ? '✨ New look' : '🔲 Old look';
  styleBtn.classList.toggle('active', smooth);
}
paintStyleBtn();
styleBtn.addEventListener('click', () => {
  smooth = !smooth;
  applyRenderStyle();
  spawnDragons();
  paintStyleBtn();
});

// Click a dragon → it attacks.
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downAt = null;
canvas.addEventListener('pointerdown', (e) => {
  downAt = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointerup', (e) => {
  // Ignore orbit drags — only treat near-stationary presses as clicks.
  if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) return;
  pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(dragons.map((d) => d.group), true);
  if (hits.length === 0) return;
  let obj = hits[0].object;
  while (obj && !obj.name.startsWith('dragon-')) obj = obj.parent;
  const dragon = dragons.find((d) => d.group === obj);
  if (dragon) dragon.play('attack');
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  dragons.forEach((d) => d.update(dt));
  controls.update();
  renderer.render(scene, camera);
});
