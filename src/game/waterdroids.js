import { makeRng } from './rng.js';

// W2 water droids: small aerial drones that skim just above the river's
// surface. They can only travel over water, so they are a riverbank menace
// and nothing more: stray inland and they cannot follow. They patrol in
// small squads, and if the player comes close while near the water the whole
// squad aggros together, converges on the nearest water-edge point, and fires
// in a coordinated wave. Hurt one and its squad snaps to alert at once. Move
// well inland and the squad soon gives up and drifts back to the river.

// ---- Tuning ---------------------------------------------------------------

const DROID_COUNT = 10;          // total droids spread across the river
const SQUAD_SIZE_MIN = 3;        // droids grouped into shared-packId squads
const SQUAD_SIZE_MAX = 4;
const SPAWN_MIN_GAP = 2;         // tiles between spawn points

const HP = 8;
const MAX_HP = 8;

const HOVER_Z = 0.6;             // hover height in world units (reads as flying)
const BOB_AMP = 0.06;            // gentle vertical bob amplitude
const BOB_RATE = 2.2;            // bob phase speed

const DRIFT_SPEED = 1.0;         // idle skim speed, tiles per second
const DRIFT_RANGE = 3.0;         // how far idle drift targets stray from home
const CHASE_SPEED = 3.4;         // converging on the player while aggroed

const DETECT_RANGE = 7;         // player within this of a squad droid ...
const BANK_RANGE = 2;           // ... AND within this of a water tile, to aggro
const FIRE_RANGE = 4;           // fires only within this of the player
const FIRE_DAMAGE = 6;
const FIRE_COOLDOWN = 1.4;      // seconds between shots, per droid
const DEAGGRO_INLAND = 3;       // player beyond this from any water is safe
const DEAGGRO_TIME = 4;         // squad calms this long after losing the player

const ARRIVE_DIST = 0.1;

// Drawing: pixels of screen lift per world unit of hover height, matching the
// renderer's convention for the player's jump (z * 32).
const PIX_PER_Z = 32;

const BODY = '#2e3138';         // dark gunmetal, as the tracked droids
const BODY_EDGE = '#1b1d20';
const ROTOR = 'rgba(180,190,200,0.18)'; // faint rotor blur ring
const SENSOR = '#17181b';       // downward sensor housing
const LIGHT_DIM = '#2a8f9c';    // teal running light at rest
const LIGHT_HOT = '#4fe6ff';    // cyan running light when aggroed

// ---- Spawning -------------------------------------------------------------

function makeDroid(x, y, packId, rng) {
  return {
    type: 'w2',
    x,
    y,
    z: HOVER_Z,
    hp: HP,
    maxHp: MAX_HP,
    lastHp: HP,          // for detecting fresh damage in update
    dead: false,
    packId,
    aggro: false,        // tell: renderer shows the light hot and a red '!'
    homeX: x,
    homeY: y,
    driftTarget: null,   // {x, y} idle skim destination
    driftTimer: 0,
    fireTimer: 0,        // per-droid shot cooldown
    deaggroTimer: 0,     // counts down once the player is out of reach
    bobPhase: rng() * Math.PI * 2,
    animT: rng() * 10,   // desync idle animation between individuals
    rng: makeRng(Math.floor(rng() * 0xffffffff)),
  };
}

// True if the tile at integer (tx, ty) is river water.
function isWater(map, tx, ty) {
  return map.floorAt(tx, ty) === 'water';
}

// True if any tile within `r` of the (float) point is water: "near the bank".
function nearWater(map, x, y, r) {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  const ri = Math.ceil(r);
  for (let dy = -ri; dy <= ri; dy++) {
    for (let dx = -ri; dx <= ri; dx++) {
      if (Math.hypot(dx, dy) > r) continue;
      if (isWater(map, cx + dx, cy + dy)) return true;
    }
  }
  return false;
}

// Shuffle points and take up to n, keeping a minimum gap between picks.
function pickSpots(points, n, minGap, rng) {
  const pool = points.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picked = [];
  for (const [x, y] of pool) {
    if (picked.length >= n) break;
    if (picked.every(([px, py]) => Math.hypot(px - x, py - y) >= minGap)) {
      picked.push([x, y]);
    }
  }
  return picked;
}

