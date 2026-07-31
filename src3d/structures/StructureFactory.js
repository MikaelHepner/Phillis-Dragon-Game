import * as THREE from 'three';

// Low-poly structure models, built from primitives in code like the rest of
// the 3D game (no textures — AI_HANDOFF.md: everything is code-driven).
// Each build function returns a THREE.Group whose origin sits on the ground;
// `userData` carries { collideRadius, height } so the construction system can
// register colliders and float text without model-specific knowledge.
//
// Scale reference: dragons stand ~20 units, trees ~40, wall tiles are 40×40
// (the 2D game's exact display size).

// — Shared materials (one instance across every structure) —
const MAT = {
  wallCream: new THREE.MeshLambertMaterial({ color: 0xf3e2c0, flatShading: true }),
  timber: new THREE.MeshLambertMaterial({ color: 0x8a5a2b, flatShading: true }),
  roofRed: new THREE.MeshLambertMaterial({ color: 0xc0492e, flatShading: true }),
  stone: new THREE.MeshLambertMaterial({ color: 0x9a9aa2, flatShading: true }),
  stoneDark: new THREE.MeshLambertMaterial({ color: 0x74747c, flatShading: true }),
  roofBlue: new THREE.MeshLambertMaterial({ color: 0x3f6fb5, flatShading: true }),
  doorDark: new THREE.MeshLambertMaterial({ color: 0x3b2a1a }),
  black: new THREE.MeshLambertMaterial({ color: 0x1c1c22 }),
  anvil: new THREE.MeshLambertMaterial({ color: 0x44444c, flatShading: true }),
  ember: new THREE.MeshLambertMaterial({
    color: 0xff7728,
    emissive: 0xff5500,
    emissiveIntensity: 0.9,
  }),
  gold: new THREE.MeshLambertMaterial({ color: 0xd4af37, flatShading: true }),
};

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function cylinder(rTop, rBot, h, mat, x = 0, y = 0, z = 0, seg = 8) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function cone(r, h, mat, x = 0, y = 0, z = 0, seg = 8) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// — Dragon House: timber cottage with a red pyramid roof —
function buildHouse() {
  const g = new THREE.Group();
  g.add(box(36, 26, 32, MAT.wallCream, 0, 13, 0));
  // Timber corner posts.
  for (const [x, z] of [[-17, -15], [17, -15], [-17, 15], [17, 15]]) {
    g.add(box(4, 26, 4, MAT.timber, x, 13, z));
  }
  const roof = cone(30, 20, MAT.roofRed, 0, 36, 0, 4);
  roof.rotation.y = Math.PI / 4;
  g.add(roof);
  g.add(box(10, 14, 2.5, MAT.doorDark, 0, 7, 16.2)); // door (front = +z)
  g.add(box(7, 7, 2, MAT.roofBlue, -12, 16, 16.2)); // window
  g.add(box(7, 7, 2, MAT.roofBlue, 12, 16, 16.2));
  g.userData.collideRadius = 26;
  g.userData.height = 46;
  return g;
}

// — Castle: stone keep, four corner towers, crenellations, gate —
function buildCastle() {
  const g = new THREE.Group();
  g.add(box(56, 44, 56, MAT.stone, 0, 22, 0)); // keep
  // Corner towers with blue cone roofs.
  for (const [x, z] of [[-32, -32], [32, -32], [-32, 32], [32, 32]]) {
    g.add(cylinder(10, 11, 56, MAT.stoneDark, x, 28, z));
    g.add(cone(13, 16, MAT.roofBlue, x, 64, z));
  }
  // Crenellations around the keep top.
  for (let i = -2; i <= 2; i++) {
    g.add(box(8, 6, 6, MAT.stoneDark, i * 12, 47, 26));
    g.add(box(8, 6, 6, MAT.stoneDark, i * 12, 47, -26));
    g.add(box(6, 6, 8, MAT.stoneDark, 26, 47, i * 12));
    g.add(box(6, 6, 8, MAT.stoneDark, -26, 47, i * 12));
  }
  g.add(box(16, 20, 3, MAT.black, 0, 10, 28.2)); // gate arch (front = +z)
  g.add(box(20, 24, 1.5, MAT.stoneDark, 0, 12, 27));
  g.userData.collideRadius = 52;
  g.userData.height = 78;
  return g;
}

// — Tower: tall stone shaft, overhanging platform, merlons (the 2D upgrade) —
function buildTower() {
  const g = new THREE.Group();
  g.add(cylinder(11, 14, 58, MAT.stone, 0, 29, 0));
  g.add(cylinder(17, 17, 8, MAT.stoneDark, 0, 62, 0));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.add(box(6, 7, 6, MAT.stoneDark, Math.cos(a) * 14, 69, Math.sin(a) * 14));
  }
  // Golden arrow slit marker so its job reads at a glance (gold arrows in 2D).
  g.add(box(3, 10, 2, MAT.gold, 0, 46, 12.5));
  g.userData.collideRadius = 18;
  g.userData.height = 74;
  return g;
}

