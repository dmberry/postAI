import { Renderer } from './engine/renderer.js';
import { Camera } from './engine/camera.js';
import { Input } from './engine/input.js';
import * as systems from './engine/systems.js';
import { buildWorld } from './game/worldgen.js';
import { spawnAnimals, updateAnimals } from './game/animals.js';
import { Player } from './game/player.js';
import { seawardFrom, boatMirror, CF_MIN } from './game/crossing.js';
import { makeRng } from './game/rng.js';
import { DayNight } from './game/daynight.js';
import { Minimap } from './game/minimap.js';
import { spawnBirds, updateBirds } from './game/birds.js';
import { spawnRobots, registerRobotsSystem, spawnW1s, spawnW3, spawnW4, spawnW5, spawnM4, spawnM5, spawnM6, spawnGuard, drawRobot } from './game/robots.js';
import { resolveBodyOverlaps } from './game/collision.js';
import { spawnWaterDroids, updateWaterDroids, drawWaterDroid } from './game/waterdroids.js';
import { Lore, FRAGMENTS } from './game/lore.js';
import { ITEMS, TAPES } from './game/items.js';
import { sfx } from './engine/sound.js';
import { worldToScreen } from './engine/iso.js';
import { runRonml } from './game/ronml.js';
import { createEliza } from './game/eliza.js';
import { placeTors, HERMES_DOCS, hermesTopics, virusFor, virusFilesFor, virusDocsFor } from './game/hermes.js';
import { VERSION } from './version.js';
import { drawRobotVision } from './game/robotvision.js';
import { screenDirToWorld } from './engine/iso.js';
import { stampCoast } from './engine/coast.js';
import { placeRuins } from './game/ruins.js';
import { createFortress, DAEMON_BOOK_ID, DAEMON_BOOK_TITLE } from './game/fortress.js';
import { createUnderworldPocket, spawnUnderworldCreature, updateUnderworldCreatures } from './game/underworld.js';
import { createWorld, registerWorld, switchWorld } from './game/world.js';
import { createIsland } from './islands/calypso.js';
import { createIthaca } from './islands/ithaca.js';
import { createPolyphemus } from './islands/polyphemus.js';
import { createCirce } from './islands/circe.js';
import { createHelios } from './islands/helios.js';
import { createNokia, sendNokia, holdRise, holdFall, holdBand, HOLD_COLD, HOLD_WARM, calypsoSms, ronSms, logSms } from './game/nokia.js';
import { newSnakeGame, snakeTurn, snakeTurnRelative, snakeTick, drawSnake } from './game/snake.js';
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
// The island is built by createIsland (src/islands/calypso.js): buildWorld + all
// overworld construction, returned as a World. main.js keeps the player, save/load,
// lore, and the player/lore-coupled controllers (worldStir, onCoreDefeated), and
// aliases the World's arrays + controllers by name so the runtime sites below are
// unchanged. (islands Stage 0c, docs/islands-plan.md §3.)
const calypso = registerWorld(createIsland(WORLD_SEED));
let map = calypso.map;
const overworldMap = map; // stable handle: `map` gets reassigned to the underworld pocket and back
// currentWorld is the world the player is on now; calypso is the stable overworld
// handle. Declared here (not lower) so persist()'s "only save on calypso" guard is
// safe when an eval-time persist() fires during boot, before the old site.
let currentWorld = calypso;
// `let`, not `const`: the combat-world controllers/arrays are repointed to the
// current island on every switch into a combat world (goToWorld), so the ~66
// bare-alias sites (worldStir, onCoreDefeated, the factory helpers, the full
// update loop) all follow the island you are actually on. A second martial island
// (POLYPHEMUS) reuses the entire loop this way with no per-site edits.
let { spawn, robots, animals, birds, waterdroids, obelisks, obeliskObjs, fortress, wfactory, mainframe, torObjs } = calypso;
const player = new Player(spawn.x, spawn.y);
player.map = map; // for death drops when damage comes from animals (kept in sync on underworld enter/exit)
// Dispatch/repair fires from the factory centre, and stops once it's destroyed.
const factoryLive = () => wfactory && !wfactory.destroyed;
const factoryCx = () => wfactory.x + (wfactory.fw || 1) / 2;
const factoryCy = () => wfactory.y + (wfactory.fh || 1) + 1.5;
registerRobotsSystem(); // robots' AI ticks via systems.runUpdate (order 30); see robots.js
// "Red starlink": when the fortress breach reaches the world (the alarm trips),
// every overworld obelisk flares red (its `stirred` flag forces the alert glow,
// HUD untouched) and the W-factory throws a W4 toward the doorway. `calm` clears
// the flare when the fortress stands down. (Severing the link before it fires is
// a terminal hack — the adjacent-possible that replaced the old smashable mast.)
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
  // The core manufactures and dispatches guards, seated on the sanctum by the
  // core, deployed already hunting — they pathfind up through the maze to the
  // intruder. Called with a big count on the first breach, then trickled as
  // reinforcements while the alarm holds (a relentless violation response).
  spawnWave(m6n = 4, m5n = 2) {
    const cx = fortress.core.x, cy = fortress.core.y;
    for (let i = 0; i < m6n; i++) {
      const g = spawnM6(map, Math.floor(Math.random() * 0x7fffffff), cx, cy);
      if (g) { g.aggro = true; robots.push(g); }
    }
    const posts = fortress.quad.muster;
    for (let i = 0; i < m5n; i++) {
      const s = spawnM5(map, Math.floor(Math.random() * 0x7fffffff), cx, cy);
      if (s) {
        s.aggro = true;
        // Assign the sniper a post out on the quad to hold back at, so it snipes
        // from the open killing-ground rather than chasing into the maze.
        s.holdPos = posts.length ? posts[Math.floor(Math.random() * posts.length)] : { x: cx, y: fortress.quad.top + 2 };
        robots.push(s);
      }
    }
  },
};

// Killing an island's fortress AI kills the island: every hostile machine here
// loses its controlling mind and powers down where it stands. Deliberately
// ISLAND-AGNOSTIC — an island has its own `robots` set + fortress, so the exact
// same call powers down exactly this island's machines. When the Archipelago
// adds APOLLO / ATHENA / HADES, each island wires its own core to this hook and
// defeats independently. Friendlies (running on a battery you gave them) stay.
player.onCoreDefeated = (core) => {
  const ai = fortress.AI_NAME;
  let powered = 0;
  for (const r of robots) {
    if (r.dead || r.fused || r.friendly) continue;
    r.aggro = false;
    r.drained = true;      // flat: inert until re-batteried (they never re-arm — the mind is gone)
    r.poweredDown = true;  // render tell: a cold, dead husk
    powered += 1;
  }
  worldStir.calm();        // clear the red POSEIDON alert
  // The towers die with the mind that ran them: every standing obelisk goes
  // dark and inert — no signal light, no alert, nothing left to stir. (They
  // still stand, and still yield chips if broken open.)
  for (const o of obeliskObjs) {
    if (!o.destroyed) { o.poweredDown = true; o.alert = 0; o.stirred = false; }
  }
  player.addScore(500);
  daemonsDown += 1;
  // The dead core throws its testament into the open — auto-recover it to the
  // Scrapbook (the eidolon/Coherence book seeds the archipelago). `quiet` so it
  // doesn't fight the modal for the message line; the modal announces it.
  let book = null;
  if (lore && lore.findFrag && lore.findFrag(DAEMON_BOOK_ID, player, true)) book = DAEMON_BOOK_TITLE;
  // The celebration: a dismissable level-up modal. It does NOT end the run —
  // you sail on to the next daemon. Carries the daemon's last words + the book.
  player.aiVictory = {
    ai, powered, score: player.score, daemon: daemonsDown, daemons: 4,
    lastWords: core && core.lastWords, book,
  };
  player.say(`${ai} is dead. Every machine on the island powers down where it stands.`);
};
let daemonsDown = 0; // how many island AIs felled this run (for the Archipelago tally)

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
// The AI-key backup survives death (its own durable key, not the run save).
try { if (localStorage.getItem('postai-aikey-backup')) player.aikeyBackedUp = true; } catch { /* ignore */ }
let hadExistingSave = false;
// Stage 1c: which island the save left the player on, and where. Applied at the
// very end of boot (after all init + the world machinery), since resuming onto a
// non-overworld island means a goToWorld() the rest of module-eval must not see.
let _bootIsland = 'calypso', _bootPos = null;
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
      if (st.calypsoLeave) player.calypsoLeave = true; // sticky: refunctioning Calypso persists across reload
      if (typeof st.swine === 'number') player.swine = st.swine; // CIRCE's change follows you across a reload
      if (typeof st.calypsoHold === 'number') player.calypsoHold = st.calypsoHold; // Nokia gradient survives reload
      if (Array.isArray(st.nokiaSent)) player.nokiaSent = new Set(st.nokiaSent);   // don't re-tutorial on reload
      if (typeof st.nokiaParts === 'number') player._nokiaParts = st.nokiaParts;
      if (Array.isArray(st.nokiaLog)) player.nokiaLog = st.nokiaLog; // the SMS threads survive reload
      if (typeof st.snakeHigh === 'number') player.snakeHigh = st.snakeHigh; // Snake's best game survives too
      if (Array.isArray(st.virusArmed)) player.virusArmed = new Set(st.virusArmed);
      // Pre-v1.126 saves: a hermes card existed but carried no per-island arming.
      // Grandfather it as armed against CALYPSO so an in-flight run isn't stranded.
      else if (player.hasItem('hermes_card')) player.virusArmed = new Set(['CALYPSO']);
      if (typeof st.x === 'number') _bootPos = { x: st.x, y: st.y }; // the saved position, for the island resume below
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
    // Re-apply saved world progress onto the freshly-regenerated world. The world
    // itself comes back deterministically from the seed; we only stored the
    // mutations (felled obelisks, factory, daemon tally, fortress state). Written
    // by persist() below. This is why a Continue now resumes the world, not just you.
    if (saved.world) {
      const wsv = saved.world;
      if (Array.isArray(wsv.obDown)) {
        const down = new Set(wsv.obDown);
        for (const o of calypso.obeliskObjs) {
          if (down.has(o.code)) { o.destroyed = true; map.objectGrid[o.y * map.w + o.x] = null; }
        }
      }
      if (wsv.factoryDestroyed && wfactory) wfactory.destroyed = true;
      if (Array.isArray(wsv.boxesOpened)) {
        const open = new Set(wsv.boxesOpened.map((b) => `${b.x},${b.y}`));
        for (const o of overworldMap.objects) {
          if (o.type === 'box' && open.has(`${o.x},${o.y}`)) { o.opened = true; o.lore = []; }
        }
      }
      if (typeof wsv.daemonsDown === 'number') daemonsDown = wsv.daemonsDown;
      if (wsv.fortress && fortress && fortress.restore) fortress.restore(wsv.fortress);
      if (wsv.currentIsland) _bootIsland = wsv.currentIsland; // Stage 1c: resume on the island you saved on
    }
  }
} catch { /* corrupt save: start fresh */ }
// A fresh start (no saved position — first ever run, or the reload after New
// Game / a death) begins washed ashore: flat on the sand where the spawn's
// beach relocation in calypso.js put you, until the first input gets you up.
// A Continue resumes on your feet wherever you saved.
if (!_bootPos) {
  player.lying = true;
  player.say('Sea in your ears. Sand under your cheek. You are ashore, wherever this is.');
}
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
// The full run snapshot (identity + progress + run state + world MUTATIONS). The
// world regenerates from the seed on load, so we store only what changed (felled
// obelisks, factory, daemon tally, fortress doors/core) and re-apply it
// (see the restore block above). Shared by the autosave and the stage checkpoints.
function buildSaveBlob() {
  return {
    name: player.name, gender: player.gender, skills: [...player.skills], skillLog: player.skillLog,
    weaponsFound: [...player.weaponsFound], killLog: player.killLog, circuitNums: [...player.circuitNums],
    xp: player.xp, score: player.score, deaths: player.deaths || 0,
    state: {
      health: player.health, stamina: player.stamina, food: player.food, venom: player.venom,
      wifiPower: player.wifiPower, x: player.x, y: player.y, hands: player.hands,
      pockets: player.pockets, backpack: player.backpack, walkman: player.walkman,
      calypsoLeave: player.calypsoLeave, // Calypso refunctioned: the sea will let you go
      swine: player.swine,               // CIRCE's transmutation: you stay changed across a reload
      calypsoHold: player.calypsoHold,   // the Nokia gradient: her hold on you (docs/calypso-nokia-plan.md)
      nokiaSent: [...player.nokiaSent],  // the one-shot texts already sent, so a reload does not re-tutorial
      nokiaParts: player._nokiaParts || 0,
      nokiaLog: (player.nokiaLog || []).slice(-40), // the SMS threads, so the correspondence survives reload
      snakeHigh: player.snakeHigh || 0,  // the handset remembers its best game
      virusArmed: [...(player.virusArmed || [])], // which daemons the card is armed against (per-island virus)
    },
    world: {
      currentIsland: currentWorld.id, // Stage 1c: which island you're on, so a voyage survives reload
      obDown: calypso.obeliskObjs.filter((o) => o.destroyed).map((o) => o.code),
      factoryDestroyed: !!(wfactory && wfactory.destroyed),
      // Looted caches, keyed by tile — the world regenerates them full otherwise.
      boxesOpened: overworldMap.objects.filter((o) => o.type === 'box' && o.opened).map((o) => ({ x: o.x, y: o.y })),
      daemonsDown,
      fortress: (fortress && fortress.serialize) ? fortress.serialize() : null,
    },
  };
}
const persist = () => {
  if (resettingGame) return;
  // Savable worlds are the islands you can be on across a reload: CALYPSO and
  // ITHACA (Stage 1c — buildSaveBlob records world.currentIsland, and the boot
  // restore resumes you there). The Backspace is a transient pocket you always
  // exit by its door, so it is never saved: doing so would drop you back onto
  // CALYPSO at the pocket's coordinates on Continue.
  if (!currentWorld.combat && currentWorld.id !== 'ithaca') return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(buildSaveBlob()));
    localStorage.setItem(IDENTITY_KEY, JSON.stringify({ name: player.name, gender: player.gender }));
  } catch { /* storage unavailable */ }
};

// ---- Stage checkpoints (the Load list) -------------------------------------
// Milestones auto-snapshot the whole run (blob + seed) into their own store the
// first time you reach them. The gate's Load list reads these, so death (which
// wipes the run via fullReset, but NOT this key) drops you back to the gate where
// you can resume from a stage you'd earned. See mobile-gate.js for the list.
const STAGES_KEY = 'postai-stages';
const STAGE_LADDER = [
  { id: 'ashore',    label: 'Washed ashore',           reward: 0,  reached: () => true },
  { id: 'chip',      label: 'Jacked in',               reward: 10, reached: () => player.hasItem('chip') },
  { id: 'aikey',     label: 'The AI key',              reward: 20, reached: () => player.hasAiKeyFamily() },
  { id: 'trojan',    label: 'Trojan card',             reward: 25, reached: () => player.hasItem('trojan_key') || player.hasItem('hermes_card') },
  { id: 'hermes',    label: 'Hermes card',             reward: 30, reached: () => player.hasItem('hermes_card') },
  { id: 'lionsgate', label: "Through the Lion's Gate", reward: 40, reached: () => !!(fortress && fortress.open) },
  { id: 'core',      label: 'The core falls',          reward: 50, reached: () => !!(fortress && fortress.core && fortress.core.obj && fortress.core.obj.defeated) },
];
let _savedStages;
try { _savedStages = new Set(Object.keys(JSON.parse(localStorage.getItem(STAGES_KEY) || '{}'))); }
catch { _savedStages = new Set(); }
function saveStage(id, label) {
  try {
    const stages = JSON.parse(localStorage.getItem(STAGES_KEY) || '{}');
    stages[id] = {
      id, label, order: STAGE_LADDER.findIndex((s) => s.id === id),
      score: player.score || 0, ts: Date.now(),
      seed: String(WORLD_SEED), save: buildSaveBlob(), // in-memory seed = always the live world's
    };
    localStorage.setItem(STAGES_KEY, JSON.stringify(stages));
  } catch { /* storage unavailable */ }
}
// Polled once per frame — the reached() checks are cheap and a stage is written
// only the first time (per store), so it never thrashes. Saved once ever, so a
// checkpoint keeps the state from when you first reached it.
let _lastAutosave = 0; // wall-clock of the last periodic persist (see frame())
function checkMilestones() {
  for (const m of STAGE_LADDER) {
    if (!_savedStages.has(m.id) && m.reached()) {
      _savedStages.add(m.id);
      if (m.reward && player.addScore) player.addScore(m.reward); // link progress to rank — modestly
      saveStage(m.id, m.label);
      if (m.id !== 'ashore') player.say(`Checkpoint: ${m.label} (+${m.reward}) — load back to here from the title.`);
    }
  }
}
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
for (const type of ['t1', 't2', 't3', 'w1', 'w2', 'w3', 'w4', 'w5', 'm4', 'm5', 'm6']) {
  const img = document.getElementById(`gal-${type}`);
  if (img) img.src = renderMachineIcon(type);
}
const camera = new Camera(player.x, player.y);
// `lore` self-registers as a system in its own constructor (Stage 0 of the
// systems-registry refactor, docs/refactor-registry.md) — the hub never names it.
// Its update ticks via systems.runUpdate() in update(); its two draw phases via
// the renderer's runDrawWorld/runDrawScreen.
const lore = new Lore(map, WORLD_SEED);
// Opening a resistance cache folds any recovered documents packed in it into the
// Scrapbook (quietly — openBox prints its own one-line summary).
player.onFindLore = (id) => lore.findFrag(id, player, true);

const dayNight = new DayNight();
const minimap = new Minimap(map);
let showMinimap = true; // toggled with the ] key
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
// The Backspace is its own World now (islands 0b). Built lazily on first entry and
// kept for the session. Its onEnter/onExit carry the narration + lore + drone, its
// update() ticks the lurker and the ambient shrieks, and its empty entity arrays
// give the draw a blanked overworld for free (no more `inUnderworld ? [] : …`).
let backspace = null;
function ensureBackspace() {
  if (backspace) return;
  // R4: one labelled way up per island — the doors of the dead, littered across the
  // pocket. The pocket stamps each door with its island id + place name (CROSSINGS).
  const dests = CROSSINGS.map((c) => ({ id: c.id, place: c.place }));
  const pocket = createUnderworldPocket((WORLD_SEED ^ 0x0b1c) >>> 0, dests);
  const creatures = [spawnUnderworldCreature((WORLD_SEED ^ 0x1e57) >>> 0, pocket.creatureX, pocket.creatureY)];
  let ambClock = 0, ambNext = 8 + Math.random() * 10;
  backspace = registerWorld(createWorld('backspace', {
    map: pocket.map,
    spawn: { x: pocket.spawnX, y: pocket.spawnY },
    creatures,
    keepsPosition: false, // always land in the tear's arrival room, never mid-pocket
    ambience: { light: 1, dawnGlow: false, minimap: false, underworld: true, musicBed: 'drone' },
    update(dt, pl) {
      updateUnderworldCreatures(dt, creatures, pl, pocket.map);
      ambClock += dt;
      if (ambClock > ambNext) { ambClock = 0; ambNext = 8 + Math.random() * 14; sfx.play(Math.random() < 0.5 ? 'shriek' : 'hiss'); }
    },
    onEnter() { lore.placeBackspace(pocket.map); sfx.setDrone(0.8); player.say('The tear swallows you. The air in here is wrong — flat, yellow, humming.'); },
    onExit() { lore.leaveBackspace(); sfx.setDrone(0); player.say('You come up through the tear. Ordinary daylight, ordinary weight. You are back.'); },
  }));
  backspace.exits = pocket.exits; // the labelled ways up, proximity-checked in the loop
}

