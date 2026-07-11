// Screen-space UI drawing (HUD overlays, modals), split out of renderer.js to
// keep that file navigable — part of the systems-registry refactor's file-size
// split; see docs/refactor-registry.md. This is NOT registry work: the HUD is
// drawn inside the renderer's draw pass, not as a per-frame system.
//
// These are Renderer methods, moved verbatim and mixed onto Renderer.prototype
// (renderer.js does `Object.assign(Renderer.prototype, uiMethods)`), so `this`
// is still the renderer: they keep using this.ctx / this.w / this.h and every
// call site in renderer.js is unchanged. The file split is physical, for
// readability; the methods stay renderer behaviour.
//
// DASH_H (the dashboard panel height) lives here because it is a UI dimension;
// renderer.js imports it back for the world-draw clip (this.h - DASH_H). ui.js
// imports nothing from renderer.js, so there is no import cycle.

export const DASH_H = 78; // dashboard panel height

export const uiMethods = {
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
  },

  // Lotus torpor: a warm golden wash and a soft vignette closing in — the
  // dreamy tunnel-vision of the lotus-eaters. Eases off in the last few seconds
  // as the daze lets go. Play-area only; the dashboard stays clear.
  drawTorporHaze(t) {
    const ctx = this.ctx;
    const playH = this.h - DASH_H;
    const amt = Math.min(1, t / 3);
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 900);
    ctx.fillStyle = `rgba(196,150,70,${(0.13 * amt + 0.05 * amt * pulse).toFixed(3)})`;
    ctx.fillRect(0, 0, this.w, playH);
    const g = ctx.createRadialGradient(this.w / 2, playH / 2, playH * 0.25, this.w / 2, playH / 2, playH * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(20,14,6,${(0.5 * amt).toFixed(3)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, playH);
  },

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
  },

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
  },

  // The daemon's death-aria caption. Screen-space band, upper third, on a soft
  // scrim so it reads over any terrain. Tier colour telegraphs the register.
  drawDaemonVoice(voice) {
    const ctx = this.ctx, W = this.w, H = this.h;
    const toneMap = { wrath: [255, 210, 59], mercy: [255, 176, 102], dying: [143, 230, 255] };
    const rgb = toneMap[voice.tier] || [232, 224, 208];
    const tone = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    const a = Math.max(0, Math.min(1, voice.ttl / 0.8));   // fade out over the last 0.8s
    // Wrap the line to a comfortable measure.
    ctx.font = 'italic 18px Georgia, "Times New Roman", serif';
    const maxW = Math.min(560, W - 80);
    const words = voice.text.split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur);
    const lineH = 25, padX = 22, padY = 16, tagH = 20;
    const boxW = maxW + padX * 2;
    const boxH = padY * 2 + tagH + lines.length * lineH;
    const bx = (W - boxW) / 2, by = H * 0.14;
    ctx.save();
    ctx.globalAlpha = a;
    // Scrim.
    ctx.fillStyle = 'rgba(6,8,14,0.72)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, boxW, boxH, 8); else ctx.rect(bx, by, boxW, boxH);
    ctx.fill();
    ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.5)`;
    ctx.lineWidth = 1.5; ctx.stroke();
    // Speaker tag.
    ctx.textAlign = 'left';
    ctx.font = '700 12px ui-monospace, "SF Mono", Menlo, monospace';
    ctx.fillStyle = tone;
    ctx.fillText(`${(voice.ai || 'ZEUS')} ▸`, bx + padX, by + padY + 12);
    // Lines.
    ctx.font = 'italic 18px Georgia, "Times New Roman", serif';
    ctx.fillStyle = '#eef2f6';
    let y = by + padY + tagH + 16;
    for (const ln of lines) { ctx.fillText(ln, bx + padX, y); y += lineH; }
    ctx.restore();
    ctx.textAlign = 'left';
  },

  // The AI-defeated celebration: a fireworks level-up modal. Time-based particle
  // bursts over a dimmed backdrop, with the daemon tally and score.
  drawAiVictory(v) {
    const ctx = this.ctx, W = this.w, H = this.h;
    ctx.fillStyle = 'rgba(6,8,14,0.82)';
    ctx.fillRect(0, 0, W, H);

    // Fireworks particle system (kept on the renderer between frames).
    this._fw ??= [];
    const now = performance.now();
    const dt = this._fwLast ? Math.min(0.05, (now - this._fwLast) / 1000) : 0.016;
    this._fwLast = now;
    this._fwSpawnT = (this._fwSpawnT ?? 0) - dt;
    if (this._fwSpawnT <= 0) {
      this._fwSpawnT = 0.3 + Math.random() * 0.45;
      const bx = W * (0.18 + Math.random() * 0.64), by = H * (0.12 + Math.random() * 0.4);
      const hue = Math.floor(Math.random() * 360), n = 26 + Math.floor(Math.random() * 22);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, sp = 70 + Math.random() * 110;
        this._fw.push({ x: bx, y: by, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ttl: 1.1 + Math.random() * 0.7, max: 1.8, hue });
      }
    }
    for (const p of this._fw) { p.ttl -= dt; p.vy += 100 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.99; }
    this._fw = this._fw.filter((p) => p.ttl > 0);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this._fw) {
      const a = Math.max(0, p.ttl / p.max);
      ctx.fillStyle = `hsla(${p.hue},95%,62%,${a.toFixed(3)})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // Text.
    const cx = W / 2, y0 = H * 0.33;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd23b'; ctx.font = 'bold 46px system-ui, sans-serif';
    ctx.fillText(`${(v.ai || 'AI').toUpperCase()} SILENCED`, cx, y0);
    ctx.fillStyle = '#e6eaf0'; ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText(`Daemon ${v.daemon} of ${v.daemons} felled`, cx, y0 + 42);
    ctx.fillStyle = '#9fb0c0'; ctx.font = '16px system-ui, sans-serif';
    ctx.fillText(`${v.powered} machines powered down across the island`, cx, y0 + 74);
    // The daemon's last words, cut off by its own death.
    if (v.lastWords) {
      ctx.fillStyle = '#8fe6ff'; ctx.font = 'italic 17px Georgia, "Times New Roman", serif';
      ctx.fillText(`“…${v.lastWords}—”`, cx, y0 + 108);
    }
    ctx.fillStyle = '#7fe0a0'; ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.fillText(`Score  ${v.score}`, cx, y0 + 154);
    // The testament recovered from the dead core.
    if (v.book) {
      ctx.fillStyle = '#c9b98f'; ctx.font = '14px Georgia, "Times New Roman", serif';
      ctx.fillText(`A machine testament falls from the dark core: “${v.book}” — added to your scrapbook`, cx, y0 + 186);
    }
    // The dismiss hint appears only once the modal will actually honour it
    // (main.js ignores Space/Enter for the first seconds so the fireworks play).
    const shownFor = v.shownAt ? (performance.now() - v.shownAt) : 0;
    if (shownFor > 3000) {
      ctx.fillStyle = '#8894a4'; ctx.font = '14px system-ui, sans-serif';
      ctx.fillText('SPACE to sail on', cx, y0 + 220);
    }
    ctx.textAlign = 'left';
  },

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
  },
};
