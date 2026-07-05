import { worldToScreen, screenToWorld } from './iso.js';
import { FLOORS } from '../game/tiles.js';
import { ITEMS } from '../game/items.js';
import { drawAnimal } from '../game/animals.js';
import { drawBird } from '../game/birds.js';
import { drawRobot } from '../game/robots.js';

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

// Cheap deterministic hash for per-tile pseudo-randomness (grass blades)
// that stays put frame to frame instead of shimmering like Math.random().
function tileHash(x, y) {
  let h = (x * 374761393 + y * 668265263) ^ (x * 3266489917);
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
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
    for (const r of hud.robots || []) {
      if (r.dead) continue;
      if (r.x < range.minX || r.x > range.maxX + 1 || r.y < range.minY || r.y > range.maxY + 1) continue;
      drawables.push({ depth: r.x + r.y, robot: r });
    }
    drawables.push({ depth: player.x + player.y, player });
    drawables.sort((a, b) => a.depth - b.depth);

    // Everything on a hill tile is lifted by its elevation.
    const elevOf = (x, y) => (map.heightAt ? map.heightAt(Math.floor(x), Math.floor(y)) : 0) * ELEV;
    for (const d of drawables) {
      const lift = d.player ? elevOf(player.x, player.y)
        : d.animal ? elevOf(d.animal.x, d.animal.y)
        : d.bird ? elevOf(d.bird.x, d.bird.y)
        : d.robot ? elevOf(d.robot.x, d.robot.y)
        : d.groundItem ? elevOf(d.groundItem.x, d.groundItem.y)
        : elevOf(d.obj.x + 0.5, d.obj.y + 0.5);
      if (lift) { ctx.save(); ctx.translate(0, -lift); }
      if (d.player) this.drawPlayer(d.player);
      else if (d.animal) drawAnimal(this.ctx, d.animal, worldToScreen);
      else if (d.bird) drawBird(this.ctx, d.bird, worldToScreen);
      else if (d.robot) drawRobot(this.ctx, d.robot, worldToScreen);
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
    if (hud.showBackpack) this.drawBackpackPanel(player);
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
    this.drawLabel('SPARE WEAPON — 5, then G', px + 20, weaponY + 10);
    this.drawSlot(px + 20, weaponY + 16, size,
      player.backpack.weapon ? ITEMS[player.backpack.weapon] : null, 0, player.selectedPocket === 'bw');
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
      if (slot) {
        ctx.font = '7px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(207,216,195,0.6)';
        ctx.textAlign = 'center';
        ctx.fillText(ITEMS[slot.item].name, sx + size / 2, sy + size + 9, size + 10);
        ctx.textAlign = 'left';
      }
    }
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
    if (type === 'grass' || type === 'tallgrass') this.drawGrassBlades(tx, ty, corners, def.color, shade);
  }

  // A handful of small blade strokes per tile so grass reads as textured
  // turf rather than a flat colour fill. Hashed from tile coordinates so
  // the pattern holds still frame to frame instead of shimmering.
  drawGrassBlades(tx, ty, corners, color, shade) {
    const ctx = this.ctx;
    const cx = (corners[0].x + corners[2].x) / 2;
    const cy = (corners[0].y + corners[2].y) / 2;
    const n = 3;
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
        this.drawWall(obj.x, obj.y);
        if (obj.graffiti) this.drawGraffiti(obj);
        break;
      case 'tree': this.drawTree(obj); break;
      case 'rock': this.drawRock(obj.x, obj.y); break;
      case 'rubble': this.drawRubble(obj.x, obj.y); break;
      case 'obelisk': this.drawObelisk(obj.x, obj.y); break;
      case 'box': this.drawBox(obj); break;
      case 'car': this.drawCar(obj); break;
    }
  }

  // Sprayed lore fragment on a wall face: irregular baseline and a slight
  // tilt so it reads as graffiti rather than a label.
  drawGraffiti(obj) {
    const ctx = this.ctx;
    const c = worldToScreen(obj.x + 0.5, obj.y + 0.5);
    ctx.save();
    ctx.translate(c.x + 5, c.y - WALL_H * 0.55);
    ctx.rotate((tileHash(obj.x, obj.y) - 0.5) * 0.16);
    ctx.font = 'italic bold 8px monospace';
    ctx.fillStyle = 'rgba(190,40,36,0.72)';
    ctx.textAlign = 'center';
    ctx.fillText(obj.graffiti, 0, 0);
    ctx.restore();
    ctx.textAlign = 'left';
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

  // AI signal tower: a tall narrow black monolith with a slow-pulsing red
  // light near the crown. Destructible in a later phase.
  drawObelisk(tx, ty) {
    const ctx = this.ctx;
    const c = worldToScreen(tx + 0.5, ty + 0.5);
    const H = 96, W = 9;
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
    // Pulsing signal light.
    const pulse = 0.45 + 0.55 * Math.abs(Math.sin(performance.now() / 900));
    ctx.fillStyle = `rgba(224, 60, 50, ${pulse})`;
    ctx.beginPath();
    ctx.arc(c.x, c.y - H + 8, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Resistance cache: a wooden crate; opened ones sit dark and empty.
  drawBox(obj) {
    const ctx = this.ctx;
    const c = worldToScreen(obj.x + 0.5, obj.y + 0.5);
    const w = 11, h = 10;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(c.x, c.y + 1, 13, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = obj.opened ? '#4a3a24' : '#7a5c38'; // SW face
    ctx.beginPath();
    ctx.moveTo(c.x - w, c.y - 3); ctx.lineTo(c.x, c.y + 3);
    ctx.lineTo(c.x, c.y + 3 - h); ctx.lineTo(c.x - w, c.y - 3 - h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = obj.opened ? '#3a2d1c' : '#63482c'; // SE face
    ctx.beginPath();
    ctx.moveTo(c.x + w, c.y - 3); ctx.lineTo(c.x, c.y + 3);
    ctx.lineTo(c.x, c.y + 3 - h); ctx.lineTo(c.x + w, c.y - 3 - h);
    ctx.closePath();
    ctx.fill();
    // Lid: closed boxes get a pale top and strap; opened ones a dark hole.
    ctx.fillStyle = obj.opened ? '#241a10' : '#8f6d42';
    ctx.beginPath();
    ctx.moveTo(c.x - w, c.y - 3 - h); ctx.lineTo(c.x, c.y + 3 - h);
    ctx.lineTo(c.x + w, c.y - 3 - h); ctx.lineTo(c.x, c.y - 9 - h);
    ctx.closePath();
    ctx.fill();
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

  // An abandoned car: a low, faded box with a cabin hump, sitting dead on
  // the road. Litter, not a landmark — a hint that people left in a hurry.
  drawCar(obj) {
    const ctx = this.ctx;
    const c = worldToScreen(obj.x + 0.5, obj.y + 0.5);
    const hue = obj.hue ?? 0.5;
    const body = `hsl(${Math.floor(hue * 360)}, 26%, ${38 + hue * 10}%)`;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(c.x, c.y + 2, 20, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    // Hull
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(c.x - 19, c.y - 2);
    ctx.lineTo(c.x - 12, c.y - 10);
    ctx.lineTo(c.x + 12, c.y - 10);
    ctx.lineTo(c.x + 19, c.y - 2);
    ctx.lineTo(c.x + 15, c.y + 6);
    ctx.lineTo(c.x - 15, c.y + 6);
    ctx.closePath();
    ctx.fill();
    // Cabin
    ctx.fillStyle = 'rgba(20,22,20,0.55)';
    ctx.beginPath();
    ctx.moveTo(c.x - 8, c.y - 10);
    ctx.lineTo(c.x - 5, c.y - 19);
    ctx.lineTo(c.x + 5, c.y - 19);
    ctx.lineTo(c.x + 8, c.y - 10);
    ctx.closePath();
    ctx.fill();
    // Rust streaks
    ctx.fillStyle = 'rgba(120,60,30,0.35)';
    ctx.fillRect(c.x - 16, c.y - 3, 4, 8);
    ctx.fillRect(c.x + 9, c.y - 5, 3, 9);
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
      if (slot) {
        ctx.font = '7px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(207,216,195,0.6)';
        ctx.textAlign = 'center';
        ctx.fillText(ITEMS[slot.item].name, slotX + 18, top + 66, 40);
        ctx.textAlign = 'left';
      }
    }

    // Backpack summary badge, once found: press I for the full panel.
    if (player.backpack) {
      const bpX = pocketsX + player.pockets.length * 42 + 10;
      const used = player.backpack.slots.filter(Boolean).length;
      this.drawLabel('PACK (I)', bpX, top + 14);
      this.drawSlot(bpX, top + 20, 36, ITEMS.backpack, 0);
      ctx.font = '9px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(207,216,195,0.7)';
      ctx.fillText(`${used}/16`, bpX, top + 66);
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
