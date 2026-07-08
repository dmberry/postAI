# Fortress Stage 3 — the guarded core (design)

Design for the guard/stealth layer of Adamantine's fortress, ahead of the core
confrontation (Stage 4). Draft for review — nothing here is built yet except
the quad and its muster points (Stage 3a, done).

## 1. The experience

You come out of the maze into the **quad** — an open paved killing-ground with
low cover scattered across it, the ADAMANTINE core at the far end. The quad is
patrolled by **M6 guards** (M5 is the phalanx-formation type; M6 is the elite
sentinel). Small **factories flank the core**, dormant.

The whole stage is a stealth problem. You *want* to cross the quad and reach the
core without the fortress realising it's been breached:

- **Undiscovered** → the factories stay cold, only the standing patrol is in your
  way, and you can pick a route through cover.
- **Discovered** (the alarm trips) → the core factories wake and pump **M6 waves**
  into the quad. It becomes a fight you're unlikely to win by attrition.

So the tension your design asks for: **move unseen, and when you must kill, kill
fast — before the guard reports the breach.**

## 2. The M6 guard

A heavy armoured sentinel, tougher than a W1. Proposed:

| Property | Value (proposed) | Note |
|---|---|---|
| HP | ~24 (W1 is lighter) | takes several hits; one electro-gun shot still destroys it outright |
| Attack | melee strike, high damage | a heavy hitter up close; knockback like other melee |
| Move | matches your walk (like T2) | can't be simply outrun |
| Vision | LOS + range ~9 + facing cone | needs a clear line; cover and corners break it |
| Battery | yes | drainable; **not reprogrammable** (hardened) — drop it or scrap it |
| Drops | scrap + chip fragments | same salvage economy as other machines |
| Look | armoured biped with a single **scanning eye** (a slow-sweeping glow — through `texturedGlow`, per the art rule) | the eye colour flips amber→red when it goes alert |

Patrols a loop between the quad **muster points** (already placed) and
investigates the last place it saw/heard you.

## 3. Detection, the report delay, and the alarm

The core mechanic. Three states per guard: **PATROL → ALERT → REPORTING**.

- **Sees you** (LOS + range + within its facing cone) **or is attacked** →
  goes **ALERT**: turns to face, closes in, and starts a **report timer**
  (~3.5s). The eye flares red; a small "reporting…" tick shows over it.
- **REPORTING**: if the timer runs out while the guard is still alive, it
  **reports the breach → the alarm trips** (fortress-wide, permanent for the
  run). If you **destroy it before the timer expires**, the breach goes
  unreported. Breaking line of sight and getting away also lets a lone guard
  lose you and stand down (its timer resets) — but a guard that already saw you
  will hunt toward your last position first.
- The report delay is what makes speed matter: an **electro-gun** shot destroys
  a guard in one hit, so you can silence an alerted guard inside its window. A
  **bow** one-shot (silent, ranged) is the other clean kill. A slow melee trade
  is exactly what trips the alarm.

**Alarm raised** = "breach discovered". Once tripped it stays up (proposed:
permanent for the run; open question below). A HUD banner + line announces it.

## 4. The core factories

Small foundries (proposed **3**) set around the core's sanctum, dormant until the
alarm.

- **On alarm**: they activate and dispatch **M6 waves** into the quad on a clock,
  escalating over time (same shape as the W-factory's wave logic, reusing that
  machinery where possible).
- **Destructible**: hammer one down (damage bar, like the W-factory) and it stops
  contributing waves. Taking all of them down caps the reinforcement flood — a
  way to make an alarmed run still winnable, and a natural bridge into the core
  assault.
- They're *inside* the fortress, unlike the single overworld W-factory — this is
  the fortress's own production, as specified.

## 5. Stealth tools (all existing, repurposed)

- **Cover** — the quad's low pillars break line of sight. Move corner to corner.
- **Electro-gun** — one-shot destroy = the silent kill inside the report window.
  The intended answer to a guard that's spotted you.
- **Bow** — silent, ranged, high single-hit: pick a lone guard off before it's in
  cone range of you.
- **Wi-Fi block** — jams sensors: while active, guards **can't acquire you by
  vision** (they can still react to being attacked). Turns a loud run into a
  viable ghost run; drains battery, so it's a resource.
- **Night** — optional: reduce vision range at night, rewarding timing.

## 6. Architecture

