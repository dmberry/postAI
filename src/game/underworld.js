// The underworld: a Ubik tear doesn't just brighten reality any more — walk
// into one and it tears clean through into a liminal pocket, Backrooms-style:
// a block of huge, echoing rooms with furniture stacked around at random,
// joined only by doorways, its own faded-yellow palette, and one wrong,
// lurking thing wandering it. Generated once (lazily, on first entry) and
// kept for the rest of the session rather than regenerated per visit — a
// deliberate v1 scope cut (see PAI-version-plan.md). Self-contained: main.js
// calls createUnderworldPocket() once, then updateUnderworldCreatures() and
// drawUnderworldCreature() every frame while the player is down there, same
// shape as every other creature/AI module in this codebase.

import { GameMap } from './map.js';
import { makeRng } from './rng.js';
import { ANIMAL_SPRITE_SETS } from '../engine/textures.js';

// A big 128x128 pocket: rooms of wildly varying size scattered across an open
// sea of yellow floor, joined by road-textured corridors punched through their
// walls. Not walled in — the exterior is just endless yellow, so it reads as
// boundless liminal space rather than one enclosed dungeon. The way home is a
// plain door set in the first room's wall. One pale thing lurks in the far
// rooms.
const UW_SIZE = 128;
const UW_WALL_H = 40;
const UW_ROOM_MIN = 10, UW_ROOM_MAX = 26;   // room side length, tiles
const UW_MAX_ROOMS = 15;
const UW_MARGIN = 6;
// Values stored per tile in map.liminalTex; the renderer maps 0..6 to the
// seven floor images (see renderer.js LIMINAL_TEX), and treats these two
// sentinels specially.
const TEX_SEA = 255;   // the open expanse: flat yellow + procedural wear
const TEX_BLUE = 250;  // a baby-blue room, to break up the yellow now and then
const TEX_ROAD = 5;    // index of the road image — used for corridors

const LURKER_WANDER_SPEED = 1.0;
const LURKER_HUNT_SPEED = 2.6;
const LURKER_NOTICE_RANGE = 7;    // needs genuine line of sight within this to ever notice you
const LURKER_LOSE_RANGE = 11;
const LURKER_HIT_RANGE = 0.6;
const LURKER_HIT_DAMAGE = 8;
const LURKER_HIT_COOLDOWN = 1.2;

// ---- world layout -----------------------------------------------------

