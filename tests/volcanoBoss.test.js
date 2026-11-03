import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameState, BOSS_MAX_HP, BOSS_LOOT_COINS } from '../src3d/state/GameState.js';
import { serialize, applySave } from '../src3d/state/SaveManager.js';
import { inBossAggro, inBossReach } from '../src3d/combat/VolcanoBoss.js';

const volcano = { x: 1000, z: 1000, cone: { baseRadius: 600, topRadius: 216, height: 420 } };

test('the boss starts at 1000 HP', () => {
  assert.equal(BOSS_MAX_HP, 1000);
  assert.equal(new GameState().bossHp, 1000);
});

test('hits chip the boss down and the killing blow pays out once', () => {
  const state = new GameState();
  const coins = state.resources.coins;
  const hurt = [];
  let defeated = 0;
  state.on('bossHurt', (hp) => hurt.push(hp));
  state.on('bossDefeated', () => defeated++);

  state.damageBoss(35);
  assert.equal(state.bossHp, 965);
  state.bossHp = 20;
  assert.equal(state.damageBoss(35), 20); // only what it had left
  assert.equal(state.bossHp, 0);
  assert.equal(state.damageBoss(35), 0); // already slain: nothing happens

  assert.deepEqual(hurt, [965, 0]);
  assert.equal(defeated, 1);
  assert.equal(state.resources.coins, coins + BOSS_LOOT_COINS);
});

test('boss HP survives a save and load', () => {
  const state = new GameState();
  state.addDragon({ id: 'phillis', name: 'Phillis', key: 'dragon' });
  state.damageBoss(300);
  const save = serialize(state, {});

  const loaded = new GameState();
  loaded.addDragon({ id: 'phillis', name: 'Phillis', key: 'dragon' });
  applySave(loaded, save);
  assert.equal(loaded.bossHp, 700);
});

test('old saves without a boss meet a fresh one', () => {
  const state = new GameState();
  state.addDragon({ id: 'phillis', name: 'Phillis', key: 'dragon' });
  const save = serialize(state, {});
  delete save.boss;
  applySave(state, save);
  assert.equal(state.bossHp, BOSS_MAX_HP);
});

test('the boss shoots further than you can hit it', () => {
  // At the foot of the cone: both in range.
  assert.ok(inBossAggro(volcano, 1000 + 650, 1000));
  assert.ok(inBossReach(volcano, 1000 + 650, 1000));
  // A bit further out: it can still hit you, you can't hit it.
  assert.ok(inBossAggro(volcano, 1000 + 900, 1000));
  assert.ok(!inBossReach(volcano, 1000 + 900, 1000));
  // Far away: safe.
  assert.ok(!inBossAggro(volcano, 1000 + 1200, 1000));
});
