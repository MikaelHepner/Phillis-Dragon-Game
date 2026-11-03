import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// The glTF dragon: one authored mesh standing in for every type in
// dragonTypes.js, tinted per element from the same config the procedural
// factory uses.
//
// The model has no skeleton, so there is no skinned animation here — update()
// drives the whole body (bob, lunge, shake) with the same maths the procedural
// dragon applies to its parts. Wings, legs and tail do not move.
//
// Usage:
//   await preloadDragonModel();          // once, before any createDragon()
//   const dragon = createModelDragon(DRAGON_TYPES_BY_ID.fire);
//
// The returned object exposes exactly the API the rest of the game calls on a
// dragon — group, setAnimation, play, update, setArmor — so it drops straight
// into MovableDragon, BattleArena, EnemyManager, thumbnails and the gallery.

const MODEL_URL = '/models/dragon.glb';

// Height the model is normalised to, feet on y=0, facing +Z. The procedural
// dragon it replaces stood 20 units tall, but that mesh was wide and round
// where this one is tall and narrow — so it needs more height to carry the
// same visual weight in the world and to fill the selection ring.
const TARGET_HEIGHT = 30;

const HURT_COLOR = new THREE.Color(0xff4444);

// Where the dragon's parts sit once the mesh is normalised (x +-15.2, y 0..30,
// z +-19.8, facing +Z). Measured off the vertex distribution of the model
// rather than guessed: the wing membranes are everything outboard of |x| 6
// that also sits above the legs, and the tail is everything behind z -8.
const WING_INNER = 6.0; // |x| where the membrane leaves the shoulder
// The weight saturates here rather than at the wingtip. Ramping all the way
// out makes the tip rotate further than the root, which folds the membrane
// through itself; a wing has to swing rigidly about the shoulder joint. The
// tail keeps its gradient, because a tail is supposed to curve.
const WING_FULL = 9.0;
const WING_MIN_Y = 11.0; // above this only, so the feet never flap
const WING_PIVOT_Y = 16.0; // shoulder height, the flap axis
const TAIL_START = 8.0; // -z where the tail leaves the hips
const TAIL_END = 19.5; // tail tip
const TAIL_PIVOT_Z = -8.0;

/**
 * Bake a wing weight and a tail weight onto every vertex, once, on the shared
 * geometry. These stand in for skin weights: the vertex shader rotates each
 * vertex by weight * angle, which gives flapping wings and a swinging tail
 * without a skeleton. Weights ramp smoothly so the mesh does not crease where
 * a wing meets the body.
 */
function buildDeformWeights(geometry) {
  const pos = geometry.attributes.position;
  const n = pos.count;
  const wing = new Float32Array(n);
  const tail = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const outward = THREE.MathUtils.smoothstep(Math.abs(x), WING_INNER, WING_FULL);
    const aboveLegs = THREE.MathUtils.smoothstep(y, WING_MIN_Y, WING_MIN_Y + 6);
    wing[i] = outward * aboveLegs;
    tail[i] = THREE.MathUtils.smoothstep(-z, TAIL_START, TAIL_END);
  }

  geometry.setAttribute('aWing', new THREE.BufferAttribute(wing, 1));
  geometry.setAttribute('aTail', new THREE.BufferAttribute(tail, 1));
}

// Injected into the standard material's vertex shader. Both deformations are
// rigid rotations, so the same function transforms the normal by finite
// difference and the lighting on a flapping wing stays correct.
const DEFORM_GLSL = `
attribute float aWing;
attribute float aTail;
uniform float uFlap;
uniform float uSway;

vec2 dragonRot2(vec2 v, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
}

vec3 dragonDeform(vec3 pos) {
  // Wings pivot at the shoulders. sign(x) mirrors the angle so both sweep
  // the same way instead of one up and one down.
  float wa = uFlap * aWing * sign(pos.x);
  vec2 w = dragonRot2(vec2(pos.x, pos.y - ${WING_PIVOT_Y.toFixed(1)}), wa);
  pos = vec3(w.x, w.y + ${WING_PIVOT_Y.toFixed(1)}, pos.z);

  // Tail swings horizontally from the hips, cascading toward the tip.
  vec2 t = dragonRot2(vec2(pos.x, pos.z - (${TAIL_PIVOT_Z.toFixed(1)})), uSway * aTail);
  pos = vec3(t.x, pos.y, t.y + (${TAIL_PIVOT_Z.toFixed(1)}));

  return pos;
}
`;

