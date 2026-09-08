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

    this.material = makeMaterial(config);
    this.mesh = new THREE.Mesh(template.geometry, this.material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
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

    switch (this.anim) {
      case 'walk':
        bob = Math.abs(Math.sin(t * 7)) * 0.8;
        pitch = 0.06 + Math.sin(t * 7) * 0.03; // leans into the walk
        roll = Math.sin(t * 3.5) * 0.05; // slight sway between steps
        break;
      case 'fly':
        lift = 16 + Math.sin(t * 3) * 2;
        pitch = -0.12;
        roll = Math.sin(t * 1.6) * 0.09;
        break;
      default: // idle
        bob = Math.sin(t * 2.2) * 0.55;
        roll = Math.sin(t * 0.9) * 0.02;
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
      } else {
        shakeX = Math.sin(p * 40) * 1.1 * (1 - p);
        flash = 1 - p;
      }
      if (p >= 1) this.oneShot = null;
    }

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
