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
const SLOPE_SPEED_MULT = 0.55;  // effort penalty crossing a height step, either way

const REPEL_FLEE_SPEED = 3.4;   // RON-ML `repel`/`sing`: fleeing or lining up
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

// T3s: rare, one to a handful of towers, and a tactical ambusher rather than
// a chaser — closer in spirit to a W4 than a T1/T2. It nests beside a tree
// near its obelisk and stays there, unnoticed, until it actually gets a
// clear line of sight to the player within range (no blind proximity
// detection: it has to genuinely see you). Then its twin eyes fire a dual
// laser volley — orange, not the red every other machine shoots, so it
// reads instantly as the one that hits far harder — for roughly double a
// W4 bolt's damage, but on a much longer recovery before it can fire again.
// Get inside its minimum range and it backs off just enough to keep a shot
// lined up rather than closing to melee, though point-blank it'll still
// claw. Losing line of sight for long enough still breaks it off like any
// other machine — see the generic LOS-giveup handling in updateRobots.
const T3_HP = 32;
const T3_PATROL_SPEED = 0.6;      // barely drifts from its nest while dormant
const T3_PATROL_RANGE = 1.6;      // small: it is meant to stay hidden, not wander
const T3_NEST_SEARCH_R = 6;       // how far from its obelisk seat it'll look for a tree to nest beside
const T3_AMBUSH_RANGE = 13;       // detection AND firing range — it must actually see you
const T3_MIN_RANGE = 3.5;         // backs off if the player closes inside this
const T3_RETREAT_SPEED = 2.6;
const T3_RETURN_SPEED = 2.0;      // unhurried trudge home once it gives up
const T3_FIRE_COOLDOWN = 4.8;     // slow recovery: a heavy, infrequent volley, not a stream
const T3_LASER_DAMAGE = 18;       // roughly double a W4 bolt (9) for the pair landing together
const T3_HIT_RANGE = 0.75;        // point-blank fallback: claws, not lasers
const T3_HIT_DAMAGE = 10;
const T3_HIT_COOLDOWN = 0.9;
const T3_BODY = '#123d8a';        // deep, darker blue — still reads at a glance, less garish
const T3_HEAD = '#081c47';
const T3_LIMB = '#050f28';
const T3_EDGE = '#02060f';
const T3_SCALE = 0.78;            // overall figure size, smaller than the original draft
const T3_EYE_HOT = '#ff8a1e';     // orange sensor/laser tell — every other hunter's is red
const T3_EYE_DIM = '#5a3a12';

// W1s: a "revenge squad" the AI releases the instant an obelisk falls (and
// periodically from the W-factory too). They don't patrol — deployed already
// hunting, cycling attack/withdraw phases like a real assault wave, and the
// surviving obelisk network triangulates the player's position for them even
// through a jammed Wi-Fi block (laggy and approximate, refreshed every few
// seconds, rather than a live fix). Otherwise they share the biped's
// collision, battery and recharge behaviour, seating at the crater where
// their tower stood as if it were still a charger.
const W1_HP = 45;
const W1_CHASE_SPEED = 4.6;
const W1_DETECT_RANGE = 999;    // deployed hunting you; no detection needed
// Melee only, and it means it: hit range is roughly the sum of the two
// collision radii (player 0.28 + W1 0.3) — genuine contact, not a lunge
// from a few paces off. Damage lowered too; a full squad landing hits
// every cooldown was killing far too fast even at proper range.
const W1_HIT_RANGE = 0.6;
const W1_HIT_DAMAGE = 12;
const W1_HIT_COOLDOWN = 1.0;
const W1_ATTACK_TIME = 6;       // seconds closing in and striking...
const W1_WITHDRAW_TIME = 4;     // ...then this long falling back before the next wave
const W1_ATTACK_STANDOFF = 0.55; // close enough during "attack" to actually reach hit range
const W1_WITHDRAW_RANGE = 7;    // distance fallen back to during a withdrawal
const W1_TRIANGULATE_EVERY = 2.5; // seconds between fresh position fixes from the network
const W1_BODY = '#3a1418';      // scorched red-black chassis
const W1_HEAD = '#2a0e10';

// W4s: laser hunter-killers the W-factory dispatches the instant the player
// attacks an obelisk. Unlike a W1 they never close to melee — they hold at
// range and fire, backing off if the player closes the gap. Losing line of
// sight for too long (LOS_GIVEUP_AFTER, generic) makes them give up and
// head home rather than hunt forever on a memorised position.
const W4_HP = 30;
const W4_SPEED = 3.6;
const W4_RANGE = 8;             // preferred firing distance
const W4_MIN_RANGE = 4.5;       // backs away if the player gets this close
const W4_FIRE_COOLDOWN = 1.6;
const W4_DAMAGE = 9;
const W4_BODY = '#4a1408';      // dull furnace red-black
const W4_HEAD = '#2c0c05';

// M6s: Adamantine's fortress guards (see docs/fortress-guards-plan.md). Two
// variants: the m6 heavy melee sentinel and the m6r marksman. Unlike every
// overworld hunter they acquire by GENUINE SIGHT ONLY — line of sight, within
// range, inside the sensor's forward cone — never by blind proximity, so a
// careful player can ghost past behind cover. Hardened: not reprogrammable.
// Their home is their muster post (they recharge standing at it). The fortress
// controller reads r.aggro off them to run its report-timer/alarm logic.
const M6_HP = 40;               // several sword-blows; a bow burst inside the report window still kills
const M6_PATROL_SPEED = 1.0;
const M6_CHASE_SPEED = 4.6;     // between your walk and sprint, same as a W1
const M6_PATROL_RANGE = 2.6;    // a tight loop around its muster post
const M6_VISION = 9;
const M6_CONE_DOT = 0.05;       // forward cone ~87° either side of facing
const M6_HIT_RANGE = 0.65;
const M6_HIT_DAMAGE = 14;
const M6_HIT_COOLDOWN = 1.0;
const M6R_HP = 28;              // the marksman is lighter-built
const M6R_RANGE = 7.5;          // holds and fires from here, W4-style
const M6R_MIN_RANGE = 4;
const M6R_FIRE_COOLDOWN = 1.9;
const M6R_DAMAGE = 8;
const M6_BODY = '#232833';      // gunmetal blue-black armour
const M6_HEAD = '#141821';
const M6R_BODY = '#2c2430';     // violet-tinged marksman
const M6R_HEAD = '#191320';

// Robots must never overlap: the minimum distance any two live (non-fused)
// machines are allowed to close to, enforced every tick after their own AI
// has moved them, so a swarm spreads out around its target instead of
// stacking on the same tile.
const ROBOT_MIN_SEP = 0.62;
const BUMP_DAMAGE = 2;     // a collision between two machines chips both of them
const BUMP_COOLDOWN = 1.5; // seconds before the same machine can be bump-hurt again
// CPU budget: robots this far (in tiles) from the player skip their AI and the
// pairwise separation entirely — they're well off-screen, can't affect the
// player, and simply freeze until the player comes near again. This is what
// keeps a large map cheap: only the handful of machines around the player
// think each frame, not every machine everywhere. Squared to avoid a sqrt.
const ACTIVE_RANGE = 42;
const ACTIVE_RANGE_SQ = ACTIVE_RANGE * ACTIVE_RANGE;
function nearPlayer(e, player) {
  const dx = e.x - player.x, dy = e.y - player.y;
  return dx * dx + dy * dy <= ACTIVE_RANGE_SQ;
}