Recommended: **reuse `robots.js`** by adding an `m6` machine type, so it inherits
line-of-sight, movement, melee combat, damage, death, salvage, and the draw hook
for free (consistent with T/W machines). Keep the addition to one surgical type
block.

Fortress-specific orchestration lives in **`fortress.js`** (mine, uncontended):
the controller holds the `alarm` state and per-guard report timers, owns the core
factories, and dispatches M6 waves via the robot spawn API. `main.js` already
runs `updateRobots`; `fortress.update` gains the alarm/factory tick.

Trade-off: `robots.js` is the parallel session's territory too — the M6 type
block must stay small and coordinated. Alternative if we want zero contention: a
self-contained `guards.js` that re-implements patrol/detect/combat/draw. More
code, fully isolated. **Recommendation: reuse `robots.js`.**

## 7. Build order (sub-slices, each verifiable)

1. **3b-1 M6 patrol — DONE (2026-07-08).** `m6`/`m6r` types in robots.js (constants,
   `spawnM6`, `updateM6` with sight-only acquisition via `m6Sees` — LOS + range 9 +
   forward cone; melee sentinel + W4-pattern marksman), gunmetal/violet body tints
   via the drawT2 colour table, `hardened` flag + sealed-firmware refusal in
   `player.read()`, `fortress.spawnGuards` seats 3+2 at the muster points (wired in
   main.js). Verified live: front acquisition <1.5s, no acquisition standing 3
   tiles behind, guards lethal (test player killed), no console errors. Note: went
   straight to vision-based acquisition here, so 3b-2 is just the report
   timer/alarm orchestration in fortress.update.
2. **3b-2 Detection + alarm** — vision cone, ALERT/REPORTING states, report timer,
   fortress `alarm` flag, HUD banner. *Verify: seen → timer → alarm; fast kill →
   stays silent; break LOS → stand down.*
3. **3b-3 Core factories** — dormant foundries that wake on alarm and pump
   escalating M6 waves; destructible to stop them. *Verify: alarm → waves; kill a
   factory → its waves stop.*
4. **3b-4 Stealth pass** — Wi-Fi block jams M6 vision; electro-gun/bow one-shot
   confirmed; night vision falloff; balance. *Verify: a clean ghost run is
   possible, and a loud run is punishing but survivable.*

Then **Stage 4** — the core confrontation (Adamantine speaks; break it → "1 of 4").

## 8. Decisions (David, 2026-07-08)

1. **M6 behaviour — both.** Two variants: the **M6** heavy melee sentinel and the
   **M6r** ranged marksman (laser, holds distance like a W4 but with the same
   vision/report discipline). Patrols mix them.
2. **Not reprogrammable** — hardened elites; drain them and they're only scrap.
3. **Alarm stands down.** After a long quiet spell (~90s game-time with no guard
   seeing you and no attacks), the fortress decides the breach is contained: the
   factories go back to sleep and patrols resume. A botched run is recoverable —
   hide, wait it out.
4. **Standing patrol ~4–5** across the quad before any alarm.
5. **Three factories, and killing them is REQUIRED.** While any factory stands,
   the core is shielded (its damage bar won't move — drawn with a shield shimmer).
   Destroy all three to drop the shield and open the core to attack. Factories
   only *produce* while the alarm is up, but they can be attacked at any time.
6. **A breach stirs the world, via a red uplink.** A distinct **red uplink**
   (an obelisk-like mast) stands in the fortress by the core, wiring Adamantine
   into the wider SKYLINK. When the alarm trips *and the uplink still stands*,
   the world is stirred: the overworld obelisks **flare red** (alert), and the
   W-factory (if standing) dispatches a W4 toward the fortress doorway. **The
   HUD/countdown does NOT change colour** — only the obelisks and the uplink
   glow red. **Destroy the uplink and the fortress is cut off**: a breach no
   longer reaches the world (obelisks return to normal, no W4). The guards and
   core factories are the fortress's own and still respond locally.

## 9. The maze way-out (done, 2026-07-08)

Solve the maze (break through into the quad) and the floor lights a green,
textured, flowing trail along the solution path so you can retrace your way back
out without re-solving it. Shortest-path BFS over the maze's open tiles computed
at build time (`map.mazeGuide`), lit on first quad entry (`map.mazeGuideLit`),
drawn as per-tile floor studs in `drawFloor`. Green so it never reads as danger.
