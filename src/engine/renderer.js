import { worldToScreen, screenToWorld } from './iso.js';
import { FLOORS } from '../game/tiles.js';
import { ITEMS } from '../game/items.js';
import { drawAnimal } from '../game/animals.js';
import { drawBird } from '../game/birds.js';

// Canvas renderer. Two passes per frame: floor diamonds first, then all
// "drawables" (objects + player) painter-sorted by world depth (x + y).
// Everything is placeholder art drawn in code; swapping in sprites later
// means replacing the draw* methods only.

const WALL_H = 40;
const DASH_H = 78; // dashboard panel height
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
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#0b0e0a';
    ctx.fillRect(0, 0, this.w, this.h);

    ctx.save();
    camera.applyTransform(ctx, this.w, this.h);

    const range = this.visibleRange(camera, map);

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
      drawables.push({ depth: obj.x + obj.y + 1, obj });
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
    drawables.push({ depth: player.x + player.y, player });
    drawables.sort((a, b) => a.depth - b.depth);

    // Everything on a hill tile is lifted by its elevation.
    const elevOf = (x, y) => (map.heightAt ? map.heightAt(Math.floor(x), Math.floor(y)) : 0) * ELEV;
    for (const d of drawables) {
      const lift = d.player ? elevOf(player.x, player.y)
        : d.animal ? elevOf(d.animal.x, d.animal.y)
        : d.bird ? elevOf(d.bird.x, d.bird.y)
        : d.groundItem ? elevOf(d.groundItem.x, d.groundItem.y)
        : elevOf(d.obj.x + 0.5, d.obj.y + 0.5);
      if (lift) { ctx.save(); ctx.translate(0, -lift); }
      if (d.player) this.drawPlayer(d.player);
      else if (d.animal) drawAnimal(this.ctx, d.animal, worldToScreen);
      else if (d.bird) drawBird(this.ctx, d.bird, worldToScreen);
      else if (d.groundItem) this.drawGroundItem(d.groundItem);
      else this.drawObject(d.obj);
      if (lift) ctx.restore();
    }

    ctx.restore();

    // Night: a dark veil over the world, never over the HUD. A carried
    // torch opens a pool of light around the player; without one you get
    // only a faint arm's-length glimmer.
    if (hud.light != null && hud.light < 1) {
      const dark = (1 - hud.light) * 0.78;
      const pw = worldToScreen(player.x, player.y);
      const cw = worldToScreen(camera.x, camera.y);
      const px = pw.x - cw.x + this.w / 2;
      const py = pw.y - cw.y + this.h / 2 - 16;
      const radius = hud.torch ? 200 : 70;
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
    this.drawDashboard(player, hud);
  }

  // Inverse-project the screen corners to get the visible tile bounding box.
  // Generous padding on the far side so tall objects just off-screen south
  // still draw their upper parts.
  visibleRange(camera, map) {
    const c = worldToScreen(camera.x, camera.y);
    const corners = [
      screenToWorld(c.x - this.w / 2, c.y - this.h / 2),
      screenToWorld(c.x + this.w / 2, c.y - this.h / 2),
      screenToWorld(c.x - this.w / 2, c.y + this.h / 2),
      screenToWorld(c.x + this.w / 2, c.y + this.h / 2),
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
    this.diamondPath(corners);
    ctx.fillStyle = shadeHex(def.color, shade);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.07)';
    ctx.lineWidth = 1;
    ctx.stroke();
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
      case 'wall': this.drawWall(obj.x, obj.y); break;
      case 'tree': this.drawTree(obj); break;
      case 'rock': this.drawRock(obj.x, obj.y); break;
      case 'rubble': this.drawRubble(obj.x, obj.y); break;
    }
  }

  // A wall is an extruded diamond prism: two visible faces plus a top.
  drawWall(tx, ty) {
    const ctx = this.ctx;
    const [b0, b1, b2, b3] = this.tileCorners(tx, ty);
    const [t0, t1, t2, t3] = this.tileCorners(tx, ty, WALL_H);

    ctx.beginPath(); // south-west face
    ctx.moveTo(b3.x, b3.y); ctx.lineTo(b2.x, b2.y);
    ctx.lineTo(t2.x, t2.y); ctx.lineTo(t3.x, t3.y);
    ctx.closePath();
    ctx.fillStyle = rgbScale(WALL_BASE, 0.72);
    ctx.fill();

    ctx.beginPath(); // south-east face
    ctx.moveTo(b1.x, b1.y); ctx.lineTo(b2.x, b2.y);
    ctx.lineTo(t2.x, t2.y); ctx.lineTo(t1.x, t1.y);
    ctx.closePath();
    ctx.fillStyle = rgbScale(WALL_BASE, 0.55);
    ctx.fill();

    this.diamondPath([t0, t1, t2, t3]); // top
    ctx.fillStyle = rgbScale(WALL_BASE, 1);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  drawTree(obj) {
    const ctx = this.ctx;
    const c = worldToScreen(obj.x + 0.5, obj.y + 0.5);
    // Hit wobble: canopy and trunk-top sway while obj.shake ticks down.
    const wob = obj.shake ? Math.sin(obj.shake * 45) * obj.shake * 14 : 0;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, 12, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = TREE_TRUNK;
    ctx.beginPath();
    ctx.moveTo(c.x - 3, c.y);
    ctx.lineTo(c.x + 3, c.y);
    ctx.lineTo(c.x + 3 + wob * 0.4, c.y - 26);
    ctx.lineTo(c.x - 3 + wob * 0.4, c.y - 26);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = TREE_CANOPY;
    ctx.beginPath();
    ctx.arc(c.x + wob, c.y - 38, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.arc(c.x + wob - 5, c.y - 43, 9, 0, Math.PI * 2);
    ctx.fill();
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

  // Fog of war over the minimap: an offscreen 1px-per-tile mask, darkened
  // everywhere, with visited tiles punched out as the game reveals them.
  drawFog(map, x, y, size) {
    if (!map.explored) return;
    if (!this.fogCanvas || this.fogCanvas.width !== map.w) {
      this.fogCanvas = document.createElement('canvas');
      this.fogCanvas.width = map.w;
      this.fogCanvas.height = map.h;
      const f = this.fogCanvas.getContext('2d');
      f.fillStyle = 'rgba(6, 8, 5, 0.94)';
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
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(c.x, c.y + 1, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = def.color;
    ctx.fillRect(c.x - 5, c.y - 8, 10, 7);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.strokeRect(c.x - 4.5, c.y - 7.5, 9, 6);
    if (gi.qty > 1) {
      ctx.font = '9px system-ui, sans-serif';
      ctx.fillStyle = '#e8e0d0';
      ctx.fillText(String(gi.qty), c.x + 6, c.y - 2);
    }
  }

  drawPlayer(player) {
    const ctx = this.ctx;
    const c = worldToScreen(player.x, player.y);
    const lift = (player.z || 0) * 32; // jump height in pixels
    // Shadow stays grounded and shrinks as the player rises.
    const sh = Math.max(0.45, 1 - (player.z || 0) * 0.9);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, 10 * sh, 5 * sh, 0, 0, Math.PI * 2);
    ctx.fill();
    const by = c.y - lift;
    // Gait: legs scissor and the body bobs while walking.
    const swing = Math.sin(player.walkPhase) * 3;
    const bob = Math.abs(Math.sin(player.walkPhase)) * 1.8;
    ctx.fillStyle = '#4a3a2a';
    ctx.fillRect(c.x - 4 + swing, by - 9 - Math.max(0, Math.sin(player.walkPhase)) * 2.5, 3, 9);
    ctx.fillRect(c.x + 1 - swing, by - 9 - Math.max(0, -Math.sin(player.walkPhase)) * 2.5, 3, 9);
    // Torso, flashing red briefly when hurt.
    ctx.fillStyle = player.hurtTimer > 0 ? '#c94a3a' : player.sprinting ? '#c97f3e' : '#b0703c';
    ctx.beginPath();
    ctx.ellipse(c.x, by - 16 - bob, 7, 9.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Head. The face follows the direction of travel: eyes and mouth when
    // facing the camera, back-of-the-head hair when walking away, eyes
    // slid to the side in profile.
    const horiz = (player.facing.x - player.facing.y) * 0.7071;  // screen-right component
    const toward = (player.facing.x + player.facing.y) * 0.7071; // toward-camera component
    const hb = by - bob; // head bobs with the torso
    // Persona: Adam short brown mop, Eve longer auburn hair that falls to
    // the shoulders, Neve a close dark crop.
    const gender = player.gender || 'm';
    const hairCol = gender === 'f' ? '#7a4520' : gender === 'u' ? '#26262c' : '#5a3d22';
    ctx.fillStyle = '#d9b48c';
    ctx.beginPath();
    ctx.arc(c.x, hb - 29, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hairCol;
    if (gender === 'f') {
      // Side falls, visible from every direction.
      ctx.fillRect(c.x - 7.5, hb - 31, 3, 12);
      ctx.fillRect(c.x + 4.5, hb - 31, 3, 12);
    }
    if (toward < -0.15) {
      // Back to us: hair wraps the whole back of the head, a sliver of neck.
      ctx.beginPath();
      ctx.arc(c.x, hb - 29.5, 6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Hair mop with a fringe, pushed slightly opposite the gaze.
      ctx.beginPath();
      ctx.arc(c.x - horiz * 0.8, hb - 30.5, 6, Math.PI, Math.PI * 2);
      ctx.closePath();
      ctx.fill();
      if (gender !== 'u') ctx.fillRect(c.x - 6 - horiz * 0.8, hb - 31.5, 12, 2.5);
      // Eyes and mouth track the horizontal component of travel.
      const ex = horiz * 2.4;
      ctx.fillStyle = '#2c2119';
      ctx.beginPath();
      ctx.arc(c.x - 2.2 + ex, hb - 28, 1.1, 0, Math.PI * 2);
      ctx.arc(c.x + 2.2 + ex, hb - 28, 1.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(44,33,25,0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(c.x - 1.5 + ex, hb - 25.2);
      ctx.lineTo(c.x + 1.5 + ex, hb - 25.2);
      ctx.stroke();
    }
    // Swing feedback: the held tool flashes out ahead while swinging.
    if (player.swingTimer > 0) {
      const t = worldToScreen(player.x + player.facing.x * 0.6, player.y + player.facing.y * 0.6);
      ctx.strokeStyle = '#e8e0d0';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(c.x, by - 14);
      ctx.lineTo(t.x, t.y - lift - 16);
      ctx.stroke();
    }
    // Facing indicator: a small dot ahead of the feet.
    const f = worldToScreen(player.x + player.facing.x * 0.45, player.y + player.facing.y * 0.45);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.arc(f.x, f.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
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

    // Hands slot
    const handsX = 210;
    this.drawLabel('HANDS', handsX, top + 14);
    this.drawSlot(handsX, top + 20, 44, ITEMS[player.hands], 0);
    if (player.hands) {
      ctx.fillStyle = 'rgba(207,216,195,0.7)';
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillText(ITEMS[player.hands].name, handsX, top + 74);
    }

    // Pockets
    const pocketsX = 286;
    this.drawLabel('POCKETS', pocketsX, top + 14);
    for (let i = 0; i < player.pockets.length; i++) {
      const slot = player.pockets[i];
      this.drawSlot(pocketsX + i * 42, top + 20, 36, slot ? ITEMS[slot.item] : null, slot ? slot.qty : 0);
    }

    // Stats block, right-aligned
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(207,216,195,0.85)';
    let state = player.sprinting ? 'Sprinting' : player.moving ? 'Walking' : 'Idle';
    if (player.skills && player.skills.size) {
      state += ` · ${player.skills.size} skill${player.skills.size > 1 ? 's' : ''}`;
    }
    let line = top + 16;
    const nameLine = hud.timeLabel ? `${player.name || ''} · ${hud.timeLabel}` : (player.name || '');
    ctx.fillText(nameLine, this.w - 16, line); line += 16;
    ctx.fillText(state, this.w - 16, line); line += 16;
    ctx.fillText(`tile ${player.x.toFixed(1)}, ${player.y.toFixed(1)}`, this.w - 16, line); line += 16;
    ctx.fillText(`${hud.fps ?? 0} fps`, this.w - 16, line);
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

  drawSlot(x, y, size, itemDef, qty) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = 'rgba(207,216,195,0.35)';
    ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    if (!itemDef) return;

    if (itemDef.name === 'Penknife') {
      // Tiny penknife icon: red handle, steel blade.
      const cx = x + size / 2, cy = y + size / 2;
      ctx.fillStyle = itemDef.color;
      ctx.fillRect(cx - 9, cy + 1, 12, 5);
      ctx.fillStyle = '#c9cdd1';
      ctx.beginPath();
      ctx.moveTo(cx + 3, cy + 1);
      ctx.lineTo(cx + 11, cy - 5);
      ctx.lineTo(cx + 3, cy + 4);
      ctx.closePath();
      ctx.fill();
    } else {
      // Generic resource: coloured square.
      ctx.fillStyle = itemDef.color;
      ctx.fillRect(x + 8, y + 8, size - 16, size - 16);
    }
    if (qty > 1) {
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillStyle = '#e8e0d0';
      ctx.textAlign = 'right';
      ctx.fillText(String(qty), x + size - 3, y + size - 4);
      ctx.textAlign = 'left';
    }
  }
}
