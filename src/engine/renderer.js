import { worldToScreen, screenToWorld, TILE_W } from './iso.js';
import { runDrawWorld, runDrawScreen } from './systems.js';
import { uiMethods, DASH_H } from './ui.js';
import { FLOORS } from '../game/tiles.js';
import { ITEMS, WEAPON_ORDER } from '../game/items.js';
import { drawAnimal } from '../game/animals.js';
import { drawBird } from '../game/birds.js';
import { drawRobot } from '../game/robots.js';
import { drawWaterDroid } from '../game/waterdroids.js';
import { drawUnderworldCreature } from '../game/underworld.js';
import { FLOOR_TEXTURES, WALL_TEXTURES, GRASS_PATCH_TEXTURE, ROCK_TEXTURES, BOX_TEXTURES, BOAT_TEXTURES, SHIP_SPRITES, PART_SPRITES, CHARACTER_SPRITE_SETS, CHAR_COMPASS_DIRS, TREE_SHEET, TREE_SPRITES, EDGE_TEXTURE, SEA_TEXTURE, CAR_SPRITES, CAR_MODEL_KEYS, CAR_DIR_KEYS, CAR_RUIN_TEXTURE, FACTORY_TEXTURE, MARBLE_TEXTURE, PAPER_TEXTURE, GRAFFITI_TEXTURES } from './textures.js';

// The underworld floor palette: seven images, loaded here (not via textures.js)
// so this stays self-contained. map.liminalTex holds a per-tile index into
// this array (0..6); index 5 is the road, used for corridors. Sentinels 255
// (open yellow sea) and 250 (baby-blue room) are handled in drawFloor.
const LIMINAL_TEX = [
  'floor-boards.png', 'floor-dirt.jpg', 'floor-grass.jpg', 'floor-grassdirt-large.png',
  'floor-pavingstone.jpg', 'floor-road.jpg', 'floor-secret.jpg',
].map((file) => { const img = new Image(); img.src = `assets/textures/${file}`; return img; });

// The open "sea" of the underworld (sentinel 255): a few tonally-similar worn
// floor photos, chosen not per-tile (which reads as noise) but in coarse
// contiguous BLOCKS, so the expanse breaks into patches of sameness that shift
// texture every so often rather than flickering every tile. All multiplied
// over the yellow base so it still reads as one sickly liminal floor. Loaded
// here to keep this file self-contained.
const SEA_TEXES = [
  'misc-ring-bottoms.jpg', 'floor-pavingstone.jpg', 'floor-dirt.jpg', 'floor-secret.jpg',
].map((file) => { const img = new Image(); img.src = `assets/textures/${file}`; return img; });
const SEA_BLOCK = 6; // tiles per texture patch

// The underworld floor lamp, a hand-drawn sprite (shade + glowing bulb + pole +
// round base) on a transparent field. Drawn by drawLamp, anchored by its foot;
// the emitted light flickers via _lampFlicker. Foot/centre/bulb positions are
// normalized fractions of the sprite's own height/width (measured off the art).
const LAMP_SPRITE = new Image(); LAMP_SPRITE.src = 'assets/textures/liminal-lamp.png';

