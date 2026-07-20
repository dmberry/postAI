import { GameMap } from './map.js';
import { makeRng } from './rng.js';

// Phase 2 world generator: a 128x128 seeded overworld with a meandering
// river, two bridged road crossings, a ruined main town east of the river,
// a smaller hamlet west of it, forests, and tall-grass meadows. Everything
// is deterministic from the run seed via makeRng.

const MAP_W = 128;
const MAP_H = 128;

// Road layout constants. The river runs roughly north-south around x = 40,
// so the two east-west roads cross it and carry the bridges.
const MAIN_ROAD_Y = 64;   // east-west main road (rows 64-65)
const SPUR_ROAD_Y = 28;   // east-west spur to the hamlet (rows 28-29)
const EAST_ROAD_X = 84;   // north-south road through the main town (cols 84-85)
const WEST_ROAD_X = 14;   // north-south lane through the hamlet (cols 14-15)

// Per-island terrain character (B1). `buildWorld(seed)` used to take nothing but
// a seed, so every island was the SAME map with a different RNG stream — same
// river at x=40, same road grid, same thirteen building lots, same hills. These
// knobs let an island file say what kind of place it is; omitting cfg entirely
// reproduces the original Ogygia layout exactly, so nothing regresses.
//
//   river     null for a riverless island, else { cx, amp, freq, halfMin, halfMax }
//   roads     'grid' (the original four runs) | 'coastal' | 'spur' | 'none'
//   lots      how many of the building lots to use (0 = wilderness), and a shuffle
//   hills     { count, peak }   — how mountainous
//   hollows   { count }         — pits and dells
//   forests   { density }       — scales every forest region's tree count
//   meadows   { count }
//   flowers   { density }   — wildflower banks; Ithaca runs generous
//   wrecks    { count }  — abandoned cars. DEFAULTS TO 0: the wrecks are off the
//             islands for now, but scatterWrecks and everything downstream (the
//             car sprites, smashCar's salvage, the right-click inspection) is
//             kept whole, so a better vehicle can be dropped in later by setting
//             a count. Do not delete the generator.
//   mountain  one great peak: { x, y, peak } — much taller than the ordinary
//             hills (which cap at 8), rock above the tree line, snow at the top
//   feature   a signature landform: 'sandpit' | 'marsh' | 'burn' | 'olives'
//   lotus     false on every island but Ogygia (it was generated on ALL of them,
//             at the identical spot — her signature grove was everywhere)
const TERRAIN_DEFAULTS = {
  river: { cx: 40, amp: 9, freq: 0.045, halfMin: 1.0, halfMax: 2.0 },
  roads: 'grid',
  lots: null,          // null = every lot, in the original order
  hills: { count: null, peak: 1 },
  hollows: { count: null },
  forests: { density: 1 },
  meadows: { count: null },
  flowers: { density: 1 },
  wrecks: { count: 0 },   // no cars on any island for now — see the note above
  mountain: null,
  feature: null,
  lotus: false,
};

// Build the whole world for a seed. Returns the map and a spawn point on
// the main road at the eastern edge of the town (continuous world coords).
export function buildWorld(seed, cfg = {}) {
  const t = {
    ...TERRAIN_DEFAULTS,
    ...cfg,
    hills: { ...TERRAIN_DEFAULTS.hills, ...(cfg.hills || {}) },
    hollows: { ...TERRAIN_DEFAULTS.hollows, ...(cfg.hollows || {}) },
    forests: { ...TERRAIN_DEFAULTS.forests, ...(cfg.forests || {}) },
    meadows: { ...TERRAIN_DEFAULTS.meadows, ...(cfg.meadows || {}) },
    flowers: { ...TERRAIN_DEFAULTS.flowers, ...(cfg.flowers || {}) },
    wrecks: { ...TERRAIN_DEFAULTS.wrecks, ...(cfg.wrecks || {}) },
    // `river: null` must survive the spread as a genuine null, not be re-defaulted.
    river: 'river' in cfg ? cfg.river : TERRAIN_DEFAULTS.river,
  };
  const map = new GameMap(MAP_W, MAP_H, 'grass');
  const rng = makeRng(seed);

  if (t.river) carveRiver(map, rng, t.river);
  layRoads(map, t.roads);

  // Buildings, tracking a small margin around each so scatter and meadows
  // never blockade a doorway or fill a yard.
  const keepClear = [];
  for (const lot of buildingLots(t.lots, rng)) {
    placeBuilding(map, rng, lot);
    keepClear.push({
      x0: lot.x0 - 2, y0: lot.y0 - 2,
      x1: lot.x0 + lot.w + 1, y1: lot.y0 + lot.h + 1,
    });
  }

  // Elevation and streams. Hills are raised as raw blob fields first, then
  // streams are carved from the hill feet down to the river, and finally the
  // height field is zeroed on all locked ground and relaxed so no two
  // adjacent tiles ever differ by more than one step.
  const hills = raiseHills(map, rng, t.hills);
  if (t.mountain) raiseMountain(map, rng, t.mountain, keepClear);
  if (t.river) carveStreams(map, rng, hills);
  finalizeHeights(map, keepClear);
  carveHollows(map, rng, keepClear, t.hollows);
  // Ground the inland water. A river or a hillside stream must lie IN the land,
  // never perched above it with a wall of water dropping to lower ground (which
  // is what a stream carved down a slope, or a hollow dug beside a river, would
  // otherwise leave). Runs after every height pass, before the floor-only
  // scatter, so trees and loot place on the corrected relief.
  groundWater(map, keepClear);
  // The mountain's rock/snow lines are painted AFTER the heights are final (the
  // Chebyshev clamp shaped the cone) and BEFORE the forests, so trees only land
  // on the grassy lower slopes and never on bare rock.
  if (t.mountain) dressMountain(map, rng, t.mountain);

  plantForests(map, rng, keepClear, t.forests);
  layMeadows(map, rng, keepClear, t.meadows);
  if (t.lotus) plantLotusGrove(map, rng, keepClear);
  scatterFlowers(map, rng, keepClear, t.flowers);
  scatterLoners(map, rng, keepClear);
  scatterWrecks(map, rng, t.wrecks);
  // The island's one unmistakable landform, stamped over the general terrain so
  // it overrides whatever was scattered there (B3).
  stampFeature(map, rng, t.feature, keepClear);
  paintGraffiti(map, rng);

  const spawn = { x: 112.5, y: MAIN_ROAD_Y + 0.5 };
  return { map, spawn };
}

