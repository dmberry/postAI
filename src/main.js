import { Renderer } from './engine/renderer.js';
import { Camera } from './engine/camera.js';
import { Input } from './engine/input.js';
import { buildWorld } from './game/worldgen.js';
import { spawnAnimals, updateAnimals } from './game/animals.js';
import { Player } from './game/player.js';
import { makeRng } from './game/rng.js';
import { DayNight } from './game/daynight.js';
import { Minimap } from './game/minimap.js';
import { spawnBirds, updateBirds } from './game/birds.js';
import { spawnRobots, updateRobots, spawnW1s, spawnW3, spawnW4, spawnW5, spawnM6, spawnGuard, drawRobot } from './game/robots.js';
import { resolveBodyOverlaps } from './game/collision.js';
import { spawnWaterDroids, updateWaterDroids, drawWaterDroid } from './game/waterdroids.js';
import { Lore, FRAGMENTS } from './game/lore.js';
import { ITEMS, TAPES } from './game/items.js';
import { sfx } from './engine/sound.js';
import { worldToScreen } from './engine/iso.js';
import { runRonml } from './game/ronml.js';
import { createEliza } from './game/eliza.js';
import { placeTors, HERMES_DOCS, hermesTopics } from './game/hermes.js';
import { VERSION } from './version.js';
import { drawRobotVision } from './game/robotvision.js';
import { screenDirToWorld } from './engine/iso.js';
import { stampCoast } from './engine/coast.js';
import { placeRuins } from './game/ruins.js';
import { createFortress } from './game/fortress.js';
import { createUnderworldPocket, spawnUnderworldCreature, updateUnderworldCreatures } from './game/underworld.js';
import { CHOIR_NOTES, CHOIR_DURATION } from './engine/choir-notes.js';

// Note onsets split into four pitch registers, so each singing machine can be
// put on a different vocal "part" and its red light flashes to that part's
// notes — a choir of out-of-step blinking lights (see the flash sync in the
// update loop and Robots.sensorStyle).
const CHOIR_REGISTERS = (() => {
  const bands = [[], [], [], []];
  const lo = 45, span = (72 - 45) / 4;
  for (const [t, , m] of CHOIR_NOTES) {
    bands[Math.max(0, Math.min(3, Math.floor((m - lo) / span)))].push(t);
  }
  return bands.map((a) => a.sort((x, y) => x - y));
})();

// Each new game gets its own random seed, persisted so a continuing run
// (autosave) always regenerates the same map. Without this every playthrough
// put weapons and caches in identical spots — easy to memorise.
const SEED_KEY = 'postai-seed';
function loadOrCreateSeed() {
  try {
    const saved = localStorage.getItem(SEED_KEY);
    const n = saved && parseInt(saved, 10);
    if (Number.isFinite(n) && n > 0) return n;
  } catch { /* storage unavailable */ }
  const seed = 1 + Math.floor(Math.random() * 0x7ffffffe);
  try { localStorage.setItem(SEED_KEY, String(seed)); } catch { /* storage unavailable */ }
  return seed;
}
const WORLD_SEED = loadOrCreateSeed();

const canvas = document.getElementById('game');
const renderer = new Renderer(canvas);
const input = new Input(window, canvas);
let { map, spawn } = buildWorld(WORLD_SEED);
const overworldMap = map; // stable handle: `map` gets reassigned to the underworld pocket and back
const player = new Player(spawn.x, spawn.y);
player.map = map; // for death drops when damage comes from animals (kept in sync on underworld enter/exit)
const animals = spawnAnimals(map, WORLD_SEED, { x: spawn.x, y: spawn.y, r: 12 });

// Scatter loot: torches and tinned food in building interiors (night and
// hunger both push you to scavenge), berries in the tallgrass meadows.
{
  const rng = makeRng(WORLD_SEED ^ 0x7031);
  const boards = [], tallgrass = [];
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      const f = map.floorAt(x, y);
      if (f === 'boards') boards.push([x, y]);
      else if (f === 'tallgrass') tallgrass.push([x, y]);
    }
  }
  const drop = (list, item, qty) => {
    if (!list.length) return;
    const [x, y] = list[Math.floor(rng() * list.length)];
    // keep: true — world-placed loot never decays. Only things that appear
    // during play (combat drops, items you drop, loot spilled from an opened
    // box) run the decay timer, so the world isn't stripped bare before you
    // reach it, and a cache still holds its prize whenever you find it.
    map.groundItems.push({ item, qty, x: x + 0.5, y: y + 0.5, keep: true });
  };
  for (let i = 0; i < 12; i++) drop(boards, 'torch', 1);
  for (let i = 0; i < 14; i++) drop(boards, 'tin', 1);
  for (let i = 0; i < 16; i++) drop(tallgrass, 'berries', 2 + Math.floor(rng() * 2));
  // Books are rarer: one copy of each plus two duplicates, buildings only.
  const books = ['book_wood', 'book_herbs', 'book_track', 'book_run', 'book_herbs', 'book_track'];
  for (const b of books) drop(boards, b, 1);
  // A single backpack, somewhere in the ruins.
  drop(boards, 'backpack', 1);
  // A few more spare backpacks dropped out in the forests, where they're
  // easier to stumble on than deep in the ruins: open grass tiles that sit
  // next to a tree (so they read as "in the woods", not on bare meadow).
  const forestGrass = [];
  for (let y = 1; y < map.h - 1; y++) {
    for (let x = 1; x < map.w - 1; x++) {
      if (map.floorAt(x, y) !== 'grass' || map.objectAt(x, y)) continue;
      let nearTree = false;
      for (let dy = -1; dy <= 1 && !nearTree; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const o = map.objectAt(x + dx, y + dy);
          if (o && o.type === 'tree') { nearTree = true; break; }
        }
      }
      if (nearTree) forestGrass.push([x, y]);
    }
  }
  for (let i = 0; i < 4; i++) drop(forestGrass, 'backpack', 1);
  // Torn pages of the RON-ML manual, scattered — mostly in the ruins, a couple
  // out in the woods — as loose scraps that echo the bound manual in the caches.
  for (let i = 0; i < 4; i++) drop(boards, 'ronml_page', 1);
  for (let i = 0; i < 2; i++) drop(forestGrass, 'ronml_page', 1);
  // Cassette tapes for the walkman. Every tape EXCEPT the WARD "bear stanhope"
  // one is scattered in the overworld ruins, two copies each (one in a building,
  // one out in the forest) so a lost tape is always recoverable. WARD is the
  // Backspace's own — it turns up only down there (see underworld.js).
  for (const t of TAPES) {
    if (t.num === 3) continue; // WARD: Backspace only
    drop(boards, `tape_${t.num}`, 1);
    drop(forestGrass, `tape_${t.num}`, 1);
  }
}

// The AIs control the landscape: black obelisk towers dot the wilds (their
// signal network; destructible in a later phase), each garrisoned by
// T-class hunter robots. The resistance hides weapon caches in buildings.
const obelisks = [];
{
  const rng = makeRng(WORLD_SEED ^ 0x0b31);
  let guard = 0;
  while (obelisks.length < 12 && guard++ < 5000) {
    const x = 4 + Math.floor(rng() * (map.w - 8));
    const y = 4 + Math.floor(rng() * (map.h - 8));
    const f = map.floorAt(x, y);
    if ((f !== 'grass' && f !== 'tallgrass') || map.objectAt(x, y)) continue;
    if (Math.hypot(x - spawn.x, y - spawn.y) < 16) continue;
    if (obelisks.some((o) => Math.hypot(o.x - x, o.y - y) < 14)) continue;
    // OB classes: exactly ONE tower in the world is the SIREN — a singular,
    // teal-lit landmark whose song pulls you in up close (see the obelisk loop
    // below). The first obelisk placed is it; every other is standard.
    const cls = obelisks.length === 0 ? 'siren' : undefined;
    map.addObject('obelisk', x, y, { cls });
    obelisks.push({ x, y });
  }

  // Resistance caches: searchable boxes on interior tiles (never doorways:
  // all four neighbours must be boards too).
  const inner = [];
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      if (map.floorAt(x, y) !== 'boards' || map.objectAt(x, y)) continue;
      if (map.floorAt(x + 1, y) === 'boards' && map.floorAt(x - 1, y) === 'boards'
        && map.floorAt(x, y + 1) === 'boards' && map.floorAt(x, y - 1) === 'boards') {
        inner.push([x, y]);
      }
    }
  }
  // Group interior tiles by connected board region — one per house/room in
  // practice, since a doorway gap always breaks the 4-connectivity between
  // buildings — so no single building can be flooded with every cache in
  // reach: capped at BOXES_PER_HOUSE below.
  const BOXES_PER_HOUSE = 5;
  const houseOf = new Map(); // "x,y" -> house index
  {
    const innerSet = new Set(inner.map(([x, y]) => `${x},${y}`));
    let houseId = 0;
    for (const [sx, sy] of inner) {
      const key0 = `${sx},${sy}`;
      if (houseOf.has(key0)) continue;
      const stack = [[sx, sy]];
      houseOf.set(key0, houseId);
      while (stack.length) {
        const [cx, cy] = stack.pop();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nk = `${cx + dx},${cy + dy}`;
          if (innerSet.has(nk) && !houseOf.has(nk)) {
            houseOf.set(nk, houseId);
            stack.push([cx + dx, cy + dy]);
          }
        }
      }
      houseId++;
    }
  }
  const houseBoxCount = new Map(); // house index -> boxes placed so far
  const bumpHouse = (x, y) => {
    const h = houseOf.get(`${x},${y}`);
    houseBoxCount.set(h, (houseBoxCount.get(h) || 0) + 1);
  };
  const houseFull = (x, y) => (houseBoxCount.get(houseOf.get(`${x},${y}`)) || 0) >= BOXES_PER_HOUSE;
  // A hand-picked "welcome kit": the resistance building nearest spawn gets
  // a backpack, a shield, a decent ranged weapon and some food together in
  // one box, so a new run's very first find is worth a detour for. It's the
  // one box the renderer nudges a beginner toward with a pulsing glow (see
  // drawBox / Player.threatEase) — the glow fades on its own once the
  // player no longer reads as a beginner.
  if (inner.length) {
    inner.sort((a, b) => Math.hypot(a[0] - spawn.x, a[1] - spawn.y) - Math.hypot(b[0] - spawn.x, b[1] - spawn.y));
    const [sx, sy] = inner.shift();
    bumpHouse(sx, sy);
    const starterLoot = [
      { item: 'backpack', qty: 1 },
      { item: 'shield', qty: 1 },
      { item: 'shotgun', qty: 1 }, { item: 'shells', qty: 8 },
      { item: 'tin', qty: 2 }, { item: 'berries', qty: 3 },
    ];
    map.addObject('box', sx, sy, { loot: starterLoot, opened: false, starterCache: true });
  }
  // Each cache holds a list of drops. The first few are guaranteed so every
  // run can find the key anti-machine gear; the rest roll on a table.
  // Ammo/battery quantities doubled from their original defaults — the
  // railgun (batteries) and other guns were running dry far too fast.
  const guaranteed = [
    [{ item: 'stungun', qty: 1 }, { item: 'battery', qty: 4 }],
    [{ item: 'pistol', qty: 1 }, { item: 'ammo', qty: 12 }],
    [{ item: 'electrogun', qty: 1 }, { item: 'battery', qty: 2 }],
    [{ item: 'shotgun', qty: 1 }, { item: 'shells', qty: 8 }],
    [{ item: 'crowbar', qty: 1 }],
    [{ item: 'battery', qty: 4 }],
    // Exactly one Wi-Fi block per world: rare, in a random guaranteed cache.
    [{ item: 'wifiblock', qty: 1 }, { item: 'battery', qty: 4 }],
    // A shovel for digging robot traps.
    [{ item: 'shovel', qty: 1 }],
    // A saw: fells trees fast and scores more per tree.
    [{ item: 'saw', qty: 1 }],
    // Demolition caches: a couple of bombs to get you started.
    [{ item: 'bomb_small', qty: 1 }, { item: 'bomb_small', qty: 1 }],
    [{ item: 'bomb_medium', qty: 1 }],
    // Late-game weapons: previously defined in ITEMS but never actually
    // placed anywhere in the world, so they were unobtainable in play.
    [{ item: 'bow', qty: 1 }, { item: 'arrow', qty: 24 }],
    [{ item: 'katana', qty: 1 }],
    [{ item: 'sledgehammer', qty: 1 }],
    [{ item: 'railgun', qty: 1 }, { item: 'battery', qty: 14 }],
    // Every remaining tool/weapon in ITEMS gets at least one guaranteed
    // spawn too — except the wave gun and OB-gun, which stay crafting-only.
    [{ item: 'penknife', qty: 1 }],
    [{ item: 'seatbelt', qty: 1 }],
    [{ item: 'bat', qty: 1 }],
    [{ item: 'machete', qty: 1 }],
    // Defensive gear: a plain riot shield (common-ish), a rarer mirror shield
    // that reflects lasers, and a single very rare forcefield with a few
    // cells to run it.
    [{ item: 'shield', qty: 1 }],
    [{ item: 'mirror_shield', qty: 1 }, { item: 'battery', qty: 2 }],
    [{ item: 'forcefield', qty: 1 }, { item: 'battery', qty: 4 }],
    // A navigation aid: the electro-compass.
    [{ item: 'compass', qty: 1 }],
    // The access chip: your interface into the obelisk terminals.
    [{ item: 'chip', qty: 1 }],
    // The RON-ML manual: teaches the terminal console language.
    [{ item: 'book_ronml', qty: 1 }],
    // A single battered can of Ubik, somewhere in the ruins.
    [{ item: 'ubik', qty: 1 }],
  ];
  const rollLoot = () => {
    const r = rng();
    if (r < 0.28) {
      const MELEE = ['crowbar', 'bat', 'machete', 'crowbar'];
      return [{ item: MELEE[Math.floor(rng() * MELEE.length)], qty: 1 }];
    }
    if (r < 0.58) {
      const AMMO = [
        [{ item: 'battery', qty: 4 }],
        [{ item: 'ammo', qty: 12 }],
        [{ item: 'shells', qty: 8 }],
      ];
      return AMMO[Math.floor(rng() * AMMO.length)];
    }
    // Bombs: small/medium common, large uncommon, insane a rare find.
    if (r < 0.80) {
      const br = rng();
      const bomb = br < 0.45 ? 'bomb_small' : br < 0.78 ? 'bomb_medium' : br < 0.97 ? 'bomb_large' : 'bomb_insane';
      return [{ item: bomb, qty: 1 }];
    }
    return rng() < 0.5 ? [{ item: 'tin', qty: 1 }] : [{ item: 'torch', qty: 1 }];
  };
  // At least as many boxes as guaranteed drops, plus a healthy handful left
  // over to roll on the random table.
  const boxCount = Math.max(20, guaranteed.length + 9);
  for (let i = 0; i < boxCount && inner.length; i++) {
    // Pick uniformly among tiles whose house hasn't hit BOXES_PER_HOUSE yet;
    // stop placing early if every remaining house is already full.
    const eligible = [];
    for (let k = 0; k < inner.length; k++) if (!houseFull(inner[k][0], inner[k][1])) eligible.push(k);
    if (!eligible.length) break;
    const pick = eligible[Math.floor(rng() * eligible.length)];
    const [x, y] = inner.splice(pick, 1)[0];
    bumpHouse(x, y);
    const loot = i < guaranteed.length ? guaranteed[i] : rollLoot();
    map.addObject('box', x, y, { loot, opened: false });
  }
  // A chip is the only way into a terminal, so the world must always contain
  // one in a box — even if interior tiles ran short before the chip's
  // guaranteed cache (late in the list) was placed. Backstop it here.
  const boxes = map.objects.filter((o) => o.type === 'box');
  if (boxes.length && !boxes.some((b) => (b.loot || []).some((l) => l.item === 'chip'))) {
    const b = boxes[Math.floor(rng() * boxes.length)];
    (b.loot ??= []).push({ item: 'chip', qty: 1 });
  }
}

