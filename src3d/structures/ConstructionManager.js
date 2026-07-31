import * as THREE from 'three';
import {
  createStructureMesh,
  createWallTile,
  createLabelSprite,
} from './StructureFactory.js';
import { WALL, structureLabel, UPGRADES_BY_ID } from '../data/structures.js';

// Construction (Batch 8): ghost-mesh placement mode, structure meshes in the
// world, and the defensive wall ring — the algorithm is a "must keep" system
// (AI_HANDOFF.md §4), ported step-for-step from the 2D buildWallAroundBuildings
// with x/y mapped to x/z. Placement itself is the one deliberate upgrade over
// the 2D game (which auto-spawned at a random offset): the rebuild plan asks
// for a ghost that follows the ground and click-to-place.
//
// GameState stays the source of truth: this class listens to structureAdded /
// structureUpgraded and only manages meshes, colliders, and animations.

const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

// Ghost placement materials (shared; the ghost's real materials are swapped in
// on placement by building a fresh mesh).
const GHOST_VALID = new THREE.MeshLambertMaterial({
  color: 0x39d353,
  transparent: true,
  opacity: 0.55,
  depthWrite: false,
});
const GHOST_INVALID = new THREE.MeshLambertMaterial({
  color: 0xe74c3c,
  transparent: true,
  opacity: 0.55,
  depthWrite: false,
});

export class ConstructionManager {
  /**
   * @param {object} opts
   * @param {THREE.Scene} opts.scene
   * @param {THREE.Camera} opts.camera
   * @param {GameState} opts.state
   * @param {Array} opts.colliders  shared { x, z, radius } list (world + movers)
   * @param {object} opts.bounds    { size, margin }
   * @param {object} opts.world     createWorld() handles ({ trees, rocks })
   * @param {HarvestManager} opts.harvest  to retire nodes walls destroy
   * @param {() => THREE.Vector3[]} opts.getDragonPositions  all friendly dragons
   * @param {Function} opts.floatText  main.js floating-text helper
   */
  constructor({ scene, camera, state, colliders, bounds, world, harvest, getDragonPositions, floatText }) {
    this.scene = scene;
    this.camera = camera;
    this.state = state;
    this.colliders = colliders;
    this.bounds = bounds;
    this.world = world;
    this.harvest = harvest;
    this.getDragonPositions = getDragonPositions;
    this.floatText = floatText;

    this.records = new Map(); // structure id -> { entry, group, collider, anchor }
    this.wallTiles = []; // { group, collider, delaySec, growT, grown }
    this.tweens = []; // { group, fromScale(Vector3), toScale, t, dur, onDone }

    // Placement mode state.
    this.placing = null; // building def from data/structures.js, or null
    this.ghost = null;
    this.ghostValid = false;
    this.onPlacementChanged = null; // BuildUI hook: (defOrNull) => void
    this.onStructureClicked = null; // BuildUI hook: (entry) => void

    this._raycaster = new THREE.Raycaster();
    this._pointer = new THREE.Vector2();
    this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    window.addEventListener('pointermove', (e) => {
      if (this.placing) this.#moveGhost(e.clientX, e.clientY);
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') this.cancelPlacement();
    });
    window.addEventListener('contextmenu', (e) => {
      if (this.placing) {
        e.preventDefault();
        this.cancelPlacement();
      }
    });

    state.on('structureAdded', (s) => this.#spawnStructure(s));
    state.on('structureUpgraded', (s) => this.#applyUpgrade(s));
  }

  // — Placement mode ————————————————————————————————————————————
  beginPlacement(def) {
    this.cancelPlacement();
    this.placing = def;
    this.ghost = createStructureMesh(def.id);
    this.ghost.traverse((o) => {
      if (o.isMesh) {
        o.material = GHOST_VALID;
        o.castShadow = false;
      }
    });
    this.ghost.visible = false; // until the pointer first hits the ground
    this.scene.add(this.ghost);
    this.onPlacementChanged?.(def);
  }

  cancelPlacement() {
    if (!this.placing) return;
    this.scene.remove(this.ghost);
    this.placing = null;
    this.ghost = null;
    this.onPlacementChanged?.(null);
  }

  #groundPoint(clientX, clientY) {
    this._pointer.set(
      (clientX / window.innerWidth) * 2 - 1,
      -(clientY / window.innerHeight) * 2 + 1
    );
    this._raycaster.setFromCamera(this._pointer, this.camera);
    const hit = new THREE.Vector3();
    return this._raycaster.ray.intersectPlane(this._groundPlane, hit) ? hit : null;
  }

  #isValidSpot(x, z) {
    const r = this.ghost.userData.collideRadius;
    // Inside the walkable island (same margin the movers use).
    const lo = this.bounds.margin + r;
    const hi = this.bounds.size - this.bounds.margin - r;
    if (x < lo || x > hi || z < lo || z > hi) return false;
    // Clear of trees, rocks, structures, and walls.
    for (const c of this.colliders) {
      if (Math.hypot(x - c.x, z - c.z) < c.radius + r) return false;
    }
    // Clear of every friendly dragon (2D: 85 for houses, 100 for castles).
    for (const p of this.getDragonPositions()) {
      if (Math.hypot(x - p.x, z - p.z) < this.placing.minDragonDist) return false;
    }
    return true;
  }

