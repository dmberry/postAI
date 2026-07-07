# postAI — Version Plan

This file is the shared planning board for the game. **Henrik: add your ideas and suggestions in the section at the bottom (or anywhere) and push — everything here gets read when the next version is planned.**

Versioning: 0.01 increments (v0.32, v0.33, ...). The game is pushed after every sizeable change so the latest build is always on `main`.

## Working together without clashing (David + Henrik)

We're both pushing to `main`, so a few conventions keep merges painless:

1. **`git fetch` and check `origin/main` at the START of a session**, not just before pushing. Most wasted effort comes from building something the other already shipped.
2. **New self-contained systems get their own file** with a tiny integration surface, rather than growing the shared hub files. Established feature-file owners:
   - `src/game/lore.js` — **David** (the hidden story: fragments, Archive, corpus). Grow the story by editing the `FRAGMENTS` array; the four integration hooks are already wired and shouldn't need changing.
   - `src/game/animals.js`, `birds.js`, `robots.js` — creature/machine AI (agent-authored; either of us edits, keep changes surgical).
   - `src/engine/sound.js` — synthesized audio.
3. **The genuine friction points are the hub files** everyone appends to: `src/main.js` (wiring), `src/engine/renderer.js` (draw dispatch + item icons), `src/game/player.js` (input handling), `src/game/items.js` (registry), `index.html` (help). Edits here are usually append-only so conflicts stay trivial — but keep them small and localized, and pull first.
4. **One person owns the VERSION bump per push.** We collided on "v0.39" once (both used it); whoever pushes second takes the next number. Bump `VERSION` in `main.js` and the README header together.
5. A bigger refactor (a formal systems registry so features attach as `{update, draw}` modules with zero hub edits) would remove most remaining friction, but it's risky to land while both of us are pushing daily — park it until there's a quiet window, then one of us does it in a single focused pass.

## Where we are (v0.90)

### v0.90 — printable map, pebbledash sand texture

- **RON-ML `print` — a physical, carryable map.** New `print` primitive (`ronml.js`) → `ctx.printMap()` drops a `printed_map` item (new `kind: 'map'` item, folded-paper icon) at the player's feet to be picked up. Opens the same `#ronmap` overlay anywhere, away from a terminal, two ways: **click it in any inventory slot** (an `equipSlot` intercept, like the forcefield/compass — it just unfolds, never moves to hand), or hold it and use it (`E`/click in-world, via the passive-kind branch in `useHands`). Both routed through a new `player.onReadMap` hook wired to `openRonMap`; `'map'` added to the `HOLDABLE` set.
- **Pebbledash texture on the sand (yellow) tiles** — `assets/textures/wall-pebbledash.png` added to `FLOOR_TEXTURES.sand` (the pond/river-bank rims), at a **reduced 0.32 alpha** (vs the general 0.55) so it reads as a soft sandy speckle rather than a heavy stone finish.

### v0.89 — RON-ML `map`, robot sword, tweaks batch (sight cone parked)

