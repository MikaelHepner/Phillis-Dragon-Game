import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BIOMES, blobOutline, randomPointInBiome } from './biomeMap.js';

// Biome scenery: the ground patches, plants, rocks, lava and ambience that turn
// two corners of the meadow into a jungle and a volcanic fire field. Layout
// math lives in biomeMap.js; this file only builds meshes.
//
// Same conventions as world.js: everything random goes through the seeded rng
// so a saved seed rebuilds the same island, shared geometry/materials are
// hoisted to module scope, and each object's parts are baked into as few
// meshes as the harvest animations allow.

const JUNGLE = {
  treeCount: 16,
  fernCount: 26,
  groundY: 0.35,
};

const FIRE = {
  emberRockCount: 11,
  lavaPoolCount: 4,
  groundY: 0.35,
  volcanoRadius: 120,
  volcanoHeight: 105,
  // Lava contact damage — a touch weaker than barbed wire (5 HP per 0.8s) but
  // covering a much bigger footprint, so it still shreds a black dragon that
  // wanders through. Only enemies take hazard damage (EnemyManager); friendlies
  // are merely kept out by the matching collider.
  lava: { damage: 4, tickSec: 0.7, label: '🔥 Lava!' },
  emberCount: 140,
  emberRise: 70,
};

// — Ground textures ———————————————————————————————————————————————

function makeCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function finishTexture(canvas, unitsPerTile) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  // ShapeGeometry UVs are the shape's own (world) coordinates, so one repeat
  // per `unitsPerTile` world units gives the same texel density as the grass.
  texture.repeat.set(1 / unitsPerTile, 1 / unitsPerTile);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeJungleTexture(rng) {
  const size = 256;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#2e6b2a';
  ctx.fillRect(0, 0, size, size);

  // Mossy speckle, darker and bluer than the meadow.
  const shades = ['#2a5f25', '#367a30', '#255a22', '#3d8a36'];
  for (let i = 0; i < 1500; i++) {
    ctx.fillStyle = shades[(rng() * shades.length) | 0];
    ctx.fillRect(rng() * size, rng() * size, 2 + rng() * 4, 2 + rng() * 4);
  }
  // Leaf litter: little brown ovals.
  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = rng() < 0.5 ? '#6b4a22' : '#8a6a2c';
    ctx.beginPath();
    ctx.ellipse(rng() * size, rng() * size, 2 + rng() * 2, 1 + rng(), rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // Long grass blades.
  ctx.strokeStyle = '#1f4a1c';
  ctx.lineWidth = 1;
  for (let i = 0; i < 260; i++) {
    const x = rng() * size;
    const y = rng() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rng() - 0.5) * 4, y - 6 - rng() * 6);
    ctx.stroke();
  }
  return finishTexture(canvas, 100);
}

function makeFireTexture(rng) {
  const size = 256;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#3a3034';
  ctx.fillRect(0, 0, size, size);

  // Basalt speckle.
  const shades = ['#332a2e', '#45393d', '#2b2326', '#4d4145'];
  for (let i = 0; i < 1600; i++) {
    ctx.fillStyle = shades[(rng() * shades.length) | 0];
    ctx.fillRect(rng() * size, rng() * size, 2 + rng() * 4, 2 + rng() * 4);
  }
  // Ash patches.
  ctx.fillStyle = 'rgba(120, 110, 112, 0.35)';
  for (let i = 0; i < 18; i++) {
    ctx.beginPath();
    ctx.ellipse(rng() * size, rng() * size, 6 + rng() * 12, 4 + rng() * 8, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // Glowing cracks: a few jagged polylines, orange core over a dark halo.
  for (let i = 0; i < 9; i++) {
    let x = rng() * size;
    let y = rng() * size;
    const pts = [[x, y]];
    const steps = 4 + ((rng() * 4) | 0);
    for (let s = 0; s < steps; s++) {
      x += (rng() - 0.5) * 34;
      y += (rng() - 0.5) * 34;
      pts.push([x, y]);
    }
    for (const [w, col] of [
      [4, '#1a1214'],
      [2, '#ff6a1a'],
      [1, '#ffc24a'],
    ]) {
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const [px, py] of pts.slice(1)) ctx.lineTo(px, py);
      ctx.stroke();
    }
  }
  return finishTexture(canvas, 100);
}

// — Ground patch —————————————————————————————————————————————————

// A flat shape in the XZ plane from a ring of [x, z] points. ShapeGeometry
// builds in (x, y); rotating +90° about X maps (x, y) → (x, 0, y). That flips
// the face downward, so the material is double-sided.
function flatShapeGeo(points) {
  const shape = new THREE.Shape();
  points.forEach(([x, z], i) => (i === 0 ? shape.moveTo(x, z) : shape.lineTo(x, z)));
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape, 1);
  geo.rotateX(Math.PI / 2);
  return geo;
}