// The W-factory: the AI's foundry for repair drones. It never attacks on
// its own, but every so often — while any obelisk is damaged but not yet
// toppled — it fields a W3 to go and mend one.
let wfactory = null;
{
  const rng = makeRng(WORLD_SEED ^ 0x5a11c0de);
  const FW = 8, FH = 8;               // a big 8x8 industrial structure
  const FACTORY_HP = 420;             // takes a long, committed assault to bring down
  let guard = 0;
  while (!wfactory && guard++ < 8000) {
    const x = 4 + Math.floor(rng() * (map.w - FW - 8));
    const y = 4 + Math.floor(rng() * (map.h - FH - 8));
    // The whole 8x8 footprint must be clear, flat, grassy ground.
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
    // Every footprint tile points back at the one factory object, so it's
    // solid across its whole 8x8 and a hit anywhere on it counts.
    for (const t of footprint) map.objectGrid[t.y * map.w + t.x] = wfactory;
  }
}
// The dispatch/repair code fires from the factory's centre, and stops once
// it's destroyed.
const factoryLive = () => wfactory && !wfactory.destroyed;
// Dispatch point for new machines: the centre column but just SOUTH of the
// 8x8 footprint, so they're built onto open ground beside the factory rather
// than stuck inside its solid block.
const factoryCx = () => wfactory.x + (wfactory.fw || 1) / 2;
const factoryCy = () => wfactory.y + (wfactory.fh || 1) + 1.5;

const robots = spawnRobots(map, WORLD_SEED, obelisks, { x: spawn.x, y: spawn.y, r: 14 });
// A couple of gardener drones already out wandering the world at the start, at
// random spots away from the remote factory, so you actually come across one
// early instead of it only ever spawning at the (distant) factory. The factory
// clock below keeps roughly this many topped up over time.
for (let placed = 0, tries = 0; placed < 2 && tries < 120; tries++) {
  const gx = 6 + Math.floor(Math.random() * (map.w - 12));
  const gy = 6 + Math.floor(Math.random() * (map.h - 12));
  const g = spawnW5(map, (WORLD_SEED ^ (0x5ad + placed * 131)) >>> 0, gx, gy);
  if (g) { robots.push(g); placed++; }
}
const waterdroids = spawnWaterDroids(map, WORLD_SEED);
// The tower objects themselves (for alert/blink state): {x,y} plus the
// alert level cannot live on the plain {x,y} obelisks list, since that's
// shared with spawnRobots as a read-only anchor list.
const obeliskObjs = obelisks.map((o) => map.objectAt(o.x, o.y)).filter(Boolean);
for (const ob of obeliskObjs) {
  ob.alert = 0; ob.blinkFlash = 0; ob._blinkT = 2 + Math.random() * 5; ob._nudgeT = 0;
  // A hex code name identifying this tower, so the kill record can list it.
  ob.code = 'OB-' + ((ob.x * 4096 + ob.y * 31) & 0xffff).toString(16).toUpperCase().padStart(4, '0');
}
// RON's hilltop TOR relays — the friendly HERMES terminals, the counter-system
// to the AI obelisks. Placed on the summits (see placeTors); their objects live
// in the map grid, and torObjs holds them for click detection.
const torPlacements = placeTors(map, makeRng(WORLD_SEED ^ 0x40b1e5), { spawn, count: 4 });
const torObjs = torPlacements.map((t) => map.objectAt(t.x, t.y)).filter(Boolean);

// One fortress key is coughed up the first time a node is properly crashed
// (the composed `let k = hack OB in crash OB k` — see crashNode).
let fortressKeyFromCrash = false;
// Every obelisk is assigned one of the eight circuit-board numbers, spread
// round-robin then shuffled, so destroying towers always guarantees full
// coverage of 1-8 (rather than random drops that could dupe forever).
{
  const rng = makeRng(WORLD_SEED ^ 0xc1c0de);
  const nums = obeliskObjs.map((_, i) => (i % 8) + 1);
  for (let i = nums.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [nums[i], nums[j]] = [nums[j], nums[i]];
  }
  obeliskObjs.forEach((ob, i) => { ob.circuitNum = nums[i]; });
}

// Adamantine's fortress — the first of the four AIs. Grown as a sealed annex
// onto the south edge of the map (all overworld spawning above has already
// happened on the 128x128 grid, so the annex stays clean). Reached only by
// hacking the boundary gate terminal in RON-ML. `mainframe` points at the core
// so the existing map overlay marks it; `fortress` owns the gate/door logic.
const fortress = createFortress(map, WORLD_SEED, spawn);
// The fortress AI is ZEUS (the old fortress.js name was "Adamantine"); override
// the exposed name so every main.js-side display (gate terminal, unlock message)
// reads ZEUS. NB: a couple of strings baked inside fortress.js still say the old
// name until that file (Henrik's) is updated.
fortress.AI_NAME = 'ZEUS';
const mainframe = fortress.core; // { x, y } of the core, for the RON-ML map star
// Ring the island in sea: stamp a dithered sand+water coast into the border
// tiles now that the towers, relays and fortress are placed (so it leaves them
// standing). Beyond the outer water band the map edge is still the hard bound,
// with the open ocean drawn past it.
stampCoast(map, spawn);
// Ruined marble columns: a few groves of fallen temple columns strewn across
// the island, after the coast so none land in the sea.
placeRuins(map, makeRng(WORLD_SEED ^ 0x2c01dd), { spawn, clusters: 4 });
// The quad's standing patrol: five M6 guards (3 sentinels + 2 marksmen).
robots.push(...fortress.spawnGuards(spawnM6));
// "Red starlink": when the fortress breach reaches the world (alarm + uplink
// intact), every overworld obelisk flares red (its `stirred` flag forces the
// alert glow, HUD untouched) and the W-factory throws a W4 toward the doorway.
// `calm` clears the flare when the fortress stands down or the uplink is cut.
const worldStir = {
  stir() {
    for (const o of obeliskObjs) if (!o.destroyed) o.stirred = true;
    if (factoryLive()) {
      const w4 = spawnW4(map, Math.floor(Math.random() * 0x7fffffff), factoryCx(), factoryCy());
      if (w4) { robots.push(w4); }
    }
    player.say('Red light runs the length of the POSEIDON — the whole network knows where you are.');
  },
  calm() {
    for (const o of obeliskObjs) o.stirred = false;
  },
};

// Character persona and learned skills persist across sessions and deaths.
const SAVE_KEY = 'postai-character';
// Name and gender live in their own durable key, separate from the run save.
// Dying or starting a New Game wipes score/skills/inventory (fullReset below)
// but should not make you re-pick who you are — that identity outlives runs.
const IDENTITY_KEY = 'postai-identity';
try {
  const identity = JSON.parse(localStorage.getItem(IDENTITY_KEY) || 'null');
  if (identity) player.setPersona(identity.name || player.name, identity.gender || player.gender);
} catch { /* corrupt: keep the default persona */ }
let hadExistingSave = false;
try {
  const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
  if (saved) {
    hadExistingSave = true;
    player.setPersona(saved.name || 'Adam', saved.gender || 'm');
    for (const s of saved.skills || []) player.skills.add(s);
    if (Array.isArray(saved.skillLog)) player.skillLog = saved.skillLog;
    if (Array.isArray(saved.weaponsFound)) player.weaponsFound = new Set(saved.weaponsFound);
    if (Array.isArray(saved.killLog)) player.killLog = saved.killLog;
    if (Array.isArray(saved.circuitNums)) player.circuitNums = new Set(saved.circuitNums);
    if (saved.xp) Object.assign(player.xp, saved.xp);
    if (typeof saved.score === 'number') player.score = saved.score;
    if (typeof saved.deaths === 'number') player.deaths = saved.deaths;
    // Restore the in-progress run (vitals, position, inventory) so the game
    // picks up where you left off. The world itself regenerates from the seed.
    const st = saved.state;
    if (st) {
      for (const k of ['health', 'stamina', 'food', 'venom', 'wifiPower', 'x', 'y', 'hands']) {
        if (st[k] !== undefined) player[k] = st[k];
      }
      if (Array.isArray(st.pockets)) player.pockets = st.pockets;
      if (st.backpack) player.backpack = st.backpack;
      if (st.walkman !== undefined) player.walkman = st.walkman; // null = tape moved out, respected across reload
    }
    // Guard against stale item keys carried over from a save written by an
    // earlier build — e.g. the pre-v1.15 tape keys (tape_ward / tape_meme),
    // renamed to tape_1..3 when tapes became data-driven. An orphaned key
    // resolves to an undefined item def, and the HUD renderer dereferences it
    // every frame (drawCassette, pocket labels), so a single dead key hard-
    // crashes the whole render loop before textures even finish loading. Drop
    // anything the current ITEMS table no longer knows about.
    const validStack = (s) => (s && ITEMS[s.item]) ? s : null;
    player.pockets = (Array.isArray(player.pockets) ? player.pockets : []).map(validStack);
    while (player.pockets.length < 4) player.pockets.push(null);
    if (player.hands && !ITEMS[player.hands]) player.hands = null;
    if (player.walkman && !ITEMS[player.walkman.item]) { player.walkman = { item: 'tape_1', qty: 1 }; player.walkmanSide = null; }
    if (player.backpack) {
      if (player.backpack.weapon && !ITEMS[player.backpack.weapon]) player.backpack.weapon = null;
      if (Array.isArray(player.backpack.slots)) player.backpack.slots = player.backpack.slots.map(validStack);
    }
  }
} catch { /* corrupt save: start fresh */ }
// Set just before New Game reloads, so the beforeunload/visibilitychange
// autosave below can't silently rewrite the character save out from under
// the reset the player just confirmed.
let resettingGame = false;
// Wipes every trace of the current run — character save, lore progress,
// world seed — and reloads to a freshly shuffled world. Used by New Game
// (after a confirm) and, unconditionally, whenever the player dies.
function fullReset() {
  resettingGame = true; // block the beforeunload/hidden autosave from undoing this
  localStorage.removeItem('postai-character');
  localStorage.removeItem('postai-lore');
  localStorage.removeItem(SEED_KEY);
  location.reload();
}
const persist = () => {
  if (resettingGame) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      name: player.name, gender: player.gender, skills: [...player.skills], skillLog: player.skillLog,
      weaponsFound: [...player.weaponsFound], killLog: player.killLog, circuitNums: [...player.circuitNums],
      xp: player.xp, score: player.score, deaths: player.deaths || 0,
      state: {
        health: player.health, stamina: player.stamina, food: player.food, venom: player.venom,
        wifiPower: player.wifiPower, x: player.x, y: player.y, hands: player.hands,
        pockets: player.pockets, backpack: player.backpack, walkman: player.walkman,
      },
    }));
    localStorage.setItem(IDENTITY_KEY, JSON.stringify({ name: player.name, gender: player.gender }));
  } catch { /* storage unavailable */ }
};
player.onSkillLearned = persist;
player.onXpGain = persist;
player.onScore = persist;
player.onDeath = persist;
player.onWeaponFound = persist;
// Autosave the run periodically and when the tab is hidden or closed.
let saveClock = 0;
window.addEventListener('beforeunload', persist);
document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });

// Warn before a reload/close, since it wipes score and the obelisk kill
// record (below) — but not during New Game's own reload, which already had
// its own confirm and is an intentional clean reset, not an accidental one.
window.addEventListener('beforeunload', (e) => {
  if (resettingGame) return;
  e.preventDefault();
  e.returnValue = ''; // most browsers require this to show their own prompt
});

// Reloading the page (F5, etc.) isn't a clean reset — it just re-loads the
// same save — so unlike New Game (which wipes everything and shuffles a
// fresh world too) it costs you: your score and obelisk kill record are wiped
// clean, so reload can't be used as a free undo out of a bad fight.
if (hadExistingSave) {
  player.score = 0;
  player.killLog = [];
  persist();
  player.say('The feed glitches on reconnect: score and obelisk kill record wiped clean.');
}

// Character picker in the help modal.
const nameInput = document.getElementById('charName');
nameInput.value = player.name;
for (const btn of document.querySelectorAll('#help button[data-gender]')) {
  btn.addEventListener('click', () => {
    player.setPersona(btn.textContent.trim(), btn.dataset.gender);
    nameInput.value = player.name;
    persist();
  });
}
const saveName = () => {
  const v = nameInput.value.trim();
  if (!v) return;
  player.name = v;
  persist();
  const btn = document.getElementById('charNameSave');
  if (btn) {
    const original = btn.textContent;
    btn.textContent = 'Saved!';
    setTimeout(() => { btn.textContent = original; }, 1200);
  }
};
nameInput.addEventListener('change', saveName);
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveName(); });
document.getElementById('charNameSave').addEventListener('click', saveName);

// Machine gallery in the help modal: renders each robot type through its
// own real draw function onto a small offscreen canvas, so the picture is
// exactly what you'll meet in the world rather than a separately drawn
// icon that could drift out of sync with it.
function renderMachineIcon(type) {
  const size = 96;
  const off = document.createElement('canvas');
  off.width = size; off.height = size;
  const octx = off.getContext('2d');
  // Scale the world-space robot draw up so it fills the box: at 1:1 the
  // renderer draws a machine at its ~30px in-world size, which sits lost in
  // the middle of a 96px chip. 1.9x brings it up close to the edges without
  // clipping the tallest ones (the W-class towers).
  octx.translate(size / 2, size * 0.82);
  octx.scale(1.9, 1.9);
  if (type === 'w2') {
    drawWaterDroid(octx, { type: 'w2', x: 0, y: 0, dead: false, z: 0.5, animT: 1.2, aggro: false, facing: { x: 0, y: 1 } }, worldToScreen);
  } else {
    drawRobot(octx, {
      type, x: 0, y: 0, dead: false, fused: false, drained: false, disabledT: 0,
      friendly: false, aggro: type === 'w1' || type === 'w4', zombie: false, stuck: false,
      facing: { x: 0, y: 1 }, animT: 1.5, walkPhase: 0.6,
    }, worldToScreen);
  }
  return off.toDataURL('image/png');
}
for (const type of ['t1', 't2', 't3', 'w1', 'w2', 'w3', 'w4', 'w5']) {
  const img = document.getElementById(`gal-${type}`);
  if (img) img.src = renderMachineIcon(type);
}
const camera = new Camera(player.x, player.y);
const lore = new Lore(map, WORLD_SEED);
// Opening a resistance cache folds any recovered documents packed in it into the
// Scrapbook (quietly — openBox prints its own one-line summary).
player.onFindLore = (id) => lore.findFrag(id, player, true);

const dayNight = new DayNight();
const minimap = new Minimap(map);
let showMinimap = true; // toggled with the ] key
const birds = spawnBirds(map, WORLD_SEED);
let lastObjectCount = map.objects.length;

// Audio unlocks on the first user gesture (browser requirement).
const unlockAudio = () => {
  sfx.unlock();
  sfx.setAmbience({ night: dayNight.isNight() });
};
window.addEventListener('keydown', unlockAudio, { once: true });
window.addEventListener('pointerdown', unlockAudio, { once: true });

map.projectiles = []; // in-flight gun rounds (cosmetic tracers)
map.bombs = [];       // dropped ticking bombs
map.explosions = [];  // active fire clouds (visual)
const UBIK_PATCH_LIFE = 75; // seconds a sprayed patch stays brightened before fading back
const UBIK_PORTAL_LIFE = 260; // portals hold much longer than a plain patch before fading
const UBIK_TELEPORT_RANGE = 0.9; // how close to a linked portal's centre triggers a jump
const UBIK_TELEPORT_COOLDOWN = 1.5; // seconds before another jump can fire (stops instant ping-pong)

// The underworld: a Ubik tear no longer links to another overworld spot —
// it drops you into a single shared liminal pocket instead (see
// game/underworld.js). Built lazily on first entry, then kept for the rest
// of the session; entering/exiting swaps the outer `map` binding itself,
// which every system (player.update, updateRobots, renderer.draw, ...) reads
// fresh each call, so no other wiring is needed beyond keeping `player.map`
// and `window.__game.map` in sync.
let underworld = null;
let inUnderworld = false;
let overworldReturn = null;
let uwCreatures = [];
let uwAmbienceClock = 0, uwAmbienceNext = 8 + Math.random() * 10;

function enterUnderworld() {
  if (!underworld) {
    underworld = createUnderworldPocket((WORLD_SEED ^ 0x0b1c) >>> 0);
    uwCreatures = [spawnUnderworldCreature((WORLD_SEED ^ 0x1e57) >>> 0, underworld.creatureX, underworld.creatureY)];
  }
  overworldReturn = { x: player.x, y: player.y };
  map = underworld.map;
  player.map = map;
  window.__game.map = map;
  player.x = underworld.spawnX;
  player.y = underworld.spawnY;
  camera.snap(player.x, player.y);
  inUnderworld = true;
  lore.placeBackspace(map); // only Backspace lore shows down here
  sfx.setDrone(0.8);
  player.say('The tear swallows you. The air in here is wrong — flat, yellow, humming.');
}

