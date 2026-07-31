// Booster-pack card data. `name`, `type`, and `key` are copied verbatim from
// the 2D source (src/scenes/UIScene.js openPack cardTypes) — save-file
// compatibility depends on these exact strings. `icon` is 3D-UI-only
// presentation (the 2D game used sprite images instead).

export const PACK_COST = 10; // coins per booster pack
export const PACK_CARD_COUNT = 3; // cards per pack, duplicates allowed

export const CARD_TYPES = [
  { name: 'Delicious Food', type: 'Food', key: 'apple', icon: '🍎' },
  { name: 'Ancient Tree', type: 'Trees', key: 'tree', icon: '🌳' },
  { name: 'Fishing Rod', type: 'Fishing', key: 'fishing_rod', icon: '🎣' },
  { name: 'Apple Seeds', type: 'Farming', key: 'apple', icon: '🌱' },
  { name: 'Dragon Head', type: 'Part', key: 'part_head', icon: '🐲' },
  { name: 'Dragon Wings', type: 'Part', key: 'part_wings', icon: '🦇' },
  { name: 'Dragon Tail', type: 'Part', key: 'part_tail', icon: '🐍' },
  { name: 'Dragon Body', type: 'Part', key: 'part_body', icon: '🦴' },
];

// Look up presentation for a card that may have come from state (which stores
// only name/type/key). Falls back to a generic card icon.
export function cardIcon(card) {
  const match = CARD_TYPES.find((c) => c.name === card.name);
  return match ? match.icon : '🃏';
}

/** Roll one booster pack: PACK_CARD_COUNT random cards, equal odds, dupes allowed. */
export function rollPack() {
  const result = [];
  for (let i = 0; i < PACK_CARD_COUNT; i++) {
    const t = CARD_TYPES[Math.floor(Math.random() * CARD_TYPES.length)];
    // Fresh object per card so later systems (crafting combos) can mutate safely.
    result.push({ name: t.name, type: t.type, key: t.key });
  }
  return result;
}
