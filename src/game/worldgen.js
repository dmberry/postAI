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

// Build the whole world for a seed. Returns the map and a spawn point on
// the main road at the eastern edge of the town (continuous world coords).
export function buildWorld(seed) {
  const map = new GameMap(MAP_W, MAP_H, 'grass');
  const rng = makeRng(seed);

  carveRiver(map, rng);
  layRoads(map);

  // Buildings, tracking a small margin around each so scatter and meadows
  // never blockade a doorway or fill a yard.
  const keepClear = [];
  for (const lot of buildingLots()) {
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
  const hills = raiseHills(map, rng);
  carveStreams(map, rng, hills);
  finalizeHeights(map, keepClear);
  carveHollows(map, rng, keepClear);

  plantForests(map, rng, keepClear);
  layMeadows(map, rng, keepClear);
  scatterLoners(map, rng, keepClear);

  const spawn = { x: 112.5, y: MAIN_ROAD_Y + 0.5 };
  return { map, spawn };
}

// River: a gently meandering north-south channel of solid water, 3-5 tiles
// wide, with a sand rim along both banks.
function carveRiver(map, rng) {
  const phase = rng() * Math.PI * 2;
  let cx = 40 + (rng() - 0.5) * 6;
  let half = 2.0;
  for (let y = 0; y < map.h; y++) {
    const target = 40 + 9 * Math.sin(y * 0.045 + phase);
    cx += (target - cx) * 0.15 + (rng() - 0.5) * 0.9;
    cx = Math.max(31, Math.min(51, cx));
    half += (rng() - 0.5) * 0.3;
    half = Math.max(1.0, Math.min(2.0, half));
    const width = Math.round(half * 2 + 1); // 3-5 tiles wide
    const x0 = Math.round(cx - width / 2);
    for (let x = x0; x < x0 + width; x++) map.setFloor(x, y, 'water');
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
function layRoads(map) {
  const pave = (x, y) => {
    const f = map.floorAt(x, y);
    if (f === 'water') map.setFloor(x, y, 'bridge');
    else if (f !== null) map.setFloor(x, y, 'road');
  };
  for (let x = 0; x < map.w; x++) {
    pave(x, MAIN_ROAD_Y); pave(x, MAIN_ROAD_Y + 1);
  }
  for (let y = 0; y < map.h; y++) {
    pave(EAST_ROAD_X, y); pave(EAST_ROAD_X + 1, y);
  }
  for (let x = WEST_ROAD_X; x <= EAST_ROAD_X + 1; x++) {
    pave(x, SPUR_ROAD_Y); pave(x, SPUR_ROAD_Y + 1);
  }
  for (let y = SPUR_ROAD_Y; y <= MAIN_ROAD_Y + 1; y++) {
    pave(WEST_ROAD_X, y); pave(WEST_ROAD_X + 1, y);
  }
}

// Building lots: position, size, which side the door faces (towards the
// nearest road), and a base ruin level. The main town (east of the river)
// has ten buildings from cottage to warehouse, a couple near-intact and
// most damaged; the hamlet (west) has three, more ruined.
function buildingLots() {
  return [
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
}

// One building: boards interior, a wall perimeter with a door gap of 1-2
// tiles (facing the road) and window gaps, collapsed wall runs replaced by
// rubble according to the ruin level, a missing corner on heavily broken
// buildings, and a worn dirt patch outside the door.
function placeBuilding(map, rng, lot) {
  const { x0, y0, w, h, door } = lot;
  const x1 = x0 + w - 1, y1 = y0 + h - 1;
  const ruin = lot.ruin + rng() * 0.08;
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
    map.addObject('wall', c.x, c.y);
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
function raiseHills(map, rng) {
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
  ];
  for (let i = optional.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [optional[i], optional[j]] = [optional[j], optional[i]];
  }
  const extra = 1 + Math.floor(rng() * 3); // 4-6 hills in total
  const chosen = [...mandatory, ...optional.slice(0, extra)];

  const hills = [];
  for (const z of chosen) {
    const cx = z.x + Math.round((rng() - 0.5) * 2);
    const cy = z.y + Math.round((rng() - 0.5) * 2);
    const peak = rng() < 0.6 ? 3 : 2;
    const r = 5 + rng() * 2;
    const blobs = [{ x: cx, y: cy, p: peak, r }];
    const nSub = 1 + (rng() < 0.5 ? 1 : 0);
    for (let i = 0; i < nSub; i++) {
      blobs.push({
        x: cx + Math.round((rng() - 0.5) * 4),
        y: cy + Math.round((rng() - 0.5) * 4),
        p: Math.max(1, peak - 1),
        r: r * 0.55,
      });
    }
    for (const b of blobs) {
      const R = Math.ceil(b.r);
      for (let y = b.y - R; y <= b.y + R; y++) {
        for (let x = b.x - R; x <= b.x + R; x++) {
          if (!map.inBounds(x, y)) continue;
          const v = Math.round(b.p * (1 - Math.hypot(x - b.x, y - b.y) / b.r));
          if (v > map.heightAt(x, y)) map.setHeight(x, y, Math.min(3, v));
        }
      }
    }
    hills.push({ cx, cy, r, peak });
  }
  return hills;
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

// Hollows: sunken dips and valleys (heights -1 to -2) in the wilds, built
// exactly like hills but as a separate non-negative DEPTH field with its own
// Lipschitz clamp, then subtracted. Zones sit well away from every hill zone
// so the two fields never overlap (their difference would otherwise be able
// to step by two). Locked ground (roads, water, streams, buildings, aprons)
// stays at depth 0, so all valley floors and rims remain walkable.
function carveHollows(map, rng, keepClear) {
  const w = map.w, h = map.h;
  const zones = [
    { x: 70, y: 38 },  // open country east of the river, north of the main road
    { x: 20, y: 52 },  // west bank wilds
    { x: 60, y: 112 }, // deep south, east of the river
    { x: 100, y: 122 },// south-east corner
  ];
  const n = 3 + (rng() < 0.5 ? 1 : 0);
  const D = new Int8Array(w * h);

  for (const z of zones.slice(0, n)) {
    const cx = z.x + Math.round((rng() - 0.5) * 4);
    const cy = z.y + Math.round((rng() - 0.5) * 4);
    const depth = rng() < 0.4 ? 2 : 1;
    const r = 4 + rng() * 2.5;
    const R = Math.ceil(r);
    for (let y = cy - R; y <= cy + R; y++) {
      for (let x = cx - R; x <= cx + R; x++) {
        if (!map.inBounds(x, y)) continue;
        const v = Math.round(depth * (1 - Math.hypot(x - cx, y - cy) / r));
        if (v > D[y * w + x]) D[y * w + x] = Math.min(2, v);
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

// Three dense forest regions, like the test-map cluster but larger: one on
// each side of the river in the north, one in the south-east.
function plantForests(map, rng, keepClear) {
  const regions = [
    { x: 2,  y: 2,  w: 25, h: 22, n: 170 }, // north-west, hamlet side
    { x: 56, y: 4,  w: 26, h: 20, n: 160 }, // north-east
    { x: 96, y: 90, w: 28, h: 26, n: 190 }, // south-east
  ];
  for (const r of regions) {
    for (let i = 0; i < r.n; i++) {
      const x = r.x + Math.floor(rng() * r.w);
      const y = r.y + Math.floor(rng() * r.h);
      if (map.floorAt(x, y) !== 'grass' || map.objectAt(x, y)) continue;
      if (inKeepClear(x, y, keepClear)) continue;
      if (rng() < 0.55) map.addObject('tree', x, y);
    }
  }
}

// Tall-grass meadows: ragged round patches 6-12 tiles across, converting
// grass only, well away from buildings. These hide snakes in later phases.
function layMeadows(map, rng, keepClear) {
  const centres = [
    [22, 92], [8, 74], [60, 100], [100, 30], [112, 90], [62, 10], [26, 112],
  ];
  for (const [mx, my] of centres) {
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

// Lone trees and rocks scattered across remaining open grass.
function scatterLoners(map, rng, keepClear) {
  for (let i = 0; i < 150; i++) {
    const x = Math.floor(rng() * map.w);
    const y = Math.floor(rng() * map.h);
    if (map.floorAt(x, y) !== 'grass' || map.objectAt(x, y)) continue;
    if (inKeepClear(x, y, keepClear)) continue;
    if (rng() < 0.75) map.addObject('tree', x, y);
    else map.addObject('rock', x, y);
  }
}
