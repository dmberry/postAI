import { makeRng } from './rng.js';
import { ANIMAL_SPRITE_SETS } from '../engine/textures.js';

// Wild animals: feral dogs, boars, and vipers. Each has a signature power,
// a readable tell before it acts, and a counter the player can learn.
// Dogs hunt in packs but rout when one is hurt; boars charge in straight
// lines and stun themselves on walls; vipers ambush from the grass.

// ---- Tuning ---------------------------------------------------------------

const RADIUS = 0.25;            // collision radius in tiles (all animals)
const WANDER_RANGE = 2.5;       // how far wander targets stray from home
const ANIMAL_ACTIVE_RANGE = 40; // tiles: beyond this from the player, an animal's AI is skipped (CPU)

const DOG_HP = 12;
const DOG_WANDER_SPEED = 1.2;   // tiles per second
const DOG_CHASE_SPEED = 4.2;
const DOG_DEAGGRO_RANGE = 10;   // pack gives up beyond this
// A pack no longer aggros just because the player wandered within sight —
// they're a hazard to provoke, not a tripwire. Getting hit still routs the
// whole pack (below, unchanged). Otherwise a pack only turns hostile if the
// player lingers in its personal space: DOG_ANNOY_RANGE is "in its face",
// and it takes DOG_ANNOY_TIME seconds of that before patience runs out —
// a passing brush doesn't count, only crowding it.
const DOG_ANNOY_RANGE = 2.6;
const DOG_ANNOY_TIME = 1.4;
const DOG_BITE_RANGE = 0.9;
const DOG_BITE_DAMAGE = 5;
const DOG_BITE_COOLDOWN = 1.2;  // seconds between bites
const DOG_FLEE_TIME = 3.5;      // pack routs this long when a member is hurt
const DOG_SPREAD = [-0.6, 0, 0.6]; // sideways offsets so a pack fans out

const BOAR_HP = 30;
const BOAR_WANDER_SPEED = 1.0;
const BOAR_SIGHT = 6;           // charge trigger range
const BOAR_ANGLE_TOL = 0.2;     // rad off a compass line before it charges
const BOAR_TELEGRAPH_TIME = 0.6;
const BOAR_CHARGE_SPEED = 7;
const BOAR_CHARGE_HIT = 0.8;    // player within this during a charge is hit
const BOAR_CHARGE_DAMAGE = 15;
const BOAR_CHARGE_MAX_DIST = 9; // gives up after this far
const BOAR_STUN_TIME = 1.5;     // wall impact stun
const BOAR_RECOVER_TIME = 1.2;  // pause before it may charge again

const VIPER_HP = 2;             // fragile: one good hit
const VIPER_SLITHER_SPEED = 0.3;
const VIPER_STRIKE_RANGE = 1.2;
const VIPER_RAISE_RANGE = 1.8;  // tell: rears up before you are in range
const VIPER_STRIKE_DAMAGE = 3;
const VIPER_STRIKE_COOLDOWN = 0.5;
const VIPER_VENOM_SECONDS = 6;

// Spawn counts and placement.
const DOG_PACKS = 3;
const DOG_PACK_SIZE = 3;
const BOAR_COUNT = 6;
const VIPER_COUNT = 10;
const DOG_NEAR_FEATURE = 4;     // grass within this of a road/building
const PACK_MIN_GAP = 8;         // tiles between pack centres
const BOAR_MIN_GAP = 4;
const VIPER_MIN_GAP = 3;

// ---- Spawning -------------------------------------------------------------

// Base fields common to every animal. Each carries its own seeded rng so
// behaviour stays deterministic for a given world seed.
function baseAnimal(type, x, y, hp, rng) {
  return {
    type,
    x: x + 0.5,
    y: y + 0.5,
    hp,
    maxHp: hp,
    lastHp: hp,       // for detecting fresh damage in update
    dead: false,
    homeX: x + 0.5,
    homeY: y + 0.5,
    facing: { x: 0, y: 1 },
    rng: makeRng(Math.floor(rng() * 0xffffffff)),
    wanderTarget: null,
    wanderTimer: 0,
    animT: rng() * 10, // desync idle animation between individuals
  };
}

