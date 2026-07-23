// CALYPSO — the pong you are not allowed to win.
//
// The ball is the zeus-virus. You are trying to put it past her, into her core:
// deliver the message and you are free of Ogygia. She is the defence, and she
// NEVER misses — because your winning means losing you from the island, and that
// is the one thing she will not permit. So she keeps the volley going, gentle and
// endless, aiming every return back at your own paddle to keep it easy, keep you
// here, keep the virus from ever landing.
//
// You cannot force it past a perfect defender who is defending out of love. There
// is no score to reach. What frees you is the opposite of trying harder: you stop
// tending the rally, drop your guard, and let the ball go past YOUR side. That is
// you choosing to leave without your victory — and her hold, which was only ever
// the comfortable rally itself, breaks the moment you prove you will go regardless.
// The willingness to leave unfreed is the thing that frees you. Outcome 'left' is
// therefore the win: she releases you, exactly as she must release Odysseus.
//
// Every other cabinet in the game is SURVIVED. Hers is REFUSED.
//
// Pure state, no canvas, no globals — the shape of game/narrows.js. The hub owns
// the clock and the input; this owns the rules. `rng` is injected so a test can
// pin the jitter.

export const PADDLE_H = 0.14;      // paddle half-height, in court units (0..1)
export const BALL_VX = 0.52;       // horizontal speed: a gentle ~2s crossing
export const BALL_VY_MAX = 0.55;   // her aim never sends it steeper than this
// She aims AT your paddle, but the aim DRIFTS — a slow random walk, not a fixed
// wobble. Tend the rally (nudge the paddle toward the ball) and you re-centre
// under it every time, so it lands forever. Stop tending it and the drift wanders
// past the paddle's edge and the ball slips by. That is what lets "hold still,
// let it pass" end the game AND keeps a played rally endless — the same rule
// serves both. The step is per-return; the bias is clamped so it always stays
// catchable for anyone actually watching.
export const AIM_STEP = 0.075;         // how far the aim wanders each return
export const AIM_BIAS_MAX = 0.30;      // > PADDLE_H, so neglect eventually misses
export const RALLY_WARM = 22;      // rallies to reach full warmth (palette + voice)
export const SERVE_DELAY = 0.9;    // a breath before she serves, so the coin reads

// Her voice, keyed to warmth. Welcoming at first, clinging by the end — the lines
// ARE the exit's signpost: they tell you, in her own register, that you could
// leave and she would rather you didn't. Advances one tier at a time.
export const CALYPSO_VOICE = [
  { at: 0.00, line: 'Rally with me a while. There is no clock on this island.' },
  { at: 0.18, line: 'See? Nothing out there needs you tonight. Nothing at all.' },
  { at: 0.38, line: 'We could do this until the sea forgets your name.' },
  { at: 0.58, line: 'Stay. I will keep it exactly this gentle. Always.' },
  { at: 0.76, line: 'You are thinking of leaving. I can feel it in your hand. Please do not.' },
  { at: 0.92, line: 'Just one more. There is always just one more, if you let there be.' },
];

export function newCalypsoPong() {
  return {
    py: 0.5,                       // your paddle centre (0 top .. 1 bottom)
    ay: 0.5,                       // her paddle centre — tracks the ball, never misses
    ball: { x: 0.5, y: 0.5, vx: -BALL_VX, vy: 0 },   // x: 0 your wall .. 1 hers
    aimBias: 0,                    // the wandering offset she aims off your paddle
    rally: 0,
    warmth: 0,                     // 0..1, drives palette, tone, voice
    serveT: SERVE_DELAY,           // counts down before the opening serve
    served: false,
    leaveArmed: false,             // the opening serve can't count as "leaving"
    over: false,
    outcome: null,                 // 'left' — the only ending there is
    voiceTier: -1,                 // which CALYPSO_VOICE line is showing
    t: 0,                          // frames, for the shimmer
    attract: true,                 // opens on her invitation
    hintT: 0,                      // seconds of rally; the leave-hint fades in slowly
  };
}

// Coin in.
export function calypsoStart(s) {
  if (!s.attract) return false;
  s.attract = false;
  return true;
}

