// Unit tests for the Scylla/Charybdis arcade run (src/game/narrows.js). Pure
// rules, so no canvas — same deal as snake and strait.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newNarrowsRun, narrowsSteer, narrowsTick, narrowsProgress,
  narrowsStart, narrowsCalm, narrowsPressure,
  NARROWS_W, SHIP_ROW, RUN_ROWS, TOTAL_ROWS, WARMUP_ROWS,
  SCYLLA_MAX, CHARYBDIS_MAX, SAFE_LANE, MONSTERS,
} from '../src/game/narrows.js';

const never = () => 0.99;   // rng that never surfaces anything
const always = () => 0.0;   // rng that surfaces both, as deep as they go

// Most tests are about the DANGEROUS part of the passage, so they start a run
// with the coin in and the open-water run-in already behind them.
const started = (rng) => { const s = newNarrowsRun(rng); narrowsStart(s); s.warmup = 0; return s; };
const clear = (s) => { s.rows.forEach((r) => { r.l = 0; r.r = 0; r.rock = -1; }); };

test('THE LANE INVARIANT: the two of them can never seal the channel', () => {
  // If Scylla at her deepest and Charybdis at hers could meet, a row would be a
  // wall and the run would be luck rather than steering. Checked as arithmetic
  // AND against the generator at its most aggressive.
  assert.ok(SCYLLA_MAX + CHARYBDIS_MAX + SAFE_LANE <= NARROWS_W,
    `${SCYLLA_MAX} + ${CHARYBDIS_MAX} + ${SAFE_LANE} must fit in ${NARROWS_W}`);
  const s = started(always);
  let worstGap = NARROWS_W;
  for (let i = 0; i < 400 && !s.over; i++) {
    s.x = 6;                                  // never actually touch anything
    narrowsTick(s, always);
    for (const row of s.rows) worstGap = Math.min(worstGap, NARROWS_W - row.l - row.r);
  }
  assert.ok(worstGap >= SAFE_LANE, `every row must leave ${SAFE_LANE} clear; worst was ${worstGap}`);
});