export function spawnWaterDroids(map, seed) {
  const rng = makeRng(seed);
  const droids = [];

  // Every water tile is a candidate spawn.
  const waterTiles = [];
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      if (isWater(map, x, y)) waterTiles.push([x, y]);
    }
  }

  const spots = pickSpots(waterTiles, DROID_COUNT, SPAWN_MIN_GAP, rng);
  // Group the chosen spots into small squads sharing a packId. A squad aggros
  // together, so consecutive (spatially near, thanks to the gap shuffle) picks
  // are bundled; the deterministic squad size varies within the range.
  let packId = 0;
  let i = 0;
  while (i < spots.length) {
    const size = SQUAD_SIZE_MIN + Math.floor(rng() * (SQUAD_SIZE_MAX - SQUAD_SIZE_MIN + 1));
    for (let k = 0; k < size && i < spots.length; k++, i++) {
      const [x, y] = spots[i];
      droids.push(makeDroid(x + 0.5, y + 0.5, packId, rng));
    }
    packId++;
  }
  return droids;
}

// ---- Movement helpers -----------------------------------------------------

// Skim towards a point but never leave the water: a move is taken only if its
// destination tile is water. Axis-separated so a droid slides along the bank
// rather than sticking when one axis is blocked by land.
function skimToward(d, tx, ty, speed, dt, map) {
  const dx = tx - d.x;
  const dy = ty - d.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return;
  const step = Math.min(speed * dt, len);
  const sx = (dx / len) * step;
  const sy = (dy / len) * step;
  // X axis.
  const nx = d.x + sx;
  if (isWater(map, Math.floor(nx), Math.floor(d.y))) d.x = nx;
  // Y axis.
  const ny = d.y + sy;
  if (isWater(map, Math.floor(d.x), Math.floor(ny))) d.y = ny;
}

// Nearest water-edge point to the player: the centre of the closest water tile
// to the player, so aggroed droids converge on the bank the player is near.
function nearestWaterPoint(map, px, py) {
  let best = null;
  let bestD = Infinity;
  const cx = Math.floor(px);
  const cy = Math.floor(py);
  const R = 10; // search a generous radius around the player
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      const tx = cx + dx;
      const ty = cy + dy;
      if (!isWater(map, tx, ty)) continue;
      const d = Math.hypot(tx + 0.5 - px, ty + 0.5 - py);
      if (d < bestD) {
        bestD = d;
        best = { x: tx + 0.5, y: ty + 0.5 };
      }
    }
  }
  return best;
}

function distTo(d, player) {
  return Math.hypot(player.x - d.x, player.y - d.y);
}

// Idle skim: amble to points near home over the water, with pauses between.
function drift(d, dt, map) {
  d.driftTimer -= dt;
  if (d.driftTimer <= 0) {
    if (d.rng() < 0.4) {
      d.driftTarget = null; // hover in place a moment
      d.driftTimer = 1 + d.rng() * 2;
    } else {
      const ang = d.rng() * Math.PI * 2;
      const r = 0.5 + d.rng() * DRIFT_RANGE;
      d.driftTarget = { x: d.homeX + Math.cos(ang) * r, y: d.homeY + Math.sin(ang) * r };
      d.driftTimer = 1.5 + d.rng() * 2;
    }
  }
  if (d.driftTarget) {
    skimToward(d, d.driftTarget.x, d.driftTarget.y, DRIFT_SPEED, dt, map);
    if (Math.hypot(d.driftTarget.x - d.x, d.driftTarget.y - d.y) < ARRIVE_DIST) {
      d.driftTarget = null;
    }
  }
}

// ---- Update ---------------------------------------------------------------

