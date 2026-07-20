import * as THREE from 'three';

// World constants per GAME_DESIGN.md §2 — same coordinate space as the 2D game:
// x/z in [0, 2000], player spawn at the center (1000, 1000).
export const WORLD_SIZE = 2000;
export const WORLD_CENTER = new THREE.Vector3(WORLD_SIZE / 2, 0, WORLD_SIZE / 2);

const TREE_COUNT = 30;
const ROCK_COUNT = 20;
const SPAWN_MIN = 200;
const SPAWN_MAX = 1800;
const MIN_DIST_FROM_CENTER = 300;

// Random scatter position per GAME_DESIGN.md §2: 200–1800 range, ≥300 from center.
function randomSpawnPosition() {
  for (;;) {
    const x = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
    const z = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
    const dx = x - WORLD_CENTER.x;
    const dz = z - WORLD_CENTER.z;
    if (Math.hypot(dx, dz) >= MIN_DIST_FROM_CENTER) {
      return { x, z };
    }
  }
}

function makeGrassTexture() {
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
    ctx.fillStyle = shades[(Math.random() * shades.length) | 0];
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.fillRect(x, y, 2 + Math.random() * 3, 2 + Math.random() * 3);
  }
  // A few grass blades.
  ctx.strokeStyle = '#2f6b27';
  ctx.lineWidth = 1;
  for (let i = 0; i < 220; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 3, y - 4 - Math.random() * 4);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(WORLD_SIZE / 100, WORLD_SIZE / 100);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function buildGround(scene) {
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE),
    new THREE.MeshLambertMaterial({ map: makeGrassTexture() })
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

function buildTree({ x, z }) {
  const tree = new THREE.Group();

  const trunk = new THREE.Mesh(TRUNK_GEO, TRUNK_MAT);
  trunk.position.y = 8;
  trunk.castShadow = true;
  tree.add(trunk);

  // Rounded low-poly canopy: a few overlapping icosphere blobs.
  for (const b of LEAF_BLOBS) {
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(b.r, 0), LEAF_MAT);
    leaf.position.set(b.x, b.y, b.z);
    leaf.rotation.set(Math.random(), Math.random(), Math.random());
    leaf.castShadow = true;
    tree.add(leaf);
  }

  // Apple-bearing: red spheres nestled in the canopy, kept in their own group
  // so the harvest system can hide them on pick and pop them back on regrow
  // (userData.applesGroup).
  const applesGroup = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const apple = new THREE.Mesh(APPLE_GEO, APPLE_MAT);
    const ang = Math.random() * Math.PI * 2;
    const rad = 8 + Math.random() * 6;
    apple.position.set(Math.cos(ang) * rad, 22 + Math.random() * 10, Math.sin(ang) * rad);
    apple.castShadow = true;
    applesGroup.add(apple);
  }
  tree.add(applesGroup);
  tree.userData.applesGroup = applesGroup;

  tree.position.set(x, 0, z);
  tree.rotation.y = Math.random() * Math.PI * 2;
  const s = 0.85 + Math.random() * 0.5;
  tree.scale.setScalar(s);
  // Trunk footprint used for player/companion collision (Batch 3).
  tree.userData.collideRadius = 8 * s;
  return tree;
}

function buildRock({ x, z }) {
  // A cluster of chunks inside a group. The group's scale stays 1 so the
  // harvest system can crumble/regrow the whole rock with a single uniform
  // tween (the flattened look lives on the inner chunks).
  const rock = new THREE.Group();
  const spread = 0.7 + Math.random() * 0.8;
  const chunks = 2 + ((Math.random() * 2) | 0);
  for (let i = 0; i < chunks; i++) {
    const chunk = new THREE.Mesh(new THREE.IcosahedronGeometry(4 + Math.random() * 2, 0), ROCK_MAT);
    chunk.position.set((Math.random() - 0.5) * 6, 2 + Math.random() * 2, (Math.random() - 0.5) * 6);
    chunk.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    chunk.scale.set(spread, 0.55 + Math.random() * 0.5, spread);
    chunk.castShadow = true;
    chunk.receiveShadow = true;
    rock.add(chunk);
  }
  rock.position.set(x, 0, z);
  rock.userData.collideRadius = 6 * spread;
  return rock;
}

function buildLighting(scene) {
  scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x4c7a3a, 0.9));

  const sun = new THREE.DirectionalLight(0xfff2cf, 1.6);
  sun.position.set(WORLD_CENTER.x + 500, 700, WORLD_CENTER.z - 400);
  sun.target.position.copy(WORLD_CENTER);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -1200;
  sun.shadow.camera.right = 1200;
  sun.shadow.camera.top = 1200;
  sun.shadow.camera.bottom = -1200;
  sun.shadow.camera.near = 100;
  sun.shadow.camera.far = 2500;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(sun.target);
}

/**
 * Builds the island shell: lighting, ground, water, and placeholder scenery.
 * Returns handles the game loop animates.
 */
export function createWorld(scene) {
  buildLighting(scene);
  buildGround(scene);
  const water = buildWater(scene);

  // Static obstacles the player/companions can't walk through (Batch 3).
  // Each is a circle on the ground plane: { x, z, radius }.
  const colliders = [];

  const trees = [];
  for (let i = 0; i < TREE_COUNT; i++) {
    const tree = buildTree(randomSpawnPosition());
    trees.push(tree);
    scene.add(tree);
    colliders.push({ x: tree.position.x, z: tree.position.z, radius: tree.userData.collideRadius });
  }

  const rocks = [];
  for (let i = 0; i < ROCK_COUNT; i++) {
    const rock = buildRock(randomSpawnPosition());
    rocks.push(rock);
    scene.add(rock);
    colliders.push({ x: rock.position.x, z: rock.position.z, radius: rock.userData.collideRadius });
  }

  return {
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
