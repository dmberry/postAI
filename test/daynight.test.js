// Unit tests for DayNight.setHour — the lyre-console testing hook that jumps the
// clock to day or night so the light ramp, ambience and torch veil can be
// exercised on demand (src/game/daynight.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DayNight } from '../src/game/daynight.js';

test('setHour(12) lands in full daylight; setHour(1) lands in deep night', () => {
  const dn = new DayNight();          // default startHour 9
  dn.setHour(12);
  assert.equal(Math.floor(dn.hour), 12);
  assert.equal(dn.isNight(), false, 'noon is day');
  dn.setHour(1);
  assert.equal(Math.floor(dn.hour), 1);
  assert.equal(dn.isNight(), true, '01:00 is night');
});

test('setHour never drives elapsed negative (hours before the start hour roll forward a day)', () => {
  const dn = new DayNight(480, 9);    // run starts at 09:00
  dn.setHour(2);                      // 02:00 is before 09:00 on day 1
  assert.ok(dn.elapsed >= 0, 'elapsed stays non-negative');
  assert.equal(Math.floor(dn.hour), 2, 'still lands on the requested hour');
});

test('setHour wraps out-of-range hours into 0..24', () => {
  const dn = new DayNight();
  dn.setHour(25);
  assert.equal(Math.floor(dn.hour), 1);
  dn.setHour(-1);
  assert.equal(Math.floor(dn.hour), 23);
});
