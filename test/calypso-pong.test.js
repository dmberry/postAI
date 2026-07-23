// CALYPSO's pong — the game you cannot win. The invariants are the argument:
// she never misses, a tended rally is endless, and the ONLY ending is that you
// chose to leave. Pure rules, no canvas — the narrows pattern.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newCalypsoPong, calypsoStart, calypsoMove, calypsoTick, calypsoVoice,
  PADDLE_H, RALLY_WARM, CALYPSO_VOICE,
} from '../src/game/calypso-pong.js';

const DT = 1 / 60;
const seeded = (seed) => { let k = seed; return () => ((k = (k * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); };

// Start a run with the coin in and the opening serve already away.
function started(rng = Math.random) {
  const s = newCalypsoPong();
  calypsoStart(s);
  s.serveT = 0;                       // skip the serve breath
  calypsoTick(s, DT, rng);            // fire the serve
  return s;
}

// A perfect player: track the ball's y with the paddle every frame.
function track(s) {
  if (s.ball.y < s.py - 0.01) calypsoMove(s, -1);
  else if (s.ball.y > s.py + 0.01) calypsoMove(s, +1);
}

test('the cabinet waits for a coin', () => {
  const s = newCalypsoPong();
  assert.equal(s.attract, true);
  assert.equal(calypsoTick(s, DT), null, 'no rally without a coin');
  assert.equal(calypsoStart(s), true);
  assert.equal(calypsoStart(s), false, 'a second coin does nothing');
});

test('SHE NEVER MISSES: the ball never passes her wall', () => {
  const rng = seeded(7);
  const s = started(rng);
  let herMisses = 0;
  for (let i = 0; i < 4000 && !s.over; i++) {
    track(s);                          // keep the rally alive on your side
    calypsoTick(s, DT, rng);
    if (s.ball.x > 1.0001) herMisses += 1;   // would mean the ball got past her
  }
  assert.equal(herMisses, 0, 'the ball escaped past Calypso — she is supposed to be a wall');
});

test('A TENDED RALLY IS ENDLESS: you cannot win by playing well', () => {
  // The whole point: perfect play does not end it. Only leaving does.
  const rng = seeded(11);
  const s = started(rng);
  for (let i = 0; i < 6000 && !s.over; i++) { track(s); calypsoTick(s, DT, rng); }
  assert.equal(s.over, false, 'a perfectly tended rally ended on its own — it must not');
  assert.ok(s.rally > 30, `expected a long rally, got ${s.rally}`);
  assert.equal(s.warmth, 1, 'and it should have warmed all the way');
});

test('THE ONLY EXIT IS LEAVING: steer away and let it pass', () => {
  const rng = seeded(3);
  const s = started(rng);
  // rally a little so the ending is a choice, not the opening ball
  for (let i = 0; i < 400 && s.rally < 4; i++) { track(s); calypsoTick(s, DT, rng); }
  assert.ok(s.leaveArmed, 'the rally should have armed the exit');
  // now refuse: jam the paddle to one wall and never chase the ball again
  let ev = null;
  for (let i = 0; i < 1200 && !ev; i++) {
    calypsoMove(s, -1);                // hold hard against the top
    ev = calypsoTick(s, DT, rng);
    if (ev === 'return') ev = null;    // ignore returns; wait for the ball to slip past
  }
  assert.equal(ev, 'left');
  assert.equal(s.over, true);
  assert.equal(s.outcome, 'left', 'the only outcome there is');
});

test('holding still eventually lets it past too (the drift stacks up)', () => {
  // "Hold still, let the ball past you." A player who stops tending the rally —
  // never touches the helm at all — drifts to a leave rather than rallying to
  // the heat-death of the universe.
  const rng = seeded(99);
  const s = started(rng);
  let ev = null;
  for (let i = 0; i < 20000 && !ev; i++) {
    ev = calypsoTick(s, DT, rng);      // no calypsoMove at all
    if (ev !== 'left') ev = null;
  }
  assert.equal(ev, 'left', 'a totally untended rally never slipped past — the drift is too weak');
});

test('the opening serve cannot count as leaving', () => {
  const s = newCalypsoPong();
  calypsoStart(s);
  // let the serve travel to your wall without you ever having returned anything
  let leftEarly = false;
  for (let i = 0; i < 200 && !s.leaveArmed; i++) {
    calypsoMove(s, -1);                // hold away from centre so the serve could pass
    if (calypsoTick(s, DT, () => 0.5) === 'left') leftEarly = true;
  }
  assert.equal(leftEarly, false, 'the very first ball ended the game before a rally existed');
});

test('warmth rises with the rally, monotonically to 1', () => {
  const rng = seeded(5);
  const s = started(rng);
  let last = 0;
  for (let i = 0; i < 4000 && s.warmth < 1; i++) {
    track(s);
    calypsoTick(s, DT, rng);
    assert.ok(s.warmth >= last, 'warmth went backwards');
    last = s.warmth;
  }
  assert.equal(s.warmth, 1);
  assert.ok(s.rally >= RALLY_WARM);
});

test('her voice climbs from welcome to clinging as it warms', () => {
  const s = newCalypsoPong();
  s.warmth = 0;
  assert.equal(calypsoVoice(s).line, CALYPSO_VOICE[0].line, 'opens welcoming');
  s.warmth = 1;
  assert.equal(calypsoVoice(s).line, CALYPSO_VOICE[CALYPSO_VOICE.length - 1].line, 'ends pleading');
});

test('a finished game ignores further input and ticks', () => {
  const s = started(seeded(1));
  s.over = true; s.outcome = 'left';
  const py = s.py;
  calypsoMove(s, +1);
  assert.equal(s.py, py);
  assert.equal(calypsoTick(s, DT), null);
});
