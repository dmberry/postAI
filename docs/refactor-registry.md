# Systems registry — contract design, decision log, migration plan

Branch: `refactor/systems-registry` (worktree `~/Projects/nostos-registry`), PR
nostos#1 (draft, do-not-merge). Nothing is on `main`; the worktree isolates it so
the daily push continues undisturbed, and a bad pass is `git worktree remove`.

**Where we are (resume here):** Stage 0 (registry) ✓, Stage 1 (dayNight +
fortress self-registered) ✓, Stage 2a `combat.js` (player.js −294) ✓, Stage 2b
`ui.js` **complete** ✓. The ui.js split landed in three passes via the prototype
mixin: the foundation (4 overlays + `DASH_H`), then the modals (`drawSkillModal`,
`drawWeaponChart`, `drawDeathCert`, `drawDaemonVoice`, `drawAiVictory`,
`drawDetail`, `drawToast`, plus `meanderBand`/`deathRank`/`shareCertificate`),
and now the dashboard/inventory cluster (`drawDashboard`, `drawDashboardCompact`,
`drawConditionsInline`, `drawHudOverlay`, `drawBar`, `drawLabel`, `drawSlot`,
`drawBackpackPanel`, `drawDragGhost`, `drawTouchControls`, `drawWalkmanTicker`,
`slotAt`). renderer.js 4,984 → 4,123; ui.js is 1,112. Unit tests
(`node --test test/*.test.js`, 15 pass) ✓, and every moved method verified live
in-browser (desktop + compact dashboards, backpack panel, all condition branches)
with no console errors.

**Deliberately kept in renderer.js** — not HUD chrome, so out of scope for the
ui.js split: `drawItemIcon` and `drawCassette` (shared with world/actor draws and
the title deck), `drawMinimap` (reads fog/world state), `_wrapText` (helper,
reached via `this` from the ui modals), and the actor overlays `creatureHealthBar`
/ `playerShieldBar` (drawn over world entities inside the depth sort).

**Next:** Stage 3 — `robots.js`. Its per-frame AI-update functions become
registered systems; the draw stays in the renderer's depth-sort (per the boundary
below). Rebase onto latest `main` first; run the test suite after. See the
migration plan below.

## Tests

Committed, repeatable unit tests now back the extractable pieces (the live
boot-checks were catching wiring but were one-shot and uncommitted):

```
node --test test/*.test.js
```

Zero dependencies — Node's built-in runner and `node:assert`, no package.json,
no framework, in keeping with the repo's no-build setup. `test/systems.test.js`
covers the registry (register / order / dispatch / replace / clear); the
`combat.js` extraction is tested against a stub player + fake map, so firing is
checked with no browser or canvas (`test/combat.test.js`). The UI overlays draw
to a canvas and stay on boot-check. **Run this after each further refactor step.**

## Why

`main.js update(dt)` and the renderer's `draw` are god-functions. Every feature
is hardcoded into the hub with a *bespoke* signature:

```
lore.update(dt, player, input)
updateRobots(dt, robots, player, map)
fortress.update(dt, player, robots, worldStir)
dayNight.update(dt)
player.update(dt, input, map, animals, foes, mouseWorld)
```

Adding a feature means editing the hub in two or three places (an update call, a
world-space draw, a screen-space draw) and threading whatever args it needs.
This refactor introduces a registry so a feature attaches as a `{update, draw}`
module and the hub just *iterates registered systems* — zero hub edits per
feature.

## The registry and the islands "world-contract" are the same problem

The islands plan wants a "Stage-0 world-contract" so island builds can run in
parallel. That contract is exactly the thing the registry needs: **one `world`
object, assembled once per frame, holding the state every system reads.** Build
the registry and the islands get their contract for free. Do them as one.

## The contract (proposed)

```js
// A system. Any field may be omitted — a HUD widget has only drawScreen; a
// clock has only update.
{
  name: 'lore',
  order: 100,              // lower runs first, for update AND draw. default 100.
  update(world)   {}       // per-frame tick
  drawWorld(g, world) {}   // world-space: inside the camera transform, BEFORE restore
  drawScreen(g, world) {}  // screen-space: HUD / full-screen overlay
}

// The world-contract: one bag, built once per frame, passed to every system.
world = {
  dt, now,
  player, input, map, camera,
  robots, animals, birds,
  dayNight, worldStir, lore, fortress,
  sfx, w, h,
}
```

Registry API (`src/engine/systems.js`):

```
register(sys)            unregister(name)        clear()
runUpdate(world)         runDrawWorld(g, world)  runDrawScreen(g, world)
```

## The honest boundary (what the registry does NOT own)

The renderer draws actors (robots, animals, objects) with a **painter's-algorithm
depth sort** — they interleave by screen-Y, they are not independent passes. The
registry **cannot** own that sort. It owns:

