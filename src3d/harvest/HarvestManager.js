import * as THREE from 'three';

// The gather loop (GAMEPLAY_SYSTEMS.md §1). Two node kinds:
//
//  - Trees  → +1 apple, 2000ms cooldown, apples hide then regrow (2D value
//             from MainScene.collectApple; the tree itself never disappears).
//  - Rocks  → +1 coin +1 stone, then the rock crumbles to rubble and respawns
//             after a cooldown. The 2D game gave only coins and never respawned
//             rocks (TODO "Passive Rock Respawn"); the 3D rebuild plan (Batch 5)
//             asks for stone from rocks and respawn timers, so we add both.
//
// Harvest fires on BOTH walk-into proximity and click. The exploit from
// TODO_AND_BUGS.md #2 (standing on overlapping trees rapid-collecting) is fixed
// structurally: each node owns its own `ready` flag + cooldown, so a node yields
// once, then is inert until it regrows — no global timer to game.

const TREE = {
  type: 'tree',
  harvestRadius: 46,
  cooldownMs: 2000,
  depletes: false,
  yields: [{ res: 'apples', amount: 1 }],
  label: '+1 🍎',
  floatHeight: 58,
};

const ROCK = {
  type: 'rock',
  harvestRadius: 42,
  cooldownMs: 12000,
  depletes: true,
  yields: [
    { res: 'coins', amount: 1 },
    { res: 'stone', amount: 1 },
  ],
  label: '+1 🪙  +1 🪨',
  floatHeight: 26,
};

// Easings for the pop / crumble juice.
const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);
const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

class HarvestNode {
  constructor(object, cfg) {
    this.object = object;
    this.cfg = cfg;
    this.x = object.position.x;
    this.z = object.position.z;
    this.ready = true;
    this.timerMs = 0; // countdown until ready again
    this.baseScale = object.scale.x;
    this.applesGroup = object.userData.applesGroup || null;
    this._tween = null; // { obj, from, to, t, dur, ease }
    // Screen anchor for the floating "+1" text (world-space, height baked in).
    this.floatAnchor = new THREE.Vector3(this.x, cfg.floatHeight, this.z);
    // Let click raycasting map any child mesh back to this node.
    object.userData.harvestNode = this;
  }

  #scaleTween(obj, to, dur, ease) {
    this._tween = { obj, from: obj.scale.x, to, t: 0, dur, ease };
  }

  /** Take one harvest. Returns the config (for yields/label) or null if not ready. */
  harvest() {
    if (!this.ready) return null;
    this.ready = false;
    this.timerMs = this.cfg.cooldownMs;
    if (this.cfg.depletes) {
      // Rock crumbles down to rubble.
      this.#scaleTween(this.object, this.baseScale * 0.32, 0.22, easeOutQuad);
    } else if (this.applesGroup) {
      // Apples get picked: shrink them out of sight.
      this.#scaleTween(this.applesGroup, 0.0001, 0.16, easeOutQuad);
    }
    return this.cfg;
  }

  #regrow() {
    this.ready = true;
    if (this.cfg.depletes) {
      this.#scaleTween(this.object, this.baseScale, 0.5, easeOutBack);
    } else if (this.applesGroup) {
      this.applesGroup.scale.setScalar(0.0001);
      this.#scaleTween(this.applesGroup, 1, 0.5, easeOutBack);
    }
  }

  update(dtSec) {
    if (!this.ready) {
      this.timerMs -= dtSec * 1000;
      if (this.timerMs <= 0) this.#regrow();
    }
    const tw = this._tween;
    if (tw) {
      tw.t += dtSec;
      const k = Math.min(1, tw.t / tw.dur);
      tw.obj.scale.setScalar(tw.from + (tw.to - tw.from) * tw.ease(k));
      if (k >= 1) this._tween = null;
    }
  }

  inRange(px, pz) {
    const dx = px - this.x;
    const dz = pz - this.z;
    return dx * dx + dz * dz <= this.cfg.harvestRadius * this.cfg.harvestRadius;
  }
}

export class HarvestManager {
  /**
   * @param {object} opts
   * @param {THREE.Camera} opts.camera   for click raycasting
   * @param {(node: HarvestNode, cfg: object) => void} opts.onHarvest
   *        called after a successful harvest (award resources + float text)
   */
  constructor({ camera, onHarvest }) {
    this.camera = camera;
    this.onHarvest = onHarvest;
    this.nodes = [];
    this._raycaster = new THREE.Raycaster();
    this._pointer = new THREE.Vector2();
  }

  addTree(object) {
    this.nodes.push(new HarvestNode(object, TREE));
  }
  addRock(object) {
    this.nodes.push(new HarvestNode(object, ROCK));
  }

  /**
   * Retire the node attached to a scenery object (Batch 8: wall tiles destroy
   * trees/rocks within 30 units, and a removed tree must stop yielding).
   */
  removeObject(object) {
    const i = this.nodes.findIndex((n) => n.object === object);
    if (i >= 0) this.nodes.splice(i, 1);
  }

  #collect(node) {
    const cfg = node.harvest();
    if (cfg) this.onHarvest(node, cfg);
  }

  /** Per-frame: regrow timers, node animations, and walk-into harvesting. */
  update(dtSec, playerPos) {
    for (const node of this.nodes) {
      node.update(dtSec);
      if (node.ready && node.inRange(playerPos.x, playerPos.z)) {
        this.#collect(node);
      }
    }
  }

  /**
   * Click handling. Returns true if the click is consumed (a node in range was
   * clicked). An out-of-range node returns false so click-to-move can walk the
   * player over to it, where walk-into harvesting takes over.
   */
  tryClick(clientX, clientY, playerPos) {
    this._pointer.set(
      (clientX / window.innerWidth) * 2 - 1,
      -(clientY / window.innerHeight) * 2 + 1
    );
    this._raycaster.setFromCamera(this._pointer, this.camera);
    const hits = this._raycaster.intersectObjects(
      this.nodes.map((n) => n.object),
      true
    );
    if (!hits.length) return false;

    let obj = hits[0].object;
    while (obj && obj.userData.harvestNode === undefined) obj = obj.parent;
    const node = obj?.userData.harvestNode;
    if (!node) return false;

    if (!node.inRange(playerPos.x, playerPos.z)) return false;
    if (node.ready) this.#collect(node);
    return true; // in range: consume the click either way
  }
}