// True if there is a road/boards floor or a wall/rubble object nearby, i.e.
// the tile is "near buildings or roads" for dog placement.
function nearFeature(map, x, y) {
  for (let dy = -DOG_NEAR_FEATURE; dy <= DOG_NEAR_FEATURE; dy++) {
    for (let dx = -DOG_NEAR_FEATURE; dx <= DOG_NEAR_FEATURE; dx++) {
      const f = map.floorAt(x + dx, y + dy);
      if (f === 'road' || f === 'boards') return true;
      const o = map.objectAt(x + dx, y + dy);
      if (o && (o.type === 'wall' || o.type === 'rubble')) return true;
    }
  }
  return false;
}

// True if an adjacent tile holds a tree: forest edges, for boars.
function nearTree(map, x, y) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const o = map.objectAt(x + dx, y + dy);
      if (o && o.type === 'tree') return true;
    }
  }
  return false;
}

// Shuffle candidates and take up to n, keeping a minimum gap between picks.
function pickSpots(candidates, n, minGap, rng) {
  const pool = candidates.slice();
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

export function spawnAnimals(map, seed, avoid) {
  const rng = makeRng(seed);
  const animals = [];

  // Classify every walkable tile outside the avoid radius.
  const dogTiles = [];
  const boarTiles = [];
  const tallgrassTiles = [];
  const grassTiles = [];
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      if (map.isSolid(x, y)) continue;
      if (Math.hypot(x + 0.5 - avoid.x, y + 0.5 - avoid.y) < avoid.r) continue;
      const f = map.floorAt(x, y);
      if (f === 'tallgrass') tallgrassTiles.push([x, y]);
      if (f !== 'grass') continue;
      grassTiles.push([x, y]);
      if (nearFeature(map, x, y)) dogTiles.push([x, y]);
      if (nearTree(map, x, y)) boarTiles.push([x, y]);
    }
  }

  // Dog packs: pick pack centres, then seat each dog on a free tile nearby.
  const packCentres = pickSpots(dogTiles, DOG_PACKS, PACK_MIN_GAP, rng);
  const seatOffsets = [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
  packCentres.forEach(([cx, cy], packId) => {
    let seated = 0;
    for (const [ox, oy] of seatOffsets) {
      if (seated >= DOG_PACK_SIZE) break;
      const x = cx + ox, y = cy + oy;
      if (map.isSolid(x, y)) continue;
      const dog = baseAnimal('dog', x, y, DOG_HP, rng);
      dog.packId = packId;
      dog.packIndex = seated;
      dog.aggro = false;       // tell: renderer shows "!" while true
      dog.fleeTimer = 0;
      dog.biteTimer = 0;
      animals.push(dog);
      seated++;
    }
  });

  // Boars on forest edges.
  for (const [x, y] of pickSpots(boarTiles, BOAR_COUNT, BOAR_MIN_GAP, rng)) {
    const boar = baseAnimal('boar', x, y, BOAR_HP, rng);
    boar.state = 'wander';     // wander | telegraph | charge | stun
    boar.telegraphTimer = 0;   // tell: renderer shakes/flashes while > 0
    boar.stunTimer = 0;        // tell: renderer shows dizzy dots while > 0
    boar.chargeDir = { x: 0, y: 1 };
    boar.chargeDist = 0;
    boar.recoverTimer = 0;
    animals.push(boar);
  }

  // Vipers in tall grass if the map has any, otherwise plain grass.
  const viperTiles = tallgrassTiles.length ? tallgrassTiles : grassTiles;
  for (const [x, y] of pickSpots(viperTiles, VIPER_COUNT, VIPER_MIN_GAP, rng)) {
    const viper = baseAnimal('viper', x, y, VIPER_HP, rng);
    viper.raised = false;      // tell: renderer lifts the head while true
    viper.strikeTimer = 0;
    viper.strikeFlash = 0;
    animals.push(viper);
  }

  return animals;
}