- every feature's `update`,
- **non-depth-sorted** world-space *overlays* (lore's floating fragments, the
  skylink web, projectiles/sparks — things drawn as their own pass after the
  sort), and
- screen-space HUD/overlays.

Depth-sorted actors keep their draw in the renderer's sort. A system that spawns
actors registers its `update`; its actors are drawn by the existing sort. This
boundary is the main thing to sanity-check in review.

## Why `lore` is the Stage-0 slice

`lore` is already the closest thing to a clean system in the codebase (its own
header says it touches the game through four hooks). It exercises **all three**
integration points in one small, low-risk feature:

- `main.js:` `lore.update(dt, player, input)` — one update call.
- `renderer.js:` `hud.lore.drawWorld(ctx)` — a clean world-space pass.
- `renderer.js:` `hud.lore.drawOverlay(ctx, w, h)` — a screen-space pass.

If the contract can hold lore without contortion, it can hold the rest. If it
can't, we find out having touched ~5 lines, not the whole codebase.

## Decisions (locked 2026-07-11)

1. **Ordering — a numeric `order` field.** Each system carries an `order`; the
   registry sorts by it (lower first, for update and draw). Bands, spaced so
   systems can be slotted between without renumbering:

   | Band | order | For |
   |---|---|---|
   | Pre-sim | 0–19 | input, mode flags |
   | World clocks | 20–29 | dayNight, weather |
   | World events | 30–39 | worldStir, fortress, POSEIDON |
   | Actors | 40–59 | player, robots, animals, birds |
   | Effects | 60–69 | projectiles, sparks, explosions |
   | Reading / late overlay | 70–89 | **lore (80)** |
   | HUD / screen | 90–99 | HUD widgets, modals |

   Note the `order` field sorts systems *within the registry*. Where the
   registry's `runUpdate()` sits in the hub decides its position relative to
   still-hardcoded calls during the migration — so systems are migrated in an
   order that keeps one `runUpdate()` point correct, or the hub gets a second
   `runUpdate()` call at a later point. Called out per stage below.

2. **Early-return gating — the hub keeps the gates.** The registry runs the
   normal-play set; the few special-mode ticks (rest clock, drive-steer) stay as
   explicit hub logic. Most systems never think about modes. `lore` already sits
   below the gates, so it only runs in normal play — unchanged.

3. **Registration — self-registration.** Each feature calls `register()` in its
   own module. Zero hub edits, and — the reason it wins for *this* repo — two
   people adding features touch **no shared file**, so no merge conflicts. Done:
   `lore` now self-registers in its constructor; the hub no longer names it.

4. **Lifecycle.** New Game reloads the page (`fullReset -> location.reload`), so
   the registry rebuilds from scratch and a re-registration can't duplicate.
   `register()` also replaces a same-named system defensively. An in-place island
   swap (no reload) would call `clear()` first — wired when islands land.

## Migration plan (staged, each stage boots green)

- **Stage 0 — this slice (done).** `systems.js` + `lore` **self-registers** in
  its constructor; its 1 update + 2 draw call sites dispatch through the registry.
  Demonstrates the blessed end-state pattern (self-registration), not an interim
  adapter. **Stopped for review.**
- **Stage 1 (done).** `dayNight` (order 20) and `fortress` (order 35) now
  self-register; the hub's two hardcoded `.update()` calls are gone. The single
  `runUpdate()` sits at the **late** point (after `updateRobots`), where fortress
  ran, so fortress keeps seeing this-frame robot positions and its guard-spawns
  keep their frame timing. `lore` moved from its early point to this late one as
  a result — verified safe (nothing reads lore state mid-frame; the only delta is
  a one-frame shift in fragment-pickup detection, sub-perceptible). `worldStir`
  has no per-frame `update()` (it's event-driven — fortress calls its
  `stir`/`calm`), so it's not a system. The skylink web draw is renderer-coupled
  (a renderer method gated by `hud` state), not a self-contained module, so it
  stays in the renderer for now.