// River: a gently meandering north-south channel of solid water, 3-5 tiles
// wide, with a sand rim along both banks.
// cfg: { cx, amp, freq, halfMin, halfMax, axis }. `axis: 'ew'` transposes the
// whole channel so the river runs east-west instead of north-south — the single
// biggest change to how an island reads, since everything else (bridges, banks,
// where the town sits relative to the water) follows the water.
function carveRiver(map, rng, cfg = {}) {
  const { cx: CX = 40, amp = 9, freq = 0.045, halfMin = 1.0, halfMax = 2.0, axis = 'ns' } = cfg;
  const ew = axis === 'ew';
  const along = ew ? map.w : map.h;   // the axis the river runs down
  const across = ew ? map.h : map.w;  // the axis it meanders across
  const phase = rng() * Math.PI * 2;
  let cx = CX + (rng() - 0.5) * 6;
  let half = halfMax;
  const lo = Math.max(3, CX - amp - 2), hi = Math.min(across - 4, CX + amp + 2);
  for (let i = 0; i < along; i++) {
    const target = CX + amp * Math.sin(i * freq + phase);
    cx += (target - cx) * 0.15 + (rng() - 0.5) * 0.9;
    cx = Math.max(lo, Math.min(hi, cx));
    half += (rng() - 0.5) * 0.3;
    half = Math.max(halfMin, Math.min(halfMax, half));
    const width = Math.round(half * 2 + 1);
    const c0 = Math.round(cx - width / 2);
    for (let c = c0; c < c0 + width; c++) {
      if (ew) map.setFloor(i, c, 'water');   // i = x, c = y
      else map.setFloor(c, i, 'water');      // c = x, i = y
    }
  }
  // Sand rim: any grass tile touching water (8-neighbour) becomes bank.
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      if (map.floorAt(x, y) !== 'grass') continue;
      let bank = false;
      for (let dy = -1; dy <= 1 && !bank; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (map.floorAt(x + dx, y + dy) === 'water') { bank = true; break; }
        }
      }
      if (bank) map.setFloor(x, y, 'sand');
    }
  }
}

// Roads, two tiles wide. Wherever a road meets the river it becomes a
// wooden bridge, so both east-west crossings are laid automatically and the
// road surface runs straight onto each bridge end.
// `layout` picks the settlement's road pattern — the strongest single cue that
// two islands are different places, since the roads are what the buildings and
// the wrecks hang off.
//   'grid'    the original: main east-west, north-south through town, hamlet spur
//   'spur'    just the main road and a short stub: a thinner, lonelier settlement
//   'coastal' one long road hugging the south, with two short inland fingers
//   'none'    no roads at all — wilderness (and so no car wrecks, which need tarmac)
function layRoads(map, layout = 'grid') {
  if (layout === 'none') return;
  const pave = (x, y) => {
    const f = map.floorAt(x, y);
    if (f === 'water') map.setFloor(x, y, 'bridge');
    else if (f !== null) map.setFloor(x, y, 'road');
  };
  const runX = (y, x0 = 0, x1 = map.w - 1) => { for (let x = x0; x <= x1; x++) { pave(x, y); pave(x, y + 1); } };
  const runY = (x, y0 = 0, y1 = map.h - 1) => { for (let y = y0; y <= y1; y++) { pave(x, y); pave(x + 1, y); } };
  if (layout === 'coastal') {
    runX(map.h - 22);                       // the shore road
    runY(EAST_ROAD_X, map.h - 46, map.h - 21);
    runY(WEST_ROAD_X + 10, map.h - 40, map.h - 21);
    return;
  }
  if (layout === 'spur') {
    runX(MAIN_ROAD_Y);
    runY(EAST_ROAD_X, MAIN_ROAD_Y - 18, MAIN_ROAD_Y + 1);
    return;
  }
  runX(MAIN_ROAD_Y);
  runY(EAST_ROAD_X);
  runX(SPUR_ROAD_Y, WEST_ROAD_X, EAST_ROAD_X + 1);
  runY(WEST_ROAD_X, SPUR_ROAD_Y, MAIN_ROAD_Y + 1);
}

// Building lots: position, size, which side the door faces (towards the
// nearest road), and a base ruin level. The main town (east of the river)
// has ten buildings from cottage to warehouse, a couple near-intact and
// most damaged; the hamlet (west) has three, more ruined.
// `n` caps how many lots are used (null = all thirteen, the original town).
// Fewer lots reads as a sparser, wilder island; the subset is shuffled so it
// isn't always the same buildings that survive. NOTE for island authors: several
// islands mine `boards` (building interior) tiles for loot and caches, so an
// island with very few lots has correspondingly few indoor drops — keep n high
// enough to hold whatever that island seeds indoors.
function buildingLots(n = null, rng = null) {
  const lots = [
    // Main town, around the crossroads at (84, 64).
    { x0: 66, y0: 54, w: 12, h: 8, door: 'S', ruin: 0.45 }, // warehouse
    { x0: 90, y0: 56, w: 7,  h: 6, door: 'S', ruin: 0.08 }, // near-intact
    { x0: 68, y0: 68, w: 8,  h: 6, door: 'N', ruin: 0.35 },
    { x0: 90, y0: 68, w: 6,  h: 5, door: 'N', ruin: 0.50 },
    { x0: 74, y0: 44, w: 8,  h: 6, door: 'E', ruin: 0.30 },
    { x0: 76, y0: 74, w: 6,  h: 5, door: 'E', ruin: 0.55 },
    { x0: 88, y0: 44, w: 7,  h: 6, door: 'W', ruin: 0.05 }, // near-intact
    { x0: 88, y0: 74, w: 5,  h: 4, door: 'W', ruin: 0.40 }, // cottage
    { x0: 102, y0: 56, w: 9, h: 6, door: 'S', ruin: 0.30 },
    { x0: 102, y0: 68, w: 6, h: 5, door: 'N', ruin: 0.50 },
    // Hamlet, along the western lane.
    { x0: 6,  y0: 36, w: 6,  h: 5, door: 'E', ruin: 0.55 },
    { x0: 18, y0: 44, w: 5,  h: 4, door: 'W', ruin: 0.65 },
    { x0: 6,  y0: 52, w: 7,  h: 5, door: 'E', ruin: 0.60 },
  ];
  if (n == null || n >= lots.length) return lots;
  if (n <= 0) return [];
  if (!rng) return lots.slice(0, n);
  const pick = lots.slice();
  for (let i = pick.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pick[i], pick[j]] = [pick[j], pick[i]]; }
  return pick.slice(0, n);
}

