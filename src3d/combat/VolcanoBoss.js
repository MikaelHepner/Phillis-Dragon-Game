import * as THREE from 'three';
import { BOSS_MAX_HP, BOSS_HEAD_DAMAGE, BOSS_LOOT_COINS, PLAYER_ATTACK_DAMAGE, armoredDamage } from '../state/GameState.js';

// The three-headed dragon squatting in the volcano's crater. One per island:
// it never moves, never respawns, and its HP lives in GameState so it is saved.
//
// It is far too big to walk up to, so both sides fight at range. Anything of
// yours that wanders inside `aggroRange` of the volcano gets shot at — each
// head on its own clock — and you can hit back from the foot of the cone.
// Unlike the black dragons' homing orbs, its fireballs fly to where the target
// stood when the head fired: keep moving and they splash behind you.

const BOSS = {
  scale: 9, // body built in normal-dragon units (≈30 tall), then blown up
  aggroBeyondBase: 450, // aggro reaches this far past the volcano's foot
  reachBeyondBase: 150, // you can hit it from this far past the foot
  headCooldownSec: 4,
  fireballSpeed: 420,
  fireballScale: 3,
  fireballLife: 6,
  splashRadius: 34, // a fireball hurts anything this close to where it lands
  turnLambda: 1.5, // body yaw damping toward its target
  deathSec: 3,
};

const HURT_COLOR = new THREE.Color(0xff4444);

/** Horizontal distance from (x, z) to the boss's volcano. Exported for tests. */
export function distToVolcano(cone, x, z) {
  return Math.hypot(x - cone.x, z - cone.z);
}

/** Whether a friendly at (x, z) draws the boss's fire. */
export function inBossAggro(cone, x, z) {
  return distToVolcano(cone, x, z) <= cone.cone.baseRadius + BOSS.aggroBeyondBase;
}

/** Whether the player at (x, z) is close enough to land a click-attack. */
export function inBossReach(cone, x, z) {
  return distToVolcano(cone, x, z) <= cone.cone.baseRadius + BOSS.reachBeyondBase;
}

function wrapAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function makeWingGeometry() {
  // A ragged bat wing in XY; laid flat by the mesh's rotation.x = -PI/2.
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(6, -3);
  shape.lineTo(13, -4);
  shape.lineTo(19, -1);
  shape.lineTo(15, 2.5);
  shape.lineTo(12, 5.5);
  shape.lineTo(8, 4);
  shape.lineTo(5, 6.5);
  shape.lineTo(0, 4);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

// HP bar pinned to the top of the screen while the boss is engaged. It wears
// the island-float class so it hides under the arena and the Black Room.
function makeHpBar() {
  const el = document.createElement('div');
  el.className = 'island-float';
  el.style.cssText =
    'position:absolute;top:14px;left:50%;transform:translateX(-50%);z-index:6;' +
    'width:min(460px,80vw);padding:6px 10px 8px;border-radius:12px;display:none;' +
    'background:rgba(0,0,0,0.75);color:#fff;pointer-events:none;user-select:none;' +
    'font:bold 15px "Comic Sans MS","Segoe UI",sans-serif;text-align:center;' +
    'text-shadow:0 1px 2px #000';
  const title = document.createElement('div');
  const track = document.createElement('div');
  track.style.cssText =
    'margin-top:5px;height:12px;border-radius:6px;background:#3a0d0d;overflow:hidden';
  const fill = document.createElement('div');
  fill.style.cssText =
    'height:100%;background:linear-gradient(90deg,#ff3b1f,#ffb020);transition:width 0.2s';
  track.appendChild(fill);
  el.append(title, track);
  document.body.appendChild(el);
  return {
    show(on) {
      el.style.display = on ? 'block' : 'none';
    },
    setHp(hp) {
      title.textContent = `🐉 Three-Headed Volcano Dragon — ${hp} / ${BOSS_MAX_HP} HP`;
      fill.style.width = `${(100 * hp) / BOSS_MAX_HP}%`;
    },
  };
}

/** The procedural three-headed model. Faces +Z like every other dragon. */
function buildModel() {
  const group = new THREE.Group();
  group.name = 'volcano-boss';
  const rig = new THREE.Group();
  group.add(rig);

  const mat = (color, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.75, flatShading: true, ...extra });
  const bodyMat = mat(0x5c1212, { emissive: 0x2a0500, emissiveIntensity: 0.4 });
  const bellyMat = mat(0xc8641e, { emissive: 0x3a1000, emissiveIntensity: 0.3 });
  const wingMat = mat(0x2e0808, { side: THREE.DoubleSide, emissive: 0x1a0000, emissiveIntensity: 0.3 });
  const hornMat = mat(0x1b1b1b, { emissive: 0x000000, emissiveIntensity: 0 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffd200, emissive: 0xffb000, emissiveIntensity: 2 });

  const add = (parent, geo, material, x, y, z) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };

  // — Body —
  add(rig, new THREE.SphereGeometry(7, 12, 9), bodyMat, 0, 10, 0).scale.set(1.15, 0.95, 1.45);
  add(rig, new THREE.SphereGeometry(6.2, 12, 9), bellyMat, 0, 8.4, 1.6).scale.set(0.95, 0.8, 1.25);
  // Back ridge of jagged spines.
  for (let i = 0; i < 6; i++) {
    const spine = add(rig, new THREE.ConeGeometry(1.1, 3.6 - i * 0.3, 5), hornMat, 0, 16.2 - i * 0.6, 5 - i * 2.6);
    spine.rotation.x = -0.35;
  }

  // — Legs — crouched, planted on the crater floor.
  const legGeo = new THREE.CapsuleGeometry(2, 4, 4, 8);
  for (const [x, z] of [[-5, 5], [5, 5], [-5.4, -5], [5.4, -5]]) {
    add(rig, legGeo, bodyMat, x, 4, z);
    add(rig, new THREE.SphereGeometry(2.3, 8, 6), bellyMat, x, 0.8, z + 1).scale.set(1, 0.5, 1.4);
  }

  // — Wings — half-spread, flapping slowly.
  const wingGeo = makeWingGeometry();
  const wings = [];
  for (const side of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 6, 15, -1);
    const wing = new THREE.Mesh(wingGeo, wingMat);
    wing.rotation.x = -Math.PI / 2;
    wing.scale.x = side;
    wing.castShadow = true;
    pivot.add(wing);
    rig.add(pivot);
    wings.push({ pivot, side });
  }

  // — Tail — a chain, so the sway cascades down it.
  const tailSegs = [];
  let parent = new THREE.Group();
  parent.position.set(0, 9, -9);
  rig.add(parent);
  for (const [r, z] of [[3.4, -2], [2.6, -5], [1.9, -4.4], [1.3, -3.8]]) {
    const seg = new THREE.Group();
    seg.position.z = z;
    add(seg, new THREE.SphereGeometry(r, 8, 6), bodyMat, 0, 0, 0).scale.set(0.9, 0.9, 1.5);
    parent.add(seg);
    tailSegs.push(seg);
    parent = seg;
  }
  add(parent, new THREE.ConeGeometry(1.6, 4, 5), hornMat, 0, 0, -3).rotation.x = -Math.PI / 2;

  // — Three necks and heads —
  // root (yaw/splay) → tilt (lean forward) → neck mesh + head at its tip.
  const heads = [];
  const neckGeo = new THREE.CylinderGeometry(1.5, 2.6, 13, 8);
  neckGeo.translate(0, 6.5, 0);
  for (const [x, splay, len] of [[-4.2, -0.55, 1], [0, 0, 1.15], [4.2, 0.55, 1]]) {
    const root = new THREE.Group();
    root.position.set(x, 13, 6);
    root.rotation.y = splay;
    rig.add(root);
    const tilt = new THREE.Group();
    tilt.rotation.x = 0.5;
    root.add(tilt);
    const neck = add(tilt, neckGeo, bodyMat, 0, 0, 0);
    neck.scale.set(1, len, 1);

    const head = new THREE.Group();
    head.position.y = 13 * len;
    tilt.add(head);
    add(head, new THREE.SphereGeometry(3.6, 10, 8), bodyMat, 0, 0, 0);
    add(head, new THREE.BoxGeometry(4, 2.4, 5), bodyMat, 0, -0.6, 4);
    const jaw = new THREE.Group();
    jaw.position.set(0, -1.6, 1.5);
    head.add(jaw);
    add(jaw, new THREE.BoxGeometry(3.6, 1, 4.6), bellyMat, 0, -0.3, 2.3);
    for (const side of [-1, 1]) {
      add(head, new THREE.SphereGeometry(0.75, 6, 5), eyeMat, side * 2.1, 1, 2.6);
      const horn = add(head, new THREE.ConeGeometry(0.9, 5, 5), hornMat, side * 1.8, 3, -1.5);
      horn.rotation.x = -0.8;
      horn.rotation.z = side * -0.25;
    }
    const mouth = new THREE.Object3D();
    mouth.position.set(0, -1, 7);
    head.add(mouth);
    heads.push({ root, tilt, head, jaw, mouth, splay, phase: heads.length * 2.1 });
  }

  const flashMats = [bodyMat, bellyMat, wingMat];
  const baseEmissive = flashMats.map((m) => ({ color: m.emissive.clone(), intensity: m.emissiveIntensity }));

  group.scale.setScalar(BOSS.scale);
  return { group, rig, wings, tailSegs, heads, flashMats, baseEmissive };
}