// W3s: unarmed repair drones fielded by the W-factory. They walk straight to
// the nearest obelisk that's been damaged but not yet destroyed and mend it
// back to full over a few seconds, then disperse (the same generic death
// path scraps them if the player kills one first).
const W3_HP = 20;
const W3_SPEED = 3.0;
const W3_REPAIR_RANGE = 1.3;
const W3_REPAIR_RATE = 2;       // obDamage points healed per second
const W3_UNFREEZE_TIME = 3;     // seconds standing at a looped node to reset it

// Ubik confusion: a hunter that wanders into a brightened patch loses its
// mind for a while — refreshed continuously while inside, decaying once it
// leaves, so lingering in the patch keeps it scrambled rather than a single
// timed hit.
const UBIK_CONFUSE_HOLD = 2.5;      // seconds confusion persists after leaving a patch
const UBIK_CONFUSE_SPEED = 2.2;     // erratic stagger speed
const UBIK_CONFUSE_ATTACK_RANGE = 1.0;
const UBIK_CONFUSE_ATTACK_DAMAGE = 7;
const UBIK_CONFUSE_ATTACK_COOLDOWN = 0.9;
const W3_BODY = '#1c3a44';      // dull blue-teal, unmistakably not a hunter
const W3_HEAD = '#122730';

// W5s: unarmed gardener drones. Never dispatched in response to anything —
// the factory just fields one whenever there isn't already a live one out,
// so there's always roughly one somewhere on the map — and it does nothing
// but wander and, now and then, plant a sapling on open grass nearby. Never
// aggros, never fights back; the same generic death path scraps it like any
// other machine if the player decides to.
const W5_HP = 12;
const W5_SPEED = 1.1;            // a slow, unhurried drift
const W5_WANDER_RANGE = 6;       // local patrol radius around its current recentred "home"
const W5_RECENTER_INTERVAL = 10; // seconds between re-anchoring home to itself — an unbounded slow walk, not a fixed beat
const W5_PLANT_INTERVAL = 18;    // seconds between planting attempts
const W5_PLANT_JITTER = 14;
const W5_PLANT_RANGE = 3;        // how far from itself it'll look for a spot
const W5_BODY = '#243a1c';       // mossy green, reads as gardener not hunter
const W5_HEAD = '#16240f';

// Line-of-sight give-up: any hunting machine that can't see the player for
// this long stands down for a while (LOSE_INTEREST_COOLDOWN), during which
// normal proximity-based re-detection is suppressed — so ducking behind a
// wall or a hill for a few seconds is a real way to shake pursuit, not just
// a distance game. W1/W4 are dispatched already hunting with no patrol
// range of their own, so they get a plain re-acquire distance for coming
// back off cooldown.
const LOS_GIVEUP_AFTER = 6;
const LOSE_INTEREST_COOLDOWN = 5;
const HUNTER_REACQUIRE_RANGE = 14;
const HUNTER_WANDER_SPEED = 1.8;
const HUNTER_WANDER_RANGE = 6;

const STUCK_AFTER = 2;          // seconds of no progress while aggroed
const PROGRESS_FRACTION = 0.25; // moved less than this share of a full step counts as no progress
const SPAWN_MIN_R = 1.5;        // robots seat this far from their tower...
const SPAWN_MAX_R = 4;          // ...to about this far, expanding if crowded
const SPAWN_MAX_R_FALLBACK = 8;
const FACTORY_SPAWN_T = 0.75;  // seconds a factory-dispatched bot flickers in
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
const HP_FLEE_FRAC = 0.2;       // below this fraction of maxHp a machine breaks off to mend
const REPAIR_RATE = 1.5;        // hp per second at the charger — deliberately slow (a T2 from 20% is ~13s)

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
    bumpCooldown: 0,      // seconds before another machine colliding with this one can hurt it again
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

// A free, walkable tile hugging a tree within maxR of (ox, oy) — the T3's
// "nest" spot. Checks the four tiles orthogonally adjacent to each tree in
// range and keeps the closest free one; returns null if nothing qualifies,
// so the caller can fall back to the normal obelisk-ring seat.
function nearestTreeNest(map, ox, oy, maxR, used) {
  let best = null, bestD = Infinity;
  for (const o of map.objects) {
    if (o.type !== 'tree') continue;
    const d = Math.hypot(o.x - ox, o.y - oy);
    if (d > maxR) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const tx = o.x + dx, ty = o.y + dy;
      if (map.isSolid(tx, ty)) continue;
      if (map.heightAt && map.heightAt(tx, ty) < 0) continue;
      if (used.has(`${tx},${ty}`)) continue;
      if (d < bestD) { bestD = d; best = [tx, ty]; }
    }
  }
  return best;
}