export function updateWaterDroids(dt, droids, player, map) {
  // Damage bookkeeping first: deaths drop scrap; fresh wounds flag the droid
  // so its whole squad snaps to alert this frame.
  for (const d of droids) {
    if (d.dead) continue;
    if (d.hp <= 0) {
      d.dead = true;
      (map.groundItems ??= []).push({ item: 'scrap', qty: 1, x: d.x, y: d.y });
      continue;
    }
    d.hurt = d.hp < d.lastHp;
    d.lastHp = d.hp;
  }

  // Squad-level signals: which squads have a hurt member, and which can see a
  // riverbank player. A hurt member aggros its whole squad immediately.
  const hurtSquads = new Set();
  const aggroSquads = new Set();
  const playerNearWater = nearWater(map, player.x, player.y, BANK_RANGE);
  for (const d of droids) {
    if (d.dead) continue;
    if (d.hurt) hurtSquads.add(d.packId);
    if (playerNearWater && distTo(d, player) < DETECT_RANGE) aggroSquads.add(d.packId);
  }

  // Is the player well inland (beyond every water tile's reach)? A squad that
  // has lost sight this way de-aggros after a grace period.
  const playerInland = !nearWater(map, player.x, player.y, DEAGGRO_INLAND);

  for (const d of droids) {
    if (d.dead) continue;
    d.animT += dt;
    d.bobPhase += BOB_RATE * dt;
    d.fireTimer = Math.max(0, d.fireTimer - dt);

    // Aggro triggers: detection while the player is near the bank, or any
    // squad-mate taking a hit.
    if (aggroSquads.has(d.packId) || hurtSquads.has(d.packId)) {
      d.aggro = true;
      d.deaggroTimer = DEAGGRO_TIME;
    }

    if (d.aggro) {
      // Count down towards giving up once the player is out of reach. A player
      // near the water keeps the squad hot; well inland starts the timer.
      if (aggroSquads.has(d.packId)) {
        d.deaggroTimer = DEAGGRO_TIME;
      } else if (playerInland) {
        d.deaggroTimer -= dt;
        if (d.deaggroTimer <= 0) {
          d.aggro = false;
          d.driftTarget = null;
          d.driftTimer = 0;
        }
      }
    }

    if (d.aggro) {
      // Converge on the water-edge point nearest the player, staying on water.
      const edge = nearestWaterPoint(map, player.x, player.y);
      const target = edge || { x: d.homeX, y: d.homeY };
      skimToward(d, target.x, target.y, CHASE_SPEED, dt, map);

      // Fire in the wave while within range and near the bank the player is on.
      if (distTo(d, player) < FIRE_RANGE && d.fireTimer <= 0) {
        d.fireTimer = FIRE_COOLDOWN;
        player.takeDamage(FIRE_DAMAGE, 'droid');
      }
    } else {
      // Idle: drift home along the river with a gentle hover.
      drift(d, dt, map);
    }

    // Gentle bob about the hover height.
    d.z = HOVER_Z + Math.sin(d.bobPhase) * BOB_AMP;
    d.hurt = false;
  }
}

// ---- Drawing --------------------------------------------------------------

// Placeholder art in code, matching the renderer's style: a shadow ellipse and
// ripple ring on the water directly below (at z = 0), and the drone body lifted
// by its hover height. worldToScreen is the projection from engine/iso.js,
// passed in so this module stays engine-free.
export function drawWaterDroid(ctx, droid, worldToScreen) {
  if (droid.dead) return;
  const c = worldToScreen(droid.x, droid.y);
  const lift = droid.z * PIX_PER_Z;
  const by = c.y - lift;

  // Shadow on the water, fading a touch as the droid bobs higher.
  const sh = Math.max(0.4, 1 - droid.z * 0.25);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, 6 * sh, 3 * sh, 0, 0, Math.PI * 2);
  ctx.fill();

  // A subtle ripple ring on the water beneath, breathing with the rotor wash.
  const ripple = 6 + Math.abs(Math.sin(droid.animT * 3)) * 3;
  ctx.strokeStyle = 'rgba(150,190,210,0.16)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, ripple, ripple * 0.5, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Faint rotor blur ring above the body.
  ctx.strokeStyle = ROTOR;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(c.x, by - 4, 8, 3.2, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Downward-pointing sensor stalk under the body.
  ctx.strokeStyle = SENSOR;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(c.x, by - 1);
  ctx.lineTo(c.x, by + 4);
  ctx.stroke();

  // Flattened metallic body.
  ctx.fillStyle = BODY;
  ctx.beginPath();
  ctx.ellipse(c.x, by - 2, 6, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = BODY_EDGE;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Cyan/teal running light, brightening when aggroed.
  const lit = droid.aggro;
  ctx.fillStyle = lit ? LIGHT_HOT : LIGHT_DIM;
  ctx.beginPath();
  ctx.arc(c.x, by - 2, lit ? 2 : 1.4, 0, Math.PI * 2);
  ctx.fill();
  if (lit) {
    // Soft halo on the hot light.
    ctx.fillStyle = 'rgba(79,230,255,0.25)';
    ctx.beginPath();
    ctx.arc(c.x, by - 2, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }

  if (droid.aggro) {
    // Tell: locked on, red '!' above the drone.
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e0503a';
    ctx.fillText('!', c.x, by - 14);
    ctx.textAlign = 'left';
  }
}
