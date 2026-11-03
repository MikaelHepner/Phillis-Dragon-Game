import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MovableDragon, SWIM_DEPTH } from '../src3d/entities/MovableDragon.js';

const GROUND_Y = 2;
const bounds = { size: 10000, margin: 10 };
const volcano = {
  x: 500,
  z: 500,
  radius: 92,
  climbableBy: 'fire',
  cone: { baseRadius: 100, topRadius: 36, height: 80 },
};

function makeMover(element, x, z) {
  const dragon = {
    group: new THREE.Group(),
    config: { element },
    setAnimation() {},
    update() {},
  };
  dragon.group.position.set(x, GROUND_Y, z);
  return new MovableDragon(dragon, { colliders: [volcano], bounds, groundY: GROUND_Y });
}

// Walk straight at the volcano centre from the west for a while.
function walkIn(mover) {
  for (let i = 0; i < 300; i++) mover.step(110, 0, 1 / 60);
}

test('fire dragons walk up the volcano to the crater', () => {
  const up = makeMover('fire', 390, 500);
  for (let i = 0; i < 60; i++) up.step(110, 0, 1 / 60); // 110 units → x = 500
  assert.ok(Math.abs(up.position.x - 500) < 1);
  assert.equal(up.position.y, GROUND_Y + 80);
});

test('fire dragons stand on the slope partway up', () => {
  const mover = makeMover('fire', 380, 500);
  for (let i = 0; i < 30; i++) mover.step(110, 0, 1 / 60); // 55 units → d = 65
  const d = 500 - mover.position.x;
  const expected = GROUND_Y + (80 * (100 - d)) / (100 - 36);
  assert.ok(Math.abs(mover.position.y - expected) < 1e-6);
});

test('other dragons are still blocked at the base', () => {
  const mover = makeMover('nature', 350, 500);
  walkIn(mover);
  assert.ok(500 - mover.position.x >= 92 + mover.radius - 1e-6);
  assert.equal(mover.position.y, GROUND_Y);
});

test('taking control of a fire dragon on the slope keeps it on the slope', () => {
  const dragon = {
    group: new THREE.Group(),
    config: { element: 'fire' },
    setAnimation() {},
    update() {},
  };
  dragon.group.position.set(500, GROUND_Y + 80, 500); // standing in the crater
  const mover = new MovableDragon(dragon, { colliders: [volcano], bounds, groundY: GROUND_Y });
  assert.equal(mover.position.y, GROUND_Y + 80);
});

const lake = { x: 2000, z: 500, radius: 300, swimmableBy: 'water' };

function makeSwimmer(element, x, z) {
  const dragon = {
    group: new THREE.Group(),
    config: { element },
    setAnimation() {},
    update() {},
  };
  dragon.group.position.set(x, GROUND_Y, z);
  return new MovableDragon(dragon, { colliders: [lake], bounds, groundY: GROUND_Y });
}

test('water dragons swim across the lake, sitting low in the water', () => {
  const mover = makeSwimmer('water', 1650, 500);
  for (let i = 0; i < 191; i++) mover.step(110, 0, 1 / 60); // ~350 units → x ≈ 2000
  assert.ok(Math.abs(mover.position.x - 2000) < 1);
  assert.equal(mover.position.y, GROUND_Y - SWIM_DEPTH);
});

test('water dragons climb back out onto dry ground', () => {
  const mover = makeSwimmer('water', 2000, 500);
  for (let i = 0; i < 240; i++) mover.step(110, 0, 1 / 60); // 440 units → x = 2440
  assert.equal(mover.position.y, GROUND_Y);
});

test('other dragons stop at the shore', () => {
  const mover = makeSwimmer('fire', 1600, 500);
  for (let i = 0; i < 300; i++) mover.step(110, 0, 1 / 60);
  assert.ok(2000 - mover.position.x >= 300 + mover.radius - 1e-6);
  assert.equal(mover.position.y, GROUND_Y);
});