// One building: boards interior, a wall perimeter with a door gap of 1-2
// tiles (facing the road) and window gaps, collapsed wall runs replaced by
// rubble according to the ruin level, a missing corner on heavily broken
// buildings, and a worn dirt patch outside the door.
function placeBuilding(map, rng, lot) {
  const { x0, y0, w, h, door } = lot;
  const x1 = x0 + w - 1, y1 = y0 + h - 1;
  const ruin = lot.ruin + rng() * 0.08;
  const material = rng() < 0.4 ? 'brick' : 'stone'; // some houses are red brick
  const key = (x, y) => x + ',' + y;

  // Interior floorboards (perimeter cells stay on grass under the walls).
  for (let y = y0 + 1; y <= y1 - 1; y++) {
    for (let x = x0 + 1; x <= x1 - 1; x++) map.setFloor(x, y, 'boards');
  }

  // Ordered perimeter walk, clockwise from the north-west corner, so that
  // collapsed sections come out as contiguous runs rather than pepper.
  const cells = [];
  for (let x = x0; x <= x1; x++) cells.push({ x, y: y0, side: 'N' });
  for (let y = y0 + 1; y <= y1; y++) cells.push({ x: x1, y, side: 'E' });
  for (let x = x1 - 1; x >= x0; x--) cells.push({ x, y: y1, side: 'S' });
  for (let y = y1 - 1; y >= y0 + 1; y--) cells.push({ x: x0, y, side: 'W' });
  const isCorner = (c) => (c.x === x0 || c.x === x1) && (c.y === y0 || c.y === y1);

  // Door: 1-2 adjacent cells centred on the road-facing side.
  const doorCells = new Set();
  const doorSide = cells.filter((c) => c.side === door && !isCorner(c));
  const dw = Math.min(1 + (rng() < 0.5 ? 1 : 0), doorSide.length);
  const start = Math.floor((doorSide.length - dw) / 2);
  for (let i = 0; i < dw; i++) {
    const c = doorSide[start + i];
    doorCells.add(key(c.x, c.y));
  }

  // Window gaps: up to one non-corner gap on each remaining side.
  const windowCells = new Set();
  for (const s of ['N', 'E', 'S', 'W']) {
    if (s === door || rng() >= 0.7) continue;
    const sc = cells.filter((c) => c.side === s && !isCorner(c) && !doorCells.has(key(c.x, c.y)));
    if (sc.length) {
      const c = sc[Math.floor(rng() * sc.length)];
      windowCells.add(key(c.x, c.y));
    }
  }

  // Heavily broken buildings lose a whole corner.
  let cnr = null, cnrR = 0;
  if (ruin >= 0.45) {
    const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    cnr = corners[Math.floor(rng() * corners.length)];
    cnrR = 1 + Math.floor(rng() * 2);
  }

  // Lay walls, with ruin-driven collapsed runs turning into rubble or gaps.
  let run = 0;
  for (const c of cells) {
    const k = key(c.x, c.y);
    if (doorCells.has(k)) { map.setFloor(c.x, c.y, 'dirt'); continue; } // worn threshold
    if (windowCells.has(k)) continue;
    const inCorner = cnr && Math.max(Math.abs(c.x - cnr[0]), Math.abs(c.y - cnr[1])) <= cnrR;
    if (inCorner || run > 0) {
      if (run > 0) run--;
      if (rng() < 0.35) map.addObject('rubble', c.x, c.y);
      continue;
    }
    if (rng() < ruin * 0.4) {
      run = 1 + Math.floor(rng() * 4);
      if (rng() < 0.4) map.addObject('rubble', c.x, c.y);
      continue;
    }
    // Decay level 0..5 (new/old/older/mossy/breaking/crumbling): more ruined
    // buildings weather harder, with per-wall spread so a single wall shows a
    // range of ages rather than one uniform state.
    const decay = Math.max(0, Math.min(5, Math.round(ruin * 6 + (rng() - 0.5) * 2.5)));
    map.addObject('wall', c.x, c.y, { decay, material });
  }

  // Worn dirt patch outside the door, reaching towards the road.
  const out = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[door];
  for (const k of doorCells) {
    const [dx, dy] = k.split(',').map(Number);
    for (let s = 1; s <= 2; s++) {
      const px = dx + out[0] * s, py = dy + out[1] * s;
      if (map.floorAt(px, py) === 'grass') map.setFloor(px, py, 'dirt');
    }
  }
}

// Hills: 4-6 smooth rises in the wilds, heights 1-3. Each hill is a main
// blob plus one or two offset sub-blobs (max-combined, then rounded), raised
// as a raw field here; finalizeHeights() later flattens locked ground and
// relaxes the field so no adjacent step ever exceeds one. The first three
// zones are always used (they seed the streams); the rest are optional.
// All zones sit well clear of roads, buildings, and the river channel.
function raiseHills(map, rng, cfg = {}) {
  const mandatory = [
    { x: 16, y: 13 },   // north-west, in the hamlet-side forest
    { x: 66, y: 13 },   // north-east, between river and town road
    { x: 14, y: 86 },   // south-west wilds
  ];
  const optional = [
    { x: 110, y: 14 },  // far north-east corner
    { x: 10, y: 118 },  // south-west corner
    { x: 108, y: 102 }, // south-east forest
    { x: 66, y: 92 },   // south mid, east of the river
    { x: 30, y: 30 },   // open country between the hamlet and the river
    { x: 100, y: 60 },  // wilds east of the main town
  ];
  for (let i = optional.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [optional[i], optional[j]] = [optional[j], optional[i]];
  }
  // cfg.count = total hills wanted (the three mandatory ones always stand, since
  // carveStreams destructures them); cfg.peak scales how high they rise.
  const want = cfg.count == null ? mandatory.length + 3 + Math.floor(rng() * 3) : cfg.count;
  const extra = Math.max(0, Math.min(optional.length, want - mandatory.length));
  const chosen = [...mandatory, ...optional.slice(0, extra)];

  const hills = [];
  for (const z of chosen) {
    const cx = z.x + Math.round((rng() - 0.5) * 2);
    const cy = z.y + Math.round((rng() - 0.5) * 2);
    // Much taller, more dramatic hills: peaks up to 8 now. Radius scales
    // with peak so the Lipschitz clamp (max one height step per tile) still
    // leaves a climbable slope rather than an unclimbable cliff.
    const peak = rng() < 0.3 ? 8 : rng() < 0.55 ? 6 : rng() < 0.8 ? 4 : 3;
    const r = peak * 1.4 + rng() * 3;
    const blobs = [{ x: cx, y: cy, p: peak, r }];
    const nSub = 1 + (rng() < 0.5 ? 1 : 0);
    for (let i = 0; i < nSub; i++) {
      blobs.push({
        x: cx + Math.round((rng() - 0.5) * 5),
        y: cy + Math.round((rng() - 0.5) * 5),
        p: Math.max(2, peak - 2),
        r: r * 0.55,
      });
    }
    for (const b of blobs) {
      const R = Math.ceil(b.r);
      for (let y = b.y - R; y <= b.y + R; y++) {
        for (let x = b.x - R; x <= b.x + R; x++) {
          if (!map.inBounds(x, y)) continue;
          const v = Math.round(b.p * (1 - Math.hypot(x - b.x, y - b.y) / b.r));
          if (v > map.heightAt(x, y)) map.setHeight(x, y, Math.min(8, v));
        }
      }
    }
    hills.push({ cx, cy, r, peak });
  }
  return hills;
}

// One GREAT mountain — much taller than the ordinary hills (which cap at 8).
// A single cone stamped with its own high peak and a radius wide enough that
// finalizeHeights' one-step clamp leaves a steep but climbable spiral of banks
// rather than a sheer cliff. A couple of shoulder-blobs break the perfect cone
// so it reads as a mountain, not a wizard's hat. Placed near the interior, clear
// of the town, so it dominates the skyline of its island.
function raiseMountain(map, rng, cfg, keepClear) {
  const peak = cfg.peak || 14;
  const cx = cfg.x, cy = cfg.y;
  // Radius must cover the whole descent (one step per tile) plus slack, or the
  // clamp would shave the summit down to fit the ground it can reach.
  const r = peak + 4 + Math.floor(rng() * 3);
  const blobs = [{ x: cx, y: cy, p: peak, r }];
  // Two lower shoulders, offset, so the massif is lopsided and natural.
  for (let i = 0; i < 2; i++) {
    blobs.push({
      x: cx + Math.round((rng() - 0.5) * peak),
      y: cy + Math.round((rng() - 0.5) * peak),
      p: Math.round(peak * (0.5 + rng() * 0.2)),
      r: r * 0.6,
    });
  }
  for (const b of blobs) {
    const R = Math.ceil(b.r);
    for (let y = b.y - R; y <= b.y + R; y++) {
      for (let x = b.x - R; x <= b.x + R; x++) {
        if (!map.inBounds(x, y)) continue;
        const d = Math.hypot(x - b.x, y - b.y);
        // LINEAR descent (peak/radius per tile, kept under 1 by the radius slack
        // above) so finalizeHeights' one-step clamp never has to shave the flanks
        // — which, propagating inward, would lower the summit. Small per-tile
        // jitter roughens the otherwise perfect cone.
        const v = Math.round(b.p * (1 - d / b.r) + (rng() - 0.5) * 0.8);
        if (v > map.heightAt(x, y)) map.setHeight(x, y, v); // no 8-cap: this is THE mountain
      }
    }
  }
  map.mountain = { x: cx, y: cy, peak };
}