function exitUnderworld() {
  map = overworldMap;
  player.map = map;
  window.__game.map = map;
  player.x = overworldReturn.x;
  player.y = overworldReturn.y;
  camera.snap(player.x, player.y);
  inUnderworld = false;
  lore.leaveBackspace(); // back to the overworld fragment set
  sfx.setDrone(0);
  player.say('You come up through the tear. Ordinary daylight, ordinary weight. You are back.');
}

// Fog of war: the minimap only shows where you have been.
map.explored = new Uint8Array(map.w * map.h);
map.newlyRevealed = [];
const FOG_RADIUS = 9;
let lastRevealX = -1, lastRevealY = -1;
function revealAround(px, py) {
  for (let dy = -FOG_RADIUS; dy <= FOG_RADIUS; dy++) {
    for (let dx = -FOG_RADIUS; dx <= FOG_RADIUS; dx++) {
      if (dx * dx + dy * dy > FOG_RADIUS * FOG_RADIUS) continue;
      const x = px + dx, y = py + dy;
      if (!map.inBounds(x, y) || map.explored[y * map.w + x]) continue;
      map.explored[y * map.w + x] = 1;
      map.newlyRevealed.push(x, y);
    }
  }
}

// Debug handle for inspecting live state from the console.
window.__game = { player, map, camera, animals, birds, robots, waterdroids, obelisks, obeliskObjs, wfactory, dayNight, lore, input, renderer, fortress };

function resize() {
  // Size to the *visual* viewport, not innerHeight/100vh. On iOS Safari the
  // layout viewport extends behind the floating bottom toolbar, so a canvas
  // sized to innerHeight pushes the HUD's slot row off-screen behind the bar.
  // visualViewport gives the genuinely-visible area, so the dashboard sits just
  // above the toolbar. We drive the canvas's CSS size explicitly to match.
  const vv = window.visualViewport;
  const w = Math.round(vv ? vv.width : window.innerWidth);
  const h = Math.round(vv ? vv.height : window.innerHeight);
  const cv = renderer.canvas;
  if (cv) { cv.style.width = w + 'px'; cv.style.height = h + 'px'; }
  renderer.resize(w, h, window.devicePixelRatio || 1);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
if (window.visualViewport) {
  // Toolbar show/hide and pinch-zoom change the visible area without a window
  // resize; keep the canvas fitted to it.
  window.visualViewport.addEventListener('resize', resize);
  window.visualViewport.addEventListener('scroll', resize);
}
resize();

const STEP = 1 / 60;
let last = performance.now();
let acc = 0;
let fps = 0, frameCount = 0, fpsClock = 0;

// Render cap: physics still steps every rAF tick (cheap, fixed timestep),
// but the actual canvas redraw — the expensive part — is skipped past this
// rate. On a 120Hz+ display rAF would otherwise fire (and fully repaint)
// twice as often as the game needs, burning CPU/GPU for no visible gain.
const RENDER_FPS_CAP = 60;
const MIN_RENDER_MS = 1000 / RENDER_FPS_CAP;
let lastRenderTime = 0;

// Help modal: H toggles, the ? button opens, clicking the backdrop closes.
const helpEl = document.getElementById('help');
const toggleHelp = (force) => {
  const show = force != null ? force : helpEl.style.display !== 'block';
  helpEl.style.display = show ? 'block' : 'none';
};
document.getElementById('helpBtn').addEventListener('click', () => toggleHelp(true));
helpEl.addEventListener('click', (e) => { if (e.target === helpEl) toggleHelp(false); });

// About modal: the i button opens, clicking the backdrop closes.
const aboutEl = document.getElementById('about');
// Build the About soundtrack list from the tape ledger (so it never drifts from
// what's actually in the game). Done lazily on first open — guaranteed the DOM
// and TAPES are both ready by then.
const populateAboutTapes = () => {
  const ul = document.getElementById('aboutTapes');
  if (!ul || ul.childElementCount) return;
  const cleanTrack = (f) => f.replace(/\.mp3$/i, '').replace(/^\d+[-.\s]*\d*[-.\s]*/, '').trim();
  ul.innerHTML = TAPES.map((t) => {
    const a = t.a.tracks.map(cleanTrack).join(', ');
    const b = t.b.tracks.map(cleanTrack).join(', ');
    return `<li><b>${t.artist} &mdash; <i>${t.title}</i></b><br>A: ${a} &nbsp;&middot;&nbsp; B: ${b}</li>`;
  }).join('');
};
const toggleAbout = (force) => {
  const show = force != null ? force : aboutEl.style.display !== 'block';
  if (show) populateAboutTapes();
  aboutEl.style.display = show ? 'block' : 'none';
};
document.getElementById('aboutBtn').addEventListener('click', () => toggleAbout(true));
aboutEl.addEventListener('click', (e) => { if (e.target === aboutEl) toggleAbout(false); });
// Tabbed help: clicking a tab shows its panel(s) and hides the rest. Several
// panels can share a data-panel name (Survival is split around the machine
// section), so all matching panels toggle together.
for (const btn of helpEl.querySelectorAll('.helpTab')) {
  btn.addEventListener('click', () => {
    const name = btn.dataset.panel;
    for (const b of helpEl.querySelectorAll('.helpTab')) b.classList.toggle('active', b === btn);
    for (const p of helpEl.querySelectorAll('.helpPanel')) p.classList.toggle('active', p.dataset.panel === name);
    helpEl.querySelector('.panel').scrollTop = 0;
    if (name === 'settings') syncSettingsPanel();
  });
}

// Settings tab: volume slider and direct music-track choice, both backed by
// sfx (which persists them itself — see Sound.setVolume/setMusicMode). The
// panel's inputs are synced to the live state each time the tab is opened,
// since either can also change elsewhere (M key for music; nothing else
// touches volume yet, but the pattern's ready for when something does).
const volumeSlider = document.getElementById('volumeSlider');
const volumeLabel = document.getElementById('volumeLabel');
volumeSlider.addEventListener('input', () => {
  const v = Number(volumeSlider.value) / 100;
  sfx.setVolume(v);
  volumeLabel.textContent = `${volumeSlider.value}%`;
});
for (const radio of helpEl.querySelectorAll('input[name="musicMode"]')) {
  radio.addEventListener('change', () => { if (radio.checked) sfx.setMusicMode(radio.value); });
}
function syncSettingsPanel() {
  const pct = Math.round(sfx.volume * 100);
  volumeSlider.value = pct;
  volumeLabel.textContent = `${pct}%`;
  const current = helpEl.querySelector(`input[name="musicMode"][value="${sfx.musicMode}"]`);
  if (current) current.checked = true;
}

// Obelisk terminal. With an access chip carried, clicking an obelisk opens a
// channel (a progress bar) into a live RON-ML REPL — and while you're jacked
// in the obelisk hides you from the machines. Without a chip you instead see
// the AI's own OS: alive with data, and unusable. See docs/ob-terminal-language.md
// for the language design.
const OB_TERMINAL_RANGE = 4.5;
const RONML_ROBOT_RANGE = 20;   // sleep/repel/sing reach this far from the player
const REPEL_DURATION = 60;      // seconds `repel`-ed machines flee for
const SING_DURATION = 4.5;      // seconds the choir lines up before powering down
const obTermEl = document.getElementById('obterminal');
const obTermScreen = document.getElementById('obterminal-screen');
const obTermConnect = document.getElementById('obterminal-connect');
const obTermBar = document.getElementById('obterminal-bar');
const obTermInput = document.getElementById('obterminal-input');
const obTermGhost = document.getElementById('obterminal-ghost');
const obTermBattEl = document.getElementById('obterminal-batt');
// The relay's solar-cell gauge in the HERMES terminal — a bar you watch wear
// down as you use it and creep back up in the sun.
function updateHermesBattEl() {
  if (!obTermBattEl) return;
  if (terminalKind !== 'hermes' || !hermesTor) { obTermBattEl.textContent = ''; return; }
  const f = hermesTor.battery ?? 1;
  const n = 10, on = Math.round(f * n);
  const glyphs = '▓'.repeat(on) + '░'.repeat(n - on);
  obTermBattEl.textContent = `CELL ${glyphs} ${Math.round(f * 100)}%`;
  // Amber to match the HERMES CRT (never green — that's the AI palette); only
  // when it's really low does it go red as a warning.
  obTermBattEl.style.color = f < 0.2 ? '#ff6a4a' : f < 0.45 ? '#e0902a' : '#e6a53a';
}
const aiosEl = document.getElementById('aios');
const aiosScreen = document.getElementById('aios-screen');
const aiosHeader = document.getElementById('aios-header');

let replLog = [];
let replHistory = [];
let replHistoryIdx = -1;
const REPL_MAX_LINES = 300;

function replPrint(...lines) {
  replLog.push(...lines);
  if (replLog.length > REPL_MAX_LINES) replLog = replLog.slice(replLog.length - REPL_MAX_LINES);
  obTermScreen.textContent = replLog.join('\n');
  obTermScreen.scrollTop = obTermScreen.scrollHeight;
}

// Builds a fresh ctx object each command: primitives read/mutate the live
// world (map, robots, obeliskObjs, player) through these hooks, and never
// touch game state directly — ronml.js only handles language mechanics.
function ronmlCtx() {
  const findObelisk = (id) => obeliskObjs.find((o) => o.code === id && !o.destroyed);
  const nearby = (r) => !r.dead && !r.friendly && !r.fused
    && Math.hypot(r.x - player.x, r.y - player.y) <= RONML_ROBOT_RANGE;
  return {
    station: 'ob', // an AI obelisk (TIRESIAS) — the AI-network verbs live here
    listObelisks: () => obeliskObjs.filter((o) => !o.destroyed).map((o) => o.code),
    distanceToNode: (id) => {
      const o = findObelisk(id);
      return o ? Math.hypot(o.x + 0.5 - player.x, o.y + 0.5 - player.y) : Infinity;
    },
    nodeExists: (id) => !!findObelisk(id),
    requireAiKey: (verb) => { if (!player.hasItem('ai_key')) throw new Error(`${verb} needs an AI key`); },
    recordHack: (id) => player.ronmlKeys.add(id),
    heldKeys: () => player.ronmlKeys,
    crashNode: (id) => {
      const o = findObelisk(id);
      if (!o) return;
      o.destroyed = true;
      o.needsRebuild = true; // temporary — this is a hack, not a physical fell
      map.objectGrid[o.y * map.w + o.x] = null;
      if (player.skylinkActive) player.skylinkActive = false;
      if (factoryLive() && !robots.some((r) => r.type === 'w3' && !r.dead)) {
        const drone = spawnW3(map, Math.floor(Math.random() * 0x7fffffff), factoryCx(), factoryCy());
        if (drone) robots.push(drone);
      }
      player.say(`${id} goes dark. A repair drone is already inbound to raise it.`);
    },
    nodeFrozen: (id) => { const o = findObelisk(id); return !!(o && o.frozen); },
    // RON-ML `loop`: the easy hack. No AI key, no hack/crash two-step —
    // pins the node itself and any T1/T2 garrisoned near it in place until
    // a repair drone works the loop back out (updateW3, robots.js). Robots
    // are tagged `frozenByOb` so the drone can find exactly who to release
    // without recomputing a proximity radius.
    loopNode: (id) => {
      const o = findObelisk(id);
      if (!o) return;
      o.frozen = true;
      o.frozenT = 0;
      let count = 0;
      for (const r of robots) {
        if (r.dead || r.fused || r.friendly) continue;
        if ((r.type === 't1' || r.type === 't2') && r.home
          && Math.hypot(r.home.x - (o.x + 0.5), r.home.y - (o.y + 0.5)) < 10) {
          r.frozen = true;
          r.frozenByOb = o;
          count++;
        }
      }
      if (factoryLive() && !robots.some((r) => r.type === 'w3' && !r.dead)) {
        const drone = spawnW3(map, Math.floor(Math.random() * 0x7fffffff), factoryCx(), factoryCy());
        if (drone) robots.push(drone);
      }
      player.say(`${id} pins itself in a loop that never returns. Its light flares white-hot${count ? ' and its garrison seizes up mid-stride' : ''} — only a repair drone can talk it down now.`);
    },
    sleepNearby: (mins) => {
      const secs = Math.max(1, mins);
      for (const r of robots) if (nearby(r)) r.disabledT = Math.max(r.disabledT || 0, secs);
      player.say('The local machines idle. The yard goes quiet for a spell.');
    },
    skylinkActive: () => !!player.skylinkActive,
    rewindClock: (hours) => {
      dayNight.rewind(Math.max(0, hours));
      player.say(`The deadline clock stutters and loses ${Math.max(0, hours)} hour${Math.max(0, hours) === 1 ? '' : 's'}. POSEIDON waits a little longer.`);
    },
    repelNearby: () => {
      for (const r of robots) if (nearby(r)) { r.repelledT = REPEL_DURATION; r.aggro = false; }
      player.say('Targeting flips. Anything nearby turns tail and runs.');
    },
    sing: () => {
      const eligible = (r) => !r.dead && !r.drained && !r.friendly && !r.fused;
      const targets = robots.filter((r) => nearby(r) && eligible(r));
      if (!targets.length && !robots.some(eligible)) { player.say('Nothing anywhere to sing to.'); return; }
      // A choir wants a full section — if too few are in earshot, summon the
      // nearest others from across the map to come and join (they walk in to
      // the formation), so the piece is never a lonely solo.
      const CHOIR_TARGET = 6;
      if (targets.length < CHOIR_TARGET) {
        const more = robots.filter((r) => eligible(r) && !targets.includes(r))
          .sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y))
          .slice(0, CHOIR_TARGET - targets.length);
        for (const r of more) targets.push(r);
      }
      const perp = { x: -player.facing.y, y: player.facing.x };
      targets.forEach((r, i) => {
        const spread = (i - (targets.length - 1) / 2) * 1.6;
        r.singing = true;
        r.aggro = false;
        r.choirT = CHOIR_DURATION; // sing for the whole piece
        r.choirVoice = i;          // which vocal part its light flashes to
        r.choirFlash = 0;
        r.choirX = player.x + player.facing.x * 4 + perp.x * spread;
        r.choirY = player.y + player.facing.y * 4 + perp.y * spread;
      });
      sfx.playChoir(); // Dowland's "Flow My Tears", the machines' voices
      player.say('Machines stop dead, turn, and line up — and more come marching in from across the fields to join them. Then, impossibly, they begin to sing.');
      closeObTerminal(); // drop out of the terminal so you can actually watch it
    },
    showMap: () => { openRonMap(); },
    printMap: () => {
      // Run off a physical copy that drops at your feet to be picked up and
      // carried — a map you can unfold later, away from any terminal.
      map.groundItems.push({ item: 'printed_map', qty: 1, x: player.x, y: player.y + 0.3 });
      player.say('The terminal chatters and spits out a printed map. It lands at your feet.');
    },
    unlock: (nodeId) => {
      // RON-ML `unlock k` at an obelisk: the key `k` must be one you actually
      // hacked from a live node (recordHack put its id in ronmlKeys). Given a
      // genuine hacked key, the network gives up a single fortress key. The
      // AI-key gate is upstream (hack needs it), so this is the reward for
      // composing `let k = hack OB-XXXX in unlock k` correctly. Carry the
      // fortress key to the fortress door and it opens on approach (fortress.js).
      if (!player.ronmlKeys.has(nodeId)) {
        player.say('That key was never hacked from a live node. try: let k = hack OB-XXXX in unlock k');
        return;
      }
      // Always drop a fresh fortress key — the network gives one up every time
      // the hack composes. Deliberately not a one-time reward: if you lose the
      // key (death, a fumbled drop) you can hack another and try the door again.
      fortressKeyFromCrash = true;
      map.groundItems.push({ item: 'fortress_key', qty: 1, x: player.x + 0.4, y: player.y + 0.6, keep: true });
      player.say(`The composed hack holds. ${nodeId}'s key turns in the network and a fortress key drops at your feet — a way into ${fortress.AI_NAME}'s fortress.`);
    },
    // `notes`: opens the browsable notebook (see openNotebook below) rather
    // than dumping text into the console — Tab-to-autocomplete is one thing,
    // but reading a wall of scrollback is another, and browsers don't let a
    // page reserve Tab reliably anyway.
    showNotepad: () => { openNotebook(); },
    // `eliza` / `run eliza`: load the DOCTOR script as an interactive session
    // (the terminal takes over routing input to it — see replRun).
    eliza: () => { startEliza(); },
  };
}