export class VolcanoBoss {
  /**
   * @param {object} opts
   * @param {THREE.Scene} opts.scene
   * @param {THREE.Camera} opts.camera       for click-attack raycasts
   * @param {GameState} opts.state
   * @param {object} opts.cone               the volcano's collider ({ x, z, cone })
   * @param {number} opts.groundY
   * @param {ProjectileManager} opts.projectiles
   * @param {() => Array<{id, dragon}>} opts.getFriendlies  dragons it may target
   * @param {object} opts.playerDragon       the dragon you're riding (for lunges)
   * @param {Function} opts.floatText        main.js floating-text helper
   * @param {AudioManager} [opts.audio]
   */
  constructor({ scene, camera, state, cone, groundY, projectiles, getFriendlies, playerDragon, floatText, audio }) {
    this.scene = scene;
    this.camera = camera;
    this.state = state;
    this.cone = cone;
    this.groundY = groundY;
    this.projectiles = projectiles;
    this.getFriendlies = getFriendlies;
    this.playerDragon = playerDragon;
    this.floatText = floatText;
    this.audio = audio;

    this.model = null;
    this.engaged = false;
    this.yaw = 0;
    this.time = 0;
    this.flash = 0;
    this.dying = null; // seconds into the death sink, once slain
    this.bursts = []; // fireball impact flashes { mesh, t }
    this.bar = makeHpBar();
    this.bar.setHp(state.bossHp);

    this._raycaster = new THREE.Raycaster();
    this._pointer = new THREE.Vector2();
    this._v = new THREE.Vector3();

    // A loaded save may already have slain it; the model only exists while it
    // lives. 'loaded' fires after applySave() has set state.bossHp.
    if (state.bossHp > 0) this.#spawn();
    state.on('loaded', () => {
      this.bar.setHp(state.bossHp);
      if (state.bossHp <= 0 && this.model) {
        this.scene.remove(this.model.group);
        this.model = null;
      }
    });
    state.on('bossHurt', (hp) => {
      this.bar.setHp(hp);
      this.flash = 1;
    });
    state.on('bossDefeated', () => {
      const anchor = this.model.group.position.clone();
      anchor.y += 120;
      this.floatText(() => anchor, `🏆 The Three-Headed Dragon is slain! +${BOSS_LOOT_COINS} 🪙`, 0, 26);
      this.audio?.sfx('victory');
      this.dying = 0;
      this.engaged = false;
      this.bar.show(false);
    });
  }

  get alive() {
    return !!this.model && this.dying === null;
  }

