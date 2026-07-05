import { makeRng } from './rng.js';

// Hunter robots: the machines the towers send after the last humans. Two
// classes, each with a signature limitation the player can learn. T1s are
// cheap wheeled wedges: quick on the flat but unable to climb even a single
// step, so any rise in the ground stops them and a hollow swallows them for
// good. T2s are bipeds that walk wherever the player can, matching walking
// pace exactly: you cannot stroll away from one, only sprint.
//
// Every machine runs on a battery. Hunting burns charge fast; a machine
// running low breaks off and trudges back to its home obelisk to recharge,
// and one that cannot get there simply drains flat where it stands. External
// systems can also stun a robot (disabledT), fuse one into a mineable wreck
// (fused + mineCharges), or reprogram one to serve the player (friendly).

// ---- Tuning ---------------------------------------------------------------

const RADIUS = 0.3;             // collision radius in tiles (both classes)

const T1_HP = 10;
const T1_PATROL_SPEED = 1.4;    // tiles per second
const T1_CHASE_SPEED = 5.0;     // faster than a walk (4.2), slower than a sprint (7.5)
const T1_PATROL_RANGE = 6;      // how far patrol targets stray from home
const T1_DETECT_RANGE = 9;      // no line of sight needed: it hears the wheels turn
const T1_DEAGGRO_RANGE = 12;    // gives up beyond this
const T1_HIT_RANGE = 0.8;
const T1_HIT_DAMAGE = 12;
const T1_HIT_COOLDOWN = 1.0;    // seconds between rams

const T2_HP = 24;
const T2_PATROL_SPEED = 1.2;
const T2_STALK_SPEED = 4.2;     // exactly the player's walking speed: a stalemate
const T2_RETURN_SPEED = 2.0;    // unhurried trudge back to its tower
const T2_PATROL_RANGE = 8;
const T2_DETECT_RANGE = 11;
const T2_LOSE_RANGE = 20;       // loses the trail beyond this and heads home
const T2_HIT_RANGE = 0.9;
const T2_HIT_DAMAGE = 15;
const T2_HIT_COOLDOWN = 1.2;

// W1s: a "revenge squad" the AI releases the instant an obelisk falls. They
// don't patrol — they walk in facing your last-known position from the
// moment they're deployed, faster and harder-hitting than a T2. Otherwise
// they share the biped's collision, battery and recharge behaviour, seating
// at the crater where their tower stood as if it were still a charger.
const W1_HP = 45;
const W1_CHASE_SPEED = 4.6;
const W1_DETECT_RANGE = 999;    // deployed hunting you; no detection needed
const W1_HIT_RANGE = 0.9;
const W1_HIT_DAMAGE = 20;
const W1_HIT_COOLDOWN = 1.0;
const W1_BODY = '#3a1418';      // scorched red-black chassis
const W1_HEAD = '#2a0e10';

// W3s: unarmed repair drones fielded by the W-factory. They walk straight to
// the nearest obelisk that's been damaged but not yet destroyed and mend it
// back to full over a few seconds, then disperse (the same generic death
// path scraps them if the player kills one first).
const W3_HP = 20;
const W3_SPEED = 3.0;
const W3_REPAIR_RANGE = 1.3;
const W3_REPAIR_RATE = 2;       // obDamage points healed per second
const W3_BODY = '#1c3a44';      // dull blue-teal, unmistakably not a hunter
const W3_HEAD = '#122730';

const STUCK_AFTER = 2;          // seconds of no progress while aggroed
const PROGRESS_FRACTION = 0.25; // moved less than this share of a full step counts as no progress
const SPAWN_MIN_R = 1.5;        // robots seat this far from their tower...
const SPAWN_MAX_R = 4;          // ...to about this far, expanding if crowded
const SPAWN_MAX_R_FALLBACK = 8;
const SCRAP_MIN = 1;            // scrap dropped on destruction: SCRAP_MIN + 0 or 1

// Battery: every machine spawns part-charged and burns power by activity.
const BATTERY_MAX = 100;
const BATTERY_SPAWN_MIN = 60;   // spawn charge: 60..100, seeded per robot
const BATTERY_SPAWN_VARY = 40;
const BATTERY_LOW = 25;         // hostile machines break off to recharge below this
const DRAIN_PATROL = 0.35;      // battery per second while patrolling / trudging
const DRAIN_CHASE = 1.0;        // battery per second while chasing or stalking
const DRAIN_FRIENDLY = 0.2;     // battery per second in the player's service
const RECHARGE_RANGE = 1.6;     // tiles from home within which the charger reaches
const RECHARGE_RATE = 12;       // battery per second at the obelisk
const RECHARGE_TRAVEL_SPEED = 2.0; // unhurried low-power trudge home

