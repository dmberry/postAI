// ZEUS's fortress — one of the four AI crowns (ZEUS, APOLLO, ATHENA, HADES;
// POSEIDON is the net strung between them). ZEUS "took the high country and
// cannot be cut" — hence the sealed fortress. The overworld is ringed by an
// impassable boundary; the fortress is a sealed ANNEX grown onto the south edge
// of that boundary, so it costs the overworld no space and can be as large as
// we like. The only way in is a grand doorway in the rampart, thrown open by a
// fortress key that the boundary terminal spits out when you hack it in RON-ML.
//
// Self-contained by design: almost all fortress state lives in the controller
// this module returns. main.js wires a handful of hooks (a click to open the
// gate console, a RON-ML `unlock` primitive, an update tick, and two map
// markers); the renderer draws the new object/floor kinds generically.

import { makeRng } from './rng.js';

export const AI_NAME = 'ZEUS';

// The four AI crowns, for lore and the map legend. Only ZEUS is built so far.
export const AI_ROSTER = ['ZEUS', 'APOLLO', 'ATHENA', 'HADES'];

const ANNEX_H = 64;        // rows of fortress grown below the overworld
const RAMPART_MAT = 'metal';
const DOOR_W = 3;          // a three-tile grand doorway
const REPORT_DELAY = 3.5;  // seconds a guard must survive watching you to report the breach
const STANDDOWN_DELAY = 90; // seconds of quiet before an alarmed fortress stands back down
const PRODUCE_INTERVAL = 6; // seconds between reinforcement dispatches while alarmed
const GUARD_CAP = 12;       // max live M5/M6 the core will sustain at once (frame-rate guard)

// Grow the map's grid southward, in place, by `rows`. A tile's linear index is
// y*w+x and the width is unchanged, so every existing (x,y) keeps its index —
// appending rows at the bottom needs no remap of the overworld's floor,
// objects, heights or shade. Returns the first new row (the seam).
function growSouth(map, rows, fillFloor) {
  const w = map.w, oldH = map.h, newLen = w * (oldH + rows), addLen = w * rows;
  for (let i = 0; i < addLen; i++) map.floor.push(fillFloor);
  map.objectGrid = map.objectGrid.concat(new Array(addLen).fill(null));
  const nh = new Int8Array(newLen); nh.set(map.height); map.height = nh; // new rows flat (0)
  const ns = new Float32Array(newLen); ns.set(map.shade); map.shade = ns; // new rows unshaded
  map.h = oldH + rows;
  return oldH;
}

