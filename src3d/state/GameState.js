// Central, plain-JS game state — the single source of truth for the 3D game,
// mirroring the 2D MainScene's state model (TECHNICAL_ARCHITECTURE.md §3) and
// its event manifest (§2). Nothing here touches Three.js: it holds serializable
// data and emits events; the render/UI layers listen and react. This keeps the
// caretaking core (resources, per-dragon stats) independent of the scene so the
// save system in Batch 11 can read/write it directly.

import {
  PACK_COST,
  rollPack,
  PART_KEYS,
  CRAFT_DRAGON_TYPES,
  GIVEABLE_CARD_RESOURCES,
} from '../data/cards.js';

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
// Giving a card to a dragon (2D handleWood/Fish/AppleGeneration): +1 resource
// every 5,000ms, 12 ticks total (delay 5000, repeat 11), icon lasts 60,000ms.
export const GIVE_TICK_MS = 5000;
export const GIVE_TICK_COUNT = 12;
export const GIVE_ICON_MS = 60000;

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
    this.ownedDragons = []; // [{ id, typeId, name, key, stats }]
    this.ownedCards = []; // [{ name, type, key }] — 2D MainScene.ownedCards shape
    this.selectedId = null;
    this.craftCount = 0; // uniquifies crafted-dragon ids (dupes are allowed)
  }

  // — Ownership ————————————————————————————————————————————————
  /**
   * Register a dragon in the collection. `stats` defaults to a new-dragon
   * block. `typeId` names the DragonFactory config to build; it defaults to
   * `id` (store dragons are one-per-type so their id IS the type), while
   * crafted dragons get unique ids and pass their type separately.
   */
  addDragon({ id, name, key, stats, typeId }) {
    const entry = { id, typeId: typeId ?? id, name, key, stats: stats ?? defaultStats() };
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

  // — Card Crafting Center (2D UIScene crafting menu, Batch 7) ————————
  /**
   * Connect two cards by index (2D handleCardConnection, rules copied
   * verbatim). Returns:
   *   { ok: false, reason: 'not-parts' | 'duplicate' } — cards untouched
   *   { ok: true, combo }   — inputs consumed, merged Combo card added
   *   { ok: true, crafted } — merge reached all 4 components: no combo card
   *                           survives, a random dragon is crafted instead
   */
  connectCards(indexA, indexB) {
    const cards = this.ownedCards;
    const cardA = cards[indexA];
    const cardB = cards[indexB];
    if (!cardA || !cardB || indexA === indexB) return { ok: false, reason: 'not-parts' };

    // 1. Only Part and Combo cards can connect.
    const isPartA = cardA.type === 'Part' || cardA.type === 'Combo';
    const isPartB = cardB.type === 'Part' || cardB.type === 'Combo';
    if (!isPartA || !isPartB) return { ok: false, reason: 'not-parts' };

    // 2. A single card is one part; a Combo card carries a parts list.
    const partsA = cardA.parts || [cardA.key];
    const partsB = cardB.parts || [cardB.key];

    // 3. No duplicate components (can't connect two heads).
    if (partsA.some((p) => partsB.includes(p))) return { ok: false, reason: 'duplicate' };

    // 4. Merge into a Combo card listing every component.
    const mergedParts = [...partsA, ...partsB];
    const mergedNames = mergedParts.map((p) => p.replace('part_', '').toUpperCase());
    const combo = {
      name: `Dragon (${mergedNames.join(', ')})`,
      type: 'Combo',
      parts: mergedParts,
      key: mergedParts.includes('part_body') ? 'part_body' : mergedParts[0],
    };

    // 5. Both inputs are consumed (higher index first to avoid shifting).
    cards.splice(Math.max(indexA, indexB), 1);
    cards.splice(Math.min(indexA, indexB), 1);

    // 6. All four components → the combo is consumed too and a dragon is
    // auto-crafted (the 2D code pushes the combo then immediately pops it).
    if (mergedParts.length === PART_KEYS.length) {
      const crafted = this.#craftRandomDragon();
      this.emit('cards', cards);
      return { ok: true, crafted };
    }

    cards.push(combo);
    this.emit('cards', cards);
    this.emit('comboMade', combo);
    return { ok: true, combo };
  }

  /** True when the collection holds all 4 raw Part cards (Combos don't count). */
  hasAllParts() {
    const owned = this.ownedCards.filter((c) => c.type === 'Part').map((c) => c.key);
    return PART_KEYS.every((p) => owned.includes(p));
  }

  /**
   * The "CRAFT NEW DRAGON" button: consume one of each raw Part card and
   * craft a random dragon. Returns the new entry, or null if parts missing.
   * (The 2D code matched consumed cards by key alone, which could eat a Combo
   * card that shares a part key — we also require type 'Part'.)
   */
  craftFromParts() {
    if (!this.hasAllParts()) return null;
    for (const p of PART_KEYS) {
      const idx = this.ownedCards.findIndex((c) => c.type === 'Part' && c.key === p);
      this.ownedCards.splice(idx, 1);
    }
    const crafted = this.#craftRandomDragon();
    this.emit('cards', this.ownedCards);
    return crafted;
  }

  // Random craftable type → owned dragon, exactly like the 2D game:
  // name `Crafted Fire Dragon`, key `dragon_fire`. Ids stay unique so crafted
  // dragons never collide with the store's one-per-type ownership check.
  #craftRandomDragon() {
    const type = CRAFT_DRAGON_TYPES[Math.floor(Math.random() * CRAFT_DRAGON_TYPES.length)];
    const typeId = type.toLowerCase();
    const entry = this.addDragon({
      id: `crafted_${typeId}_${++this.craftCount}`,
      typeId,
      name: `Crafted ${type} Dragon`,
      key: `dragon_${typeId}`,
    });
    this.emit('dragonCrafted', entry);
    return entry;
  }

  /**
   * Give a card to a dragon (2D giveTree/giveFishingRod/giveAppleCard).
   * Only Trees / Fishing / Food / Farming cards are giveable. Consumes the
   * card and emits 'cardGiven' { card, dragon, resource } — the scene layer
   * runs the +1-per-5s production timer. Returns the gift, or null.
   */
  giveCard(index, dragonId) {
    const card = this.ownedCards[index];
    const dragon = this.getDragon(dragonId);
    if (!card || !dragon) return null;
    const resource = GIVEABLE_CARD_RESOURCES[card.type];
    if (!resource) return null;
    this.ownedCards.splice(index, 1);
    this.emit('cards', this.ownedCards);
    const gift = { card, dragon, resource };
    this.emit('cardGiven', gift);
    return gift;
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