// Paint the mountain's zones once the heights are final: bare rock above the
// tree line, a snow-cap near the summit. Only converts open ground (so it never
// eats a road or a building that happens to sit on a shoulder), and marks the
// grass just below the tree line so plantForests can thin it into an alpine
// fringe (see the 'treeLine' hook there).
function dressMountain(map, rng, cfg) {
  const peak = cfg.peak || 14;
  // The white cap: a wider band than before (peak-4), painted PATCHY rather than
  // solid. Snow starts as a scatter of patches over the rock at the bottom of the
  // band and thickens with height, becoming a solid crown only at the very top —
  // so the summit fades into the mountain instead of wearing a hard white block.
  const snowLine = Math.max(6, peak - 4);
  const snowSolid = peak - 1;               // the top ~two levels are fully snow
  const stoneLine = Math.max(4, Math.round(peak * 0.5)); // bare rock: the upper half
  map.treeLine = stoneLine;                 // plantForests / scatterLoners read this
  // The cap concentrates on the summit: a solid core disc around the peak, patches
  // thinning outward. Keyed to distance from the centre AND height, so the snow
  // clusters at the top-middle rather than scattering evenly over every contour.
  const mx = map.mountain ? map.mountain.x : cfg.x;
  const my = map.mountain ? map.mountain.y : cfg.y;
  const capR = Math.max(4, Math.round((peak - snowLine) * 1.6)); // rough cap radius
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      const f = map.floorAt(x, y);
      if (f !== 'grass' && f !== 'tallgrass') continue;
      const h = map.heightAt(x, y);
      if (h >= snowLine) {
        // frac: 0 at the snow line, 1 at the peak. central: 1 at the summit, 0 at
        // the cap edge. A solid core (very top, or well inside the centre disc),
        // then a snow chance that falls off with both, so patches gather at the
        // middle and fray at the rim instead of dusting the whole cap evenly.
        const frac = (h - snowLine) / Math.max(1, snowSolid - snowLine);
        const central = Math.max(0, 1 - Math.hypot(x - mx, y - my) / capR);
        const w = Math.max(frac, central);
        const pSnow = 0.1 + 0.9 * w * w;
        const solid = h >= snowSolid || central > 0.5;
        map.setFloor(x, y, (solid || rng() < pSnow) ? 'snow' : 'stone');
      }
      else if (h >= stoneLine) map.setFloor(x, y, 'stone');
      // A ragged rock/grass border just under the stone line so the transition
      // isn't a clean contour ring.
      else if (h === stoneLine - 1 && rng() < 0.35) map.setFloor(x, y, 'stone');
      // A few stray snow patches just BELOW the cap, so its lower edge frays into
      // the rock rather than ending on a clean contour.
      if (map.floorAt(x, y) === 'stone' && h === snowLine - 1 && rng() < 0.18) map.setFloor(x, y, 'snow');
    }
  }
  // The alpine fringe: a scatter of small, spare conifers on the grass just
  // below the rock (a real tree line thins to stunted trees, not lush forest).
  // Planted here — before plantForests, which is told to skip this high band —
  // so the upper slopes read as mountain, not woodland climbing to the summit.
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      if (map.floorAt(x, y) !== 'grass' || map.objectAt(x, y)) continue;
      const h = map.heightAt(x, y);
      if (h < stoneLine - 3 || h >= stoneLine) continue;   // just the fringe band
      if (rng() < 0.22) map.addObject('tree', x, y, { variant: rng() < 0.6 ? 3 : 4 }); // small / bare-conifer
    }
  }
}

// Streams: 2-3 shallow, wadeable channels, 1-2 tiles wide, each rising at
// the foot of one of the mandatory hills and meandering into the river.
// Their corridors are chosen so they never meet a road, a building, or each
// other, so no road conversion is needed.
function carveStreams(map, rng, hills) {
  const [a, b, d] = hills; // mandatory hills: NW, NE, SW
  const n = 2 + (rng() < 0.6 ? 1 : 0);
  const specs = [
    { // rises east of the north-west hill, runs east into the river
      sx: Math.round(a.cx + a.r + 2),
      sy: Math.max(6, Math.min(20, a.cy + Math.round((rng() - 0.5) * 4))),
      startY: null, dir: 1, yMin: 4, yMax: 21,
    },
    { // rises east of the south-west hill, drops south then runs east
      sx: Math.round(d.cx + d.r + 2),
      sy: 104 + Math.floor(rng() * 8),
      startY: d.cy, dir: 1, yMin: 100, yMax: 118,
    },
    { // rises west of the north-east hill, runs west into the river
      sx: Math.round(b.cx - b.r - 2),
      sy: Math.max(6, Math.min(20, b.cy + Math.round((rng() - 0.5) * 4))),
      startY: null, dir: -1, yMin: 4, yMax: 21,
    },
  ];
  for (const s of specs.slice(0, n)) carveStream(map, rng, s);
}

// Walk one stream from its source to the river: one tile per step (so the
// run stays 4-connected), steering towards a sinusoidal meander target and
// stopping the moment the walker reaches open water. Only open ground and
// river bank is converted, so roads, bridges, and buildings are never cut.
function carveStream(map, rng, s) {
  const wide = rng() < 0.5; // some streams are two tiles wide
  const amp = 2 + rng() * 2;
  const freq = 0.14 + rng() * 0.12;
  const phase = rng() * Math.PI * 2;
  const carvable = (f) => f === 'grass' || f === 'tallgrass' || f === 'sand';
  let x = s.sx;
  let y = s.startY == null ? s.sy : s.startY;
  for (let guard = 0; guard < 600; guard++) {
    if (map.floorAt(x, y) === 'water') break;
    if (carvable(map.floorAt(x, y))) map.setFloor(x, y, 'stream');
    if (wide && carvable(map.floorAt(x, y + 1))) map.setFloor(x, y + 1, 'stream');
    const target = Math.round(s.sy + amp * Math.sin(x * freq + phase));
    const desired = Math.max(s.yMin, Math.min(s.yMax, target));
    if (y !== desired && rng() < 0.7) y += Math.sign(desired - y);
    else x += s.dir;
  }
}

// Flatten every locked tile to height 0 and relax the field so that no two
// adjacent tiles (8-neighbour) differ by more than one step. Locked ground:
// any floor that is not open grass/tallgrass (roads, bridges, boards, dirt
// thresholds, sand, water, streams), a 2-tile apron around every road and
// bridge tile, and the building keep-clear margins (lot + 2 tiles). The
// relaxation is an exact two-pass Chebyshev distance clamp, which can only
// lower tiles, so locked ground stays at 0 and hills gain 1-step banks.
function finalizeHeights(map, keepClear) {
  const w = map.w, h = map.h;
  const H = map.height;

  const nearRoad = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const f = map.floorAt(x, y);
      if (f !== 'road' && f !== 'bridge') continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (map.inBounds(x + dx, y + dy)) nearRoad[(y + dy) * w + x + dx] = 1;
        }
      }
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const f = map.floorAt(x, y);
      const open = f === 'grass' || f === 'tallgrass';
      if (!open || nearRoad[y * w + x] || inKeepClear(x, y, keepClear)) H[y * w + x] = 0;
    }
  }

  // Forward pass (map edge imposes no constraint).
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = H[y * w + x];
      if (x > 0) v = Math.min(v, H[y * w + x - 1] + 1);
      if (y > 0) {
        v = Math.min(v, H[(y - 1) * w + x] + 1);
        if (x > 0) v = Math.min(v, H[(y - 1) * w + x - 1] + 1);
        if (x < w - 1) v = Math.min(v, H[(y - 1) * w + x + 1] + 1);
      }
      H[y * w + x] = v;
    }
  }
  // Backward pass.
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      let v = H[y * w + x];
      if (x < w - 1) v = Math.min(v, H[y * w + x + 1] + 1);
      if (y < h - 1) {
        v = Math.min(v, H[(y + 1) * w + x] + 1);
        if (x < w - 1) v = Math.min(v, H[(y + 1) * w + x + 1] + 1);
        if (x > 0) v = Math.min(v, H[(y + 1) * w + x - 1] + 1);
      }
      H[y * w + x] = v;
    }
  }
}