  #moveGhost(clientX, clientY) {
    const hit = this.#groundPoint(clientX, clientY);
    if (!hit) return;
    this.ghost.visible = true;
    this.ghost.position.set(hit.x, 0, hit.z);
    this.ghostValid = this.#isValidSpot(hit.x, hit.z);
    const mat = this.ghostValid ? GHOST_VALID : GHOST_INVALID;
    this.ghost.traverse((o) => {
      if (o.isMesh) o.material = mat;
    });
  }

  /**
   * Click handling while placing. Consumes every click (a misclick must not
   * walk the player away); a valid spot builds through GameState, which
   * deducts the cost and emits structureAdded back into #spawnStructure.
   */
  handleClick(clientX, clientY) {
    if (!this.placing) return false;
    this.#moveGhost(clientX, clientY);
    if (this.ghost.visible && this.ghostValid) {
      const built = this.state.buildStructure(
        this.placing.id,
        this.ghost.position.x,
        this.ghost.position.z
      );
      if (built) this.cancelPlacement();
    }
    return true;
  }

  /** Click routing for placed structures: opens the upgrade menu via BuildUI. */
  tryClickStructure(clientX, clientY) {
    if (this.records.size === 0) return false;
    this._pointer.set(
      (clientX / window.innerWidth) * 2 - 1,
      -(clientY / window.innerHeight) * 2 + 1
    );
    this._raycaster.setFromCamera(this._pointer, this.camera);
    const groups = [...this.records.values()].map((r) => r.group);
    const hits = this._raycaster.intersectObjects(groups, true);
    if (!hits.length) return false;
    let obj = hits[0].object;
    while (obj && obj.userData.structureId === undefined) obj = obj.parent;
    if (!obj) return false;
    const record = this.records.get(obj.userData.structureId);
    if (!record) return false;
    this.onStructureClicked?.(record.entry);
    return true;
  }

  /** Fixed world-space anchor above a structure, for floating yield text. */
  anchorFor(structureId) {
    return this.records.get(structureId)?.anchor ?? null;
  }

  // — Structure meshes ———————————————————————————————————————————
  #buildGroupFor(s) {
    // An upgraded structure shows its class model — the 3D reading of the 2D
    // tint+label change. Castles keep their fortress model (a castle-sized
    // mine would read as a downgrade); they get the class tint instead.
    const kind = s.type === 'castle' ? 'castle' : s.upgradeType || s.type;
    const group = createStructureMesh(kind);
    if (s.type === 'castle' && s.upgradeType) this.#tint(group, UPGRADES_BY_ID[s.upgradeType].tint);
    group.position.set(s.x, 0, s.z);
    group.userData.structureId = s.id;
    const label = createLabelSprite(structureLabel(s));
    label.position.y = group.userData.height + 10;
    group.add(label);
    return group;
  }

  #tint(group, tint) {
    const t = new THREE.Color(tint);
    group.traverse((o) => {
      if (o.isMesh) {
        o.material = o.material.clone();
        o.material.color.lerp(t, 0.45);
      }
    });
  }

  #spawnStructure(s) {
    const group = this.#buildGroupFor(s);
    this.scene.add(group);

    const collider = { x: s.x, z: s.z, radius: group.userData.collideRadius };
    this.colliders.push(collider);

    const anchor = new THREE.Vector3(s.x, group.userData.height, s.z);
    this.records.set(s.id, { entry: s, group, collider, anchor });

    // Pop in (2D build tweens are Back.easeOut scale-ups).
    this.#tween(group, new THREE.Vector3(0.01, 0.01, 0.01), new THREE.Vector3(1, 1, 1), 0.4);

    this.floatText(() => anchor, s.type === 'castle' ? '🏰 Castle Built!' : '🏠 House Built!', 20);

    // The must-keep rule: ONLY a castle triggers the wall ring (2D
    // spawnCastle → buildWallAroundBuildings; houses never do).
    if (s.type === 'castle') this.#rebuildWalls();
  }

  #applyUpgrade(s) {
    const record = this.records.get(s.id);
    if (!record) return;

    this.scene.remove(record.group);
    record.group = this.#buildGroupFor(s);
    this.scene.add(record.group);
    record.collider.radius = record.group.userData.collideRadius;
    record.anchor.y = record.group.userData.height;

    // Squash-and-stretch pop, the 3D take on the 2D upgrade bounce
    // (scaleX 0.25 / scaleY 0.15 yoyo) — rise from squashed to full.
    this.#tween(record.group, new THREE.Vector3(1.3, 0.15, 1.3), new THREE.Vector3(1, 1, 1), 0.35);
    this.floatText(() => record.anchor, `⬆️ Upgraded to ${structureLabel(s)}!`, 20);
  }

  // — Defensive wall ring (2D buildWallAroundBuildings, verbatim port) ————
  #rebuildWalls() {
    // "Clear existing walls first to handle expansion/rebuilding."
    for (const tile of this.wallTiles) {
      this.scene.remove(tile.group);
      if (tile.collider) {
        const i = this.colliders.indexOf(tile.collider);
        if (i >= 0) this.colliders.splice(i, 1);
      }
    }
    this.wallTiles = [];

    if (this.state.structures.length === 0) return;

    // Bounding box of all houses/castles (center points, exactly like 2D).
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const s of this.state.structures) {
      minX = Math.min(minX, s.x);
      maxX = Math.max(maxX, s.x);
      minZ = Math.min(minZ, s.z);
      maxZ = Math.max(maxZ, s.z);
    }

    const left = minX - WALL.padding;
    const right = maxX + WALL.padding;
    const top = minZ - WALL.padding; // 2D "top" (min y) = north (min z)
    const bottom = maxZ + WALL.padding;
    const midX = (left + right) / 2;
    const positions = [];

    // Top edge: left to right.
    for (let x = left; x <= right; x += WALL.spacing) positions.push({ x, z: top });
    // Right edge: top + spacing to bottom.
    for (let z = top + WALL.spacing; z <= bottom; z += WALL.spacing) positions.push({ x: right, z });
    // Bottom edge, right to left — leaving the gate gap in the middle.
    for (let x = right - WALL.spacing; x >= left; x -= WALL.spacing) {
      if (Math.abs(x - midX) >= WALL.gateHalfWidth) positions.push({ x, z: bottom });
    }
    // Left edge: bottom - spacing up to top + spacing.
    for (let z = bottom - WALL.spacing; z >= top + WALL.spacing; z -= WALL.spacing) {
      positions.push({ x: left, z });
    }

    positions.forEach((pos, index) => this.#spawnWallTile(pos, index * WALL.staggerMs));

    const banner = new THREE.Vector3(midX, 30, top - 30);
    this.floatText(() => banner, '🛡️ Defensive Walls Erected!', 20);
  }

  #spawnWallTile({ x, z }, delayMs) {
    // Destroy overlapping trees/rocks (2D spawnWallTile, radius 30) so the
    // ring never fuses with scenery. Retire their colliders + harvest nodes.
    this.#clearScenery(this.world.trees, x, z);
    this.#clearScenery(this.world.rocks, x, z);

    const group = createWallTile();
    group.position.set(x, 0, z);
    group.scale.setScalar(0.001); // grows in after its stagger delay
    this.scene.add(group);
    this.wallTiles.push({ group, collider: null, delaySec: delayMs / 1000, growT: 0 });
  }

  #clearScenery(list, x, z, radius = WALL.clearRadius) {
    for (let i = list.length - 1; i >= 0; i--) {
      const obj = list[i];
      if (Math.hypot(obj.position.x - x, obj.position.z - z) >= radius) continue;
      this.scene.remove(obj);
      list.splice(i, 1);
      const ci = this.colliders.findIndex(
        (c) => c.x === obj.position.x && c.z === obj.position.z
      );
      if (ci >= 0) this.colliders.splice(ci, 1);
      this.harvest.removeObject(obj);
    }
  }

  // — Per-frame animation: wall stagger/grow + structure pop tweens ————
  #tween(group, fromScale, toScale, dur, onDone) {
    group.scale.copy(fromScale);
    this.tweens.push({ group, fromScale, toScale, t: 0, dur, onDone });
  }

  update(dt) {
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      const e = easeOutBack(k);
      tw.group.scale.lerpVectors(tw.fromScale, tw.toScale, e);
      if (k >= 1) {
        tw.group.scale.copy(tw.toScale);
        this.tweens.splice(i, 1);
        tw.onDone?.();
      }
    }

    for (const tile of this.wallTiles) {
      if (tile.collider) continue; // fully grown
      if (tile.delaySec > 0) {
        tile.delaySec -= dt;
        continue;
      }
      tile.growT = Math.min(1, tile.growT + dt / WALL.growSec);
      tile.group.scale.setScalar(Math.max(0.001, easeOutBack(tile.growT)));
      if (tile.growT >= 1) {
        // Collision arms once grown, like the 2D refreshBody-on-complete.
        tile.collider = {
          x: tile.group.position.x,
          z: tile.group.position.z,
          radius: tile.group.userData.collideRadius,
        };
        this.colliders.push(tile.collider);
      }
    }
  }
}
