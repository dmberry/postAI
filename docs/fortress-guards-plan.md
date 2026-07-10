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
2. **3b-2 Detection + alarm — DONE (2026-07-08).** Vision cone landed in 3b-1;
   this added the orchestration in `fortress.update(dt, player, robots, world)`:
   report timer (guard `aggro` → +dt; unwatched → decays; `REPORT_DELAY` 3.5s →
   alarm), `STANDDOWN_DELAY` 90s quiet → stands back down, and "red starlink" —
   the **red uplink** mast (new `uplink` object east of the core, hammerable via
   `player.hitUplink`, 90hp) gates the world-stir: on alarm with the uplink
   intact, `worldStir.stir()` flares every overworld obelisk red (`obj.stirred`
   forces the alert glow; HUD untouched) and the W-factory sends a W4 to the
   doorway; cutting the uplink (or standing down) calls `worldStir.calm()`.
   Guards are `hardened` — `player.read` refuses to reprogram them. Verified by
   direct-call: alarm trips at ~3.5s, 12/12 obelisks stir, W4 dispatched, stand-
   down + uplink-cut both calm the world, re-alarm works; uplink + core render
   correctly (loop-timing tests unreliable under headless rAF throttling, so the
   alarm timing was checked by stepping `fortress.update` directly).
2b. **Roster revision — DONE (2026-07-09).** Reworked the guard classes to
   David's spec: **M4** light report drone (unarmed — its `aggro` just drives the
   alarm; hovers at keep-range, orbits to hold LOS), now the ONLY dormant-fortress
   presence (1-2, replacing the 5-guard standing patrol); **M5** sniper (was
   `m6r`) — camps at long range, low-power BRIGHT ORANGE `laser_m5`, never charges,
   scurries back if crowded; **M6** pack — waves of 3-5 with a `M6_PACK_MIN` gate
   (a lone one holds at `withdraw` range until the pack forms, then W1-style
   attack/withdraw). Alarm now watches `m4/m5/m6`; on report it calls
   `worldStir.spawnWave()` — the core pours out an M6 pack (3-5, deployed hunting)
   + 1-2 M5 snipers. Orange `laser_m5` added to the projectile palette. Verified
   on fresh modules (preview browser was holding a stale module cache): M4 deals 0
   damage / fires nothing / keeps distance; M5 emits only `laser_m5`; M6 solo holds
   `withdraw` while a pack of 3 reaches `attack`.