function buildPatch(biome, rng, texture, y) {
  const geo = flatShapeGeo(blobOutline(biome, rng, 44));
  const mat = new THREE.MeshLambertMaterial({ map: texture, side: THREE.DoubleSide });
  const patch = new THREE.Mesh(geo, mat);
  patch.position.y = y;
  patch.receiveShadow = true;
  return patch;
}

// Jittered disc centred on the origin — lava pools and the volcano crater.
function blobDiscGeo(radius, rng, segments = 14) {
  const pts = [];
  for (let i = 0; i < segments; i++) {
    const ang = (i / segments) * Math.PI * 2;
    const r = radius * (0.78 + rng() * 0.32);
    pts.push([Math.cos(ang) * r, Math.sin(ang) * r]);
  }
  return flatShapeGeo(pts);
}

// — Jungle ————————————————————————————————————————————————————————

const PALM_TRUNK_MAT = new THREE.MeshLambertMaterial({ color: 0x9a6a3a, flatShading: true });
const FROND_MAT = new THREE.MeshLambertMaterial({ color: 0x2f9a44, flatShading: true });
const COCONUT_GEO = new THREE.SphereGeometry(2.2, 7, 6);
const COCONUT_MAT = new THREE.MeshLambertMaterial({ color: 0x5a3a1c });
const FERN_MAT = new THREE.MeshLambertMaterial({
  color: 0x3fae4e,
  flatShading: true,
  side: THREE.DoubleSide,
});

// One frond: a flattened, elongated icosahedron so it stays jagged/low-poly.
function frondGeo(rng, length) {
  const g = new THREE.IcosahedronGeometry(1, 0);
  g.scale(length, 1.6, length * 0.28);
  g.translate(length * 0.55, 0, 0);
  g.rotateZ(-0.35 - rng() * 0.25); // droop
  return g;
}

/**
 * Palm-style jungle tree: tall leaning trunk, a crown of drooping fronds, and
 * a cluster of coconuts the harvest system hides/regrows (userData.fruitGroup).
 * Yields wood.
 */
export function buildJungleTree({ x, z }, rng) {
  const tree = new THREE.Group();
  const height = 34 + rng() * 14;
  const lean = (rng() - 0.5) * 0.24;

  // Trunk: stacked, slightly narrowing segments read as a ringed palm trunk.
  const trunkParts = [];
  const segs = 5;
  for (let i = 0; i < segs; i++) {
    const t = i / segs;
    const g = new THREE.CylinderGeometry(2.1 - t * 0.6, 2.5 - t * 0.6, height / segs + 0.6, 7).toNonIndexed();
    g.translate(0, (i + 0.5) * (height / segs), 0);
    trunkParts.push(g);
  }
  const trunkGeo = mergeGeometries(trunkParts);
  trunkParts.forEach((g) => g.dispose());
  trunkGeo.rotateZ(lean);

  // Crown of fronds radiating from the trunk top.
  const top = new THREE.Vector3(0, height, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), lean);
  const frondParts = [];
  const count = 7 + ((rng() * 3) | 0);
  for (let i = 0; i < count; i++) {
    const g = frondGeo(rng, 16 + rng() * 8);
    g.rotateY((i / count) * Math.PI * 2 + rng() * 0.4);
    g.translate(top.x, top.y + 1, top.z);
    frondParts.push(g);
  }
  const frondsGeo = mergeGeometries(frondParts);
  frondParts.forEach((g) => g.dispose());

  const bodyGeo = mergeGeometries([trunkGeo, frondsGeo], true);
  trunkGeo.dispose();
  frondsGeo.dispose();
  const body = new THREE.Mesh(bodyGeo, [PALM_TRUNK_MAT, FROND_MAT]);
  body.castShadow = true;
  tree.add(body);

  // Coconuts hugging the trunk top.
  const nutGeos = [];
  for (let i = 0; i < 3; i++) {
    const ang = rng() * Math.PI * 2;
    nutGeos.push(
      COCONUT_GEO.clone().translate(
        top.x + Math.cos(ang) * 3.2,
        top.y - 2.5 - rng() * 2,
        top.z + Math.sin(ang) * 3.2
      )
    );
  }
  const nutsGeo = mergeGeometries(nutGeos);
  nutGeos.forEach((g) => g.dispose());
  const nuts = new THREE.Mesh(nutsGeo, COCONUT_MAT);
  tree.add(nuts);
  tree.userData.fruitGroup = nuts;

  tree.position.set(x, 0, z);
  tree.rotation.y = rng() * Math.PI * 2;
  const s = 0.9 + rng() * 0.4;
  tree.scale.setScalar(s);
  tree.userData.collideRadius = 5 * s;
  return tree;
}