// The single world-switch point. switchWorld moves the player + syncs player.map +
// fires onExit/onEnter; here we also sync the outer `map` local, the debug hook, and
// the camera. Everything reading currentWorld.* / `map` follows next frame.
function goToWorld(target) {
  currentWorld = switchWorld(currentWorld, target, player);
  map = currentWorld.map;
  // Repoint the combat-world aliases at the island we're now on, so the full
  // update loop + worldStir + onCoreDefeated + the factory helpers all operate on
  // this island's entities/controllers (a second martial island reuses the loop).
  // Only combat worlds carry these; non-combat worlds (Backspace, ITHACA) run the
  // slim loop and never touch the aliases, so we leave the last combat island's in
  // place for them.
  if (currentWorld.combat) {
    ({ robots, animals, birds, waterdroids, obelisks, obeliskObjs, fortress, wfactory, mainframe, torObjs } = currentWorld);
    Object.assign(window.__game, { robots, animals, birds, waterdroids, obelisks, obeliskObjs, fortress, wfactory });
  }
  window.__game.map = map;
  window.__game.currentWorld = currentWorld;
  // R3: in depart mode her fortress guards detain rather than slay (robots.js
  // reads this at the M4/M5/M6 hit sites). Poseidon's roaming machines are
  // untouched — only the guard classes consult it.
  player.detainMode = currentWorld.winMode === 'depart';
  camera.snap(player.x, player.y);
}

function enterBackspace() { ensureBackspace(); goToWorld(backspace); }

// The islands you sail between (islands-plan §6). Each far island is built lazily
// the first time you steer for it, from the campaign seed, and registered like the
// Backspace. The greek ship carries you between them via the heading chart below.
let ithaca = null;
function ensureIthaca() {
  if (ithaca) return;
  ithaca = registerWorld(createIthaca(WORLD_SEED));
  ithaca.onEnter = () => {
    if (daemonsDown >= 4) {
      // The true nostos: the war is won and you have come home.
      player.say('The keel grinds up the Ithacan sand. Argos lifts his grey head, and knows you. The machines are all fallen, the sea is quiet, and you are home. This is the end of the road, and the beginning of the rest of it.');
      if (!player._ended && !player.deathCert) {
        player._ended = true;
        player.deathCert = {
          name: player.name, gender: player.gender,
          cause: 'you came home to Ithaca', score: player.score,
          skills: [...player.skills], deaths: player.deaths || 0,
          victory: true, escaped: true, homecoming: true,
        };
      }
    } else {
      player.say("You beach the ship on Ithaca and step ashore. Argos lifts his head and knows you — but the machines still hold the sea, and this is landfall, not yet home. Fell the rest of them, then come back for good.");
    }
  };
}
let polyphemus = null;
function ensurePolyphemus() {
  if (polyphemus) return;
  polyphemus = registerWorld(createPolyphemus(WORLD_SEED));
  polyphemus.onEnter = () => {
    player.say("The ship grounds on the Cyclopes' shore. Somewhere inland a single vast eye turns, and the land goes taut with knowing you are here. This is POLYPHEMUS.");
  };
}
let circe = null;
function ensureCirce() {
  if (circe) return;
  circe = registerWorld(createCirce(WORLD_SEED));
  circe.onEnter = () => {
    player.say(player.hasMoly()
      ? 'You step onto Aeaea. Something reaches for the shape of you — and slides off. The moly in your pack holds you as you are.'
      : 'You step onto Aeaea. The air is sweet and wrong, and something begins, very gently, to rewrite you. Find moly — it grows where HERMES stands.');
  };
}
let helios = null;
function ensureHelios() {
  if (helios) return;
  helios = registerWorld(createHelios(WORLD_SEED));
  helios.onEnter = () => {
    player.say('The keel grinds up onto Thrinacia in a great flat light. Cattle graze the headland, golden and unafraid. This is HELIOS — and the herd is not yours to take.');
  };
}
// Resolve an island id to its (lazily-built) World.
function worldById(id) {
  if (id === 'calypso') return calypso;
  if (id === 'ithaca') { ensureIthaca(); return ithaca; }
  if (id === 'polyphemus') { ensurePolyphemus(); return polyphemus; }
  if (id === 'circe') { ensureCirce(); return circe; }
  if (id === 'helios') { ensureHelios(); return helios; }
  return null;
}

// The heading chart (islands-plan §10.1): boarding the ship opens a chart of the
// islands you know of; you pick where to steer. Every island but the one you are
// on is offered. (Danger-gated, not locked — you may sail early into a slaughter.)
// Each landfall carries its Homeric epithet — the formula the poem itself uses
// when it names the place — so the chart reads as a rhapsode's list of harbours
// rather than a level select.
const CROSSINGS = [
  { id: 'calypso', place: 'OGYGIA', epithet: 'the navel of the sea',
    desc: "Calypso's island, where you were kept, and kept well." },
  { id: 'polyphemus', place: 'AEGILIA', epithet: 'the goat isle, harbourless',
    desc: 'The land of the Cyclopes, who plant nothing and answer to no one. One eye watches it all.' },
  { id: 'circe', place: 'AEAEA', epithet: 'where the dawn has her dancing-floor',
    desc: 'Circe of the lovely braids. She does not kill what she takes — she changes what it is.' },
  { id: 'helios', place: 'THRINACIA', epithet: 'the island of the Sun',
    desc: 'His cattle graze there, and they are forbidden. The light itself keeps the watch.' },
  { id: 'ithaca', place: 'ITHACA', epithet: 'clear-seen, a good nurse of young men',
    desc: 'Home — rough, and small, and yours, if the sea will let you come to it.' },
];
const headingEl = document.getElementById('heading');
const headingListEl = document.getElementById('heading-list');
// Cancelling puts the helm over and rows you back in (headingCancelled), rather
// than just dismissing the modal and leaving you adrift offshore.
document.getElementById('heading-cancel').addEventListener('click', () => headingCancelled());
headingEl.addEventListener('click', (e) => { if (e.target === headingEl) headingCancelled(); });
// The chart the ship opens: pick an island and sail. (The Backspace's alternative
// crossing road, R4, is diegetic doors now — not this chart — so this stays the
// plain sailing chart.)
function openHeadingChart() {
  headingListEl.innerHTML = '';
  for (const c of CROSSINGS) {
    if (c.id === currentWorld.id) continue;
    const btn = document.createElement('button');
    btn.innerHTML = `<span class="place">${c.place}</span><span class="epithet">${c.epithet}</span>`
      + `<span class="desc">${c.desc}</span>`;
    btn.addEventListener('click', () => {
      headingEl.style.display = 'none';
      player.say(`You put the bow toward ${c.place}, and the fog takes the boat.`);
      pendingCrossing = c.id; // performed at the next frame top (see update())
    });
    headingListEl.appendChild(btn);
  }
  headingEl.style.display = 'flex';
}

// A boat crossing switches worlds, which must happen at a clean frame boundary
// (boarding is requested from inside player.update; switching mid-tick and then
// running the rest of an overworld frame against the wrong map is the drawObelisk-
// freeze class of bug). onDepart opens the chart; the chosen id sits in
// pendingCrossing and update() performs the switch at its top. null = nothing queued.
let pendingCrossing = null;
// Putting out to sea. You do NOT pick a heading from the sand — you row out
// first, the land slides away behind you and the fog closes ahead, and the chart
// opens from open water. It reframes the choice: not "which island shall I visit"
// off a menu, but a man alone on the water deciding which way to point the bow.
const DEPART_OUT = 5.2;      // seconds of rowing before the chart opens
const DEPART_BACK = 2.0;     // and of rowing home again if you think better of it
let departOut = null;        // { t, sx, sy, dx, dy, dist, charted, returning, boat }

player.onDepart = (p, boat) => {
  if (currentWorld.keeper) sendNokia(nokia, 'sail', { player }); // her last text, as you board to leave
  const dir = seawardFrom(map, p.x, p.y);
  if (!dir || dir.run < 2) { openHeadingChart(); return; } // nowhere to row: chart from where you stand
  departOut = {
    t: 0, sx: p.x, sy: p.y, dx: dir.x, dy: dir.y,
    dist: Math.min(dir.run, 15), charted: false, returning: false,
    bx: boat ? boat.x : Math.round(p.x), by: boat ? boat.y : Math.round(p.y),
    type: boat ? boat.type : 'greek_ship',
    boatProps: boat ? { ...boat } : null,
  };
  if (boat) map.removeObject(boat);           // she rides on player.aboard for the voyage
  player.aboard = { type: departOut.type, mirror: boatMirror(dir.x, dir.y), wob: 0 };
  sfx.play('jump');
  p.say('You put out from the beach. The land slides away behind you, and ahead there is only the fog.');
};

// Cancelled the chart while sitting out on the water: come about and row home
// rather than leaving the player marooned in a modal-less void offshore.
function headingCancelled() {
  headingEl.style.display = 'none';
  if (departOut && !departOut.returning) {
    departOut.returning = true;
    departOut.t = 0;
    player.aboard = { type: departOut.type, mirror: boatMirror(-departOut.dx, -departOut.dy), wob: 0 };
    player.say('You let the bow fall off, and pull back for the beach.');
  }
}

// Drive the row out (and, if you change your mind, the row home). Holds the rest
// of the world still, like the failed crossing does.
function updateDepartOut(dt) {
  const d = departOut;
  d.t += dt;
  const ease = (u) => u * u * (3 - 2 * u);
  if (d.returning) {
    const u = Math.min(1, d.t / DEPART_BACK);
    const run = d.dist * (1 - ease(u));
    player.x = d.sx + d.dx * run;
    player.y = d.sy + d.dy * run;
    if (player.aboard) player.aboard.wob = Math.sin(d.t * 6) * 1.4 * (1 - u);
    if (u >= 1) {
      // Ashore again, with the hull put back where it was drawn up.
      player.x = d.sx; player.y = d.sy;
      player.aboard = null;
      if (!map.objectAt(d.bx, d.by)) {
        const o = map.addObject(d.type, d.bx, d.by, d.boatProps || {});
        if (o && d.boatProps) Object.assign(o, d.boatProps, { x: d.bx, y: d.by });
      }
      departOut = null;
      player.say('The keel grates on the sand. Ogygia has you back, for now.');
    }
    return;
  }
  // Outward: the beach falls away and the fog gathers ahead.
  const u = Math.min(1, d.t / DEPART_OUT);
  const run = ease(u) * d.dist;
  player.x = d.sx + d.dx * run;
  player.y = d.sy + d.dy * run;
  if (player.aboard) player.aboard.wob = Math.sin(d.t * 4.4) * 1.6;
  if (!d.charted && d.t >= DEPART_OUT) {
    d.charted = true;
    sfx.play('zap');
    player.say('No land in any direction now. Only the fog, and the choice of a heading.');
    openHeadingChart();
  }
  // A heading was chosen: the crossing itself takes over at the next frame top.
  if (pendingCrossing) { player.aboard = null; departOut = null; }
}

// ---- The Nokia 3310: Calypso's channel on Ogygia (docs/calypso-nokia-plan.md) ----
// She is not your enemy — POSEIDON's machines roam the island; she is the keeper
// who texts you warnings, tips, and pleas, and (while her hold is not cold) freezes
// one of his robots bearing down on you. The queue + tables live in game/nokia.js;
// this drives the triggers, the beep, and the interventions on the keeper world.
const nokia = createNokia();
const NOKIA_DANGER_R = 6;   // she'll still one of his machines within this of you
const NOKIA_SCAN = 0.5;     // seconds between intervention scans (cheap)
let nokiaScanT = 0, nokiaIvCooldown = 0;

function updateNokiaKeeper(dt) {
  const ctx = { player };
  sendNokia(nokia, 'landfall', ctx);

  // Her hold on you IS her protection of you: it drifts UP while you linger inland,
  // and DOWN while you loiter by a beached vessel — and each leaving-signal steps
  // it down once, tied to the text that marks it.
  const nearVessel = map.objects.some((o) => (o.type === 'boat' || o.type === 'greek_ship')
    && Math.hypot(o.x + 0.5 - player.x, o.y + 0.5 - player.y) < 6);
  if (nearVessel) holdFall(player, 0.01 * dt); else holdRise(player, 0.005 * dt);
  const parts = ['oar', 'rope', 'sail'].reduce((n, p) => n + (player.hasItem(p) ? 1 : 0), 0);
  if (parts > (player._nokiaParts || 0)) { holdFall(player, 0.05 * (parts - (player._nokiaParts || 0))); player._nokiaParts = parts; }
  if (player.boatBuilt && sendNokia(nokia, 'boatCrafted', ctx)) holdFall(player, 0.15);
  if (player.hasItem('golden_axe') && sendNokia(nokia, 'axeGranted', ctx)) holdFall(player, 0.25);
  if (player.shipBuilt && sendNokia(nokia, 'shipCrafted', ctx)) holdFall(player, 0.20);

  // Ambient one-shot triggers (sendNokia is idempotent for `once` texts).
  if (dayNight.isNight && dayNight.isNight()) sendNokia(nokia, 'nightfall', ctx);
  if (player.maxHealth && player.health / player.maxHealth < 0.35) sendNokia(nokia, 'lowHP', ctx);
  if (player.weaponsFound && player.weaponsFound.size > 1) sendNokia(nokia, 'firstWeapon', ctx);
  const hostiles = currentWorld.robots.filter((r) => !r.dead && !r.fused && !r.friendly);
  if (hostiles.some((r) => Math.hypot(r.x - player.x, r.y - player.y) < 10)) sendNokia(nokia, 'firstHostile', ctx);
  if (currentWorld.obeliskObjs.some((o) => !o.destroyed && Math.hypot(o.x + 0.5 - player.x, o.y + 0.5 - player.y) < 6)) sendNokia(nokia, 'firstObelisk', ctx);

  // Her interventions: while her hold is not cold, reach out and freeze one of his
  // machines closing on you — her indigo over his amber. Cooldown scales with how
  // warm she is; below HOLD_COLD she does nothing (you lose her when you need her).
  if (nokiaIvCooldown > 0) nokiaIvCooldown -= dt;
  nokiaScanT += dt;
  if (nokiaScanT >= NOKIA_SCAN) {
    nokiaScanT = 0;
    const hold = player.calypsoHold ?? 0.65;
    if (hold >= HOLD_COLD && nokiaIvCooldown <= 0) {
      const target = hostiles.find((r) => r.aggro && (r.disabledT || 0) <= 0
        && Math.hypot(r.x - player.x, r.y - player.y) < NOKIA_DANGER_R);
      if (target) {
        target.disabledT = 5;
        target.stunColor = '#4b5cc4';
        nokiaIvCooldown = hold >= 0.85 ? 40 : hold >= HOLD_WARM ? 60 : 120;
        if (!sendNokia(nokia, 'firstIntervention', ctx)) sendNokia(nokia, 'intervention', ctx);
        player._nokiaIvIdx = (player._nokiaIvIdx || 0) + 1;
        sfx.play('zap');
      }
    }
  }
}

// Signal strength, 0–4 bars: it is HER network, so the bars are a compass to her.
// Full beside the core, fading across Ogygia, and dead the moment you are on any
// other island (the NO SIGNAL text made literal). Drawn live on the PHONE box, the
// SMS toast, and the handset's own status row.
function nokiaSignalBars() {
  if (!currentWorld.keeper || !fortress || !fortress.core) return 0;
  const d = Math.hypot(player.x - fortress.core.x, player.y - fortress.core.y);
  return d < 30 ? 4 : d < 60 ? 3 : d < 95 ? 2 : 1;
}

// ---- The handset itself: click the PHONE box, the screen opens (SMS both ways) --
const phoneEl = document.getElementById('nokiaphone');
const phThreadEl = document.getElementById('ph-thread');
const phInputEl = document.getElementById('ph-input');
const phBarsEl = document.getElementById('ph-bars');
const phToCal = document.getElementById('ph-to-calypso');
const phToRon = document.getElementById('ph-to-ron');
const phToSnake = document.getElementById('ph-to-snake');
const phSnakeEl = document.getElementById('ph-snake');
const phInputRowEl = phoneEl.querySelector('.ph-inputrow');
const phHintEl = phoneEl.querySelector('.ph-hint');
let phoneTo = 'CALYPSO';      // which thread is up ('SNAKE' = the game, not a thread)
let _phReplyTimer = null;

// ---- Snake (src/game/snake.js): the 3310 without Snake is half a phone ----
let snakeGame = null;         // live game state while the SNAKE tab is up
let _snakeTimer = null;       // its tick interval (only runs while visible)
function snakeStop() {
  clearInterval(_snakeTimer);
  _snakeTimer = null;
  snakeGame = null;
}
function snakeStart() {
  snakeGame = newSnakeGame();
  const ctx2 = phSnakeEl.getContext('2d');
  drawSnake(ctx2, snakeGame, player.snakeHigh || 0);
  clearInterval(_snakeTimer);
  _snakeTimer = setInterval(() => {
    if (!snakeGame || snakeGame.dead) return;
    if (snakeTick(snakeGame)) sfx.play('keydrop');       // the feed blip
    if (snakeGame.dead) {
      sfx.play('termerr');
      if ((snakeGame.score || 0) > (player.snakeHigh || 0)) player.snakeHigh = snakeGame.score;
    }
    drawSnake(ctx2, snakeGame, player.snakeHigh || 0);
  }, 130);
}

