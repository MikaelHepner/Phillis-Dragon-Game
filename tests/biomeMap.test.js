import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BIOMES,
  biomeAt,
  blobOutline,
  randomPointInBiome,
} from '../src3d/biomes/biomeMap.js';
import { WORLD_SIZE } from '../src3d/worldSize.js';

function seq(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

test('the meadow spawn point is not inside any biome', () => {
  assert.equal(biomeAt(WORLD_SIZE / 2, WORLD_SIZE / 2), null);
});

test('the spawn meadow has room to breathe before the first biome', () => {
  // world.js keeps meadow scenery ≥300 from spawn; the biomes should start
  // well beyond that so the early game stays meadow-only.
  for (const b of BIOMES) {
    const d = Math.hypot(b.cx - WORLD_SIZE / 2, b.cz - WORLD_SIZE / 2) - b.radius;
    assert.ok(d >= 600, `${b.id} edge is only ${d} from spawn`);
  }
});

test('biome centers resolve to their own biome', () => {
  for (const b of BIOMES) {
    assert.equal(biomeAt(b.cx, b.cz)?.id, b.id);
  }
});

test('jungle and fire regions do not overlap', () => {
  const [a, b] = BIOMES;
  const gap = Math.hypot(a.cx - b.cx, a.cz - b.cz) - (a.radius + b.radius);
  assert.ok(gap > 0, `regions overlap by ${-gap}`);
});

test('biome regions stay inside the scatter range with margin', () => {
  const lo = WORLD_SIZE * 0.06;
  const hi = WORLD_SIZE * 0.94;
  for (const b of BIOMES) {
    assert.ok(b.cx - b.radius >= lo, `${b.id} west edge`);
    assert.ok(b.cx + b.radius <= hi, `${b.id} east edge`);
    assert.ok(b.cz - b.radius >= lo, `${b.id} north edge`);
    assert.ok(b.cz + b.radius <= hi, `${b.id} south edge`);
  }
});

test('blobOutline returns a closed wobbly ring around the radius', () => {
  const pts = blobOutline({ cx: 500, cz: 500, radius: 300 }, seq([0.2, 0.9, 0.5]), 24);
  assert.equal(pts.length, 24);
  for (const [x, z] of pts) {
    const d = Math.hypot(x - 500, z - 500);
    assert.ok(d >= 300 * 0.8 && d <= 300 * 1.15, `point at ${d} strays too far`);
  }
});

test('randomPointInBiome lands inside the biome disc, away from the edge', () => {
  const b = BIOMES[0];
  const rng = seq([0.01, 0.99, 0.5, 0.3, 0.77]);
  for (let i = 0; i < 50; i++) {
    const { x, z } = randomPointInBiome(b, rng);
    assert.ok(Math.hypot(x - b.cx, z - b.cz) <= b.radius * 0.85);
  }
});