// Friendly (reprogrammed) behaviour.
const FOLLOW_MAX = 4;           // start moving when the player is further than this...
const FOLLOW_MIN = 2.5;         // ...and stop once back inside this
const FOLLOW_SPEED_T1 = 5.0;    // wheels keep up with a walking player easily
const FOLLOW_SPEED_T2 = 4.2;    // biped matches walking pace, as when hostile
const WORK_RANGE = 3;           // T2 friendlies notice trees within this radius
const WORK_SPEED = 2.0;         // amble over to the job
const CHOP_RANGE = 1.4;         // close enough to swing at the trunk
const CHOP_RATE = 0.7;          // tree hp per second
const TREE_HP_DEFAULT = 4;      // matches the player's felling code
const WOOD_PER_TREE = 2;
const CHOP_SHAKE_EVERY = 0.9;   // seconds between visible trunk shudders
const WORK_SCAN_EVERY = 0.5;    // seconds between searches for a fresh tree

// Palette: dark machinery with a single red light.
const T1_BODY = '#41464d';      // gunmetal wedge
const T1_BODY_EDGE = '#2c3036';
const T1_WHEEL = '#1b1d20';
const T2_BODY = '#2e3138';
const T2_LIMB = '#23262b';
const T2_HEAD = '#26292f';
const EYE_DIM = '#8a1f16';      // sensor idling
const EYE_HOT = '#ff3b2a';      // sensor locked on
const EYE_FRIEND = '#46d95f';   // sensor reprogrammed
const EYE_FRIEND_HALO = 'rgba(70,217,95,0.22)';
const EYE_SOCKET = '#17181b';   // sensor off: a dark empty socket
const STUN_AMBER = [214, 152, 46]; // flickering while stunned
const DRAINED_TONE = -0.4;      // body darkening for a flat battery
const FRIENDLY_TONE = 0.2;      // body lightening for a reprogrammed machine
const FUSED_BODY = '#212123';   // blackened charcoal wreck
const FUSED_EDGE = '#131315';
const FUSED_DARK = '#191a1c';
const BATT_RED = '#7d2018';     // empty-battery marker over a drained machine
const SMOKE_GREY = 'rgba(140,140,140,'; // alpha appended per puff

// ---- Spawning -------------------------------------------------------------

// Base fields common to both classes. Each robot carries its own seeded rng
// so patrols stay deterministic for a given world seed.
function baseRobot(type, x, y, hp, rng) {
  return {
    type,
    x: x + 0.5,
    y: y + 0.5,
    hp,
    maxHp: hp,
    dead: false,
    hurt: false,          // set by the player's strike code; read once here
    home: { x: x + 0.5, y: y + 0.5 },
    facing: { x: 0, y: 1 },
    aggro: false,         // tell: renderer brightens the red sensor
    stuck: false,         // T1 only in practice: aggroed but going nowhere
    returning: false,     // T2 only: trudging back to its tower
    attackTimer: 0,
    noProgressT: 0,
    wanderTarget: null,
    wanderTimer: 0,
    walkPhase: 0,         // drives the T2 leg scissor
    animT: rng() * 10,    // desync idle animation between individuals
    battery: BATTERY_SPAWN_MIN + rng() * BATTERY_SPAWN_VARY,
    drained: false,       // battery hit zero: inert until the player re-batteries it
    recharging: false,    // heading home / drinking from the obelisk
    friendly: false,      // reprogrammed: serves the player, never attacks
    fused: false,         // dead-in-place wreck; external mining code owns it
    zombie: false,        // OB-gun-corrupted: immune to everything but bow/wave gun
    disabledT: 0,         // stun seconds remaining; external code sets this
    scrapPenalty: false,  // set by external gun code: a penalised kill drops 1
    workTarget: null,     // T2 friendly: the tree currently being felled
    workScanT: 0,
    chopPulseT: 0,
    following: false,     // friendly follow hysteresis between FOLLOW_MIN/MAX
    rng: makeRng(Math.floor(rng() * 0xffffffff)),
  };
}

// A tile a robot may be seated on: in bounds, walkable, and at ground level
// or above (the towers do not deploy machines into hollows).
function seatable(map, x, y, avoid, used) {
  if (map.isSolid(x, y)) return false;
  if (map.heightAt(x, y) < 0) return false;
  if (Math.hypot(x + 0.5 - avoid.x, y + 0.5 - avoid.y) < avoid.r) return false;
  return !used.has(`${x},${y}`);
}

