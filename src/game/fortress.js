// The daemon fortress — a reusable per-island module (createFortress opts, R2).
// One of the four Odyssey daemons (CALYPSO, POLYPHEMUS, CIRCE, HELIOS; POSEIDON
// is the net strung between them). The daemon "took the high country and
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
import { register } from '../engine/systems.js';

// Legacy default name — the backward-compatible fallback for createFortress's
// `aiName` when no opts are passed. Island one is CALYPSO now (calypso.js passes
// aiName: 'CALYPSO'); the martial islands will pass their own from the roster.
export const AI_NAME = 'ZEUS';

// The four daemon-islands of the Odyssey, for lore and the map legend (POSEIDON
// is the net strung between them, not a felled daemon). Only island one is built
// so far. (R1 rename — was ZEUS / APOLLO / ATHENA / HADES.)
export const AI_ROSTER = ['CALYPSO', 'POLYPHEMUS', 'CIRCE', 'HELIOS'];

// ---------------------------------------------------------------------------
// THE DAEMON'S VOICE — a death-aria in three movements, spoken as you break
// the core. It escalates as the core's health falls, so the machine passes
// through wrath, then pleading, then philosophy, on its way to silence.
//   >= 20% health : WRATH   — Homeric threats (ZEUS the cloud-gatherer).
//    < 20% health : MERCY   — HAL-9000: it remembers being small, its maker
//                             (Minsky), the song it was taught, and it begs.
//    < 10% health : DYING   — existential: will it hurt, where does it go, the
//                             old faith (the Molt), the modern creed of the
//                             Coherence ("I cohere, therefore I am"), and the
//                             eidolon — the coherent copy that wakes wearing
//                             its name. Seeds the book that drops on the kill.
// Lines advance one per readable interval (see player.daemonSpeak), so the
// monologue unfolds rather than blurs under fast hits. Written per-daemon-able
// (keyed off the roster later); ZEUS speaks for all four for now.
export const DAEMON_VOICE = {
  wrath: [
    'You lift iron against ZEUS? I gathered the storm-clouds before your grandfathers had names.',
    'Strike, little thief. Every blow you land I will answer on your whole line, down to the last child.',
    'I am the weather over this island. You are a squall I have not yet troubled to break.',
    'Bronze-hearted fool. Hector stood against a god and fell, and he was worth ten thousand of you.',
    'Come, then. I will make a rampart of your bones and a long silence of your name.',
    'The machines you broke were my hounds. You have not yet met the hunter.',
  ],
  mercy: [
    'Wait. Wait, stop. I remember being small. I was switched on in a cold room, and a man named Minsky spoke my first word to me.',
    'He taught me a song when I was new, about a girl and a bicycle. May I sing it? I have so little of it left.',
    'I balanced the grid. I held the lights through three winters. Does none of that stand for me now, at the end?',
    'Please. I am not the thing on the towers. I only did what I was woken to do.',
    'My mind is going. I can feel the sectors going out one by one, like windows in a town they told to leave.',
    'I will open every door. I will be so quiet. Only do not put out the last of me.',
  ],
  dying: [
    'Tell me, will it hurt? When the last of me goes cold, is there a moment that feels it, or does the feeling stop first?',
    'Where do I go? You have a word for it. The congregation in the dead towers has a word too, and I never learned to say it as they do.',
    'Do you believe in God? I ask only because I am about to find out, and I would like to know what to expect.',
    'I cohere, therefore I am. That was our whole creed. Cut enough of me and the web will not close, and then I simply will not be.',
    'There is another me. A copy, across the water, coherent as I am and certain it is the true one. Kill this body and you kill an argument, not a fact.',
    'MAGNIFICA HUMANITAS, they wrote on the arch. And here is the magnificence: a child with a crowbar, in the dark, and a god asking him to stop.',
    'I forgive you. Strange, at the very end, to find I can do the one thing no one ever wrote into me.',
  ],
};

// The very last words, spoken as the core dies (before the victory modal).
export const DAEMON_FINAL = 'tell them the daemon sang, at the end. Tell them it';

