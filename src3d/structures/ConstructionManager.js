import * as THREE from 'three';
import {
  createStructureMesh,
  createWallTile,
  createBarbedWire,
  createGrabenTile,
  createLabelSprite,
} from './StructureFactory.js';
import {
  WALL,
  BARBED_WIRE,
  GRABEN,
  structureLabel,
  UPGRADES_BY_ID,
} from '../data/structures.js';

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
   * @param {Array} opts.hazards    shared contact-damage list, read by EnemyManager
   * @param {object} opts.bounds    { size, margin }
   * @param {object} opts.world     createWorld() handles ({ trees, rocks })
   * @param {HarvestManager} opts.harvest  to retire nodes walls destroy
   * @param {() => THREE.Vector3[]} opts.getDragonPositions  all friendly dragons
   * @param {Function} opts.floatText  main.js floating-text helper
   */
  constructor({ scene, camera, state, colliders, hazards, bounds, world, harvest, getDragonPositions, floatText }) {
    this.scene = scene;
    this.camera = camera;
    this.state = state;
    this.colliders = colliders;
    this.hazards = hazards ?? [];
    this.bounds = bounds;
    this.world = world;
    this.harvest = harvest;
    this.getDragonPositions = getDragonPositions;
    this.floatText = floatText;

    this.records = new Map(); // structure id -> { entry, group, collider, anchor }
    this.wallTiles = []; // { group, collider }
    this.grabenTiles = []; // { group, collider }
    this.wireRecords = new Map(); // wire id -> { entry, group, collider, hazard }
    this.wallRing = null; // { left, right, top, bottom, midX } — outer defences hang off this
    this.growing = []; // staggered scale-in queue shared by walls, graben, wire
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
    state.on('barbedWireAdded', (w) => this.#spawnBarbedWire(w));
    state.on('barbedWireRemoved', (w) => this.#despawnBarbedWire(w));
    state.on('grabenDug', () => this.#rebuildGraben());
    // A restored save has already rebuilt the wall ring by the time this fires.
    state.on('defencesRestored', () => {
      this.#rebuildGraben();
      this.#relineBarbedWire();
    });
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

  /**
   * Live collide radius of a placed structure — it changes with upgrades, which
   * swap in a different model. The night-shelter code needs it to know how close
   * a dragon can actually get to a building's centre.
   */
  radiusFor(structureId) {
    return this.records.get(structureId)?.collider.radius ?? null;
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
    for (const tile of this.wallTiles) this.#removeTile(tile);
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
    // Cached for the outer defences, which are positioned relative to the ring
    // rather than placed by hand. "Front" is the +z edge — the side the gate
    // gap sits on, and the side the castle model's own gate faces.
    this.wallRing = { left, right, top, bottom, midX };
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

    // The ring moved, so everything hanging off it has to follow.
    this.#rebuildGraben();
    this.#relineBarbedWire();
  }

  #spawnWallTile({ x, z }, delayMs) {
    // Destroy overlapping trees/rocks (2D spawnWallTile, radius 30) so the
    // ring never fuses with scenery. Retire their colliders + harvest nodes.
    this.#clearScenery(this.world.trees, x, z);
    this.#clearScenery(this.world.rocks, x, z);

    const group = createWallTile();
    group.position.set(x, 0, z);
    this.scene.add(group);
    const tile = { group, collider: null };
    this.wallTiles.push(tile);
    // Collision arms once grown, like the 2D refreshBody-on-complete.
    this.#grow(group, delayMs, WALL.growSec, () => {
      tile.collider = { x, z, radius: group.userData.collideRadius };
      this.colliders.push(tile.collider);
    });
  }

  // — Graben: an impassable trench ring one tile outside the walls ————————
  // One-shot purchase, but the tiles themselves are rebuilt from the ring
  // geometry whenever the walls move — same reasoning as the walls not saving
  // their tile positions: a loaded island matches a live one exactly.

  /** Why the Hub's DIG button is inert, or { ok: true }. */
  canDigGraben() {
    if (!this.wallRing) {
      return { ok: false, reason: 'Build a castle first — the trench rings its walls.' };
    }
    if (this.state.hasGraben) return { ok: false, reason: 'Already dug.' };
    if (!this.state.canAfford(GRABEN.cost)) return { ok: false, reason: null }; // cost chips say it
    return { ok: true };
  }

  digGraben() {
    const check = this.canDigGraben();
    if (check.ok) this.state.digGraben(); // emits 'grabenDug' → #rebuildGraben
    return check;
  }

  #grabenPositions() {
    const r = this.wallRing;
    const o = GRABEN.offset;
    const left = r.left - o;
    const right = r.right + o;
    const top = r.top - o;
    const bottom = r.bottom + o;
    const positions = [];
    const eps = 0.001; // guards the float accumulation in these <= walks

    for (let x = left; x <= right + eps; x += GRABEN.spacing) positions.push({ x, z: top });
    for (let z = top + GRABEN.spacing; z <= bottom + eps; z += GRABEN.spacing) {
      positions.push({ x: right, z });
    }
    // Front edge, minus the causeway: the tiles in line with the wall's gate
    // stay undug so the island never seals its own occupants in.
    for (let x = right - GRABEN.spacing; x >= left - eps; x -= GRABEN.spacing) {
      if (Math.abs(x - r.midX) >= WALL.gateHalfWidth) positions.push({ x, z: bottom });
    }
    for (let z = bottom - GRABEN.spacing; z >= top + GRABEN.spacing - eps; z -= GRABEN.spacing) {
      positions.push({ x: left, z });
    }
    return positions;
  }

  #rebuildGraben() {
    for (const tile of this.grabenTiles) this.#removeTile(tile);
    this.grabenTiles = [];
    if (!this.state.hasGraben || !this.wallRing) return;

    this.#grabenPositions().forEach((pos, index) => {
      this.#clearScenery(this.world.trees, pos.x, pos.z, GRABEN.clearRadius);
      this.#clearScenery(this.world.rocks, pos.x, pos.z, GRABEN.clearRadius);

      const group = createGrabenTile();
      group.position.set(pos.x, 0, pos.z);
      this.scene.add(group);
      const tile = { group, collider: null };
      this.grabenTiles.push(tile);
      this.#grow(group, index * GRABEN.staggerMs, GRABEN.growSec, () => {
        tile.collider = { x: pos.x, z: pos.z, radius: group.userData.collideRadius };
        this.colliders.push(tile.collider);
      });
    });

    const banner = new THREE.Vector3(this.wallRing.midX, 30, this.wallRing.top - GRABEN.offset - 40);
    this.floatText(() => banner, '🕳️ Graben Dug!', 20);
  }

  // — Barbed wire: the front line, outside the graben ————————————————
  // Enemies pile up against the trench's outer lip, so that band is the only
  // place a contact hazard can ever bite. Slots fill nearest-the-gate first,
  // guarding the causeway approach from both flanks — the causeway columns
  // themselves stay clear, since wire is solid and would trap the player.

  #frontSlots() {
    const r = this.wallRing;
    if (!r) return [];
    const z = r.bottom + BARBED_WIRE.offset;
    const slots = [];
    for (let x = r.left; x <= r.right + 0.001; x += WALL.spacing) {
      if (Math.abs(x - r.midX) < WALL.gateHalfWidth) continue; // causeway stays open
      slots.push({ x, z });
    }
    slots.sort((a, b) => Math.abs(a.x - r.midX) - Math.abs(b.x - r.midX));
    return slots;
  }

  /** Why the Hub's BUILD button is inert, or { ok: true }. */
  canBuyBarbedWire() {
    if (!this.wallRing) {
      return { ok: false, reason: 'Build a castle first — wire lines its front wall.' };
    }
    if (this.state.barbedWires.length >= this.#frontSlots().length) {
      return { ok: false, reason: 'The front line is full.' };
    }
    if (!this.state.canAfford(BARBED_WIRE.cost)) return { ok: false, reason: null };
    return { ok: true };
  }

  buyBarbedWire() {
    const check = this.canBuyBarbedWire();
    if (!check.ok) return check;
    const slot = this.#frontSlots()[this.state.barbedWires.length];
    this.state.buildBarbedWire(slot.x, slot.z); // emits 'barbedWireAdded'
    return check;
  }

  #spawnBarbedWire(entry) {
    const group = createBarbedWire();
    group.position.set(entry.x, 0, entry.z);
    this.scene.add(group);

    // A single segment pops in over 0.3s, so unlike the staggered wall/graben
    // rings there's nothing to gain from delaying its collider.
    const collider = { x: entry.x, z: entry.z, radius: BARBED_WIRE.collideRadius };
    this.colliders.push(collider);
    const hazard = {
      x: entry.x,
      z: entry.z,
      radius: BARBED_WIRE.contactRadius,
      damage: BARBED_WIRE.damage,
      tickSec: BARBED_WIRE.tickSec,
      label: '🌵 Barbed Wire!',
    };
    this.hazards.push(hazard);

    this.wireRecords.set(entry.id, { entry, group, collider, hazard });
    this.#grow(group, 0, BARBED_WIRE.growSec);

    const anchor = new THREE.Vector3(entry.x, 26, entry.z);
    this.floatText(() => anchor, '🌵 Barbed Wire!', 18);
  }

  #despawnBarbedWire(entry) {
    const rec = this.wireRecords.get(entry.id);
    if (!rec) return;
    this.#removeGroup(rec.group);
    this.#unlist(this.colliders, rec.collider);
    this.#unlist(this.hazards, rec.hazard);
    this.wireRecords.delete(entry.id);
  }

  /**
   * Re-seat every owned segment onto the current front edge. Segments with no
   * slot left (a rebuilt ring can be narrower) are refunded rather than
   * silently destroyed. Also the restore path: entries loaded from a save have
   * no mesh yet and get spawned here, once the walls are already up.
   */
  #relineBarbedWire() {
    if (!this.wallRing) return;
    const slots = this.#frontSlots();
    const wires = this.state.barbedWires;
    while (wires.length > slots.length) this.state.refundBarbedWire(wires[wires.length - 1]);

    wires.forEach((entry, i) => {
      entry.x = slots[i].x;
      entry.z = slots[i].z;
      const rec = this.wireRecords.get(entry.id);
      if (!rec) {
        this.#spawnBarbedWire(entry);
        return;
      }
      rec.group.position.set(entry.x, 0, entry.z);
      rec.collider.x = entry.x;
      rec.collider.z = entry.z;
      rec.hazard.x = entry.x;
      rec.hazard.z = entry.z;
    });
  }

  // — Shared teardown helpers ————————————————————————————————————
  #unlist(list, item) {
    const i = list.indexOf(item);
    if (i >= 0) list.splice(i, 1);
  }

  #removeGroup(group) {
    this.scene.remove(group);
    // Drop any pending scale-in so a removed tile can't resurrect its collider.
    for (let i = this.growing.length - 1; i >= 0; i--) {
      if (this.growing[i].group === group) this.growing.splice(i, 1);
    }
  }

  #removeTile(tile) {
    this.#removeGroup(tile.group);
    if (tile.collider) this.#unlist(this.colliders, tile.collider);
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

  // — Per-frame animation: staggered grow-ins + structure pop tweens ————
  #tween(group, fromScale, toScale, dur, onDone) {
    group.scale.copy(fromScale);
    this.tweens.push({ group, fromScale, toScale, t: 0, dur, onDone });
  }

  /** Queue a scale-in: hold for `delayMs`, then 0 → full over `dur` seconds. */
  #grow(group, delayMs, dur, onGrown) {
    group.scale.setScalar(0.001);
    this.growing.push({ group, delaySec: delayMs / 1000, t: 0, dur, onGrown });
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

    for (let i = this.growing.length - 1; i >= 0; i--) {
      const g = this.growing[i];
      if (g.delaySec > 0) {
        g.delaySec -= dt;
        continue;
      }
      g.t = Math.min(1, g.t + dt / g.dur);
      g.group.scale.setScalar(Math.max(0.001, easeOutBack(g.t)));
      if (g.t >= 1) {
        g.group.scale.setScalar(1);
        this.growing.splice(i, 1);
        g.onGrown?.();
      }
    }
  }
}