// The HERMES relay's context. Deliberately its OWN small set — it does NOT
// inherit the obelisk's AI-network verbs, because a TOR is off-grid RON tech
// that never touches the machines' wire. Just: keep knowledge alive (read/
// archive), grow or craft what keeps you going (make), plus the neutral notepad.
function hermesCtx() {
  return {
    station: 'hermes',
    showNotepad: () => { openNotebook(); },
    read: (topic) => hermesRead(topic),
    print: () => {}, // never reached — HERMES print takes a topic (see printDoc)
    printDoc: (topic) => hermesPrintDoc(topic),
    archive: () => hermesArchive(),
    records: () => hermesRecords(),
    drive: () => startDrive(),
  };
}

// `records`: pull the next of RON's own field records held on the relay mesh
// into your Scrapbook (J). RON kept its writing off the boxes and on its own
// relays, so this is where that half of the record lives — repeat until the
// relay has nothing new.
function hermesRecords() {
  if (!hermesSpend(HERMES_BATT.archive)) { replPrint('Not enough charge — let the cell recover.'); return; }
  const frag = lore.dispenseTorRecord(player);
  if (!frag) { replPrint("RON's records held here are all recovered — nothing new. (Read them in your Scrapbook, J.)"); return; }
  const left = lore.torRecordsLeft();
  const wrapped = (frag.text.match(/.{1,74}(\s|$)/g) || [frag.text]).map((s) => s.trim());
  replPrint(`— ${frag.title} —`, '', ...wrapped,
    '', `Filed to your Scrapbook (J). ${left} more record${left === 1 ? '' : 's'} on the mesh.`);
  player.say(`RON record recovered: ${frag.title}. It's in your Scrapbook (N is notes; J is the book).`);
}

// A HERMES relay runs off its own small solar cell — no grid to draw on. Each
// command costs a little charge; drive costs a trickle each second. It creeps
// back up in sunlight. The terminal shows the gauge so you watch it wear down.
const HERMES_BATT = { read: 0.03, print: 0.06, archive: 0.01, driveStart: 0.05, drivePerSec: 0.02 };
function hermesBattery() { return hermesTor ? (hermesTor.battery ?? 1) : 0; }
function hermesSpend(cost) {
  if (!hermesTor) return true;
  if ((hermesTor.battery ?? 1) < cost) return false;
  hermesTor.battery = Math.max(0, (hermesTor.battery ?? 1) - cost);
  updateHermesBattEl();
  return true;
}

// Documents the player has printed off a relay, kept in the notepad. {title,text}.
const printedDocs = [];

// `print <topic>`: run off a physical copy of a document, filed in your notepad
// (N) so you carry the knowledge away from the relay.
function hermesPrintDoc(topic) {
  const doc = HERMES_DOCS[topic];
  if (!doc) { replPrint(`No document "${topic || '?'}". archive lists what's held.`); return; }
  if (!hermesSpend(HERMES_BATT.print)) { replPrint('Not enough charge to print — let the cell recover.'); return; }
  if (!printedDocs.some((d) => d.title === doc.title)) printedDocs.push({ title: doc.title, text: doc.text });
  replPrint(`The relay chatters and runs off "${doc.title}". Filed in your notepad — press N to read it anywhere.`);
  player.say(`Printed: ${doc.title}. It's in your notepad (N).`);
}

// `archive`: list the documents this relay holds, with titles.
function hermesArchive() {
  hermesSpend(HERMES_BATT.archive);
  const lines = ['HERMES archive — the human record RON kept alive:'];
  for (const k of hermesTopics()) lines.push(`  ${(k + '        ').slice(0, 9)} ${HERMES_DOCS[k].title}`);
  lines.push('read <topic> to open one · print <topic> to keep a copy.');
  const left = lore.torRecordsLeft();
  if (left) lines.push(`Also held: ${left} of RON's own field records — type records to pull one into your Scrapbook (J).`);
  replPrint(...lines);
}

// ---- HERMES `drive`: override a nearby machine and see through its eyes ----
let hermesTor = null;            // the relay whose terminal is currently open
const DRIVE_RANGE = 16;          // tiles from the relay the link holds for
let driveState = null;           // { robot, tor, gait, sd } while driving, else null
const ROBOT_LABELS = { t1: 'T1 ROLLER', t2: 'T2 STALKER', t3: 'T3 SNIPER', w1: 'W1 REVENGER', w2: 'W2 RIVER', w3: 'W3 MENDER', w4: 'W4 HK', w5: 'W5 GARDENER', m6: 'M6 SENTRY' };

// `drive`: take the nearest live machine within the relay's range. Closes the
// terminal into the robot-vision overlay (see frame()); you steer with the same
// movement keys, self-destruct with X, or release with Esc.
function startDrive() {
  if (!hermesTor) { replPrint('No relay lock — open this at a TOR.'); return; }
  let best = null, bestD = DRIVE_RANGE;
  for (const r of robots) {
    if (r.dead || r.fused || r.friendly) continue;
    const d = Math.hypot(r.x - (hermesTor.x + 0.5), r.y - (hermesTor.y + 0.5));
    if (d < bestD) { bestD = d; best = r; }
  }
  if (!best) { replPrint(`No machine within ${DRIVE_RANGE} of ${hermesTor.code || 'the relay'}. Wait for one to wander close, then drive.`); return; }
  if (!hermesSpend(HERMES_BATT.driveStart)) { replPrint('Not enough charge to seize a unit — let the cell recover.'); return; }
  best.driven = true;          // updateRobots skips a driven unit's own AI
  best.aggro = false;
  driveState = { robot: best, tor: hermesTor, gait: (best.type === 't1' || best.type === 'w2') ? 'TREAD' : 'BIPED', sd: -1 };
  closeObTerminal();           // drop the console; the overlay takes the screen
  player.terminalSafe = true;  // you're still jacked in at the relay, hidden
  if (hintEl) hintEl.style.display = 'none';
  player.say(`HERMES override: you are seeing through ${ROBOT_LABELS[best.type] || best.type.toUpperCase()}. Steer it; X self-destructs, Esc releases.`);
}

function endDrive(msg) {
  if (!driveState) return;
  const r = driveState.robot;
  if (r) r.driven = false;
  driveState = null;
  player.terminalSafe = false;
  if (hintEl) hintEl.style.display = '';
  if (msg) player.say(msg);
}

// Blow the driven unit: a spark burst + radial damage to nearby machines and
// the factory hull, then the link drops.
function driveSelfDestruct() {
  const r = driveState && driveState.robot;
  if (!r) { endDrive(); return; }
  const R = 4.5;
  for (let s = 0; s < 10; s++) player.sparkAt(map, r.x + (Math.random() - 0.5) * 2, r.y + (Math.random() - 0.5) * 2);
  for (const o of robots) {
    if (o === r || o.dead || o.fused) continue;
    if (Math.hypot(o.x - r.x, o.y - r.y) <= R) { o.hp = (o.hp ?? 10) - 20; if (o.hp <= 0) o.dead = true; }
  }
  if (factoryLive()) {
    const fx = factoryCx(), fy = factoryCy();
    if (Math.hypot(fx - r.x, fy - r.y) <= R + 2 && wfactory) player.damageFactory(wfactory, map, 40);
  }
  r.dead = true;
  sfx.play('treefall');
  endDrive('The unit blows itself apart. The link goes dark.');
}

// Per-step drive update: steer the robot, hold the range, run the self-destruct
// countdown. The overworld is frozen while you're in here (like the terminal).
function updateDrive(dt) {
  const r = driveState.robot;
  // Self-destruct countdown (armed by holding, tripped by tapping X twice).
  if (driveState.sd >= 0) {
    driveState.sd -= dt;
    if (driveState.sd <= 0) { driveSelfDestruct(); return; }
  }
  if (input.consumePress('KeyX')) {
    if (driveState.sd >= 0) { driveState.sd = -1; player.say('Self-destruct aborted.'); }
    else driveState.sd = 2.0;
  }
  if (input.consumePress('Escape')) { endDrive('You let the unit go; it stirs back to its own routines.'); return; }

  const intent = input.moveIntent();
  if (intent.dx || intent.dy) {
    const dir = screenDirToWorld(intent.dx, intent.dy);
    const spd = (r.type === 't2' || r.type === 'w4') ? 3.2 : (r.type === 't1') ? 2.6 : 2.9;
    const nx = r.x + dir.x * spd * dt, ny = r.y + dir.y * spd * dt;
    if (!map.isSolid(Math.floor(nx), Math.floor(r.y))) r.x = nx;
    if (!map.isSolid(Math.floor(r.x), Math.floor(ny))) r.y = ny;
    const m = Math.hypot(dir.x, dir.y) || 1;
    r.facing = { x: dir.x / m, y: dir.y / m };
  }
  driveState.dist = Math.hypot(r.x - (driveState.tor.x + 0.5), r.y - (driveState.tor.y + 0.5));
  if (driveState.dist > DRIVE_RANGE) { endDrive('The unit walks out of the relay\'s reach. The link snaps and it comes to, on its own again.'); return; }
  // Holding the link burns the relay's cell; when it's flat, the link drops.
  driveState.tor.battery = Math.max(0, (driveState.tor.battery ?? 1) - HERMES_BATT.drivePerSec * dt);
  driveState.batt = driveState.tor.battery;
  if (driveState.tor.battery <= 0) { endDrive('The relay\'s cell is flat — the link dies and the unit comes to.'); return; }
  camera.follow(r.x, r.y, dt);
}

// Build the robot-vision info and draw the overlay over the just-rendered scene.
let driveMatCtx = null;
const HEADING_DIRS = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
function drawDriveOverlay(now) {
  const r = driveState.robot;
  // Camera matrix -> a world-to-pixel projector for the target brackets.
  if (!driveMatCtx) driveMatCtx = document.createElement('canvas').getContext('2d');
  driveMatCtx.setTransform(1, 0, 0, 1, 0, 0);
  camera.applyTransform(driveMatCtx, renderer.w, renderer.h);
  const m = driveMatCtx.getTransform();
  // Match the renderer's per-tile elevation lift (heightAt * ELEV, ELEV=16), or
  // markers on raised ground float below the sprites they should sit on.
  const project = (wx, wy) => {
    const s = worldToScreen(wx, wy);
    const lift = (map.heightAt ? map.heightAt(Math.floor(wx), Math.floor(wy)) : 0) * 16;
    return { x: m.a * s.x + m.c * (s.y - lift) + m.e, y: m.b * s.x + m.d * (s.y - lift) + m.f };
  };
  const ents = [];
  if (Math.hypot(player.x - r.x, player.y - r.y) < 20) ents.push({ x: player.x, y: player.y, label: 'HUMAN · ALLY', kind: 'human' });
  for (const o of robots) {
    if (o === r || o.dead || o.fused) continue;
    if (Math.hypot(o.x - r.x, o.y - r.y) < 18) ents.push({ x: o.x, y: o.y, label: `${ROBOT_LABELS[o.type] || o.type.toUpperCase()} · HOSTILE`, kind: 'hostile' });
  }
  for (const a of animals) {
    if (a.dead) continue;
    if (Math.hypot(a.x - r.x, a.y - r.y) < 13) ents.push({ x: a.x, y: a.y, label: 'FAUNA', kind: 'fauna' });
  }
  const heading = HEADING_DIRS[(Math.round(Math.atan2(r.facing.y, r.facing.x) / (Math.PI / 4)) + 8) % 8];
  drawRobotVision(renderer.ctx, {
    srcCanvas: renderer.canvas, w: renderer.w, h: renderer.h, t: now,
    robot: r, unitLabel: ROBOT_LABELS[r.type] || r.type.toUpperCase(),
    relay: driveState.tor.code || 'TOR-??',
    dist: driveState.dist || 0, maxRange: DRIVE_RANGE, heading, gait: driveState.gait,
    integrity: r.maxHp ? Math.max(0, r.hp / r.maxHp) : 1,
    battery: driveState.tor.battery ?? 1,
    entities: ents, project, selfDestructT: driveState.sd,
  });
}

// `read <topic>`: show a document on the terminal (print it to keep a copy).
function hermesRead(topic) {
  if (!topic) {
    replPrint('read <topic>. archive lists them. Held: ' + hermesTopics().join(', ') + '.');
    return;
  }
  const doc = HERMES_DOCS[topic];
  if (!doc) {
    replPrint(`No document "${topic}". Try: ${hermesTopics().join(', ')}.`);
    return;
  }
  if (!hermesSpend(HERMES_BATT.read)) { replPrint('Not enough charge to pull that up — let the cell recover.'); return; }
  // Wrap to the console width so a long entry reads as paragraphs, not one line.
  const words = doc.text.split(' ');
  let line = '';
  const out = [];
  for (const w of words) {
    if ((line + ' ' + w).trim().length > 62) { out.push(line.trim()); line = w; }
    else line += ' ' + w;
  }
  if (line.trim()) out.push(line.trim());
  replPrint('', `== ${doc.title} ==`, ...out, '(print ' + topic + ' to keep a copy in your notepad)', '');
}

// The RON-ML `map` command: a green schematic of this AI's territory drawn
// onto the #ronmap canvas — every obelisk (with code), every live machine,
// the W-factory, the mainframe you're hunting, and you. Overlaid on top of
// the terminal; clicking outside closes it back to the console.
const ronmapEl = document.getElementById('ronmap');
const ronmapCanvas = document.getElementById('ronmap-canvas');
function openRonMap() {
  const cv = ronmapCanvas, g = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const sx = (wx) => (wx / map.w) * W;
  const sy = (wy) => (wy / map.h) * H;
  g.fillStyle = '#061a0e'; g.fillRect(0, 0, W, H);
  // Faint grid.
  g.strokeStyle = 'rgba(80,230,130,0.10)'; g.lineWidth = 1;
  for (let i = 1; i < 8; i++) {
    g.beginPath(); g.moveTo((i / 8) * W, 0); g.lineTo((i / 8) * W, H); g.stroke();
    g.beginPath(); g.moveTo(0, (i / 8) * H); g.lineTo(W, (i / 8) * H); g.stroke();
  }
  // Live machines (small red dots).
  g.fillStyle = '#e0552f';
  for (const r of robots) {
    if (r.dead || r.fused || r.friendly) continue;
    g.beginPath(); g.arc(sx(r.x), sy(r.y), 2.5, 0, Math.PI * 2); g.fill();
  }
  // Obelisks (green squares + code), destroyed ones hollow.
  g.font = '9px ui-monospace, monospace';
  for (const o of obeliskObjs) {
    const x = sx(o.x + 0.5), y = sy(o.y + 0.5);
    if (o.destroyed) {
      g.strokeStyle = 'rgba(80,230,130,0.4)'; g.lineWidth = 1.2;
      g.strokeRect(x - 3, y - 3, 6, 6);
    } else {
      g.fillStyle = '#4fe07a'; g.fillRect(x - 3.5, y - 3.5, 7, 7);
      g.fillStyle = 'rgba(150,240,180,0.8)';
      g.fillText(o.code || '', x + 6, y + 3);
    }
  }
  // The W-factory (amber diamond).
  if (factoryLive()) {
    const x = sx(factoryCx()), y = sy(wfactory.y + (wfactory.fh || 1) / 2);
    g.fillStyle = '#e0b53a';
    g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 6, y); g.lineTo(x, y + 6); g.lineTo(x - 6, y); g.closePath(); g.fill();
  }
  // Adamantine's fortress: the grand doorway (cyan) you hack in through the
  // boundary, and the mainframe core (magenta star) deep inside it.
  {
    const m = fortress.markers();
    // The gate in the rampart.
    const gx = sx(m.gate.x), gy = sy(m.gate.y);
    g.fillStyle = m.gate.open ? '#67d6ff' : m.gate.hacked ? '#5ae08c' : '#7fe0ff';
    g.fillRect(gx - 4, gy - 4, 8, 8);
    g.fillStyle = 'rgba(127,224,255,0.9)';
    g.fillText(m.gate.open ? 'GATE (OPEN)' : 'GATE', gx + 8, gy + 3);
    // The core.
    const x = sx(mainframe.x), y = sy(mainframe.y);
    g.fillStyle = '#ff3d8b';
    g.beginPath();
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + k * (Math.PI * 4 / 5);
      const px = x + Math.cos(a) * 8, py = y + Math.sin(a) * 8;
      k === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
    }
    g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,120,180,0.9)'; g.fillText(`${m.core.ai.toUpperCase()} CORE`, x + 10, y + 3);
  }
  // You (cyan ring).
  {
    const x = sx(player.x), y = sy(player.y);
    g.strokeStyle = '#67d6ff'; g.lineWidth = 2;
    g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#67d6ff'; g.beginPath(); g.arc(x, y, 1.6, 0, Math.PI * 2); g.fill();
  }
  ronmapEl.style.display = 'flex';
}
function closeRonMap() { ronmapEl.style.display = 'none'; }
ronmapEl.addEventListener('click', (e) => { if (e.target === ronmapEl) closeRonMap(); });
// Using a held printed map (kind 'map') unfolds the same overlay anywhere.
player.onReadMap = openRonMap;
// Reading a note/document (the starting Odyssey note) files it into the notepad
// and opens it there, so the story is kept, not lost in a toast.
player.onReadNote = (key) => {
  const def = ITEMS[key];
  if (!def) return;
  if (!printedDocs.some((d) => d.title === (def.title || def.name))) {
    printedDocs.push({ title: def.title || def.name, text: def.text });
  }
  openNotebook();
};