// Pick a free tile in a ring around the tower, widening the ring if the
// near ground is all solid or spoken for. Returns [x, y] or null.
function seatNear(map, ox, oy, avoid, used, rng, maxR) {
  const candidates = [];
  for (let dy = -maxR; dy <= maxR; dy++) {
    for (let dx = -maxR; dx <= maxR; dx++) {
      const d = Math.hypot(dx, dy);
      if (d < SPAWN_MIN_R || d > maxR + 0.2) continue;
      const x = ox + dx, y = oy + dy;
      if (seatable(map, x, y, avoid, used)) candidates.push([x, y]);
    }
  }
  if (!candidates.length) {
    return maxR < SPAWN_MAX_R_FALLBACK
      ? seatNear(map, ox, oy, avoid, used, rng, SPAWN_MAX_R_FALLBACK)
      : null;
  }
  return candidates[Math.floor(rng() * candidates.length)];
}

// One T1 sentry per tower; every second tower also fields a T2 stalker.
export function spawnRobots(map, seed, obelisks, avoid) {
  const rng = makeRng(seed);
  const robots = [];
  const used = new Set();

  obelisks.forEach((ob, i) => {
    const wants = i % 2 === 1 ? ['t1', 't2'] : ['t1'];
    for (const type of wants) {
      const spot = seatNear(map, ob.x, ob.y, avoid, used, rng, SPAWN_MAX_R);
      if (!spot) continue; // tower stands in a dead corner: no machine
      used.add(`${spot[0]},${spot[1]}`);
      robots.push(baseRobot(type, spot[0], spot[1],
        type === 't1' ? T1_HP : T2_HP, rng));
    }
  });

  return robots;
}

// A revenge squad released the instant an obelisk falls: two to four W1s
// seated around the crater, immediately hunting. `seed` should vary per call
// (e.g. folded with the obelisk's coordinates) so repeat destructions don't
// all produce the same squad.
export function spawnW1s(map, seed, ox, oy, count = 3) {
  const rng = makeRng(seed >>> 0);
  const used = new Set();
  const avoid = { x: ox, y: oy, r: 0 };
  const squad = [];
  for (let i = 0; i < count; i++) {
    const spot = seatNear(map, ox, oy, avoid, used, rng, SPAWN_MAX_R_FALLBACK);
    if (!spot) continue;
    used.add(`${spot[0]},${spot[1]}`);
    const r = baseRobot('w1', spot[0], spot[1], W1_HP, rng);
    r.aggro = true; // deployed hunting: no detection phase
    squad.push(r);
  }
  return squad;
}

// One repair drone off the factory floor, sent out to mend the nearest
// damaged obelisk. `seed` should vary per call so its seated tile isn't
// always the same.
export function spawnW3(map, seed, fx, fy) {
  const rng = makeRng(seed >>> 0);
  const used = new Set();
  const avoid = { x: fx, y: fy, r: 0 };
  const spot = seatNear(map, fx, fy, avoid, used, rng, SPAWN_MAX_R_FALLBACK);
  if (!spot) return null;
  return baseRobot('w3', spot[0], spot[1], W3_HP, rng);
}

// ---- Movement helpers -----------------------------------------------------

const CORNERS = [
  [-RADIUS, -RADIUS], [RADIUS, -RADIUS],
  [-RADIUS, RADIUS], [RADIUS, RADIUS],
];

// T1 height rule: a wheeled wedge cannot gain height, full stop. Each corner
// keeps its own reference (the tile it is on now), so the body can roll
// cleanly down a step it is straddling but no corner ever moves onto a tile
// higher than the one under it. Everything else — being walled off by a
// one-step ridge, being trapped for good in a hollow — falls out of this.
function collidesT1(map, r, nx, ny) {
  for (const [ox, oy] of CORNERS) {
    const tx = Math.floor(nx + ox);
    const ty = Math.floor(ny + oy);
    if (map.isSolid(tx, ty)) return true;
    if (map.heightAt(tx, ty) > map.heightAt(Math.floor(r.x + ox), Math.floor(r.y + oy))) {
      return true;
    }
  }
  return false;
}

// T2 height rule: same scheme as Player.collides — steps of one level either
// way are fine, anything steeper blocks.
function collidesT2(map, r, nx, ny) {
  const h = map.heightAt(Math.floor(r.x), Math.floor(r.y));
  for (const [ox, oy] of CORNERS) {
    const tx = Math.floor(nx + ox);
    const ty = Math.floor(ny + oy);
    if (map.isSolid(tx, ty)) return true;
    if (Math.abs(map.heightAt(tx, ty) - h) > 1) return true;
  }
  return false;
}

