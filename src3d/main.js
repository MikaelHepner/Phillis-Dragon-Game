import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createWorld, WORLD_CENTER } from './world.js';
import { CameraRig } from './cameraRig.js';
import { createDragon } from './dragons/DragonFactory.js';
import { DRAGON_TYPES_BY_ID } from './data/dragonTypes.js';
import { PlayerController } from './player/PlayerController.js';
import { CompanionManager } from './companions/CompanionManager.js';
import {
  GameState,
  DECAY_INTERVAL_MS,
  starterStats,
  GIVE_TICK_MS,
  GIVE_TICK_COUNT,
  GIVE_ICON_MS,
} from './state/GameState.js';
import { Hud } from './ui/Hud.js';
import { StoreUI } from './ui/StoreUI.js';
import { CraftingUI } from './ui/CraftingUI.js';
import { BuildUI } from './ui/BuildUI.js';
import { HarvestManager } from './harvest/HarvestManager.js';
import { ConstructionManager } from './structures/ConstructionManager.js';
import { PRODUCTION_INTERVAL_MS } from './data/structures.js';
import { cardIcon } from './data/cards.js';

const GROUND_Y = 2; // dragons' feet rest here on the grass

const canvas = document.getElementById('game-canvas');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x7ec8e3);
scene.fog = new THREE.Fog(0x7ec8e3, 900, 2600);

// Environment map so metallic / glass / crystal dragon skins have something
// to reflect (matches the gallery's setup).
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  1,
  5000
);

const world = createWorld(scene);
const { colliders, bounds } = world;

// — Game state: the single source of truth for resources + per-dragon stats —
const state = new GameState();
new Hud(state);
new StoreUI(state); // dragon store + pack store overlays (Batch 6)
new CraftingUI(state); // card crafting center overlay (Batch 7)

// Registry of selectable dragons in the world: { id, dragon } keyed for
// raycasting and for playing per-dragon feedback animations.
const selectables = [];
function register(id, dragon, entry) {
  dragon.group.userData.dragonId = id;
  selectables.push({ id, dragon, entry });
}

// — Player: the starter dragon (Phillis) —
const playerDragon = createDragon(DRAGON_TYPES_BY_ID.phillis);
playerDragon.group.position.set(WORLD_CENTER.x, GROUND_Y, WORLD_CENTER.z);
scene.add(playerDragon.group);
const playerEntry = state.addDragon({
  id: 'phillis',
  name: DRAGON_TYPES_BY_ID.phillis.name,
  key: DRAGON_TYPES_BY_ID.phillis.key,
  stats: starterStats(),
});
register('phillis', playerDragon, playerEntry);

// — Companions: dragons bought in the store trail the player. (Batch 6
// replaced the Batch-3 hard-coded test companions with real purchases.) —
const companions = new CompanionManager({ colliders, bounds, groundY: GROUND_Y });

// Any dragon added to the collection after boot (store purchase or a crafted
// dragon) spawns just behind the player and joins the follow chain. Crafted
// dragons have unique ids, so the factory config comes from entry.typeId.
state.on('dragonAdded', (entry) => {
  const type = DRAGON_TYPES_BY_ID[entry.typeId];
  if (!type || entry.id === 'phillis') return;
  const dragon = createDragon(type);
  const yaw = playerDragon.group.rotation.y;
  dragon.group.position.set(
    playerDragon.group.position.x - Math.sin(yaw) * 55,
    GROUND_Y,
    playerDragon.group.position.z - Math.cos(yaw) * 55
  );
  dragon.group.rotation.y = yaw;
  scene.add(dragon.group);
  companions.add(dragon);
  register(entry.id, dragon, entry);
  floatOnDragon(dragon, '✨');
});

// — Selection ring: a flat glowing ring under the currently selected dragon —
const selectionRing = new THREE.Mesh(
  new THREE.RingGeometry(13, 17, 32),
  new THREE.MeshBasicMaterial({
    color: 0xffe08a,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
  })
);
selectionRing.rotation.x = -Math.PI / 2;
selectionRing.position.y = 0.2;
selectionRing.visible = false;
scene.add(selectionRing);

