import { worldToScreen, screenToWorld, TILE_W } from './iso.js';
import { FLOORS } from '../game/tiles.js';
import { ITEMS, WEAPON_ORDER } from '../game/items.js';
import { drawAnimal } from '../game/animals.js';
import { drawBird } from '../game/birds.js';
import { drawRobot } from '../game/robots.js';
import { drawWaterDroid } from '../game/waterdroids.js';
import { drawUnderworldCreature } from '../game/underworld.js';
import { FLOOR_TEXTURES, WALL_TEXTURES, GRASS_PATCH_TEXTURE, CHARACTER_SPRITE_SETS, CHAR_COMPASS_DIRS, TREE_SHEET, TREE_SPRITES, EDGE_TEXTURE, CAR_SPRITES, CAR_MODEL_KEYS, CAR_DIR_KEYS, CAR_RUIN_TEXTURE, FACTORY_TEXTURE, GRAFFITI_TEXTURES } from './textures.js';

// Maps a facing vector to one of 8 pre-rendered screen-compass directions
// for CHARACTER_SPRITE_SETS (see textures.js) — replaces the old trick of
// rotating one flat top-down icon, which read wrong for a humanoid with a
// visible front/back (facing away would show an upside-down face).
const CHAR_DIR_THETA = { E: 0, SE: 45, S: 90, SW: 135, W: 180, NW: 225, N: 270, NE: 315 };
function facingToCompassDir(facing) {
  const sx = facing.y - facing.x, sy = facing.x + facing.y; // screen-space projection (iso.js worldToScreen); sx negated so screen-left maps to W, not E
  let theta = Math.atan2(sy, sx) * 180 / Math.PI;
  if (theta < 0) theta += 360;
  let best = 'S', bestDiff = Infinity;
  for (const dir of CHAR_COMPASS_DIRS) {
    const diff = Math.min(Math.abs(theta - CHAR_DIR_THETA[dir]), 360 - Math.abs(theta - CHAR_DIR_THETA[dir]));
    if (diff < bestDiff) { bestDiff = diff; best = dir; }
  }
  return best;
}

// One reusable offscreen canvas for compositing a hurt/sprint tint onto a
// sprite before it's drawn to the main canvas — see drawPlayerSprite.
let _tintCanvas = null;
function tintScratch(w, h) {
  if (!_tintCanvas) _tintCanvas = document.createElement('canvas');
  if (_tintCanvas.width !== w || _tintCanvas.height !== h) {
    _tintCanvas.width = w;
    _tintCanvas.height = h;
  }
  return { canvas: _tintCanvas, ctx: _tintCanvas.getContext('2d') };
}

// Canvas renderer. Two passes per frame: floor diamonds first, then all
// "drawables" (objects + player) painter-sorted by world depth (x + y).
// Everything is placeholder art drawn in code; swapping in sprites later
// means replacing the draw* methods only.

const WALL_H = 40;
const EDGE_ROCK_H = 52;   // height of the impassable rock blocks ringing the map edge
const EDGE_ROCK_ALPHA = 0.38; // semi-transparent so the player shows through a block in front
const DASH_H = 78; // dashboard panel height
const SIGHT_CONE = false; // directional peripheral-fog vision cone (off pending tuning)
const ELEV = 16;   // pixels of lift per height level
const MINIMAP_SIZE = 160;

const WALL_BASE = [122, 113, 102];
const TREE_TRUNK = '#5d4630';
const TREE_CANOPY = '#2f5d2b';
const ROCK_COLOR = '#8b8b84';

function shadeHex(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) * (1 + amount)));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) * (1 + amount)));
  const b = Math.max(0, Math.min(255, (n & 255) * (1 + amount)));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function rgbScale([r, g, b], f) {
  return `rgb(${(r * f) | 0},${(g * f) | 0},${(b * f) | 0})`;
}

// The rank for the certificate, banded purely by score.
function deathRank(score) {
  const s = score || 0;
  let title, blurb;
  if (s <= 0) { title = 'LAME'; blurb = 'You achieved precisely nothing. Impressive, in a way.'; }
  else if (s < 100) { title = 'NOOB'; blurb = 'Everyone starts somewhere. You did not get far.'; }
  else if (s < 200) { title = 'BEGINNER'; blurb = 'The basics, grasped. Barely.'; }
  else if (s < 300) { title = 'INTERN'; blurb = 'Unpaid, unnoticed, unalive.'; }
  else if (s < 400) { title = 'NORMIE'; blurb = 'Gloriously average. A credit to the mean.'; }
  else if (s < 600) { title = 'POST-NORMIE'; blurb = 'You have transcended average, if not survival.'; }
  else if (s < 800) { title = 'SEASONED'; blurb = 'Salt, scars, and a healthy fear of rivers.'; }
  else if (s < 1200) { title = 'SERIOUS'; blurb = 'Nobody laughed at your loadout. Nobody.'; }
  else if (s < 1500) { title = 'TRAINED'; blurb = 'Muscle memory and a mean crowbar swing.'; }
  else if (s < 2000) { title = 'SNIPER'; blurb = 'One shot, one less machine. Usually.'; }
  else if (s < 3000) { title = 'AI STALKER'; blurb = 'You hunt the things that hunt you.'; }
  else if (s < 4000) { title = 'L33T'; blurb = 'The towers whisper your name in binary.'; }
  else if (s < 5000) { title = 'L33T PRO'; blurb = 'Professionally terrifying to circuitry.'; }
  else if (s < 10000) { title = 'ULTRA-L33T'; blurb = 'Small children draw you defeating obelisks.'; }
  else { title = 'MEGA L33T'; blurb = 'SKYLINK has a folder named after you. It is afraid.'; }
  const colors = { LAME: '#9a7a5a', NOOB: '#c9905a', BEGINNER: '#c9a05a', INTERN: '#c9b05a', NORMIE: '#b9c95a', 'POST-NORMIE': '#9fd058', SEASONED: '#6fbf4a', SERIOUS: '#4abf7a', TRAINED: '#4ac0b0', SNIPER: '#4aa8d8', 'AI STALKER': '#6f8fe0', L33T: '#e8d27a', 'L33T PRO': '#f0c040', 'ULTRA-L33T': '#f09040', 'MEGA L33T': '#ff5040' };
  return { title, blurb, color: colors[title] || '#e8d27a' };
}

// Cheap deterministic hash for per-tile pseudo-randomness (grass blades)
// that stays put frame to frame instead of shimmering like Math.random().
function tileHash(x, y) {
  let h = (x * 374761393 + y * 668265263) ^ (x * 3266489917);
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

// Ubik patch ageing: a patch (main.js ages `p.t` and culls past
// UBIK_PATCH_LIFE, currently 75s) holds at full brightness, then spends its
// last UBIK_PATCH_FADE_TIME seconds fading back to nothing — kept as sibling
// constants here rather than imported, since main.js imports this module.
// A portal (UBIK_PORTAL_LIFE, 260s in main.js) gets the same fade tail but
// starting much later, since it lives so much longer than a plain patch.
const UBIK_PATCH_FADE_TIME = 15;
const UBIK_PATCH_FADE_START = 60;
const UBIK_PORTAL_FADE_START = 245;

function scaleRgbaAlpha(rgba, factor) {
  const m = rgba.match(/^rgba\(([^,]+),([^,]+),([^,]+),([^)]+)\)$/);
  if (!m) return rgba;
  const a = parseFloat(m[4]) * factor;
  return `rgba(${m[1]},${m[2]},${m[3]},${a.toFixed(3)})`;
}

