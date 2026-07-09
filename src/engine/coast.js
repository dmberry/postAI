// The island's coast. The world is an island (CALYPSO's), so instead of grass
// running to a hard map edge we stamp a shore into the border tiles at startup:
// an outer band of swimmable water (~4 tiles, so you can wade and swim out to
// the edge), a sand beach inside that, and an irregular, dithered line between
// beach, sea and grass so the coast never reads as a straight ruler-edge.
//
// This works on the real floor grid, so collision (isSolid), swimming
// (floorAt === 'water'), floors and the minimap all follow with no special
// cases. Runs AFTER worldgen + the fortress + obelisks/relays are placed, so it
// can leave those — and the fortress — standing rather than drowning them.

const WATER_BAND = 4;   // tiles of swimmable water at the very edge
const BEACH_BAND = 2;   // tiles of sand inside the water

// Structures the sea must never swallow (win-condition towers, the factory, the
// whole fortress). A tile carrying one of these stays land.
const KEEP_OBJ = new Set(['obelisk', 'tor', 'wfactory', 'fortwall', 'fortdoor', 'gateterm', 'mainframe', 'uplink']);
// Floors that belong to built things (fortress decks, house boards, bridges) —
// never flood these either.
const KEEP_FLOOR = new Set(['panel', 'quad', 'sanctum', 'boards', 'bridge']);

// Deterministic per-tile hash in [0,1).
function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) ^ 0x9e3779b9;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Stamp the coast into `map` in place. `spawn` (if given) is kept dry.
export function stampCoast(map, spawn = null) {
  const W = map.w, H = map.h;
  // Any 8-neighbour (or the tile itself) is river water — used to keep the
  // river mouth open (the river is 'water', the sea is 'sea').
  const riverAdj = (x, y) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (map.floorAt(x + dx, y + dy) === 'water') return true;
    }
    return false;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.min(x, y, W - 1 - x, H - 1 - y); // distance to nearest edge (0 = edge)
      if (d > WATER_BAND + BEACH_BAND + 3) continue;  // interior: leave alone (cheap early-out)
      if (spawn && Math.hypot(x - spawn.x, y - spawn.y) < 4) continue; // never drown the start
      // Perturb the edge distance with a smooth wave (irregular coastline) plus
      // a small per-tile jitter (stippled dither right at each band boundary).
      const wave = 1.7 * Math.sin(x * 0.19 + y * 0.11) * Math.cos(y * 0.16 - x * 0.08)
                 + 0.8 * Math.sin(x * 0.07 - y * 0.05);
      const dp = d + wave + (hash(x, y) - 0.5) * 1.9;
      let target = null;
      if (dp < WATER_BAND) target = 'sea';
      else if (dp < WATER_BAND + BEACH_BAND) target = 'sand';
      if (!target) continue;
      const f = map.floorAt(x, y);
      if (KEEP_FLOOR.has(f)) continue;
      const obj = map.objectAt(x, y);
      if (obj && KEEP_OBJ.has(obj.type)) continue; // keep towers/factory/fortress
      // Never plug the river mouth with a beach: where the sea reaches the
      // river, keep it open water (sea) so the river flows straight out, and
      // never turn the river itself to sand.
      if (target === 'sand' && (f === 'water' || riverAdj(x, y))) target = 'sea';
      if (obj) map.removeObject(obj);              // clear scenery (trees, rocks…)
      map.setFloor(x, y, target);
    }
  }
  // Dither the river into the sea at the mouth: a few passes converting river
  // 'water' tiles that touch the sea into sea (hash-gated, weakening inward), so
  // the two blend over several tiles instead of meeting on a hard line — and
  // clearing any sand still caught between river and sea.
  const seaAdj = (x, y) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (map.floorAt(x + dx, y + dy) === 'sea') return true;
    }
    return false;
  };
  // Extend the sea into the river mouth over several tiles, stippled and
  // weakening inward, and clear any sand caught between the two.
  for (let pass = 0; pass < 5; pass++) {
    const toSea = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const f = map.floorAt(x, y);
        if (f !== 'water' && f !== 'sand') continue;
        if (!seaAdj(x, y)) continue;
        if (f === 'sand' && riverAdj(x, y)) { toSea.push([x, y]); continue; } // sand caught at the mouth
        if (f === 'water' && hash(x * 2 + pass * 7, y * 2 - pass * 5) < 0.72 - pass * 0.11) toSea.push([x, y]);
      }
    }
    if (!toSea.length) break;
    for (const [x, y] of toSea) map.setFloor(x, y, 'sea');
  }
  // Then poke a scatter of river fingers back the other way — sea tiles right
  // at the river's edge that flip to river water — so the two interlock in a
  // stippled band rather than meeting on a clean line.
  const toRiver = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (map.floorAt(x, y) !== 'sea') continue;
      if (!riverAdj(x, y)) continue;
      if (hash(x * 5 + 1, y * 5 + 3) < 0.4) toRiver.push([x, y]);
    }
  }
  for (const [x, y] of toRiver) map.setFloor(x, y, 'water');
  // The sea is always flat. Coast conversion runs after the terrain height
  // pass, so an edge hill can end up flagged 'sea' while keeping its elevation.
  // Renderer.drawSeaTile draws the tile top flat at height 0, but the generic
  // floor path still draws hillside skirts for any elevated tile BEFORE the sea
  // branch returns — so an un-zeroed sea tile leaks dark, sea-coloured faces
  // that float as triangles over the water. Zero every sea tile's height so the
  // ocean can never stack or cast a skirt.
  if (map.setHeight && map.heightAt) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (map.floorAt(x, y) === 'sea' && map.heightAt(x, y) !== 0) map.setHeight(x, y, 0);
      }
    }
  }
}
