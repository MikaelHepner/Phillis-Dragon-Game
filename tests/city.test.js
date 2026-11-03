import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// ConstructionManager listens for input on window and paints labels on a
// canvas. Neither matters here, so both get the smallest stand-in that runs.
globalThis.window ??= { addEventListener() {}, innerWidth: 800, innerHeight: 600 };
globalThis.document ??= {
  createElement: () => ({
    getContext: () => ({
      measureText: () => ({ width: 10 }),
      beginPath() {},
      roundRect() {},
      fill() {},
      fillText() {},
    }),
  }),
};

const { GameState } = await import('../src3d/state/GameState.js');
const { serialize, applySave } = await import('../src3d/state/SaveManager.js');
const { shelterSpots } = await import('../src3d/companions/NightShelter.js');
const { CompanionManager } = await import('../src3d/companions/CompanionManager.js');
const { ConstructionManager } = await import('../src3d/structures/ConstructionManager.js');
const { createStructureMesh } = await import('../src3d/structures/StructureFactory.js');
const { plotPosition, streetlightSpots, siteIsClear, findCitySite, allocatePlots, isOnStreet } =
  await import('../src3d/structures/CityPlan.js');

const BOUNDS = { size: 10000, margin: 40 };
const CITY = { x: 1000, z: 2000 };

function stockedState() {
  const state = new GameState();
  state.resources.wood = 1000;
  state.resources.fish = 1000;
  state.resources.stone = 1000;
  state.resources.coins = 1000;
  return state;
}

function setup({ fixedObstacles = [], state = stockedState(), trees = [] } = {}) {
  const scene = new THREE.Scene();
  const colliders = [];
  const construction = new ConstructionManager({
    scene,
    camera: new THREE.PerspectiveCamera(),
    state,
    colliders,
    hazards: [],
    bounds: BOUNDS,
    world: { trees, rocks: [], jungleTrees: [], emberRocks: [], fishingSpots: [], fixedObstacles },
    harvest: { removeObject() {} },
    getDragonPositions: () => [],
    floatText() {},
  });
  return { scene, colliders, construction, state };
}

// Scattered on purpose: far enough apart that "gathered" is unmistakable.
function buildHouses(state, n, from = 0) {
  for (let i = from; i < from + n; i++) state.buildStructure('house', 5000 + i * 300, 5000);
}

// — Layout ————————————————————————————————————————————————————————

test('the first ten plots face each other in pairs along one street', () => {
  assert.deepEqual(plotPosition(CITY, 0), { x: 800, z: 1942, side: 'north' });
  assert.deepEqual(plotPosition(CITY, 1), { x: 800, z: 2058, side: 'south' });
  assert.deepEqual(plotPosition(CITY, 8), { x: 1200, z: 1942, side: 'north' });
  assert.deepEqual(plotPosition(CITY, 9), { x: 1200, z: 2058, side: 'south' });
});

test('later plots extend the street at alternating ends', () => {
  assert.equal(plotPosition(CITY, 10).x, 1300);
  assert.equal(plotPosition(CITY, 11).x, 1300);
  assert.equal(plotPosition(CITY, 12).x, 700);
  assert.equal(plotPosition(CITY, 14).x, 1400);
  assert.equal(plotPosition(CITY, 16).x, 600);
});

