import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createWorld, randomWorldSeed, WORLD_CENTER } from './world.js';
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
import { readSave, writeSave, clearSave, applySave, AUTOSAVE_MS } from './state/SaveManager.js';
import { Hud } from './ui/Hud.js';
import { StoreUI } from './ui/StoreUI.js';
import { CraftingUI } from './ui/CraftingUI.js';
import { BuildUI } from './ui/BuildUI.js';
import { SettingsUI } from './ui/SettingsUI.js';
import { HarvestManager } from './harvest/HarvestManager.js';
import { ConstructionManager } from './structures/ConstructionManager.js';
import { PRODUCTION_INTERVAL_MS } from './data/structures.js';
import { cardIcon } from './data/cards.js';
import { ProjectileManager } from './combat/Projectiles.js';
import { EnemyManager } from './combat/EnemyManager.js';
import { TowerDefense } from './combat/TowerDefense.js';
import { GameOverUI } from './ui/GameOverUI.js';
import { BattleArena } from './battle/BattleArena.js';
import { FightUI } from './ui/FightUI.js';
import { DayNightCycle } from './DayNightCycle.js';
import { AudioManager } from './audio/AudioManager.js';
import { BlackRoom } from './blackroom/BlackRoom.js';

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
const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = envTexture;

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  1,
  5000
);

// — Save file (Batch 11) —————————————————————————————————————————
// Read before anything is built: the island's own layout comes from the saved
// world seed, so scenery has to be generated with it rather than re-scattered.
const save = readSave();
const worldSeed = save?.worldSeed ?? randomWorldSeed();

const world = createWorld(scene, worldSeed);
const { colliders, bounds } = world;
// Contact-damage zones, shared the same way `colliders` is: the
// ConstructionManager fills it (barbed wire) and the EnemyManager reads it.
const hazards = [];

// Sun/sky/water animation + the player-following shadow frustum.
const dayNight = new DayNightCycle({
  scene,
  sun: world.sun,
  hemi: world.hemi,
  water: world.water,
});
if (typeof save?.timeOfDay === 'number') dayNight.setTime(save.timeOfDay);

// — Audio: synthesized SFX + music, unlocked on the first user gesture —
const audio = new AudioManager();
audio.arm();
// Every HUD button clicks. Capture phase so panels that stop propagation
// still make a sound.
document.addEventListener(
  'click',
  (e) => {
    if (e.target instanceof Element && e.target.closest('button')) audio.sfx('click');
  },
  true
);

// — Game state: the single source of truth for resources + per-dragon stats —
const state = new GameState();
new Hud(state);
new StoreUI(state); // dragon store + pack store overlays (Batch 6)
new CraftingUI(state); // card crafting center overlay (Batch 7)
new GameOverUI(state); // dark GAME OVER screen + TRY AGAIN (Batch 9)

// Registry of selectable dragons in the world: { id, dragon } keyed for
// raycasting and for playing per-dragon feedback animations.
const selectables = [];
function register(id, dragon, entry) {
  dragon.group.userData.dragonId = id;
  selectables.push({ id, dragon, entry });
}

// — Player: the starter dragon (Phillis) —
// A loaded game drops her back where she was standing, so restored companions
// (which spawn behind the player) come back with her instead of at the center.
const playerDragon = createDragon(DRAGON_TYPES_BY_ID.phillis);
playerDragon.group.position.set(
  save?.player?.x ?? WORLD_CENTER.x,
  GROUND_Y,
  save?.player?.z ?? WORLD_CENTER.z
);
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

// Any dragon added to the collection after boot (store purchase, crafted
// dragon, or one restored from a save) spawns just behind the player and joins
// the follow chain. Crafted dragons have unique ids, so the factory config
// comes from entry.typeId.
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
  audio.sfx('select');
  return true;
}

