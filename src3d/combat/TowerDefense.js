import * as THREE from 'three';
import { TOWER_STATS } from '../data/structures.js';

// Tower auto-defense (Batch 9): one global attack clock — every 2.5 seconds
// EVERY tower fires a gold arrow at the closest black dragon within 400
// units, dealing 20 damage (2D MainScene tower loop + shootTowerArrow;
// numbers live in data/structures.js TOWER_STATS from Batch 8).

export class TowerDefense {
  /**
   * @param {object} opts
   * @param {GameState} opts.state             structures list (upgradeType === 'tower')
   * @param {ConstructionManager} opts.construction  anchorFor() → arrow spawn height
   * @param {ProjectileManager} opts.projectiles
   * @param {EnemyManager} opts.enemyManager   targets + hurt()
   * @param {Function} opts.floatText
   */
  constructor({ state, construction, projectiles, enemyManager, floatText }) {
    this.state = state;
    this.construction = construction;
    this.projectiles = projectiles;
    this.enemyManager = enemyManager;
    this.floatText = floatText;
    this.clock = 0;
  }

  #fireFrom(structure) {
    // Closest live enemy within range of this tower.
    let target = null;
    let minDist = TOWER_STATS.range;
    for (const enemy of this.enemyManager.enemies) {
      const p = enemy.dragon.group.position;
      const d = Math.hypot(structure.x - p.x, structure.z - p.z);
      if (d < minDist) {
        minDist = d;
        target = enemy;
      }
    }
    if (!target) return;

    // Arrows leave from the tower top (2D: house.y - 30).
    const anchor = this.construction.anchorFor(structure.id);
    const from = new THREE.Vector3(structure.x, anchor ? anchor.y : 40, structure.z);

    const group = target.dragon.group;
    const aim = new THREE.Vector3();
    const getTargetPos = () => {
      aim.copy(group.position);
      aim.y += 12;
      return aim;
    };

    this.projectiles.fireArrow(from, getTargetPos, () => {
      // The enemy may have died to another arrow mid-flight (2D checked
      // target.active before applying the hit).
      if (!this.enemyManager.enemies.includes(target)) return;
      this.floatText(() => group.position, `🏹 -${TOWER_STATS.damage} HP`, 56, 18);
      this.enemyManager.hurt(target, TOWER_STATS.damage);
    });
  }

  update(dt) {
    this.clock += dt;
    if (this.clock < TOWER_STATS.fireIntervalMs / 1000) return;
    this.clock = 0;
    for (const s of this.state.structures) {
      if (s.upgradeType === 'tower') this.#fireFrom(s);
    }
  }
}
