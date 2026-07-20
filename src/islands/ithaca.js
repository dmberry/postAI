// ITHACA — home (islands-plan §6). The first REAL island that is not CALYPSO: a
// machine-free wilderness reached by sailing off Ogygia, with Argos the loyal dog
// waiting on the shore. No obelisks, no W-factory, no fortress, no hunter robots —
// the peace on the far side of the war. Reaching it after the four AIs fall is the
// true homecoming (the ending, wired in main.js's onEnter); before that it is a
// landfall, not yet home.
//
// Built from the same worldgen base as CALYPSO (buildWorld) with the machine layer
// simply left off, so it is a full, explorable island rather than a hand-drawn
// stub. It lives in the slim off-overworld update loop, so it ticks its own
// wildlife through the World's update() hook (updateAnimals/updateBirds).

import { buildWorld } from '../game/worldgen.js';
import { spawnBirds, updateBirds } from '../game/birds.js';
import { spawnTameDog, updateAnimals } from '../game/animals.js';
import { stampCoast } from '../engine/coast.js';
import { placeRuins } from '../game/ruins.js';
import { makeRng } from '../game/rng.js';
import { applyIslandPalette, islandTerrain } from '../game/palettes.js';
import { createWorld } from '../game/world.js';

// A beach tile (sand with open sea on one cardinal side, buildable land on the
// other), returned with its seaward direction — where the ship beaches.
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

// Argos on a free land tile near the arrival shore (a short walk up from the water).
function placeArgos(map, ax, ay, seed) {
  for (let r = 1; r <= 7; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = ax + dx, y = ay + dy;
        const f = map.floorAt(x, y);
        if ((f === 'grass' || f === 'tallgrass' || f === 'sand') && !map.isSolid(x, y) && !map.objectAt(x, y)) {
          return spawnTameDog(map, x, y, (seed ^ 0xa2905) >>> 0);
        }
      }
    }
  }
  return null;
}

export function createIthaca(seed) {
  // A distinct seed so Ithaca is its own island, not CALYPSO's twin terrain.
  const IS = (seed ^ 0x17aca) >>> 0;
  const { map, spawn } = buildWorld(IS, islandTerrain('ithaca'));

  // Light survival loot so an underpowered arrival can cope (islands-plan #4):
  // torches + tinned food in the buildings, berries in the meadows, one pack.
  // No weapon caches — Ithaca is safe, there is nothing here to fight.
  {
    const rng = makeRng((IS ^ 0x5eed) >>> 0);
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
    for (let i = 0; i < 12; i++) drop(grass, 'berries', 2 + Math.floor(rng() * 2));
    drop(boards, 'backpack', 1);
  }

  const birds = spawnBirds(map, IS);
  const animals = [];

  // Ring the island in sea (after the loot, so nothing lands in the water), then
  // a couple of ruined groves for cover/healing.
  stampCoast(map, spawn);
  map.temples = placeRuins(map, makeRng((IS ^ 0x2c01dd) >>> 0), { spawn, clusters: 2 });

  // The greek ship you crossed in, beached on the shore; board it to sail back.
  // Arrival is at the water's edge beside it, not at buildWorld's inland spawn.
  const beach = findBeach(map, makeRng((IS ^ 0xb0a7) >>> 0));
  let arrival = { x: spawn.x + 0.5, y: spawn.y + 0.5 };
  let ship = null;
  if (beach) {
    if (map.objectAt(beach.x, beach.y)) map.removeObject(map.objectAt(beach.x, beach.y));
    ship = map.addObject('greek_ship', beach.x, beach.y, { hull: 100, maxHull: 100, seaworthy: true });
    arrival = { x: beach.x - beach.dx + 0.5, y: beach.y - beach.dy + 0.5 }; // one tile inland of the hull
  }

  // Argos waits near where you land.
  const argos = placeArgos(map, Math.floor(arrival.x), Math.floor(arrival.y), IS);
  if (argos) animals.push(argos);

  // Defensive fields so the island is a fully-formed, self-contained map.
  map.projectiles = [];
  map.bombs = [];
  map.explosions = [];
  map.explored = new Uint8Array(map.w * map.h).fill(1);
  map.newlyRevealed = [];

  applyIslandPalette(map, 'ithaca'); // per-island ground + foliage colour (B2)
  const world = createWorld('ithaca', {
    map,
    spawn: arrival,
    animals,
    birds,
    ambience: { minimap: false, musicBed: 'synth' },
    update(dt, player) {
      updateAnimals(dt, animals, player, map);
      updateBirds(dt, birds, animals, player, map);
    },
  });
  world.ship = ship;
  world.argos = argos;
  return world;
}
