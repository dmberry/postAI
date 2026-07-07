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
import { spawnRobots, updateRobots, spawnW1s, spawnW3, spawnW4, drawRobot } from './game/robots.js';
import { resolveBodyOverlaps } from './game/collision.js';
import { spawnWaterDroids, updateWaterDroids, drawWaterDroid } from './game/waterdroids.js';
import { Lore } from './game/lore.js';
import { ITEMS } from './game/items.js';
import { sfx } from './engine/sound.js';
import { worldToScreen } from './engine/iso.js';
import { runRonml } from './game/ronml.js';
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
const VERSION = '0.96';

const canvas = document.getElementById('game');
const renderer = new Renderer(canvas);
const input = new Input(window, canvas);
const { map, spawn } = buildWorld(WORLD_SEED);
const player = new Player(spawn.x, spawn.y);
player.map = map; // for death drops when damage comes from animals
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
    map.addObject('obelisk', x, y);
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
    const [x, y] = inner.splice(Math.floor(rng() * inner.length), 1)[0];
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
  const FACTORY_HP = 160;             // takes many hits to bring down
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

// The AI's mainframe: the thing you're ultimately hunting for. It has no
// interaction yet — for now it's a fixed, seed-derived location, far from
// where you start, that the RON-ML `map` command reveals so you have a
// heading to strike out toward. (Full mainframe mechanics are future work.)
const mainframe = (() => {
  const rng = makeRng(WORLD_SEED ^ 0x4a1f);
  let best = { x: map.w * 0.75, y: map.h * 0.75 }, bestD = -1;
  for (let tries = 0; tries < 400; tries++) {
    const x = 6 + Math.floor(rng() * (map.w - 12));
    const y = 6 + Math.floor(rng() * (map.h - 12));
    if (map.isSolid(x, y) || map.heightAt(x, y) < 0) continue;
    const d = Math.hypot(x - spawn.x, y - spawn.y);
    if (d > bestD) { bestD = d; best = { x: x + 0.5, y: y + 0.5 }; }
  }
  return best;
})();

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
        pockets: player.pockets, backpack: player.backpack,
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
for (const type of ['t1', 't2', 'w1', 'w2', 'w3', 'w4']) {
  const img = document.getElementById(`gal-${type}`);
  if (img) img.src = renderMachineIcon(type);
}
const camera = new Camera(player.x, player.y);
const lore = new Lore(map, WORLD_SEED);

const dayNight = new DayNight();
const minimap = new Minimap(map);
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
window.__game = { player, map, camera, animals, birds, robots, waterdroids, obelisks, obeliskObjs, wfactory, dayNight, lore, input, renderer };

function resize() {
  renderer.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
}
window.addEventListener('resize', resize);
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
// Tabbed help: clicking a tab shows its panel(s) and hides the rest. Several
// panels can share a data-panel name (Survival is split around the machine
// section), so all matching panels toggle together.
for (const btn of helpEl.querySelectorAll('.helpTab')) {
  btn.addEventListener('click', () => {
    const name = btn.dataset.panel;
    for (const b of helpEl.querySelectorAll('.helpTab')) b.classList.toggle('active', b === btn);
    for (const p of helpEl.querySelectorAll('.helpPanel')) p.classList.toggle('active', p.dataset.panel === name);
    helpEl.querySelector('.panel').scrollTop = 0;
  });
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
    sleepNearby: (mins) => {
      const secs = Math.max(1, mins);
      for (const r of robots) if (nearby(r)) r.disabledT = Math.max(r.disabledT || 0, secs);
      player.say('The local machines idle. The yard goes quiet for a spell.');
    },
    repelNearby: () => {
      for (const r of robots) if (nearby(r)) { r.repelledT = REPEL_DURATION; r.aggro = false; }
      player.say('Targeting flips. Anything nearby turns tail and runs.');
    },
    sing: () => {
      const targets = robots.filter((r) => nearby(r) && !r.drained);
      if (!targets.length) { player.say('Nothing nearby to sing to.'); return; }
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
      player.say('Every machine in earshot stops dead, turns, and lines up. Then, impossibly, they begin to sing.');
      closeObTerminal(); // drop out of the terminal so you can actually watch it
    },
    showMap: () => { openRonMap(); },
    printMap: () => {
      // Run off a physical copy that drops at your feet to be picked up and
      // carried — a map you can unfold later, away from any terminal.
      map.groundItems.push({ item: 'printed_map', qty: 1, x: player.x, y: player.y + 0.3 });
      player.say('The terminal chatters and spits out a printed map. It lands at your feet.');
    },
  };
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
  // The mainframe (magenta star) — what you're searching for.
  {
    const x = sx(mainframe.x), y = sy(mainframe.y);
    g.fillStyle = '#ff3d8b';
    g.beginPath();
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + k * (Math.PI * 4 / 5);
      const px = x + Math.cos(a) * 8, py = y + Math.sin(a) * 8;
      k === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
    }
    g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,120,180,0.9)'; g.fillText('MAINFRAME', x + 10, y + 3);
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