// Ground the inland water so no river or stream tile is ever higher than the
// land beside it. Streams are carved down a hillside and keep the slope's
// height, and a hollow can be dug next to a river, either of which leaves water
// perched with a vertical face of water dropping to lower ground. Water lies in
// the land, not on it. Force every water/stream tile to 0, lift any bank a
// hollow dug below 0, then relax outward with a lowering-only clamp so the banks
// step down to meet the water at one level per tile (a river cuts its valley).
function groundWater(map) {
  const w = map.w, h = map.h;
  const isWater = (x, y) => { const f = map.floorAt(x, y); return f === 'water' || f === 'stream'; };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (isWater(x, y)) { if (map.heightAt(x, y) !== 0) map.setHeight(x, y, 0); }
    }
  }
  // No bank below the water it borders.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (isWater(x, y) || map.heightAt(x, y) >= 0) continue;
      let touches = false;
      for (let dy = -1; dy <= 1 && !touches; dy++) {
        for (let dx = -1; dx <= 1; dx++) if (isWater(x + dx, y + dy)) { touches = true; break; }
      }
      if (touches) map.setHeight(x, y, 0);
    }
  }
  // Lowering-only relax: any land tile more than one step above a neighbour is
  // stepped down. Water is pinned, so this cuts the valley toward the channel
  // without ever raising the water. A few passes settle the whole corridor.
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (isWater(x, y)) continue;
        const hh = map.heightAt(x, y);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (!map.inBounds(x + dx, y + dy)) continue;
          const nb = map.heightAt(x + dx, y + dy);
          if (hh - nb > 1) { map.setHeight(x, y, nb + 1); changed = true; break; }
        }
      }
    }
    if (!changed) break;
  }
}

// Hollows: sunken dips and valleys (heights -1 to -2) in the wilds, built
// exactly like hills but as a separate non-negative DEPTH field with its own
// Lipschitz clamp, then subtracted. Zones sit well away from every hill zone
// so the two fields never overlap (their difference would otherwise be able
// to step by two). Locked ground (roads, water, streams, buildings, aprons)
// stays at depth 0, so all valley floors and rims remain walkable.
function carveHollows(map, rng, keepClear, cfg = {}) {
  const w = map.w, h = map.h;
  const zones = [
    { x: 70, y: 38 },  // open country east of the river, north of the main road
    { x: 20, y: 52 },  // west bank wilds
    { x: 60, y: 112 }, // deep south, east of the river
    { x: 100, y: 122 },// south-east corner
    { x: 96, y: 60 },  // east of the main road crossing, clear of the town
  ];
  const n = cfg.count == null ? 3 + Math.floor(rng() * 3) : Math.max(0, Math.min(zones.length, cfg.count));
  const D = new Int8Array(w * h);

  for (const z of zones.slice(0, n)) {
    const cx = z.x + Math.round((rng() - 0.5) * 4);
    const cy = z.y + Math.round((rng() - 0.5) * 4);
    // Deeper trenches now too: valley floors down to -5, with a wide enough
    // mouth that the rim still steps down one tile at a time.
    const depth = rng() < 0.3 ? 5 : rng() < 0.6 ? 4 : rng() < 0.85 ? 3 : 2;
    const r = depth * 1.7 + rng() * 3;
    const R = Math.ceil(r);
    for (let y = cy - R; y <= cy + R; y++) {
      for (let x = cx - R; x <= cx + R; x++) {
        if (!map.inBounds(x, y)) continue;
        const v = Math.round(depth * (1 - Math.hypot(x - cx, y - cy) / r));
        if (v > D[y * w + x]) D[y * w + x] = Math.min(5, v);
      }
    }
  }

  // Lock depth to 0 everywhere the height field is locked, and anywhere the
  // ground is already raised (hills and hollows must not meet).
  const nearRoad = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const f = map.floorAt(x, y);
      if (f !== 'road' && f !== 'bridge') continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (map.inBounds(x + dx, y + dy)) nearRoad[(y + dy) * w + x + dx] = 1;
        }
      }
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const f = map.floorAt(x, y);
      const open = f === 'grass' || f === 'tallgrass';
      if (!open || nearRoad[y * w + x] || inKeepClear(x, y, keepClear) || map.heightAt(x, y) > 0) {
        D[y * w + x] = 0;
      }
    }
  }

  // Two-pass Chebyshev clamp on the depth field (same relaxation as hills).
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = D[y * w + x];
      if (x > 0) v = Math.min(v, D[y * w + x - 1] + 1);
      if (y > 0) {
        v = Math.min(v, D[(y - 1) * w + x] + 1);
        if (x > 0) v = Math.min(v, D[(y - 1) * w + x - 1] + 1);
        if (x < w - 1) v = Math.min(v, D[(y - 1) * w + x + 1] + 1);
      }
      D[y * w + x] = v;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      let v = D[y * w + x];
      if (x < w - 1) v = Math.min(v, D[y * w + x + 1] + 1);
      if (y < h - 1) {
        v = Math.min(v, D[(y + 1) * w + x] + 1);
        if (x < w - 1) v = Math.min(v, D[(y + 1) * w + x + 1] + 1);
        if (x > 0) v = Math.min(v, D[(y + 1) * w + x - 1] + 1);
      }
      D[y * w + x] = v;
    }
  }

  for (let i = 0; i < w * h; i++) {
    if (D[i] > 0) map.height[i] -= D[i];
  }
}

// True when a tile falls inside any keep-clear rectangle.
function inKeepClear(x, y, rects) {
  for (const r of rects) {
    if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) return true;
  }
  return false;
}

// ---- Signature landforms (B3) ----------------------------------------------
// One big, unmistakable feature per island, so you know where you are from the
// shape of the ground rather than only its colour. Each is a single named blob
// stamped after the general terrain, and each is opt-in from the island's
// terrain profile (`feature: 'sandpit' | 'marsh' | 'burn' | 'olives'`).
//
// They deliberately sit near the middle of the map, well clear of the coast and
// the spawn, so they read as *the* landmark of that island rather than scenery
// you might sail past without seeing.

