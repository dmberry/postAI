// Ship parts for the greek-ship craft (Stage 1d). The three parts are FOUND,
// not crafted (decision with David, 2026-07-12): the SAIL washed up at a beached
// wreck on the shore, the OAR and ROPE left in fishermen's huts (building
// interiors, the 'boards' floor). All are `keep` ground items so they never rot.
// Deterministic from the island seed. Its own file with a one-line hook in the
// island builder, per the parallel-session file rules.

import { makeRng } from './rng.js';

export function placeShipParts(map, seed, spawn = null) {
  const rng = makeRng((seed ^ 0x5a11) >>> 0);
  const placed = [];
  const free = (x, y) => !(map.objectAt && map.objectAt(x, y));
  const far = (x, y) => !spawn || Math.hypot(x - spawn.x, y - spawn.y) > 18;
  const drop = (item, x, y) => {
    map.groundItems.push({ item, qty: 1, x: x + 0.5, y: y + 0.5, keep: true });
    placed.push({ item, x, y });
  };
  const pick = (list) => (list.length ? list[Math.floor(rng() * list.length)] : null);

  // One sweep: a beach/wreck list (land at the sea's edge) and a hut list
  // (building interiors, 'boards'), plus any free land as a last resort.
  const shore = [], huts = [], land = [];
  for (let y = 2; y < map.h - 2; y++) {
    for (let x = 2; x < map.w - 2; x++) {
      const f = map.floorAt(x, y);
      if (f === 'sea' || f === 'water' || f === 'stream') continue;
      if (!free(x, y)) continue;
      land.push([x, y]);
      if (f === 'boards') { huts.push([x, y]); continue; }
      let edge = false;
      for (let dy = -1; dy <= 1 && !edge; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (map.floorAt(x + dx, y + dy) === 'sea') { edge = true; break; }
        }
      }
      if (edge) shore.push([x, y]);
    }
  }

  // SAIL — a distant beached wreck (fall back to any shore, then any land).
  const sailAt = pick(shore.filter(([x, y]) => far(x, y))) || pick(shore) || pick(land);
  if (sailAt) drop('sail', sailAt[0], sailAt[1]);

  // OAR + ROPE — two different huts, as far apart as the huts allow (fall back
  // to any free land if the island somehow has too few interiors).
  const pool = (huts.length >= 2 ? huts : land).slice();
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  if (pool[0]) drop('oar', pool[0][0], pool[0][1]);
  if (pool.length > 1) {
    const [ox, oy] = pool[0];
    const ropeAt = pool.slice(1).find(([x, y]) => Math.hypot(x - ox, y - oy) > 24) || pool[1];
    drop('rope', ropeAt[0], ropeAt[1]);
  }
  return placed;
}
