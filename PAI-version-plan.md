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

## Where we are (v0.56)

- Isometric world, seeded 128x128: river, two bridges, ten-building town, hamlet, forests, tall grass, hills and hollows, wadeable streams.
- Survival: food/hunger, health, stamina, venom, day/night (dark nights), torches, minimap with fog of war (grey, not black), permadeath that drops your loot where you fell.
- Animals with tells: dog packs, charging boars, ambush vipers, shrieking food-stealing ravens.
- The machines: black obelisk towers; T1 wheeled hunters (cannot climb, trapped by hollows); T2 biped stalkers (walk exactly at your pace).
- Robot batteries: they drain, machines return to their obelisk to recharge, stuck ones run flat, and a drained robot can be reprogrammed with a battery (R) to work for you (T2s fell trees).
- Weapons: penknife → bat/machete/crowbar (resistance caches, E to search) → stun-gun (disables), electro-gun (fuses into a mineable wreck), pistol, shotgun. Batteries/ammo/shells in caches. Gun kills yield less salvage than melee or mining a fused wreck. Guns show remaining ammo on the hands slot; a cache in front of you is always searchable with your other hand, gun in hand or not.
- Loadout: press 1-4 to select a pocket, G to swap it with the hands slot (put a weapon away, pull another out), F to drop it (or the held tool, if no pocket selected); pocket slots show the item name in tiny writing.
- Player never overlaps an animal or robot's exact tile — bodies push apart, so a target is always hittable.
- Player always faces the mouse cursor, independent of movement direction. Using the held tool is **/** or **left click** (Ctrl/Cmd retired).
- If a fight or a bad respawn leaves the player wedged in solid geometry, they're auto-pushed out to the nearest open tile.
- Death always leaves you holding a penknife, never empty-handed.
- The version number shows under the postAI logo, top-left. The on-screen control hint fades out after two minutes of play.
- Books teach permanent skills (R): woodcraft, herbalism, tracking, fleet foot. Knowledge survives death.
- Character: Adam / Eve / Neve or a custom name (help modal, H).
- **Backpack**: a rare find in the ruins. Once found, it's automatic — 16 more slots and one spare-weapon slot (select with 5, swap with G), filled from overflow; eating and gunfire draw from it once the pockets are empty. I views it (read-only — nothing to drag, the split is automatic). Dropped, with everything in it, on death.
- Synthesized sound: footsteps by surface, action and creature sounds, wind, night crickets, and now a sparse, haunting solo-piano ambience that only plays in calm moments — it fades out while fighting or being hunted and back in once safe. P toggles it.
- Grass tiles carry a little blade texture instead of a flat colour fill.
- First lore pass: sparse sprayed slogans on walls, and abandoned cars littering the roads here and there. Environmental only, no readable/interactive layer yet (that's still the planned "hidden story" phase below).
- **RON — Reality or Nothing** — the resistance now has a name. A share of the wall graffiti is RON-specific and deliberately contradictory: some reads like a live movement (RON LIVES, RON NEVER LEFT), some like an epitaph (RON IS DEAD, NO ONE IS COMING) and is painted fainter, as if older or less certain. Whether RON still exists is left open on purpose — nothing in the game settles it, and nothing should until/unless a future lore phase decides deliberately.
- **Items look like the thing they are**: every weapon, gun, food, book, and material has its own small vector icon — in the pockets, in hand, and on the ground — rather than a generic coloured square. The held tool/gun now draws in the player sprite's hand and kicks out further when swinging or firing.
- **Experience**: melee practice hits harder over time, gun practice extends range and hits harder, and reading (even a re-read) builds a knowledge level; all three show in the stats line and survive death and reloads, like skills.
- **Obelisks are watchful, not just decorative**: the signal light blinks occasionally rather than pulsing continuously, and deepens to a saturated blood-red the longer a human lingers close — the tower has sensed you. While alert, it periodically nudges nearby non-hunting robots to sweep the area around it (closeness reported, never your exact position).
- **Machines have a presence**: a faint mechanical drone swells as one nears, and the night crickets fall silent around any active robot, not just a hunting one — they're afraid of the machines themselves.
- **Zoom**: plays at a closer over-the-shoulder view by default; Z toggles out to the old wide view and back.
- **Wi-Fi block** (rare, one per world in a cache): held in hand it jams robot sensors so hunters can't find you; runs on a 10-minute charge shown as a battery gauge on the hands slot; feed it a battery (use key) to keep it going.
- **Tool/weapon use animates**: melee sweeps through an arc, guns kick back with a muzzle flash — a swing or shot always reads on screen.
- **The hidden story has begun** (`src/game/lore.js`, David's module): scattered paper fragments in the ruins; walk over one to recover it, J opens the Archive to read what's found. Six fragments to start, deliberately out of order and ambiguous. Grow the corpus by editing the `FRAGMENTS` array in lore.js — nothing else needs touching.
- **Decaying walls**: buildings weather through six decay states (new/old/older/mossy/breaking/crumbling) — greyer stone, lower and rougher tops, cracks and moss — distributed by how ruined each building is. Set on the wall object as `decay` (0-5) at generation; drawn in renderer `drawWall`.
- **More dramatic terrain**: hills up to height 5, trenches down to -3 (still generated as walkable one-step slopes).
- **Jump-to-climb**: while airborne you can clear a two-level height step, so a jump gets you up onto higher ground (and out of a dug pit); on foot it's still one level.
- **Shovel + robot traps** (found in a cache): dig the faced tile down into a steep pit (height -2). A wheeled T1 rolls in and can never climb out; the player can only get out by jumping. Reuses the terrain height rule, so no special-case trap code.
- **Wi-Fi block works while carried**, not only held; it draws a battery only when a machine is actually near, so it never wastes cells while you're safe. A "HIDDEN" tag + minutes shows on the HUD while active.
- **Books and notes read on pickup**: walk onto a book and it grants its skill on the spot (no pocketing, no R needed); notes go straight to the Archive.
- **Sparser grass texture** and the **aim dot set further from the sprite** so facing reads clearly.
- **Score** on the dashboard (replaced the tile readout): +1 tree (more with a saw's `sawBonus` or the woodcraft skill), +3 animal, +10 robot, +2 mined wreck, +2 cache, +5 book, +5 fragment. Survives death; persisted with the character save. A **saw** (in a cache) fells trees fast and scores more.
- **Swimming**: rivers (water floor) are passable for the player only — slow (0.45x) and exhausting (drains stamina fast, chips health), so a crossing costs you. Water stays solid for everything else.
- **Click-to-equip**: click a pocket, spare-weapon, or backpack storage slot to put that tool/gun/gadget in hand (and click the hands slot to stow it). Handled in main via `renderer.slotAt()` before the in-world click is consumed.
- **Big smashable cars**: abandoned cars are now 2x3 six-tile hulks (one car object, whole footprint solid and pointing back at it). Smash with a crowbar (or any weapon, slower) to strip them: car battery, a salvaged **seatbelt** (improvised weapon), weapons, books, scrap, tins, torches. Loot spills at your feet since the footprint itself is solid.
- **Lore fragment note**: on pickup the text shows in a soft, transparent panel bottom-right that auto-fades (~9s) or clears on a click — alongside the full Archive (J).
- **Crickets at dusk only** (16:30–20:00), not all night. **T1/T2 hull labels** are a softer light grey, not stark white.
- **Health bars** float over animals/robots within ~6.5 tiles of the player (uses each entity's `maxHp`); hidden for dead/fused/drained.
- **Right-click a tile** to inspect it: car make/model+year (from hue), stone vs brick + age (from decay), obelisk/cache/tree/floor + terrain height. `describeAt()` in main; tooltip drawn near the cursor for ~6s.
- **Drag and drop** items between slots (pocket / hands / spare-weapon / backpack storage) with the pointer, alongside click-to-equip. Renderer records slot rects + a `slotAt()`; player has generic `getSlot/setSlot/moveItem`. Input now tracks pointer up, right-click, wheel, and held state.
- **Scroll-wheel zoom** (`camera.zoomBy`, clamped 0.7–3); HUD stays screen-space so it doesn't scale.
- **Bullet tracers**: guns push a cosmetic projectile (`map.projectiles`) from muzzle to target; main advances them, renderer streaks them (yellow bullet / cyan stun / violet fuse). Damage stays instant.
- **Red-brick buildings**: ~40% of buildings are brick (`material` on the wall object) with mortar courses, weathering through the same decay as stone.
- **Entities respect terrain height**: animal movement now blocks steps of |Δh|>1, so a dug pit (or any steep drop) actually traps them instead of letting them walk out. (T1 already couldn't climb; T2's player-rule already trapped it in a -2 pit.)
- **Certificate of Death**: on death a modal shows name, cause, score, skills, deaths, and an amusing rank (COMPOST → NOOB → SCRAPPER → SURVIVOR → VETERAN → L33T). Freezes the world until clicked. `player.deathCert` snapshot; `deathRank()` in renderer.
- **Lore notes styled**: Archive fragments render as their own note cards — paper colour + typeface per kind (handwritten note, newsprint, diary, poster, green-on-black disk/tape). `NOTE_STYLE` in lore.js.
- **Autosave**: character + xp + score + deaths + a run-state snapshot (vitals, position, inventory) persist to localStorage; saved every 8s, on tab-hide, and on unload; restored on load. World regenerates from seed (so caches/cars reset — a known limitation; world-object persistence is a follow-up).

### v0.56 — pause, and an open-ended SKYLINK purge

- **Pause (P)**: freezes movement, AI, clocks, timers, New Game, and crafting; help/backpack/skills/weapons panels and unpausing itself still work while paused. A dimmed "PAUSED — press P to resume" overlay draws over everything. Blocked while the death-cert modal is open (already its own frozen state) to avoid a confusing double-freeze.
- **Music toggle moved to M** (from P, to free P up for pause) — `M` was reserved for a not-yet-built phone feature and was otherwise unused. `input.musicTogglePressed()` now reads `KeyM`.
- **SKYLINK's purge no longer has a 30-second cutoff.** Once it comes online, the W-factory keeps dispatching W4s indefinitely (2-4 every ~1.2s, capped at 50 concurrent so a long purge can't tank the frame rate) — there's no timer to survive to. `player.skylinkActive` stays on and the run only ends via `dieToSkylink()` when the player actually dies, exactly as the ending was originally designed to work, just without an artificial deadline. The banner now counts up ("hunted for M:SS") instead of down.
- Verified live: pausing genuinely freezes the day/night clock (`dayNight.elapsed` provably unchanged across a real-time wait) and un-pausing resumes it; help still opens while paused; SKYLINK's W4 swarm kept building (30 concurrent in one run) with no forced end, and dying during it produced the correct SKYLINK certificate.
- Docs: help modal's key table and win/lose paragraph updated to match.

### v0.55 — 12-hour deadline

- Deadline halved to 12 hours (`DEADLINE_DAYS` 1 -> 0.5 in `daynight.js`). The elapsed-hours-based fix from v0.52 means this is a clean one-constant change — `hoursLeft()` correctly starts at 12:00 on a fresh run.

### v0.54 — SKYLINK's final purge

- **Running out the clock no longer ends the game instantly.** Once `dayNight.hoursLeft()` hits zero, `player.skylinkActive` flips on: every surviving obelisk lights up and links to its two nearest neighbours in a pulsing bright-blue laser web (`Renderer.drawSkylinkNetwork`, drawn each frame in world space), a countdown banner appears (`Renderer.drawSkylinkBanner`, `SKYLINK-9000 ONLINE — Ns`), and the W-factory throws overwhelming waves of W4 hunter-killers at the player — an opening salvo of 6, then 2-4 more every ~1.2 seconds, dispatched from random surviving towers (`dispatchSkylinkW4s` in `main.js`) — for 30 real seconds before the ending plays regardless of whether the player is still alive.
- **Dying during the purge is now also terminal**, not a normal respawn: `Player.takeDamage` branches to a new `dieToSkylink()` when `skylinkActive` is set, which shows the same SKYLINK death certificate immediately rather than the usual "wake back at the road" cycle — thematically, there's no coming back once the network goes fully online.
- Verified live: the banner renders correctly mid-countdown, over 40 W4s can be alive simultaneously by the time the sequence ends, and the certificate shows the correct SKYLINK ending whether the timer expires or the player is killed first.
- **Docs**: help modal's win/lose paragraph rewritten to describe the purge instead of instant game over.

### v0.53 — name field fix, W4 spoils, dev-server caching fix

- **BUG FIX: the help modal's name field swallowed the letter H** (and would have swallowed any other tracked key — N, C, J, Z, P, etc.) because the global keyboard listener ran regardless of what had focus, so typing "H" both blocked the character and toggled the help panel shut mid-type. `Input`'s keydown handler now skips entirely when the event's target is an `INPUT`/`TEXTAREA`/`SELECT` (`src/engine/input.js`).
- **Added an explicit Save button** next to the name field (also saves on Enter), so naming your character doesn't rely on an invisible blur/change event.
- **W4 kills drop real spoils of war**: on top of the usual scrap, a downed W4 now drops 3 batteries, 4 bonus scrap, and a heavy bomb (rarely the insane one) — the toughest thing the factory builds is now worth taking down.
- **Dev tooling**: replaced the plain `python -m http.server` with `dev-server.py`, which disables browser caching (`Cache-Control: no-store`). The plain server was letting browsers skip revalidation on reload entirely, serving genuinely stale JS after an edit — confusing during testing and would eventually confuse a real playtest session too. `.claude/launch.json` updated to match.

### v0.52 — reload warning, and a genuine bug fix to the 24h countdown

- **BUG FIX: the SKYLINK countdown didn't actually start at 24 hours.** `DayNight.hoursLeft()` subtracted the day-clock's absolute `totalHours` from the deadline, but `totalHours` itself starts at `startHour` (09:00, for a daylight start) rather than 0 — so a fresh run's countdown read ~15:00 remaining instead of 24:00, shortchanging the deadline by the daylight-start offset every single time. Fixed by counting elapsed game-hours since the run actually began (`totalHours - startHour`) rather than the absolute clock hour.
- **Reload/close now warns first**: a second `beforeunload` listener calls `preventDefault()` to trigger the browser's native "leave site?" confirmation, since reloading now wipes your score and kill record (v0.50). Skipped during New Game's own reload (already confirmed via its own dialog) via the existing `resettingGame` flag.

### v0.51 — every weapon guaranteed to spawn

- **Every weapon and tool now spawns somewhere**, except the wave gun and OB-gun (deliberately crafting-only): added guaranteed cache drops for penknife, seatbelt, bat, and machete, which previously only appeared via the random roll table (and so weren't guaranteed). Combined with v0.50's bow/katana/sledgehammer/railgun fix, all 15 non-crafted entries in `WEAPON_ORDER` are now guaranteed findable in a single run.
- Box count per world raised from a flat 20 to `max(20, guaranteed.length + 9)` so the larger guaranteed list doesn't crowd out the random roll table (small variety in extra batteries/ammo/bombs/melee).

### v0.50 — factory-built W1s, harsher reload, 24h deadline, missing weapons found

- **W1s are built at the factory, not the obelisks**: the revenge squad an obelisk's destruction triggers now spawns at the W-factory's location instead of the crater — matches the fiction ("W1s are created AT THE FACTORY") and reads better against the periodic factory-dispatched waves added in v0.49.
- **W1s can no longer be zombified**: the OB-gun beam's corrupt-into-a-zombie effect (`pierceShot`) now excludes `type === 'w1'` — they're already the AI's own hostile hunters, so the beam just damages them like any other pierce hit instead of pointlessly "corrupting" an already-hostile machine.
- **W4 now also spawns on a game-time clock**: one per 30 minutes of in-game time (not real time — scales with the day/night clock), from the W-factory, independent of the existing attack-triggered dispatch. Capped at 3 concurrent W4s so it can't snowball.
- **24-hour deadline** (was 48): `DEADLINE_DAYS` in `daynight.js` dropped from 2 to 1.
- **Bow, arrows, katana, sledgehammer, and railgun are now actually findable**: all five were fully defined in `ITEMS` but never referenced anywhere in `main.js`'s loot generation, making them unobtainable in a real playthrough. Added guaranteed cache drops for all five.
- **Reload penalty hardened**: previously -1000 score and one kill off the record; now a plain page reload (without New Game) wipes the score and the *entire* obelisk kill record. New Game itself is unaffected — it still clears everything and shuffles a fresh world, penalty-free.
- **Docs**: help modal updated (machines section, reload-penalty line) to match.

### v0.49 — waves, triangulation, the W4 laser hunter, and a denser world

- **HUD rank**: the death-cert rank title (deathRank, same 15-band table) now also shows live under the score on the dashboard, so you can see where you stand without dying first.
- **Reload penalty**: reloading the page (F5, closing/reopening the tab) without going through New Game isn't a clean reset — it costs **-1000 score and one obelisk kill struck from the record**. Only fires when there's an existing save to reload (a genuinely fresh load, or one right after New Game, is untouched); stops reload being used as a free undo out of a bad fight.
- **W1s attack in real waves**: each W1 now cycles attack (close in and strike) and withdraw (fall back) phases independently, so a squad hits, backs off, and hits again rather than charging in a single relentless line.
- **Obelisk triangulation**: W1s track a position fix relayed from the obelisk network, refreshed every ~2.5-4 seconds rather than live — laggy but real, so they still close in (approximately) even behind a jammed Wi-Fi block that blinds every other machine. A hit still requires the machine to be standing next to you at the real, live distance.
- **W1s swarm instead of stack**: each hunter holds a angled position around its target (individually rotating), and a new generic post-move separation pass (`robots.js`, 4 relaxation passes/tick) keeps any two live machines of any type from ending up on the same tile — fixes squads visually stacking on one point.
- **W-factory now also builds W1 waves**, on its own clock (not just the one-off revenge squad when a tower falls), capped at 3 concurrent W1s so it can't snowball.
- **New W4 laser hunter-killer**: dispatched from the W-factory the instant you attack an obelisk (throttled to about once per 25 seconds so rapid OB-gun fire can't spam a squadron). Unlike a W1 it never closes to melee — it holds firing range and backs off if you close the gap, firing a red laser bolt on a cooldown.
- **Obelisks guarantee a full circuit set**: each of the 12 towers is now assigned one of the 8 circuit-board numbers at world generation (round-robin, then shuffled) and drops exactly that one circuit when destroyed — replaces the old "3 random numbers per kill" drop, which could dupe forever and never actually guaranteed you'd complete the set.
- **Certificate of Death fixes**: the "Skills mastered" line could run past the panel's right edge with several skills learned — now wraps properly. Added a clickable **Copy** button on the cert (top-right, under the divider) alongside the **S** key. Per your request, sharing is copy-to-clipboard only now — dropped the silent download fallback; if the browser won't allow clipboard image writes it just says so.
- **Denser, more varied terrain**: five forest regions instead of three (with a higher fill chance), far more scattered lone trees/rocks, 5-7 hills instead of 4-6, and 3-5 hollow zones instead of 3-4 (plus a new zone) — noticeably more undulating ground and much heavier tree cover.
- **Docs**: help modal updated to cover the win condition's escalation (waves, triangulation, W4), the reload penalty, and the copy-only certificate.

### v0.48 — the war escalates: victory, revenge squads, zombies

- **Win condition confirmed and made explicit**: bring down every obelisk before SKYLINK completes and you get the victory certificate ("THE TOWERS ARE DOWN"). This already worked in v0.47; it's now called out plainly in the help.
- **W1 hunter-killers**: the instant an obelisk falls, 2-4 W1s (new robot type, tougher/faster than a T2, `robots.js`) boil out of the wreckage already aggroed on the player — no detection phase, no giving up the trail. Rendered with a scorched red-black palette to read as distinct from T1/T2.
- **W-factory + W3 repair drones**: a single foundry object placed on the map (new `wfactory` object type). While any obelisk is damaged (hit by the OB-gun) but not yet destroyed, it periodically fields one unarmed W3 drone that walks to the nearest damaged tower and heals it back to full — leave a half-burned obelisk alone too long and you'll have to start the burn over. Only one W3 is ever out at a time.
- **OB-gun robot "zombies"**: firing the OB-gun's beam at a robot (rather than a tower) no longer just pierces it — it corrupts the machine into a zombie (green halo tell) immune to every weapon except the **bow** and the **wave gun**. Stun-gun, electro-gun, pistol, shotgun, railgun, melee, and even bombs all bounce off; only those two builds can finish one.
- **Sparks on impact**: any weapon landing on a robot now throws a brief shower of sparks (`map.sparks`, drawn by the renderer) — melee, guns, the cone, and bomb splash all trigger it.
- **Certificate of Death is shareable**: press **S** on the cert screen to copy it to the clipboard as a PNG (falls back to a download if the browser won't allow clipboard image writes) — `renderer.shareCertificate()` crops the panel straight off the live canvas.
- **World seed is now randomised per game** instead of a fixed constant (`postai-seed` in localStorage; a continuing run keeps its seed for autosave, New Game rolls a fresh one). Fixes every playthrough dropping weapons and caches in identical spots.
- **RON resupply**: every 90-150 seconds, one already-emptied resistance cache is quietly restocked with a fresh battery/ammo/shells drop.
- **All weapons now have hand-drawn icons**: sledgehammer, bow, arrows, katana, railgun, and wave gun previously fell back to a plain coloured square; every item in `ITEMS` now has a distinct vector icon.
- **BUG FIX (pre-existing):** New Game never actually reset your score/skills/kill log — `location.reload()` fires `beforeunload` synchronously, which ran the autosave and rewrote the character save right back *after* New Game's `removeItem` calls, undoing the reset every time. Fixed with a `resettingGame` flag that `persist()` checks first. Also means the new random-seed-per-game feature above only worked reliably for score/skills once this was fixed too.
- **Docs**: help modal rewritten to cover all of the above, plus a long-stale line claiming the penknife fells trees (it hasn't since v0.47) fixed.

### v0.47 — bombs, wave gun, water droids, SKYLINK

- **Timed bombs** (new `bomb` item kind, holdable, stack:1): small / medium / large, plus a rare **insane** bomb. Hold one and use (**/** or click) to set it ticking a step ahead; it detonates after its fuse in a fire cloud that damages every animal, robot, water droid — and the player — inside its radius. Blink-rate on the canister quickens as the fuse runs down. The **insane bomb also brings down any obelisk** caught in the blast (drops the same numbered-circuit + battery + scrap heap as an OB-gun kill). Detonation lives in `player.detonateBomb()`; `main` ticks fuses and spawns the `map.explosions` cloud; renderer draws ticking bombs + expanding flame rings. Bombs seeded in caches (small/medium common, large uncommon, insane a rare find).
- **Wave gun** (crafted, prompted with C): destroyed obelisks now drop **numbered** circuit boards (1-8). Collect all eight distinct numbers and a craft prompt appears — build the wave gun, which fires a **fanned cone of laser beams** (`coneShot`, 36° half-angle) that scythes through a whole crowd of W1s/robots at once. `player.circuitNums` (a Set) is persisted.
- **W2 water droids** (`src/game/waterdroids.js`, new self-contained module): aerial droids that hover just above the river, drifting idly in squads. If you come to the bank near them they **aggro as a whole squad** and fire on you in waves; a wounded droid snaps its squad to alert instantly. They de-aggro once you're well inland. Water-only movement; drop scrap on death. Weapons (guns, cone, bombs) hit them via a combined foe list passed to the player each frame.
- **Death certificate rank tied to score** — 15 bands: LAME (0) → NOOB → BEGINNER → INTERN → NORMIE → POST-NORMIE → SEASONED → SERIOUS → TRAINED → SNIPER → AI STALKER → L33T → L33T PRO → ULTRA-L33T → MEGA L33T (10000+), each with its own blurb and colour. (LEET rendered leetspeak as L33T.)
- **Penknife can't fell trees**: swinging it at a tree now just burns stamina and nicks your health slightly (too much effort for too little blade) and says so, instead of chopping.
- **SKYLINK seeded as urgent**: six new lore fragments (`sky-01`..`sky-06`, across science/secret/ron/code/handwritten) frame SKYLINK as the towers' coordinating doomsday mind, nearly online, hours not days — telling you to burn the array *now*.
- **Lore Archive is scrollable** (J): the fragment list now scrolls with the mouse wheel / up-down keys inside a clipped viewport with a slim scrollbar, so a full Archive no longer runs off the panel.
- **Still deferred:** W1 robots + AI factory (+ scary approach drone); walking on top of walls/blocks (multi-level rendering); mobile phone + RON texts.