// Tap routing, in priority order: an active arena battle consumes every
// click (its own raycast decides if you hit your fighter), then placement
// mode, then dragon selection, then a black-dragon attack, then a placed
// structure (upgrade menu), then a harvest node in range; otherwise the tap
// falls through to click-to-move (which walks the player toward a distant
// node so walk-into harvesting finishes).
const player = new PlayerController(playerDragon, camera, canvas, {
  colliders,
  bounds,
  groundY: GROUND_Y,
  onClick: (x, y) =>
    battle.handleClick(x, y) ||
    construction.handleClick(x, y) ||
    pickDragon(x, y) ||
    enemies.tryClickAttack(x, y, player.position) ||
    construction.tryClickStructure(x, y) ||
    harvest.tryClick(x, y, player.position),
});

// Select the player dragon by default so the caretaking panel is populated.
state.select('phillis');

const cameraRig = new CameraRig(camera, playerDragon.group, canvas);

// The island freezes while the arena or the Black Room is on screen (the 3D
// equivalent of the 2D scene.pause('MainScene')) — one predicate, used by the
// animate loop and by every wall-clock timer.
const islandPaused = () => battle.active || blackRoom.active;

// — Passive stat decay (TECHNICAL_ARCHITECTURE.md §4: every 15,000ms) —
const decayTimer = setInterval(() => {
  if (!islandPaused()) state.tickDecay();
}, DECAY_INTERVAL_MS);
window.addEventListener('beforeunload', () => clearInterval(decayTimer));

// — Floating text feedback (caretaking emoji + harvest "+1 🍎" pops) —
// `getPos` returns a live world-space anchor; `base` is the height above it.
// Suppressed while a save is being restored: rebuilding an island through the
// live code paths would otherwise fire a "🏠 House Built!" for every structure.
let restoring = false;
const floaters = [];
function floatText(getPos, text, base = 34, size = 26) {
  if (restoring) return;
  const el = document.createElement('div');
  el.textContent = text;
  el.className = 'island-float'; // hidden while a battle covers the island
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
  el.className = 'island-float'; // hidden while a battle covers the island
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
state.on('feed', (d) => {
  floatOnDragon(reactTo(d.id), '🍎');
  audio.sfx('feed');
});
state.on('pet', (d) => {
  floatOnDragon(reactTo(d.id), '💖');
  audio.sfx('pet');
});
state.on('rest', (d) => {
  floatOnDragon(reactTo(d.id), '💤');
  audio.sfx('rest');
});
state.on('feedFail', (d) => {
  floatOnDragon(reactTo(d.id), '❌');
  audio.sfx('error');
});
state.on('dragonCrafted', (d) => {
  floatOnDragon(reactTo(d.id), '🎉');
  audio.sfx('levelup');
});
// `restoring` guards the two events a save replays in bulk — a loaded island
// should not sound like twelve dragons hatching at once.
state.on('dragonAdded', () => {
  if (!restoring) audio.sfx('spawn');
});
state.on('packOpened', () => audio.sfx('pack'));
state.on('damaged', () => audio.sfx('hit'));
// Forged armor: bolt the plate onto the dragon in-world. A loaded save replays
// this event per armored dragon, so restored dragons come back wearing theirs —
// silently, like every other bulk-restored change.
state.on('armorEquipped', (d) => {
  const dragon = reactTo(d.id);
  dragon?.setArmor(true);
  floatOnDragon(dragon, '🛡️');
  if (!restoring) audio.sfx('upgrade');
});

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
    if (islandPaused()) return; // island clocks freeze while the island is away
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
    audio.sfx(cfg.type === 'rock' ? 'rock' : 'apple');
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
  hazards,
  bounds,
  world,
  harvest,
  // A dragon asleep inside a building shouldn't veto a nearby build spot — the
  // building it's in already blocks placement through its own collider.
  getDragonPositions: () =>
    selectables
      .filter((s) => !companions.sheltered.has(s.dragon))
      .map((s) => s.dragon.group.position),
  floatText,
});
new BuildUI(state, construction);

