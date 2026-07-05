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

// An amusing rank for the certificate of death, from score and skill count.
function deathRank(score, skillCount) {
  if (score >= 250 && skillCount >= 4) return { title: 'L33T', color: '#e8d27a', blurb: 'A legend of the ruins. The machines will tell stories.' };
  if (score >= 150) return { title: 'VETERAN', color: '#8fd0e0', blurb: 'You lasted. That is more than most.' };
  if (score >= 70) return { title: 'SURVIVOR', color: '#6fbf4a', blurb: 'You knew which end of the crowbar to hold.' };
  if (score >= 25) return { title: 'SCRAPPER', color: '#d8a04f', blurb: 'Scrappy. Doomed, but scrappy.' };
  if (score >= 5) return { title: 'NOOB', color: '#c9905a', blurb: 'Everyone starts somewhere. You did not get far.' };
  return { title: 'COMPOST', color: '#9a7a5a', blurb: 'The wildlife thanks you for the nutrients.' };
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
    this.uiSlots = []; // clickable dashboard/backpack slots, rebuilt each frame
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
      else if (d.animal) { drawAnimal(this.ctx, d.animal, worldToScreen); this.creatureHealthBar(d.animal, player, 44); }
      else if (d.bird) drawBird(this.ctx, d.bird, worldToScreen);
      else if (d.robot) { drawRobot(this.ctx, d.robot, worldToScreen); this.creatureHealthBar(d.robot, player, 48); }
      else if (d.groundItem) this.drawGroundItem(d.groundItem);
      else this.drawObject(d.obj);
      if (lift) ctx.restore();
    }

    // In-flight rounds, in world space.
    if (map.projectiles) this.drawProjectiles(map.projectiles);

    // Lore fragments float in world space, under the camera transform.
    if (hud.lore) hud.lore.drawWorld(ctx);

    ctx.restore();

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
    if (hud.lore) hud.lore.drawOverlay(ctx, this.w, this.h);
    if (hud.craftPrompt) {
      const msg = 'You hold a stun-gun, electro-gun and Wi-Fi block — press C to build an OB-gun';
      ctx.font = 'bold 13px system-ui, sans-serif';
      const w = ctx.measureText(msg).width + 24;
      const x = (this.w - w) / 2, y = this.h - DASH_H - 40;
      ctx.fillStyle = 'rgba(224,100,47,0.9)';
      ctx.fillRect(x, y, w, 26);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(msg, this.w / 2, y + 17);
      ctx.textAlign = 'left';
    }
    if (hud.showSkills) this.drawSkillModal(player);
    if (hud.detail) this.drawDetail(hud.detail);
    if (hud.drag) this.drawDragGhost(hud.drag, player);
    if (hud.deathCert) this.drawDeathCert(hud.deathCert);
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
    ctx.fillStyle = '#141810';
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = 'rgba(207,216,195,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 1, py + 1, pw - 2, ph - 2);
    ctx.lineWidth = 1;

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

    const rank = deathRank(cert.score, cert.skills.length);
    ctx.textAlign = 'left';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(207,216,195,0.9)';
    const lx = px + 48;
    let y = py + 148;
    const row = (label, val) => { ctx.fillStyle = 'rgba(207,216,195,0.65)'; ctx.fillText(label, lx, y); ctx.fillStyle = '#e8e0d0'; ctx.fillText(String(val), lx + 150, y); y += 26; };
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
    ctx.fillText('click to carry on', px + pw / 2, py + ph - 14);
    ctx.textAlign = 'left';
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
      const col = p.kind === 'stun' ? '#5fe0ff' : p.kind === 'fuse' ? '#b78bff' : '#ffe27a';
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

  // A small health bar floating over a creature or machine the player is
  // standing near, so you can read how damaged it is. Hidden for the dead,
  // fused wrecks, and drained/friendly machines.
  creatureHealthBar(e, player, headH) {
    if (e.dead || e.fused || e.drained) return;
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
        if (obj.graffiti) this.drawGraffiti(obj);
        break;
      case 'tree': this.drawTree(obj); break;
      case 'rock': this.drawRock(obj.x, obj.y); break;
      case 'rubble': this.drawRubble(obj.x, obj.y); break;
      case 'obelisk': this.drawObelisk(obj); break;
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
    // Doubting tags (RON is dead, no one is coming, ...) are painted fainter
    // and greyer, as if older or written by a less certain hand — the game
    // never settles whether the resistance is still out there.
    ctx.fillStyle = obj.graffitiFaded ? 'rgba(180,178,170,0.45)' : 'rgba(190,40,36,0.72)';
    ctx.textAlign = 'center';
    ctx.fillText(obj.graffiti, 0, 0);
    ctx.restore();
    ctx.textAlign = 'left';
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

    this.diamondPath([t0, t1, t2, t3]); // top
    ctx.fillStyle = rgbScale(base, 1);
    ctx.fill();
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
    const alert = obj.alert || 0;
    const flash = obj.blinkFlash || 0;
    const ly = c.y - H + 8;
    if (alert > 0.3) {
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

  // An abandoned car: now a big 2x3 hulk sitting dead across the road.
  // Smash it with a crowbar (it flips to `smashed`) for what was inside.
  drawCar(obj) {
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
  }

  // Miniature vector art per item, centred on (cx, cy), so things look like
  // the thing they are — in slots, on the ground, and held in hand.
  drawItemIcon(itemDef, cx, cy, s = 1) {
    const ctx = this.ctx;
    if (!itemDef) return;
    const key = itemDef.key;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
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
      default:
        ctx.fillStyle = itemDef.color;
        ctx.fillRect(-6, -6, 12, 12);
    }
    ctx.restore();
  }

  drawPlayer(player) {
    const ctx = this.ctx;
    const c = worldToScreen(player.x, player.y);

    // Swimming: only the head shows above the water, bobbing, with ripples.
    if (player.swimming) {
      const bobY = Math.sin(performance.now() / 380) * 1.8;
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 1;
      for (let i = 1; i <= 2; i++) {
        ctx.beginPath();
        ctx.ellipse(c.x, c.y - 4, 7 * i, 3.5 * i, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      const hy = c.y - 10 + bobY;
      ctx.fillStyle = '#d9b48c';
      ctx.beginPath(); ctx.arc(c.x, hy, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = player.gender === 'f' ? '#7a4520' : player.gender === 'u' ? '#26262c' : '#5a3d22';
      ctx.beginPath(); ctx.arc(c.x, hy - 1.5, 6, Math.PI, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2c2119';
      ctx.beginPath();
      ctx.arc(c.x - 2.2, hy + 1, 1, 0, Math.PI * 2);
      ctx.arc(c.x + 2.2, hy + 1, 1, 0, Math.PI * 2);
      ctx.fill();
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
    // The held tool/gun/gadget shown in hand, out toward the facing
    // direction. Using it animates clearly: a tool sweeps through an arc, a
    // gun or gadget kicks back with recoil — so a swing or a shot always
    // reads on screen.
    if (player.hands && ITEMS[player.hands]) {
      const def = ITEMS[player.hands];
      const cd = def.swingCooldown || 0.5;
      // p runs 0 (start of use) -> 1 (finished); -1 means idle.
      const p = player.swingTimer > 0 ? Math.max(0, 1 - player.swingTimer / cd) : -1;
      const pulse = p >= 0 ? Math.sin(p * Math.PI) : 0; // 0 -> 1 -> 0 across the action
      const isRanged = def.kind === 'gun' || def.kind === 'gadget';

      const baseAng = Math.atan2(player.facing.y * 0.5, player.facing.x);
      let reach = 0.42;
      let extraAng = 0;
      if (isRanged) {
        reach = 0.42 - pulse * 0.14; // recoil: jerk back toward the body
      } else {
        reach = 0.42 + pulse * 0.55; // swing: thrust out
        extraAng = p >= 0 ? (-1.0 + p * 1.7) : 0; // sweep through an arc
      }
      const hx = c.x + player.facing.x * 15 * reach / 0.42;
      const hy = by - 12 + player.facing.y * 8 * reach / 0.42;
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(baseAng + extraAng);
      this.drawItemIcon(def, 0, 0, 0.85 + pulse * 0.15);
      ctx.restore();

      // A brief muzzle flash when a gun fires.
      if (isRanged && def.kind === 'gun' && pulse > 0.3) {
        const fx = c.x + player.facing.x * 26, fy = by - 12 + player.facing.y * 14;
        ctx.fillStyle = `rgba(255,220,120,${pulse * 0.8})`;
        ctx.beginPath();
        ctx.arc(fx, fy, 3 + pulse * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Facing indicator: a small dot set well ahead of the feet, so the aim
    // direction reads clearly at a glance.
    const f = worldToScreen(player.x + player.facing.x * 1.2, player.y + player.facing.y * 1.2);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.arc(f.x, f.y - 10, 2.5, 0, Math.PI * 2);
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
    let line = top + 18;
    const nameLine = hud.timeLabel ? `${player.name || ''} · ${hud.timeLabel}` : (player.name || '');
    ctx.fillText(nameLine, this.w - 16, line); line += 18;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillStyle = '#e8d27a';
    ctx.fillText(`Score ${player.score ?? 0}`, this.w - 16, line); line += 18;
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(207,216,195,0.6)';
    ctx.fillText(`K: skills · ${hud.fps ?? 0} fps`, this.w - 16, line);
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