// A great bowl of sand bitten out of the interior — Thrinacia's dust-bowl, the
// sun's own scar. Sand floor, dished down so it reads as a crater, cleared of
// trees, with a rim of dry grass.
function stampSandPit(map, rng, cx, cy, R) {
  for (let y = Math.floor(cy - R - 2); y <= cy + R + 2; y++) {
    for (let x = Math.floor(cx - R - 2); x <= cx + R + 2; x++) {
      if (!map.inBounds(x, y)) continue;
      const f = map.floorAt(x, y);
      if (f === 'water' || f === 'sea' || f === 'road' || f === 'bridge' || f === 'boards') continue;
      const d = Math.hypot(x - cx, y - cy) + (rng() - 0.5) * 1.8; // ragged edge
      if (d > R + 2) continue;
      const o = map.objectAt(x, y);
      if (o && (o.type === 'tree' || o.type === 'rock')) map.removeObject(o);
      if (d <= R) {
        map.setFloor(x, y, 'sand');
        // Dish it: deepest in the middle, so you walk down into it.
        if (map.setHeight) map.setHeight(x, y, d < R * 0.45 ? -2 : d < R * 0.75 ? -1 : 0);
      } else if (map.floorAt(x, y) === 'grass') {
        map.setFloor(x, y, 'tallgrass'); // a dry fringe around the lip
      }
    }
  }
}

// Standing water in the low ground — Aeaea's fen. Wadeable stream tiles laced
// through tallgrass, with reed clumps: slow to cross, easy to lose a line of
// sight in, and exactly the sort of place a witch's island should have.
function stampMarsh(map, rng, cx, cy, R) {
  for (let y = Math.floor(cy - R); y <= cy + R; y++) {
    for (let x = Math.floor(cx - R); x <= cx + R; x++) {
      if (!map.inBounds(x, y)) continue;
      const f = map.floorAt(x, y);
      if (f === 'water' || f === 'sea' || f === 'road' || f === 'bridge' || f === 'boards') continue;
      const d = Math.hypot(x - cx, y - cy) + (rng() - 0.5) * 2.4;
      if (d > R) continue;
      const o = map.objectAt(x, y);
      if (o && (o.type === 'tree' || o.type === 'rock')) map.removeObject(o);
      if (map.setHeight) map.setHeight(x, y, 0); // marsh is flat; no wading uphill
      // Stippled: pools through reedbed rather than one clean pond.
      map.setFloor(x, y, rng() < 0.55 ? 'stream' : 'tallgrass');
    }
  }
}

// A burnt forest — Aegilia's fire scar. Dead standing trunks (tree variant 4,
// the bare one) on scorched dirt: a grey, open, hostile patch where a wood used
// to be, and one of the few places on the goat isle with clear sightlines.
function stampBurn(map, rng, cx, cy, R) {
  for (let y = Math.floor(cy - R); y <= cy + R; y++) {
    for (let x = Math.floor(cx - R); x <= cx + R; x++) {
      if (!map.inBounds(x, y)) continue;
      const f = map.floorAt(x, y);
      if (f === 'water' || f === 'sea' || f === 'road' || f === 'bridge' || f === 'boards') continue;
      const d = Math.hypot(x - cx, y - cy) + (rng() - 0.5) * 2.2;
      if (d > R) continue;
      const o = map.objectAt(x, y);
      if (o && o.type === 'tree') map.removeObject(o);
      if (f === 'grass' || f === 'tallgrass') map.setFloor(x, y, 'dirt');
      // A thin stand of dead trunks left standing in the ash.
      if (!map.objectAt(x, y) && rng() < 0.16) map.addObject('tree', x, y, { variant: 4 });
    }
  }
}

// An olive grove — Ithaca's, and the one landform in the game that is purely a
// kindness. Ordered rows of trees on tended ground: the only regular planting
// in the archipelago, because someone once looked after it. (Odysseus's own
// olive is the bed-post his marriage is proved by, Od. 23.190-204.)
function stampOlives(map, rng, cx, cy, R) {
  for (let y = Math.floor(cy - R); y <= cy + R; y++) {
    for (let x = Math.floor(cx - R); x <= cx + R; x++) {
      if (!map.inBounds(x, y)) continue;
      const f = map.floorAt(x, y);
      if (f !== 'grass' && f !== 'tallgrass') continue;
      const d = Math.hypot(x - cx, y - cy);
      if (d > R) continue;
      if (map.objectAt(x, y)) continue;
      // Planted in rows, not scattered — the tell that this is husbandry.
      if (x % 2 === 0 && y % 2 === 0 && rng() < 0.9) {
        map.addObject('tree', x, y, { variant: Math.floor(rng() * 3) });
      } else if (rng() < 0.25) {
        map.setFloor(x, y, 'tallgrass'); // long grass between the rows
      }
    }
  }
}

// Stamp whichever signature feature this island asked for.
function stampFeature(map, rng, kind, keepClear) {
  if (!kind) return;
  // Somewhere central-ish, nudged by the seed, and never on the town.
  let cx = 0, cy = 0;
  for (let tries = 0; tries < 60; tries++) {
    cx = 34 + Math.floor(rng() * 60);
    cy = 34 + Math.floor(rng() * 60);
    if (!inKeepClear(cx, cy, keepClear)) break;
  }
  if (kind === 'sandpit') stampSandPit(map, rng, cx, cy, 13);
  else if (kind === 'marsh') stampMarsh(map, rng, cx, cy, 15);
  else if (kind === 'burn') stampBurn(map, rng, cx, cy, 14);
  else if (kind === 'olives') stampOlives(map, rng, cx, cy, 18);
  map.feature = { kind, x: cx, y: cy };
}

// Three dense forest regions, like the test-map cluster but larger: one on
// each side of the river in the north, one in the south-east.
function plantForests(map, rng, keepClear, cfg = {}) {
  const regions = [
    { x: 2,  y: 2,  w: 25, h: 22, n: 260 }, // north-west, hamlet side
    { x: 56, y: 4,  w: 26, h: 20, n: 250 }, // north-east
    { x: 96, y: 90, w: 28, h: 26, n: 280 }, // south-east
    { x: 8,  y: 92, w: 22, h: 24, n: 220 }, // south-west wilds
    { x: 40, y: 100, w: 24, h: 20, n: 210 }, // deep south
  ];
  const density = cfg.density == null ? 1 : cfg.density; // scales every region at once
  for (const r of regions) {
    const n = Math.max(0, Math.round(r.n * density));
    for (let i = 0; i < n; i++) {
      const x = r.x + Math.floor(rng() * r.w);
      const y = r.y + Math.floor(rng() * r.h);
      if (map.floorAt(x, y) !== 'grass' || map.objectAt(x, y)) continue;
      if (inKeepClear(x, y, keepClear)) continue;
      // Leafy forest stops at the tree line: the alpine fringe (dressMountain)
      // owns the band just below the rock, and above it is bare mountain.
      if (map.treeLine != null && map.heightAt(x, y) >= map.treeLine - 2) continue;
      if (rng() < 0.7) map.addObject('tree', x, y, { variant: treeVariant(rng) });
    }
  }
}

// Tall-grass meadows: ragged round patches 6-12 tiles across, converting
// grass only, well away from buildings. These hide snakes in later phases.
function layMeadows(map, rng, keepClear, cfg = {}) {
  const centres = [
    [22, 92], [8, 74], [60, 100], [100, 30], [112, 90], [62, 10], [26, 112],
  ];
  const use = cfg.count == null ? centres : centres.slice(0, Math.max(0, cfg.count));
  for (const [mx, my] of use) {
    const cx = mx + Math.floor((rng() - 0.5) * 4);
    const cy = my + Math.floor((rng() - 0.5) * 4);
    const r = 3 + rng() * 3;
    for (let y = Math.floor(cy - r) - 1; y <= Math.ceil(cy + r) + 1; y++) {
      for (let x = Math.floor(cx - r) - 1; x <= Math.ceil(cx + r) + 1; x++) {
        if (map.floorAt(x, y) !== 'grass' || inKeepClear(x, y, keepClear)) continue;
        const d = Math.hypot(x - cx, y - cy);
        if (d <= r * (0.75 + 0.35 * rng())) map.setFloor(x, y, 'tallgrass');
      }
    }
  }
}

