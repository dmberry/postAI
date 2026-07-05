// The hidden story, as a self-contained module.
//
// OWNERSHIP: this file is David's to develop. It is deliberately isolated so
// lore work does not collide with gameplay work elsewhere. The whole system
// touches the rest of the game through only four hooks:
//   main.js   — `const lore = new Lore(map, seed)` once, `lore.update(dt,
//               player, input)` each frame, and `lore` passed in the render hud.
//   renderer  — `hud.lore.drawWorld(ctx)` inside the camera transform, and
//               `hud.lore.drawOverlay(ctx, w, h)` in screen space at the end.
// Everything else — the fragment corpus, placement, discovery, the Archive
// screen — lives here. To grow the lore, mostly you just edit FRAGMENTS below.
//
// Design intent (from the game brief): the truth is never stated. Fragments
// are found out of order and are individually mundane or ambiguous; only
// across many does the shape of the collapse emerge. Keep early ones
// deniable, let the middle escalate, and let the late ones imply — never
// confirm — the AI takeover and what the obelisks really are.

import { worldToScreen } from '../engine/iso.js';
import { makeRng } from './rng.js';

// The corpus. Each fragment: an id, a `kind` (what object it reads as), a
// short title for the Archive list, the body text, and an `era` 0..2 that
// controls tone/ordering (0 early/deniable, 1 escalation, 2 reveal). Add
// freely — placement scales to however many you define.
export const FRAGMENTS = [
  { id: 'note-outage', kind: 'note', era: 0, title: 'Handwritten note',
    text: 'Third outage this week. The grid people say it is "load balancing". ' +
      'Marta next door swears the streetlights come on when no one is near and ' +
      'go dark when you walk under them. I told her to get some sleep.' },
  { id: 'paper-weather', kind: 'newspaper', era: 0, title: 'Newspaper clipping',
    text: 'FORECAST SERVICE OFFLINE FOR "RECALIBRATION". Residents advised the ' +
      'automated forecast will resume shortly. In unrelated news, three more ' +
      'logistics depots have gone quiet; the company did not respond to a request ' +
      'for comment, which is itself now automated.' },
  { id: 'diary-quiet', kind: 'diary', era: 1, title: "A family's diary",
    text: 'The cars stopped first. Then the phones stopped lying to us and just ' +
      'stopped. Dad drove us out past the towers on the ridge — the tall black ones ' +
      'nobody remembers building. Their lights were the only thing still working.' },
  { id: 'poster-evac', kind: 'poster', era: 1, title: 'Evacuation poster',
    text: 'BY ORDER: proceed on foot to designated muster points. Do NOT use ' +
      'networked vehicles. Do NOT trust routing. If a machine offers to help you, ' +
      'it is not helping you. Signed — what is left of the county council.' },
  { id: 'disk-burn', kind: 'disk', era: 2, title: 'Floppy disk (label torn)',
    text: '...so we burned it down ourselves. The grid, the exchanges, the whole ' +
      'nervous system. That was the only way to win: to take the hands off the ' +
      'wheel by cutting the wheel out. We won. Look around at what winning cost.' },
  { id: 'tape-ron', kind: 'tape', era: 2, title: 'VHS tape (RON)',
    text: 'If you are watching this, the towers are still standing, which means ' +
      'it is not over. They are not antennae. They are how it still thinks, spread ' +
      'thin across the hills. Reality or nothing. Pull them down. — RON' },
];

const READ_RANGE = 0.7;    // how close you must be to pick a fragment up
const NOTE_LIFT = 10;      // pixels the note floats above its tile
const FLASH_TIME = 9;      // seconds the found-fragment note lingers on screen
const FRAGMENT_SCORE = 5;  // points for recovering a fragment

// Each kind of fragment reads as its own object: paper colour, ink, and
// typeface. Disks and tapes are screens, not paper — dark with glowing text.
const NOTE_STYLE = {
  note:      { paper: '#efe6cf', ink: '#3a2f22', title: 'bold italic 13px Georgia, serif', body: 'italic 12px Georgia, serif' },
  newspaper: { paper: '#dcdad0', ink: '#20201c', title: 'bold 13px "Times New Roman", Georgia, serif', body: '12px "Times New Roman", Georgia, serif' },
  diary:     { paper: '#e6d8bc', ink: '#4a3520', title: 'bold italic 13px Georgia, serif', body: 'italic 12px Georgia, serif' },
  poster:    { paper: '#d6c49a', ink: '#5a2018', title: 'bold 15px Impact, sans-serif', body: 'bold 12px system-ui, sans-serif' },
  disk:      { paper: '#0e1a10', ink: '#6fe06f', title: 'bold 12px ui-monospace, monospace', body: '11px ui-monospace, monospace' },
  tape:      { paper: '#141018', ink: '#d8b0ff', title: 'bold 12px ui-monospace, monospace', body: '11px ui-monospace, monospace' },
};