function collides(map, r, nx, ny) {
  return r.type === 't1' ? collidesT1(map, r, nx, ny) : collidesT2(map, r, nx, ny);
}

function moveAxis(r, dx, dy, map) {
  const nx = r.x + dx;
  const ny = r.y + dy;
  if (!collides(map, r, nx, ny)) {
    r.x = nx;
    r.y = ny;
  }
}

// Step towards a point; axis-separated so robots slide along walls and
// ledges. Returns the distance actually covered this step.
function moveToward(r, tx, ty, speed, dt, map) {
  const dx = tx - r.x;
  const dy = ty - r.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return 0;
  const step = Math.min(speed * dt, len);
  const ox = r.x, oy = r.y;
  moveAxis(r, (dx / len) * step, 0, map);
  moveAxis(r, 0, (dy / len) * step, map);
  const moved = Math.hypot(r.x - ox, r.y - oy);
  if (moved > 1e-6) {
    r.facing = { x: (r.x - ox) / moved, y: (r.y - oy) / moved };
    r.walkPhase += dt * 10; // T2 legs scissor only while actually moving
  }
  return moved;
}

// Idle patrol: amble to points near home with pauses in between. The T1
// obeys its no-climb rule here too, so a trapped one just circles its pit.
function patrol(r, speed, range, dt, map) {
  r.wanderTimer -= dt;
  if (r.wanderTimer <= 0) {
    if (r.rng() < 0.35) {
      r.wanderTarget = null; // hold position a moment
      r.wanderTimer = 1.5 + r.rng() * 2.5;
    } else {
      const ang = r.rng() * Math.PI * 2;
      const d = 0.5 + r.rng() * (range - 0.5);
      r.wanderTarget = { x: r.home.x + Math.cos(ang) * d, y: r.home.y + Math.sin(ang) * d };
      r.wanderTimer = 2 + r.rng() * 2;
    }
  }
  if (r.wanderTarget) {
    moveToward(r, r.wanderTarget.x, r.wanderTarget.y, speed, dt, map);
    if (Math.hypot(r.wanderTarget.x - r.x, r.wanderTarget.y - r.y) < 0.1) {
      r.wanderTarget = null;
    }
  }
}

function distTo(r, player) {
  // A held, charged Wi-Fi block jams hostile sensors: the player reads as
  // out of range everywhere, so hunters never acquire (and instantly lose)
  // the trail. Friendly robots don't use this path, so they still follow.
  if (player.invisibleToRobots) return Infinity;
  return Math.hypot(player.x - r.x, player.y - r.y);
}

