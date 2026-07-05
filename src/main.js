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
import { spawnRobots, updateRobots } from './game/robots.js';
import { resolveBodyOverlaps } from './game/collision.js';
import { Lore } from './game/lore.js';
import { sfx } from './engine/sound.js';

const WORLD_SEED = 1337;
const VERSION = '0.44';

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
  ];
  const rollLoot = () => {
    const r = rng();
    if (r < 0.30) {
      const MELEE = ['crowbar', 'bat', 'machete', 'crowbar'];
      return [{ item: MELEE[Math.floor(rng() * MELEE.length)], qty: 1 }];
    }
    if (r < 0.65) {
      const AMMO = [
        [{ item: 'battery', qty: 2 }],
        [{ item: 'ammo', qty: 6 }],
        [{ item: 'shells', qty: 4 }],
      ];
      return AMMO[Math.floor(rng() * AMMO.length)];
    }
    return rng() < 0.5 ? [{ item: 'tin', qty: 1 }] : [{ item: 'torch', qty: 1 }];
  };
  for (let i = 0; i < 20 && inner.length; i++) {
    const [x, y] = inner.splice(Math.floor(rng() * inner.length), 1)[0];
    const loot = i < guaranteed.length ? guaranteed[i] : rollLoot();
    map.addObject('box', x, y, { loot, opened: false });
  }
}
const robots = spawnRobots(map, WORLD_SEED, obelisks, { x: spawn.x, y: spawn.y, r: 14 });
// The tower objects themselves (for alert/blink state): {x,y} plus the
// alert level cannot live on the plain {x,y} obelisks list, since that's
// shared with spawnRobots as a read-only anchor list.
const obeliskObjs = obelisks.map((o) => map.objectAt(o.x, o.y)).filter(Boolean);
for (const ob of obeliskObjs) { ob.alert = 0; ob.blinkFlash = 0; ob._blinkT = 2 + Math.random() * 5; ob._nudgeT = 0; }

// Character persona and learned skills persist across sessions and deaths.
const SAVE_KEY = 'postai-character';
try {
  const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
  if (saved) {
    player.setPersona(saved.name || 'Adam', saved.gender || 'm');
    for (const s of saved.skills || []) player.skills.add(s);
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
const persist = () => {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      name: player.name, gender: player.gender, skills: [...player.skills],
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
// Autosave the run periodically and when the tab is hidden or closed.
let saveClock = 0;
window.addEventListener('beforeunload', persist);
document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });

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
nameInput.addEventListener('change', () => {
  const v = nameInput.value.trim();
  if (v) { player.name = v; persist(); }
});
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
window.__game = { player, map, camera, animals, birds, robots, obelisks, dayNight, lore, input, renderer };

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
let detail = null;   // right-click inspection tooltip {text, x, y, ttl}
let drag = null;     // in-progress pointer drag {from: slotDescriptor}
const PROJECTILE_SPEED = 16; // tiles/sec for gun tracers

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
function update(dt) {
  if (input.consumePress('KeyH')) toggleHelp();
  if (input.inventoryPressed()) showBackpack = !showBackpack;
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
    if (input.clickPos() || input.consumeUp()) { input.consumeClick(); player.deathCert = null; }
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

  player.update(dt, input, map, animals, robots, mouseWorld);
  // Advance in-flight rounds.
  for (const p of map.projectiles) {
    const dist = Math.hypot(p.x1 - p.x0, p.y1 - p.y0) || 0.001;
    p.prog += (PROJECTILE_SPEED * dt) / dist;
  }
  if (map.projectiles.length) map.projectiles = map.projectiles.filter((p) => p.prog < 1);

  // Autosave the run every few seconds.
  saveClock += dt;
  if (saveClock >= 8) { saveClock = 0; persist(); }
  updateAnimals(dt, animals, player, map);
  updateBirds(dt, birds, animals, player, map);
  updateRobots(dt, robots, player, map);
  resolveBodyOverlaps(player, animals, robots);
  map.updateShakes(dt);
  dayNight.update(dt);
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
    timeLabel: dayNight.label,
    minimap,
    birds,
    robots,
    lore,
    torch: player.pockets.some((s) => s && s.item === 'torch'),
    showBackpack,
    detail,
    drag: drag ? { ...drag, mx: input.mouseX, my: input.mouseY } : null,
    deathCert: player.deathCert,
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
