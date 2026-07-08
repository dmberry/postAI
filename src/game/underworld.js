// The underworld: a Ubik tear doesn't just brighten reality any more — walk
// into one and it tears clean through into a liminal pocket, Backrooms-style:
// a small, bounded, disposable maze with its own faded-yellow palette and one
// wrong, lurking thing in it. Generated once (lazily, on first entry) and
// kept for the rest of the session rather than regenerated per visit — a
// deliberate v1 scope cut (see PAI-version-plan.md). Self-contained: main.js
// calls createUnderworldPocket() once, then updateUnderworldCreatures() and
// drawUnderworldCreature() every frame while the player is down there, same
// shape as every other creature/AI module in this codebase.

import { GameMap } from './map.js';
import { makeRng } from './rng.js';
import { ANIMAL_SPRITE_SETS } from '../engine/textures.js';

const UW_SIZE = 26;      // small and bounded — enough to get lost in, not to wander forever
const UW_CW = 2;         // corridor width
const UW_PITCH = 3;      // corridor + 1-wide wall
const UW_WALL_H = 34;

const LURKER_WANDER_SPEED = 1.0;
const LURKER_HUNT_SPEED = 2.6;
const LURKER_NOTICE_RANGE = 7;    // needs genuine line of sight within this to ever notice you
const LURKER_LOSE_RANGE = 11;
const LURKER_HIT_RANGE = 0.6;
const LURKER_HIT_DAMAGE = 8;
const LURKER_HIT_COOLDOWN = 1.2;

// ---- maze -------------------------------------------------------------

// Recursive-backtracker over the whole pocket (same technique as the
// fortress's labyrinth, src/game/fortress.js:buildMaze, just carved across
// a full small grid instead of a band). Returns the entrance cell (spawn)
// and whichever cell the DFS reached deepest before backtracking — a cheap,
// good-enough proxy for "far from spawn" without a separate BFS pass.
function carveMaze(map, rng) {
  const cols = Math.floor((UW_SIZE - 2) / UW_PITCH);
  const rows = Math.floor((UW_SIZE - 2) / UW_PITCH);
  const mx0 = 1, my0 = 1;
  const open = new Set();
  const idx = (x, y) => y * UW_SIZE + x;
  const carve = (x, y) => { if (map.inBounds(x, y)) open.add(idx(x, y)); };
  const cellX = (c) => mx0 + c * UW_PITCH, cellY = (r) => my0 + r * UW_PITCH;
  const carveCell = (c, r) => {
    const bx = cellX(c), by = cellY(r);
    for (let dy = 0; dy < UW_CW; dy++) for (let dx = 0; dx < UW_CW; dx++) carve(bx + dx, by + dy);
  };
  const carvePassage = (c1, r1, c2, r2) => {
    if (c1 !== c2) { const gx = cellX(Math.min(c1, c2)) + UW_CW, by = cellY(r1); for (let dy = 0; dy < UW_CW; dy++) carve(gx, by + dy); }
    else { const gy = cellY(Math.min(r1, r2)) + UW_CW, bx = cellX(c1); for (let dx = 0; dx < UW_CW; dx++) carve(bx + dx, gy); }
  };
  const visited = Array.from({ length: rows }, () => new Array(cols).fill(false));
  const stack = [[0, 0]];
  visited[0][0] = true; carveCell(0, 0);
  let deepest = [0, 0], deepestDepth = 1;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (stack.length) {
    const [c, r] = stack[stack.length - 1];
    const opts = [];
    for (const [dc, dr] of DIRS) {
      const nc = c + dc, nr = r + dr;
      if (nc >= 0 && nc < cols && nr >= 0 && nr < rows && !visited[nr][nc]) opts.push([nc, nr]);
    }
    if (!opts.length) { stack.pop(); continue; }
    const [nc, nr] = opts[Math.floor(rng() * opts.length)];
    visited[nr][nc] = true; carvePassage(c, r, nc, nr); carveCell(nc, nr); stack.push([nc, nr]);
    if (stack.length > deepestDepth) { deepestDepth = stack.length; deepest = [nc, nr]; }
  }
  for (let y = 0; y < UW_SIZE; y++) {
    for (let x = 0; x < UW_SIZE; x++) {
      if (open.has(idx(x, y))) continue;
      map.addObject('fortwall', x, y, { material: 'liminal', wallH: UW_WALL_H });
    }
  }
  return {
    spawn: { x: cellX(0) + UW_CW / 2, y: cellY(0) + UW_CW / 2 },
    exit: { x: cellX(deepest[0]) + UW_CW / 2, y: cellY(deepest[1]) + UW_CW / 2 },
  };
}

// Builds the pocket once. The way back up reuses the overworld's own
// portal-tear rendering (renderer.js reads map.ubikPatches off whichever map
// is current) — seeded here as a single permanent entry, never aged or
// culled since the underworld's own update path never runs the overworld's
// ubikPatches aging loop (see main.js: it early-returns before reaching it).
export function createUnderworldPocket(seed) {
  const map = new GameMap(UW_SIZE, UW_SIZE, 'liminal');
  const rng = makeRng(seed >>> 0);
  const { spawn, exit } = carveMaze(map, rng);
  map.ubikPatches = [{ x: exit.x, y: exit.y, r: 1.5, t: 0, portal: true, linkedTo: true }];
  // Same defensive setup as the overworld map gets in main.js — most of this
  // is lazily created on first use anyway (player.js does `x = x || []`
  // throughout, renderer.js guards with `if (map.x)`), but set up front for
  // consistency with how the overworld map starts.
  map.projectiles = [];
  map.bombs = [];
  map.explosions = [];
  return { map, spawnX: spawn.x, spawnY: spawn.y, exitX: exit.x, exitY: exit.y };
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
