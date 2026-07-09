// Ruined temples — Odyssey set-dressing. The island was somewhere once; what's
// left are little sanctuaries half-swallowed by the grass: a scatter of broken
// marble column stumps and fallen entablature blocks, ringed by trees like an
// old sacred grove. We place a handful of clusters at worldgen.
//
// This owns placement only; tiles.js registers the 'column'/'marbleblock'
// objects and renderer.js (drawColumn / drawMarbleBlock) draws them. Runs after
// the coast is stamped so a grove never lands in the sea, and it keeps clear of
// spawn, water and anything already standing.

// A tile a column may stand on: in bounds, open grass/dirt at ground level,
// nothing already there.
function buildable(map, x, y) {
  if (x < 3 || y < 3 || x >= map.w - 3 || y >= map.h - 3) return false;
  const f = map.floorAt(x, y);
  if (f !== 'grass' && f !== 'tallgrass' && f !== 'dirt') return false;
  if (map.heightAt && map.heightAt(x, y) < 0) return false;
  return !map.objectAt(x, y);
}

// Scatter a few column groves across the map. Returns the placed grove centres.
export function placeRuins(map, rng, opts = {}) {
  const { clusters = 3, spawn = null, avoidSpawn = 16, minGap = 22 } = opts;
  const centres = [];
  let guard = 0;
  while (centres.length < clusters && guard++ < 500) {
    const cx = 3 + Math.floor(rng() * (map.w - 6));
    const cy = 3 + Math.floor(rng() * (map.h - 6));
    if (spawn && Math.hypot(cx - spawn.x, cy - spawn.y) < avoidSpawn) continue;
    if (centres.some((p) => Math.hypot(p.x - cx, p.y - cy) < minGap)) continue;
    if (!buildable(map, cx, cy)) continue;
    // A ruined temple: a loose grove of BROKEN column stumps and a few fallen
    // marble blocks (the full-height columns were cut — only the half-broken
    // ones read well), the whole thing ringed by trees the way an old sanctuary
    // sits in its sacred grove.
    const want = 3 + Math.floor(rng() * 4);
    let put = 0;
    for (let k = 0; k < want * 4 && put < want; k++) {
      const x = cx + Math.round((rng() - 0.5) * 5);
      const y = cy + Math.round((rng() - 0.5) * 5);
      if (!buildable(map, x, y)) continue;
      // Mostly broken stumps, with the odd fallen marble block among them.
      if (rng() < 0.34) map.addObject('marbleblock', x, y, { rot: Math.floor(rng() * 2) });
      else map.addObject('column', x, y, { variant: 1, rot: Math.floor(rng() * 2) });
      put++;
    }
    if (put < 2) continue;
    // Ring it with trees — a loose ellipse a few tiles out, skipping anything
    // already taken by stone. Biased to the big leafy variants for a grove feel.
    const treeR = 3.4 + rng() * 1.3;
    const treeN = 8 + Math.floor(rng() * 5);
    for (let i = 0; i < treeN; i++) {
      const a = (i / treeN) * Math.PI * 2 + rng() * 0.5;
      const tx = Math.round(cx + Math.cos(a) * treeR);
      const ty = Math.round(cy + Math.sin(a) * treeR * 0.72); // squashed ring reads better in iso
      if (!buildable(map, tx, ty)) continue;
      const tv = rng() < 0.82 ? Math.floor(rng() * 3) : 3 + Math.floor(rng() * 2);
      map.addObject('tree', tx, ty, { variant: tv });
    }
    centres.push({ x: cx, y: cy });
  }
  return centres;
}