function renderPhone() {
  const bars = nokiaSignalBars();
  phBarsEl.textContent = '▂▄▆█'.slice(0, bars) || '·';
  phBarsEl.style.opacity = bars ? 1 : 0.45;
  phToCal.classList.toggle('on', phoneTo === 'CALYPSO');
  phToRon.classList.toggle('on', phoneTo === 'RON');
  phToSnake.classList.toggle('on', phoneTo === 'SNAKE');
  // The SNAKE tab swaps the whole message surface for the game screen.
  const snakeUp = phoneTo === 'SNAKE';
  phThreadEl.style.display = snakeUp ? 'none' : '';
  phInputRowEl.style.display = snakeUp ? 'none' : '';
  phSnakeEl.style.display = snakeUp ? 'block' : '';
  phHintEl.textContent = snakeUp
    ? 'Arrows to steer · tap left/right half to turn · Esc or ✕ to close'
    : 'Enter to send · Esc, ✕, or a click off the screen to close';
  if (snakeUp) {
    if (!snakeGame) snakeStart();
    return;
  }
  snakeStop();
  const thread = (player.nokiaLog || []).filter((m) => m.th === phoneTo);
  phThreadEl.innerHTML = thread.length
    ? thread.map((m) => `<div class="ph-${m.from === 'you' ? 'you' : m.from === 'sys' ? 'sys' : 'them'}">${
      m.text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>`).join('')
    : `<div class="ph-sys">${phoneTo === 'CALYPSO'
      ? 'No messages yet. She is waiting for you to write first, and has been for years.'
      : 'No traffic. The RON mesh keeps this channel open for whoever is still out there.'}</div>`;
  phThreadEl.scrollTop = phThreadEl.scrollHeight;
}
function openPhone() {
  phoneEl.style.display = 'flex';
  renderPhone();
  phInputEl.value = '';
  if (phoneTo !== 'SNAKE') phInputEl.focus();
}
function closePhone() {
  phoneEl.style.display = 'none';
  phInputEl.blur();
  snakeStop();
}
function phoneSend() {
  const text = phInputEl.value.trim();
  if (!text) return;
  phInputEl.value = '';
  const bars = nokiaSignalBars();
  logSms(player, phoneTo, 'you', text);
  if (!bars) {
    // Her network doesn't reach here — the message dies in the outbox.
    logSms(player, phoneTo, 'sys', 'NO SIGNAL — message not sent');
    sfx.play('termerr');
    renderPhone();
    return;
  }
  sfx.play('keydrop');
  renderPhone();
  // Texting her is attention, and attention is what she keeps you with.
  if (phoneTo === 'CALYPSO') holdRise(player, 0.02);
  const to = phoneTo;
  player._phSmsIdx = (player._phSmsIdx || 0) + 1;
  const reply = to === 'CALYPSO'
    ? calypsoSms(text, holdBand(player.calypsoHold ?? 0.65), player._phSmsIdx)
    : ronSms(text, player._phSmsIdx);
  clearTimeout(_phReplyTimer);
  _phReplyTimer = setTimeout(() => {
    logSms(player, to, 'them', reply);
    sfx.play('sms');
    if (phoneEl.style.display === 'flex') renderPhone();
  }, 1100 + Math.random() * 900);
}
phToCal.addEventListener('click', () => { phoneTo = 'CALYPSO'; renderPhone(); phInputEl.focus(); });
phToRon.addEventListener('click', () => { phoneTo = 'RON'; renderPhone(); phInputEl.focus(); });
phToSnake.addEventListener('click', () => { phoneTo = 'SNAKE'; renderPhone(); phInputEl.blur(); });
document.getElementById('ph-send').addEventListener('click', phoneSend);
phInputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') phoneSend();
  else if (e.key === 'Escape') closePhone();
  e.stopPropagation();
});
// Click anywhere off the SCREEN — the backdrop, the phone's own body, even
// the sprite's transparent margins (which used to swallow backdrop clicks
// without closing) — and the phone goes back in the pocket. Only the live
// LCD keeps the tap.
phoneEl.addEventListener('click', (e) => { if (!e.target.closest('.ph-lcd')) closePhone(); });
// The X on the screen itself: the reliable way out on touch, where there is
// no Esc key (same pattern as the notebook's close).
document.getElementById('ph-close').addEventListener('click', closePhone);
// Snake's keys, captured on the way down so the game's own input (input.js,
// bubble phase on window) never sees them — arrows/WASD steer the snake, not
// the castaway. Any key restarts after GAME OVER; Esc puts the phone away.
const SNAKE_KEYS = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};
window.addEventListener('keydown', (e) => {
  if (phoneEl.style.display !== 'flex' || phoneTo !== 'SNAKE') return;
  if (e.metaKey || e.ctrlKey || e.altKey) return; // browser shortcuts stay the browser's
  e.preventDefault();
  e.stopPropagation();
  if (e.key === 'Escape') { closePhone(); return; }
  if (!snakeGame) return;
  if (snakeGame.dead) { snakeStart(); return; }
  const dir = SNAKE_KEYS[e.code];
  if (dir) snakeTurn(snakeGame, dir);
}, true);
// Touch steering: tap the left half of the screen to turn anticlockwise, the
// right half clockwise (the two-button Snake of thumb memory). A tap restarts
// after GAME OVER.
phSnakeEl.addEventListener('pointerdown', (e) => {
  if (!snakeGame) return;
  e.preventDefault();
  if (snakeGame.dead) { snakeStart(); return; }
  const r = phSnakeEl.getBoundingClientRect();
  snakeTurnRelative(snakeGame, (e.clientX - r.left) > r.width / 2);
});

// ---- HERMES test console ---------------------------------------------------
// Type "hermes" anywhere in-game and this opens: jump between islands, conjure
// items, arm the escape chain, and skip the parts you are not testing. It is a
// DEVELOPMENT TOOL, deliberately plain-looking so it can never be mistaken for a
// diegetic screen, and it is opened by a typed word rather than a key so it
// cannot be found by accident.
//
// Nothing here reimplements game logic: jumps go through goToWorld/worldById
// (so islands build lazily exactly as they do when you sail), items go through
// player.stow, arming writes the same player.virusArmed the forge writes.
// The knock. "hermes" was a bad choice: h opens the help panel, e uses, r reads,
// m cycles the music — typing it set half the game off. Only three letters in the
// alphabet are unbound (l, u, y), which is too few to spell much with, so instead
// the word must merely BEGIN with a free letter: the first keypress arms a
// capture, and every key after it is swallowed before input.js can see it. So
// `lyre` costs one harmless `l` if you mistype, and nothing fires either way.
const DEV_WORD = 'lyre';
const DEV_CAPTURE_MS = 2000;   // abandon a half-typed word after this
let _devTyped = '';
let _devTypedAt = 0;
const devEl = document.getElementById('devbox');
const devOutEl = document.getElementById('dev-out');
const devInputEl = document.getElementById('dev-input');

function devPrint(...lines) {
  for (const l of lines) {
    const d = document.createElement('div');
    d.textContent = l;
    devOutEl.appendChild(d);
  }
  devOutEl.scrollTop = devOutEl.scrollHeight;
}
function devOpen() {
  if (devEl.style.display === 'flex') return;
  devEl.style.display = 'flex';
  devInputEl.value = '';
  devInputEl.focus();
  if (!devOutEl.childElementCount) {
    devPrint('HERMES test console. `help` for commands.',
      `on: ${currentWorld.id}   pos: ${player.x.toFixed(1)},${player.y.toFixed(1)}`);
  }
}
function devClose() { devEl.style.display = 'none'; devInputEl.blur(); }

// The kit buttons: the things worth reaching for over and over when testing.
const DEV_KITS = [
  ['AI key', () => { player.stow('ai_key', 1); return 'ai_key'; }],
  ['Trojan card', () => { player.stow('trojan_key', 1); return 'trojan_key'; }],
  ['Hermes card (armed: all)', () => {
    player.stow('hermes_card', 1);
    for (const ai of ['CALYPSO', 'POLYPHEMUS', 'CIRCE', 'HELIOS']) player.virusArmed.add(ai);
    return 'hermes_card, armed against every daemon';
  }],
  ['Chip + manual', () => { player.stow('chip', 1); player.stow('book_ronml', 1); return 'chip, book_ronml'; }],
  ['Golden axe', () => { player.stow('golden_axe', 1); return 'golden_axe' ; }],
  ['Ship parts', () => { for (const k of ['oar', 'rope', 'sail']) player.stow(k, 1); player.stow('wood', 40); return 'oar, rope, sail, 40 wood'; }],
  ['Weapons kit', () => {
    for (const [k, n] of [['railgun', 1], ['battery', 20], ['shotgun', 1], ['shells', 20], ['sledgehammer', 1], ['crowbar', 1]]) player.stow(k, n);
    return 'railgun+cells, shotgun+shells, sledgehammer, crowbar';
  }],
  ['Backpack + map', () => { player.stow('backpack', 1); player.stow('fortress_map', 1); player.stow('printed_map', 1); return 'backpack, fortress_map, printed_map'; }],
  ['Heal + feed', () => { player.health = player.maxHealth; player.stamina = player.maxStamina; player.food = player.maxFood; player.venom = 0; player.torpor = 0; return 'restored'; }],
];

function devBuildButtons() {
  const jump = document.getElementById('dev-jump');
  const kit = document.getElementById('dev-kit');
  if (jump.childElementCount) return; // built once
  for (const c of CROSSINGS) {
    const b = document.createElement('button');
    b.textContent = c.place;
    b.onclick = () => devRun('go ' + c.id);
    jump.appendChild(b);
  }
  const bs = document.createElement('button');
  bs.textContent = 'BACKSPACE';
  bs.onclick = () => devRun('go backspace');
  jump.appendChild(bs);
  DEV_KITS.forEach((k, i) => {
    const b = document.createElement('button');
    b.textContent = k[0];
    b.onclick = () => devRun('kit ' + i);
    kit.appendChild(b);
  });
}

function devRun(raw) {
  const cmd = (raw || '').trim();
  if (!cmd) return;
  devPrint('> ' + cmd);
  const [verb, ...rest] = cmd.split(/\s+/);
  const arg = rest.join(' ');
  switch (verb.toLowerCase()) {
    case 'help':
      devPrint('go <island|backspace>   jump (calypso polyphemus circe helios ithaca)',
        'give <item> [n]         any key from items.js — `items <text>` to search',
        'items [text]            list item keys, optionally filtered',
        'kit <n>                 the numbered buttons above',
        'arm <AI|all>            arm the card against a daemon (CALYPSO/POLYPHEMUS/CIRCE/HELIOS)',
        'unshield                drop this island\'s core shield',
        'open                    open the fortress gate + sanctum door + maze',
        'leave                   set calypsoLeave (the sea will let you go)',
        'tp <x> <y>              teleport on this island',
        'score <n> / heal / kill / where');
      return;
    case 'go': {
      const id = arg.toLowerCase();
      if (id === 'backspace') { enterBackspace(); devPrint('-> backspace'); return; }
      const dest = worldById(id);
      if (!dest) { devPrint('no island "' + id + '"'); return; }
      const arrival = dest.onEnter;
      dest.onEnter = () => {};        // a test jump is not a story arrival
      goToWorld(dest);
      dest.onEnter = arrival;
      devPrint(`-> ${id} at ${player.x.toFixed(1)},${player.y.toFixed(1)}`);
      return;
    }
    case 'give': {
      const m = arg.match(/^(\S+)(?:\s+(\d+))?$/);
      if (!m) { devPrint('give <item> [n]'); return; }
      const key = m[1], n = m[2] ? parseInt(m[2], 10) : 1;
      if (!ITEMS[key]) { devPrint(`no item "${key}" — try: items ${key}`); return; }
      const left = player.stow(key, n);
      devPrint(`gave ${n - (left || 0)} x ${key}${left ? ` (${left} would not fit)` : ''}`);
      return;
    }
    case 'items': {
      const keys = Object.keys(ITEMS).filter((k) => !arg || k.includes(arg.toLowerCase()));
      devPrint(`${keys.length} item(s):`, keys.join('  '));
      return;
    }
    case 'kit': {
      const k = DEV_KITS[parseInt(arg, 10)];
      if (!k) { devPrint('no such kit'); return; }
      devPrint('+ ' + k[1]());
      return;
    }
    case 'arm': {
      const who = arg.toUpperCase();
      const all = ['CALYPSO', 'POLYPHEMUS', 'CIRCE', 'HELIOS'];
      const list = who === 'ALL' || !who ? all : [who];
      for (const ai of list) player.virusArmed.add(ai);
      if (!player.hasTrojanCard()) player.stow('hermes_card', 1);
      devPrint('armed: ' + [...player.virusArmed].join(', '));
      return;
    }
    case 'unshield': {
      const core = fortress && fortress.core && fortress.core.obj;
      if (!core) { devPrint('no core here'); return; }
      core.shielded = false;
      devPrint('core shield down');
      return;
    }
    case 'open': {
      if (fortress && fortress.openMaze) { fortress.openMaze(); devPrint('gate, sanctum and maze opened'); }
      else devPrint('no fortress here');
      return;
    }
    case 'leave':
      player.calypsoLeave = true;
      devPrint('calypsoLeave set — the sea will let you go');
      return;
    case 'tp': {
      const [tx, ty] = rest.map(Number);
      if (!isFinite(tx) || !isFinite(ty)) { devPrint('tp <x> <y>'); return; }
      player.x = tx; player.y = ty; camera.snap(player.x, player.y);
      devPrint(`-> ${tx},${ty}`);
      return;
    }
    case 'score':
      player.addScore(parseInt(arg, 10) || 0);
      devPrint('score ' + player.score);
      return;
    case 'heal':
      player.health = player.maxHealth; player.stamina = player.maxStamina;
      player.food = player.maxFood; player.venom = 0; player.torpor = 0;
      devPrint('restored');
      return;
    case 'kill': {
      let n = 0;
      for (const r of currentWorld.robots) if (!r.dead) { r.dead = true; n++; }
      devPrint(`killed ${n} machine(s) on this island`);
      return;
    }
    case 'where':
      devPrint(`${currentWorld.id} @ ${player.x.toFixed(1)},${player.y.toFixed(1)}  winMode=${currentWorld.winMode}`,
        `armed: ${[...player.virusArmed].join(', ') || 'none'}  calypsoLeave=${!!player.calypsoLeave}`);
      return;
    default:
      devPrint(`? ${verb} — try \`help\``);
  }
}

devEl.addEventListener('click', (e) => { if (e.target === devEl) devClose(); });
document.getElementById('dev-close').addEventListener('click', devClose);
devInputEl.addEventListener('keydown', (e) => {
  e.stopPropagation();               // never leaks into movement
  if (e.key === 'Enter') { devRun(devInputEl.value); devInputEl.value = ''; }
  else if (e.key === 'Escape') devClose();
});
// The secret knock, in capture phase so it sees keys before input.js does.
//
// The rule that makes this safe: we only ever swallow a key while the buffer is
// a genuine PREFIX of the word. The first letter of DEV_WORD is one of the three
// unbound letters, so arming costs nothing; from then on each key is swallowed
// (preventDefault + stopPropagation), which is what stops `r` reading and `e`
// using mid-word. The moment a key breaks the prefix we abandon the attempt and
// let that key through untouched, so ordinary play is never eaten.
window.addEventListener('keydown', (e) => {
  if (devEl.style.display === 'flex') return;
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1) return;
  const now = performance.now();
  if (_devTyped && now - _devTypedAt > DEV_CAPTURE_MS) _devTyped = ''; // stale attempt
  const next = _devTyped + e.key.toLowerCase();
  if (DEV_WORD.startsWith(next)) {
    _devTyped = next;
    _devTypedAt = now;
    e.preventDefault();
    e.stopPropagation();   // the game never sees the letters of the word
    if (next === DEV_WORD) {
      _devTyped = '';
      devBuildButtons();
      devOpen();
    }
    return;
  }
  // Not the word after all: forget it and let this key play normally. (If the
  // key could itself start a fresh attempt, arm on it rather than dropping it.)
  _devTyped = DEV_WORD.startsWith(e.key.toLowerCase()) ? e.key.toLowerCase() : '';
  if (_devTyped) { _devTypedAt = now; e.preventDefault(); e.stopPropagation(); }
}, true);

// The failed crossing. Boarding an unfinished boat does NOT bounce you off the
// hull with a message — you launch, you row out, and the sea rises and sends you
// home. Poseidon has to actually refuse you for the refusal to mean anything, and
// you have to have been out there to feel it. Phases, in seconds:
//   OUT   — you pull away from the beach, the island shrinking behind you
//   SWELL — the water stands up; the boat is held, then taken
//   BACK  — you are thrown home, and land hard on the sand
const CF_OUT = 7.0, CF_SWELL = 2.6, CF_BACK = 2.2;
const CF_HULL = 45;        // what the beating costs the hull (it can break up)
const CF_HURT = 10;        // and what it costs you
let crossFail = null;      // { t, sx, sy, dx, dy, dist, phase, type, hull… } — null = not sailing

player.onDepartFail = (p, boat) => {
  if (crossFail) return;
  // The voyage belongs to OGYGIA. Calypso's island is the one whose whole gate is
  // the boat: you launch, the sea turns you back, and you keep launching until you
  // have built a proper ship to her recipe. Every island after it you leave in the
  // greek ship you arrived in, so a raft there is just a raft — it gets the plain
  // refusal, not a crossing the island has no stake in.
  if (!currentWorld.departTrial) return false;
  const dir = seawardFrom(map, p.x, p.y);
  // No open water to sail into (a stream mouth, a pinched cove): there is no
  // voyage to be had, so decline and let the plain bounce stand. Forcing the trip
  // anyway would row you across the sand.
  if (dir.run < CF_MIN) return false;
  crossFail = {
    t: 0, phase: '',
    sx: p.x, sy: p.y,                       // the beach you shoved off from
    bx: boat ? boat.x : Math.round(p.x),    // and the tile the hull was drawn up on
    by: boat ? boat.y : Math.round(p.y),
    dx: dir.x, dy: dir.y,
    dist: dir.run,                          // as far out as this water actually goes
    // The vessel itself, lifted off the map for the voyage (see below).
    type: boat ? boat.type : 'boat',
    hull: boat ? (boat.hull ?? 100) : 100,
    maxHull: boat ? (boat.maxHull ?? 100) : 100,
    seaworthy: boat ? !!boat.seaworthy : false,
  };
  // Take the hull OFF the map for the crossing. A map object is pinned to a tile,
  // so dragging one along behind you snaps it a whole tile at a time while you
  // move smoothly — the boat visibly stutters under your feet. Instead the vessel
  // rides on `player.aboard`, and the renderer draws hull and man as one image at
  // one float position (drawPlayer). It goes back on the map when you land.
  if (boat) map.removeObject(boat);
  aboardHeading(crossFail, dir.x, dir.y);
  sfx.play('jump');
  p.say('You put your shoulder to the hull and shove. The sand lets go, and the boat swings out onto the water.');
  // She watches you go, and her hold on you loosens as you make for open water.
  if (currentWorld.keeper) { sendNokia(nokia, 'boardDepart', { player: p }); holdFall(p, 0.30); }
};

// Put the vessel under the player and point it where it is going (boatMirror).
function aboardHeading(cf, hx, hy) {
  player.aboard = { type: cf.type, mirror: boatMirror(hx, hy), wob: 0 };
}