function carveWorld(map, rng) {
  const W = UW_SIZE;
  const idx = (x, y) => y * W + x;
  const tex = new Uint8Array(W * W).fill(TEX_SEA);   // the whole map is open yellow to start
  const wall = new Set();
  const roomInterior = new Set();
  const rooms = [];

  // Scatter non-overlapping rooms of varying sizes.
  for (let t = 0; t < 90 && rooms.length < UW_MAX_ROOMS; t++) {
    const rw = UW_ROOM_MIN + Math.floor(rng() * (UW_ROOM_MAX - UW_ROOM_MIN + 1));
    const rh = UW_ROOM_MIN + Math.floor(rng() * (UW_ROOM_MAX - UW_ROOM_MIN + 1));
    const rx = UW_MARGIN + Math.floor(rng() * (W - rw - UW_MARGIN * 2));
    const ry = UW_MARGIN + Math.floor(rng() * (W - rh - UW_MARGIN * 2));
    let ok = true;
    for (const r of rooms) {
      if (rx < r.x + r.w + 5 && rx + rw + 5 > r.x && ry < r.y + r.h + 5 && ry + rh + 5 > r.y) { ok = false; break; }
    }
    if (!ok) continue;
    rooms.push({
      x: rx, y: ry, w: rw, h: rh, cx: rx + (rw >> 1), cy: ry + (rh >> 1),
      blue: rng() < 0.12,
      texIdx: [0, 1, 2, 3, 4, 6][Math.floor(rng() * 6)], // any of the seven floors but road
    });
  }

  // Wall each room's perimeter; floor + texture its interior.
  for (const r of rooms) {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      if (x === r.x || x === r.x + r.w - 1 || y === r.y || y === r.y + r.h - 1) wall.add(idx(x, y));
      else { roomInterior.add(idx(x, y)); tex[idx(x, y)] = r.blue ? TEX_BLUE : r.texIdx; }
    }
  }

  // Corridors: chain the rooms with L-shaped road lanes, punching door gaps
  // through the walls at each end. The sea already connects everything, so
  // these are the readable "corridors" laid over it, not the only route.
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1], b = rooms[i];
    let x = a.cx, y = a.cy;
    const path = [];
    while (x !== b.cx) { x += Math.sign(b.cx - x); path.push([x, y]); }
    while (y !== b.cy) { y += Math.sign(b.cy - y); path.push([x, y]); }
    for (const [px, py] of path) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const cx = px + dx, cy = py + dy;
        if (cx < 1 || cy < 1 || cx >= W - 1 || cy >= W - 1) continue;
        wall.delete(idx(cx, cy));                                   // punch doorways through walls
        if (!roomInterior.has(idx(cx, cy))) tex[idx(cx, cy)] = TEX_ROAD; // road across the sea
      }
    }
  }

  // Materialise the walls (skipping any tile a corridor punched open).
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    if (wall.has(idx(x, y))) map.addObject('fortwall', x, y, { material: 'liminal', wallH: UW_WALL_H });
  }

  // Furniture stacked around inside rooms (never on a road tile, so corridors
  // stay clear), scaled to room area.
  for (const r of rooms) {
    const clusters = 3 + Math.floor((r.w * r.h) / 55);
    for (let n = 0; n < clusters; n++) {
      const ax = r.x + 1 + Math.floor(rng() * (r.w - 2));
      const ay = r.y + 1 + Math.floor(rng() * (r.h - 2));
      const pile = 1 + Math.floor(rng() * 3);
      for (let p = 0; p < pile; p++) {
        const fx = ax + (p ? Math.floor(rng() * 3) - 1 : 0), fy = ay + (p ? Math.floor(rng() * 3) - 1 : 0);
        if (fx <= r.x || fx >= r.x + r.w - 1 || fy <= r.y || fy >= r.y + r.h - 1) continue;
        if (tex[idx(fx, fy)] === TEX_ROAD) continue;
        if (map.objectAt(fx, fy)) continue;
        map.addObject('furniture', fx, fy, { variant: Math.floor(rng() * 3), seed: Math.floor(rng() * 1000), h: 9 + Math.floor(rng() * 15) });
      }
    }
  }

  // Lamps: standing floor lamps, the only light down here — drawn as real
  // objects (renderer drawLamp), non-solid so you pass beneath them, each
  // flickering rarely on its own clock. `warm` (0..1) varies the glow colour
  // per lamp so some read paler and some a deeper, sicklier yellow. One or two
  // per room, and a generous scatter across the open sea so the expanse isn't
  // a dead flat void.
  const lampAt = (lx, ly) => {
    if (!map.objectAt(lx, ly)) map.addObject('lamp', lx, ly, { seed: Math.floor(rng() * 997), warm: rng() });
  };
  for (const r of rooms) {
    const n = 1 + Math.floor(rng() * 2);
    for (let k = 0; k < n; k++) {
      lampAt(r.x + 2 + Math.floor(rng() * (r.w - 4)), r.y + 2 + Math.floor(rng() * (r.h - 4)));
    }
  }
  for (let n = 0; n < 40; n++) {
    const lx = 4 + Math.floor(rng() * (W - 8)), ly = 4 + Math.floor(rng() * (W - 8));
    if (tex[ly * W + lx] === TEX_SEA) lampAt(lx, ly);
  }

  const spawn = rooms[0];
  // A plain door set into the room's west wall — the back-left wall from the
  // isometric camera (screen north-west), so you cross the room toward it and
  // see the door and its EXIT sign square-on, rather than a near wall where it
  // reads as an afterthought. Mundane, which is exactly what makes it wrong.
  const exitTX = spawn.x, exitTY = spawn.cy;

  // Yellow supply boxes: one guaranteed in the spawn room, holding the WARD
  // "bare stanhope" tape, plus a sparse scatter through the other rooms with
  // the odd extra tape to find. Reuses the resistance-cache box (opened with
  // E), tinted yellow (renderer drawBox reads obj.yellow).
  const boxAt = (bx, by, loot) => { if (map.inBounds(bx, by) && !map.objectAt(bx, by)) map.addObject('box', bx, by, { loot, opened: false, yellow: true }); };
  boxAt(spawn.cx + 2, spawn.cy, [{ item: 'tape_3', qty: 1 }]);
  for (let i = 1; i < rooms.length; i++) {
    if (rng() >= 0.35) continue;
    const r = rooms[i];
    boxAt(r.x + 2 + Math.floor(rng() * (r.w - 4)), r.y + 2 + Math.floor(rng() * (r.h - 4)),
      [{ item: `tape_${1 + Math.floor(rng() * 3)}`, qty: 1 }]);
  }

  // Farthest room from spawn: where the lurker waits.
  let far = rooms[0], farD = -1;
  for (const r of rooms) {
    const d = Math.hypot(r.cx - spawn.cx, r.cy - spawn.cy);
    if (d > farD) { farD = d; far = r; }
  }

  return {
    tex,
    spawn: { x: spawn.cx + 0.5, y: spawn.cy + 0.5 },
    exit: { x: exitTX + 0.5, y: exitTY + 0.5, tx: exitTX, ty: exitTY },
    creature: { x: far.cx + 0.5, y: far.cy + 0.5 },
  };
}