// Ferns are pure decoration with no collider or per-object animation, so a
// whole biome's worth is baked into one mesh (a single draw call).
function fernGeo(rng) {
  const parts = [];
  const blades = 6 + ((rng() * 4) | 0);
  for (let i = 0; i < blades; i++) {
    const len = 7 + rng() * 5;
    const g = new THREE.ConeGeometry(1.6, len, 3).toNonIndexed();
    g.translate(0, len / 2, 0);
    g.rotateX(0.9 + rng() * 0.5); // fan outward
    g.rotateY((i / blades) * Math.PI * 2 + rng() * 0.3);
    parts.push(g);
  }
  const g = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return g;
}

function buildFerns(biome, rng, count) {
  const geos = [];
  for (let i = 0; i < count; i++) {
    const { x, z } = randomPointInBiome(biome, rng, { maxR: 0.9 });
    const g = fernGeo(rng);
    const s = 0.8 + rng() * 0.7;
    g.scale(s, s, s);
    g.rotateY(rng() * Math.PI * 2);
    g.translate(x, 0, z);
    geos.push(g);
  }
  const merged = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  const ferns = new THREE.Mesh(merged, FERN_MAT);
  ferns.castShadow = true;
  return ferns;
}

// — Fire fields ———————————————————————————————————————————————————