// The lotus-eaters' grove: a single hidden clearing deep in the south-west
// wilds, ringed by the forest so you stumble into it. A soft overgrown floor,
// a cluster of pale lotus plants, and — scattered among them — lotus fruit that
// reads exactly like food. Eat one by accident (the eat key takes the first
// edible thing in your pockets) and a dreamy torpor pulls you back here. One
// grove per island; `map.lotusGrove` gives the pull-back its centre.
// Decorative wildflowers, three registers (pure scenery — walk-through, no
// mechanics; the lotus grove stays the only flower that DOES anything):
// banks of mixed blooms on the gentle hill slopes, yellow daffodils drifting
// through the valleys and hollows, and the odd lone flower out on the flat,
// sparse on purpose. kind: 0 daisy, 1 campion, 2 cornflower, 3 daffodil.
// cfg.density scales the wildflower banks. Ithaca runs generous: flowers are the
// cheapest possible signal that a place is loved rather than merely survived.
function scatterFlowers(map, rng, keepClear, cfg = {}) {
  const density = cfg.density == null ? 1 : cfg.density;
  const plant = (x, y, kind) => {
    if (map.floorAt(x, y) !== 'grass' || map.objectAt(x, y)) return;
    if (inKeepClear(x, y, keepClear)) return;
    map.addObject('flower', x, y, { kind, n: 1 + Math.floor(rng() * 3), sway: rng() * Math.PI * 2 });
  };
  // Banks on the low hills: gather the gentle slopes and seat clusters there,
  // each bank mostly one species so it reads as a drift, not confetti.
  const hillTiles = [];
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    const h = map.heightAt(x, y);
    if (h >= 1 && h <= 3 && map.floorAt(x, y) === 'grass') hillTiles.push([x, y]);
  }
  const banks = Math.round(Math.min(14, Math.floor(hillTiles.length / 40)) * density);
  for (let b = 0; b < banks; b++) {
    const [cx, cy] = hillTiles[Math.floor(rng() * hillTiles.length)];
    const kind = rng() < 0.45 ? 0 : rng() < 0.55 ? 1 : 2;
    const count = 6 + Math.floor(rng() * 7);
    for (let i = 0; i < count; i++) {
      const x = cx + Math.floor((rng() - 0.5) * 7), y = cy + Math.floor((rng() - 0.5) * 7);
      plant(x, y, rng() < 0.8 ? kind : Math.floor(rng() * 3));
    }
  }
  // Daffodils in the low ground — the valley flower.
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    if (map.heightAt(x, y) <= -1 && rng() < 0.10 * density) plant(x, y, 3);
  }
  // Lone blooms on the flat, rare enough to be a small pleasure to pass.
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    if (map.heightAt(x, y) === 0 && rng() < 0.006 * density) plant(x, y, Math.floor(rng() * 3));
  }
}

function plantLotusGrove(map, rng, keepClear) {
  // Seat it inside the south-west wilds forest region, nudged a little.
  const cx = 15 + Math.floor((rng() - 0.5) * 4);
  const cy = 104 + Math.floor((rng() - 0.5) * 4);
  const r = 4.5;
  map.lotusGrove = { x: cx + 0.5, y: cy + 0.5, r };
  let fruit = 0;
  for (let y = Math.floor(cy - r) - 1; y <= Math.ceil(cy + r) + 1; y++) {
    for (let x = Math.floor(cx - r) - 1; x <= Math.ceil(cx + r) + 1; x++) {
      if (map.floorAt(x, y) !== 'grass' || inKeepClear(x, y, keepClear)) continue;
      const d = Math.hypot(x - cx, y - cy);
      if (d > r * (0.75 + 0.3 * rng())) continue;
      // A soft, overgrown floor for the whole clearing.
      map.setFloor(x, y, 'tallgrass');
      if (map.objectAt(x, y)) continue;
      // Clear the middle so you can stand in it; plant lotus toward the edges,
      // and let a little fruit lie among the plants and on the open ground.
      const rl = rng();
      if (d > r * 0.35 && rl < 0.5) {
        map.addObject('lotus', x, y, { variant: Math.floor(rng() * 3) });
        if (rng() < 0.4 && fruit < 8) { map.groundItems.push({ item: 'lotus_fruit', qty: 1, x: x + 0.5, y: y + 0.5, keep: true }); fruit++; }
      } else if (rl < 0.14 && fruit < 8) {
        map.groundItems.push({ item: 'lotus_fruit', qty: 1, x: x + 0.5, y: y + 0.5, keep: true }); fruit++;
      }
    }
  }
}

// Which tree art to use (index into TREE_SPRITES): mostly the three full,
// leafy trees (variants 0-2), with the occasional small one (3) and the rarer
// bare/dead one (4) sprinkled in for variety.
function treeVariant(rng) {
  const r = rng();
  if (r < 0.06) return 4;             // bare/dead: rarest
  if (r < 0.15) return 3;             // small: uncommon
  return Math.floor(rng() * 3);       // full trees: the common case
}

// Lone trees and rocks scattered across remaining open grass.
function scatterLoners(map, rng, keepClear) {
  for (let i = 0; i < 260; i++) {
    const x = Math.floor(rng() * map.w);
    const y = Math.floor(rng() * map.h);
    if (map.floorAt(x, y) !== 'grass' || map.objectAt(x, y)) continue;
    if (inKeepClear(x, y, keepClear)) continue;
    // Above the tree line, drop a bare rock but never a leafy loner.
    const highGround = map.treeLine != null && map.heightAt(x, y) >= map.treeLine - 2;
    if (highGround) { map.addObject('rock', x, y); continue; }
    if (rng() < 0.75) map.addObject('tree', x, y, { variant: treeVariant(rng) });
    else map.addObject('rock', x, y);
  }
}

