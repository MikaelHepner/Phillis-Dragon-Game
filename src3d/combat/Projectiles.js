import * as THREE from 'three';

// Elemental projectiles (Batch 9). The 2D game shipped one generic
// fireball.png for every attack; AI_HANDOFF.md §4 explicitly invites
// per-element replacements ("ice bolts, stone boulders"), so each element
// gets its own glowing core mesh + particle trail. The same manager also
// fires the towers' gold arrows (2D shootTowerArrow).
//
// Projectiles home toward a live target position (the 2D tweens re-read the
// target too) at a fixed speed, and "hit" inside a small radius — with a max
// lifetime so a dead/removed target can't leak a projectile forever.

const PROJECTILE_SPEED = 300; // world units/sec (2D: ≤60px in 250ms, scaled up)
const ARROW_SPEED = 1100; // 2D: up to 400px in 300ms
const HIT_RADIUS = 10;
const MAX_LIFE_SEC = 3;
const TRAIL_INTERVAL = 0.035; // seconds between trail puffs
const TRAIL_LIFE = 0.35; // puff fade-out time

// One visual recipe per element. `shape` picks the core geometry; colors feed
// an emissive core + a matching additive trail. Elements without an entry
// fall back to `default` tinted by their own color.
const ELEMENT_STYLES = {
  fire: { shape: 'sphere', color: 0xff5a1f, emissive: 0xff8c00, trail: 0xffa040, size: 5 },
  ice: { shape: 'bolt', color: 0xbfeaff, emissive: 0x66ccff, trail: 0xaaddff, size: 5.5 },
  stone: { shape: 'rock', color: 0x8d8d8d, emissive: 0x3a3a3a, trail: 0xb0a89c, size: 6 },
  dark: { shape: 'sphere', color: 0x2a1040, emissive: 0x7a1fbf, trail: 0x5a2a8a, size: 5.5 },
  thunder: { shape: 'bolt', color: 0xfff176, emissive: 0xffee00, trail: 0xfff59d, size: 5 },
  water: { shape: 'sphere', color: 0x4fc3f7, emissive: 0x0288d1, trail: 0x81d4fa, size: 5 },
  poison: { shape: 'sphere', color: 0x76ff03, emissive: 0x33691e, trail: 0x9ccc65, size: 5 },
  nature: { shape: 'bolt', color: 0x66bb6a, emissive: 0x2e7d32, trail: 0xa5d6a7, size: 5 },
  plant: { shape: 'bolt', color: 0x8bc34a, emissive: 0x33691e, trail: 0xc5e1a5, size: 5 },
  sand: { shape: 'rock', color: 0xe0c068, emissive: 0x8d6e63, trail: 0xefd9a0, size: 5.5 },
  metal: { shape: 'rock', color: 0xb0bec5, emissive: 0x546e7a, trail: 0xcfd8dc, size: 5 },
  light: { shape: 'sphere', color: 0xffffff, emissive: 0xfff9c4, trail: 0xffffff, size: 5 },
  default: { shape: 'sphere', color: 0xff8c42, emissive: 0xff6600, trail: 0xffb070, size: 5 },
};

// Shared geometries (cores are small; one of each shape is plenty).
const GEO = {
  sphere: new THREE.SphereGeometry(1, 12, 10),
  bolt: new THREE.ConeGeometry(0.6, 2.4, 8),
  rock: new THREE.DodecahedronGeometry(1, 0),
  puff: new THREE.SphereGeometry(1, 6, 5),
};

function buildCore(style) {
  const mat = new THREE.MeshStandardMaterial({
    color: style.color,
    emissive: style.emissive,
    emissiveIntensity: 1.4,
    roughness: 0.4,
  });
  const mesh = new THREE.Mesh(GEO[style.shape], mat);
  mesh.scale.setScalar(style.size);
  // Cones point +Y; tip them forward so lookAt(+Z) aims the bolt in flight.
  if (style.shape === 'bolt') mesh.rotation.x = Math.PI / 2;
  return mesh;
}