// — Mine: rocky mound with a timber entrance portal (the 2D upgrade) —
function buildMine() {
  const g = new THREE.Group();
  const mound = new THREE.Mesh(new THREE.IcosahedronGeometry(20, 0), MAT.stone);
  mound.position.y = 12;
  mound.scale.set(1.25, 0.85, 1.1);
  mound.castShadow = true;
  mound.receiveShadow = true;
  g.add(mound);
  // Timber portal frame + dark tunnel mouth (front = +z).
  g.add(box(4, 18, 4, MAT.timber, -8, 9, 20));
  g.add(box(4, 18, 4, MAT.timber, 8, 9, 20));
  g.add(box(24, 4, 5, MAT.timber, 0, 19, 20));
  g.add(box(13, 15, 2, MAT.black, 0, 7.5, 19.5));
  // A cart-load of stone chunks by the entrance.
  for (let i = 0; i < 3; i++) {
    const chunk = new THREE.Mesh(new THREE.IcosahedronGeometry(3.2, 0), MAT.stoneDark);
    chunk.position.set(15 + i * 4 - 4, 2.5, 24 - i * 3);
    chunk.castShadow = true;
    g.add(chunk);
  }
  g.userData.collideRadius = 27;
  g.userData.height = 34;
  return g;
}

// — Blacksmith: dark workshop, glowing forge chimney, anvil (the 2D upgrade) —
function buildBlacksmith() {
  const g = new THREE.Group();
  g.add(box(34, 22, 30, MAT.stoneDark, 0, 11, 0));
  const roof = cone(27, 15, MAT.timber, 0, 29, 0, 4);
  roof.rotation.y = Math.PI / 4;
  g.add(roof);
  // Chimney with an ember-glow cap.
  g.add(box(8, 26, 8, MAT.stone, 12, 24, -8));
  g.add(box(6, 3, 6, MAT.ember, 12, 38.5, -8));
  g.add(box(11, 12, 2.5, MAT.doorDark, -6, 6, 15.2)); // wide workshop door
  // Anvil out front on a stump.
  g.add(cylinder(4, 5, 5, MAT.timber, 14, 2.5, 14, 7));
  g.add(box(9, 3.5, 4.5, MAT.anvil, 14, 7, 14));
  g.add(box(3.5, 3, 4, MAT.anvil, 9.5, 6.6, 14));
  g.userData.collideRadius = 28;
  g.userData.height = 42;
  return g;
}

const BUILDERS = {
  house: buildHouse,
  castle: buildCastle,
  tower: buildTower,
  mine: buildMine,
  blacksmith: buildBlacksmith,
};

/**
 * Build the model for a structure state entry: its upgrade class when
 * upgraded (houses transform on upgrade — the 3D read of the 2D tint+label
 * change), otherwise the base house/castle model.
 */
export function createStructureMesh(kind) {
  const builder = BUILDERS[kind];
  if (!builder) throw new Error(`Unknown structure kind: ${kind}`);
  return builder();
}

// — Wall tile: 40×40 footprint (the 2D display size), rook-style merlons.
// Square footprint means the same model works on all four ring edges with no
// rotation. Shared geometry across all tiles — a ring can be 40+ segments.
const WALL_BASE_GEO = new THREE.BoxGeometry(40, 22, 40);
const WALL_MERLON_GEO = new THREE.BoxGeometry(9, 7, 9);
const WALL_MERLON_SPOTS = [
  [-14, -14], [14, -14], [-14, 14], [14, 14], [0, 0],
];

export function createWallTile() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(WALL_BASE_GEO, MAT.stone);
  base.position.y = 11;
  base.castShadow = true;
  base.receiveShadow = true;
  g.add(base);
  for (const [x, z] of WALL_MERLON_SPOTS) {
    const m = new THREE.Mesh(WALL_MERLON_GEO, MAT.stoneDark);
    m.position.set(x, 25.5, z);
    m.castShadow = true;
    g.add(m);
  }
  // Radius 21 at 40-unit spacing: neighbours overlap, so dragons (radius 9)
  // can't slip between tiles, while the 2–3 tile gate stays walkable.
  g.userData.collideRadius = 21;
  g.userData.height = 30;
  return g;
}

// — Floating name label (the 2D game's persistent '🏠 Dragon House' text) —
export function createLabelSprite(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 30px "Comic Sans MS", "Segoe UI", sans-serif';
  const w = Math.min(248, ctx.measureText(text).width + 28);
  // Rounded dark pill behind white text, like the 2D labels.
  ctx.fillStyle = 'rgba(26, 26, 26, 0.75)';
  ctx.beginPath();
  ctx.roundRect((256 - w) / 2, 8, w, 48, 14);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 34);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false })
  );
  sprite.scale.set(56, 14, 1);
  return sprite;
}
