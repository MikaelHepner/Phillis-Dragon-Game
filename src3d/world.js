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

function buildTree({ x, z }) {
  const tree = new THREE.Group();

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 3, 14, 7),
    new THREE.MeshLambertMaterial({ color: 0x7a4a21 })
  );
  trunk.position.y = 7;
  trunk.castShadow = true;
  tree.add(trunk);

  const foliage = new THREE.Mesh(
    new THREE.ConeGeometry(13, 28, 8),
    new THREE.MeshLambertMaterial({ color: 0x2e8b32, flatShading: true })
  );
  foliage.position.y = 26;
  foliage.castShadow = true;
  tree.add(foliage);

  tree.position.set(x, 0, z);
  tree.rotation.y = Math.random() * Math.PI * 2;
  const s = 0.85 + Math.random() * 0.5;
  tree.scale.setScalar(s);
  return tree;
}

function buildRock({ x, z }) {
  const rock = new THREE.Mesh(
    new THREE.IcosahedronGeometry(5, 0),
    new THREE.MeshLambertMaterial({ color: 0x8d8d94, flatShading: true })
  );
  rock.position.set(x, 2.5, z);
  rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
  rock.scale.set(0.7 + Math.random() * 0.8, 0.5 + Math.random() * 0.6, 0.7 + Math.random() * 0.8);
  rock.castShadow = true;
  rock.receiveShadow = true;
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

  const trees = [];
  for (let i = 0; i < TREE_COUNT; i++) {
    const tree = buildTree(randomSpawnPosition());
    trees.push(tree);
    scene.add(tree);
  }

  const rocks = [];
  for (let i = 0; i < ROCK_COUNT; i++) {
    const rock = buildRock(randomSpawnPosition());
    rocks.push(rock);
    scene.add(rock);
  }

  return {
    water,
    trees,
    rocks,
    update(time) {
      // Gentle tide so the water edge feels alive.
      water.position.y = -4 + Math.sin(time * 0.8) * 0.6;
    },
  };
}