// A book read leaves a title/author/abstract summary page in the notepad — but
// silently (no pop-up), since you usually read a skill book mid-scavenge and
// don't want the book flung open in your face. Press N to browse it later.
player.onFileNote = (title, text, cover = null, cat = 'Document') => {
  if (!title) return;
  if (!printedDocs.some((d) => d.title === title)) printedDocs.push({ title, text, cover, cat });
};

// The Notepad (`notes`, or press N anywhere): a real paper page you flip
// through with whatever lore fragments were flagged worth keeping (lore.js,
// `notepad: true`) — not RON-ML-specific, just the pages worth flipping back
// to (language fragments, found transcripts, whatever else earns the flag),
// one per page, in the order you found them — easier to read than a console
// dump, and doesn't depend on Tab (browsers reserve it for focus, so it was
// never reliable as an in-page shortcut anyway).
const notebookEl = document.getElementById('ronnotebook');
const notebookTitleEl = document.getElementById('ronnotebook-title');
const notebookBodyEl = document.getElementById('ronnotebook-body');
const notebookPageLabelEl = document.getElementById('ronnotebook-page-label');
const notebookPrevBtn = document.getElementById('ronnotebook-prev');
const notebookNextBtn = document.getElementById('ronnotebook-next');
// Duplicate prev/next + page counter up on the top bar, so you can flip fast
// without reaching for the footer — the notes fill up quickly.
const notebookPageTopEl = document.getElementById('ronnotebook-page-top');
const notebookPrevTopBtn = document.getElementById('ronnotebook-prev-top');
const notebookNextTopBtn = document.getElementById('ronnotebook-next-top');
// Keep the footer and top-bar nav in lockstep.
function syncNotebookNav(label, prevDisabled, nextDisabled) {
  notebookPageLabelEl.textContent = label;
  notebookPageTopEl.textContent = label;
  notebookPrevBtn.disabled = prevDisabled;
  notebookNextBtn.disabled = nextDisabled;
  notebookPrevTopBtn.disabled = prevDisabled;
  notebookNextTopBtn.disabled = nextDisabled;
}
let notebookEntries = [];
let notebookIdx = 0;
function renderNotebookPage() {
  if (!notebookEntries.length) {
    notebookTitleEl.textContent = 'NOTEPAD';
    notebookBodyEl.innerHTML = '<span id="ronnotebook-empty">Nothing yet. Pages worth keeping are ' +
      'scattered through the ruins — walk over one to read it, and it copies itself in here.</span>';
    syncNotebookNav('0 / 0', true, true);
    return;
  }
  const f = notebookEntries[notebookIdx];
  notebookTitleEl.textContent = f.title;
  // A category tag (Field record / Book / Album) plus, for books and albums,
  // the cover art as a thumbnail — so the page reads as the thing you found,
  // not just text. Built as HTML so the cover and tag sit above the body.
  const cat = f.cat || 'Document';
  const tag = cat === 'Book' ? 'BOOK' : cat === 'Album' ? 'ALBUM' : 'FIELD RECORD';
  let html = `<div class="nb-cat nb-cat-${cat.toLowerCase()}">${tag}</div>`;
  if (f.cover) {
    // esc the path just in case; covers live under assets/media.
    const src = ('assets/media/' + f.cover).replace(/"/g, '&quot;');
    html += `<img class="nb-cover" src="${src}" alt="" ` +
      `onerror="this.style.display='none'">`;
  }
  const body = (f.text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  html += `<div class="nb-text">${body}</div>`;
  notebookBodyEl.innerHTML = html;
  syncNotebookNav(`${notebookIdx + 1} / ${notebookEntries.length}`,
    notebookIdx <= 0, notebookIdx >= notebookEntries.length - 1);
}
function notebookPrev() { if (notebookIdx > 0) { notebookIdx--; renderNotebookPage(); } }
function notebookNext() { if (notebookIdx < notebookEntries.length - 1) { notebookIdx++; renderNotebookPage(); } }
function openNotebook() {
  // Gather every page — printed docs, filed book/album summaries, and the
  // scattered field records worth keeping — then group them into sections so
  // the Scrapbook reads as an ordered book (Field records, then Books, then
  // Albums) rather than a shuffled heap. Stable within each section: first
  // found, first shown.
  const scattered = FRAGMENTS
    .filter((f) => f.notepad && lore.found.has(f.id))
    .map((f) => ({ title: f.title, text: f.text, cat: 'Document', cover: null }));
  const all = [...printedDocs.map((d) => ({ cat: 'Document', cover: null, ...d })), ...scattered];
  const order = { Document: 0, Book: 1, Album: 2 };
  notebookEntries = all
    .map((e, i) => [e, i])
    .sort((a, b) => (order[a[0].cat] ?? 0) - (order[b[0].cat] ?? 0) || a[1] - b[1])
    .map((p) => p[0]);
  notebookIdx = 0;
  renderNotebookPage();
  notebookEl.style.display = 'flex';
}
function closeNotebook() { notebookEl.style.display = 'none'; }
notebookEl.addEventListener('click', (e) => { if (e.target === notebookEl) closeNotebook(); });
document.getElementById('ronnotebook-close').addEventListener('click', closeNotebook);
notebookPrevBtn.addEventListener('click', notebookPrev);
notebookNextBtn.addEventListener('click', notebookNext);
notebookPrevTopBtn.addEventListener('click', notebookPrev);
notebookNextTopBtn.addEventListener('click', notebookNext);
// Capture-phase on window, ahead of both the still-focused terminal input's
// own key handling and the game's WASD/arrow movement listener, so paging
// the notebook can never leak an arrow key into a text caret or a step.
window.addEventListener('keydown', (e) => {
  if (notebookEl.style.display !== 'flex') return;
  if (e.key === 'ArrowLeft') notebookPrev();
  else if (e.key === 'ArrowRight') notebookNext();
  else if (e.key === 'Escape') closeNotebook();
  e.preventDefault();
  e.stopImmediatePropagation();
}, true);

// Which terminal is open — an AI obelisk / fortress gate ('ob') runs against
// ronmlCtx; a RON HERMES relay ('hermes') runs against hermesCtx (adds
// make/read/ping). Set by the open* functions, reset on close.
let terminalKind = 'ob';

// ELIZA session: while a bot is live, terminal input is fed to the DOCTOR
// script instead of the RON-ML evaluator, until Ctrl+C or the terminal closes.
let elizaBot = null;
function startEliza() {
  elizaBot = createEliza();
  replPrint(
    '',
    'ELIZA — DOCTOR script (Weizenbaum, 1966).',
    'The node loads a human. Talk to it. Type quit, or press Ctrl+C, to leave.',
    '',
    `ELIZA: ${elizaBot.greeting()}`,
  );
}
function stopEliza(reason) {
  if (!elizaBot) return;
  elizaBot = null;
  replPrint('', reason || 'ELIZA closes. You are back at the RON-DOS prompt.', '');
}

function replRun(line) {
  replPrint(`> ${line}`);
  replHistory.push(line);
  replHistoryIdx = replHistory.length;
  if (elizaBot) {
    if (/^(quit|exit|bye|goodbye)$/i.test(line)) { stopEliza('ELIZA: Goodbye. It was nice talking to you.'); return; }
    replPrint(`ELIZA: ${elizaBot.respond(line)}`);
    return;
  }
  // `run eliza` / `run doctor` read as running a legacy program; normalise them
  // to the `eliza` verb so the language itself handles it (see ronml.js).
  const prog = line.replace(/^run\s+(eliza|doctor)\s*$/i, 'eliza');
  const result = runRonml(prog, terminalKind === 'hermes' ? hermesCtx() : ronmlCtx());
  // If the verb just opened an ELIZA session, its greeting is already printed —
  // don't also drop the bare "()" unit result underneath it.
  if (elizaBot) return;
  replPrint(result.text);
}

function openObTerminal(ob) {
  if (!player.hasItem('chip')) { openAiOs(ob); return; }
  // Chip present: jack in. Go invisible, then run the connect progress bar.
  terminalKind = 'ob';
  player.terminalSafe = true;
  obTermEl.style.display = 'flex';
  obTermScreen.parentElement.style.display = 'none';
  obTermConnect.style.display = 'block';
  obTermBar.style.width = '0%';
  player.say(`Access chip accepted. Opening a channel into ${ob.code || 'the node'} — you drop off their sensors.`);
  const start = performance.now(), DURATION = 1600;
  const step = (now) => {
    if (obTermEl.style.display === 'none') return; // closed early
    const p = Math.min(1, (now - start) / DURATION);
    obTermBar.style.width = (p * 100).toFixed(0) + '%';
    if (p < 1) { requestAnimationFrame(step); return; }
    obTermConnect.style.display = 'none';
    obTermScreen.parentElement.style.display = 'flex';
    replLog = [];
    replHistory = [];
    replHistoryIdx = -1;
    replPrint(
      'POSEIDON NODE TERMINAL  v2.20',
      'TIRESIAS 1.0  //  RON-DOS 4.11  (c) Reality Or Nothing',
      '',
      `> node ............ ${ob.code || 'OB-????'}`,
      `> class ........... ${ob.cls === 'siren' ? 'SIREN' : 'STANDARD'}`,
      `> circuit id ...... ${ob.circuitNum != null ? '#' + ob.circuitNum : 'sealed'}`,
      '> chip ............ ACCEPTED',
      '> shield .......... you are hidden while jacked in',
      '> access .......... GRANTED',
      '',
      'Tiresias online. try: scan   ·   map   ·   help',
      '_',
    );
    obTermInput.value = '';
    obTermGhost.textContent = '';
    obTermInput.focus();
  };
  requestAnimationFrame(step);
}

// The fortress gate terminal reuses the same RON-ML console, minus the chip
// gate and connect bar. You type `unlock` here (needs an AI key) to hack the
// grand doorway; it drops a fortress key that then swings the door open.
function openGateTerminal() {
  terminalKind = 'ob';
  player.terminalSafe = true;
  obTermEl.style.display = 'flex';
  obTermScreen.parentElement.style.display = 'flex';
  obTermConnect.style.display = 'none';
  replLog = [];
  replHistory = [];
  replHistoryIdx = -1;
  const hasFortKey = player.hasItem('fortress_key');
  replPrint(
    `${fortress.AI_NAME.toUpperCase()} — OUTER GATE TERMINAL`,
    'TIRESIAS 1.0  //  RON-DOS 4.11  (c) Reality Or Nothing',
    '',
    `> gate ............ ${fortress.terminal.obj.code}`,
    `> rampart ......... ${fortress.open ? 'OPEN' : 'SEALED'}`,
    `> fortress key .... ${hasFortKey ? 'HELD — carry it to the door' : 'NOT HELD'}`,
    '',
    hasFortKey
      ? 'The doorway is bolted from within. Bring the fortress key up to it and it swings open.'
      : 'The doorway is bolted from within. Get a fortress key first: at any obelisk, let k = hack OB-XXXX in unlock k.',
    '_',
  );
  obTermInput.value = '';
  obTermGhost.textContent = '';
  obTermInput.focus();
}
// A HERMES relay (TOR station on a hilltop): the RON console. No chip, no AI
// key — friendly tech. Amber CRT (the `.hermes` class recolours the shell),
// with a short glitchy boot, then the same input runs against hermesCtx.
function openHermesTerminal(tor) {
  terminalKind = 'hermes';
  hermesTor = tor;
  if (tor.battery == null) tor.battery = 0.55 + Math.random() * 0.4;
  player.terminalSafe = true;
  obTermEl.classList.add('hermes');
  obTermEl.style.display = 'flex';
  obTermScreen.parentElement.style.display = 'flex';
  obTermConnect.style.display = 'none';
  updateHermesBattEl();
  replLog = [];
  replHistory = [];
  replHistoryIdx = -1;
  replPrint(
    'HERMES RELAY  //  RON FIELD STATION',
    'HERMES 0.9b  //  RON-DOS 3.02  (c) Reality Or Nothing',
    '',
    `> relay ........... ${tor.code || 'TOR-??'}`,
    '> power ........... own solar cell (watch the gauge)',
    '> network ......... none — off-grid by design, nothing to detect',
    '> holdings ........ the human record: RON-ML, schematics, history',
    '',
    'HERMES online. Off the wire, still ours. try: archive · read history · print fortress · drive · help',
    '_',
  );
  obTermInput.value = '';
  obTermGhost.textContent = '';
  obTermInput.focus();
}
function closeObTerminal() { elizaBot = null; terminalKind = 'ob'; obTermEl.classList.remove('hermes'); obTermEl.style.display = 'none'; obTermGhost.textContent = ''; obTermInput.blur(); player.terminalSafe = false; }
obTermEl.addEventListener('click', (e) => { if (e.target === obTermEl) closeObTerminal(); });
// Autocomplete: once you've read the RON-DOS manual (book_ronml), the console
// suggests the rest of a verb as faded ghost text you can accept with Tab.
// (sing stays out of the list — it's a secret.) Purely a convenience the book
// unlocks; you can always type the whole thing by hand.
// Autocomplete is per-system: an obelisk (TIRESIAS) suggests only AI-network
// verbs, a HERMES relay only RON verbs — no seepage between the two. (sing is
// secret, so it's in neither list.)
const OB_COMPLETE = ['scan', 'nearest', 'keys', 'hack', 'crash', 'loop', 'sleep', 'rewind', 'repel', 'map', 'print', 'unlock', 'eliza', 'notes', 'help', 'let'];
const HERMES_COMPLETE = ['read', 'print', 'archive', 'records', 'drive', 'notes', 'help', 'let'];
const escapeHtml = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function ronmlCompletion(value) {
  if (elizaBot) return ''; // no RON-ML hints mid-conversation with the DOCTOR
  if (!player.readManuals || !player.readManuals.has('book_ronml')) return '';
  const m = value.match(/([A-Za-z]+)$/); // the alphabetic token at the caret
  if (!m) return '';
  const tok = m[1];
  const verbs = terminalKind === 'hermes' ? HERMES_COMPLETE : OB_COMPLETE;
  const hit = verbs.find((v) => v.length > tok.length && v.startsWith(tok));
  return hit ? hit.slice(tok.length) : '';
}
function updateGhost() {
  const suffix = ronmlCompletion(obTermInput.value);
  if (!suffix) { obTermGhost.textContent = ''; return; }
  obTermGhost.style.left = obTermInput.offsetLeft + 'px';
  obTermGhost.innerHTML = `<span class="typed">${escapeHtml(obTermInput.value)}</span>${escapeHtml(suffix)}`;
}
obTermInput.addEventListener('input', updateGhost);
obTermInput.addEventListener('keydown', (e) => {
  // Ctrl+C breaks out of an ELIZA session, as on a real terminal — back to the
  // RON-DOS prompt without closing the whole console.
  if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
    if (elizaBot) { obTermInput.value = ''; obTermGhost.textContent = ''; stopEliza('^C  —  ELIZA interrupted. Back at the RON-DOS prompt.'); }
    e.preventDefault(); e.stopPropagation();
    return;
  }
  // Tab is a browser-reserved key in a lot of setups (it moves focus off the
  // page before our handler ever sees it, preventDefault or not) — so Right
  // Arrow at the very end of the line also accepts the ghost suggestion, a
  // reliable fallback that never conflicts with normal caret movement.
  if (e.key === 'Tab' || (e.key === 'ArrowRight' && obTermInput.selectionStart === obTermInput.value.length
    && obTermInput.selectionEnd === obTermInput.value.length)) {
    const suffix = ronmlCompletion(obTermInput.value);
    if (suffix) { obTermInput.value += suffix; updateGhost(); e.preventDefault(); e.stopPropagation(); }
    else if (e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); }
    return;
  }
  if (e.key === 'Enter') {
    const line = obTermInput.value.trim();
    obTermInput.value = '';
    obTermGhost.textContent = '';
    if (line) replRun(line);
  } else if (e.key === 'ArrowUp') {
    if (replHistory.length) {
      replHistoryIdx = Math.max(0, replHistoryIdx - 1);
      obTermInput.value = replHistory[replHistoryIdx] || '';
    }
    updateGhost();
    e.preventDefault();
  } else if (e.key === 'ArrowDown') {
    if (replHistory.length) {
      replHistoryIdx = Math.min(replHistory.length, replHistoryIdx + 1);
      obTermInput.value = replHistory[replHistoryIdx] || '';
    }
    updateGhost();
    e.preventDefault();
  }
  e.stopPropagation();
});