// One T1 sentry per tower; every second tower also fields a T2 stalker.
export function spawnRobots(map, seed, obelisks, avoid) {
  const rng = makeRng(seed);
  const robots = [];
  const used = new Set();

  obelisks.forEach((ob, i) => {
    const wants = i % 2 === 1 ? ['t1', 't2'] : ['t1'];
    if (i % 6 === 5) wants.push('t3'); // rare: roughly one tower in six
    for (const type of wants) {
      let spot = seatNear(map, ob.x, ob.y, avoid, used, rng, SPAWN_MAX_R);
      if (!spot) continue; // tower stands in a dead corner: no machine
      if (type === 't3') {
        // Ambush unit: prefers to nest beside a nearby tree over the open
        // ring every other machine seats in, matching its "hides and waits"
        // behaviour. Best-effort — falls back to the normal seat if no tree
        // is close enough.
        const nest = nearestTreeNest(map, spot[0], spot[1], T3_NEST_SEARCH_R, used);
        if (nest) spot = nest;
      }
      used.add(`${spot[0]},${spot[1]}`);
      robots.push(baseRobot(type, spot[0], spot[1],
        type === 't1' ? T1_HP : type === 't3' ? T3_HP : T2_HP, rng));
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
    r.spawnT = FACTORY_SPAWN_T; // flicker into existence out of the factory
    // Evenly spread around the target angle-wise (plus a little jitter) so a
    // squad surrounds rather than stacks, and staggered attack/withdraw
    // phases so the wave doesn't hit and retreat in perfect unison.
    r.swarmAngle = (2 * Math.PI * i) / count + (rng() - 0.5) * 0.5;
    r.swarmSpin = 0.15 + rng() * 0.15;
    r.w1Phase = rng() < 0.5 ? 'attack' : 'withdraw';
    r.w1PhaseT = 1 + rng() * (r.w1Phase === 'attack' ? W1_ATTACK_TIME : W1_WITHDRAW_TIME);
    squad.push(r);
  }
  return squad;
}

// A W4 laser hunter-killer, dispatched from the factory the instant the
// player attacks an obelisk. `seed` should vary per call.
export function spawnW4(map, seed, fx, fy) {
  const rng = makeRng(seed >>> 0);
  const used = new Set();
  const avoid = { x: fx, y: fy, r: 0 };
  const spot = seatNear(map, fx, fy, avoid, used, rng, SPAWN_MAX_R_FALLBACK);
  if (!spot) return null;
  const r = baseRobot('w4', spot[0], spot[1], W4_HP, rng);
  r.aggro = true;
  r.spawnT = FACTORY_SPAWN_T;
  return r;
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
  const r = baseRobot('w3', spot[0], spot[1], W3_HP, rng);
  r.spawnT = FACTORY_SPAWN_T;
  return r;
}

// One gardener drone off the factory floor. No target, no urgency — it just
// starts wandering from wherever it's seated.
export function spawnW5(map, seed, fx, fy) {
  const rng = makeRng(seed >>> 0);
  const used = new Set();
  const avoid = { x: fx, y: fy, r: 0 };
  const spot = seatNear(map, fx, fy, avoid, used, rng, SPAWN_MAX_R_FALLBACK);
  if (!spot) return null;
  const r = baseRobot('w5', spot[0], spot[1], W5_HP, rng);
  r.spawnT = FACTORY_SPAWN_T;
  return r;
}

// One fortress guard seated at its muster post (mx, my). `ranged` picks the
// m6r marksman variant. `fromFactory` adds the materialisation flicker for
// alarm-wave dispatches; the standing patrol spawns without it.
export function spawnM6(map, seed, mx, my, ranged = false, fromFactory = false) {
  const rng = makeRng(seed >>> 0);
  const used = new Set();
  const avoid = { x: mx, y: my, r: 0 };
  const spot = seatNear(map, Math.floor(mx), Math.floor(my), avoid, used, rng, SPAWN_MAX_R_FALLBACK);
  if (!spot) return null;
  const r = baseRobot(ranged ? 'm6r' : 'm6', spot[0], spot[1], ranged ? M6R_HP : M6_HP, rng);
  r.hardened = true; // cannot be reprogrammed — drain one and it's only scrap
  if (fromFactory) r.spawnT = FACTORY_SPAWN_T;
  return r;
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
  const dirX = dx / len, dirY = dy / len;
  // A height difference between here and the next tile over is a slope —
  // climbing or descending it costs effort, same as it costs the player
  // stamina, so movement slows crossing it either way. T1's own collision
  // rule already refuses to climb at all, so this only ever bites T1 going
  // downhill; every other type can cross a one-level step in either
  // direction and slows for it.
  if (map.heightAt) {
    const h0 = map.heightAt(Math.floor(r.x), Math.floor(r.y));
    const h1 = map.heightAt(Math.floor(r.x + dirX), Math.floor(r.y + dirY));
    if (h1 !== h0) speed *= SLOPE_SPEED_MULT;
  }
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
// so one trapped below its charger drains flat instead. The charger mends
// the chassis too, at a much slower rate than it fills the battery — a
// machine that fled the fight badly damaged (see the low-HP break-off in
// updateRobots) is out of the picture for a genuinely long beat, not just
// the few seconds a battery top-up takes. It only returns to its rounds
// once BOTH are fully restored.
function updateRecharge(r, dt, map) {
  const dHome = Math.hypot(r.home.x - r.x, r.home.y - r.y);
  if (dHome <= RECHARGE_RANGE) {
    r.battery = Math.min(BATTERY_MAX, r.battery + RECHARGE_RATE * dt);
    r.hp = Math.min(r.maxHp, r.hp + REPAIR_RATE * dt);
    if (r.battery >= BATTERY_MAX && r.hp >= r.maxHp) {
      r.recharging = false; // topped up and mended: back to the rounds
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

    // Materialising out of the factory: tick down the flicker timer. The bot
    // still moves and fights normally while it fades in.
    if (r.spawnT > 0) r.spawnT = Math.max(0, r.spawnT - dt);

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
      // Every destroyed machine sheds a chip fragment — collect eight and you
      // can craft a whole access chip. Offset a touch so it doesn't stack
      // exactly on the scrap heap.
      map.groundItems.push({ item: 'chip_fragment', qty: 1, x: r.x + 0.25, y: r.y - 0.2 });
      // A T1 very rarely carries an OB-gun — a prize find (deterministic from
      // its wreck position so it isn't reload-farmable).
      if (r.type === 't1' && (scrapQty(r.x * 1.7 + 3, r.y * 2.3 + 1) & 7) === 0
        && ((Math.floor(r.x * 31 + r.y * 17)) % 20 === 0)) {
        map.groundItems.push({ item: 'obgun', qty: 1, x: r.x, y: r.y });
        map.groundItems.push({ item: 'battery', qty: 4, x: r.x + 0.3, y: r.y });
      }
      // A W4 is the toughest thing the factory builds — bringing one down is
      // a proper win, so it drops a generous spoil of war on top of the
      // usual scrap: a stack of batteries and bonus scrap. A wreck only ever
      // sheds what the machine actually carried — a laser platform holds
      // cells and boards, not ordnance (it never threw a bomb in its life,
      // so it doesn't drop one in death); rarely its targeting boards
      // survive as extra chip fragments, deterministic from the wreck spot.
      if (r.type === 'w4') {
        map.groundItems.push({ item: 'battery', qty: 6, x: r.x + 0.3, y: r.y });
        map.groundItems.push({ item: 'scrap', qty: 4, x: r.x - 0.3, y: r.y - 0.2 });
        if (Math.floor(r.x * 53 + r.y * 29) % 5 === 0) {
          map.groundItems.push({ item: 'chip_fragment', qty: 2, x: r.x, y: r.y + 0.3 });
        }
      }
      continue;
    }

    // RON-ML `loop`: an infinite loop pinned into its home obelisk holds the
    // whole garrison dead still — no movement, no attack, no thinking — even
    // its idle animation stops, until a repair drone resets the node
    // (updateW3 below clears both this and frozenByOb).
    if (r.frozen) continue;

    // Ubik: standing in a brightened patch scrambles a hunter's mind —
    // refreshed continuously while inside so lingering keeps it confused,
    // decaying for a while after it wanders (or staggers) back out. Unarmed
    // W3/W5 drones and reprogrammed friendlies are unaffected.
    if (!r.friendly && r.type !== 'w3' && r.type !== 'w5' && map.ubikPatches && map.ubikPatches.length
      && map.ubikPatches.some((p) => Math.hypot(p.x - r.x, p.y - r.y) < (p.r || 3))) {
      r.ubikConfusedT = UBIK_CONFUSE_HOLD;
    } else if (r.ubikConfusedT > 0) {
      r.ubikConfusedT = Math.max(0, r.ubikConfusedT - dt);
    }
    if (r.ubikConfusedT > 0) {
      updateUbikConfused(r, dt, robots, map);
      r.animT += dt;
      continue;
    }

    // Off-screen and far from the player: skip all thinking until they come
    // back near. Friendlies follow the player so are never far; they're left
    // to update normally. (Placed after the death check above so a machine
    // killed at range still drops its scrap.)
    if (!r.friendly && !nearPlayer(r, player)) continue;

    // Stunned: frozen in place, battery preserved. Only the timer and the
    // amber flicker phase advance; on expiry normal AI resumes next frame
    // (and aggros at once if the player is still in range).
    if (r.disabledT > 0) {
      r.disabledT = Math.max(0, r.disabledT - dt);
      r.animT += dt;
      continue;
    }

    // Knocked back by a solid hit: frozen (no movement, no attack) for a
    // beat, same as the shove the player's strike just gave it — stops it
    // trading blows nose-to-nose the instant it's been hit.
    if (r.knockT > 0) {
      r.knockT = Math.max(0, r.knockT - dt);
      r.animT += dt;
      continue;
    }

    // RON-ML `repel`: targeting inverted for a spell — it flees the player
    // instead of hunting, overriding normal AI until the effect wears off.
    if (r.repelledT > 0) {
      r.repelledT = Math.max(0, r.repelledT - dt);
      const d = distTo(r, player);
      const ax = d > 1e-6 ? (r.x - player.x) / d : 1;
      const ay = d > 1e-6 ? (r.y - player.y) / d : 0;
      moveToward(r, r.x + ax * 3, r.y + ay * 3, REPEL_FLEE_SPEED, dt, map);
      r.animT += dt;
      continue;
    }

    // RON-ML `sing`: the Portal easter egg — lines up facing the player and
    // performs its bit, then simply goes back to work (no longer powers down
    // for good; it drops aggro and resumes its normal patrol/hunt).
    if (r.singing) {
      r.choirT -= dt;
      moveToward(r, r.choirX, r.choirY, REPEL_FLEE_SPEED, dt, map);
      const dx = player.x - r.x, dy = player.y - r.y, dd = Math.hypot(dx, dy) || 1;
      r.facing = { x: dx / dd, y: dy / dd };
      r.animT += dt;
      if (r.choirT <= 0) {
        r.singing = false;
        r.aggro = false;
        r.loseInterestT = LOSE_INTEREST_COOLDOWN; // a beat before it re-acquires
      }
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
    // Critically damaged (below HP_FLEE_FRAC of maxHp): same retreat — the
    // machine values its own chassis and limps home to mend at the charger,
    // slowly (see updateRecharge/REPAIR_RATE), before rejoining the fight.
    // Zombies are excluded: an OB-corrupted machine has no self-preservation
    // left in it.
    if (r.battery < BATTERY_LOW || (!r.zombie && r.hp < r.maxHp * HP_FLEE_FRAC)) {
      r.recharging = true;
      r.aggro = false;
      r.stuck = false;
      r.noProgressT = 0;
      r.returning = false;
      updateRecharge(r, dt, map);
      continue;
    }

    // Losing line of sight for long enough breaks off the hunt regardless
    // of type or distance; see LOS_GIVEUP_AFTER above.
    if (r.aggro && r.type !== 'w3') {
      const canSee = map.hasLineOfSight(r.x, r.y, player.x, player.y);
      r.losLostT = canSee ? 0 : (r.losLostT || 0) + dt;
      if (r.losLostT > LOS_GIVEUP_AFTER) {
        r.aggro = false;
        r.losLostT = 0;
        r.loseInterestT = LOSE_INTEREST_COOLDOWN;
        if (r.type !== 't1') r.returning = true; // head back toward home/tower/factory
      }
    } else if (r.loseInterestT > 0) {
      r.loseInterestT = Math.max(0, r.loseInterestT - dt);
    }

    if (r.type === 't1') updateT1(r, dt, player, map);
    else if (r.type === 't3') updateT3(r, dt, player, map);
    else if (r.type === 'w1') updateW1(r, dt, player, map);
    else if (r.type === 'w3') updateW3(r, dt, map, robots);
    else if (r.type === 'w4') updateW4(r, dt, player, map);
    else if (r.type === 'w5') updateW5(r, dt, map);
    else if (r.type === 'm6' || r.type === 'm6r') updateM6(r, dt, player, map);
    else updateT2(r, dt, player, map);
  }
  separateRobots(robots, map, dt, player);
}

// No two live machines may occupy (near enough) the same tile: after every
// robot's own AI has moved it this tick, push apart any pair that ended up
// too close. Fused wrecks are static scenery and are left alone; O(n^2) is
// fine at the handful of robots this game ever has active at once.
// Several relaxation passes, not one: with three or more machines crowded
// onto nearly the same point (e.g. a squad triangulated straight onto the
// player), a single pairwise pass can't fully resolve every overlap at once
// and the AI's own pull each frame would otherwise out-muscle it. A handful
// of cheap iterations converges to a clean spread instead.
const SEPARATION_PASSES = 4;
function separateRobots(robots, map, dt, player) {
  for (const r of robots) {
    if (r.bumpCooldown > 0) r.bumpCooldown = Math.max(0, r.bumpCooldown - dt);
  }
  // Only robots near the player can overlap in a way that matters (and only
  // they moved this frame — the rest were culled). Resolving separation over
  // just this subset turns the O(n^2) pass from all-machines-on-the-map into
  // a handful, which is the whole point of the culling.
  const active = robots.filter((r) => !r.dead && !r.fused && (!player || nearPlayer(r, player)));
  for (let pass = 0; pass < SEPARATION_PASSES; pass++) {
    let moved = false;
    for (let i = 0; i < active.length; i++) {
      const a = active[i];
      if (a.dead || a.fused) continue;
      for (let j = i + 1; j < active.length; j++) {
        const b = active[j];
        if (b.dead || b.fused) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= ROBOT_MIN_SEP) continue;
        moved = true;
        // A collision hurts both machines, gated by their own cooldown so a
        // pair jammed together for several frames (or several relaxation
        // passes within the same frame) chips away rather than melting
        // instantly. Only checked on the first pass — later passes this same
        // frame are just finishing the push-apart, not a fresh collision.
        if (pass === 0 && a.bumpCooldown <= 0 && b.bumpCooldown <= 0) {
          a.hp -= BUMP_DAMAGE; a.hurt = true;
          b.hp -= BUMP_DAMAGE; b.hurt = true;
          a.bumpCooldown = BUMP_COOLDOWN;
          b.bumpCooldown = BUMP_COOLDOWN;
          (map.sparks ??= []).push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, ttl: 0.3, max: 0.3 });
        }
        // Nearly coincident: no meaningful direction to push along, so pick
        // one from their (deterministic) index difference rather than divide
        // by ~0.
        const nx = d > 1e-4 ? dx / d : ((i + j) % 2 === 0 ? 1 : -1);
        const ny = d > 1e-4 ? dy / d : ((i + j) % 2 === 0 ? 0 : 1);
        const push = (ROBOT_MIN_SEP - d) * 0.5 + 0.01;
        moveAxis(a, -nx * push, -ny * push, map);
        moveAxis(b, nx * push, ny * push, map);
      }
    }
    if (!moved) break;
  }
}

// Ubik confusion: no targeting, no patrol — just a drunk stagger toward a
// fresh small random point every beat, and taking a swing at whatever other
// machine strays close, friend or foe alike (there's no "foe" distinction
// left in its head at all). Battery still drains at the normal patrol rate
// (drainBattery is called by the caller's usual paths before this, or not
// at all here — a confused unit is still "on", just not doing its job, so
// it isn't worth draining faster or slower than idling normally would).
function updateUbikConfused(r, dt, robots, map) {
  r.aggro = false;
  r._confuseWanderT = (r._confuseWanderT || 0) - dt;
  if (r._confuseWanderT <= 0 || !r._confuseTarget) {
    r._confuseWanderT = 0.35 + Math.random() * 0.5;
    const a = Math.random() * Math.PI * 2;
    r._confuseTarget = { x: r.x + Math.cos(a) * 1.6, y: r.y + Math.sin(a) * 1.6 };
  }
  moveToward(r, r._confuseTarget.x, r._confuseTarget.y, UBIK_CONFUSE_SPEED, dt, map);
  r._confuseAttackTimer = Math.max(0, (r._confuseAttackTimer || 0) - dt);
  if (r._confuseAttackTimer <= 0) {
    for (const other of robots) {
      if (other === r || other.dead || other.fused || other.friendly) continue;
      if (Math.hypot(other.x - r.x, other.y - r.y) > UBIK_CONFUSE_ATTACK_RANGE) continue;
      other.hp -= UBIK_CONFUSE_ATTACK_DAMAGE;
      other.hurt = true;
      other.knockT = Math.max(other.knockT || 0, 0.3);
      (map.sparks ??= []).push({ x: other.x, y: other.y, ttl: 0.35, max: 0.35 });
      r._confuseAttackTimer = UBIK_CONFUSE_ATTACK_COOLDOWN;
      break;
    }
  }
}

function updateT1(r, dt, player, map) {
  r.attackTimer = Math.max(0, r.attackTimer - dt);

  const d = distTo(r, player);
  const ease = player.threatEase ? player.threatEase() : 1;
  if (!r.aggro && d < T1_DETECT_RANGE * ease && !(r.loseInterestT > 0)) r.aggro = true; // no line of sight needed to notice
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
      player.takeDamage(T1_HIT_DAMAGE * ease, 'machine');
    }
  } else {
    r.noProgressT = 0;
    r.stuck = false;
    patrol(r, T1_PATROL_SPEED, T1_PATROL_RANGE, dt, map);
  }
}