// Car sprite anchoring: drawCar used to centre every direction's sprite on
// its footprint with the same fixed fraction of the full (padded) canvas —
// fine as long as each direction's actual silhouette sits in the same place
// within its canvas, which it turns out it doesn't (measured: some
// directions' visible pixels are offset several percent off-centre from
// others in the same model). With a random facing that read as rare, faint
// jitter; once cars started being oriented to match the road they're on
// (so certain directions show up reliably rather than by chance), it read
// as the collision box visibly not tracking the sprite's edge. Fixed by
// measuring each sprite's own non-transparent bounding box once (cached
// here) and anchoring to that box's centre — and to 72% down *that box*,
// not the padded canvas — instead of assuming the padding is symmetric.
const carSpriteAnchorCache = new WeakMap();
function carSpriteAnchor(spr) {
  let anchor = carSpriteAnchorCache.get(spr);
  if (anchor) return anchor;
  try {
    const c = document.createElement('canvas');
    c.width = spr.naturalWidth; c.height = spr.naturalHeight;
    const octx = c.getContext('2d');
    octx.drawImage(spr, 0, 0);
    const data = octx.getImageData(0, 0, c.width, c.height).data;
    let minX = c.width, maxX = 0, minY = c.height, maxY = 0, found = false;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        if (data[(y * c.width + x) * 4 + 3] > 10) {
          found = true;
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    anchor = found
      ? { x: (minX + maxX) / 2, y: minY + (maxY - minY) * 0.72 }
      : { x: spr.naturalWidth / 2, y: spr.naturalHeight * 0.72 };
  } catch (e) {
    // Canvas read-back can fail (e.g. a tainted canvas); fall back to the
    // old symmetric-canvas assumption rather than breaking the draw call.
    anchor = { x: spr.naturalWidth / 2, y: spr.naturalHeight * 0.72 };
  }
  carSpriteAnchorCache.set(spr, anchor);
  return anchor;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.w = 0;
    this.h = 0;
    this.dpr = 1;
  }

  resize(w, h, dpr) {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
  }

  draw(camera, map, player, animals = [], hud = {}) {
    const ctx = this.ctx;
    this.uiSlots = []; // clickable dashboard/backpack slots, rebuilt each frame
    this.obeliskHits = []; // clickable obelisk towers (world-screen rects), rebuilt each frame
    this.hudPlayer = player; // referenced by drawWfactory for the near-by damage bar
    this.hudMap = map; // referenced by drawPlayer for the Ubik-patch reality-hiccup check
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#0b0e0a';
    ctx.fillRect(0, 0, this.w, this.h);

    ctx.save();
    camera.applyTransform(ctx, this.w, this.h);

    const range = this.visibleRange(camera, map);

    // The world beyond the map edge is a wall of impassable rock, not a black
    // void. Every visible out-of-bounds tile becomes a raised block; they're
    // pushed into the depth-sorted drawables below (not drawn here) so the
    // ones in front of the player — the south and east edges — sort and
    // occlude correctly instead of being painted over by the grass behind
    // them (the "south looks weird" bug). Only the on-screen edge strip is
    // collected, so mid-map it costs nothing.
    const raw = this.rawVisibleRange(camera);
    const edgeTiles = [];
    for (let y = raw.minY; y <= raw.maxY; y++) {
      for (let x = raw.minX; x <= raw.maxX; x++) {
        if (!map.inBounds(x, y)) edgeTiles.push([x, y]);
      }
    }

    // Pass 1: floors, row-major so lifted (hill) tiles paint over the
    // tiles behind them correctly.
    for (let y = range.minY; y <= range.maxY; y++) {
      for (let x = range.minX; x <= range.maxX; x++) {
        const type = map.floorAt(x, y);
        if (type) this.drawFloor(map, x, y, type, map.shadeAt(x, y));
      }
    }

    // Pass 2: depth-sorted drawables. Objects use their tile centre for
    // depth; the player uses its continuous position.
    const drawables = [];
    for (const obj of map.objects) {
      if (obj.x < range.minX || obj.x > range.maxX || obj.y < range.minY || obj.y > range.maxY) continue;
      // The big 8x8 factory must sort by its centre, not its origin corner —
      // otherwise its low corner-depth let trees and machines behind it draw
      // over the block. Centre depth occludes what's behind and lets what's
      // genuinely in front (south/east of it) still draw on top.
      const depth = (obj.type === 'wfactory' || obj.type === 'mainframe')
        ? obj.x + (obj.fw || 1) / 2 + obj.y + (obj.fh || 1) / 2
        : obj.x + obj.y + 1;
      drawables.push({ depth, obj });
    }
    for (const gi of map.groundItems) {
      if (gi.x < range.minX || gi.x > range.maxX + 1 || gi.y < range.minY || gi.y > range.maxY + 1) continue;
      drawables.push({ depth: gi.x + gi.y - 0.01, groundItem: gi });
    }
    for (const a of animals) {
      if (a.dead) continue;
      if (a.x < range.minX || a.x > range.maxX + 1 || a.y < range.minY || a.y > range.maxY + 1) continue;
      drawables.push({ depth: a.x + a.y, animal: a });
    }
    for (const b of hud.birds || []) {
      if (b.x < range.minX || b.x > range.maxX + 1 || b.y < range.minY || b.y > range.maxY + 1) continue;
      drawables.push({ depth: b.x + b.y, bird: b });
    }
    for (const r of hud.robots || []) {
      if (r.dead) continue;
      if (r.x < range.minX || r.x > range.maxX + 1 || r.y < range.minY || r.y > range.maxY + 1) continue;
      drawables.push({ depth: r.x + r.y, robot: r });
    }
    for (const wd of hud.waterdroids || []) {
      if (wd.dead) continue;
      if (wd.x < range.minX || wd.x > range.maxX + 1 || wd.y < range.minY || wd.y > range.maxY + 1) continue;
      drawables.push({ depth: wd.x + wd.y, droid: wd });
    }
    for (const b of map.bombs || []) {
      if (b.x < range.minX || b.x > range.maxX + 1 || b.y < range.minY || b.y > range.maxY + 1) continue;
      drawables.push({ depth: b.x + b.y - 0.02, bomb: b });
    }
    for (const uc of hud.uwCreatures || []) {
      if (uc.x < range.minX || uc.x > range.maxX + 1 || uc.y < range.minY || uc.y > range.maxY + 1) continue;
      drawables.push({ depth: uc.x + uc.y, uwCreature: uc });
    }
    // Objects draw at depth x+y+1 so a wall occludes what's behind it. That
    // wrongly hides the player standing ON TOP of a wall (the block they're
    // on, and the ones a tile or two in front, would paint over their legs).
    // Lifting the player's sort depth by how high they're standing on a
    // climbable object (effectiveHeightAt above the terrain — 2.5 on a wall)
    // puts them in front of the block they stand on and the near ones, so an
    // elevated player reads as being on top rather than buried in it.
    const pfx = Math.floor(player.x), pfy = Math.floor(player.y);
    const climbRaise = (map.effectiveHeightAt && map.heightAt)
      ? map.effectiveHeightAt(pfx, pfy) - map.heightAt(pfx, pfy) : 0;
    drawables.push({ depth: player.x + player.y + climbRaise, player });
    // Edge rocks sort by their tile depth like anything else, so a south/east
    // block in front of the player draws after (and, being semi-transparent,
    // lets the player show through it) while a north/west block behind draws
    // first.
    for (const [ex, ey] of edgeTiles) drawables.push({ depth: ex + ey + 0.5, edgeRock: [ex, ey] });
    drawables.sort((a, b) => a.depth - b.depth);

    // Everything on a hill tile is lifted by its elevation.
    // effectiveHeightAt includes standing on top of a climbed block (a
    // wall, rubble, a rock), so the player visually lifts the same way
    // climbing a hill already does.
    const elevOf = (x, y) => (map.effectiveHeightAt ? map.effectiveHeightAt(Math.floor(x), Math.floor(y))
      : map.heightAt ? map.heightAt(Math.floor(x), Math.floor(y)) : 0) * ELEV;
    for (const d of drawables) {
      const lift = d.player ? elevOf(player.x, player.y)
        : d.animal ? elevOf(d.animal.x, d.animal.y)
        : d.bird ? elevOf(d.bird.x, d.bird.y)
        : d.robot ? elevOf(d.robot.x, d.robot.y)
        : d.droid ? elevOf(d.droid.x, d.droid.y)
        : d.bomb ? elevOf(d.bomb.x, d.bomb.y)
        : d.uwCreature ? elevOf(d.uwCreature.x, d.uwCreature.y)
        : d.groundItem ? elevOf(d.groundItem.x, d.groundItem.y)
        : d.edgeRock ? 0 // draws its own height from the tile base
        // Objects sit on the terrain height only — NOT effectiveHeightAt.
        // A climbable object (a wall) draws its own extrusion upward from
        // this base; effectiveHeightAt adds its climbHeight so an entity can
        // stand on top, but adding that to the object's own lift would float
        // the whole block up off the ground by its climb height.
        : (map.heightAt ? map.heightAt(d.obj.x, d.obj.y) : 0) * ELEV;
      if (lift) { ctx.save(); ctx.translate(0, -lift); }
      if (d.edgeRock) this.drawEdgeRock(d.edgeRock[0], d.edgeRock[1]);
      else if (d.player) this.drawPlayer(d.player);
      else if (d.animal) { drawAnimal(this.ctx, d.animal, worldToScreen); this.creatureHealthBar(d.animal, player, 44); }
      else if (d.bird) drawBird(this.ctx, d.bird, worldToScreen);
      else if (d.robot) { drawRobot(this.ctx, d.robot, worldToScreen); this.creatureHealthBar(d.robot, player, 48); }
      else if (d.droid) { drawWaterDroid(this.ctx, d.droid, worldToScreen); this.creatureHealthBar(d.droid, player, 40); }
      else if (d.bomb) this.drawBomb(d.bomb);
      else if (d.uwCreature) drawUnderworldCreature(this.ctx, d.uwCreature, worldToScreen);
      else if (d.groundItem) this.drawGroundItem(d.groundItem);
      else this.drawObject(d.obj);
      if (lift) ctx.restore();
    }

    // In-flight rounds, in world space.
    if (map.projectiles) this.drawProjectiles(map.projectiles);
    // Fire clouds from detonating bombs.
    if (map.explosions) this.drawExplosions(map.explosions);
    // Sparks where a weapon just landed on a robot.
    if (map.sparks) this.drawSparks(map.sparks);

    // Lore fragments float in world space, under the camera transform.
    if (hud.lore) hud.lore.drawWorld(ctx);
    // SKYLINK's final purge: every surviving tower lights up and links to
    // its nearest neighbours in a web of bright blue laser light.
    if (hud.skylinkActive) this.drawSkylinkNetwork(hud.obeliskObjs);

    ctx.restore();

    // Ubik: where the can has been sprayed the world is brighter, warmer, more
    // real — a soft-light bloom that lifts the tiles and everything on them.
    // Patches persist on the map. Drawn over the world, under night and HUD.
    // A patch sprayed three times over tears into a portal instead — drawn
    // separately below with its own swirling, more saturated treatment.
    if (map.ubikPatches && map.ubikPatches.length) {
      const z = camera.zoom || 1;
      const cw = worldToScreen(camera.x, camera.y);
      // A slightly stronger breathing pulse than before — both opacity and
      // radius swell and ease back, so a brightened patch visibly lives
      // rather than just holding a flat glow.
      const shimmer = 0.82 + 0.18 * Math.sin(performance.now() / 900);
      const breathe = 0.94 + 0.06 * Math.sin(performance.now() / 900 + 1.1);
      // Each patch fades in quickly, holds, then fades back out to nothing
      // as it ages past UBIK_PATCH_LIFE (main.js ages and culls it) — Ubik's
      // win here is temporary, not a permanent lift on that patch of ground.
      const spots = [];
      const portals = [];
      for (const p of map.ubikPatches) {
        const age = p.t || 0;
        const life = p.portal ? UBIK_PORTAL_FADE_START : UBIK_PATCH_FADE_START;
        const fade = Math.min(1, age / 2) * Math.min(1, Math.max(0, (life - age) / UBIK_PATCH_FADE_TIME + 1));
        if (fade <= 0.01) continue;
        const pw = worldToScreen(p.x, p.y);
        const sx = (pw.x - cw.x) * z + this.w / 2;
        const sy = (pw.y - cw.y) * z + this.h / 2 - 8 * z;
        const R = (p.r || 3) * 24 * z * breathe;
        if (sx < -R - 40 || sx > this.w + R + 40 || sy < -R - 40 || sy > this.h + R + 40) continue;
        (p.portal ? portals : spots).push([sx, sy, R, fade, p]);
      }
      const paint = (list, op, stops) => {
        ctx.save();
        ctx.globalCompositeOperation = op;
        for (const [sx, sy, R, fade] of list) {
          const g = ctx.createRadialGradient(sx, sy, R * 0.1, sx, sy, R);
          for (const [o, c] of stops) g.addColorStop(o, scaleRgbaAlpha(c, fade));
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(sx, sy, R, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      };
      // Pass 1 — 'overlay' deepens colour and contrast so the patch reads as
      // "more real", not merely lit. Pass 2 — 'screen' adds a warm glow that
      // lifts the brightness on top.
      paint(spots, 'overlay', [[0, `rgba(255,240,205,${(0.9 * shimmer).toFixed(3)})`], [0.6, 'rgba(255,235,195,0.5)'], [1, 'rgba(255,235,195,0)']]);
      paint(spots, 'screen', [[0, `rgba(255,246,214,${(0.28 * shimmer).toFixed(3)})`], [0.6, 'rgba(255,240,200,0.12)'], [1, 'rgba(255,240,200,0)']]);
      // Portals: Portal-style two-tone rims — orange for the odd ones out
      // (1st, 3rd, ...), blue for the even ones (2nd, 4th, ...) in creation
      // order, so the common case (exactly two, linked to each other) always
      // reads as one orange end and one blue end. A third mid-chain portal
      // just takes whichever colour its position gives it; the active link
      // is still always oldest<->newest regardless of colour. Drawn as a
      // tall standing oval (squash-scaled around each centre), not a plain
      // circle, closer to a real doorway than a puddle of light.
      if (portals.length) {
        const OVAL_RX = 0.62, OVAL_RY = 1.35;
        const paintOvals = (list, op, stops) => {
          if (!list.length) return;
          ctx.save();
          ctx.globalCompositeOperation = op;
          for (const [sx, sy, R, fade] of list) {
            ctx.save();
            ctx.translate(sx, sy);
            ctx.scale(OVAL_RX, OVAL_RY);
            const g = ctx.createRadialGradient(0, 0, R * 0.1, 0, 0, R);
            for (const [o, c] of stops) g.addColorStop(o, scaleRgbaAlpha(c, fade));
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
          }
          ctx.restore();
        };
        const orangeSet = portals.filter((_, i) => i % 2 === 0);
        const blueSet = portals.filter((_, i) => i % 2 === 1);
        const paintRim = (list, rgb) => {
          paintOvals(list, 'overlay', [[0, `rgba(${rgb},${(0.85 * shimmer).toFixed(3)})`], [0.55, `rgba(${rgb},0.5)`], [1, `rgba(${rgb},0)`]]);
          paintOvals(list, 'screen', [[0, `rgba(${rgb},${(0.32 * shimmer).toFixed(3)})`], [0.55, `rgba(${rgb},0.14)`], [1, `rgba(${rgb},0)`]]);
        };
        paintRim(orangeSet, '255,140,50');
        paintRim(blueSet, '70,160,255');
        // A dark charcoal void right at the core, punched into the middle of
        // the coloured bloom — reads as an actual tear/hole rather than just
        // another bright patch, with the corona glowing around its rim.
        ctx.save();
        for (const [sx, sy, R, fade] of portals) {
          ctx.save();
          ctx.translate(sx, sy);
          ctx.scale(OVAL_RX, OVAL_RY);
          const coreR = R * 0.55;
          const core = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR);
          core.addColorStop(0, `rgba(8,6,12,${(0.92 * fade).toFixed(3)})`);
          core.addColorStop(0.7, `rgba(14,10,20,${(0.75 * fade).toFixed(3)})`);
          core.addColorStop(1, 'rgba(18,13,24,0)');
          ctx.fillStyle = core;
          ctx.beginPath(); ctx.arc(0, 0, coreR, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
        ctx.restore();
        // Fiery rim: several flickering, unevenly-lengthed licks chasing
        // round the oval rather than a few clean uniform arcs — each with
        // its own speed/phase/radius jitter so they read as flame, not a
        // spinning logo. Warm orange licks on the orange end, a "cold
        // flame" cyan-white flicker on the blue end. A linked (usable)
        // portal burns faster and brighter than a dormant one still
        // waiting for a partner.
        const t = performance.now() / 1000;
        ctx.save();
        ctx.lineCap = 'round';
        portals.forEach(([sx, sy, R, fade, p], i) => {
          const isOrange = i % 2 === 0;
          const active = !!p.linkedTo;
          const spin = active ? t * 3.2 : t * 0.8;
          const rr = R * 0.42;
          const petals = 6;
          ctx.save();
          ctx.translate(sx, sy);
          ctx.scale(OVAL_RX, OVAL_RY);
          for (let k = 0; k < petals; k++) {
            const phase = (k * Math.PI * 2) / petals;
            const flicker = 0.5 + 0.5 * Math.sin(t * (5 + k * 1.7) + k * 2.1);
            const a = spin + phase + Math.sin(t * 3 + k) * 0.15;
            const len = 0.55 + flicker * 0.9;
            const rJitter = rr * (0.85 + flicker * 0.3);
            const hue = isOrange
              ? `255,${Math.round(140 + flicker * 90)},${Math.round(30 + flicker * 60)}`
              : `${Math.round(120 + flicker * 90)},${Math.round(190 + flicker * 50)},255`;
            ctx.globalAlpha = fade * (0.35 + flicker * 0.55);
            ctx.strokeStyle = `rgba(${hue},1)`;
            ctx.lineWidth = (1.4 + flicker * 1.6) / Math.min(OVAL_RX, OVAL_RY); // keep the stroke visually even under the squash
            ctx.beginPath();
            ctx.arc(0, 0, rJitter, a, a + len);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
          ctx.restore();
        });
        ctx.restore();
      }
    }

    // Ubik flicker: for a half-beat right after spraying, the old, decayed
    // world flashes through near the sprayed spot — a sickly desaturated,
    // localised pulse (not the whole screen) — before Ubik visibly wins and
    // the flicker dies away. Purely cosmetic (player.ubikFlickerT/X/Y,
    // ticked in Player.update).
    if (hud.ubikFlicker > 0) {
      const t = hud.ubikFlicker / 0.35; // 1 -> 0 over the flicker's life
      const jitter = Math.sin(performance.now() / 28) * 0.5 + 0.5;
      const z = camera.zoom || 1;
      const cw = worldToScreen(camera.x, camera.y);
      const pw = worldToScreen(hud.ubikFlickerX ?? camera.x, hud.ubikFlickerY ?? camera.y);
      const fx = (pw.x - cw.x) * z + this.w / 2;
      const fy = (pw.y - cw.y) * z + this.h / 2 - 8 * z;
      const fR = 140 * z;
      const mask = ctx.createRadialGradient(fx, fy, 0, fx, fy, fR);
      mask.addColorStop(0, 'rgba(255,255,255,1)');
      mask.addColorStop(0.7, 'rgba(255,255,255,0.6)');
      mask.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.save();
      ctx.globalCompositeOperation = 'saturation'; // canvas silently ignores this if unsupported
      ctx.fillStyle = mask;
      ctx.globalAlpha = 0.5 * t * jitter;
      ctx.fillRect(fx - fR, fy - fR, fR * 2, fR * 2);
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 0.22 * t * jitter;
      ctx.fillRect(fx - fR, fy - fR, fR * 2, fR * 2);
      ctx.restore();
    }

    // Night: a dark veil over the world, never over the HUD. A carried
    // torch opens a pool of light around the player; without one you get
    // only a faint arm's-length glimmer.
    if (hud.light != null && hud.light < 1) {
      const dark = (1 - hud.light) * 0.78;
      const z = camera.zoom || 1;
      const pw = worldToScreen(player.x, player.y);
      const cw = worldToScreen(camera.x, camera.y);
      const px = (pw.x - cw.x) * z + this.w / 2;
      const py = (pw.y - cw.y) * z + this.h / 2 - 16 * z;
      const radius = (hud.torch ? 200 : 70) * z;
      const veil = ctx.createRadialGradient(px, py, radius * 0.25, px, py, radius);
      veil.addColorStop(0, `rgba(8,12,28,${Math.max(0, dark - (hud.torch ? 0.72 : 0.3))})`);
      veil.addColorStop(1, `rgba(8,12,28,${dark})`);
      ctx.fillStyle = veil;
      ctx.fillRect(0, 0, this.w, this.h - DASH_H);
      if (hud.torch && dark > 0.2) {
        // Warm flicker-free glow on top of the opened pool.
        const glow = ctx.createRadialGradient(px, py, 0, px, py, radius * 0.8);
        glow.addColorStop(0, 'rgba(255,170,70,0.14)');
        glow.addColorStop(1, 'rgba(255,170,70,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, this.w, this.h - DASH_H);
      }
    }

    // Sight cone: you see clearly in the direction you face (and in a small
    // bubble around yourself); the periphery greys to "indistinct". Turned OFF
    // for now (SIGHT_CONE) — the effect works but wants careful tuning before
    // it goes live; the drawSightCone method is kept ready to switch back on.
    if (SIGHT_CONE && !hud.rest && !hud.deathCert && !hud.paused) {
      const z = camera.zoom || 1;
      const cw = worldToScreen(camera.x, camera.y);
      const pw = worldToScreen(player.x, player.y);
      const fw = worldToScreen(player.x + player.facing.x, player.y + player.facing.y);
      const px = (pw.x - cw.x) * z + this.w / 2;
      const py = (pw.y - cw.y) * z + this.h / 2 - 16 * z;
      const ang = Math.atan2(fw.y - pw.y, fw.x - pw.x);
      this.drawSightCone(px, py, ang, z);
    }

    // The underworld: a sickly, jaundiced wash over the whole play area with
    // a slow, uneven fluorescent flicker — the tell that reality here is
    // thin, distinct from the ordinary day/night veil.
    if (hud.underworld) this.drawUnderworldVeil();

    if (hud.minimap) {
      const mmX = this.w - MINIMAP_SIZE - 12, mmY = 12;
      hud.minimap.draw(ctx, map, player, mmX, mmY, MINIMAP_SIZE);
      this.drawFog(map, mmX, mmY, MINIMAP_SIZE);
      // Tracking skill: nearby animals ping on the minimap.
      if (player.skills && player.skills.has('tracking')) {
        const s = MINIMAP_SIZE / map.w;
        ctx.fillStyle = '#e05548';
        for (const a of animals) {
          if (a.dead || Math.hypot(a.x - player.x, a.y - player.y) > 24) continue;
          ctx.fillRect(mmX + a.x * s - 1, mmY + a.y * s - 1, 2.5, 2.5);
        }
      }
    }
    if (hud.skylinkActive) this.drawSkylinkBanner(hud.skylinkTimer);
    this.drawDashboard(player, hud);
    if (hud.showBackpack) this.drawBackpackPanel(player);
    if (hud.lore) hud.lore.drawOverlay(ctx, this.w, this.h);
    if (hud.craftPrompt) {
      const msg = hud.craftWaveGun
        ? 'You have all eight circuit boards — press C to build a wave gun'
        : hud.craftChip
          ? 'You have eight chip fragments — press C to assemble an access chip'
          : hud.craftSword
            ? 'You have ten scrap — press C to forge a robot sword'
            : 'You hold a stun-gun, electro-gun and Wi-Fi block — press C to build an OB-gun';
      ctx.font = 'bold 13px system-ui, sans-serif';
      const w = ctx.measureText(msg).width + 24;
      const x = (this.w - w) / 2, y = this.h - DASH_H - 40;
      ctx.fillStyle = hud.craftWaveGun ? 'rgba(64,224,208,0.92)' : hud.craftChip ? 'rgba(106,208,160,0.92)' : hud.craftSword ? 'rgba(184,192,200,0.92)' : 'rgba(224,100,47,0.9)';
      ctx.fillRect(x, y, w, 26);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(msg, this.w / 2, y + 17);
      ctx.textAlign = 'left';
    }
    if (hud.showSkills) this.drawSkillModal(player);
    if (hud.showWeapons) this.drawWeaponChart(player);
    if (hud.detail) this.drawDetail(hud.detail);
    if (hud.drag) this.drawDragGhost(hud.drag, player);
    if (hud.rest) this.drawRestOverlay(hud.rest.dim);
    if (hud.deathCert) this.drawDeathCert(hud.deathCert);
    if (hud.paused) this.drawPausedOverlay();
  }

  // Peripheral indistinctness: a gentle dim over the play area, cleared in a
  // broad region centred AHEAD of the player so you read what you're facing
  // and everything to the sides and behind fades softly to indistinct. No
  // hard wedge edges and no tight pool (which read as a torch) — the clear
  // zone is a big soft radial offset forward, so the falloff is gradual all
  // the way round. Composited on an offscreen layer first: `destination-out`
  // erases the DESTINATION, so doing it on the main canvas would eat the world.
  drawSightCone(px, py, ang, z) {
    const ctx = this.ctx;
    const playH = this.h - DASH_H;
    const dpr = this.dpr;
    if (!this._sightCanvas) this._sightCanvas = document.createElement('canvas');
    const off = this._sightCanvas;
    const dw = Math.max(1, Math.round(this.w * dpr)), dh = Math.max(1, Math.round(this.h * dpr));
    if (off.width !== dw || off.height !== dh) { off.width = dw; off.height = dh; }
    const octx = off.getContext('2d');
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    octx.clearRect(0, 0, this.w, this.h);
    // A greyish fog veil — "indistinct", washed-out rather than dark, so what
    // it covers reads as out of clear sight rather than merely unlit.
    octx.fillStyle = 'rgba(116,122,138,0.58)';
    octx.fillRect(0, 0, this.w, playH);
    octx.globalCompositeOperation = 'destination-out';
    // Directional clear: a LINEAR gradient along the facing axis, centred on
    // the player — fully clear ahead, transitioning through you, to fully
    // fogged behind. This is what makes "behind is grey" actually happen (a
    // forward-offset radial still cleared the area behind you).
    const A = 560 * z;
    const ax = px + Math.cos(ang) * A, ay = py + Math.sin(ang) * A;
    const bx = px - Math.cos(ang) * A, by = py - Math.sin(ang) * A;
    const lg = octx.createLinearGradient(ax, ay, bx, by);
    lg.addColorStop(0, 'rgba(0,0,0,1)');      // ahead: fully clear
    lg.addColorStop(0.42, 'rgba(0,0,0,0.82)');
    lg.addColorStop(0.62, 'rgba(0,0,0,0.28)');
    lg.addColorStop(1, 'rgba(0,0,0,0)');      // behind: stays fully fogged grey
    octx.fillStyle = lg;
    octx.fillRect(0, 0, this.w, playH);
    // Keep your immediate surroundings clear too, so turning never fogs the
    // ground right at your feet.
    const near = octx.createRadialGradient(px, py, 16 * z, px, py, 165 * z);
    near.addColorStop(0, 'rgba(0,0,0,1)');
    near.addColorStop(1, 'rgba(0,0,0,0)');
    octx.fillStyle = near;
    octx.fillRect(0, 0, this.w, playH);
    octx.globalCompositeOperation = 'source-over';
    // Blit device-for-device onto the main canvas.
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(off, 0, 0);
    ctx.restore();
  }

  // A soft dim over the play area while the player rests (the dashboard, and
  // so the spinning clock, stays bright so you can watch time pass).
  drawRestOverlay(dim) {
    const ctx = this.ctx;
    const playH = this.h - DASH_H;
    ctx.fillStyle = `rgba(4,6,10,${dim.toFixed(3)})`;
    ctx.fillRect(0, 0, this.w, playH);
    ctx.save();
    ctx.globalAlpha = Math.min(1, dim / 0.72);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(222,227,236,0.92)';
    ctx.font = '600 20px system-ui, sans-serif';
    ctx.fillText('Resting…', this.w / 2, playH / 2);
    ctx.fillStyle = 'rgba(200,205,215,0.7)';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('time is passing', this.w / 2, playH / 2 + 22);
    ctx.restore();
  }

  // A flat sepia-yellow wash plus an uneven fluorescent flicker (two
  // overlapping slow sine phases rather than one clean pulse, so it never
  // reads as a deliberate light show) — cheap, screen-space, and enough on
  // its own to make the underworld read as somewhere else without needing
  // per-tile texture work.
  drawUnderworldVeil() {
    const ctx = this.ctx;
    const playH = this.h - DASH_H;
    const flicker = 0.5 + 0.5 * Math.sin(performance.now() / 340) * 0.6 + 0.4 * Math.sin(performance.now() / 970 + 1.7);
    ctx.fillStyle = `rgba(150,132,60,${(0.16 + 0.05 * flicker).toFixed(3)})`;
    ctx.fillRect(0, 0, this.w, playH);
    ctx.fillStyle = `rgba(30,26,10,${(0.12 - 0.04 * flicker).toFixed(3)})`;
    ctx.fillRect(0, 0, this.w, playH);
  }

  // The weapon chart (V): every weapon in the game, with a power rating.
  // Found ones show full and named; ones still to find are faded, unnamed,
  // and marked with a "?".
  drawWeaponChart(player) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(6,8,5,0.82)';
    ctx.fillRect(0, 0, this.w, this.h);
    const pw = Math.min(480, this.w - 50), rowH = 30;
    const ph = Math.min(this.h - 60, 90 + WEAPON_ORDER.length * rowH);
    const px = Math.round((this.w - pw) / 2), py = Math.round((this.h - ph) / 2);
    this._weaponsRect = { x: px, y: py, w: pw, h: ph }; // click-away-to-close hit test (main.js)
    ctx.fillStyle = '#12160e';
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = 'rgba(207,216,195,0.4)';
    ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);

    ctx.fillStyle = '#cfd8c3';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText('Armoury', px + 20, py + 30);
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(207,216,195,0.55)';
    const found = WEAPON_ORDER.filter((k) => player.weaponsFound && player.weaponsFound.has(k)).length;
    ctx.fillText(`${found} of ${WEAPON_ORDER.length} found · V to close`, px + 20, py + 48);

    let y = py + 74;
    for (const key of WEAPON_ORDER) {
      const def = ITEMS[key];
      if (!def) continue;
      const has = player.weaponsFound && player.weaponsFound.has(key);
      ctx.globalAlpha = has ? 1 : 0.32;
      // icon
      this.drawItemIcon(def, px + 34, y + 8, 0.7);
      // name (hidden until found)
      ctx.fillStyle = '#e8e0d0';
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText(has ? def.name : '??? undiscovered', px + 58, y + 12);
      // power bar
      const barX = px + pw - 130, barW = 100, pwr = def.power || 1;
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(barX, y + 4, barW, 8);
      ctx.fillStyle = has ? '#e8d27a' : 'rgba(207,216,195,0.4)';
      ctx.fillRect(barX, y + 4, barW * (pwr / 10), 8);
      ctx.fillStyle = 'rgba(207,216,195,0.7)';
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillText(`pwr ${pwr}`, barX + barW + 6, y + 12);
      ctx.globalAlpha = 1;
      y += rowH;
    }
  }

  // The skills screen (K): learned book-skills in the order gained, plus the
  // three practice tracks and their levels — the history the dashboard used
  // to cram into one line.
  drawSkillModal(player) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(6,8,5,0.8)';
    ctx.fillRect(0, 0, this.w, this.h);
    const pw = Math.min(420, this.w - 60), ph = 380;
    const px = Math.round((this.w - pw) / 2), py = Math.round((this.h - ph) / 2);
    this._skillsRect = { x: px, y: py, w: pw, h: ph }; // click-away-to-close hit test (main.js)
    ctx.fillStyle = '#12160e';
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = 'rgba(207,216,195,0.4)';
    ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);

    ctx.fillStyle = '#cfd8c3';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText('Skills & Knowledge', px + 20, py + 30);
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(207,216,195,0.55)';
    ctx.fillText('K to close · all of it survives death', px + 20, py + 48);

    let y = py + 78;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(207,216,195,0.6)';
    ctx.fillText('PRACTICE', px + 20, y); y += 20;
    ctx.font = '13px system-ui, sans-serif';
    const tracks = [['Swordarm (melee)', 'melee'], ['Aim (guns)', 'guns'], ['Mind (reading)', 'knowledge']];
    for (const [label, key] of tracks) {
      const lvl = player.xpLevel ? player.xpLevel(key) : 0;
      ctx.fillStyle = '#e8e0d0';
      ctx.fillText(label, px + 30, y);
      ctx.fillStyle = '#e8d27a';
      ctx.textAlign = 'right';
      ctx.fillText(`level ${lvl}`, px + pw - 24, y);
      ctx.textAlign = 'left';
      y += 22;
    }
    y += 12;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(207,216,195,0.6)';
    ctx.fillText('BOOKS READ', px + 20, y); y += 20;
    ctx.font = '13px system-ui, sans-serif';
    const log = player.skillLog && player.skillLog.length ? player.skillLog
      : [...(player.skills || [])].map((s) => ({ skill: s }));
    if (!log.length) {
      ctx.fillStyle = 'rgba(207,216,195,0.5)';
      ctx.font = 'italic 13px system-ui, sans-serif';
      ctx.fillText('No books read yet. Find them in the ruins.', px + 30, y);
    } else {
      const NAMES = { woodcraft: 'Woodcraft', herbalism: 'Herbalism', tracking: 'Tracking', fleetfoot: 'Fleet foot' };
      let n = 1;
      for (const e of log) {
        if (y > py + ph - 16) break;
        ctx.fillStyle = '#e8e0d0';
        ctx.fillText(`${n}. ${NAMES[e.skill] || e.skill}`, px + 30, y);
        if (e.day) {
          ctx.fillStyle = 'rgba(207,216,195,0.5)';
          ctx.textAlign = 'right';
          ctx.fillText(`day ${e.day}`, px + pw - 24, y);
          ctx.textAlign = 'left';
        }
        y += 22; n += 1;
      }
    }
    // Kill record: the obelisks you've brought down, by their hex code names.
    if (player.killLog && player.killLog.length) {
      y += 14;
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(207,216,195,0.6)';
      ctx.fillText(`TOWERS DOWNED (${player.killLog.length})`, px + 20, y); y += 18;
      ctx.font = '12px ui-monospace, monospace';
      ctx.fillStyle = '#e0503a';
      const codes = player.killLog.join('  ');
      for (const line of this._wrapText(ctx, codes, pw - 50)) {
        if (y > py + ph - 12) break;
        ctx.fillText(line, px + 30, y); y += 16;
      }
    }
  }

  // Right-click inspection tooltip, near the cursor.
  drawDetail(d) {
    const ctx = this.ctx;
    ctx.font = '12px system-ui, sans-serif';
    const maxW = 260;
    const lines = this._wrapText(ctx, d.text, maxW);
    const boxW = Math.min(maxW, Math.max(...lines.map((l) => ctx.measureText(l).width))) + 20;
    const boxH = 12 + lines.length * 15;
    let x = d.x + 14, y = d.y + 14;
    if (x + boxW > this.w) x = d.x - boxW - 14;
    if (y + boxH > this.h) y = d.y - boxH - 14;
    const a = Math.min(1, d.ttl);
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(10,14,8,0.92)';
    ctx.fillRect(x, y, boxW, boxH);
    ctx.strokeStyle = 'rgba(207,216,195,0.45)';
    ctx.strokeRect(x + 0.5, y + 0.5, boxW - 1, boxH - 1);
    ctx.fillStyle = '#dfe6d4';
    let ly = y + 16;
    for (const l of lines) { ctx.fillText(l, x + 10, ly); ly += 15; }
    ctx.globalAlpha = 1;
  }

  _wrapText(ctx, text, maxW) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  // The item being dragged, drawn under the cursor.
  drawDragGhost(drag, player) {
    if (!player.getSlot) return;
    const s = player.getSlot(drag.from);
    if (!s) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(drag.mx - 18, drag.my - 18, 36, 36);
    this.drawItemIcon(ITEMS[s.item], drag.mx, drag.my, 0.9);
    ctx.restore();
  }

  // A certificate of death: a modal listing the run's achievements and an
  // amusing rank. Click anywhere to dismiss (handled in main).
  drawDeathCert(cert) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(4,6,3,0.85)';
    ctx.fillRect(0, 0, this.w, this.h);
    const pw = Math.min(440, this.w - 60), ph = 340;
    const px = Math.round((this.w - pw) / 2), py = Math.round((this.h - ph) / 2);
    this._certBounds = { x: px, y: py, w: pw, h: ph }; // for the S-to-share capture
    ctx.fillStyle = '#141810';
    ctx.fillRect(px, py, pw, ph);
    // A weathered stone-and-gravel texture (the same photo used to face the
    // map's edge cliffs) behind the certificate, so it reads as something
    // carved rather than a flat UI panel — a dark tint on top keeps the text
    // readable over it.
    if (EDGE_TEXTURE.complete && EDGE_TEXTURE.naturalWidth) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.drawImage(EDGE_TEXTURE, px, py, pw, ph);
      ctx.restore();
      ctx.fillStyle = 'rgba(10,12,8,0.55)';
      ctx.fillRect(px, py, pw, ph);
    }
    ctx.strokeStyle = 'rgba(207,216,195,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 1, py + 1, pw - 2, ph - 2);
    ctx.lineWidth = 1;

    // A small portrait of who this was, bottom-left, so the certificate
    // pictures the survivor it's naming rather than only naming them.
    const portraitSet = CHARACTER_SPRITE_SETS[cert.gender || 'm'];
    const portrait = portraitSet && portraitSet.idle && portraitSet.idle.S;
    if (portrait && portrait.complete && portrait.naturalWidth) {
      const ps = 56;
      const pptx = px + 24, ppty = py + ph - ps - 16;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(pptx - 4, ppty - 4, ps + 8, ps + 8);
      ctx.strokeStyle = 'rgba(207,216,195,0.4)';
      ctx.strokeRect(pptx - 4, ppty - 4, ps + 8, ps + 8);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(portrait, pptx, ppty, ps, ps);
      ctx.restore();
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = cert.victory ? '#6fbf4a' : '#b0392f';
    ctx.font = 'bold 22px Georgia, serif';
    ctx.fillText(cert.victory ? 'THE TOWERS ARE DOWN' : 'CERTIFICATE OF DEATH', px + pw / 2, py + 42);
    ctx.strokeStyle = 'rgba(207,216,195,0.3)';
    ctx.beginPath(); ctx.moveTo(px + 40, py + 56); ctx.lineTo(px + pw - 40, py + 56); ctx.stroke();

    ctx.fillStyle = '#cfd8c3';
    ctx.font = '14px Georgia, serif';
    if (cert.victory) {
      ctx.fillText(`${cert.name || 'A survivor'} pulled down every obelisk.`, px + pw / 2, py + 88);
      ctx.fillText('The machines forget. SKYLINK never wakes.', px + pw / 2, py + 108);
    } else if (cert.skylink) {
      ctx.fillText('SKYLINK-9000 is online.', px + pw / 2, py + 88);
      ctx.fillText(`${cert.name || 'You'} ran out of days.`, px + pw / 2, py + 108);
    } else {
      ctx.fillText(`Here lies ${cert.name || 'a survivor'},`, px + pw / 2, py + 88);
      ctx.fillText(`taken by ${cert.cause}.`, px + pw / 2, py + 108);
    }

    const rank = deathRank(cert.score);
    ctx.textAlign = 'left';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(207,216,195,0.9)';
    const lx = px + 48;
    const valX = lx + 150;
    const valMaxW = px + pw - 40 - valX; // never let a long value run past the panel edge
    let y = py + 148;
    const row = (label, val) => {
      ctx.fillStyle = 'rgba(207,216,195,0.65)'; ctx.fillText(label, lx, y);
      ctx.fillStyle = '#e8e0d0';
      const lines = this._wrapText(ctx, String(val), valMaxW);
      for (const l of lines) { ctx.fillText(l, valX, y); y += 18; }
      y += 8;
    };
    row('Final score', cert.score);
    row('Skills mastered', cert.skills.length ? cert.skills.join(', ') : 'none');
    row('Deaths so far', cert.deaths);

    ctx.textAlign = 'center';
    ctx.font = 'bold 30px Georgia, serif';
    ctx.fillStyle = rank.color;
    ctx.fillText(rank.title, px + pw / 2, py + ph - 58);
    ctx.font = 'italic 13px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(207,216,195,0.7)';
    ctx.fillText(rank.blurb, px + pw / 2, py + ph - 34);
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(207,216,195,0.5)';
    ctx.fillText('S or Copy to copy as an image · click elsewhere to carry on', px + pw / 2, py + ph - 14);
    ctx.textAlign = 'left';

    // Copy-to-clipboard button, tucked under the divider so it never
    // overlaps the title above it or the epitaph text below.
    const btnW = 70, btnH = 20;
    const btnX = px + pw - btnW - 16, btnY = py + 62;
    this._certCopyBtn = { x: btnX, y: btnY, w: btnW, h: btnH };
    ctx.fillStyle = 'rgba(207,216,195,0.14)';
    ctx.fillRect(btnX, btnY, btnW, btnH);
    ctx.strokeStyle = 'rgba(207,216,195,0.5)';
    ctx.strokeRect(btnX + 0.5, btnY + 0.5, btnW - 1, btnH - 1);
    ctx.fillStyle = '#e8e0d0';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Copy', btnX + btnW / 2, btnY + 14);
    ctx.textAlign = 'left';
  }

  // Crops the certificate panel out of the live canvas and copies it to the
  // clipboard as a PNG, so it can be pasted to share outside the game.
  // Returns 'clipboard', or null if there was nothing to capture or the
  // browser won't allow copying images.
  async shareCertificate() {
    const b = this._certBounds;
    if (!b) return null;
    const dpr = this.dpr || 1;
    const off = document.createElement('canvas');
    off.width = Math.round(b.w * dpr);
    off.height = Math.round(b.h * dpr);
    off.getContext('2d').drawImage(
      this.canvas,
      Math.round(b.x * dpr), Math.round(b.y * dpr), Math.round(b.w * dpr), Math.round(b.h * dpr),
      0, 0, off.width, off.height,
    );
    const blob = await new Promise((resolve) => off.toBlob(resolve, 'image/png'));
    if (!blob) return null;
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        return 'clipboard';
      }
    } catch { /* denied or unsupported */ }
    return null;
  }

  // Read-only backpack view (I). Read-only because the split between
  // pockets and backpack is already automatic — there's nothing to drag.
  drawBackpackPanel(player) {
    const ctx = this.ctx;
    const cols = 4, size = 42, gap = 14;
    const gridW = cols * size + (cols - 1) * gap;
    const panelW = gridW + 40;
    const panelH = 420;
    const px = Math.round((this.w - panelW) / 2);
    const py = Math.round((this.h - panelH) / 2);
    this._backpackRect = { x: px, y: py, w: panelW, h: panelH }; // click-away-to-close hit test (main.js)

    ctx.fillStyle = 'rgba(10,12,8,0.94)';
    ctx.fillRect(px, py, panelW, panelH);
    ctx.strokeStyle = 'rgba(207,216,195,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, panelW - 1, panelH - 1);

    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillStyle = '#e8e0d0';
    ctx.fillText('BACKPACK', px + 20, py + 26);
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(207,216,195,0.6)';
    ctx.textAlign = 'right';
    ctx.fillText('I to close', px + panelW - 20, py + 26);
    ctx.textAlign = 'left';

    if (!player.backpack) {
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(207,216,195,0.7)';
      ctx.fillText("You aren't carrying one yet.", px + 20, py + 60);
      return;
    }

    // Spare weapon slot: select with 5, swap with G, same as a pocket.
    const weaponY = py + 42;
    this.drawLabel('SPARE WEAPON — click or 5+G', px + 20, weaponY + 10);
    this.drawSlot(px + 20, weaponY + 16, size,
      player.backpack.weapon ? ITEMS[player.backpack.weapon] : null, 0, player.selectedPocket === 'bw');
    this.uiSlots.push({ x: px + 20, y: weaponY + 16, w: size, h: size, kind: 'bw' });
    if (player.backpack.weapon) {
      ctx.font = '9px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(207,216,195,0.7)';
      ctx.fillText(ITEMS[player.backpack.weapon].name, px + 20 + size + 10, weaponY + 16 + size / 2 + 3);
    }

    // 16-slot storage grid: fills automatically; food and ammo are drawn
    // from here on their own once the pockets run out.
    const gridX = px + 20, gridY = weaponY + 16 + size + 34;
    this.drawLabel('STORAGE — auto-fills; food & ammo used automatically', gridX, gridY - 8);
    for (let i = 0; i < 16; i++) {
      const col = i % cols, row = Math.floor(i / cols);
      const sx = gridX + col * (size + gap);
      const sy = gridY + row * (size + gap);
      const slot = player.backpack.slots[i];
      this.drawSlot(sx, sy, size, slot ? ITEMS[slot.item] : null, slot ? slot.qty : 0);
      this.uiSlots.push({ x: sx, y: sy, w: size, h: size, kind: 'bpstore', i });
      if (slot) {
        ctx.font = '7px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(207,216,195,0.6)';
        ctx.textAlign = 'center';
        ctx.fillText(ITEMS[slot.item].name, sx + size / 2, sy + size + 9, size + 10);
        ctx.textAlign = 'left';
      }
    }
  }

  // In-flight rounds: a short bright streak travelling from muzzle to target.
  drawProjectiles(projectiles) {
    const ctx = this.ctx;
    for (const p of projectiles) {
      const t = Math.max(0, Math.min(1, p.prog));
      const cx = p.x0 + (p.x1 - p.x0) * t, cy = p.y0 + (p.y1 - p.y0) * t;
      const bx = p.x0 + (p.x1 - p.x0) * Math.max(0, t - 0.12);
      const by = p.y0 + (p.y1 - p.y0) * Math.max(0, t - 0.12);
      const head = worldToScreen(cx, cy);
      const tail = worldToScreen(bx, by);
      const col = p.kind === 'stun' ? '#5fe0ff' : p.kind === 'fuse' ? '#b78bff'
        : p.kind === 'laser' ? '#ff3b2a' : p.kind === 'laser_t3' ? '#ff8a1e' : '#ffe27a';
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tail.x, tail.y - 18);
      ctx.lineTo(head.x, head.y - 18);
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(head.x, head.y - 18, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineCap = 'butt';
    }
  }

  // A dropped bomb, ticking. A dark canister with a blinking light whose
  // pulse quickens as the fuse runs down.
  drawBomb(b) {
    const ctx = this.ctx;
    const s = worldToScreen(b.x, b.y);
    const y = s.y - 6;
    // Body.
    ctx.fillStyle = '#2b2b30';
    ctx.beginPath();
    ctx.ellipse(s.x, y, 9, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = ITEMS[b.key] ? ITEMS[b.key].color : '#c0552f';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Blink: faster as the fuse nears zero.
    const rate = Math.max(0.08, b.fuse * 0.25);
    const on = Math.floor(b.fuse / rate) % 2 === 0;
    ctx.fillStyle = on ? '#ff3b30' : '#5a1512';
    ctx.beginPath();
    ctx.arc(s.x, y - 8, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Fire clouds: expanding rings of flame that fade over their short life.
  drawExplosions(explosions) {
    const ctx = this.ctx;
    for (const e of explosions) {
      const k = 1 - e.ttl / e.max;          // 0 → 1 over the life
      const s = worldToScreen(e.x, e.y);
      const rx = e.radius * (TILE_W / 2) * (0.4 + 0.6 * k);
      const ry = rx * 0.5;
      const alpha = (1 - k) * 0.8;
      ctx.save();
      // Outer smoke/heat.
      ctx.globalAlpha = alpha * 0.5;
      ctx.fillStyle = '#3a2016';
      ctx.beginPath();
      ctx.ellipse(s.x, s.y - 10, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      // Flame bursts.
      const puffs = 10;
      for (let i = 0; i < puffs; i++) {
        const ang = (i / puffs) * Math.PI * 2;
        const rr = rx * (0.3 + 0.7 * ((i % 3) / 3 + k * 0.5));
        const px = s.x + Math.cos(ang) * rr;
        const py = s.y - 10 + Math.sin(ang) * rr * 0.5;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = i % 2 ? '#ff7a1a' : '#ffd23b';
        ctx.beginPath();
        ctx.arc(px, py, Math.max(2, rx * 0.18 * (1 - k)), 0, Math.PI * 2);
        ctx.fill();
      }
      // Bright core.
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#fff1c0';
      ctx.beginPath();
      ctx.ellipse(s.x, s.y - 10, rx * 0.3 * (1 - k), ry * 0.3 * (1 - k), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // A quick burst of bright sparks where a weapon just landed on a robot.
  drawSparks(sparks) {
    const ctx = this.ctx;
    for (const sp of sparks) {
      const k = 1 - sp.ttl / sp.max; // 0 → 1 over the life
      const s = worldToScreen(sp.x, sp.y);
      const n = 6;
      ctx.save();
      ctx.globalAlpha = 1 - k;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 + k * 2;
        const r = 3 + k * 12;
        const px = s.x + Math.cos(ang) * r;
        const py = s.y - 14 - Math.sin(ang) * r * 0.6;
        ctx.strokeStyle = i % 2 ? '#fff1c0' : '#ffd23b';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y - 14);
        ctx.lineTo(px, py);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // A small health bar floating over a creature or machine the player is
  // standing near, so you can read how damaged it is. Hidden for the dead,
  // fused wrecks, and drained/friendly machines.
  creatureHealthBar(e, player, headH) {
    if (e.dead || e.fused || e.drained || e.singing) return; // no damage bar mid-choir
    if (Math.hypot(e.x - player.x, e.y - player.y) > 6.5) return;
    const max = e.maxHp || e.hp || 1;
    const frac = Math.max(0, Math.min(1, (e.hp ?? max) / max));
    const ctx = this.ctx;
    const c = worldToScreen(e.x, e.y);
    const w = 22, h = 3.5, x = c.x - w / 2, y = c.y - headH;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = frac > 0.5 ? '#6fbf4a' : frac > 0.22 ? '#d8a04f' : '#d84f3a';
    ctx.fillRect(x, y, w * frac, h);
  }

  // Which dashboard/backpack slot (if any) is under a screen point. Later
  // entries (the backpack panel, drawn on top) win over earlier ones.
  slotAt(mx, my) {
    for (let k = this.uiSlots.length - 1; k >= 0; k--) {
      const s = this.uiSlots[k];
      if (mx >= s.x && mx <= s.x + s.w && my >= s.y && my <= s.y + s.h) return s;
    }
    return null;
  }

  // Inverse-project the screen corners to get the visible tile bounding box.
  // Generous padding on the far side so tall objects just off-screen south
  // still draw their upper parts.
  visibleRange(camera, map) {
    const c = worldToScreen(camera.x, camera.y);
    const z = camera.zoom || 1;
    const hw = this.w / (2 * z), hh = this.h / (2 * z);
    const corners = [
      screenToWorld(c.x - hw, c.y - hh),
      screenToWorld(c.x + hw, c.y - hh),
      screenToWorld(c.x - hw, c.y + hh),
      screenToWorld(c.x + hw, c.y + hh),
    ];
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    return {
      minX: Math.max(0, Math.floor(Math.min(...xs)) - 2),
      maxX: Math.min(map.w - 1, Math.ceil(Math.max(...xs)) + 4),
      minY: Math.max(0, Math.floor(Math.min(...ys)) - 2),
      maxY: Math.min(map.h - 1, Math.ceil(Math.max(...ys)) + 4),
    };
  }

  // The same visible window, but NOT clamped to the map — so the out-of-bounds
  // border (drawn as rock) can extend to the screen edge. A tile cap keeps a
  // pathological zoom-out from trying to fill an enormous area.
  rawVisibleRange(camera) {
    const c = worldToScreen(camera.x, camera.y);
    const z = camera.zoom || 1;
    const hw = this.w / (2 * z), hh = this.h / (2 * z);
    const corners = [
      screenToWorld(c.x - hw, c.y - hh), screenToWorld(c.x + hw, c.y - hh),
      screenToWorld(c.x - hw, c.y + hh), screenToWorld(c.x + hw, c.y + hh),
    ];
    const xs = corners.map((p) => p.x), ys = corners.map((p) => p.y);
    return {
      minX: Math.floor(Math.min(...xs)) - 2, maxX: Math.ceil(Math.max(...xs)) + 4,
      minY: Math.floor(Math.min(...ys)) - 2, maxY: Math.ceil(Math.max(...ys)) + 4,
    };
  }

  // A block of impassable rock filling one out-of-bounds tile at the map
  // edge — an extruded diamond prism, faced with the road-stone texture and
  // drawn semi-transparent so if one stands between you and the camera you
  // still see yourself through it. Per-tile shade variation keeps the border
  // from reading as one flat slab.
  drawEdgeRock(tx, ty) {
    const ctx = this.ctx;
    const H = EDGE_ROCK_H;
    const tex = EDGE_TEXTURE;
    const ready = tex && tex.complete && tex.naturalWidth;
    const shade = 0.9 + tileHash(tx * 7 + 3, ty * 5 + 1) * 0.2;
    const base = [96 * shade, 100 * shade, 108 * shade];
    const [t0, t1, t2, t3] = this.tileCorners(tx, ty, H);
    const [, b1, b2, b3] = this.tileCorners(tx, ty);
    // One face: flat stone base then the road texture over it, both at the
    // same block alpha so the whole face is uniformly see-through.
    const face = (corners, flat) => {
      const [p0, p1, , p3] = corners;
      ctx.save();
      ctx.globalAlpha = EDGE_ROCK_ALPHA;
      ctx.transform(p1.x - p0.x, p1.y - p0.y, p3.x - p0.x, p3.y - p0.y, p0.x, p0.y);
      ctx.fillStyle = flat;
      ctx.fillRect(0, 0, 1, 1);
      if (ready) { ctx.globalAlpha = EDGE_ROCK_ALPHA * 0.8; ctx.drawImage(tex, 0, 0, 1, 1); }
      ctx.restore();
    };
    face([b3, b2, t2, t3], rgbScale(base, 0.7));  // south-west face
    face([b1, b2, t2, t1], rgbScale(base, 0.52)); // south-east face
    face([t0, t1, t2, t3], rgbScale(base, 1));    // top
    ctx.save();
    ctx.globalAlpha = EDGE_ROCK_ALPHA;
    this.diamondPath([t0, t1, t2, t3]);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
  }

  tileCorners(tx, ty, lift = 0) {
    const top = worldToScreen(tx, ty);
    const right = worldToScreen(tx + 1, ty);
    const bottom = worldToScreen(tx + 1, ty + 1);
    const left = worldToScreen(tx, ty + 1);
    if (lift) {
      top.y -= lift; right.y -= lift; bottom.y -= lift; left.y -= lift;
    }
    return [top, right, bottom, left];
  }

  diamondPath(corners) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    ctx.lineTo(corners[1].x, corners[1].y);
    ctx.lineTo(corners[2].x, corners[2].y);
    ctx.lineTo(corners[3].x, corners[3].y);
    ctx.closePath();
  }

  // Warps `img` to exactly fill the quadrilateral `corners` (must be a
  // parallelogram — true of every floor diamond and wall face here: corner
  // order is [origin, +u edge, +u+v corner, +v edge]). No explicit clip is
  // needed: drawImage/fillRect's destination rect (0,0,1,1) already maps,
  // via the transform below, to exactly that parallelogram and no further —
  // ctx.clip() was here originally but is one of the more expensive canvas
  // 2D calls, and doing it on every floor tile and wall face, every frame,
  // was a real performance regression (severe enough to make close-range
  // interactions like re-collecting a dropped item feel broken). The flat
  // colour is always painted first and the photo blended over it at
  // `textureAlpha` (a busy, high-contrast photo at full strength read as
  // noisy against this game's flatter palette) — that base colour is also
  // what shows if the image hasn't loaded yet. An optional tint layers on
  // top via `tintMode` ('multiply' to darken/colourise, 'screen' to
  // lighten) so day-night and decay shading still applies the same way it
  // did to a flat fill.
  // Four corners of a fractional sub-rectangle (u0..u1 along the p0->p1
  // edge, v0..v1 along the p0->p3 edge) of a parallelogram — itself always
  // a parallelogram, so it's directly usable with drawTexturedQuad. Used to
  // warp graffiti onto a band of a wall face rather than the whole thing.
  subQuad(p0, p1, p3, u0, u1, v0, v1) {
    const ex = p1.x - p0.x, ey = p1.y - p0.y;
    const fx = p3.x - p0.x, fy = p3.y - p0.y;
    const at = (u, v) => ({ x: p0.x + ex * u + fx * v, y: p0.y + ey * u + fy * v });
    return [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)];
  }

  drawTexturedQuad(corners, img, fallbackColor, tintColor, tintMode, textureAlpha = 0.55) {
    const ctx = this.ctx;
    const [p0, p1, , p3] = corners;
    // Canvas sources (e.g. pre-rendered graffiti text) are always ready to
    // draw immediately, unlike an Image that may still be loading.
    const ready = img && (img instanceof HTMLCanvasElement || (img.complete && img.naturalWidth));
    ctx.save();
    const ex = p1.x - p0.x, ey = p1.y - p0.y;
    const fx = p3.x - p0.x, fy = p3.y - p0.y;
    ctx.transform(ex, ey, fx, fy, p0.x, p0.y);
    if (fallbackColor) {
      ctx.fillStyle = fallbackColor;
      ctx.fillRect(0, 0, 1, 1);
    }
    if (ready) {
      ctx.globalAlpha = textureAlpha;
      ctx.drawImage(img, 0, 0, 1, 1);
      ctx.globalAlpha = 1;
      if (tintColor) {
        ctx.globalCompositeOperation = tintMode || 'multiply';
        ctx.fillStyle = tintColor;
        ctx.fillRect(0, 0, 1, 1);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    ctx.restore();
  }

  drawFloor(map, tx, ty, type, shade) {
    const ctx = this.ctx;
    const def = FLOORS[type];
    const h = map.heightAt ? map.heightAt(tx, ty) : 0;
    const corners = this.tileCorners(tx, ty, h * ELEV);
    // Skirts: visible hillside faces wherever the south/east neighbour sits
    // lower, including level ground dropping into a hollow.
    if (map.heightAt) {
      const hs = map.heightAt(tx, ty + 1);
      if (hs < h) this.skirt(corners[3], corners[2], (h - hs) * ELEV, shadeHex(def.color, shade - 0.3));
      const he = map.heightAt(tx + 1, ty);
      if (he < h) this.skirt(corners[1], corners[2], (h - he) * ELEV, shadeHex(def.color, shade - 0.45));
    }
    // A sparse scatter of bare dirt patches through grass — a few percent
    // of tiles, deterministic per tile so it holds still frame to frame
    // rather than flickering between the two textures.
    const patchy = (type === 'grass' || type === 'tallgrass') && tileHash(tx * 5 + 2, ty * 5 + 7) < 0.05;
    const tex = patchy ? GRASS_PATCH_TEXTURE : FLOOR_TEXTURES[type];
    if (tex) {
      let tintColor = null, tintMode = 'multiply';
      if (shade < -0.02) tintColor = `rgba(10,10,12,${Math.min(0.85, -shade)})`;
      else if (shade > 0.02) { tintColor = `rgba(255,255,255,${Math.min(0.45, shade)})`; tintMode = 'screen'; }
      // Grass is by far the busiest photo (a mass of high-frequency blade
      // detail) and reads as noisy even at the general texture alpha —
      // toned down further, on top of the grass-blade strokes already
      // drawn over it. The dirt patch variant can hold a bit more strength.
      const baseAlpha = patchy ? 0.4 : (type === 'grass' || type === 'tallgrass') ? 0.28 : type === 'sand' ? 0.32 : 0.55;
      // Vary the texture opacity subtly per tile (deterministic, so it holds
      // still frame to frame) — a gentle ±10% breaks up an otherwise flat
      // expanse of the same floor without reading as a patchwork.
      let alpha = Math.max(0.12, Math.min(0.85, baseAlpha * (0.9 + 0.2 * tileHash(tx * 3 + 11, ty * 3 + 5))));
      // River and stream tiles carry a slow travelling opacity ripple (phased
      // off tx+ty rather than pure per-tile random, so it reads as a pulse
      // moving along the watercourse) — a cheap stand-in for flowing water
      // without an actual scrolling texture.
      if (type === 'water' || type === 'stream') {
        const flow = 0.5 + 0.5 * Math.sin((tx + ty) * 0.6 - performance.now() / 260);
        alpha = Math.max(0.12, Math.min(0.85, alpha + flow * 0.14 - 0.07));
      }
      this.drawTexturedQuad(corners, tex, shadeHex(def.color, shade), tintColor, tintMode, alpha);
    } else {
      this.diamondPath(corners);
      ctx.fillStyle = shadeHex(def.color, shade);
      ctx.fill();
    }
    this.diamondPath(corners);
    ctx.strokeStyle = 'rgba(0,0,0,0.07)';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (type === 'grass' || type === 'tallgrass') this.drawGrassBlades(tx, ty, corners, def.color, shade);
    // The maze's "way out" trail: once solved, a lit floor-stud on each tile of
    // the solution path (a green guide, so it never reads as danger). Textured
    // like every glow, and rolled along the trail so it looks like it's flowing
    // back toward the door.
    if (map.mazeGuideLit && map.mazeGuide && map.mazeGuide.has(ty * map.w + tx)) {
      const cx = (corners[0].x + corners[2].x) / 2, cy = (corners[0].y + corners[2].y) / 2;
      const wave = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(performance.now() / 520 - (tx + ty) * 0.5));
      this.texturedGlow(cx, cy, 5, 2.6, `rgba(90,240,150,${wave.toFixed(3)})`, 7, 0.5, 'aigrate');
    }
  }

  // A handful of small blade strokes per tile so grass reads as textured
  // turf rather than a flat colour fill. Hashed from tile coordinates so
  // the pattern holds still frame to frame instead of shimmering.
  drawGrassBlades(tx, ty, corners, color, shade) {
    const ctx = this.ctx;
    const cx = (corners[0].x + corners[2].x) / 2;
    const cy = (corners[0].y + corners[2].y) / 2;
    // Sparse: most tiles stay bare, a scattering carry one or two blades, so
    // the texture reads as flecks of turf rather than a dense lawn.
    const density = tileHash(tx * 3 + 1, ty * 3 + 2);
    const n = density < 0.55 ? 0 : density < 0.85 ? 1 : 2;
    for (let i = 0; i < n; i++) {
      const h1 = tileHash(tx * 7 + i * 3, ty * 13 + i * 5);
      const h2 = tileHash(tx * 11 + i * 17 + 1, ty * 5 + i * 23 + 1);
      const ox = (h1 - 0.5) * 24;
      const oy = (h2 - 0.5) * 10;
      const lean = (h1 - 0.5) * 3;
      const len = 4 + h2 * 4;
      ctx.strokeStyle = shadeHex(color, shade + (h2 > 0.5 ? -0.25 : 0.2));
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx + ox, cy + oy + 3);
      ctx.lineTo(cx + ox + lean, cy + oy - len);
      ctx.stroke();
    }
  }

  skirt(a, b, depth, color) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(b.x, b.y + depth);
    ctx.lineTo(a.x, a.y + depth);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  drawObject(obj) {
    switch (obj.type) {
      case 'wall':
        this.drawWall(obj);
        break;
      case 'tree': this.drawTree(obj); break;
      case 'rock': this.drawRock(obj.x, obj.y); break;
      case 'rubble': this.drawRubble(obj.x, obj.y); break;
      case 'obelisk': this.drawObelisk(obj); break;
      case 'box': this.drawBox(obj); break;
      case 'car': this.drawCar(obj); break;
      case 'wfactory': this.drawWfactory(obj); break;
      case 'fortwall': this.drawFortWall(obj); break;
      case 'fortdoor': this.drawFortDoor(obj); break;
      case 'gateterm': this.drawGateTerm(obj); break;
      case 'mainframe': this.drawMainframe(obj); break;
      case 'uplink': this.drawUplink(obj); break;
    }
  }

  // The red uplink mast: a tall dark spar with a red-caged beacon at its head,
  // wiring the fortress into SKYLINK. Wrecked once hammered down.
  drawUplink(obj) {
    const ctx = this.ctx;
    const s = worldToScreen(obj.x + 0.5, obj.y + 0.5);
    if (obj.destroyed) {
      ctx.fillStyle = '#2a1416';
      ctx.beginPath(); ctx.moveTo(s.x - 8, s.y); ctx.lineTo(s.x + 8, s.y); ctx.lineTo(s.x + 4, s.y - 10); ctx.lineTo(s.x - 5, s.y - 8); ctx.closePath(); ctx.fill();
      return;
    }
    const H = 62;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(s.x, s.y + 2, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
    // Mast: a narrow dark red-black spar.
    ctx.fillStyle = '#3a1416';
    ctx.beginPath();
    ctx.moveTo(s.x - 4, s.y); ctx.lineTo(s.x + 4, s.y);
    ctx.lineTo(s.x + 2.5, s.y - H); ctx.lineTo(s.x - 2.5, s.y - H); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1; ctx.stroke();
    // Cross-strut near the top, and the red beacon (textured glow, slow pulse).
    ctx.strokeStyle = '#521a1c'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(s.x - 7, s.y - H + 14); ctx.lineTo(s.x + 7, s.y - H + 14); ctx.stroke();
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 620);
    this.texturedGlow(s.x, s.y - H + 2, 4.5, 5.5, `rgba(255,42,32,${(0.5 + 0.45 * pulse).toFixed(3)})`, 12, 0.5, 'aigrate');
  }

  // --- Adamantine's fortress (southern annex) ------------------------------
  // A single fortress-rampart block: a tall, non-climbable extruded metal
  // prism. Pylons (flanking the doorway) stand taller and carry a red beacon.
  // CONVENTION: every glowing fixture in the game goes through here so it's
  // never a flat coloured blob — a grille/panel texture is always laid over the
  // glow (the factory-vent trick). If you add a new light, use texturedGlow.
  // An optional soft bloom behind, the glow colour, then an AI grate texture
  // clipped to the ellipse so it reads as a lit fixture caged in the hull.
  texturedGlow(cx, cy, rx, ry, color, bloom = 0, texAlpha = 0.5, texKey = 'aigrate') {
    const ctx = this.ctx;
    // 1. A soft outer bloom drawn BEHIND, so its blurred bleed reads as a halo
    //    around the fixture rather than washing out the fixture's own tips.
    if (bloom) {
      ctx.save();
      ctx.shadowColor = color; ctx.shadowBlur = bloom;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // 2. The crisp fixture on top: fill the ellipse solid, then lay the texture
    //    over the WHOLE clip (square sized to the longer axis so a tall, thin
    //    oval is covered corner to corner, right into the tips).
    ctx.save();
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = color;
    ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
    const tex = WALL_TEXTURES[texKey] || WALL_TEXTURES.metal;
    if (tex && tex.complete && tex.naturalWidth) {
      ctx.globalAlpha = texAlpha;
      const s = Math.max(rx, ry) * 2;
      ctx.drawImage(tex, cx - s / 2, cy - s / 2, s, s);
    }
    ctx.restore();
  }

  drawFortWall(obj) {
    const ctx = this.ctx;
    const H = obj.wallH || (obj.pylon ? 78 : 52);
    const g = {
      top: worldToScreen(obj.x, obj.y), right: worldToScreen(obj.x + 1, obj.y),
      bottom: worldToScreen(obj.x + 1, obj.y + 1), left: worldToScreen(obj.x, obj.y + 1),
    };
    const r = { top: { x: g.top.x, y: g.top.y - H }, right: { x: g.right.x, y: g.right.y - H },
      bottom: { x: g.bottom.x, y: g.bottom.y - H }, left: { x: g.left.x, y: g.left.y - H } };
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.moveTo(g.top.x, g.top.y + 4); ctx.lineTo(g.right.x, g.right.y + 4);
    ctx.lineTo(g.bottom.x, g.bottom.y + 4); ctx.lineTo(g.left.x, g.left.y + 4); ctx.closePath(); ctx.fill();
    // Riveted metal for the outer rampart; darker "AI" panel/grate/vent designs
    // for the inner maze, each with its own dim base tint.
    const tex = WALL_TEXTURES[obj.material] || WALL_TEXTURES.metal;
    // liminal: the underworld's damp, jaundiced drywall — no image texture of
    // its own, so it rides the 'metal' fallback tex heavily tinted toward
    // this colour (drawTexturedQuad's multiply pass dominates at this alpha).
    const WALL_BASE_TINT = { darkstone: [34, 33, 38], aiwall: [40, 46, 56], aigrate: [28, 29, 33], aivent: [44, 48, 52], liminal: [150, 132, 68] };
    const base = WALL_BASE_TINT[obj.material] || [46, 50, 56];
    this.drawTexturedQuad([g.left, g.bottom, r.bottom, r.left], tex, rgbScale(base, 0.7), rgbScale(base, 0.7), 'multiply', 0.85);
    this.drawTexturedQuad([g.bottom, g.right, r.right, r.bottom], tex, rgbScale(base, 0.5), rgbScale(base, 0.5), 'multiply', 0.85);
    this.drawTexturedQuad([r.top, r.right, r.bottom, r.left], tex, rgbScale(base, 0.95), rgbScale(base, 0.95), 'multiply', 0.5);
    this.diamondPath([r.top, r.right, r.bottom, r.left]);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.2; ctx.stroke();
    if (obj.pylon) {
      const c = { x: (r.top.x + r.bottom.x) / 2, y: (r.top.y + r.bottom.y) / 2 };
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 500);
      this.texturedGlow(c.x, c.y, 4.5, 2.8, `rgba(255,60,60,${(0.45 + 0.5 * pulse).toFixed(3)})`, 6);
    }
    // Sconce light on the wall's front (SE) face, glowing slowly on its own
    // phase (~5.6s cycle) so a run of maze walls shimmers gently out of sync.
    if (obj.light) {
      const hue = obj.lightHue === 'amber' ? [255, 176, 64] : [95, 214, 255];
      const pulse = 0.28 + 0.6 * (0.5 + 0.5 * Math.sin(performance.now() / 900 + (obj.lightPhase || 0)));
      const fx = (g.bottom.x + g.right.x + r.right.x + r.bottom.x) / 4;
      const fy = (g.bottom.y + g.right.y + r.right.y + r.bottom.y) / 4 - 3;
      const col = `rgba(${hue[0]},${hue[1]},${hue[2]},${pulse.toFixed(3)})`;
      // Textured like every other glow (grate over the light — the sconce reads
      // as a caged lamp, not a plain dot).
      this.texturedGlow(fx, fy, 2.8, 4.6, col, 12, 0.55, 'aigrate');
    }
  }

  // The grand doorway. Solid metal until hacked; a lock beacon burns red while
  // locked and green once the hack throws its bolts (the door object is removed
  // from the grid when the key actually opens it, so this only shows closed).
  drawFortDoor(obj) {
    const ctx = this.ctx, H = 64;
    const g = {
      top: worldToScreen(obj.x, obj.y), right: worldToScreen(obj.x + 1, obj.y),
      bottom: worldToScreen(obj.x + 1, obj.y + 1), left: worldToScreen(obj.x, obj.y + 1),
    };
    const r = { top: { x: g.top.x, y: g.top.y - H }, right: { x: g.right.x, y: g.right.y - H },
      bottom: { x: g.bottom.x, y: g.bottom.y - H }, left: { x: g.left.x, y: g.left.y - H } };
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.moveTo(g.top.x, g.top.y + 4); ctx.lineTo(g.right.x, g.right.y + 4);
    ctx.lineTo(g.bottom.x, g.bottom.y + 4); ctx.lineTo(g.left.x, g.left.y + 4); ctx.closePath(); ctx.fill();
    const tex = WALL_TEXTURES.metal, base = [40, 40, 48];
    this.drawTexturedQuad([g.left, g.bottom, r.bottom, r.left], tex, rgbScale(base, 0.62), rgbScale(base, 0.62), 'multiply', 0.92);
    this.drawTexturedQuad([g.bottom, g.right, r.right, r.bottom], tex, rgbScale(base, 0.46), rgbScale(base, 0.46), 'multiply', 0.92);
    this.drawTexturedQuad([r.top, r.right, r.bottom, r.left], tex, rgbScale(base, 0.82), rgbScale(base, 0.82), 'multiply', 0.5);
    const lit = obj.hacked;
    const fc = { x: (g.bottom.x + g.right.x) / 2, y: (g.bottom.y + g.right.y) / 2 - H / 2 };
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / (lit ? 300 : 700));
    const col = lit ? `rgba(90,240,140,${(0.55 + 0.45 * pulse).toFixed(3)})` : `rgba(240,70,60,${(0.55 + 0.4 * pulse).toFixed(3)})`;
    this.texturedGlow(fc.x, fc.y, 5.5, 5.5, col, 10);
  }

  // The gate console kiosk: a low pedestal with a glowing green screen.
  drawGateTerm(obj) {
    const ctx = this.ctx, H = 22;
    const s = worldToScreen(obj.x + 0.5, obj.y + 0.5);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(s.x, s.y + 2, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2a2e33'; ctx.fillRect(s.x - 7, s.y - H, 14, H);
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 280);
    ctx.fillStyle = `rgba(90,220,140,${(0.45 + 0.4 * pulse).toFixed(3)})`;
    ctx.fillRect(s.x - 6, s.y - H + 2, 12, 9);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(s.x - 7, s.y - H, 14, H);
  }

  // Adamantine's mainframe core: a tall, near-black metal monolith with a
  // vertical slit of magenta light burning up its front face. Goes cold and
  // grey once defeated. A damage bar floats over it when hurt and you're near.
  drawMainframe(obj) {
    const ctx = this.ctx, fw = obj.fw || 6, fh = obj.fh || 6;
    const cx = obj.x + fw / 2, cy = obj.y + fh / 2, H = 122, dead = obj.defeated;
    const g = {
      top: worldToScreen(obj.x, obj.y), right: worldToScreen(obj.x + fw, obj.y),
      bottom: worldToScreen(obj.x + fw, obj.y + fh), left: worldToScreen(obj.x, obj.y + fh),
    };
    const r = { top: { x: g.top.x, y: g.top.y - H }, right: { x: g.right.x, y: g.right.y - H },
      bottom: { x: g.bottom.x, y: g.bottom.y - H }, left: { x: g.left.x, y: g.left.y - H } };
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.beginPath(); ctx.moveTo(g.top.x, g.top.y + 8); ctx.lineTo(g.right.x, g.right.y + 8);
    ctx.lineTo(g.bottom.x, g.bottom.y + 8); ctx.lineTo(g.left.x, g.left.y + 8); ctx.closePath(); ctx.fill();
    const tex = WALL_TEXTURES.metal, base = dead ? [32, 32, 36] : [26, 24, 32];
    this.drawTexturedQuad([g.left, g.bottom, r.bottom, r.left], tex, rgbScale(base, 0.7), rgbScale(base, 0.7), 'multiply', 0.92);
    this.drawTexturedQuad([g.bottom, g.right, r.right, r.bottom], tex, rgbScale(base, 0.5), rgbScale(base, 0.5), 'multiply', 0.92);
    this.drawTexturedQuad([r.top, r.right, r.bottom, r.left], tex, rgbScale(base, 0.9), rgbScale(base, 0.9), 'multiply', 0.5);
    this.diamondPath([r.top, r.right, r.bottom, r.left]);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / (dead ? 2000 : 520));
    const glow = dead ? 'rgba(120,120,130,0.22)' : `rgba(214,90,220,${(0.45 + 0.5 * pulse).toFixed(3)})`;
    const fb = { x: (g.bottom.x + g.right.x) / 2, y: (g.bottom.y + g.right.y) / 2 };
    this.texturedGlow(fb.x, fb.y - H / 2, 6.5, H * 0.32, glow, dead ? 0 : 18, 0.85);
    const labelC = worldToScreen(cx, obj.y + fh);
    ctx.font = 'bold 14px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = dead ? '#6a6a72' : '#e0a8e6';
    ctx.fillText((obj.ai || 'ADAMANTINE').toUpperCase(), labelC.x, labelC.y - H * 0.62);
    ctx.textAlign = 'left';
    const p = this.hudPlayer;
    if (!dead && obj.hp != null && obj.maxHp && obj.hp < obj.maxHp && p && Math.hypot(p.x - cx, p.y - cy) < 16) {
      const t = worldToScreen(cx, cy), bw = 130, bh = 9, bx = t.x - bw / 2, by = t.y - H - 24, frac = Math.max(0, obj.hp / obj.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
      ctx.fillStyle = '#3a3f46'; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = frac > 0.5 ? '#c24ac2' : frac > 0.25 ? '#e0b53a' : '#e05548'; ctx.fillRect(bx, by, bw * frac, bh);
    }
  }

  // The W-factory: a big 8x8 riveted-metal foundry, an extruded prism faced
  // with the train texture. Once it's a walkable heap (destroyed) it draws as
  // scorched rubble. A damage bar floats over it while it's hurt and you're
  // near, and a dull orange vent pulses on the roof.
  drawWfactory(obj) {
    const ctx = this.ctx;
    const fw = obj.fw || 1, fh = obj.fh || 1;
    const cx = obj.x + fw / 2, cy = obj.y + fh / 2;
    if (obj.destroyed) {
      // A flattened, scorched footprint — a few dark heaps of slag.
      for (let i = 0; i < 10; i++) {
        const hx = obj.x + 0.6 + tileHash(obj.x + i, obj.y * 2 + i) * (fw - 1.2);
        const hy = obj.y + 0.6 + tileHash(obj.x * 3 + i, obj.y + i * 2) * (fh - 1.2);
        const p = worldToScreen(hx, hy);
        ctx.fillStyle = i % 2 ? '#211d18' : '#2c2620';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 12, 6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }

    const H = 84; // tall industrial block
    const g = {
      top: worldToScreen(obj.x, obj.y),
      right: worldToScreen(obj.x + fw, obj.y),
      bottom: worldToScreen(obj.x + fw, obj.y + fh),
      left: worldToScreen(obj.x, obj.y + fh),
    };
    const r = {
      top: { x: g.top.x, y: g.top.y - H },
      right: { x: g.right.x, y: g.right.y - H },
      bottom: { x: g.bottom.x, y: g.bottom.y - H },
      left: { x: g.left.x, y: g.left.y - H },
    };
    // Ground shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.moveTo(g.top.x, g.top.y + 6); ctx.lineTo(g.right.x, g.right.y + 6);
    ctx.lineTo(g.bottom.x, g.bottom.y + 6); ctx.lineTo(g.left.x, g.left.y + 6);
    ctx.closePath(); ctx.fill();

    const base = [58, 54, 50];
    // Two visible faces, train-textured, then a darker roof.
    this.drawTexturedQuad([g.left, g.bottom, r.bottom, r.left], FACTORY_TEXTURE, rgbScale(base, 0.7), rgbScale(base, 0.7), 'multiply', 0.7);
    this.drawTexturedQuad([g.bottom, g.right, r.right, r.bottom], FACTORY_TEXTURE, rgbScale(base, 0.5), rgbScale(base, 0.5), 'multiply', 0.7);
    this.drawTexturedQuad([r.top, r.right, r.bottom, r.left], FACTORY_TEXTURE, rgbScale(base, 0.95), rgbScale(base, 0.95), 'multiply', 0.35);
    // Roof outline + a pulsing vent block.
    this.diamondPath([r.top, r.right, r.bottom, r.left]);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
    const roofC = { x: (r.top.x + r.bottom.x) / 2, y: (r.top.y + r.bottom.y) / 2 };
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 420);
    ctx.save();
    ctx.beginPath(); ctx.ellipse(roofC.x, roofC.y, 16, 8, 0, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = `rgba(224,120,40,${(0.35 + 0.4 * pulse).toFixed(3)})`;
    ctx.fillRect(roofC.x - 16, roofC.y - 8, 32, 16);
    // A grubby metal grille over the glow so the vent isn't a clean flat oval.
    if (FACTORY_TEXTURE && FACTORY_TEXTURE.complete && FACTORY_TEXTURE.naturalWidth) {
      ctx.globalAlpha = 0.4;
      ctx.drawImage(FACTORY_TEXTURE, roofC.x - 16, roofC.y - 8, 32, 16);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    // Label on the near face.
    const labelC = worldToScreen(cx, obj.y + fh);
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillStyle = '#c8ccd2';
    ctx.textAlign = 'center';
    ctx.fillText('W-FACTORY', labelC.x, labelC.y - H * 0.55);
    ctx.textAlign = 'left';

    // Damage bar above the roof when it's been hit and the player is near.
    const p = this.hudPlayer;
    if (obj.hp != null && obj.maxHp && obj.hp < obj.maxHp && p
      && Math.hypot(p.x - cx, p.y - cy) < 14) {
      const facTop = worldToScreen(cx, cy);
      const bw = 110, bh = 8;
      const bx = facTop.x - bw / 2, by = facTop.y - H - 20;
      const frac = Math.max(0, obj.hp / obj.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
      ctx.fillStyle = '#3a3f46';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = frac > 0.5 ? '#6cc24a' : frac > 0.25 ? '#e0b53a' : '#e05548';
      ctx.fillRect(bx, by, bw * frac, bh);
    }
  }

  // Sprayed lore fragment, warped onto the wall's south-east face like it's
  // actually painted on the tilted surface — it used to draw as flat,
  // unwarped text at a fixed screen offset, so as the camera panned the
  // wall's face perspective shifted under it while the text didn't,
  // reading as floating in front of the block rather than on it.
  drawGraffiti(obj, seFace) {
    const ctx = this.ctx;
    // Rendered once per object onto a small offscreen canvas and cached —
    // it's static text, no need to re-rasterize it every frame.
    if (!obj._graffitiCanvas) {
      const c = document.createElement('canvas');
      c.width = 200; c.height = 48;
      const octx = c.getContext('2d');
      octx.font = 'italic bold 26px monospace';
      octx.textAlign = 'center';
      octx.textBaseline = 'middle';
      // Doubting tags (RON is dead, no one is coming, ...) are painted
      // fainter and greyer, as if older or written by a less certain hand —
      // the game never settles whether the resistance is still out there.
      octx.fillStyle = obj.graffitiFaded ? 'rgba(180,178,170,0.8)' : 'rgba(190,40,36,0.88)';
      octx.fillText(obj.graffiti, 100, 24);
      obj._graffitiCanvas = c;
    }
    const jitter = (tileHash(obj.x, obj.y) - 0.5) * 0.12;
    // Orientation on the wall's SE face. subQuad's basis is u along b1 -> b2
    // and v along b1 -> t1. drawTexturedQuad maps the text canvas so its own
    // +x (left -> right of the text) follows p0 -> p1 and its own +y (top ->
    // bottom) follows p0 -> p3. To read upright and un-mirrored on the face
    // as the player sees it, the text's +x must point screen-rightward and
    // its +y screen-downward, which means passing BOTH bounds high-then-low:
    // u 0.94 -> 0.06 (un-mirror) and v 0.62 -> 0.28 (right way up). Verified
    // in-game against "THE WIRES LIE".
    const quad = this.subQuad(seFace[0], seFace[1], seFace[3], 0.94, 0.06, 0.62 + jitter, 0.28 + jitter);
    this.drawTexturedQuad(quad, obj._graffitiCanvas, null, null, null, 1);
  }

  // A rarer, older register of wall-marking: an actual weathered poster/mural
  // photo (assets/textures/graffiti/) rather than painted text — see
  // paintGraffiti in worldgen.js, which flags obj.graffitiImage with an index
  // into GRAFFITI_TEXTURES. Same face-mapping convention as drawGraffiti
  // (un-mirror + right-way-up — see its comment), a touch larger to read as a
  // stuck-on poster, with a dark backing (torn paper) and a grimy multiply
  // tint so a bright old photo doesn't look pasted on straight out of a
  // camera roll.
  drawGraffitiPoster(obj, seFace) {
    const tex = GRAFFITI_TEXTURES[obj.graffitiImage % GRAFFITI_TEXTURES.length];
    const jitter = (tileHash(obj.x + 3, obj.y + 7) - 0.5) * 0.08;
    const quad = this.subQuad(seFace[0], seFace[1], seFace[3], 0.90, 0.10, 0.70 + jitter, 0.20 + jitter);
    this.drawTexturedQuad(quad, tex, '#1c1a16', 'rgba(30,22,14,0.35)', 'multiply', 0.9);
  }

  // A wall is an extruded diamond prism: two visible faces plus a top.
  // obj.decay (0..5: new / old / older / mossy / breaking / crumbling)
  // greys and darkens the stone, lowers and roughens the top, and adds
  // cracks and moss, so a distributed range reads as a decaying ruin.
  drawWall(obj) {
    const ctx = this.ctx;
    const tx = obj.x, ty = obj.y;
    const decay = Math.max(0, Math.min(5, obj.decay || 0));
    const age = decay / 5;
    // Older stone loses height; the top gets a per-wall jitter so a run of
    // crumbling wall reads as an uneven broken edge.
    const jag = decay >= 4 ? (tileHash(tx * 3 + 1, ty * 3 + 7) - 0.5) * 0.22 : 0;
    const hf = (decay >= 5 ? 0.6 : decay >= 4 ? 0.82 : 1) + jag;
    const H = WALL_H * hf;
    // Red brick or grey stone; either weathers (darkens) as it ages.
    const matBase = obj.material === 'brick' ? [150, 74, 58] : WALL_BASE;
    const base = [
      matBase[0] * (1 - age * 0.26),
      matBase[1] * (1 - age * 0.14),
      matBase[2] * (1 - age * 0.30),
    ];

    const [b0, b1, b2, b3] = this.tileCorners(tx, ty);
    const [t0, t1, t2, t3] = this.tileCorners(tx, ty, H);

    const wallTex = WALL_TEXTURES[obj.material === 'brick' ? 'brick' : 'stone'];
    const swFace = [b3, b2, t2, t3], seFace = [b1, b2, t2, t1];
    if (wallTex) {
      this.drawTexturedQuad(swFace, wallTex, rgbScale(base, 0.72), rgbScale(base, 0.72), 'multiply');
      this.drawTexturedQuad(seFace, wallTex, rgbScale(base, 0.55), rgbScale(base, 0.55), 'multiply');
    } else {
      ctx.beginPath(); // south-west face
      ctx.moveTo(b3.x, b3.y); ctx.lineTo(b2.x, b2.y);
      ctx.lineTo(t2.x, t2.y); ctx.lineTo(t3.x, t3.y);
      ctx.closePath();
      ctx.fillStyle = rgbScale(base, 0.72);
      ctx.fill();

      ctx.beginPath(); // south-east face
      ctx.moveTo(b1.x, b1.y); ctx.lineTo(b2.x, b2.y);
      ctx.lineTo(t2.x, t2.y); ctx.lineTo(t1.x, t1.y);
      ctx.closePath();
      ctx.fillStyle = rgbScale(base, 0.55);
      ctx.fill();
    }

    // Top face. On a textured wall the top gets the SAME stone/brick texture
    // as the sides but at a low opacity, so it reads as the same material yet
    // clearly a distinct (flatter, top-lit) surface rather than a hard flat
    // cap. Untextured walls keep the plain fill.
    if (wallTex) {
      this.drawTexturedQuad([t0, t1, t2, t3], wallTex, rgbScale(base, 1), null, null, 0.22);
    } else {
      this.diamondPath([t0, t1, t2, t3]);
      ctx.fillStyle = rgbScale(base, 1);
      ctx.fill();
    }
    this.diamondPath([t0, t1, t2, t3]); // top outline
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Brick coursing: faint mortar lines across the south-east face.
    if (obj.material === 'brick') {
      ctx.strokeStyle = 'rgba(230,220,205,0.14)';
      ctx.lineWidth = 1;
      for (let k = 1; k <= 3; k++) {
        const t = k / 4;
        ctx.beginPath();
        ctx.moveTo(b1.x + (t1.x - b1.x) * t, b1.y + (t1.y - b1.y) * t);
        ctx.lineTo(b2.x + (t2.x - b2.x) * t, b2.y + (t2.y - b2.y) * t);
        ctx.stroke();
      }
    }

    // Cracks appear from "older" onward: a couple of thin dark seams down
    // the south-east face.
    if (decay >= 2) {
      ctx.strokeStyle = 'rgba(0,0,0,0.28)';
      ctx.lineWidth = 1;
      const seams = decay >= 4 ? 2 : 1;
      for (let i = 0; i < seams; i++) {
        const t = 0.3 + tileHash(tx + i * 5, ty * 2 + i) * 0.4;
        const bx = b1.x + (b2.x - b1.x) * t, byy = b1.y + (b2.y - b1.y) * t;
        const txx = t1.x + (t2.x - t1.x) * t, tyy = t1.y + (t2.y - t1.y) * t;
        ctx.beginPath();
        ctx.moveTo(bx, byy);
        ctx.lineTo(txx + (tileHash(i, tx) - 0.5) * 4, tyy + 4);
        ctx.stroke();
      }
    }

    // Moss from "mossy" onward: a few soft green patches on the top edge
    // and the shaded face.
    if (decay >= 3) {
      const patches = 2 + decay - 3;
      for (let i = 0; i < patches; i++) {
        const h1 = tileHash(tx * 9 + i * 13, ty * 7 + i * 3);
        const h2 = tileHash(tx * 5 + i * 11 + 2, ty * 17 + i);
        const onTop = h1 < 0.5;
        const px = (onTop ? (t0.x + t2.x) / 2 : (b3.x + t2.x) / 2) + (h1 - 0.5) * 22;
        const py = (onTop ? (t0.y + t2.y) / 2 : (b3.y + t3.y) / 2) + (h2 - 0.5) * 14;
        ctx.fillStyle = `rgba(74, 104, 58, ${0.28 + h2 * 0.22})`;
        ctx.beginPath();
        ctx.ellipse(px, py, 2 + h1 * 3, 1.5 + h2 * 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (obj.graffitiImage != null) this.drawGraffitiPoster(obj, [b1, b2, t2, t1]);
    else if (obj.graffiti) this.drawGraffiti(obj, [b1, b2, t2, t1]);
  }

  drawTree(obj) {
    const ctx = this.ctx;
    const c = worldToScreen(obj.x + 0.5, obj.y + 0.5);
    // Hit wobble: canopy and trunk-top sway while obj.shake ticks down.
    const wob = obj.shake ? Math.sin(obj.shake * 45) * obj.shake * 14 : 0;
    // Three kinds of tree, plus a growth scale for saplings that grow in.
    const variant = obj.variant || 0;
    const g = Math.max(0.35, Math.min(1, obj.grow == null ? 1 : obj.grow));

    // Hand-drawn tree art (assets/textures/trees.png) cut out per variant.
    // The sprite carries its own baked shadow, so it's positioned with its
    // base at the tile centre; the wobble rotates it a hair about that base.
    // Falls back to the procedural tree below until the sheet has loaded.
    const spr = TREE_SPRITES[variant % TREE_SPRITES.length];
    if (spr && TREE_SHEET && TREE_SHEET.complete && TREE_SHEET.naturalWidth) {
      const BASE = 0.72;          // sheet px -> screen px for a full-grown tree
      const dw = spr.sw * BASE * g, dh = spr.sh * BASE * g;
      ctx.save();
      ctx.translate(c.x, c.y + 3);   // pivot at the trunk base (shadow sits here)
      if (wob) ctx.rotate(wob * 0.012);
      ctx.drawImage(TREE_SHEET, spr.sx, spr.sy, spr.sw, spr.sh, -dw / 2, -dh, dw, dh);
      ctx.restore();
      this.treeDamageBar(obj, c.x, c.y + 3 - dh - 4);
      return;
    }

    const trunkH = 26 * g;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, 12 * g, 6 * g, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = TREE_TRUNK;
    ctx.beginPath();
    ctx.moveTo(c.x - 3 * g, c.y);
    ctx.lineTo(c.x + 3 * g, c.y);
    ctx.lineTo(c.x + 3 * g + wob * 0.4, c.y - trunkH);
    ctx.lineTo(c.x - 3 * g + wob * 0.4, c.y - trunkH);
    ctx.closePath();
    ctx.fill();
    const cy = c.y - trunkH - 12 * g, cx = c.x + wob;
    if (variant === 1) {
      // Conifer: stacked triangles, darker green.
      ctx.fillStyle = '#2a5226';
      for (let k = 0; k < 3; k++) {
        const ty = cy + 8 - k * 9 * g, wdt = (16 - k * 3) * g;
        ctx.beginPath();
        ctx.moveTo(cx, ty - 14 * g); ctx.lineTo(cx - wdt, ty); ctx.lineTo(cx + wdt, ty);
        ctx.closePath(); ctx.fill();
      }
    } else if (variant === 2) {
      // Twin-lobed broadleaf, lighter olive.
      ctx.fillStyle = '#4a7a34';
      ctx.beginPath(); ctx.arc(cx - 7 * g, cy + 2, 12 * g, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 7 * g, cy, 12 * g, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy - 6 * g, 12 * g, 0, Math.PI * 2); ctx.fill();
    } else {
      // Classic round oak.
      ctx.fillStyle = TREE_CANOPY;
      ctx.beginPath(); ctx.arc(cx, cy, 17 * g, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.arc(cx - 5 * g, cy - 5 * g, 9 * g, 0, Math.PI * 2);
    ctx.fill();
    this.treeDamageBar(obj, c.x, c.y - trunkH - 30 * g);
  }

  // A small green/red chop-progress bar floating over a tree, shown only once
  // it's taken a hit and until it's felled — so you can see how many swings a
  // tree has left. maxHp is stamped on first chop (Player.useHands).
  treeDamageBar(obj, x, y) {
    if (obj.hp == null || obj.maxHp == null || obj.hp >= obj.maxHp || obj.hp <= 0) return;
    const ctx = this.ctx;
    const w = 22, h = 3.5, frac = Math.max(0, Math.min(1, obj.hp / obj.maxHp));
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = '#3a3f46';
    ctx.fillRect(x - w / 2, y, w, h);
    ctx.fillStyle = frac > 0.5 ? '#6cc24a' : frac > 0.25 ? '#e0b53a' : '#e05548';
    ctx.fillRect(x - w / 2, y, w * frac, h);
  }

  // SKYLINK online: every surviving tower's crown-light position, linked to
  // its two nearest neighbours with a pulsing bright-blue laser — the AI
  // network announcing itself before the 30-second purge plays out.
  drawSkylinkNetwork(obeliskObjs) {
    const ctx = this.ctx;
    const live = (obeliskObjs || []).filter((o) => !o.destroyed);
    if (live.length < 2) return;
    this._skylinkT = (this._skylinkT || 0) + 0.06;
    const pulse = 0.55 + 0.45 * Math.sin(this._skylinkT * 3);
    const towerTop = (o) => {
      const H = Math.round(96 * (1 - (o.obDamage || 0) * 0.13));
      const c = worldToScreen(o.x + 0.5, o.y + 0.5);
      return { x: c.x, y: c.y - H + 8 };
    };
    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = `rgba(70,170,255,${pulse.toFixed(2)})`;
    ctx.shadowColor = 'rgba(70,170,255,0.9)';
    ctx.shadowBlur = 16;
    const drawn = new Set();
    for (const a of live) {
      const nearest = live.filter((b) => b !== a)
        .map((b) => ({ b, d: Math.hypot(a.x - b.x, a.y - b.y) }))
        .sort((p, q) => p.d - q.d)
        .slice(0, 2);
      for (const { b } of nearest) {
        const ka = `${a.x},${a.y}`, kb = `${b.x},${b.y}`;
        const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
        if (drawn.has(key)) continue;
        drawn.add(key);
        const p1 = towerTop(a), p2 = towerTop(b);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // The banner shown once SKYLINK comes online. There's no timer to beat —
  // it counts up, not down, since the purge doesn't stop until it catches
  // the player.
  drawSkylinkBanner(elapsed) {
    const ctx = this.ctx;
    const t = Math.max(0, elapsed || 0);
    const m = Math.floor(t / 60), s = Math.floor(t % 60);
    const msg = `SKYLINK-9000 ONLINE — hunted for ${m}:${String(s).padStart(2, '0')}`;
    ctx.font = 'bold 22px Georgia, serif';
    const w = ctx.measureText(msg).width + 40;
    const x = (this.w - w) / 2, y = 44;
    const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 160);
    ctx.fillStyle = `rgba(70,170,255,${(0.25 + 0.15 * pulse).toFixed(2)})`;
    ctx.fillRect(x, y, w, 40);
    ctx.strokeStyle = `rgba(120,200,255,${pulse.toFixed(2)})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, 38);
    ctx.fillStyle = '#eaf6ff';
    ctx.textAlign = 'center';
    ctx.fillText(msg, this.w / 2, y + 27);
    ctx.textAlign = 'left';
  }

  // A simple dimming overlay + centred label while paused (P).
  drawPausedOverlay() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(4,6,3,0.55)';
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8e0d0';
    ctx.font = 'bold 28px Georgia, serif';
    ctx.fillText('PAUSED', this.w / 2, this.h / 2 - 8);
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(207,216,195,0.75)';
    ctx.fillText('Press P to resume', this.w / 2, this.h / 2 + 18);
    ctx.textAlign = 'left';
  }

  // AI signal tower: a tall narrow black monolith with a slow-pulsing red
  // light near the crown. Destructible in a later phase.
  drawObelisk(obj) {
    const ctx = this.ctx;
    const c = worldToScreen(obj.x + 0.5, obj.y + 0.5);
    // Destroyed: a low heap of blackened rubble and circuitry where it stood.
    if (obj.destroyed) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, 16, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      for (const [ox, oy, r, col] of [[-6, -1, 6, '#1a1a20'], [4, -2, 7, '#141418'], [-1, 2, 6, '#20201a'], [7, 1, 4, '#2a2a30']]) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(c.x + ox, c.y + oy - 3, r, r * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#3f8f5f'; // exposed circuit-green flecks
      for (const [ox, oy] of [[-3, -2], [3, 0], [0, 1]]) ctx.fillRect(c.x + ox, c.y + oy - 4, 2, 2);
      return;
    }
    // Damage lowers and scorches the tower as it's burned down.
    const dmg = obj.obDamage || 0;
    const H = Math.round(96 * (1 - dmg * 0.13)), W = 9;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, 15, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#101014'; // south-west face
    ctx.beginPath();
    ctx.moveTo(c.x - W, c.y - 4); ctx.lineTo(c.x, c.y + 2);
    ctx.lineTo(c.x, c.y + 2 - H); ctx.lineTo(c.x - W, c.y - 4 - H);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#07070a'; // south-east face
    ctx.beginPath();
    ctx.moveTo(c.x + W, c.y - 4); ctx.lineTo(c.x, c.y + 2);
    ctx.lineTo(c.x, c.y + 2 - H); ctx.lineTo(c.x + W, c.y - 4 - H);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#1a1a22'; // cap
    ctx.beginPath();
    ctx.moveTo(c.x - W, c.y - 4 - H); ctx.lineTo(c.x, c.y + 2 - H);
    ctx.lineTo(c.x + W, c.y - 4 - H); ctx.lineTo(c.x, c.y - 10 - H);
    ctx.closePath();
    ctx.fill();
    // Signal light: a dim, occasional blink at rest; when it has sensed
    // someone close (obj.alert) it flares a bright, fast-blinking red and
    // throws a soft halo — unmistakable that it's found you.
    // A fortress breach "stirs" the whole network: a stirred obelisk flares its
    // alert red regardless of whether it has personally sensed the player.
    const alert = Math.max(obj.alert || 0, obj.stirred ? 1 : 0);
    const flash = obj.blinkFlash || 0;
    const ly = c.y - H + 8;
    // RON-ML `loop`: an infinite loop pinned into it burns CPU instead of
    // doing anything useful — the signal light runs a hot white-cyan
    // overload glow instead of the usual alert red, and it starts smoking,
    // more heavily the longer it's been looping, until a repair drone
    // resets it (updateW3, robots.js).
    if (obj.frozen) {
      const burn = Math.min(1, (obj.frozenT || 0) / 20); // ramps up over ~20s
      const flare = 0.6 + 0.4 * Math.sin(performance.now() / 140);
      const glow = ctx.createRadialGradient(c.x, ly, 0, c.x, ly, 18);
      glow.addColorStop(0, `rgba(210, 240, 255, ${((0.5 + 0.3 * burn) * flare).toFixed(3)})`);
      glow.addColorStop(1, 'rgba(210, 240, 255, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(c.x, ly, 18, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(230, 250, 255, ${(0.7 + 0.3 * flare).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(c.x, ly, 3, 0, Math.PI * 2); ctx.fill();
      // Wisps of smoke, more of them and rising higher the longer it burns.
      const t = performance.now() / 700;
      const wisps = 1 + Math.round(burn * 3);
      for (let i = 0; i < wisps; i++) {
        const phase = (t + i * 0.6) % 1;
        const wy = c.y - H - phase * 22;
        const wx = c.x + Math.sin(t * 1.7 + i * 2) * 4;
        const wr = 3 + phase * 5;
        ctx.fillStyle = `rgba(180,180,190,${(0.35 * (1 - phase) * (0.4 + burn)).toFixed(3)})`;
        ctx.beginPath(); ctx.ellipse(wx, wy, wr, wr * 0.7, 0, 0, Math.PI * 2); ctx.fill();
      }
    } else if (alert > 0.3) {
      // Fast alarm blink, bright and saturated, with a glow halo.
      const blink = 0.5 + 0.5 * Math.abs(Math.sin(performance.now() / 130));
      const a = Math.min(1, 0.55 + alert * 0.45) * blink;
      const glow = ctx.createRadialGradient(c.x, ly, 0, c.x, ly, 16);
      glow.addColorStop(0, `rgba(255, 30, 20, ${0.5 * a})`);
      glow.addColorStop(1, 'rgba(255, 30, 20, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(c.x, ly, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255, ${Math.round(40 * (1 - alert))}, 30, ${a})`;
      ctx.beginPath();
      ctx.arc(c.x, ly, 3.4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const alpha = Math.min(1, 0.15 + flash * 0.75);
      ctx.fillStyle = `rgba(224, 60, 48, ${alpha})`;
      ctx.beginPath();
      ctx.arc(c.x, ly, 2.6 + flash * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Flames licking up the shaft while it burns from an OB-gun hit.
    if (obj.burning > 0) {
      const t = performance.now() / 90;
      for (let i = 0; i < 5; i++) {
        const fy = c.y - 6 - i * (H / 6) - Math.abs(Math.sin(t + i)) * 6;
        const fx = c.x + Math.sin(t * 1.3 + i * 2) * 5;
        const r = 5 - i * 0.6;
        ctx.fillStyle = i < 2 ? 'rgba(255,180,60,0.85)' : 'rgba(230,90,30,0.7)';
        ctx.beginPath();
        ctx.ellipse(fx, fy, r, r * 1.6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // A small green CRT terminal set into the SE face, flickering faintly to
    // hint it can be used. Only the screen itself is clickable — not the
    // whole tower body — with a little padding for a comfortable target
    // (world-screen space; main converts the click the same way).
    const sx = c.x + 1, sy = c.y - Math.round(H * 0.32);
    const flick = 0.7 + 0.3 * Math.abs(Math.sin(performance.now() / 240 + obj.x));
    ctx.fillStyle = '#0a140c';
    ctx.fillRect(sx - 5, sy - 6, 11, 13);
    ctx.fillStyle = `rgba(80,225,125,${(0.4 * flick).toFixed(3)})`;
    ctx.fillRect(sx - 4, sy - 5, 9, 11);
    ctx.strokeStyle = 'rgba(30,70,40,0.7)'; ctx.lineWidth = 1;
    for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(sx - 4, sy - 3 + k * 3); ctx.lineTo(sx + 5, sy - 3 + k * 3); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.strokeRect(sx - 5.5, sy - 6.5, 12, 14);
    const SCREEN_PAD = 8;
    this.obeliskHits.push({ obj, x: sx - 5.5 - SCREEN_PAD, y: sy - 6.5 - SCREEN_PAD, w: 12 + 2 * SCREEN_PAD, h: 14 + 2 * SCREEN_PAD });

    // Damage bar above a scorched obelisk when the player's near — five OB-gun
    // burns (or an insane bomb) to fell one, so it needs the heavy kit.
    const obDmg = obj.obDamage || 0;
    const pl = this.hudPlayer;
    if (obDmg > 0 && pl && Math.hypot(pl.x - (obj.x + 0.5), pl.y - (obj.y + 0.5)) < 12) {
      const bw = 30, bh = 3.5, bx = c.x - bw / 2, by = c.y - H - 26;
      const frac = Math.max(0, 1 - obDmg / 5);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
      ctx.fillStyle = '#3a3f46'; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = frac > 0.5 ? '#6cc24a' : frac > 0.25 ? '#e0b53a' : '#e05548';
      ctx.fillRect(bx, by, bw * frac, bh);
    }
  }

  // The obelisk whose tower body contains a world-screen point (from a click
  // converted via worldToScreen(camera.toWorld(...))), or null.
  obeliskAt(wsx, wsy) {
    for (const h of this.obeliskHits) {
      if (wsx >= h.x && wsx <= h.x + h.w && wsy >= h.y && wsy <= h.y + h.h) return h.obj;
    }
    return null;
  }

  // Resistance cache: a wooden crate; opened ones sit dark and empty.
  drawBox(obj) {
    const ctx = this.ctx;
    const c = worldToScreen(obj.x + 0.5, obj.y + 0.5);
    const w = 11, h = 10;
    // The starter cache advertises itself with a wide, slow white pulse
    // while the player still reads as a beginner (threatEase() below 1) —
    // once they've found their feet the nudge is no longer needed, and the
    // glow fades away on its own along with the easing. White reads far
    // better against grass/dirt than the orange this used to be.
    if (obj.starterCache && !obj.opened && this.hudPlayer && this.hudPlayer.threatEase) {
      const ease = this.hudPlayer.threatEase();
      if (ease < 1) {
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 340);
        const strength = 1 - ease; // stronger the newer the player looks
        const glow = ctx.createRadialGradient(c.x, c.y - h / 2, 2, c.x, c.y - h / 2, 34);
        glow.addColorStop(0, `rgba(255,255,255,${(0.4 + 0.3 * pulse) * strength})`);
        glow.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(c.x, c.y - h / 2, 34, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(c.x, c.y + 1, 13, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = obj.opened ? '#33291a' : '#9a774c'; // SW face (opened = spent, dark)
    ctx.beginPath();
    ctx.moveTo(c.x - w, c.y - 3); ctx.lineTo(c.x, c.y + 3);
    ctx.lineTo(c.x, c.y + 3 - h); ctx.lineTo(c.x - w, c.y - 3 - h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = obj.opened ? '#271f13' : '#805f3b'; // SE face
    ctx.beginPath();
    ctx.moveTo(c.x + w, c.y - 3); ctx.lineTo(c.x, c.y + 3);
    ctx.lineTo(c.x, c.y + 3 - h); ctx.lineTo(c.x + w, c.y - 3 - h);
    ctx.closePath();
    ctx.fill();
    // Lid: closed boxes get a wooden-plank top and a strap; opened ones a
    // dark hole. The four lid corners form a rhombus (a parallelogram), so
    // the plank texture warps straight onto it the same way floor and wall
    // textures do — corner order [origin, +u, +u+v, +v] = [left, bottom,
    // right, top]. A warm multiply tint keeps it reading as a crate rather
    // than a bare floorboard, and the flat colour still shows through /
    // stands in until the image loads.
    const lidLeft = { x: c.x - w, y: c.y - 3 - h };
    const lidBottom = { x: c.x, y: c.y + 3 - h };
    const lidRight = { x: c.x + w, y: c.y - 3 - h };
    const lidTop = { x: c.x, y: c.y - 9 - h };
    if (obj.opened) {
      // A dark, empty interior...
      ctx.fillStyle = '#160f08';
      ctx.beginPath();
      ctx.moveTo(lidLeft.x, lidLeft.y); ctx.lineTo(lidBottom.x, lidBottom.y);
      ctx.lineTo(lidRight.x, lidRight.y); ctx.lineTo(lidTop.x, lidTop.y);
      ctx.closePath();
      ctx.fill();
      // ...and the lid thrown open, hinged at the back-left edge and standing
      // up behind the crate, so it reads unmistakably as already looted.
      const lift = 11;
      ctx.fillStyle = '#4a3820';
      ctx.beginPath();
      ctx.moveTo(lidLeft.x, lidLeft.y); ctx.lineTo(lidTop.x, lidTop.y);
      ctx.lineTo(lidTop.x, lidTop.y - lift); ctx.lineTo(lidLeft.x, lidLeft.y - lift);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(20,14,8,0.7)'; ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      this.drawTexturedQuad([lidLeft, lidBottom, lidRight, lidTop],
        FLOOR_TEXTURES.boards, '#ab8555', '#96703f', 'multiply', 0.6);
    }
    if (!obj.opened) {
      ctx.strokeStyle = 'rgba(40,30,18,0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(c.x, c.y + 3);
      ctx.lineTo(c.x, c.y - 9 - h);
      ctx.stroke();
    }
  }

  drawRock(tx, ty) {
    const ctx = this.ctx;
    const c = worldToScreen(tx + 0.5, ty + 0.5);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(c.x, c.y + 1, 13, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ROCK_COLOR;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y - 5, 12, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.ellipse(c.x - 4, c.y - 8, 5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  drawRubble(tx, ty) {
    const ctx = this.ctx;
    const c = worldToScreen(tx + 0.5, ty + 0.5);
    const chunks = [
      [-8, -2, 7, 5], [2, -6, 8, 6], [-2, 2, 6, 4], [8, 0, 5, 4],
    ];
    for (const [ox, oy, rx, ry] of chunks) {
      ctx.fillStyle = rgbScale(WALL_BASE, 0.6 + (ox + 8) * 0.02);
      ctx.beginPath();
      ctx.ellipse(c.x + ox, c.y + oy - 3, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // An abandoned car: now a big 2x3 hulk sitting dead across the road.
  // Smash it with a crowbar (it flips to `smashed`) for what was inside.
  // An abandoned car: a real 3/4-view sprite (model + iso facing picked at
  // world-gen), centred on its footprint. A smashed one is darkened to a
  // burnt-out husk via the offscreen tint trick. Falls back to the old
  // procedural hull until the sprite has loaded.
  drawCar(obj) {
    const model = CAR_MODEL_KEYS[(obj.carModel || 0) % CAR_MODEL_KEYS.length];
    const dir = CAR_DIR_KEYS[(obj.carDir || 0) % CAR_DIR_KEYS.length];
    const spr = CAR_SPRITES[model] && CAR_SPRITES[model][dir];
    if (!spr || !spr.complete || !spr.naturalWidth) { this.drawCarProcedural(obj); return; }
    const ctx = this.ctx;
    const fw = obj.fw || 2, fh = obj.fh || 3;
    const c = worldToScreen(obj.x + fw / 2, obj.y + fh / 2);
    const wob = obj.shake ? Math.sin(obj.shake * 50) * obj.shake * 6 : 0;
    const scale = 0.92;
    const dw = spr.naturalWidth * scale, dh = spr.naturalHeight * scale;
    ctx.save();
    ctx.translate(c.x + wob, c.y);
    // Soft, gradient-edged shadow hugging the car's ground footprint, rather
    // than the old hard flat oval. Purely cosmetic — it isn't collision (that
    // is the tight 2x2), so you can walk across it.
    {
      const shW = dw * 0.34, shH = dh * 0.15;
      ctx.save();
      ctx.translate(0, 14);
      ctx.scale(1, shH / shW);
      const grad = ctx.createRadialGradient(0, 0, shW * 0.2, 0, 0, shW);
      grad.addColorStop(0, 'rgba(0,0,0,0.32)');
      grad.addColorStop(0.72, 'rgba(0,0,0,0.2)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, shW, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // Anchor on this sprite's own measured content, not a fixed fraction of
    // the padded canvas — see carSpriteAnchor above for why.
    const anchor = carSpriteAnchor(spr);
    const dx = -anchor.x * scale, dy = -anchor.y * scale;
    // Every car is composited through the offscreen so it can be weathered:
    // even an intact one gets a faint grime texture dusted over its own pixels
    // (source-atop keeps it inside the silhouette) — it has, after all, sat
    // out in the open for years. A smashed one is darkened to a husk on top
    // and gets a heavier rust pass.
    const off = tintScratch(spr.naturalWidth, spr.naturalHeight);
    const OW = off.canvas.width, OH = off.canvas.height;
    off.ctx.clearRect(0, 0, OW, OH);
    off.ctx.drawImage(spr, 0, 0);
    off.ctx.globalCompositeOperation = 'source-atop';
    const ready = (t) => t && t.complete && t.naturalWidth;
    if (ready(EDGE_TEXTURE)) {
      off.ctx.globalAlpha = 0.16;              // faint age/dirt on any car
      off.ctx.drawImage(EDGE_TEXTURE, 0, 0, OW, OH);
      off.ctx.globalAlpha = 1;
    }
    if (obj.smashed) {
      off.ctx.fillStyle = 'rgba(22,18,15,0.62)'; // burnt-out husk
      off.ctx.fillRect(0, 0, OW, OH);
      if (ready(CAR_RUIN_TEXTURE)) {
        off.ctx.globalAlpha = 0.32;
        off.ctx.drawImage(CAR_RUIN_TEXTURE, 0, 0, OW, OH);
        off.ctx.globalAlpha = 1;
      }
    }
    off.ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(off.canvas, dx, dy, dw, dh);
    ctx.restore();
  }

  drawCarProcedural(obj) {
    const ctx = this.ctx;
    const fw = obj.fw || 2, fh = obj.fh || 3;
    const c = worldToScreen(obj.x + fw / 2, obj.y + fh / 2);
    const wob = obj.shake ? Math.sin(obj.shake * 50) * obj.shake * 6 : 0;
    // The footprint diagonal sets the on-screen size; a wider car is longer
    // along the x screen axis.
    const half = (fw + fh) * 8;   // half-length along the body
    const wide = 22;              // half-width of the body
    const roofH = obj.smashed ? 10 : 22;
    const hue = obj.hue ?? 0.5;
    const lum = obj.smashed ? 22 : 38 + hue * 10;
    const body = `hsl(${Math.floor(hue * 360)}, ${obj.smashed ? 10 : 26}%, ${lum}%)`;

    ctx.save();
    ctx.translate(c.x + wob, c.y);
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 6, half, wide * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    // Hull
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-half, -2);
    ctx.lineTo(-half + 10, -12);
    ctx.lineTo(half - 10, -12);
    ctx.lineTo(half, -2);
    ctx.lineTo(half - 8, 10);
    ctx.lineTo(-half + 8, 10);
    ctx.closePath();
    ctx.fill();
    // Cabin / roof
    ctx.fillStyle = obj.smashed ? 'rgba(15,16,15,0.75)' : 'rgba(20,22,20,0.55)';
    ctx.beginPath();
    ctx.moveTo(-half * 0.45, -12);
    ctx.lineTo(-half * 0.3, -12 - roofH);
    ctx.lineTo(half * 0.3, -12 - roofH);
    ctx.lineTo(half * 0.45, -12);
    ctx.closePath();
    ctx.fill();
    if (obj.smashed) {
      // Shattered: jagged roof edge, blown glass, an open door gap, rust.
      ctx.strokeStyle = 'rgba(200,210,220,0.5)';
      ctx.lineWidth = 1;
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 5, -12 - roofH + 2);
        ctx.lineTo(i * 5 + 2, -12 - roofH - 3 - (i & 1) * 3);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(-half + 6, -8, 12, 14); // open door hole
      ctx.fillStyle = 'rgba(120,60,30,0.5)';
      ctx.fillRect(half - 18, -6, 6, 12);
    } else {
      // Rust streaks on an intact wreck.
      ctx.fillStyle = 'rgba(120,60,30,0.35)';
      ctx.fillRect(-half + 8, -4, 5, 10);
      ctx.fillRect(half - 14, -6, 4, 12);
      // A faint gleam of windscreen.
      ctx.fillStyle = 'rgba(150,170,180,0.25)';
      ctx.fillRect(-half * 0.28, -12 - roofH + 3, half * 0.56, roofH - 5);
    }
    ctx.restore();
  }

  // Fog of war over the minimap: an offscreen 1px-per-tile mask, darkened
  // everywhere, with visited tiles punched out as the game reveals them.
  drawFog(map, x, y, size) {
    if (!map.explored) return;
    if (!this.fogCanvas || this.fogCanvas.width !== map.w) {
      this.fogCanvas = document.createElement('canvas');
      this.fogCanvas.width = map.w;
      this.fogCanvas.height = map.h;
      const f = this.fogCanvas.getContext('2d');
      f.fillStyle = 'rgba(128, 128, 128, 0.88)';
      f.fillRect(0, 0, map.w, map.h);
      // Catch up on anything revealed before the first draw.
      f.globalCompositeOperation = 'destination-out';
      for (let ty = 0; ty < map.h; ty++) {
        for (let tx = 0; tx < map.w; tx++) {
          if (map.explored[ty * map.w + tx]) f.fillRect(tx, ty, 1, 1);
        }
      }
      f.globalCompositeOperation = 'source-over';
      map.newlyRevealed.length = 0;
    }
    if (map.newlyRevealed.length) {
      const f = this.fogCanvas.getContext('2d');
      f.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < map.newlyRevealed.length; i += 2) {
        f.fillRect(map.newlyRevealed[i], map.newlyRevealed[i + 1], 1, 1);
      }
      f.globalCompositeOperation = 'source-over';
      map.newlyRevealed.length = 0;
    }
    const ctx = this.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.fogCanvas, x, y, size, size);
    ctx.restore();
  }

  drawGroundItem(gi) {
    const ctx = this.ctx;
    const def = ITEMS[gi.item];
    const c = worldToScreen(gi.x, gi.y);
    // Near the end of its life a dropped item fades and flickers, so it's
    // clear it's about to vanish rather than popping out (gi.fade set by the
    // aging pass in main; 1 = fresh, 0 = gone).
    const faded = gi.fade != null && gi.fade < 1;
    if (faded) {
      ctx.save();
      ctx.globalAlpha = Math.max(0.08, gi.fade) * (0.6 + 0.4 * Math.abs(Math.sin(performance.now() / 140)));
    }
    // A dropped backpack is a big deal early on (extra storage) and easy to
    // miss in the grass — give it a soft pulsing white halo once you're
    // close enough to be looking for it. White rather than the compass
    // chevron's yellow: it reads far better against grass/dirt at a glance.
    if (gi.item === 'backpack' && this.hudPlayer) {
      const d = Math.hypot(gi.x - this.hudPlayer.x, gi.y - this.hudPlayer.y);
      if (d < 10) {
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 260);
        const glow = ctx.createRadialGradient(c.x, c.y - 3, 1, c.x, c.y - 3, 16);
        glow.addColorStop(0, `rgba(255,255,255,${(0.45 + 0.3 * pulse).toFixed(3)})`);
        glow.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(c.x, c.y - 3, 16, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(c.x, c.y + 1, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    this.drawItemIcon(def, c.x, c.y - 4, 0.62);
    if (gi.qty > 1) {
      ctx.font = '9px system-ui, sans-serif';
      ctx.fillStyle = '#e8e0d0';
      ctx.fillText(String(gi.qty), c.x + 8, c.y - 2);
    }
    if (faded) ctx.restore();
  }

  // Miniature vector art per item, centred on (cx, cy), so things look like
  // the thing they are — in slots, on the ground, and held in hand.
  // A compact cassette, drawn in the current (translated/scaled) icon space:
  // shell, label strip in the tape's own colour, window, and the two reels.
  // `spin` is the reel angle in radians — 0 for a static icon; the walkman
  // deck passes a clock-driven angle so the reels visibly turn during play.
  drawCassette(itemDef, spin = 0) {
    const ctx = this.ctx;
    ctx.fillStyle = '#26282d'; // shell
    ctx.fillRect(-11, -7, 22, 14);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-11, -7, 22, 14);
    ctx.fillStyle = itemDef.color || '#c9a44a'; // label strip
    ctx.fillRect(-9, -5.5, 18, 3);
    ctx.fillStyle = '#1a1b1f'; // tape window
    ctx.fillRect(-7.5, -1, 15, 6);
    for (const rx of [-4, 4]) { // two reels, spokes at the shared spin angle
      ctx.fillStyle = '#e8e2d0';
      ctx.beginPath(); ctx.arc(rx, 2, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#26282d';
      ctx.lineWidth = 0.9;
      for (let k = 0; k < 3; k++) {
        const a = spin + (k * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.moveTo(rx, 2);
        ctx.lineTo(rx + Math.cos(a) * 2.6, 2 + Math.sin(a) * 2.6);
        ctx.stroke();
      }
    }
  }

  drawItemIcon(itemDef, cx, cy, s = 1) {
    const ctx = this.ctx;
    if (!itemDef) return;
    const key = itemDef.key;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    if (itemDef.kind === 'shield') {
      // A rounded heater-shield outline; a mirror shield gets a bright sheen.
      ctx.fillStyle = itemDef.color;
      ctx.beginPath();
      ctx.moveTo(-7, -9); ctx.lineTo(7, -9);
      ctx.lineTo(7, 3); ctx.quadraticCurveTo(0, 12, 0, 12);
      ctx.quadraticCurveTo(0, 12, -7, 3);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1; ctx.stroke();
      if (itemDef.reflect) {
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath(); ctx.moveTo(-3, -6); ctx.lineTo(2, -6); ctx.lineTo(-2, 6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(0, 9); ctx.stroke();
      }
      ctx.restore();
      return;
    }
    if (itemDef.kind === 'compass') {
      ctx.fillStyle = '#243138';
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = itemDef.color; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#e05548'; // needle
      ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(2.5, 0); ctx.lineTo(-2.5, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#cfd8c3';
      ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(2.5, 0); ctx.lineTo(-2.5, 0); ctx.closePath(); ctx.fill();
      ctx.restore();
      return;
    }
    if (itemDef.kind === 'forcefield') {
      // A little emitter with a green energy halo.
      ctx.fillStyle = '#2a3b30';
      ctx.fillRect(-4, 2, 8, 7);
      ctx.strokeStyle = itemDef.color; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.4;
      ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.restore();
      return;
    }
    if (key && key.startsWith('book_')) {
      ctx.fillStyle = itemDef.color;
      ctx.fillRect(-8, -10, 16, 20);
      ctx.fillStyle = '#e5dcc7';
      ctx.fillRect(6, -9, 2, 18); // page edge
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(-8, -10, 2.5, 20); // spine
      ctx.restore();
      return;
    }
    if (itemDef.kind === 'tape') {
      this.drawCassette(itemDef, 0); // static reels: it only spins in the walkman
      ctx.restore();
      return;
    }
    switch (key) {
      case 'penknife':
        ctx.fillStyle = itemDef.color;
        ctx.fillRect(-9, 1, 12, 5);
        ctx.fillStyle = '#c9cdd1';
        ctx.beginPath();
        ctx.moveTo(3, 1); ctx.lineTo(11, -5); ctx.lineTo(3, 4);
        ctx.closePath();
        ctx.fill();
        break;
      case 'bat':
        ctx.strokeStyle = itemDef.color;
        ctx.lineCap = 'round';
        ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(-6, 8); ctx.lineTo(5, -3); ctx.stroke();
        ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.moveTo(4, -4); ctx.lineTo(9, -9); ctx.stroke();
        ctx.lineCap = 'butt';
        break;
      case 'machete':
        ctx.fillStyle = '#c9cdd1';
        ctx.beginPath();
        ctx.moveTo(-4, 4); ctx.lineTo(9, -9); ctx.lineTo(11, -4); ctx.lineTo(-2, 8);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#3a2f22';
        ctx.fillRect(-10, 4, 7, 4);
        break;
      case 'crowbar':
        ctx.strokeStyle = itemDef.color;
        ctx.lineCap = 'round';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(-8, 8); ctx.lineTo(6, -6);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(4, -8, 4, Math.PI * 0.1, Math.PI * 1.1);
        ctx.stroke();
        ctx.lineCap = 'butt';
        break;
      case 'shovel':
        ctx.strokeStyle = '#6a4c2c'; // handle
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(4, -9); ctx.lineTo(-3, 3); ctx.stroke();
        ctx.fillStyle = '#c3ccd3'; // steel blade
        ctx.beginPath();
        ctx.moveTo(-2, 2); ctx.lineTo(-8, 6); ctx.lineTo(-5, 10);
        ctx.lineTo(1, 8); ctx.closePath();
        ctx.fill();
        break;
      case 'saw':
        ctx.fillStyle = '#6a4c2c'; // handle
        ctx.fillRect(-10, -5, 5, 7);
        ctx.strokeStyle = itemDef.color; // steel blade
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-5, -1); ctx.lineTo(10, -6); ctx.stroke();
        ctx.strokeStyle = '#8a9098'; // teeth
        ctx.lineWidth = 1;
        for (let i = 0; i < 7; i++) {
          const t = -4 + i * 2;
          ctx.beginPath(); ctx.moveTo(t, 0); ctx.lineTo(t + 1, 2); ctx.stroke();
        }
        break;
      case 'seatbelt':
        ctx.strokeStyle = itemDef.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-8, -8); ctx.quadraticCurveTo(6, 0, -6, 9);
        ctx.stroke();
        ctx.fillStyle = '#9a9aa0'; // buckle
        ctx.fillRect(-9, 6, 6, 4);
        break;
      case 'stungun':
      case 'electrogun':
        ctx.fillStyle = '#2c3036';
        ctx.fillRect(-8, -3, 14, 5); // barrel body
        ctx.fillRect(-6, 2, 4, 7);   // grip
        ctx.fillStyle = itemDef.color;
        ctx.beginPath();
        ctx.arc(8, -0.5, 3, 0, Math.PI * 2); // charged emitter
        ctx.fill();
        ctx.strokeStyle = itemDef.color;
        ctx.lineWidth = 1;
        ctx.beginPath(); // little spark
        ctx.moveTo(10, -6); ctx.lineTo(12, -3); ctx.lineTo(10.5, -3); ctx.lineTo(12.5, 0);
        ctx.stroke();
        break;
      case 'pistol':
        ctx.fillStyle = '#23262b';
        ctx.fillRect(-7, -4, 14, 5);
        ctx.fillRect(-5, 1, 4.5, 8);
        ctx.fillStyle = '#4a4f57';
        ctx.fillRect(5, -3, 2, 3);
        break;
      case 'shotgun':
        ctx.fillStyle = '#5a4632';
        ctx.fillRect(-11, 2, 8, 4); // stock
        ctx.fillStyle = '#2c2f34';
        ctx.fillRect(-4, 1, 15, 2.2); // barrels
        ctx.fillRect(-4, 3.6, 15, 2.2);
        break;
      case 'sledgehammer':
        ctx.strokeStyle = '#6a4c2c'; // handle
        ctx.lineCap = 'round';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-7, 9); ctx.lineTo(3, -3); ctx.stroke();
        ctx.lineCap = 'butt';
        ctx.save();
        ctx.translate(4, -6);
        ctx.rotate(-0.7);
        ctx.fillStyle = itemDef.color; // heavy head
        ctx.fillRect(-4, -6, 8, 12);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.strokeRect(-4, -6, 8, 12);
        ctx.restore();
        break;
      case 'bow':
        ctx.strokeStyle = itemDef.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(-2, 0, 10, -Math.PI * 0.35, Math.PI * 0.35);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(230,220,200,0.8)'; // string
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(1.6, -8.6); ctx.lineTo(1.6, 8.6);
        ctx.stroke();
        break;
      case 'arrow':
        ctx.strokeStyle = '#7a5a34'; // shaft
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(-8, 7); ctx.lineTo(7, -7); ctx.stroke();
        ctx.fillStyle = '#c9cdd1'; // head
        ctx.beginPath();
        ctx.moveTo(7, -7); ctx.lineTo(10, -10); ctx.lineTo(9, -6);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = itemDef.color; // fletching
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(-8, 7); ctx.lineTo(-5, 3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-8, 7); ctx.lineTo(-4, 6); ctx.stroke();
        break;
      case 'katana':
        ctx.save();
        ctx.rotate(-0.55);
        ctx.fillStyle = '#c9cdd1'; // slim curved blade
        ctx.beginPath();
        ctx.moveTo(-2, 9); ctx.quadraticCurveTo(2, 0, 3, -10); ctx.lineTo(5, -10);
        ctx.quadraticCurveTo(4, 0, 0, 9);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#2f2a24'; // guard + wrapped grip
        ctx.fillRect(-5, 8, 8, 2);
        ctx.fillStyle = itemDef.color;
        ctx.fillRect(-4, 10, 6, 4);
        ctx.restore();
        break;
      case 'robot_sword':
        // A heavy, straight beaten-metal blade with a bolt-studded guard —
        // clearly forged from scrap, not a fine sword.
        ctx.save();
        ctx.rotate(-0.6);
        ctx.fillStyle = itemDef.color; // broad blade
        ctx.beginPath();
        ctx.moveTo(-3, 9); ctx.lineTo(3, 9); ctx.lineTo(2, -11); ctx.lineTo(0, -13); ctx.lineTo(-2, -11);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(60,66,72,0.8)'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(0, 8); ctx.stroke(); // fuller
        ctx.fillStyle = '#3a3f46'; // guard
        ctx.fillRect(-6, 8, 12, 3);
        ctx.fillStyle = '#d8b24a'; // rivets
        ctx.beginPath(); ctx.arc(-4, 9.5, 1, 0, Math.PI * 2); ctx.arc(4, 9.5, 1, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2a2620'; // grip
        ctx.fillRect(-2, 11, 4, 5);
        ctx.restore();
        break;
      case 'railgun':
        ctx.fillStyle = '#2c3036';
        ctx.fillRect(-9, -3, 16, 5); // barrel body
        ctx.fillRect(-6, 2, 4, 7);   // grip
        ctx.strokeStyle = itemDef.color; // energy rails along the barrel
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(-9, -3); ctx.lineTo(7, -3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-9, 2); ctx.lineTo(7, 2); ctx.stroke();
        ctx.fillStyle = itemDef.color; // charged muzzle
        ctx.beginPath();
        ctx.arc(8, -0.5, 3, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'wavegun':
        ctx.fillStyle = '#2c3036';
        ctx.fillRect(-8, -3, 12, 6); // body
        ctx.fillRect(-5, 3, 4, 6);   // grip
        ctx.strokeStyle = itemDef.color; // fanned wave arcs from the muzzle
        ctx.lineWidth = 1.4;
        for (let i = 0; i < 3; i++) {
          const r = 4 + i * 3;
          ctx.beginPath();
          ctx.arc(4, 0, r, -0.6, 0.6);
          ctx.stroke();
        }
        break;
      case 'obgun': {
        // A cobbled-together cannon with a glowing ember muzzle.
        ctx.fillStyle = '#2c2f34';
        ctx.fillRect(-9, -4, 15, 7);
        ctx.fillRect(-6, 3, 4, 6);
        ctx.fillStyle = itemDef.color;
        ctx.beginPath(); ctx.arc(8, -0.5, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd060';
        ctx.beginPath(); ctx.arc(8, -0.5, 1.6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#4fd8c3'; // salvaged wifi coil
        ctx.fillRect(-8, -3, 2, 5);
        break;
      }
      case 'circuit':
        ctx.fillStyle = itemDef.color;
        ctx.fillRect(-7, -6, 14, 12);
        ctx.strokeStyle = '#d8e0b0';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-4, -6); ctx.lineTo(-4, 2); ctx.lineTo(4, 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(2, -6); ctx.lineTo(2, -2); ctx.lineTo(6, -2); ctx.stroke();
        ctx.fillStyle = '#2c2f34';
        for (const [ox, oy] of [[-4, 2], [4, 2], [2, -2]]) { ctx.beginPath(); ctx.arc(ox, oy, 1.3, 0, Math.PI * 2); ctx.fill(); }
        break;
      case 'battery':
        ctx.fillStyle = itemDef.color;
        ctx.fillRect(-4, -7, 8, 14);
        ctx.fillRect(-1.5, -9, 3, 2); // terminal
        ctx.fillStyle = '#2c2f34';
        ctx.beginPath(); // lightning tick
        ctx.moveTo(1, -4); ctx.lineTo(-2, 1); ctx.lineTo(0, 1); ctx.lineTo(-1, 5); ctx.lineTo(2.5, 0); ctx.lineTo(0.5, 0);
        ctx.closePath();
        ctx.fill();
        break;
      case 'wifiblock': {
        // A little handset with rising signal arcs — the jammer.
        ctx.fillStyle = '#26302f';
        ctx.fillRect(-5, -2, 10, 11); // body
        ctx.strokeStyle = itemDef.color;
        ctx.lineWidth = 1.6;
        for (let i = 1; i <= 3; i++) { // signal arcs
          ctx.beginPath();
          ctx.arc(0, -3, i * 3, Math.PI * 1.15, Math.PI * 1.85);
          ctx.stroke();
        }
        ctx.fillStyle = itemDef.color;
        ctx.beginPath();
        ctx.arc(0, -3, 1.4, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'ammo':
        for (let i = -1; i <= 1; i++) {
          ctx.fillStyle = '#b09a55';
          ctx.fillRect(i * 5 - 1.5, -2, 3, 8);
          ctx.fillStyle = '#8a7440';
          ctx.beginPath();
          ctx.arc(i * 5, -2, 1.5, Math.PI, Math.PI * 2);
          ctx.fill();
        }
        break;
      case 'shells':
        for (let i = 0; i <= 1; i++) {
          ctx.fillStyle = itemDef.color;
          ctx.fillRect(i * 6 - 4, -6, 4, 10);
          ctx.fillStyle = '#b09a55';
          ctx.fillRect(i * 6 - 4, 4, 4, 3);
        }
        break;
      case 'torch':
        ctx.strokeStyle = '#6a4c2c';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-4, 9); ctx.lineTo(3, -2); ctx.stroke();
        ctx.fillStyle = '#e0a030';
        ctx.beginPath(); ctx.arc(4, -5, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f2d060';
        ctx.beginPath(); ctx.arc(4.5, -6, 2, 0, Math.PI * 2); ctx.fill();
        break;
      case 'wood':
        ctx.fillStyle = itemDef.color;
        ctx.fillRect(-9, -5, 18, 5);
        ctx.fillRect(-7, 1, 18, 5);
        ctx.fillStyle = '#c4a26a';
        ctx.beginPath();
        ctx.ellipse(-9, -2.5, 2, 2.5, 0, 0, Math.PI * 2);
        ctx.ellipse(-7, 3.5, 2, 2.5, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'meat':
        ctx.fillStyle = itemDef.color;
        ctx.beginPath();
        ctx.ellipse(-1, -1, 7, 5, -0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#e5dcc7';
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(4, 3); ctx.lineTo(8, 7); ctx.stroke();
        ctx.fillStyle = '#e5dcc7';
        ctx.beginPath(); ctx.arc(9, 8, 2, 0, Math.PI * 2); ctx.fill();
        break;
      case 'tin':
        ctx.fillStyle = itemDef.color;
        ctx.fillRect(-5, -6, 10, 13);
        ctx.fillStyle = '#c3ccd3';
        ctx.beginPath(); ctx.ellipse(0, -6, 5, 2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(-5, -1, 10, 4); // label band
        break;
      case 'berries':
        ctx.fillStyle = itemDef.color;
        for (const [ox, oy] of [[-3, 1], [3, 0], [0, 5]]) {
          ctx.beginPath(); ctx.arc(ox, oy, 3.2, 0, Math.PI * 2); ctx.fill();
        }
        ctx.strokeStyle = '#4a7c3f';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(2, -8); ctx.stroke();
        break;
      case 'scrap':
        ctx.fillStyle = itemDef.color;
        ctx.beginPath();
        ctx.moveTo(-8, 2); ctx.lineTo(-2, -7); ctx.lineTo(6, -4); ctx.lineTo(8, 4); ctx.lineTo(0, 7);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#3a3f46';
        ctx.beginPath(); ctx.arc(0, 0, 2.2, 0, Math.PI * 2); ctx.fill();
        break;
      case 'backpack':
        ctx.fillStyle = itemDef.color;
        ctx.fillRect(-7, -8, 14, 17);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.strokeRect(-4, -5, 8, 6); // front pocket
        ctx.fillStyle = '#3a2f20';
        ctx.fillRect(-6, -10, 3, 4); // strap
        ctx.fillRect(3, -10, 3, 4);
        break;
      case 'bomb_small':
      case 'bomb_medium':
      case 'bomb_large':
      case 'bomb_insane': {
        // Round canister with a rim and a lit fuse.
        ctx.fillStyle = '#2b2b30';
        ctx.beginPath();
        ctx.arc(0, 2, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = itemDef.color;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.strokeStyle = '#8a6a3c'; // fuse
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(3, -4); ctx.quadraticCurveTo(8, -8, 6, -11);
        ctx.stroke();
        ctx.fillStyle = key === 'bomb_insane' ? '#ff3010' : '#ffd23b'; // spark
        ctx.beginPath();
        ctx.arc(6, -11, 2, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'chip': {
        // A little IC: dark body, gold contact pins down the sides, a notch.
        ctx.fillStyle = '#1c2a24';
        ctx.fillRect(-6, -5, 12, 10);
        ctx.strokeStyle = itemDef.color; ctx.lineWidth = 1.2; ctx.strokeRect(-6, -5, 12, 10);
        ctx.strokeStyle = '#d8b24a'; ctx.lineWidth = 1;
        for (let p = -3; p <= 3; p += 3) {
          ctx.beginPath(); ctx.moveTo(-8, p); ctx.lineTo(-6, p); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(6, p); ctx.lineTo(8, p); ctx.stroke();
        }
        ctx.fillStyle = itemDef.color;
        ctx.beginPath(); ctx.arc(-3.5, -2.5, 1, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'chip_fragment':
        // A broken shard of a chip: a torn triangle with a gold edge.
        ctx.fillStyle = '#1c2a24';
        ctx.beginPath();
        ctx.moveTo(-6, 5); ctx.lineTo(-3, -6); ctx.lineTo(5, -2); ctx.lineTo(2, 6);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = itemDef.color; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.strokeStyle = '#d8b24a'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(-3, -6); ctx.lineTo(0, 0); ctx.lineTo(2, 6); ctx.stroke();
        break;
      case 'ronml_page':
        // A torn sheet of paper with a couple of lines of code and a ragged edge.
        ctx.fillStyle = itemDef.color;
        ctx.beginPath();
        ctx.moveTo(-6, -8); ctx.lineTo(6, -8); ctx.lineTo(6, 5);
        ctx.lineTo(3, 8); ctx.lineTo(-1, 5); ctx.lineTo(-6, 8);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(60,90,60,0.7)'; ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(-4, -4); ctx.lineTo(3, -4); ctx.moveTo(-4, -1); ctx.lineTo(4, -1); ctx.moveTo(-4, 2); ctx.lineTo(1, 2);
        ctx.stroke();
        break;
      case 'printed_map':
        // A folded paper map: parchment rectangle with fold creases and a
        // little green route marking.
        ctx.fillStyle = itemDef.color;
        ctx.fillRect(-8, -6, 16, 12);
        ctx.strokeStyle = 'rgba(70,60,40,0.6)'; ctx.lineWidth = 1;
        ctx.strokeRect(-8, -6, 16, 12);
        ctx.beginPath(); ctx.moveTo(-2.7, -6); ctx.lineTo(-2.7, 6); ctx.moveTo(2.7, -6); ctx.lineTo(2.7, 6); ctx.stroke();
        ctx.strokeStyle = 'rgba(80,180,110,0.9)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-6, 3); ctx.lineTo(-1, -1); ctx.lineTo(4, 2); ctx.stroke();
        ctx.fillStyle = '#e0552f'; ctx.beginPath(); ctx.arc(4, 2, 1.3, 0, Math.PI * 2); ctx.fill();
        break;
      case 'ubik': {
        // An aerosol can: body, a domed cap, a nozzle, and a puff of mist.
        ctx.fillStyle = itemDef.color;
        ctx.fillRect(-4, -3, 8, 11);
        ctx.fillStyle = '#c9a92a';
        ctx.fillRect(-4, 2, 8, 2); // worn label band
        ctx.fillStyle = '#8a8f96';
        ctx.fillRect(-3, -6, 6, 3); // cap
        ctx.fillRect(-1, -8, 2, 2); // nozzle
        ctx.fillStyle = 'rgba(255,246,214,0.6)';
        ctx.beginPath(); ctx.arc(4, -8, 1.4, 0, Math.PI * 2); ctx.arc(6, -6, 1, 0, Math.PI * 2); ctx.arc(5, -10, 0.9, 0, Math.PI * 2); ctx.fill();
        break;
      }
      default:
        ctx.fillStyle = itemDef.color;
        ctx.fillRect(-6, -6, 12, 12);
    }
    ctx.restore();
  }

  drawPlayer(player) {
    const ctx = this.ctx;
    const c = worldToScreen(player.x, player.y);

    // Swimming: only the head and shoulders show above the water, bobbing,
    // with ripples. Uses the real character sprite (the top slice of the
    // idle frame for the way they're facing) rather than a drawn blob, so it
    // matches the on-land look.
    if (player.swimming) {
      const bobY = Math.sin(performance.now() / 380) * 1.8;
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 1;
      for (let i = 1; i <= 2; i++) {
        ctx.beginPath();
        ctx.ellipse(c.x, c.y - 4, 7 * i, 3.5 * i, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      const set = CHARACTER_SPRITE_SETS[player.gender || 'm'];
      const sprite = set && set.idle[facingToCompassDir(player.facing)];
      if (sprite && sprite.complete && sprite.naturalWidth) {
        const scale = 0.6;
        const dw = sprite.naturalWidth * scale;
        const showFrac = 0.5;                       // top half = head + shoulders
        const srcH = sprite.naturalHeight * showFrac;
        const ddh = sprite.naturalHeight * scale * showFrac;
        // Clip to the water surface so the submerged body doesn't show if the
        // slice ever runs long, and sit the shoulders right at the ripples.
        ctx.save();
        ctx.beginPath();
        ctx.rect(c.x - dw / 2, c.y - 2 + bobY - ddh, dw, ddh);
        ctx.clip();
        ctx.drawImage(sprite, 0, 0, sprite.naturalWidth, srcH, c.x - dw / 2, c.y - 2 + bobY - ddh, dw, ddh);
        ctx.restore();
      } else {
        const hy = c.y - 10 + bobY;
        ctx.fillStyle = '#d9b48c';
        ctx.beginPath(); ctx.arc(c.x, hy, 6, 0, Math.PI * 2); ctx.fill();
      }
      return;
    }

    // Resting: the character lies flat on the ground, tipped onto its back,
    // no tool in hand, with a wide flat shadow and drifting sleep 'z's.
    if (player.resting) {
      ctx.fillStyle = 'rgba(0,0,0,0.26)';
      ctx.beginPath();
      ctx.ellipse(c.x, c.y + 2, 17, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      const set = CHARACTER_SPRITE_SETS[player.gender || 'm'];
      const sprite = set && set.idle[facingToCompassDir(player.facing)];
      if (sprite && sprite.complete && sprite.naturalWidth) {
        const scale = 0.6;
        const dw = sprite.naturalWidth * scale, dh = sprite.naturalHeight * scale;
        ctx.save();
        ctx.translate(c.x, c.y - 4);
        ctx.rotate(-Math.PI / 2 * 0.9); // tip onto its back
        ctx.drawImage(sprite, -dw / 2, -dh / 2, dw, dh);
        ctx.restore();
      } else {
        ctx.fillStyle = '#d9b48c';
        ctx.beginPath(); ctx.arc(c.x - 9, c.y - 4, 5, 0, Math.PI * 2); ctx.fill();
      }
      const t = performance.now() / 620;
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      for (let i = 0; i < 3; i++) {
        const ph = (t + i * 0.6) % 3;
        ctx.globalAlpha = Math.max(0, 0.85 - ph / 3);
        ctx.fillStyle = 'rgba(232,236,244,0.9)';
        ctx.fillText('z', c.x + 12 + ph * 4, c.y - 16 - ph * 7);
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
      return;
    }

    const lift = (player.z || 0) * 32; // jump height in pixels
    // Shadow stays grounded and shrinks as the player rises.
    const sh = Math.max(0.45, 1 - (player.z || 0) * 0.9);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, 10 * sh, 5 * sh, 0, 0, Math.PI * 2);
    ctx.fill();
    const by = c.y - lift;

    // The held item is drawn either behind or in front of the body depending
    // on which way the character faces: when they face away from the camera
    // (up the screen — the facing's world x+y points "back", so its screen
    // depth is behind the feet) the hand and its tool are behind the torso
    // and must be painted first, otherwise the icon floats over the head
    // (the reported bug). Facing toward the camera, the tool is in front.
    const heldBehind = (player.facing.x + player.facing.y) < 0;
    if (heldBehind) this.drawHeldItem(player, c, by);
    // A brief Ubik reality-hiccup (player.ubikHiccupT/Kind, rolled in
    // Player.update while standing in a brightened patch): a momentary
    // discolour tint, or the sprite drawn leant/twisted off true for a
    // beat, as if the ground under it hadn't quite settled on being real.
    if (player.ubikHiccupT > 0) {
      ctx.save();
      if (player.ubikHiccupKind === 'discolor') {
        ctx.filter = 'hue-rotate(140deg) saturate(2.2)';
        this.drawPlayerSprite(player, c, by);
      } else {
        const amt = Math.sin((player.ubikHiccupT / 0.4) * Math.PI); // 0 -> 1 -> 0 over its life
        ctx.translate(c.x, by);
        if (player.ubikHiccupKind === 'lean') ctx.transform(1, 0, 0.35 * amt, 1, 0, 0);
        else ctx.rotate(0.28 * amt * (player.ubikHiccupT > 0.2 ? 1 : -1)); // 'twist'
        ctx.translate(-c.x, -by);
        this.drawPlayerSprite(player, c, by);
      }
      ctx.restore();
    } else {
      this.drawPlayerSprite(player, c, by);
    }
    if (!heldBehind) this.drawHeldItem(player, c, by);

    // Facing indicator: a small chevron ahead of the feet, pointing (in screen
    // space) the way you aim. An armed, carried electro-compass repurposes it
    // into a cluster of homing pointers, one per notable thing nearby, each
    // coloured by what it is.
    const fp0 = worldToScreen(player.x, player.y);
    const drawChevron = (dx, dy, color) => {
      const d = Math.hypot(dx, dy) || 1;
      const dir = { x: dx / d, y: dy / d };
      const f = worldToScreen(player.x + dir.x * 1.2, player.y + dir.y * 1.2);
      const fp1 = worldToScreen(player.x + dir.x, player.y + dir.y);
      const fang = Math.atan2(fp1.y - fp0.y, fp1.x - fp0.x);
      ctx.save();
      ctx.translate(f.x, f.y - 10);
      ctx.rotate(fang);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(-3, -4.5); ctx.lineTo(4, 0); ctx.lineTo(-3, 4.5);
      ctx.stroke();
      ctx.restore();
    };
    // Always show the normal facing chevron; an armed compass adds its homing
    // needles on top, so you keep your bearings as well as the pointers.
    drawChevron(player.facing.x, player.facing.y, 'rgba(200,200,200,0.55)');
    const compassOn = player.hasItem && player.hasItem('compass') && player.compassArmed && player.compassTargets;
    if (compassOn) {
      for (const t of player.compassTargets()) drawChevron(t.x - player.x, t.y - player.y, t.color);
    }

    // Forcefield: a shimmering green shell around the whole character.
    if (player.forcefieldActive && player.forcefieldActive()) {
      const t = performance.now();
      const rr = 25 + Math.sin(t / 260) * 1.8;
      ctx.save();
      ctx.fillStyle = 'rgba(80,230,140,0.12)';
      ctx.strokeStyle = `rgba(120,245,170,${(0.55 + 0.2 * Math.sin(t / 180)).toFixed(3)})`;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.ellipse(c.x, by - 12, rr, rr * 1.08, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    } else if (player.shielded && player.shielded()) {
      // A carried shield shows a thinner deflector ring (no need to hold it):
      // pale blue for the plain shield, brighter cyan for the mirror.
      const t = performance.now();
      const mirror = player.hasItem && player.hasItem('mirror_shield');
      ctx.save();
      ctx.strokeStyle = mirror
        ? `rgba(180,235,245,${(0.45 + 0.18 * Math.sin(t / 200)).toFixed(3)})`
        : 'rgba(130,175,225,0.4)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.ellipse(c.x, by - 12, 22, 24, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // The held tool/gun/gadget/shield shown in hand, out toward the facing
  // direction. Using it animates: a tool sweeps through an arc, a gun kicks
  // back with recoil — so a swing or a shot always reads on screen. Drawn
  // before or after the body by the caller depending on facing (see
  // drawPlayer), so it sits behind the character when they face away.
  drawHeldItem(player, c, by) {
    if (!player.hands || !ITEMS[player.hands]) return;
    const ctx = this.ctx;
    const def = ITEMS[player.hands];
    const cd = def.swingCooldown || 0.5;
    const p = player.swingTimer > 0 ? Math.max(0, 1 - player.swingTimer / cd) : -1;
    const pulse = p >= 0 ? Math.sin(p * Math.PI) : 0;
    const isRanged = def.kind === 'gun' || def.kind === 'gadget';
    const baseAng = Math.atan2(player.facing.y * 0.5, player.facing.x);
    let reach = 0.42;
    let extraAng = 0;
    if (isRanged) {
      reach = 0.42 - pulse * 0.14;
    } else {
      reach = 0.42 + pulse * 0.55;
      extraAng = p >= 0 ? (-1.0 + p * 1.7) : 0;
    }
    const hx = c.x + 3 + player.facing.x * 11 * reach / 0.42;
    // Sit the item at the character's hand height (mid-torso), not up by the
    // shoulders where it read as floating.
    const hy = by - 10 + player.facing.y * 7 * reach / 0.42;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(baseAng + extraAng);
    // Scaled down to suit the smaller (v0.67) character sprite — the old 0.85
    // left tools looking oversized in hand.
    this.drawItemIcon(def, 0, 0, 0.55 + pulse * 0.12);
    ctx.restore();
    if (isRanged && def.kind === 'gun' && pulse > 0.3) {
      const fx = c.x + player.facing.x * 26, fy = by - 12 + player.facing.y * 14;
      ctx.fillStyle = `rgba(255,220,120,${pulse * 0.8})`;
      ctx.beginPath();
      ctx.arc(fx, fy, 3 + pulse * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Draws the Kenney directional character set (m/f personas) in place of
  // the procedural body/head — see the CHARACTER_SPRITE_SETS branch above.
  drawPlayerSprite(player, c, by) {
    const ctx = this.ctx;
    const set = CHARACTER_SPRITE_SETS[player.gender];
    const dir = facingToCompassDir(player.facing);
    let sprite;
    if (player.moving) {
      const frames = set.walk[dir];
      const idx = Math.floor((player.walkPhase / (Math.PI * 2)) * frames.length) % frames.length;
      sprite = frames[idx];
    } else {
      sprite = set.idle[dir];
    }
    if (!sprite || !sprite.complete || !sprite.naturalWidth) return;
    const scale = 0.6; // 0.9 towered over a 32px-tall tile diamond; scaled down to fit
    const dw = sprite.naturalWidth * scale, dh = sprite.naturalHeight * scale;
    const cy = by - dh / 2 + 6;
    // Idle sway: standing still on the ground, rock the sprite by a hair
    // around the feet so it reads as breathing/alive rather than a frozen
    // cardboard cutout. Two slightly out-of-phase sines give it an easy,
    // non-mechanical drift. Suppressed while walking (the walk frames carry
    // their own motion) and mid-jump.
    const idle = !player.moving && player.z === 0;
    let swayed = false;
    if (idle) {
      const t = performance.now();
      const sway = Math.sin(t / 900) * 0.03 + Math.sin(t / 1730) * 0.012; // ~2.4 deg peak
      const fx = c.x, fy = cy + dh / 2; // pivot at the feet
      ctx.save();
      ctx.translate(fx, fy);
      ctx.rotate(sway);
      ctx.translate(-fx, -fy);
      swayed = true;
    }
    const tint = player.hurtTimer > 0 ? 'rgba(220,60,50,0.55)'
      : player.sprinting ? 'rgba(255,190,110,0.18)' : null;
    if (tint) {
      // Composited off-canvas first: 'source-atop' respects only the alpha
      // already on the SAME canvas, so applying it straight to the main
      // canvas would also tint the ground showing through the sprite's own
      // transparent margin, not just the character.
      const off = tintScratch(sprite.naturalWidth, sprite.naturalHeight);
      off.ctx.clearRect(0, 0, off.canvas.width, off.canvas.height);
      off.ctx.drawImage(sprite, 0, 0);
      off.ctx.globalCompositeOperation = 'source-atop';
      off.ctx.fillStyle = tint;
      off.ctx.fillRect(0, 0, off.canvas.width, off.canvas.height);
      off.ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(off.canvas, c.x - dw / 2, cy - dh / 2, dw, dh);
    } else {
      ctx.drawImage(sprite, c.x - dw / 2, cy - dh / 2, dw, dh);
    }
    if (swayed) ctx.restore();
  }

  // ---- Dashboard ----------------------------------------------------------

  drawDashboard(player, hud) {
    const ctx = this.ctx;
    const top = this.h - DASH_H;

    ctx.fillStyle = 'rgba(12,15,10,0.88)';
    ctx.fillRect(0, top, this.w, DASH_H);
    ctx.fillStyle = 'rgba(207,216,195,0.25)';
    ctx.fillRect(0, top, this.w, 1);

    // Vitals
    this.drawBar(16, top + 14, 150, 8, player.health / player.maxHealth, '#b0392f', 'HEALTH');
    this.drawBar(16, top + 37, 150, 8, player.stamina / player.maxStamina, '#5f8f3e', 'STAMINA');
    this.drawBar(16, top + 60, 150, 8, (player.food ?? 100) / (player.maxFood ?? 100), '#c99a3e', 'FOOD');
    ctx.font = 'bold 9px system-ui, sans-serif';
    if (player.venom > 0) {
      ctx.fillStyle = '#b07fd8';
      ctx.fillText('POISONED', 92, top + 9);
    }
    if (player.food <= 0) {
      ctx.fillStyle = '#e05548';
      ctx.fillText('STARVING', 92, top + 55);
    } else if (player.food < 25) {
      ctx.fillStyle = '#d8a04f';
      ctx.fillText('HUNGRY', 92, top + 55);
    }
    // Wi-Fi block active (works whether held or carried): the machines can't
    // see you. Shows minutes of charge left.
    if (player.invisibleToRobots) {
      ctx.fillStyle = '#4fd8c3';
      ctx.fillText(`HIDDEN ${Math.ceil((player.wifiPower || 0) / 60)}m`, 92, top + 32);
    }

    // Hands slot
    const handsX = 210;
    this.drawLabel('HANDS', handsX, top + 14);
    this.drawSlot(handsX, top + 20, 44, ITEMS[player.hands], 0);
    this.uiSlots.push({ x: handsX, y: top + 20, w: 44, h: 44, kind: 'hands' });
    if (player.hands) {
      ctx.fillStyle = 'rgba(207,216,195,0.7)';
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillText(ITEMS[player.hands].name, handsX, top + 74);

      const heldDef = ITEMS[player.hands];
      if (heldDef.kind === 'gun') {
        const countIn = (slots) => slots.reduce(
          (sum, s) => (s && s.item === heldDef.ammoType ? sum + s.qty : sum), 0);
        const ammoCount = countIn(player.pockets) + (player.backpack ? countIn(player.backpack.slots) : 0);
        ctx.font = 'bold 10px system-ui, sans-serif';
        ctx.fillStyle = ammoCount > 0 ? '#e8e0d0' : '#e05548';
        ctx.textAlign = 'right';
        ctx.fillText(String(ammoCount), handsX + 41, top + 60);
        ctx.textAlign = 'left';
      } else if (heldDef.kind === 'gadget') {
        // Wi-Fi block: a small battery gauge showing remaining charge, and
        // the minutes left. Drains only while held; feed it a battery to refill.
        const frac = Math.max(0, Math.min(1, (player.wifiPower || 0) / (player.wifiMax || 1)));
        const bx = handsX + 30, by = top + 24, bw = 8, bh = 16;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = frac > 0.25 ? '#4fd8c3' : '#e05548';
        ctx.fillRect(bx, by + bh * (1 - frac), bw, bh * frac);
        ctx.strokeStyle = 'rgba(207,216,195,0.6)';
        ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
        ctx.fillStyle = 'rgba(207,216,195,0.6)';
        ctx.fillRect(bx + 2.5, by - 2, 3, 2); // battery nub
        ctx.font = 'bold 9px system-ui, sans-serif';
        ctx.fillStyle = frac > 0 ? '#cfd8c3' : '#e05548';
        ctx.fillText(frac > 0 ? `${Math.ceil((player.wifiPower || 0) / 60)}m` : 'dead', handsX, top + 60);
      }
    }

    // Pockets
    const pocketsX = 286;
    this.drawLabel('POCKETS', pocketsX, top + 14);
    for (let i = 0; i < player.pockets.length; i++) {
      const slot = player.pockets[i];
      const slotX = pocketsX + i * 42;
      this.drawSlot(slotX, top + 20, 36, slot ? ITEMS[slot.item] : null, slot ? slot.qty : 0,
        player.selectedPocket === i);
      this.uiSlots.push({ x: slotX, y: top + 20, w: 36, h: 36, kind: 'pocket', i });
      if (slot) {
        ctx.font = '7px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(207,216,195,0.6)';
        ctx.textAlign = 'center';
        ctx.fillText(ITEMS[slot.item].name, slotX + 18, top + 66, 40);
        ctx.textAlign = 'left';
      }
    }

    // Backpack summary badge, once found: click it (or press I) for the full panel.
    if (player.backpack) {
      const bpX = pocketsX + player.pockets.length * 42 + 10;
      const used = player.backpack.slots.filter(Boolean).length;
      this.drawLabel('PACK (click or I)', bpX, top + 14);
      this.drawSlot(bpX, top + 20, 36, ITEMS.backpack, 0);
      this.uiSlots.push({ x: bpX, y: top + 20, w: 36, h: 36, kind: 'packbadge' });
      ctx.font = '9px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(207,216,195,0.7)';
      ctx.fillText(`${used}/16`, bpX, top + 66);
    }

    // The walkman, on its carry strap: a deck slot that takes cassettes.
    // Clicking the tape cycles side A -> side B -> stop (player.equipSlot);
    // while its current side is actually what the music system is playing,
    // the reels visibly turn, like the real thing through a cracked window.
    {
      const wmX = pocketsX + player.pockets.length * 42 + 10 + (player.backpack ? 92 : 0);
      // Strap: a worn leather line rising off both shoulders of the slot.
      ctx.strokeStyle = 'rgba(139,108,60,0.85)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(wmX + 5, top + 21); ctx.lineTo(wmX - 3, top + 6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(wmX + 31, top + 21); ctx.lineTo(wmX + 39, top + 6); ctx.stroke();
      this.drawLabel('WALKMAN', wmX, top + 14);
      this.drawSlot(wmX, top + 20, 36, null, 0);
      this.uiSlots.push({ x: wmX, y: top + 20, w: 36, h: 36, kind: 'walkman' });
      if (player.walkman) {
        const tapeDef = ITEMS[player.walkman.item];
        const sideMode = player.walkmanSide
          ? (player.walkmanSide === 'A' ? tapeDef.sideA : tapeDef.sideB) : null;
        const spinning = sideMode && hud.musicMode === sideMode;
        ctx.save();
        ctx.translate(wmX + 18, top + 38);
        ctx.scale(1.25, 1.25);
        this.drawCassette(tapeDef, spinning ? performance.now() / 300 : 0);
        ctx.restore();
        ctx.font = '7px system-ui, sans-serif';
        ctx.fillStyle = spinning ? '#e8d27a' : 'rgba(207,216,195,0.6)';
        ctx.textAlign = 'center';
        ctx.fillText(
          spinning ? `▶ ${player.walkmanSide}: ${sideMode}` : player.walkmanSide ? `${player.walkmanSide} (quiet)` : 'stopped',
          wmX + 18, top + 66, 44);
        ctx.textAlign = 'left';
      }
    }

    // Stats block, right-aligned
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(207,216,195,0.85)';
    let line = top + 18;
    const nameLine = hud.timeLabel ? `${player.name || ''} · ${hud.timeLabel}` : (player.name || '');
    ctx.fillText(nameLine, this.w - 16, line); line += 18;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillStyle = '#e8d27a';
    ctx.fillText(`Score ${player.score ?? 0}`, this.w - 16, line); line += 18;
    const rank = deathRank(player.score ?? 0);
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.fillStyle = rank.color;
    ctx.fillText(rank.title, this.w - 16, line); line += 16;
    ctx.textAlign = 'left';

    // Transient message line above the panel
    if (player.message) {
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillStyle = `rgba(232,224,208,${Math.min(1, player.message.ttl)})`;
      ctx.fillText(player.message.text, 16, top - 12);
    }

    // Title chip, top-left of screen
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(207,216,195,0.6)';
    ctx.fillText('postAI', 12, 20);
    if (hud.version) {
      ctx.font = '8px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(207,216,195,0.4)';
      ctx.fillText(`v${hud.version}`, 12, 30);
    }
  }

  drawLabel(text, x, y) {
    const ctx = this.ctx;
    ctx.font = '9px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(207,216,195,0.55)';
    ctx.fillText(text, x, y);
  }

  drawBar(x, y, w, h, frac, color, label) {
    const ctx = this.ctx;
    this.drawLabel(label, x, y - 5);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, Math.max(0, Math.min(1, frac)) * w, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  drawSlot(x, y, size, itemDef, qty, selected = false) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = selected ? '#e0c04f' : 'rgba(207,216,195,0.35)';
    ctx.lineWidth = selected ? 2 : 1;
    ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    ctx.lineWidth = 1;
    if (!itemDef) return;
    this.drawItemIcon(itemDef, x + size / 2, y + size / 2, size / 40);
    if (qty > 1) {
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillStyle = '#e8e0d0';
      ctx.textAlign = 'right';
      ctx.fillText(String(qty), x + size - 3, y + size - 4);
      ctx.textAlign = 'left';
    }
  }
}
