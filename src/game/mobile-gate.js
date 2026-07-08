// Mobile fallback. postAI is a keyboard/mouse game and isn't playable on a
// phone, so on a touch device we skip loading the game (main.js never runs)
// and show this gate: a friendly note plus a working Walkman for the
// soundtrack. Everything visual is drawn with the SAME code the game uses —
// real cassettes (Renderer.drawCassette) in the deck and rack, real machines
// (robots.js drawRobot) dancing above — so it looks like postAI, not a
// mock-up. Switchable World / Backspace / Fortress colour themes.

import { TAPES } from './items.js';
import { Renderer } from '../engine/renderer.js';
import { drawRobot } from './robots.js';
import { worldToScreen } from '../engine/iso.js';

export function isMobile() {
  const ua = /Mobi|Android|iPhone|iPod|iPad|Silk|Kindle|BlackBerry|Opera Mini|IEMobile/i.test(navigator.userAgent || '');
  const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  const narrow = Math.min(window.innerWidth, window.innerHeight) < 820;
  return ua || (coarse && narrow);
}

// Colour themes lifted from the three worlds. Each sets the gate background,
// text accent, and the Walkman deck's body/edge.
const THEMES = {
  World: { bg1: '#16240f', bg2: '#0b0e0a', accent: '#9db284', deck: '#e6b422', edge: 'rgba(20,18,8,0.9)', bezel: 'rgba(255,240,180,0.75)' },
  Backspace: { bg1: '#3c3720', bg2: '#100d05', accent: '#cdbd72', deck: '#b9a862', edge: 'rgba(34,28,10,0.9)', bezel: 'rgba(240,230,170,0.6)' },
  Fortress: { bg1: '#1d222a', bg2: '#080a0d', accent: '#93a1af', deck: '#828d99', edge: 'rgba(8,10,13,0.92)', bezel: 'rgba(210,224,236,0.55)' },
};

// A minimal-but-complete machine object for drawRobot — the fields its body
// draws read. Drawn at world (0,0) → screen origin, so the caller just
// translates the context to place it.
function mkRobot(type) {
  return {
    type, x: 0, y: 0, hp: 100, maxHp: 100, dead: false, hurt: false,
    facing: { x: 0.35, y: 1 }, aggro: false, stuck: false, returning: false,
    attackTimer: 0, noProgressT: 0, wanderTarget: null, wanderTimer: 0,
    walkPhase: 0, animT: Math.random() * 10, battery: 100, drained: false,
    recharging: false, friendly: false, fused: false, zombie: false,
    disabledT: 0, scrapPenalty: false, workTarget: null, workScanT: 0,
    chopPulseT: 0, following: false, bumpCooldown: 0, spawnT: 0,
    ubikConfusedT: 0, _confuseHopT: 0, tremor: 0, home: { x: 0, y: 0 },
    losLostT: 0, loseInterestT: 0, repelledT: 0, singing: false, knockT: 0,
  };
}