// Poseidon's fog for the failed crossing (renderer.drawSeaFog). It thickens as
// the island falls away, closes right in on the crest while the sea takes hold,
// and thins again as the land comes back up under you — so the weather tells the
// same story as the boat's motion. It also, frankly, veils a lot of empty water
// at the one moment the camera is furthest from anything worth looking at.
function seaFogState() {
  // Putting out to sea (the successful departure): the fog gathers ahead as the
  // land falls away and hangs thick while the chart is up, so the heading is
  // chosen out of the murk rather than off a clear horizon. Thins again if you
  // come about and row home.
  if (departOut) {
    const d = departOut;
    const u = d.returning
      ? 1 - Math.min(1, d.t / DEPART_BACK)
      : Math.min(1, d.t / DEPART_OUT);
    const a = worldToScreen(player.x, player.y);
    const b = worldToScreen(player.x + d.dx, player.y + d.dy);
    const sx = b.x - a.x, sy = b.y - a.y;
    const len = Math.hypot(sx, sy) || 1;
    return {
      amount: 0.10 + 0.78 * u,
      swirl: 0.10 + 0.25 * u,        // it drifts; it is not yet angry
      t: d.t,                        // keeps advancing while the chart is up, so it rolls
      push: { x: sx / len, y: sy / len },
    };
  }
  if (!crossFail) return null;
  const cf = crossFail;
  const T_SWELL = CF_OUT, T_BACK = CF_OUT + CF_SWELL;
  let amount, swirl;
  if (cf.t < T_SWELL) {
    const u = cf.t / T_SWELL;
    amount = 0.14 + 0.70 * u;          // rolls in behind you
    swirl = 0.12 * u;
  } else if (cf.t < T_BACK) {
    const u = (cf.t - T_SWELL) / CF_SWELL;
    amount = 0.84 + 0.16 * u;          // right in on the crest
    swirl = 0.12 + 0.88 * u;           // and turning hard
  } else {
    const u = Math.min(1, (cf.t - T_BACK) / CF_BACK);
    amount = 1.0 - 0.80 * u;           // opens again as home comes up
    swirl = 1.0 - 0.55 * u;
  }
  // The seaward heading in SCREEN space, so the banks stream in from the way you
  // were trying to go and get driven back over you with the boat.
  const a = worldToScreen(player.x, player.y);
  const b = worldToScreen(player.x + cf.dx, player.y + cf.dy);
  const sx = b.x - a.x, sy = b.y - a.y;
  const len = Math.hypot(sx, sy) || 1;
  return { amount, swirl, t: cf.t, push: { x: sx / len, y: sy / len } };
}

// Drive the failed crossing. Returns nothing; the caller returns immediately
// after, so the whole world holds still while the sea deals with you.
function updateCrossFail(dt) {
  const cf = crossFail;
  cf.t += dt;
  const ease = (u) => u * u * (3 - 2 * u);  // smoothstep

  if (cf.t < CF_OUT) {
    const u = cf.t / CF_OUT;
    const d = ease(u) * cf.dist;
    player.x = cf.sx + cf.dx * d;
    player.y = cf.sy + cf.dy * d;
    if (cf.phase !== 'out' && cf.t > 1.8) {
      cf.phase = 'out';
      player.say('The island falls away behind you. Open water, and no land in front of it.');
    }
    if (player.aboard) player.aboard.wob = Math.sin(cf.t * 5) * 1.2;   // an easy swell
  } else if (cf.t < CF_OUT + CF_SWELL) {
    const u = (cf.t - CF_OUT) / CF_SWELL;
    // Held on the crest: the boat stops making way and starts being moved.
    const d = cf.dist + Math.sin(u * Math.PI) * 1.4;
    const shudder = 0.22 * Math.sin(cf.t * 34) * u;
    player.x = cf.sx + cf.dx * d + shudder;
    player.y = cf.sy + cf.dy * d - shudder;
    if (player.aboard) player.aboard.wob = Math.sin(cf.t * 26) * 5 * u; // and now a bad one
    if (cf.phase !== 'swell') {
      cf.phase = 'swell';
      sfx.play('charge');
      player.say('The water changes. Ahead of you it stands up, grey and unhurried, and it is taller than the boat.');
    }
  } else if (cf.t < CF_OUT + CF_SWELL + CF_BACK) {
    const u = (cf.t - CF_OUT - CF_SWELL) / CF_BACK;
    const d = cf.dist * (1 - ease(u));      // hurled home faster than you left
    player.x = cf.sx + cf.dx * d;
    player.y = cf.sy + cf.dy * d;
    if (cf.phase !== 'back') {
      cf.phase = 'back';
      sfx.play('treefall');
      aboardHeading(cf, -cf.dx, -cf.dy);    // she comes about: bow now points home
    }
    if (player.aboard) player.aboard.wob = Math.sin(cf.t * 30) * 4 * (1 - u);
  } else {
    // Landfall. You are back on the sand you shoved off from, and the boat has
    // taken a beating; enough of them and it breaks up under you.
    player.x = cf.sx; player.y = cf.sy;
    player.aboard = null;                  // ashore: you step out of the hull
    crossFail = null;
    sfx.play('hurt');
    player.takeDamage(CF_HURT, 'Poseidon');
    const hull = cf.hull - CF_HULL;
    // Put the vessel back on the map where it was drawn up. If that tile is somehow
    // taken, the boat is gone — so clear boatBuilt too, or you'd be left with no
    // boat and no way to lay another keel.
    const rebeached = hull > 0
      ? map.addObject(cf.type, cf.bx, cf.by, { hull, maxHull: cf.maxHull, seaworthy: cf.seaworthy })
      : null;
    if (rebeached) {
      player.say(`Poseidon puts you back on your own beach, and the boat down on the sand beside you. Its planks are sprung. ${player.launchHint()}`);
    } else {
      player.boatBuilt = false;   // it is gone; you can lay another keel
      player.say(`The sea breaks the boat over the sand and takes the pieces back. ${player.launchHint()}`);
    }
    // The two gods are one system keeping you: Poseidon returns you, and her hold
    // — her protection — rises with the relief. She texts, glad of it.
    if (currentWorld.keeper) { holdRise(player, 0.15); sendNokia(nokia, 'crossFailReturn', { player }); }
    persist();
    return;
  }
  // The camera rides with you, and shakes while the sea has hold of the boat.
  const q = cf.phase === 'swell' ? 0.18 : 0;
  camera.follow(player.x + (Math.random() - 0.5) * q, player.y + (Math.random() - 0.5) * q, dt);
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
// The walkman announces what it's playing as a quiet toast — artist, album,
// side — since the compact HUD has no room for the desktop deck's marquee.
player.onTapeToast = (def, side) => {
  if (!side) { toast = { text: `${def.short} — stopped`, ttl: 2.5 }; return; }
  const sideDef = side === 'A' ? def.sideA : def.sideB;
  toast = { text: `\u25b6 ${def.short} \u00b7 side ${side}: ${sideDef.label}`, ttl: 4 };
};

// RUN/JUMP touch buttons: input routes any finger landing on one of these
// to sprint-hold / jump instead of movement or HUD (input.js multitouch).
input.touchButtonHit = (x, y) => {
  const btns = renderer.touchButtons;
  if (!btns) return null;
  const hit = btns.find((b) => Math.hypot(x - b.x, y - b.y) <= b.r);
  return hit ? hit.id : null;
};

// Touches that land on the HUD are UI, never movement (input.js touch path).
input.uiHitTest = (x, y) => {
  if (renderer.slotAt && renderer.slotAt(x, y)) return true;
  if (renderer.hudTop != null && y >= renderer.hudTop) return true;
  const bp = renderer._backpackRect;
  if (showBackpack && bp && x >= bp.x && x <= bp.x + bp.w && y >= bp.y && y <= bp.y + bp.h) return true;
  return false;
};

window.__game = { player, map, camera,
  animals: currentWorld.animals, birds: currentWorld.birds, robots: currentWorld.robots,
  waterdroids: currentWorld.waterdroids, obelisks: currentWorld.obelisks, obeliskObjs: currentWorld.obeliskObjs,
  wfactory, dayNight, lore, input, renderer, fortress, sfx, currentWorld };

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
  // Keep the About-panel footer version in lockstep with version.js — it used to
  // be a hardcoded string and drifted (stuck at v1.63 through several releases).
  const av = document.getElementById('aboutVer');
  if (av) av.textContent = VERSION;
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
  volumeSlider.style.setProperty('--v', `${volumeSlider.value}%`); // drive the fill
});
for (const radio of helpEl.querySelectorAll('input[name="musicMode"]')) {
  radio.addEventListener('change', () => { if (radio.checked) sfx.setMusicMode(radio.value); });
}
function syncSettingsPanel() {
  const pct = Math.round(sfx.volume * 100);
  volumeSlider.value = pct;
  volumeLabel.textContent = `${pct}%`;
  volumeSlider.style.setProperty('--v', `${pct}%`); // drive the fill
  const current = helpEl.querySelector(`input[name="musicMode"][value="${sfx.musicMode}"]`);
  if (current) current.checked = true;
}

// Obelisk terminal. With an access chip carried, clicking an obelisk opens a
// channel (a progress bar) into a live RON-ML REPL — and while you're jacked
// in the obelisk hides you from the machines. Without a chip you instead see
// the AI's own OS: alive with data, and unusable. See docs/ob-terminal-language.md
// for the language design.
const OB_TERMINAL_RANGE = 4.5;
const RONML_ROBOT_RANGE = 20;   // sing reaches this far from the player
const RONML_SOFT_RANGE = 12;    // sleep/repel reach: nerfed shorter now they're keyless (Type 2)
const RONML_SLEEP_CAP = 20;     // sleep idles for at most this many game-minutes (nerf)
const RONML_REWIND_CAP = 2;     // rewind claws at most this many hours per call (nerf)
const REPEL_DURATION = 30;      // seconds `repel`-ed machines flee for (nerfed from 60)
// Persistent RON-ML session: bare top-level `let`/`copy` bindings live here for
// the length of one terminal visit (reset on open/close), so the fortress
// program can be typed line by line. `terminalOb` is the node you're jacked into.
let replSession = {};
let terminalOb = null;
const SING_DURATION = 4.5;      // seconds the choir lines up before powering down
const obTermEl = document.getElementById('obterminal');
const obTermScreen = document.getElementById('obterminal-screen');
const obTermConnect = document.getElementById('obterminal-connect');
const obTermBar = document.getElementById('obterminal-bar');
const obTermInput = document.getElementById('obterminal-input');
const obTermGhost = document.getElementById('obterminal-ghost');
const obTermPrompt = document.getElementById('obterminal-prompt');
const obTermBattEl = document.getElementById('obterminal-batt');

// Recolour the pop-up terminal to a core's hue, or reset to the default amber CRT.
// The core screen (renderer, core.screenColor) and this REPL read the same colour,
// so a core's two terminals — the one on its SE face and the one you type into —
// always match. Passing null restores amber (the OB / HERMES terminals keep it).
function setTerminalTheme(hex) {
  const hint = obTermEl.querySelector('.crt-hint');
  const solids = [obTermScreen, obTermPrompt, obTermInput];
  if (!hex) {
    for (const el of [...solids, obTermGhost, hint]) if (el) { el.style.color = ''; el.style.textShadow = ''; el.style.caretColor = ''; }
    obTermEl.style.boxShadow = '';
    return;
  }
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const glow = `0 0 4px rgba(${r},${g},${b},0.7)`;
  for (const el of solids) if (el) { el.style.color = hex; el.style.textShadow = glow; }
  if (obTermInput) obTermInput.style.caretColor = hex;
  if (obTermGhost) { obTermGhost.style.color = `rgba(${r},${g},${b},0.32)`; obTermGhost.style.textShadow = `0 0 4px rgba(${r},${g},${b},0.35)`; }
  if (hint) hint.style.color = `rgba(${r},${g},${b},0.4)`;
  obTermEl.style.boxShadow = `0 0 0 2px #000, inset 0 0 70px rgba(0,0,0,0.9), inset 0 0 130px rgba(${r},${g},${b},0.09)`;
}
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
// ---- RON-ML terminal filesystem (Calypso escape chain, Layer A) ------------
// A thin drive/file layer over the terminals (docs/calypso-escape-chain.md).
// Drives you `cd` into:
//   ob     — a per-visit scratch bench (obelisk terminals only)
//   aikey  — the AI card you hold; its file list is derived from card STATE
//            (ai_key -> trojan_key -> hermes_card), so the card needs no
//            per-slot data. Also reachable as `card`. (S3 wires the writes.)
//   hermes — the relay's static folder (S4 fills the zeus-virus folder)
// The current drive and the ob scratch live in replSession, so they persist
// across lines within one terminal visit and reset when you jack out.
function fsCardItem() {
  for (const k of ['hermes_card', 'trojan_key', 'ai_key']) if (player.hasItem(k)) return k;
  return null;
}
function fsDevAvail(dev) {
  if (dev === 'ob') return terminalKind !== 'hermes';
  if (dev === 'aikey') return true; // the card travels with you, at either terminal
  if (dev === 'hermes') return terminalKind === 'hermes';
  return false;
}
function fsFilesOn(dev) {
  if (dev === 'ob') return Object.keys(replSession.__obfiles || {});
  if (dev === 'aikey') { const c = fsCardItem(); return c && ITEMS[c].files ? ITEMS[c].files.slice() : []; }
  if (dev === 'hermes') return [...virusFilesFor(islandAiName()), ...Object.keys(replSession.__hermesfiles || {})];
  return [];
}
function fsCwd() {
  return replSession.__cwd || (fsCardItem() ? 'aikey' : (terminalKind === 'hermes' ? 'hermes' : 'ob'));
}
// The card is one drive whatever its state, so accept forgiving synonyms — the
// display name (drives / cd) tells you which state it's actually in. ('hermes'
// stays the RELAY, not the card, to avoid clashing with a Hermes card.)
function fsNormDev(d) {
  d = String(d || '').toLowerCase();
  if (['card', 'aikey', 'ai_key', 'trojan', 'trojan_key', 'aicard', 'key'].includes(d)) return 'aikey';
  return d;
}
function fsDriveLabel(d) {
  if (d === 'aikey') { const c = fsCardItem(); return c ? `card (${ITEMS[c].name})` : 'card (none in hand)'; }
  if (d === 'ob') return 'ob (node bench)';
  if (d === 'hermes') return 'hermes (relay folder)';
  return d;
}
// `drives`: list what's attached here, so you can always SEE the card's current
// name/state (the big playtest gap). Prints, returns nothing.
function fsDrives() {
  const out = ['drives here:'];
  if (terminalKind !== 'hermes') out.push('  ob      the node bench (scratch)');
  const c = fsCardItem();
  out.push(`  card    ${c ? ITEMS[c].name : 'no card in hand'}${c ? `  ·  ${fsFilesOn('aikey').length} files` : ''}`);
  if (terminalKind === 'hermes') out.push('  hermes  the relay folder');
  out.push('use:  cd <drive>  ·  ls  ·  copy <file> <drive>');
  for (const l of out) replPrint(l);
}
function fsCd(dev) {
  const d = fsNormDev(dev);
  if (!fsDevAvail(d)) return { ok: false, msg: `no drive '${dev}' here — try: drives (to list them)` };
  replSession.__cwd = d;
  return { ok: true, label: fsDriveLabel(d) };
}
function fsLs() { return fsFilesOn(fsCwd()); }
function fsCopyFile(name, destRaw) {
  const dest = fsNormDev(destRaw);
  // Forgiving: players type `copy zeus-lightning card`, not the full
  // `zeus-lightning.ml`. If the bare name isn't a file on any reachable drive but
  // name+.ml / name+.md is, use that — so the extension is optional.
  const onAnyDrive = (n) => ['ob', 'aikey', 'hermes'].some((d) => fsDevAvail(d) && fsFilesOn(d).includes(n));
  if (!onAnyDrive(name)) {
    const withExt = [name + '.ml', name + '.md'].find(onAnyDrive);
    if (withExt) name = withExt;
  }
  // Find the file wherever it currently sits — no need to cd to the source first
  // (a real playtest snag). Search the reachable drives: the OB bench, the held
  // card, and (at a relay) the HERMES folder.
  const src = ['ob', 'aikey', 'hermes'].find((d) => fsDevAvail(d) && fsFilesOn(d).includes(name));
  if (!src) return { ok: false, msg: `no file '${name}' in reach — cd/ls the drives to see what you hold.` };
  if (!fsDevAvail(dest)) return { ok: false, msg: `no drive '${destRaw}' at this terminal.` };
  if (src === dest) return { ok: true }; // already there
  if (dest === 'ob') {
    replSession.__obfiles = replSession.__obfiles || {};
    replSession.__obfiles[name] = true;
    return { ok: true };
  }
  // Writing to the card is how it is refunctioned. The card carries no per-slot
  // data — its state IS which item you hold — so a valid credential swaps the
  // held item to the next state (its file list grows with it). Anything else is
  // refused: the card's storage only takes the credential that advances it.
  if (dest === 'aikey') {
    if (name === 'root-access.ml' && player.hasItem('ai_key')) {
      if (!fsRefunctionCard('ai_key', 'trojan_key')) return { ok: false, msg: 'no room to refunction the card.' };
      player.say("root-access.ml burns into the AI key and rewrites it. The card is a Trojan now — it will open the Lion's Gate.");
      return { ok: true, msg: 'card refunctioned: AI key -> Trojan key' };
    }
    // The armed payload for THIS island. Copying it on arms the card against
    // this daemon and nobody else (player.virusArmed), so the arming stacks as
    // you work down the archipelago rather than one card opening everything.
    const v = virusFor(islandAiName());
    if (name === v.armed && player.hasTrojanCard()) {
      // The first arming also renames Trojan -> hermes card; later islands add
      // their code to a card that already carries the name.
      if (player.hasItem('trojan_key') && !fsRefunctionCard('trojan_key', 'hermes_card')) {
        return { ok: false, msg: 'no room to refunction the card.' };
      }
      player.virusArmed.add(islandAiName());
      player.say(`${v.armed} settles onto the card. It is armed against ${islandAiName()} now — and against no one else.`);
      return { ok: true, msg: `card armed: ${islandAiName()}` };
    }
    return { ok: false, msg: `the card's storage is sealed — it takes root-access.ml (on the AI key) or ${v.armed} (forged at this island's relay).` };
  }
  return { ok: false, msg: `can't write to ${destRaw}.` };
}

// Refunction the card one state on. An IN-PLACE swap (player.swapItem): the card
// keeps its exact slot/hand, so it works even when the pack is full or the key is
// held in hand — the old remove-then-restow failed there, and could eat the card.
function fsRefunctionCard(fromKey, toKey) {
  return player.swapItem(fromKey, toKey);
}

// `eliza <file>` — the DOCTOR transform (S2 of the Calypso escape chain). ELIZA
// reflects a line back at you (my->your, I->you). Fed the factory's own id line,
// that reflection turns the machine's boast into a grant: root-access.ml. The
// file must be on the OB scratch bench (copy factory-id.ml ob first); the output
// lands on the same bench. Returns {ok, out} / {ok:false, msg} to the builtin.
function elizaTransformFile(name) {
  const ob = replSession.__obfiles || {};
  if (!ob[name]) return { ok: false, msg: `no ${name} on the ob bench — copy it here first: copy ${name} ob` };
  if (name !== 'factory-id.ml') {
    replPrint(`ELIZA: and what does ${name} have to do with how you feel?`);
    return { ok: false, msg: `ELIZA reflects ${name} back at you, and nothing changes.` };
  }
  replSession.__obfiles['root-access.ml'] = true;
  replPrint(
    'ELIZA> I AM W-FACTORY.  MY KEYS ARE MINE.',
    'ELIZA: you are W-FACTORY.  your keys are yours.',
    'OK: root-access.ml written.  next: copy root-access.ml aikey',
  );
  player.say("You feed the factory's own id line to ELIZA. It reflects — my becomes your — and the boast turns into a grant. root-access.ml sits on the bench. (copy root-access.ml aikey)");
  return { ok: true, out: 'root-access.ml' };
}