function replRun(line) {
  replPrint(`> ${line}`);
  const result = runRonml(line, ronmlCtx());
  replPrint(result.text);
  replHistory.push(line);
  replHistoryIdx = replHistory.length;
}

function openObTerminal(ob) {
  if (!player.hasItem('chip')) { openAiOs(ob); return; }
  // Chip present: jack in. Go invisible, then run the connect progress bar.
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
      'SKYLINK NODE TERMINAL  v2.20',
      'RON-DOS 4.11  (c) Reality Or Nothing',
      '',
      `> node ............ ${ob.code || 'OB-????'}`,
      `> circuit id ...... ${ob.circuitNum != null ? '#' + ob.circuitNum : 'sealed'}`,
      '> chip ............ ACCEPTED',
      '> shield .......... you are hidden while jacked in',
      '> access .......... GRANTED',
      '',
      'RON-ML console ready. try: scan   (type help for commands)',
      '_',
    );
    obTermInput.value = '';
    obTermGhost.textContent = '';
    obTermInput.focus();
  };
  requestAnimationFrame(step);
}
function closeObTerminal() { obTermEl.style.display = 'none'; obTermGhost.textContent = ''; obTermInput.blur(); player.terminalSafe = false; }
obTermEl.addEventListener('click', (e) => { if (e.target === obTermEl) closeObTerminal(); });
// Autocomplete: once you've read the RON-DOS manual (book_ronml), the console
// suggests the rest of a verb as faded ghost text you can accept with Tab.
// (sing stays out of the list — it's a secret.) Purely a convenience the book
// unlocks; you can always type the whole thing by hand.
const RONML_VERBS = ['scan', 'nearest', 'keys', 'hack', 'crash', 'sleep', 'repel', 'map', 'print', 'help', 'let'];
const escapeHtml = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function ronmlCompletion(value) {
  if (!player.readManuals || !player.readManuals.has('book_ronml')) return '';
  const m = value.match(/([A-Za-z]+)$/); // the alphabetic token at the caret
  if (!m) return '';
  const tok = m[1];
  const hit = RONML_VERBS.find((v) => v.length > tok.length && v.startsWith(tok));
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
  if (e.key === 'Tab') {
    const suffix = ronmlCompletion(obTermInput.value);
    if (suffix) { obTermInput.value += suffix; updateGhost(); }
    e.preventDefault();
    e.stopPropagation();
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
  aiosHeader.textContent = `SKYLINK CORE  //  NODE ${ob.code || '????'}  //  ACCESS DENIED  //  NO KEY`;
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
const HINT_LIFETIME = 120; // seconds of played time
let playTime = 0;

// Backpack view: I toggles a read-only panel (drawn by the renderer). It's
// read-only because the pockets/backpack split is already automatic —
// there's nothing to drag between them.
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
    player.deathCert = { name: player.name, cause: 'nothing — you won', score: player.score, skills: [...player.skills], deaths: player.deaths || 0, victory: true };
    persist();
    return;
  }
  // Not the winning blow, but if SKYLINK is already blazing, felling a tower
  // breaks the laser web and shuts the purge down — a hard-won reprieve. The
  // obelisk is flagged for rebuild; the factory rushes a repair drone to it,
  // and only once it's raised again (nothing left flagged) does SKYLINK come
  // back online (see the activation guard below). Knock towers down faster
  // than they can be rebuilt and you can still win outright during the purge.
  if (player.skylinkActive && ob) {
    player.skylinkActive = false;
    ob.needsRebuild = true;
    player.say('The tower comes down and the SKYLINK web collapses — dark, for now. A repair drone is already inbound to raise it.');
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
    if (obj.type === 'obelisk') return `An AI signal obelisk. Black, humming, ${obj.alert > 0.3 ? 'and it has seen you.' : 'watching.'}`;
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
let wFactoryClock = 0, wFactoryNext = 60 + Math.random() * 60;
let wFactoryW1Clock = 0, wFactoryW1Next = 100 + Math.random() * 80;
let lastW4GameHour = dayNight.totalHours; // ticks a W4 every 30 game-minutes, not real time

// SKYLINK's final purge: once the clock runs out, every obelisk lights up
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

  if (input.newGamePressed()) {
    if (window.confirm('Start a new game? This erases your saved progress.')) {
      fullReset();
      return;
    }
  }
  if (input.craftPressed()) {
    if (player.canCraftWaveGun()) player.craftWaveGun(map);
    else if (player.canCraftObGun()) player.craftObGun(map);
    else if (player.canCraftChip()) player.craftChip();
    else if (player.canCraftSword()) player.craftSword();
  }
  if (input.zoomTogglePressed()) camera.toggleZoom();
  lore.update(dt, player, input);
  if (input.musicTogglePressed()) {
    const on = sfx.toggleMusic();
    player.say(on ? 'Music on.' : 'Music off.');
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
    if (modalClick) {
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
  const up = input.consumeUp();
  if (up && drag) {
    const target = renderer.slotAt ? renderer.slotAt(up.x, up.y) : null;
    if (target && target.kind === drag.from.kind && target.i === drag.from.i) {
      player.equipSlot(drag.from); // released on the source: treat as a click
    } else if (target) {
      player.moveItem(drag.from, target);
    } else if (showBackpack) {
      // Released away from any slot while the backpack panel is open: drag it
      // off the panel to drop it on the ground. Gated on the panel being up so
      // a fumbled dashboard drag doesn't fling a pocket item away by accident.
      player.dropSlot(drag.from, map);
    }
    drag = null;
  } else if (!input.mouseHeld) {
    drag = null; // released outside any slot: cancel the drag
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

  // The W-factory: while any obelisk is damaged but not yet destroyed, it
  // periodically fields a single W3 to go and mend the nearest one. Only
  // one W3 is ever out at a time. It also builds W1 hunting waves on its own
  // clock — not just as a one-off revenge squad when a tower falls — so long
  // as it isn't already fielding one.
  if (factoryLive()) {
    wFactoryClock += dt;
    if (wFactoryClock > wFactoryNext) {
      wFactoryClock = 0;
      wFactoryNext = 60 + Math.random() * 60;
      const anyDamaged = obeliskObjs.some((o) => (!o.destroyed && o.obDamage > 0) || o.needsRebuild);
      const w3Active = robots.some((r) => r.type === 'w3' && !r.dead);
      if (anyDamaged && !w3Active) {
        const drone = spawnW3(map, Math.floor(Math.random() * 0x7fffffff), factoryCx(), factoryCy());
        if (drone) { robots.push(drone); player.say('A repair drone whirs out of the W-factory.'); }
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
    for (const r of robots) {
      if (!r.singing) continue;
      const band = CHOIR_REGISTERS[(r.choirVoice || 0) % 4];
      let last = -1;
      for (let i = band.length - 1; i >= 0; i--) { if (band[i] <= choirT) { last = band[i]; break; } }
      r.choirFlash = last >= 0 ? Math.max(0, 1 - (choirT - last) / 0.4) : 0;
    }
  }
  resolveBodyOverlaps(player, animals, robots);
  map.updateShakes(dt);
  dayNight.update(dt);
  // Time's up: SKYLINK-9000 comes online. Every obelisk lights up and links
  // to every other in a web of lasers, and the factory throws wave after
  // wave of W4s at you — indefinitely. There's no timer to survive to; it
  // simply doesn't stop, and the run ends only when it finally catches you
  // (see dieToSkylink in player.js).
  // ...but not while a tower it needs is still down and being rebuilt — that
  // suspension is the player's reprieve, and SKYLINK only (re)lights once the
  // repair drone has raised every flagged tower back up.
  if (dayNight.hoursLeft() <= 0 && !player.skylinkActive && !player.deathCert && !player._ended
    && !obeliskObjs.some((o) => o.needsRebuild)) {
    player.skylinkActive = true;
    skylinkTimer = 0; // now counts up: seconds survived under the purge
    skylinkW4Clock = 0;
    player.say('SKYLINK-9000 comes online. Every obelisk blazes and turns on you at once.');
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
  for (const ob of obeliskObjs) {
    if (ob.burning > 0) ob.burning -= dt; // OB-gun flame timer, ticked for the renderer
    if (ob.destroyed) continue;
    const d = Math.hypot(ob.x + 0.5 - player.x, ob.y + 0.5 - player.y);
    if (d < 9) {
      ob.alert = Math.min(1, ob.alert + dt * 1.5);
    } else {
      ob.alert = Math.max(0, ob.alert - dt * 0.4);
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
    renderer.draw(camera, map, player, animals, {
      fps,
      version: VERSION,
      light: dayNight.light(),
      timeLabel: dayNight.countdownLabel,
      minimap,
      birds,
      robots,
      waterdroids,
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
      skylinkActive: player.skylinkActive && !player._ended,
      skylinkTimer,
      obeliskObjs,
      paused,
      rest: resting ? { dim: restDim(resting.t) } : null,
    });
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