let selectedDragon = null;
state.on('selection', (entry) => {
  selectedDragon = entry ? selectables.find((s) => s.id === entry.id)?.dragon : null;
  selectionRing.visible = !!selectedDragon;
});

// Click a dragon to select and care for it (intercepts click-to-move).
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
function pickDragon(clientX, clientY) {
  pointer.set(
    (clientX / window.innerWidth) * 2 - 1,
    -(clientY / window.innerHeight) * 2 + 1
  );
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(
    selectables.map((s) => s.dragon.group),
    true
  );
  if (!hits.length) return false;
  // Walk up to the group carrying the dragonId.
  let obj = hits[0].object;
  while (obj && obj.userData.dragonId === undefined) obj = obj.parent;
  if (!obj) return false;
  state.select(obj.userData.dragonId);
  return true;
}

// Tap routing, in priority order: placement mode consumes every click, then
// dragon selection, then a placed structure (upgrade menu), then a harvest
// node in range; otherwise the tap falls through to click-to-move (which
// walks the player toward a distant node so walk-into harvesting finishes).
const player = new PlayerController(playerDragon, camera, canvas, {
  colliders,
  bounds,
  groundY: GROUND_Y,
  onClick: (x, y) =>
    construction.handleClick(x, y) ||
    pickDragon(x, y) ||
    construction.tryClickStructure(x, y) ||
    harvest.tryClick(x, y, player.position),
});

// Select the player dragon by default so the caretaking panel is populated.
state.select('phillis');

const cameraRig = new CameraRig(camera, playerDragon.group, canvas);

// — Passive stat decay (TECHNICAL_ARCHITECTURE.md §4: every 15,000ms) —
const decayTimer = setInterval(() => state.tickDecay(), DECAY_INTERVAL_MS);
window.addEventListener('beforeunload', () => clearInterval(decayTimer));

// — Floating text feedback (caretaking emoji + harvest "+1 🍎" pops) —
// `getPos` returns a live world-space anchor; `base` is the height above it.
const floaters = [];
function floatText(getPos, text, base = 34, size = 26) {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText =
    `position:absolute;font-size:${size}px;font-weight:bold;pointer-events:none;` +
    'user-select:none;white-space:nowrap;transform:translate(-50%,-50%);transition:none;' +
    'z-index:5;color:#fff;text-shadow:0 2px 3px rgba(0,0,0,0.45)';
  document.body.appendChild(el);
  floaters.push({ el, getPos, base, t: 0 });
}
function floatOnDragon(dragon, text) {
  if (dragon) floatText(() => dragon.group.position, text);
}
function updateFloaters(dt) {
  const v = new THREE.Vector3();
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.t += dt;
    if (f.t >= 1.1) {
      f.el.remove();
      floaters.splice(i, 1);
      continue;
    }
    v.copy(f.getPos());
    v.y += f.base + f.t * 22; // rise as it fades
    v.project(camera);
    f.el.style.left = `${(v.x * 0.5 + 0.5) * window.innerWidth}px`;
    f.el.style.top = `${(-v.y * 0.5 + 0.5) * window.innerHeight}px`;
    f.el.style.opacity = `${1 - f.t / 1.1}`;
  }
}

// Pinned text: like a floater but it bobs above a dragon for a set duration
// (the 2D game's yoyo-tweened card icon during resource generation).
const pins = [];
function pinText(getPos, text, durationMs, base = 48) {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText =
    'position:absolute;font-size:26px;pointer-events:none;user-select:none;' +
    'white-space:nowrap;transform:translate(-50%,-50%);z-index:5;' +
    'filter:drop-shadow(0 2px 2px rgba(0,0,0,0.4))';
  document.body.appendChild(el);
  pins.push({ el, getPos, base, t: 0, dur: durationMs / 1000 });
}
function updatePins(dt) {
  const v = new THREE.Vector3();
  for (let i = pins.length - 1; i >= 0; i--) {
    const p = pins[i];
    p.t += dt;
    if (p.t >= p.dur) {
      p.el.remove();
      pins.splice(i, 1);
      continue;
    }
    v.copy(p.getPos());
    v.y += p.base + Math.sin(p.t * 3.2) * 6; // gentle bob
    v.project(camera);
    p.el.style.left = `${(v.x * 0.5 + 0.5) * window.innerWidth}px`;
    p.el.style.top = `${(-v.y * 0.5 + 0.5) * window.innerHeight}px`;
    p.el.style.opacity = `${Math.min(1, (p.dur - p.t) / 1.5)}`; // fade at the end
  }
}