// The AI's own console (no chip): a wall of restless, unreadable data.
const AIOS_GLYPHS = '0123456789ABCDEF▒▓█░■▢≡§¤◢◣∴∷';
let aiosRAF = null;
function openAiOs(ob) {
  aiosHeader.textContent = `POSEIDON CORE  //  NODE ${ob.code || '????'}  //  ACCESS DENIED  //  NO KEY`;
  aiosEl.style.display = 'flex';
  player.say('No chip. The obelisk throws up the AI’s own console instead — a wall of moving data you can’t read.');
  const cols = 60, rows = 26;
  const t0 = performance.now();
  const frame = (now) => {
    if (aiosEl.style.display === 'none') { aiosRAF = null; return; }
    const phase = (now - t0) / 1000;
    let out = '';
    for (let r = 0; r < rows; r++) {
      let line = '';
      for (let cX = 0; cX < cols; cX++) {
        const wave = Math.abs(Math.sin(r * 0.7 + cX * 0.35 + phase * 2.5));
        const n = Math.floor((wave * AIOS_GLYPHS.length + Math.random() * 4)) % AIOS_GLYPHS.length;
        line += (Math.random() < 0.06) ? ' ' : AIOS_GLYPHS[n];
      }
      out += line + '\n';
    }
    aiosScreen.textContent = out;
    aiosRAF = requestAnimationFrame(frame);
  };
  aiosRAF = requestAnimationFrame(frame);
}
function closeAiOs() { aiosEl.style.display = 'none'; if (aiosRAF) cancelAnimationFrame(aiosRAF); aiosRAF = null; }
aiosEl.addEventListener('click', (e) => { if (e.target === aiosEl) closeAiOs(); });

// The control hint is only for new players: fade it out after two minutes
// of play so it stops cluttering the screen once the controls have sunk in.
const hintEl = document.getElementById('hint');
// On a phone/touch device there's no H key, so drop "Press H for help" — spell
// out the tap controls instead (help is still reachable via the ? button).
const touchLike = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
  || Math.min(window.innerWidth, window.innerHeight) < 560;
if (touchLike) {
  hintEl.textContent = 'Hold to move · tap to act · ? for help';
}
const HINT_LIFETIME = 120; // seconds of played time
let playTime = 0;

// Backpack view: I toggles the full panel (drawn by the renderer), which
// exposes the backpack's own storage/weapon slots for dragging — the
// dashboard's pockets and hands slot are always draggable, panel or not
// (see the drag/drop handling below).
let showBackpack = false;
let showSkills = false;
let showWeapons = false;
let paused = false;  // P: freezes movement, AI, clocks, and timers
let sleepCooldown = 0; // B: real-seconds before another rest is allowed
let resting = null;  // B rest animation in progress: { t } real-seconds elapsed
const SLEEP_MINUTES = 10;   // game-clock minutes skipped per rest
const SLEEP_HEAL = 35;      // health restored per rest
const SLEEP_COOLDOWN_S = 90; // real seconds before resting again
const SLEEP_SAFE_RANGE = 12; // no hostile robot allowed within this many tiles
const REST_DURATION = 4.6;  // real seconds the rest animation runs
const REST_CLOCK_MULT = 5;  // the clock visibly spins this much faster while resting
// Screen-dim envelope over a rest: fade in over the first fifth, hold, fade
// back out over the last fifth, peaking at a soft 0.72 (never full black).
const restDim = (t) => {
  const p = Math.max(0, Math.min(1, t / REST_DURATION));
  const env = p < 0.2 ? p / 0.2 : p > 0.8 ? (1 - p) / 0.2 : 1;
  return 0.72 * env;
};
// How long (real seconds) a dropped item survives on the ground before it
// decays, keyed by item. Perishables rot fast; common salvage lingers a bit;
// prizes stay a long while. Anything not listed falls back to a per-kind
// default in groundLifetime(). Real time: a full day is 480s (~20s per game
// hour), so 100s ≈ 5 game hours.
const GROUND_ITEM_FADE = 8; // seconds of fade/flicker before an item vanishes
const GROUND_LIFETIME = {
  meat: 40, berries: 55, wood: 90,
  scrap: 100, chip_fragment: 110,
  tin: 150, ammo: 150, shells: 150, arrow: 150,
  battery: 190,
  chip: 320, printed_map: 260, obgun: 360,
  // Things that never decay: a backpack is too valuable to lose to a timer,
  // and the progression-critical uniques (the only Wi-Fi block, the AI key
  // which can't be remade, and the numbered circuit boards whose towers are
  // already felled) would soft-lock the OB-gun / wave-gun paths if they went.
  backpack: Infinity, wifiblock: Infinity, ai_key: Infinity, circuit: Infinity,
};
const GROUND_LIFETIME_DEFAULT = 160; // materials/consumables not listed above
// Held gear left on the ground (weapons, tools, gadgets, shields, bombs, the
// compass) lingers longest — you might mean to come back for it.
const GROUND_GEAR_KINDS = new Set(['tool', 'gun', 'gadget', 'bomb', 'shield', 'forcefield', 'compass', 'map']);
function groundLifetime(item) {
  if (item in GROUND_LIFETIME) return GROUND_LIFETIME[item];
  const kind = ITEMS[item] && ITEMS[item].kind;
  if (GROUND_GEAR_KINDS.has(kind)) return 320;
  return GROUND_LIFETIME_DEFAULT;
}

let detail = null;   // right-click inspection tooltip {text, x, y, ttl}
let drag = null;     // in-progress pointer drag {from: slotDescriptor}
const PROJECTILE_SPEED = 16; // tiles/sec for gun tracers

// When an obelisk falls, a fresh Wi-Fi block (consumed to craft the OB-gun)
// respawns somewhere random in the ruins so the loop can continue.
const boardTiles = [];
for (let by = 0; by < map.h; by++) for (let bx = 0; bx < map.w; bx++) if (map.floorAt(bx, by) === 'boards') boardTiles.push([bx, by]);
player.onObeliskDestroyed = (ob) => {
  if (boardTiles.length) {
    const [bx, by] = boardTiles[Math.floor(Math.random() * boardTiles.length)];
    map.groundItems.push({ item: 'wifiblock', qty: 1, power: 600, x: bx + 0.5, y: by + 0.5 });
  }
  // A revenge squad is dispatched the instant a tower falls — from the
  // W-factory itself, where W1s are actually built, not from the crater.
  if (ob) {
    const squadSeed = ((ob.x * 92821 + ob.y * 1237 + Math.floor(Math.random() * 1e6)) >>> 0) || 1;
    const originX = factoryLive() ? factoryCx() : ob.x + 0.5;
    const originY = factoryLive() ? factoryCy() : ob.y + 0.5;
    const squad = spawnW1s(map, squadSeed, originX, originY, 2 + Math.floor(Math.random() * 3));
    if (squad.length) {
      robots.push(...squad);
      player.say(`The W-factory dispatches a revenge squad: ${squad.length} W1 hunter${squad.length > 1 ? 's' : ''}, already coming for you.`);
    }
  }
  // Victory: every obelisk toppled at once.
  if (obeliskObjs.every((o) => o.destroyed) && !player._ended) {
    player._ended = true;
    player.addScore(100);
    player.deathCert = { name: player.name, gender: player.gender, cause: 'nothing — you won', score: player.score, skills: [...player.skills], deaths: player.deaths || 0, victory: true };
    persist();
    return;
  }
  // Not the winning blow, but if POSEIDON is already blazing, felling a tower
  // breaks the laser web and shuts the purge down — a hard-won reprieve. The
  // obelisk is flagged for rebuild; the factory rushes a repair drone to it,
  // and only once it's raised again (nothing left flagged) does POSEIDON come
  // back online (see the activation guard below). Knock towers down faster
  // than they can be rebuilt and you can still win outright during the purge.
  if (player.skylinkActive && ob) {
    player.skylinkActive = false;
    ob.needsRebuild = true;
    player.say('The tower comes down and the POSEIDON web collapses — dark, for now. A repair drone is already inbound to raise it.');
    if (factoryLive() && !robots.some((r) => r.type === 'w3' && !r.dead)) {
      const drone = spawnW3(map, Math.floor(Math.random() * 0x7fffffff), factoryCx(), factoryCy());
      if (drone) robots.push(drone);
    }
  }
};

// Attacking an obelisk reports up the network at once: the W-factory answers
// by dispatching a laser-armed W4 after you. Throttled so a burst of five
// hits (one obelisk) or rapid OB-gun fire can't spam a whole squadron.
let wFactoryW4Cooldown = 0;
player.onObeliskAttacked = () => {
  if (!factoryLive() || wFactoryW4Cooldown > 0) return;
  wFactoryW4Cooldown = 25;
  const w4 = spawnW4(map, Math.floor(Math.random() * 0x7fffffff), factoryCx(), factoryCy());
  if (w4) {
    robots.push(w4);
    player.say('A W4 hunter-killer streaks out of the W-factory, lasers charging.');
  }
};

// Right-click inspection: describe whatever occupies a tile. Cars get an
// invented make and model (deterministic from their hue), stone an age from
// its decay, and so on — flavour, drawn from the world's own data.
const CAR_MAKES = ['Vauxhall', 'Ford', 'Rover', 'Austin', 'Morris', 'Talbot', 'Hillman', 'Reliant'];
const CAR_MODELS = ['Cavalier', 'Cortina', 'Metro', 'Allegro', 'Marina', 'Sunbeam', 'Avenger', 'Robin'];
function describeAt(tx, ty) {
  if (!map.inBounds(tx, ty)) return 'The edge of the world.';
  const obj = map.objectAt(tx, ty);
  if (obj) {
    if (obj.type === 'car') {
      const mk = CAR_MAKES[Math.floor((obj.hue ?? 0) * CAR_MAKES.length) % CAR_MAKES.length];
      const md = CAR_MODELS[Math.floor(((obj.hue ?? 0) * 7.3) % 1 * CAR_MODELS.length)];
      const year = 1978 + Math.floor((obj.hue ?? 0) * 22);
      return `${year} ${mk} ${md}. ${obj.smashed ? 'Stripped and gutted.' : 'Dead where it stalled — worth breaking open.'}`;
    }
    if (obj.type === 'wall') {
      const ages = ['newly built', 'weathered, a few years old', 'old, a decade or more', 'mossed over, long abandoned', 'crumbling, half-collapsed', 'a ruin, barely standing'];
      const mat = obj.material === 'brick' ? 'Red-brick wall' : 'Stone wall';
      return `${mat}, ${ages[Math.min(5, obj.decay || 0)]}.`;
    }
    if (obj.type === 'obelisk') {
      if (obj.cls === 'siren') return `A SIREN-class obelisk. Teal-lit, and it sings — the song pulls you in. ${obj.alert > 0.3 ? 'It has you.' : 'Keep a tape ready.'}`;
      return `An AI signal obelisk. Black, humming, ${obj.alert > 0.3 ? 'and it has seen you.' : 'watching.'}`;
    }
    if (obj.type === 'tor') return `A HERMES relay — decentralised RON tech, ${obj.code || 'a hilltop station'}, off the machines' grid. Friendly. Click its amber screen (archive, read, make).`;
    if (obj.type === 'wfactory') return 'The W-factory. It fields repair drones for damaged towers — bring one down for good before it can be mended.';
    if (obj.type === 'box') return obj.opened ? 'An emptied resistance cache.' : 'A resistance cache. Search it (E).';
    if (obj.type === 'tree') return 'A tree. Fell it for wood.';
    if (obj.type === 'rock') return 'A weathered boulder.';
    if (obj.type === 'rubble') return 'Rubble from a fallen wall.';
  }
  const f = map.floorAt(tx, ty);
  const h = map.heightAt ? map.heightAt(tx, ty) : 0;
  const names = { grass: 'Overgrown grass', tallgrass: 'Tall grass — snakes hide here', road: 'Cracked tarmac road',
    boards: 'Bare floorboards', dirt: 'Worn dirt', sand: 'River sand', water: 'Deep water — you can swim it',
    stream: 'A shallow stream', bridge: 'A timber bridge', tallgrass2: '' };
  let s = names[f] || f || 'Nothing here.';
  if (h > 0) s += ` Raised ground (${h} up).`;
  else if (h < 0) s += ` A trench (${-h} down).`;
  return s;
}

let wasNight = null;
let wasDusk = null;
let wasRobotNear = false;
let regrowClock = 0;
let ronResupplyClock = 0, ronResupplyNext = 90 + Math.random() * 60;
let wFactoryClock = 0, wFactoryNext = 6 + Math.random() * 5; // repair-drone dispatch: a short clock so one actually comes while a tower is still damaged/frozen (see below)
let wFactoryW1Clock = 0, wFactoryW1Next = 100 + Math.random() * 80;
let wFactoryW5Clock = 0, wFactoryW5Next = 30 + Math.random() * 40;
let wFactoryGuardClock = 0, wFactoryGuardNext = 40 + Math.random() * 40;
let lastW4GameHour = dayNight.totalHours; // ticks a W4 every 30 game-minutes, not real time