export function initMobileGate() {
  const el = document.createElement('div');
  el.id = 'mobile-gate';
  el.innerHTML = `
    <style>
      #mobile-gate { position: fixed; inset: 0; z-index: 10000; overflow: hidden;
        --bg1: ${THEMES.World.bg1}; --bg2: ${THEMES.World.bg2}; --accent: ${THEMES.World.accent};
        --deck: ${THEMES.World.deck}; --edge: ${THEMES.World.edge}; --bezel: ${THEMES.World.bezel};
        background: radial-gradient(120% 90% at 50% 0%, var(--bg1) 0%, var(--bg2) 72%);
        color: #cfd8c3; font-family: system-ui, -apple-system, sans-serif;
        display: flex; flex-direction: column; align-items: center;
        padding: max(16px, env(safe-area-inset-top)) 16px max(14px, env(safe-area-inset-bottom));
        -webkit-user-select: none; user-select: none; touch-action: manipulation; }
      #mobile-gate h1 { font-size: 30px; margin: 4px 0 2px; letter-spacing: 0.02em; }
      #mobile-gate .mg-sub { font-size: 14px; line-height: 1.5; color: var(--accent); text-align: center; max-width: 30em; margin: 0 0 8px; }
      #mobile-gate .mg-sub b { color: #f0ead8; }
      .mg-tryanyway { font-size: 12px; color: var(--accent); opacity: 0.75; text-decoration: underline;
        text-underline-offset: 3px; cursor: pointer; margin: 0 0 8px; background: none; border: none; font-family: inherit; }
      .mg-tryanyway:active { opacity: 1; }
      /* theme switch */
      .mg-themes { display: flex; gap: 6px; margin-bottom: 8px; }
      .mg-themes button { font: 600 11px system-ui, sans-serif; letter-spacing: 0.06em; text-transform: uppercase;
        color: var(--accent); background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.18);
        border-radius: 5px; padding: 5px 11px; cursor: pointer; }
      .mg-themes button.on { color: #10130d; background: var(--accent); border-color: var(--accent); }
      /* SKYLINK uplink clock */
      .mg-skylink { font: 700 12.5px ui-monospace, monospace; letter-spacing: 0.12em; text-transform: uppercase;
        color: #ff5ad0; text-shadow: 0 0 8px rgba(255,90,208,0.6); margin: 0 0 8px;
        border: 1px solid rgba(255,90,208,0.4); border-radius: 4px; padding: 5px 12px; background: rgba(40,6,30,0.5); }
      .mg-skylink span { color: #ffd0f2; }
      .mg-skylink.imminent { animation: mg-alarm 0.8s steps(1) infinite; }
      @keyframes mg-alarm { 0%,50% { opacity: 1; } 51%,100% { opacity: 0.35; } }
      /* dancing machines (canvas, drawn by drawRobot) */
      .mg-stage { flex: 1; display: flex; align-items: flex-end; justify-content: center; gap: 6px; width: 100%; min-height: 96px; }
      .mg-bot { width: 78px; height: 104px; }
      /* walkman deck — the yellow, double-outlined box from the HUD */
      .mg-deck { width: min(340px, 92vw); background: var(--deck); border-radius: 16px;
        border: 3px solid var(--edge); box-shadow: 0 10px 30px rgba(0,0,0,0.5), inset 0 0 0 2px var(--bezel);
        padding: 12px; margin-bottom: 12px; }
      .mg-deck-cass { display: block; width: 100%; height: auto; }
      .mg-nowplaying { text-align: center; font-size: 13px; color: #1c1a10; font-weight: 700; margin-top: 8px; min-height: 17px; letter-spacing: 0.02em; }
      .mg-hint { text-align: center; font-size: 11px; color: rgba(28,26,16,0.65); margin-top: 2px; }
      /* tape rack — real cassettes drawn to canvas */
      .mg-rack { display: flex; gap: 14px; overflow-x: auto; width: 100%; padding: 4px 4px 12px; justify-content: safe center;
        -webkit-overflow-scrolling: touch; }
      .mg-tape { flex: 0 0 auto; width: 120px; cursor: pointer; text-align: center; transition: transform 0.12s; }
      .mg-tape:active { transform: scale(0.95); }
      .mg-tape canvas { display: block; width: 120px; height: 78px; border-radius: 6px;
        background: rgba(0,0,0,0.25); border: 2px solid rgba(0,0,0,0.5); }
      .mg-tape.sel canvas { border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 55%, transparent); }
      .mg-tape .mg-artist { font-size: 12px; font-weight: 700; color: #e8e2d0; margin-top: 7px; }
      .mg-tape .mg-title { font-size: 11px; color: #9aa0aa; font-style: italic; }
    </style>
    <h1>postAI</h1>
    <p class="mg-sub"><b>It is the end of the world, and you will need a keyboard and mouse to save it!</b> Grab a laptop or desktop for the real thing. Meanwhile, here's the soundtrack.</p>
    <button class="mg-tryanyway" id="mg-tryanyway">Try and play it anyway…</button>
    <div class="mg-themes" id="mg-themes">
      <button data-theme="World" class="on">World</button>
      <button data-theme="Backspace">Backspace</button>
      <button data-theme="Fortress">Fortress</button>
    </div>
    <div class="mg-skylink" id="mg-skylink">SKYLINK uplink operative · T‑<span id="mg-sky">--:--:--</span></div>
    <div class="mg-stage" id="mg-stage"></div>
    <div class="mg-deck">
      <canvas class="mg-deck-cass" id="mg-deck-cass" width="300" height="150"></canvas>
      <div class="mg-nowplaying" id="mg-now">— tap a tape below —</div>
      <div class="mg-hint" id="mg-hint">tap the deck to pause</div>
    </div>
    <div class="mg-rack" id="mg-rack"></div>
  `;
  document.body.appendChild(el);

  // ---- theme switch ----
  const applyTheme = (name) => {
    const t = THEMES[name] || THEMES.World;
    for (const [k, v] of Object.entries({ '--bg1': t.bg1, '--bg2': t.bg2, '--accent': t.accent, '--deck': t.deck, '--edge': t.edge, '--bezel': t.bezel })) {
      el.style.setProperty(k, v);
    }
    el.querySelectorAll('#mg-themes button').forEach((b) => b.classList.toggle('on', b.dataset.theme === name));
  };
  el.querySelectorAll('#mg-themes button').forEach((b) => b.addEventListener('click', () => applyTheme(b.dataset.theme)));

  // Escape hatch: if the gate fired by mistake (a touch laptop, say), let them
  // dismiss it and boot the real game anyway.
  el.querySelector('#mg-tryanyway').addEventListener('click', () => {
    try { audio.pause(); } catch (e) { /* not yet playing */ }
    el.remove();
    import('../main.js');
  });

  // ---- real cassettes in the rack (drawn once) ----
  const rack = el.querySelector('#mg-rack');
  TAPES.forEach((t, i) => {
    const card = document.createElement('div');
    card.className = 'mg-tape'; card.dataset.i = String(i);
    const cv = document.createElement('canvas'); cv.width = 240; cv.height = 156;
    const r = new Renderer(cv);
    const ctx = cv.getContext('2d');
    ctx.save(); ctx.translate(120, 78); ctx.scale(5.2, 5.2);
    r.drawCassette({ color: t.color || '#c9a44a' }, 0);
    ctx.restore();
    card.appendChild(cv);
    const a = document.createElement('div'); a.className = 'mg-artist'; a.textContent = t.artist;
    const ti = document.createElement('div'); ti.className = 'mg-title'; ti.textContent = t.title;
    card.appendChild(a); card.appendChild(ti);
    rack.appendChild(card);
  });

  // ---- the dancing machines (T2, W4, T1) ----
  const stage = el.querySelector('#mg-stage');
  const botDefs = [{ type: 't1' }, { type: 't2' }, { type: 'w4' }];
  const bots = botDefs.map((d, i) => {
    const cv = document.createElement('canvas'); cv.className = 'mg-bot'; cv.width = 78; cv.height = 104;
    stage.appendChild(cv);
    return { cv, ctx: cv.getContext('2d'), robot: mkRobot(d.type), phase: i * 1.3 };
  });

  // ---- the deck cassette (animated: reels spin while playing) ----
  const deckCv = el.querySelector('#mg-deck-cass');
  const deckCtx = deckCv.getContext('2d');
  const deckRenderer = new Renderer(deckCv);
  let deckColor = '#565656';

  const audio = new Audio();
  audio.preload = 'auto';
  let playlist = [];
  let idx = 0;
  let current = -1;
  const nowEl = el.querySelector('#mg-now');
  const hintEl = el.querySelector('#mg-hint');

  audio.addEventListener('ended', () => {
    if (!playlist.length) return;
    idx = (idx + 1) % playlist.length;
    audio.src = playlist[idx];
    audio.play().catch(() => {});
  });
  audio.addEventListener('play', () => { hintEl.textContent = 'tap the deck to pause'; });
  audio.addEventListener('pause', () => { hintEl.textContent = 'tap the deck to resume'; });

  const loadTape = (i) => {
    const t = TAPES[i];
    playlist = [
      ...t.a.tracks.map((f) => `assets/audio/${t.dir}/A/${f}`),
      ...t.b.tracks.map((f) => `assets/audio/${t.dir}/B/${f}`),
    ].map(encodeURI);
    idx = 0; current = i; deckColor = t.color || '#c9a44a';
    audio.src = playlist[0];
    audio.play().catch(() => {});
    nowEl.textContent = `${t.artist} — ${t.title}`;
    el.querySelectorAll('.mg-tape').forEach((c, j) => c.classList.toggle('sel', j === i));
  };
  el.querySelectorAll('.mg-tape').forEach((card) => card.addEventListener('click', () => loadTape(Number(card.dataset.i))));
  el.querySelector('.mg-deck').addEventListener('click', () => {
    if (current < 0) return;
    if (audio.paused) audio.play().catch(() => {}); else audio.pause();
  });

  // ---- animation loop: spinning reels + dancing machines ----
  let spin = 0;
  let lastT = performance.now();
  const frame = (t) => {
    const dt = Math.min(0.05, (t - lastT) / 1000); lastT = t;
    const playing = current >= 0 && !audio.paused;
    // deck cassette
    if (playing) spin += dt * 2.4; // slow, lazy reel turn
    deckCtx.clearRect(0, 0, deckCv.width, deckCv.height);
    deckCtx.save(); deckCtx.translate(deckCv.width / 2, deckCv.height / 2); deckCtx.scale(6.4, 6.4);
    deckRenderer.drawCassette({ color: deckColor }, spin);
    deckCtx.restore();
    // machines
    for (const b of bots) {
      b.robot.walkPhase += dt * (playing ? 12 : 3);
      b.robot.animT += dt;
      const bob = playing ? Math.abs(Math.sin(t / 1000 * 6 + b.phase)) * 9 : Math.abs(Math.sin(t / 1000 * 1.5 + b.phase)) * 2;
      const tilt = playing ? Math.sin(t / 1000 * 6 + b.phase) * 0.12 : 0;
      b.ctx.clearRect(0, 0, b.cv.width, b.cv.height);
      b.ctx.save();
      b.ctx.translate(b.cv.width / 2, b.cv.height - 14 - bob);
      b.ctx.rotate(tilt);
      b.ctx.scale(1.15, 1.15);
      drawRobot(b.ctx, b.robot, worldToScreen);
      b.ctx.restore();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // ---- SKYLINK uplink clock (cosmetic doomsday timer) ----
  const skyEl = el.querySelector('#mg-sky');
  const skyBanner = el.querySelector('#mg-skylink');
  let secs = 3 * 3600 + 27 * 60 + 41;
  const tickSky = () => {
    const s = Math.max(0, secs);
    const hh = String(Math.floor(s / 3600)).padStart(2, '0');
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    skyEl.textContent = `${hh}:${mm}:${ss}`;
    if (s <= 0) { skyBanner.classList.add('imminent'); skyEl.textContent = 'IMMINENT'; } else secs -= 1;
  };
  tickSky();
  setInterval(tickSky, 1000);
}
