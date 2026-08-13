import * as THREE from 'three';

// Day/night cycle (Batch 11). GAME_DESIGN.md §2 lists "Weather / Time of Day"
// as **not implemented** in the 2D game, so this is new content rather than a
// port: the sun orbits the island, and sky, fog, lights and water all follow a
// small keyframe table through dawn → noon → dusk → night.
//
// The cycle also owns the sun's *position*, which lets it keep the shadow
// frustum small and centred on the player instead of covering the whole
// 2000-unit island — the single biggest win in the Batch 11 performance pass.

export const DAY_LENGTH_SEC = 480; // one full in-game day = 8 real minutes

// Bedtime window for team dragons (companions/NightShelter.js). Deliberately
// the same bounds label() uses for its 🌙 icon, so the moon on the HUD and the
// dragons heading indoors can never disagree.
export const NIGHT_START = 0.84;
export const NIGHT_END = 0.24;

/** True when it is dark enough for companions to turn in. */
export function isNightTime(t) {
  return t >= NIGHT_START || t < NIGHT_END;
}

// t is normalised time-of-day: 0 = midnight, 0.25 = sunrise, 0.5 = noon,
// 0.75 = sunset. Keyframes are interpolated (and wrap around 1 → 0).
//
// `env` scales scene.environmentIntensity. It has to be part of the cycle:
// main.js lights the scene with a RoomEnvironment PMREM so metal/glass dragon
// skins have something to reflect, and that image-based light is constant —
// dimming only the sun and hemisphere leaves the ground as bright at midnight
// as at noon.
const PHASES = [
  {
    t: 0.0, // midnight
    sky: 0x0a1026, sun: 0x8fa4ff, sunI: 0.08,
    hemiSky: 0x1b2650, hemiGround: 0x0b1220, hemiI: 0.3,
    water: 0x0e1c38, fogNear: 500, fogFar: 1700, stars: 1, env: 0.1,
  },
  {
    t: 0.21, // first light
    sky: 0x3a3f6b, sun: 0xb08cd0, sunI: 0.2,
    hemiSky: 0x4a4f80, hemiGround: 0x24243a, hemiI: 0.42,
    water: 0x1d3358, fogNear: 600, fogFar: 2000, stars: 0.55, env: 0.22,
  },
  {
    t: 0.28, // sunrise
    sky: 0xff9d63, sun: 0xffb06a, sunI: 1.05,
    hemiSky: 0xffc79a, hemiGround: 0x6b5a3a, hemiI: 0.7,
    water: 0x3f7fae, fogNear: 700, fogFar: 2300, stars: 0, env: 0.6,
  },
  {
    t: 0.36, // morning
    sky: 0x9ad9ee, sun: 0xfff0d0, sunI: 1.45,
    hemiSky: 0xbfe3ff, hemiGround: 0x4c7a3a, hemiI: 0.85,
    water: 0x2f8fce, fogNear: 900, fogFar: 2600, stars: 0, env: 0.95,
  },
  {
    t: 0.5, // noon — the original Batch 1 look, unchanged
    sky: 0x7ec8e3, sun: 0xfff2cf, sunI: 1.6,
    hemiSky: 0xbfe3ff, hemiGround: 0x4c7a3a, hemiI: 0.9,
    water: 0x2f8fce, fogNear: 900, fogFar: 2600, stars: 0, env: 1,
  },
  {
    t: 0.66, // afternoon
    sky: 0x8ec9e0, sun: 0xffe2ab, sunI: 1.35,
    hemiSky: 0xc6ddf0, hemiGround: 0x4c7a3a, hemiI: 0.82,
    water: 0x2f86c0, fogNear: 850, fogFar: 2500, stars: 0, env: 0.95,
  },
  {
    t: 0.75, // sunset
    sky: 0xff7f4d, sun: 0xff8f45, sunI: 1.0,
    hemiSky: 0xffb27f, hemiGround: 0x60492f, hemiI: 0.65,
    water: 0x8a5a7a, fogNear: 650, fogFar: 2100, stars: 0, env: 0.6,
  },
  {
    t: 0.82, // dusk
    sky: 0x4a3868, sun: 0x9c6fd0, sunI: 0.35,
    hemiSky: 0x53467d, hemiGround: 0x2a2340, hemiI: 0.45,
    water: 0x33305c, fogNear: 550, fogFar: 1900, stars: 0.5, env: 0.3,
  },
  {
    t: 0.9, // night falls
    sky: 0x121a3a, sun: 0x8fa4ff, sunI: 0.12,
    hemiSky: 0x1f2a58, hemiGround: 0x0e1626, hemiI: 0.33,
    water: 0x142442, fogNear: 500, fogFar: 1750, stars: 0.9, env: 0.14,
  },
];

