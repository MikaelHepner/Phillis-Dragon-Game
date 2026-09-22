// Biome layout for the island. Pure math, no three.js: where each biome sits,
// which biome a point belongs to, and the seeded helpers that scatter
// scenery inside a region. Kept dependency-free so it can be unit-tested with
// `node --test`.
//
// The island stays a single WORLD_SIZE×WORLD_SIZE landmass (GAME_DESIGN.md
// §2). Biomes are round-ish patches laid over the meadow: the jungle in the
// south-east, the volcanic fire biome in the north-west. The meadow keeps the
// centre, so the player spawn and the opening minutes of the game are
// meadow-only. Positions and radii are fractions of the island so they scale
// with it (the layout below matches the original 2000² island's 1520/1500
// r340 jungle and 480/500 r330 fire fields).

import { WORLD_SIZE } from '../worldSize.js';

export const BIOMES = [
  {
    id: 'jungle',
    label: 'Jungle',
    cx: WORLD_SIZE * 0.76,
    cz: WORLD_SIZE * 0.75,
    radius: WORLD_SIZE * 0.17,
  },
  {
    id: 'fire',
    label: 'Fire Fields',
    cx: WORLD_SIZE * 0.24,
    cz: WORLD_SIZE * 0.25,
    radius: WORLD_SIZE * 0.165,
  },
];

/** The biome containing (x, z), or null for the grass meadow. */
export function biomeAt(x, z) {
  for (const b of BIOMES) {
    if (Math.hypot(x - b.cx, z - b.cz) <= b.radius) return b;
  }
  return null;
}

/**
 * Wobbly ring of [x, z] points around a biome — the outline of its ground
 * patch. The radius jitters between 0.86× and 1.1× so the edge reads as a
 * hand-drawn blob rather than a compass circle.
 *
 * @param {{cx:number, cz:number, radius:number}} biome
 * @param {() => number} rng   seeded PRNG in [0, 1)
 * @param {number} segments
 */
export function blobOutline(biome, rng, segments = 40) {
  const pts = [];
  for (let i = 0; i < segments; i++) {
    const ang = (i / segments) * Math.PI * 2;
    const r = biome.radius * (0.86 + rng() * 0.24);
    pts.push([biome.cx + Math.cos(ang) * r, biome.cz + Math.sin(ang) * r]);
  }
  return pts;
}

/**
 * Seeded point inside a biome, kept off the wobbly rim so scenery never pokes
 * out onto the meadow. sqrt on the radius gives an even spread over the disc
 * rather than bunching at the centre.
 */
export function randomPointInBiome(biome, rng, { minR = 0, maxR = 0.85 } = {}) {
  const ang = rng() * Math.PI * 2;
  const rad = biome.radius * Math.sqrt(minR * minR + rng() * (maxR * maxR - minR * minR));
  return { x: biome.cx + Math.cos(ang) * rad, z: biome.cz + Math.sin(ang) * rad };
}
