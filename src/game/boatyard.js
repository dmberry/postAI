// A boat-builder's yard on the shore: a plank jetty running out over the sea and
// a ruined boat-house beside it, its loot boxes holding the three greek-ship
// parts (oar, rope, sail) plus salvage. This is where a shipwright's tackle
// belongs, so it replaces the scattered sail-at-wreck / oar-and-rope-in-huts
// placement (ships.js placeShipParts) with one findable coastal landmark.
//
// Deterministic from the island seed; its own module with a one-line hook in the
// island builder (per the parallel-session file rules). Returns true if the yard
// placed (its boxes hold the parts) or false if no shore site was found — the
// caller falls back to the scatter so the parts can never be unobtainable.

import { makeRng } from './rng.js';

export function placeBoatYard(map, seed, spawn = null) {
  const rng = makeRng((seed ^ 0x0badf00d) >>> 0);
  const W = map.w, H = map.h;
  const floorAt = (x, y) => (map.inBounds(x, y) ? map.floorAt(x, y) : null);
  const free = (x, y) => map.inBounds(x, y) && !map.objectAt(x, y);
  const land = (x, y) => { const f = floorAt(x, y); return f === 'grass' || f === 'tallgrass' || f === 'sand'; };
  const CARD = [[0, -1], [0, 1], [-1, 0], [1, 0]]; // N S W E

  // Candidate beach tiles: sand with open sea on one cardinal side and buildable
  // land on the opposite side, away from spawn and clear of the southern fortress
  // annex (keep the yard in the ordinary overworld).
  const maxY = Math.min(H - 4, 122);
  const cands = [];
  for (let y = 4; y < maxY; y++) {
    for (let x = 4; x < W - 4; x++) {
      if (floorAt(x, y) !== 'sand') continue;
      if (spawn && Math.hypot(x - spawn.x, y - spawn.y) < 22) continue;
      for (const [dx, dy] of CARD) {
        if (floorAt(x + dx, y + dy) !== 'sea') continue;       // seaward
        if (!land(x - dx, y - dy)) continue;                    // landward buildable
        cands.push({ x, y, dx, dy });
        break;
      }
    }
  }
  if (!cands.length) return false;

  const HD = 4;        // house depth, landward
  const HALF = 2;      // house half-width (5 wide)
  const WIDTH = HALF * 2 + 1;

  for (let attempt = 0; attempt < 60 && cands.length; attempt++) {
    const site = cands.splice(Math.floor(rng() * cands.length), 1)[0];
    const { x: bx, y: by, dx, dy } = site;
    const perp = [-dy, dx]; // across the seaward axis

    // The house footprint: HD deep (starting 2 tiles landward of the beach) by
    // WIDTH across. rows[di][wi] = [tx, ty]; di 0 = seaward edge (jetty side).
    const rows = [];
    let ok = true;
    for (let di = 0; di < HD && ok; di++) {
      const row = [];
      for (let wi = 0; wi < WIDTH; wi++) {
        const tx = bx - dx * (2 + di) + perp[0] * (wi - HALF);
        const ty = by - dy * (2 + di) + perp[1] * (wi - HALF);
        if (!land(tx, ty) || !free(tx, ty)) { ok = false; break; }
        row.push([tx, ty]);
      }
      rows.push(row);
    }
    if (!ok) continue;

    // ---- stamp the house: boards floor, decayed perimeter walls (a doorway on
    // the seaward edge facing the jetty, plus random ruined gaps), boxes inside.
    for (const row of rows) for (const [tx, ty] of row) map.setFloor(tx, ty, 'boards');
    const isPerimeter = (di, wi) => di === 0 || di === HD - 1 || wi === 0 || wi === WIDTH - 1;
    const isDoor = (di, wi) => di === 0 && wi === HALF; // centre of the jetty-facing edge
    for (let di = 0; di < HD; di++) {
      for (let wi = 0; wi < WIDTH; wi++) {
        if (!isPerimeter(di, wi) || isDoor(di, wi)) continue;
        if (rng() < 0.28) continue;                 // ruined: a fallen-in gap
        const [tx, ty] = rows[di][wi];
        const decay = 3 + Math.floor(rng() * 3);    // 3..5: weathered to crumbling
        map.addObject('wall', tx, ty, { decay, material: 'stone' });
      }
    }

    // Loot: the three parts split across three boxes, each with sea salvage.
    const boxLoot = [
      [{ item: 'sail', qty: 1 }, { item: 'tin', qty: 2 }],
      [{ item: 'oar', qty: 1 }, { item: 'torch', qty: 2 }, { item: 'wood', qty: 3 }],
      [{ item: 'rope', qty: 1 }, { item: 'tin', qty: 1 }, { item: 'tape_1', qty: 1 }],
    ];
    const interior = [];
    for (let di = 1; di < HD - 1; di++) for (let wi = 1; wi < WIDTH - 1; wi++) interior.push(rows[di][wi]);
    for (let i = interior.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [interior[i], interior[j]] = [interior[j], interior[i]]; }
    for (let b = 0; b < boxLoot.length && b < interior.length; b++) {
      const [tx, ty] = interior[b];
      map.addObject('box', tx, ty, { loot: boxLoot[b], opened: false });
    }

    // ---- the jetty: planks from the beach tile out over the sea (stop at the
    // map edge or where the sea runs out). The root tile (the beach) planks too.
    map.setFloor(bx, by, 'boards');
    for (let s = 1; s <= 6; s++) {
      const jx = bx + dx * s, jy = by + dy * s;
      if (floorAt(jx, jy) !== 'sea' || !free(jx, jy)) break;
      map.setFloor(jx, jy, 'boards');
    }
    return true;
  }
  return false;
}