const STAR_COUNT = 700;
const STAR_RADIUS = 2400;
const SUN_DISTANCE = 900;

// Below this elevation the sun contributes nothing, so its shadow pass is
// switched off entirely (a free frame-time win for half of every cycle).
const SHADOW_CUTOFF = 0.06;

// Shadow frustum half-size. Tight box that follows the player: the Batch 1
// setup covered ±1200 world units at 2048², i.e. ~1.2 units per texel. At ±420
// the same map is ~0.4 units per texel — sharper shadows AND fewer casters.
const SHADOW_EXTENT = 420;

const lerp = (a, b, k) => a + (b - a) * k;

export class DayNightCycle {
  /**
   * @param {object} opts
   * @param {THREE.Scene} opts.scene
   * @param {THREE.DirectionalLight} opts.sun
   * @param {THREE.HemisphereLight} opts.hemi
   * @param {THREE.Mesh} opts.water
   * @param {number} [opts.startTime]  normalised time-of-day to start at
   */
  constructor({ scene, sun, hemi, water, startTime = 0.32 }) {
    this.scene = scene;
    this.sun = sun;
    this.hemi = hemi;
    this.water = water;
    this.time = startTime; // 0..1
    this.paused = false;

    // Reusable colours so the per-frame blend allocates nothing.
    this._skyColor = new THREE.Color();
    this._sunColor = new THREE.Color();
    this._hemiSky = new THREE.Color();
    this._hemiGround = new THREE.Color();
    this._waterColor = new THREE.Color();
    this._a = new THREE.Color();
    this._b = new THREE.Color();

    // Tight, player-following shadow frustum (see SHADOW_EXTENT).
    const cam = sun.shadow.camera;
    cam.left = -SHADOW_EXTENT;
    cam.right = SHADOW_EXTENT;
    cam.top = SHADOW_EXTENT;
    cam.bottom = -SHADOW_EXTENT;
    cam.near = 100;
    cam.far = SUN_DISTANCE * 2;
    cam.updateProjectionMatrix();

    this.#buildStars();
    this.#buildMoon();
  }