// Scrap variation without Math.random: a cheap integer hash of the wreck's
// position, so the same robot dying in the same place always drops the same.
function scrapQty(x, y) {
  let h = (Math.floor(x * 64) * 0x9e3779b1) ^ (Math.floor(y * 64) * 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return SCRAP_MIN + ((h >>> 16) & 1);
}

// ---- Battery --------------------------------------------------------------

// Burn charge; at zero the machine goes flat where it stands. Flat is
// permanent until external code re-batteries it (battery = 100, drained =
// false); a friendly stays friendly while flat.
function drainBattery(r, rate, dt) {
  r.battery = Math.max(0, r.battery - rate * dt);
  if (r.battery <= 0) {
    r.battery = 0;
    r.drained = true;
    r.aggro = false;
    r.stuck = false;
    r.recharging = false;
    r.returning = false;
  }
}

// Recharge state: trudge home, ignoring the player entirely, and drink from
// the obelisk once in range. The T1 keeps its never-uphill rule on the way,
// so one trapped below its charger drains flat instead.
function updateRecharge(r, dt, map) {
  const dHome = Math.hypot(r.home.x - r.x, r.home.y - r.y);
  if (dHome <= RECHARGE_RANGE) {
    r.battery = Math.min(BATTERY_MAX, r.battery + RECHARGE_RATE * dt);
    if (r.battery >= BATTERY_MAX) {
      r.battery = BATTERY_MAX;
      r.recharging = false; // topped up: back to the rounds
    }
    return;
  }
  drainBattery(r, DRAIN_PATROL, dt);
  if (r.drained) return;
  moveToward(r, r.home.x, r.home.y, RECHARGE_TRAVEL_SPEED, dt, map);
}

// ---- Update ---------------------------------------------------------------

export function updateRobots(dt, robots, player, map) {
  for (const r of robots) {
    if (r.dead) continue; // external code may set dead directly; nothing runs after

    // Fused wrecks: permanently dead-in-place scenery. No AI, no recharge,
    // no scrap of their own; external mining code decrements mineCharges and
    // eventually sets dead. Only the smoke animation phase keeps ticking.
    if (r.fused) {
      r.animT += dt;
      continue;
    }

    // Destruction via damage: mark dead and drop scrap exactly once. A
    // penalised kill (external gun code) yields a single scrap.
    if (r.hp <= 0) {
      r.dead = true;
      r.stuck = false;
      const qty = r.scrapPenalty ? 1 : scrapQty(r.x, r.y);
      (map.groundItems ??= []).push({ item: 'scrap', qty, x: r.x, y: r.y });
      // A T1 very rarely carries an OB-gun — a prize find (deterministic from
      // its wreck position so it isn't reload-farmable).
      if (r.type === 't1' && (scrapQty(r.x * 1.7 + 3, r.y * 2.3 + 1) & 7) === 0
        && ((Math.floor(r.x * 31 + r.y * 17)) % 20 === 0)) {
        map.groundItems.push({ item: 'obgun', qty: 1, x: r.x, y: r.y });
        map.groundItems.push({ item: 'battery', qty: 2, x: r.x + 0.3, y: r.y });
      }
      continue;
    }

    // Stunned: frozen in place, battery preserved. Only the timer and the
    // amber flicker phase advance; on expiry normal AI resumes next frame
    // (and aggros at once if the player is still in range).
    if (r.disabledT > 0) {
      r.disabledT = Math.max(0, r.disabledT - dt);
      r.animT += dt;
      continue;
    }

    // Flat battery: fully inert until the player re-batteries it.
    if (r.drained) continue;

    r.animT += dt;

    // Taking a hit wakes the machine up regardless of range — unless it is
    // serving the player or has already broken off to recharge.
    if (r.hurt) {
      r.hurt = false;
      if (!r.friendly && !r.recharging) r.aggro = true;
    }

    if (r.friendly) {
      updateFriendly(r, dt, player, map);
      continue;
    }

    if (r.recharging) {
      updateRecharge(r, dt, map);
      continue;
    }

    // Low battery: break off the hunt and head for the home obelisk.
    if (r.battery < BATTERY_LOW) {
      r.recharging = true;
      r.aggro = false;
      r.stuck = false;
      r.noProgressT = 0;
      r.returning = false;
      updateRecharge(r, dt, map);
      continue;
    }

    if (r.type === 't1') updateT1(r, dt, player, map);
    else if (r.type === 'w1') updateW1(r, dt, player, map);
    else if (r.type === 'w3') updateW3(r, dt, map);
    else updateT2(r, dt, player, map);
  }
}

function updateT1(r, dt, player, map) {
  r.attackTimer = Math.max(0, r.attackTimer - dt);

  const d = distTo(r, player);
  if (!r.aggro && d < T1_DETECT_RANGE) r.aggro = true; // no line of sight needed
  if (r.aggro && d > T1_DEAGGRO_RANGE) r.aggro = false;

  drainBattery(r, r.aggro ? DRAIN_CHASE : DRAIN_PATROL, dt);
  if (r.drained) return;

  if (r.aggro) {
    const expected = Math.min(T1_CHASE_SPEED * dt, d);
    const moved = moveToward(r, player.x, player.y, T1_CHASE_SPEED, dt, map);
    // Progress bookkeeping for the stuck tell: a chaser pinned by terrain
    // for a couple of seconds admits it (the renderer shows its confusion).
    if (moved < expected * PROGRESS_FRACTION) r.noProgressT += dt;
    else r.noProgressT = 0;
    r.stuck = r.noProgressT > STUCK_AFTER;

    if (d < T1_HIT_RANGE && r.attackTimer <= 0) {
      r.attackTimer = T1_HIT_COOLDOWN;
      player.takeDamage(T1_HIT_DAMAGE, 'machine');
    }
  } else {
    r.noProgressT = 0;
    r.stuck = false;
    patrol(r, T1_PATROL_SPEED, T1_PATROL_RANGE, dt, map);
  }
}

function updateT2(r, dt, player, map) {
  r.attackTimer = Math.max(0, r.attackTimer - dt);

  const d = distTo(r, player);
  if (!r.aggro && d < T2_DETECT_RANGE) {
    r.aggro = true;
    r.returning = false;
  }
  if (r.aggro && d > T2_LOSE_RANGE) {
    r.aggro = false;
    r.returning = true; // trail gone cold: back to the tower
  }

  drainBattery(r, r.aggro ? DRAIN_CHASE : DRAIN_PATROL, dt);
  if (r.drained) return;

  if (r.aggro) {
    moveToward(r, player.x, player.y, T2_STALK_SPEED, dt, map);
    if (d < T2_HIT_RANGE && r.attackTimer <= 0) {
      r.attackTimer = T2_HIT_COOLDOWN;
      player.takeDamage(T2_HIT_DAMAGE, 'machine');
    }
  } else if (r.returning) {
    moveToward(r, r.home.x, r.home.y, T2_RETURN_SPEED, dt, map);
    if (Math.hypot(r.home.x - r.x, r.home.y - r.y) < 1) r.returning = false;
  } else {
    patrol(r, T2_PATROL_SPEED, T2_PATROL_RANGE, dt, map);
  }
}

// A W1 revenge-squad hunter: spawned already aggroed and never disengages —
// no detection phase, no giving up the trail, no patrol. Only a flat
// battery stops it (handled generically in updateRobots, same as any type).
function updateW1(r, dt, player, map) {
  r.attackTimer = Math.max(0, r.attackTimer - dt);
  r.aggro = true;
  drainBattery(r, DRAIN_CHASE, dt);
  if (r.drained) return;
  moveToward(r, player.x, player.y, W1_CHASE_SPEED, dt, map);
  if (distTo(r, player) < W1_HIT_RANGE && r.attackTimer <= 0) {
    r.attackTimer = W1_HIT_COOLDOWN;
    player.takeDamage(W1_HIT_DAMAGE, 'machine');
  }
}

// A W3 repair drone: unarmed, never aggros, walks to the nearest obelisk
// with obDamage > 0 (hit by an OB-gun but not yet toppled) and heals it back
// to zero over a few seconds, then disperses — its job done.
function updateW3(r, dt, map) {
  r.aggro = false;
  if (!r.repairTarget || r.repairTarget.destroyed || !(r.repairTarget.obDamage > 0)) {
    let best = null, bestD = Infinity;
    for (const o of map.objects) {
      if (o.type !== 'obelisk' || o.destroyed || !(o.obDamage > 0)) continue;
      const d = Math.hypot(o.x + 0.5 - r.x, o.y + 0.5 - r.y);
      if (d < bestD) { bestD = d; best = o; }
    }
    r.repairTarget = best;
  }
  if (!r.repairTarget) { r.dead = true; return; } // nothing left to mend: stand down
  const ob = r.repairTarget;
  const d = Math.hypot(ob.x + 0.5 - r.x, ob.y + 0.5 - r.y);
  drainBattery(r, DRAIN_PATROL, dt);
  if (r.drained) return;
  if (d > W3_REPAIR_RANGE) {
    moveToward(r, ob.x + 0.5, ob.y + 0.5, W3_SPEED, dt, map);
    return;
  }
  ob.obDamage = Math.max(0, ob.obDamage - W3_REPAIR_RATE * dt);
  ob.burning = 0;
  if (ob.obDamage <= 0) { r.repairTarget = null; r.dead = true; }
}

// ---- Friendly (reprogrammed) ----------------------------------------------

// A reprogrammed machine serves the player: never attacks, never aggros,
// never goes home to the obelisk. It heels at a respectful distance; a T2
// also fells nearby trees for wood. It runs on the same battery, drained
// slowly by its lighter duties, and goes flat at zero until re-batteried.
function updateFriendly(r, dt, player, map) {
  r.aggro = false;
  r.stuck = false;
  r.returning = false;
  r.recharging = false;

  drainBattery(r, DRAIN_FRIENDLY, dt);
  if (r.drained) return; // friendly stays true; only the battery is gone

  // T2 work: any tree within noticing distance takes priority over heeling.
  if (r.type === 't2') {
    if (r.workTarget && map.objectAt(r.workTarget.x, r.workTarget.y) !== r.workTarget) {
      r.workTarget = null; // someone else felled it
    }
    if (!r.workTarget) {
      r.workScanT -= dt;
      if (r.workScanT <= 0) {
        r.workScanT = WORK_SCAN_EVERY;
        r.workTarget = nearestTree(r, map);
        r.chopPulseT = 0;
      }
    }
    if (r.workTarget) {
      workTree(r, dt, map);
      return;
    }
  }

  // Heel: keep FOLLOW_MIN..FOLLOW_MAX tiles behind the player. The T1 still
  // cannot climb, so it may lag or get blocked; that is its lot in life.
  const d = distTo(r, player);
  if (d > FOLLOW_MAX) r.following = true;
  else if (d <= FOLLOW_MIN) r.following = false;
  if (r.following) {
    const speed = r.type === 't1' ? FOLLOW_SPEED_T1 : FOLLOW_SPEED_T2;
    moveToward(r, player.x, player.y, speed, dt, map);
  }
}

// Nearest standing tree within working distance of the robot, or null.
function nearestTree(r, map) {
  let best = null, bestD = WORK_RANGE;
  for (const obj of map.objects) {
    if (obj.type !== 'tree') continue;
    const d = Math.hypot(obj.x + 0.5 - r.x, obj.y + 0.5 - r.y);
    if (d <= bestD) {
      best = obj;
      bestD = d;
    }
  }
  return best;
}

// Walk to the tree and chop steadily, same bookkeeping as the player's
// felling code: hp counts down, the trunk shudders, and the felled tree is
// replaced by dropped wood.
function workTree(r, dt, map) {
  const tree = r.workTarget;
  const tx = tree.x + 0.5, ty = tree.y + 0.5;
  if (Math.hypot(tx - r.x, ty - r.y) > CHOP_RANGE) {
    moveToward(r, tx, ty, WORK_SPEED, dt, map);
    return;
  }

  tree.hp = (tree.hp ?? TREE_HP_DEFAULT) - CHOP_RATE * dt;
  r.chopPulseT -= dt;
  if (r.chopPulseT <= 0) {
    r.chopPulseT = CHOP_SHAKE_EVERY;
    tree.shake = 0.3;
    map.shaking.add(tree);
  }

  if (tree.hp <= 0) {
    map.removeObject(tree);
    map.groundItems.push({ item: 'wood', qty: WOOD_PER_TREE, x: tree.x + 0.5, y: tree.y + 0.5 });
    r.workTarget = null;
    r.workScanT = 0; // look for the next job at once
  }
}

// ---- Drawing --------------------------------------------------------------

// Placeholder art in code, matching the renderer's style: shadow ellipse at
// the feet, simple shapes at tile scale. worldToScreen is the projection
// function from engine/iso.js, passed in so this module stays engine-free.
// All animation derives from the robot's own animT phase: no Date.now or
// Math.random anywhere in the draw path.

// Local copy of the renderer's hex shader so this module stays engine-free.
function shadeHex(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) * (1 + amount)));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) * (1 + amount)));
  const b = Math.max(0, Math.min(255, (n & 255) * (1 + amount)));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

