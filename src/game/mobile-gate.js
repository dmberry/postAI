// Mobile fallback. postAI is a keyboard/mouse game and isn't playable on a
// phone, so on a touch device we skip loading the game (main.js never runs)
// and show this gate: a friendly note plus a working Walkman for the
// soundtrack. Everything visual is drawn with the SAME code the game uses —
// real cassettes (Renderer.drawCassette) in the deck and rack, real machines
// (robots.js drawRobot) dancing above — so it looks like postAI, not a
// mock-up. Switchable World / Backspace / Fortress colour themes.

import { TAPES } from './items.js';
import { VERSION } from '../version.js';
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

  // Markup pieces, composed differently per mode: the gate is one column; the
  // title lays the same pieces out as two columns (hero text | Walkman) with
  // the dancing machines as a full-width band along the bottom, so it fits a
  // landscape laptop instead of a tall phone strip.
  const brandHtml = `<div class="mg-brand"><span class="mg-brand-mark" aria-hidden="true"></span><h1>Nost<span class="mg-ai">OS</span><span class="mg-caret">_</span></h1></div>`;
  const stageHtml = `<div class="mg-stage" id="mg-stage"></div>`;
  const deckHtml = `<div class="mg-deck">
      <canvas class="mg-deck-cass" id="mg-deck-cass" width="264" height="168"></canvas>
      <div class="mg-transport">
        <button id="mg-play" title="Play / pause" aria-label="Play or pause">▶</button>
        <button id="mg-stop" title="Stop" aria-label="Stop">■</button>
        <button id="mg-next" title="Next track" aria-label="Next track">▶▶|</button>
      </div>
    </div>`;
  const rackHtml = `<div class="mg-rack" id="mg-rack"></div>`;
  const themesHtml = `<div class="mg-themes" id="mg-themes">
      <button data-theme="World" class="on">World</button>
      <button data-theme="Backspace">Backspace</button>
      <button data-theme="Fortress">Fortress</button>
    </div>`;
  // On the phone gate the vertical space is tight, so the theme switch lives
  // behind a hamburger (fixed, top-right) instead of a row at the bottom that
  // gets clipped by the browser chrome. The title (desktop) keeps it inline.
  // The hamburger also carries an About entry.
  const menuHtml = `<div class="mg-menu">
      <button class="mg-menu-btn" id="mg-menu-btn" aria-label="Menu" aria-expanded="false">☰</button>
      <div class="mg-menu-pop" id="mg-menu-pop" hidden>
        <div class="mg-menu-label">Theme</div>${themesHtml}
        <button class="mg-menu-about" id="mg-menu-about">About</button>
      </div>
    </div>`;
  // Soundtrack list, built straight from the tape ledger so it can't drift.
  const cleanTrack = (f) => f.replace(/\.mp3$/i, '').replace(/^\d+[-.\s]*\d*[-.\s]*/, '').trim();
  const songsHtml = TAPES.map((t) => {
    const a = t.a.tracks.map(cleanTrack).join(', ');
    const b = t.b.tracks.map(cleanTrack).join(', ');
    return `<li><b>${t.artist} — <i>${t.title}</i></b><br>A: ${a} &nbsp;·&nbsp; B: ${b}</li>`;
  }).join('');
  const artists = [...new Set(TAPES.map((t) => t.artist))].join(', ');
  const aboutHtml = `<div class="mg-about" id="mg-about" hidden>
      <div class="mg-about-card">
        <button class="mg-about-x" id="mg-about-x" aria-label="Close">✕</button>
        <h2>Nost<span style="color:#fff">OS</span></h2>
        <p class="mg-about-by">A postAI Odyssey · by David and Henrik</p>
        <div class="mg-about-h">Soundtrack — cassettes you find and play</div>
        <ul class="mg-about-tapes">${songsHtml}</ul>
        <p class="mg-about-tiny">Music: ${artists}. Character &amp; animal art: Kenney (kenney.nl), CC0.</p>
        <p class="mg-about-tiny">Game designed in the UK · github.com/dmberry/nostos</p>
      </div>
    </div>`;
  const footerHtml = `<div class="mg-madein">alpha · Game designed in the UK · <button class="mg-about-open" id="mg-about-open">About</button> <span class="mg-ver">v${VERSION}</span></div>`;
  // A looping game-world clip drifting slowly behind everything, low opacity.
  // It plays at half speed (set in JS) and pans gently left→right (CSS).
  // H.264 MP4 — plays in every modern browser (transcoded from the source .mov).
  const videoHtml = `<video class="mg-bgvideo" autoplay muted loop playsinline preload="auto" aria-hidden="true">
      <source src="assets/media/videos/postAI-background.mp4" type="video/mp4">
    </video>`;
  const copyHtml = isTitle
    ? `<p class="mg-sub">The machines made the world standing reserve. Now survive it.<span class="mg-sub2">A keyboard-and-mouse survival game.<br>Here's the soundtrack while you decide.</span></p>
       <div class="mg-actions">
         ${hasSave ? '<button id="mg-continue" class="mg-btn primary">Continue</button>' : ''}
         <button id="mg-start" class="mg-btn ${hasSave ? '' : 'primary'}">${hasSave ? 'New game' : 'Start'}</button>
       </div>`
    : `<p class="mg-sub">It's the end of the world.<span class="mg-sub2">This is an early alpha — you can play it right here with touch controls (hold to move, tap to act), or grab a laptop for the full keyboard-and-mouse game. Either way, here's the soundtrack.</span></p>
       <div class="mg-actions"><button id="mg-tryanyway" class="mg-btn primary">▶ Play (alpha)</button></div>`;
  const bodyHtml = isTitle
    ? `${videoHtml}<div class="mg-hero">${brandHtml}${copyHtml}</div>
       <div class="mg-player">${deckHtml}${rackHtml}${themesHtml}</div>
       ${stageHtml}${footerHtml}${aboutHtml}`
    : `${videoHtml}${brandHtml}${copyHtml}${stageHtml}${deckHtml}${rackHtml}${menuHtml}${footerHtml}${aboutHtml}`;

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
      /* moving game-world backdrop: low opacity, gently panning left↔right
         (negative z-index so it sits behind all the in-flow content). */
      .mg-bgvideo { position: absolute; top: 0; left: 0; height: 100%; width: auto; min-width: 100%;
        z-index: -1; opacity: 0.18; object-fit: cover; pointer-events: none;
        animation: mg-pan 90s ease-in-out infinite alternate; will-change: transform; }
      @keyframes mg-pan { from { transform: translateX(0); } to { transform: translateX(-14%); } }
      @media (prefers-reduced-motion: reduce) { .mg-bgvideo { animation: none; } }
      /* branding wordmark: mono terminal type, glowing AI, blinking caret,
         and a little cassette mark — themes with --accent. */
      .mg-brand { display: flex; align-items: center; gap: 12px; margin: 2px 0 1px; }
      #mobile-gate h1 { font: 800 30px ui-monospace, "SF Mono", Menlo, monospace; letter-spacing: 0.01em;
        margin: 0; color: #f2ecda; text-shadow: 0 2px 14px rgba(0,0,0,0.55); }
      #mobile-gate h1 .mg-ai { color: var(--accent); text-shadow: 0 0 16px color-mix(in srgb, var(--accent) 70%, transparent); }
      #mobile-gate h1 .mg-caret { color: var(--accent); font-weight: 400; margin-left: 2px;
        animation: mg-blink 1.1s steps(1) infinite; }
      @keyframes mg-blink { 0%,50% { opacity: 1; } 51%,100% { opacity: 0; } }
      .mg-brand-mark { width: 34px; height: 22px; border-radius: 4px; flex: 0 0 auto; position: relative;
        background: #26282d; border: 1.6px solid rgba(0,0,0,0.55);
        box-shadow: 0 3px 10px rgba(0,0,0,0.4), inset 0 0 0 2px var(--deck); }
      .mg-brand-mark::before, .mg-brand-mark::after { content: ''; position: absolute; top: 9px;
        width: 8px; height: 8px; border-radius: 50%; background: #e8e2d0; box-shadow: inset 0 0 0 2px #26282d; }
      .mg-brand-mark::before { left: 6px; } .mg-brand-mark::after { right: 6px; }
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
      /* hamburger theme menu (mobile gate only) */
      .mg-menu { position: fixed; top: max(10px, env(safe-area-inset-top)); right: max(10px, env(safe-area-inset-right)); z-index: 20; }
      .mg-menu-btn { width: 42px; height: 42px; border-radius: 10px; font-size: 19px; line-height: 1; cursor: pointer;
        color: var(--accent); background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.22); font-family: inherit; }
      .mg-menu-btn:active { transform: scale(0.94); }
      .mg-menu-pop { position: absolute; top: 48px; right: 0; min-width: 150px; padding: 8px;
        background: rgba(18,22,14,0.97); border: 1px solid rgba(255,255,255,0.18); border-radius: 11px;
        box-shadow: 0 10px 26px rgba(0,0,0,0.55); }
      .mg-menu-pop[hidden] { display: none; }
      .mg-menu-label { font: 700 10px system-ui, sans-serif; text-transform: uppercase; letter-spacing: 0.08em;
        color: var(--accent); opacity: 0.75; margin: 2px 4px 7px; }
      .mg-menu .mg-themes { flex-direction: column; gap: 6px; margin-top: 0; }
      .mg-menu .mg-themes button { width: 100%; text-align: center; }
      .mg-menu-about { width: 100%; margin-top: 8px; padding: 8px 11px; cursor: pointer; font: 700 12px system-ui, sans-serif;
        letter-spacing: 0.04em; color: var(--accent); background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.18); border-radius: 6px; }
      /* "designed in the UK" footer + About link (both modes) */
      .mg-madein { position: fixed; left: 0; right: 0; bottom: max(5px, env(safe-area-inset-bottom));
        text-align: center; font-size: 10px; letter-spacing: 0.03em; color: rgba(207,216,195,0.42); z-index: 6; pointer-events: none; }
      .mg-about-open { font: inherit; color: rgba(207,216,195,0.7); background: none; border: none; padding: 0;
        text-decoration: underline; text-underline-offset: 2px; cursor: pointer; pointer-events: auto; }
      .mg-ver { font-size: 9px; color: rgba(207,216,195,0.3); letter-spacing: 0.02em; }
      /* About overlay */
      .mg-about { position: fixed; inset: 0; z-index: 30; display: flex; align-items: center; justify-content: center;
        background: rgba(6,9,5,0.72); padding: 20px; -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px); }
      .mg-about[hidden] { display: none; }
      .mg-about-card { position: relative; width: min(460px, 92vw); max-height: 84vh; overflow-y: auto;
        background: #14180e; border: 1px solid rgba(255,255,255,0.16); border-radius: 14px; padding: 20px 20px 16px;
        box-shadow: 0 16px 40px rgba(0,0,0,0.6); color: #cfd8c3; }
      .mg-about-x { position: absolute; top: 10px; right: 12px; width: 30px; height: 30px; border-radius: 8px;
        font-size: 14px; cursor: pointer; color: #cfd8c3; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.18); }
      .mg-about-card h2 { font: 800 22px ui-monospace, Menlo, monospace; margin: 0 0 2px; color: #f2ecda; }
      .mg-about-by { font-size: 12px; color: #9db284; margin: 0 0 14px; }
      .mg-about-h { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--accent); margin: 0 0 6px; }
      .mg-about-tapes { list-style: none; margin: 0 0 12px; padding: 0; }
      .mg-about-tapes li { font-size: 12px; margin: 0 0 8px; padding: 6px 10px; border-left: 2px solid rgba(157,178,132,0.5);
        background: rgba(255,255,255,0.03); border-radius: 0 6px 6px 0; line-height: 1.4; }
      .mg-about-tapes li b { color: #e8e0d0; font-weight: 700; }
      .mg-about-tiny { font-size: 10px; color: rgba(207,216,195,0.5); margin: 3px 0 0; line-height: 1.4; }
      /* POSEIDON uplink clock */
      .mg-skylink { font: 700 12px ui-monospace, monospace; letter-spacing: 0.1em; text-transform: uppercase;
        color: #5b9dff; text-shadow: 0 0 8px rgba(70,130,255,0.6); margin: 0 0 4px;
        border: 1px solid rgba(70,130,255,0.4); border-radius: 4px; padding: 4px 10px; background: rgba(8,18,44,0.6); }
      .mg-skylink span { color: #cfe0ff; }
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
      /* Same width as the deck and centred under it, so the cassette strip
         lines up with the Walkman. The tapes now overflow that width (5 of
         them), so start at the first tape and scroll right rather than centring
         the row and clipping both ends. */
      .mg-rack { display: flex; gap: 12px; overflow-x: auto; width: 100%; max-width: min(320px, 88vw); margin: 0 auto;
        padding: 2px 4px 4px; justify-content: flex-start; flex: 0 0 auto; -webkit-overflow-scrolling: touch; }
      .mg-tape { flex: 0 0 auto; width: 100px; cursor: pointer; text-align: center; transition: transform 0.12s; }
      .mg-tape:active { transform: scale(0.95); }
      .mg-tape canvas { display: block; width: 100px; height: 65px; border-radius: 6px;
        background: rgba(0,0,0,0.25); border: 2px solid rgba(0,0,0,0.5); }
      .mg-tape.sel canvas { border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 55%, transparent); }
      .mg-tape .mg-artist { font-size: 11.5px; font-weight: 700; color: #e8e2d0; margin-top: 5px; }
      .mg-tape .mg-title { font-size: 10.5px; color: #9aa0aa; font-style: italic; }
      /* title mode has a full desktop window to breathe into — bigger logo,
         more air between the header, buttons, clock and stage. */
      #mobile-gate[data-mode="title"] { padding: 3vh 6vw; gap: 2px; justify-content: center; }
      #mobile-gate[data-mode="title"] h1 { font-size: 46px; }
      #mobile-gate[data-mode="title"] .mg-brand { margin: 6px 0; gap: 16px; }
      #mobile-gate[data-mode="title"] .mg-brand-mark { width: 48px; height: 31px; border-radius: 5px; }
      #mobile-gate[data-mode="title"] .mg-brand-mark::before, #mobile-gate[data-mode="title"] .mg-brand-mark::after { top: 13px; width: 11px; height: 11px; }
      #mobile-gate[data-mode="title"] .mg-brand-mark::before { left: 9px; } #mobile-gate[data-mode="title"] .mg-brand-mark::after { right: 9px; }
      #mobile-gate[data-mode="title"] .mg-sub { font-size: 17px; margin-bottom: 6px; max-width: 24em; }
      #mobile-gate[data-mode="title"] .mg-actions { margin: 16px 0 6px; }
      #mobile-gate[data-mode="title"] .mg-btn { font-size: 16px; padding: 12px 30px; }
      #mobile-gate[data-mode="title"] .mg-skylink { margin-top: 16px; }
      .mg-hero, .mg-player { display: flex; flex-direction: column; align-items: center; min-width: 0; }
      .mg-player { width: 100%; max-width: 360px; }
      #mobile-gate[data-mode="title"] .mg-stage { max-height: 200px; }
      /* landscape laptop: two centred columns (hero text | Walkman) with the
         machines as a full-width band along the bottom — fills the width and
         fits the height instead of a tall single strip. */
      @media (min-width: 820px) {
        #mobile-gate[data-mode="title"] {
          display: grid; align-content: center; justify-content: center;
          grid-template-columns: minmax(300px, 460px) minmax(340px, 480px);
          grid-template-rows: 1fr auto; grid-template-areas: "hero player" "stage stage";
          column-gap: 5vw; row-gap: 1vh; padding: 2vh 5vw; }
        #mobile-gate[data-mode="title"] .mg-hero { grid-area: hero; align-items: flex-start; align-self: center; }
        #mobile-gate[data-mode="title"] .mg-hero .mg-sub, #mobile-gate[data-mode="title"] .mg-hero .mg-sub2 { text-align: left; }
        #mobile-gate[data-mode="title"] .mg-hero .mg-actions { justify-content: flex-start; }
        #mobile-gate[data-mode="title"] h1 { font-size: 52px; }
        #mobile-gate[data-mode="title"] .mg-player { grid-area: player; align-self: center; justify-self: center; max-width: 480px; }
        /* Desktop title has room to show ALL the tapes at once — no scroll:
           centre them and shrink each a touch so the whole rack fits. */
        #mobile-gate[data-mode="title"] .mg-rack { justify-content: center; overflow: visible; max-width: none; gap: 9px; }
        #mobile-gate[data-mode="title"] .mg-tape { width: 84px; }
        #mobile-gate[data-mode="title"] .mg-tape canvas { width: 84px; height: 55px; }
        #mobile-gate[data-mode="title"] .mg-stage { grid-area: stage; width: 100%; max-height: 260px; align-self: end; }
        #mobile-gate[data-mode="title"] .mg-bot { width: 122px; height: 152px; }
      }
    </style>
    ${bodyHtml}
  `;
  document.body.appendChild(el);

  // Backdrop clip at half speed (and nudge it to autoplay where the browser
  // needs a poke). Harmless if the .mov codec isn't supported — the themed
  // gradient shows through underneath.
  const bgv = el.querySelector('.mg-bgvideo');
  if (bgv) {
    bgv.playbackRate = 0.5;
    bgv.addEventListener('loadedmetadata', () => { bgv.playbackRate = 0.5; });
    bgv.play?.().catch(() => {});
  }

  // ---- theme switch ----
  const applyTheme = (name) => {
    const t = THEMES[name] || THEMES.World;
    for (const [k, v] of Object.entries({ '--bg1': t.bg1, '--bg2': t.bg2, '--accent': t.accent, '--deck': t.deck, '--edge': t.edge, '--bezel': t.bezel })) {
      el.style.setProperty(k, v);
    }
    el.querySelectorAll('#mg-themes button').forEach((b) => b.classList.toggle('on', b.dataset.theme === name));
  };
  // Hamburger menu (gate only): toggle the theme popover; close on a pick or an
  // outside tap.
  const menuBtn = el.querySelector('#mg-menu-btn');
  const menuPop = el.querySelector('#mg-menu-pop');
  const closeMenu = () => { if (menuPop) { menuPop.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); } };
  if (menuBtn) {
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = menuPop.hidden;
      menuPop.hidden = !open;
      menuBtn.setAttribute('aria-expanded', String(open));
    });
    el.addEventListener('click', (e) => {
      if (!menuPop.hidden && !menuPop.contains(e.target) && e.target !== menuBtn) closeMenu();
    });
  }
  el.querySelectorAll('#mg-themes button').forEach((b) => b.addEventListener('click', () => { applyTheme(b.dataset.theme); closeMenu(); }));

  // ---- About overlay ----
  const about = el.querySelector('#mg-about');
  const openAbout = () => { about.hidden = false; closeMenu(); };
  const closeAbout = () => { about.hidden = true; };
  el.querySelector('#mg-about-open')?.addEventListener('click', (e) => { e.stopPropagation(); openAbout(); });
  el.querySelector('#mg-menu-about')?.addEventListener('click', (e) => { e.stopPropagation(); openAbout(); });
  el.querySelector('#mg-about-x')?.addEventListener('click', closeAbout);
  about?.addEventListener('click', (e) => { if (e.target === about) closeAbout(); });

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
  let nowText = 'NostOS';   // scrolls across the tape's label window (marquee)
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
    if (current < 0) { nowText = 'NostOS'; return; }
    const t = TAPES[current];
    const side = idx < t.a.tracks.length ? 'A' : 'B';
    nowText = `${t.artist} — ${trackName(playlist[idx])} · ${side}`;
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
  // Tapping a tape starts it on side A; tapping the tape that's already loaded
  // FLIPS the cassette to the other side (A ⇄ B), like turning a real tape over
  // — so a second tap gets you straight to the B-side rather than clicking
  // through every A-side track. The ▶▶| button still steps track by track.
  const flipSide = () => {
    const t = TAPES[current];
    const aLen = t.a.tracks.length;
    const onA = idx < aLen;
    idx = onA ? aLen : 0;                 // first B-side track, or back to first A-side track
    if (idx >= playlist.length) idx = 0;  // (empty B-side: stay on A)
    audio.src = playlist[idx];
    audio.play().catch(() => {});
    updateNow();
  };
  el.querySelectorAll('.mg-tape').forEach((card) => card.addEventListener('click', () => {
    const i = Number(card.dataset.i);
    if (i === current) flipSide(); else loadTape(i);
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
  // Two reel angles: the right reel is the motor-driven take-up spool and turns
  // the instant play starts; the left is the passive supply spool and only
  // begins a fraction of a second later, so a starting tape shows the right
  // reel leading — the little tell a real Walkman gives.
  let spinR = 0, spinL = 0, playElapsed = 0, wasPlaying = false;
  let lastT = performance.now();
  const frame = (t) => {
    if (!running) return;   // stop drawing once we've booted the game
    const dt = Math.min(0.05, (t - lastT) / 1000); lastT = t;
    const playing = current >= 0 && !audio.paused;
    // deck cassette — scaled up so the tape nearly fills the deck
    if (playing) {
      if (!wasPlaying) playElapsed = 0;          // (re)start: right leads, left waits
      playElapsed += dt;
      spinR += dt * 1.1;                          // motor reel: turns immediately
      if (playElapsed > 0.22) spinL += dt * 1.1;  // passive reel: catches up a beat later
    }
    wasPlaying = playing;
    const S = 11.2, dcx = deckCv.width / 2, dcy = deckCv.height / 2;
    deckCtx.clearRect(0, 0, deckCv.width, deckCv.height);
    deckCtx.save(); deckCtx.translate(dcx, dcy); deckCtx.scale(S, S);
    deckRenderer.drawCassette({ color: deckColor }, spinR, spinL);
    deckCtx.restore();
    // now-playing marquee across the tape's own coloured label strip
    // (drawCassette draws that strip at local x -9..9, y -5.5..-2.5).
    {
      const lx = dcx - 9 * S, ly = dcy - 5.5 * S, lw = 18 * S, lh = 3 * S;
      deckCtx.save();
      deckCtx.beginPath(); deckCtx.rect(lx, ly, lw, lh); deckCtx.clip();
      deckCtx.font = `600 ${Math.round(lh * 0.4)}px ui-monospace, Menlo, monospace`;
      deckCtx.textBaseline = 'middle';
      deckCtx.fillStyle = 'rgba(18,15,8,0.92)'; // dark ink printed on the coloured label
      const midY = ly + lh / 2 + 0.5;
      if (playing) {
        // seamless loop: a second copy one period ahead, a full-width gap between.
        const tw = deckCtx.measureText(nowText).width;
        const period = tw + lw, off = (t / 34) % period;
        deckCtx.textAlign = 'left';
        deckCtx.fillText(nowText, lx + lw - off, midY);
        deckCtx.fillText(nowText, lx + lw - off + period, midY);
      } else {
        deckCtx.textAlign = 'center';
        deckCtx.fillText(nowText, lx + lw / 2, midY);
      }
      deckCtx.restore();
    }
    // elapsed / total time, tiny light-grey Courier under the reels
    if (current >= 0) {
      const fmt = (s) => { if (!isFinite(s) || s < 0) return '0:00'; const m = Math.floor(s / 60); return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`; };
      deckCtx.font = `${Math.round(S * 0.9)}px "Courier New", ui-monospace, monospace`;
      deckCtx.textAlign = 'center';
      deckCtx.textBaseline = 'alphabetic';
      deckCtx.fillStyle = 'rgba(208,214,198,0.6)';
      deckCtx.fillText(`${fmt(audio.currentTime)} / ${fmt(audio.duration)}`, dcx, dcy + 6.15 * S);
    }
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
}