// ---- Movement helpers -----------------------------------------------------

// Four-corner sample, same scheme as Player.collides. A corner also blocks
// if its tile is more than one height level from `h` (the animal's current
// tile), so animals can't scale steep steps or climb out of a dug pit.
function collides(map, x, y, h) {
  const blocked = (tx, ty) => {
    if (map.isSolid(tx, ty)) return true;
    if (!map.heightAt || h == null) return false;
    return Math.abs(map.heightAt(tx, ty) - h) > 1;
  };
  return (
    blocked(Math.floor(x - RADIUS), Math.floor(y - RADIUS)) ||
    blocked(Math.floor(x + RADIUS), Math.floor(y - RADIUS)) ||
    blocked(Math.floor(x - RADIUS), Math.floor(y + RADIUS)) ||
    blocked(Math.floor(x + RADIUS), Math.floor(y + RADIUS))
  );
}

function moveAxis(a, dx, dy, map) {
  const nx = a.x + dx;
  const ny = a.y + dy;
  const h = map.heightAt ? map.heightAt(Math.floor(a.x), Math.floor(a.y)) : null;
  if (!collides(map, nx, ny, h)) {
    a.x = nx;
    a.y = ny;
  }
}

// Step towards a point; axis-separated so animals slide along walls.
// Returns the distance actually covered this step.
function moveToward(a, tx, ty, speed, dt, map) {
  const dx = tx - a.x;
  const dy = ty - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return 0;
  const step = Math.min(speed * dt, len);
  const ox = a.x, oy = a.y;
  moveAxis(a, (dx / len) * step, 0, map);
  moveAxis(a, 0, (dy / len) * step, map);
  const moved = Math.hypot(a.x - ox, a.y - oy);
  if (moved > 1e-6) {
    a.facing = { x: (a.x - ox) / moved, y: (a.y - oy) / moved };
  }
  return moved;
}

// Idle wandering shared by dogs and boars: amble to points near home with
// pauses in between.
function wander(a, speed, dt, map) {
  a.wanderTimer -= dt;
  if (a.wanderTimer <= 0) {
    if (a.rng() < 0.4) {
      a.wanderTarget = null; // stand still a moment
      a.wanderTimer = 1 + a.rng() * 2;
    } else {
      const ang = a.rng() * Math.PI * 2;
      const r = 0.5 + a.rng() * WANDER_RANGE;
      a.wanderTarget = { x: a.homeX + Math.cos(ang) * r, y: a.homeY + Math.sin(ang) * r };
      a.wanderTimer = 1.5 + a.rng() * 2;
    }
  }
  if (a.wanderTarget) {
    moveToward(a, a.wanderTarget.x, a.wanderTarget.y, speed, dt, map);
    if (Math.hypot(a.wanderTarget.x - a.x, a.wanderTarget.y - a.y) < 0.1) {
      a.wanderTarget = null;
    }
  }
}

function distTo(a, player) {
  return Math.hypot(player.x - a.x, player.y - a.y);
}

// ---- Update ---------------------------------------------------------------