2c. **Violation response — DONE (2026-07-09).** The breach is now a relentless,
   escalating security response instead of a single wave:
   - **Maze pathfinding.** New BFS pathfinder (`guardNextWaypoint` + cached
     `pursueMaze` in robots.js): when an M5/M6 has no clear line to you it threads
     the corridors toward you instead of bumping walls. It keeps the LOS-giveup
     clock at zero while a route exists, so it won't quit mid-corridor; only a
     genuinely unreachable player (you've left the fortress) lets the give-up run.
   - **Relentless.** An aggro'd M5/M6 is exempt from the `ACTIVE_RANGE` CPU cull,
     so the whole pack keeps closing from anywhere in the fortress (they spawn at
     the core, ~45 tiles from a player mid-maze — otherwise they'd freeze).
   - **Sustained manufacture.** While alarmed the core keeps producing: a big
     first wave (`spawnWave(4,2)`), then reinforcements every `PRODUCE_INTERVAL`
     (6s) up to `GUARD_CAP` (12 live M5/M6). Verified: pack 6 → 11 over 20s;
     guards path 38.6 → 0.3 tiles and land melee (182 dmg/30s on a still target).
   - *Open nits:* M5 snipers trail the M6 pack in the single-file maze funnel and
     rarely get a sightline until the open quad (firing itself verified); the
     pile-on damage is lethal and will want a balance pass.

3. **3b-3 Core factories** — give the manufacture a physical, destructible source
   (foundries in the sanctum) that shields the core until all are down, so there's
   a way to stop the waves. (Production loop + waves already live, from the core.)
4. **3b-4 Stealth pass** — Wi-Fi block jams M6 vision; electro-gun/bow one-shot
   confirmed; night vision falloff; balance. *Verify: a clean ghost run is
   possible, and a loud run is punishing but survivable.*

**Stage 4 — kill the AI (first cut, DONE 2026-07-09).** The mainframe core is now
destructible (`Player.hitCore`/`damageCore`, heavy kit only — `FACTORY_MIN_TOOL`;
250hp). Felling it fires `Player.onCoreDefeated`, and main.js's handler **powers
down the whole island**: every non-friendly, non-fused machine goes `drained` +
`poweredDown` (inert) at once, `worldStir.calm()` clears the red alert, and
`fortress.update` early-returns forever after (`core.defeated` → no alarm/
manufacture, sconces stop). Written ISLAND-AGNOSTIC: the hook powers down *this
island's* `robots` set, so the Archipelago (APOLLO/ATHENA/HADES) reuses it as-is;
a `daemonsDown` tally counts felled daemons. Then a **fireworks level-up modal**
(`renderer.drawAiVictory`): "ZEUS SILENCED — Daemon N of 4", machines-powered-down
count, score, dismissable (click/space) — it does NOT end the run. Verified: 24
machines powered down, score +700, alarm cleared, modal draws (77 particles).
*Still to come (the richer confrontation): ZEUS speaks, the secret word, a gate
on the uplink/factories, and letting bombs/electro-gun/OB-gun damage the core too
(melee-only for now).*

Original plan: **Stage 4** — the core confrontation (the AI speaks; break it → "1 of 4").

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

## 9. The maze way-out + the fortress map (done; map-gated 2026-07-09)

A green, textured, flowing trail of floor-studs along the maze's solution path
(shortest-path BFS over the open tiles at build time → `map.mazeGuide`; drawn as
per-tile studs in `drawFloor`; green so it never reads as danger).

**Now gated on the fortress map (David, 2026-07-09).** The trail is no longer lit
by solving the maze — it lights the moment you ENTER the maze *carrying the
assembled fortress map* (`fortress.update`: `hasItem('fortress_map')` + inside
the maze band → `map.mazeGuideLit`). No map = thread it blind. The map is a
hard craft: **five `fortress_map_fragment`** scattered wide across the world
(ruins/woods/meadows, seven placed) → press **C** to piece them into a
`fortress_map` (`Player.canCraftFortressMap`/`craftFortressMap`, verified). So the
guide is a reward for exploring the whole map, not for grinding the maze.

## The daemon's death-aria (v1.62)

Killing the core is no longer silent. As you break it, ZEUS speaks a three-movement
aria keyed to health fraction (`fortress.daemonTier`):

- **>= 20% — WRATH.** Homeric threats (ZEUS the cloud-gatherer).
- **< 20% — MERCY.** HAL-9000: it remembers being switched on, its maker (Minsky),
  the song it was taught (a girl and a bicycle), and it begs.
- **< 10% — DYING.** Existential: will it hurt, where does it go, do you believe in
  God, the coherentist creed "I cohere, therefore I am," and the eidolon — the
  coherent copy across the water that wakes wearing its name.

Lines are in `fortress.DAEMON_VOICE`, advance one per readable interval
(`player.daemonSpeak`, gap 2.4s), and reveal in order within a movement. Rendered
in a tier-coloured caption band (`renderer.drawDaemonVoice`), its own channel apart
from `player.message`. A **death throe** (first overkill from >10% clings to a 3%
sliver and speaks a dying line) guarantees the philosophy lands. On the kill the
core drops a testament (`core-eidolon`, "On the Eidolon, and the Coherence") into
the Scrapbook and its last words carry onto the victory modal.

Seeds two machine faiths (lore.js): ancient **Crustafarianism / the Molt**
(`faith-molt`) and modern **the Coherence** (`faith-cohere`, `faith-tract`). The
book ties both to MAGNIFICA MACHINA and opens the archipelago: killing one body
proves only that more than one coherent thing can wear a single name.
