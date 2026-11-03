import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GameState } from '../src3d/state/GameState.js';
import { CompanionManager } from '../src3d/companions/CompanionManager.js';

function fakeDragon(element) {
  return { group: new THREE.Group(), config: { element }, setAnimation() {}, update() {} };
}

test('ride switches the ridden dragon and announces it', () => {
  const state = new GameState();
  state.addDragon({ id: 'phillis', name: 'Phillis', key: 'dragon' });
  state.addDragon({ id: 'fire', name: 'Fire Dragon', key: 'dragon_fire' });
  const seen = [];
  state.on('ride', (d) => seen.push(d.id));

  state.ride('fire');
  state.ride('fire'); // already riding: no repeat event
  state.ride('ice'); // not owned: ignored

  assert.equal(state.riddenId, 'fire');
  assert.deepEqual(seen, ['fire']);
});

test('removing a companion takes it out of the chain and wakes it', () => {
  const companions = new CompanionManager({ colliders: [], bounds: { size: 1000, margin: 10 } });
  const a = fakeDragon('fire');
  const b = fakeDragon('nature');
  companions.add(a);
  companions.add(b);
  a.group.visible = false; // as if asleep indoors
  companions.companions[0].indoors = true;

  assert.equal(companions.remove(a), true);
  assert.equal(companions.remove(a), false);
  assert.equal(companions.companions.length, 1);
  assert.equal(companions.companions[0].mover.dragon, b);
  assert.equal(a.group.visible, true);
});