// Where companions can get to when they turn in for the night.
const structureRadius = (id) => construction.radiusFor(id);
state.on('structureAdded', () => {
  if (!restoring) audio.sfx('build');
});
state.on('structureUpgraded', () => audio.sfx('upgrade'));
state.on('barbedWireAdded', () => {
  if (!restoring) audio.sfx('build');
});
state.on('grabenDug', () => {
  if (!restoring) audio.sfx('build');
});

// Passive mine/blacksmith yield: one global 5s loop over all structures,
// exactly like the 2D house-yield timer (TECHNICAL_ARCHITECTURE.md §4).
const productionTimer = setInterval(() => state.tickProduction(), PRODUCTION_INTERVAL_MS);
window.addEventListener('beforeunload', () => clearInterval(productionTimer));
state.on('produced', ({ structure, label }) => {
  const anchor = construction.anchorFor(structure.id);
  if (anchor) floatText(() => anchor, label, 14, 20);
});

// — Overworld combat (Batch 9): black dragons, projectiles, tower defense —
const projectiles = new ProjectileManager(scene);
projectiles.onFire = (kind) => audio.sfx(kind);
const enemies = new EnemyManager({
  scene,
  camera,
  state,
  colliders,
  hazards,
  bounds,
  groundY: GROUND_Y,
  projectiles,
  // Dragons sleeping indoors are safe: black dragons can't see them, so they
  // neither draw aggro nor take hits from an orb already in flight.
  getFriendlies: () => selectables.filter((s) => !companions.sheltered.has(s.dragon)),
  playerDragon,
  floatText,
});
const towers = new TowerDefense({
  state,
  construction,
  projectiles,
  enemyManager: enemies,
  floatText,
});

// — Battle Arena (Batch 10): separate fight scene + 2-step fighter select —
// While battle.active the animate loop renders the arena instead of the
// island and every island system (movement, enemies, decay) is frozen, the
// 3D equivalent of the 2D scene.pause('MainScene') + launch('BattleScene').
const battle = new BattleArena(state, { environment: envTexture, audio });
battle.projectiles.onFire = (kind) => audio.sfx(kind);
battle.onSceneChange = () => updateMusic();
new FightUI(state, battle);

// — The Black Room (Batch 11): the 😊 secret scene, now in 3D —
const blackRoom = new BlackRoom();
blackRoom.onExit = () => updateMusic();
document.getElementById('smile-btn').addEventListener('click', () => {
  if (battle.active || state.isGameOver) return;
  // Close every open menu first, like the 2D smile button did.
  document
    .querySelectorAll('.overlay-panel.open, #backpack-panel.open, #settings-panel.open')
    .forEach((el) => el.classList.remove('open'));
  construction.cancelPlacement();
  blackRoom.enter();
  audio.sfx('secret');
  updateMusic();
});

// One loop per place you can be. Called whenever that changes.
function updateMusic() {
  if (state.isGameOver) audio.playMusic(null);
  else if (blackRoom.active) audio.playMusic('blackroom');
  else if (battle.active) audio.playMusic('battle');
  else audio.playMusic('island');
}
updateMusic();

// — Autosave (Batch 11) —————————————————————————————————————————
function saveExtras() {
  return {
    worldSeed,
    timeOfDay: dayNight.time,
    player: { x: player.position.x, z: player.position.z },
  };
}

// Set once the run must never be written again: after "New Game" wipes the
// file, the reload's own beforeunload would otherwise save the old island
// straight back over it.
let savingDisabled = false;

function saveNow() {
  if (savingDisabled) return false;
  if (state.isGameOver) return false; // a finished run is not worth restoring
  const ok = writeSave(state, saveExtras());
  settings.setSaveNote(
    ok ? `Saved at ${new Date().toLocaleTimeString()}` : 'Saving unavailable'
  );
  return ok;
}

