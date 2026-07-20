// Day/night clock. Pure logic: tracks elapsed game time, exposes the hour,
// a 1-based day counter, a HUD label, and an ambient light level with smooth
// dawn/dusk ramps. Deterministic given the same sequence of dt values.

import { register } from '../engine/systems.js';

const DAWN_START = 5;   // ramp up begins (05:00)
const DAWN_END = 8;     // full daylight (08:00)
const DUSK_START = 18;  // ramp down begins (18:00)
const DUSK_END = 21;    // full night (21:00)
const NIGHT_FLOOR = 0.16;   // ambient light at deep night
const NIGHT_THRESHOLD = 0.4; // below this counts as night
const DEADLINE_DAYS = 1.0;  // 24 hours to defeat the AI before POSEIDON (more to do now)

// Hermite smoothstep: eases 0..1 with zero slope at both ends, so the light
// curve has no kinks at the ramp boundaries.
function smoothstep(t) {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

export class DayNight {
  constructor(dayLengthSeconds = 480, startHour = 9) {
    this.dayLength = dayLengthSeconds; // real seconds per 24 game hours
    this.startHour = startHour;
    this.elapsed = 0; // real seconds since start
    // Self-register as a system (docs/refactor-registry.md), order 20 = the
    // "world clocks" band. Normal-play tick only; the resting fast-forward stays
    // an explicit hub call (the hub keeps the mode gates).
    register({ name: 'daynight', order: 20, update: (w) => this.update(w.dt) });
  }

  update(dt) {
    this.elapsed += dt;
  }

  // Skips the clock forward by a number of *game* minutes (e.g. sleeping)
  // rather than real seconds — converts via the same real-seconds-per-
  // game-hour ratio `update()` uses.
  advance(gameMinutes) {
    this.elapsed += (gameMinutes / 60) * (this.dayLength / 24);
  }

  // Testing helper (the lyre console): jump the clock to a given hour of the
  // current day, so day/night rendering, ambience and the torch veil can be
  // exercised on demand. Rolls to the same hour tomorrow if it lies before the
  // run's start hour, since `elapsed` cannot go negative.
  setHour(targetHour) {
    const h = ((targetHour % 24) + 24) % 24;
    const dayIndex = Math.floor(this.totalHours / 24);
    let total = dayIndex * 24 + h;
    if (total < this.startHour) total += 24;
    this.elapsed = ((total - this.startHour) / 24) * this.dayLength;
  }

  // RON-ML `rewind`: the inverse of advance — claws elapsed game *hours*
  // back out of the clock, pushing the POSEIDON deadline further off.
  // Clamped at `elapsed <= 0` (can't rewind before the run started), which
  // in turn naturally caps hoursLeft() at a full DEADLINE_DAYS*24 — no need
  // for a separate ceiling here.
  rewind(gameHours) {
    this.elapsed = Math.max(0, this.elapsed - (gameHours / 24) * this.dayLength);
  }

  // Total game hours since day 1, 00:00.
  get totalHours() {
    return this.startHour + (this.elapsed / this.dayLength) * 24;
  }

  // Hour of day, 0-24 float.
  get hour() {
    return this.totalHours % 24;
  }

  // 1-based day counter.
  get day() {
    return 1 + Math.floor(this.totalHours / 24);
  }

  // Bare HH:MM of the in-world clock — used to timestamp SMS in the phone thread.
  get clock() {
    const h = Math.floor(this.hour);
    const m = Math.floor((this.hour - h) * 60);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}`;
  }

  // e.g. "Day 2 · 14:30" (24h clock, zero-padded minutes).
  get label() {
    const h = Math.floor(this.hour);
    const m = Math.floor((this.hour - h) * 60);
    const pad = (n) => String(n).padStart(2, '0');
    return `Day ${this.day} · ${pad(h)}:${pad(m)}`;
  }

  // A countdown to doom: DEADLINE_DAYS days before POSEIDON comes online,
  // counted from the moment the run actually started (elapsed game-hours),
  // not from absolute day-clock hour. `totalHours` starts at `startHour`
  // (09:00 by default, for a daylight start) — using it directly here used
  // to shortchange the deadline by that offset (a 24h deadline read as only
  // 15h left at the very start). Returns whole hours remaining (0 at zero).
  hoursLeft() {
    const elapsedHours = this.totalHours - this.startHour;
    return Math.max(0, DEADLINE_DAYS * 24 - elapsedHours);
  }

  get countdownLabel() {
    const total = this.hoursLeft();
    const h = Math.floor(total);
    const m = Math.floor((total - h) * 60);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)} to POSEIDON`;
  }

  // Ambient light 0..1: full through midday, smooth dawn and dusk ramps,
  // a floor at deep night. Continuous everywhere.
  light() {
    const h = this.hour;
    let f = 0;
    if (h >= DAWN_START && h < DAWN_END) {
      f = smoothstep((h - DAWN_START) / (DAWN_END - DAWN_START));
    } else if (h >= DAWN_END && h < DUSK_START) {
      f = 1;
    } else if (h >= DUSK_START && h < DUSK_END) {
      f = smoothstep((DUSK_END - h) / (DUSK_END - DUSK_START));
    }
    return NIGHT_FLOOR + (1 - NIGHT_FLOOR) * f;
  }

  isNight() {
    return this.light() < NIGHT_THRESHOLD;
  }

  // A warm glow that swells and fades across the dawn and dusk ramps (0 at the
  // edges, ~1 in the middle) — the renderer lays a faint rose wash over the
  // world for it. Homer's rhododaktylos eos, rosy-fingered dawn.
  dawnGlow() {
    const h = this.hour;
    const tri = (a, b) => { const t = (h - a) / (b - a); return t < 0 || t > 1 ? 0 : 1 - Math.abs(t - 0.5) * 2; };
    return Math.max(tri(DAWN_START, DAWN_END), tri(DUSK_START, DUSK_END) * 0.8);
  }
}