// A recursive-backtracker labyrinth carved into a full-width band of the annex,
// so the raid must solve it to get from the doorway down to the sanctum — it
// spans edge to edge, no walking around. Corridors are 3 wide (room to fight);
// walls are 1-thick charcoal darkstone. A single entrance (aligned to the
// doorway) and a single exit (aligned to the core) are cut through the ring.
// Returns the band's bottom row so the caller knows where the maze ends.
function buildMaze(map, rng, cfg) {
  const { mx0, my0, cols, rows, gateCol, wallH } = cfg;
  const CW = 3, PITCH = 4;              // 3-wide corridors, 1-wide walls
  const w = map.w;
  const open = new Set();
  const idx = (x, y) => y * w + x;
  const carve = (x, y) => { if (map.inBounds(x, y)) open.add(idx(x, y)); };
  const cellX = (c) => mx0 + c * PITCH, cellY = (r) => my0 + r * PITCH;
  const carveCell = (c, r) => {
    const bx = cellX(c), by = cellY(r);
    for (let dy = 0; dy < CW; dy++) for (let dx = 0; dx < CW; dx++) carve(bx + dx, by + dy);
  };
  const carvePassage = (c1, r1, c2, r2) => {
    if (c1 !== c2) { const gx = cellX(Math.min(c1, c2)) + CW, by = cellY(r1); for (let dy = 0; dy < CW; dy++) carve(gx, by + dy); }
    else { const gy = cellY(Math.min(r1, r2)) + CW, bx = cellX(c1); for (let dx = 0; dx < CW; dx++) carve(bx + dx, gy); }
  };
  // DFS from the entrance cell so every cell links back to it (a perfect maze:
  // exactly one route to the exit cell at the bottom).
  const visited = Array.from({ length: rows }, () => new Array(cols).fill(false));
  const stack = [[gateCol, 0]];
  visited[0][gateCol] = true; carveCell(gateCol, 0);
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (stack.length) {
    const [c, r] = stack[stack.length - 1];
    const opts = [];
    for (const [dc, dr] of DIRS) {
      const nc = c + dc, nr = r + dr;
      if (nc >= 0 && nc < cols && nr >= 0 && nr < rows && !visited[nr][nc]) opts.push([nc, nr]);
    }
    if (!opts.length) { stack.pop(); continue; }
    const [nc, nr] = opts[Math.floor(rng() * opts.length)];
    visited[nr][nc] = true; carvePassage(c, r, nc, nr); carveCell(nc, nr); stack.push([nc, nr]);
  }
  const bandBottom = cellY(rows - 1) + CW;   // the 1-tile ring row below the last cell
  // Entrance gap up into the plaza, exit gap down toward the sanctum.
  const gx = cellX(gateCol);
  for (let dx = 0; dx < CW; dx++) {
    carve(gx + dx, my0 - 1);
    for (let y = bandBottom; y <= bandBottom + 5; y++) carve(gx + dx, y);
  }
  // Wall every closed tile of the band, FULL WIDTH (x 0..w-1), so the flanks
  // can't be used to slip around the maze. Never overwrites the core/sanctum.
  // Walls take a mix of AI-panel designs for variety, and roughly one in seven
  // carries a sconce light that glows slowly on its own phase.
  for (let y = my0 - 1; y <= bandBottom; y++) {
    for (let x = 0; x < w; x++) {
      if (open.has(idx(x, y)) || map.objectAt(x, y)) continue;
      const t = rng();
      const material = t < 0.14 ? 'aigrate' : t < 0.2 ? 'aivent' : 'aiwall';
      const lit = rng() < 0.14;
      map.addObject('fortwall', x, y, {
        material, wallH,
        light: lit,
        lightPhase: lit ? rng() * Math.PI * 2 : 0,
        lightHue: lit ? (rng() < 0.72 ? 'cyan' : 'amber') : null,
      });
    }
  }

  // The way out: a breadth-first shortest path through the open tiles from the
  // entrance gap down to the exit corridor. Stored (single-tile-wide) on the
  // map so that, once you've solved the maze, the floor can light this trail to
  // guide you back out (see fortress.update + renderer.drawFloor).
  const START = idx(gx + 1, my0 - 1), GOAL = idx(gx + 1, bandBottom + 4);
  const prev = new Map(); const bq = [START]; prev.set(START, -1);
  let found = false;
  for (let h = 0; h < bq.length && !found; h++) {
    const cur = bq[h], cx2 = cur % w, cy2 = (cur - cx2) / w;
    if (cur === GOAL) { found = true; break; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx2 + dx, ny = cy2 + dy, ni = idx(nx, ny);
      if (nx < 0 || ny < 0 || nx >= w || prev.has(ni) || !open.has(ni)) continue;
      prev.set(ni, cur); bq.push(ni);
    }
  }
  const guide = new Set();
  if (found) { for (let n = GOAL; n !== -1; n = prev.get(n)) guide.add(n); }
  map.mazeGuide = guide;      // tile indices of the way out
  map.mazeGuideLit = false;   // lit only once the maze is solved
  return bandBottom;
}

