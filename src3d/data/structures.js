// Construction data — every number copied verbatim from the 2D source
// (UIScene.js build/upgrade menus, MainScene.js timers), per the working rule
// that code wins over docs. `icon`/`desc` strings are presentation; costs,
// production rates, and tower combat stats are gameplay-exact.

// — Buildable structures (2D UIScene renderBuildOptions `builds`) —
export const BUILDINGS = [
  {
    id: 'house',
    name: 'Dragon House',
    icon: '🏠',
    cost: { wood: 3, fish: 1 },
    desc: 'A cozy home for your dragons.',
    // 2D spawnHouse rejected spots within 85px of any dragon.
    minDragonDist: 85,
  },
  {
    id: 'castle',
    name: 'Castle',
    icon: '🏰',
    cost: { stone: 10 },
    desc: 'A massive fortress. Extremely tough. Builds defensive walls!',
    minDragonDist: 100, // 2D spawnCastle used 100
  },
];
export const BUILDINGS_BY_ID = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));

// — Outer defences (no 2D equivalent; both hang off the castle's wall ring) —
// Neither is a placeable "structure": they never enter state.structures, so
// they can't widen the wall's bounding box or open the upgrade menu. They are
// instant buys instead of ghost placements — position is derived from the ring.
export const BARBED_WIRE = {
  id: 'barbed_wire',
  name: 'Barbed Wire',
  icon: '🌵',
  cost: { stone: 1, wood: 1 },
  desc: 'A spiked coil for the front line. Blocks black dragons and shreds them on contact.',
  // Slots line the front (+z) wall edge, filled nearest-the-gate first, and
  // sit OUTSIDE the graben — the one band attackers can actually reach.
  offset: 80, // units beyond the wall ring's front edge
  collideRadius: 16,
  contactRadius: 26, // an enemy this close is "on the wire"
  damage: 10, // per contact tick
  tickSec: 1,
  growSec: 0.3,
  staggerMs: 0, // single segments pop instantly; nothing to stagger against
};

export const GRABEN = {
  id: 'graben',
  name: 'Graben',
  icon: '🕳️',
  cost: { stone: 15 },
  desc: 'Dig an impassable trench ring around your walls. The gate keeps a causeway.',
  offset: 40, // one tile-spacing outside the wall ring
  spacing: 40, // same 40-unit grid the wall tiles use
  collideRadius: 21, // matches a wall tile: neighbours overlap, nothing slips through
  clearRadius: 30, // trees/rocks this close are removed, like wall tiles
  staggerMs: 30, // per-tile dig-in delay (index × 30ms)
  growSec: 0.35,
};

// — Dragon armor (no 2D equivalent) — the one Hub row that isn't built on the
// island at all: it is forged FOR a dragon, so the Hub swaps in a dragon picker
// instead of a ghost placement. It never enters state.structures either; the
// only thing it changes is a flag on the owned-dragon entry.
export const DRAGON_ARMOR = {
  id: 'dragon_armor',
  name: 'Dragon Armor',
  icon: '🛡️',
  cost: { stone: 6 },
  desc: 'Forge steel plate for one dragon — it takes half damage from then on.',
  equip: true, // BuildUI: FORGE opens the dragon picker
  damageMultiplier: 0.5, // every hit on an armored dragon is scaled by this
};

// Everything the Construction Hub lists, in menu order. `instant: true` rows
// build on click instead of entering ghost-placement mode; `equip: true` rows
// pick a dragon instead of a spot.
export const BUILDABLES = [
  ...BUILDINGS,
  { ...GRABEN, instant: true },
  { ...BARBED_WIRE, instant: true },
  DRAGON_ARMOR,
];

// — One-shot upgrade classes (2D UIScene renderHouseUpgradeOptions `options`).
// A structure starts upgradeType=null and converts once, irreversibly.
// NOTE: the 2D menu said Mine "Generates passive coins" — a stale label; the
// code (and TECHNICAL_ARCHITECTURE.md §4) grant STONE. We ship the fixed text.
export const UPGRADES = [
  {
    id: 'tower',
    name: 'Tower',
    icon: '🗼',
    cost: { wood: 10, coins: 5 },
    desc: 'Shoots arrows at black dragons within range (20 dmg)',
    color: '#3498db',
    tint: 0x90caf9,
  },
  {
    id: 'mine',
    name: 'Mine',
    icon: '⛏️',
    cost: { wood: 15, coins: 5 },
    desc: 'Generates passive stone (+1 every 5s)',
    color: '#f1c40f',
    tint: 0xffe082,
  },
  {
    id: 'blacksmith',
    name: 'Blacksmith',
    icon: '🔨',
    cost: { wood: 20, coins: 10 },
    desc: 'Generates passive wood (+1 every 5s)',
    color: '#e67e22',
    tint: 0xffab91,
  },
];
export const UPGRADES_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

// — Passive production (2D MainScene 5,000ms house-yield loop): one GLOBAL
// timer iterates every structure, so rates stack additively per building.
// No caps, no collection step — resources credit straight into the stash.
export const PRODUCTION_INTERVAL_MS = 5000;
export const PRODUCTION = {
  mine: { resource: 'stone', amount: 1, label: '+1 Stone 🪨' },
  blacksmith: { resource: 'wood', amount: 1, label: '+1 Wood 🪵' },
};

// — Tower combat stats, stored now for Batch 9 (2D shootTowerArrow loop) —
export const TOWER_STATS = {
  range: 400, // nearest black dragon within 400 units
  damage: 20, // per arrow hit
  fireIntervalMs: 2500, // global tower attack loop
};

// — Defensive wall algorithm constants (2D buildWallAroundBuildings) —
export const WALL = {
  padding: 120, // ring margin beyond the buildings' bounding box
  spacing: 40, // one tile every 40 units (tiles are 40×40)
  gateHalfWidth: 60, // bottom-edge tiles with |x − midX| < spacing×1.5 skipped
  clearRadius: 30, // trees/rocks this close to a tile are destroyed
  staggerMs: 40, // per-tile spawn delay (index × 40ms)
  growSec: 0.4, // 0 → full scale, Back.easeOut
};

// In-world label text per structure state (2D house.label strings).
export function structureLabel(s) {
  if (s.upgradeType === 'tower') return '🗼 Tower';
  if (s.upgradeType === 'mine') return '⛏️ Mine';
  if (s.upgradeType === 'blacksmith') return '🔨 Blacksmith';
  return s.type === 'castle' ? '🏰 Castle' : '🏠 Dragon House';
}