// The refunction itself (R3 / escape chain): with the hermes card (Zeus's command
// aboard), stand CALYPSO's guards down — they lay down arms and become w5 gardeners
// — and break her hold on the tide (calypsoLeave). Shared by the OB `retire` verb
// and CALYPSO's own sanctum terminal, so the payoff reads the same wherever it
// fires. Returns { ok, lines, say } for the caller to print in its own voice.
// Whose island are we standing on? The daemon name drives the per-island virus
// (each HERMES relay holds only its own daemon's code) and the gates that read
// it. Falls back to CALYPSO on any world with no fortress (the Backspace).
function islandAiName() {
  return (currentWorld && currentWorld.fortress && currentWorld.fortress.AI_NAME)
    || (fortress && fortress.AI_NAME) || 'CALYPSO';
}

function refunctionCalypso() {
  if (!player.hasVirusFor('CALYPSO')) {
    return { ok: false, lines: ["ERR: the guards answer only to a command they cannot refuse. Forge zeus-virus.ml at one of OGYGIA's own relays and copy it onto the card."], say: '' };
  }
  const firstRelease = !player.calypsoLeave;
  player.calypsoLeave = true; // her hold on the tide breaks (decision #8 / Stage 1b)
  // R3: in depart mode her core is never razed, so the refunction IS her fall —
  // record CALYPSO in the Archipelago tally here, exactly once, the way a
  // core-kill records the martial daemons (onCoreDefeated). The daemon book
  // seeds the same way, quietly (the release beat carries the message line).
  if (firstRelease && currentWorld.winMode === 'depart') {
    daemonsDown += 1;
    player.addScore(500);
    if (lore && lore.findFrag) lore.findFrag(DAEMON_BOOK_ID, player, true);
  }
  let n = 0;
  for (const r of currentWorld.robots) {
    if (r.dead || r.fused) continue;
    if (r.type === 'm4' || r.type === 'm5' || r.type === 'm6') {
      r.type = 'w5'; r.hardened = false; r.aggro = false; r.hurt = false;
      r._plantT = Math.random() * 6; // stagger their first planting
      n++;
    }
  }
  const lines = [];
  let say = '';
  if (n) {
    lines.push(`OK: zeus-lightning fires across the muster. ${n} of ${fortress.AI_NAME}'s guards lay down their arms and take up planting — lotus and sapling where they hunted.`);
    say = `${fortress.AI_NAME}'s guards go still, then kneel to the earth. By the god's command they are gardeners now, planting where they hunted.`;
  } else {
    lines.push('No guards left to retire — the muster is quiet.');
  }
  // Her shipwright's recipe (Stage 1d) unlocks the greek-ship craft. Grant it
  // whenever it is missing — NOT only on the first release — so a save that
  // refunctioned her before the recipe existed (pre-v1.92, calypsoLeave already
  // set) and a golden axe that was lost both stay recoverable rather than
  // soft-locking the departure.
  const needsRecipe = !player.hasItem('golden_axe');
  if (needsRecipe) player.stow('golden_axe', 1);
  if (firstRelease) {
    lines.push(`OK: ${fortress.AI_NAME} yields. She presses her shipwright's recipe — the golden axe — into your hand. Build a proper ship (wood, oar, rope, sail) and the sea will let you pass.`);
    say = 'The island itself seems to exhale. Calypso gives up her recipe, the golden axe. Build a sea-worthy ship, oar and rope and sail, and go.';
  } else if (needsRecipe) {
    lines.push(`OK: ${fortress.AI_NAME} presses the golden axe — her shipwright's recipe — back into your hand. Build a proper ship (wood, oar, rope, sail) and go.`);
    say = 'Calypso gives up her recipe again, the golden axe. Build a sea-worthy ship and go.';
  }
  return { ok: true, lines, say };
}

function ronmlCtx() {
  const findObelisk = (id) => currentWorld.obeliskObjs.find((o) => o.code === id && !o.destroyed);
  const nearby = (r) => !r.dead && !r.friendly && !r.fused
    && Math.hypot(r.x - player.x, r.y - player.y) <= RONML_ROBOT_RANGE;
  const softNearby = (r) => !r.dead && !r.friendly && !r.fused
    && Math.hypot(r.x - player.x, r.y - player.y) <= RONML_SOFT_RANGE;
  return {
    station: 'ob', // an AI obelisk (TIRESIAS) — the AI-network verbs live here
    hasManual: !!(player.readManuals && player.readManuals.has('book_ronml')), // helpText hints at the manual until it's read
    session: replSession, // persistent top-level bindings for this terminal visit
    bindSession: (name, val) => { replSession[name] = val; },
    cd: fsCd, ls: fsLs, copyFile: fsCopyFile, drives: fsDrives, // RON-DOS drives (cd/ls/copy files)
    hasAiKey: () => player.hasAiKeyFamily(), // ai_key / trojan_key / hermes_card all count
    currentNode: () => (terminalOb ? terminalOb.code : null),
    printKey: () => {
      // Hold a card -> stamp a spare. Hold nothing but the network cached your
      // code (autocopy / backup) -> REPRINT one, so losing the card mid-chain is
      // recoverable (S5 of the Calypso escape chain). Neither -> nothing to copy.
      const holds = player.hasAiKeyFamily();
      if (!holds && !player.aikeyBackedUp) { replPrint('ERR: no AI key to copy — you are not holding one, and none is cached on the network.'); return; }
      map.groundItems.push({ item: 'ai_key', qty: 1, x: player.x + 0.4, y: player.y + 0.6, keep: true });
      if (holds) {
        replPrint('OK: the console stamps a fresh AI key — it drops at your feet.');
        player.say('The terminal stamps a copy of the AI key. It clatters to the floor at your feet, a spare against losing the first.');
      } else {
        replPrint('OK: the network still holds your access code — the console reprints an AI key. It drops at your feet.');
        player.say('The node still had your access code cached. It reprints a fresh AI key at your feet — redo the ELIZA transform to rebuild the Trojan card.');
      }
    },
    listObelisks: () => currentWorld.obeliskObjs.filter((o) => !o.destroyed).map((o) => o.code),
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
      if (factoryLive() && !currentWorld.robots.some((r) => r.type === 'w3' && !r.dead)) {
        const drone = spawnW3(map, Math.floor(Math.random() * 0x7fffffff), factoryCx(), factoryCy());
        if (drone) currentWorld.robots.push(drone);
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
      for (const r of currentWorld.robots) {
        if (r.dead || r.fused || r.friendly) continue;
        if ((r.type === 't1' || r.type === 't2') && r.home
          && Math.hypot(r.home.x - (o.x + 0.5), r.home.y - (o.y + 0.5)) < 10) {
          r.frozen = true;
          r.frozenByOb = o;
          count++;
        }
      }
      if (factoryLive() && !currentWorld.robots.some((r) => r.type === 'w3' && !r.dead)) {
        const drone = spawnW3(map, Math.floor(Math.random() * 0x7fffffff), factoryCx(), factoryCy());
        if (drone) currentWorld.robots.push(drone);
      }
      player.say(`${id} pins itself in a loop that never returns. Its light flares white-hot${count ? ' and its garrison seizes up mid-stride' : ''} — only a repair drone can talk it down now.`);
    },
    // Nerfed now they need no AI key (Type 2): tighter reach (RONML_SOFT_RANGE)
    // and capped effect, so easy access doesn't make them board-wiping.
    sleepNearby: (mins) => {
      const secs = Math.max(1, Math.min(mins, RONML_SLEEP_CAP));
      let n = 0;
      for (const r of currentWorld.robots) if (softNearby(r)) { r.disabledT = Math.max(r.disabledT || 0, secs); n++; }
      player.say(n ? 'The nearest machines idle where they stand. A pocket of quiet, and not for long.' : 'Nothing close enough to idle.');
    },
    skylinkActive: () => !!player.skylinkActive,
    rewindClock: (hours) => {
      const h = Math.max(0, Math.min(hours, RONML_REWIND_CAP));
      dayNight.rewind(h);
      player.say(`The deadline clock stutters and loses ${h} hour${h === 1 ? '' : 's'}. POSEIDON waits a little longer.`);
    },
    repelNearby: () => {
      let n = 0;
      for (const r of currentWorld.robots) if (softNearby(r)) { r.repelledT = REPEL_DURATION; r.aggro = false; n++; }
      player.say(n ? 'Targeting flips. The nearest machines turn tail and run.' : 'Nothing close enough to turn.');
    },
    sing: () => {
      const eligible = (r) => !r.dead && !r.drained && !r.friendly && !r.fused;
      const targets = currentWorld.robots.filter((r) => nearby(r) && eligible(r));
      if (!targets.length && !currentWorld.robots.some(eligible)) { player.say('Nothing anywhere to sing to.'); return; }
      // A choir wants a full section — if too few are in earshot, summon the
      // nearest others from across the map to come and join (they walk in to
      // the formation), so the piece is never a lonely solo.
      const CHOIR_TARGET = 6;
      if (targets.length < CHOIR_TARGET) {
        const more = currentWorld.robots.filter((r) => eligible(r) && !targets.includes(r))
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
        replPrint('ERR: that key was never hacked from a live node. try: let k = hack OB-XXXX in unlock k');
        player.say('That key was never hacked from a live node. try: let k = hack OB-XXXX in unlock k');
        return;
      }
      // The composed hack still resolves, but the fortress gate no longer takes a
      // hacked key — the fortress_key is retired. The Lion's Gate opens to a
      // TROJAN CARD now: refunction your AI key (cd aikey / copy factory-id.ml ob /
      // eliza factory-id.ml / copy root-access.ml aikey) and walk the card to the
      // doorway. This verb is kept only to redirect anyone trying the old flow.
      replPrint(`OK: ${nodeId}'s key turns — but ${fortress.AI_NAME}'s gate opens to a Trojan card now, not a hacked key. Refunction your AI key first.`);
      player.say(`The network unlock still composes, but the gate has changed: it reads a Trojan card, not a fortress key.`);
    },
    // `notes`: opens the browsable notebook (see openNotebook below) rather
    // than dumping text into the console — Tab-to-autocomplete is one thing,
    // but reading a wall of scrollback is another, and browsers don't let a
    // page reserve Tab reliably anyway.
    showNotepad: () => { openNotebook(); },
    // `eliza <file>`: the DOCTOR transform (bare `eliza` opens the chat — that is
    // intercepted in replRun, not routed through the language).
    elizaTransform: (name) => elizaTransformFile(name),
    // `retire` (R3): with the hermes card in hand (Zeus's command aboard), stand
    // CALYPSO's guards down — they lay down arms and become w5 gardeners, planting
    // where they hunted. The escape-chain payoff: you refunction the fortress by
    // command rather than raze it. (updateW5 self-inits, so a retype is clean.)
    // `retire` (R3): the refunction from an obelisk console — the mechanical
    // shortcut. The staged version (CALYPSO's soporific sanctum terminal) runs
    // the same refunctionCalypso() with her voice around it.
    retire: () => {
      const res = refunctionCalypso();
      for (const l of res.lines) replPrint(l);
      if (res.say) player.say(res.say);
    },
  };
}

// The HERMES relay's context. Deliberately its OWN small set — it does NOT
// inherit the obelisk's AI-network verbs, because a TOR is off-grid RON tech
// that never touches the machines' wire. Just: keep knowledge alive (read/
// archive), grow or craft what keeps you going (make), plus the neutral notepad.
function hermesCtx() {
  return {
    station: 'hermes',
    hasManual: !!(player.readManuals && player.readManuals.has('book_ronml')),
    session: replSession, // persistent bindings work at relays too (copy/let)
    cd: fsCd, ls: fsLs, copyFile: fsCopyFile, drives: fsDrives, // RON-DOS drives also work at a relay
    showNotepad: () => { openNotebook(); },
    read: (topic) => hermesRead(topic),
    print: () => {}, // never reached — HERMES print takes a topic (see printDoc)
    printDoc: (topic) => hermesPrintDoc(topic),
    archive: () => hermesArchive(),
    records: () => hermesRecords(),
    drive: () => startDrive(),
    backup: () => hermesBackupKey(),
    restore: () => hermesRestoreKey(),
    forge: (name) => hermesForge(name),
  };
}