// A dual-beam volley from both eyes at once — visually two bolts (orange,
// not the red every other shooter uses), but resolved as a single hit for
// roughly double a W4 bolt, same shield/mirror handling as W4's fire.
function fireT3Lasers(r, player, map, ease) {
  const perp = { x: -r.facing.y, y: r.facing.x };
  for (const o of [-0.18, 0.18]) {
    (map.projectiles ??= []).push({
      x0: r.x + perp.x * o, y0: r.y + perp.y * o,
      x1: player.x, y1: player.y, prog: 0, kind: 'laser_t3',
    });
  }
  const block = player.blockRangedShot ? player.blockRangedShot(r.x, r.y) : null;
  if (block === 'reflect') {
    r.hp -= 999; r.hurt = true;
    for (let s = 0; s < 5; s++) (map.sparks ??= []).push({ x: r.x + (s - 2) * 0.15, y: r.y + (s % 2) * 0.2, ttl: 0.35, max: 0.35 });
    map.projectiles.push({ x0: player.x, y0: player.y, x1: r.x, y1: r.y, prog: 0, kind: 'laser_t3' });
  } else if (!block) {
    player.takeDamage(T3_LASER_DAMAGE * ease, 'machine');
  }
}

// A tactical ambusher, not a chaser: it nests beside a tree near its tower
// (see spawnRobots) and stays there — no blind proximity detection like a
// T1/T2, it has to actually get a clear line of sight before it counts as
// noticing you at all. Once it has, it holds its ground and fires rather
// than closing in, backing off only enough to keep a shot lined up if you
// press it, same shape as a W4 but far heavier per hit and far slower to
// recover — a single missed dodge costs a lot more than a W4 bolt does.
function updateT3(r, dt, player, map) {
  r.attackTimer = Math.max(0, r.attackTimer - dt);
  const ease = player.threatEase ? player.threatEase() : 1;

  if (r.returning) {
    moveToward(r, r.home.x, r.home.y, T3_RETURN_SPEED, dt, map);
    if (Math.hypot(r.home.x - r.x, r.home.y - r.y) < 1) r.returning = false;
    return;
  }

  drainBattery(r, r.aggro ? DRAIN_CHASE : DRAIN_PATROL, dt);
  if (r.drained) return;

  const d = distTo(r, player);
  const canSee = map.hasLineOfSight(r.x, r.y, player.x, player.y);

  if (!r.aggro) {
    if (d < T3_AMBUSH_RANGE * ease && canSee) {
      r.aggro = true;
    } else {
      patrol(r, T3_PATROL_SPEED, T3_PATROL_RANGE, dt, map); // barely stirs from its nest
      return;
    }
  }

  if (d > 1e-4) r.facing = { x: (player.x - r.x) / d, y: (player.y - r.y) / d };

  // Camped: unlike a W4 it never chases to open a shot, only nudges back if
  // you crowd it — and even then it'll claw rather than retreat forever.
  if (d < T3_MIN_RANGE && d > T3_HIT_RANGE) {
    const dx = r.x - player.x, dy = r.y - player.y;
    moveToward(r, r.x + (dx / d) * 2, r.y + (dy / d) * 2, T3_RETREAT_SPEED, dt, map);
  }

  if (d < T3_HIT_RANGE && r.attackTimer <= 0) {
    r.attackTimer = T3_HIT_COOLDOWN;
    player.takeDamage(T3_HIT_DAMAGE * ease, 'machine');
    return;
  }

  if (d <= T3_AMBUSH_RANGE * ease && canSee && r.attackTimer <= 0) {
    r.attackTimer = T3_FIRE_COOLDOWN;
    fireT3Lasers(r, player, map, ease);
  }
}