/**
 * Wire the deformation into a MeshStandardMaterial. Each dragon owns its
 * material and its uniform objects, so instances flap independently.
 */
function attachDeform(material, uniforms) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFlap = uniforms.uFlap;
    shader.uniforms.uSway = uniforms.uSway;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
${DEFORM_GLSL}`)
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        objectNormal = normalize(dragonDeform(position + objectNormal) - dragonDeform(position));`
      )
      .replace('#include <begin_vertex>', 'vec3 transformed = dragonDeform(position);');
  };
  // Without this the renderer reuses the un-deformed program it already
  // compiled for a material with the same parameters.
  material.customProgramCacheKey = () => 'dragon-deform';
}

let template = null; // { geometry, box, maps } — shared by every instance
let loadFailed = false;

/**
 * Flatten the base-colour map to bright greyscale so a per-type colour tint
 * multiplies into the right hue. The raw Meshy texture is red-orange; tinting
 * that green would give mud, so the scale detail is kept as luminance and the
 * colour comes entirely from material.color.
 */
function toTintableMap(texture) {
  const img = texture.image;
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const lum = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
    // Lifted toward white: a mid-grey base would darken every tint.
    const v = Math.min(255, 96 + lum * 0.82);
    px[i] = v;
    px[i + 1] = v;
    px[i + 2] = v;
  }
  ctx.putImageData(data, 0, 0);

  const out = new THREE.CanvasTexture(canvas);
  out.colorSpace = THREE.SRGBColorSpace;
  out.flipY = false; // glTF UVs already assume unflipped textures
  out.wrapS = texture.wrapS;
  out.wrapT = texture.wrapT;
  return out;
}

/**
 * Load and prepare the shared dragon model. Safe to call more than once.
 * Resolves true when the model is usable, false when the caller should fall
 * back to the procedural dragon — a missing or broken file must never stop
 * the game from booting.
 */
export async function preloadDragonModel({ url = MODEL_URL, enabled = true } = {}) {
  if (!enabled) return false;
  if (template) return true;
  if (loadFailed) return false;

  try {
    const gltf = await new GLTFLoader().loadAsync(url);

    let mesh = null;
    gltf.scene.traverse((o) => {
      if (o.isMesh && !mesh) mesh = o;
    });
    if (!mesh) throw new Error(`no mesh in ${url}`);

    // Bake the authored transform into the geometry, then normalise it into
    // the procedural frame so everything the game already knows about — the
    // selection ring size, camera height, GROUND_Y — still lines up.
    const geometry = mesh.geometry.clone();
    mesh.updateWorldMatrix(true, false);
    geometry.applyMatrix4(mesh.matrixWorld);
    geometry.computeBoundingBox();

    const size = geometry.boundingBox.getSize(new THREE.Vector3());
    const scale = TARGET_HEIGHT / size.y;
    geometry.scale(scale, scale, scale);
    geometry.computeBoundingBox();

    const box = geometry.boundingBox;
    const center = box.getCenter(new THREE.Vector3());
    geometry.translate(-center.x, -box.min.y, -center.z);
    geometry.computeBoundingBox();
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    buildDeformWeights(geometry);

    const src = mesh.material;
    template = {
      geometry,
      box: geometry.boundingBox.clone(),
      map: src.map ? toTintableMap(src.map) : null,
      normalMap: src.normalMap ?? null,
      roughnessMap: src.roughnessMap ?? null,
      metalnessMap: src.metalnessMap ?? null,
    };
    return true;
  } catch (err) {
    console.warn('[DragonModel] falling back to procedural dragons:', err.message);
    loadFailed = true;
    return false;
  }
}

