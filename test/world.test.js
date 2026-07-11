// Unit tests for the World contract (src/game/world.js), Stage 0a of the islands
// refactor (docs/islands-plan.md §3). The correctness lynchpin is reference identity:
// createWorld must store the passed entity arrays, not copies, or the construction
// block's pushes stop showing up at runtime.
//
// Zero dependencies: `node --test test/` (Node 18+). No package.json, no framework.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, registerWorld, getWorld, allWorlds } from '../src/game/world.js';

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
