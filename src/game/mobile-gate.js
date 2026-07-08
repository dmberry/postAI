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

// The desktop start screen is the same component in 'title' mode: same dancing
// machines, same playable Walkman, same themes and doomsday clock, but with a
// Start / Continue action row instead of the mobile "you need a keyboard" note.
export function initTitleScreen() { return initMobileGate('title'); }

// Colour themes lifted from the three worlds. Each sets the gate background,
// text accent, and the Walkman deck's body/edge.
// Backgrounds are kept fairly light so the (dark) machines read against them.
const THEMES = {
  World: { bg1: '#3f5730', bg2: '#26331b', accent: '#dce8c8', deck: '#e6b422', edge: 'rgba(20,18,8,0.9)', bezel: 'rgba(255,240,180,0.75)' },
  Backspace: { bg1: '#8f8250', bg2: '#5c5330', accent: '#211d0c', deck: '#b9a862', edge: 'rgba(34,28,10,0.9)', bezel: 'rgba(240,230,170,0.6)' },
  Fortress: { bg1: '#4a5563', bg2: '#2b333d', accent: '#e2ecf4', deck: '#828d99', edge: 'rgba(8,10,13,0.92)', bezel: 'rgba(210,224,236,0.55)' },
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

export function initMobileGate(mode = 'gate') {
  const isTitle = mode === 'title';
  let hasSave = false;
  try { hasSave = !!localStorage.getItem('postai-character'); } catch (e) { /* storage blocked */ }
  let running = true;   // frame loop / clock keep going until we boot the game
  let skyTimer = null;
  const el = document.createElement('div');
  el.id = 'mobile-gate';
  if (isTitle) el.dataset.mode = 'title';
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
      #mobile-gate h1 { font-size: 26px; margin: 2px 0 1px; letter-spacing: 0.02em; }
      #mobile-gate .mg-sub { font-size: 15px; line-height: 1.4; color: #f0ead8; font-weight: 700; text-align: center; max-width: 30em; margin: 0 0 2px; }
      #mobile-gate .mg-sub2 { display: block; font-size: 12px; font-weight: 400; color: var(--accent); margin-top: 6px; }
      .mg-tryanyway { font-size: 12px; color: var(--accent); opacity: 0.8; text-decoration: underline;
        text-underline-offset: 3px; cursor: pointer; margin: 10px 0; background: none; border: none; font-family: inherit; }
      .mg-tryanyway:active { opacity: 1; }
      /* title-mode Start / Continue actions */
      .mg-actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin: 8px 0 2px; flex: 0 0 auto; }
      .mg-btn { font: 700 15px system-ui, sans-serif; letter-spacing: 0.03em; cursor: pointer; font-family: inherit;
        color: var(--accent); background: rgba(255,255,255,0.07); border: 1.5px solid var(--accent);
        border-radius: 8px; padding: 10px 24px; transition: transform 0.1s; }
      .mg-btn.primary { color: #10130d; background: var(--accent); border-color: var(--accent); }
      .mg-btn:hover { background: color-mix(in srgb, var(--accent) 22%, transparent); }
      .mg-btn.primary:hover { background: color-mix(in srgb, var(--accent) 88%, white); }
      .mg-btn:active { transform: scale(0.96); }
      /* theme switch (under the tape rack) */
      .mg-themes { display: flex; gap: 6px; margin-top: 18px; justify-content: center; flex: 0 0 auto; }
      .mg-themes button { font: 600 11px system-ui, sans-serif; letter-spacing: 0.06em; text-transform: uppercase;
        color: var(--accent); background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.18);
        border-radius: 5px; padding: 5px 11px; cursor: pointer; }
      .mg-themes button.on { color: #10130d; background: var(--accent); border-color: var(--accent); }
      /* SKYLINK uplink clock */
      .mg-skylink { font: 700 12px ui-monospace, monospace; letter-spacing: 0.1em; text-transform: uppercase;
        color: #ff5ad0; text-shadow: 0 0 8px rgba(255,90,208,0.6); margin: 0 0 4px;
        border: 1px solid rgba(255,90,208,0.4); border-radius: 4px; padding: 4px 10px; background: rgba(40,6,30,0.5); }
      .mg-skylink span { color: #ffd0f2; }
      .mg-skylink.imminent { animation: mg-alarm 0.8s steps(1) infinite; }
      @keyframes mg-alarm { 0%,50% { opacity: 1; } 51%,100% { opacity: 0.35; } }
      /* dancing machines (canvas, drawn by drawRobot) */
      .mg-stage { flex: 1 1 auto; display: flex; align-items: flex-end; justify-content: center; gap: 8px; width: 100%; min-height: 128px; max-height: 190px;
        background: radial-gradient(70% 120% at 50% 100%, rgba(255,255,255,0.14), transparent 72%); }
      .mg-bot { width: 98px; height: 122px; }
      /* walkman deck — the yellow, double-outlined box from the HUD */
      .mg-deck { width: min(320px, 88vw); background: var(--deck); border-radius: 14px;
        border: 3px solid var(--edge); box-shadow: 0 8px 22px rgba(0,0,0,0.5), inset 0 0 0 2px var(--bezel);
        padding: 9px; margin-bottom: 8px; flex: 0 0 auto; }
      .mg-deck-cass { display: block; width: 100%; height: auto; }
      .mg-nowplaying { text-align: center; font-size: 13px; color: #1c1a10; font-weight: 700; margin-top: 5px; min-height: 16px; letter-spacing: 0.02em; }
      /* transport controls — play/pause, stop, next */
      .mg-transport { display: flex; gap: 8px; justify-content: center; margin-top: 7px; }
      .mg-transport button { width: 40px; height: 32px; border-radius: 7px; cursor: pointer;
        display: flex; align-items: center; justify-content: center; font-size: 14px; line-height: 1;
        color: #f4ecd2; background: rgba(20,18,8,0.82); border: 1px solid rgba(20,18,8,0.9); font-family: inherit; transition: transform 0.1s; }
      .mg-transport button:hover { background: rgba(20,18,8,0.95); }
      .mg-transport button:active { transform: scale(0.92); }
      .mg-transport button:disabled { opacity: 0.4; cursor: default; }
      .mg-transport #mg-play { width: 52px; }
      /* tape rack — real cassettes drawn to canvas */
      .mg-rack { display: flex; gap: 12px; overflow-x: auto; width: 100%; padding: 2px 4px 4px; justify-content: safe center;
        flex: 0 0 auto; -webkit-overflow-scrolling: touch; }
      .mg-tape { flex: 0 0 auto; width: 100px; cursor: pointer; text-align: center; transition: transform 0.12s; }
      .mg-tape:active { transform: scale(0.95); }
      .mg-tape canvas { display: block; width: 100px; height: 65px; border-radius: 6px;
        background: rgba(0,0,0,0.25); border: 2px solid rgba(0,0,0,0.5); }
      .mg-tape.sel canvas { border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 55%, transparent); }
      .mg-tape .mg-artist { font-size: 11.5px; font-weight: 700; color: #e8e2d0; margin-top: 5px; }
      .mg-tape .mg-title { font-size: 10.5px; color: #9aa0aa; font-style: italic; }
      /* title mode has a full desktop window to breathe into — bigger logo,
         more air between the header, buttons, clock and stage. */
      #mobile-gate[data-mode="title"] { padding-top: max(28px, env(safe-area-inset-top)); gap: 4px; }
      #mobile-gate[data-mode="title"] h1 { font-size: 40px; margin: 6px 0 6px; }
      #mobile-gate[data-mode="title"] .mg-sub { font-size: 17px; margin-bottom: 6px; }
      #mobile-gate[data-mode="title"] .mg-actions { margin: 18px 0 6px; }
      #mobile-gate[data-mode="title"] .mg-btn { font-size: 16px; padding: 12px 30px; }
      #mobile-gate[data-mode="title"] .mg-skylink { margin-top: 20px; margin-bottom: 10px; }
      #mobile-gate[data-mode="title"] .mg-stage { margin-top: 10px; max-height: 240px; }
    </style>
    <h1>postAI</h1>
    ${isTitle ? `
    <p class="mg-sub">The machines outlived the world. Now survive it.<span class="mg-sub2">A keyboard-and-mouse survival game. Here's the soundtrack while you decide.</span></p>
    <div class="mg-actions">
      ${hasSave ? '<button id="mg-continue" class="mg-btn primary">Continue</button>' : ''}
      <button id="mg-start" class="mg-btn ${hasSave ? '' : 'primary'}">${hasSave ? 'New game' : 'Start'}</button>
    </div>` : `
    <p class="mg-sub">It is the end of the world, and you will need a keyboard and mouse to save it!<span class="mg-sub2">Grab a laptop or desktop for the real thing.<br>Meanwhile, here's the soundtrack.</span></p>
    <button class="mg-tryanyway" id="mg-tryanyway">Try and play it anyway…</button>`}
    <div class="mg-skylink" id="mg-skylink">SKYLINK uplink operative · T‑<span id="mg-sky">--:--:--</span></div>
    <div class="mg-stage" id="mg-stage"></div>
    <div class="mg-deck">
      <canvas class="mg-deck-cass" id="mg-deck-cass" width="280" height="110"></canvas>
      <div class="mg-nowplaying" id="mg-now">— tap a tape below —</div>
      <div class="mg-transport">
        <button id="mg-play" title="Play / pause" aria-label="Play or pause">▶</button>
        <button id="mg-stop" title="Stop" aria-label="Stop">■</button>
        <button id="mg-next" title="Next track" aria-label="Next track">▶▶|</button>
      </div>
    </div>
    <div class="mg-rack" id="mg-rack"></div>
    <div class="mg-themes" id="mg-themes">
      <button data-theme="World" class="on">World</button>
      <button data-theme="Backspace">Backspace</button>
      <button data-theme="Fortress">Fortress</button>
    </div>
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

  // Tear down the screen and hand off to the game. newGame wipes the run save
  // (keeping the durable name/gender identity, exactly like in-game New Game);
  // otherwise the game restores whatever save exists. Title music always stops
  // here — the game starts its own soundtrack.
  const boot = (newGame) => {
    running = false;
    if (skyTimer) clearInterval(skyTimer);
    try { audio.pause(); } catch (e) { /* not yet playing */ }
    if (newGame) {
      try {
        localStorage.removeItem('postai-character');
        localStorage.removeItem('postai-lore');
        localStorage.removeItem('postai-seed');
      } catch (e) { /* storage blocked */ }
    }
    el.remove();
    import('../main.js');
  };
  if (isTitle) {
    // Start = new game (wipe save); Continue = resume the existing save.
    el.querySelector('#mg-start').addEventListener('click', () => boot(true));
    const cont = el.querySelector('#mg-continue');
    if (cont) cont.addEventListener('click', () => boot(false));
  } else {
    // Escape hatch: if the gate fired by mistake (a touch laptop, say), let them
    // dismiss it and boot the real game anyway (resuming any save).
    el.querySelector('#mg-tryanyway').addEventListener('click', () => boot(false));
  }

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
    const cv = document.createElement('canvas'); cv.className = 'mg-bot'; cv.width = 108; cv.height = 150;
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
  audio.playsInline = true;      // iOS: play in place, don't hijack fullscreen
  audio.setAttribute('playsinline', '');
  audio.style.display = 'none';
  el.appendChild(audio);          // in the DOM so the auto-advance play() isn't treated as a fresh, gesture-required start on mobile
  let playlist = [];
  let idx = 0;
  let current = -1;
  const nowEl = el.querySelector('#mg-now');
  const playBtn = el.querySelector('#mg-play');
  const stopBtn = el.querySelector('#mg-stop');
  const nextBtn = el.querySelector('#mg-next');

  // A readable track name from a filename: drop the extension and any leading
  // track-number prefix ("01-02- ", "02 ", etc.).
  const trackName = (path) => decodeURI(path).split('/').pop()
    .replace(/\.mp3$/i, '').replace(/^\d+[-.\s]*\d*[-.\s]*/, '').trim() || 'track';
  // Deck readout: while a tape is loaded, show artist + current track (with the
  // side it's on); otherwise the prompt.
  const updateNow = () => {
    if (current < 0) { nowEl.textContent = '— tap a tape below —'; return; }
    const t = TAPES[current];
    const side = idx < t.a.tracks.length ? 'A' : 'B';
    nowEl.textContent = `${t.artist} — ${trackName(playlist[idx])} · ${side}`;
  };

  // Reflect play/pause on the button glyph; disable stop/next until a tape's in.
  const syncTransport = () => {
    playBtn.textContent = (current >= 0 && !audio.paused) ? '❚❚' : '▶';
    stopBtn.disabled = current < 0;
    nextBtn.disabled = current < 0;
  };
  // Advance to the next track on the loaded tape, wrapping A → B → A.
  const nextTrack = () => {
    if (!playlist.length) return;
    idx = (idx + 1) % playlist.length;
    audio.src = playlist[idx];
    audio.play().catch(() => {});
    updateNow();
  };
  audio.addEventListener('ended', nextTrack);
  audio.addEventListener('play', syncTransport);
  audio.addEventListener('pause', syncTransport);

  const loadTape = (i) => {
    const t = TAPES[i];
    playlist = [
      ...t.a.tracks.map((f) => `assets/audio/${t.dir}/A/${f}`),
      ...t.b.tracks.map((f) => `assets/audio/${t.dir}/B/${f}`),
    ].map(encodeURI);
    idx = 0; current = i; deckColor = t.color || '#c9a44a';
    audio.src = playlist[0];
    audio.play().catch(() => {});
    updateNow();
    syncTransport();
    el.querySelectorAll('.mg-tape').forEach((c, j) => c.classList.toggle('sel', j === i));
  };
  // Tapping a tape starts it; tapping the tape that's already loaded skips to
  // its next track (the buttons below do the same explicitly).
  el.querySelectorAll('.mg-tape').forEach((card) => card.addEventListener('click', () => {
    const i = Number(card.dataset.i);
    if (i === current) nextTrack(); else loadTape(i);
  }));
  // Transport buttons. stopPropagation so they don't also fire the deck's
  // click-to-pause below.
  playBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (current < 0) { loadTape(0); return; }   // nothing loaded yet → start tape 1
    if (audio.paused) audio.play().catch(() => {}); else audio.pause();
  });
  stopBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (current < 0) return;
    audio.pause(); audio.currentTime = 0; syncTransport();
  });
  nextBtn.addEventListener('click', (e) => { e.stopPropagation(); nextTrack(); });
  // The big cassette itself still toggles play/pause.
  el.querySelector('.mg-deck').addEventListener('click', () => {
    if (current < 0) return;
    if (audio.paused) audio.play().catch(() => {}); else audio.pause();
  });
  syncTransport();   // initial: play shows ▶, stop/next disabled

  // ---- animation loop: spinning reels + dancing machines ----
  let spin = 0;
  let lastT = performance.now();
  const frame = (t) => {
    if (!running) return;   // stop drawing once we've booted the game
    const dt = Math.min(0.05, (t - lastT) / 1000); lastT = t;
    const playing = current >= 0 && !audio.paused;
    // deck cassette
    if (playing) spin += dt * 2.4; // slow, lazy reel turn
    deckCtx.clearRect(0, 0, deckCv.width, deckCv.height);
    deckCtx.save(); deckCtx.translate(deckCv.width / 2, deckCv.height / 2); deckCtx.scale(5.0, 5.0);
    deckRenderer.drawCassette({ color: deckColor }, spin);
    deckCtx.restore();
    // machines — bob up and down to the beat (drawRobot's own shadow is
    // suppressed via r.noShadow; we draw a separate shadow that stays planted
    // on the floor and just shrinks a touch as the machine springs up).
    for (const b of bots) {
      b.robot.walkPhase += dt * (playing ? 12 : 3);
      b.robot.animT += dt;
      b.robot.noShadow = true;
      const beat = t / 1000 * 6 + b.phase;
      const bob = playing ? Math.abs(Math.sin(beat)) * 10 : Math.abs(Math.sin(t / 1000 * 1.5 + b.phase)) * 2;
      const tilt = playing ? Math.sin(beat) * 0.06 : 0;
      const cx = b.cv.width / 2, floorY = b.cv.height - 16;
      b.ctx.clearRect(0, 0, b.cv.width, b.cv.height);
      // planted floor shadow
      const sw = Math.max(9, 17 - bob * 0.5);
      b.ctx.fillStyle = 'rgba(0,0,0,0.32)';
      b.ctx.beginPath(); b.ctx.ellipse(cx, floorY, sw, sw * 0.34, 0, 0, Math.PI * 2); b.ctx.fill();
      // bobbing body
      b.ctx.save();
      b.ctx.translate(cx, floorY - bob);
      b.ctx.rotate(tilt);
      b.ctx.scale(1.6, 1.6);
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
  skyTimer = setInterval(tickSky, 1000);
}