// Book / record cover images (the Backspace's deleted objects), loaded on
// demand and cached by path. Paths can contain spaces, so encode them.
const COVER_CACHE = new Map();
function coverImg(path) {
  if (!path) return null;
  let img = COVER_CACHE.get(path);
  if (!img) { img = new Image(); img.src = 'assets/media/' + encodeURI(path); COVER_CACHE.set(path, img); }
  return img;
}

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
    // Per-island obelisk colour (R1), set each frame from currentWorld by main.js.
    // Defaults reproduce today's red so nothing changes until a world overrides.
    this.obColor = '#ff281e';
    this.obAlertColor = '#ff001e';
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
    this.torHits = []; // clickable HERMES relays (world-screen rects, lift-adjusted), rebuilt each frame
    this.hudPlayer = player; // referenced by drawWfactory for the near-by damage bar
    this._fortressAlarm = map.fortressAlarm; // maze sconces pulse red while the breach alarm holds
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
    // Sort by the FEET (world x+y), plus climbRaise for standing on a block —
    // NOT by jump height. A jump lifts the sprite up-screen but leaves the feet
    // where they are, so a player jumping BEHIND a wall is still behind it and
    // must stay occluded; adding jump height to the depth popped them in front
    // of the wall the moment they hopped (the "jump behind a block and you
    // become visible" bug). Landing ONTO a block reads correctly the instant the
    // tile flips (climbRaise engages), and Player.update keeps the vertical lift
    // continuous across that frame, so no jump-height term is needed here.
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
      // In the underworld there's no map edge to face — it's boundless yellow,
      // so the grey edge-rock cliffs are suppressed (nothing drawn out there).
      if (d.edgeRock) { if (!hud.underworld) this.drawSeaTile(d.edgeRock[0], d.edgeRock[1]); }
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

    // The player's shield bar is drawn LAST, over the whole depth-sorted scene,
    // so a block the player stands behind never paints over it — it reads as a
    // marker floating above the character, always visible while shielded.
    if (player.shielded && player.shielded()) {
      const plift = elevOf(player.x, player.y);
      if (plift) { ctx.save(); ctx.translate(0, -plift); this.playerShieldBar(player); ctx.restore(); }
      else this.playerShieldBar(player);
    }

    // Underworld ceiling lights: soft pools cast on the floor, mostly steady
    // with a rare, slow flicker (out of step per light). Drawn in world space.
    if (hud.underworld) this.drawLampGlows(map);
    // In-flight rounds, in world space.
    if (map.projectiles) this.drawProjectiles(map.projectiles);
    // Fire clouds from detonating bombs.
    if (map.explosions) this.drawExplosions(map.explosions);
    // Sparks where a weapon just landed on a robot.
    if (map.sparks) this.drawSparks(map.sparks);

    // World-space registered systems draw here, under the camera transform,
    // BEFORE restore (Stage 0: lore's floating fragments). Depth-sorted actors
    // are NOT here — they stay in the sort above. See docs/refactor-registry.md.
    runDrawWorld(ctx, { w: this.w, h: this.h, map, player });
    // POSEIDON's final purge: every surviving tower lights up and links to
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
      // A Ubik tear is NOT a clean sci-fi teleporter (that look is reserved
      // for the portal gun) — it's a raw rip in reality that drops you into
      // the underworld. Drawn as a dark, near-black void in a tall standing
      // oval, ringed by a jagged, broken, flickering violet-white fracture
      // that jitters like cracked glass rather than glowing evenly. No
      // colour-coding, no pairing, no chasing flame — every tear looks the
      // same because every tear goes to the same wrong place.
      if (portals.length) {
        const OVAL_RX = 0.62, OVAL_RY = 1.35;
        const t = performance.now() / 1000;
        for (const [sx, sy, R, fade] of portals) {
          ctx.save();
          ctx.translate(sx, sy);
          ctx.scale(OVAL_RX, OVAL_RY);
          // Faint dark-violet outer haze so the tear reads against grass.
          const haze = ctx.createRadialGradient(0, 0, R * 0.4, 0, 0, R * 1.15);
          haze.addColorStop(0, `rgba(30,18,44,${(0.5 * fade).toFixed(3)})`);
          haze.addColorStop(1, 'rgba(30,18,44,0)');
          ctx.fillStyle = haze;
          ctx.beginPath(); ctx.arc(0, 0, R * 1.15, 0, Math.PI * 2); ctx.fill();
          // The void: an almost-black hole, most of the oval.
          const coreR = R * 0.82;
          const core = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR);
          core.addColorStop(0, `rgba(4,3,8,${(0.96 * fade).toFixed(3)})`);
          core.addColorStop(0.75, `rgba(8,5,14,${(0.9 * fade).toFixed(3)})`);
          core.addColorStop(1, 'rgba(12,8,20,0)');
          ctx.fillStyle = core;
          ctx.beginPath(); ctx.arc(0, 0, coreR, 0, Math.PI * 2); ctx.fill();
          // The fracture: broken arc segments around the rim, each flickering
          // and jittering its radius on its own phase, with hard gaps between
          // — an unstable crack, not a ring. Violet-white, cold.
          ctx.lineCap = 'round';
          const segs = 9;
          for (let k = 0; k < segs; k++) {
            const flicker = 0.5 + 0.5 * Math.sin(t * (7 + k * 2.3) + k * 1.7);
            if (flicker < 0.22) continue; // a segment blinks out entirely now and then
            const base = (k * Math.PI * 2) / segs;
            const a0 = base + Math.sin(t * 2 + k) * 0.05;
            const len = 0.22 + flicker * 0.28; // short arcs, real gaps between them
            const rJit = coreR * (0.98 + Math.sin(t * 9 + k * 3) * 0.06);
            ctx.globalAlpha = fade * (0.3 + flicker * 0.6);
            ctx.strokeStyle = `rgba(${Math.round(200 + flicker * 55)},${Math.round(170 + flicker * 50)},255,1)`;
            ctx.lineWidth = (1.1 + flicker * 1.3) / Math.min(OVAL_RX, OVAL_RY);
            ctx.beginPath(); ctx.arc(0, 0, rJit, a0, a0 + len); ctx.stroke();
          }
          ctx.globalAlpha = 1;
          ctx.restore();
        }
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

    // Rosy-fingered dawn (and a softer dusk): a warm rose wash laid OVER the
    // dawn/dusk dimming so the light comes up rosy, not just grey — a subtle
    // Homeric motif. Never over the HUD.
    if (hud.dawnGlow > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const gl = hud.dawnGlow;
      const g2 = ctx.createLinearGradient(0, 0, 0, this.h - DASH_H);
      g2.addColorStop(0, `rgba(255,150,105,${(0.16 * gl).toFixed(3)})`);
      g2.addColorStop(0.6, `rgba(255,120,95,${(0.07 * gl).toFixed(3)})`);
      g2.addColorStop(1, 'rgba(255,120,95,0)');
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, this.w, this.h - DASH_H);
      ctx.restore();
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

    // While driving a machine, the robot-vision overlay (drawn by main.js after
    // this) samples the canvas as ASCII — so suppress the normal HUD here, or it
    // would be turned into ASCII too. The scene + sprites still render.
    if (hud.minimap && !hud.driving) {
      this.drawMinimap(map, player, hud.minimap, animals, this.w - MINIMAP_SIZE - 12, 12, MINIMAP_SIZE);
    }
    if (hud.skylinkActive && !hud.driving) this.drawSkylinkBanner(hud.skylinkTimer);
    if (!hud.driving) {
      this.drawDashboard(player, hud);
      this.drawHudOverlay(player, hud); // wordmark, message line, daemon voice — both layouts
    }
    if (hud.showBackpack) this.drawBackpackPanel(player);
    runDrawScreen(ctx, { w: this.w, h: this.h, map, player });
    if (hud.craftPrompt) {
      const msg = hud.craftWaveGun
        ? 'You have all eight circuit boards — press C to build a wave gun'
        : hud.craftChip
          ? 'You have eight chip fragments — press C to assemble an access chip'
          : hud.craftSword
            ? 'You have ten scrap — press C to forge a robot sword'
            : hud.craftGreekShip
              ? "You have the recipe, wood, oar, rope and sail — press C to build a sea-worthy ship"
              : hud.craftBoat
                ? 'You have the wood and a cutting tool — press C to build a boat'
                : 'You hold a stun-gun, electro-gun and Wi-Fi block — press C to build an OB-gun';
      ctx.font = 'bold 13px system-ui, sans-serif';
      const w = ctx.measureText(msg).width + 24;
      const x = (this.w - w) / 2, y = this.h - DASH_H - 40;
      ctx.fillStyle = hud.craftWaveGun ? 'rgba(64,224,208,0.92)' : hud.craftChip ? 'rgba(106,208,160,0.92)' : hud.craftSword ? 'rgba(184,192,200,0.92)' : hud.craftGreekShip ? 'rgba(154,112,56,0.94)' : hud.craftBoat ? 'rgba(138,100,55,0.92)' : 'rgba(224,100,47,0.9)';
      ctx.fillRect(x, y, w, 26);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(msg, this.w / 2, y + 17);
      ctx.textAlign = 'left';
    }
    if (hud.showSkills) this.drawSkillModal(player);
    if (hud.showWeapons) this.drawWeaponChart(player);
    // GHOST PASS: a wall, column, tower, or the factory standing just
    // south/east of the player paints clean over the sprite — the character
    // simply vanished behind any building. If something tall is in that
    // window, re-draw the player faintly OVER it: you always know where you
    // are, and the wall still reads as being in front.
    {
      const pfx2 = Math.floor(player.x), pfy2 = Math.floor(player.y);
      const NEAR_TALL = new Set(['wall', 'column', 'marbleblock']);
      const BIG_TALL = new Set(['obelisk', 'wfactory', 'mainframe', 'uplink']);
      let occluded = false;
      for (let dy = 0; dy <= 4 && !occluded; dy++) {
        for (let dx = 0; dx <= 4; dx++) {
          if (!dx && !dy) continue;
          const o = map.objectAt ? map.objectAt(pfx2 + dx, pfy2 + dy) : null;
          if (!o) continue;
          // A tall block within ~3 tiles to the south/east stands between the
          // player and the camera (widened from 2 so a wall never fully eats the
          // sprite); the big structures occlude from further out.
          if ((dx + dy <= 3 && NEAR_TALL.has(o.type)) || BIG_TALL.has(o.type)) { occluded = true; break; }
        }
      }
      if (occluded && !hud.underworld) {
        const lift2 = (map.effectiveHeightAt ? map.effectiveHeightAt(pfx2, pfy2)
          : map.heightAt ? map.heightAt(pfx2, pfy2) : 0) * ELEV;
        ctx.save();
        if (lift2) ctx.translate(0, -lift2);
        ctx.globalAlpha = 0.5; // clear enough to read where you are, still reads as behind
        this.drawPlayer(player);
        ctx.restore();
      }
    }
    if (hud.touchControls) this.drawTouchControls(hud);
    if (hud.toast) this.drawToast(hud.toast);
    if (hud.detail) this.drawDetail(hud.detail);
    if (hud.drag) this.drawDragGhost(hud.drag, player);
    if (player.torpor > 0) this.drawTorporHaze(player.torpor);
    if (hud.rest) this.drawRestOverlay(hud.rest.dim);
    if (hud.deathCert) this.drawDeathCert(hud.deathCert);
    if (hud.aiVictory) this.drawAiVictory(hud.aiVictory);
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
        : p.kind === 'laser' ? '#ff3b2a' : p.kind === 'laser_t3' ? '#ff8a1e'
        : p.kind === 'laser_m5' ? '#ff9a2e' : '#ffe27a';
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

  // A shield-state bar floating over the player's head, like the machines'
  // damage bar but SLIMMER (so it reads as protection, not health) and in the
  // shield's own colour, with a tiny label. Forcefield charge takes priority,
  // then a carried riot/mirror shield's condition (drains as it wears; the
  // mirror also runs cyan->red with heat). Nothing drawn when unshielded.
  playerShieldBar(player) {
    // Bar colour is the shield's OWN colour (from its item def), so the marker
    // reads as that piece of gear — the forcefield's green, the mirror's cyan,
    // the riot shield's steel-blue — shifting to warning red only when a mirror
    // overheats or a forcefield cell runs low.
    let frac, color;
    if (player.forcefieldActive && player.forcefieldActive()) {
      frac = player.forcefieldFrac ? player.forcefieldFrac() : 1;
      color = frac > 0.25 ? (ITEMS.forcefield.color || '#4fe08a') : '#e0894f';
    } else if (player.shieldStatus) {
      const st = player.shieldStatus();
      if (!st) return;
      frac = Math.max(0, Math.min(1, 1 - st.frac)); // condition remaining
      const itemColor = st.kind === 'mirror' ? ITEMS.mirror_shield.color : ITEMS.shield.color;
      color = st.hot ? '#e0553c' : (itemColor || '#7fd8e6');
    } else return;
    const ctx = this.ctx;
    const c = worldToScreen(player.x, player.y);
    const w = 22, h = 3, x = c.x - w / 2, y = c.y - 50 - (player.z || 0) * 32;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - 1.5, y - 1.5, w + 3, h + 3);
    const fw = w * frac;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, fw, h);
    // A shimmer: a soft bright band sweeps left->right across the filled part,
    // so a shield reads as a live, glinting field rather than a flat bar. No
    // text — the colour says which shield, the fill says how much is left.
    if (fw > 2) {
      const sweep = ((performance.now() / 1100) % 1) * (fw + 12) - 6; // travels a touch past both ends
      const g = ctx.createLinearGradient(x + sweep - 7, 0, x + sweep + 7, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.6)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, fw, h); ctx.clip();
      ctx.fillStyle = g;
      ctx.fillRect(x, y, fw, h);
      ctx.restore();
    }
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
  // The world is an island: out-of-bounds tiles are open sea, not a rock wall.
  // Shallow turquoise right at the shore, deepening to dark navy the further out
  // you go, with a slow travelling wave shimmer that's brightest in the shallows.
  drawSeaTile(tx, ty) {
    const ctx = this.ctx;
    const map = this.hudMap;
    const w = map ? map.w : 128, h = map ? map.h : 128;
    const corners = this.tileCorners(tx, ty);
    // Chebyshev distance past the island edge (0 at the shore, growing seaward).
    const d = Math.max(Math.max(0 - tx, tx - (w - 1), 0), Math.max(0 - ty, ty - (h - 1), 0));
    const depth = Math.min(1, d / 7); // fully deep by ~7 tiles out
    // Shallow turquoise deepening to a wine-dark indigo far out — Homer's
    // oinops pontos, the "wine-dark sea", now that the world is an island.
    const shallow = [86, 158, 176], deep = [34, 20, 50];
    const shade = 0.95 + tileHash(tx * 7 + 3, ty * 5 + 1) * 0.1;
    const r = Math.round((shallow[0] + (deep[0] - shallow[0]) * depth) * shade);
    const g = Math.round((shallow[1] + (deep[1] - shallow[1]) * depth) * shade);
    const b = Math.round((shallow[2] + (deep[2] - shallow[2]) * depth) * shade);
    // The ocean texture, tinted toward the shallow/deep colour so the depth
    // gradient still reads; fall back to the flat colour until it loads.
    const fill = `rgb(${r},${g},${b})`;
    this.drawTexturedQuad(corners, SEA_TEXTURE, fill, fill, 'multiply', 0.55 + 0.25 * (1 - depth));
    // Travelling wave highlight, fading out with depth (strongest in the shallows).
    const flow = 0.5 + 0.5 * Math.sin((tx + ty) * 0.6 - performance.now() / 300);
    const wa = (0.16 - depth * 0.11) * flow;
    if (wa > 0.015) {
      ctx.save();
      this.diamondPath(corners); ctx.clip();
      ctx.globalAlpha = wa;
      ctx.fillStyle = '#cdeaf2';
      ctx.fillRect(corners[3].x, corners[0].y, corners[1].x - corners[3].x, corners[2].y - corners[0].y);
      ctx.restore();
    }
    this.diamondPath(corners);
    ctx.strokeStyle = 'rgba(0,0,0,0.05)'; ctx.lineWidth = 1; ctx.stroke();
  }

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
    // The sea is always flat — draw it (deep-ocean texture at height 0) and
    // return before any elevation handling, so an edge tile that ended up as
    // sea while still carrying terrain height can never lift into a block or
    // cast a dark, sea-coloured hillside skirt floating over the water.
    if (type === 'sea') { this.drawSeaTile(tx, ty); return; }
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
    // The underworld floor is its own thing: the open sea is flat yellow +
    // procedural wear, rooms carry one of the seven photo floors, corridors
    // are road, and the odd room is baby-blue. Drawn here and returned early.
    if (type === 'liminal') { this.drawLiminalFloor(map, tx, ty, corners, shade); return; }
    // In-bounds sea: the swimmable ocean band renders through the exact same
    // path as the open ocean past the map edge (deep-ocean texture + wine-dark
    // depth tint + wave highlight), so the shore reads continuously out to sea.
    // Only 'sea' tiles get this — the river ('water') keeps its own flat-blue
    // look so it never reads as the ocean.
    if (type === 'sea') { this.drawSeaTile(tx, ty); return; }
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
  // One underworld floor tile: reads its texture index off map.liminalTex.
  // 255 = the open yellow sea (flat + wear), 250 = a baby-blue room, 0..6 =
  // one of the seven photo floors (5 = road, laid down corridors).
  drawLiminalFloor(map, tx, ty, corners, shade) {
    const ctx = this.ctx;
    const YELLOW = '#b9a862', BLUE = '#8fb3c9';
    const t = map.liminalTex ? map.liminalTex[ty * map.w + tx] : 255;
    if (t <= 6 && LIMINAL_TEX[t] && LIMINAL_TEX[t].complete && LIMINAL_TEX[t].naturalWidth) {
      // A photo floor: draw it over the yellow base, gently varied per tile.
      const alpha = 0.62 * (0.9 + 0.2 * tileHash(tx * 3 + 11, ty * 3 + 5));
      this.drawTexturedQuad(corners, LIMINAL_TEX[t], YELLOW, null, 'multiply', Math.min(0.85, alpha));
    } else if (t === 250) {
      // A baby-blue room: flat colour + procedural wear.
      this.diamondPath(corners);
      ctx.fillStyle = shadeHex(BLUE, shade);
      ctx.fill();
      this.drawLiminalWear(tx, ty, corners);
    } else {
      // The open yellow sea: pick one worn photo per coarse BLOCK (not per
      // tile), so neighbours mostly match and the floor reads as patches of
      // sameness rather than random noise. Then dither the block seams: within
      // a two-tile band of a boundary, a tile can borrow the neighbouring
      // block's texture (and its opacity) with a probability that rises toward
      // the edge, so patches interleave into each other instead of butting up
      // in a hard grid line. Opacity is per block; wear on top; falls back to
      // flat yellow until the image loads.
      const B = SEA_BLOCK;
      const idxOf = (X, Y) => Math.floor(tileHash(X * 13 + 2, Y * 13 + 5) * SEA_TEXES.length) % SEA_TEXES.length;
      let ubx = Math.floor(tx / B), uby = Math.floor(ty / B);
      const lx = tx - ubx * B, ly = ty - uby * B;
      const dxE = Math.min(lx, B - 1 - lx), dyE = Math.min(ly, B - 1 - ly); // dist to nearest V/H edge
      const EDGE = 2;
      const edgeDist = Math.min(dxE, dyE);
      if (edgeDist <= EDGE) {
        // the block just across the nearest edge
        let nbx = ubx, nby = uby;
        if (dxE <= dyE) nbx = lx < B - 1 - lx ? ubx - 1 : ubx + 1;
        else nby = ly < B - 1 - ly ? uby - 1 : uby + 1;
        const p = ((EDGE + 1 - edgeDist) / (EDGE + 2)) * 0.6; // ~0.45 at the seam, fading in
        if (tileHash(tx * 3 + 1, ty * 3 + 7) < p) { ubx = nbx; uby = nby; }
      }
      const pick = SEA_TEXES[idxOf(ubx, uby)];
      const blockA = 0.42 + tileHash(ubx * 5 + 1, uby * 5 + 9) * 0.2;   // 0.42..0.62 per (used) block
      const alpha = Math.max(0.14, blockA + (tileHash(tx, ty) - 0.5) * 0.06);
      this.drawTexturedQuad(corners, pick, shadeHex(YELLOW, shade), null, 'multiply', Math.min(0.66, alpha));
      this.drawLiminalWear(tx, ty, corners);
    }
    this.diamondPath(corners);
    ctx.strokeStyle = 'rgba(0,0,0,0.09)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // A lamp's brightness right now: mostly full on, but each lamp dips into a
  // brief fast stutter on its own slow clock (a dying fluorescent), so flicker
  // is rare and out of step across the room. Shared by the fixture and its
  // floor glow so they flicker together.
  _lampFlicker(seed) {
    const now = performance.now() / 1000;
    const slow = Math.sin(now * 0.7 + seed) * Math.sin(now * 0.13 + seed * 1.7);
    if (slow > 0.85) return (Math.sin(now * 32 + seed) > 0) ? 0.22 : 0.9; // stutter window
    return 1;
  }

  // The soft floor-pool cast by each underworld lamp. Drawn in a pass after the
  // world objects (the fixtures themselves are drawn as objects, drawLamp), so
  // the pools read as light rather than as flat discs behind everything.
  drawLampGlows(map) {
    const ctx = this.ctx;
    ctx.save();
    // Only the lamps near the camera matter — a radial gradient per lamp across
    // the whole 128x192 pocket every frame was the Backspace's framerate. Cull
    // to a generous radius around the player (set in draw as this.hudPlayer).
    const p = this.hudPlayer, CULL = 24;
    for (const o of map.objects) {
      if (o.type !== 'lamp') continue;
      if (p && Math.hypot(o.x - p.x, o.y - p.y) > CULL) continue;
      const s = worldToScreen(o.x + 0.5, o.y + 0.5);
      const bright = this._lampFlicker(o.seed || 0);
      const warm = o.warm != null ? o.warm : 0.5;
      const gr = Math.round(230 - warm * 24), gg = Math.round(210 - warm * 34), gb = Math.round(150 - warm * 80);
      const rgb = `${gr},${gg},${gb}`;
      const R = 34;
      const glow = ctx.createRadialGradient(s.x, s.y, 3, s.x, s.y, R);
      glow.addColorStop(0, `rgba(${rgb},${(0.11 * bright).toFixed(3)})`); // dim liminal yellow, per-lamp warmth
      glow.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(s.x, s.y, R, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // A single underworld floor lamp, drawn from the liminal-lamp sprite and
  // anchored by its foot to the tile centre. The fixture itself is steady; the
  // emitted light flickers (per-lamp, out of step) — a warm halo behind the
  // shade, an additive bloom over it, and a faint dip in the sprite's own
  // brightness on the stutter. Non-solid: you can walk past it.
  drawLamp(obj) {
    const ctx = this.ctx;
    const s = worldToScreen(obj.x + 0.5, obj.y + 0.5);
    const bright = this._lampFlicker(obj.seed || 0);
    const H = 64;                                  // on-screen height of the whole sprite
    const aspect = (LAMP_SPRITE.naturalWidth / LAMP_SPRITE.naturalHeight) || 1.833;
    const W = H * aspect;
    // Where the lamp sits inside its (mostly transparent) sprite, as fractions
    // of the drawn box: foot near the bottom, centred horizontally, bulb up in
    // the shade. Anchor the foot to the tile centre.
    const FOOT = 0.885, CX = 0.50, BULB = 0.20;
    const drawX = s.x - W * CX, drawY = s.y - H * FOOT;
    const bulbX = s.x, bulbY = drawY + H * BULB;
    // Per-lamp glow colour: `warm` (0..1) lerps from a pale bulb to a deeper,
    // sicklier liminal yellow, so lamps don't all glow the same. Halo behind
    // the shade (soft, dim — this is a low, wrong light, not a cosy lamp).
    const warm = obj.warm != null ? obj.warm : 0.5;
    const gr = Math.round(232 - warm * 20), gg = Math.round(214 - warm * 34), gb = Math.round(160 - warm * 84);
    const glowRGB = `${gr},${gg},${gb}`;
    const halo = ctx.createRadialGradient(bulbX, bulbY, 1, bulbX, bulbY, 20);
    halo.addColorStop(0, `rgba(${glowRGB},${(0.32 * bright).toFixed(3)})`);
    halo.addColorStop(1, `rgba(${glowRGB},0)`);
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(bulbX, bulbY, 20, 0, Math.PI * 2); ctx.fill();
    if (LAMP_SPRITE.complete && LAMP_SPRITE.naturalWidth) {
      ctx.save();
      ctx.globalAlpha = 0.85 + 0.15 * bright; // the fixture dims a touch on the stutter
      ctx.drawImage(LAMP_SPRITE, drawX, drawY, W, H);
      ctx.restore();
      // Faint additive bloom over the shade so the bulb reads as flickering on.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const bloom = ctx.createRadialGradient(bulbX, bulbY, 1, bulbX, bulbY, 13);
      bloom.addColorStop(0, `rgba(${glowRGB},${(0.2 * bright).toFixed(3)})`);
      bloom.addColorStop(1, `rgba(${glowRGB},0)`);
      ctx.fillStyle = bloom;
      ctx.beginPath(); ctx.arc(bulbX, bulbY, 13, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else {
      // Placeholder until the sprite loads: base dot + pole.
      ctx.fillStyle = 'rgba(35,32,24,0.9)';
      ctx.beginPath(); ctx.ellipse(s.x, s.y, 5.5, 2.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(40,36,26,0.85)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x, s.y - H * 0.5); ctx.stroke();
    }
  }

  // Procedural wear for the underworld's bare-colour lino floor: worn patches,
  // water stains, and scuff streaks, deterministic per tile so it holds still
  // frame to frame. Clipped to the tile diamond.
  drawLiminalWear(tx, ty, corners) {
    const ctx = this.ctx;
    const cx = (corners[0].x + corners[2].x) / 2;
    const cy = (corners[0].y + corners[2].y) / 2;
    ctx.save();
    this.diamondPath(corners);
    ctx.clip();
    // A soft discolour blotch (water stain / grime) on a good share of tiles,
    // its size and darkness hashed per tile.
    const stain = tileHash(tx * 5 + 3, ty * 9 + 1);
    if (stain > 0.35) {
      const ox = (tileHash(tx * 11 + 7, ty * 3 + 4) - 0.5) * 18;
      const oy = (tileHash(tx * 2 + 9, ty * 7 + 6) - 0.5) * 9;
      const r = 9 + stain * 16;
      const g = ctx.createRadialGradient(cx + ox, cy + oy, 1, cx + ox, cy + oy, r);
      const dark = 0.05 + stain * 0.14;
      g.addColorStop(0, `rgba(60,52,26,${dark.toFixed(3)})`);
      g.addColorStop(1, 'rgba(60,52,26,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - 24, cy - 14, 48, 28);
    }
    // A lighter worn/bleached patch on some tiles, offset the other way.
    if (tileHash(tx * 4 + 8, ty * 6 + 2) > 0.7) {
      const ox = (tileHash(tx * 3 + 2, ty * 5 + 8) - 0.5) * 14;
      const g = ctx.createRadialGradient(cx + ox, cy, 1, cx + ox, cy, 11);
      g.addColorStop(0, 'rgba(214,198,140,0.16)');
      g.addColorStop(1, 'rgba(214,198,140,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - 24, cy - 14, 48, 28);
    }
    // One or two dark scuff streaks on a minority of tiles.
    const scuff = tileHash(tx * 13 + 5, ty * 11 + 9);
    if (scuff > 0.6) {
      ctx.strokeStyle = `rgba(30,26,14,${(0.12 + scuff * 0.16).toFixed(3)})`;
      ctx.lineWidth = 1.2;
      const a = scuff * Math.PI;
      const sx = cx + Math.cos(a) * 10, sy = cy + Math.sin(a) * 5;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx - Math.cos(a) * 20, sy - Math.sin(a) * 10);
      ctx.stroke();
    }
    ctx.restore();
  }

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

  // Ruined marble columns — Odyssey set-dressing scattered across the island
  // (see game/ruins.js). Three looks: a tall standing column with a capital, a
  // snapped-off stump (variant 1), and a toppled column lying in the grass with
  // a fallen capital block (type 'colfall'). Drawn as iso cylinders — a
  // horizontal shading gradient for roundness, the marble photo clipped in for
  // veining, plus flute lines and a soft ground shadow. Deterministic per tile.
  drawColumn(obj) {
    const ctx = this.ctx;
    const map = this.hudMap;
    const s = worldToScreen(obj.x + 0.5, obj.y + 0.5);
    // Ground-contact at the tile surface: terrain lift is applied ONCE by the
    // drawables dispatch (ctx.translate of heightAt*ELEV) — lifting again here
    // floated columns/blocks clean off hillside tiles.
    const by = s.y;
    const hh = tileHash(obj.x * 3 + 1, obj.y * 3 + 7);
    const LIGHT = '#efece4', MID = '#d8d3c8', DARK = '#b3ad9f', EDGE = '#8f897b';
    const tex = MARBLE_TEXTURE;
    const marbleOK = tex && tex.complete && tex.naturalWidth;

    // Soft ground shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(s.x, by + 2, 15, 6, 0, 0, Math.PI * 2); ctx.fill();

    if (obj.type === 'colfall') {
      // Toppled: a long drum lying along one iso diagonal, with drum-segment
      // lines and a fallen capital block at one end. Orientation from obj.rot.
      const along = (obj.rot % 2 === 0) ? { x: 22, y: 11 } : { x: -22, y: 11 };
      const th = 9; // half-thickness
      const ax = s.x - along.x, ay = by - 7 - along.y;
      const bx = s.x + along.x, byy = by - 7 + along.y;
      const g = ctx.createLinearGradient(0, by - 7 - th, 0, by - 7 + th);
      g.addColorStop(0, LIGHT); g.addColorStop(0.5, MID); g.addColorStop(1, DARK);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(ax, ay - th); ctx.lineTo(bx, byy - th);
      ctx.lineTo(bx, byy + th); ctx.lineTo(ax, ay + th); ctx.closePath(); ctx.fill();
      // drum end faces
      ctx.fillStyle = EDGE; ctx.beginPath(); ctx.ellipse(ax, ay, 5, th, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#6f6a5e'; ctx.beginPath(); ctx.ellipse(ax, ay, 3.4, th - 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = MID; ctx.beginPath(); ctx.ellipse(bx, byy, 5, th, 0, 0, Math.PI * 2); ctx.fill();
      // segment lines
      ctx.strokeStyle = 'rgba(120,114,100,0.5)'; ctx.lineWidth = 1;
      for (const t of [0.34, 0.67]) {
        const lx = ax + (bx - ax) * t, ly = ay + (byy - ay) * t;
        ctx.beginPath(); ctx.moveTo(lx, ly - th + 1); ctx.lineTo(lx, ly + th - 1); ctx.stroke();
      }
      // fallen capital block near the high end
      const kx = ax - 6, ky = ay - 3;
      ctx.fillStyle = MID; ctx.fillRect(kx - 7, ky - 6, 14, 10);
      ctx.fillStyle = LIGHT; ctx.fillRect(kx - 7, ky - 6, 14, 3);
      ctx.strokeStyle = EDGE; ctx.strokeRect(kx - 7, ky - 6, 14, 10);
      return;
    }

    // Standing column: tall (variant 0) or a broken stump (variant 1).
    const broken = (obj.variant || 0) === 1;
    const H = broken ? 44 + hh * 12 : 92 + hh * 16;
    const rw = broken ? 12 : 11;
    const topY = by - H;

    // Plinth: a base ellipse + a short square block.
    ctx.fillStyle = DARK;
    ctx.beginPath(); ctx.ellipse(s.x, by, rw + 4, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = MID; ctx.fillRect(s.x - rw - 3, by - 6, (rw + 3) * 2, 6);

    // Shaft body: a cylindrical horizontal gradient for roundness, capped by a
    // top and bottom rim ellipse, with the marble photo clipped in for veining.
    const grad = ctx.createLinearGradient(s.x - rw, 0, s.x + rw, 0);
    grad.addColorStop(0, DARK); grad.addColorStop(0.35, LIGHT);
    grad.addColorStop(0.62, MID); grad.addColorStop(1, EDGE);
    ctx.fillStyle = grad;
    ctx.fillRect(s.x - rw, topY, rw * 2, H);
    ctx.beginPath(); ctx.ellipse(s.x, by, rw, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(s.x, topY, rw, 4, 0, 0, Math.PI * 2); ctx.fill();
    if (marbleOK) {
      ctx.save();
      ctx.beginPath(); ctx.rect(s.x - rw, topY, rw * 2, H); ctx.clip();
      ctx.globalAlpha = 0.5;
      const r = Math.max(rw * 2, H);
      ctx.drawImage(tex, s.x - r / 2, topY, r, r);
      ctx.restore();
    }
    // Flute grooves.
    ctx.strokeStyle = 'rgba(120,114,100,0.35)'; ctx.lineWidth = 1;
    for (const fx of [-0.55, -0.18, 0.18, 0.55]) {
      const x = s.x + fx * rw;
      ctx.beginPath(); ctx.moveTo(x, topY + 6); ctx.lineTo(x, by - 6); ctx.stroke();
    }

    if (broken) {
      // Jagged break: a rough dark cross-section on top.
      ctx.fillStyle = EDGE; ctx.beginPath(); ctx.ellipse(s.x, topY, rw, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#6f6a5e';
      ctx.beginPath();
      ctx.moveTo(s.x - rw, topY); ctx.lineTo(s.x - rw * 0.3, topY - 5);
      ctx.lineTo(s.x + rw * 0.2, topY + 2); ctx.lineTo(s.x + rw, topY - 3);
      ctx.lineTo(s.x + rw, topY); ctx.closePath(); ctx.fill();
    } else {
      // Capital: an echinus flare + a square abacus slab, lit on top.
      ctx.fillStyle = MID;
      ctx.beginPath();
      ctx.moveTo(s.x - rw, topY + 2); ctx.lineTo(s.x - rw - 5, topY - 5);
      ctx.lineTo(s.x + rw + 5, topY - 5); ctx.lineTo(s.x + rw, topY + 2);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = LIGHT; ctx.fillRect(s.x - rw - 7, topY - 11, (rw + 7) * 2, 7);
      ctx.strokeStyle = EDGE; ctx.lineWidth = 1; ctx.strokeRect(s.x - rw - 7, topY - 11, (rw + 7) * 2, 7);
    }
  }

  // A squat marble block — a fallen entablature / altar stone that sits among
  // the broken columns of a ruined temple. Drawn as a short iso cuboid on an
  // inset footprint (grass shows around it), the white-marble photo clipped over
  // light/mid/dark faces the same way the columns and walls are textured.
  drawMarbleBlock(obj) {
    const ctx = this.ctx;
    const hh = tileHash(obj.x * 3 + 2, obj.y * 3 + 5);
    const BH = 32; // block height, px — pinned to 2 levels (ELEV 16 * 2) so standing on top lines up with climbHeight 2 (tiles.js)
    const LIGHT = '#efece4', MID = '#d8d3c8', DARK = '#b3ad9f', EDGE = '#8f897b';
    const tex = MARBLE_TEXTURE, marbleOK = tex && tex.complete && tex.naturalWidth;
    const c = worldToScreen(obj.x + 0.5, obj.y + 0.5);
    // Inset footprint: lerp each tile corner toward the tile centre so the block
    // reads as an object standing on the tile, not a floor-filling wall.
    const k = 0.8;
    // No lift here: the drawables dispatch already translates by the tile's
    // heightAt*ELEV — passing it again floated the block a full step per level.
    const base = this.tileCorners(obj.x, obj.y)
      .map((p) => ({ x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k }));
    const topq = base.map((p) => ({ x: p.x, y: p.y - BH }));
    const [b0, b1, b2, b3] = base;
    const [t0, t1, t2, t3] = topq;
    // soft ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(c.x, (b0.y + b2.y) / 2 + 3, 15, 6, 0, 0, Math.PI * 2); ctx.fill();
    // two visible faces + top, textured like the walls
    this.drawTexturedQuad([b3, b2, t2, t3], tex, DARK, marbleOK ? DARK : null, 'multiply', marbleOK ? 0.5 : 1); // SW
    this.drawTexturedQuad([b1, b2, t2, t1], tex, EDGE, marbleOK ? EDGE : null, 'multiply', marbleOK ? 0.5 : 1); // SE
    this.drawTexturedQuad([t0, t1, t2, t3], tex, LIGHT, null, null, marbleOK ? 0.35 : 1);                        // top
    this.diamondPath([t0, t1, t2, t3]);
    ctx.strokeStyle = 'rgba(90,86,76,0.5)'; ctx.lineWidth = 1; ctx.stroke();
  }

  drawObject(obj) {
    switch (obj.type) {
      case 'wall':
        this.drawWall(obj);
        break;
      case 'tree': this.drawTree(obj); break;
      case 'lotus': this.drawLotus(obj); break;
      case 'flower': this.drawFlower(obj); break;
      case 'column': this.drawColumn(obj); break;
      case 'colfall': this.drawColumn(obj); break;
      case 'marbleblock': this.drawMarbleBlock(obj); break;
      case 'rock': this.drawRock(obj.x, obj.y); break;
      case 'rubble': this.drawRubble(obj.x, obj.y); break;
      case 'obelisk': this.drawObelisk(obj); break;
      case 'tor': this.drawTor(obj); break;
      case 'box': this.drawBox(obj); break;
      case 'car': this.drawCar(obj); break;
      case 'wfactory': this.drawWfactory(obj); break;
      case 'fortwall': this.drawFortWall(obj); break;
      case 'fortdoor': this.drawFortDoor(obj); break;
      case 'gateterm': this.drawGateTerm(obj); break;
      case 'mainframe': this.drawMainframe(obj); break;
      case 'uplink': this.drawUplink(obj); break;
      case 'furniture': this.drawFurniture(obj); break;
      case 'exitdoor': this.drawExitDoor(obj); break;
      case 'lamp': this.drawLamp(obj); break;
      case 'boat': this.drawShip(obj, SHIP_SPRITES && SHIP_SPRITES.noSail); break;
      case 'greek_ship': this.drawShip(obj, SHIP_SPRITES && SHIP_SPRITES.greek); break;
    }
  }

  // A boat beached at the shore: a small wooden hull with a pointed bow and
  // stern, its extremities projected through worldToScreen so it sits flat in
  // the iso plane on the beach tile. obj.hull is spent crossing in Stage 1b;
  // here the boat is purely a placed object you walk up to and board.
  // A beached vessel drawn as a billboarded PNG sprite (boat-no-sail or the
  // greek ship). Falls back to the procedural drawBoat until the sprite loads,
  // so there's never a blank tile on the first frames.
  drawShip(obj, img) {
    if (!img || !img.complete || !img.naturalWidth) { this.drawBoat(obj); return; }
    const ctx = this.ctx;
    const cx = obj.x + 0.5, cy = obj.y + 0.5;
    const c = worldToScreen(cx, cy);
    // One iso tile's screen width, derived from the diamond so no magic constant.
    const west = worldToScreen(obj.x, obj.y + 1), east = worldToScreen(obj.x + 1, obj.y);
    const tileW = Math.max(24, east.x - west.x);
    const w = tileW * 1.9;
    const h = w * (img.naturalHeight / img.naturalWidth);
    const wob = obj.shake ? Math.sin(obj.shake * 40) * obj.shake * 4 : 0;
    ctx.save();
    ctx.translate(wob, 0);
    // Soft ground shadow at the waterline.
    const sh = ctx.createRadialGradient(c.x, c.y, 6, c.x, c.y, w * 0.5);
    sh.addColorStop(0, 'rgba(0,0,0,0.32)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y + 4, w * 0.46, w * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    // Anchor the hull so it sits on the tile (bottom of the sprite ~ the waterline).
    ctx.drawImage(img, c.x - w / 2, c.y - h + h * 0.18, w, h);
    ctx.restore();
  }

  drawBoat(obj) {
    const ctx = this.ctx;
    const cx = obj.x + 0.5, cy = obj.y + 0.5;
    const wob = obj.shake ? Math.sin(obj.shake * 40) * obj.shake * 4 : 0;
    // Hull extremities: a touch longer than one tile, pointed fore and aft,
    // beamier amidships. Each is a parallelogram vertex (stern = stbd+port-bow),
    // so any three feed drawTexturedQuad directly to warp the grain over a face.
    const bow   = worldToScreen(cx, cy - 0.9);
    const stern = worldToScreen(cx, cy + 0.9);
    const port  = worldToScreen(cx - 0.55, cy);
    const stbd  = worldToScreen(cx + 0.55, cy);
    const c = worldToScreen(cx, cy);
    const HULL = 11;                          // deck sits this many px above the waterline
    const up = (p) => ({ x: p.x, y: p.y - HULL }); // a point raised to deck level
    const hull = BOAT_TEXTURES && BOAT_TEXTURES[0]; // darker figured grain: sides + deck
    const inner = BOAT_TEXTURES && BOAT_TEXTURES[1]; // lighter grain: interior boards
    ctx.save();
    ctx.translate(wob, 0);
    // Soft ground shadow.
    ctx.save();
    ctx.translate(0, 5);
    const sh = ctx.createRadialGradient(c.x, c.y, 6, c.x, c.y, 30);
    sh.addColorStop(0, 'rgba(0,0,0,0.30)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, 30, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Dark waterline lens underneath, so any seam between the hull faces reads
    // as shadow rather than background.
    ctx.beginPath();
    ctx.moveTo(bow.x, bow.y); ctx.lineTo(stbd.x, stbd.y);
    ctx.lineTo(stern.x, stern.y); ctx.lineTo(port.x, port.y); ctx.closePath();
    ctx.fillStyle = '#241608';
    ctx.fill();
    // The two camera-facing hull sides (they meet at the near stern vertex),
    // grain stretched down each from the gunwale to the waterline. The SW face
    // is turned away from the light, so it's tinted darker than the SE.
    this.drawTexturedQuad([up(port), up(stern), stern, port], hull, '#4a3120', 'rgba(18,11,5,0.5)', 'multiply', 0.95);
    this.drawTexturedQuad([up(stbd), up(stern), stern, stbd], hull, '#5c3f26', 'rgba(26,16,7,0.34)', 'multiply', 0.95);
    // Deck / gunwale: the grain stretched across the whole top lens.
    this.drawTexturedQuad([up(bow), up(stbd), up(stern), up(port)], hull, '#7a5636', null, null, 0.95);
    ctx.beginPath();
    ctx.moveTo(up(bow).x, up(bow).y); ctx.lineTo(up(stbd).x, up(stbd).y);
    ctx.lineTo(up(stern).x, up(stern).y); ctx.lineTo(up(port).x, up(port).y); ctx.closePath();
    ctx.strokeStyle = '#3f2a17';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    // Cockpit: an inset well of lighter interior boards so the boat reads as
    // open, not a slab. A faint shadow at its forward lip gives it depth.
    const ibow = up(worldToScreen(cx, cy - 0.5)), istern = up(worldToScreen(cx, cy + 0.5));
    const iport = up(worldToScreen(cx - 0.3, cy)), istbd = up(worldToScreen(cx + 0.3, cy));
    this.drawTexturedQuad([ibow, istbd, istern, iport], inner, '#6b4a2b', 'rgba(28,18,9,0.28)', 'multiply', 0.95);
    ctx.strokeStyle = 'rgba(20,12,6,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(iport.x, iport.y); ctx.lineTo(ibow.x, ibow.y); ctx.lineTo(istbd.x, istbd.y);
    ctx.stroke();
    // A thwart (seat plank) across the beam.
    ctx.strokeStyle = '#8a6437';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(iport.x, iport.y); ctx.lineTo(istbd.x, istbd.y);
    ctx.stroke();
    ctx.restore();
  }

  // The way out of the underworld: a plain, mundane interior door standing in
  // the wall — a pale-cream slab on the two camera-facing faces of the wall
  // tile, with a dark frame and a knob. No sign, no glow; that it's so
  // ordinary down here is the unsettling part.
  drawExitDoor(obj) {
    const ctx = this.ctx;
    const H = 34;
    const g = {
      top: worldToScreen(obj.x, obj.y), right: worldToScreen(obj.x + 1, obj.y),
      bottom: worldToScreen(obj.x + 1, obj.y + 1), left: worldToScreen(obj.x, obj.y + 1),
    };
    const r = (p) => ({ x: p.x, y: p.y - H });
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.moveTo(g.top.x, g.top.y + 4); ctx.lineTo(g.right.x, g.right.y + 4);
    ctx.lineTo(g.bottom.x, g.bottom.y + 4); ctx.lineTo(g.left.x, g.left.y + 4); ctx.closePath(); ctx.fill();
    // Dark door frame: the SW and SE faces, slightly darker than the cream.
    ctx.fillStyle = '#4a4236';
    for (const [a, b] of [[g.left, g.bottom], [g.bottom, g.right]]) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.lineTo(r(b).x, r(b).y); ctx.lineTo(r(a).x, r(a).y);
      ctx.closePath(); ctx.fill();
    }
    // The cream door leaf, inset on each near face.
    const inset = (a, b, lo, hi, hLo, hHi) => {
      const l = (t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      const p0 = l(lo), p1 = l(hi);
      return [
        { x: p0.x, y: p0.y - hLo }, { x: p1.x, y: p1.y - hLo },
        { x: p1.x, y: p1.y - hHi }, { x: p0.x, y: p0.y - hHi },
      ];
    };
    const leaf = inset(g.bottom, g.right, 0.12, 0.88, 2, H - 4); // SE face — the one square-on to the camera
    ctx.fillStyle = '#dcd0b4';
    ctx.beginPath(); ctx.moveTo(leaf[0].x, leaf[0].y);
    for (const p of leaf.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(40,34,24,0.6)'; ctx.lineWidth = 1; ctx.stroke();
    // A recessed panel and a dark knob near the leading edge.
    ctx.strokeStyle = 'rgba(90,80,58,0.6)';
    const pin = inset(g.bottom, g.right, 0.28, 0.72, 8, H - 10);
    ctx.beginPath(); ctx.moveTo(pin[0].x, pin[0].y);
    for (const p of pin.slice(1)) ctx.lineTo(p.x, p.y); ctx.closePath(); ctx.stroke();
    const knob = { x: g.bottom.x + (g.right.x - g.bottom.x) * 0.8, y: g.bottom.y + (g.right.y - g.bottom.y) * 0.8 - H / 2 };
    ctx.fillStyle = '#2a241a';
    ctx.beginPath(); ctx.arc(knob.x, knob.y, 1.8, 0, Math.PI * 2); ctx.fill();
    // A lit green EXIT sign, flush-mounted on the same wall face as the door
    // (the SE face, via the same skewed inset() used for the leaf) so it sits
    // in correct isometric perspective directly above the door rather than as
    // a flat billboard — the one clear marker in all this wrongness.
    const sign = inset(g.bottom, g.right, 0.14, 0.86, H + 6, H + 22);
    const scx = (sign[0].x + sign[2].x) / 2, scy = (sign[0].y + sign[2].y) / 2;
    const glow = ctx.createRadialGradient(scx, scy, 2, scx, scy, 26);
    glow.addColorStop(0, 'rgba(60,220,120,0.5)'); glow.addColorStop(1, 'rgba(60,220,120,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(scx, scy, 26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(8,20,12,0.94)';
    ctx.beginPath(); ctx.moveTo(sign[0].x, sign[0].y);
    for (const p of sign.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(80,240,140,0.9)'; ctx.lineWidth = 1.5; ctx.stroke();
    // The "EXIT" lettering, rendered once to an offscreen canvas and then
    // mapped through an affine transform onto the sign's skewed face so it
    // leans in the same isometric perspective as the panel rather than sitting
    // flat. The transform sends the text-image rectangle's corners to the
    // (slightly inset) sign quad: (0,0)->top-left, (w,0)->top-right,
    // (0,h)->bottom-left.
    const img = this._exitTextImg();
    const k = 0.84; // inset the letters inside the panel border
    const inner = sign.map((p) => ({ x: scx + (p.x - scx) * k, y: scy + (p.y - scy) * k }));
    const P00 = inner[3], P10 = inner[2], P01 = inner[0];
    const w = img.width, h = img.height;
    ctx.save();
    ctx.transform(
      (P10.x - P00.x) / w, (P10.y - P00.y) / w,
      (P01.x - P00.x) / h, (P01.y - P00.y) / h,
      P00.x, P00.y,
    );
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }

  // Cached green "EXIT" glyph image, drawn flat here and skewed at draw time.
  _exitTextImg() {
    if (this._exitText) return this._exitText;
    const c = document.createElement('canvas');
    c.width = 120; c.height = 44;
    const x = c.getContext('2d');
    x.fillStyle = '#8dffbc';
    x.font = 'bold 34px system-ui, sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.shadowColor = 'rgba(140,255,185,0.9)'; x.shadowBlur = 5;
    x.fillText('EXIT', 60, 23);
    this._exitText = c;
    return c;
  }

  // A pile of stacked junk cluttering an underworld room: one blocky extruded
  // prism, often with a smaller one perched on top and shoved off-centre, in
  // muted grey/tan tones — reads as furniture heaped up rather than a clean
  // crate. Deterministic from obj.variant/seed/h so it holds still.
  drawFurniture(obj) {
    const ctx = this.ctx;
    const H = obj.h || 12;
    const g = {
      top: worldToScreen(obj.x, obj.y), right: worldToScreen(obj.x + 1, obj.y),
      bottom: worldToScreen(obj.x + 1, obj.y + 1), left: worldToScreen(obj.x, obj.y + 1),
    };
    const pals = [
      ['#7a6f5c', '#655a47', '#8c8171'], // dun
      ['#6d6860', '#565046', '#807a6f'], // grey
      ['#8a7d60', '#6b6048', '#a2957a'], // tan
    ];
    const p = pals[(obj.variant || 0) % pals.length];
    // Ground shadow over the tile.
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.moveTo(g.top.x, g.top.y); ctx.lineTo(g.right.x, g.right.y);
    ctx.lineTo(g.bottom.x, g.bottom.y); ctx.lineTo(g.left.x, g.left.y);
    ctx.closePath(); ctx.fill();
    // One extruded block; `shrink` pulls the footprint toward its centre so a
    // stacked block can sit narrower. Returns the raised (top-face) corners.
    const prism = (base, h, shrink, offX) => {
      const cx = (base.top.x + base.bottom.x) / 2, cy = (base.top.y + base.bottom.y) / 2;
      const s = (pt) => ({ x: cx + (pt.x - cx) * shrink + offX, y: cy + (pt.y - cy) * shrink });
      const b = { top: s(base.top), right: s(base.right), bottom: s(base.bottom), left: s(base.left) };
      const r = {
        top: { x: b.top.x, y: b.top.y - h }, right: { x: b.right.x, y: b.right.y - h },
        bottom: { x: b.bottom.x, y: b.bottom.y - h }, left: { x: b.left.x, y: b.left.y - h },
      };
      ctx.fillStyle = p[1]; // SW face
      ctx.beginPath(); ctx.moveTo(b.left.x, b.left.y); ctx.lineTo(b.bottom.x, b.bottom.y);
      ctx.lineTo(r.bottom.x, r.bottom.y); ctx.lineTo(r.left.x, r.left.y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = p[0]; // SE face
      ctx.beginPath(); ctx.moveTo(b.bottom.x, b.bottom.y); ctx.lineTo(b.right.x, b.right.y);
      ctx.lineTo(r.right.x, r.right.y); ctx.lineTo(r.bottom.x, r.bottom.y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = p[2]; // top
      ctx.beginPath(); ctx.moveTo(r.top.x, r.top.y); ctx.lineTo(r.right.x, r.right.y);
      ctx.lineTo(r.bottom.x, r.bottom.y); ctx.lineTo(r.left.x, r.left.y); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.32)'; ctx.lineWidth = 1; ctx.stroke();
      return r;
    };
    const top1 = prism(g, H, 0.86, 0);
    // Two in three piles carry a smaller block shoved off to one side on top.
    if ((obj.seed || 0) % 3 !== 0) {
      const off = ((obj.seed || 0) % 5) - 2;
      const base2 = { top: top1.top, right: top1.right, bottom: top1.bottom, left: top1.left };
      prism(base2, H * 0.55, 0.6, off * 1.6);
    }
  }

  // The red uplink mast: a tall dark spar with a red-caged beacon at its head,
  // wiring the fortress into POSEIDON. Wrecked once hammered down.
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

  // --- ZEUS's fortress (southern annex) ------------------------------
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
      // On intruder alert the whole maze switches to a hard, fast RED pulse
      // (mostly in sync — a klaxon strobe); otherwise each sconce glows slowly
      // on its own cyan/amber phase.
      const alarm = this._fortressAlarm;
      const hue = alarm ? [255, 45, 35] : obj.lightHue === 'amber' ? [255, 176, 64] : [95, 214, 255];
      const period = alarm ? 230 : 900;
      const phase = alarm ? (obj.lightPhase || 0) * 0.25 : (obj.lightPhase || 0);
      const swing = alarm ? 0.75 : 0.6;
      const pulse = (alarm ? 0.2 : 0.28) + swing * (0.5 + 0.5 * Math.sin(performance.now() / period + phase));
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

  // ZEUS's mainframe core: a tall, near-black metal monolith with a
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
    ctx.fillText((obj.ai || 'ZEUS').toUpperCase(), labelC.x, labelC.y - H * 0.62);
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
  drawGraffiti(obj, face, side = 'se') {
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
    // The SW face's u basis (b3 -> b2) runs the opposite screen direction from
    // the SE face's (b1 -> b2), so its un-mirror bounds are flipped (0.06 ->
    // 0.94 instead of 0.94 -> 0.06) to keep the text reading left-to-right.
    const [uLo, uHi] = side === 'sw' ? [0.06, 0.94] : [0.94, 0.06];
    // Orientation on the wall's SE face. subQuad's basis is u along b1 -> b2
    // and v along b1 -> t1. drawTexturedQuad maps the text canvas so its own
    // +x (left -> right of the text) follows p0 -> p1 and its own +y (top ->
    // bottom) follows p0 -> p3. To read upright and un-mirrored on the face
    // as the player sees it, the text's +x must point screen-rightward and
    // its +y screen-downward, which means passing BOTH bounds high-then-low:
    // u 0.94 -> 0.06 (un-mirror) and v 0.62 -> 0.28 (right way up). Verified
    // in-game against "THE WIRES LIE".
    const quad = this.subQuad(face[0], face[1], face[3], uLo, uHi, 0.62 + jitter, 0.28 + jitter);
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
  drawGraffitiPoster(obj, face, side = 'se') {
    const tex = GRAFFITI_TEXTURES[obj.graffitiImage % GRAFFITI_TEXTURES.length];
    // Stretch the poster across (almost) the whole wall face — a mural covering
    // the block, not a small pasted photo. A hair of inset keeps the dark paper
    // backing from bleeding past the diamond edge. Un-mirrored + right-way-up
    // via the same high->low bounds convention as drawGraffiti (flipped on the
    // SW face, whose u basis runs the other way).
    const [uLo, uHi] = side === 'sw' ? [0.02, 0.98] : [0.98, 0.02];
    const quad = this.subQuad(face[0], face[1], face[3], uLo, uHi, 0.98, 0.04);
    this.drawTexturedQuad(quad, tex, '#1c1a16', 'rgba(30,22,14,0.3)', 'multiply', 0.5);
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

    // Graffiti sits on the SE face by default, but worldgen can flag a wall
    // `graffitiFace: 'sw'` so marks also appear on the left-facing (south-west)
    // face — the draw fns un-mirror per side so text still reads left-to-right.
    const gSide = obj.graffitiFace === 'sw' ? 'sw' : 'se';
    const gFace = gSide === 'sw' ? swFace : seFace;
    if (obj.graffitiImage != null) this.drawGraffitiPoster(obj, gFace, gSide);
    else if (obj.graffiti) this.drawGraffiti(obj, gFace, gSide);
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

  // POSEIDON online: every surviving tower's crown-light position, linked to
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

  // The banner shown once POSEIDON comes online. There's no timer to beat —
  // it counts up, not down, since the purge doesn't stop until it catches
  // the player.
  drawSkylinkBanner(elapsed) {
    const ctx = this.ctx;
    const t = Math.max(0, elapsed || 0);
    const m = Math.floor(t / 60), s = Math.floor(t % 60);
    const msg = `POSEIDON ONLINE — hunted for ${m}:${String(s).padStart(2, '0')}`;
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


  // AI signal tower: a tall narrow black monolith with a slow-pulsing red
  // light near the crown. Destructible in a later phase.
  // The obelisk eye/glow colour at a given alert (0..1), interpolated between the
  // current world's rest and alert hues (R1). Returns [r,g,b].
  _obColorAt(alert) {
    const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    const t = Math.min(1, Math.max(0, alert));
    const c0 = hex(this.obColor || '#ff281e'), c1 = hex(this.obAlertColor || '#ff001e');
    return c0.map((v, i) => Math.round(v + (c1[i] - v) * t));
  }

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
    // A powered-down tower (its island's daemon is dead) shows no light at
    // all — the husk stands, but nothing is home.
    if (obj.poweredDown) return;
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
    } else if (obj.cls === 'siren' && !obj.destroyed) {
      // SIREN class: it doesn't alarm red — it sings. A slow aquamarine pulse
      // at the signal, brighter when it has you (alert), and expanding rings
      // rippling outward like sound made visible.
      const now = performance.now();
      const pulse = 0.5 + 0.5 * Math.sin(now / 520);
      const a = Math.min(1, 0.4 + 0.35 * pulse + Math.min(1, alert) * 0.3);
      const glow = ctx.createRadialGradient(c.x, ly, 0, c.x, ly, 17);
      glow.addColorStop(0, `rgba(47, 230, 208, ${(0.5 * a).toFixed(3)})`);
      glow.addColorStop(1, 'rgba(47, 230, 208, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(c.x, ly, 17, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(150, 245, 230, ${a.toFixed(3)})`;
      ctx.beginPath(); ctx.arc(c.x, ly, 3, 0, Math.PI * 2); ctx.fill();
      // song rings (faster / brighter when it has sensed you)
      const speed = 1500 - Math.min(1, alert) * 700;
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 3; i++) {
        const ph = ((now / speed) + i / 3) % 1;
        const rr = 4 + ph * 24;
        ctx.strokeStyle = `rgba(47, 230, 208, ${(0.4 * (1 - ph)).toFixed(3)})`;
        ctx.beginPath(); ctx.ellipse(c.x, ly, rr, rr * 0.6, 0, 0, Math.PI * 2); ctx.stroke();
      }
    } else if (alert > 0.3) {
      // Fast alarm blink, bright and saturated, with a glow halo.
      const blink = 0.5 + 0.5 * Math.abs(Math.sin(performance.now() / 130));
      const a = Math.min(1, 0.55 + alert * 0.45) * blink;
      const [oer, oeg, oeb] = this._obColorAt(alert); // per-island eye hue (R1)
      const glow = ctx.createRadialGradient(c.x, ly, 0, c.x, ly, 16);
      glow.addColorStop(0, `rgba(${oer}, ${oeg}, ${oeb}, ${0.5 * a})`);
      glow.addColorStop(1, `rgba(${oer}, ${oeg}, ${oeb}, 0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(c.x, ly, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(${oer}, ${oeg}, ${oeb}, ${a})`;
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

  // A TOR relay: RON's hilltop counter-station to the obelisks. Deliberately
  // the obelisk's opposite — not a sleek black monolith but a squat, weathered
  // cabinet under a leaning lattice mast, patched and rust-streaked, with a warm
  // amber CRT (the HERMES terminal) flickering on its face. Older, cruder,
  // friendlier. Clicked by proximity in main.js, so no hit-rect needed here.
  drawTor(obj) {
    const ctx = this.ctx;
    const c = worldToScreen(obj.x + 0.5, obj.y + 0.5);
    const t = performance.now();
    const gl = obj.glitch || 0;
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath(); ctx.ellipse(c.x, c.y, 14, 7, 0, 0, Math.PI * 2); ctx.fill();

    // --- Cabinet: a boxy metal housing, two visible faces + a top. ---
    const W = 8, HB = 20; // half-width, box height
    const topY = c.y - HB;
    ctx.fillStyle = '#6e5a3a'; // SW face (weathered tan-steel)
    ctx.beginPath();
    ctx.moveTo(c.x - W, c.y - 3); ctx.lineTo(c.x, c.y + 2);
    ctx.lineTo(c.x, c.y + 2 - HB); ctx.lineTo(c.x - W, c.y - 3 - HB);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#57492f'; // SE face (shaded)
    ctx.beginPath();
    ctx.moveTo(c.x + W, c.y - 3); ctx.lineTo(c.x, c.y + 2);
    ctx.lineTo(c.x, c.y + 2 - HB); ctx.lineTo(c.x + W, c.y - 3 - HB);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#7d6941'; // top cap
    ctx.beginPath();
    ctx.moveTo(c.x - W, c.y - 3 - HB); ctx.lineTo(c.x, c.y + 2 - HB);
    ctx.lineTo(c.x + W, c.y - 3 - HB); ctx.lineTo(c.x, c.y - 8 - HB);
    ctx.closePath(); ctx.fill();
    // Rust streaks down the SW face.
    ctx.strokeStyle = 'rgba(120,70,35,0.5)'; ctx.lineWidth = 1;
    for (const rx of [-5, -2, 2]) {
      ctx.beginPath(); ctx.moveTo(c.x + rx, c.y - 3 - HB + 3); ctx.lineTo(c.x + rx, c.y - 3 - HB * 0.4); ctx.stroke();
    }

    // --- Leaning lattice mast rising from the cabinet top. ---
    const lean = 3 + 2 * (gl - 0.5); // each relay leans a little differently
    const baseX = c.x, baseY = topY - 4;
    const tipX = c.x + lean, tipY = baseY - 40;
    ctx.strokeStyle = '#4a4640'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(baseX - 3, baseY); ctx.lineTo(tipX, tipY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(baseX + 3, baseY); ctx.lineTo(tipX, tipY); ctx.stroke();
    ctx.lineWidth = 1; // lattice rungs + guy wire
    for (let k = 1; k <= 4; k++) {
      const f0 = k / 5;
      const lx = baseX - 3 + (tipX - (baseX - 3)) * f0, rx = baseX + 3 + (tipX - (baseX + 3)) * f0;
      const yy = baseY + (tipY - baseY) * f0;
      ctx.beginPath(); ctx.moveTo(lx, yy); ctx.lineTo(rx, yy); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(60,56,50,0.7)';
    ctx.beginPath(); ctx.moveTo(tipX, tipY + 6); ctx.lineTo(c.x + W + 2, c.y - 4); ctx.stroke(); // guy wire

    // --- Off-grid, NOT an antenna: a little solar panel + a slow wind vane at
    // the top, and greenery growing up the frame. Nothing that broadcasts —
    // this relay is meant to be undetectable (see the HERMES lore). ---
    // Solar panel: a small tilted dark-blue cell with a grid, propped at the tip.
    ctx.save();
    ctx.translate(tipX, tipY - 1); ctx.rotate(-0.35);
    ctx.fillStyle = '#20304a';
    ctx.fillRect(-7, -4, 14, 6);
    ctx.strokeStyle = 'rgba(120,160,210,0.5)'; ctx.lineWidth = 0.7;
    for (let gx = -5; gx <= 5; gx += 3) { ctx.beginPath(); ctx.moveTo(gx, -4); ctx.lineTo(gx, 2); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(-7, -1); ctx.lineTo(7, -1); ctx.stroke();
    // a faint sky glint that drifts across the panel
    ctx.fillStyle = `rgba(180,210,240,${(0.25 + 0.2 * Math.sin(t / 900 + gl * 4)).toFixed(3)})`;
    ctx.fillRect(-6 + ((t / 300 + gl * 8) % 12), -4, 2, 6);
    ctx.restore();
    // Small wind vane on a stub above the panel: three stubby blades, turning slow.
    const spin = t / 900 + gl * 6;
    ctx.strokeStyle = '#6a655c'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(tipX + 6, tipY); ctx.lineTo(tipX + 6, tipY - 7); ctx.stroke();
    ctx.strokeStyle = '#8a8478'; ctx.lineWidth = 1.4;
    for (let k = 0; k < 3; k++) {
      const a = spin + k * (Math.PI * 2 / 3);
      ctx.beginPath(); ctx.moveTo(tipX + 6, tipY - 7);
      ctx.lineTo(tipX + 6 + Math.cos(a) * 4.5, tipY - 7 + Math.sin(a) * 4.5 * 0.5); ctx.stroke();
    }
    // Greenery climbing the frame — leaves at a couple of the lattice joints.
    ctx.fillStyle = '#3f7a3a';
    for (const [lx0, ly0] of [[baseX - 2, baseY - 8], [baseX + 3, baseY - 18], [baseX - 1, baseY - 26]]) {
      ctx.beginPath(); ctx.ellipse(lx0, ly0, 2.4, 1.4, -0.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(lx0 + 2, ly0 + 1, 2, 1.2, 0.4, 0, Math.PI * 2); ctx.fill();
    }

    // --- The HERMES CRT on the SW face: warm amber, flickering, glitchy. ---
    const flick = 0.72 + 0.28 * Math.abs(Math.sin(t / 200 + gl * 3));
    const scy = topY + 5; // screen top
    // soft amber bloom
    const glow = ctx.createRadialGradient(c.x - 3, scy + 4, 0, c.x - 3, scy + 4, 12);
    glow.addColorStop(0, `rgba(232,150,40,${(0.30 * flick).toFixed(3)})`);
    glow.addColorStop(1, 'rgba(232,150,40,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(c.x - 3, scy + 4, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#140d04';
    ctx.fillRect(c.x - 6, scy, 8, 10);
    ctx.fillStyle = `rgba(226,150,48,${(0.55 * flick).toFixed(3)})`;
    ctx.fillRect(c.x - 5, scy + 1, 6, 8);
    // scanlines
    ctx.strokeStyle = 'rgba(60,32,6,0.6)';
    for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(c.x - 5, scy + 2 + k * 3); ctx.lineTo(c.x + 1, scy + 2 + k * 3); ctx.stroke(); }
    // occasional glitch: a bright torn line offset sideways
    if (Math.sin(t / 130 + gl * 10) > 0.86) {
      const gy = scy + 2 + Math.floor((t / 90 + gl * 5) % 6);
      ctx.fillStyle = 'rgba(255,196,110,0.85)';
      ctx.fillRect(c.x - 5 + (Math.sin(t / 40) > 0 ? 1 : -1), gy, 6, 1);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.strokeRect(c.x - 6, scy, 8, 10);

    // Clickable region. The relay is drawn lifted up its hill (the caller
    // translates by -lift before drawObject), so the hit rect is offset up by
    // that same lift to sit where the mast actually appears on screen. Compared
    // against worldToScreen(camera.toWorld(click)) in torAt — same space.
    const lift = (this.hudMap && this.hudMap.heightAt ? this.hudMap.heightAt(obj.x, obj.y) : 0) * ELEV;
    const PAD = 10;
    const top = tipY - 8 - lift; // from the aerial tip...
    const bot = c.y + 2 - lift;  // ...down to the cabinet foot
    this.torHits.push({ obj, x: c.x - 9 - PAD, y: top - PAD, w: 18 + 2 * PAD, h: (bot - top) + 2 * PAD });
  }

  // The HERMES relay whose (lift-adjusted) body contains a world-screen point.
  torAt(wsx, wsy) {
    for (const h of this.torHits) {
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
    // Yellow supply boxes stand in the underworld; the resistance caches out
    // in the world keep their crate-brown.
    const swClosed = obj.yellow ? '#c8a83c' : '#9a774c';
    const seClosed = obj.yellow ? '#b0902e' : '#805f3b';
    // Wood-grain faces: a variant + opacity picked per crate (from its tile) so
    // a row of crates reads varied. drawTexturedQuad fills the crate colour then
    // warps the grain over it (multiply), falling back to flat until it loads.
    const bseed = ((obj.x * 73856093) ^ (obj.y * 19349663)) >>> 0;
    const woodTex = (!obj.opened && BOX_TEXTURES && BOX_TEXTURES.length) ? BOX_TEXTURES[bseed % BOX_TEXTURES.length] : null;
    const woodA = 0.45 + ((bseed >> 5) % 40) / 100; // 0.45..0.84 per crate
    const swPts = [{ x: c.x - w, y: c.y - 3 }, { x: c.x, y: c.y + 3 }, { x: c.x, y: c.y + 3 - h }, { x: c.x - w, y: c.y - 3 - h }];
    const sePts = [{ x: c.x + w, y: c.y - 3 }, { x: c.x, y: c.y + 3 }, { x: c.x, y: c.y + 3 - h }, { x: c.x + w, y: c.y - 3 - h }];
    if (woodTex) {
      this.drawTexturedQuad(swPts, woodTex, swClosed, swClosed, 'multiply', woodA);
      this.drawTexturedQuad(sePts, woodTex, seClosed, seClosed, 'multiply', woodA);
    } else {
      const fillFace = (pts, col) => {
        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.closePath(); ctx.fill();
      };
      fillFace(swPts, obj.opened ? '#33291a' : swClosed);
      fillFace(sePts, obj.opened ? '#271f13' : seClosed);
    }
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

  // A lotus plant: broad low pads and a pale cream-gold bloom. Deliberately
  // NOT luminous (no glow, so the "texture every glow" rule doesn't apply) —
  // it should read as an innocent flower, not a hazard, until you eat one.
  drawLotus(obj) {
    const ctx = this.ctx;
    const c = worldToScreen(obj.x + 0.5, obj.y + 0.5);
    const v = obj.variant || 0;
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.beginPath(); ctx.ellipse(c.x, c.y + 2, 11, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4f6f3a';
    for (const [ox, oy, rx] of [[-6, 0, 7], [6, 1, 6], [0, -2, 7]]) {
      ctx.beginPath(); ctx.ellipse(c.x + ox, c.y + oy, rx, rx * 0.45, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = '#6a8a44'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x, c.y - 9 - v); ctx.stroke();
    const by = c.y - 11 - v;
    ctx.fillStyle = '#e7d7b0';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + v;
      ctx.beginPath(); ctx.ellipse(c.x + Math.cos(a) * 3.4, by + Math.sin(a) * 2.2, 3.2, 1.8, a, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#f4ead0'; ctx.beginPath(); ctx.arc(c.x, by, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#caa85e'; ctx.beginPath(); ctx.arc(c.x, by, 1.1, 0, Math.PI * 2); ctx.fill();
  }

  // Decorative wildflowers (worldgen.scatterFlowers): 1-3 small blooms per
  // tile. kind: 0 white daisy, 1 pink campion, 2 blue cornflower, 3 yellow
  // daffodil (the valley flower — taller, with an orange trumpet). Same
  // innocent no-glow register as the lotus, deliberately smaller so the
  // grove stays special.
  drawFlower(obj) {
    const ctx = this.ctx;
    const PAL = [
      { petal: '#f2f4ee', heart: '#e8c94f' },
      { petal: '#e79ab8', heart: '#f4e08a' },
      { petal: '#7d95e0', heart: '#3e4f8f' },
      { petal: '#f2d84b', heart: '#e8973b' },
    ];
    const k = obj.kind || 0, p = PAL[k] || PAL[0];
    const n = obj.n || 1;
    for (let i = 0; i < n; i++) {
      const a = (obj.sway || 0) + i * 2.4;
      const c = worldToScreen(obj.x + 0.5 + Math.cos(a) * 0.22, obj.y + 0.5 + Math.sin(a) * 0.22);
      // Tiny on purpose — ground-cover, not shrubbery; the lotus (drawLotus)
      // stays the only full-size flower so the grove keeps its presence.
      const tall = k === 3 ? 5 : 3;
      ctx.strokeStyle = '#5d7a40'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(c.x, c.y + 1); ctx.lineTo(c.x, c.y - tall); ctx.stroke();
      const by = c.y - tall - 1;
      ctx.fillStyle = p.petal;
      for (let j = 0; j < 5; j++) {
        const pa = (j / 5) * Math.PI * 2 + a;
        ctx.beginPath(); ctx.ellipse(c.x + Math.cos(pa) * 1.4, by + Math.sin(pa) * 0.95, 1.25, 0.75, pa, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = p.heart;
      ctx.beginPath(); ctx.arc(c.x, by, k === 3 ? 1.1 : 0.75, 0, Math.PI * 2); ctx.fill();
      if (k === 3) {
        ctx.strokeStyle = '#c9762b'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.arc(c.x, by, 1.2, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }

  drawRock(tx, ty) {
    const ctx = this.ctx;
    const c = worldToScreen(tx + 0.5, ty + 0.5);
    // Ground-contact shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(c.x, c.y + 2, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // A boulder: the stone texture STRETCHED over the whole rock silhouette
    // (drawImage across the full bounding box, clipped to the shape) so the
    // photo IS the rock face, at full strength — only a light diagonal shade for
    // volume, no heavy gradient washing it out. Per-tile seed picks the variant.
    const rx = 14, ry = 11, cy = c.y - 6;
    const seed = ((tx * 73856093) ^ (ty * 19349663)) >>> 0;
    const tex = ROCK_TEXTURES && ROCK_TEXTURES.length
      ? ROCK_TEXTURES[seed % ROCK_TEXTURES.length] : null;
    const bx = c.x - rx, by = cy - ry, bw = rx * 2, bh = ry * 2;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(c.x, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.clip();
    if (tex && tex.complete && tex.naturalWidth) {
      ctx.drawImage(tex, bx, by, bw, bh); // stretch the whole texture across the rock
      const g = ctx.createLinearGradient(bx, by, c.x + rx * 0.4, cy + ry); // top-left light -> lower-right shade
      g.addColorStop(0, 'rgba(255,255,255,0.12)');
      g.addColorStop(0.55, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.24)');
      ctx.fillStyle = g;
      ctx.fillRect(bx, by, bw, bh);
    } else {
      ctx.fillStyle = ROCK_COLOR;
      ctx.fillRect(bx, by, bw, bh);
    }
    ctx.restore();

    // A soft rim seats the boulder against the ground.
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(c.x, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  drawRubble(tx, ty) {
    const ctx = this.ctx;
    const c = worldToScreen(tx + 0.5, ty + 0.5);
    const seed = ((tx * 73856093) ^ (ty * 19349663)) >>> 0;
    const tex = ROCK_TEXTURES && ROCK_TEXTURES.length
      ? ROCK_TEXTURES[seed % ROCK_TEXTURES.length] : null;
    // A heap of broken stone. The chunk ellipses are unioned into ONE clip and a
    // single texture is STRETCHED across the whole silhouette — so it reads as
    // one continuous stone surface over the pile, not four textured discs. Light
    // diagonal shade for volume; per-chunk rims keep the stones individually
    // readable. Falls back to flat grey until the texture loads.
    const chunks = [
      [-8, -2, 7, 5], [2, -6, 8, 6], [-2, 2, 6, 4], [8, 0, 5, 4],
    ];
    // union bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [ox, oy, rx, ry] of chunks) {
      const cx = c.x + ox, cy = c.y + oy - 3;
      minX = Math.min(minX, cx - rx); maxX = Math.max(maxX, cx + rx);
      minY = Math.min(minY, cy - ry); maxY = Math.max(maxY, cy + ry);
    }
    // contact shadow under the whole heap
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(c.x, c.y + 3, 15, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    // one clip = union of every chunk ellipse
    ctx.save();
    ctx.beginPath();
    for (const [ox, oy, rx, ry] of chunks) ctx.ellipse(c.x + ox, c.y + oy - 3, rx, ry, 0, 0, Math.PI * 2);
    ctx.clip();
    if (tex && tex.complete && tex.naturalWidth) {
      ctx.drawImage(tex, minX, minY, maxX - minX, maxY - minY);
      const g = ctx.createLinearGradient(minX, minY, maxX, maxY);
      g.addColorStop(0, 'rgba(255,255,255,0.13)');
      g.addColorStop(0.55, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.28)');
      ctx.fillStyle = g;
      ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
    } else {
      ctx.fillStyle = rgbScale(WALL_BASE, 0.7);
      ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
    }
    ctx.restore();
    // per-chunk rims: keep the individual stones legible within the heap
    ctx.strokeStyle = 'rgba(0,0,0,0.24)';
    ctx.lineWidth = 1;
    for (const [ox, oy, rx, ry] of chunks) {
      ctx.beginPath();
      ctx.ellipse(c.x + ox, c.y + oy - 3, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
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

  // The corner minimap, kept a square but rotated a quarter-turn so it reads
  // the right way round against the play view: the river (which runs down the
  // west side of the map, x≈40) ends up along the top, north-up. A plain
  // top-down blit had it running down the left, which read as "shifted 90°".
  // The whole thing (map, fog, dot, pings, downloaded-map overlay) shares one
  // rotate+scale transform so they always line up. Toggle with ].
  drawMinimap(map, player, mm, animals, x, y, size) {
    const ctx = this.ctx;
    const k = size / Math.max(map.w, map.h); // tile -> px
    // A 90° turn swaps the map's axes on screen, so the panel takes the map's
    // ROTATED aspect (map.h wide, map.w tall) and fills it exactly — no black
    // bars for a non-square world (the map is 128x192). Right-aligned within
    // the size-wide corner slot.
    const pw = map.h * k, ph = map.w * k;
    const px = x + size - pw, py = y;
    const cx = px + pw / 2, cy = py + ph / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(11,14,10,0.6)';
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = 'rgba(207,216,195,0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
    ctx.beginPath(); ctx.rect(px, py, pw, ph); ctx.clip();
    // Into rotated tile space: (0..w, 0..h) turned 90° clockwise (west edge to
    // the top) then scaled to fill the rectangle.
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 2);
    ctx.scale(k, k);
    ctx.translate(-map.w / 2, -map.h / 2);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(mm.canvas, 0, 0, map.w, map.h);
    const fog = this._ensureFog(map);
    if (fog) ctx.drawImage(fog, 0, 0, map.w, map.h);
    // Downloaded-map overlay: while a printed AI territory map is carried, its
    // obelisks (green), factory (blue) and mainframe (red) show through the
    // fog — a schematic laid over the minimap, per the RON-ML `print` map.
    if (player.hasItem && player.hasItem('printed_map')) {
      const m = 3 / k;
      for (const o of map.objects) {
        let col = null;
        if (o.type === 'obelisk' && !o.destroyed) col = '#4fe07a';
        else if (o.type === 'wfactory' && !o.destroyed) col = '#4f8fe0';
        else if (o.type === 'mainframe') col = '#e0503a';
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(o.x + 0.5 - m / 2, o.y + 0.5 - m / 2, m, m);
      }
    }
    // Player dot, sized in screen px regardless of the tile scale.
    const d = 3 / k;
    ctx.fillStyle = '#fff';
    ctx.fillRect(player.x - d / 2, player.y - d / 2, d, d);
    // Tracking skill: nearby animals ping.
    if (player.skills && player.skills.has('tracking')) {
      const a2 = 2.5 / k;
      ctx.fillStyle = '#e05548';
      for (const a of animals) {
        if (a.dead || Math.hypot(a.x - player.x, a.y - player.y) > 24) continue;
        ctx.fillRect(a.x - a2 / 2, a.y - a2 / 2, a2, a2);
      }
    }
    ctx.restore();
  }

  // Maintains (and returns) the fog-of-war mask canvas: a 1px-per-tile mask,
  // grey everywhere with visited tiles punched out. Returns null before any
  // exploration data exists. Blitting is the caller's job (drawMinimap does it
  // inside the rotated transform).
  _ensureFog(map) {
    if (!map.explored) return null;
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
    return this.fogCanvas;
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
  // spin drives the right (take-up) reel; spinLeft the left (supply) reel.
  // They default to the same angle, but a caller can lead the right one — the
  // motor-driven reel starts a touch before the passive one (see mobile-gate).
  drawCassette(itemDef, spin = 0, spinLeft = spin) {
    const ctx = this.ctx;
    ctx.fillStyle = '#26282d'; // shell
    ctx.fillRect(-11, -7, 22, 14);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-11, -7, 22, 14);
    ctx.fillStyle = (itemDef && itemDef.color) || '#c9a44a'; // label strip
    ctx.fillRect(-9, -5.5, 18, 3);
    ctx.fillStyle = '#1a1b1f'; // tape window
    ctx.fillRect(-7.5, -1, 15, 6);
    for (const rx of [-4, 4]) { // left reel at -4, right (take-up) at +4
      const reelSpin = rx < 0 ? spinLeft : spin;
      ctx.fillStyle = '#e8e2d0';
      ctx.beginPath(); ctx.arc(rx, 2, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#26282d';
      ctx.lineWidth = 0.9;
      for (let k = 0; k < 3; k++) {
        const a = reelSpin + (k * Math.PI * 2) / 3;
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
    if (itemDef.kind === 'paperbook' || itemDef.kind === 'record') {
      // A deleted object recovered from the Backspace: its icon is the real
      // cover — a portrait rectangle for a book, a square sleeve for a record.
      const record = itemDef.kind === 'record';
      const w = record ? 18 : 15, h = record ? 18 : 20;
      const img = coverImg(itemDef.cover);
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; // drop-frame so it reads against any slot
      ctx.fillRect(-w / 2 - 1, -h / 2 - 1, w + 2, h + 2);
      if (img && img.complete && img.naturalWidth) {
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
      } else {
        ctx.fillStyle = itemDef.color || '#6b5a3a'; // placeholder while the cover loads
        ctx.fillRect(-w / 2, -h / 2, w, h);
      }
      if (record) {
        // a sliver of black vinyl edging out of the sleeve
        ctx.fillStyle = '#0c0c0e';
        ctx.beginPath(); ctx.arc(w / 2 - 2, 0, h / 2 - 1.5, -Math.PI / 2.6, Math.PI / 2.6); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath(); ctx.arc(w / 2 + h / 2 - 3.5, 0, 1, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = '#e5dcc7'; // page block down the fore-edge
        ctx.fillRect(w / 2 - 1.5, -h / 2 + 1, 1.5, h - 2);
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.75;
      ctx.strokeRect(-w / 2, -h / 2, w, h);
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
      case 'oar':
      case 'rope':
      case 'sail': {
        const pimg = PART_SPRITES && PART_SPRITES[key];
        if (pimg && pimg.complete && pimg.naturalWidth) {
          const iw = 20, ih = iw * (pimg.naturalHeight / pimg.naturalWidth);
          ctx.drawImage(pimg, -iw / 2, -ih / 2, iw, ih);
        } else {
          ctx.fillStyle = itemDef.color;
          ctx.fillRect(-8, -3, 16, 6);
        }
        break;
      }
      case 'golden_axe': {
        // A small gold axe: shaft + head, for Calypso's recipe.
        ctx.strokeStyle = '#7a5a2a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-2, 9); ctx.lineTo(3, -8); ctx.stroke();
        ctx.fillStyle = itemDef.color;
        ctx.beginPath();
        ctx.moveTo(3, -9); ctx.quadraticCurveTo(12, -7, 9, 1);
        ctx.quadraticCurveTo(5, -1, 1, -2); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(120,90,20,0.6)'; ctx.lineWidth = 1; ctx.stroke();
        break;
      }
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
      case 'anvil':
        // The classic silhouette: horn, face, waist, foot — unmistakable.
        ctx.fillStyle = itemDef.color;
        ctx.beginPath();
        ctx.moveTo(-9, -7); ctx.lineTo(4, -7);
        ctx.quadraticCurveTo(10, -7, 11, -4);
        ctx.quadraticCurveTo(7, -3, 4, -3);
        ctx.lineTo(3, -3); ctx.lineTo(3, 0);
        ctx.lineTo(-5, 0); ctx.lineTo(-5, -3); ctx.lineTo(-9, -3);
        ctx.closePath(); ctx.fill();
        ctx.fillRect(-3, 0, 6, 3);   // waist
        ctx.fillRect(-6, 3, 12, 3);  // foot
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.fillRect(-9, -7, 13, 1.6); // worked face catches the light
        break;
      case 'large_stone':
        // A faceted boulder: rough polygon, sunlit top plane, one crack.
        ctx.fillStyle = itemDef.color;
        ctx.beginPath();
        ctx.moveTo(-8, 3); ctx.lineTo(-6, -4); ctx.lineTo(-1, -7); ctx.lineTo(5, -5);
        ctx.lineTo(8, 1); ctx.lineTo(5, 5); ctx.lineTo(-4, 6);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.beginPath(); ctx.moveTo(-6, -4); ctx.lineTo(-1, -7); ctx.lineTo(2, -5); ctx.lineTo(-3, -2); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-3, -2); ctx.lineTo(1, 4); ctx.stroke();
        break;
      case 'lotus_fruit':
        // A plump pale fig-like fruit, cream-gold like the grove's blooms.
        ctx.fillStyle = itemDef.color;
        ctx.beginPath(); ctx.ellipse(0, 2, 6, 7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath(); ctx.ellipse(-2, -1, 2.2, 3, 0.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#caa85e'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, -5); ctx.quadraticCurveTo(0.6, 2, 0, 9); ctx.stroke();
        ctx.strokeStyle = '#6a8a44'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(3, -9); ctx.stroke();
        ctx.fillStyle = '#7ba04f';
        ctx.beginPath(); ctx.ellipse(4.5, -8.5, 3, 1.6, -0.5, 0, Math.PI * 2); ctx.fill();
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
      case 'fortress_map_fragment':
        // A torn quarter of the ZEUS survey: ragged parchment scrap with a
        // sliver of route on it — no more anonymous blue squares.
        ctx.fillStyle = itemDef.color;
        ctx.beginPath();
        ctx.moveTo(-7, -5); ctx.lineTo(5, -6); ctx.lineTo(7, 1); ctx.lineTo(3, 3);
        ctx.lineTo(4, 6); ctx.lineTo(-5, 5); ctx.lineTo(-7, 2);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(35,55,70,0.6)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.strokeStyle = 'rgba(226,88,58,0.9)';
        ctx.beginPath(); ctx.moveTo(-4, 2); ctx.lineTo(0, -2); ctx.lineTo(4, -1); ctx.stroke();
        break;
      case 'fortress_map':
        // The assembled survey: a pale blueprint sheet, maze lines, the core
        // marked red at the far end.
        ctx.fillStyle = itemDef.color;
        ctx.fillRect(-8, -6, 16, 12);
        ctx.strokeStyle = 'rgba(30,50,70,0.7)'; ctx.lineWidth = 1;
        ctx.strokeRect(-8, -6, 16, 12);
        ctx.beginPath();
        ctx.moveTo(-6, -3); ctx.lineTo(2, -3); ctx.moveTo(6, -3); ctx.lineTo(6, 1);
        ctx.moveTo(-6, 0); ctx.lineTo(-2, 0); ctx.moveTo(1, 0); ctx.lineTo(6, 0);
        ctx.moveTo(-6, 3); ctx.lineTo(3, 3);
        ctx.stroke();
        ctx.fillStyle = '#e0402f'; ctx.beginPath(); ctx.arc(6, 4, 1.4, 0, Math.PI * 2); ctx.fill();
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
      case 'ai_key':
      case 'trojan_key':
      case 'hermes_card':
      case 'fortress_key': {
        // A digital access card, not a mechanical key — the AI's locks are
        // electronic. Rounded card in the item's colour (AI key gold, Trojan
        // tarnished-gold, Hermes sky-blue, fortress key ice-blue), with a dark
        // data stripe, a gold chip contact pad with traces, and a lanyard hole.
        const col = itemDef.color;
        ctx.fillStyle = col;
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(-8, -6.5, 16, 13, 2.5); ctx.fill(); }
        else ctx.fillRect(-8, -6.5, 16, 13);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
        if (ctx.roundRect) ctx.stroke();
        // data stripe across the top
        ctx.fillStyle = 'rgba(18,22,26,0.9)';
        ctx.fillRect(-8, -4.2, 16, 2.6);
        // chip contact pad + traces (lower-left)
        ctx.fillStyle = '#e3cf72';
        ctx.fillRect(-6, 0.5, 4.5, 3.6);
        ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 0.6;
        ctx.strokeRect(-6, 0.5, 4.5, 3.6);
        ctx.beginPath();
        ctx.moveTo(-3.75, 0.5); ctx.lineTo(-3.75, 4.1);   // chip vertical division
        ctx.moveTo(-6, 2.3); ctx.lineTo(-1.5, 2.3);       // chip horizontal division
        ctx.stroke();
        // a couple of printed traces to the right of the chip
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.moveTo(0.5, 1.4); ctx.lineTo(6, 1.4);
        ctx.moveTo(0.5, 3.2); ctx.lineTo(4.5, 3.2);
        ctx.stroke();
        // lanyard hole, top-right corner
        ctx.fillStyle = 'rgba(8,10,12,0.75)';
        ctx.beginPath(); ctx.arc(5.7, -3, 1.1, 0, Math.PI * 2); ctx.fill();
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

    // Forcefield: a shimmering green energy shell around the whole character.
    if (player.forcefieldActive && player.forcefieldActive()) {
      const t = performance.now();
      const rr = 25 + Math.sin(t / 260) * 1.8;
      this._drawShieldBubble(c.x, by - 12, rr, rr * 1.08, '120,245,170', t);
    } else if (player.shielded && player.shielded()) {
      // A carried shield shows a slimmer deflector shell (no need to hold it):
      // pale blue for the plain shield, brighter cyan for the mirror. A mirror
      // shield heats up as it throws shots back, and the shell glows from cyan
      // toward angry red as it does — a read on how close it is to melting.
      const t = performance.now();
      const mirror = player.hasItem && player.hasItem('mirror_shield');
      let rgb = mirror ? '180,235,245' : '130,175,225';
      if (mirror) {
        const heat = Math.max(0, Math.min(1, player.mirrorHeat || 0));
        const r = Math.round(180 + (240 - 180) * heat);
        const g = Math.round(235 + (70 - 235) * heat);
        const b = Math.round(245 + (55 - 245) * heat);
        rgb = `${r},${g},${b}`;
      }
      this._drawShieldBubble(c.x, by - 12, 22, 24, rgb, t);
    }
  }

  // A curved energy shell for the forcefield / carried shield: a soft radial
  // glow that fades from a clear core to a bright rim, a slowly travelling
  // dashed rim (the shimmer), and a short specular arc top-left so it reads as
  // a 3D bubble rather than a flat traced outline. `rgb` is an "r,g,b" string.
  _drawShieldBubble(cx, cy, rx, ry, rgb, t) {
    const ctx = this.ctx;
    ctx.save();
    // Shell: clear at the core, building to a glowing rim.
    const grad = ctx.createRadialGradient(cx, cy, rx * 0.5, cx, cy, rx * 1.04);
    grad.addColorStop(0, `rgba(${rgb},0)`);
    grad.addColorStop(0.8, `rgba(${rgb},0.06)`);
    grad.addColorStop(1, `rgba(${rgb},0.22)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    // Travelling dashed rim — the "dotted" energy shimmer, rotating slowly.
    const pulse = 0.5 + 0.22 * Math.sin(t / 200);
    ctx.strokeStyle = `rgba(${rgb},${pulse.toFixed(3)})`;
    ctx.lineWidth = 1.1;
    ctx.setLineDash([2.2, 3.6]);
    ctx.lineDashOffset = -(t / 90) % 1000;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Specular highlight: a short bright, un-dashed arc at the top-left.
    ctx.setLineDash([]);
    ctx.strokeStyle = `rgba(255,255,255,${(0.24 * pulse).toFixed(3)})`;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 0.94, ry * 0.94, 0, Math.PI * 1.02, Math.PI * 1.46);
    ctx.stroke();
    ctx.restore();
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







}

// Screen-space UI methods (overlays, modals) live in ui.js for file size; mix
// them onto the prototype so they are ordinary Renderer methods at call time
// (this === the renderer). See docs/refactor-registry.md.
Object.assign(Renderer.prototype, uiMethods);