export function isDragonModelReady() {
  return template !== null;
}

function makeMaterial(config) {
  const mat = new THREE.MeshStandardMaterial({
    map: template.map,
    normalMap: template.normalMap,
    roughnessMap: template.roughnessMap,
    metalnessMap: template.metalnessMap,
    color: config.colors.body,
    roughness: 0.85,
    metalness: 0,
    side: THREE.DoubleSide, // the wing membranes are single-sided sheets
  });

  switch (config.style) {
    case 'shiny':
      mat.roughness = 0.45;
      mat.metalness = 0.15;
      break;
    case 'metallic':
      mat.roughness = 0.3;
      mat.metalness = 0.9;
      break;
    case 'glass':
      mat.roughness = 0.1;
      mat.metalness = 0.1;
      mat.transparent = true;
      mat.opacity = config.opacity ?? 0.45;
      break;
    case 'crystal':
      mat.roughness = 0.15;
      mat.metalness = 0.4;
      mat.transparent = true;
      mat.opacity = config.opacity ?? 0.8;
      break;
  }

  if (config.emissive !== undefined) {
    mat.emissive = new THREE.Color(config.emissive);
    mat.emissiveIntensity = config.emissiveIntensity ?? 0.2;
  }
  return mat;
}

class ModelDragon {
  constructor(config) {
    this.config = config;

    this.group = new THREE.Group();
    this.group.name = `dragon-${config.id}`;
    this.rig = new THREE.Group();
    this.group.add(this.rig);

    this.uniforms = { uFlap: { value: 0 }, uSway: { value: 0 } };
    this.material = makeMaterial(config);
    attachDeform(this.material, this.uniforms);
    this.mesh = new THREE.Mesh(template.geometry, this.material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;

    // The shadow pass renders through its own depth material, which knows
    // nothing about the vertex deformation — without this the dragon's shadow
    // keeps the un-flapped pose while its wings move. MeshDepthMaterial has no
    // normal stage, so attachDeform's normal replacement simply finds nothing.
    this.mesh.customDepthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
    });
    attachDeform(this.mesh.customDepthMaterial, this.uniforms);

    this.rig.add(this.mesh);

    // The light dragon's halo is the one accessory that still reads correctly
    // without a skeleton to hang props from. The jacket, mug, can and flower
    // are shaped around the procedural body and are skipped here — see
    // buildAccessories in DragonFactory.js for what they used to look like.
    if ((config.accessories ?? []).includes('halo')) {
      const size = template.box.getSize(new THREE.Vector3());
      this.halo = new THREE.Mesh(
        new THREE.TorusGeometry(size.x * 0.16, size.x * 0.022, 8, 20),
        new THREE.MeshStandardMaterial({
          color: 0xffe9a0,
          emissive: 0xffd54f,
          emissiveIntensity: 1.2,
        })
      );
      this.halo.position.set(0, template.box.max.y + 1.5, 0);
      this.halo.rotation.x = Math.PI / 2;
      this.rig.add(this.halo);
    }

    this.group.scale.setScalar(config.scale ?? 1);
    if (config.flatten) this.group.scale.x *= config.flatten;