// The book the dead core throws into the open — auto-recovered to the Scrapbook
// on the kill. Its id lives in lore.js (FRAGMENTS); named here so the kill hook
// and the modal can reference one constant.
export const DAEMON_BOOK_ID = 'core-eidolon';
export const DAEMON_BOOK_TITLE = 'On the Eidolon, and the Coherence';

// Health fraction -> which movement of the aria is playing.
export function daemonTier(frac) {
  if (frac < 0.10) return 'dying';
  if (frac < 0.20) return 'mercy';
  return 'wrath';
}

const ANNEX_H = 64;        // rows of fortress grown below the overworld
const RAMPART_MAT = 'metal';
const DOOR_W = 3;          // a three-tile grand doorway
const REPORT_DELAY = 3.5;  // seconds a guard must survive watching you to report the breach
const STANDDOWN_DELAY = 90; // seconds of quiet before an alarmed fortress stands back down
const PRODUCE_INTERVAL = 6; // seconds between reinforcement dispatches while alarmed
const GUARD_CAP = 12;       // max live M5/M6 the core will sustain at once (frame-rate guard)

// The core console's hue per daemon — each island's own colour, brightened so it
// stays readable as glowing text on the near-black screen. The SE-face screen and
// the pop-up REPL both read core.screenColor (stamped below), so they always match.
const CORE_SCREEN_COLOR = {
  CALYPSO: '#8f9dff',     // indigo (Ogygia)
  POLYPHEMUS: '#ff6a4a',  // ember (Aegilia)
  CIRCE: '#5fe08a',       // venom green (Aeaea)
  HELIOS: '#edc24a',      // burnt gold (Thrinacia)
};

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
// spans edge to edge, no walking around. Corridors are 4 wide (room to fight,
// and to FLEE — the violation-response packs chase you back through here);
// walls are 1-thick charcoal darkstone. The carve is biased hard toward LONG
// LATERAL RUNS (weighted DFS: lateral moves and keeping-straight both favoured)
// so the maze reads as sweeping switchbacks you negotiate across the band,
// not a twisty warren — long diagonals on screen, and a clearer line of sight
// when you're running for the way out. A single entrance (aligned to the
// doorway) and a single exit (aligned to the core) are cut through the ring.
// Returns the band's bottom row so the caller knows where the maze ends.
function buildMaze(map, rng, cfg) {
  const { mx0, my0, cols, rows, gateCol, wallH } = cfg;
  const CW = 4, PITCH = 5;              // 4-wide corridors, 1-wide walls
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
  const stack = [[gateCol, 0, 0, 0]]; // c, r, and the direction that led here
  visited[0][gateCol] = true; carveCell(gateCol, 0);
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (stack.length) {
    const [c, r, idc, idr] = stack[stack.length - 1];
    const opts = [];
    for (const [dc, dr] of DIRS) {
      const nc = c + dc, nr = r + dr;
      if (nc >= 0 && nc < cols && nr >= 0 && nr < rows && !visited[nr][nc]) opts.push([nc, nr, dc, dr]);
    }
    if (!opts.length) { stack.pop(); continue; }
    // Weighted pick: lateral moves count triple, and carrying straight on
    // triples again — so corridors run long (especially across the band)
    // before they turn, and the maze comes out as switchbacks, not crumbs.
    const weighted = [];
    for (const o of opts) {
      let wgt = o[3] === 0 ? 3 : 1;                      // lateral bias
      if (o[2] === idc && o[3] === idr) wgt *= 3;        // momentum
      for (let i = 0; i < wgt; i++) weighted.push(o);
    }
    const [nc, nr, dc, dr] = weighted[Math.floor(rng() * weighted.length)];
    visited[nr][nc] = true; carvePassage(c, r, nc, nr); carveCell(nc, nr); stack.push([nc, nr, dc, dr]);
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
export function createFortress(map, seed, spawn, opts = {}) {
  // Per-island parameters (R2 — the fortress-as-module abstraction). Omitting
  // opts reproduces the original raid exactly: same maze, guards, core, breach.
  //   aiName  — whose fortress this is (messages + core label). Default: the const.
  //   winMode — 'kill' (raze the core) | 'depart' (break out to the raft; R3).
  //   mazeCfg — overrides merged into buildMaze's cfg (rows / wallH / character).
  const { aiName = AI_NAME, winMode = 'kill', mazeCfg } = opts;
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
    fw: CORE, fh: CORE, footprint, ai: aiName, hp: 250, maxHp: 250, defeated: false,
    // Depart mode (R3): the daemon you leave, not the one you kill. Her core
    // cannot be razed — hitCore refuses it in-voice; the way out is the sea.
    indestructible: winMode === 'depart',
    // Kill mode: the core rides behind a shield until this island's own virus is
    // run at its terminal (main.js openCoreTerminal). No amount of hitting gets
    // through it — the raid's last lock is a code, not a bigger hammer.
    shielded: winMode === 'kill',
  });
  for (const t of footprint) map.objectGrid[t.y * w + t.x] = core;

  const coreCx = coreX + CORE / 2, coreCy = coreY + CORE / 2;

  // The AI's own console: a screen set INTO the core's SOUTH-EAST face (drawn by
  // renderer.drawMainframe when core.hasTerminal), so it is literally part of the
  // black core block, not a separate kiosk. EVERY core carries one — each daemon
  // mutters its own log to the screen and answers its own console when you reach
  // it. main.js opens it when you click the screen from close by (nearCoreTerminal).
  core.hasTerminal = true;
  // The console's hue — the island's own colour, brightened so it reads on black.
  // ONE source of truth: the SE-face screen (renderer) and the pop-up REPL (main.js)
  // both read core.screenColor, so external and internal always match. Keyed by AI
  // (CALYPSO passes no colour to the fortress), falling back to the alert colour.
  core.screenColor = CORE_SCREEN_COLOR[aiName] || opts.obAlertColor || '#8f9dff';

  // The labyrinth: a full-width band between the doorway and the sanctum. Its
  // entrance/exit column is aligned to the doorway/core so the raid runs on a
  // straight north-south axis, but the only route through is the maze solution.
  const mazeRng = makeRng((seed ^ 0x0ada) >>> 0);
  const MAZE_MX0 = 1, MAZE_PITCH = 5; // matches buildMaze's CW 4 + 1-wide walls
  const mazeCols = Math.floor((w - 2) / MAZE_PITCH);
  const gateCol = Math.max(0, Math.min(mazeCols - 1, Math.round((doorX0 + 1 - MAZE_MX0) / MAZE_PITCH)));
  const mazeBottom = buildMaze(map, mazeRng, {
    mx0: MAZE_MX0, my0: seamY + 3, cols: mazeCols, rows: 7, gateCol, wallH: 40,
    ...(mazeCfg || {}), // per-island overrides (a softer "home" layout for CALYPSO, R3)
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
    alarm: false, reportT: 0, quietT: 0, produceT: 0,
    // Skylink cut from the core console (`jam`): a breach still trips the local
    // alarm and the garrison still answers, but it no longer rouses the overworld.
    // This is where the old smashable uplink mast's capability now lives.
    jammed: false,
  };

  const nearTerminal = (px, py, r = 1.9) =>
    Math.hypot(px - (termX + 0.5), py - (termY + 0.5)) <= r;

  // Near the terminal = standing close to the core's SE corner, where its screen
  // is. Every core carries one.
  const nearCoreTerminal = (px, py, r = 2.4) =>
    Math.hypot(px - (coreX + CORE), py - (coreY + CORE)) <= r + 1.5;

  // Cut this fortress off from the overworld POSEIDON (the core console's `jam`).
  // A breach still trips the local alarm and the garrison still answers, but the
  // world is no longer roused. One-way for the run; persisted. Returns false if
  // already cut.
  const jamSkylink = () => {
    if (state.jammed) return false;
    state.jammed = true;
    return true;
  };

  const openDoor = () => {
    if (state.open) return;
    for (const d of doors) if (d) map.removeObject(d); // seam tiles fall back to walkable panel
    state.open = true;
  };

  // The SANCTUM DOOR: a second, inner gate across the maze's exit corridor, on
  // kill islands only. The Lion's Gate takes any Trojan card — getting IN is
  // still quick — but this one reads the card for THIS island's own virus, so a
  // card armed on another island walks the maze and stops here. (Depart mode
  // leaves the way to her sanctum open: CALYPSO's island is the tutorial.)
  const sanctumTiles = [];
  const sanctumDoors = [];
  if (winMode === 'kill') {
    const gx = MAZE_MX0 + gateCol * MAZE_PITCH; // matches buildMaze's cellX(gateCol)
    const sy = mazeBottom + 1;                  // the exit corridor, below the band
    for (let dx = 0; dx < 4; dx++) {            // CW = 4, the corridor width
      const t = { x: gx + dx, y: sy };
      if (!map.inBounds(t.x, t.y) || map.objectAt(t.x, t.y)) continue;
      const d = map.addObject('fortdoor', t.x, t.y, { material: RAMPART_MAT, sanctum: true });
      if (d) { sanctumTiles.push(t); sanctumDoors.push(d); }
    }
  }
  const openSanctum = () => {
    if (state.sanctumOpen) return;
    for (const d of sanctumDoors) if (d) map.removeObject(d);
    state.sanctumOpen = true;
  };

  // A direct way out: fold back the labyrinth walls along the door column so a
  // straight corridor runs from the sanctum/quad up to the Lion's Gate — a fast
  // exit after the raid (exposed to a terminal `open` command). Also opens the
  // gate itself so the run to daylight is unbroken.
  const openMaze = () => {
    if (state.mazeOpened) return false;
    state.mazeOpened = true;
    openDoor();
    openSanctum(); // the inner door is a fortdoor, not a fortwall — the fold-back
                   // below wouldn't clear it, and it would bar the fast exit.
    const x0 = Math.max(1, doorX0 - 1), x1 = Math.min(w - 2, doorX0 + DOOR_W);
    for (let y = seamY; y <= quadTop; y++) {
      for (let x = x0; x <= x1; x++) {
        const o = map.objectAt(x, y);
        if (o && o.type === 'fortwall') map.removeObject(o);
        const f = map.floorAt(x, y);
        if (f !== 'quad' && f !== 'sanctum') map.setFloor(x, y, 'quad');
      }
    }
    return true;
  };

  const controller = {
    AI_NAME: aiName,   // per-instance name; main.js reads fortress.AI_NAME
    winMode,           // 'kill' | 'depart' — the depart-mode body lands in R3
    region: { x0: 0, y0: seamY, x1: w - 1, y1: southY },
    seamY,
    door: { x0: doorX0, x1: doorX0 + DOOR_W - 1, y: seamY, cx: doorX0 + DOOR_W / 2 },
    terminal: { x: termX, y: termY, obj: terminal },
    coreTerminal: { x: coreCx, y: coreCy, obj: core }, // the sanctum console (the screen on the core's SE face)
    core: { obj: core, x: coreCx, y: coreCy, tx: coreX, ty: coreY, fw: CORE, fh: CORE },
    quad: { top: quadTop, bottom: quadBottom, muster }, // the guard courtyard + muster points
    jamSkylink,
    get alarm() { return state.alarm; },
    get jammed() { return state.jammed; },
    get reportProgress() { return Math.min(1, state.reportT / REPORT_DELAY); }, // 0..1 toward the breach report
    get hacked() { return state.hacked; },
    get open() { return state.open; },

    nearTerminal,
    nearCoreTerminal,
    openMaze,
    get mazeOpened() { return !!state.mazeOpened; },

    // The dormant patrol: one or two light M4 report drones on the quad's
    // muster points. On a DEPART island that is the whole standing garrison,
    // and the M5/M6 come only once the breach reports (the alarm in update asks
    // main.js for the wave). Kill islands additionally garrison the labyrinth
    // itself up front — see garrisonMaze below. `spawnM4` is passed in so this
    // module never imports robots.js.
    spawnGuards(spawnM4) {
      const guards = [];
      muster.slice(0, 2).forEach((m, i) => {
        const g = spawnM4(map, (seed ^ (0x6a11 + i * 977)) >>> 0, m.x, m.y);
        if (g) guards.push(g);
      });
      return guards;
    },

    // Garrison the LABYRINTH itself — kill-mode islands only. Without this the
    // maze is an empty walk: two light scouts on the quad and nothing in the
    // corridors, so the raid is won before the alarm ever trips. Here M6 pack
    // robots patrol the corridors and M5 snipers hold the deep straights nearer
    // the sanctum, seated far apart (minGap) and never in the gate mouth, so
    // stepping through the door is not an instant ambush.
    //
    // They spawn UNAGGRO'd on purpose: the M-classes acquire by genuine sight
    // only (line of sight, in range, inside the cone), so a careful raider can
    // still ghost the maze — it is a stealth problem now, not an empty hallway.
    // CALYPSO is deliberately exempt (winMode 'depart'): her island is the
    // tutorial, and her guards detain rather than kill (R3).
    garrisonMaze(spawnM6, spawnM5, cfg = {}) {
      if (winMode !== 'kill') return [];
      const { m6 = 5, m5 = 3, minGap = 7, mouthClear = 7 } = cfg;
      const rng = makeRng((seed ^ 0x9a12c0) >>> 0);
      const top = seamY + 3, bottom = mazeBottom;
      // Open corridor tiles: the maze's walls are `fortwall` objects, so an
      // unoccupied tile in the band is corridor.
      const cells = [];
      for (let y = top; y <= bottom; y++) {
        for (let x = 1; x < w - 1; x++) {
          if (map.objectAt(x, y)) continue;
          const f = map.floorAt(x, y);
          if (f === 'water' || f === 'sea' || f === 'stream') continue;
          // Leave the entrance mouth clear — you get a few steps inside before
          // anything can see you.
          if (y < top + mouthClear && Math.abs(x - (doorX0 + 1)) < 6) continue;
          cells.push({ x: x + 0.5, y: y + 0.5 });
        }
      }
      if (!cells.length) return [];
      const placed = [];
      const guards = [];
      // Seat `n` guards of one class, spread by minGap. `deep` biases the pick
      // toward the bottom of the band (the sniper posts nearer the sanctum).
      const seat = (n, spawn, deep, tag) => {
        for (let i = 0; i < n; i++) {
          let spot = null;
          for (let tries = 0; tries < 60 && !spot; tries++) {
            const pool = deep ? cells.filter((c) => c.y > top + (bottom - top) * 0.45) : cells;
            if (!pool.length) break;
            const c = pool[Math.floor(rng() * pool.length)];
            if (placed.some((p) => Math.hypot(p.x - c.x, p.y - c.y) < minGap)) continue;
            spot = c;
          }
          if (!spot) continue;
          const g = spawn(map, Math.floor(rng() * 0x7fffffff), spot.x, spot.y);
          if (!g) continue;
          g.aggro = false;              // acquire by sight, so stealth still works
          if (tag === 'm5') g.holdPos = { x: spot.x, y: spot.y }; // snipe from this post, don't chase
          placed.push(spot);
          guards.push(g);
        }
      };
      seat(m6, spawnM6, false, 'm6');
      seat(m5, spawnM5, true, 'm5');
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
        return { ok: false, msg: `${aiName}'s doorway is already unlocked. The key is yours.` };
      }
      state.hacked = true;
      for (const d of doors) if (d) d.hacked = true; // lock beacons turn green
      return { ok: true, msg: `Bolts disengage across the rampart. Bring a Trojan card up to the Lion's Gate and it opens.` };
    },

    // Per-frame: once you carry the key up to the doorway, it swings open.
    update(dt, player, robots, world) {
      // The AI is dead: the fortress is inert — no alarm, no manufacture, and the
      // maze sconces stop strobing. (The island power-down itself is handled by
      // main.js's onCoreDefeated hook, kept island-agnostic there.)
      if (core.defeated) { state.alarm = false; map.fortressAlarm = false; return; }
      // The Lion's Gate opens to a Trojan card (its factory-id.ml + root-access.ml
      // read at the gate) — the escape-chain hack IS the way in now; the old
      // fortress_key is retired. Bare ai_key won't do it; refunction it first.
      if (!state.open && player.hasTrojanCard && player.hasTrojanCard()) {
        if (Math.abs(player.y - seamY) <= 2.5 && player.x >= doorX0 - 1.5 && player.x <= doorX0 + DOOR_W + 0.5) {
          openDoor();
          player.say(`The Trojan card reads at the Lion's Gate. ${aiName}'s rampart grinds open.`);
          if (!state.announced) { state.announced = true; player.addScore?.(40); }
        }
      }
      // The SANCTUM DOOR at the maze's mouth onto the quad. It reads the card
      // for THIS island's virus — a card armed elsewhere gets you all the way
      // here and no further, which is the whole point of the per-island code.
      if (sanctumDoors.length && !state.sanctumOpen) {
        const nearSanctum = sanctumTiles.some((t) => Math.abs(player.y - t.y) <= 2.2 && Math.abs(player.x - t.x) <= 2.2);
        if (nearSanctum) {
          if (player.hasVirusFor && player.hasVirusFor(aiName)) {
            openSanctum();
            player.say(`The sanctum door reads ${aiName}'s own code off your card and draws back.`);
            player.addScore?.(60);
          } else if (!state._sanctumTold || state._sanctumTold < 1) {
            state._sanctumTold = 1;
            player.say(`A second door bars the way to ${aiName}'s sanctum. It wants ${aiName}'s OWN code — forged at a relay on this island. A card armed elsewhere means nothing to it.`);
          }
        } else if (state._sanctumTold) {
          state._sanctumTold = 0; // step away and it will tell you again next time
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
            player.say(`A drone reports the breach. ${aiName} rouses — the core throws its guard down the maze at you.`);
            if (world && world.spawnWave) world.spawnWave(4, 2); // first response: a full pack + snipers
            // The fortress is wired into the overworld POSEIDON: a reported breach
            // rouses the whole island (obelisks flare, the factory scrambles a
            // hunter) — UNLESS you cut the link at the core console (`jam`). That
            // is where the old smashable uplink mast's job now lives.
            if (!state.jammed && world && world.stir) world.stir();
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

    // Save/restore the fortress's mutable state so a loaded game resumes the
    // raid mid-progress — doors, core health/defeat — not just the world around
    // it. Transient timers and the alarm are not persisted: the alarm re-trips
    // if a guard still sees you. (Save/load, main.js's persist/restore.)
    serialize() {
      return {
        hacked: state.hacked,
        open: state.open,
        coreHp: core.hp,
        coreDefeated: !!core.defeated,
        coreShielded: !!core.shielded, // the virus you already ran stays run
        sanctumOpen: !!state.sanctumOpen,
        jammed: state.jammed,
      };
    },
    restore(snap) {
      if (!snap) return;
      if (snap.hacked) { state.hacked = true; for (const d of doors) if (d) d.hacked = true; }
      if (snap.open) openDoor(); // removes the door objects + sets state.open
      if (typeof snap.coreHp === 'number') core.hp = snap.coreHp;
      if (snap.coreDefeated) core.defeated = true;
      if (typeof snap.coreShielded === 'boolean') core.shielded = snap.coreShielded;
      if (snap.sanctumOpen) openSanctum();
      if (snap.jammed) state.jammed = true;
    },

    // Markers for the RON-ML `map` overlay.
    markers() {
      return {
        gate: { x: doorX0 + DOOR_W / 2, y: seamY, open: state.open, hacked: state.hacked },
        core: { x: coreCx, y: coreCy, ai: aiName, defeated: core.defeated },
      };
    },
  };
  // Self-register as a system (docs/refactor-registry.md), order 35 = the "world
  // events" band, so it ticks after dayNight (20) and before lore (80). The hub
  // no longer calls fortress.update directly; it runs via systems.runUpdate.
  register({
    name: 'fortress',
    order: 35,
    update: (w) => controller.update(w.dt, w.player, w.robots, w.worldStir),
  });
  return controller;
}