// Kept mid-grey rather than 'black': anything below ~0x50 in sRGB is near
// zero in linear light and renders as a flat silhouette on the shaded side.
const BASALT_MAT = new THREE.MeshLambertMaterial({ color: 0x6a5c62, flatShading: true });
// The cone gets its own copy with a faint heat glow so it never goes fully dark.
const VOLCANO_MAT = new THREE.MeshLambertMaterial({
  color: 0x5c4a50,
  emissive: 0x2a0d06,
  flatShading: true,
});
// Lava/ember base colours are deliberately dark: under the sun a bright base
// washes out to salmon, so the molten look comes from the emissive term.
const EMBER_MAT = new THREE.MeshLambertMaterial({
  color: 0xc04010,
  emissive: 0xff4a08,
  emissiveIntensity: 1.5,
  flatShading: true,
});
const LAVA_MAT = new THREE.MeshLambertMaterial({
  color: 0xb03a0c,
  emissive: 0xff4a08,
  emissiveIntensity: 1.6,
  side: THREE.DoubleSide,
});
const CRUST_MAT = new THREE.MeshLambertMaterial({
  color: 0x3a2c30,
  flatShading: true,
  side: THREE.DoubleSide,
});
const EMBER_PARTICLE_MAT = new THREE.PointsMaterial({
  color: 0xffa040,
  size: 3.2,
  transparent: true,
  opacity: 0.9,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

/**
 * Ember rock: a basalt cluster with a glowing ember core poking through. Same
 * harvest contract as a meadow rock (uniform scale tween on crumble/regrow).
 * Yields extra coins plus stone.
 */
export function buildEmberRock({ x, z }, rng) {
  const spread = 0.75 + rng() * 0.8;
  const chunks = 2 + ((rng() * 3) | 0);
  const basalt = [];
  for (let i = 0; i < chunks; i++) {
    const g = new THREE.IcosahedronGeometry(4 + rng() * 2.5, 0);
    g.scale(spread, 0.6 + rng() * 0.5, spread);
    g.rotateX(rng() * Math.PI);
    g.rotateY(rng() * Math.PI);
    g.rotateZ(rng() * Math.PI);
    g.translate((rng() - 0.5) * 6, 2 + rng() * 2, (rng() - 0.5) * 6);
    basalt.push(g);
  }
  const basaltGeo = mergeGeometries(basalt);
  basalt.forEach((g) => g.dispose());

  // Ember core: a few bright shards riding on top of the chunks so the glow
  // is visible from the game's high camera.
  const embers = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.IcosahedronGeometry(2.4 + rng() * 1.2, 0);
    g.rotateY(rng() * Math.PI);
    g.translate((rng() - 0.5) * 6, 4.5 + rng() * 3, (rng() - 0.5) * 6);
    embers.push(g);
  }
  const emberGeo = mergeGeometries(embers);
  embers.forEach((g) => g.dispose());

  const geo = mergeGeometries([basaltGeo, emberGeo], true);
  basaltGeo.dispose();
  emberGeo.dispose();
  const rock = new THREE.Mesh(geo, [BASALT_MAT, EMBER_MAT]);
  rock.castShadow = true;
  rock.receiveShadow = true;
  rock.position.set(x, 0, z);
  rock.userData.collideRadius = 6.5 * spread;
  return rock;
}

/**
 * Lava pool: a glowing blob with a dark crust rim. Returns the mesh plus the
 * matching hazard/collider circles. userData.lavaMaterial is pulsed by the
 * biome update loop.
 */
export function buildLavaPool({ x, z }, rng) {
  const radius = 26 + rng() * 16;
  const group = new THREE.Group();

  const crust = new THREE.Mesh(blobDiscGeo(radius * 1.22, rng, 16), CRUST_MAT);
  crust.position.y = 0.55;
  crust.receiveShadow = true;
  group.add(crust);

  const lavaMat = LAVA_MAT.clone();
  const lava = new THREE.Mesh(blobDiscGeo(radius, rng, 14), lavaMat);
  lava.position.y = 0.8;
  group.add(lava);

  group.position.set(x, 0, z);
  group.userData.lavaMaterial = lavaMat;
  group.userData.radius = radius;
  return {
    group,
    collider: { x, z, radius: radius * 0.9 },
    hazard: { x, z, radius: radius * 1.05, ...FIRE.lava },
  };
}

/** The volcano cone at the heart of the fire biome, with a glowing crater. */
function buildVolcano(biome, rng) {
  const group = new THREE.Group();
  const R = FIRE.volcanoRadius;
  const H = FIRE.volcanoHeight;

  const cone = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.36, R, H, 11, 1, true), VOLCANO_MAT);
  // Rough up the rim/slopes so it isn't a perfect lampshade.
  const pos = cone.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const k = 1 + (rng() - 0.5) * 0.12;
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
    pos.setY(i, pos.getY(i) + (rng() - 0.5) * 4);
  }
  cone.geometry.computeVertexNormals();
  cone.position.y = H / 2;
  cone.castShadow = true;
  cone.receiveShadow = true;
  group.add(cone);

  // Streaks of lava running down the slopes, lying along the cone surface.
  const slope = Math.atan2(R - R * 0.36, H);
  const streaks = [];
  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI * 2 + rng() * 0.6;
    const len = H * (0.45 + rng() * 0.35);
    const g = new THREE.BoxGeometry(5 + rng() * 3, len, 2.2);
    g.translate(0, -len / 2, 1.5);
    g.rotateX(-slope);
    g.translate(0, H - 2, R * 0.36 + 1);
    g.rotateY(ang);
    streaks.push(g);
  }
  const streakGeo = mergeGeometries(streaks);
  streaks.forEach((g) => g.dispose());
  const streakMat = LAVA_MAT.clone();
  group.add(new THREE.Mesh(streakGeo, streakMat));

  const craterMat = LAVA_MAT.clone();
  const crater = new THREE.Mesh(blobDiscGeo(R * 0.33, rng, 12), craterMat);
  crater.position.y = H - 1.5;
  group.add(crater);

  // Warm glow spilling over the crater rim. No shadow: one point light
  // without a shadow map is cheap; with one it would not be.
  const glow = new THREE.PointLight(0xff7a2a, 900, R * 3.2, 1.6);
  glow.position.set(0, H + 14, 0);
  group.add(glow);

  group.position.set(biome.cx, 0, biome.cz);
  group.userData.lavaMaterials = [craterMat, streakMat];
  group.userData.glow = glow;
  return { group, collider: { x: biome.cx, z: biome.cz, radius: R * 0.92 } };
}

/**
 * Embers drifting up from the crater and the lava pools. One Points cloud;
 * each particle remembers where it starts (x, z, ground height) plus a speed
 * and phase, so the update loop can loop it back down without re-randomising
 * (keeps the effect seed-stable and allocation-free).
 */