    this.anim = 'idle';
    this.animTime = Math.random() * 100; // desync instances
    this.oneShot = null;
    this.baseEmissive = {
      color: this.material.emissive ? this.material.emissive.clone() : null,
      intensity: this.material.emissiveIntensity,
    };
  }

  /** Set the looping base animation: 'idle' | 'walk' | 'fly'. */
  setAnimation(name) {
    if (!['idle', 'walk', 'fly'].includes(name)) return;
    this.anim = name;
  }

  /**
   * Forged armour is deliberately not rendered on the model dragon — the plate
   * was shaped around the procedural sphere body and reads as a grey lump
   * bolted to this mesh. Kept as a no-op so the armorEquipped handler in
   * main.js and BattleArena can still call it unconditionally; the armour is
   * only cosmetic, so the stat side of the feature is unaffected.
   */
  setArmor() {}

  /** Trigger a one-shot: 'attack' | 'hurt'. */
  play(name) {
    if (name === 'attack') this.oneShot = { name, t: 0, duration: 0.45 };
    else if (name === 'hurt') this.oneShot = { name, t: 0, duration: 0.4 };
    else this.setAnimation(name);
  }

  update(dt) {
    this.animTime += dt;
    const t = this.animTime;

    // No skeleton to pose, so the base loops read as weight shifts of the
    // whole body: a breathing bob standing still, a heavier gait walking, a
    // rise and slow sway in the air.
    let bob = 0;
    let lift = 0;
    let pitch = 0;
    let roll = 0;
    // The mesh was modelled with its wings already raised, so the flap angle
    // is mostly negative — it sweeps them down from that pose and back.
    let flap = 0;
    let sway = 0;

    switch (this.anim) {
      case 'walk':
        bob = Math.abs(Math.sin(t * 7)) * 0.8;
        pitch = 0.06 + Math.sin(t * 7) * 0.03; // leans into the walk
        roll = Math.sin(t * 3.5) * 0.05; // slight sway between steps
        flap = -0.12 + Math.sin(t * 7) * 0.07; // wings tucked, bouncing
        sway = Math.sin(t * 3.5) * 0.22; // tail counterbalances the gait
        break;
      case 'fly':
        lift = 16 + Math.sin(t * 3) * 2;
        pitch = -0.12;
        roll = Math.sin(t * 1.6) * 0.09;
        flap = -0.38 + Math.sin(t * 6) * 0.5; // full downstroke and recovery
        sway = Math.sin(t * 2.5) * 0.1;
        break;
      default: // idle
        bob = Math.sin(t * 2.2) * 0.55;
        roll = Math.sin(t * 0.9) * 0.02;
        flap = -0.07 + Math.sin(t * 1.6) * 0.05; // slow settle, breathing
        sway = Math.sin(t * 1.3) * 0.12;
        break;
    }

    let lungeZ = 0;
    let shakeX = 0;
    let flash = 0;
    if (this.oneShot) {
      this.oneShot.t += dt;
      const p = Math.min(this.oneShot.t / this.oneShot.duration, 1);
      if (this.oneShot.name === 'attack') {
        lungeZ = Math.sin(Math.PI * p) * 7;
        pitch += Math.sin(Math.PI * p) * 0.22;
        flap += Math.sin(Math.PI * p) * 0.5; // wings snap up on the lunge
      } else {
        shakeX = Math.sin(p * 40) * 1.1 * (1 - p);
        flash = 1 - p;
      }
      if (p >= 1) this.oneShot = null;
    }

    this.uniforms.uFlap.value = flap;
    this.uniforms.uSway.value = sway;

    this.rig.position.set(shakeX, bob + lift, lungeZ);
    this.rig.rotation.set(pitch, 0, roll);
    if (this.halo) this.halo.rotation.z = t * 1.5;

    // Hurt flash: push the body material toward red, restore as it fades.
    if (flash > 0 || this.wasFlashing) {
      if (this.material.emissive) {
        const base = this.baseEmissive;
        this.material.emissive
          .copy(base.color ?? new THREE.Color(0x000000))
          .lerp(HURT_COLOR, flash);
        this.material.emissiveIntensity = THREE.MathUtils.lerp(base.intensity ?? 0, 1, flash);
      }
      this.wasFlashing = flash > 0;
    }
  }
}

/** Build a model-backed dragon. preloadDragonModel() must have resolved true. */
export function createModelDragon(config) {
  return new ModelDragon(config);
}
