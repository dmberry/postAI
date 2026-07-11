// Unit tests for the World contract (src/game/world.js), Stage 0a of the islands
// refactor (docs/islands-plan.md §3). The correctness lynchpin is reference identity:
// createWorld must store the passed entity arrays, not copies, or the construction
// block's pushes stop showing up at runtime.
//
// Zero dependencies: `node --test test/` (Node 18+). No package.json, no framework.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, registerWorld, getWorld, allWorlds, switchWorld } from '../src/game/world.js';

test('createWorld stores entity arrays BY REFERENCE, not copies', () => {
  const robots = [{ id: 'r1' }], animals = [], obeliskObjs = [{ code: 'OB-0001' }];
  const w = createWorld('calypso', { robots, animals, obeliskObjs });
  assert.equal(w.robots, robots);            // same object, not a clone
  assert.equal(w.animals, animals);
  assert.equal(w.obeliskObjs, obeliskObjs);
  robots.push({ id: 'r2' });                 // a later construction-block push...
  assert.equal(w.robots.length, 2);          // ...is visible through the world
});

test('omitted collections default to fresh empty arrays', () => {
  const w = createWorld('ithaca', {});
  for (const k of ['robots', 'animals', 'birds', 'waterdroids', 'obelisks', 'obeliskObjs', 'creatures', 'controllers']) {
    assert.deepEqual(w[k], [], `${k} defaults to []`);
  }
});

test('id, map, spawn pass through; ambience merges over defaults', () => {
  const map = { w: 10, h: 10 };
  const w = createWorld('backspace', { map, spawn: { x: 3, y: 4 }, ambience: { light: 1, minimap: false } });
  assert.equal(w.id, 'backspace');
  assert.equal(w.map, map);
  assert.deepEqual(w.spawn, { x: 3, y: 4 });
  assert.equal(w.ambience.light, 1);         // override
  assert.equal(w.ambience.minimap, false);   // override
  assert.equal(w.ambience.dawnGlow, true);   // default preserved
});

test('lifecycle stubs default to callable no-ops', () => {
  const w = createWorld('calypso', {});
  for (const k of ['update', 'drawExtras', 'onEnter', 'onExit']) {
    assert.equal(typeof w[k], 'function');
    assert.doesNotThrow(() => w[k]());
  }
});

test('registerWorld / getWorld / allWorlds roundtrip', () => {
  const a = registerWorld(createWorld('a', {}));
  const b = registerWorld(createWorld('b', {}));
  assert.equal(getWorld('a'), a);
  assert.equal(getWorld('b'), b);
  assert.equal(getWorld('missing'), undefined);
  assert.ok(allWorlds().includes(a) && allWorlds().includes(b));
});

test('switchWorld runs onExit/onEnter, places the player, syncs player.map', () => {
  const log = [];
  const mapA = { id: 'mapA' }, mapB = { id: 'mapB' };
  const A = createWorld('A', { map: mapA, spawn: { x: 1, y: 1 }, onExit: () => log.push('exitA') });
  const B = createWorld('B', { map: mapB, spawn: { x: 9, y: 9 }, onEnter: () => log.push('enterB') });
  const player = { x: 5, y: 5, map: mapA };
  const now = switchWorld(A, B, player);
  assert.equal(now, B);
  assert.deepEqual(log, ['exitA', 'enterB']);   // exit before enter
  assert.deepEqual({ x: player.x, y: player.y }, { x: 9, y: 9 }); // arrived at B.spawn
  assert.equal(player.map, mapB);               // player.map synced
  assert.deepEqual(A.returnPos, { x: 5, y: 5 }); // A (keepsPosition default) remembered where we left
});

test('a keepsPosition world restores returnPos; keepsPosition:false always uses spawn', () => {
  const home = createWorld('home', { map: {}, spawn: { x: 0, y: 0 } });          // keepsPosition default true
  const pocket = createWorld('pocket', { map: {}, spawn: { x: 3, y: 3 }, keepsPosition: false });
  const player = { x: 7, y: 8, map: {} };
  switchWorld(home, pocket, player);            // leave home@(7,8) -> pocket.spawn
  assert.deepEqual({ x: player.x, y: player.y }, { x: 3, y: 3 });
  player.x = 99; player.y = 99;                 // wander deep into the pocket
  switchWorld(pocket, home, player);            // back home -> restored to (7,8), NOT home.spawn
  assert.deepEqual({ x: player.x, y: player.y }, { x: 7, y: 8 });
  assert.equal(pocket.returnPos, undefined);    // keepsPosition:false never stamped one
  switchWorld(home, pocket, player);            // re-enter the pocket -> spawn again (no mid-pocket memory)
  assert.deepEqual({ x: player.x, y: player.y }, { x: 3, y: 3 });
});