### v0.46 — stakes, armoury, forest
- **48-hour deadline** (`DEADLINE_DAYS = 2`); countdown shown as raw `HH:MM to SKYLINK`.
- **Death loses all items** (no drop): `die()` just clears everything; you respawn with a penknife.
- **Armoury / weapon chart (V)**: all 16 weapons in `WEAPON_ORDER` with a computed `power` (1-10). Found ones (tracked in `player.weaponsFound`, persisted) show named + lit; undiscovered are faded, unnamed ("???"), power still shown.
- **New weapons**: bow (+arrows, silent/long/accurate), railgun (piercing), sledgehammer, katana. OB-gun now also fires a **piercing beam** (`pierceShot`) through a line of enemies when no obelisk is in front; railgun always pierces.
- **T1 rarely drops an OB-gun** (deterministic from wreck position, ~ rare) + batteries.
- **Obelisk hex codes** (`ob.code = OB-XXXX`); `player.killLog` records toppled towers, shown in the skills screen.
- **Lore spread across the whole map** (any walkable tile, 8-tile min gap) instead of piled in buildings; +3 fragments that hint the OB-gun recipe.
- **Trees**: three visual variants; occasional regrowth (saplings sprout on grass, `grow` 0.3→1 over ~a minute).
- **New Game (N, confirmed)** clears the save + reloads; otherwise the autosave continues the run. Persistence now covers weaponsFound, killLog, skillLog.
- **Still deferred:** W1 robots + AI factory (+ scary approach drone); walking on top of walls/blocks (multi-level rendering).