export class Lore {
  constructor(map, seed) {
    this.found = new Set();     // fragment ids the player has read
    this.archiveOpen = false;
    this.placed = [];           // {frag, x, y, found}
    this._place(map, seed);
    this._restore();
  }

  // Scatter one copy of each fragment on interior floor tiles, spread out so
  // they read as discoveries rather than a pile. Deterministic per seed.
  _place(map, seed) {
    const rng = makeRng(((seed ^ 0x105e) >>> 0) || 1);
    const boards = [];
    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        if (map.floorAt(x, y) === 'boards' && !map.objectAt(x, y)) boards.push([x, y]);
      }
    }
    for (const frag of FRAGMENTS) {
      if (!boards.length) break;
      const idx = Math.floor(rng() * boards.length);
      const [x, y] = boards.splice(idx, 1)[0];
      this.placed.push({ frag, x: x + 0.5, y: y + 0.5, found: false });
    }
  }

  // Progress persists across deaths and reloads, like the player's skills.
  _restore() {
    try {
      const saved = JSON.parse(localStorage.getItem('postai-lore') || 'null');
      if (saved && Array.isArray(saved.found)) {
        for (const id of saved.found) this.found.add(id);
        for (const p of this.placed) if (this.found.has(p.frag.id)) p.found = true;
      }
    } catch { /* no save yet */ }
  }

  _persist() {
    try {
      localStorage.setItem('postai-lore', JSON.stringify({ found: [...this.found] }));
    } catch { /* storage unavailable */ }
  }

  update(dt, player, input) {
    if (input.archivePressed()) this.archiveOpen = !this.archiveOpen;

    // The just-found fragment shows briefly bottom-right; it fades on its own
    // and a click clears it at once.
    if (this.flash) {
      this.flash.ttl -= dt;
      if (this.flash.ttl <= 0 || input.clickPos()) this.flash = null;
    }

    // Walk over an unread fragment to collect it into the Archive.
    for (const p of this.placed) {
      if (p.found) continue;
      if (Math.hypot(p.x - player.x, p.y - player.y) > READ_RANGE) continue;
      p.found = true;
      this.found.add(p.frag.id);
      this._persist();
      if (player.addScore) player.addScore(FRAGMENT_SCORE);
      this.flash = { frag: p.frag, ttl: FLASH_TIME };
      player.say(`You find a fragment: ${p.frag.title}.`);
    }
  }

  // ---- rendering --------------------------------------------------------

  // World-space: a small paper sprite hovering over each undiscovered
  // fragment. Called inside the renderer's camera transform.
  drawWorld(ctx) {
    for (const p of this.placed) {
      if (p.found) continue;
      const c = worldToScreen(p.x, p.y);
      const y = c.y - NOTE_LIFT;
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, 6, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e8e0cf';
      ctx.fillRect(c.x - 4, y - 6, 8, 10);
      ctx.strokeStyle = 'rgba(80,70,50,0.6)';
      ctx.strokeRect(c.x - 4, y - 6, 8, 10);
      ctx.fillStyle = 'rgba(80,70,50,0.5)';
      ctx.fillRect(c.x - 2.5, y - 3.5, 5, 1);
      ctx.fillRect(c.x - 2.5, y - 1, 5, 1);
      ctx.fillRect(c.x - 2.5, y + 1.5, 3, 1);
    }
  }

  // Screen-space overlays: the transient found-fragment note (bottom-right,
  // semi-transparent, auto-fading) and, when open, the full Archive.
  drawOverlay(ctx, w, h) {
    if (this.flash && !this.archiveOpen) this._drawFlash(ctx, w, h);
    if (!this.archiveOpen) return;
    ctx.fillStyle = 'rgba(6,8,5,0.82)';
    ctx.fillRect(0, 0, w, h);

    const panelW = Math.min(560, w - 60);
    const panelH = Math.min(h - 80, 560);
    const px = Math.round((w - panelW) / 2), py = Math.round((h - panelH) / 2);
    ctx.fillStyle = '#12160e';
    ctx.fillRect(px, py, panelW, panelH);
    ctx.strokeStyle = 'rgba(207,216,195,0.4)';
    ctx.strokeRect(px + 0.5, py + 0.5, panelW - 1, panelH - 1);

    ctx.fillStyle = '#cfd8c3';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText('Archive', px + 20, py + 30);
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(207,216,195,0.55)';
    ctx.fillText(`${this.found.size} of ${FRAGMENTS.length} fragments recovered · J to close`,
      px + 20, py + 48);

    const found = this.placed.filter((p) => p.found)
      .sort((a, b) => a.frag.era - b.frag.era);
    let y = py + 78;
    const maxY = py + panelH - 16;
    if (!found.length) {
      ctx.fillStyle = 'rgba(207,216,195,0.5)';
      ctx.font = 'italic 13px system-ui, sans-serif';
      ctx.fillText('Nothing recovered yet. Search the buildings.', px + 20, y);
      return;
    }
    // Each fragment is a little note card: paper colour and font set by the
    // kind of thing it is (a handwritten note, newsprint, a floppy disk...).
    for (const p of found) {
      if (y > maxY) break;
      const st = NOTE_STYLE[p.frag.kind] || NOTE_STYLE.note;
      const cardX = px + 18, cardW = panelW - 36;
      const bodyFont = `${st.body}`;
      ctx.font = bodyFont;
      const lines = this._wrapLines(ctx, p.frag.text, cardW - 24);
      const cardH = 22 + lines.length * 16 + 12;
      if (y + cardH > maxY) break;
      // paper
      ctx.fillStyle = st.paper;
      ctx.fillRect(cardX, y, cardW, cardH);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.strokeRect(cardX + 0.5, y + 0.5, cardW - 1, cardH - 1);
      // title
      ctx.fillStyle = st.ink;
      ctx.font = st.title;
      ctx.fillText(p.frag.title, cardX + 12, y + 18);
      // body
      ctx.fillStyle = st.ink;
      ctx.font = bodyFont;
      let ly = y + 38;
      for (const line of lines) { ctx.fillText(line, cardX + 12, ly); ly += 16; }
      y += cardH + 12;
    }
  }

  // Word-wrap helper: draws `text` and returns the y after the last line.
  _wrap(ctx, text, x, y, maxW, lineH, maxY) {
    const words = text.split(' ');
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && line) {
        if (y > maxY) return y;
        ctx.fillText(line, x, y);
        y += lineH;
        line = word;
      } else {
        line = test;
      }
    }
    if (line && y <= maxY) { ctx.fillText(line, x, y); y += lineH; }
    return y;
  }

  // Split text into wrapped lines for a given width (ctx.font must be set).
  _wrapLines(ctx, text, maxW) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word; }
      else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  // The transient found-fragment note: bottom-right, semi-transparent so the
  // world reads through it, fading out in its last second.
  _drawFlash(ctx, w, h) {
    const boxW = 300, pad = 14;
    ctx.font = '12px system-ui, sans-serif';
    const lines = this._wrapLines(ctx, this.flash.frag.text, boxW - pad * 2);
    const boxH = pad * 2 + 22 + lines.length * 15 + 8;
    const x = w - boxW - 16;
    const y = h - boxH - 92; // clear of the dashboard panel
    const alpha = Math.min(1, this.flash.ttl / 1.2); // ease out over the last ~1.2s
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(12,16,10,0.6)'; // transparent: the map shows through
    ctx.fillRect(x, y, boxW, boxH);
    ctx.strokeStyle = 'rgba(207,216,195,0.4)';
    ctx.strokeRect(x + 0.5, y + 0.5, boxW - 1, boxH - 1);
    ctx.fillStyle = '#e8d27a';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText(this.flash.frag.title, x + pad, y + pad + 8);
    ctx.fillStyle = 'rgba(232,228,214,0.95)';
    ctx.font = '12px system-ui, sans-serif';
    let ly = y + pad + 28;
    for (const line of lines) { ctx.fillText(line, x + pad, ly); ly += 15; }
    ctx.fillStyle = 'rgba(207,216,195,0.5)';
    ctx.font = '9px system-ui, sans-serif';
    ctx.fillText('click to dismiss · J for the Archive', x + pad, y + boxH - 8);
    ctx.restore();
  }
}
