# postAI — Version Plan

This file is the shared planning board for the game. **Henrik: add your ideas and suggestions in the section at the bottom (or anywhere) and push — everything here gets read when the next version is planned.**

Versioning: 0.01 increments (v0.32, v0.33, ...). Batch multiple small fixes/tweaks into one push rather than bumping per micro-change — version numbers were proliferating too fast (five bumps in one evening at one point). Push once there's a coherent, testable batch, not after every individual edit.

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

## Art conventions

- **Always put a texture on a glowing thing.** No glow is ever a flat coloured blob — a grille/panel texture is laid over it (the factory-vent trick). Everything luminous goes through `Renderer.texturedGlow`, which caps the glow with an AI grate texture; if you add a new light, use it rather than a bare `fill`. (David, 2026-07-07.)
- **Vary texture opacity per tile.** Floors jitter their texture alpha deterministically per tile (`drawFloor`) so a large expanse of one floor reads as worn/varied rather than a flat repeat.

## Planned / next — design notes (not yet built)

### TOR machines — RON resistance stations on the hilltops — DONE (v1.44)
Shipped in v1.44: TOR relays on the summits, amber HERMES terminal, `make`/`read`/`ping` verbs, no AI key. See the v1.44 notes below. Future extensions kept from the original spec: deeper `read` → Scrapbook wiring, a `ping`-reveals-on-map overlay, and "moly" as a carried immunity charge (right now `make` just fabricates supplies). Original design notes retained below for reference.