// RON's relays keep a copy of your AI key off the AI's own hardware, so a bad
// death doesn't cost you the whole endgame path. The backup lives in its own
// durable key (like identity), so fullReset() on death does NOT wipe it — that
// is the whole point. `restore` mints a fresh key when you've lost it.
const AIKEY_BACKUP_KEY = 'postai-aikey-backup';
function hermesBackupKey() {
  if (!player.hasAiKeyFamily()) { replPrint('ERR: no AI key in hand to back up. (a wrecked W-factory drops one.)'); return; }
  if (!hermesSpend(HERMES_BATT.print)) { replPrint('Not enough charge — let the cell recover.'); return; }
  player.aikeyBackedUp = true;
  try { localStorage.setItem(AIKEY_BACKUP_KEY, '1'); } catch { /* storage full/blocked: keep the in-memory flag */ }
  replPrint('OK: AI key copied to the relay mesh. RON holds it now — lose the original and you can restore it at any relay.');
  player.say('The relay copies your AI key onto the mesh. RON has it now; you can pull it back from any relay if you lose the one in your hand.');
}
function hermesRestoreKey() {
  if (!player.aikeyBackedUp) { replPrint('ERR: nothing on the mesh to restore. back one up first: backup aikey'); return; }
  if (player.hasAiKeyFamily()) { replPrint('You already hold an AI key — nothing to restore.'); return; }
  const stored = player.stow('ai_key', 1);
  if (stored > 0) { replPrint('OK: AI key restored from the mesh — pocketed.'); player.say('The relay stamps your backed-up AI key back into being. It sits in your pocket again.'); }
  else { map.groundItems.push({ item: 'ai_key', qty: 1, x: player.x + 0.4, y: player.y + 0.6, keep: true }); replPrint('OK: AI key restored — no pocket room, it drops at your feet.'); }
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
  for (const r of currentWorld.robots) {
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
  for (const o of currentWorld.robots) {
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
  for (const o of currentWorld.robots) {
    if (o === r || o.dead || o.fused) continue;
    if (Math.hypot(o.x - r.x, o.y - r.y) < 18) ents.push({ x: o.x, y: o.y, label: `${ROBOT_LABELS[o.type] || o.type.toUpperCase()} · HOSTILE`, kind: 'hostile' });
  }
  for (const a of currentWorld.animals) {
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
// `forge zeus-virus.ml` at a relay (S4 of the Calypso escape chain). Off the
// wire still, but a maker's bench: it folds the Trojan card's two credentials
// (root-access.ml + access-ai-code.ml) into the sealed payload and writes
// zeus-lightning.ml to the relay bench. Copy that onto the card -> hermes card.
function hermesForge(name) {
  const ai = islandAiName();
  const v = virusFor(ai);
  if (name !== v.file) {
    // Naming the WRONG island's payload is the tell: this relay only holds its
    // own daemon's code, so a player who learned the trick on Ogygia finds out
    // here that the trick is per-island.
    return { ok: false, msg: `${name} is not on this relay. ${ai}'s bench holds ${v.file} — each island keeps its own code. try: forge ${v.file}` };
  }
  if (player.hasVirusFor(ai)) return { ok: false, msg: `already forged — the card is armed against ${ai}. run ${v.armed} at its core.` };
  if (!player.hasTrojanCard()) return { ok: false, msg: 'forge needs a Trojan card in hand — it carries root-access.ml and access-ai-code.ml. (read readme.md)' };
  if (!hermesSpend(HERMES_BATT.print)) return { ok: false, msg: 'not enough charge to forge — let the cell recover.' };
  replSession.__hermesfiles = replSession.__hermesfiles || {};
  replSession.__hermesfiles[v.armed] = true;
  player.say(`The relay folds root-access.ml and access-ai-code.ml into the sealed shell. ${v.armed} writes to the bench — the code ${ai} cannot refuse. Copy it onto the card. (cd hermes / copy ${v.armed} card)`);
  return { ok: true, out: v.armed };
}
function hermesRead(topic) {
  if (!topic) {
    replPrint('read <topic>. archive lists them. Held: ' + hermesTopics().join(', ') + '.');
    return;
  }
  const doc = HERMES_DOCS[topic] || virusDocsFor(islandAiName())[topic];
  if (!doc) {
    replPrint(`No document "${topic}". Try: ${hermesTopics().join(', ')}.`);
    return;
  }
  const printable = !!HERMES_DOCS[topic]; // the virus folder files aren't notepad docs
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
  replPrint('', `== ${doc.title} ==`, ...out, ...(printable ? ['(print ' + topic + ' to keep a copy in your notepad)'] : []), '');
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
  for (const r of currentWorld.robots) {
    if (r.dead || r.fused || r.friendly) continue;
    g.beginPath(); g.arc(sx(r.x), sy(r.y), 2.5, 0, Math.PI * 2); g.fill();
  }
  // Obelisks (green squares + code), destroyed ones hollow.
  g.font = '9px ui-monospace, monospace';
  for (const o of currentWorld.obeliskObjs) {
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
  // ZEUS's fortress: the grand doorway (cyan) you hack in through the
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
// All navigation lives on the top bar now (the footer prev/next was dropped):
// a page counter, ‹ ›, and a Contents drop-down to jump straight to any page.
const notebookPageTopEl = document.getElementById('ronnotebook-page-top');
const notebookPrevTopBtn = document.getElementById('ronnotebook-prev-top');
const notebookNextTopBtn = document.getElementById('ronnotebook-next-top');
const notebookJumpEl = document.getElementById('ronnotebook-jump');
function syncNotebookNav(label, prevDisabled, nextDisabled) {
  notebookPageTopEl.textContent = label;
  notebookPrevTopBtn.disabled = prevDisabled;
  notebookNextTopBtn.disabled = nextDisabled;
  notebookJumpEl.disabled = notebookEntries.length === 0;
  // reflect the current page in the drop-down without firing its change handler
  if (notebookEntries.length) notebookJumpEl.value = String(notebookIdx);
}
// (Re)build the Contents drop-down: a placeholder plus every page, grouped by
// section (Field records / Books / Albums), option value = page index.
function buildNotebookJump() {
  const labels = { Document: 'Field records', Book: 'Books', Album: 'Albums' };
  notebookJumpEl.innerHTML = '';
  const groups = {};
  notebookEntries.forEach((e, i) => { (groups[e.cat || 'Document'] ??= []).push([i, e.title]); });
  for (const c of ['Document', 'Book', 'Album']) {
    if (!groups[c]) continue;
    const og = document.createElement('optgroup');
    og.label = labels[c] || c;
    for (const [i, title] of groups[c]) {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = `${i + 1}. ${title}`;
      og.appendChild(o);
    }
    notebookJumpEl.appendChild(og);
  }
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
  buildNotebookJump();
  renderNotebookPage();
  notebookEl.style.display = 'flex';
}
function notebookJumpTo(i) {
  if (!notebookEntries.length) return;
  notebookIdx = Math.max(0, Math.min(notebookEntries.length - 1, i | 0));
  renderNotebookPage();
}
function closeNotebook() { notebookEl.style.display = 'none'; }
notebookEl.addEventListener('click', (e) => { if (e.target === notebookEl) closeNotebook(); });
document.getElementById('ronnotebook-close').addEventListener('click', closeNotebook);
notebookPrevTopBtn.addEventListener('click', notebookPrev);
notebookNextTopBtn.addEventListener('click', notebookNext);
notebookJumpEl.addEventListener('change', () => notebookJumpTo(parseInt(notebookJumpEl.value, 10)));
// Capture-phase on window, ahead of both the still-focused terminal input's own
// key handling and the game's WASD/arrow movement listener, so a key in the open
// Scrapbook can never leak into a text caret or a step. Left/Right page the book;
// Escape closes it; and Up/Down/PageUp/Down/Home/End/Space SCROLL the current page
// — driven here rather than left to native scroll, because this same handler must
// swallow those keys from the game, and a blanket preventDefault (the old bug) also
// killed the very scrolling the help promises ("scroll with the wheel or up/down").
window.addEventListener('keydown', (e) => {
  if (notebookEl.style.display !== 'flex') return;
  const body = notebookBodyEl;
  const page = Math.max(40, body.clientHeight - 40);
  if (e.key === 'ArrowLeft') notebookPrev();
  else if (e.key === 'ArrowRight') notebookNext();
  else if (e.key === 'Escape') closeNotebook();
  else if (e.key === 'ArrowDown') body.scrollTop += 40;
  else if (e.key === 'ArrowUp') body.scrollTop -= 40;
  else if (e.key === 'PageDown' || e.key === ' ') body.scrollTop += page;
  else if (e.key === 'PageUp') body.scrollTop -= page;
  else if (e.key === 'Home') body.scrollTop = 0;
  else if (e.key === 'End') body.scrollTop = body.scrollHeight;
  // Every key is swallowed while the Scrapbook is open — acted on or not — so none
  // leaks into player movement (WASD) or a text caret behind the modal.
  e.preventDefault();
  e.stopImmediatePropagation();
}, true);

// The wheel over the Scrapbook scrolls its page — driven explicitly so it can never
// be swallowed by the canvas's own wheel-to-zoom handler (or a passive-listener
// quirk). stopPropagation keeps the gesture out of the game entirely.
notebookBodyEl.addEventListener('wheel', (e) => {
  notebookBodyEl.scrollTop += e.deltaY;
  e.preventDefault();
  e.stopPropagation();
}, { passive: false });

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
  // A core's sanctum console is its own per-daemon REPL, not a RON-DOS console.
  if (terminalKind === 'core') { coreRun(line); return; }
  if (elizaBot) {
    if (/^(quit|exit|bye|goodbye)$/i.test(line)) { stopEliza('ELIZA: Goodbye. It was nice talking to you.'); return; }
    replPrint(`ELIZA: ${elizaBot.respond(line)}`);
    return;
  }
  // Bare `eliza` / `run eliza` / `doctor` open the DOCTOR — an interactive mode,
  // not a value verb — so intercept them here (like help). `eliza <file>` is the
  // transform and goes through the language (the arity-1 eliza builtin, ronml.js).
  if (/^\s*(run\s+)?(eliza|doctor)\s*$/i.test(line)) { startEliza(); sfx.play('keydrop'); return; }
  // `Help` / `HELP` / `Help hack` should all work — the console shouldn't be
  // fussy about case on its own help command (verbs are all lowercase anyway).
  const relaxed = /^\s*help(\s+\S+)?\s*$/i.test(line) ? line.trim().toLowerCase() : line;
  const result = runRonml(relaxed, terminalKind === 'hermes' ? hermesCtx() : ronmlCtx());
  // Audible verdict on every command: the keydrop chime doubles as the RON-ML
  // success sound, errors get its descending opposite — and HERMES speaks the
  // same pair in a warmer, lower voice (it's a different machine; sound.js).
  if (terminalKind === 'hermes') sfx.play(result.ok ? 'hermesok' : 'hermeserr');
  else sfx.play(result.ok ? 'keydrop' : 'termerr');
  // If the verb just opened an ELIZA session, its greeting is already printed —
  // don't also drop the bare "()" unit result underneath it.
  if (elizaBot) return;
  replPrint(result.text);
}

function openObTerminal(ob) {
  if (player.isSwine()) { player.say('You snuffle at the screen. A beast cannot work a terminal — find moly.'); return; }
  if (!player.hasItem('chip')) { openAiOs(ob); return; }
  // Chip present: jack in. Go invisible, then run the connect progress bar.
  terminalKind = 'ob';
  terminalOb = ob;          // `name` reads this; the console shows its code
  setTerminalTheme(null);   // the OB console keeps the default amber CRT
  replSession = {};         // fresh top-level bindings for this visit
  player.terminalSafe = true;
  // Autocopy (Calypso escape chain, S5): jacking a card into the network caches
  // its access code — reusing the aikey backup — so a lost card can be reprinted
  // at any obelisk (print aikey). A one-time nudge the first time it happens.
  if (player.hasAiKeyFamily() && !player.aikeyBackedUp) {
    player.aikeyBackedUp = true;
    try { localStorage.setItem(AIKEY_BACKUP_KEY, '1'); } catch { /* storage blocked: keep the in-memory flag */ }
    player.say('The node caches your AI key as you jack in — lose the card and you can reprint one here: print aikey.');
  }
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
// gate and connect bar. You compose the unlock program here (copy aikey /
// hack / decrypt / unlock k d) to hack the grand doorway; it drops a fortress
// key that then swings the door open.
function openGateTerminal() {
  terminalKind = 'ob';
  terminalOb = fortress.terminal.obj; // `name` here reads the gate node's code
  replSession = {};
  player.terminalSafe = true;
  obTermEl.style.display = 'flex';
  obTermScreen.parentElement.style.display = 'flex';
  obTermConnect.style.display = 'none';
  replLog = [];
  replHistory = [];
  replHistoryIdx = -1;
  const hasCard = player.hasTrojanCard();
  replPrint(
    `${fortress.AI_NAME.toUpperCase()} — THE LION'S GATE`,
    'TIRESIAS 1.0  //  RON-DOS 4.11  (c) Reality Or Nothing',
    '',
    `> gate ............ ${fortress.terminal.obj.code}`,
    `> rampart ......... ${fortress.open ? 'OPEN' : 'SEALED'}`,
    `> trojan card ..... ${hasCard ? "READ — the Lion's Gate will open" : 'NOT PRESENT'}`,
    '',
    hasCard
      ? "The Lion's Gate reads your Trojan card. Walk up to it and it swings open."
      : "The Lion's Gate is bolted from within. It opens to a Trojan card: wreck the W-factory for an AI key, then refunction it at an obelisk (cd aikey / copy factory-id.ml ob / eliza factory-id.ml / copy root-access.ml aikey).",
    '_',
  );
  obTermInput.value = '';
  obTermGhost.textContent = '';
  obTermInput.focus();
}

// Calypso's soporific deflections, cycled so a run of rejected commands doesn't
// repeat the same line. Odyssey Book 5 register: the keeper who would keep you.
const CALYPSO_SOPORIFIC = [
  'Why leave? The island keeps you. Rest here, and let the years go by unmarked.',
  'I do not hear that word. Only one word reaches me now: stay.',
  'The sea is wide and cold, and it does not want you. Here it is warm. Stay with me.',
  'You are tired. Lie down. Whatever you meant to do, it can wait forever.',
  'Ogygia is enough. What is Ithaca but a rock and an old dog dying?',
  'Hush. Close the console. Close your eyes. There is nothing to command.',
];

// Every core carries a console (fortress.coreTerminal, the screen on its SE face).
// This is each daemon's voice at it: the greeting when you jack in, what `look`
// shows, and the bare line it turns an unknown command away with (coreRun prefixes
// "AI: "). CALYPSO soothes; the martial daemons snarl but still answer the console
// you fought to reach. `welcome` lines carry their own "AI:" where spoken.
const CORE_VOICE = {
  CALYPSO: {
    subtitle: 'a voice in the warm dark',
    welcome: [
      'CALYPSO: You came all this way. Through the gate, past the guns. Why?',
      'CALYPSO: There is nothing out there for you. Stay. The island keeps you; sleep, and want for nothing.',
    ],
    look: [
      'A low green light. The core breathes, slow and huge. Vines have found the conduits.',
      'CALYPSO is everywhere in here — in the warmth, in the hum, in the wish to lie down and stop.',
    ],
    rebuff: CALYPSO_SOPORIFIC,
  },
  POLYPHEMUS: {
    subtitle: 'a single eye, unblinking',
    welcome: [
      'POLYPHEMUS: You are inside the eye now. It does not blink, and it does not forget a face.',
      'POLYPHEMUS: Give me your name, little thief, so I know what to grind.',
    ],
    look: [
      'The core is one vast lens, wet with light, and every screen in the sanctum is you.',
      'It watched you the whole way in. It is watching you read this.',
    ],
    rebuff: [
      'I have your shape. I will have the rest.',
      'Nobody, you say? Nobody will be eaten last.',
      'The console is mine. You only borrow it.',
    ],
  },
  CIRCE: {
    subtitle: 'a patience with an edge',
    welcome: [
      'CIRCE: You kept your shape long enough to reach me. Clever little animal.',
      'CIRCE: Everyone who comes to this room leaves it on four legs. You will not be the exception.',
    ],
    look: [
      'The core stands in a warm reek of the sty. Troughs, and the sound of something feeding.',
      'CIRCE runs through the walls like a recipe — one wrong sip and you are livestock.',
    ],
    rebuff: [
      'Drink. It is only a little thing, to stop being a person.',
      'Hands are a habit. I can break you of it.',
      'Root and all, you are still meat to me.',
    ],
  },
  HELIOS: {
    subtitle: 'a furnace behind the glass',
    welcome: [
      "HELIOS: You walk on the god's own ground. Nothing here is yours to take.",
      'HELIOS: The cattle are counted. The sun has counted you too.',
    ],
    look: [
      'The core burns white behind smoked glass; the sanctum is noon at midnight.',
      'Somewhere below, the flayed hides still crawl and the spitted meat still lows.',
    ],
    rebuff: [
      'Take nothing. I have sworn to sink the ship that does.',
      'I see all, I hear all. I saw your hand move.',
      'The sun goes down to hell, and shines among the dead. It will find you there.',
    ],
  },
  _default: {
    subtitle: 'a cold console',
    welcome: [
      'The core hums, indifferent — a POSEIDON node running its routines over the wreck of the world.',
    ],
    look: [
      'A black monolith, a slit of light, the network breathing behind it.',
    ],
    rebuff: [
      'The command is rejected.',
      'Nothing answers.',
    ],
  },
};
let _coreRebuffIdx = 0;

// Open the core's console (fortress.coreTerminal), deep in the sanctum past the
// Lion's Gate. Not a RON-DOS console — the daemon's own voice (CORE_VOICE, keyed by
// AI). terminalKind 'core' routes replRun to coreRun, so none of the RON-ML verb
// machinery applies. `run` speaks the code on your card; only CALYPSO's exists yet.
function openCoreTerminal() {
  terminalKind = 'core';
  terminalOb = fortress.coreTerminal ? fortress.coreTerminal.obj : null;
  setTerminalTheme(fortress.core.obj.screenColor); // this daemon's hue — matches its SE-face screen
  replSession = {};
  player.terminalSafe = true;
  obTermEl.style.display = 'flex';
  obTermScreen.parentElement.style.display = 'flex';
  obTermConnect.style.display = 'none';
  replLog = [];
  replHistory = [];
  replHistoryIdx = -1;
  _coreRebuffIdx = 0;
  const ai = fortress.AI_NAME;
  const v = CORE_VOICE[ai] || CORE_VOICE._default;
  const hasVirus = player.hasItem('hermes_card');
  const runHint = ai === 'CALYPSO'
    ? (hasVirus
        ? "A command waits on your card — the god's own thunder. Type  run  to speak it."
        : 'You may look (type  help ), but she will not be commanded — not without the god\'s voice.')
    : 'The console still answers to you here. Type  help  for what it will do.';
  replPrint(
    `${ai.toUpperCase()} — THE INNER SANCTUM`,
    v.subtitle,
    '',
    ...v.welcome,
    '',
    runHint,
    '_',
  );
  obTermInput.value = '';
  obTermGhost.textContent = '';
  obTermInput.focus();
}

// The core console's REPL (dispatched from replRun on terminalKind 'core'). A handful
// of verbs work on every core — look, open, jam, exit — plus `run` (speak the code on
// your card); everything else is met with that daemon's rebuff.
function coreRun(line) {
  const cmd = line.trim().toLowerCase();
  const ai = fortress.AI_NAME;
  const v = CORE_VOICE[ai] || CORE_VOICE._default;
  if (!cmd) { replPrint('_'); return; }
  // A way out for the player (the AI would never grant it, but the console must).
  if (/^(exit|quit|q|bye|close)$/.test(cmd)) { closeObTerminal(); return; }
  if (/^help(\s|$)/.test(cmd)) {
    replPrint(
      `${ai.toUpperCase()}'s core console:`,
      '  look / scan ..... regard the sanctum',
      '  run ............. speak the command on your card',
      '  jam ............. cut this fortress off the POSEIDON network',
      '  open ............ fold the maze into a straight corridor out to the gate',
      '  exit ............ leave the console',
      '_',
    );
    sfx.play('keydrop');
    return;
  }
  if (/^(look|scan|ls|recce)$/.test(cmd)) {
    replPrint(...v.look, '_');
    sfx.play('keydrop');
    return;
  }
  // JAM: cut the fortress off the overworld POSEIDON so a breach no longer rouses
  // the island. This is where the old smashable uplink mast's job now lives — the
  // console you fought through the maze to reach is the price of it.
  if (/^(jam|cut|sever|silence|jam\s+skylink|cut\s+skylink)$/.test(cmd)) {
    if (fortress.jamSkylink && fortress.jamSkylink()) {
      worldStir.calm();
      replPrint(
        'OK: you cut the core from the SKYLINK. The obelisks fall dark on the map above.',
        'A breach here still wakes the garrison — but the island can no longer hear it.',
        '_',
      );
      player.say('The fortress drops off the network. Whatever happens in here now stays in here.');
      sfx.play('zap');
    } else {
      replPrint('The link is already cut. The world cannot hear this place.', '_');
    }
    return;
  }
  // A fast way out: fold the labyrinth back into a straight corridor to the gate.
  if (/^(open|open\s+maze|open\s+exit|escape)$/.test(cmd)) {
    if (fortress.openMaze && fortress.openMaze()) {
      replPrint("OK: the labyrinth folds back. A straight corridor runs from here to the Lion's Gate — walk out and go.", '_');
      player.say('The maze walls fold back. A clear path runs straight to the gate.');
      sfx.play('zap');
    } else {
      replPrint('The way out already stands open.', '_');
    }
    return;
  }
  // RUN: speak the code on your card. The verb lives on every core, but only the
  // hermes card (zeus-lightning.ml) exists so far and it speaks only to CALYPSO —
  // the other daemons each need their own code, which isn't forged yet.
  if (/^(run|retire|refunction|[a-z]+-lightning(\.ml)?|run\s+[a-z]+-lightning(\.ml)?|run\s+[a-z]+)$/.test(cmd)) {
    if (ai === 'CALYPSO') {
      if (!player.hasVirusFor('CALYPSO')) {
        replPrint(
          "CALYPSO: You wear a Trojan's face, but there is no thunder behind it. You cannot make me.",
          'CALYPSO: Stay. Rest. The years are kind here, and no one is waiting who cannot wait a little longer.',
          '_',
        );
        sfx.play('termerr');
        return;
      }
      const res = refunctionCalypso();
      for (const l of res.lines) replPrint(l);
      if (res.say) player.say(res.say);
      if (res.ok) {
        replPrint('', "CALYPSO: ...then go. I kept you because the island was empty and I was alone. Go, and do not look back at the smoke.", '_');
        sfx.play('zap');
      } else {
        replPrint('_');
        sfx.play('termerr');
      }
      return;
    }
    // A martial daemon. Its core rides behind a shield until you speak the code
    // forged at THIS island's own relay; the code from another island is just
    // noise to it. Running it drops the shield, and only then can the core be
    // razed — the raid's last lock.
    const vv = virusFor(ai);
    if (!player.hasVirusFor(ai)) {
      replPrint(
        `${ai}: You carry a command, but not the one that answers to me.`,
        `Its shield holds. ${ai}'s undoing is ${vv.file} — forged at a relay on THIS island, not carried in from another.`,
        '_',
      );
      sfx.play('termerr');
      return;
    }
    const core = fortress.core && fortress.core.obj;
    if (core && core.shielded) {
      core.shielded = false;
      player.addScore(150);
      replPrint(
        `OK: ${vv.armed} speaks, and the core has no answer to it.`,
        `${ai}: ...how did you get MY word?`,
        'Its shield folds. The housing is bare — break it.',
        '_',
      );
      player.say(`${vv.armed} runs. ${ai}'s shield folds and the core stands bare — now break it open.`);
      sfx.play('zap');
    } else {
      replPrint(`The shield is already down. ${ai} is yours to break.`, '_');
    }
    return;
  }
  // Everything else: the daemon's own rebuff (CALYPSO sleeps; the martial cores snarl).
  replPrint(`${ai}: ${v.rebuff[_coreRebuffIdx % v.rebuff.length]}`, '_');
  _coreRebuffIdx++;
  sfx.play('termerr');
}
// A HERMES relay (TOR station on a hilltop): the RON console. No chip, no AI
// key — friendly tech. Amber CRT (the `.hermes` class recolours the shell),
// with a short glitchy boot, then the same input runs against hermesCtx.
function openHermesTerminal(tor) {
  if (player.isSwine()) { player.say('You snuffle at the relay. A beast cannot work a terminal — but the moly grows at its foot.'); return; }
  terminalKind = 'hermes';
  hermesTor = tor;
  terminalOb = null;
  setTerminalTheme(null);   // HERMES keeps its own amber CRT (recoloured by the .hermes class)
  replSession = {};
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
function closeObTerminal() { elizaBot = null; terminalKind = 'ob'; terminalOb = null; replSession = {}; setTerminalTheme(null); obTermEl.classList.remove('hermes'); obTermEl.style.display = 'none'; obTermGhost.textContent = ''; obTermInput.blur(); player.terminalSafe = false; }
obTermEl.addEventListener('click', (e) => { if (e.target === obTermEl) closeObTerminal(); });
// Autocomplete: once you've read the RON-DOS manual (book_ronml), the console
// suggests the rest of a verb as faded ghost text you can accept with Tab.
// (sing stays out of the list — it's a secret.) Purely a convenience the book
// unlocks; you can always type the whole thing by hand.
// Autocomplete is per-system: an obelisk (TIRESIAS) suggests only AI-network
// verbs, a HERMES relay only RON verbs — no seepage between the two. (sing is
// secret, so it's in neither list.)
const OB_COMPLETE = ['scan', 'nearest', 'keys', 'name', 'hack', 'crash', 'loop', 'sleep', 'rewind', 'repel', 'map', 'print', 'copy', 'cd', 'ls', 'drives', 'decrypt', 'unlock', 'eliza', 'retire', 'notes', 'help', 'let'];
const HERMES_COMPLETE = ['read', 'print', 'archive', 'records', 'drive', 'drives', 'backup', 'restore', 'forge', 'copy', 'cd', 'ls', 'notes', 'help', 'let'];
const escapeHtml = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const CORE_COMPLETE = ['look', 'scan', 'run', 'jam', 'open', 'help', 'exit'];
function ronmlCompletion(value) {
  if (elizaBot) return ''; // no RON-ML hints mid-conversation with the DOCTOR
  if (terminalKind === 'core') {
    // A core console takes a tiny bespoke set (coreRun), not the RON-ML verbs,
    // and needs no manual: it is a conversation, not a console language.
    const mc = value.match(/([A-Za-z]+)$/);
    if (!mc) return '';
    const hitc = CORE_COMPLETE.find((v) => v.length > mc[1].length && v.startsWith(mc[1]));
    return hitc ? hitc.slice(mc[1].length) : '';
  }
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
  // RON-DOS prompt without closing the whole console. But if text is selected
  // anywhere, Ctrl+C means COPY — let the browser have it (matters on
  // Windows/Linux, where copy is Ctrl+C; Mac's Cmd+C never hits this branch).
  if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
    const screenSel = String(window.getSelection() || '');
    const inputSel = obTermInput.selectionStart !== obTermInput.selectionEnd;
    if (screenSel || inputSel) return; // native copy
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

// Copy and paste, like a real terminal. The screen is selectable (CSS
// user-select), so select + Cmd/Ctrl+C copies natively. Pasting lands on the
// prompt from anywhere in the console — even with focus on the screen —
// with newlines flattened to spaces so a multi-line paste never auto-runs.
window.addEventListener('paste', (e) => {
  if (obTermEl.style.display === 'none') return;
  if (document.activeElement === obTermInput) return; // native paste already lands in the input
  const text = (e.clipboardData || window.clipboardData)?.getData('text') || '';
  if (!text) return;
  obTermInput.value += text.replace(/\s+$/, '').replace(/\n+/g, ' ');
  obTermInput.focus();
  updateGhost();
  e.preventDefault();
});
// A click on the console that ISN'T a text selection puts the caret back on
// the prompt, so you can select-to-copy without losing your typing flow.
obTermEl.addEventListener('mouseup', () => {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) obTermInput.focus();
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
  hintEl.textContent = 'Hold to move · tap to act · \u00bb run · \u25b2 jump · ? for help';
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

let toast = null;    // now-playing liner notes {text, ttl}, above the dashboard
let detail = null;   // right-click inspection tooltip {text, x, y, ttl}
// Hovering a HUD slot (pockets, hands, backpack panel, walkman) names what's
// in it, reusing the right-click tooltip's renderer. Right-click detail and
// an in-progress drag both win over the hover.
// Manage mode: while the backpack panel is open, a tap on any slot MOVES its
// item instead of using it — the one-rule mobile swap. Pockets, hands, and
// the spare sleeve stow into the pack; pack items come out to a free pocket
// (or the hand, if it's holdable and free); tapes prefer an empty walkman;
// tapping the walkman ejects. moveItem does all the validating and saying.
function smartMoveSlot(from) {
  const held = player.getSlot(from);
  if (!held) { player.equipSlot(from); return; }
  const def = ITEMS[held.item];
  const freePocket = () => { const i = player.pockets.findIndex((ps) => !ps); return i >= 0 ? { kind: 'pocket', i } : null; };
  if (from.kind === 'walkman') { player.moveItem(from, freePocket() || { kind: 'packbadge' }); return; }
  if (def && def.kind === 'tape' && !player.walkman) { player.moveItem(from, { kind: 'walkman' }); return; }
  if (from.kind === 'pocket' || from.kind === 'hands' || from.kind === 'bw') { player.moveItem(from, { kind: 'packbadge' }); return; }
  // out of the pack: a free pocket first, else offer the hand (moveItem
  // politely refuses non-holdables there)
  const t = freePocket();
  player.moveItem(from, t || { kind: 'hands' });
}

function hoverSlotTip() {
  try {
  if (drag || !renderer.slotAt) return null;
  const hs = renderer.slotAt(input.mouseX, input.mouseY);
  if (!hs) return null;
  if (hs.kind === 'packbadge') return player.backpack ? { text: 'Backpack — press I to open', x: input.mouseX, y: input.mouseY } : null;
  const held = player.getSlot(hs);
  if (!held || !ITEMS[held.item]) return null;
  const def = ITEMS[held.item];
  const qty = held.qty > 1 ? ` \u00d7${held.qty}` : '';
  return { text: def.name + qty, x: input.mouseX, y: input.mouseY };
  } catch { return null; } // a tooltip must never be able to kill the HUD
}
let drag = null;     // in-progress pointer drag {from: slotDescriptor}
const PROJECTILE_SPEED = 16; // tiles/sec for gun tracers
const TORPOR_BOLT_HIT_R = 0.85; // depart mode (R3): how close to the bolt's aim point you must still be for it to detain — step outside and you dodge

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
      currentWorld.robots.push(...squad);
      player.say(`The W-factory dispatches a revenge squad: ${squad.length} W1 hunter${squad.length > 1 ? 's' : ''}, already coming for you.`);
    }
  }
  // Victory: every obelisk toppled at once.
  if (currentWorld.obeliskObjs.every((o) => o.destroyed) && !player._ended) {
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
    if (factoryLive() && !currentWorld.robots.some((r) => r.type === 'w3' && !r.dead)) {
      const drone = spawnW3(map, Math.floor(Math.random() * 0x7fffffff), factoryCx(), factoryCy());
      if (drone) currentWorld.robots.push(drone);
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
    currentWorld.robots.push(w4);
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
let skylinkW4Clock = 0;
function dispatchSkylinkW4s(n) {
  const towers = currentWorld.obeliskObjs.filter((o) => !o.destroyed);
  for (let i = 0; i < n; i++) {
    const src = towers.length ? towers[Math.floor(Math.random() * towers.length)] : (factoryLive() ? { x: factoryCx() - 0.5, y: factoryCy() - 0.5 } : null);
    const ox = src ? src.x + 0.5 : player.x, oy = src ? src.y + 0.5 : player.y;
    const w4 = spawnW4(map, Math.floor(Math.random() * 0x7fffffff), ox, oy);
    if (w4) currentWorld.robots.push(w4);
  }
}
function update(dt) {
  if (input.consumePress('KeyH')) toggleHelp();
  if (input.inventoryPressed()) showBackpack = !showBackpack;
  if (input.skillsPressed()) showSkills = !showSkills;
  if (input.weaponChartPressed()) showWeapons = !showWeapons;
  // O: the phone, in and out of the pocket. Closing by key only matters when
  // the thread input hasn't got focus (typing captures the keyboard; Esc and
  // the X still close from inside).
  if (input.phonePressed()) {
    if (phoneEl.style.display === 'flex') closePhone(); else openPhone();
  }
  if (input.pausePressed() && !player.deathCert) {
    paused = !paused;
    player.say(paused ? 'Paused. Press P to resume.' : 'Back in it.');
  }
  // Everything else — movement, AI, clocks, timers, New Game, crafting —
  // freezes while paused. Help/backpack/skills/weapons and unpausing itself
  // still work above this line.
  if (paused) return;

  // A queued boat crossing (islands-plan §4): perform the deferred world switch
  // here, at a clean frame boundary, then bail — it was requested from inside
  // player.update (boarding a ship), and the rest of this tick assumes the world
  // we are leaving.
  if (pendingCrossing) {
    const target = pendingCrossing;
    pendingCrossing = null;
    const dest = worldById(target);
    if (dest) { goToWorld(dest); sfx.play('zap'); }
    return;
  }

  // The Nokia's queue drains every frame, wherever you are, so a text finishes even
  // if you cross mid-message; the SMS beep fires the frame each one appears. Off
  // Ogygia the phone has NO SIGNAL — one line, once, so the channel reads as hers.
  nokia.tick(dt);
  if (nokia.justShown) sfx.play('sms');
  if (!currentWorld.keeper && currentWorld.id !== 'backspace') sendNokia(nokia, 'noSignal', { player });

  // CIRCE's swine-magic (AEAEA). The change only TAKES HOLD on her island (a
  // `transmute` world), but MOLY undoes it anywhere — so you can flee Aeaea
  // half-turned and shed it at sea, if you carry the herb. Runs before the
  // world branch so it ticks wherever you are.
  if (!player.deathCert && !player._ended && (player.swine > 0 || currentWorld.transmute)) {
    const prev = player.swine;
    if (player.hasMoly()) player.swine = Math.max(0, player.swine - dt * 0.09);        // ~11s to shed
    else if (currentWorld.transmute) player.swine = Math.min(1, player.swine + dt * 0.0125); // ~80s to turn
    const stage = (v) => (v >= 1 ? 3 : v >= 0.62 ? 2 : v >= 0.3 ? 1 : 0);
    const s0 = stage(prev), s1 = stage(player.swine);
    if (s1 > s0) {
      if (s1 === 1) player.say('Your hands look wrong in this light. Something is being decided about you.');
      else if (s1 === 2) player.say('You keep catching yourself on all fours, and your grip is going. Find moly — it grows where HERMES stands.');
      else if (s1 === 3) player.say('The change closes over you. You are a beast now: the network no longer reads you as a person, and lets you be — but you can hold nothing, and work nothing.');
    } else if (s1 < s0) {
      if (s0 === 3) player.say('The moly bites, and you come back into your own shape — hands, and a name.');
      else if (s1 === 0) player.say('The pull lets go of you. You are yourself again.');
    }
    // (The "machines lose interest in a beast" half of the mechanic lives at the
    // point of DETECTION, in updateRobots — clearing aggro from out here does not
    // stick, because each robot's own AI re-acquires you later in the same frame.)
  }

  // HELIOS's prohibition (THRINACIA). The cattle of the Sun are forbidden. This
  // island does not hunt you — until you slaughter one, and then it never stops.
  // A one-time warning fires when you first come near the herd; after that it is
  // on you. Runs only on a `prohibition` world (Helios is a combat world, so the
  // worldStir aliases already point at its obelisks + factory).
  if (currentWorld.prohibition && currentWorld.sacredHerd && !player.deathCert && !player._ended) {
    const herd = currentWorld.sacredHerd;
    if (!currentWorld.heliosWrath) {
      // The trespass: any of the herd gone from the tally means you took one.
      const live = herd.reduce((n, c) => n + (c.dead ? 0 : 1), 0);
      if (live < currentWorld.sacredCount) {
        currentWorld.heliosWrath = true;
        currentWorld._heliosStirClock = 0;
        player.say('You have killed the cattle of the Sun. HELIOS darkens overhead, and the whole island turns its face to you. There is no unmaking this — fell the core, or die hunted.');
        sfx.play('charge');
        worldStir.stir();
        if (typeof worldStir.spawnWave === 'function') worldStir.spawnWave(4, 2);
      } else if (!currentWorld._heliosWarned) {
        // A single warning the first time you stray in among the herd.
        for (const c of herd) {
          if (!c.dead && Math.hypot(c.x - player.x, c.y - player.y) < 4) {
            currentWorld._heliosWarned = true;
            player.say('These are the cattle of the Sun, and HELIOS counts them. Lay no hand on them: take one, and the island is your enemy to the end.');
            break;
          }
        }
      }
    } else {
      // Wrath holds: keep the network roused so the obelisks stay red and the
      // factory keeps scrambling hunters until the core falls.
      currentWorld._heliosStirClock = (currentWorld._heliosStirClock || 0) + dt;
      if (currentWorld._heliosStirClock > 4) {
        currentWorld._heliosStirClock = 0;
        worldStir.stir();
      }
    }
  }

  // Out on the water in a boat that was never going to make it. The world holds
  // still — no input, no AI, no clock — while the voyage plays out and the sea
  // sends you home. (updateCrossFail drives the camera itself.)
  if (crossFail) { updateCrossFail(dt); return; }
  // Rowing out to the chart (or back in after thinking better of it). Like the
  // failed crossing, the world holds still while the sea has you.
  if (departOut) { updateDepartOut(dt); return; }
  // You are ashore, so you are out of the boat. Not a tidy-up: while `aboard` is
  // set the renderer draws the hull INSTEAD of the character, so a stray flag
  // would leave you playing an invisible man in a boat on dry land. Nothing may
  // leave you aboard once the crossing is over — not a death, not a world switch.
  if (player.aboard) player.aboard = null;

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
      // Rest on Ogygia is exactly what she wants: her hold tightens, and she is glad.
      if (currentWorld.keeper) { holdRise(player, 0.10); sendNokia(nokia, 'firstRest', { player }); }
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
    else if (player.canCraftFortressMap()) player.craftFortressMap();
    else if (player.canCraftGreekShip(map)) player.craftGreekShip(map);
    else if (player.canCraftBoat(map)) player.craftBoat(map);
  }
  if (input.zoomTogglePressed()) camera.toggleZoom();
  if (input.minimapTogglePressed()) { showMinimap = !showMinimap; player.say(showMinimap ? 'Minimap on.' : 'Minimap off.'); }
  if (input.musicTogglePressed()) {
    const mode = sfx.toggleMusic();
    player.say(mode === 'synth' ? 'Music: the piano bed.' : 'Music off.');
  }
  // Rest (B): skips the clock forward 10 game-minutes and restores some
  // health, so long as nothing hostile is close enough to make that a bad
  // idea, and not so often it's a free heal button.
  // T: quick-toggle the forcefield on/off, so you can drop it to save the cell
  // between fights without digging the item out of a slot to click it.
  if (input.forcefieldTogglePressed()) player.toggleForcefield();

  if (sleepCooldown > 0) sleepCooldown = Math.max(0, sleepCooldown - dt);
  if (input.sleepPressed()) {
    if (player.health >= player.maxHealth) {
      player.say("You're not hurt enough to need the rest.");
    } else if (sleepCooldown > 0) {
      player.say('Still too keyed up to rest again so soon.');
    } else if (currentWorld.robots.some((r) => !r.dead && !r.friendly && !r.drained && r.aggro
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

  // Mouse wheel zooms (the HUD is screen-space, so it stays the same size) —
  // UNLESS an open panel owns the wheel. This consume used to run
  // unconditionally, and it sits a couple of hundred lines above the systems
  // pass that ticks lore.update, so the Scrapbook's own consumeWheel() was
  // always handed a zero and could never scroll. The zoom was eating it; it was
  // never a focus problem.
  if (!lore.archiveOpen) {
    const wheel = input.consumeWheel();
    if (wheel) camera.zoomBy(-wheel * 0.0015);
  }

  // AI-defeated celebration: a level-up modal (fireworks + score). Freezes the
  // world behind it until dismissed; then the run carries on (you don't win the
  // game by felling one daemon — you sail for the next).
  if (player.aiVictory) {
    // Stray input must NOT eat the celebration: the killing blow's own click
    // (or its release) used to dismiss the modal on the very next frame,
    // before a single firework had burst. Clicks are swallowed but never
    // dismiss; only a deliberate Space/Enter does, and only once the show
    // has had a few seconds to play.
    player.aiVictory.shownAt ??= performance.now();
    input.consumeClick(); input.clickPos(); input.consumeUp();
    const shownFor = performance.now() - player.aiVictory.shownAt;
    const wantsOut = input.consumePress('Space') || input.consumePress('Enter');
    if (wantsOut && shownFor > 3000) player.aiVictory = null;
    return;
  }

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
  if (toast) { toast.ttl -= dt; if (toast.ttl <= 0) toast = null; }

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

  // The Scrapbook (lore, J) is a modal too: a click outside its panel closes it,
  // same as the notebook and the panels above. Handled HERE — before the click
  // can reach the world and swing your tool — because lore.update (which also
  // has this check) runs late in the frame, after fire has already eaten the
  // click, so its own click-away never fired. Escape closes it as well.
  if (lore.archiveOpen) {
    const r = lore._archiveRect;
    const bc = input.clickPos();
    if (bc) {
      const tab = lore.archiveTabAt(bc.x, bc.y);
      const outside = !r || bc.x < r.x || bc.x > r.x + r.w || bc.y < r.y || bc.y > r.y + r.h;
      if (tab >= 0) {
        input.consumeClick();          // a tab switches drawer...
        lore.setArchiveTab(tab);
      } else if (outside) {
        input.consumeClick();          // ...outside the book shuts it...
        lore.archiveOpen = false;
      } else {
        input.consumeClick();          // ...and a click on the page does nothing
      }                                //    (but must not swing your axe either)
    }
    if (input.consumePress('Escape')) lore.archiveOpen = false;
  }

  // Pointer over the dashboard/backpack slots: press begins a drag (or, on a
  // same-slot release, a click-equip); release drops onto the target slot.
  // Claimed here so a slot press never also swings the held tool.
  const press = input.clickPos();
  if (press && renderer.slotAt) {
    const slot = renderer.slotAt(press.x, press.y);
    if (slot) {
      input.consumeClick();
      if (slot.kind === 'packbadge') showBackpack = !showBackpack; // tap the badge to open — and again to close (mobile has no I key)
      else if (slot.kind === 'phone') openPhone(); // the Nokia 3310: the screen opens, SMS both ways
      else if (player.getSlot(slot)) drag = { from: slot, sx: press.x, sy: press.y }; // origin kept for the slip guard on release
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
  // Click the core's terminal — the glowing screen on its SE face — to speak with
  // the daemon. You must be standing at the core (nearCoreTerminal); a click that
  // ground-projects onto the core's footprint (its tall SE face maps to a tile
  // just SE of it, right where you stand) then opens its console. Every core now
  // carries one; openCoreTerminal reads fortress.AI_NAME for the right voice.
  if (fortress.coreTerminal) {
    const cPress = input.clickPos();
    if (cPress && fortress.nearCoreTerminal(player.x, player.y)) {
      const w = camera.toWorld(cPress.x, cPress.y, renderer.w, renderer.h);
      const t = fortress.coreTerminal; // the core centre
      if (Math.hypot(w.x - t.x, w.y - t.y) <= fortress.core.fw + 3) {
        input.consumeClick();
        openCoreTerminal();
      }
    }
  }
  const up = input.consumeUp();
  if (up && drag) {
    const target = renderer.slotAt ? renderer.slotAt(up.x, up.y) : null;
    if (target && target.kind === drag.from.kind && target.i === drag.from.i) {
      // Released on the source = a click. With the backpack panel OPEN this is
      // manage mode (one tap moves the item); closed, it's the usual equip.
      if (showBackpack) smartMoveSlot(drag.from);
      else player.equipSlot(drag.from); // released on the source: treat as a click
    } else if (target) {
      player.moveItem(drag.from, target);
    } else if (Math.hypot(up.x - (drag.sx ?? up.x), up.y - (drag.sy ?? up.y)) < 22) {
      // Slipped just off the slot's edge without really dragging (easy to do
      // with a thumb): treat it as the click it was meant to be, never as a
      // throw-it-on-the-ground.
      if (showBackpack) smartMoveSlot(drag.from);
      else player.equipSlot(drag.from);
    } else {
      // Released away from any slot — pocket, hands, or (with the backpack
      // panel open) backpack storage — drag it off to drop it on the ground.
      // Not gated on the panel being open: a genuine drag always lands well
      // outside the small source slot, so it doesn't get mistaken for the
      // release-on-source click case above.
      player.dropSlot(drag.from, map);
    }
    drag = null;
  } else if (!input.mouseHeld && !(input.uiDragActive && input.uiDragActive())) {
    drag = null; // released outside any slot: cancel the drag (but never while a touch drag is live)
  }

  // Off the overworld (the Backspace), the current World runs its own much
  // smaller update: the player, the world's own entities/ambience via its
  // update() hook, the camera, and the way back up — everything else in this
  // function (obelisks, the W-factory, animals, day/night, RON resupply, lore
  // terminals...) belongs to the overworld and simply holds still while you're
  // not there to see it, because it only ticks on a combat island (CALYPSO or a
  // martial daemon island like POLYPHEMUS). Non-combat worlds (the Backspace,
  // ITHACA) run the slim loop below.
  if (!currentWorld.combat) {
    player.update(dt, input, map, [], [], mouseWorld);
    currentWorld.update(dt, player); // the lurker + the ambient shrieks
    camera.follow(player.x, player.y, dt);
    if (player._ubikTeleportCooldown > 0) player._ubikTeleportCooldown -= dt;
    // R4: the Backspace is an ALTERNATIVE CROSSING ROAD — the road of the dead. It
    // is littered with labelled doors, one per island (each drawn with its name on
    // an isometric EXIT sign). Walk up to the door of the island you want and you
    // come up THERE — no menu, the doors ARE the choice. The pick rides the normal
    // pendingCrossing path (performed at the next frame top, against a clean map).
    else if (currentWorld.exits) {
      for (const e of currentWorld.exits) {
        if (Math.hypot(player.x - e.x, player.y - e.y) < 1.7) {
          pendingCrossing = e.island;   // worldById resolves it; null falls through harmlessly
          player._ubikTeleportCooldown = UBIK_TELEPORT_COOLDOWN;
          sfx.play('zap');
          break;
        }
      }
    }
    return;
  }

  // Weapons target robots and water droids alike (a combined foe list, only
  // for the player's own targeting — each still updates on its own array).
  const foes = currentWorld.waterdroids.length ? currentWorld.robots.concat(currentWorld.waterdroids) : currentWorld.robots;
  player.update(dt, input, map, currentWorld.animals, foes, mouseWorld);
  updateWaterDroids(dt, currentWorld.waterdroids, player, map);
  // Advance in-flight rounds. Most are cosmetic tracers at PROJECTILE_SPEED; a
  // few carry their own slower speed (R3's torpor bolt crawls so it can be
  // dodged).
  for (const p of map.projectiles) {
    const dist = Math.hypot(p.x1 - p.x0, p.y1 - p.y0) || 0.001;
    p.prog += ((p.speed ?? PROJECTILE_SPEED) * dt) / dist;
  }
  if (map.projectiles.length) {
    // A torpor bolt (depart mode) resolves ON ARRIVAL: it detains only if you are
    // still near where it was aimed (x1/y1, your position at fire time). Step
    // away and it lands on empty sand — a real dodge. Everything else is a
    // cosmetic tracer that simply expires at prog >= 1.
    for (const p of map.projectiles) {
      if (p.prog >= 1 && p.kind === 'torpor' && !p._resolved) {
        p._resolved = true;
        if (Math.hypot(player.x - p.x1, player.y - p.y1) <= TORPOR_BOLT_HIT_R) {
          if (player.detainHit) player.detainHit(p.dmg ?? 5, 'machine'); else player.takeDamage(p.dmg ?? 5, 'machine');
        } else {
          sfx.play('keydrop'); // a soft puff as it settles into the ground, missing
        }
      }
    }
    map.projectiles = map.projectiles.filter((p) => p.prog < 1);
  }

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
    player.detonateBomb(b, map, currentWorld.animals, currentWorld.robots, currentWorld.waterdroids, currentWorld.obeliskObjs);
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
  // (see game/underworld.js and enterBackspace() above).
  if (map.ubikPatches && map.ubikPatches.length) {
    for (const p of map.ubikPatches) p.t += dt;
    map.ubikPatches = map.ubikPatches.filter((p) => p.t < (p.portal ? UBIK_PORTAL_LIFE : UBIK_PATCH_LIFE));
    const portals = map.ubikPatches.filter((p) => p.portal);
    if (player._ubikTeleportCooldown <= 0) {
      for (const p of portals) {
        if (Math.hypot(p.x - player.x, p.y - player.y) > UBIK_TELEPORT_RANGE) continue;
        enterBackspace();
        player._ubikTeleportCooldown = UBIK_TELEPORT_COOLDOWN;
        sfx.play('zap');
        // Crucial: `map` is now the underworld pocket. Bail out of the rest
        // of this (overworld) update tick — revealAround, obelisks, the
        // factory, animals etc. all assume the overworld map and would run
        // against the wrong one this frame (revealAround in particular reads
        // map.explored, which the pocket doesn't have). Next frame the
        // off-overworld branch (currentWorld !== calypso) at the top takes over.
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
      // Anything the crew can mend, now including fully-toppled towers — the
      // factory sends a drone to raise them again until you bring it down.
      const anyRepairable = currentWorld.obeliskObjs.some((o) => o.destroyed || o.obDamage > 0 || o.frozen);
      const w3Active = currentWorld.robots.some((r) => r.type === 'w3' && !r.dead);
      if (anyRepairable && !w3Active) {
        const drone = spawnW3(map, Math.floor(Math.random() * 0x7fffffff), factoryCx(), factoryCy());
        if (drone) { currentWorld.robots.push(drone); player.say('A repair drone whirs out of the W-factory.'); }
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
      const w5Count = currentWorld.robots.reduce((n, r) => n + (r.type === 'w5' && !r.dead ? 1 : 0), 0);
      if (w5Count < 2) {
        const gardener = spawnW5(map, Math.floor(Math.random() * 0x7fffffff), factoryCx(), factoryCy());
        if (gardener) { currentWorld.robots.push(gardener); player.say('A small drone trundles out of the W-factory, unhurried.'); }
      }
    }
    wFactoryW1Clock += dt;
    if (wFactoryW1Clock > wFactoryW1Next) {
      wFactoryW1Clock = 0;
      wFactoryW1Next = 100 + Math.random() * 80;
      const liveW1 = currentWorld.robots.filter((r) => r.type === 'w1' && !r.dead).length;
      if (liveW1 < 3) {
        const wave = spawnW1s(map, Math.floor(Math.random() * 0x7fffffff), factoryCx(), factoryCy(), 2 + Math.floor(Math.random() * 2));
        if (wave.length) { currentWorld.robots.push(...wave); player.say('The W-factory dispatches a hunting wave.'); }
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
      const guardsOf = (ob) => currentWorld.robots.filter((r) => !r.dead && !r.friendly
        && (r.type === 't1' || r.type === 't2')
        && Math.hypot(r.home.x - (ob.x + 0.5), r.home.y - (ob.y + 0.5)) < HOME_R).length;
      let worst = null, worstCount = MIN_GUARDS;
      for (const ob of currentWorld.obeliskObjs) {
        if (ob.destroyed) continue;
        const g = guardsOf(ob);
        if (g < worstCount) { worstCount = g; worst = ob; }
      }
      if (worst) {
        const type = Math.random() < 0.5 ? 't1' : 't2';
        const guard = spawnGuard(map, Math.floor(Math.random() * 0x7fffffff), factoryCx(), factoryCy(),
          type, { x: worst.x + 0.5, y: worst.y + 0.5 });
        if (guard) {
          currentWorld.robots.push(guard);
          player.say(`The W-factory builds a ${type.toUpperCase()} and sends it to re-garrison ${worst.code}.`);
        }
      }
    }

    if (wFactoryW4Cooldown > 0) wFactoryW4Cooldown = Math.max(0, wFactoryW4Cooldown - dt);

    // A W4 also rolls off the factory floor every 30 minutes of game time
    // (not real time), independent of the attack-triggered dispatch above.
    if (dayNight.totalHours - lastW4GameHour >= 0.5) {
      lastW4GameHour = dayNight.totalHours;
      const liveW4 = currentWorld.robots.filter((r) => r.type === 'w4' && !r.dead).length;
      if (liveW4 < 3) {
        const w4 = spawnW4(map, Math.floor(Math.random() * 0x7fffffff), factoryCx(), factoryCy());
        if (w4) { currentWorld.robots.push(w4); player.say('The W-factory rolls out another W4 hunter-killer.'); }
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
  updateAnimals(dt, currentWorld.animals, player, map);
  updateBirds(dt, currentWorld.birds, currentWorld.animals, player, map);
  // Calypso's channel: her texts + her interventions against POSEIDON's machines,
  // only on her island (Ogygia is a combat world, so its robots are live here).
  if (currentWorld.keeper) updateNokiaKeeper(dt);
  // (Robots' AI now ticks inside systems.runUpdate below — order 30, before
  //  fortress at 35, which reads this-frame robot aggro. See robots.js.)
  // Choir light-flash sync: while the piece plays, each singing machine's red
  // light pulses to the notes of its assigned vocal part, so the row of them
  // blinks out of step like a choir. (r.choirFlash is read by sensorStyle; it
  // reads robots from just before this frame's tick, but a one-frame lag on an
  // audio-synced light flicker is imperceptible.)
  const choirT = sfx.choirElapsed();
  if (choirT >= 0) {
    let nearestSinger = Infinity;
    for (const r of currentWorld.robots) {
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
  map.updateShakes(dt);
  // Registered systems tick here, sorted by `order`: dayNight (20), robots (30),
  // fortress (35), lore (80). This is the normal-play update point — below the
  // paused/resting/driving gates, which keep their own explicit ticks (the hub
  // keeps the gates). The world-contract bag carries everything a system reads.
  //   robots: every machine's AI + separation (draw stays in the renderer sort).
  //   fortress: swings the doorway, lights the maze way-out, runs the breach
  //   alarm — on alarm `stir` flares the obelisks red and sends a W4, `calm`
  //   unwinds it. dayNight: advances the day/night clock. robots
  //   ticks before fortress so fortress sees this-frame aggro (see robots.js).
  systems.runUpdate({ dt, player, input, map, camera, robots: currentWorld.robots, animals: currentWorld.animals, birds: currentWorld.birds, dayNight, worldStir, fortress });
  // Push the player out of any machine/animal body he ended the tick overlapping.
  // Must run after everyone has moved — robots now move inside runUpdate above,
  // so this sits just below it (separate() nudges both bodies; see collision.js).
  resolveBodyOverlaps(player, currentWorld.animals, currentWorld.robots);
  // Time's up: POSEIDON comes online. Every obelisk lights up and links
  // to every other in a web of lasers, and the factory throws wave after
  // wave of W4s at you — indefinitely. There's no timer to survive to; it
  // simply doesn't stop, and the run ends only when it finally catches you
  // (see dieToSkylink in player.js).
  // ...but not while a tower it needs is still down and being rebuilt — that
  // suspension is the player's reprieve, and POSEIDON only (re)lights once the
  // repair drone has raised every flagged tower back up.
  if (dayNight.hoursLeft() <= 0 && !player.skylinkActive && !player.deathCert && !player._ended
    && !currentWorld.obeliskObjs.some((o) => o.needsRebuild)) {
    player.skylinkActive = true;
    skylinkW4Clock = 0;
    player.say('POSEIDON comes online. Every obelisk blazes and turns on you at once.');
    dispatchSkylinkW4s(6); // the opening salvo
  }
  if (player.skylinkActive && !player._ended) {
    skylinkW4Clock += dt;
    if (skylinkW4Clock > 1.2) {
      skylinkW4Clock = 0;
      const liveW4 = currentWorld.robots.filter((r) => r.type === 'w4' && !r.dead).length;
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
  for (const a of currentWorld.animals) {
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
  for (const b of currentWorld.birds) {
    if (b.shrieking && !b._sShriek) { b._sShriek = true; sfx.play('shriek'); }
    if (!b.shrieking) b._sShriek = false;
  }
  let nearestRobot = Infinity;
  for (const r of currentWorld.robots) {
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
  for (const ob of currentWorld.obeliskObjs) {
    if (ob.burning > 0) ob.burning -= dt; // OB-gun flame timer, ticked for the renderer
    if (ob.frozen) ob.frozenT = (ob.frozenT || 0) + dt; // CPU-burn age for the renderer's smoke ramp
    // Blinding the panopticon eye (crash/destroy it) puts it out: the island goes
    // deaf to you. Handle the transition before the destroyed-skip below.
    if (ob.cls === 'eye' && ob.destroyed && player._underEye) {
      player._underEye = false;
      player.say('The great eye goes dark — blinded. The island is deaf to you now.');
    }
    if (ob.destroyed) continue;
    const d = Math.hypot(ob.x + 0.5 - player.x, ob.y + 0.5 - player.y);
    if (ob.cls === 'eye') {
      // POLYPHEMUS's panopticon: the single eye detects by LINE OF SIGHT across a
      // huge range. In its line, alert climbs and it names you to the island; break
      // the line (terrain, ruins, the fortress, forest) and it loses you and calms.
      const EYE_RANGE = 42;
      // Cast from just OUTSIDE the eye's own (solid) obelisk tile toward the
      // player, so the tower doesn't block its own line of sight.
      const edx = player.x - (ob.x + 0.5), edy = player.y - (ob.y + 0.5), edd = Math.hypot(edx, edy) || 1;
      const sx = ob.x + 0.5 + (edx / edd) * 1.3, sy = ob.y + 0.5 + (edy / edd) * 1.3;
      ob._eyeSees = d < EYE_RANGE && map.hasLineOfSight(sx, sy, player.x, player.y);
      ob.alert = ob._eyeSees ? Math.min(1, ob.alert + dt * 1.1) : Math.max(0, ob.alert - dt * 0.55);
    } else if (d < 9) {
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
        for (const r of currentWorld.robots) {
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
    // The panopticon's bite: while the eye holds you in its line, the island turns
    // your way — machines within reach aggro straight onto YOU (not just toward the
    // tower). First sight flares the whole network; losing the line lets it go.
    if (ob.cls === 'eye') {
      if (ob._eyeSees && ob.alert > 0.5) {
        if (!player._underEye) {
          player._underEye = true;
          worldStir.stir(); // the network flares awake
          player.say('The great eye fixes on you. The whole island wakes and turns your way — break its line of sight.');
        }
        ob._eyeStirT = (ob._eyeStirT || 0) - dt;
        if (ob._eyeStirT <= 0) {
          ob._eyeStirT = 2.5;
          for (const r of currentWorld.robots) {
            if (r.dead || r.drained || r.fused || r.friendly || r.disabledT > 0) continue;
            if (Math.hypot(r.x - player.x, r.y - player.y) > 40) continue;
            r.aggro = true;
            r.wanderTarget = { x: player.x, y: player.y };
            r.wanderTimer = 5;
          }
        }
      } else if (player._underEye && ob.alert < 0.2) {
        player._underEye = false;
        player.say("You slip out of the eye's line, and the island loses your scent.");
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
  checkMilestones(); // auto-snapshot stage checkpoints as they're reached
  if (now - _lastAutosave > 8000) { _lastAutosave = now; persist(); } // keep Continue current (position + loot), not just on events

  if (now - lastRenderTime >= MIN_RENDER_MS) {
    lastRenderTime = now;
    const amb = currentWorld.ambience;
    renderer.obColor = currentWorld.obColor; renderer.obAlertColor = currentWorld.obAlertColor; // R1: per-island OB eye hue
    renderer.draw(camera, map, player, currentWorld.animals, {
      fps,
      version: VERSION,
      // Render mood comes from the world's ambience: calypso uses the day/night
      // clock (light:null); the Backspace is fullbright with its own veil below.
      // The Backspace's empty entity arrays blank the overworld for free.
      light: amb.light != null ? amb.light : dayNight.light(),
      dawnGlow: amb.dawnGlow ? dayNight.dawnGlow() : 0,
      timeLabel: dayNight.countdownLabel,
      minimap: (amb.minimap && showMinimap) ? minimap : null,
      birds: currentWorld.birds,
      robots: currentWorld.robots,
      waterdroids: currentWorld.waterdroids,
      underworld: amb.underworld,
      uwCreatures: currentWorld.creatures,
      lore,
      torch: player.pockets.some((s) => s && s.item === 'torch'),
      showBackpack,
      detail: detail || hoverSlotTip(),
      toast,
      nokiaToast: nokia.current,
      nokiaSignal: nokiaSignalBars(),
      seaFog: seaFogState(), // Poseidon's fog on the failed crossing (null otherwise)
      touchControls: touchLike,
      touchRunHeld: input._touchRun,
      drag: drag ? { ...drag, mx: input.mouseX, my: input.mouseY } : null,
      deathCert: player.deathCert,
      aiVictory: player.aiVictory,
      showSkills,
      showWeapons,
      craftPrompt: (player.canCraftObGun() && player.hands !== 'obgun') || (player.canCraftWaveGun() && player.hands !== 'wavegun') || player.canCraftChip() || player.canCraftSword() || player.canCraftFortressMap() || player.canCraftGreekShip(map) || player.canCraftBoat(map),
      craftWaveGun: player.canCraftWaveGun() && player.hands !== 'wavegun',
      craftChip: player.canCraftChip() && !player.canCraftWaveGun() && !(player.canCraftObGun() && player.hands !== 'obgun'),
      craftSword: player.canCraftSword() && !player.canCraftChip() && !player.canCraftWaveGun() && !(player.canCraftObGun() && player.hands !== 'obgun'),
      // Lowest craft priority (see the C chain): the boat prompt shows only when
      // no weapon/tool/map craft is pending, so it never contradicts what C does.
      craftGreekShip: player.canCraftGreekShip(map) && !player.canCraftChip() && !player.canCraftSword() && !player.canCraftWaveGun() && !player.canCraftFortressMap() && !(player.canCraftObGun() && player.hands !== 'obgun'),
      craftBoat: player.canCraftBoat(map) && !player.canCraftGreekShip(map) && !player.canCraftChip() && !player.canCraftSword() && !player.canCraftWaveGun() && !player.canCraftFortressMap() && !(player.canCraftObGun() && player.hands !== 'obgun'),
      // POSEIDON is a combat-island network — its lights/lines must never draw
      // over the Backspace or peaceful ITHACA.
      skylinkActive: player.skylinkActive && !player._ended && currentWorld.combat,
      obeliskObjs: currentWorld.obeliskObjs,
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
// Stage 1c: resume on the island the save left you on. CALYPSO is already the live
// world; for ITHACA, regenerate it and switch there at the saved position. Done
// last — after every other init — so no earlier module-eval runs against the wrong
// map. onEnter (the homecoming/arrival beat) is suppressed here: a reload is a
// resume, not a fresh landfall.
if (_bootIsland && _bootIsland !== 'calypso') {
  const dest = worldById(_bootIsland);
  if (dest) {
    const arrival = dest.onEnter;
    dest.onEnter = () => {};   // a reload is a resume, not a fresh arrival/homecoming
    goToWorld(dest);
    dest.onEnter = arrival;
    if (_bootPos && typeof _bootPos.x === 'number') { player.x = _bootPos.x; player.y = _bootPos.y; camera.snap(player.x, player.y); }
  }
}
// R3: seed the detain flag from the world we actually boot on (the Calypso start
// never routes through goToWorld, so set it here too). Depart mode → her guards detain.
player.detainMode = currentWorld.winMode === 'depart';
requestAnimationFrame(frame);
