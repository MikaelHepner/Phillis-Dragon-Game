import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createWorld, WORLD_CENTER } from './world.js';
import { CameraRig } from './cameraRig.js';
import { createDragon } from './dragons/DragonFactory.js';
import { DRAGON_TYPES_BY_ID } from './data/dragonTypes.js';
import { PlayerController } from './player/PlayerController.js';
import { CompanionManager } from './companions/CompanionManager.js';
import { GameState, DECAY_INTERVAL_MS, starterStats } from './state/GameState.js';
import { Hud } from './ui/Hud.js';

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

// — Two test companions trailing the player —
const companions = new CompanionManager({ colliders, bounds, groundY: GROUND_Y });
const testCompanions = ['fire', 'water'];
testCompanions.forEach((id, i) => {
  const type = DRAGON_TYPES_BY_ID[id];
  const dragon = createDragon(type);
  // Spawn just behind the player so they fall into the follow chain.
  dragon.group.position.set(
    WORLD_CENTER.x + (i - 0.5) * 40,
    GROUND_Y,
    WORLD_CENTER.z - 55 - i * 40
  );
  scene.add(dragon.group);
  companions.add(dragon);
  const entry = state.addDragon({ id, name: type.name, key: type.key });
  register(id, dragon, entry);
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

const player = new PlayerController(playerDragon, camera, canvas, {
  colliders,
  bounds,
  groundY: GROUND_Y,
  onClick: pickDragon,
});

// Select the player dragon by default so the caretaking panel is populated.
state.select('phillis');

const cameraRig = new CameraRig(camera, playerDragon.group, canvas);

// — Passive stat decay (TECHNICAL_ARCHITECTURE.md §4: every 15,000ms) —
const decayTimer = setInterval(() => state.tickDecay(), DECAY_INTERVAL_MS);
window.addEventListener('beforeunload', () => clearInterval(decayTimer));

// — Floating emoji feedback for caretaking actions —
const floaters = [];
function floatEmoji(dragon, text) {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText =
    'position:absolute;font-size:26px;pointer-events:none;user-select:none;' +
    'transform:translate(-50%,-50%);transition:none;z-index:5;text-shadow:0 2px 3px rgba(0,0,0,0.35)';
  document.body.appendChild(el);
  floaters.push({ el, dragon, t: 0 });
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
    v.copy(f.dragon.group.position);
    v.y += 34 + f.t * 22; // rise as it fades
    v.project(camera);
    f.el.style.left = `${(v.x * 0.5 + 0.5) * window.innerWidth}px`;
    f.el.style.top = `${(-v.y * 0.5 + 0.5) * window.innerHeight}px`;
    f.el.style.opacity = `${1 - f.t / 1.1}`;
  }
}

// Play a little hop + emoji when a dragon is cared for.
function reactTo(id) {
  const s = selectables.find((x) => x.id === id);
  return s ? s.dragon : null;
}
state.on('feed', (d) => floatEmoji(reactTo(d.id), '🍎'));
state.on('pet', (d) => floatEmoji(reactTo(d.id), '💖'));
state.on('rest', (d) => floatEmoji(reactTo(d.id), '💤'));
state.on('feedFail', (d) => floatEmoji(reactTo(d.id), '❌'));

// Debug hook for automated verification (harmless in normal play).
window.__game = { player, companions, playerDragon, state };

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

  // Keep the selection ring pinned under the selected dragon.
  if (selectedDragon) {
    selectionRing.position.x = selectedDragon.group.position.x;
    selectionRing.position.z = selectedDragon.group.position.z;
  }

  updateFloaters(dt);
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