function updateT2(r, dt, player, map) {
  r.attackTimer = Math.max(0, r.attackTimer - dt);

  const d = distTo(r, player);
  const ease = player.threatEase ? player.threatEase() : 1;
  if (!r.aggro && d < T2_DETECT_RANGE * ease && !(r.loseInterestT > 0)) {
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
      player.takeDamage(T2_HIT_DAMAGE * ease, 'machine');
    }
  } else if (r.returning) {
    moveToward(r, r.home.x, r.home.y, T2_RETURN_SPEED, dt, map);
    if (Math.hypot(r.home.x - r.x, r.home.y - r.y) < 1) r.returning = false;
  } else {
    patrol(r, T2_PATROL_SPEED, T2_PATROL_RANGE, dt, map);
  }
}

// A W1 revenge-squad hunter: spawned already aggroed, no detection phase.
// It cycles attack (close in and strike) and withdraw (fall back) phases, so
// a squad hits in waves rather than a single relentless charge, and it tracks
// a position triangulated from the obelisk network — refreshed every couple
// of seconds rather than live, so it still finds you (laggily) even behind a
// jammed Wi-Fi block that blinds every other machine. Losing line of sight
// for long enough (handled generically in updateRobots) breaks it off the
// hunt like any other machine — it heads back toward the crater, wanders,
// and re-acquires by plain distance once its cooldown expires.
function updateW1(r, dt, player, map) {
  r.attackTimer = Math.max(0, r.attackTimer - dt);
  const ease = player.threatEase ? player.threatEase() : 1;
  drainBattery(r, r.aggro ? DRAIN_CHASE : DRAIN_PATROL, dt);
  if (r.drained) return;

  if (!r.aggro) {
    if (!(r.loseInterestT > 0) && Math.hypot(player.x - r.x, player.y - r.y) < HUNTER_REACQUIRE_RANGE * ease) {
      r.aggro = true;
    } else if (r.returning) {
      moveToward(r, r.home.x, r.home.y, W1_CHASE_SPEED * 0.5, dt, map);
      if (Math.hypot(r.home.x - r.x, r.home.y - r.y) < 1) r.returning = false;
      return;
    } else {
      patrol(r, HUNTER_WANDER_SPEED, HUNTER_WANDER_RANGE, dt, map);
      return;
    }
  }

  r.w1PhaseT -= dt;
  if (r.w1PhaseT <= 0) {
    if (r.w1Phase === 'attack') { r.w1Phase = 'withdraw'; r.w1PhaseT = W1_WITHDRAW_TIME + r.rng() * 2; }
    else { r.w1Phase = 'attack'; r.w1PhaseT = W1_ATTACK_TIME + r.rng() * 3; }
  }

  r._triangT = (r._triangT ?? 0) - dt;
  if (r._triangT <= 0) {
    r._triangT = W1_TRIANGULATE_EVERY + r.rng() * 1.5;
    r.lastKnown = { x: player.x, y: player.y };
  }
  const target = r.lastKnown || { x: player.x, y: player.y };

  r.swarmAngle += r.swarmSpin * dt;
  const standoff = r.w1Phase === 'attack' ? W1_ATTACK_STANDOFF : W1_WITHDRAW_RANGE;
  const tx = target.x + Math.cos(r.swarmAngle) * standoff;
  const ty = target.y + Math.sin(r.swarmAngle) * standoff;
  moveToward(r, tx, ty, W1_CHASE_SPEED, dt, map);

  // Damage always checks the real, live distance (not distTo, which a Wi-Fi
  // block forces to Infinity) — triangulation gets the squad close, but a hit
  // still requires the machine to actually be standing next to you.
  const realD = Math.hypot(player.x - r.x, player.y - r.y);
  if (r.w1Phase === 'attack' && realD < W1_HIT_RANGE && r.attackTimer <= 0) {
    r.attackTimer = W1_HIT_COOLDOWN;
    player.takeDamage(W1_HIT_DAMAGE * ease, 'machine');
  }
}