// Builds the pocket once, lazily, and keeps it for the session.
export function createUnderworldPocket(seed) {
  const map = new GameMap(UW_SIZE, UW_SIZE, 'liminal');
  const rng = makeRng(seed >>> 0);
  const { tex, spawn, exit, creature } = carveWorld(map, rng);
  map.liminalTex = tex;        // per-tile floor-texture index (renderer reads it)
  // The exit is a plain door set into the wall (not a Ubik tear): drop the
  // wall there and stand a door in its place. main.js exits on approach.
  const w = map.objectAt(exit.tx, exit.ty);
  if (w) map.removeObject(w);
  map.addObject('exitdoor', exit.tx, exit.ty, {});
  // Defensive fields so the pocket is a fully-formed map.
  map.projectiles = [];
  map.bombs = [];
  map.explosions = [];
  map.explored = new Uint8Array(map.w * map.h).fill(1);
  map.newlyRevealed = [];
  return {
    map, spawnX: spawn.x, spawnY: spawn.y, exitX: exit.x, exitY: exit.y,
    creatureX: creature.x, creatureY: creature.y,
  };
}

// ---- the lurker ---------------------------------------------------------

export function spawnUnderworldCreature(seed, x, y) {
  const rng = makeRng(seed >>> 0);
  return {
    x, y, facing: { x: 0, y: 1 }, hunting: false, animT: rng() * 10, walkPhase: 0,
    wanderTarget: null, wanderTimer: 0, attackTimer: 0, rng,
  };
}

function isBlocked(map, x, y) {
  return map.isSolid(Math.floor(x), Math.floor(y));
}

function stepToward(c, tx, ty, speed, dt, map) {
  const dx = tx - c.x, dy = ty - c.y, len = Math.hypot(dx, dy);
  if (len < 1e-6) return;
  const step = Math.min(speed * dt, len);
  const ox = c.x, oy = c.y;
  const nx = c.x + (dx / len) * step;
  if (!isBlocked(map, nx, c.y)) c.x = nx;
  const ny = c.y + (dy / len) * step;
  if (!isBlocked(map, c.x, ny)) c.y = ny;
  const moved = Math.hypot(c.x - ox, c.y - oy);
  if (moved > 1e-6) {
    c.facing = { x: (c.x - ox) / moved, y: (c.y - oy) / moved };
    c.walkPhase += dt * 10;
  }
}

function wander(c, dt, map) {
  c.wanderTimer -= dt;
  if (c.wanderTimer <= 0 || !c.wanderTarget) {
    const ang = c.rng() * Math.PI * 2;
    const d = 3 + c.rng() * 4;
    c.wanderTarget = { x: c.x + Math.cos(ang) * d, y: c.y + Math.sin(ang) * d };
    c.wanderTimer = 2 + c.rng() * 3;
  }
  stepToward(c, c.wanderTarget.x, c.wanderTarget.y, LURKER_WANDER_SPEED, dt, map);
}

