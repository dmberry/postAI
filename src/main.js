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
import { spawnRobots, updateRobots, spawnW1s, spawnW3, spawnW4 } from './game/robots.js';
import { resolveBodyOverlaps } from './game/collision.js';
import { spawnWaterDroids, updateWaterDroids } from './game/waterdroids.js';
import { Lore } from './game/lore.js';
import { ITEMS } from './game/items.js';
import { sfx } from './engine/sound.js';

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
const VERSION = '0.56';

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
    map.groundItems.push({ item, qty, x: x + 0.5, y: y + 0.5 });
  };
  for (let i = 0; i < 12; i++) drop(boards, 'torch', 1);
  for (let i = 0; i < 14; i++) drop(boards, 'tin', 1);
  for (let i = 0; i < 16; i++) drop(tallgrass, 'berries', 2 + Math.floor(rng() * 2));
  // Books are rarer: one copy of each plus two duplicates, buildings only.
  const books = ['book_wood', 'book_herbs', 'book_track', 'book_run', 'book_herbs', 'book_track'];
  for (const b of books) drop(boards, b, 1);
  // A single backpack, somewhere in the ruins.
  drop(boards, 'backpack', 1);
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
  const guaranteed = [
    [{ item: 'stungun', qty: 1 }, { item: 'battery', qty: 2 }],
    [{ item: 'pistol', qty: 1 }, { item: 'ammo', qty: 6 }],
    [{ item: 'electrogun', qty: 1 }, { item: 'battery', qty: 1 }],
    [{ item: 'shotgun', qty: 1 }, { item: 'shells', qty: 4 }],
    [{ item: 'crowbar', qty: 1 }],
    [{ item: 'battery', qty: 2 }],
    // Exactly one Wi-Fi block per world: rare, in a random guaranteed cache.
    [{ item: 'wifiblock', qty: 1 }, { item: 'battery', qty: 2 }],
    // A shovel for digging robot traps.
    [{ item: 'shovel', qty: 1 }],
    // A saw: fells trees fast and scores more per tree.
    [{ item: 'saw', qty: 1 }],
    // Demolition caches: a couple of bombs to get you started.
    [{ item: 'bomb_small', qty: 1 }, { item: 'bomb_small', qty: 1 }],
    [{ item: 'bomb_medium', qty: 1 }],
    // Late-game weapons: previously defined in ITEMS but never actually
    // placed anywhere in the world, so they were unobtainable in play.
    [{ item: 'bow', qty: 1 }, { item: 'arrow', qty: 12 }],
    [{ item: 'katana', qty: 1 }],
    [{ item: 'sledgehammer', qty: 1 }],
    [{ item: 'railgun', qty: 1 }, { item: 'battery', qty: 2 }],
    // Every remaining tool/weapon in ITEMS gets at least one guaranteed
    // spawn too — except the wave gun and OB-gun, which stay crafting-only.
    [{ item: 'penknife', qty: 1 }],
    [{ item: 'seatbelt', qty: 1 }],
    [{ item: 'bat', qty: 1 }],
    [{ item: 'machete', qty: 1 }],
  ];
  const rollLoot = () => {
    const r = rng();
    if (r < 0.28) {
      const MELEE = ['crowbar', 'bat', 'machete', 'crowbar'];
      return [{ item: MELEE[Math.floor(rng() * MELEE.length)], qty: 1 }];
    }
    if (r < 0.58) {
      const AMMO = [
        [{ item: 'battery', qty: 2 }],
        [{ item: 'ammo', qty: 6 }],
        [{ item: 'shells', qty: 4 }],
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
}

// The W-factory: the AI's foundry for repair drones. It never attacks on
// its own, but every so often — while any obelisk is damaged but not yet
// toppled — it fields a W3 to go and mend one.
let wfactory = null;
{
  const rng = makeRng(WORLD_SEED ^ 0x5a11c0de);
  let guard = 0;
  while (!wfactory && guard++ < 5000) {
    const x = 4 + Math.floor(rng() * (map.w - 8));
    const y = 4 + Math.floor(rng() * (map.h - 8));
    const f = map.floorAt(x, y);
    if ((f !== 'grass' && f !== 'tallgrass') || map.objectAt(x, y)) continue;
    if (Math.hypot(x - spawn.x, y - spawn.y) < 20) continue;
    wfactory = map.addObject('wfactory', x, y);
  }
}

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

// Character persona and learned skills persist across sessions and deaths.
const SAVE_KEY = 'postai-character';
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

// Help modal: H toggles, the ? button opens, clicking the backdrop closes.
const helpEl = document.getElementById('help');
const toggleHelp = (force) => {
  const show = force != null ? force : helpEl.style.display !== 'block';
  helpEl.style.display = show ? 'block' : 'none';
};
document.getElementById('helpBtn').addEventListener('click', () => toggleHelp(true));
helpEl.addEventListener('click', (e) => { if (e.target === helpEl) toggleHelp(false); });

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
    const originX = wfactory ? wfactory.x + 0.5 : ob.x + 0.5;
    const originY = wfactory ? wfactory.y + 0.5 : ob.y + 0.5;
    const squad = spawnW1s(map, squadSeed, originX, originY, 2 + Math.floor(Math.random() * 3));
    if (squad.length) {
      robots.push(...squad);
      player.say(`The W-factory dispatches a revenge squad: ${squad.length} W1 hunter${squad.length > 1 ? 's' : ''}, already coming for you.`);
    }
  }
  // Victory: every obelisk toppled before the deadline.
  if (obeliskObjs.every((o) => o.destroyed) && !player._ended) {
    player._ended = true;
    player.addScore(100);
    player.deathCert = { name: player.name, cause: 'nothing — you won', score: player.score, skills: [...player.skills], deaths: player.deaths || 0, victory: true };
    persist();
  }
};