export function updateAnimals(dt, animals, player, map) {
  // Damage bookkeeping first: deaths drop meat; fresh wounds set justHurt
  // for this frame so packs can rout and boars can retaliate.
  for (const a of animals) {
    if (a.dead) continue;
    if (a.hp <= 0) {
      a.dead = true;
      (map.groundItems ??= []).push({ item: 'meat', qty: 1, x: a.x, y: a.y });
      continue;
    }
    a.justHurt = a.hp < a.lastHp;
    a.lastHp = a.hp;
  }

  // Pack-level signals: which packs have a hurt member, which have had their
  // patience worn out by the player crowding them.
  const hurtPacks = new Set();
  const aggroPacks = new Set();
  for (const a of animals) {
    if (a.dead || a.type !== 'dog') continue;
    if (a.justHurt) hurtPacks.add(a.packId);
    const crowded = distTo(a, player) < DOG_ANNOY_RANGE;
    a.annoyT = crowded ? Math.min(DOG_ANNOY_TIME, (a.annoyT || 0) + dt) : Math.max(0, (a.annoyT || 0) - dt * 2);
    if (a.annoyT >= DOG_ANNOY_TIME) aggroPacks.add(a.packId);
  }

  for (const a of animals) {
    if (a.dead) continue;
    // CPU: animals well off-screen skip their AI and just wait — the player
    // can't see or reach them, so freezing them until they're near again
    // keeps a big map cheap (only nearby wildlife thinks each frame).
    if (distTo(a, player) > ANIMAL_ACTIVE_RANGE) continue;
    a.animT += dt;
    // Knocked back by a solid hit: frozen (no movement, no attack) for a
    // beat, same as the shove the player's strike just gave it — stops it
    // trading blows nose-to-nose the instant it's been hit.
    if (a.knockT > 0) {
      a.knockT -= dt;
      a.justHurt = false;
      continue;
    }
    // Startled (e.g. by the electro-gun's crackle): bolt straight away from
    // the player, overriding normal behaviour, until the scare wears off.
    if (a.scaredT > 0) {
      a.scaredT -= dt;
      const d = distTo(a, player);
      const ax = d > 1e-6 ? (a.x - player.x) / d : 1;
      const ay = d > 1e-6 ? (a.y - player.y) / d : 0;
      moveToward(a, a.x + ax * 3, a.y + ay * 3, DOG_CHASE_SPEED, dt, map);
      a.justHurt = false;
      continue;
    }
    if (a.type === 'dog') updateDog(a, dt, player, map, hurtPacks, aggroPacks);
    else if (a.type === 'boar') updateBoar(a, dt, player, map);
    else if (a.type === 'viper') updateViper(a, dt, player, map);
    a.justHurt = false;
  }
}

function updateDog(a, dt, player, map, hurtPacks, aggroPacks) {
  a.biteTimer = Math.max(0, a.biteTimer - dt);

  // Signature weakness: hurt one dog and the whole pack routs for a while.
  if (hurtPacks.has(a.packId)) {
    a.fleeTimer = DOG_FLEE_TIME;
    a.aggro = false;
  }

  if (a.fleeTimer > 0) {
    a.fleeTimer -= dt;
    const d = distTo(a, player);
    const away = d > 1e-6
      ? { x: (a.x - player.x) / d, y: (a.y - player.y) / d }
      : { x: 1, y: 0 };
    moveToward(a, a.x + away.x * 2, a.y + away.y * 2, DOG_CHASE_SPEED, dt, map);
    return;
  }

  const d = distTo(a, player);
  if (a.aggro && d > DOG_DEAGGRO_RANGE) a.aggro = false;
  if (aggroPacks.has(a.packId)) a.aggro = true; // tell: bark, "!" marker

  if (a.aggro) {
    // Fan out: each pack member aims a little to one side of the player so
    // the pack surrounds rather than stacks.
    let tx = player.x, ty = player.y;
    if (d > 1.5) {
      const px = -(player.y - a.y) / d;
      const py = (player.x - a.x) / d;
      const side = DOG_SPREAD[a.packIndex % DOG_SPREAD.length];
      tx += px * side;
      ty += py * side;
    }
    moveToward(a, tx, ty, DOG_CHASE_SPEED, dt, map);
    if (d < DOG_BITE_RANGE && a.biteTimer <= 0) {
      a.biteTimer = DOG_BITE_COOLDOWN;
      player.takeDamage(DOG_BITE_DAMAGE, 'dog');
    }
  } else {
    wander(a, DOG_WANDER_SPEED, dt, map);
  }
}