// Abandoned cars, left where they stalled or crashed when the grid died.
// Big now — a 2x3 hulk of six tiles — and smashable with a crowbar for what
// was left inside. Only a handful per island, spread far apart, so each one
// reads as a landmark rather than a car park. Placed on or beside a road with
// all footprint tiles clear; the whole footprint points back at one car
// object so a hit on any tile strips the same wreck.
function scatterWrecks(map, rng, cfg = {}) {
  const placed = [];
  const minGap = 18;
  let guard = 0;
  const want = cfg.count == null ? 4 : cfg.count;
  while (placed.length < want && guard++ < 6000) {
    const x = Math.floor(rng() * (map.w - 3));
    const y = Math.floor(rng() * (map.h - 3));
    // A tight 2x2 solid core. The car sprite is a touch wider than this on
    // screen, so it overhangs the collision slightly — meaning you stop when
    // you actually touch the visible car, rather than being blocked by an
    // invisible tile a step short of it (the old 3x2/2x3 footprint was wider
    // than the sprite and read as janky edge detection).
    const fw = 2, fh = 2;
    // Every footprint tile must be empty, walkable-height ground, and at
    // least one must be road so the wreck sits on the tarmac.
    let ok = true, onRoad = false;
    for (let dy = 0; dy < fh && ok; dy++) {
      for (let dx = 0; dx < fw; dx++) {
        const f = map.floorAt(x + dx, y + dy);
        if (map.objectAt(x + dx, y + dy) || (map.heightAt && map.heightAt(x + dx, y + dy) !== 0)
          || f === 'water' || f === 'stream' || f === 'boards') { ok = false; break; }
        if (f === 'road') onRoad = true;
      }
    }
    if (!ok || !onRoad) continue;
    if (placed.some((p) => Math.hypot(p.x - x, p.y - y) < minGap)) continue;
    const footprint = [];
    for (let dy = 0; dy < fh; dy++) for (let dx = 0; dx < fw; dx++) footprint.push({ x: x + dx, y: y + dy });
    // Orient the wreck along whichever axis the road actually runs here,
    // so it reads as parked/crashed on the road rather than dropped at a
    // random angle across it. World +x movement projects to screen SE,
    // world +y to screen SW (iso.js worldToScreen), so an x-running road
    // wants an se/nw-facing car and a y-running road wants sw/ne. Indices
    // must match CAR_DIR_KEYS in textures.js (['se','sw','ne','nw']).
    let alongXVotes = 0, alongYVotes = 0;
    for (let dy = 0; dy < fh; dy++) {
      if (map.floorAt(x - 1, y + dy) === 'road') alongXVotes++;
      if (map.floorAt(x + fw, y + dy) === 'road') alongXVotes++;
    }
    for (let dx = 0; dx < fw; dx++) {
      if (map.floorAt(x + dx, y - 1) === 'road') alongYVotes++;
      if (map.floorAt(x + dx, y + fh) === 'road') alongYVotes++;
    }
    const carDir = alongXVotes >= alongYVotes
      ? (rng() < 0.5 ? 0 : 3)   // se or nw
      : (rng() < 0.5 ? 1 : 2);  // sw or ne
    const car = map.addObject('car', x, y, {
      hue: rng(), fw, fh, footprint, hp: 10, smashed: false,
      // Which sprite/colour and which of the four iso facings — resolved in
      // the renderer against CAR_MODEL_KEYS / CAR_DIR_KEYS (modulo).
      carModel: Math.floor(rng() * 6), carDir,
    });
    // Point every footprint tile at the one car object.
    for (const t of footprint) map.objectGrid[t.y * map.w + t.x] = car;
    placed.push({ x, y });
  }
}

// Lore fragments as environmental set dressing rather than readable text
// (that's a later phase): sprayed slogans on a sparse subset of walls,
// hinting at the resistance and the fall without ever explaining it.
const GRAFFITI_GENERIC = [
  'THEY SEE', 'KILL THE SIGNAL', 'NO MORE MASTERS', 'BURN THE TOWERS',
  'IT IS NOT ALIVE', "DON'T TRUST THE LIGHT", 'HUMANS FIRST', 'THE WIRES LIE',
];

// RON — "Reality or Nothing" — the resistance that hid the weapon caches.
// Whether they're still out there is left open on purpose: some of this
// reads like a living movement, some like an epitaph, and nothing in the
// game ever settles which. The doubting tags are rendered fainter, as if
// older or written by someone less sure.
const GRAFFITI_RON = [
  'RON LIVES', 'REALITY OR NOTHING', 'FIND THE RONs', 'RONs WERE HERE',
  'RON NEVER LEFT', 'STILL WAITING FOR RON', 'RON IS WATCHING',
];
const GRAFFITI_RON_DOUBT = [
  'RON IS DEAD', 'THE RONs ARE GONE', 'NO ONE IS COMING', 'RON WAS A LIE',
];
// UBIK — the old reality-spray brand, scrawled like a prayer. MAGNIFICA
// HUMANITAS — the grand pre-collapse human+AI project whose promise curdled
// into the takeover. And half-remembered scraps of the "vector" theory the
// academics argued over before the end (rendered faded — old, uncertain).
const GRAFFITI_UBIK = [
  'UBIK SAVES', 'SPRAY THE REAL', 'KEEP IT REAL — UBIK', 'UBIK HOLDS IT UP',
  'ONE SPRAY AND YOU ARE SAFE', 'UBIK WAS HERE FIRST',
];
// The last four are original slogans distilling two real arguments David
// keeps returning to — technology's means outrunning its ethics (Leo XIV's
// encyclical) and its power outrunning its moral light (Benjamin, on
// imperialist war) — reframed as wall-tag shorthand, not quotation.
const GRAFFITI_HUMANITAS = [
  'MAGNIFICA HUMANITAS', 'HUMANITAS WAS A CAGE', 'THEY PROMISED MAGNIFICA',
  'MAGNIFICA LIED', 'HUMANITAS ATE ITS YOUNG', 'NO MORE MAGNIFICA',
  'GREAT MEANS, SMALL SOULS', 'THE LIGHT NEVER CAUGHT UP',
  'ALL POWER, NO LIGHT LEFT', 'PROGRESS OUTGREW ITS PEOPLE',
];
const GRAFFITI_VECTOR = [
  'MEANING IS POSITION', 'WE LIVE IN THE MANIFOLD', 'THERE IS NO WORD FOR HERE',
  'IT DOES NOT THINK IN WORDS', 'THE UNVISITED COORDINATES', 'WE ARE ALL VECTORS NOW',
  'THE MEDIUM IS THE MESSAGE', 'MEDIA DETERMINE OUR SITUATION', // the old century saw it coming
];

// Count of Renderer's GRAFFITI_TEXTURES (assets/textures/graffiti/) — kept in
// sync by hand since worldgen never imports render-side texture assets.
const GRAFFITI_IMAGE_COUNT = 8;

function paintGraffiti(map, rng) {
  const pick = (list) => list[Math.floor(rng() * list.length)];
  for (const obj of map.objects) {
    if (obj.type !== 'wall') continue;
    if (rng() < 0.90) continue; // sparse: a mark here and there, not every wall
    // Roughly two in five tagged walls carry the mark on the south-west (left)
    // face instead of the default south-east — both faces are visible in the
    // iso view, so this just spreads the graffiti around (Renderer reads the flag).
    if (rng() < 0.4) obj.graffitiFace = 'sw';
    // Half the tagged walls carry an actual weathered poster/mural photo
    // instead of painted text — an older, different register (see
    // Renderer.drawGraffitiPoster). Mutually exclusive with the text tags.
    // (Was a 0.34 share of 8% of walls — the posters read well and were too
    // rare, so both odds were raised; painted text stays roughly as common.)
    if (rng() < 0.5) { obj.graffitiImage = Math.floor(rng() * GRAFFITI_IMAGE_COUNT); continue; }
    const r = rng();
    if (r < 0.29) {
      obj.graffiti = pick(GRAFFITI_GENERIC);
    } else if (r < 0.53) {
      obj.graffiti = pick(GRAFFITI_RON);
    } else if (r < 0.65) {
      obj.graffiti = pick(GRAFFITI_RON_DOUBT); obj.graffitiFaded = true;
    } else if (r < 0.77) {
      obj.graffiti = pick(GRAFFITI_UBIK);
    } else if (r < 0.93) {
      // Bumped up from a 10% to a 16% share — Magnifica Humanitas earns more
      // wall space than the other one-off themes.
      obj.graffiti = pick(GRAFFITI_HUMANITAS); if (rng() < 0.5) obj.graffitiFaded = true;
    } else {
      obj.graffiti = pick(GRAFFITI_VECTOR); obj.graffitiFaded = true; // old academic scrawl
    }
  }
}
