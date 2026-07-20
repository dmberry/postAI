// POLYPHEMUS — the Land of the Cyclopes (island Aegilia). The second daemon
// island and the proper home of the full kill-raid (islands-odyssey-revision.md
// R5 / islands-plan §6): a martial island whose signature is the single burning
// eye — surveillance, the panopticon in one giant sensor. Ember-coloured obelisks
// and fortress, harder than CALYPSO. Built from the same worldgen base + spawners
// as CALYPSO with its own hue, name, and a leaner, less-welcoming loot pass. It is
// a `combat` world, so main.js runs the full combat/fortress/obelisk loop here
// (generalised in the loop-refactor commit); the single-eye LOS mechanic is a
// follow-up pass (slice 3).

import { buildWorld } from '../game/worldgen.js';
import { spawnAnimals } from '../game/animals.js';
import { spawnRobots, spawnW5, spawnM4, spawnM5, spawnM6 } from '../game/robots.js';
import { spawnWaterDroids } from '../game/waterdroids.js';
import { spawnBirds } from '../game/birds.js';
import { placeTors } from '../game/hermes.js';
import { placeRuins } from '../game/ruins.js';
import { stampCoast } from '../engine/coast.js';
import { createFortress } from '../game/fortress.js';
import { makeRng } from '../game/rng.js';
import { applyIslandPalette, islandTerrain } from '../game/palettes.js';
import { createWorld } from '../game/world.js';

const OB_COLOR = '#4e1410';       // ember at rest — the single burning eye
const OB_ALERT = '#ff2a20';       // bright ember on alert

// A beach tile with open sea one cardinal side and buildable land the other,
// returned with its seaward direction — where the ship beaches on arrival.
function findBeach(map, rng) {
  const cands = [];
  const land = (x, y) => { const f = map.floorAt(x, y); return f === 'grass' || f === 'tallgrass' || f === 'sand'; };
  for (let y = 3; y < map.h - 3; y++) {
    for (let x = 3; x < map.w - 3; x++) {
      if (map.floorAt(x, y) !== 'sand' || map.objectAt(x, y)) continue;
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        if (map.floorAt(x + dx, y + dy) !== 'sea') continue;
        if (land(x - dx, y - dy) && !map.objectAt(x - dx, y - dy)) cands.push({ x, y, dx, dy });
        break;
      }
    }
  }
  return cands.length ? cands[Math.floor(rng() * cands.length)] : null;
}

