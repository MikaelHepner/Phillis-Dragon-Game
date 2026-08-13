import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// World constants per GAME_DESIGN.md §2 — same coordinate space as the 2D game:
// x/z in [0, 2000], player spawn at the center (1000, 1000).
export const WORLD_SIZE = 2000;
export const WORLD_CENTER = new THREE.Vector3(WORLD_SIZE / 2, 0, WORLD_SIZE / 2);

const TREE_COUNT = 30;
const ROCK_COUNT = 20;
const SPAWN_MIN = 200;
const SPAWN_MAX = 1800;
const MIN_DIST_FROM_CENTER = 300;

// Every random choice in the island — scatter positions, canopy rotations,
// rock chunk shapes — runs through a seeded PRNG (Batch 11). Saving the seed is
// what lets a reloaded save restore *the same island*, not just the same
// inventory. mulberry32: small, fast, good enough for scenery.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomWorldSeed() {
  return Math.floor(Math.random() * 0xffffffff);
}

// Random scatter position per GAME_DESIGN.md §2: 200–1800 range, ≥300 from center.
function randomSpawnPosition(rng) {
  for (;;) {
    const x = SPAWN_MIN + rng() * (SPAWN_MAX - SPAWN_MIN);
    const z = SPAWN_MIN + rng() * (SPAWN_MAX - SPAWN_MIN);
    const dx = x - WORLD_CENTER.x;
    const dz = z - WORLD_CENTER.z;
    if (Math.hypot(dx, dz) >= MIN_DIST_FROM_CENTER) {
      return { x, z };
    }
  }
}

function makeGrassTexture(rng) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#4c9e3f';
  ctx.fillRect(0, 0, size, size);

  // Speckle with lighter/darker greens for a hand-drawn grass feel.
  const shades = ['#57af48', '#448f38', '#63bc52', '#3f8533'];
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = shades[(rng() * shades.length) | 0];
    const x = rng() * size;
    const y = rng() * size;
    ctx.fillRect(x, y, 2 + rng() * 3, 2 + rng() * 3);
  }
  // A few grass blades.
  ctx.strokeStyle = '#2f6b27';
  ctx.lineWidth = 1;
  for (let i = 0; i < 220; i++) {
    const x = rng() * size;
    const y = rng() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rng() - 0.5) * 3, y - 4 - rng() * 4);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(WORLD_SIZE / 100, WORLD_SIZE / 100);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function buildGround(scene, rng) {
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE),
    new THREE.MeshLambertMaterial({ map: makeGrassTexture(rng) })
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(WORLD_CENTER.x, 0, WORLD_CENTER.z);
  grass.receiveShadow = true;
  scene.add(grass);

  // Sandy rim peeking out around the island edge.
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_SIZE + 120, WORLD_SIZE + 120),
    new THREE.MeshLambertMaterial({ color: 0xe0cf90 })
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(WORLD_CENTER.x, -1.5, WORLD_CENTER.z);
  sand.receiveShadow = true;
  scene.add(sand);
}

