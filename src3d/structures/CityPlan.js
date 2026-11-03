// City layout: when the player owns CITY.threshold plain Dragon Houses, they
// gather into one main street with buildings facing each other across the road.
// Pure math over plain data, like biomes/biomeMap.js, so GameState can use it
// without touching Three.js and the rules stay easy to test.
//
// The street always runs along x. A "plot" is an index: even plots are on the
// north (-z) side, odd plots on the south (+z), and each pair shares a column.

export const CITY = {
  threshold: 10,
  plotSpacing: 100, // between neighbouring buildings' centres
  rowOffset: 58, // from the road's centre line to a building's centre
  roadHalfWidth: 20,
  streetHalfWidth: 32, // road plus pavement
  lightOffset: 26, // from the centre line, in the middle of the pavement
  buildingRadius: 30, // matches the city models in StructureFactory
};

const FIRST_COLUMNS = 5; // the founding ten: 5 columns of 2, centred on the site
const SITE_HALF_X = (FIRST_COLUMNS / 2) * CITY.plotSpacing;
const SITE_HALF_Z = CITY.rowOffset + CITY.buildingRadius;

// How far findCitySite looks, and how finely. The island is 10000 across, so a
// clear stretch of ground is always far closer than this.
const SEARCH_STEP = 100;
const SEARCH_MAX = 5000;
const SEARCH_ANGLES = 16;

/** Column of a plot, relative to the city centre. */
function plotColumn(plot) {
  const rank = Math.floor(plot / 2);
  if (rank < FIRST_COLUMNS) return rank - 2;
  // Past the founding ten the street grows at alternating ends: 3, -3, 4, -4…
  const n = rank - FIRST_COLUMNS;
  const reach = 3 + Math.floor(n / 2);
  return n % 2 === 0 ? reach : -reach;
}

/** Where a plot sits on the island, and which side of the road it is on. */
export function plotPosition(city, plot) {
  const north = plot % 2 === 0;
  return {
    x: city.x + plotColumn(plot) * CITY.plotSpacing,
    z: city.z + (north ? -CITY.rowOffset : CITY.rowOffset),
    side: north ? 'north' : 'south',
  };
}

/** Dragon Houses still doing their original job: the ones that can gather. */
export function plainHouses(structures) {
  return structures.filter((s) => s.type === 'house' && !s.upgradeType);
}

function columnRange(plots) {
  const columns = plots.map(plotColumn);
  return { min: Math.min(...columns), max: Math.max(...columns) };
}

/** The x-extent of the road, half a plot beyond the outermost buildings. */
export function streetSpan(city, plots) {
  const { min, max } = columnRange(plots);
  return {
    minX: city.x + (min - 0.5) * CITY.plotSpacing,
    maxX: city.x + (max + 0.5) * CITY.plotSpacing,
  };
}

/** One light per pavement in every gap between neighbouring columns. */
export function streetlightSpots(city, plots) {
  const { min, max } = columnRange(plots);
  const spots = [];
  for (let col = min; col < max; col++) {
    const x = city.x + (col + 0.5) * CITY.plotSpacing;
    spots.push({ x, z: city.z - CITY.lightOffset });
    spots.push({ x, z: city.z + CITY.lightOffset });
  }
  return spots;
}

/** True when a circle of `radius` at (x, z) would touch the road or pavement. */
export function isOnStreet(city, plots, x, z, radius = 0) {
  if (plots.length === 0) return false;
  const { minX, maxX } = streetSpan(city, plots);
  const dx = Math.max(minX - x, 0, x - maxX);
  const dz = Math.max(Math.abs(z - city.z) - CITY.streetHalfWidth, 0);
  return Math.hypot(dx, dz) < radius || (dx === 0 && dz === 0);
}

function circleHitsRect(c, x, z, halfX, halfZ) {
  const dx = Math.max(Math.abs(c.x - x) - halfX, 0);
  const dz = Math.max(Math.abs(c.z - z) - halfZ, 0);
  return Math.hypot(dx, dz) < c.radius;
}

function rectInBounds(x, z, halfX, halfZ, bounds) {
  const lo = bounds.margin;
  const hi = bounds.size - bounds.margin;
  return x - halfX >= lo && x + halfX <= hi && z - halfZ >= lo && z + halfZ <= hi;
}

/** Can the founding ten and their road fit with the centre at `site`? */
export function siteIsClear(site, obstacles, bounds) {
  if (!rectInBounds(site.x, site.z, SITE_HALF_X, SITE_HALF_Z, bounds)) return false;
  return !obstacles.some((c) => circleHitsRect(c, site.x, site.z, SITE_HALF_X, SITE_HALF_Z));
}

/**
 * The clear site nearest to `preferred`, searching outward in rings. Returns
 * null only if nothing within reach fits; the caller then tries again the next
 * time a house is built.
 *
 * @param {{x, z}} preferred
 * @param {Array<{x, z, radius}>} obstacles  anything that can't be cleared away
 * @param {{size, margin}} bounds
 */
export function findCitySite(preferred, obstacles, bounds) {
  if (siteIsClear(preferred, obstacles, bounds)) return { x: preferred.x, z: preferred.z };
  for (let r = SEARCH_STEP; r <= SEARCH_MAX; r += SEARCH_STEP) {
    for (let i = 0; i < SEARCH_ANGLES; i++) {
      const angle = (i / SEARCH_ANGLES) * Math.PI * 2;
      const site = {
        x: Math.round(preferred.x + Math.cos(angle) * r),
        z: Math.round(preferred.z + Math.sin(angle) * r),
      };
      if (siteIsClear(site, obstacles, bounds)) return site;
    }
  }
  return null;
}

/**
 * The next `count` usable plots, in street order. A plot is skipped if it is
 * already taken, off the island, or blocked. If the street has nowhere left to
 * grow, fewer than `count` come back.
 */
export function allocatePlots(city, count, taken, obstacles, bounds) {
  const used = new Set(taken);
  const plots = [];
  const r = CITY.buildingRadius;
  // Far more than the island can hold: this is only a guard against looping forever.
  for (let plot = 0; plot < 1000 && plots.length < count; plot++) {
    if (used.has(plot)) continue;
    const { x, z } = plotPosition(city, plot);
    if (!rectInBounds(x, z, r, r, bounds)) continue;
    if (obstacles.some((c) => Math.hypot(c.x - x, c.z - z) < c.radius + r)) continue;
    plots.push(plot);
  }
  return plots;
}
