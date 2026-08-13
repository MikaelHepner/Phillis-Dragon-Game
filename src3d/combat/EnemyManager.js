import * as THREE from 'three';
import { createDragon } from '../dragons/DragonFactory.js';
import { DRAGON_TYPES_BY_ID } from '../data/dragonTypes.js';
import { MovableDragon } from '../entities/MovableDragon.js';
import {
  ENEMY_ATTACK_DAMAGE,
  PLAYER_ATTACK_DAMAGE,
  ENEMY_LOOT_COINS,
} from '../state/GameState.js';

// Black Dragon enemies (Batch 9): spawn rules and the Roam → Aggro Chase →
// Projectile Attack state machine, every number copied from the 2D
// MainScene (spawnBlackDragon / update / enemyAttack / attackBlackDragon).
// Enemies move through MovableDragon against the SHARED collider list, so
// castle walls, structures, trees, and rocks physically block them — the
// 2D game's collider(blackDragons, walls) for free.

const ENEMY = {
  hp: 100,
  maxCount: 4,
  initialDelaySec: 2, // 2 spawn after 2 seconds…
  initialCount: 2,
  spawnIntervalSec: 25, // …then 1 every 25 seconds
  spawnMin: 200, // random world position range (2D: 200–1800)
  spawnMax: 1800,
  minPlayerDist: 400, // spawn at least this far from the player
  aggroRange: 400,
  chaseSpeed: 55,
  stopDist: 55, // 45–55: hold position next to the target
  backoffDist: 45,
  backoffSpeed: 30,
  attackRange: 60,
  attackCooldownSec: 3,
  roamIntervalSec: 3, // new random heading every 3s
  roamSpeed: 30, // ±30 per axis
  playerAttackRange: 250, // player click-attack reach
  deathSec: 0.5, // fade/shrink/spin-out duration
};

const rand = (lo, hi) => lo + Math.random() * (hi - lo);

// Updatable "😈 Black Dragon (100 HP)" pill above each enemy — same look as
// StructureFactory's label sprites, but redrawable as HP drops.
function makeHpLabel() {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 48;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false })
  );
  sprite.scale.set(64, 8, 1); // matches the 384:48 canvas aspect
  const setHp = (hp) => {
    ctx.clearRect(0, 0, 384, 48);
    const text = `😈 Black Dragon (${hp} HP)`;
    ctx.font = 'bold 26px "Comic Sans MS", "Segoe UI", sans-serif';
    const w = Math.min(380, ctx.measureText(text).width + 24);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.beginPath();
    ctx.roundRect((384 - w) / 2, 2, w, 44, 12);
    ctx.fill();
    ctx.fillStyle = '#ff5555';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 192, 25);
    texture.needsUpdate = true;
  };
  setHp(ENEMY.hp);
  return { sprite, setHp };
}

export class EnemyManager {
  /**
   * @param {object} opts
   * @param {THREE.Scene} opts.scene
   * @param {THREE.Camera} opts.camera        for click-attack raycasts
   * @param {GameState} opts.state
   * @param {Array} opts.colliders            shared { x, z, radius } obstacles
   * @param {object} opts.bounds              { size, margin }
   * @param {number} opts.groundY
   * @param {ProjectileManager} opts.projectiles
   * @param {() => Array<{id, dragon}>} opts.getFriendlies  all owned dragons
   * @param {object} opts.playerDragon        the player's Dragon (for lunges)
   * @param {Function} opts.floatText         main.js floating-text helper
   */
  constructor({ scene, camera, state, colliders, bounds, groundY, projectiles, getFriendlies, playerDragon, floatText }) {
    this.scene = scene;
    this.camera = camera;
    this.state = state;
    this.colliders = colliders;
    this.bounds = bounds;
    this.groundY = groundY;
    this.projectiles = projectiles;
    this.getFriendlies = getFriendlies;
    this.playerDragon = playerDragon;
    this.floatText = floatText;

    this.enemies = []; // { id, dragon, mover, hp, label, cooldown, roamT, vx, vz }
    this.dying = []; // { group, t } death-animation entries
    this.elapsed = 0;
    this.nextSpawnAt = ENEMY.initialDelaySec;
    this.initialWave = true;
    this.enemyCount = 0;

    this._raycaster = new THREE.Raycaster();
    this._pointer = new THREE.Vector2();
  }

