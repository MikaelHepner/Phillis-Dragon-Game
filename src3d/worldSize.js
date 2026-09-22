// The island's footprint, kept in a dependency-free module so the pure-math
// biome layout (biomes/biomeMap.js) and its node tests can read it without
// pulling in three.js.
//
// The 2D game (GAME_DESIGN.md §2) was a 2000×2000 island. The 3D island is
// WORLD_SCALE times wider on each side; anything that was a *proportion* of
// the old map (biome positions, scatter range) is expressed against
// WORLD_SIZE, while gameplay distances (aggro range, spawn ring, harvest
// reach) stay absolute so the moment-to-moment feel is unchanged.
export const WORLD_SCALE = 5;
export const WORLD_SIZE = 2000 * WORLD_SCALE; // 10000