// Build the fortress into a fresh southern annex and return its controller.
export function createFortress(map, seed, spawn) {
  const w = map.w;
  const seamY = growSouth(map, ANNEX_H, 'panel');
  const southY = map.h - 1;

  // Place the doorway east of the central river so the forecourt is reachable
  // from the town/spawn side without a swim. Door spans [doorX0 .. doorX0+2].
  const doorX0 = Math.min(w - DOOR_W - 6, Math.max(6, Math.round(w * 0.72)));
  const doorTiles = [];
  for (let dx = 0; dx < DOOR_W; dx++) doorTiles.push({ x: doorX0 + dx, y: seamY });

  // Rampart: a solid, deliberately NON-climbable metal wall across the whole
  // seam, save the doorway gap — you cannot double-jump it, so the hacked door
  // is the only way through. The two tiles flanking the door are raised gate
  // pylons (drawn taller) to frame it.
  const doorSet = new Set(doorTiles.map((t) => t.x));
  for (let x = 0; x < w; x++) {
    if (doorSet.has(x)) continue;
    const pylon = x === doorX0 - 1 || x === doorX0 + DOOR_W;
    map.addObject('fortwall', x, seamY, { material: RAMPART_MAT, pylon });
  }
  // The doors themselves: solid until the key throws them open.
  const doors = doorTiles.map((t) => map.addObject('fortdoor', t.x, t.y, { material: RAMPART_MAT }));

  // Forecourt: clear a flat apron of the overworld in front of the doorway so
  // the player can always reach the terminal, whatever the seed dropped there.
  for (let y = seamY - 3; y <= seamY - 1; y++) {
    for (let x = doorX0 - 3; x <= doorX0 + DOOR_W + 3; x++) {
      if (!map.inBounds(x, y)) continue;
      const o = map.objectAt(x, y);
      if (o) map.removeObject(o);
      map.setFloor(x, y, 'dirt');
      map.setHeight(x, y, 0);
    }
  }

  // The gate terminal: a console kiosk on the forecourt beside the doorway.
  const termX = doorX0 + DOOR_W + 2, termY = seamY - 1;
  const terminal = map.addObject('gateterm', termX, termY, { code: 'GATE-ADM' });

  // The inner sanctum floor (a dark deck) around where the core stands, and the
  // core itself: a 6x6 mainframe structure near the south wall, roughly under
  // the doorway so the raid runs in a straight line.
  const CORE = 6;
  const coreX = Math.max(2, Math.min(w - CORE - 2, doorX0 - 1));
  const coreY = southY - CORE - 3;
  for (let y = coreY - 3; y <= coreY + CORE + 2; y++) {
    for (let x = coreX - 3; x <= coreX + CORE + 2; x++) {
      if (map.inBounds(x, y) && !map.objectAt(x, y)) map.setFloor(x, y, 'sanctum');
    }
  }
  const footprint = [];
  for (let dy = 0; dy < CORE; dy++) for (let dx = 0; dx < CORE; dx++) footprint.push({ x: coreX + dx, y: coreY + dy });
  const core = map.addObject('mainframe', coreX, coreY, {
    fw: CORE, fh: CORE, footprint, ai: AI_NAME, hp: 250, maxHp: 250, defeated: false,
  });
  for (const t of footprint) map.objectGrid[t.y * w + t.x] = core;

  const coreCx = coreX + CORE / 2, coreCy = coreY + CORE / 2;

  // The red uplink mast beside the core: wires ZEUS into the overworld
  // SKYLINK. While it stands, tripping the alarm stirs the world; hammer it
  // down and a breach stays contained to the fortress. Seated just EAST of the
  // core on the sanctum deck, where its tile depth sorts it in front of the
  // tall core block rather than hidden behind it.
  let uplinkObj = null;
  {
    const ux = coreX + CORE, uy = coreY + 1;
    if (map.inBounds(ux, uy) && !map.objectAt(ux, uy)) {
      uplinkObj = map.addObject('uplink', ux, uy, { hp: 90, maxHp: 90, destroyed: false });
    }
  }

  // The labyrinth: a full-width band between the doorway and the sanctum. Its
  // entrance/exit column is aligned to the doorway/core so the raid runs on a
  // straight north-south axis, but the only route through is the maze solution.
  const mazeRng = makeRng((seed ^ 0x0ada) >>> 0);
  const MAZE_MX0 = 1, MAZE_PITCH = 4;
  const mazeCols = Math.floor((w - 2) / MAZE_PITCH);
  const gateCol = Math.max(0, Math.min(mazeCols - 1, Math.round((doorX0 + 1 - MAZE_MX0) / MAZE_PITCH)));
  const mazeBottom = buildMaze(map, mazeRng, {
    mx0: MAZE_MX0, my0: seamY + 3, cols: mazeCols, rows: 9, gateCol, wallH: 40,
  });

  // The quad: the open paved killing-ground between the maze and the sanctum,
  // where ZEUS's guards muster. Low pillars are scattered for cover (they
  // break line of sight, so you can cross unseen), leaving the central approach
  // to the core clear. Guard muster points are returned for the guard system.
  const quadTop = mazeBottom + 2, quadBottom = coreY - 4;
  for (let y = quadTop; y <= quadBottom; y++) {
    for (let x = 2; x < w - 2; x++) {
      if (map.inBounds(x, y) && !map.objectAt(x, y)) map.setFloor(x, y, 'quad');
    }
  }
  const muster = [];
  for (let y = quadTop + 1; y < quadBottom; y += 3) {
    for (let x = 6; x < w - 6; x += 5) {
      if (Math.abs(x - coreCx) < 5) { muster.push({ x: x + 0.5, y: y + 0.5 }); continue; } // clear central approach: a muster spot, not a pillar
      if (mazeRng() < 0.5 && !map.objectAt(x, y)) {
        map.addObject('fortwall', x, y, { material: mazeRng() < 0.5 ? 'aiwall' : 'aigrate', wallH: 22 });
      }
    }
  }

  // ---- controller ---------------------------------------------------------
  const state = {
    hacked: false, open: false, announced: false, mazeSolved: false,
    alarm: false, reportT: 0, quietT: 0, produceT: 0, uplinkAlive: !!uplinkObj,
  };

  const nearTerminal = (px, py, r = 1.9) =>
    Math.hypot(px - (termX + 0.5), py - (termY + 0.5)) <= r;

  const openDoor = () => {
    if (state.open) return;
    for (const d of doors) if (d) map.removeObject(d); // seam tiles fall back to walkable panel
    state.open = true;
  };

  return {
    AI_NAME,
    region: { x0: 0, y0: seamY, x1: w - 1, y1: southY },
    seamY,
    door: { x0: doorX0, x1: doorX0 + DOOR_W - 1, y: seamY, cx: doorX0 + DOOR_W / 2 },
    terminal: { x: termX, y: termY, obj: terminal },
    core: { obj: core, x: coreCx, y: coreCy, tx: coreX, ty: coreY, fw: CORE, fh: CORE },
    quad: { top: quadTop, bottom: quadBottom, muster }, // the guard courtyard + muster points
    uplink: uplinkObj,
    get alarm() { return state.alarm; },
    get reportProgress() { return Math.min(1, state.reportT / REPORT_DELAY); }, // 0..1 toward the breach report
    get uplinkAlive() { return state.uplinkAlive; },
    get hacked() { return state.hacked; },
    get open() { return state.open; },

    nearTerminal,

    // The dormant patrol: just one or two light M4 report drones on the quad's
    // muster points. Nothing else garrisons the fortress while it's sealed —
    // the M5 snipers and M6 packs only come once the breach reports (see the
    // alarm in update, which asks main.js to spawn the wave). `spawnM4` is
    // passed in so this module never imports robots.js.
    spawnGuards(spawnM4) {
      const guards = [];
      muster.slice(0, 2).forEach((m, i) => {
        const g = spawnM4(map, (seed ^ (0x6a11 + i * 977)) >>> 0, m.x, m.y);
        if (g) guards.push(g);
      });
      return guards;
    },

    // RON-ML `unlock`, run at the gate console. Requires the AI key (one AI's
    // key cracks the next AI's gate) and drops a single fortress key.
    hack(player) {
      if (!nearTerminal(player.x, player.y, 3.2)) {
        return { ok: false, msg: 'unlock only works at a fortress gate terminal.' };
      }
      if (!player.hasItem('ai_key')) {
        return { ok: false, msg: 'unlock needs an AI key — pull one from a felled W-factory first.' };
      }
      if (state.hacked) {
        return { ok: false, msg: `${AI_NAME}'s doorway is already unlocked. The key is yours.` };
      }
      state.hacked = true;
      for (const d of doors) if (d) d.hacked = true; // lock beacons turn green
      map.groundItems.push({ item: 'fortress_key', qty: 1, x: termX + 0.5, y: termY + 0.9, keep: true });
      return { ok: true, msg: `Bolts disengage across the rampart. A fortress key clatters out of the ${terminal.code} slot.` };
    },

    // Per-frame: once you carry the key up to the doorway, it swings open.
    update(dt, player, robots, world) {
      // The AI is dead: the fortress is inert — no alarm, no manufacture, and the
      // maze sconces stop strobing. (The island power-down itself is handled by
      // main.js's onCoreDefeated hook, kept island-agnostic there.)
      if (core.defeated) { state.alarm = false; map.fortressAlarm = false; return; }
      if (!state.open && player.hasItem('fortress_key')) {
        if (Math.abs(player.y - seamY) <= 2.5 && player.x >= doorX0 - 1.5 && player.x <= doorX0 + DOOR_W + 0.5) {
          openDoor();
          player.say(`The fortress key turns. ${AI_NAME}'s doorway grinds open.`);
          if (!state.announced) { state.announced = true; player.addScore?.(40); }
        }
      }
      // The maze lights its solution the moment you ENTER it CARRYING the
      // assembled fortress map — the map is your guide (piece it from the
      // fragments scattered across the world). Without it you thread the maze
      // blind. Once kindled it stays lit for the run.
      if (!map.mazeGuideLit && player.hasItem('fortress_map')
        && player.y >= seamY + 2 && player.y < quadTop) {
        map.mazeGuideLit = true;
        player.say('The fortress map flares in your hand — its lines run out across the floor, lighting the way through.');
      }

      // The uplink: hammer it down and the fortress is cut off. If it falls
      // while the world is already stirred, the world calms at once.
      if (uplinkObj && uplinkObj.destroyed && state.uplinkAlive) {
        state.uplinkAlive = false;
        player.say(`${AI_NAME}'s red uplink goes dark. The fortress is cut off — the world can't hear it now.`);
        if (state.alarm && world && world.calm) world.calm();
      }

      // The breach mechanic. A guard that has acquired you (aggro) is reporting;
      // survive its report window (REPORT_DELAY) and the alarm trips. Kill the
      // watchers fast and the report clock cools back down. Once alarmed, a long
      // quiet spell (no guard sees you) stands the fortress back down.
      const guards = robots ? robots.filter((r) => (r.type === 'm6' || r.type === 'm5' || r.type === 'm4') && !r.dead) : [];
      const watched = guards.some((g) => g.aggro);
      if (!state.alarm) {
        if (watched) {
          state.reportT += dt;
          if (state.reportT >= REPORT_DELAY) {
            state.alarm = true; state.quietT = 0; state.produceT = PRODUCE_INTERVAL;
            player.say(`A drone reports the breach. ${AI_NAME} rouses — the core throws its guard down the maze at you.`);
            if (world && world.spawnWave) world.spawnWave(4, 2); // first response: a full pack + snipers
            if (state.uplinkAlive && world && world.stir) world.stir();
          }
        } else {
          state.reportT = Math.max(0, state.reportT - dt * 1.5);
        }
      } else {
        state.quietT = watched ? 0 : state.quietT + dt;
        // A relentless violation response: while roused, the core keeps
        // manufacturing and sending reinforcements down the maze, up to a live
        // cap so it can't melt the frame rate.
        const liveCombat = guards.reduce((n, g) => n + (g.type === 'm5' || g.type === 'm6' ? 1 : 0), 0);
        state.produceT -= dt;
        if (state.produceT <= 0 && liveCombat < GUARD_CAP && world && world.spawnWave) {
          world.spawnWave(2, Math.random() < 0.4 ? 1 : 0);
          state.produceT = PRODUCE_INTERVAL;
        }
        if (state.quietT >= STANDDOWN_DELAY) {
          state.alarm = false; state.reportT = 0;
          player.say('The fortress loses your trail. The alarm subsides — the core falls quiet.');
          if (world && world.calm) world.calm();
        }
      }
      map.fortressAlarm = state.alarm; // renderer: maze sconces strobe red while alarmed
    },

    // Markers for the RON-ML `map` overlay.
    markers() {
      return {
        gate: { x: doorX0 + DOOR_W / 2, y: seamY, open: state.open, hacked: state.hacked },
        core: { x: coreCx, y: coreCy, ai: AI_NAME, defeated: core.defeated },
      };
    },
  };
}