  // A dome of points, faded in by the `stars` keyframe value.
  #buildStars() {
    const positions = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      // Uniform over the upper hemisphere, kept a little above the horizon.
      const theta = Math.random() * Math.PI * 2;
      const y = 0.08 + Math.random() * 0.92;
      const r = Math.sqrt(1 - y * y);
      positions[i * 3] = Math.cos(theta) * r * STAR_RADIUS;
      positions[i * 3 + 1] = y * STAR_RADIUS;
      positions[i * 3 + 2] = Math.sin(theta) * r * STAR_RADIUS;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.starMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 9,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });
    this.stars = new THREE.Points(geo, this.starMaterial);
    this.stars.visible = false;
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);
  }

  #buildMoon() {
    this.moonMaterial = new THREE.MeshBasicMaterial({
      color: 0xdfe6ff,
      transparent: true,
      opacity: 0,
      fog: false,
      depthWrite: false,
    });
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(55, 16, 12), this.moonMaterial);
    this.moon.visible = false;
    this.scene.add(this.moon);
  }

  // Blend the two keyframes bracketing `t` (the table wraps at 1 → 0).
  #sample(t) {
    const list = PHASES;
    let i = list.length - 1;
    for (let k = 0; k < list.length; k++) {
      if (list[k].t > t) {
        i = k - 1;
        break;
      }
    }
    const from = list[(i + list.length) % list.length];
    const to = list[(i + 1) % list.length];
    // Span, wrapping past midnight.
    let span = to.t - from.t;
    if (span <= 0) span += 1;
    let local = t - from.t;
    if (local < 0) local += 1;
    const k = span === 0 ? 0 : Math.min(1, local / span);

    this._skyColor.copy(this._a.setHex(from.sky)).lerp(this._b.setHex(to.sky), k);
    this._sunColor.copy(this._a.setHex(from.sun)).lerp(this._b.setHex(to.sun), k);
    this._hemiSky.copy(this._a.setHex(from.hemiSky)).lerp(this._b.setHex(to.hemiSky), k);
    this._hemiGround.copy(this._a.setHex(from.hemiGround)).lerp(this._b.setHex(to.hemiGround), k);
    this._waterColor.copy(this._a.setHex(from.water)).lerp(this._b.setHex(to.water), k);
    return {
      sunI: lerp(from.sunI, to.sunI, k),
      hemiI: lerp(from.hemiI, to.hemiI, k),
      fogNear: lerp(from.fogNear, to.fogNear, k),
      fogFar: lerp(from.fogFar, to.fogFar, k),
      stars: lerp(from.stars, to.stars, k),
      env: lerp(from.env, to.env, k),
    };
  }

  /** Jump to a normalised time-of-day (used by the save system on load). */
  setTime(t) {
    this.time = ((t % 1) + 1) % 1;
  }

  /** True while companions should be sheltering indoors. */
  get isNight() {
    return isNightTime(this.time);
  }

  /** "14:20"-style clock plus the phase emoji, for the HUD chip. */
  label() {
    const totalMinutes = Math.floor(this.time * 24 * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    const icon = isNightTime(this.time) ? '🌙'
      : this.time < 0.32 ? '🌅'
      : this.time < 0.7 ? '☀️'
      : this.time < 0.79 ? '🌇'
      : '🌆';
    return `${icon} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  /**
   * Advance the clock and re-light the world.
   * @param {number} dt      seconds since last frame
   * @param {THREE.Vector3} focus  point the shadow frustum should centre on
   */
  update(dt, focus) {
    if (!this.paused) {
      this.time = (this.time + dt / DAY_LENGTH_SEC) % 1;
    }
    const p = this.#sample(this.time);

    // Sun on a tilted orbit: elevation peaks at noon, dips below the horizon
    // at night. The z offset keeps shadows from lying perfectly along an axis.
    const ang = (this.time - 0.25) * Math.PI * 2;
    const elevation = Math.sin(ang);
    const horizontal = Math.cos(ang);
    this.sun.position.set(
      focus.x + horizontal * SUN_DISTANCE * 0.72,
      elevation * SUN_DISTANCE,
      focus.z - SUN_DISTANCE * 0.38
    );
    this.sun.target.position.set(focus.x, 0, focus.z);
    this.sun.target.updateMatrixWorld();

    this.sun.color.copy(this._sunColor);
    this.sun.intensity = p.sunI;
    // No sun below the horizon → skip the whole shadow pass at night.
    this.sun.castShadow = elevation > SHADOW_CUTOFF;

    this.hemi.color.copy(this._hemiSky);
    this.hemi.groundColor.copy(this._hemiGround);
    this.hemi.intensity = p.hemiI;

    this.scene.background.copy(this._skyColor);
    this.scene.fog.color.copy(this._skyColor);
    this.scene.fog.near = p.fogNear;
    this.scene.fog.far = p.fogFar;
    // Dim the image-based light too, or the island stays lit at midnight.
    this.scene.environmentIntensity = p.env;

    this.water.material.color.copy(this._waterColor);

    this.stars.visible = p.stars > 0.01;
    if (this.stars.visible) {
      this.starMaterial.opacity = p.stars;
      this.stars.position.set(focus.x, 0, focus.z);
      this.stars.rotation.y = this.time * Math.PI * 2; // slow wheel overhead
    }

    // The moon rides opposite the sun and only shows when the sun is down.
    this.moon.visible = p.stars > 0.01;
    if (this.moon.visible) {
      this.moonMaterial.opacity = p.stars;
      this.moon.position.set(
        focus.x - horizontal * SUN_DISTANCE * 0.72,
        -elevation * SUN_DISTANCE * 0.9,
        focus.z - SUN_DISTANCE * 0.38
      );
    }
  }
}