// Sensor light for the current state, or null for a fused wreck (no light
// at all). Hostile red as before, green in service, dark socket when flat,
// a flickering dim amber while stunned.
function sensorStyle(r) {
  if (r.fused) return null;
  if (r.drained) return { fill: EYE_SOCKET, halo: null };
  if ((r.disabledT || 0) > 0) {
    const t = r.animT || 0;
    const gate = Math.max(0, Math.sin(t * 11) * (0.4 + 0.6 * Math.sin(t * 4.3)));
    const a = 0.25 + 0.35 * gate;
    return { fill: `rgba(${STUN_AMBER[0]},${STUN_AMBER[1]},${STUN_AMBER[2]},${a.toFixed(3)})`, halo: null };
  }
  if (r.friendly) return { fill: EYE_FRIEND, halo: EYE_FRIEND_HALO };
  return { fill: r.aggro ? EYE_HOT : EYE_DIM, halo: r.aggro ? 'rgba(255,59,42,0.3)' : null };
}

// Body plate colour for the current state.
function bodyTone(base, r) {
  if (r.fused) return FUSED_BODY;
  if (r.drained) return shadeHex(base, DRAINED_TONE);
  if (r.friendly) return shadeHex(base, FRIENDLY_TONE);
  return base;
}

// Designation painted on the body plate, always visible. Coordinates are in
// the current (possibly translated/rotated) space.
function drawDesignation(ctx, r, x, y) {
  ctx.font = 'bold 7px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#b8bcc2'; // light grey, softer than stark white
  ctx.fillText(r.type.toUpperCase(), x, y);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

// Two-to-three tiny grey puffs drifting up from a fused wreck, phased off
// animT so each rises, fades, and loops.
function drawSmoke(ctx, x, y, animT) {
  for (let i = 0; i < 3; i++) {
    const p = (animT * 0.45 + i * 0.33) % 1;
    const a = 0.3 * (1 - p);
    ctx.fillStyle = `${SMOKE_GREY}${a.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x + Math.sin((animT + i * 2.1) * 1.7) * 2, y - p * 16, 1.6 + p * 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Tiny dark-red empty-battery marker above a drained machine.
function drawBatteryIcon(ctx, x, y) {
  ctx.strokeStyle = BATT_RED;
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 4.5, y - 2.5, 9, 5); // empty cell
  ctx.fillStyle = BATT_RED;
  ctx.fillRect(x + 4.5, y - 1, 1.5, 2);   // terminal nub
}

export function drawRobot(ctx, robot, worldToScreen) {
  if (robot.dead) return;
  const c = worldToScreen(robot.x, robot.y);
  if (robot.zombie) {
    // A sickly green halo: the tell that only a bow or the wave gun works.
    ctx.fillStyle = 'rgba(120,255,90,0.28)';
    ctx.beginPath();
    ctx.ellipse(c.x, c.y - 14, 16, 18, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (robot.type === 't1') drawT1(ctx, robot, c, worldToScreen);
  else drawT2(ctx, robot, c);
}

function drawT1(ctx, r, c, worldToScreen) {
  // Sensor eye sits towards the direction of travel, like the dog's head.
  const f = worldToScreen(r.x + r.facing.x * 0.3, r.y + r.facing.y * 0.3);

  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, 11, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(c.x, c.y);
  // Tells: a burnt-out wreck slumps hard; a trapped machine lists to one
  // side, wheels spinning uselessly.
  if (r.fused) ctx.rotate(0.2);
  else if (r.stuck) ctx.rotate(0.12);

  ctx.fillStyle = r.fused ? FUSED_EDGE : T1_WHEEL; // two dark wheels under the chassis
  ctx.beginPath();
  ctx.arc(-6, -3, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(6, -3, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = bodyTone(T1_BODY, r); // low gunmetal wedge, nose down
  ctx.beginPath();
  ctx.moveTo(-10, -5);
  ctx.lineTo(10, -5);
  ctx.lineTo(6, -14);
  ctx.lineTo(-10, -11);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = r.fused ? FUSED_EDGE : T1_BODY_EDGE;
  ctx.lineWidth = 1;
  ctx.stroke();

  drawDesignation(ctx, r, -1, -9); // 'T1' on the wedge plate

  ctx.restore();

  // Single sensor eye ahead of the body; colour and glow track the state.
  const s = sensorStyle(r);
  if (s) {
    if (s.halo) {
      ctx.fillStyle = s.halo;
      ctx.beginPath();
      ctx.arc(f.x, f.y - 9, 5.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = s.fill;
    ctx.beginPath();
    ctx.arc(f.x, f.y - 9, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  if (r.fused) drawSmoke(ctx, c.x, c.y - 14, r.animT || 0);
  if (r.drained && !r.fused) drawBatteryIcon(ctx, c.x, c.y - 22);

  if (r.stuck && !r.fused && !r.drained) {
    // Tell: baffled grey '!?' above a machine that cannot get to you.
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(190,190,190,0.9)';
    ctx.fillText('!?', c.x, c.y - 22);
    ctx.textAlign = 'left';
  }
}

function drawT2(ctx, r, c) {
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, 10, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(c.x, c.y);
  if (r.fused) ctx.rotate(0.14); // slumped wreck

  // Gait: legs scissor with the walk phase, same scheme as the player.
  // A wreck's legs hang straight.
  const swing = r.fused ? 0 : Math.sin(r.walkPhase) * 3;
  ctx.fillStyle = r.fused ? FUSED_EDGE : T2_LIMB;
  ctx.fillRect(-4 + swing, -10, 3, 10);
  ctx.fillRect(1 - swing, -10, 3, 10);

  const bodyBase = r.type === 'w1' ? W1_BODY : r.type === 'w3' ? W3_BODY : T2_BODY;
  const headBase = r.type === 'w1' ? W1_HEAD : r.type === 'w3' ? W3_HEAD : T2_HEAD;
  ctx.fillStyle = bodyTone(bodyBase, r); // blocky torso, roughly player height overall
  ctx.fillRect(-6, -25, 12, 16);
  if (!r.fused) {
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; // dull sheen along the shoulders
    ctx.fillRect(-6, -25, 12, 2);
  }

  ctx.fillStyle = r.fused ? FUSED_DARK : headBase; // small head
  ctx.fillRect(-4, -33, 8, 7);

  // Horizontal visor; colour and glow track the state.
  const s = sensorStyle(r);
  if (s) {
    if (s.halo) {
      ctx.fillStyle = s.halo;
      ctx.fillRect(-5.5, -32, 11, 4);
    }
    ctx.fillStyle = s.fill;
    ctx.fillRect(-3.5, -31, 7, 2);
  }

  drawDesignation(ctx, r, 0, -17); // 'T2' on the torso plate

  ctx.restore();

  if (r.fused) drawSmoke(ctx, c.x, c.y - 34, r.animT || 0);
  if (r.drained && !r.fused) drawBatteryIcon(ctx, c.x, c.y - 40);
}