- **RON-ML `map` command.** New `map` primitive (`ronml.js`) → `ctx.showMap()` opens `#ronmap`, a green CRT schematic of the AI's territory drawn to a canvas in `main.js`: every obelisk (green square + code, destroyed ones hollow), every live machine (red dot), the W-factory (amber diamond), the **mainframe** you're hunting (magenta star + label), and you (cyan ring), with a legend. Overlaid on top of the terminal (z-index 22); click outside to close back to the console. A new seed-derived `mainframe` location (far from spawn; marker only, no interaction yet) gives the search a heading. Free to run (a read, like `scan`). Added to the design doc's verb table and the help.
- **Robot sword** (new `robot_sword` item) — press **C** with 10 scrap to forge one (`canCraftSword`/`craftSword`, new `countItem` helper, craft-prompt banner + distinct beaten-metal icon; added to `WEAPON_ORDER`). A heavy anti-machine melee blade (robotDamage 9 vs the katana's 3).
- **Bombs stack** (small/medium/large ×5, insane ×3). This exposed a latent `swapHands` bug: moving a pocket stack into the single-item hand slot silently dropped the surplus — now it takes one and stows whatever was held, so nothing is lost.
- **Arrows buffed** — bow range 12→18, robotDamage 4→9, animalDamage 9→16.
- **Sleep slower** — rest animation `REST_DURATION` 2.8s→4.6s (was "a bit too fast").
- **Obelisk damage bar** smaller (30×3.5, was 48×5) and higher above the tower (offset −26, was −12).
- **Unopened loot boxes lightened** (warmer wood on faces and lid) so closed vs. looted reads at a glance.
- **Start hint** trimmed to "Press H for help", and moved to the bottom-**right**.
- **Sight cone parked.** Built and working as a directional grey peripheral fog (`renderer.drawSightCone`, offscreen `destination-out` composite, linear front/back gradient centred on the player so behind greys out), but gated **off** behind `const SIGHT_CONE = false` pending careful tuning — the code stays ready to switch back on.

### v0.88 — animated rest: screen fade, 5x clock, lie-down pose

- **Resting (B) is now an animation instead of an instant heal.** Pressing B starts a `resting` state (main.js) that runs `REST_DURATION` (2.8s real): the world freezes (early `return` in `update`), the day/night clock advances at **5x** (`dayNight.update(dt * REST_CLOCK_MULT)`) so the on-screen countdown visibly spins, health trickles back over the duration (`SLEEP_HEAL` spread across it), and on completion the cooldown is set and the run is saved. Same guards as before (not while hurt-free, on cooldown, or hunted).
- **The screen dims over the play area while resting** — a soft envelope (`restDim`, fade in over the first fifth, hold at 0.72, fade out over the last fifth) drawn by `renderer.drawRestOverlay` with a "Resting… / time is passing" caption. Only the play area dims; the dashboard (and its spinning clock) stays bright so you watch time pass.
- **The character lies down.** `player.resting` drives a new branch in `drawPlayer`: the sprite is tipped onto its back (rotated ~80°) on a wide flat shadow, no tool in hand, with drifting sleep "z"s.

### v0.87 — loot/inventory polish: used-box look, forest backpacks, drag-to-drop, aimed bombs

- **Opened loot boxes now clearly read as spent** — darker wood on both faces, a near-black empty interior, and the lid drawn thrown open (a plank standing up behind the crate). `drawBox` in the renderer.
- **A few spare backpacks now spawn out in the forests** (open grass tiles adjacent to a tree), not just the one buried in the ruins — four of them, so a backpack is much easier to find early. Added to the loot-scatter block in `main.js`.
- **Drag an item off the open backpack panel to drop it.** The drag-release handler in `main.js` now, when a drag is released away from any slot *and the backpack panel is open* (`showBackpack` guard, so a fumbled dashboard drag doesn't fling things away), drops that slot's contents on the ground via a new `Player.dropSlot(slot, map)` helper.
- **Bombs land where you aim.** `dropBomb` now throws to the tile under the cursor (`player.aimWorld`, captured each frame in `update`), capped at the bomb's throw range — a nearby click drops it close, a far one lobs it full distance — instead of always throwing a fixed 4.5 tiles ahead. The solid-tile pull-back still applies.

### v0.86 — electro-gun destroys bots + damages obelisks, robot chip fragments, craft-a-chip

- **The electro-gun now destroys a machine outright** instead of fusing it into a mineable wreck. Its `fuse` effect branch in `Player.fire` sets `target.hp = 0` (a clean kill — `scrapPenalty = false`, so full salvage) plus the spark burst and score, letting the robots module handle death/scrap on its next tick. The old `fused`/`mineCharges` wreck path is now unreachable (nothing sets `fused` anymore) but left in place as harmless dead code.
- **The electro-gun's arc also scorches obelisks.** `fire` now checks for an obelisk in front within range (for `effect: 'fuse'` guns) and, if it's no further than any machine target, damages it via a new shared `Player.damageObelisk(ob, map, amount)` helper (extracted from `burnObelisk`). A slower way to fell a tower than the OB-gun, but it works — and it makes the **obelisk damage bar appear** (the damage bar itself was never broken; the player just had no way to raise `obDamage` short of the OB-gun/insane bomb, which is what the "obs not showing damage bar" report was really about).
- **Every destroyed machine sheds a chip fragment** (`chip_fragment`, new `material` item, stack 64). Added to the robot death-loot block in `updateRobots`. Collect **eight** and press **C** to assemble a whole access chip (`Player.canCraftChip`/`craftChip`, gated behind the existing OB-gun/wave-gun craft checks; new `Player.countItem` helper; craft-prompt HUD banner + a distinct green colour). So there's always a route to a terminal even without felling a tower. Distinct chip / chip-fragment item icons added to the renderer.

### v0.85 — felling an obelisk always drops an access chip

- **A destroyed obelisk now always spills an access chip** on top of its usual salvage, so bringing down any tower hands you the means to jack into the others' terminals. Refactored both physical destruction paths (`burnObelisk`'s OB-gun kill and `detonateBomb`'s insane-bomb blast) into a shared `Player.spillObeliskSalvage(ob, map)` helper — circuit board, batteries, scrap, and the chip in one place. Deliberately **not** wired into RON-ML `crash`, which only knocks a tower dark temporarily (`needsRebuild`) and shouldn't be a chip fountain. Fixed a latent double-`addScore(20)` the refactor exposed in `burnObelisk`.

### v0.84 — RON-ML implemented

- **RON-ML is live.** New self-contained module `src/game/ronml.js`: a hand-rolled tokenizer, recursive-descent parser, and small-step evaluator for the language from `docs/ob-terminal-language.md`, shipped without lambdas per the doc's own §8 call (`let` alone teaches binding). Runtime values are tagged objects (`{tag:'node'|'key'|'num'|'list'|'unit'|'fn', ...}`) so error messages can name what went wrong instead of leaking JS internals. All 7 primitives from the doc are implemented: `scan`, `nearest`, `hack`, `crash`, `sleep`, `repel`, `sing`, plus `keys`. Application-by-juxtaposition, `let ... in`, and the pipe `|>` all work, including parens as an alternative to juxtaposition (`sleep(30)` parses identically to `sleep 30` — falls out for free from parenthesized grouping, no special call-syntax needed). Incomplete applications (e.g. `crash OB-BB05` alone) surface as the doc's own teaching-error examples via a small `USAGE_HINTS` table, not a raw partial-function value.
- **The obelisk terminal is a real REPL now.** `#obterminal` gained an input row (`#obterminal-inputrow`/`#obterminal-input`) below a scrolling output log; `main.js` wires Enter to run the typed line through `runRonml()` against a `ronmlCtx()` built fresh per command (world hooks only — `ronml.js` itself never touches game state), and Up/Down recall command history. The old static boot-text screen is now the REPL's opening banner.
- **`hack`/`crash` reuse the obelisk-code scheme** already seeded in v0.78 (`ob.code`, e.g. `OB-D0D9`). `crash` is deliberately a *different* mechanic from physically burning a tower down: it always sets `needsRebuild=true` (a W3 drone eventually raises it again) and never counts toward the permanent win condition — a repeatable tactical disable, not a console shortcut to victory. It reuses the existing repair-drone dispatch and turns off an active SKYLINK purge as a side effect, matching the fiction ("collapses the web").
- **`sleep`/`repel` reuse existing per-robot fields.** `sleep t` sets `r.disabledT` (the same stun-gun freeze timer) on every non-friendly robot within `RONML_ROBOT_RANGE` (20 tiles) of the player; `repel` sets a new `r.repelledT` (60s) that a small addition to `updateRobots`'s dispatch loop turns into a flee-from-player override, same pattern as the animals' `scaredT`.
- **`sing` — implemented as a deliberate deviation from the design doc.** Per instruction: instead of the doc's planned "hit kicks you out of the terminal" interrupt (never built — being jacked in already makes you fully invisible to robots via `player.terminalSafe`, which was judged the better defensive model), typing `sing` **immediately closes the terminal** so the player can watch the sequence happen in the world instead of reading about it. Targets (`nearby(r) && !r.drained` robots within range) get `r.singing=true`, a line-up position (`choirX/choirY`, fanned out perpendicular to the player's facing), and a `choirT` countdown; `updateRobots` walks them into formation facing the player, then sets `drained=true` once the timer runs out. No AI key needed, matching the doc's "pure treat" framing.
- **Lore fragments for the language** (`ronml-01` through `ronml-05` in `lore.js`, `kind: 'code'` — reuses the existing green-on-black styling) — near-verbatim from the design doc's §5 Fragments A-E: `sleep 30`, `scan |> nearest`, the `let`/HACK→CRASH two-step, `repel`, and a torn, deliberately-unreadable hint at the secret. These are additions to David's lore corpus (`src/game/lore.js`, marked as his file to develop) — flagged here for his review/repositioning rather than treated as final placement.
- **Help modal** gained a full RON-ML paragraph (verbs, the AI-key gate, the hint-driven error philosophy, a nod to the secret) and a controls-table row for Enter/history in the terminal.

### v0.83 — click-to-arm forcefield/compass, multi-target compass, backpack badge click, persistent identity, melee knockback

- **Forcefield now needs a deliberate click to work.** Its old gate (`this.hands === 'forcefield'`) meant it only ran while physically held, but the v0.81 help text wrongly claimed "just carry it" — a real bug, not just wording. Now `player.forcefieldArmed` is toggled by clicking the forcefield in *any* slot (hand, pocket, or pack) via a new intercept at the top of `equipSlot()`; `forcefieldActive()` and the drain/recharge loop in `update()` now key off `hasItem('forcefield') && forcefieldArmed` instead of the hand check. Losing the item disarms it automatically. Click it again to disarm and stop the drain.
- **Electro-compass gets the same click-to-arm treatment**, plus multi-target tracking. `player.compassArmed` toggles the same way; `compassTarget()` (singular, nearest-overall) became `compassTargets()`, returning the nearest instance of *each* category (factory/obelisk/backpack/OB-gun) rather than just the closest one overall. `renderer.js`'s facing-chevron block now draws one small chevron per active target (via a shared `drawChevron` closure) instead of one, falling back to the plain white facing chevron when the compass isn't armed or nothing's around.
- **Backpack HUD badge is clickable.** `renderer.js` pushes a `packbadge` uiSlot at the badge's rect; `main.js`'s slot-press handler opens `showBackpack` directly on a click there, same panel as pressing **I**. Label updated to "PACK (click or I)".
- **Name and gender now survive death and New Game.** Previously `fullReset()` wiped the whole `postai-character` save, including persona, so every death reset you to "Adam". Split persona into its own durable `postai-identity` key (name + gender only), loaded as a baseline before the run-save check and written every time `persist()` runs; `fullReset()` deliberately never clears it. The run-save (score, skills, inventory, position) still wipes on death/New Game as designed.
- **Melee hits now knock the target back**, Minecraft-style — `player.js`'s general melee-hit branch shoves the target `KNOCKBACK_DIST` (0.5 tiles) away along the hit vector (blocked by `map.isSolid`) and sets `target.knockT = KNOCKBACK_STUN` (0.4s), during which `updateRobots`/`updateAnimals` skip that entity's AI and attack entirely (checked centrally in each module's dispatch loop, same pattern as the existing `disabledT`/stun-gun freeze). Previously an adjacent enemy could land its own attack on its own cooldown the instant your swing connected, so you routinely took more damage than you dealt; the shove now buys a beat of separation.

### v0.82 — faster health regen, obelisk terminal only opens on a screen click

- **Health regenerates 3x faster.** `HEALTH_REGEN` 0.5 → 1.5/s while fed and unpoisoned — dying to attrition after a fight was too easy; recovery between scrapes is now meaningfully faster.
- **Obelisk terminal only opens when you click the little green screen**, not anywhere on the tower body. `drawObelisk`'s `obeliskHits` push shrank from the whole tower footprint to the CRT screen rect plus an 8px padding for a comfortable target (`sx-5.5-8, sy-6.5-8, 12+16, 14+16`).

### v0.81 — access chip + AI OS, self-charging electro-gun, carried shields, obelisk damage bar, factory flicker-spawn

- **Access chip → terminal, or the AI's own OS.** A new carried `chip` item (`kind: 'chip'`, seeded one per world) is your interface into the obelisks — you don't hold it, just carry it. Clicking an obelisk **with** a chip opens a **connect channel**: a progress bar (`#obterminal-connect`, ~1.6s) that then reveals the RON-DOS boot screen with access GRANTED (read-only). **Without** a chip you instead get the AI's own console — `#aios`, a magenta glitch-CRT filling with restless, unreadable data (sine-driven hex/glyph field, per-frame `requestAnimationFrame`), header ACCESS DENIED · NO KEY. Both close on backdrop click.
- **The chip hides you while jacked in.** Opening a terminal sets `player.terminalSafe = true`, which ORs into `player.invisibleToRobots` — the obelisk shields you from the machines for as long as you're logged in. Closing the terminal drops the shield.
- **Electro-gun self-charges.** Replaced the fractional pocket-battery model with a **self-charging internal cell** (`selfCharge`, `internalMax: 4` — four batteries' worth, tracked on `player.electroCharge`). It trickles back up (`chargeRate` 0.0085/s) whenever it's carried, spends `shotCost` 0.05 per fuse shot, and skips your pocket batteries entirely. Runs flat, then quietly comes good again — no more dead weight.
- **Electro-gun destroys bots in a shower of sparks** (`sparkBurst`, 5 scattered sparks) and **scares nearby animals** — firing sets `scaredT` on animals within 7 tiles, and they flee straight away from you (`scareAnimals`).
- **Mirror shield reflects lethally, and shields work while carried.** `blockRangedShot` no longer needs the shield in-hand or a facing check: a carried forcefield absorbs, a carried `mirror_shield` **reflects the shot back to destroy the shooter** (`hp -= 999` at both the W4 and water-droid fire sites), a carried plain shield absorbs. A pale deflector ring (cyan for the mirror) shows around you while any shield is carried.
- **Obelisk damage bar.** A 48×5 bar floats above a scorched obelisk (when you're within 12 tiles) showing `obDamage` 0→5 — green/amber/red. Obelisks are hard to fell: five OB-gun burns (or an insane bomb), and W3 drones repair the damage back down, so it takes the heavy kit.
- **Factory flicker-spawn.** Machines dispatched from the factory now **flicker into existence** — `spawnT` 0.75s set on W1/W3/W4 at dispatch, rendered as a buzzing fade-in (`drawRobot` globalAlpha ramp × sine). They move and fight normally while materialising.

### v0.80 — electro-compass, clickable obelisk terminals, terminal-language design

- **Electro-compass** (new held tool, `kind: 'compass'`). While held, `Player.compassTarget()` finds the nearest of {factory (blue), obelisk (green), dropped backpack (yellow), dropped OB-gun (orange)} and the facing chevron becomes a homing pointer to it, coloured by type. (Red AI-mainframe slot reserved for later.) Passive — using it does nothing but flavour text. Seeded one per world in the caches.
- **Clickable obelisk terminals.** Each obelisk now draws a small flickering green CRT on its face. Clicking the tower (within `OB_TERMINAL_RANGE` 4.5) opens a **VT220-style terminal modal** (`#obterminal`, green phosphor + scanlines + CRT glow) that boots RON-DOS, shows the node's code and circuit id, and reports access LOCKED. Read-only for now — the hooks are in place. Click detection: `renderer.obeliskAt` stores per-tower world-screen hit rects each frame; main converts the click via `camera.toWorld → worldToScreen` (same path as right-click inspect).
- **Design written for the terminal mini-language** — `docs/ob-terminal-language.md`. RON-ML: a tiny ML-flavoured functional console language (≈7 primitives + let/pipe/application), gated by the AI key, range, and not-getting-hit; the HACK→CRASH chain as the teaching moment; codes seeded in lore fragments; the `sing` Portal easter egg; a self-contained implementation plan (`src/game/ronml.js`).

### v0.79 — factory depth + spawn fixes, textured vent, railgun ammo, whiter chevron

- **Factory no longer has trees/machines drawn over it.** The 8×8 object was sorted by its origin corner (very low depth), so anything with a higher tile-depth painted over the block. It now sorts by its **centre** (`obj.x+fw/2 + obj.y+fh/2`), which occludes what's behind it while still letting things genuinely in front (south/east) draw on top.
- **Dispatched machines spawn beside the factory, not inside it.** The dispatch point (`factoryCy`) moved from the solid centre to just south of the footprint (`y + fh + 1.5`), so W1/W3/W4 seat on open ground rather than stuck in the block. Verified a W4 spawns outside the footprint on non-solid ground.
- **Grubby vent.** The roof vent's orange glow now has the metal texture drawn over it (clipped to the ellipse, 0.4 alpha) so it isn't a clean flat oval.
- **More railgun ammo** — its cache now bundles 14 batteries (was 4).
- **Chevron whiter** — `rgba(200,200,200,0.55)`.

### v0.78 — destructible 8×8 factory + AI key, 24h deadline, electro-gun sips, raven perch fix, jumpable crates

- **The W-factory is now a big 8×8 destructible structure.** Placed on a clear 8×8 grassy area (main.js), all 64 footprint tiles point at the one object (solid across the whole thing). `drawWfactory` renders it as a tall extruded prism faced with the `decor-train.jpg` texture (`FACTORY_TEXTURE`), with a pulsing vent and a **damage bar centred above it when you're within 14 tiles**. Hitting it in melee (`useHands` → `hitFactory` → `damageFactory`) or catching it in a bomb blast chews its `hp` (160); when it gives, the footprint is flattened to a walkable, scorched heap and it drops an **AI key** (new `ai_key` item) plus salvage. All the factory's dispatch/repair code now fires from its centre and stops once it's `destroyed` (`factoryLive()`).
- **SKYLINK deadline back to 24 hours** (`DEADLINE_DAYS` 0.5 → 1.0) — there's more to do in a run now.
- **Electro-gun sips its cell**: `fractionalAmmo` 0.05 — each shot accumulates 5% and only spends a whole battery when the fraction tips over one (`player.ammoFrac`), so a battery lasts ~20 fuse shots and the pocket count stays integer. (Replaces the v0.77 built-in reserve.)
- **Ravens only perch on big, grown trees** (`isBigTree`: variants 0–2, `grow > 0.75`) — landing on a small/dead/sapling left the bird floating above the sprite.
- **Crates are jumpable** — `box` is now `climbable` (climbHeight 1), so you can step or hop onto/over one; still searchable from beside it.
- **Facing chevron** is greyer and less opaque (`rgba(150,150,150,0.45)`).

### v0.77 — electro-gun reserve, aged cars, chevron aim, bomb→weapon autoload, tabbed help, plan pruned

- **Electro-gun built-in ammo.** It drained shared pocket batteries far too fast. Guns can now carry a `builtIn` reserve (electro-gun: 40 fuse shots) tracked per-gun on `player.gunAmmo`, used before it ever touches pocket cells.
- **Cars look weathered.** `drawCar` now composites every car (not just wrecks) through the offscreen and dusts a faint grime texture (`photo-unsorted-2.jpg`/`EDGE_TEXTURE`, 0.16 alpha, source-atop) over its own pixels, so they read as years-old rather than showroom-fresh. Smashed cars still get the heavier husk + rust pass on top.
- **Facing indicator is a directional chevron**, rotated to the screen-space aim, replacing the plain grey dot.
- **Throwing a bomb auto-arms your best weapon.** `dropBomb` → `autoEquipBestWeapon()` brings the highest-`power` tool/gun from pockets (then backpack) straight to hand, so you're not left empty-handed; spare bombs stay in pockets.
- **Tabbed help modal.** The help panel is now Controls / Survival / Animals / Machines tabs (a sticky tab bar; JS toggles `.helpPanel` blocks by `data-panel`, with Survival split into two blocks that toggle together around the machines section).
- **Plan pruned.** Collapsed the v0.45–v0.69 per-version changelog (it duplicated git + the README table) and removed already-shipped backlog items; refreshed the near-term list with the agreed 8×8-factory / OB-terminal-language / W5 directions.

### v0.76 — shields + forcefield, bigger-tree wood, hand-height tools, softer car shadow

- **Shields and a forcefield.** Three new held items (`items.js`): `shield` (absorbs a laser from the front), `mirror_shield` (reflects it back for `REFLECT_DAMAGE`), and `forcefield` (a battery-powered green shell that stops everything, all-round). `Player.blockRangedShot(sx,sy)` decides absorb/reflect/none by facing; the W4 and W2 fire sites consult it before dealing laser damage (and take the reflected hit). `Player.takeDamage` short-circuits entirely while the forcefield is up, so it also stops melee. Forcefield burns `FORCEFIELD_MAX` (60s) per battery, auto-pulling a fresh cell when one runs dry (mirrors the Wi-Fi block). Bubble drawn in `drawPlayer`; shield/forcefield icons in `drawItemIcon`; all three seeded into caches (shield common-ish, mirror rarer, forcefield a single rare find). Verified: reflect only from the front, forcefield blocks any direction and zeroes incoming damage.
- **Bigger trees drop more wood.** Wood yield is now per tree variant (`[4,4,3,1,2]` for big/big/medium/small/dead), scaled by `grow` for saplings, instead of a flat 2.
- **In-hand tool at hand height.** The held-item anchor moved down (`by-16` → `by-10`) so it reads as held in the hands, not floating at the shoulder.
- **Softer car shadow.** Replaced the hard flat oval with a radial-gradient ellipse hugging the car's footprint; it's cosmetic only (collision is the tight 2x2), so you can walk across it.

### v0.75 — smashed-car grime, tighter car collision, smaller tools, fainter boundary

- **Smashed cars look ruined, not just dim.** The offscreen husk tint now also paints a faint metallic grime texture (`misc-ring-bottoms.jpg` → `CAR_RUIN_TEXTURE`) over the car's own pixels (source-atop) at 0.32 alpha, so a wreck reads as burnt/rusted.
- **Tighter car collision.** Cars were a 3x2/2x3 solid footprint whose iso width (~160px) was wider than the 147px sprite, so you were stopped a step short of the visible car (the "janky edge detection"). Footprint is now a tight 2x2 (128px) that the sprite slightly overhangs, so you stop when you touch the car body.
- **In-hand tools no longer oversized.** The held-item icon scale was still tuned for the old larger character; dropped from ~0.85 to ~0.55 to suit the v0.67 smaller sprite.
- **Boundary blocks fainter.** `EDGE_ROCK_ALPHA` 0.5 → 0.38.

### v0.74 — real car sprites, wall-top texture, softer boundary

- **Abandoned cars are real sprites now.** Replaced the procedural hull with 3/4-view PNGs (`assets/textures/cars/`, from `_tmp/cars`): Chevrolet Bel Air, Rolls-Royce Phantom in blue/red/white, a police car, and an ambulance — each in the four iso-diagonal facings (SE/SW/NE/NW). Worldgen stamps a random `carModel`/`carDir` per car; `CAR_SPRITES`/`CAR_MODEL_KEYS`/`CAR_DIR_KEYS` in textures.js; `Renderer.drawCar` blits the sprite (old procedural draw kept as `drawCarProcedural` fallback until the image loads). A smashed car is darkened to a burnt husk via the offscreen source-atop tint.
- **Wall tops textured.** A stone/brick wall's top face now gets the same wall texture as its sides but at low opacity (0.22), so it reads as the same material yet a distinct top-lit surface rather than a flat cap. Untextured walls keep the plain fill.
- **Boundary blocks more transparent.** `EDGE_ROCK_ALPHA` 0.7 → 0.5, so a block between you and the camera is easier to see through.

### v0.73 — gravel boundary texture, water droids gated to water

- **Boundary blocks re-textured.** They were faced with the road texture and read as just more road. Now faced with a dark crushed-gravel/asphalt photo (`photo-unsorted-2.jpg`, new `EDGE_TEXTURE` in textures.js) so the map edge reads as rock, clearly distinct from the roads inside the map. Still semi-transparent and depth-sorted as in v0.72.
- **Water droids can only hit you in the water.** `updateWaterDroids` gated the fire/damage on `player.swimming || floorAt(player) is water/stream`. Step onto dry land or a bridge and a W2's shots can't reach you — though it keeps tracking you and you can still shoot it from the bank. (They fire on the whole squad's wave otherwise unchanged.)

### v0.72 — render fixes: held-item depth, boundary blocks, swimming head

- **BUG FIX: the held item floated over the character's head when facing away.** The tool/gun was always painted after the body. It's now drawn before the body when the facing points "back" (`player.facing.x + player.facing.y < 0`, i.e. behind the torso in screen depth) and after when it points toward the camera. Extracted to `drawHeldItem`.
- **Boundary edge blocks reworked.** They're now (a) faced with the `floor-road.jpg` texture, (b) drawn semi-transparent (`EDGE_ROCK_ALPHA` 0.7) so a block between you and the camera lets you show through, and (c) pushed into the depth-sorted drawables (with tile depth) instead of a flat pre-pass — which fixes the "south edge looks weird" bug, where front (south/east) blocks were being painted over by the grass behind them. Only the on-screen out-of-bounds strip is collected, so mid-map it's free.
- **Swimming uses the real character sprite.** Instead of a drawn skin-tone blob, the swim view now clips the top half (head + shoulders) of the current-facing idle frame at the water line, with the existing ripples — matching the on-land look.

> **Still open from this batch (larger, staged next):** shield weapons (standard absorbs a laser, mirror reflects it), a battery-powered green **forcefield**, the **8×8 factory** (train-textured, damage bar, drops an AI key), a **W5 tree-planting bot**, and the big one — **OB terminals** you can access to type ML-style code fragments seeded in the lore (SLEEP / REPEL / CRASH / HACK, plus the Portal-choir easter egg), a mini functional language the player actually learns to hack machines. The terminal + language is its own design project.

### v0.71 — SKYLINK reprieve, rock map edges, tree variety + chop feedback, CPU culling

- **Felling a tower during the SKYLINK purge shuts it down.** SKYLINK was unwinnable once it started. Now, if `player.skylinkActive` and you topple an obelisk that isn't the winning blow, the laser web collapses (`skylinkActive = false`) and the tower is flagged `needsRebuild`; the factory rushes a W3 to it (`updateW3` now also targets destroyed+`needsRebuild` towers and, on reaching one, raises it: `destroyed=false`, re-solidifies the tile). SKYLINK only re-lights once nothing is flagged (the activation guard gained `&& !obeliskObjs.some(o => o.needsRebuild)`). Topple towers faster than they're rebuilt and you can still win outright mid-purge.
- **The map edge is a wall of grey rock, not black void.** A new unclamped `rawVisibleRange` + `drawEdgeRock` fill every on-screen out-of-bounds tile with a raised stone block (`EDGE_ROCK_H` 52). Only the visible strip near an edge is drawn, so mid-map it costs nothing.
- **CPU: distance culling for a bigger map.** Robots and animals more than ~40 tiles from the player now skip their AI entirely (they're off-screen and can't affect the player) and resume when the player returns. Crucially the robots' O(n²) `separateRobots` pass now runs only over the near-player subset, so hundreds of machines on a large map cost the same as a handful. Friendlies (which follow you) are never culled. This is the groundwork that makes the planned 4× map affordable.
- **Tree variety + chop feedback.** `TREE_SPRITES` gained a small (variant 3) and a bare/dead (variant 4) cut-out; `worldgen`'s new `treeVariant()` sprinkles them in rarely (≈9% small, ≈6% dead) among the full trees. A chopped tree shows a green→red damage bar above it (`treeDamageBar`, `maxHp` stamped on first chop). Chopping swings faster now (`TREE_CHOP_SPEEDUP` 0.55 of the normal cooldown).

### v0.70 — hand-drawn trees, block-top movement polish

- **Real tree art.** Trees were procedural circles/triangles; they now blit from a copied CC0 "Premium Trees" sheet (`assets/textures/trees.png`, the No-Outline set David dropped into `assets/textures/Shadow/`). No files were sliced — each `variant` (0/1/2) is a source-rect (`TREE_SPRITES` in textures.js, bounds measured off the sheet's alpha) drawn with `drawImage`, scaled by the existing `grow` value and carrying its own baked shadow. `Renderer.drawTree` keeps the procedural version as a fallback until the sheet loads.
- **Slower, steadier walk on block tops.** On a climbable ledge the walk speed is cut to `BLOCK_WALK_MULT` (0.6) — the footprint is small and full pace made edges twitchy to line up.
- **Walk off a block to drop down.** Stepping off the edge of a block onto lower ground now seeds `z` with the height lost (rendered at 32px/unit vs a level's 16px, hence ×0.5) and lets the existing jump/gravity integrator carry you down, so you fall smoothly and keep walking instead of snapping down.

### v0.45 – v0.69

Detailed per-version notes for these were pruned (they duplicated git history and the README version-history table). See the **Version history** table in `README.md` and the annotated git tags (`git show vX.YZ`) for anything older than v0.70.

## Planned / backlog

**Near term (agreed direction)**
- **8×8 factory + AI key.** Make the W-factory a big 8×8 structure (train-textured), with a damage bar shown when you're near, that takes many hits to destroy and drops an **AI key** on death. Sets up the "why" for the OB terminals below.
- **OB terminals + a mini ML-style language (the big creative one).** An accessible screen on obelisks where you type short functional-style code fragments seeded in the lore: `SLEEP`, `REPEL`, `CRASH` (needs a hex code from `HACK`), plus a Portal-choir easter egg (robots line up, sing, deactivate). A small language the player genuinely learns to hack machines. Needs its own design pass (grammar, verb set, how HACK→CRASH chains, gating codes behind not-getting-hit).
- **W5 tree-planting bot.** An occasional, always-one-in-the-world drone that slowly plants baby trees. (Not yet implemented.)
- Mobile phone + RON texts.
- "Scary approach drone" telegraph for an incoming hunter (from the original design).
- Friendly-robot orders: currently follow + (T2) tree-felling; add "collect wood/loot and bring it back", guard mode, and a way to see your robots on the minimap.
- Visual pass on the machines art (obelisks, crates, robots) and hollows.
- Limping animation + WOUNDED tag when health is low (the slowdown exists; it needs a visual cue).
- Persist minimap fog/exploration across reloads (map knowledge should survive death, like skills).
- **File size**: `renderer.js` (2150+ lines), `player.js` (1380), `robots.js` (1000), `main.js` (900) are all getting long from steady feature accretion. Worth a split before they get much bigger — candidates: pull renderer.js's HUD/modal drawing (dashboard, backpack, skills, weapons chart, death cert) into its own `ui.js`; split player.js's weapon-fire logic (fire/pierceShot/coneShot/burnObelisk) into a `combat.js` mixin or module; robots.js could separate the AI update functions (updateT1/T2/W1/W3/W4) from the drawing code. Not urgent — nothing is currently hard to find or edit — but flagged here since it was asked about directly (2026-07-06) and will only get harder to justify skipping the longer we wait.

**Systems from the original design not yet built**
- Wounds by type (scratch/bite/gore) with bandages and infection; venom is in, the rest is not.
- Clothing and protection (layers, bite/claw/venom resistance, mobility trade-offs).
- Cooking (raw meat is risky food, fire attracts things at night).
- Scent/noise stealth model (gunshots should attract everything).
- Save/load of the full world state (localStorage), seed selection on a title screen.
- More animals from the design: stags with shockwave antlers, wolves that track scent, bears, the panther.
- Weather (rain masks sound), Field Journal that fills in animal tells as you learn them.

## Henrik's suggestions

*(add ideas below this line)*

- **Awareness meter feeding an escalation event.** Ravens already flush and shriek when they spot the player (existing mechanic) and obelisks already plan to report player-closeness to nearby robots (v0.34). Chain these into a single rising "AI awareness" value — normal ambient patrol most of the time, but crossing a threshold (too many sightings, too close for too long, a raven that reaches an obelisk) flips the game into a short, hard escalation sequence: robots converge fast, and more are paradropped or flown in overhead. Telegraph the drop itself — a growing drone hum, something visible crossing the sky — so the player gets a beat to brace or run before it lands.
- **Escalation should feel like a different game for its duration** — brutal, punishing, retry-friendly pacing (Flappy Bird / Getting Over It register) rather than the calmer scavenge-and-avoid pace of normal play. Short, intense, and over quickly either way (survive it or die and respawn), not a sustained new difficulty floor.
- **Hacking parts as the resource for the already-planned obelisk destruction mechanic.** A new rare salvage type alongside batteries/scrap/ammo, dropped mostly by destroyed robots and reprogramming failures, that accumulates toward disabling a specific obelisk. Gives "quiet the machines in this area" a concrete collectible goal rather than an abstract endgame trigger.
- **Firearms as loud, high-value, high-risk tools against robots specifically** — guns already yield less salvage than melee/mining a fused wreck (per v0.33), which is a good lever: keep gunfire mechanically tempting against a hunting robot wave but expensive in loot, and (tying into the planned scent/noise model) loud enough to draw in more attention, so using guns during an escalation event is a real trade-off, not a free upgrade.
- **Ravens should be robots, not wildlife.** Recast the existing "bird" as a small flying drone/scout machine rather than an animal — same flush-and-shriek spotting behaviour, but now it's mechanically the AI's own eyes in the sky, wired directly into the awareness-meter idea above (a scout drone spotting you *is* the alert reaching the obelisk, not a metaphor for it). Also gives a reason for a drone to be shootable/knockable-out-of-the-sky for scrap, and frees up "ravens" as an actual wild animal slot later if wanted.
- **Weeping angel robot (T3).** A machine that only moves while unobserved — freezes solid the instant it's on-screen or in the player's sight cone, closes the distance the moment you look away or turn your back. Pairs naturally with the mouse-facing/sight-cone idea below: its whole threat depends on the game actually tracking what the player can and can't currently see.
- **Sight cone with peripheral indistinctness.** Render things outside the player's facing cone (now driven by the mouse, so this is cheap to compute) as dimmer/blurrier/desaturated — true peripheral vision rather than full-fidelity 360° awareness. Raises the stakes on facing choices (aiming at one threat leaves you genuinely worse at spotting another) and is the mechanical backbone a T3 weeping-angel robot would need to be fair rather than cheap.