function buildWater(scene) {
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_SIZE * 4, WORLD_SIZE * 4),
    new THREE.MeshLambertMaterial({ color: 0x2f8fce, transparent: true, opacity: 0.9 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(WORLD_CENTER.x, -4, WORLD_CENTER.z);
  scene.add(water);
  return water;
}

// Shared geometry/materials — one copy reused across every tree/rock so the
// 30 trees + 20 rocks don't each allocate their own buffers.
const TRUNK_GEO = new THREE.CylinderGeometry(2.4, 3.4, 16, 7);
const TRUNK_MAT = new THREE.MeshLambertMaterial({ color: 0x8a5a2b, flatShading: true });
const LEAF_MAT = new THREE.MeshLambertMaterial({ color: 0x37a446, flatShading: true });
const APPLE_GEO = new THREE.SphereGeometry(1.8, 8, 8);
const APPLE_MAT = new THREE.MeshLambertMaterial({ color: 0xe23b2e });
const ROCK_MAT = new THREE.MeshLambertMaterial({ color: 0x8d8d94, flatShading: true });

const LEAF_BLOBS = [
  { r: 13, x: 0, y: 26, z: 0 },
  { r: 9, x: 8, y: 22, z: 3 },
  { r: 9, x: -7, y: 23, z: -4 },
  { r: 8, x: 2, y: 32, z: -3 },
];

// Batch 11 performance pass: scenery used to be one mesh per part (a tree was
// 10 draw calls: trunk + 4 canopy blobs + 5 apples). Parts are now baked into
// merged geometries at build time, so a tree is 2 draw calls and a rock is 1 —
// roughly 400 draw calls saved across the island.
//
// Merging rather than InstancedMesh is deliberate: harvesting animates
// individual trees and rocks (apples shrink out, rocks crumble and regrow) and
// walls destroy specific scenery objects, all of which want a real Object3D
// per node. At 50 objects, merging captures nearly all of the win with none of
// the bookkeeping.
function buildTree({ x, z }, rng) {
  const tree = new THREE.Group();

  // Icosahedrons are non-indexed and cylinders are indexed; mergeGeometries
  // needs one or the other, so the trunk drops its index to match the canopy.
  const trunkGeo = TRUNK_GEO.toNonIndexed().translate(0, 8, 0);

  // Rounded low-poly canopy: a few overlapping icospheres, baked into one blob.
  const leafGeos = LEAF_BLOBS.map((b) => {
    const g = new THREE.IcosahedronGeometry(b.r, 0);
    g.rotateX(rng() * Math.PI * 2);
    g.rotateY(rng() * Math.PI * 2);
    g.rotateZ(rng() * Math.PI * 2);
    g.translate(b.x, b.y, b.z);
    return g;
  });
  const canopyGeo = mergeGeometries(leafGeos);
  leafGeos.forEach((g) => g.dispose());

  // useGroups keeps the trunk and canopy on separate material slots.
  const bodyGeo = mergeGeometries([trunkGeo, canopyGeo], true);
  trunkGeo.dispose();
  canopyGeo.dispose();
  const body = new THREE.Mesh(bodyGeo, [TRUNK_MAT, LEAF_MAT]);
  body.castShadow = true;
  tree.add(body);

  // Apple-bearing: red spheres nestled in the canopy, kept as their own mesh
  // so the harvest system can hide them on pick and pop them back on regrow
  // (userData.applesGroup). They don't cast shadows — they sit inside the
  // canopy's own shadow, so the extra casters would never be seen.
  const appleGeos = [];
  for (let i = 0; i < 5; i++) {
    const ang = rng() * Math.PI * 2;
    const rad = 8 + rng() * 6;
    appleGeos.push(
      APPLE_GEO.clone().translate(Math.cos(ang) * rad, 22 + rng() * 10, Math.sin(ang) * rad)
    );
  }
  const applesGeo = mergeGeometries(appleGeos);
  appleGeos.forEach((g) => g.dispose());
  const apples = new THREE.Mesh(applesGeo, APPLE_MAT);
  tree.add(apples);
  tree.userData.applesGroup = apples;

  tree.position.set(x, 0, z);
  tree.rotation.y = rng() * Math.PI * 2;
  const s = 0.85 + rng() * 0.5;
  tree.scale.setScalar(s);
  // Trunk footprint used for player/companion collision (Batch 3).
  tree.userData.collideRadius = 8 * s;
  return tree;
}

function buildRock({ x, z }, rng) {
  // A cluster of chunks baked into a single mesh. Its scale stays 1 so the
  // harvest system can crumble/regrow the whole rock with one uniform tween
  // (the flattened look is baked into the chunk geometry instead).
  const spread = 0.7 + rng() * 0.8;
  const chunks = 2 + ((rng() * 2) | 0);
  const geos = [];
  for (let i = 0; i < chunks; i++) {
    const g = new THREE.IcosahedronGeometry(4 + rng() * 2, 0);
    g.scale(spread, 0.55 + rng() * 0.5, spread);
    g.rotateX(rng() * Math.PI);
    g.rotateY(rng() * Math.PI);
    g.rotateZ(rng() * Math.PI);
    g.translate((rng() - 0.5) * 6, 2 + rng() * 2, (rng() - 0.5) * 6);
    geos.push(g);
  }
  const rock = new THREE.Mesh(mergeGeometries(geos), ROCK_MAT);
  geos.forEach((g) => g.dispose());
  rock.castShadow = true;
  rock.receiveShadow = true;
  rock.position.set(x, 0, z);
  rock.userData.collideRadius = 6 * spread;
  return rock;
}

function buildLighting(scene) {
  const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x4c7a3a, 0.9);
  scene.add(hemi);

  // Position/colour/intensity are driven by DayNightCycle from the first frame;
  // these are just sane values for the instant before it runs.
  const sun = new THREE.DirectionalLight(0xfff2cf, 1.6);
  sun.position.set(WORLD_CENTER.x + 500, 700, WORLD_CENTER.z - 400);
  sun.target.position.copy(WORLD_CENTER);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.6;
  scene.add(sun);
  scene.add(sun.target);
  return { sun, hemi };
}

/**
 * Builds the island shell: lighting, ground, water, and placeholder scenery.
 * Returns handles the game loop animates.
 *
 * @param {THREE.Scene} scene
 * @param {number} seed  world seed — the same seed always builds the same island
 */
export function createWorld(scene, seed = randomWorldSeed()) {
  const rng = mulberry32(seed);
  const { sun, hemi } = buildLighting(scene);
  buildGround(scene, rng);
  const water = buildWater(scene);

  // Static obstacles the player/companions can't walk through (Batch 3).
  // Each is a circle on the ground plane: { x, z, radius }.
  const colliders = [];

  const trees = [];
  for (let i = 0; i < TREE_COUNT; i++) {
    const tree = buildTree(randomSpawnPosition(rng), rng);
    trees.push(tree);
    scene.add(tree);
    colliders.push({ x: tree.position.x, z: tree.position.z, radius: tree.userData.collideRadius });
  }

  const rocks = [];
  for (let i = 0; i < ROCK_COUNT; i++) {
    const rock = buildRock(randomSpawnPosition(rng), rng);
    rocks.push(rock);
    scene.add(rock);
    colliders.push({ x: rock.position.x, z: rock.position.z, radius: rock.userData.collideRadius });
  }

  return {
    seed,
    sun,
    hemi,
    water,
    trees,
    rocks,
    colliders,
    // Walkable bounds: keep entities a margin inside the ground plane edge.
    bounds: { size: WORLD_SIZE, margin: 40 },
    update(time) {
      // Gentle tide so the water edge feels alive.
      water.position.y = -4 + Math.sin(time * 0.8) * 0.6;
    },
  };
}