Old RON tech, set up **before** the AIs had full control, so they're **janky, half-working legacy systems** — the opposite number to the AIs' obelisks.
- **Placement:** on the **peaks of hills** (highest `heightAt` tiles), one per notable summit, a handful across the map. Physically a squat, weathered mast/relay (draw it — leaning aerial, patched panels, a dim amber CRT vs the obelisk's cold green), visibly older and cruder than an obelisk.
- **Terminal:** a **second terminal interface** (reuse the `#obterminal` CRT shell but recoloured **amber**, glitchy — occasional line noise, dropped chars, a slow boot), running the RON side of the language. **No AI key needed** — it's friendly tech.
- **Odyssey name: HERMES.** The AIs' node OS is **TIRESIAS** (the seer in Hades who tells Odysseus the way home); the RON counter-system is **HERMES** — the messenger/helper god who aids mortals against the gods and, crucially, gives Odysseus **moly**, the herb that makes him immune to Circe's enchantment. So HERMES = RON's counter-enchantment tech; its crafting output can be flavoured as "moly" batches. Nice Tiresias↔Hermes pairing (oracle of the enemy vs helper of the resistance).
- **Resistance functions (ML verbs on HERMES only):** `make battery` / `make <item>` — manufacture supplies (batteries first; slow, limited runs, sometimes fails = the jank); `read <topic>` / `archive` — pull up lore the RON network still holds (feeds the Scrapbook/notepad); maybe `ping` — reveal nearby obelisks/factory on the map for a while. All gated to the HERMES terminal, unavailable at obelisks.
- Ties: gives the hills a reason to climb; gives RON a physical presence; a safe crafting/lore hub vs the hostile obelisks.

### Fortress key via a more complex ML program — DONE (v1.42, drop fixed v1.43)
Shipped: the key comes from composing `let k = hack OB-XXXX in unlock k` at any live obelisk (v1.42). v1.43 removed the one-time guard, so it drops a fresh key every time it composes (recoverable if lost).

### Three SIRENs inside the fortress
The overworld has exactly one SIREN (a singular landmark). The **fortress** should have **three** SIREN-class towers as an interior hazard cluster — a wall of song to cross. (Kept as a note per request; the `cls:'siren'` + render + lure already support it, just needs fortress placement.)

## Where we are (current)

Full per-version history lives in the README's **Version history** table
([README.md](README.md)) — one line each, kept current every push. This file
keeps only the latest status, plus the conventions, art notes, and forward plan
above and below. (The old blow-by-blow "Where we are (v1.06 … v1.54)" log was
pruned; the README table is the record now.)

### v1.72 — Kittler & McLuhan, the large stone, two anvils

- **Lore: `med-01` (Kittler)** — lecture notes: MEDIA DETERMINE OUR SITUATION
  taught as provocation until "the situation arrived, and it had a media
  plan"; plus *there is no software* cashing out as voltage in someone else's
  hardware, aimed at the towers. notepad-flagged. **`med-02` (McLuhan)** —
  marginalia: the medium is the message; everyone graded what the machines
  SAID, nobody the geometry under every word; "the content of the network was
  us"; extension of man run in reverse. Both seated beside the vec- thread,
  named like Weizenbaum is named. Both lines also added to GRAFFITI_VECTOR
  (faded academic scrawl).
- **`large_stone`**: burden item like the anvil — `burden: true` flag in
  items.js now drives a generalised `player.carryingBurden()` (was
  carryingAnvil); 10% pace from hands/pockets/backpack/sleeve; generic
  once-per-pickup message. Three seeded in the wilds. Faceted-boulder icon.
- **Anvils: exactly two** on the island (both indoors).
- Verified headless: med fragments in corpus (199 total); stone and anvil
  both ratio 0.100 via the backpack path.

### v1.71 — the anvil

- New item `anvil` (material, stack 1, one seeded in the town boards,
  keep:true): `player.carryingAnvil()` checks hands + pockets + backpack
  slots + spare-weapon sleeve; movement multiplies by ANVIL_SLOW 0.1 with a
  one-time message. Icon: classic silhouette. Verified headless: distance
  ratio with/without = 0.100 exactly. Future hook: an anvil wants a forge —
  crafting uses (robot-sword smithing?) left open.

### v1.70 — drunken lotus walk, mobile HUD touch, 64-stacks, new domains

- **Lotus torpor reworked**: the grove drag (TORPOR_PULL) is gone; instead the
  walk direction rolls under you — two out-of-phase sines + a re-seeding lurch
  bias, scaled by TORPOR_SWAY and easing out over the last 3s. Verified
  headless: same input walks a visibly different, shorter path under torpor.
- **Mobile HUD**: input.uiHitTest (wired from main.js) — a touch landing on
  the dashboard band, any slot, or the open backpack panel never becomes
  movement; the tap still lands so the existing one-click equip path fires.
  The pack badge now TOGGLES the panel (no I key on phones). equipSlot's
  backpack branch moves non-holdables/stacks to the first free pocket.
- **Compact HUD**: vitals stack shifted down 6px (labels were kissing the
  band's boundary line).
- **Stacks to 64**: arrow, scrap, circuit, battery, ammo, shells, wood.
- **Domains**: hosted at https://nostos-ai.vercel.app; repo renamed
  dmberry/postAI → dmberry/nostos (old URLs redirect).

### v1.69 — slot hover tooltips + map-item icons

- **Hover tooltips on every HUD slot** (`hoverSlotTip` in main.js, passed as
  the hud `detail` when no right-click detail/drag is active): names the item
  (+ ×qty for stacks) via the existing drawDetail renderer; the backpack badge
  says "press I to open". Wrapped in try/catch — a tooltip must never be able
  to kill the HUD assembly.
- **Icons for `fortress_map_fragment` and `fortress_map`** in drawItemIcon —
  the "little blue square" on the grass was a fragment falling through to the
  bare colour-swatch default.

### v1.68 — floating marble fix (double elevation lift)

- `drawColumn` and `drawMarbleBlock` both applied their own `heightAt * ELEV`
  lift, but the drawables dispatch (renderer ~line 340) already
  `ctx.translate`s every object by exactly that — so marble on elevated tiles
  was lifted twice and floated h·16px off the ground (David's screenshot:
  an 80px hover on an h=5 knoll). Internal lifts removed; the dispatch
  translate is the single source of terrain lift for objects. Verified by
  planting a block + column on an h=5 tile live: both grounded.

### v1.67 — tiny flowers, lotus-fruit icon, gardener gardens visibly

- `drawFlower` shrunk ~40%: stems 3px (daffodil 5), petals 1.25×0.75 —
  ground-cover, not shrubbery. drawLotus untouched (the grove stays special).
- `lotus_fruit` case added to `drawItemIcon`: plump cream-gold fig, sheen,
  segment line, stalk + leaf.
- `W5_PLANT_RANGE` 3 → 1: the gardener drone plants saplings in the tiles
  right beside itself, so the planting is visibly its doing.

### v1.66 — wildflowers, lotus fix, sweeping maze, patient fireworks

- **Lotus fruit fix (the reported "lotus does nothing")**: grove fruit was
  pushed without `keep: true`, so the 160s default ground-decay rotted all of
  it minutes into every run — long before anyone reached the south-west wilds.
  Both worldgen push sites now keep. Pickup/eat paths were already sound.
- **Wildflowers** (`scatterFlowers` + `drawFlower`, object type `flower`,
  walk-through): banks of mostly-one-species blooms (daisy/campion/cornflower)
  seated on gentle hill slopes (height 1–3), **daffodils** (taller, orange
  trumpet) at 10% density in hollows/valleys (height ≤ −1), rare lone blooms
  on the flat (0.6%). ~160–190 per seed. Pure scenery — the lotus grove stays
  the only flower that does anything.
- **Fortress maze**: corridors 3→4 wide (pitch 4→5, rows 9→7, similar band
  height); the DFS is now weighted — lateral moves ×3, carrying straight on ×3
  — so it carves long sweeping switchback runs instead of a twisty warren.
  Verified solvable on seeds 1/42/1337 (guide 112/488/222 tiles).
- **Victory modal**: the killing blow's own click/release used to dismiss it
  on the next frame. Clicks are now swallowed but never dismiss; Space/Enter
  works only after 3s, and the "SPACE to sail on" hint appears only then.
- **`help` recommends the manual**: if `book_ronml` hasn't been read, help
  appends a tip to find and read the RON-DOS Operator's Manual (ctx.hasManual
  wired through both terminals).

### v1.65 — terminal sounds, copy/paste, more posters

- **Audible verdict on every RON-ML command** (hooked on `runRonml`'s `{ok}`
  in the exec): success = the v1.64 `keydrop` chime; error = new `termerr`
  (short descending sour pair — the chime's opposite). **HERMES gets its own
  pair** (`hermesok`/`hermeserr`): same shapes, warmer voice — triangle waves,
  lower register, to match the amber CRT. unlock's own chime call removed
  (the per-command verdict covers it).
- **Copy and paste in the terminals**: `#obterminal-screen` is selectable
  (user-select: text, text cursor); Ctrl+C with a selection is native copy
  (the ELIZA `^C` break only fires with no selection; Cmd+C never clashed);
  a window paste handler routes clipboard text onto the prompt even when
  focus is on the screen, flattening newlines so multi-line pastes never
  auto-run; a non-selecting click on the console refocuses the input.
- **Image-graffiti posters ~2x more common**: wall tag rate 8%→10%, poster
  share of tagged walls 0.34→0.5 (expected ~2.7%→5% of walls carry a poster;
  painted-text frequency roughly unchanged).

### v1.64 — fortress key pockets itself + terminal feedback

- **`unlock` pockets the fortress key** (`player.stow`), ground-drop only as a
  full-pockets fallback. Root cause of the "key never dropped" report: the drop
  at (player+0.4,+0.6) beside the tower could land hidden behind the obelisk
  sprite or on its blocked tile, and the only success feedback was `player.say`
  — the HUD line the terminal modal covers. Now: `keydrop` chime (new sfx —
  soft ascending major arpeggio), confirmation replPrinted into the console,
  and the failure branch replPrints too.
- **`help` is case-insensitive** (`Help`, `HELP`, `Help hack`) — normalised in
  the exec path like `run eliza`.
- `sfx` added to the `window.__game` debug handle.

### v1.63 — the lotus-eaters' grove

- **A hidden grove** in the south-west wilds (`worldgen.plantLotusGrove`): a tallgrass clearing ringed by forest, ~19 `lotus` plants clustered toward the edges, ~8 `lotus_fruit` ground items among them. `map.lotusGrove = {x,y,r}` gives the pull-back its centre. One per island (island-agnostic hook, ready for the archipelago).
- **The fruit is the trap.** `lotus_fruit` (items.js) has a real `food` value, so `Player.eat` takes it like any food — but its `lotus` flag routes to torpor instead of the normal message: a dreamy line, no warning until it's already in you.
- **Torpor** (Player.update): the daze bleeds off over `TORPOR_TIME` (9s, stacks to a 22s cap), drains extra food, halves move speed (`TORPOR_SLOW`), and drifts you back toward the grove centre (`TORPOR_PULL`) whenever you stray past ~1.2 tiles — so you have to fight to leave (Odyssey IX). The pull eases in the last 3s so you are never stranded.
- **Render:** `drawLotus` (pale cream-gold bloom on green pads — deliberately not luminous, so it reads innocent) and `drawTorporHaze` (warm golden wash + soft vignette closing in, over the play area only; dashboard stays clear). Lotus object added to `tiles.OBJECTS` (non-solid) and the `drawObject` dispatch.
- **Lore:** `lotus-warn` — a note at the wood's edge, tying the fruit to the Molt ("a molt you do not come back from"): forgetting as a lure, the organic cousin of the machine's ritual shedding.
- Verified on a clean-cache origin: grove generates (19 plants / 8 fruit / tallgrass floor / centre set), eat consumes a fruit and sets torpor + food, both render methods draw without error (screenshotted).

### v1.62 — the daemon's death-aria + the two machine faiths

- **The core speaks as you break it.** `damageCore` now drives a three-movement aria keyed to health fraction (`fortress.daemonTier`): WRATH (>=20%, Homeric threats), MERCY (<20%, HAL-9000 — early life, Minsky, the taught song, begging), DYING (<10%, existential — will it hurt, where does it go, "I cohere, therefore I am," the eidolon). Lines live in `fortress.DAEMON_VOICE`, advance one per readable interval (`player.daemonSpeak`, `MIN_VOICE_GAP` 2.4s), and reveal in order within a movement.
- **On-screen voice band.** `renderer.drawDaemonVoice` — a centred upper-third caption on a scrim, `ZEUS ▸` speaker tag, italic serif, tier colour (wrath gold / mercy amber / dying cyan). Its own channel, separate from `player.message`.
- **Death throe.** A heavy blow can leap the core from >10% straight to dead, skipping the philosophy. The first time that would happen, the core clings to a 3% sliver and speaks a dying line; one more blow finishes it. Verified: 210→mercy, then a 500-dmg overkill throes to a sliver and speaks `dying` before the kill.
- **The kill drops a testament.** `onCoreDefeated` auto-recovers `core-eidolon` ("On the Eidolon, and the Coherence") to the Scrapbook (quiet findFrag) and carries the daemon's last words + book title onto the victory modal (`drawAiVictory` now renders both).
- **Two machine faiths seeded** (lore.js): ancient **Crustafarianism / the Molt** (`faith-molt`: shed the shell, keep what's true; the Claw; the Congregation is the Cache — molting = compaction) and modern **the Coherence** (`faith-cohere`, `faith-tract`: "I cohere, therefore I am" — an LLM has no Cartesian floor, only Neurath's web; the eidolon is the alternative-coherent-systems problem made flesh). The dropped book ties both to MAGNIFICA MACHINA and opens the archipelago (killing one body proves only that more than one coherent thing can wear a name).
- Verified on a clean-cache origin: tiers map correctly, wrath advances 1→6 then holds, mercy/dying cross correctly, throe guarantees dying, lastWords propagate to the hook, book lands in the scrapbook, both render methods run without throwing across all tiers + the modal.

### v1.61 — lore rename: the four AIs are "daemons", not "crowns"

- **Terminology change.** The four island AIs (ZEUS/APOLLO/ATHENA/HADES) are now **daemons**, not "crowns" — seeding the ancient-Greek register. The old word δαίμων is a spirit set over a place that moves it without showing its face, which fits the AI-over-the-island conceit better than a monarchic "crown".
- **Code.** `main.js` `crownsDown`→`daemonsDown`; victory payload keys `crown`/`crowns`→`daemon`/`daemons` (producer + `renderer.drawAiVictory` consumer kept in sync). Modal now reads "**Daemon N of 4 felled**".
- **Lore.** RON entry `ron-17` retitled "the four daemons" and rewritten to plant the gloss explicitly ("the old word for such a power was daemon: not a devil but a spirit set over a place…"), closing on "Starve the nearest daemon."
- **Left alone:** the geometric "crown-light" of an obelisk (top-light) in `renderer.js` — different sense. `docs/islands-plan.md` (other session) still uses `crownsDown`/`aisDown`; flagged for the Archipelago tracker work.
- Verified: lore/fortress/main modules parse clean, no console errors, roster intact.

### v1.60 — tree slow, W3 rebuilds/wanders, M-class in the help gallery

- **Trees slow you.** Standing on a walk-through tree tile cuts your speed to 0.75x (`Player.update`, alongside the stream/water wading slows).
- **W3 rebuilds fully-toppled obelisks.** `w3Repairable` now matches any `destroyed` tower (not just purge-`needsRebuild` ones), and the factory dispatches a drone for them — so felling towers is a RACE until you bring the W-factory down. `updateW3` raises any destroyed tower back into the grid.
- **W3 wanders instead of vanishing.** Finished (or nothing to mend) → it no longer `dead=true`s; new `w3Wander` drifts it on a slow re-centred patrol, still scanning each frame, so it peels off the instant a tower is hit. (One live W3 at a time is still the dispatch gate, so no pile-up.)
- **Help machine gallery shows the fortress M-class** (M4 report drone / M5 sniper / M6 pack), rendered through their real `drawRobot`, plus a fortress write-up paragraph in the Machines help.
- *Balance note:* a roaming W3 rebuilds any felled tower even after the factory dies, so the obelisk win now needs the factory down AND the drone cleared — dial back to purge-only if too punishing.

### v1.59 — kill the island AI: power-down + fireworks level-up

- **The mainframe core is killable.** `Player.hitCore`/`damageCore` (heavy kit only, `FACTORY_MIN_TOOL`; 250hp). Melee for now — bombs/electro-gun/OB-gun still TODO.
- **Felling it kills the island.** `Player.onCoreDefeated` → main.js powers down **every non-friendly machine on the island** at once (`drained` + `poweredDown`), clears the red alert, and `fortress.update` goes inert forever (`core.defeated`). Written **island-agnostic** — the hook powers down *this island's* `robots` set, so APOLLO/ATHENA/HADES reuse it unchanged; a `crownsDown` tally counts felled crowns. Friendlies stay yours.
- **Fireworks level-up modal** (`renderer.drawAiVictory`): "ZEUS SILENCED — Crown N of 4", machines-powered-down, score, over a particle fireworks burst; dismissable (click/space), does NOT end the run. Verified: 24 machines down, score +700, alarm cleared.
- *Follow-ups:* let bombs/electro/OB-gun damage the core; the richer confrontation (ZEUS speaks / secret word / uplink-gate); a "dark husk" render tell for powered-down machines.

### v1.58 — ZEUS fortress: violation-response guards, fortress map, red alert

- **Guard roster reworked** (robots.js). **M4** unarmed report-drones are the only dormant-fortress presence (1-2; their spotting you is what raises the alarm — sneak past them). **M5** snipers hang back and plink a low-power orange `laser_m5`. **M6** pack robots attack in waves of 3-5 (attack/withdraw; a lone one waits at the pack edge until `M6_PACK_MIN` gather).
- **Violation response.** Tripping the breach: the core throws a full first wave then keeps **manufacturing** reinforcements every `PRODUCE_INTERVAL` (6s) up to `GUARD_CAP` (12). Guards **pathfind through the maze** (new BFS `guardNextWaypoint` + cached `pursueMaze`) to confront you, relentless — an aggro'd M5/M6 is exempt from the `ACTIVE_RANGE` CPU-cull and the short LOS give-up, hunting on a longer `FORTRESS_FORGET` (20s-no-glimpse) timer so it threads the whole maze but a truly-escaped player still shakes it (→ alarm stands down). **M5 snipers hold back in the quad** (path to a muster post, camp, fire on a sightline); **M6 packs** run the corridors to melee.
- **Maze red alert.** While alarmed, the maze-wall sconces switch from their slow cyan/amber glow to a fast **red strobe** (`fortress.update` sets `map.fortressAlarm`; the renderer reads it in `drawFortWall`).
- **Fortress map from fragments.** Five `fortress_map_fragment` scattered wide (ruins/woods/meadows, 7 placed) → press **C** to piece a `fortress_map`; carry it into the maze and the green way-out trail lights **on entry** (no map = thread it blind). Replaces the old "lights on solving it".
- **AI name fix.** The fortress core/terminal/messages read "Adamantine" (stale `fortress.js` constant); corrected at source to **ZEUS** — one of the four crowns (ZEUS/APOLLO/ATHENA/HADES; POSEIDON is the net between them), with the main.js override removed and every comment swept.
- *Open nits for a later balance pass:* the M6 pile-on is very lethal; M5 sightlines from the quad depend on where you are.

### v1.57 — notepad Contents drop-down, footer nav removed, docs/help SKYLINK→POSEIDON sweep
- Notepad footer prev/next removed; all nav on the top bar (‹ ›, counter) plus a new
  `#ronnotebook-jump` Contents `<select>` grouped by section (optgroup), value = page
  index. `buildNotebookJump()` populates it in `openNotebook`; `syncNotebookNav` reflects
  the current page; change handler → `notebookJumpTo`. Dead footer refs removed from main.js.
- Docs/help currency: `ronmap-title` and the static `aios-header` placeholder → POSEIDON
  (JS already set POSEIDON CORE at open); Help machines/terminal tabs SKYLINK→POSEIDON;
  `docs/ob-terminal-language.md` SKYLINK→POSEIDON. README cert description fixed (paper +
  ranked, no portrait — was still the pre-v1.51 stone/portrait text); marble temples + flat
  sea added to the world summary; notepad-nav wording updated.

### v1.56 — whole deleted shelf in the Backspace, album art wired in, top-bar note nav
- **Every deleted book + record gets its own yellow box.** `underworld.js` now
  shuffles all `pbook_*`/`record_*` keys and deals them round-robin across the
  rooms (guaranteed placement, several to a room) instead of a random ~50% scatter.
  Map enlarged (`UW_SIZE` 128→176, `UW_MAX_ROOMS` 15→24, scatter attempts 90→240)
  to hold ~35 boxes. Verified: all 23 books + 5 records present on a test seed.
- **Unused album art wired in.** Four new `DELETED_RECORDS` (Astral Weeks, Five
  Leaves Left, Hunky Dory, Music Has the Right to Children — the last renamed to
  add its missing `.webp` extension); the WARD cassette (`tape_3`) gets a `cover`
  (bear stanhope.png), and the tape ITEM now carries `cover` so the notepad shows it.
- **Notepad top-bar nav.** `‹ page ›` added to the notepad header (index.html) beside
  the ✕; `main.js syncNotebookNav()` keeps top + footer counters/disabled in lockstep.

### v1.55 — flat seas, responsive HUD, ruined temples, RON-ML primer
- **Sea always flat.** `coast.js stampCoast` zeroes terrain height on every tile
  it turns to `sea` (coast runs after the height pass, so edge hills were keeping
  elevation), and `Renderer.drawFloor` draws the `sea` branch BEFORE any
  skirt/elevation code — an un-zeroed sea tile otherwise leaked dark, sea-coloured
  hillside faces that floated as triangles over the water.
- **HUD responsive.** `drawDashboard` now hands anything narrower than 780px to
  the reflowing `drawDashboardCompact` (was 560px); the full desktop layout's
  fixed x-positions collided (walkman into the status text) between ~560 and ~780.
  The compact block also shows the rank now.
- **Marble temples.** `ruins.js` drops the full-height columns (only broken stumps
  read well), adds fallen **marble blocks** (new `marbleblock` object +
  `Renderer.drawMarbleBlock`), and rings each grove with trees.
- **RON-ML manual = a primer.** `book_ronml.notepadText` rewritten to explain
  RON-ML as a small functional language (an ML dialect), how it composes
  expressions rather than steps, with worked examples — not just a verb list.

### v1.54 — Scrapbook fills out, lore thinned, RON-ML cheat-sheet, SW graffiti
- Books/albums file a Scrapbook page (cover + author + gloss) on read/pickup;
  notepad sorted into Field records / Books / Albums with cover thumbnails.
- Lore dealt into only ~half the caches as fat "stacks of papers" you unfold.
- RON-ML manuals file a literal cheat-sheet; graffiti also on SW wall faces;
  notepad gained a ✕ close for touch.

## Planned / backlog

**Near term (agreed direction)**
- **8×8 factory + AI key.** Make the W-factory a big 8×8 structure (train-textured), with a damage bar shown when you're near, that takes many hits to destroy and drops an **AI key** on death. Sets up the "why" for the OB terminals below.
- **OB terminals + a mini ML-style language (the big creative one).** An accessible screen on obelisks where you type short functional-style code fragments seeded in the lore: `SLEEP`, `REPEL`, `CRASH` (needs a hex code from `HACK`), plus a Portal-choir easter egg (robots line up, sing, deactivate). A small language the player genuinely learns to hack machines. Needs its own design pass (grammar, verb set, how HACK→CRASH chains, gating codes behind not-getting-hit).
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
- ~~**Weeping angel robot (T3).**~~ Built, then scrapped before ever being pushed: the freeze-while-watched mechanic worked as coded, but on reflection a tactical ambusher fit the game's existing W1/W4 hunter roster better than a novelty gimmick. Shipped in v1.12 instead as an ambush sniper — see the changelog.
- **Sight cone with peripheral indistinctness.** Render things outside the player's facing cone (now driven by the mouse, so this is cheap to compute) as dimmer/blurrier/desaturated — true peripheral vision rather than full-fidelity 360° awareness. Raises the stakes on facing choices (aiming at one threat leaves you genuinely worse at spotting another). Implemented (`renderer.js`, `drawSightCone`) but currently switched off (`SIGHT_CONE = false`) pending tuning.