function buildEmbers(sources, rng) {
  const n = FIRE.emberCount;
  const positions = new Float32Array(n * 3);
  const meta = new Float32Array(n * 5); // baseX, baseZ, baseY, speed, phase
  for (let i = 0; i < n; i++) {
    const src = sources[(rng() * sources.length) | 0];
    const ang = rng() * Math.PI * 2;
    const rad = rng() * src.radius;
    const m = i * 5;
    meta[m] = src.x + Math.cos(ang) * rad;
    meta[m + 1] = src.z + Math.sin(ang) * rad;
    meta[m + 2] = src.y;
    meta[m + 3] = 12 + rng() * 16;
    meta[m + 4] = rng() * 100;
    positions[i * 3] = meta[m];
    positions[i * 3 + 1] = meta[m + 2];
    positions[i * 3 + 2] = meta[m + 1];
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(geo, EMBER_PARTICLE_MAT);
  points.frustumCulled = false;
  points.userData.meta = meta;
  return points;
}

// — Assembly ——————————————————————————————————————————————————————

/**
 * Builds both biomes into the scene. Returns the handles main.js wires up:
 * harvestable object lists, the extra colliders/hazards, and a per-frame
 * update for the lava glow and embers.
 *
 * @param {THREE.Scene} scene
 * @param {() => number} rng   the island's seeded PRNG, already advanced past
 *                             the meadow scatter
 */
export function buildBiomes(scene, rng) {
  const jungle = BIOMES.find((b) => b.id === 'jungle');
  const fire = BIOMES.find((b) => b.id === 'fire');

  const colliders = [];
  const hazards = [];

  // — Jungle —
  scene.add(buildPatch(jungle, rng, makeJungleTexture(rng), JUNGLE.groundY));
  const jungleTrees = [];
  for (let i = 0; i < JUNGLE.treeCount; i++) {
    const tree = buildJungleTree(randomPointInBiome(jungle, rng), rng);
    jungleTrees.push(tree);
    scene.add(tree);
    colliders.push({ x: tree.position.x, z: tree.position.z, radius: tree.userData.collideRadius });
  }
  scene.add(buildFerns(jungle, rng, JUNGLE.fernCount));

  // — Fire fields —
  scene.add(buildPatch(fire, rng, makeFireTexture(rng), FIRE.groundY));
  const volcano = buildVolcano(fire, rng);
  scene.add(volcano.group);
  colliders.push(volcano.collider);

  // Scenery keeps clear of the cone: minR is the volcano footprint plus a
  // walkway, as a fraction of the biome radius.
  const minR = (FIRE.volcanoRadius + 30) / fire.radius;
  const lavaPools = [];
  for (let i = 0; i < FIRE.lavaPoolCount; i++) {
    const pool = buildLavaPool(randomPointInBiome(fire, rng, { minR, maxR: 0.8 }), rng);
    lavaPools.push(pool.group);
    scene.add(pool.group);
    colliders.push(pool.collider);
    hazards.push(pool.hazard);
  }
  const emberRocks = [];
  for (let i = 0; i < FIRE.emberRockCount; i++) {
    const rock = buildEmberRock(randomPointInBiome(fire, rng, { minR, maxR: 0.88 }), rng);
    emberRocks.push(rock);
    scene.add(rock);
    colliders.push({ x: rock.position.x, z: rock.position.z, radius: rock.userData.collideRadius });
  }

  const emberSources = [
    { x: fire.cx, z: fire.cz, y: FIRE.volcanoHeight, radius: FIRE.volcanoRadius * 0.3 },
    ...lavaPools.map((p) => ({ x: p.position.x, z: p.position.z, y: 1, radius: p.userData.radius })),
  ];
  const embers = buildEmbers(emberSources, rng);
  scene.add(embers);

  const lavaMaterials = [
    ...volcano.group.userData.lavaMaterials,
    ...lavaPools.map((p) => p.userData.lavaMaterial),
  ];
  const glow = volcano.group.userData.glow;
  const emberPos = embers.geometry.attributes.position;
  const meta = embers.userData.meta;
  const RISE = FIRE.emberRise;

  return {
    jungleTrees,
    emberRocks,
    lavaPools,
    colliders,
    hazards,
    update(time) {
      // Lava breathes; the crater light flickers a little faster.
      const pulse = 1.45 + Math.sin(time * 1.7) * 0.3;
      for (const m of lavaMaterials) m.emissiveIntensity = pulse;
      glow.intensity = 820 + Math.sin(time * 9.3) * 60 + Math.sin(time * 23.1) * 40;

      // Embers rise, drift, and wrap back to their source.
      for (let i = 0; i < FIRE.emberCount; i++) {
        const m = i * 5;
        const speed = meta[m + 3];
        const phase = meta[m + 4];
        const life = ((time * speed + phase * 7) % RISE) / RISE; // 0 → 1
        emberPos.setXYZ(
          i,
          meta[m] + Math.sin(time * 1.3 + phase) * 4 * life,
          meta[m + 2] + life * RISE,
          meta[m + 1] + Math.cos(time * 1.1 + phase) * 4 * life
        );
      }
      emberPos.needsUpdate = true;
    },
  };
}
