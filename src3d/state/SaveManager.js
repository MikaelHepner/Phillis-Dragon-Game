// Save system (Batch 11) — localStorage persistence built on the JSON schema
// in TECHNICAL_ARCHITECTURE.md §5.
//
// The documented schema is the core of the file and is written verbatim:
// saveVersion, timestamp, resources, ownedDragons[{ name, key, stats }],
// ownedCards[{ name, type, key }], structures[{ x, y, type, upgradeType }],
// plus defences{ barbedWires, hasGraben } for the outer ring.
// Structures keep the doc's 2D field names, so its `y` is our world `z` —
// exactly the mapping GameState already documents for its structure entries.
//
// A few fields the doc's draft predates are added alongside them, because the
// 3D game genuinely cannot restore an island without them:
//   - ownedDragons[].id / .typeId — crafted dragons have unique ids and a
//     separate factory type, so name+key alone can't rebuild them
//   - ownedDragons[].armored      — forged armor is permanent, so a restored
//     dragon that loses its plate would be a silent refund of 6 stone
//   - structures[].id            — upgrade menus address structures by id
//   - counters                   — keeps freshly crafted/built ids unique
//   - worldSeed                  — the 3D island scatters its own trees/rocks,
//     so the seed is what makes "refresh restores your island exactly" true
//   - timeOfDay / player         — day-night clock and where you were standing
//
// Loading is deliberately event-driven: applySave() pushes data into GameState
// and re-emits the same events a live game would ('dragonAdded',
// 'structureAdded', …), so every scene manager rebuilds itself through the code
// path it already uses. No manager needs to know the save format exists.

export const SAVE_KEY = 'dragonIsland3D.save';
export const SAVE_VERSION = 1;
export const AUTOSAVE_MS = 10000;

const RESOURCE_KEYS = ['apples', 'coins', 'wood', 'fish', 'stone'];

/** Read and validate the stored save. Returns null when there's nothing usable. */
export function readSave() {
  let raw;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch {
    return null; // storage blocked (private mode): play unsaved
  }
  if (!raw) return null;
  try {
    const save = JSON.parse(raw);
    if (!save || typeof save !== 'object') return null;
    // Only version 1 exists so far; anything else is from a future build and
    // is ignored rather than half-applied.
    if (save.saveVersion !== SAVE_VERSION) return null;
    if (!Array.isArray(save.ownedDragons)) return null;
    return save;
  } catch {
    return null; // corrupt JSON: start fresh rather than crash on boot
  }
}

/** Serialize the whole run into the §5 schema. */
export function serialize(state, { worldSeed, timeOfDay, player } = {}) {
  return {
    saveVersion: SAVE_VERSION,
    timestamp: Date.now(),
    worldSeed,
    timeOfDay,
    resources: { ...state.resources },
    ownedDragons: state.ownedDragons.map((d) => ({
      id: d.id,
      typeId: d.typeId,
      name: d.name,
      key: d.key,
      armored: !!d.armored,
      stats: { ...d.stats },
    })),
    ownedCards: state.ownedCards.map((c) => ({
      name: c.name,
      type: c.type,
      key: c.key,
      // Combo cards carry the parts they were merged from; without this a
      // half-built dragon would come back as an un-mergeable card.
      ...(c.parts ? { parts: [...c.parts] } : {}),
    })),
    structures: state.structures.map((s) => ({
      id: s.id,
      type: s.type,
      x: s.x,
      y: s.z, // §5 uses the 2D plane's y for our world z
      upgradeType: s.upgradeType,
    })),
    // Outer defences. Like the walls, only the counts are stored — the trench
    // ring and the wire's front slots are re-derived from the restored wall
    // geometry, so a loaded island matches a live one exactly.
    defences: {
      barbedWires: state.barbedWires.length,
      hasGraben: state.hasGraben,
    },
    counters: {
      craftCount: state.craftCount,
      structureCount: state.structureCount,
      wireCount: state.wireCount,
    },
    player: player ? { x: player.x, z: player.z } : null,
  };
}

/** Write a save. Returns false if storage rejected it (quota / private mode). */
export function writeSave(state, extras) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(serialize(state, extras)));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* nothing to clear */
  }
}

/**
 * Restore a save into a freshly booted GameState.
 *
 * The caller is expected to have already created the player dragon (Phillis),
 * because the scene owns that mesh — her saved stats are copied onto the
 * existing entry, while every other dragon is added normally so the scene
 * layer spawns it.
 *
 * @param {GameState} state
 * @param {object} save        a value from readSave()
 */
export function applySave(state, save) {
  // — Resources — only known keys, clamped to sane numbers.
  for (const key of RESOURCE_KEYS) {
    const v = save.resources?.[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      state.resources[key] = Math.max(0, Math.floor(v));
    }
  }
  state.emit('resources', state.resources);

  // — Dragons — Phillis already exists; the rest spawn via 'dragonAdded'.
  for (const d of save.ownedDragons) {
    if (!d || typeof d.id !== 'string') continue;
    const existing = state.getDragon(d.id);
    if (existing) {
      Object.assign(existing.stats, d.stats);
      state.emit('stats', existing);
    } else {
      state.addDragon({
        id: d.id,
        typeId: d.typeId ?? d.id,
        name: d.name,
        key: d.key,
        stats: { ...d.stats },
      });
    }
    // Armor comes back through the live event, so the scene bolts the plate on
    // exactly like a fresh forge does — 'dragonAdded' above has already built
    // the mesh by now. Saves from before armor existed simply lack the field.
    const entry = state.getDragon(d.id);
    if (d.armored && entry) {
      entry.armored = true;
      state.emit('armorEquipped', entry);
    }
  }

  // — Cards —
  state.ownedCards.length = 0;
  for (const c of save.ownedCards ?? []) {
    if (c && typeof c.name === 'string') state.ownedCards.push({ ...c });
  }
  state.emit('cards', state.ownedCards);

  // — Counters — restored before structures so ids can't be reused.
  state.craftCount = save.counters?.craftCount ?? 0;
  state.structureCount = save.counters?.structureCount ?? 0;

  // — Structures — each one re-emits 'structureAdded', which is what makes
  // ConstructionManager rebuild the mesh, collider and (for castles) the wall
  // ring. Rebuilding the walls from the algorithm rather than saving tile
  // positions means a loaded island matches a live one exactly.
  for (const s of save.structures ?? []) {
    if (!s || typeof s.type !== 'string') continue;
    const entry = {
      id: s.id ?? `struct_${++state.structureCount}`,
      type: s.type,
      x: s.x,
      z: s.z ?? s.y, // §5 stores our z as y
      upgradeType: s.upgradeType ?? null,
    };
    state.structures.push(entry);
    state.emit('structureAdded', entry);
  }

  // — Outer defences — strictly after the structures, because the trench and
  // the wire's front slots are both derived from the wall ring those rebuild.
  state.restoreDefences({
    barbedWires: Math.max(0, Math.floor(save.defences?.barbedWires ?? 0)),
    wireCount: save.counters?.wireCount ?? 0,
    hasGraben: save.defences?.hasGraben === true,
  });

  state.emit('loaded', save);
}
