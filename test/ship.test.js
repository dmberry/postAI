// Stage 1d — the proper sea-going ship (Player.craftGreekShip / boardBoat).
//
// Drives the real prototype methods over a real GameMap via a stub `this`
// (headless, like boat.test.js). Proves: the greek ship needs Calypso's recipe
// plus the three found parts; crafting consumes wood+parts but keeps the recipe;
// and only a seaworthy greek_ship leaves Ogygia — a plain boat washes back.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameMap } from '../src/game/map.js';
import { Player } from '../src/game/player.js';
import { buildWorld } from '../src/game/worldgen.js';
import { stampCoast } from '../src/engine/coast.js';
import { placeShipParts } from '../src/game/ships.js';

function shoreMap() {
  const map = new GameMap(10, 10);
  for (let y = 0; y < 10; y++) map.setFloor(0, y, 'sea');
  return map;
}

function stubShipwright({ x = 2.5, y = 2.5, wood = 12, recipe = true, parts = true } = {}) {
  const inv = { wood };
  if (recipe) inv.golden_axe = 1;
  if (parts) { inv.oar = 1; inv.rope = 1; inv.sail = 1; }
  return {
    x, y, shipBuilt: false, said: [], _inv: inv,
    facing: { x: 1, y: 0 }, _ended: false, deathCert: null, calypsoLeave: false,
    score: 0, skills: [], name: 'A', gender: 'm', deaths: 0,
    hasItem(k) { return (this._inv[k] || 0) > 0; },
    countItem(k) { return this._inv[k] || 0; },
    removeItem(k) { if ((this._inv[k] || 0) > 0) { this._inv[k]--; return true; } return false; },
    say(m) { this.said.push(m); },
    canCraftGreekShip: Player.prototype.canCraftGreekShip,
    craftGreekShip: Player.prototype.craftGreekShip,
    boardBoat: Player.prototype.boardBoat,
    _findLaunchTile: Player.prototype._findLaunchTile,
  };
}

test('greek ship: needs Calypso\'s recipe', () => {
  const p = stubShipwright({ recipe: false });
  assert.equal(p.canCraftGreekShip(shoreMap()), false);
});

test('greek ship: needs oar, rope and sail', () => {
  const p = stubShipwright({ parts: false });
  assert.equal(p.canCraftGreekShip(shoreMap()), false);
  assert.equal(p.craftGreekShip(shoreMap()), false);
  assert.match(p.said.at(-1), /oar.*rope.*sail|wrecks and huts/i);
});

test('greek ship: crafting consumes wood + parts, keeps the recipe, and beaches a seaworthy hull', () => {
  const map = shoreMap();
  const p = stubShipwright();
  assert.equal(p.canCraftGreekShip(map), true);
  assert.equal(p.craftGreekShip(map), true);
  assert.equal(p.countItem('wood'), 0, 'all wood spent');
  assert.equal(p.countItem('oar'), 0);
  assert.equal(p.countItem('rope'), 0);
  assert.equal(p.countItem('sail'), 0);
  assert.equal(p.countItem('golden_axe'), 1, 'recipe is NOT consumed');
  assert.equal(p.shipBuilt, true);
  const ship = map.objects.find((o) => o.type === 'greek_ship');
  assert.ok(ship, 'a greek_ship object exists');
  assert.equal(ship.seaworthy, true);
  assert.equal(map.isSolid(ship.x, ship.y), true, 'greek_ship registered in OBJECTS');
});

test('departure: a seaworthy greek ship leaves Ogygia', () => {
  const p = stubShipwright();
  p.boardBoat(shoreMap(), { seaworthy: true });
  assert.ok(p.deathCert, 'a certificate is issued');
  assert.equal(p.deathCert.escaped, true);
  assert.equal(p.deathCert.victory, true);
  assert.equal(p._ended, true);
});

test('departure: a plain boat (not seaworthy) is washed back, no escape', () => {
  const p = stubShipwright();
  const x0 = p.x;
  p.boardBoat(shoreMap(), { seaworthy: false });
  assert.equal(p.deathCert, null, 'no escape in a boat-no-sail');
  assert.equal(p._ended, false);
  assert.notEqual(p.x, x0, 'shoved back off the water');
  assert.match(p.said.at(-1), /hurls|swell|no ship/i);
});

test('parts: sail, oar and rope are placed as keep ground items on the island', () => {
  for (const seed of [1, 42, 1337]) {
    const { map, spawn } = buildWorld(seed);
    stampCoast(map, spawn);
    placeShipParts(map, seed, spawn);
    for (const part of ['sail', 'oar', 'rope']) {
      const gi = map.groundItems.find((g) => g.item === part);
      assert.ok(gi, `${part} placed on seed ${seed}`);
      assert.equal(gi.keep, true, `${part} never decays`);
    }
  }
});