export function createPolyphemus(seed) {
  // A distinct seed so the Cyclopes' island is its own terrain, not CALYPSO's twin.
  const IS = (seed ^ 0x0c7c10e5) >>> 0;
  const { map, spawn } = buildWorld(IS, islandTerrain('polyphemus'));

  const animals = spawnAnimals(map, IS, { x: spawn.x, y: spawn.y, r: 12 });

  // A lean, unwelcoming loot pass — Polyphemus is a harder island than CALYPSO,
  // and the Cyclops keeps no comforts. Weapons and ammo you must earn from the
  // caves; only survival scraps lie loose.
  {
    const rng = makeRng((IS ^ 0x7031) >>> 0);
    const boards = [], grass = [];
    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        if (map.objectAt(x, y)) continue;
        const f = map.floorAt(x, y);
        if (f === 'boards') boards.push([x, y]);
        else if (f === 'grass' || f === 'tallgrass') grass.push([x, y]);
      }
    }
    const drop = (list, item, qty) => {
      if (!list.length) return;
      const [x, y] = list[Math.floor(rng() * list.length)];
      map.groundItems.push({ item, qty, x: x + 0.5, y: y + 0.5, keep: true });
    };
    for (let i = 0; i < 8; i++) drop(boards, 'torch', 1);
    for (let i = 0; i < 8; i++) drop(boards, 'tin', 1);
    for (let i = 0; i < 10; i++) drop(grass, 'berries', 2);
    drop(boards, 'chip', 1);       // a way into the terminals must exist
    drop(boards, 'backpack', 1);
  }

  // The AI network is one great EYE and a thin ring of lesser towers — the
  // panopticon in a single sensor (islands-plan §6). The first tower placed is
  // THE eye (cls 'eye'): it watches by line of sight across the island (main.js's
  // obelisk loop), and while it can see you the whole island turns your way. Break
  // its line (behind ruins, forest, the fortress) to slip its gaze; blind it
  // (crash/destroy it) to put the eye out. The rest are ordinary ember towers.
  const obelisks = [];
  {
    const rng = makeRng((IS ^ 0x0b31) >>> 0);
    let guard = 0;
    while (obelisks.length < 6 && guard++ < 5000) {
      const x = 4 + Math.floor(rng() * (map.w - 8));
      const y = 4 + Math.floor(rng() * (map.h - 8));
      const f = map.floorAt(x, y);
      if ((f !== 'grass' && f !== 'tallgrass') || map.objectAt(x, y)) continue;
      if (Math.hypot(x - spawn.x, y - spawn.y) < 16) continue;
      if (obelisks.some((o) => Math.hypot(o.x - x, o.y - y) < 14)) continue;
      map.addObject('obelisk', x, y, obelisks.length === 0 ? { cls: 'eye' } : {});
      obelisks.push({ x, y });
    }
    // Resistance caches: a handful of guaranteed anti-machine gear in interior
    // boards tiles (never doorways), the rest a light roll. Fewer than CALYPSO.
    const inner = [];
    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        if (map.floorAt(x, y) !== 'boards' || map.objectAt(x, y)) continue;
        if (map.floorAt(x + 1, y) === 'boards' && map.floorAt(x - 1, y) === 'boards'
          && map.floorAt(x, y + 1) === 'boards' && map.floorAt(x, y - 1) === 'boards') inner.push([x, y]);
      }
    }
    for (let i = inner.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [inner[i], inner[j]] = [inner[j], inner[i]]; }
    const guaranteed = [
      [{ item: 'stungun', qty: 1 }, { item: 'battery', qty: 4 }],
      [{ item: 'shotgun', qty: 1 }, { item: 'shells', qty: 8 }],
      [{ item: 'crowbar', qty: 1 }],
      [{ item: 'shield', qty: 1 }],
      [{ item: 'sledgehammer', qty: 1 }],
      [{ item: 'bomb_medium', qty: 1 }, { item: 'bomb_small', qty: 1 }],
      [{ item: 'railgun', qty: 1 }, { item: 'battery', qty: 12 }],
      [{ item: 'book_ronml', qty: 1 }],
      [{ item: 'chip', qty: 1 }],
    ];
    for (let i = 0; i < guaranteed.length && inner.length; i++) {
      const [x, y] = inner.pop();
      map.addObject('box', x, y, { loot: guaranteed[i], opened: false });
    }
  }

  // The W-factory (repair-drone foundry), a big industrial footprint.
  let wfactory = null;
  {
    const rng = makeRng((IS ^ 0x5a11c0de) >>> 0);
    const FW = 8, FH = 8, FACTORY_HP = 420;
    let guard = 0;
    while (!wfactory && guard++ < 8000) {
      const x = 4 + Math.floor(rng() * (map.w - FW - 8));
      const y = 4 + Math.floor(rng() * (map.h - FH - 8));
      let ok = true;
      for (let dy = 0; dy < FH && ok; dy++) {
        for (let dx = 0; dx < FW; dx++) {
          const f = map.floorAt(x + dx, y + dy);
          if ((f !== 'grass' && f !== 'tallgrass') || map.objectAt(x + dx, y + dy)
            || (map.heightAt && map.heightAt(x + dx, y + dy) !== 0)) { ok = false; break; }
        }
      }
      if (!ok) continue;
      if (Math.hypot(x + FW / 2 - spawn.x, y + FH / 2 - spawn.y) < 26) continue;
      const footprint = [];
      for (let dy = 0; dy < FH; dy++) for (let dx = 0; dx < FW; dx++) footprint.push({ x: x + dx, y: y + dy });
      wfactory = map.addObject('wfactory', x, y, { fw: FW, fh: FH, footprint, hp: FACTORY_HP, maxHp: FACTORY_HP });
      for (const t of footprint) map.objectGrid[t.y * map.w + t.x] = wfactory;
    }
  }

  const robots = spawnRobots(map, IS, obelisks, { x: spawn.x, y: spawn.y, r: 14 });
  for (let placed = 0, tries = 0; placed < 2 && tries < 120; tries++) {
    const gx = 6 + Math.floor(Math.random() * (map.w - 12));
    const gy = 6 + Math.floor(Math.random() * (map.h - 12));
    const g = spawnW5(map, (IS ^ (0x5ad + placed * 131)) >>> 0, gx, gy);
    if (g) { robots.push(g); placed++; }
  }
  const waterdroids = spawnWaterDroids(map, IS);

  const obeliskObjs = obelisks.map((o) => map.objectAt(o.x, o.y)).filter(Boolean);
  for (const ob of obeliskObjs) {
    ob.alert = 0; ob.blinkFlash = 0; ob._blinkT = 2 + Math.random() * 5; ob._nudgeT = 0;
    ob.code = 'OB-' + ((ob.x * 4096 + ob.y * 31) & 0xffff).toString(16).toUpperCase().padStart(4, '0');
  }
  const torPlacements = placeTors(map, makeRng((IS ^ 0x40b1e5) >>> 0), { spawn, count: 4 });
  const torObjs = torPlacements.map((t) => map.objectAt(t.x, t.y)).filter(Boolean);
  {
    const rng = makeRng((IS ^ 0xc1c0de) >>> 0);
    const nums = obeliskObjs.map((_, i) => (i % 8) + 1);
    for (let i = nums.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [nums[i], nums[j]] = [nums[j], nums[i]]; }
    obeliskObjs.forEach((ob, i) => { ob.circuitNum = nums[i]; });
  }

  // POLYPHEMUS's fortress: the kill-raid, ember-coloured, named for the Cyclops.
  const fortress = createFortress(map, IS, spawn, {
    aiName: 'POLYPHEMUS', winMode: 'kill', obColor: OB_COLOR, obAlertColor: OB_ALERT,
  });
  const mainframe = fortress.core;

  stampCoast(map, spawn);
  map.temples = placeRuins(map, makeRng((IS ^ 0x2c01dd) >>> 0), { spawn, clusters: 3 });
  robots.push(...fortress.spawnGuards(spawnM4));
  // The labyrinth is garrisoned, not empty. Polyphemus carries the HARD raid
  // (islands-odyssey-revision §4), so it takes the heaviest watch of the three
  // kill islands: M6 packs in the corridors, M5 snipers on the deep straights.
  robots.push(...fortress.garrisonMaze(spawnM6, spawnM5, { m6: 7, m5: 4 }));

  const birds = spawnBirds(map, IS);

  // The greek ship you crossed in, beached on the shore; board it to sail on.
  // Arrival is at the water's edge beside it, not buildWorld's inland spawn.
  const beach = findBeach(map, makeRng((IS ^ 0xb0a7) >>> 0));
  let arrival = { x: spawn.x + 0.5, y: spawn.y + 0.5 };
  let ship = null;
  if (beach) {
    if (map.objectAt(beach.x, beach.y)) map.removeObject(map.objectAt(beach.x, beach.y));
    ship = map.addObject('greek_ship', beach.x, beach.y, { hull: 100, maxHull: 100, seaworthy: true });
    arrival = { x: beach.x - beach.dx + 0.5, y: beach.y - beach.dy + 0.5 };
  }

  map.projectiles = [];
  map.bombs = [];
  map.explosions = [];
  map.explored = new Uint8Array(map.w * map.h);
  map.newlyRevealed = [];

  applyIslandPalette(map, 'polyphemus'); // per-island ground + foliage colour (B2)
  const world = createWorld('polyphemus', {
    map, spawn: arrival, robots, animals, birds, waterdroids, obelisks, obeliskObjs,
    obColor: OB_COLOR, obAlertColor: OB_ALERT,
    combat: true, // martial island: main.js runs the full combat/fortress loop here
  });
  world.fortress = fortress;
  world.wfactory = wfactory;
  world.mainframe = mainframe;
  world.torObjs = torObjs;
  world.ship = ship;
  return world;
}