// Attacking an obelisk reports up the network at once: the W-factory answers
// by dispatching a laser-armed W4 after you. Throttled so a burst of five
// hits (one obelisk) or rapid OB-gun fire can't spam a whole squadron.
let wFactoryW4Cooldown = 0;
player.onObeliskAttacked = () => {
  if (!wfactory || wFactoryW4Cooldown > 0) return;
  wFactoryW4Cooldown = 25;
  const w4 = spawnW4(map, Math.floor(Math.random() * 0x7fffffff), wfactory.x + 0.5, wfactory.y + 0.5);
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
    const src = towers.length ? towers[Math.floor(Math.random() * towers.length)] : wfactory;
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
  if (input.newGamePressed()) {
    if (window.confirm('Start a new game? This erases your saved progress.')) {
      resettingGame = true; // block the beforeunload/hidden autosave from undoing this
      localStorage.removeItem('postai-character');
      localStorage.removeItem('postai-lore');
      localStorage.removeItem(SEED_KEY); // a fresh game gets a freshly shuffled world
      location.reload();
      return;
    }
  }
  if (input.craftPressed()) {
    if (player.canCraftWaveGun()) player.craftWaveGun(map);
    else if (player.canCraftObGun()) player.craftObGun(map);
  }
  if (input.zoomTogglePressed()) camera.toggleZoom();
  lore.update(dt, player, input);
  if (input.musicTogglePressed()) {
    const on = sfx.toggleMusic();
    player.say(on ? 'Music on.' : 'Music off.');
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
    if (click || input.consumeUp()) { input.consumeClick(); player.deathCert = null; }
    return;
  }

  // Right-click inspects whatever is under the cursor.
  const right = input.consumeRight();
  if (right) {
    const w = camera.toWorld(right.x, right.y, renderer.w, renderer.h);
    detail = { text: describeAt(Math.floor(w.x), Math.floor(w.y)), x: right.x, y: right.y, ttl: 6 };
  }
  if (detail) { detail.ttl -= dt; if (detail.ttl <= 0) detail = null; }

  // Pointer over the dashboard/backpack slots: press begins a drag (or, on a
  // same-slot release, a click-equip); release drops onto the target slot.
  // Claimed here so a slot press never also swings the held tool.
  const press = input.clickPos();
  if (press && renderer.slotAt) {
    const slot = renderer.slotAt(press.x, press.y);
    if (slot) {
      input.consumeClick();
      if (player.getSlot(slot)) drag = { from: slot };
      else player.equipSlot(slot); // empty hands slot: stow whatever's held
    }
  }
  const up = input.consumeUp();
  if (up && drag) {
    const target = renderer.slotAt ? renderer.slotAt(up.x, up.y) : null;
    if (target && target.kind === drag.from.kind && target.i === drag.from.i) {
      player.equipSlot(drag.from); // released on the source: treat as a click
    } else if (target) {
      player.moveItem(drag.from, target);
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
      box.loot = r < 0.4 ? [{ item: 'battery', qty: 2 }] : r < 0.7 ? [{ item: 'ammo', qty: 6 }] : [{ item: 'shells', qty: 4 }];
      box.opened = false;
    }
  }

  // The W-factory: while any obelisk is damaged but not yet destroyed, it
  // periodically fields a single W3 to go and mend the nearest one. Only
  // one W3 is ever out at a time. It also builds W1 hunting waves on its own
  // clock — not just as a one-off revenge squad when a tower falls — so long
  // as it isn't already fielding one.
  if (wfactory) {
    wFactoryClock += dt;
    if (wFactoryClock > wFactoryNext) {
      wFactoryClock = 0;
      wFactoryNext = 60 + Math.random() * 60;
      const anyDamaged = obeliskObjs.some((o) => !o.destroyed && o.obDamage > 0);
      const w3Active = robots.some((r) => r.type === 'w3' && !r.dead);
      if (anyDamaged && !w3Active) {
        const drone = spawnW3(map, Math.floor(Math.random() * 0x7fffffff), wfactory.x + 0.5, wfactory.y + 0.5);
        if (drone) { robots.push(drone); player.say('A repair drone whirs out of the W-factory.'); }
      }
    }
    wFactoryW1Clock += dt;
    if (wFactoryW1Clock > wFactoryW1Next) {
      wFactoryW1Clock = 0;
      wFactoryW1Next = 100 + Math.random() * 80;
      const liveW1 = robots.filter((r) => r.type === 'w1' && !r.dead).length;
      if (liveW1 < 3) {
        const wave = spawnW1s(map, Math.floor(Math.random() * 0x7fffffff), wfactory.x + 0.5, wfactory.y + 0.5, 2 + Math.floor(Math.random() * 2));
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
        const w4 = spawnW4(map, Math.floor(Math.random() * 0x7fffffff), wfactory.x + 0.5, wfactory.y + 0.5);
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
  resolveBodyOverlaps(player, animals, robots);
  map.updateShakes(dt);
  dayNight.update(dt);
  // Time's up: SKYLINK-9000 comes online. Every obelisk lights up and links
  // to every other in a web of lasers, and the factory throws wave after
  // wave of W4s at you — indefinitely. There's no timer to survive to; it
  // simply doesn't stop, and the run ends only when it finally catches you
  // (see dieToSkylink in player.js).
  if (dayNight.hoursLeft() <= 0 && !player.skylinkActive && !player.deathCert && !player._ended) {
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
    craftPrompt: (player.canCraftObGun() && player.hands !== 'obgun') || (player.canCraftWaveGun() && player.hands !== 'wavegun'),
    craftWaveGun: player.canCraftWaveGun() && player.hands !== 'wavegun',
    skylinkActive: player.skylinkActive && !player._ended,
    skylinkTimer,
    obeliskObjs,
    paused,
  });

  frameCount += 1;
  fpsClock += elapsed;
  if (fpsClock >= 1) {
    fps = frameCount;
    frameCount = 0;
    fpsClock -= 1;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