// Play a little emoji pop when a dragon is cared for.
function reactTo(id) {
  const s = selectables.find((x) => x.id === id);
  return s ? s.dragon : null;
}
state.on('feed', (d) => floatOnDragon(reactTo(d.id), '🍎'));
state.on('pet', (d) => floatOnDragon(reactTo(d.id), '💖'));
state.on('rest', (d) => floatOnDragon(reactTo(d.id), '💤'));
state.on('feedFail', (d) => floatOnDragon(reactTo(d.id), '❌'));
state.on('dragonCrafted', (d) => floatOnDragon(reactTo(d.id), '🎉'));

// — Give-card-to-dragon production (Batch 7, 2D handle*Generation timers):
// the card's icon bobs over the dragon for 60s while it produces +1 of the
// resource every 5s, 12 ticks total. Exact numbers live in GameState consts.
const RESOURCE_POPS = { wood: '+1 🪵', fish: '+1 🐟', apples: '+1 🍎' };
state.on('cardGiven', ({ card, dragon, resource }) => {
  const target = reactTo(dragon.id);
  if (!target) return;
  const anchor = () => target.group.position;
  pinText(anchor, cardIcon(card), GIVE_ICON_MS);
  let ticks = 0;
  const timer = setInterval(() => {
    state.addResource(resource, 1);
    floatText(anchor, RESOURCE_POPS[resource], 40, 20);
    if (++ticks >= GIVE_TICK_COUNT) clearInterval(timer);
  }, GIVE_TICK_MS);
});

// — Harvesting: apples from trees, coins + stone from rocks (Batch 5) —
const harvest = new HarvestManager({
  camera,
  onHarvest(node, cfg) {
    for (const y of cfg.yields) state.addResource(y.res, y.amount);
    floatText(() => node.floatAnchor, cfg.label, 0, 22);
  },
});
world.trees.forEach((t) => harvest.addTree(t));
world.rocks.forEach((r) => harvest.addRock(r));

// — Construction (Batch 8): ghost placement, structures, defensive walls —
const construction = new ConstructionManager({
  scene,
  camera,
  state,
  colliders,
  bounds,
  world,
  harvest,
  getDragonPositions: () => selectables.map((s) => s.dragon.group.position),
  floatText,
});
new BuildUI(state, construction);

// Passive mine/blacksmith yield: one global 5s loop over all structures,
// exactly like the 2D house-yield timer (TECHNICAL_ARCHITECTURE.md §4).
const productionTimer = setInterval(() => state.tickProduction(), PRODUCTION_INTERVAL_MS);
window.addEventListener('beforeunload', () => clearInterval(productionTimer));
state.on('produced', ({ structure, label }) => {
  const anchor = construction.anchorFor(structure.id);
  if (anchor) floatText(() => anchor, label, 14, 20);
});

// Debug hook for automated verification (harmless in normal play).
window.__game = { player, companions, playerDragon, state, harvest, construction };

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Lightweight FPS readout in the HTML HUD.
const fpsEl = document.getElementById('fps');
let frames = 0;
let fpsTimer = 0;

const clock = new THREE.Clock();

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;

  world.update(time);
  player.update(dt);
  companions.update(dt, player.position);
  harvest.update(dt, player.position);
  construction.update(dt);

  // Keep the selection ring pinned under the selected dragon.
  if (selectedDragon) {
    selectionRing.position.x = selectedDragon.group.position.x;
    selectionRing.position.z = selectedDragon.group.position.z;
  }

  updateFloaters(dt);
  updatePins(dt);
  cameraRig.update();
  renderer.render(scene, camera);

  frames++;
  fpsTimer += dt;
  if (fpsTimer >= 1) {
    fpsEl.textContent = `${Math.round(frames / fpsTimer)} fps`;
    frames = 0;
    fpsTimer = 0;
  }
}

renderer.setAnimationLoop(animate);
