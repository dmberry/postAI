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

## Where we are (v0.45)

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
- W1 hunter-killer robots + AI factory (see v0.45 deferred, above) — the next big build.
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
