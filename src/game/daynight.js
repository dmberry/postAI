// Day/night clock. Pure logic: tracks elapsed game time, exposes the hour,
// a 1-based day counter, a HUD label, and an ambient light level with smooth
// dawn/dusk ramps. Deterministic given the same sequence of dt values.

const DAWN_START = 5;   // ramp up begins (05:00)
const DAWN_END = 8;     // full daylight (08:00)
const DUSK_START = 18;  // ramp down begins (18:00)
const DUSK_END = 21;    // full night (21:00)
const NIGHT_FLOOR = 0.16;   // ambient light at deep night
const NIGHT_THRESHOLD = 0.4; // below this counts as night
const DEADLINE_DAYS = 7;    // days to defeat the AI before SKYLINK-9000

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
  }

  update(dt) {
    this.elapsed += dt;
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

  // e.g. "Day 2 · 14:30" (24h clock, zero-padded minutes).
  get label() {
    const h = Math.floor(this.hour);
    const m = Math.floor((this.hour - h) * 60);
    const pad = (n) => String(n).padStart(2, '0');
    return `Day ${this.day} · ${pad(h)}:${pad(m)}`;
  }

  // A countdown to doom: DEADLINE_DAYS days before SKYLINK-9000 comes online.
  // Returns whole hours remaining (0 when time is up).
  hoursLeft() {
    return Math.max(0, DEADLINE_DAYS * 24 - this.totalHours);
  }

  get countdownLabel() {
    const total = this.hoursLeft();
    const d = Math.floor(total / 24);
    const h = Math.floor(total % 24);
    const m = Math.floor((total - Math.floor(total)) * 60);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d}d ${pad(h)}:${pad(m)} to SKYLINK`;
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
}