test('streetlights stand on both pavements between neighbouring buildings', () => {
  const spots = streetlightSpots(CITY, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const sorted = (list) => list.map((s) => `${s.x},${s.z}`).sort();
  assert.deepEqual(
    sorted(spots),
    sorted([
      { x: 850, z: 1974 }, { x: 950, z: 1974 }, { x: 1050, z: 1974 }, { x: 1150, z: 1974 },
      { x: 850, z: 2026 }, { x: 950, z: 2026 }, { x: 1050, z: 2026 }, { x: 1150, z: 2026 },
    ])
  );
});

test('a site is rejected when it runs off the island or onto an obstacle', () => {
  assert.equal(siteIsClear(CITY, [], BOUNDS), true);
  assert.equal(siteIsClear({ x: 100, z: 2000 }, [], BOUNDS), false, 'west edge');
  assert.equal(siteIsClear({ x: 1000, z: 9950 }, [], BOUNDS), false, 'south edge');
  assert.equal(siteIsClear(CITY, [{ x: 1000, z: 2000, radius: 10 }], BOUNDS), false, 'on the road');
  assert.equal(siteIsClear(CITY, [{ x: 1000, z: 2300, radius: 10 }], BOUNDS), true, 'well clear');
});

test('the city stays at the preferred spot when that spot is free', () => {
  assert.deepEqual(findCitySite(CITY, [], BOUNDS), CITY);
});

test('a blocked spot moves the city only as far as it has to', () => {
  const lake = { x: 1000, z: 2000, radius: 200 };
  const site = findCitySite(CITY, [lake], BOUNDS);
  assert.equal(siteIsClear(site, [lake], BOUNDS), true);
  assert.ok(Math.hypot(site.x - CITY.x, site.z - CITY.z) < 800, 'stays nearby');
});

test('a spot by the shore of the island pulls the city back onto land', () => {
  const site = findCitySite({ x: 60, z: 2000 }, [], BOUNDS);
  assert.equal(siteIsClear(site, [], BOUNDS), true);
});

test('plot allocation skips taken and blocked plots', () => {
  // Plot 10 is x=1300, z=1942; a rock on it must push the next house to plot 11.
  const rock = { x: 1300, z: 1942, radius: 10 };
  const taken = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  assert.deepEqual(allocatePlots(CITY, 2, taken, [rock], BOUNDS), [11, 12]);
});

test('the road counts as occupied ground, the plots beside it do not', () => {
  const plots = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  assert.equal(isOnStreet(CITY, plots, 1000, 2000), true);
  assert.equal(isOnStreet(CITY, plots, 1000, 2100), false);
  assert.equal(isOnStreet(CITY, plots, 1500, 2000), false);
});

// — Game state ————————————————————————————————————————————————————

test('founding a city moves plain houses and leaves workshops alone', () => {
  const state = stockedState();
  buildHouses(state, 11);
  state.upgradeStructure('struct_1', 'mine');
  const seen = [];
  state.on('cityFounded', (c) => seen.push(c));

  state.foundCity(CITY.x, CITY.z, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

  const mine = state.getStructure('struct_1');
  assert.equal(mine.x, 5000);
  assert.equal(mine.cityPlot, undefined);
  const first = state.getStructure('struct_2');
  assert.deepEqual([first.x, first.z, first.cityPlot], [800, 1942, 0]);
  const last = state.getStructure('struct_11');
  assert.deepEqual([last.x, last.z, last.cityPlot], [1200, 2058, 9]);
  assert.deepEqual(state.city, CITY);
  assert.equal(seen.length, 1);
});

test('a second founding is refused', () => {
  const state = stockedState();
  buildHouses(state, 10);
  state.foundCity(CITY.x, CITY.z, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(state.foundCity(50, 50, [0]), null);
  assert.deepEqual(state.city, CITY);
});

test('a saved city comes back with every building on its plot', () => {
  const state = stockedState();
  buildHouses(state, 10);
  state.foundCity(CITY.x, CITY.z, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const save = JSON.parse(JSON.stringify(serialize(state)));

  const restored = new GameState();
  applySave(restored, save);

  assert.deepEqual(restored.city, CITY);
  const b = restored.getStructure('struct_10');
  assert.deepEqual([b.x, b.z, b.cityPlot], [1200, 2058, 9]);
});

test('a save from before cities existed loads with no city', () => {
  const state = stockedState();
  buildHouses(state, 2);
  const save = JSON.parse(JSON.stringify(serialize(state)));
  delete save.city;
  for (const s of save.structures) delete s.cityPlot;

  const restored = new GameState();
  applySave(restored, save);

  assert.equal(restored.city, null);
  assert.equal(restored.getStructure('struct_1').cityPlot, undefined);
});

// — Dragons ———————————————————————————————————————————————————————

test('a city building sleeps four dragons, a house two, a workshop none', () => {
  const spots = shelterSpots([
    { id: 'a', type: 'house', x: 0, z: 0, upgradeType: null, cityPlot: 0 },
    { id: 'b', type: 'house', x: 0, z: 0, upgradeType: null },
    { id: 'c', type: 'house', x: 0, z: 0, upgradeType: 'mine', cityPlot: 1 },
  ]);
  assert.deepEqual(spots.map((s) => [s.id, s.capacity]), [['a', 4], ['b', 2]]);
});

test('a dragon heading to bed follows its house to the new street', () => {
  const companions = new CompanionManager({ colliders: [], bounds: BOUNDS });
  const dragon = { group: new THREE.Group(), config: { element: 'fire' }, setAnimation() {}, update() {} };
  dragon.group.position.set(5000, 0, 4000);
  companions.add(dragon);
  const house = { id: 'h', type: 'house', x: 5000, z: 5000, upgradeType: null };
  const world = { night: true, structures: [house], radiusFor: () => 26 };

  companions.update(0.01, new THREE.Vector3(5000, 0, 3000), world);
  assert.equal(companions.companions[0].spot.x, 5000);

  house.x = 800;
  house.z = 1942;
  companions.update(0.01, new THREE.Vector3(5000, 0, 3000), world);

  assert.deepEqual(
    [companions.companions[0].spot.x, companions.companions[0].spot.z],
    [800, 1942]
  );
});

// — The island ————————————————————————————————————————————————————

test('every city building is taller than a Dragon House', () => {
  const house = createStructureMesh('house').userData.height;
  for (const kind of ['city_0', 'city_1', 'city_2']) {
    assert.ok(createStructureMesh(kind).userData.height > house, kind);
  }
});

test('nine houses are not a city', () => {
  const { state } = setup();
  buildHouses(state, 9);
  assert.equal(state.city, null);
  assert.equal(state.getStructure('struct_1').x, 5000);
});

test('the tenth house founds the city around itself', () => {
  const { state, construction } = setup();
  buildHouses(state, 10);

  // The tenth was placed at x=7700, z=5000 and nothing blocks that ground.
  assert.deepEqual(state.city, { x: 7700, z: 5000 });
  assert.equal(state.structures.filter((s) => s.cityPlot !== undefined).length, 10);
  assert.deepEqual(construction.streetlights.length, 8);
});

test('upgraded houses do not count towards the ten', () => {
  const { state } = setup();
  buildHouses(state, 9);
  state.upgradeStructure('struct_1', 'tower');
  buildHouses(state, 1, 9);
  assert.equal(state.city, null);
});

test('founding moves each house collider to its plot', () => {
  const { state, colliders } = setup();
  buildHouses(state, 10);

  // No collider may be left behind at the old scattered spots...
  assert.equal(colliders.filter((c) => c.z === 5000).length, 0);
  // ...and the first building's stands on plot 0: 200 west, 58 north of centre.
  assert.ok(colliders.some((c) => c.x === 7500 && c.z === 4942));
});

test('the city avoids the volcano and the lake', () => {
  const volcano = { x: 7700, z: 5000, radius: 300 };
  const { state } = setup({ fixedObstacles: [volcano] });
  buildHouses(state, 10);
  assert.notDeepEqual(state.city, { x: 7700, z: 5000 });
  assert.equal(siteIsClear(state.city, [volcano], BOUNDS), true);
});

test('the city avoids a tower the player has already built', () => {
  const { state } = setup();
  buildHouses(state, 8);
  state.buildStructure('house', 7800, 5000); // struct_9, right where the street would run
  state.upgradeStructure('struct_9', 'tower');
  buildHouses(state, 2, 8); // the tenth plain house lands at x=7700

  assert.ok(state.city);
  assert.equal(siteIsClear(state.city, [{ x: 7800, z: 5000, radius: 18 }], BOUNDS), true);
});

test('trees on the new street are cut down', () => {
  const tree = new THREE.Group();
  tree.position.set(7700, 0, 5000);
  const trees = [tree];
  const { state } = setup({ trees });
  buildHouses(state, 10);
  assert.equal(trees.length, 0);
});

test('the eleventh house joins the end of the street', () => {
  const { state, colliders, construction } = setup();
  buildHouses(state, 11);

  const house = state.getStructure('struct_11');
  assert.equal(house.cityPlot, 10);
  assert.deepEqual([house.x, house.z], [8000, 4942]);
  assert.ok(colliders.some((c) => c.x === 8000 && c.z === 4942));
  // Column 3 now exists, so one more gap of lights: 5 gaps × 2 pavements.
  assert.equal(construction.streetlights.length, 10);
});

test('a castle wall ring is redrawn around the gathered city', () => {
  const { state, construction } = setup();
  state.buildStructure('castle', 3000, 5000);
  buildHouses(state, 10);

  // The tenth house's plot is the far corner; the ring pads it by 120.
  assert.ok(construction.wallRing.right >= 7900 + 120);
  assert.ok(construction.wallRing.bottom >= 5058 + 120);
});

test('the streetlights come on at night and go off by day', () => {
  const { state, construction } = setup();
  buildHouses(state, 10);

  for (let i = 0; i < 60; i++) construction.update(0.1, true);
  assert.equal(construction.streetGlow, 1);

  for (let i = 0; i < 60; i++) construction.update(0.1, false);
  assert.equal(construction.streetGlow, 0);
});

test('loading a saved city rebuilds the street without founding again', () => {
  const live = setup();
  buildHouses(live.state, 10);
  const save = JSON.parse(JSON.stringify(serialize(live.state)));

  const fresh = setup({ state: new GameState() });
  let foundings = 0;
  fresh.state.on('cityFounded', () => foundings++);
  applySave(fresh.state, save);

  assert.equal(foundings, 0);
  assert.equal(fresh.construction.streetlights.length, 8);
  assert.ok(fresh.colliders.some((c) => c.x === 7500 && c.z === 4942));
});

test('a castle saved before its city still gets walls around the city', () => {
  const live = setup();
  live.state.buildStructure('castle', 3000, 5000);
  buildHouses(live.state, 10);
  const save = JSON.parse(JSON.stringify(serialize(live.state)));

  const fresh = setup({ state: new GameState() });
  applySave(fresh.state, save);

  assert.deepEqual(fresh.construction.wallRing, live.construction.wallRing);
});

test('an old save already holding ten houses founds its city on load', () => {
  const live = setup();
  buildHouses(live.state, 9);
  const save = JSON.parse(JSON.stringify(serialize(live.state)));
  save.structures.push({ id: 'struct_10', type: 'house', x: 7700, y: 5000, upgradeType: null });

  const fresh = setup({ state: new GameState() });
  applySave(fresh.state, save);

  assert.ok(fresh.state.city);
  assert.equal(fresh.state.structures.filter((s) => s.cityPlot !== undefined).length, 10);
});