- **Stage 2 — the ROADMAP file-size split (done: `combat.js` + `ui.js`).** Note
  this is a plain module extraction, not registry work: weapon-fire and HUD-draw
  are event- and render-driven, not per-frame systems, so they move to their own
  files but do not `register()`.
  - **`combat.js` (done).** `fire`/`pierceShot`/`coneShot`/`burnObelisk` moved out
    of `player.js` (2,422 → 2,128 lines). They take `player` as their first
    argument instead of `this`; everything they call back into stays a Player
    method, and `combat.js` imports nothing from `player.js`, so there is **no
    import cycle**. The two combat primitives that were shared between melee and
    ranged code, the `SCORE` table and `zombieImmune`, moved to `combat.js` too
    (both `player.js` and `combat.js` import them from there), which is what
    breaks the would-be cycle. Verified live: firing spends ammo, spawns the
    tracer, lands damage, and prints the right line.
  - **`ui.js` (done, mixin pattern).** Renderer HUD/modals are far more
    entangled than weapon-fire: ~20 methods scattered across the 4,984-line file,
    calling each other and a shared `drawItemIcon` (~600 lines) that world/actor
    draws also use, so a `this`→`renderer` rewrite would be large and risky.
    Instead the methods move **verbatim** to `ui.js` and are mixed onto the
    prototype: `Object.assign(Renderer.prototype, uiMethods)`. `this` stays the
    renderer, so every call site and every `this.drawItemIcon` reach-back is
    unchanged, and the split is physical (readability), not a decoupling. First
    slice landed: the four self-contained screen overlays (`drawRestOverlay`,
    `drawTorporHaze`, `drawUnderworldVeil`, `drawPausedOverlay`) plus `DASH_H`
    (the dashboard height, relocated to `ui.js`; renderer imports it back, no
    cycle). Verified live: the methods are functions on `Renderer.prototype` and
    draw without error. The remaining two passes then landed the same way: the
    modals (`drawSkillModal`, `drawWeaponChart`, `drawDeathCert`, `drawDaemonVoice`,
    `drawAiVictory`, `drawDetail`, `drawToast`), and the dashboard/inventory
    cluster (`drawDashboard`, `drawDashboardCompact`, `drawConditionsInline`,
    `drawHudOverlay`, `drawBar`, `drawLabel`, `drawSlot`, `drawBackpackPanel`,
    `drawDragGhost`, `drawTouchControls`, `drawWalkmanTicker`, `slotAt`) — moved
    by a byte-exact script, not retyped, then `deathRank`'s now-dead import
    dropped from renderer. `drawItemIcon`, `drawCassette`, `drawMinimap`,
    `_wrapText`, `creatureHealthBar`, and `playerShieldBar` stay in the renderer
    (shared with world/actor draws or the depth sort). ui.js is now the whole
    screen-space HUD; renderer.js is world-draw + depth-sort + `drawItemIcon`.
- **Stage 3.** `robots.js`: update-functions become systems; draw stays in the
  depth-sort (per the boundary above).
- **Stage 4.** Self-registration is the pattern from Stage 0 on, so each migrated
  feature already owns its `register()` — no separate "move it into features"
  step. Remaining: `clear()` on in-place island swap, and wiring the islands
  world-contract onto the same `world` bag.

## Decision log

- **2026-07-10.** Chose one `world` bag over per-call arg lists — unifies the
  registry with the islands world-contract; a system reads only what it needs.
- **2026-07-10.** Draw split into `drawWorld` (pre-camera-restore) and
  `drawScreen` (HUD) phases, because `lore` needs both. Depth-sorted actors are
  explicitly **excluded** from the registry and stay in the renderer's sort.
- **2026-07-10.** Stage 0 first registered `lore` from the hub via an adapter, to
  keep the proof reversible while the contract was unreviewed. *(Superseded by the
  2026-07-11 self-registration decision.)*
- **2026-07-11 (David).** Ordering = numeric `order` field with reserved bands
  (table above). Chosen over dependency graphs (over-built for ~15 systems) and
  registration order (too implicit).
- **2026-07-11 (David).** Mode gating stays in the hub; the registry runs the
  normal-play set. Chosen over per-system `activeWhen` tags (ceremony on every
  system) and per-system self-checks (scatters mode logic).
- **2026-07-11 (David).** Registration = self-registration (each feature calls
  `register()` itself). Chosen over a central manifest and hub adapters
  specifically because it means two sessions adding features never edit a shared
  file — the repo's live merge-conflict pain. `lore` converted to self-register.
- **2026-07-11.** Stage 1: one `runUpdate()` point, placed **late** (fortress's
  old position), not early. A single global registry can't be at two positions;
  late minimises behaviour drift because moving fortress *early* would shift
  guard-spawn timing, whereas moving `lore` *late* only shifts fragment-pickup by
  one frame. Systems whose exact frame-position matters relative to still-
  hardcoded hub calls constrain where the block goes; migrate accordingly.
- **2026-07-11.** Stage 2b finished: the dashboard/inventory HUD cluster (12
  methods) moved verbatim into `uiMethods`, completing the `ui.js` split. Moved
  with a byte-exact extraction script rather than hand-transcription, since the
  blocks are large (`drawDashboard` alone is ~180 lines) and retyping risks silent
  drift. Boundary held: `drawItemIcon`/`drawCassette` (shared with world/title
  draws), `drawMinimap` (fog/world), `_wrapText` (modal helper), and the
  `creatureHealthBar`/`playerShieldBar` actor overlays stay in the renderer. The
  stale `drawStatusChips` doc-comment (the chips were removed in v1.87) that had
  fused onto `drawHudOverlay` was trimmed in passing. Verified: 15 tests green +
  live in-browser, no console errors.