  #spawn() {
    this.model = buildModel();
    const { x, z, cone } = this.cone;
    this.model.group.position.set(x, this.groundY + cone.height - 4, z);
    this.model.group.userData.bossId = 'volcano';
    this.scene.add(this.model.group);
  }

  /**
   * Click-attack routing, like EnemyManager.tryClickAttack: true if the tap hit
   * the boss (in reach or not), so it never falls through to click-to-move.
   */
  tryClickAttack(clientX, clientY, playerPos) {
    if (!this.alive) return false;
    this._pointer.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this._raycaster.setFromCamera(this._pointer, this.camera);
    if (!this._raycaster.intersectObject(this.model.group, true).length) return false;

    const pos = this.model.group.position;
    const hitAnchor = () => this._v.copy(pos).setY(pos.y + 60);
    if (!inBossReach(this.cone, playerPos.x, playerPos.z)) {
      this.floatText(hitAnchor, 'Too far away! Get to the volcano!', 0, 18);
      return true;
    }
    this.playerDragon.group.rotation.y = Math.atan2(pos.x - playerPos.x, pos.z - playerPos.z);
    this.playerDragon.play('attack');
    this.floatText(hitAnchor, `💥 Hit! -${PLAYER_ATTACK_DAMAGE} HP`, 0, 22);
    this.state.damageBoss(PLAYER_ATTACK_DAMAGE);
    return true;
  }

  // One head breathes a fireball at where `target` stands right now.
  #breathe(h, target) {
    h.attackT = 0;
    const from = h.mouth.getWorldPosition(new THREE.Vector3());
    const landing = target.dragon.group.position.clone();
    landing.y += 6;
    this.projectiles.fireElement(
      'fire',
      from,
      () => landing,
      () => this.#land(landing),
      { speed: BOSS.fireballSpeed, scale: BOSS.fireballScale, maxLife: BOSS.fireballLife }
    );
  }

  // Splash: every exposed friendly near the impact takes the hit.
  #land(at) {
    this.#burst(at);
    if (this.state.isGameOver) return;
    for (const f of this.getFriendlies()) {
      const p = f.dragon.group.position;
      if (Math.hypot(p.x - at.x, p.z - at.z) > BOSS.splashRadius) continue;
      f.dragon.play('hurt');
      const hurt = this.state.damageDragon(f.id, BOSS_HEAD_DAMAGE);
      this.floatText(() => p, `🔥 -${armoredDamage(hurt, BOSS_HEAD_DAMAGE)} HP`, 50, 20);
    }
  }

  #burst(at) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 10, 8),
      new THREE.MeshBasicMaterial({
        color: 0xff7a1a,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    mesh.position.copy(at);
    this.scene.add(mesh);
    this.bursts.push({ mesh, t: 0 });
  }

  update(dt) {
    this.time += dt;
    this.#updateBursts(dt);
    if (!this.model) return;
    if (this.dying !== null) {
      this.#updateDeath(dt);
      return;
    }

    // Who is close enough to shoot at, nearest first.
    const { x: cx, z: cz } = this.cone;
    const targets = this.getFriendlies()
      .filter((f) => inBossAggro(this.cone, f.dragon.group.position.x, f.dragon.group.position.z))
      .sort(
        (a, b) =>
          distToVolcano(this.cone, a.dragon.group.position.x, a.dragon.group.position.z) -
          distToVolcano(this.cone, b.dragon.group.position.x, b.dragon.group.position.z)
      );

    const engaged = targets.length > 0 && !this.state.isGameOver;
    if (engaged && !this.engaged) {
      this.audio?.sfx('roar');
      // Fresh clocks, staggered so the three heads fire one after another.
      this.model.heads.forEach((h, i) => (h.cooldown = 1 + i * (BOSS.headCooldownSec / 3)));
    }
    this.engaged = engaged;
    this.bar.show(engaged);

    // The body swings round to face the nearest target.
    if (engaged) {
      const p = targets[0].dragon.group.position;
      const want = Math.atan2(p.x - cx, p.z - cz);
      this.yaw += wrapAngle(want - this.yaw) * (1 - Math.exp(-BOSS.turnLambda * dt));
    }
    this.model.group.rotation.y = this.yaw;

    // Each head keeps its own clock and, with company around, its own target.
    this.model.heads.forEach((h, i) => {
      if (!engaged) return;
      h.cooldown -= dt;
      if (h.cooldown <= 0) {
        h.cooldown = BOSS.headCooldownSec;
        this.#breathe(h, targets[i % targets.length]);
      }
    });

    this.#animate(dt);
  }

  #animate(dt) {
    const t = this.time;
    const m = this.model;
    m.rig.position.y = Math.sin(t * 0.9) * 0.4;
    for (const { pivot, side } of m.wings) pivot.rotation.z = side * (0.35 + Math.sin(t * 1.4) * 0.25);
    m.tailSegs.forEach((seg, i) => (seg.rotation.y = Math.sin(t * 1.1 + i * 0.8) * 0.18));

    for (const h of m.heads) {
      // Lazy weave, plus a forward snap and an open jaw while breathing.
      let lunge = 0;
      if (h.attackT !== undefined) {
        h.attackT += dt;
        const p = Math.min(h.attackT / 0.7, 1);
        lunge = Math.sin(Math.PI * p);
        if (p >= 1) h.attackT = undefined;
      }
      h.root.rotation.y = h.splay * (this.engaged ? 0.6 : 1) + Math.sin(t * 0.8 + h.phase) * 0.15;
      h.tilt.rotation.x = 0.5 + Math.sin(t * 1.1 + h.phase) * 0.08 + lunge * 0.4;
      h.head.rotation.x = -h.tilt.rotation.x + 0.15 + lunge * 0.2;
      h.jaw.rotation.x = 0.1 + lunge * 0.6;
    }

    // Hurt flash: push the hide toward red, then let it fade back.
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 3);
      m.flashMats.forEach((mat, i) => {
        const base = m.baseEmissive[i];
        mat.emissive.copy(base.color).lerp(HURT_COLOR, this.flash);
        mat.emissiveIntensity = THREE.MathUtils.lerp(base.intensity, 1, this.flash);
      });
    }
  }

  // Slain: it rears, spins slowly and sinks back into the lava.
  #updateDeath(dt) {
    this.dying += dt;
    const k = Math.min(1, this.dying / BOSS.deathSec);
    const g = this.model.group;
    g.rotation.y += dt * 1.2;
    g.position.y = this.groundY + this.cone.cone.height - 4 - k * k * 160;
    g.scale.setScalar(BOSS.scale * (1 - k * 0.5));
    if (k >= 1) {
      this.scene.remove(g);
      this.model = null;
    }
  }

  #updateBursts(dt) {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.t += dt;
      const k = b.t / 0.5;
      if (k >= 1) {
        this.scene.remove(b.mesh);
        b.mesh.geometry.dispose();
        b.mesh.material.dispose();
        this.bursts.splice(i, 1);
        continue;
      }
      b.mesh.scale.setScalar(BOSS.splashRadius * (0.3 + k * 0.7));
      b.mesh.material.opacity = 0.85 * (1 - k);
    }
  }
}
