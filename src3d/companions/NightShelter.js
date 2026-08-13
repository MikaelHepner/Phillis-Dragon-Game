// Night shelter rules for team dragons: which structures take lodgers, how many
// each holds, and which dragon sleeps where.
//
// Kept out of CompanionManager (which owns steering and meshes) because these
// are pure decisions over plain data — no THREE objects, no per-frame state —
// so they stay easy to follow and to change when new building types arrive.
//
// Phillis never appears here: she is not a companion, so she is absent from
// every list these functions are handed.

// A Dragon House is "a cozy home for your dragons" (data/structures.js) until
// it is upgraded, at which point it has become a Tower/Mine/Blacksmith and stops
// taking lodgers. A castle keeps its fortress model even when upgraded
// (ConstructionManager #buildGroupFor), so it shelters either way — and being
// far bigger, it sleeps more of them.
export const CAPACITY = { house: 2, castle: 4 };

// Collide radii to fall back on when a structure has no mesh record yet. These
// mirror StructureFactory; in practice the live radius is always available,
// since ConstructionManager spawns the mesh on the structureAdded event.
const FALLBACK_RADIUS = { house: 26, castle: 52 };

// Gap between a shelter's wall and the spot a dragon stands on to enter.
const DOOR_GAP = 4;

// Extra slack on the "am I inside yet?" test — see enterDistance().
const ENTER_SLACK = 10;

/**
 * The houses and castles companions may sleep in.
 * @param {Array} structures  GameState.structures entries
 * @param {(id: any) => number|null} [radiusFor]  live collide-radius lookup
 * @returns {Array<{id, x, z, capacity, radius}>}
 */
export function shelterSpots(structures, radiusFor) {
  const spots = [];
  for (const s of structures) {
    let kind = null;
    if (s.type === 'castle') kind = 'castle';
    else if (s.type === 'house' && !s.upgradeType) kind = 'house';
    if (!kind) continue;
    spots.push({
      id: s.id,
      x: s.x,
      z: s.z,
      capacity: CAPACITY[kind],
      radius: radiusFor?.(s.id) ?? FALLBACK_RADIUS[kind],
    });
  }
  return spots;
}

/**
 * Pair dragons with shelters, closest pair first: walk the dragon→spot distances
 * in ascending order and take each one whose spot still has a free bed. Greedy
 * rather than globally optimal — with a handful of each, nearest-first is what a
 * player reads as correct, and it costs one small sort.
 *
 * Dragons still unpaired once every bed is taken are left out of the result; the
 * caller keeps them following the player, so building more houses is what gets
 * the whole team indoors.
 *
 * @param {Array<{x, z}>} positions  one per companion, index-aligned
 * @param {Array} spots              from shelterSpots()
 * @returns {Map<number, object>}    companion index -> spot
 */
export function assignShelters(positions, spots) {
  const assignment = new Map();
  if (spots.length === 0 || positions.length === 0) return assignment;

  const pairs = [];
  for (let i = 0; i < positions.length; i++) {
    for (const spot of spots) {
      const d = Math.hypot(positions[i].x - spot.x, positions[i].z - spot.z);
      pairs.push({ i, spot, d });
    }
  }
  pairs.sort((a, b) => a.d - b.d);

  const beds = new Map(spots.map((s) => [s.id, s.capacity]));
  for (const { i, spot } of pairs) {
    if (assignment.has(i)) continue;
    const free = beds.get(spot.id);
    if (free <= 0) continue;
    beds.set(spot.id, free - 1);
    assignment.set(i, spot);
  }
  return assignment;
}

/**
 * A point just outside a shelter's wall: where a dragon walks to on its way in,
 * and where it reappears at dawn. `slot` fans housemates around the building so
 * two dragons sharing a house never step out inside each other.
 */
export function doorPosition(spot, bodyRadius, slot = 0) {
  const angle = Math.PI / 2 + (slot * Math.PI * 2) / 3; // slot 0 = due south
  const d = spot.radius + bodyRadius + DOOR_GAP;
  return { x: spot.x + Math.cos(angle) * d, z: spot.z + Math.sin(angle) * d };
}

/**
 * How close a companion must get to a shelter's centre to count as inside.
 *
 * This has to exceed the distance the structure's own collider pushes a body
 * out to, because MovableDragon resolves overlaps every frame: at anything
 * tighter the dragon is shoved back off the doorstep and jitters there forever.
 */
export function enterDistance(spot, bodyRadius) {
  return spot.radius + bodyRadius + ENTER_SLACK;
}