### v0.45 — the win/lose loop
- **BUG FIX (urgent):** opening a crate bare-handed froze the game — `stow(null)` did `ITEMS[null].stack` and threw inside the update loop, killing the rAF chain. Guarded the auto-equip (only stow a displaced item if there is one) and hardened `stow()` against null/unknown keys.
- **Countdown to SKYLINK-9000**: `DEADLINE_DAYS = 7` in daynight.js; dashboard shows `Nd HH:MM to SKYLINK` (replaces count-up). At zero the AI wins → SKYLINK death cert. `player._ended` guards re-trigger.
- **OB-gun + obelisk destruction**: craft the OB-gun (C) from stun-gun + electro-gun + Wi-Fi block held anywhere (prompt banner shows when you have all three). It burns the nearest obelisk in range; 5 hits → destroyed (lower/scorched each hit, flames while burning), drops circuits + batteries + scrap, tile becomes walkable. Destroy all obelisks → **victory** cert (+100). New items: `obgun`, `circuit`. Wi-Fi block respawns random on craft.
- **Wi-Fi charge persists on drop** (was resetting to full): charge rides on the dropped ground item via `giDrop()`; read back on pickup.
- **128 lore fragments, 8 kinds** (science/handwritten/letter/note/code/ron/secret/crafting), agent-written; `NOTE_STYLE` restyled per kind (paper + typeface; code/ron/secret/crafting are dark screens).
- **Skills screen (K)**: practice levels + books-read history; removed the idle/skill/xp lines from the dashboard. `player.skillLog` tracks book order, persisted.
- **Health bars sit higher** over creatures/robots. **Swimming shows only the head** bobbing with ripples.
- **Obelisk detection light**: brighter, fast-blinking saturated red with a glow when it senses you.
- **DEFERRED to next push (large new systems):** W1 hunter-killer robots + 9x9 AI factory (one per map, releases W1 in waves ~1/min once an obelisk is destroyed, until fully down); mobile phone object (M to call → draws all robots; carried in pocket → receive RON text tips + new gun designs). Both are sizeable and want their own focused, tested pass.

## Planned / backlog

**Near term**
- W1 hunter-killers + the W-factory shipped in v0.48; v0.49 closed most of the original v0.45 backlog gap by adding factory-dispatched W1 waves (not just the one-off revenge squad), attack/withdraw wave behaviour, obelisk triangulation, and the W4 laser hunter-killer. Only a dedicated "scary approach drone" telegraph remains open from the original design if we want it.
- Mobile phone + RON texts (see v0.45 deferred, above).
- Friendly-robot orders: currently follow + (T2) tree-felling; add "collect wood/loot and bring it back", guard mode, and a way to see your robots on the minimap.
- Visual pass on the machines art (obelisks, crates, robots) and hollows.
- Limping animation + WOUNDED tag when health is low (the slowdown exists; it needs a visual cue).
- Persist minimap fog/exploration across reloads (map knowledge should survive death, like skills).

**The hidden story (the big one)**
- Lore fragments as loot: newspapers, diaries, floppy disks, VHS tapes, answering machines — readable/playable once you find power and devices; an Archive screen assembles the timeline. The truth about the takeover, and what the obelisks really do, told in pieces.

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
