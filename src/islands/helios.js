// HELIOS — Thrinacia. The fourth and last fell-able daemon, and the one that does
// not hunt you at all — until you break its one rule (islands-plan §6). The cattle
// of the Sun graze on the headland, golden and placid and FORBIDDEN. Fell the core
// and the island falls like the others; but slaughter one of the herd and HELIOS
// darkens, the whole network turns, and the sea itself remembers (main.js's
// prohibition pass).
//
// The counter is Homeric by inversion: on the other islands you WANT the special
// thing (moly, the key). Here the special thing is a trap — the discipline is to
// walk past a field of easy meat and take nothing (Odyssey 12.260-425).

import { buildWorld } from '../game/worldgen.js';
import { spawnAnimals, spawnSacredCattle } from '../game/animals.js';
import { spawnRobots, spawnW5, spawnM4, spawnM5, spawnM6 } from '../game/robots.js';
import { spawnWaterDroids } from '../game/waterdroids.js';
import { spawnBirds } from '../game/birds.js';
import { placeTors } from '../game/hermes.js';
import { placeRuins } from '../game/ruins.js';
import { stampCoast } from '../engine/coast.js';
import { createFortress } from '../game/fortress.js';
import { makeRng } from '../game/rng.js';
import { createWorld } from '../game/world.js';

const OB_COLOR = '#5c4310';       // burnt gold at rest — the darkened sun
const OB_ALERT = '#e0a010';       // bright gold on alert — the sun turned on you

// A beach tile with open sea one cardinal side and buildable land the other.
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

export function createHelios(seed) {
  const IS = (seed ^ 0x0e1105) >>> 0;
  const { map, spawn } = buildWorld(IS);

  const animals = spawnAnimals(map, IS, { x: spawn.x, y: spawn.y, r: 12 });

  // Loot: survival scraps and a workable kit. The island does not starve you — it
  // sets a table you must not touch.
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
      if (!list.length) return null;
      const i = Math.floor(rng() * list.length);
      const [x, y] = list[i];
      map.groundItems.push({ item, qty, x: x + 0.5, y: y + 0.5, keep: true });
      return { x, y };
    };
    for (let i = 0; i < 8; i++) drop(boards, 'torch', 1);
    for (let i = 0; i < 8; i++) drop(boards, 'tin', 1);
    for (let i = 0; i < 14; i++) drop(grass, 'berries', 2); // real food, so the herd is a choice, not a need
    drop(boards, 'chip', 1);
    drop(boards, 'backpack', 1);

    // Burnt-gold obelisks + a lean cache set.
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
      [{ item: 'machete', qty: 1 }],
      [{ item: 'shield', qty: 1 }],
      [{ item: 'sledgehammer', qty: 1 }],
      [{ item: 'bomb_medium', qty: 1 }],
      [{ item: 'railgun', qty: 1 }, { item: 'battery', qty: 12 }],
      [{ item: 'book_ronml', qty: 1 }],
      [{ item: 'chip', qty: 1 }],
    ];
    for (let i = 0; i < guaranteed.length && inner.length; i++) {
      const [x, y] = inner.pop();
      map.addObject('box', x, y, { loot: guaranteed[i], opened: false });
    }
  }

  const obelisks = [];
  {
    const rng = makeRng((IS ^ 0x0b31) >>> 0);
    let guard = 0;
    while (obelisks.length < 10 && guard++ < 5000) {
      const x = 4 + Math.floor(rng() * (map.w - 8));
      const y = 4 + Math.floor(rng() * (map.h - 8));
      const f = map.floorAt(x, y);
      if ((f !== 'grass' && f !== 'tallgrass') || map.objectAt(x, y)) continue;
      if (Math.hypot(x - spawn.x, y - spawn.y) < 16) continue;
      if (obelisks.some((o) => Math.hypot(o.x - x, o.y - y) < 14)) continue;
      map.addObject('obelisk', x, y, {});
      obelisks.push({ x, y });
    }
  }

  // The W-factory.
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

  const fortress = createFortress(map, IS, spawn, {
    aiName: 'HELIOS', winMode: 'kill', obColor: OB_COLOR, obAlertColor: OB_ALERT,
  });
  const mainframe = fortress.core;

  stampCoast(map, spawn);
  map.temples = placeRuins(map, makeRng((IS ^ 0x2c01dd) >>> 0), { spawn, clusters: 4 });
  robots.push(...fortress.spawnGuards(spawnM4));
  // A garrisoned labyrinth: M6 packs patrol the corridors, M5 snipers hold the
  // deep straights. Without this the maze is an empty walk to the quad.
  robots.push(...fortress.garrisonMaze(spawnM6, spawnM5));

  // THE CATTLE OF THE SUN. A herd grazes on open pasture, well clear of the spawn
  // and the fortress guns, so you meet them in peace and choose in peace. They are
  // golden, tame, and defenceless — the whole trial is to leave them be. The herd
  // and its head-count are handed to the world so the prohibition pass (main.js)
  // can tell when one has been slain.
  const sacredHerd = [];
  {
    const rng = makeRng((IS ^ 0x5c0117) >>> 0);
    const pasture = [];
    for (let y = 5; y < map.h - 5; y++) {
      for (let x = 5; x < map.w - 5; x++) {
        const f = map.floorAt(x, y);
        if ((f !== 'grass' && f !== 'tallgrass') || map.objectAt(x, y)) continue;
        if (Math.hypot(x - spawn.x, y - spawn.y) < 18) continue;          // not on top of you at landfall
        if (Math.hypot(x - fortress.core.x, y - fortress.core.y) < 20) continue; // not under the fortress guns
        pasture.push([x, y]);
      }
    }
    for (let i = pasture.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pasture[i], pasture[j]] = [pasture[j], pasture[i]]; }
    // A single clustered herd (real cattle graze together): seed on one tile, then
    // fill out around it so they read as one field of gold, not scattered strays.
    if (pasture.length) {
      const [hx, hy] = pasture[0];
      let placed = 0;
      for (let i = 0; i < pasture.length && placed < 7; i++) {
        const [x, y] = pasture[i];
        if (Math.hypot(x - hx, y - hy) > 9) continue;
        const cow = spawnSacredCattle(map, x, y, (IS ^ (0x5011 + placed * 97)) >>> 0);
        animals.push(cow);
        sacredHerd.push(cow);
        placed++;
      }
    }
  }

  const birds = spawnBirds(map, IS);

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

  const world = createWorld('helios', {
    map, spawn: arrival, robots, animals, birds, waterdroids, obelisks, obeliskObjs,
    obColor: OB_COLOR, obAlertColor: OB_ALERT,
    combat: true,
    prohibition: true, // THRINACIA: main.js watches the herd while you're ashore
  });
  world.fortress = fortress;
  world.wfactory = wfactory;
  world.mainframe = mainframe;
  world.torObjs = torObjs;
  world.ship = ship;
  world.sacredHerd = sacredHerd;              // the cattle of the Sun
  world.sacredCount = sacredHerd.length;      // the prohibition pass compares against this
  world.heliosWrath = false;                  // set once you slaughter one — the god turns the island
  return world;
}
