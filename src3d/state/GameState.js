// Central, plain-JS game state — the single source of truth for the 3D game,
// mirroring the 2D MainScene's state model (TECHNICAL_ARCHITECTURE.md §3) and
// its event manifest (§2). Nothing here touches Three.js: it holds serializable
// data and emits events; the render/UI layers listen and react. This keeps the
// caretaking core (resources, per-dragon stats) independent of the scene so the
// save system in Batch 11 can read/write it directly.

import { PACK_COST, rollPack } from '../data/cards.js';

// — Tunables copied from the 2D source (code wins over docs) —
export const DECAY_INTERVAL_MS = 15000; // MainScene global stat-decay loop
export const DECAY_HUNGER = 1; // hunger lost per tick
export const DECAY_ENERGY = 1; // energy lost per tick
export const FEED_HUNGER = 15; // UIScene.handleFeed: hunger +15
export const FEED_HP = 15; // UIScene.handleFeed: hp +15
export const PET_LOVE = 5; // MainScene petDragon: love +5
export const PET_HP = 15; // MainScene petDragon: hp +15
// Resting has no 2D equivalent (the 2D game never restored energy); Batch 4 of
// the rebuild plan lists it as a caretaking interaction, so this is a new value.
export const REST_ENERGY = 25;

export const STAT_MAX = 100;

// Fresh stat blocks matching the exact 2D initial values.
export function starterStats() {
  return { love: 20, hunger: 80, energy: 100, hp: 100, level: 1, xp: 0 };
}
export function defaultStats() {
  return { love: 10, hunger: 50, energy: 100, hp: 100, level: 1, xp: 0 };
}

const clamp = (v) => Math.max(0, Math.min(STAT_MAX, v));

// Tiny synchronous event emitter (the 3D game has no Phaser event bus).
class Emitter {
  constructor() {
    this._handlers = new Map();
  }
  on(event, fn) {
    if (!this._handlers.has(event)) this._handlers.set(event, new Set());
    this._handlers.get(event).add(fn);
    return () => this.off(event, fn);
  }
  off(event, fn) {
    this._handlers.get(event)?.delete(fn);
  }
  emit(event, payload) {
    this._handlers.get(event)?.forEach((fn) => fn(payload));
  }
}

export class GameState extends Emitter {
  constructor() {
    super();
    // Resource state (TECHNICAL_ARCHITECTURE.md §3). Seeded with a small
    // starting stash so feeding works from the first minute; harvesting (Batch
    // 5) tops these up from trees/rocks. The 2D game starts these at 0.
    this.resources = { apples: 8, coins: 25, wood: 0, fish: 0, stone: 3 };
    this.ownedDragons = []; // [{ id, name, key, stats }]
    this.ownedCards = []; // [{ name, type, key }] — 2D MainScene.ownedCards shape
    this.selectedId = null;
  }

  // — Ownership ————————————————————————————————————————————————
  /** Register a dragon in the collection. `stats` defaults to a new-dragon block. */
  addDragon({ id, name, key, stats }) {
    const entry = { id, name, key, stats: stats ?? defaultStats() };
    this.ownedDragons.push(entry);
    this.emit('dragonAdded', entry);
    return entry;
  }

  getDragon(id) {
    return this.ownedDragons.find((d) => d.id === id) || null;
  }

  get selected() {
    return this.getDragon(this.selectedId);
  }

  select(id) {
    if (id === this.selectedId) return;
    this.selectedId = id;
    this.emit('selection', this.selected);
  }

  // — Resources ————————————————————————————————————————————————
  addResource(type, amount) {
    if (this.resources[type] === undefined) return;
    this.resources[type] = Math.max(0, this.resources[type] + amount);
    this.emit('resources', this.resources);
  }

  // — Dragon Store (2D UIScene.buyDragon: one of each type) ————————
  ownsType(typeId) {
    return this.ownedDragons.some((d) => d.id === typeId);
  }

  /**
   * Buy a dragon type from the store. Deducts coins and registers the dragon
   * (which emits 'dragonAdded' — the scene layer spawns it in-world). Also
   * emits 'dragonBought' for store-specific feedback. Returns the new entry,
   * or null if unaffordable / already owned.
   */
  buyDragon(type) {
    if (typeof type.cost !== 'number') return null;
    if (this.ownsType(type.id)) return null;
    if (this.resources.coins < type.cost) return null;
    this.resources.coins -= type.cost;
    this.emit('resources', this.resources);
    const entry = this.addDragon({ id: type.id, name: type.name, key: type.key });
    this.emit('dragonBought', entry);
    return entry;
  }

  // — Pack Store (2D UIScene.openPack: 10 coins → 3 random cards) ————
  /**
   * Buy and open a booster pack. Deducts coins and returns the 3 rolled cards
   * for the reveal screen — they are NOT in the collection yet (matches the
   * 2D flow, where "COLLECT ALL" adds them). Returns null if unaffordable.
   */
  openPack() {
    if (this.resources.coins < PACK_COST) return null;
    this.resources.coins -= PACK_COST;
    this.emit('resources', this.resources);
    const cards = rollPack();
    this.emit('packOpened', cards);
    return cards;
  }

  /** Add revealed cards to the collection (the "COLLECT ALL" step). */
  collectCards(cards) {
    this.ownedCards.push(...cards);
    this.emit('cards', this.ownedCards);
  }

  // — Caretaking interactions ——————————————————————————————————
  /** Feed an apple: -1 apple, hunger +15, hp +15. Returns false if no apples. */
  feed(id) {
    const d = this.getDragon(id);
    if (!d) return false;
    if (this.resources.apples <= 0) {
      this.emit('feedFail', d);
      return false;
    }
    this.resources.apples -= 1;
    d.stats.hunger = clamp(d.stats.hunger + FEED_HUNGER);
    d.stats.hp = clamp(d.stats.hp + FEED_HP);
    this.emit('resources', this.resources);
    this.emit('stats', d);
    this.emit('feed', d);
    return true;
  }

  /** Pet: love +5, hp +15. */
  pet(id) {
    const d = this.getDragon(id);
    if (!d) return false;
    d.stats.love = clamp(d.stats.love + PET_LOVE);
    d.stats.hp = clamp(d.stats.hp + PET_HP);
    this.emit('stats', d);
    this.emit('pet', d);
    return true;
  }

  /** Rest: energy +25. */
  rest(id) {
    const d = this.getDragon(id);
    if (!d) return false;
    if (d.stats.energy >= STAT_MAX) return false;
    d.stats.energy = clamp(d.stats.energy + REST_ENERGY);
    this.emit('stats', d);
    this.emit('rest', d);
    return true;
  }

  // — Passive decay (call every DECAY_INTERVAL_MS) ————————————————
  tickDecay() {
    for (const d of this.ownedDragons) {
      d.stats.hunger = Math.max(0, d.stats.hunger - DECAY_HUNGER);
      d.stats.energy = Math.max(0, d.stats.energy - DECAY_ENERGY);
      this.emit('stats', d);
    }
    this.emit('decay');
  }
}