// POSEIDON's final purge: once the clock runs out, every obelisk lights up
// and the AI throws everything it has left at you, without end — you keep
// playing until it finally hunts you down (or forever, if you're good).
const SKYLINK_MAX_W4 = 50; // concurrent cap, so a long purge can't melt the frame rate
let skylinkTimer = 0; // seconds survived under the purge, once active
let skylinkW4Clock = 0;
function dispatchSkylinkW4s(n) {
  const towers = obeliskObjs.filter((o) => !o.destroyed);
  for (let i = 0; i < n; i++) {
    const src = towers.length ? towers[Math.floor(Math.random() * towers.length)] : (factoryLive() ? { x: factoryCx() - 0.5, y: factoryCy() - 0.5 } : null);
    const ox = src ? src.x + 0.5 : player.x, oy = src ? src.y + 0.5 : player.y;
    const w4 = spawnW4(map, Math.floor(Math.random() * 0x7fffffff), ox, oy);
    if (w4) robots.push(w4);
  }
}
function update(dt) {
  if (input.consumePress('KeyH')) toggleHelp();
  if (input.inventoryPressed()) showBackpack = !showBackpack;
  if (input.skillsPressed()) showSkills = !showSkills;
  if (input.weaponChartPressed()) showWeapons = !showWeapons;
  if (input.pausePressed() && !player.deathCert) {
    paused = !paused;
    player.say(paused ? 'Paused. Press P to resume.' : 'Back in it.');
  }
  // Everything else — movement, AI, clocks, timers, New Game, crafting —
  // freezes while paused. Help/backpack/skills/weapons and unpausing itself
  // still work above this line.
  if (paused) return;

  // Resting (from B): the world holds still while the character lies down, the
  // screen dims, and the clock visibly spins faster (REST_CLOCK_MULT) so you
  // see time pass. Health trickles back over the animation, then you wake.
  if (resting) {
    resting.t += dt;
    dayNight.update(dt * REST_CLOCK_MULT);
    player.health = Math.min(player.maxHealth, player.health + (SLEEP_HEAL / REST_DURATION) * dt);
    if (resting.t >= REST_DURATION) {
      resting = null;
      player.resting = false;
      sleepCooldown = SLEEP_COOLDOWN_S;
      player.say('You wake, a little stronger.');
      persist();
    }
    return; // everything else — movement, AI, other clocks — is frozen while resting
  }

  // Driving a machine from a HERMES relay: you steer the unit and the overworld
  // holds still around you (you're jacked in at the relay). The robot-vision
  // overlay is drawn in frame().
  if (driveState) { updateDrive(dt); return; }

  if (input.newGamePressed()) {
    if (window.confirm('Start a new game? This erases your saved progress.')) {
      fullReset();
      return;
    }
  }
  // N alone opens the notepad directly — no need to be jacked into a
  // terminal just to read back what you've already learned.
  if (input.notesPressed()) openNotebook();
  if (input.craftPressed()) {
    if (player.canCraftWaveGun()) player.craftWaveGun(map);
    else if (player.canCraftObGun()) player.craftObGun(map);
    else if (player.canCraftChip()) player.craftChip();
    else if (player.canCraftSword()) player.craftSword();
  }
  if (input.zoomTogglePressed()) camera.toggleZoom();
  if (input.minimapTogglePressed()) { showMinimap = !showMinimap; player.say(showMinimap ? 'Minimap on.' : 'Minimap off.'); }
  lore.update(dt, player, input);
  if (input.musicTogglePressed()) {
    const mode = sfx.toggleMusic();
    player.say(mode === 'synth' ? 'Music: the piano bed.' : 'Music off.');
  }
  // Rest (B): skips the clock forward 10 game-minutes and restores some
  // health, so long as nothing hostile is close enough to make that a bad
  // idea, and not so often it's a free heal button.
  if (sleepCooldown > 0) sleepCooldown = Math.max(0, sleepCooldown - dt);
  if (input.sleepPressed()) {
    if (player.health >= player.maxHealth) {
      player.say("You're not hurt enough to need the rest.");
    } else if (sleepCooldown > 0) {
      player.say('Still too keyed up to rest again so soon.');
    } else if (robots.some((r) => !r.dead && !r.friendly && !r.drained && r.aggro
      && Math.hypot(r.x - player.x, r.y - player.y) < SLEEP_SAFE_RANGE)) {
      player.say("Too dangerous to rest with something hunting you.");
    } else {
      // Begin the rest animation rather than healing instantly (see the
      // resting block above). The cooldown is set when it completes.
      resting = { t: 0 };
      player.resting = true;
      player.say('You lie down to rest a while...');
    }
  }
  if (hintEl.style.display !== 'none') {
    playTime += dt;
    if (playTime >= HINT_LIFETIME) hintEl.style.display = 'none';
  }
  const mouse = input.mousePos();
  const mouseWorld = camera.toWorld(mouse.x, mouse.y, renderer.w, renderer.h);

  // Mouse wheel zooms (the HUD is screen-space, so it stays the same size).
  const wheel = input.consumeWheel();
  if (wheel) camera.zoomBy(-wheel * 0.0015);

  // Death certificate: freeze the world behind the modal until it's clicked.
  if (player.deathCert) {
    const copyCert = () => {
      renderer.shareCertificate().then((result) => {
        player.say(result === 'clipboard'
          ? 'Certificate copied to the clipboard — paste it to share.'
          : "Your browser won't allow copying images to the clipboard.");
      });
    };
    if (input.consumePress('KeyS')) copyCert();
    const click = input.clickPos();
    const btn = renderer._certCopyBtn;
    if (click && btn && click.x >= btn.x && click.x <= btn.x + btn.w && click.y >= btn.y && click.y <= btn.y + btn.h) {
      input.consumeClick();
      copyCert();
      return;
    }
    // Dying restarts the game from defaults — score, skills, and everything
    // else wiped, same as New Game, no confirm needed since death already
    // made the choice for you. Winning is not dying: dismissing a victory
    // cert just lets you carry on with what you've earned.
    if (click || input.consumeUp()) {
      input.consumeClick();
      if (player.deathCert.victory) player.deathCert = null;
      else fullReset();
    }
    return;
  }

  // Right-click inspects whatever is under the cursor.
  const right = input.consumeRight();
  if (right) {
    const w = camera.toWorld(right.x, right.y, renderer.w, renderer.h);
    detail = { text: describeAt(Math.floor(w.x), Math.floor(w.y)), x: right.x, y: right.y, ttl: 6 };
  }
  if (detail) { detail.ttl -= dt; if (detail.ttl <= 0) detail = null; }

  // Click away from an open canvas panel (backpack/skills/armoury) closes
  // it, same as the help modal's backdrop-click dismissal — these are drawn
  // straight to canvas rather than as DOM elements with their own backdrop,
  // so the "outside" test is a plain rect check against the panel the
  // renderer last drew. A click that lands inside the panel falls through
  // unconsumed to the slot/drag handling right below.
  if (showBackpack || showSkills || showWeapons) {
    const modalClick = input.clickPos();
    const outside = (r) => !r || modalClick.x < r.x || modalClick.x > r.x + r.w
      || modalClick.y < r.y || modalClick.y > r.y + r.h;
    // A press that lands on a dashboard/backpack slot must NOT be treated as an
    // outside-click that closes the panel — otherwise you can never grab a
    // pocket item to drag it into the open backpack. Let the slot handler below
    // take it (start a drag) and keep the panel open.
    const onSlot = modalClick && renderer.slotAt && renderer.slotAt(modalClick.x, modalClick.y);
    if (modalClick && !onSlot) {
      if (showBackpack && outside(renderer._backpackRect)) { input.consumeClick(); showBackpack = false; }
      else if (showSkills && outside(renderer._skillsRect)) { input.consumeClick(); showSkills = false; }
      else if (showWeapons && outside(renderer._weaponsRect)) { input.consumeClick(); showWeapons = false; }
    }
  }

  // Pointer over the dashboard/backpack slots: press begins a drag (or, on a
  // same-slot release, a click-equip); release drops onto the target slot.
  // Claimed here so a slot press never also swings the held tool.
  const press = input.clickPos();
  if (press && renderer.slotAt) {
    const slot = renderer.slotAt(press.x, press.y);
    if (slot) {
      input.consumeClick();
      if (slot.kind === 'packbadge') showBackpack = true; // click the badge to open the full panel
      else if (player.getSlot(slot)) drag = { from: slot };
      else player.equipSlot(slot); // empty hands slot: stow whatever's held
    }
  }
  // Click an obelisk's terminal to open its screen — if you're close enough to
  // reach it. Checked after the HUD slots (so a slot click wins) and before
  // the in-world tool use (consuming the click here stops it swinging).
  const obPress = input.clickPos();
  if (obPress && renderer.obeliskAt) {
    const w = camera.toWorld(obPress.x, obPress.y, renderer.w, renderer.h);
    const ws = worldToScreen(w.x, w.y);
    const ob = renderer.obeliskAt(ws.x, ws.y);
    if (ob) {
      input.consumeClick();
      if (Math.hypot(ob.x + 0.5 - player.x, ob.y + 0.5 - player.y) <= OB_TERMINAL_RANGE) openObTerminal(ob);
      else player.say('Too far from the obelisk to reach its terminal.');
    }
  }
  // Click a HERMES relay (TOR) to open its terminal — same picking as an
  // obelisk (torAt already lift-adjusts the hit rect for the hill it sits on).
  const torPress = torObjs.length && renderer.torAt ? input.clickPos() : null;
  if (torPress) {
    const w = camera.toWorld(torPress.x, torPress.y, renderer.w, renderer.h);
    const ws = worldToScreen(w.x, w.y);
    const tr = renderer.torAt(ws.x, ws.y);
    if (tr) {
      input.consumeClick();
      if (Math.hypot(tr.x + 0.5 - player.x, tr.y + 0.5 - player.y) <= OB_TERMINAL_RANGE + 0.7) openHermesTerminal(tr);
      else player.say('Too far from the HERMES relay to reach it — get up the hill to its screen.');
    }
  }
  // Click the fortress gate terminal (kiosk beside the grand doorway) to open
  // its hack console, if you're standing close enough to reach it.
  const gPress = input.clickPos();
  if (gPress) {
    const w = camera.toWorld(gPress.x, gPress.y, renderer.w, renderer.h);
    const t = fortress.terminal;
    if (Math.hypot(w.x - (t.x + 0.5), w.y - (t.y + 0.5)) <= 1.2) {
      input.consumeClick();
      if (fortress.nearTerminal(player.x, player.y, 2.6)) openGateTerminal();
      else player.say('Too far from the gate terminal to reach it.');
    }
  }
  const up = input.consumeUp();
  if (up && drag) {
    const target = renderer.slotAt ? renderer.slotAt(up.x, up.y) : null;
    if (target && target.kind === drag.from.kind && target.i === drag.from.i) {
      player.equipSlot(drag.from); // released on the source: treat as a click
    } else if (target) {
      player.moveItem(drag.from, target);
    } else {
      // Released away from any slot — pocket, hands, or (with the backpack
      // panel open) backpack storage — drag it off to drop it on the ground.
      // Not gated on the panel being open: a genuine drag always lands well
      // outside the small source slot, so it doesn't get mistaken for the
      // release-on-source click case above.
      player.dropSlot(drag.from, map);
    }
    drag = null;
  } else if (!input.mouseHeld) {
    drag = null; // released outside any slot: cancel the drag
  }

  // The underworld runs its own much smaller update: the player, the one
  // lurking creature, the camera, and the way back up — everything else in
  // this function (obelisks, the W-factory, animals, day/night, RON resupply,
  // lore terminals...) belongs to the overworld and simply holds still while
  // you're not there to see it.
  if (inUnderworld) {
    player.update(dt, input, map, [], [], mouseWorld);
    updateUnderworldCreatures(dt, uwCreatures, player, map);
    camera.follow(player.x, player.y, dt);
    if (player._ubikTeleportCooldown > 0) player._ubikTeleportCooldown -= dt;
    // The exit is a plain door set in the wall — approach it (it's solid, so
    // you stand a tile off) and you step back out into the real world.
    else if (Math.hypot(player.x - underworld.exitX, player.y - underworld.exitY) < 1.7) {
      exitUnderworld();
      player._ubikTeleportCooldown = UBIK_TELEPORT_COOLDOWN;
      sfx.play('zap');
    }
    uwAmbienceClock += dt;
    if (uwAmbienceClock > uwAmbienceNext) {
      uwAmbienceClock = 0;
      uwAmbienceNext = 8 + Math.random() * 14;
      sfx.play(Math.random() < 0.5 ? 'shriek' : 'hiss');
    }
    return;
  }

  // Weapons target robots and water droids alike (a combined foe list, only
  // for the player's own targeting — each still updates on its own array).
  const foes = waterdroids.length ? robots.concat(waterdroids) : robots;
  player.update(dt, input, map, animals, foes, mouseWorld);
  updateWaterDroids(dt, waterdroids, player, map);
  // Advance in-flight rounds.
  for (const p of map.projectiles) {
    const dist = Math.hypot(p.x1 - p.x0, p.y1 - p.y0) || 0.001;
    p.prog += (PROJECTILE_SPEED * dt) / dist;
  }
  if (map.projectiles.length) map.projectiles = map.projectiles.filter((p) => p.prog < 1);

  // Dropped items decay off the ground so the world doesn't silt up with
  // salvage — perishables (meat, berries) go fast, common scrap/materials
  // slower, and real prizes (weapons, keys, chips, a backpack) linger a good
  // long while. Aged centrally here rather than at the ~20 push sites; each
  // item's `age` ticks up and it fades/flickers (gi.fade, drawn by the
  // renderer) over its last few seconds before it's culled. Items flagged
  // `keep` (world-placed loot) never age — only stuff dropped during play does,
  // so the world isn't stripped bare before you find it.
  if (map.groundItems && map.groundItems.length) {
    for (const gi of map.groundItems) {
      if (gi.keep) { gi.fade = 1; continue; }
      gi.age = (gi.age || 0) + dt;
      const life = groundLifetime(gi.item);
      gi.fade = life === Infinity ? 1 : Math.min(1, (life - gi.age) / GROUND_ITEM_FADE);
    }
    map.groundItems = map.groundItems.filter((gi) => gi.keep || gi.age < groundLifetime(gi.item));
  }

  // Timed bombs: tick fuses, then detonate — a fire cloud that hurts every
  // living thing in its radius (the player included), and an insane bomb
  // brings down an obelisk it engulfs.
  for (const b of map.bombs) {
    b.fuse -= dt;
    if (b.fuse > 0) continue;
    b.done = true;
    sfx.play('charge');
    map.explosions.push({ x: b.x, y: b.y, radius: b.radius, ttl: 0.8, max: 0.8 });
    player.detonateBomb(b, map, animals, robots, waterdroids, obeliskObjs);
  }
  if (map.bombs.some((b) => b.done)) map.bombs = map.bombs.filter((b) => !b.done);
  for (const e of map.explosions) e.ttl -= dt;
  if (map.explosions.length) map.explosions = map.explosions.filter((e) => e.ttl > 0);
  if (map.sparks && map.sparks.length) {
    for (const s of map.sparks) s.ttl -= dt;
    map.sparks = map.sparks.filter((s) => s.ttl > 0);
  }
  // Ubik's brightening is a temporary win, not a permanent one: each patch
  // ages and fades back to the ordinary, decayed world over UBIK_PATCH_LIFE
  // (portals hold much longer, UBIK_PORTAL_LIFE), rather than lifting a spot
  // of ground forever. A portal no longer links to another overworld spot —
  // every tear is a way down into the one shared underworld pocket instead
  // (see game/underworld.js and enterUnderworld() above).
  if (map.ubikPatches && map.ubikPatches.length) {
    for (const p of map.ubikPatches) p.t += dt;
    map.ubikPatches = map.ubikPatches.filter((p) => p.t < (p.portal ? UBIK_PORTAL_LIFE : UBIK_PATCH_LIFE));
    const portals = map.ubikPatches.filter((p) => p.portal);
    if (player._ubikTeleportCooldown <= 0) {
      for (const p of portals) {
        if (Math.hypot(p.x - player.x, p.y - player.y) > UBIK_TELEPORT_RANGE) continue;
        enterUnderworld();
        player._ubikTeleportCooldown = UBIK_TELEPORT_COOLDOWN;
        sfx.play('zap');
        // Crucial: `map` is now the underworld pocket. Bail out of the rest
        // of this (overworld) update tick — revealAround, obelisks, the
        // factory, animals etc. all assume the overworld map and would run
        // against the wrong one this frame (revealAround in particular reads
        // map.explored, which the pocket doesn't have). Next frame the
        // inUnderworld branch at the top takes over cleanly.
        return;
      }
    }
  }

  // HERMES relays trickle-charge off their solar cells (slow). Watch the gauge
  // recover when you're not leaning on a relay.
  for (const t of torObjs) {
    if (t.battery == null) t.battery = 1;
    else if (t.battery < 1) t.battery = Math.min(1, t.battery + 0.006 * dt);
  }
  if (terminalKind === 'hermes' && obTermEl.style.display === 'flex') updateHermesBattEl();

  // RON resupply: every couple of minutes, one already-emptied cache gets
  // quietly restocked with a fresh drop of batteries, ammo or shells.
  ronResupplyClock += dt;
  if (ronResupplyClock > ronResupplyNext) {
    ronResupplyClock = 0;
    ronResupplyNext = 90 + Math.random() * 60;
    const emptyBoxes = map.objects.filter((o) => o.type === 'box' && o.opened);
    if (emptyBoxes.length) {
      const box = emptyBoxes[Math.floor(Math.random() * emptyBoxes.length)];
      const r = Math.random();
      box.loot = r < 0.4 ? [{ item: 'battery', qty: 4 }] : r < 0.7 ? [{ item: 'ammo', qty: 12 }] : [{ item: 'shells', qty: 8 }];
      box.opened = false;
    }
  }

  // The W-factory: while any obelisk is damaged (OB-gun scorched but standing),
  // flagged for rebuild, or pinned in a RON-ML loop, it fields a single W3 to go
  // and mend the nearest one. Only one W3 is ever out at a time. Checked on a
  // short clock (~6-11s) so a repair drone actually comes out while the tower is
  // still in that state — the old 60-120s clock almost never lined up with the
  // brief damaged window, so repair drones were essentially never seen.
  if (factoryLive()) {
    wFactoryClock += dt;
    if (wFactoryClock > wFactoryNext) {
      wFactoryClock = 0;
      wFactoryNext = 6 + Math.random() * 5;
      const anyDamaged = obeliskObjs.some((o) => (!o.destroyed && o.obDamage > 0) || o.needsRebuild || o.frozen);
      const w3Active = robots.some((r) => r.type === 'w3' && !r.dead);
      if (anyDamaged && !w3Active) {
        const drone = spawnW3(map, Math.floor(Math.random() * 0x7fffffff), factoryCx(), factoryCy());
        if (drone) { robots.push(drone); player.say('A repair drone whirs out of the W-factory.'); }
      }
    }
    // A W5 gardener drone: no trigger, no urgency — the factory just keeps
    // roughly one out in the world at all times, unconditional on anything
    // else happening. Kill the factory and it stops being replaced, same as
    // every other machine here, but the ambient forest-regrowth timer in
    // its own block below keeps ticking regardless — this is a visible
    // companion to that, not the whole mechanism.
    wFactoryW5Clock += dt;
    if (wFactoryW5Clock > wFactoryW5Next) {
      wFactoryW5Clock = 0;
      wFactoryW5Next = 30 + Math.random() * 40;
      const w5Count = robots.reduce((n, r) => n + (r.type === 'w5' && !r.dead ? 1 : 0), 0);
      if (w5Count < 2) {
        const gardener = spawnW5(map, Math.floor(Math.random() * 0x7fffffff), factoryCx(), factoryCy());
        if (gardener) { robots.push(gardener); player.say('A small drone trundles out of the W-factory, unhurried.'); }
      }
    }
    wFactoryW1Clock += dt;
    if (wFactoryW1Clock > wFactoryW1Next) {
      wFactoryW1Clock = 0;
      wFactoryW1Next = 100 + Math.random() * 80;
      const liveW1 = robots.filter((r) => r.type === 'w1' && !r.dead).length;
      if (liveW1 < 3) {
        const wave = spawnW1s(map, Math.floor(Math.random() * 0x7fffffff), factoryCx(), factoryCy(), 2 + Math.floor(Math.random() * 2));
        if (wave.length) { robots.push(...wave); player.say('The W-factory dispatches a hunting wave.'); }
      }
    }
    // Re-garrison: when an obelisk realises it has no guards left (its home
    // T1/T2s destroyed), the factory builds a fresh T1 or T2 and sends it over
    // to guard and patrol that specific tower. Prioritises the most exposed
    // (fewest guards), one at a time on a slow clock.
    wFactoryGuardClock += dt;
    if (wFactoryGuardClock > wFactoryGuardNext) {
      wFactoryGuardClock = 0;
      wFactoryGuardNext = 40 + Math.random() * 40;
      const MIN_GUARDS = 2, HOME_R = 8;
      const guardsOf = (ob) => robots.filter((r) => !r.dead && !r.friendly
        && (r.type === 't1' || r.type === 't2')
        && Math.hypot(r.home.x - (ob.x + 0.5), r.home.y - (ob.y + 0.5)) < HOME_R).length;
      let worst = null, worstCount = MIN_GUARDS;
      for (const ob of obeliskObjs) {
        if (ob.destroyed) continue;
        const g = guardsOf(ob);
        if (g < worstCount) { worstCount = g; worst = ob; }
      }
      if (worst) {
        const type = Math.random() < 0.5 ? 't1' : 't2';
        const guard = spawnGuard(map, Math.floor(Math.random() * 0x7fffffff), factoryCx(), factoryCy(),
          type, { x: worst.x + 0.5, y: worst.y + 0.5 });
        if (guard) {
          robots.push(guard);
          player.say(`The W-factory builds a ${type.toUpperCase()} and sends it to re-garrison ${worst.code}.`);
        }
      }
    }

    if (wFactoryW4Cooldown > 0) wFactoryW4Cooldown = Math.max(0, wFactoryW4Cooldown - dt);

    // A W4 also rolls off the factory floor every 30 minutes of game time
    // (not real time), independent of the attack-triggered dispatch above.
    if (dayNight.totalHours - lastW4GameHour >= 0.5) {
      lastW4GameHour = dayNight.totalHours;
      const liveW4 = robots.filter((r) => r.type === 'w4' && !r.dead).length;
      if (liveW4 < 3) {
        const w4 = spawnW4(map, Math.floor(Math.random() * 0x7fffffff), factoryCx(), factoryCy());
        if (w4) { robots.push(w4); player.say('The W-factory rolls out another W4 hunter-killer.'); }
      }
    }
  }

  // Trees grow: saplings thicken over about a minute, and now and then a new
  // one sprouts on open grass, so felled forest slowly comes back.
  for (const o of map.objects) {
    if (o.type === 'tree' && o.grow != null && o.grow < 1) o.grow = Math.min(1, o.grow + dt / 60);
  }
  regrowClock += dt;
  if (regrowClock > 22) {
    regrowClock = 0;
    for (let t = 0; t < 20; t++) {
      const rx = Math.floor(Math.random() * map.w), ry = Math.floor(Math.random() * map.h);
      if (map.floorAt(rx, ry) === 'grass' && !map.objectAt(rx, ry) && (!map.heightAt || map.heightAt(rx, ry) === 0)) {
        map.addObject('tree', rx, ry, { variant: Math.floor(Math.random() * 3), grow: 0.3 });
        break;
      }
    }
  }

  // Autosave the run every few seconds.
  saveClock += dt;
  if (saveClock >= 8) { saveClock = 0; persist(); }
  updateAnimals(dt, animals, player, map);
  updateBirds(dt, birds, animals, player, map);
  updateRobots(dt, robots, player, map);
  // Choir light-flash sync: while the piece plays, each singing machine's red
  // light pulses to the notes of its assigned vocal part, so the row of them
  // blinks out of step like a choir. (r.choirFlash is read by sensorStyle.)
  const choirT = sfx.choirElapsed();
  if (choirT >= 0) {
    let nearestSinger = Infinity;
    for (const r of robots) {
      if (!r.singing) continue;
      const band = CHOIR_REGISTERS[(r.choirVoice || 0) % 4];
      let last = -1;
      for (let i = band.length - 1; i >= 0; i--) { if (band[i] <= choirT) { last = band[i]; break; } }
      r.choirFlash = last >= 0 ? Math.max(0, 1 - (choirT - last) / 0.4) : 0;
      nearestSinger = Math.min(nearestSinger, Math.hypot(r.x - player.x, r.y - player.y));
    }
    // Walk away and the singing quietens: full within ~6 tiles, fading to a
    // faint distant hush by ~22 tiles.
    const vol = nearestSinger === Infinity ? 0 : Math.max(0.05, Math.min(1, 1 - (nearestSinger - 6) / 16));
    sfx.setChoirVolume(vol);
  }
  resolveBodyOverlaps(player, animals, robots);
  map.updateShakes(dt);
  // Fortress: swings the doorway, lights the maze way-out, and runs the breach
  // alarm. On alarm (with the uplink intact) `stir` rouses the overworld — the
  // obelisks flare red and the W-factory sends a W4 toward the doorway; `calm`
  // unwinds it when the fortress stands down or the uplink is cut.
  fortress.update(dt, player, robots, worldStir);
  dayNight.update(dt);
  // Time's up: POSEIDON comes online. Every obelisk lights up and links
  // to every other in a web of lasers, and the factory throws wave after
  // wave of W4s at you — indefinitely. There's no timer to survive to; it
  // simply doesn't stop, and the run ends only when it finally catches you
  // (see dieToSkylink in player.js).
  // ...but not while a tower it needs is still down and being rebuilt — that
  // suspension is the player's reprieve, and POSEIDON only (re)lights once the
  // repair drone has raised every flagged tower back up.
  if (dayNight.hoursLeft() <= 0 && !player.skylinkActive && !player.deathCert && !player._ended
    && !obeliskObjs.some((o) => o.needsRebuild)) {
    player.skylinkActive = true;
    skylinkTimer = 0; // now counts up: seconds survived under the purge
    skylinkW4Clock = 0;
    player.say('POSEIDON comes online. Every obelisk blazes and turns on you at once.');
    dispatchSkylinkW4s(6); // the opening salvo
  }
  if (player.skylinkActive && !player._ended) {
    skylinkTimer += dt;
    skylinkW4Clock += dt;
    if (skylinkW4Clock > 1.2) {
      skylinkW4Clock = 0;
      const liveW4 = robots.filter((r) => r.type === 'w4' && !r.dead).length;
      if (liveW4 < SKYLINK_MAX_W4) dispatchSkylinkW4s(2 + Math.floor(Math.random() * 3));
    }
  }
  camera.follow(player.x, player.y, dt);
  if (map.objects.length !== lastObjectCount) {
    lastObjectCount = map.objects.length;
    minimap.refresh(map); // felled trees disappear from the minimap
  }

  // Reveal fog as the player moves.
  const ptx = Math.floor(player.x), pty = Math.floor(player.y);
  if (ptx !== lastRevealX || pty !== lastRevealY) {
    lastRevealX = ptx; lastRevealY = pty;
    revealAround(ptx, pty);
  }

  // Ambience follows the clock; creature calls fire on state transitions.
  // Crickets are a dusk sound only: late afternoon into early evening.
  const dusk = dayNight.hour >= 16.5 && dayNight.hour < 20;
  if (dusk !== wasDusk) {
    wasDusk = dusk;
    sfx.setAmbience({ dusk });
  }
  const night = dayNight.isNight();
  if (night !== wasNight) {
    wasNight = night;
    sfx.setAmbience({ night });
  }
  // The ambient piano only plays in calm moments: silent while anything is
  // actively aggroed on the player and close enough to matter.
  let underThreat = false;
  for (const a of animals) {
    if (a.dead) continue;
    const close = Math.hypot(a.x - player.x, a.y - player.y) < 18;
    if (a.type === 'dog') {
      if (a.aggro && close) underThreat = true;
      if (a.aggro && !a._sBark && close) { a._sBark = true; sfx.play('bark'); }
      if (!a.aggro) a._sBark = false;
    } else if (a.type === 'boar') {
      if (close && (a.state === 'telegraph' || a.state === 'charge')) underThreat = true;
      if (a.state !== a._sState) {
        if (close && a.state === 'telegraph') sfx.play('boar');
        if (close && a.state === 'charge') sfx.play('charge');
        a._sState = a.state;
      }
    }
  }
  for (const b of birds) {
    if (b.shrieking && !b._sShriek) { b._sShriek = true; sfx.play('shriek'); }
    if (!b.shrieking) b._sShriek = false;
  }
  let nearestRobot = Infinity;
  for (const r of robots) {
    if (r.dead) continue;
    const hunting = r.state === 'chase' || r.chasing || r.aggro;
    const dist = Math.hypot(r.x - player.x, r.y - player.y);
    const close = dist < 16;
    if (hunting && close) underThreat = true;
    if (hunting && !r._sHunt && close) {
      r._sHunt = true;
      sfx.play('charge');
    }
    if (!hunting) r._sHunt = false;
    // Any active machine, hunting or not, is a "nearby robot" for the drone
    // and the crickets — they are scared of the machines themselves, not
    // just of being hunted.
    if (!r.drained && !r.fused && r.disabledT <= 0 && dist < nearestRobot) nearestRobot = dist;
  }
  sfx.setMusicTension(underThreat);

  // A quiet drone swells as a machine closes in; the crickets fall silent
  // near any active robot, unsettled by them.
  sfx.setDrone(nearestRobot < 16 ? 1 - nearestRobot / 16 : 0);
  const robotNear = nearestRobot < 14;
  if (robotNear !== wasRobotNear) {
    wasRobotNear = robotNear;
    sfx.setAmbience({ robotNear });
  }

  // Obelisks sense a human close by: their light deepens toward blood-red
  // and holds, and nearby non-aggro robots get nudged to sweep near the
  // tower — a report of closeness, never an exact position.
  let sirenPull = false, sirenResisted = false; // for the once-only song messages
  for (const ob of obeliskObjs) {
    if (ob.burning > 0) ob.burning -= dt; // OB-gun flame timer, ticked for the renderer
    if (ob.frozen) ob.frozenT = (ob.frozenT || 0) + dt; // CPU-burn age for the renderer's smoke ramp
    if (ob.destroyed) continue;
    const d = Math.hypot(ob.x + 0.5 - player.x, ob.y + 0.5 - player.y);
    if (d < 9) {
      ob.alert = Math.min(1, ob.alert + dt * 1.5);
    } else {
      ob.alert = Math.max(0, ob.alert - dt * 0.4);
    }
    // SIREN class: within range its song pulls you toward it — a gentle drift
    // that's stronger the closer you are. Playing a tape on the walkman drowns
    // it out (your own dearer noise), so the pull only bites when nothing's
    // playing. (home-04 lore, made mechanic.)
    if (ob.cls === 'siren' && player.health > 0) {
      const SONG_RANGE = 7;
      if (d < SONG_RANGE) {
        if (player.walkmanSide == null) {
          const strength = 0.95 * (1 - d / SONG_RANGE); // tiles/sec at the edge → up close
          const inv = 1 / (d || 1);
          player.moveAxis((ob.x + 0.5 - player.x) * inv * strength * dt, 0, map);
          player.moveAxis(0, (ob.y + 0.5 - player.y) * inv * strength * dt, map);
          sirenPull = true;
        } else {
          sirenResisted = true;
        }
      }
    }
    // Occasional blink, independent of alert: a short bright flash, then a
    // random quiet spell before the next one. Alert makes it flicker faster.
    ob._blinkT -= dt;
    if (ob._blinkT <= 0) {
      ob.blinkFlash = 0.18;
      ob._blinkT = (2 + Math.random() * 5) * (1 - ob.alert * 0.6);
    }
    if (ob.blinkFlash > 0) ob.blinkFlash = Math.max(0, ob.blinkFlash - dt);

    if (ob.alert > 0.5) {
      ob._nudgeT -= dt;
      if (ob._nudgeT <= 0) {
        ob._nudgeT = 2.5;
        for (const r of robots) {
          if (r.dead || r.drained || r.fused || r.friendly || r.disabledT > 0 || r.aggro) continue;
          if (Math.hypot(r.x - ob.x, r.y - ob.y) > 18) continue;
          r.wanderTarget = {
            x: ob.x + 0.5 + (Math.random() * 12 - 6),
            y: ob.y + 0.5 + (Math.random() * 12 - 6),
          };
          r.wanderTimer = 4;
        }
      }
    }
  }
  // Once-only lines as the song takes hold and as it lets go.
  if (sirenPull && !player._underSong) {
    player._underSong = true;
    player.say('A song rises from a teal-lit tower, and your feet begin to turn toward it. Start a tape to drown it out.');
  } else if (!sirenPull && player._underSong) {
    player._underSong = false;
    player.say(sirenResisted ? 'Your own noise drowns the song out.' : 'The song thins behind you and lets go.');
  }
}