function updateBoar(a, dt, player, map) {
  a.recoverTimer = Math.max(0, a.recoverTimer - dt);

  // Being wounded enrages it: immediate fresh telegraph aimed at the player.
  if (a.justHurt) {
    const d = distTo(a, player);
    a.chargeDir = d > 1e-6
      ? { x: (player.x - a.x) / d, y: (player.y - a.y) / d }
      : { x: 0, y: 1 };
    a.state = 'telegraph';
    a.telegraphTimer = BOAR_TELEGRAPH_TIME;
    a.stunTimer = 0;
    return;
  }

  if (a.state === 'wander') {
    wander(a, BOAR_WANDER_SPEED, dt, map);
    const d = distTo(a, player);
    if (d < BOAR_SIGHT && a.recoverTimer <= 0) {
      // "Roughly in a straight line": the player sits near one of the eight
      // compass lines through the boar. The charge locks to that line, so
      // stepping off-axis is the counter.
      const ang = Math.atan2(player.y - a.y, player.x - a.x);
      const snapped = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4);
      if (Math.abs(ang - snapped) <= BOAR_ANGLE_TOL) {
        a.state = 'telegraph';
        a.telegraphTimer = BOAR_TELEGRAPH_TIME;
        a.chargeDir = { x: Math.cos(snapped), y: Math.sin(snapped) };
        a.facing = a.chargeDir;
      }
    }
  } else if (a.state === 'telegraph') {
    // Tell: pawing the ground; no movement until the timer runs out.
    a.telegraphTimer -= dt;
    if (a.telegraphTimer <= 0) {
      a.telegraphTimer = 0;
      a.state = 'charge';
      a.chargeDist = 0;
    }
  } else if (a.state === 'charge') {
    const expected = BOAR_CHARGE_SPEED * dt;
    const moved = moveToward(
      a,
      a.x + a.chargeDir.x * 2,
      a.y + a.chargeDir.y * 2,
      BOAR_CHARGE_SPEED,
      dt,
      map
    );
    a.chargeDist += moved;
    a.facing = a.chargeDir;
    if (distTo(a, player) < BOAR_CHARGE_HIT) {
      player.takeDamage(BOAR_CHARGE_DAMAGE, 'boar');
      a.state = 'wander';
      a.recoverTimer = BOAR_RECOVER_TIME;
    } else if (moved < expected * 0.25) {
      // Rammed a solid tile: the counter — bait it into a wall.
      a.state = 'stun';
      a.stunTimer = BOAR_STUN_TIME;
    } else if (a.chargeDist >= BOAR_CHARGE_MAX_DIST) {
      a.state = 'wander';
      a.recoverTimer = BOAR_RECOVER_TIME;
    }
  } else if (a.state === 'stun') {
    a.stunTimer -= dt;
    if (a.stunTimer <= 0) {
      a.stunTimer = 0;
      a.state = 'wander';
      a.recoverTimer = BOAR_RECOVER_TIME;
    }
  }
}

function updateViper(a, dt, player, map) {
  a.strikeTimer = Math.max(0, a.strikeTimer - dt);
  a.strikeFlash = Math.max(0, a.strikeFlash - dt);

  const d = distTo(a, player);
  a.raised = d < VIPER_RAISE_RANGE; // tell: rears up as you get close

  if (d < VIPER_STRIKE_RANGE && a.strikeTimer <= 0) {
    a.strikeTimer = VIPER_STRIKE_COOLDOWN;
    a.strikeFlash = 0.2;
    player.takeDamage(VIPER_STRIKE_DAMAGE, 'viper');
    player.venom = VIPER_VENOM_SECONDS; // drain handled in player code
  }

  // Tiny idle slither around the spawn tile so a watchful eye can spot it.
  const ox = Math.cos(a.animT * 0.8) * 0.2;
  const oy = Math.sin(a.animT * 0.6) * 0.2;
  moveToward(a, a.homeX + ox, a.homeY + oy, VIPER_SLITHER_SPEED, dt, map);
}

