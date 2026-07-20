import * as THREE from 'three';
import { MovableDragon } from '../entities/MovableDragon.js';

// Owned dragons trail the player in a loose chain (AI_HANDOFF.md Phase 1):
// each companion follows the one ahead of it — the player is the head — and
// keeps a minimum separation so they never stack on the same spot.

const FOLLOW_DIST = 34; // stop this far behind the leader
const CATCH_UP_RANGE = 45; // distance over which speed ramps to full
const SEPARATION_DIST = 26; // personal space between companions
const SEPARATION_FORCE = 90; // push strength when too close
const COMPANION_SPEED = 130; // a touch faster than the player so they keep up

export class CompanionManager {
  constructor({ colliders, bounds, groundY = 2 }) {
    this.colliders = colliders;
    this.bounds = bounds;
    this.groundY = groundY;
    this.companions = [];
  }

  /** Register a built dragon (positioned in-world) as a follower. */
  add(dragon) {
    const mover = new MovableDragon(dragon, {
      colliders: this.colliders,
      bounds: this.bounds,
      speed: COMPANION_SPEED,
      groundY: this.groundY,
    });
    this.companions.push(mover);
    return mover;
  }

  update(dt, leaderPos) {
    let leader = leaderPos;

    for (let i = 0; i < this.companions.length; i++) {
      const mover = this.companions[i];
      const pos = mover.position;

      let vx = 0;
      let vz = 0;

      // Seek toward the leader, but only past the follow distance.
      const dx = leader.x - pos.x;
      const dz = leader.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > FOLLOW_DIST) {
        const ramp = Math.min(1, (dist - FOLLOW_DIST) / CATCH_UP_RANGE);
        const s = mover.speed * ramp;
        vx += (dx / dist) * s;
        vz += (dz / dist) * s;
      }

      // Separation: push away from any other companion that's too close.
      for (let j = 0; j < this.companions.length; j++) {
        if (j === i) continue;
        const other = this.companions[j].position;
        const sx = pos.x - other.x;
        const sz = pos.z - other.z;
        const sd = Math.hypot(sx, sz);
        if (sd < SEPARATION_DIST && sd > 0.0001) {
          const strength = ((SEPARATION_DIST - sd) / SEPARATION_DIST) * SEPARATION_FORCE;
          vx += (sx / sd) * strength;
          vz += (sz / sd) * strength;
        }
      }

      mover.step(vx, vz, dt);

      // The next companion trails this one, forming the chain.
      leader = pos;
    }
  }
}