const settings = new SettingsUI({
  audio,
  onSaveNow: () => {
    const ok = saveNow();
    if (ok) audio.sfx('save');
    return ok;
  },
  onNewGame: () => {
    savingDisabled = true;
    clearInterval(autosaveTimer);
    clearSave();
    location.reload();
  },
});

let autosaveTimer = setInterval(saveNow, AUTOSAVE_MS);
// Both hooks matter: beforeunload covers desktop tab closes, visibilitychange
// covers mobile, where a backgrounded tab may never fire beforeunload at all.
window.addEventListener('beforeunload', () => {
  clearInterval(autosaveTimer);
  audio.dispose();
  saveNow();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveNow();
});

// — Restore the run —————————————————————————————————————————————
// Everything above is subscribed, so applySave() can rebuild the island purely
// by replaying state events. Floating text is muted for the duration.
if (save) {
  restoring = true;
  try {
    applySave(state, save);
  } finally {
    restoring = false;
  }
  // Phillis is already the selection, so re-emit rather than re-select: this
  // repaints the caretaking panel with her restored stats.
  state.emit('selection', state.selected);
}

// Game over freezes the run like the 2D physics.pause() + removeAllEvents():
// the caretaking/production clocks stop and the animate loop skips gameplay
// updates (rendering continues under the overlay). The save is deleted too, so
// TRY AGAIN (a page reload) genuinely starts over.
state.on('gameOver', () => {
  clearInterval(decayTimer);
  clearInterval(productionTimer);
  clearInterval(autosaveTimer);
  savingDisabled = true;
  clearSave();
  construction.cancelPlacement();
  audio.sfx('gameover');
  updateMusic();
});

// Debug hook for automated verification (harmless in normal play).
window.__game = {
  player,
  companions,
  playerDragon,
  state,
  harvest,
  construction,
  enemies,
  towers,
  projectiles,
  battle,
  camera,
  scene,
  renderer,
  dayNight,
  audio,
  blackRoom,
  worldSeed,
  saveNow,
  colliders,
  hazards,
};

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Lightweight FPS readout + time-of-day clock in the HTML HUD.
const fpsEl = document.getElementById('fps');
const clockEl = document.getElementById('clock');
let frames = 0;
let fpsTimer = 0;

const clock = new THREE.Clock();

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;

  // The Black Room and arena battles take over rendering completely; the
  // island freezes underneath (2D: sleep MainScene, launch the other scene).
  if (blackRoom.active) {
    blackRoom.update(dt);
    renderer.render(blackRoom.scene, blackRoom.camera);
    return;
  }
  if (battle.active) {
    battle.update(dt);
    renderer.render(battle.scene, battle.camera);
    return;
  }

  world.update(time);
  dayNight.update(dt, player.position);
  if (!state.isGameOver) {
    player.update(dt);
    companions.update(dt, player.position, {
      night: dayNight.isNight,
      structures: state.structures,
      radiusFor: structureRadius,
    });
    harvest.update(dt, player.position);
    enemies.update(dt, player.position);
    towers.update(dt);
    projectiles.update(dt);
  }
  construction.update(dt);

  // Keep the selection ring pinned under the selected dragon — and off the
  // ground entirely while that dragon is asleep inside a building, so the ring
  // doesn't sit glowing under a house with nothing standing on it.
  if (selectedDragon) {
    const asleep = companions.sheltered.has(selectedDragon);
    selectionRing.visible = !asleep;
    if (!asleep) {
      selectionRing.position.x = selectedDragon.group.position.x;
      selectionRing.position.z = selectedDragon.group.position.z;
    }
  }

  updateFloaters(dt);
  updatePins(dt);
  cameraRig.update();
  renderer.render(scene, camera);

  frames++;
  fpsTimer += dt;
  if (fpsTimer >= 1) {
    fpsEl.textContent = `${Math.round(frames / fpsTimer)} fps`;
    clockEl.textContent = dayNight.label();
    frames = 0;
    fpsTimer = 0;
  }
}

renderer.setAnimationLoop(animate);