// ---- Drawing --------------------------------------------------------------

// Boar and viper are still placeholder art in code: shadow ellipse at the
// feet, simple shapes at tile scale. Dog now draws the real Kenney
// "Cube Pets" model (see ANIMAL_SPRITE_SETS in engine/textures.js,
// pre-rendered offline via tools/pet-render.html into 8 screen-facing
// directions), falling back to the old procedural shape until the image has
// loaded. worldToScreen is the projection function from engine/iso.js,
// passed in so most of this module stays engine-free; the sprite path is
// the one exception, importing directly from textures.js.
export function drawAnimal(ctx, animal, worldToScreen) {
  if (animal.dead) return;
  const c = worldToScreen(animal.x, animal.y);
  if (animal.type === 'dog') {
    if (!drawDogSprite(ctx, animal, c)) drawDog(ctx, animal, c, worldToScreen);
  } else if (animal.type === 'boar') drawBoar(ctx, animal, c, worldToScreen);
  else if (animal.type === 'viper') drawViper(ctx, animal, c);
}

// Kenney normalises every Cube Pets model to a similar bounding cube
// regardless of the real animal's size (confirmed by comparing rendered
// bee/elephant output at the same camera framing — near-identical), so
// species can't share one draw scale; each gets its own fudge factor here,
// eyeballed relative to the dog. Only 'dog' is wired into gameplay so far —
// the rest are rendered and ready in assets/textures/animals/ for whenever
// boar/viper substitutes or further species are picked.
const ANIMAL_SPRITE_SCALE = {
  dog: 0.42, bee: 0.23, caterpillar: 0.19, chick: 0.23, crab: 0.23, fish: 0.26,
  bunny: 0.32, beaver: 0.32, cat: 0.36, koala: 0.36, penguin: 0.36, parrot: 0.26,
  fox: 0.39, monkey: 0.39, pig: 0.48, hog: 0.52, panda: 0.55, deer: 0.58,
  lion: 0.61, tiger: 0.65, cow: 0.71, polar: 0.71, giraffe: 0.9, elephant: 1.03,
};

const ANIMAL_COMPASS_DIRS = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
const ANIMAL_DIR_THETA = { E: 0, SE: 45, S: 90, SW: 135, W: 180, NW: 225, N: 270, NE: 315 };
// Same facing-vector -> screen-compass-direction mapping as
// renderer.js:facingToCompassDir, duplicated here rather than imported so
// this module doesn't reach into the renderer for one helper.
function facingToCompassDir(facing) {
  const sx = facing.y - facing.x, sy = facing.x + facing.y;
  let theta = Math.atan2(sy, sx) * 180 / Math.PI;
  if (theta < 0) theta += 360;
  let best = 'S', bestDiff = Infinity;
  for (const dir of ANIMAL_COMPASS_DIRS) {
    const diff = Math.min(Math.abs(theta - ANIMAL_DIR_THETA[dir]), 360 - Math.abs(theta - ANIMAL_DIR_THETA[dir]));
    if (diff < bestDiff) { bestDiff = diff; best = dir; }
  }
  return best;
}