// Wanders a maze it half-belongs to until it actually sees you (genuine line
// of sight, not blind proximity — same principle as this game's T3), then
// closes in with an erratic, off-line approach rather than a clean beeline,
// so it reads as wrong rather than as just another hunter.
export function updateUnderworldCreatures(dt, creatures, player, map) {
  for (const c of creatures) {
    c.attackTimer = Math.max(0, c.attackTimer - dt);
    c.animT += dt;
    const d = Math.hypot(player.x - c.x, player.y - c.y);
    if (!c.hunting) {
      if (d < LURKER_NOTICE_RANGE && map.hasLineOfSight(c.x, c.y, player.x, player.y)) {
        c.hunting = true;
      } else {
        wander(c, dt, map);
        continue;
      }
    }
    if (d > LURKER_LOSE_RANGE || !map.hasLineOfSight(c.x, c.y, player.x, player.y)) {
      c.hunting = false;
      continue;
    }
    const jx = player.x + Math.sin(c.animT * 7) * 0.6;
    const jy = player.y + Math.cos(c.animT * 6.3) * 0.6;
    stepToward(c, jx, jy, LURKER_HUNT_SPEED, dt, map);
    if (d < LURKER_HIT_RANGE && c.attackTimer <= 0) {
      c.attackTimer = LURKER_HIT_COOLDOWN;
      player.takeDamage(LURKER_HIT_DAMAGE, 'thing in the yellow room');
    }
  }
}

// ---- drawing --------------------------------------------------------------
// facingToCompassDir/pickAnimalFrame-equivalents duplicated locally rather
// than imported — same reasoning as animals.js's own local copies: this
// module stays out of the renderer/engine's private helpers.

const UW_DIRS = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
const UW_DIR_THETA = { E: 0, SE: 45, S: 90, SW: 135, W: 180, NW: 225, N: 270, NE: 315 };
function facingToDir(facing) {
  const sx = facing.y - facing.x, sy = facing.x + facing.y;
  let theta = Math.atan2(sy, sx) * 180 / Math.PI;
  if (theta < 0) theta += 360;
  let best = 'S', bestDiff = Infinity;
  for (const dir of UW_DIRS) {
    const diff = Math.min(Math.abs(theta - UW_DIR_THETA[dir]), 360 - Math.abs(theta - UW_DIR_THETA[dir]));
    if (diff < bestDiff) { bestDiff = diff; best = dir; }
  }
  return best;
}

let _uwTintCanvas = null;
function uwTintScratch(w, h) {
  if (!_uwTintCanvas) _uwTintCanvas = document.createElement('canvas');
  if (_uwTintCanvas.width !== w || _uwTintCanvas.height !== h) {
    _uwTintCanvas.width = w;
    _uwTintCanvas.height = h;
  }
  return { canvas: _uwTintCanvas, ctx: _uwTintCanvas.getContext('2d') };
}

// A monkey sprite (the nearest thing to a humanoid silhouette in the animal
// set) recoloured sickly and pale — same tint trick as the dog/boar recolour
// in animals.js — plus a small random jitter while hunting so it never quite
// reads as a normal, steady-moving creature.
export function drawUnderworldCreature(ctx, c, worldToScreen) {
  const set = ANIMAL_SPRITE_SETS.monkey;
  if (!set) return;
  const dir = facingToDir(c.facing);
  const moving = c.hunting || !!c.wanderTarget;
  const frames = set.walk[dir];
  const sprite = moving && frames ? frames[Math.floor((c.walkPhase / (Math.PI * 2)) * frames.length) % frames.length] : set.idle[dir];
  if (!sprite || !sprite.complete || !sprite.naturalWidth) return;

  const scale = 0.195;
  const jitter = c.hunting ? 3 : 0;
  const jx = (Math.random() - 0.5) * jitter, jy = (Math.random() - 0.5) * jitter;
  const pos = worldToScreen(c.x, c.y);
  const dw = sprite.naturalWidth * scale, dh = sprite.naturalHeight * scale;
  const dx = pos.x + jx - dw / 2, dy = pos.y + jy - dh + dh * 0.16;

  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(pos.x, pos.y, dw * 0.32, dw * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();

  const off = uwTintScratch(sprite.naturalWidth, sprite.naturalHeight);
  off.ctx.clearRect(0, 0, off.canvas.width, off.canvas.height);
  off.ctx.drawImage(sprite, 0, 0);
  off.ctx.globalCompositeOperation = 'multiply';
  off.ctx.fillStyle = c.hunting ? 'rgba(214,204,118,0.62)' : 'rgba(182,177,150,0.5)';
  off.ctx.fillRect(0, 0, off.canvas.width, off.canvas.height);
  off.ctx.globalCompositeOperation = 'destination-in';
  off.ctx.drawImage(sprite, 0, 0);
  off.ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(off.canvas, dx, dy, dw, dh);
}