function buildArrow() {
  // Gold shaft + head, the 3D take on the 2D graphics-drawn arrow.
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffd700,
    emissive: 0xa88400,
    emissiveIntensity: 0.6,
    metalness: 0.6,
    roughness: 0.3,
  });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 14, 6), mat);
  shaft.rotation.x = Math.PI / 2; // lie along +Z (the travel axis)
  g.add(shaft);
  const head = new THREE.Mesh(new THREE.ConeGeometry(1.8, 5, 6), mat);
  head.rotation.x = Math.PI / 2;
  head.position.z = 9;
  g.add(head);
  return g;
}

export class ProjectileManager {
  constructor(scene) {
    this.scene = scene;
    this.shots = []; // { group, getTargetPos, speed, spin, trail, life, trailT, onHit }
    this.puffs = []; // { mesh, t }
    // Batch 11 audio hook: (kind: 'fire' | 'arrow') => void. Set by main.js so
    // every launcher (enemies, towers, arena fighters) is covered in one place.
    this.onFire = null;
  }

  /**
   * Fire an element-styled projectile from `from` toward a live target.
   * @param {string} element              dragon element ('dark' for enemies)
   * @param {THREE.Vector3} from          spawn point (copied)
   * @param {() => THREE.Vector3} getTargetPos  live target anchor
   * @param {Function} onHit              called once on arrival
   */
  fireElement(element, from, getTargetPos, onHit) {
    const style = ELEMENT_STYLES[element] || ELEMENT_STYLES.default;
    const group = new THREE.Group();
    group.add(buildCore(style));
    group.position.copy(from);
    this.scene.add(group);
    this.onFire?.('fire');
    this.shots.push({
      group,
      getTargetPos,
      speed: PROJECTILE_SPEED,
      spin: style.shape === 'rock' ? 6 : 0, // boulders tumble
      orient: style.shape === 'bolt', // bolts point along their velocity
      trail: style.trail,
      trailT: 0,
      life: 0,
      onHit,
    });
  }

  /** Fire a tower arrow (2D shootTowerArrow): fast, gold, oriented in flight. */
  fireArrow(from, getTargetPos, onHit) {
    const group = buildArrow();
    group.position.copy(from);
    this.scene.add(group);
    this.onFire?.('arrow');
    this.shots.push({
      group,
      getTargetPos,
      speed: ARROW_SPEED,
      spin: 0,
      orient: true,
      trail: 0xffe680,
      trailT: 0,
      life: 0,
      onHit,
    });
  }

  #spawnPuff(pos, color) {
    const mesh = new THREE.Mesh(
      GEO.puff,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    mesh.position.copy(pos);
    mesh.scale.setScalar(2.5);
    this.scene.add(mesh);
    this.puffs.push({ mesh, t: 0 });
  }

  #remove(shot) {
    this.scene.remove(shot.group);
  }

  update(dt) {
    const dir = new THREE.Vector3();

    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.life += dt;
      const target = s.getTargetPos();

      if (!target || s.life > MAX_LIFE_SEC) {
        this.#remove(s);
        this.shots.splice(i, 1);
        continue;
      }

      dir.copy(target).sub(s.group.position);
      const dist = dir.length();
      const step = s.speed * dt;

      if (dist <= Math.max(HIT_RADIUS, step)) {
        this.#remove(s);
        this.shots.splice(i, 1);
        s.onHit?.();
        continue;
      }

      dir.multiplyScalar(step / dist);
      s.group.position.add(dir);

      if (s.orient) s.group.lookAt(target);
      if (s.spin) {
        s.group.rotation.x += s.spin * dt;
        s.group.rotation.y += s.spin * 0.7 * dt;
      }

      s.trailT += dt;
      if (s.trailT >= TRAIL_INTERVAL) {
        s.trailT = 0;
        this.#spawnPuff(s.group.position, s.trail);
      }
    }

    // Trail puffs shrink and fade out, then free their material.
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.t += dt;
      const k = p.t / TRAIL_LIFE;
      if (k >= 1) {
        this.scene.remove(p.mesh);
        p.mesh.material.dispose();
        this.puffs.splice(i, 1);
        continue;
      }
      p.mesh.material.opacity = 0.7 * (1 - k);
      p.mesh.scale.setScalar(2.5 * (1 - k * 0.6));
    }
  }
}