// Returns false (drawing nothing) if the sprite for this facing hasn't
// finished loading yet, so the caller can fall back to the procedural shape
// instead of an invisible dog.
function drawDogSprite(ctx, a, c) {
  const set = ANIMAL_SPRITE_SETS.dog;
  const dir = facingToCompassDir(a.facing);
  const sprite = set && set[dir];
  if (!sprite || !sprite.complete || !sprite.naturalWidth) return false;
  const scale = ANIMAL_SPRITE_SCALE.dog;
  const dw = sprite.naturalWidth * scale, dh = sprite.naturalHeight * scale;

  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, dw * 0.32, dw * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.drawImage(sprite, c.x - dw / 2, c.y - dh + dh * 0.16, dw, dh);

  if (a.aggro) {
    // Tell: barking, white "!" above the head.
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('!', c.x, c.y - dh - 4);
    ctx.textAlign = 'left';
  }
  return true;
}

function drawDog(ctx, a, c, worldToScreen) {
  // Head sits towards the facing direction, tail trails behind.
  const h = worldToScreen(a.x + a.facing.x * 0.35, a.y + a.facing.y * 0.35);
  const t = worldToScreen(a.x - a.facing.x * 0.4, a.y - a.facing.y * 0.4);

  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, 9, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#8a7a5e'; // grey-brown body
  ctx.beginPath();
  ctx.ellipse(c.x, c.y - 7, 9, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#7a6b50'; // small head
  ctx.beginPath();
  ctx.arc(h.x, h.y - 10, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#7a6b50'; // thin tail
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(t.x, t.y - 8);
  ctx.lineTo(t.x - a.facing.x * 4, t.y - 13);
  ctx.stroke();

  if (a.aggro) {
    // Tell: barking, white "!" above the head.
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('!', c.x, c.y - 24);
    ctx.textAlign = 'left';
  }
}

function drawBoar(ctx, a, c, worldToScreen) {
  const telegraphing = a.state === 'telegraph';
  // Tell: shakes in place while telegraphing.
  const shake = telegraphing ? Math.sin(a.animT * 45) * 2 : 0;
  const h = worldToScreen(a.x + a.facing.x * 0.4, a.y + a.facing.y * 0.4);

  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, 12, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Tell: flashes reddish while telegraphing.
  const flash = telegraphing && Math.sin(a.animT * 20) > 0;
  ctx.fillStyle = flash ? '#7a3a2a' : '#4e3a28'; // bulky dark-brown body
  ctx.beginPath();
  ctx.ellipse(c.x + shake, c.y - 9, 13, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = flash ? '#6b3527' : '#443324'; // snouted head
  ctx.beginPath();
  ctx.ellipse(h.x + shake, h.y - 8, 6, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Pale tusks either side of the snout.
  ctx.strokeStyle = '#e8ddc4';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(h.x + shake - 4, h.y - 5);
  ctx.lineTo(h.x + shake - 6, h.y - 10);
  ctx.moveTo(h.x + shake + 4, h.y - 5);
  ctx.lineTo(h.x + shake + 6, h.y - 10);
  ctx.stroke();

  if (a.state === 'stun') {
    // Tell: dizzy dots circling above the head.
    ctx.fillStyle = 'rgba(220,220,220,0.9)';
    for (let i = 0; i < 3; i++) {
      const ang = a.animT * 6 + (i * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.arc(c.x + Math.cos(ang) * 8, c.y - 26 + Math.sin(ang) * 3, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawViper(ctx, a, c) {
  // Low to the ground; the coil breathes so a watchful player can spot it.
  const breathe = Math.sin(a.animT * 2) * 0.7;
  const headLift = a.raised ? 9 : 3; // tell: rears up before striking

  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, 6, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#2e4d26'; // dark-green coil
  ctx.beginPath();
  ctx.ellipse(c.x, c.y - 2, 6 + breathe, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(c.x + 2, c.y - 4, 4 + breathe * 0.5, 2.4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head: lighter flash just after a strike.
  ctx.fillStyle = a.strikeFlash > 0 ? '#6f9c4e' : '#3c6330';
  ctx.beginPath();
  ctx.arc(c.x + 3 + Math.sin(a.animT * 3) * 1.2, c.y - headLift, 2.5, 0, Math.PI * 2);
  ctx.fill();
}