// A W3 repair drone: unarmed, never aggros, walks to the nearest obelisk
// with obDamage > 0 (hit by an OB-gun but not yet toppled) and heals it back
// to zero over a few seconds, then disperses — its job done.
// A repairable obelisk is damaged-but-standing (hit by an OB-gun), one felled
// during the SKYLINK purge and flagged `needsRebuild` (the drone raises that
// one from its heap back into a working tower), or one pinned by a RON-ML
// `loop` hack (frozen — the drone works the loop back out instead).
function w3Repairable(o) {
  return o.type === 'obelisk' && ((!o.destroyed && o.obDamage > 0) || (o.destroyed && o.needsRebuild) || o.frozen);
}
function updateW3(r, dt, map, robots) {
  r.aggro = false;
  if (!r.repairTarget || !w3Repairable(r.repairTarget)) {
    let best = null, bestD = Infinity;
    for (const o of map.objects) {
      if (!w3Repairable(o)) continue;
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
  // Frozen by a RON-ML `loop` hack: hold position and work the loop back out
  // over a few seconds, releasing the node and every robot it pinned before
  // falling through to any ordinary damage repair below (both can be true
  // at once — a looped tower can also be scorched).
  if (ob.frozen) {
    ob.frozenResetT = (ob.frozenResetT || 0) + dt;
    if (ob.frozenResetT >= W3_UNFREEZE_TIME) {
      ob.frozen = false;
      ob.frozenT = 0;
      ob.frozenResetT = 0;
      if (robots) for (const other of robots) if (other.frozenByOb === ob) { other.frozen = false; other.frozenByOb = null; }
    }
  }
  // A felled tower starts its rebuild from full damage; a merely-scorched one
  // from wherever its obDamage sits. Either way, healing obDamage to zero
  // finishes the job.
  if (ob.destroyed && ob.needsRebuild && !(ob.obDamage > 0)) ob.obDamage = 5;
  if (ob.obDamage > 0) {
    ob.obDamage = Math.max(0, ob.obDamage - W3_REPAIR_RATE * dt);
    ob.burning = 0;
  }
  if (!(ob.obDamage > 0) && !ob.frozen) {
    if (ob.destroyed && ob.needsRebuild) {
      // Raise it: standing and solid again, so the SKYLINK web can relight.
      ob.destroyed = false;
      ob.needsRebuild = false;
      map.objectGrid[ob.y * map.w + ob.x] = ob;
    }
    r.repairTarget = null;
    r.dead = true;
  }
}

// A W5 gardener drone: no destination, no urgency. It drifts on an
// unbounded slow random walk (patrol() around a "home" that's periodically
// re-anchored to wherever it currently is, rather than a fixed tower), and
// every so often plants a sapling on a nearby patch of open grass — reusing
// the same `grow` field the ambient forest-regrowth timer in main.js uses,
// so a planted sapling thickens up over the same ~minute. Never aggros,
// never fights back.
function updateW5(r, dt, map) {
  r.aggro = false;
  drainBattery(r, DRAIN_PATROL, dt);
  if (r.drained) return;
  patrol(r, W5_SPEED, W5_WANDER_RANGE, dt, map);
  r._recenterT = (r._recenterT || 0) - dt;
  if (r._recenterT <= 0) {
    r._recenterT = W5_RECENTER_INTERVAL;
    r.home = { x: r.x, y: r.y };
  }
  r._plantT = (r._plantT || W5_PLANT_INTERVAL) - dt;
  if (r._plantT <= 0) {
    r._plantT = W5_PLANT_INTERVAL + Math.random() * W5_PLANT_JITTER;
    for (let attempt = 0; attempt < 8; attempt++) {
      const tx = Math.floor(r.x + (Math.random() - 0.5) * 2 * W5_PLANT_RANGE);
      const ty = Math.floor(r.y + (Math.random() - 0.5) * 2 * W5_PLANT_RANGE);
      if (map.floorAt(tx, ty) === 'grass' && !map.objectAt(tx, ty) && (!map.heightAt || map.heightAt(tx, ty) === 0)) {
        map.addObject('tree', tx, ty, { variant: Math.floor(Math.random() * 3), grow: 0.15 });
        break;
      }
    }
  }
}

// A W4 laser hunter-killer: holds at range and fires rather than closing to
// melee, backing off if the player gets within its minimum range so it
// always keeps a clear line to shoot down. Losing line of sight (a wall or
// a hill in the way) for LOS_GIVEUP_AFTER seconds straight (generic, in
// updateRobots) makes it give up and head back to the factory instead of
// homing in on a memorised spot forever; taking a hit while it's giving up
// snaps it right back into the fight.
function updateW4(r, dt, player, map) {
  r.attackTimer = Math.max(0, r.attackTimer - dt);
  const ease = player.threatEase ? player.threatEase() : 1;
  drainBattery(r, r.aggro ? DRAIN_CHASE : DRAIN_PATROL, dt);
  if (r.drained) return;

  if (!r.aggro) {
    // Given up (generic line-of-sight give-up in updateRobots): head back
    // to the factory and wander, re-acquiring by plain distance once its
    // cooldown expires.
    if (!(r.loseInterestT > 0) && distTo(r, player) < HUNTER_REACQUIRE_RANGE * ease) {
      r.aggro = true;
    } else if (r.returning) {
      moveToward(r, r.home.x, r.home.y, W4_SPEED * 0.6, dt, map);
      if (Math.hypot(r.home.x - r.x, r.home.y - r.y) < 1) r.returning = false;
      return;
    } else {
      patrol(r, HUNTER_WANDER_SPEED, HUNTER_WANDER_RANGE, dt, map);
      return;
    }
  }

  const d = distTo(r, player);
  const canSee = map.hasLineOfSight(r.x, r.y, player.x, player.y);
  // With the player's shield or forcefield up, plinking from a safe distance
  // is useless — so the hunter stops holding at range and bears down, closing
  // right in and staying on the player rather than backing off. It still fires
  // if it gets a clear line (the shield might drop; a mirror shield will
  // destroy it as it fires — the price of pressing a shielded target).
  const pressShielded = !player.invisibleToRobots && player.shielded && player.shielded();
  if (pressShielded) {
    if (d > 1.3) moveToward(r, player.x, player.y, W4_SPEED, dt, map);
  } else if (d > W4_RANGE) {
    moveToward(r, player.x, player.y, W4_SPEED, dt, map);
  } else if (d < W4_MIN_RANGE && d > 1e-4) {
    const dx = r.x - player.x, dy = r.y - player.y;
    moveToward(r, r.x + (dx / d) * 2, r.y + (dy / d) * 2, W4_SPEED, dt, map);
  }
  if (d <= W4_RANGE && d > 1e-4 && canSee) {
    r.facing = { x: (player.x - r.x) / d, y: (player.y - r.y) / d };
    if (r.attackTimer <= 0) {
      r.attackTimer = W4_FIRE_COOLDOWN;
      (map.projectiles ??= []).push({ x0: r.x, y0: r.y, x1: player.x, y1: player.y, prog: 0, kind: 'laser' });
      // A shield or forcefield can stop the bolt; a mirror shield throws it
      // straight back and hurts the shooter.
      const block = player.blockRangedShot ? player.blockRangedShot(r.x, r.y) : null;
      if (block === 'reflect') {
        // A mirror shield throws the bolt straight back and destroys the shooter.
        r.hp -= 999; r.hurt = true;
        for (let s = 0; s < 5; s++) (map.sparks ??= []).push({ x: r.x + (s - 2) * 0.15, y: r.y + (s % 2) * 0.2, ttl: 0.35, max: 0.35 });
        map.projectiles.push({ x0: player.x, y0: player.y, x1: r.x, y1: r.y, prog: 0, kind: 'laser' });
      } else if (!block) {
        player.takeDamage(W4_DAMAGE * ease, 'machine');
      }
    }
  }
}

// ---- M6 fortress guards ----------------------------------------------------

// Sight test: LOS + vision range + the sensor's forward cone. A jammed Wi-Fi
// block blinds it entirely (being struck still wakes it, via the generic hurt
// handling in updateRobots).
function m6Sees(r, player, map) {
  if (player.invisibleToRobots) return false;
  const d = Math.hypot(player.x - r.x, player.y - r.y);
  if (d > M6_VISION || d < 1e-4) return false;
  if (!map.hasLineOfSight(r.x, r.y, player.x, player.y)) return false;
  const dot = ((player.x - r.x) / d) * r.facing.x + ((player.y - r.y) / d) * r.facing.y;
  return dot > M6_CONE_DOT;
}

function updateM6(r, dt, player, map) {
  r.attackTimer = Math.max(0, r.attackTimer - dt);
  const ease = player.threatEase ? player.threatEase() : 1;
  drainBattery(r, r.aggro ? DRAIN_CHASE : DRAIN_PATROL, dt);
  if (r.drained) return;

  if (!r.aggro) {
    if (!(r.loseInterestT > 0) && m6Sees(r, player, map)) {
      r.aggro = true; // spotted — the fortress controller starts its report clock
    } else if (r.returning) {
      moveToward(r, r.home.x, r.home.y, M6_CHASE_SPEED * 0.5, dt, map);
      if (Math.hypot(r.home.x - r.x, r.home.y - r.y) < 1) r.returning = false;
      return;
    } else {
      patrol(r, M6_PATROL_SPEED, M6_PATROL_RANGE, dt, map);
      return;
    }
  }

  const d = distTo(r, player);
  if (r.type === 'm6r') {
    // The marksman: hold firing range, back off if crowded, fire on a clear
    // line — the W4 pattern with a lighter bolt.
    const canSee = map.hasLineOfSight(r.x, r.y, player.x, player.y);
    if (d > M6R_RANGE) {
      moveToward(r, player.x, player.y, M6_CHASE_SPEED, dt, map);
    } else if (d < M6R_MIN_RANGE && d > 1e-4) {
      const dx = r.x - player.x, dy = r.y - player.y;
      moveToward(r, r.x + (dx / d) * 2, r.y + (dy / d) * 2, M6_CHASE_SPEED, dt, map);
    }
    if (d <= M6R_RANGE && d > 1e-4 && canSee) {
      r.facing = { x: (player.x - r.x) / d, y: (player.y - r.y) / d };
      if (r.attackTimer <= 0) {
        r.attackTimer = M6R_FIRE_COOLDOWN;
        (map.projectiles ??= []).push({ x0: r.x, y0: r.y, x1: player.x, y1: player.y, prog: 0, kind: 'laser' });
        const block = player.blockRangedShot ? player.blockRangedShot(r.x, r.y) : null;
        if (block === 'reflect') {
          r.hp -= 999; r.hurt = true;
          map.projectiles.push({ x0: player.x, y0: player.y, x1: r.x, y1: r.y, prog: 0, kind: 'laser' });
        } else if (!block) {
          player.takeDamage(M6R_DAMAGE * ease, 'machine');
        }
      }
    }
    return;
  }

  // The heavy sentinel: run the player down and strike. Damage checks the
  // real, live distance (not distTo, which a Wi-Fi block forces to Infinity).
  if (d > M6_HIT_RANGE * 0.8) moveToward(r, player.x, player.y, M6_CHASE_SPEED, dt, map);
  const realD = Math.hypot(player.x - r.x, player.y - r.y);
  if (realD < M6_HIT_RANGE && r.attackTimer <= 0) {
    r.attackTimer = M6_HIT_COOLDOWN;
    player.takeDamage(M6_HIT_DAMAGE * ease, 'machine');
  }
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
  // Singing (RON-ML sing): the red light pulses in time with the choir. Each
  // machine is on a different vocal part (r.choirFlash, set in main from the
  // music), so the row of lights blinks out of step — a choir, not a metronome.
  if (r.singing) {
    const f = r.choirFlash || 0;
    const g = Math.round(18 + 62 * f), b = Math.round(14 + 46 * f);
    return { fill: `rgb(255,${g},${b})`, halo: f > 0.25 ? `rgba(255,70,50,${(0.18 + 0.42 * f).toFixed(3)})` : null };
  }
  if (r.friendly) return { fill: EYE_FRIEND, halo: EYE_FRIEND_HALO };
  return { fill: r.aggro ? EYE_HOT : EYE_DIM, halo: r.aggro ? 'rgba(255,59,42,0.3)' : null };
}

// T3's own sensor tell: every special case (drained, stunned, singing,
// friendly) stays identical to every other machine, but the plain aggro/idle
// fallback is orange instead of red, so its threat reads as distinct from a
// T1/T2/W1/W4 at a glance.
function t3SensorStyle(r) {
  const s = sensorStyle(r);
  if (!s) return s;
  if (s.fill === EYE_HOT) return { fill: T3_EYE_HOT, halo: 'rgba(255,138,30,0.32)' };
  if (s.fill === EYE_DIM) return { fill: T3_EYE_DIM, halo: null };
  return s;
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
  // Factory materialisation: flicker in from nothing over FACTORY_SPAWN_T.
  let flickered = false;
  if (robot.spawnT > 0) {
    const base = 1 - robot.spawnT / FACTORY_SPAWN_T;          // 0 -> 1 fade-in
    const buzz = 0.55 + 0.45 * Math.abs(Math.sin(performance.now() / 45));
    ctx.save();
    ctx.globalAlpha = Math.max(0.08, Math.min(1, base * buzz));
    flickered = true;
  }
  const c = worldToScreen(robot.x, robot.y);
  if (robot.zombie) {
    // A sickly green halo: the tell that only a bow or the wave gun works.
    ctx.fillStyle = 'rgba(120,255,90,0.28)';
    ctx.beginPath();
    ctx.ellipse(c.x, c.y - 14, 16, 18, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Ubik confusion: the whole body juddering in place, on top of whatever
  // spin/twitch drawT1/drawT2 add themselves — reads as haywire rather than
  // just tilted.
  const jc = robot.ubikConfusedT > 0
    ? { x: c.x + (Math.random() - 0.5) * 5, y: c.y + (Math.random() - 0.5) * 5 }
    : c;
  if (robot.type === 't1') drawT1(ctx, robot, jc, worldToScreen);
  else if (robot.type === 't3') drawT3(ctx, robot, jc);
  else drawT2(ctx, robot, jc);
  if (robot.ubikConfusedT > 0) {
    // Tell: violet dizzy dots circling the head, PKD's reality-static
    // rather than the boars' plain grey — same idea, different cause.
    ctx.fillStyle = 'rgba(210,150,255,0.9)';
    for (let i = 0; i < 3; i++) {
      const ang = performance.now() / 130 + (i * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.arc(c.x + Math.cos(ang) * 9, c.y - 38 + Math.sin(ang) * 3, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (flickered) ctx.restore();
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
  // side, wheels spinning uselessly; a Ubik-confused one spins on the spot.
  if (r.fused) ctx.rotate(0.2);
  else if (r.ubikConfusedT > 0) ctx.rotate(performance.now() / 140);
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
  else if (r.ubikConfusedT > 0) ctx.rotate(performance.now() / 140); // Ubik: spinning on the spot

  // Gait: legs scissor with the walk phase, same scheme as the player.
  // A wreck's legs hang straight.
  const swing = r.fused ? 0 : Math.sin(r.walkPhase) * 3;
  ctx.fillStyle = r.fused ? FUSED_EDGE : T2_LIMB;
  ctx.fillRect(-4 + swing, -10, 3, 10);
  ctx.fillRect(1 - swing, -10, 3, 10);

  const bodyBase = r.type === 'w1' ? W1_BODY : r.type === 'w3' ? W3_BODY : r.type === 'w4' ? W4_BODY : r.type === 'w5' ? W5_BODY : r.type === 'm6' ? M6_BODY : r.type === 'm6r' ? M6R_BODY : T2_BODY;
  const headBase = r.type === 'w1' ? W1_HEAD : r.type === 'w3' ? W3_HEAD : r.type === 'w4' ? W4_HEAD : r.type === 'w5' ? W5_HEAD : r.type === 'm6' ? M6_HEAD : r.type === 'm6r' ? M6R_HEAD : T2_HEAD;
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

// A stooped, reaching silhouette instead of the T2's upright stalk — a
// permanent forward hunch reads as a predator crouched to strike rather
// than a recoloured T2. Eyes glow orange, not the red every other machine
// uses, so the one that actually fires the hard-hitting ambush volley is
// unmistakable at a glance.
function drawT3(ctx, r, c) {
  // A long, thin shadow — it looms rather than stands square.
  ctx.fillStyle = 'rgba(0,0,0,0.34)';
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, 9 * T3_SCALE, 4 * T3_SCALE, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(c.x, c.y);
  // A faint tremor riding on animT (which always ticks, unlike walkPhase)
  // keeps it reading as live machinery even while it's holding still and
  // watching, rather than a dead, inert sprite.
  const tremor = r.fused ? 0 : Math.sin((r.animT || 0) * 9) * 0.012;
  if (r.fused) ctx.rotate(0.16);
  else if (r.ubikConfusedT > 0) ctx.rotate(performance.now() / 140);
  else ctx.rotate(tremor); // stands up straight — just the faint live-machine tremor
  ctx.scale(T3_SCALE, T3_SCALE);

  // Legs scissor with the walk phase exactly like the T2's — a jagged knee
  // break rather than a straight limb, and taller than a T2's. Since it
  // barely moves once camped, this mostly only plays while it repositions.
  const swing = r.fused ? 0 : Math.sin(r.walkPhase) * 3;
  ctx.strokeStyle = r.fused ? FUSED_EDGE : T3_LIMB;
  ctx.lineWidth = 2.2;
  for (const side of [-1, 1]) {
    const hipX = side * 3.2;
    ctx.beginPath();
    ctx.moveTo(hipX, -13);
    ctx.lineTo(hipX + swing * side * 0.4, -6);
    ctx.lineTo(hipX + swing * side, 0);
    ctx.stroke();
  }

  // Torso: a narrow, ragged waist breaking out into tall, asymmetric jagged
  // shoulders — a broken silhouette rather than a smooth chassis block, and
  // taller than any other machine here so it genuinely looms.
  ctx.fillStyle = bodyTone(T3_BODY, r);
  ctx.beginPath();
  ctx.moveTo(-4, -13);
  ctx.lineTo(4, -13);
  ctx.lineTo(6, -23);
  ctx.lineTo(9, -30);
  ctx.lineTo(3, -35);
  ctx.lineTo(-2, -36);
  ctx.lineTo(-8, -31);
  ctx.lineTo(-5, -24);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = r.fused ? FUSED_EDGE : T3_EDGE;
  ctx.lineWidth = 1;
  ctx.stroke();

  if (!r.fused) {
    // A riveted-metal texture clipped to the torso silhouette: a diagonal
    // brushed-steel sheen, a panel seam, and a scatter of rivets — echoes
    // the fortress ramparts' metal without needing the full wall texture
    // at this scale. Reuses the torso path already current from the fill.
    ctx.save();
    ctx.clip();
    const sheen = ctx.createLinearGradient(-8, -36, 9, -13);
    sheen.addColorStop(0, 'rgba(255,255,255,0.04)');
    sheen.addColorStop(0.42, 'rgba(255,255,255,0.24)');
    sheen.addColorStop(0.52, 'rgba(255,255,255,0.04)');
    sheen.addColorStop(1, 'rgba(0,0,0,0.16)');
    ctx.fillStyle = sheen;
    ctx.fillRect(-10, -38, 20, 28);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(-8, -23);
    ctx.lineTo(8, -19);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    for (const [rx, ry] of [[-5, -30], [3, -33], [-2, -16], [4, -17]]) {
      ctx.beginPath();
      ctx.arc(rx, ry, 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  if (!r.fused) {
    // Both arms reach, opposite each other and opposite the legs on the
    // same phase — a point-blank tell as much as a walk cycle, since these
    // are what actually swing the claws it falls back on up close.
    for (const side of [-1, 1]) {
      const reach = Math.sin(r.walkPhase + Math.PI + (side < 0 ? Math.PI : 0)) * 4;
      const shoulderX = side * 6, shoulderY = -30;
      const tipX = side * (11 + reach * 0.3), tipY = -25 + reach * 0.6;
      ctx.strokeStyle = T3_LIMB;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(shoulderX, shoulderY);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();

      // A three-talon claw fanned out from the tip, along the arm's own
      // direction — what you'd actually feel close on your shoulder.
      const armAng = Math.atan2(tipY - shoulderY, tipX - shoulderX);
      ctx.strokeStyle = T3_EDGE;
      ctx.lineWidth = 1.4;
      for (const off of [-0.5, 0, 0.5]) {
        const a = armAng + off;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX + Math.cos(a) * 4, tipY + Math.sin(a) * 4);
        ctx.stroke();
      }
    }
  }

  // Head: gaunt and elongated, no neck, hunched straight into the shoulders
  // — a skull shape rather than a boxy sensor head.
  ctx.fillStyle = r.fused ? FUSED_DARK : T3_HEAD;
  ctx.beginPath();
  ctx.ellipse(0.5, -42, 3.4, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Two hollow eye sockets instead of one visor — dark and empty at rest,
  // glowing orange together the instant it's actually hunting (aggro): the
  // same tell every other machine gives in red, recoloured so its threat
  // reads as distinct from a T1/T2/W1/W4 at a glance.
  const s = t3SensorStyle(r);
  for (const ex of [-1.4, 1.9]) {
    ctx.fillStyle = EYE_SOCKET;
    ctx.beginPath();
    ctx.arc(ex, -43, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  if (s) {
    for (const ex of [-1.4, 1.9]) {
      if (s.halo) {
        ctx.fillStyle = s.halo;
        ctx.beginPath();
        ctx.arc(ex, -43, 2.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = s.fill;
      ctx.beginPath();
      ctx.arc(ex, -43, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawDesignation(ctx, r, 0, -27); // 'T3' higher on the torso plate, near the chest

  ctx.restore();

  if (r.fused) drawSmoke(ctx, c.x, c.y - 38 * T3_SCALE, r.animT || 0);
  if (r.drained && !r.fused) drawBatteryIcon(ctx, c.x, c.y - 46 * T3_SCALE);
}