  // — Spawning (2D spawnBlackDragon) ————————————————————————————
  #spawn(playerPos) {
    if (this.enemies.length >= ENEMY.maxCount) return;

    let x;
    let z;
    let attempts = 0;
    do {
      x = rand(ENEMY.spawnMin, ENEMY.spawnMax);
      z = rand(ENEMY.spawnMin, ENEMY.spawnMax);
      attempts++;
    } while (Math.hypot(x - playerPos.x, z - playerPos.z) < ENEMY.minPlayerDist && attempts < 100);

    const dragon = createDragon(DRAGON_TYPES_BY_ID.black);
    dragon.group.position.set(x, this.groundY, z);
    const id = `enemy_${++this.enemyCount}`;
    dragon.group.userData.enemyId = id;
    this.scene.add(dragon.group);

    const label = makeHpLabel();
    label.sprite.position.y = 42;
    dragon.group.add(label.sprite);

    const mover = new MovableDragon(dragon, {
      colliders: this.colliders,
      bounds: this.bounds,
      speed: ENEMY.chaseSpeed,
      groundY: this.groundY,
    });

    this.enemies.push({
      id,
      dragon,
      mover,
      hp: ENEMY.hp,
      label,
      cooldown: 0,
      roamT: 0,
      vx: 0,
      vz: 0,
    });
  }

  // — Damage from any source (player click, tower arrow) ————————————
  /** Apply damage; handles the shake, label update, loot, and death spin. */
  hurt(enemy, amount) {
    if (!this.enemies.includes(enemy)) return;
    enemy.hp = Math.max(0, enemy.hp - amount);
    enemy.dragon.play('hurt');
    enemy.label.setHp(enemy.hp);

    const anchor = enemy.dragon.group.position;
    if (enemy.hp <= 0) {
      this.state.addResource('coins', ENEMY_LOOT_COINS);
      this.floatText(() => anchor, `🏆 Defeated! +${ENEMY_LOOT_COINS} Coins 🪙`, 52, 20);
      // 2D death tween: fade + shrink + spin 180° over 500ms.
      this.enemies.splice(this.enemies.indexOf(enemy), 1);
      this.dying.push({ group: enemy.dragon.group, t: 0 });
    }
  }

  /**
   * Click-attack routing (2D attackBlackDragon): returns true if the tap hit
   * an enemy — in range it deals 35 damage, out of range it just complains,
   * but either way the click must not fall through to click-to-move.
   */
  tryClickAttack(clientX, clientY, playerPos) {
    if (this.enemies.length === 0) return false;
    this._pointer.set(
      (clientX / window.innerWidth) * 2 - 1,
      -(clientY / window.innerHeight) * 2 + 1
    );
    this._raycaster.setFromCamera(this._pointer, this.camera);
    const hits = this._raycaster.intersectObjects(
      this.enemies.map((e) => e.dragon.group),
      true
    );
    if (!hits.length) return false;
    let obj = hits[0].object;
    while (obj && obj.userData.enemyId === undefined) obj = obj.parent;
    if (!obj) return false;
    const enemy = this.enemies.find((e) => e.id === obj.userData.enemyId);
    if (!enemy) return false;

    const pos = enemy.dragon.group.position;
    const dist = Math.hypot(playerPos.x - pos.x, playerPos.z - pos.z);
    if (dist > ENEMY.playerAttackRange) {
      this.floatText(() => pos, 'Too far away!', 60, 18);
      return true;
    }

    // Player lunge (2D yoyo tween toward the enemy) + hit flash.
    this.playerDragon.group.rotation.y = Math.atan2(pos.x - playerPos.x, pos.z - playerPos.z);
    this.playerDragon.play('attack');
    this.floatText(() => pos, '💥', 30, 30);
    this.floatText(() => pos, `Hit! -${PLAYER_ATTACK_DAMAGE} HP`, 58, 18);
    this.hurt(enemy, PLAYER_ATTACK_DAMAGE);
    return true;
  }

  // — Projectile attack (2D enemyAttack) ————————————————————————
  #attack(enemy, target) {
    enemy.dragon.play('attack');

    const from = enemy.dragon.group.position.clone();
    from.y += 16; // roughly mouth height

    const targetGroup = target.dragon.group;
    const aim = new THREE.Vector3();
    const getTargetPos = () => {
      aim.copy(targetGroup.position);
      aim.y += 12;
      return aim;
    };

    // Black dragons breathe their element — 'dark' shadow orbs.
    this.projectiles.fireElement('dark', from, getTargetPos, () => {
      if (this.state.isGameOver) return;
      target.dragon.play('hurt');
      this.state.damageDragon(target.id, ENEMY_ATTACK_DAMAGE);
      this.floatText(() => targetGroup.position, `-${ENEMY_ATTACK_DAMAGE} HP 💔`, 50, 20);
    });
  }

  // — Per-frame: spawn clock, AI state machine, death animations ————————
  update(dt, playerPos) {
    // Spawn clock: 2 at t=2s, then 1 every 25s (2D delayedCall + 25s loop).
    this.elapsed += dt;
    if (this.elapsed >= this.nextSpawnAt) {
      if (this.initialWave) {
        this.initialWave = false;
        for (let i = 0; i < ENEMY.initialCount; i++) this.#spawn(playerPos);
      } else {
        this.#spawn(playerPos);
      }
      this.nextSpawnAt = this.elapsed + ENEMY.spawnIntervalSec;
    }

    const friendlies = this.getFriendlies();

    for (const enemy of this.enemies) {
      const pos = enemy.mover.position;
      enemy.cooldown = Math.max(0, enemy.cooldown - dt);

      // Closest friendly dragon within aggro range.
      let closest = null;
      let minDist = ENEMY.aggroRange;
      for (const f of friendlies) {
        const p = f.dragon.group.position;
        const d = Math.hypot(pos.x - p.x, pos.z - p.z);
        if (d < minDist) {
          minDist = d;
          closest = f;
        }
      }

      let vx = 0;
      let vz = 0;

      if (closest) {
        const tp = closest.dragon.group.position;
        const dx = tp.x - pos.x;
        const dz = tp.z - pos.z;
        const d = Math.max(minDist, 0.0001);

        if (minDist > ENEMY.stopDist) {
          // Aggro chase.
          vx = (dx / d) * ENEMY.chaseSpeed;
          vz = (dz / d) * ENEMY.chaseSpeed;
        } else if (minDist < ENEMY.backoffDist) {
          // Back off to avoid overlapping.
          vx = -(dx / d) * ENEMY.backoffSpeed;
          vz = -(dz / d) * ENEMY.backoffSpeed;
        } else {
          // Hold the attack position, staring the target down.
          enemy.mover.yaw = Math.atan2(dx, dz);
        }

        if (minDist < ENEMY.attackRange && enemy.cooldown <= 0) {
          enemy.cooldown = ENEMY.attackCooldownSec;
          this.#attack(enemy, closest);
        }
      } else {
        // Roam: new random heading every 3 seconds.
        enemy.roamT -= dt;
        if (enemy.roamT <= 0) {
          enemy.roamT = ENEMY.roamIntervalSec;
          enemy.vx = rand(-ENEMY.roamSpeed, ENEMY.roamSpeed);
          enemy.vz = rand(-ENEMY.roamSpeed, ENEMY.roamSpeed);
        }
        vx = enemy.vx;
        vz = enemy.vz;
      }

      enemy.mover.step(vx, vz, dt);
    }

    // Death spin-outs: shrink + spin + sink over 0.5s, then remove.
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const d = this.dying[i];
      d.t += dt;
      const k = Math.min(1, d.t / ENEMY.deathSec);
      d.group.scale.setScalar(Math.max(0.001, 1 - k));
      d.group.rotation.y += Math.PI * 2 * dt; // ~360°/s spin-out
      if (k >= 1) {
        this.scene.remove(d.group);
        this.dying.splice(i, 1);
      }
    }
  }
}