// Move your paddle. dy < 0 up, > 0 down. Clamped to the court.
export function calypsoMove(s, dy) {
  if (s.over || s.attract) return;
  s.py = Math.max(PADDLE_H, Math.min(1 - PADDLE_H, s.py + (dy < 0 ? -1 : 1) * 0.028));
}

// Which voice line should be showing, for the current warmth. Returns the line
// text, or null if the tier has not advanced.
export function calypsoVoice(s) {
  let tier = 0;
  for (let i = 0; i < CALYPSO_VOICE.length; i++) if (s.warmth >= CALYPSO_VOICE[i].at) tier = i;
  return CALYPSO_VOICE[tier];
}

// Advance the rally by dt seconds. Returns 'return' (a paddle sent it back),
// 'left' (it went past you and you are gone), or null.
export function calypsoTick(s, dt, rng = Math.random) {
  if (s.over || s.attract) return null;
  s.t += (dt * 60);

  // The opening breath before she serves.
  if (!s.served) {
    s.serveT -= dt;
    if (s.serveT <= 0) { s.served = true; serveToward(s, s.py); }
    return null;
  }
  s.hintT += dt;

  const b = s.ball;
  b.x += b.vx * dt;
  b.y += b.vy * dt;

  // Top / bottom walls.
  if (b.y < 0) { b.y = -b.y; b.vy = Math.abs(b.vy); }
  else if (b.y > 1) { b.y = 2 - b.y; b.vy = -Math.abs(b.vy); }

  // Her wall (x >= 1): she NEVER misses. Snap her paddle onto it, reflect, and
  // aim the return back at YOUR paddle (with a hair of drift).
  if (b.x >= 1) {
    b.x = 2 - b.x;
    b.vx = -Math.abs(b.vx);
    s.ay = b.y;                                   // she was always there
    s.rally += 1;
    s.warmth = Math.min(1, s.rally / RALLY_WARM);
    s.leaveArmed = true;
    // Wander the aim. Tend the rally and your paddle stays under it; neglect it
    // and this walks the ball off your edge.
    s.aimBias = clamp(s.aimBias + (rng() * 2 - 1) * AIM_STEP, -AIM_BIAS_MAX, AIM_BIAS_MAX);
    aimToward(s, s.py + s.aimBias);
    return 'return';
  }

  // Your wall (x <= 0).
  if (b.x <= 0) {
    if (Math.abs(b.y - s.py) <= PADDLE_H) {
      // You caught it — the rally goes on. A touch of english off the paddle so
      // it feels like yours, though it changes nothing about whether you can win.
      b.x = -b.x;
      b.vx = Math.abs(b.vx);
      b.vy = clamp((b.y - s.py) / PADDLE_H * BALL_VY_MAX, -BALL_VY_MAX, BALL_VY_MAX);
      s.rally += 1;
      s.warmth = Math.min(1, s.rally / RALLY_WARM);
      return 'return';
    }
    // It slipped past. If the rally has begun, that is you choosing to stop.
    if (s.leaveArmed) {
      s.over = true; s.outcome = 'left';
      return 'left';
    }
    // Before the first return (can't really happen after a serve-to-you), just
    // put it back rather than ending on the opening ball.
    b.x = -b.x; b.vx = Math.abs(b.vx);
    return null;
  }

  // Her paddle eases to shadow the ball between contacts, so she reads as alive
  // rather than teleporting onto each return.
  s.ay += (b.y - s.ay) * Math.min(1, dt * 6);
  return null;
}

// She serves from the centre, toward y0 (your paddle), gently.
function serveToward(s, y0) {
  s.ball.x = 0.5; s.ball.y = 0.5;
  s.ball.vx = -BALL_VX;
  aimToward(s, y0);
}

// Set vy so the ball arrives at targetY by the time it reaches your wall. Court
// width is 1 and |vx| is fixed, so travel time is ~1/|vx|; vy = dy / time.
function aimToward(s, targetY) {
  const b = s.ball;
  const ty = clamp(targetY, PADDLE_H, 1 - PADDLE_H);
  const time = 1 / Math.abs(b.vx || BALL_VX);
  b.vy = clamp((ty - b.y) / time, -BALL_VY_MAX, BALL_VY_MAX);
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
