import { MovableDragon } from '../entities/MovableDragon.js';
import {
  shelterSpots,
  assignShelters,
  doorPosition,
  enterDistance,
} from './NightShelter.js';

// Owned dragons trail the player in a loose chain (AI_HANDOFF.md Phase 1):
// each companion follows the one ahead of it — the player is the head — and
// keeps a minimum separation so they never stack on the same spot.
//
// At night the chain breaks and the team turns in: each companion walks to a
// house or castle, steps inside, and stays hidden until dawn. Phillis is never
// sent to bed — she is not a companion, so she never reaches this class.

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

    // { mover, spot, indoors, slot }: spot is the shelter this dragon is walking
    // to or asleep in, slot its place at that shelter's door.
    this.companions = [];

    // Dragons currently asleep indoors. main.js filters this out of enemy
    // targeting and build-placement checks, so it is one reusable Set rather
    // than a fresh array every frame.
    this.sheltered = new Set();

    // Signature of the structure list the current beds were handed out from;
    // null means "nobody is assigned" (daytime, or not yet computed).
    this._assignedAt = null;
  }

  /** Register a built dragon (positioned in-world) as a follower. */
  add(dragon) {
    const mover = new MovableDragon(dragon, {
      colliders: this.colliders,
      bounds: this.bounds,
      speed: COMPANION_SPEED,
      groundY: this.groundY,
    });
    this.companions.push({ mover, spot: null, indoors: false, slot: 0 });
    // A dragon bought mid-night still deserves a bed: force the next update to
    // re-run the assignment rather than wait for the buildings to change.
    this._assignedAt = null;
    return mover;
  }

  /**
   * @param {number} dt
   * @param {THREE.Vector3} leaderPos      the player's position (chain head)
   * @param {object} [opts]
   * @param {boolean} [opts.night]         companions head indoors while true
   * @param {Array} [opts.structures]      GameState.structures, for shelter lookup
   * @param {(id) => number|null} [opts.radiusFor]  live structure collide radius
   */
  update(dt, leaderPos, { night = false, structures = [], radiusFor } = {}) {
    if (night) this.#assignBeds(structures, radiusFor);
    else this.#wakeAll();

    let leader = leaderPos;

    for (let i = 0; i < this.companions.length; i++) {
      const c = this.companions[i];
      const mover = c.mover;
      const pos = mover.position;

      // Asleep: no steering, no animation ticking, and no place in the chain —
      // the dragons behind must not trail an invisible leader into a house.
      if (c.indoors) continue;

      let vx = 0;
      let vz = 0;

      if (c.spot) {
        // Heading for bed: seek the door at full speed instead of the player.
        const door = doorPosition(c.spot, mover.radius, c.slot);
        const dx = door.x - pos.x;
        const dz = door.z - pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.0001) {
          vx += (dx / dist) * mover.speed;
          vz += (dz / dist) * mover.speed;
        }
      } else {
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
      }

      // Separation: push away from any other companion that's too close.
      // Sleepers are skipped — they take up no space out here.
      for (let j = 0; j < this.companions.length; j++) {
        if (j === i || this.companions[j].indoors) continue;
        const other = this.companions[j].mover.position;
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

      if (c.spot) {
        // Close enough to be inside. A dragon on its way to bed is also out of
        // the follow chain, so nobody trails it to the doorstep.
        const d = Math.hypot(pos.x - c.spot.x, pos.z - c.spot.z);
        if (d <= enterDistance(c.spot, mover.radius)) this.#enter(c);
        continue;
      }

      // The next companion trails this one, forming the chain.
      leader = pos;
    }

    this.sheltered.clear();
    for (const c of this.companions) {
      if (c.indoors) this.sheltered.add(c.mover.dragon);
    }
  }

  // Beds are handed out once per nightfall, and again whenever the buildings
  // change (a house built, or upgraded into a workshop that evicts its lodgers).
  // Re-running it every frame would let dragons swap houses mid-walk as the
  // distances between them shift.
  #assignBeds(structures, radiusFor) {
    const spots = shelterSpots(structures, radiusFor);
    const signature = spots.map((s) => s.id).join(',');
    if (signature === this._assignedAt) return;
    this._assignedAt = signature;

    // Anyone already asleep keeps their bed if it still exists, and gives up its
    // capacity so a re-pair can't double-book them.
    const taken = new Map();
    for (const c of this.companions) {
      if (!c.indoors) continue;
      const still = spots.find((s) => s.id === c.spot?.id);
      if (still) {
        c.spot = still; // refresh the radius, which an upgrade may have changed
        taken.set(still.id, (taken.get(still.id) ?? 0) + 1);
      } else {
        this.#wake(c); // its shelter is gone — back out into the night
      }
    }

    const free = spots
      .map((s) => ({ ...s, capacity: s.capacity - (taken.get(s.id) ?? 0) }))
      .filter((s) => s.capacity > 0);

    const pending = this.companions.filter((c) => !c.indoors);
    const beds = assignShelters(pending.map((c) => c.mover.position), free);
    pending.forEach((c, i) => {
      c.spot = beds.get(i) ?? null;
    });

    // Distinct door slots per shelter so housemates don't overlap going in or
    // coming back out.
    const used = new Map();
    for (const c of this.companions) {
      if (!c.spot) continue;
      const n = used.get(c.spot.id) ?? 0;
      c.slot = n;
      used.set(c.spot.id, n + 1);
    }
  }

  // Step inside. Hiding the group is what "indoors" means visually, and it also
  // takes the dragon out of every raycast (Three.js skips invisible objects), so
  // it can't be clicked or selected while it sleeps.
  #enter(c) {
    c.indoors = true;
    c.mover.dragon.setAnimation('idle');
    c.mover.group.visible = false;
  }

  // Back outside: reappear at the door and rejoin the chain.
  #wake(c) {
    if (c.indoors && c.spot) {
      const door = doorPosition(c.spot, c.mover.radius, c.slot);
      c.mover.position.x = door.x;
      c.mover.position.z = door.z;
    }
    c.mover.group.visible = true;
    c.indoors = false;
    c.spot = null;
  }

  #wakeAll() {
    if (this._assignedAt === null) return; // already daytime; nothing to undo
    for (const c of this.companions) this.#wake(c);
    this._assignedAt = null;
  }
}