test('PARKING IS NOT A STRATEGY: sitting mid-channel must not survive the run', () => {
  // The bug this exists to prevent: Scylla reaches at most SCYLLA_MAX and
  // Charybdis at most CHARYBDIS_MAX, so the seam between them was permanently
  // safe water. You could hold one column for two minutes, never touch the helm
  // and win. Rocks sit IN that seam precisely so the safe lane has to be earned.
  let survivedParked = 0;
  for (let seed = 0; seed < 12; seed++) {
    let k = seed * 977 + 13;
    const rng = () => ((k = (k * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const s = started(rng);
    let hit = false;
    for (let i = 0; i < 600 && !s.over; i++) {
      // never steer: the whole point is that doing nothing must not be safe
      if (narrowsTick(s, rng)) hit = true;
    }
    if (!hit) survivedParked += 1;
  }
  assert.equal(survivedParked, 0,
    `a parked ship came through untouched in ${survivedParked}/12 runs — the seam is still free`);
});

test('a rock is always dodgeable: every row keeps a clear column', () => {
  const s = started(always);
  for (let i = 0; i < 400 && !s.over; i++) {
    s.x = 6;
    narrowsTick(s, always);
    for (const row of s.rows) {
      let free = 0;
      for (let c = 0; c < NARROWS_W; c++) {
        const blocked = c < row.l || c >= NARROWS_W - row.r || c === row.rock;
        if (!blocked) free += 1;
      }
      assert.ok(free >= 1, `a row with no way through: l=${row.l} r=${row.r} rock=${row.rock}`);
    }
  }
});

test('striking a rock costs you but does not end the run', () => {
  const s = started(never);
  clear(s);
  s.rows[SHIP_ROW - 1] = { l: 0, r: 0, rock: 6 };
  s.x = 6;
  assert.equal(narrowsTick(s, never), 'rock');
  assert.equal(s.rocks, 1);
  assert.equal(s.over, false);
});

test('both monsters are named', () => {
  assert.equal(MONSTERS.scylla.name, 'SCYLLA');
  assert.equal(MONSTERS.charybdis.name, 'CHARYBDIS');
  assert.equal(MONSTERS.scylla.side, 'left');
  assert.equal(MONSTERS.charybdis.side, 'right');
});

test('SCYLLA surfaces on the left and takes one thing, and the run goes on', () => {
  const s = started(never);
  clear(s);
  s.rows[SHIP_ROW - 1] = { l: 5, r: 0 };
  s.x = 2;                                    // inside her reach
  assert.equal(narrowsTick(s, never), 'bite');
  assert.equal(s.bites, 1);
  assert.equal(s.over, false, 'she nibbles; she does not end it');
});

test('CHARYBDIS surfaces on the right and ends the voyage', () => {
  const s = started(never);
  clear(s);
  s.rows[SHIP_ROW - 1] = { l: 0, r: 4 };
  s.x = NARROWS_W - 1;                        // inside her reach
  assert.equal(narrowsTick(s, never), 'swallowed');
  assert.equal(s.over, true);
  assert.equal(s.outcome, 'swallowed');
});

test('the grace period never shields you from Charybdis', () => {
  // Being freshly bitten by Scylla must not buy a free pass through the thing
  // that ends the run — that would be the wrong lesson entirely.
  const s = started(never);
  clear(s);
  s.grace = 4;                                // just been bitten
  s.rows[SHIP_ROW - 1] = { l: 0, r: 4 };
  s.x = NARROWS_W - 1;
  assert.equal(narrowsTick(s, never), 'swallowed');
});

test('steering between them is always possible: the seam is sailable', () => {
  const s = started(never);
  clear(s);
  s.rows[SHIP_ROW - 1] = { l: SCYLLA_MAX, r: CHARYBDIS_MAX };
  s.x = SCYLLA_MAX;                           // first clear column past Scylla
  assert.equal(narrowsTick(s, never), null, 'the seam is clear water');
  assert.equal(s.over, false);
});

test('bites accumulate rather than ending it', () => {
  const s = started(never);
  s.x = 0;
  let bites = 0;
  for (let i = 0; i < 200 && !s.over; i++) {
    s.rows[SHIP_ROW - 1] = { l: 5, r: 0 };
    if (narrowsTick(s, never) === 'bite') bites += 1;
  }
  assert.ok(bites > 3, `expected repeated bites, got ${bites}`);
  assert.equal(s.over, false, 'still afloat after a long mauling');
});

test('the grace period stops one head taking everything at once', () => {
  const s = started(never);
  clear(s);
  s.x = 0;
  s.rows[SHIP_ROW - 1] = { l: 5, r: 0 };
  assert.equal(narrowsTick(s, never), 'bite');
  s.rows[SHIP_ROW - 1] = { l: 5, r: 0 };
  assert.equal(narrowsTick(s, never), null, 'still in grace');
  assert.equal(s.bites, 1);
});

test('THE RUN-IN: you come up to the narrows on open water', () => {
  const s = newNarrowsRun();
  narrowsStart(s);
  assert.ok(narrowsCalm(s), 'opens calm');
  assert.ok(s.rows.every((r) => r.l === 0 && r.r === 0), 'and on genuinely open water');
  let touched = 0;
  for (let i = 0; i < WARMUP_ROWS; i++) {
    s.x = 0;                                   // hard against the wall: still safe
    if (narrowsTick(s, always)) touched += 1;
  }
  assert.equal(touched, 0, 'nothing reaches you during the run-in');
  assert.equal(narrowsCalm(s), false, 'and then the channel closes');
});

test('the cabinet waits for a coin', () => {
  const s = newNarrowsRun();
  assert.equal(s.attract, true);
  const left = s.rowsLeft;
  assert.equal(narrowsTick(s, never), null, 'no tick without a coin');
  assert.equal(s.rowsLeft, left);
  narrowsSteer(s, +1);
  assert.equal(s.x, 6, 'the helm is dead too');
  assert.equal(narrowsStart(s), true);
  assert.equal(narrowsStart(s), false, 'a second coin does nothing');
});

test('the passage is long enough to be a game, and gets harder', () => {
  // "A couple of minutes" at the hub's ~0.1s tick.
  assert.ok(TOTAL_ROWS * 0.11 >= 110, `passage is only ${Math.round(TOTAL_ROWS * 0.11)}s`);
  const s = started(never);
  s.rowsLeft = TOTAL_ROWS;
  const early = narrowsPressure(s);
  s.rowsLeft = WARMUP_ROWS + Math.round(RUN_ROWS * 0.1);
  const late = narrowsPressure(s);
  assert.ok(late > early, 'the channel thickens as you go');
});

test('the helm is clamped to the channel', () => {
  const s = started(never);
  for (let i = 0; i < 60; i++) narrowsSteer(s, -1);
  assert.equal(s.x, 0);
  for (let i = 0; i < 60; i++) narrowsSteer(s, +1);
  assert.equal(s.x, NARROWS_W - 1);
});

test('a finished run ignores further steering and ticks', () => {
  const s = started(never);
  s.over = true; s.outcome = 'through';
  const x = s.x;
  narrowsSteer(s, +1);
  assert.equal(s.x, x);
  assert.equal(narrowsTick(s, never), null);
});

test('progress runs 0 to 1 across the passage', () => {
  const s = started(never);
  s.rowsLeft = TOTAL_ROWS;
  assert.equal(narrowsProgress(s), 0);
  s.x = 6;
  for (let i = 0; i < TOTAL_ROWS && !s.over; i++) { clear(s); narrowsTick(s, never); }
  assert.equal(s.outcome, 'through');
  assert.equal(narrowsProgress(s), 1);
});
