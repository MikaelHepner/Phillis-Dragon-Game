import * as THREE from 'three';

// Wraps a Dragon (from DragonFactory) with ground movement: it takes a
// world-space velocity each frame, resolves collisions against static
// obstacles, clamps to the world bounds, turns to face its heading, and
// drives the walk/idle animation. Used by both the player and companions so
// the two share one movement + collision implementation.

// Wrap an angle to (-PI, PI].
function wrapAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

// Frame-rate-independent angular damping toward a target yaw.
function dampAngle(current, target, lambda, dt) {
  const diff = wrapAngle(target - current);
  return current + diff * (1 - Math.exp(-lambda * dt));
}

// Height of a climbable cone's surface at (x, z): flat on the crater floor,
// a straight slope down to the base, 0 beyond it.
export function coneHeightAt(c, x, z) {
  const { baseRadius, topRadius, height } = c.cone;
  const d = Math.hypot(x - c.x, z - c.z);
  if (d >= baseRadius) return 0;
  if (d <= topRadius) return height;
  return (height * (baseRadius - d)) / (baseRadius - topRadius);
}

// How far a swimming dragon sinks below the ground plane.
export const SWIM_DEPTH = 6;

export class MovableDragon {
  /**
   * @param {Dragon} dragon      built via createDragon()
   * @param {object} opts
   * @param {Array}  opts.colliders  [{ x, z, radius }] static obstacles
   * @param {object} opts.bounds     { size, margin } walkable square
   * @param {number} [opts.radius]   body radius for collision
   * @param {number} [opts.speed]    max ground speed (units/sec)
   * @param {number} [opts.turnSpeed] yaw damping rate
   * @param {number} [opts.groundY]  fixed y the group sits at
   */
  constructor(dragon, { colliders, bounds, radius = 9, speed = 110, turnSpeed = 9, groundY = 2 }) {
    this.dragon = dragon;
    this.group = dragon.group;
    this.colliders = colliders;
    this.bounds = bounds;
    this.radius = radius;
    this.speed = speed;
    this.turnSpeed = turnSpeed;
    this.groundY = groundY;
    // Colliders tagged climbableBy / swimmableBy this element are terrain,
    // not walls.
    this.element = dragon.config?.element ?? null;
    // Re-wrapping a dragon that is already up a slope (handing control to it)
    // must not drop it to the ground for a frame.
    const p = this.group.position;
    p.y = groundY + this.terrainHeight(p.x, p.z);
    this.yaw = this.group.rotation.y;
    this.moving = false;
  }

  get position() {
    return this.group.position;
  }

  /**
   * Advance one frame with a desired world-space velocity (units/sec).
   * Pass (0, 0) to stand still (idle). Returns the actual speed applied.
   */
  step(vx, vz, dt) {
    const speed = Math.hypot(vx, vz);
    this.moving = speed > 1;

    if (this.moving) {
      const pos = this.position;
      const resolved = this.#resolve(pos.x + vx * dt, pos.z + vz * dt);
      pos.x = resolved.x;
      pos.z = resolved.z;
      pos.y = this.groundY + this.terrainHeight(pos.x, pos.z);
      // Face the direction of travel (dragons are modeled facing +Z).
      const targetYaw = Math.atan2(vx, vz);
      this.yaw = dampAngle(this.yaw, targetYaw, this.turnSpeed, dt);
    }

    this.group.rotation.y = this.yaw;
    this.dragon.setAnimation(this.moving ? 'walk' : 'idle');
    this.dragon.update(dt);
    return speed;
  }

  // Push out of any overlapping obstacle, then clamp inside the world bounds.
  #resolve(x, z) {
    for (const c of this.colliders) {
      if (this.#canClimb(c) || this.#canSwim(c)) continue;
      const dx = x - c.x;
      const dz = z - c.z;
      const min = this.radius + c.radius;
      const d = Math.hypot(dx, dz);
      if (d < min && d > 0.0001) {
        const push = (min - d) / d;
        x += dx * push;
        z += dz * push;
      }
    }
    const lo = this.bounds.margin;
    const hi = this.bounds.size - this.bounds.margin;
    return {
      x: THREE.MathUtils.clamp(x, lo, hi),
      z: THREE.MathUtils.clamp(z, lo, hi),
    };
  }

  #canClimb(c) {
    return this.element !== null && c.climbableBy === this.element && !!c.cone;
  }

  #canSwim(c) {
    return this.element !== null && c.swimmableBy === this.element;
  }

  // Tallest surface this dragon can climb under (x, z); 0 on open ground, and
  // a little below 0 while swimming so it sits in the water instead of on it.
  terrainHeight(x, z) {
    if (this.element === null) return 0;
    let h = 0;
    let swimming = false;
    for (const c of this.colliders) {
      if (this.#canClimb(c)) h = Math.max(h, coneHeightAt(c, x, z));
      else if (this.#canSwim(c) && Math.hypot(x - c.x, z - c.z) < c.radius) swimming = true;
    }
    return h === 0 && swimming ? -SWIM_DEPTH : h;
  }
}