function frame(now) {
  const elapsed = Math.min(0.25, (now - last) / 1000);
  last = now;
  acc += elapsed;
  while (acc >= STEP) {
    update(STEP);
    acc -= STEP;
  }

  if (now - lastRenderTime >= MIN_RENDER_MS) {
    lastRenderTime = now;
    renderer.draw(camera, map, player, inUnderworld ? [] : animals, {
      fps,
      version: VERSION,
      // Fluorescent-lit down there regardless of the overworld's clock — the
      // underworld veil (below) carries the mood instead of day/night darkness.
      light: inUnderworld ? 1 : dayNight.light(),
      dawnGlow: inUnderworld ? 0 : dayNight.dawnGlow(),
      timeLabel: dayNight.countdownLabel,
      minimap: (inUnderworld || !showMinimap) ? null : minimap,
      birds: inUnderworld ? [] : birds,
      robots: inUnderworld ? [] : robots,
      waterdroids: inUnderworld ? [] : waterdroids,
      underworld: inUnderworld,
      uwCreatures: inUnderworld ? uwCreatures : [],
      lore,
      torch: player.pockets.some((s) => s && s.item === 'torch'),
      showBackpack,
      detail,
      drag: drag ? { ...drag, mx: input.mouseX, my: input.mouseY } : null,
      deathCert: player.deathCert,
      showSkills,
      showWeapons,
      craftPrompt: (player.canCraftObGun() && player.hands !== 'obgun') || (player.canCraftWaveGun() && player.hands !== 'wavegun') || player.canCraftChip() || player.canCraftSword(),
      craftWaveGun: player.canCraftWaveGun() && player.hands !== 'wavegun',
      craftChip: player.canCraftChip() && !player.canCraftWaveGun() && !(player.canCraftObGun() && player.hands !== 'obgun'),
      craftSword: player.canCraftSword() && !player.canCraftChip() && !player.canCraftWaveGun() && !(player.canCraftObGun() && player.hands !== 'obgun'),
      // POSEIDON is an overworld network — its lights/lines must never draw over
      // the Backspace.
      skylinkActive: player.skylinkActive && !player._ended && !inUnderworld,
      skylinkTimer,
      obeliskObjs: inUnderworld ? [] : obeliskObjs,
      paused,
      rest: resting ? { dim: restDim(resting.t) } : null,
      ubikFlicker: player.ubikFlickerT || 0,
      ubikFlickerX: player.ubikFlickerX || player.x,
      ubikFlickerY: player.ubikFlickerY || player.y,
      musicMode: sfx.musicMode, // the walkman's reels spin only while its side is what's actually playing
      driving: !!driveState,    // suppress the normal HUD; the robot-vision overlay takes over
    });
    // Robot-vision: resample the just-drawn scene as ASCII + a Terminator HUD.
    if (driveState) drawDriveOverlay(now);
    frameCount += 1;
  }

  fpsClock += elapsed;
  if (fpsClock >= 1) {
    fps = frameCount;
    frameCount = 0;
    fpsClock -= 1;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
