# NostOS — a postAI Odyssey

**Version:** 1.148 · **Authors:** David and Henrik · **Started:** 4 July 2026 · **Play:** https://nostos-ai.vercel.app · **Repo:** https://github.com/dmberry/nostos · **Plans/suggestions:** [PAI-version-plan.md](PAI-version-plan.md)

An isometric 2D survival game set in a world wrecked by an AI takeover. The machines are still here: black obelisk towers pulse across the landscape and T-class hunter robots patrol them, hunting the humans that remain. Survivors scavenge the ruins while avoiding both the machines and wild animals that have gained strange powers. A resistance called **RON** — Reality or Nothing — hid weapons in caches through the broken towns; whether it still exists is never settled. How it all happened is never stated — you piece it together from newspapers, diaries, floppy disks, VHS tapes, and dead computers.

## Current build (v1.148)

**The archipelago.** The game is now an **Odyssey across five islands**, not one map. You wake washed ashore on **OGYGIA** — Calypso's island, where you are kept, well and completely — and hers is the one daemon you do not kill: her core is indestructible and her guards **detain** rather than finish you. The win there is *leaving*, which is harder. Refunction her at the terminal on her own core and she hands you her shipwright's recipe, the **golden axe**; with it you build a sea-worthy **greek ship** from wood and three found parts (a **sail** at a beached wreck, an **oar** and a **rope** in the fishermen's huts). A raft lashed together without the recipe is always thrown back by Poseidon. Board a boat and you don't pick a destination off a menu — you **row out** until there is no land in any direction, and only then does the **chart** open, each landfall listed with its Homeric epithet. Beyond Ogygia lie **AEGILIA** (the Cyclopes' goat isle: POLYPHEMUS is a single vast eye that watches by genuine line of sight, under a great mountain with a patchy snow-cap in cloud), **AEAEA** (CIRCE does not kill what she takes, she rewrites it — **moly** holds you as you are), **THRINACIA** (HELIOS's cattle graze golden and forbidden), and **ITHACA**, home. Each island generates from its own terrain profile, ground palette and signature landform, carries its own daemon, its own obelisk colour, and its own virus payload, so one card never opens the whole archipelago. Landing somewhere new sets a **checkpoint**. The **Backspace** is an alternative crossing road: its ways up are labelled doors, one per island. **Win** by felling all four martial daemons — leaving Calypso rather than killing her — then sailing home to Ithaca, where Argos lifts his grey head and knows you.

**The sea's own monsters.** The passage between **AEAEA and THRINACIA** runs through a throat of rock. **Scylla** is the cliff: hug it and she takes a few things off your deck, a certain toll paid once, and you are through. **Charybdis** is the whirlpool: chance her and she usually only mauls you — but sometimes she takes the boat and the voyage with it and puts you back on the beach you sailed from. A bounded loss against an unbounded one; neither kills you outright. Make landfall on Aeaea first and **Circe texts you which to take**, as she does in the poem. Never go to her island and you choose blind.

**The phone.** You carry a **Nokia 3310** (**O**). On Ogygia it is Calypso's channel — warnings, tips, pleas, and while her hold on you is warm she'll freeze a machine bearing down on you. Elsewhere the handset finds **whichever AI rules the ground you stand on**, and you can text it: POLYPHEMUS answers in blunt capitals, CIRCE in the language of tariffs, HELIOS like the sun. Signal runs off the island's own network, strongest near a fortress core. Every new landfall brings a **roaming welcome** from a carrier that no longer has customers, only subjects. **Snake** is on it, and it remembers your best game.

**World.** Each island is a seeded 128×128 isometric map generated from its own terrain profile and palette; the shared vocabulary is — river with two bridges, a ten-building town, a ruined hamlet, forests, tall grass, roads, ruined marble temples (with a healing calm among the old stones — wounds knit faster there). Rugged hills and hollows, climbed one step at a time. Rubble steps over; a **wall block** needs a **double-jump** to mount (roam block-tops, walk off any edge to drop) — and up there you're safe from ground attacks. Building walls stop you on foot. Hand-drawn trees; streams wade, the river swims (slow, costly); a travelling ripple fakes current. Map edge is open sea (flat, wine-dark), ringed by semi-transparent gravel cliffs. Day/night cycle with genuinely dark nights and torches. Hidden deep in the south-west wilds, a **lotus-eaters' grove**: sweet pale fruit that reads like food but dazes you — the world hazes gold and you walk home drunk, your heading rolling under you.

**Survival.** Food, health, stamina, venom to manage. Health recovers only when fed and unpoisoned — on its own, or press **B** to sleep (screen dims, clock spins). Dying wipes score/skills/kills and restarts the run (as does **Ctrl+N**), but name and gender carry over. **N** opens the notepad.

**Machines.** Obelisk towers anchor wheeled **T1** hunters (can't climb — trap them in a hollow) and biped **T2** stalkers (walking pace). Rare **T3** ambusher: a wheeled sentinel with always-lit orange laser eyes — notices you by clear line of sight only, then its eyes flare and fire a heavy twin-laser volley (robot bolts are audible now, a quiet pew). Topple a tower and the **W-factory** (8×8 foundry) answers with melee **W1** squads and a ranged **W4** hunter-killer (bears down if it can't hurt you through a shield); **W3** drones repair damaged towers; a **W5** gardener plants saplings; **W2** droids patrol the river (only reach you in the water). The factory falls only to heavy kit (crowbar/sledgehammer/robot-sword, explosives, electro-gun) and drops an **AI key**. Fell an island's daemon and every machine **and every obelisk** powers down with it. All machines: need genuine line of sight, slow crossing slopes, never overlap (and chip each other when jammed), run on batteries (drain one → **reprogram** with **R** or scrap it), limp home to mend below ~20% health, and only drop what they carried. New runs ease detection/damage until your movement shows you've settled in.

**Combat & weapons.** Full armoury from penknife up through swords, guns, and a railgun, rated in the Armoury (**V**). Bombs (four sizes) land on the cursor tile. **Robot sword** from 10 scrap (**C**); the **bow** hits hard at range. Ranged fire is line-of-sight and stops at walls. The **OB-gun** fells towers (5 burns, drops an access chip) or wipes any machine outright; the **wave gun** fans through a crowd; the **electro-gun** (self-charging cell) destroys a machine outright, scares animals, and scorches obelisks. Defence: **shields** protect while merely carried but wear out under fire — riot (absorbs, dents, finally caves in to scrap), mirror (reflects and kills the shooter, but overheats cherry-red and melts if pressed too hard), and a battery-hungry **forcefield** (click to arm; each blow it eats drains the cell faster). Melee hits knock back and briefly stun.

**Story & progression.** Books teach permanent skills. The **electro-compass** (click to arm) points homing needles at the nearest notable things, colour-coded. Each obelisk has a clickable **terminal**: with an **access chip** you jack into an **amber console** (RON's own OS, hidden from machines while logged in); without one you get the AI's untouchable magenta OS. The console runs **RON-ML** ([design](docs/ob-terminal-language.md)), a tiny functional language seeded as runnable fragments, and an **ML top-level** (a bare `let x = e` with no `in` persists for the visit, so you type programs line by line). Reading and hacking need **no AI key** now: `scan`, `scan |> nearest`, `name`, `loop node`, the `hack`/`crash node key` two-step, and the nerfed `sleep`/`repel`/`rewind`. The **AI key** (from a wrecked W-factory) is only for the fortress: `copy aikey` into the console, `decrypt` it, and `unlock k d` with a hacked node key to drop a **fortress key**; the recipe is a found lore scrap, not taught by `help`. `print aikey` stamps spare keys. Type `eliza` to load Weizenbaum's 1966 DOCTOR script. Up on the hilltops stand **TOR relays** with warm-amber **HERMES** consoles — RON's own, the same OS, a separate system: an information resource (`archive`, `read`, `print`, `records`), `drive` to override a nearby machine through a robot-vision panel, and `backup`/`restore aikey` to keep a copy of your AI key that survives death, all off a solar cell. Found pages file themselves into your **notepad** (**N** — flip pages, or a Contents drop-down). A can of **Ubik** brightens a patch of reality; spray one spot three times and it tears open into the **Backspace** — a jaundiced liminal block of huge rooms (a signed **EXIT** tear where you arrive; a pale lurker in the far rooms) that holds everything the machines deleted, including all 23 books and 5 records. Lore fragments build a **Scrapbook** (**J**) — vector theory, the fallen *Magnifica Humanitas* project, the ELIZA/DOCTOR history — never quite stating what happened. RON graffiti and abandoned cars litter the world; caches restock (capped 5/building) with a glowing welcome kit near spawn. Placed loot never rots; only play-dropped items decay.

**Character & UI.** Opens on a **title screen** (logo, dancing machines, playable Walkman) with **Continue** / **New game**. Play as Adam, Eve, Neve, or a custom name (directional pixel sprite). Panels — Backpack (**I**), skills (**K**), Armoury (**V**), Scrapbook (**J**) — close on **H** or a click-away. Pockets/hands drag straight off the dashboard; **with the backpack panel open, a tap moves an item instead** (pockets/hands stow to the pack, pack items come out to a pocket, tapes prefer the walkman, tapping the walkman ejects) — kit management without drag, made for touch. Death/victory shows a shareable **Certificate of Death** (aged paper, ranked). Music: a synth bed plus found cassette tapes on the dashboard **walkman** (reels turn, side A/B); **M** cycles, a **Settings** tab (**?**) offers volume + track; **i** opens About.

**Win condition.** The run is won by **felling all four martial daemons and coming home to Ithaca** — leaving Calypso rather than killing her. Per island, breaking a daemon's core powers down every machine *and every obelisk* on that island. Meanwhile a countdown runs to **POSEIDON**'s completion: run out the clock and surviving towers link into an escalating W4 purge — but felling a tower mid-purge collapses the web for a reprieve, so you can still out-pace the repairs.

**Still queued (large systems):** the rest of the sea's own monsters (Laestrygonians, Aeolus, the Cicones), art for the strait itself, a dead-internet browser of cached pages, and stacked Backspace levels. See [docs/ROADMAP.md](docs/ROADMAP.md).

Created by David and Henrik.

## Version history

The last dozen versions are below. The **complete history — all 215 versions back to
v0.32 — lives in [CHANGELOG.md](CHANGELOG.md)**; it was moved out because it had
grown to four-fifths of this file. Design detail and planning live in
[PAI-version-plan.md](PAI-version-plan.md); what is still ahead is in
[docs/ROADMAP.md](docs/ROADMAP.md).

### Recent (v1.148 … v1.137)

| Version | Summary |
|---|---|
| v1.148 | **The HUD says where you are, and the deadline learns to speak.** In a five-island game the dashboard never said which island you were standing on or whose machines you were fighting. It does now: a boxed **status card** reading `Island:` and `AI:`, kept deliberately grey — supplementary information should not pull the eye — with the **score** as the one coloured thing on it, a plain number bottom-right. A felled daemon is struck through rather than recoloured, so the state reads without spending colour. The **POSEIDON countdown is gone from the HUD**: a number ticking in the corner is wallpaper inside a minute. It arrives as escalating texts instead — automated pre-activation notices from the system scheduling its own waking, in the same flat corporate register as the roaming welcomes, running down from *No action is required of you. No action is available to you.* to a bare **ONE HOUR.** Network-wide, so they reach you on every island. **Rank leaves the HUD too**, into a new **RECORD** block on the skills panel (**K**) with score, rank, daemons felled, islands reached, towers downed, deaths, and the deadline to look up. Also: the touch **JUMP/RUN** labels are centred properly — glyph and word balanced about the middle rather than the word hung off the rim — with a dark halo so they read over sand and graffiti; and Ogygia's roaming welcome loses its stuttered second *Enjoy your stay* and opens in her own voice: **Welcome to my island.** |
| v1.148 | **The HUD says where you are, and the deadline learns to speak.** In a five-island game the dashboard never said which island you were standing on or whose machines you were fighting. It does now: two plain grey lines, `Island:` and `AI:`, label and value at the same size and unboxed — this is reference, to be glanced at, not instrumentation to be watched. A felled daemon is struck through rather than recoloured, so the state reads without spending colour. The **score** is pinned hard into the bottom-right corner of the panel as the one coloured thing on it. The **POSEIDON countdown is gone from the HUD**: a number ticking in the corner is wallpaper inside a minute. It arrives as escalating texts instead — automated pre-activation notices from a system scheduling its own waking, in the same flat corporate register as the roaming welcomes, running down from *No action is required of you. No action is available to you.* through *You are advised to be elsewhere. There is no elsewhere.* to a bare **ONE HOUR.** Network-wide, so they reach you on every island, and they do not replay on reload. **Rank leaves the HUD too**, into a new **RECORD** block on the skills panel (**K**): score, rank, AI disabled, islands reached, OBs downed, deaths, and the deadline to look up. Also: the touch **JUMP/RUN** labels are centred properly — glyph and word balanced about the middle rather than the word hung off the rim — with a dark halo so they read over sand and graffiti; and Ogygia's roaming welcome loses its stuttered second *Enjoy your stay* and opens in her own voice, **Welcome to my island.** |
| v1.147 | **Bug fix: each island now saves its own world.** The run snapshot was written when the game had one island and quietly became wrong when the archipelago landed: `obDown` and `boxesOpened` only ever read CALYPSO's arrays, so felling obelisks or looting caches on Polyphemus, Circe or Helios **saved nothing** — reload and every tower was standing again. Worse, the `fortress` blob serialised whichever island you were on but was restored during module evaluation, when the `fortress` alias still points at Calypso's — so opening Polyphemus's Lion's Gate and reloading wrote that state onto **her** fortress. World state is now keyed by island id and re-applied to each world at the moment it is lazily built, which is also the fix's own trap: the boot score-wipe save fires before the far islands exist, so unbuilt islands are carried forward from the save rather than dropped. Pre-v1.147 saves are folded into the new shape under Calypso and migrate forward on first load. Also: the gate reads **beta** rather than alpha. |
| v1.146 | **The docs catch up with the game.** The README had been left at v1.92 while the build ran on to v1.145 — it still called the phone unbuilt and named the islands APOLLO/ATHENA/HADES, a roster superseded long ago. Rewritten around the archipelago, the sea and the phone, with the win condition corrected (fell all four martial daemons, leave Calypso rather than kill her, then come home to Ithaca) and 53 missing version rows restored. The in-game help gains a **The sea** tab: Ogygia and getting off it, sailing and the chart, the five islands, the strait, the phone, the Backspace road, and coming home — the whole second half of the game, which the help had never mentioned once. `docs/ROADMAP.md` reconciled against the code. |
| v1.145 | **Scylla and Charybdis — the strait that makes you choose.** The first of the sea's own monsters: a hazard that lives *between* islands, on the AEAEA↔THRINACIA passage where Homer puts it (Od. XII). Homer's bargain works because Odysseus has a crew to lose; sailing alone, the shape is kept instead — a certain, bounded loss against an unbounded gamble. **Scylla** takes three stacks off the deck and always lets you through: she reaches pockets and pack storage only, never your hands, and never the **AI card** in any of its three states (no reprint exists, so that exclusion is a tested invariant against a soft-lock). **Charybdis** is rolled — usually a mauling and through, about a 30% chance of being swallowed, the boat going down and you thrown back at the island you sailed from. The strait maims but never kills. Make landfall on Aeaea and **Circe** texts you the advice that is hers in the poem: hug the rock and grieve for the few. Never been there, and you choose blind. |
| v1.144 | **The mountain gets its weather.** Mist ramped hard — temple banks 7→12, summit 9→16, with a high breath floor so it stays a solid cloud instead of thinning to wisps; the summit cloud now spills *past* the white snow-cap onto the darker slopes (pale vapour over white snow barely read) and billows above the peak, so it crowns the mountain. The **snow-cap** is patchy rather than a solid block: a core disc at the summit centre, snow chance falling off with distance and height, fraying into the rock on the lower slopes. A snowy peak, not a wizard's hat. |
| v1.143 | **Landfall now counts as a checkpoint.** First arrival on AEGILIA, AEAEA, THRINACIA or ITHACA writes a Load-list checkpoint (+15 each), so a death resumes from the shore you reached. The **lyre** console gains `time day|night|0-23` to jump the clock and exercise the light ramp, ambience and torch veil on demand — both presets sit after the 09:00 start so the toggle never rolls the day forward into POSEIDON's deadline. Fix: leaving an island by boat stamped the mid-sea row-out coordinate as that island's return position, so sailing back dropped you in the water. A sea crossing now lands at the destination's spawn and clears the departed island's return position, so both ends re-beach. |
| v1.142 | **The camera climbs the mountain with you.** It tracks the ground height you stand on, so the sprite stays centred on the ascent instead of walking off the top of the view; the torch's night-veil and sight cone anchor to the sprite's actual on-screen pixel, matching the lift. Water is **grounded** — rivers and streams are forced to height 0 with their banks relaxed down, so they no longer perch above the terrain. Summit and temple mist tightened (more banks, denser puffs, smaller radius). And the **phone** now connects to whichever daemon rules the island you are on — POLYPHEMUS, CIRCE and HELIOS answer their own tab. |
| v1.141 | **A mountain rises on Aegilia.** One great peak far above the ordinary hills (which cap at 8), stamped with a linear descent so the one-step climb clamp never shaves the summit: bare stone above the tree line, a **snow** cap near the top, an alpine conifer fringe below the rock, and trees terracing up the flanks. SMS messages get a *Sender · HH:MM* header off the in-world clock with a hairline rule, so one sender's texts read apart from the next. Land anywhere and the dead carrier pushes a **roaming welcome** in the flat voice of a company with no customers left, only subjects — Aegilia's reads "Coverage is a single cell. It has already seen you." The five palettes are pushed apart on chroma as well as hue: Aegilia greyed to rock, Aeaea a dark over-fed green, Thrinacia bleached to dry gold, Ithaca the warmest. **Crash fix** (a v1.139 regression): the new voyage-state guard in `persist()` read three variables declared far below it with `let`, while `persist` is called during module evaluation — so any existing save hit the temporal dead zone and threw before boot. Black screen, Continue broken. The v1.139 check passed only because it was tested on a fresh game, where that call site never runs. |
| v1.140 | **Sacred mist over the healing groves.** The old marble temples knit your wounds faster, but nothing showed it. A low, slow swirl of pale vapour now lies over each grove — six soft banks orbiting the centre on a gyre and breathing out of phase, drawn flat on the floor pass so the fallen columns and the player stand up out of it. A benign counterpart to the sea's angry fog. |
| v1.139 | **Bug fix: reloads no longer maroon you on the open sea.** Two failures compounded — the 8-second autosave fired regardless of state, so anyone aboard or mid-voyage had their open-water coordinates written to the save, and Continue then dropped them there: a lone figure on the deep with no boat and no way back. `persist()` now skips any transient voyage state, and boot carries a rescue that spirals outward from a restored sea tile to the nearest walkable land, with a line explaining it. |
| v1.138 | **Bug fix: the black wedge in the sea at the shoreline.** The dark triangle that occasionally bit into the water at a beach was raw canvas, not a fill. A carved hollow (or Thrinacia's sandpit) could leave land at height −1 or −2 beside a sea tile pinned flat at 0, and the floor pass returns early for sea — before the skirt is drawn — so nothing painted the vertical face down to the lower ground. Ithaca had nine such faces on the test seed; Calypso and Helios had none, which is why it looked occasional. Now no ground may sit below sea level at the shoreline (lifted, then relaxed outward so no step exceeds one), and a sea tile paints a downward skirt in its own colour as belt-and-braces. |

### Milestones

The shape of the thing, if you want the arc rather than the detail.

| Version | |
|---|---|
| v1.145 | **Scylla and Charybdis** — the first hazard that lives *between* islands. |
| v1.141 | A **mountain** rises on Aegilia: real elevation, a snow-cap, and weather. |
| v1.130 | **Per-island terrain profiles** — the islands stop being one map five times. |
| v1.123 | **Calypso becomes the daemon you leave, not the one you kill** (depart mode). |
| v1.112 | The **Nokia 3310**: Calypso texts you, and later every island's daemon answers. |
| v1.110 | **HELIOS** lands and the Backspace becomes a crossing road — the archipelago is whole. |
| v1.102 | **CIRCE** — the island that rewrites what you are. |
| v1.98 | **POLYPHEMUS** and the heading chart: more than one island, and a way to choose. |
| v1.95 | **Sailing off Ogygia becomes travel, not the end of the run.** |
| v1.90 | **The escape loop closes** — hack Calypso, build a ship, leave; stage checkpoints. |
| v1.88 | **RON-ML terminal overhaul**: the console becomes an ML top-level you type programs into. |
| v1.85 | The **systems registry** and the first unit tests — features attach instead of growing the hub. |
| v1.58 | **The fortress becomes an endgame raid** with its own M-class guard. |
| v1.47 | Renamed **NostOS — a postAI Odyssey**; the AIs take Odyssey names. |
| v0.32 | Machines, obelisks, and the first melee weapons. The beginning. |

## Running

No build tools, no dependencies. Serve the folder and open it:

```
python3 dev-server.py 8352
# then open http://localhost:8352
```

`dev-server.py` is the one to use while developing — it sends no-cache headers, so a reload always picks up edited modules instead of serving a stale ES module graph. Plain `python3 -m http.server 8000` works too if you don't mind hard-reloading.

(Opening `index.html` directly also works in browsers that allow ES modules from `file://`; a local server is the reliable route.)

## Tests

No framework and no `package.json` — Node's own runner over plain ES modules:

```
node --test test/*.test.js
```

The suite covers the pure rule modules (world contract and crossings, the RON-ML
filesystem and card state machine, ship/boat rules, the day/night clock, the
Scylla-and-Charybdis strait, robots, combat, the systems registry). Anything that
needs a canvas is kept out of them deliberately, which is why those modules are
pure.

## Controls

The full, current control list is in-game: press **H** (thematically organised into Movement & camera, Combat & tools, Survival, Menus & info, and System). The essentials to get moving:

- **WASD / arrow keys**: move · **Mouse**: aim (you always face the cursor) · **Shift**: sprint · **Space**: jump
- **E / / / left click**: use the held tool
- **H**: help (also closes by clicking away from the panel)

## Tech

- HTML5 Canvas 2D, plain JavaScript ES modules — no build step, no dependencies
- 2:1 isometric tiles, painter's-algorithm depth sorting, per-tile height with a one-step climb rule
- Chunk-friendly renderer that only draws the visible tile range
- A **systems registry**: features self-register as `{update, draw}` modules rather than growing the hub files
- A **World contract**: each island owns its own map, spawn, entities and lifecycle hooks, so islands are built in parallel and switched between at a clean frame boundary
- Autosave + stage checkpoints to `localStorage`; the world regenerates from its seed and only mutations are stored

## Layout

```
index.html           entry point, HUD/help/modal markup, all CSS
dev-server.py        no-cache dev server
src/main.js          bootstrap, fixed-timestep loop, wiring, voyages/crossings
src/version.js       single source of truth for the version string
src/engine/          iso maths, renderer, ui, camera, input, sound, systems registry
src/game/            map, worldgen, player, robots, animals, items, lore, terminals
                     (ronml, hermes, eliza), nokia, snake, boats/ships, strait, world
src/islands/         calypso, polyphemus, circe, helios, ithaca — one file per island
test/                node --test suites over the pure rule modules
docs/                design docs and the roadmap (start with ROADMAP.md)
```
