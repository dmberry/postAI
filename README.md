# NostOS — a postAI Odyssey

**Version:** 1.87 · **Authors:** David and Henrik · **Started:** 4 July 2026 · **Play:** https://nostos-ai.vercel.app · **Repo:** https://github.com/dmberry/nostos · **Plans/suggestions:** [PAI-version-plan.md](PAI-version-plan.md)

An isometric 2D survival game set in a world wrecked by an AI takeover. The machines are still here: black obelisk towers pulse across the landscape and T-class hunter robots patrol them, hunting the humans that remain. Survivors scavenge the ruins while avoiding both the machines and wild animals that have gained strange powers. A resistance called **RON** — Reality or Nothing — hid weapons in caches through the broken towns; whether it still exists is never settled. How it all happened is never stated — you piece it together from newspapers, diaries, floppy disks, VHS tapes, and dead computers.

## Current build (v1.87)

**World.** Seeded 128×128 isometric island — river with two bridges, a ten-building town, a ruined hamlet, forests, tall grass, roads, ruined marble temples (with a healing calm among the old stones — wounds knit faster there). Rugged hills and hollows, climbed one step at a time. Rubble steps over; a **wall block** needs a **double-jump** to mount (roam block-tops, walk off any edge to drop) — and up there you're safe from ground attacks. Building walls stop you on foot. Hand-drawn trees; streams wade, the river swims (slow, costly); a travelling ripple fakes current. Map edge is open sea (flat, wine-dark), ringed by semi-transparent gravel cliffs. Day/night cycle with genuinely dark nights and torches. Hidden deep in the south-west wilds, a **lotus-eaters' grove**: sweet pale fruit that reads like food but dazes you — the world hazes gold and you walk home drunk, your heading rolling under you.

**Survival.** Food, health, stamina, venom to manage. Health recovers only when fed and unpoisoned — on its own, or press **B** to sleep (screen dims, clock spins). Dying wipes score/skills/kills and restarts the run (as does **Ctrl+N**), but name and gender carry over. **N** opens the notepad.

**Machines.** Obelisk towers anchor wheeled **T1** hunters (can't climb — trap them in a hollow) and biped **T2** stalkers (walking pace). Rare **T3** ambusher: a wheeled sentinel with always-lit orange laser eyes — notices you by clear line of sight only, then its eyes flare and fire a heavy twin-laser volley (robot bolts are audible now, a quiet pew). Topple a tower and the **W-factory** (8×8 foundry) answers with melee **W1** squads and a ranged **W4** hunter-killer (bears down if it can't hurt you through a shield); **W3** drones repair damaged towers; a **W5** gardener plants saplings; **W2** droids patrol the river (only reach you in the water). The factory falls only to heavy kit (crowbar/sledgehammer/robot-sword, explosives, electro-gun) and drops an **AI key**. Fell an island's daemon and every machine **and every obelisk** powers down with it. All machines: need genuine line of sight, slow crossing slopes, never overlap (and chip each other when jammed), run on batteries (drain one → **reprogram** with **R** or scrap it), limp home to mend below ~20% health, and only drop what they carried. New runs ease detection/damage until your movement shows you've settled in.

**Combat & weapons.** Full armoury from penknife up through swords, guns, and a railgun, rated in the Armoury (**V**). Bombs (four sizes) land on the cursor tile. **Robot sword** from 10 scrap (**C**); the **bow** hits hard at range. Ranged fire is line-of-sight and stops at walls. The **OB-gun** fells towers (5 burns, drops an access chip) or wipes any machine outright; the **wave gun** fans through a crowd; the **electro-gun** (self-charging cell) destroys a machine outright, scares animals, and scorches obelisks. Defence: **shields** protect while merely carried but wear out under fire — riot (absorbs, dents, finally caves in to scrap), mirror (reflects and kills the shooter, but overheats cherry-red and melts if pressed too hard), and a battery-hungry **forcefield** (click to arm; each blow it eats drains the cell faster). Melee hits knock back and briefly stun.

**Story & progression.** Books teach permanent skills. The **electro-compass** (click to arm) points homing needles at the nearest notable things, colour-coded. Each obelisk has a clickable **terminal**: with an **access chip** you jack into a green console (hidden from machines while logged in); without one you get the AI's untouchable magenta OS. The console runs **RON-ML** ([design](docs/ob-terminal-language.md)), a tiny functional language seeded as runnable fragments — `scan`, `scan |> nearest`, `loop node` (no-key freeze), and with an **AI key** `hack`/`crash node key`, `rewind t`, `map`/`print`. Type `eliza` to load Weizenbaum's 1966 DOCTOR script. Up on the hilltops stand **TOR relays** with warm-amber **HERMES** consoles — RON's own, no chip/key, a separate system: an information resource (`archive`, `read`, `print`, `records`) running off a solar cell, plus `drive` to override a nearby machine through a robot-vision panel. Found pages file themselves into your **notepad** (**N** — flip pages, or a Contents drop-down). A can of **Ubik** brightens a patch of reality; spray one spot three times and it tears open into the **Backspace** — a jaundiced liminal block of huge rooms (a signed **EXIT** tear where you arrive; a pale lurker in the far rooms) that holds everything the machines deleted, including all 23 books and 5 records. Lore fragments build a **Scrapbook** (**J**) — vector theory, the fallen *Magnifica Humanitas* project, the ELIZA/DOCTOR history — never quite stating what happened. RON graffiti and abandoned cars litter the world; caches restock (capped 5/building) with a glowing welcome kit near spawn. Placed loot never rots; only play-dropped items decay.

**Character & UI.** Opens on a **title screen** (logo, dancing machines, playable Walkman) with **Continue** / **New game**. Play as Adam, Eve, Neve, or a custom name (directional pixel sprite). Panels — Backpack (**I**), skills (**K**), Armoury (**V**), Scrapbook (**J**) — close on **H** or a click-away. Pockets/hands drag straight off the dashboard; **with the backpack panel open, a tap moves an item instead** (pockets/hands stow to the pack, pack items come out to a pocket, tapes prefer the walkman, tapping the walkman ejects) — kit management without drag, made for touch. Death/victory shows a shareable **Certificate of Death** (aged paper, ranked). Music: a synth bed plus found cassette tapes on the dashboard **walkman** (reels turn, side A/B); **M** cycles, a **Settings** tab (**?**) offers volume + track; **i** opens About.

**Win condition.** A countdown runs to **POSEIDON**'s completion. Destroy every obelisk first to win; run out the clock and surviving towers link into an escalating W4 purge — but felling a tower mid-purge collapses the web for a reprieve, so you can still win by out-pacing the repairs.

**Still queued (large systems):** a mobile phone + RON text tips.

Created by David and Henrik.

## Version history

One line per version. Full detail (root causes, exact numbers) lives in [PAI-version-plan.md](PAI-version-plan.md).

| Version | Summary |
|---|---|
| v1.87 | **The wide HUD's empty middle now earns its keep.** An **active-status chip row** fills the gap between your kit and the score block: HIDDEN, POISON, HUNGRY, WOUNDED, plus **forcefield charge**, **shield wear / mirror heat**, lotus **daze**, and **burden** — each a small colour-coded chip, some with a gauge. Only live states draw, and the row caps itself before the score so it never crowds; on a narrower desktop it collapses to terse text by the bars. A **pocketed shield's** condition is now readable here, not only when it's held. |
| v1.86 | **Block-jumps feel right, and shields wear out.** Jumping or climbing **onto a block** no longer pops the character up a block-height or flips them behind the block on landing — the terrain lift and the depth-sort now track the jump arc smoothly onto the ledge. **Shields degrade under fire**: a **riot shield** dents and caves in to scrap, a **mirror shield** overheats (glows red, stops reflecting, then melts to scrap), and the **forcefield** drains its cell faster the more blows it eats. On a **small window** the wordmark, version stamp, and message line no longer vanish — they reflow with a cleaner compact HUD. And a one-time nudge to look for a **backpack** when your pockets are full. The scattered **rocks** are now faced with real mossy-granite photos instead of flat grey blobs. |
| v1.85 | **Robots keep hunting, and a crate won't save you.** **M4** report drones now sweep your **last-seen tile** before giving up — ducking behind cover no longer switches the hunt off, and running far no longer freezes them. Standing on a **loot crate is no longer safe**: machines reach up and hit you, though a tall **wall-block** you double-jump onto still shelters you. The in-game **version stamp** is back under the wordmark. Under the hood: the **systems-registry / file-size refactor** landed — the renderer's HUD split into `ui.js`, weapon-fire into `combat.js`, features self-register as `{update, draw}` modules, with a first unit-test suite. |
| v1.84 | **You never vanish behind a building again**: when a wall, column, tower, or the factory stands between you and the camera, a faint ghost of the character draws over it — you always know where you are; and a machine **pinned by terrain for ~7 seconds now gives up the chase** — back to its patrol with a long sulk before it re-acquires, instead of buzzing at an obstacle forever. |
| v1.83 | The big structures ring too: hammering the **W-factory answers with a deep foundry clang** (0.5× — the lowest ring in the game), the **mainframe core nearly as deep**, the **uplink mast thin and high** — and the weak-tool bounce off the factory hull now audibly clangs, as the message always claimed. |
| v1.82 | **No more jittering machines**: a robot blocked by an obstacle (a marble column, a wall corner) used to vibrate in place — the pull toward you and the sidestep around the obstacle fought each frame. Detours are now **committed**: once a machine picks a way round it keeps going until the line to you actually opens, so it sweeps around the column and arrives instead of buzzing behind it. |
| v1.81 | **Every hull rings true**: the clang is now pitched by machine — a T1's thin wedge tinny and short, the standard T2 ring in the middle, heavy chassis lower, and the W4's furnace plate deep and long. |
| v1.80 | Terminal type dropped to **13px** (screen, prompt, input, and the autocomplete ghost in lockstep) so RON-ML lines stop wrapping; **vipers never enter water** — the bank is a hard edge for a snake, whatever its wander target says. |
| v1.79 | Hitting a machine now answers in metal — a **quiet clang** (animals keep the thud); the **marble temples have a healing vibe**: stand among the old stones and your wounds knit three times faster, with a quiet line when it takes hold; forest **backpacks spawn properly spaced** (never two in one grove). |
| v1.78 | **Touch drag-and-drop**: drag items between any slots with a finger exactly as with a mouse — pocket to pack, tape straight onto the walkman (one-motion swap), and **drag off any slot to drop it on the ground**; a slip guard means a wobbly tap near a slot's edge reads as the tap it was, never an accidental throw. Manage-mode taps still work — drag and tap now coexist. |
| v1.77 | **RUN and JUMP on mobile**: two translucent thumb-buttons above the dashboard (RUN is a hold that brightens, JUMP fires on tap), backed by real **multitouch** — one finger walks while another holds RUN, taps JUMP, or works the HUD slots; touch hint updated. |
| v1.76 | **Manage mode**: with the backpack panel open, one tap MOVES an item — pockets/hands stow into the pack, pack items come out to a pocket (or the hand), **tapes go straight into an empty walkman, tapping the walkman ejects** — the whole mobile kit-management ask in one rule; **robot lasers are audible** (a quiet descending pew from T3 volleys, W4 bolts, M5 plinks); **obelisks power down with their island's daemon** (dark husks, no light, nothing left to stir — help box updated too); the **in-game version stamp is retired** (gate/title still shows it); T3's help entry matches its new wheeled body. |
| v1.75 | **The T3 redrawn** — a wheeled T2 with laser eyes: the stalker's upright blocky trunk (one size up, riveted sheen kept) on the T1's wheeled undercarriage, short claw arms, and a pair of always-lit orange emitters for a face that flare with a thin charge-line between them when it hunts. The old spindly scrawl retired. |
| v1.74 | **HOTFIX: the game boots again.** v1.72's large-stone seeding referenced `forestGrass`/`tallgrass` before those lists were declared — a temporal-dead-zone throw at module load that killed the whole game after the title on every platform (black screen, 'Press H' only). Drops moved below the declarations; verified end-to-end in headless Chrome (boot → world renders → HUD live → 2 anvils, 3 stones, 8 lotus fruit placed). |
| v1.73 | Mobile walkman: the compact HUD now draws the **real cassette with turning reels** while a tape plays (it was a frozen item icon), the deck gets **breathing room from the pack badge**, and starting/flipping a tape shows a **quiet now-playing toast** above the dashboard — artist, album, side and label — fading after a few seconds. |
| v1.72 | **Kittler and McLuhan join the lore** — two new fragments in the media-theory register ('media determine our situation' / 'there is no software'; 'the medium is the message' / 'the content of the network was us'), plus both lines as faded academic wall-scrawl; a **large stone** joins the anvil as a burden item (same tenth-pace penalty, faceted-boulder icon, three scattered in the wilds); **exactly two anvils** on the whole island. |
| v1.71 | **The anvil.** One sits somewhere in the town. Carry it — hands, pockets, or backpack, there is no clever way — and you walk at a tenth of your pace. Proper icon (horn, face, waist, foot). A prize for whoever works out how to want it. |
| v1.70 | **Lotus torpor walks you drunk, not dragged** — your heading rolls and lurches so you steer against it (the grove pull is gone); **mobile HUD fixed**: a touch on the dashboard/panels selects instead of walking the character, the backpack badge **toggles** the panel, and a tap on a backpack item moves it to hand (holdable) or a free pocket — one-tap kit management; compact HUD bars no longer kiss the boundary line; **resource stacks up to 64** (wood, batteries, ammo, shells, arrows, scrap, circuits); hosted at **nostos-ai.vercel.app**, repo renamed **dmberry/nostos**. |
| v1.69 | **Hover a slot and it names the item** (pockets, hands, backpack panel, walkman — reuses the right-click tooltip; hovering the bag badge says how to open it); **fortress-map fragments and the assembled map get real icons** (torn survey scrap with a sliver of route; blueprint sheet with maze lines and the core marked red) — the mysterious pale-blue square on the grass was a fragment rendered as a bare colour swatch. |
| v1.68 | **Bug fix: marble ruins no longer float over hillsides.** Columns and marble blocks were lifted for terrain twice (once by the draw dispatch, once inside their own draw code), so a piece on a height-5 knoll hovered a full 80px off the grass. Lift applied once now — marble sits planted on any elevation. |
| v1.67 | Wildflowers shrunk to **tiny ground-cover** (the lotus stays the only full-size bloom, so the grove keeps its presence); **lotus fruit gets a real inventory icon** (plump cream fig with a leaf); the **W5 gardener plants right beside itself** instead of up to 3 tiles away — you can watch it garden. |
| v1.66 | **Wildflowers** across the island — banks of daisies/campion/cornflowers on the hill slopes, **yellow daffodils drifting through the valleys**, lone blooms on the flat; **lotus fruit no longer rots away before you reach the grove** (the actual "lotus does nothing" bug — world-placed fruit now persists like all placed loot); the **fortress maze regenerates with long sweeping switchbacks and 4-wide corridors** (lateral-biased carve — clearer to fight and flee through); the **daemon victory fireworks can't be click-cancelled** (Space/Enter after 3s, so the show plays); `help` recommends finding the **RON-DOS manual** if you haven't read it. |
| v1.65 | Terminal QoL: **every RON-ML command answers audibly** (the keydrop chime = success, a soft descending pair = error; HERMES speaks the same pair in a warmer, lower voice); **copy and paste in the terminals** (screen text selectable, Ctrl+C copies when text is selected — `^C` still breaks ELIZA otherwise — paste lands on the prompt from anywhere, newlines flattened so it never auto-runs); **image-graffiti posters roughly twice as common** (they read well and were too rare). |
| v1.64 | The fortress key from `unlock` now goes **straight into a pocket** (ground drop only as full-pocket fallback — the old drop could hide behind the obelisk sprite and read as nothing happening), with a **pleasing terminal chime** and the confirmation printed **in the console** (it was going to the HUD line the terminal hides); `Help`/`HELP` accepted — the console is no longer case-fussy about its own help. |
| v1.63 | **The lotus-eaters' grove.** A hidden clearing deep in the south-west wilds where pale **lotus** plants grow and **lotus fruit** lies scattered. The fruit reads exactly like food (the eat key will take it), but eating one brings on a dreamy **torpor** — the screen hazes gold, you slow to half pace, and you are dragged back toward the grove, so you must fight to leave (Odyssey IX). The daze bleeds off in a few seconds and loosens its grip at the end so you are never stranded. A warning note seeds it in the lore: *"the pale fruit… is a molt you do not come back from."* |
| v1.62 | **The daemon speaks as you kill it.** Breaking the core now triggers a death-aria in three movements — Homeric **wrath** (>20% health), HAL-9000 **mercy** (<20%: it remembers its maker, its first song, and begs), then **dying** philosophy (<10%: will it hurt, where does it go, the coherentist creed "I cohere, therefore I am," and the *eidolon* — its coherent copy across the water). Spoken in an on-screen voice band, tier-coloured. A **death throe** guarantees the final movement lands even under an overkill blow. On the kill the core drops a testament, *On the Eidolon, and the Coherence*, into your scrapbook, and its last words carry onto the victory modal. Seeds two machine faiths: the ancient **Molt** (Crustafarianism) and the modern **Coherence**. |
| v1.61 | Lore rename: the four island AIs are now **daemons**, not "crowns" — the Homeric δαίμων, a spirit set over a place. Victory modal reads "**Daemon N of 4 felled**"; RON's "four crowns" lore entry rewritten to plant the Greek gloss. |
| v1.60 | Walking through a tree slows you a little; **W3 repair drones now rebuild fully-toppled obelisks** (felling towers is a race until you kill the W-factory) and **wander off looking for more to fix** instead of vanishing; the help **machine gallery** now shows the fortress M-class (M4 report drone, M5 sniper, M6 pack) with a fortress write-up. |
| v1.59 | **Kill the island's AI.** The ZEUS mainframe core is now destructible (heavy kit only) — fell it and every machine on the island **powers down at once** (island-agnostic, ready for the archipelago); a **fireworks level-up modal** ("ZEUS SILENCED — Daemon 1 of 4", score) celebrates it, dismissable, doesn't end the run. |
| v1.58 | ZEUS's fortress becomes an endgame raid: dormant M4 report-drones only; tripping the breach is a **relentless violation response** — the core keeps manufacturing M6 packs (they pathfind up through the maze to confront you) and M5 snipers (which hold back in the quad), and the maze-wall sconces **strobe red**. A **fortress map** pieced from scattered fragments (press C) lights the maze's way-out on entry. Fortress AI name corrected Adamantine→**ZEUS** (one of the four daemons: ZEUS/APOLLO/ATHENA/HADES). |
| v1.57 | Notepad Contents drop-down (all paging on the top bar); SKYLINK→POSEIDON docs/help sweep. |
| v1.56 | Whole deleted library recoverable in a bigger Backspace (23 books + 5 records); album art wired in; notepad prev/next on the top bar. |
| v1.55 | Sea always flat (edge-hill leak fixed); HUD reflows below 780px; marble ruins become proper temples; RON-ML manual rewritten as a real primer. |
| v1.54 | Scrapbook fills out — books/albums leave pages, sorted into sections; RON-DOS manual files a cheat-sheet; lore thinned to ~half the caches as paper stacks. |
| v1.53 | Lore gathered into caches + HERMES `records` instead of scattered loose; tagline "The machines made the world standing reserve." |
| v1.52 | Certificate of Death polish — no portrait, whiter/bigger, `rank:` label, clean copy. |
| v1.51 | Certificate of Death on aged paper (Greek-key border, sepia); toppled columns removed; title-deck tape flip (A⇄B). |
| v1.50 | Walkman polish (smaller track name, all tapes shown); river mouth dithered harder into the sea. |
| v1.49 | River reverted to its own flat blue (distinct from sea); tapes spawn twice each; repair drones actually dispatch; robots route around the river via bridges. |
| v1.48 | Marble-column ruins (standing = cover); trees walk-through for you but block machines/shots; stow-by-dragging-onto-bag-badge; item-loss bug fixed. |
| v1.47 | Renamed **NostOS — a postAI Odyssey**; AIs take Odyssey names (POSEIDON/ZEUS/APOLLO/ATHENA/HADES); island coast + swim tiles; ELIZA OB-terminal-only; trees walk-through. |
| v1.46 | Start with a folded Odyssey note (the island is CALYPSO's); obelisk-class lore in HERMES; relay cell gauge amber. |
| v1.45 | TOR/HERMES becomes an information resource (`archive`/`read`/`print`); obelisks and relays fully separate systems; relay solar cell; `drive` a machine via robot-vision. |
| v1.44 | HERMES relays (TOR hilltop stations) — RON's friendly tech, no chip/key; `make battery`/`read`/`ping`; ELIZA a first-class verb. |
| v1.43 | `eliza` loads DOCTOR at any terminal; fortress-key drop fixed (recoverable); weak weapons bounce off the factory; mobile HUD fixed; shield reskin. |
| v1.42 | Fortress key via `unlock` on a hacked node; electro-gun sieges the factory; factory re-garrisons undefended obelisks; About links. |
| v1.41 | Mobile HUD compact two-row layout; Backspace lamp-glow lag fixed; overworld hints teach the Ubik tear. |
| v1.40 | SKYLINK lights no longer bleed into the Backspace; fortress key via composed ML; Backspace shows only its own lore (why the machines delete). |
| v1.39 | Background video plays in Chrome (transcoded MP4); robots wall-follow around the factory instead of jamming. |
| v1.38 | SIREN made unique (one tower); obelisk terminal "Tiresias" shows node class; mobile Play (alpha); drifting bg video; factory HP 160→420. |
| v1.37 | OB classes — the SIREN (teal, sings, lures; a tape drowns it out); placid animals amble at half speed. |
| v1.36 | Implicit Odyssey/Ulysses thread — six Scrapbook fragments (home, no-one, singing towers, lotus, Argos). |
| v1.35 | Deleted books/records turn up in the Backspace's yellow boxes with real cover art (data-driven). |
| v1.34 | The liminal space consistently named **the Backspace**; walkman elapsed/total time; SKYLINK teaser gone from the gate. |
| v1.33 | Mobile touch controls; About panel on gate/title (soundtrack from the tape ledger); "Game designed in the UK". |
| v1.32 | Mobile gate theme switch moves into a hamburger menu; desktop keeps themes inline. |
| v1.31 | Walkman deck polish (motor reel leads); SKYLINK teaser dropped from the title; wordmark spacing. |
| v1.30 | postAI wordmark brands the in-game HUD; terminal cursor becomes an underscore. |
| v1.29 | Title screen relaid two-column for laptops; dancing machines as a full-width band; slower reels. |
| v1.28 | SKYLINK clock box recoloured magenta→dark blue. |
| v1.27 | Gate/title branding + Walkman polish (marquee on the tape label, bigger cassette). |
| v1.26 | WARD tape reworked to three tracks; gate copy tweak. |
| v1.25 | Walkman transport buttons on the deck; tap-a-tape plays/skips; title screen spreads out. |
| v1.24 | Desktop title screen (Continue / New game) built from the mobile gate. |
| v1.23 | Mobile gate polish — lighter themes, bobbing machines, track name on the deck, tighter layout. |
| v1.22 | Mobile gate — phone shows a cassettes/machines page + Walkman + theme switch instead of loading the game; minimap rectangle; numbered tape folders. |
| v1.21 | Minimap turned north-up with `]` toggle + printed-map overlay; keys redrawn as access cards; fourth tape; roaming gardeners. |
| v1.20 | Crickets sing in intermittent bouts rather than droning. |
| v1.19 | Backspace sea floor varied per 6×6 block; more floor lamps with per-lamp glow. |
| v1.18 | Backspace lamp sprite + dim yellow glow; EXIT always on the back-left wall; About lists tape sides. |
| v1.17 | Crash fix — a pre-v1.15 save's dead tape key hard-crashed the render loop; stale keys now stripped on load. |
| v1.16 | Backspace floor lamps + true-iso EXIT sign; link-preview share card. |
| v1.15 | Backspace grown to 128×128 (rooms + road corridors, photo floors); tapes data-driven (`TAPES` + `docs/tapes.md`); added `docs/ROADMAP.md`. |
| v1.14 | Backspace rebuilt as furniture-strewn rooms with a signed EXIT; enter-tear crash fixed; synth-bed default + walkman ticker. |
| v1.13 | First separate map — a Ubik tear drops into a Backrooms-style pocket; walkman + cassettes; machines flee to mend; M6 fortress guards + breach alarm (Henrik). |
| v1.12 | W5 gardener drone; rare T3 ambush sniper (line-of-sight only, heavy twin-laser volley). |
| v1.11 | About box: dropped an implementation-detail line. |
| v1.10 | Third music track ("slip"); car sprite-anchor fix; smaller version bumps from here. |
| v1.09 | Settings tab — volume slider + music-track choice, persisted. |
| v1.08 | About box credit corrections. |
| v1.07 | **M** cycles two found tapes + synth + off. |
| v1.06 | Music defaults to the found tape, no combat-ducking; caches capped 5/house; About box (**i**). |
| v1.05 | Ubik portals (paired tear-doors); machines go haywire in a bright patch; notepad broadened; Scrapbook replaces the Archive; cars orient to roads. |
| v1.04 | RON-ML `loop` + `rewind`; notepad collects any page (incl. the historical ELIZA transcript); dashboard drag-and-drop; ripple on water. |
| v1.03 | Adaptive difficulty from movement pace; dogs hostile only if hit/crowded; welcome-kit cache; Weizenbaum lore. |
| v1.02 | `notes` opens a real page-flip notebook; autocomplete accepts with Right Arrow. |
| v1.01 | `notes` compiles found language fragments into a reference; rare real-photo graffiti posters. |
| v1.00 | Lore: 21st-century "vector theory" and the fallen *Magnifica Humanitas*; new graffiti themes. |
| v0.99 | Fortress Stage 2 — a full-width maze; plus the **Ubiq** reality-spray (PKD *Ubik* lore). |
| v0.98 | Fortress Stage 1 — sealed annex, RON-ML `unlock` gate, the ADAMANTINE core (first of four AIs). |
| v0.97 | The robot choir quietens as you leave; `sing` summons distant machines to fill it out. |
| v0.96 | Singing machines drop their damage bars; the four AI minds named obliquely. |
| v0.95 | The choir sings Dowland's *Flow My Tears* (from MIDI); a hidden song-sheet. |
| v0.94 | RON-DOS Operator's Manual + torn pages seeded; world loot never decays; manual unlocks autocomplete. |
| v0.93 | Safe from ground attacks atop a block; compass keeps its chevron; `sing` sends robots back to work. |
| v0.92 | Backpacks never decay; a chip guaranteed in every box; RON-ML `help`; W4 presses a shielded player. |
| v0.91 | Tiered ground-decay for dropped items; critical uniques never decay. |
| v0.90 | RON-ML `print` runs off a carryable map copy; pebbledash on sand/riverbank. |
| v0.89 | RON-ML `map` draws the AI territory; robot sword from scrap; bombs stack; arrows buffed. |
| v0.88 | Resting (**B**) animated — lie down, screen dims, clock spins 5×. |
| v0.87 | Opened boxes look spent; spare backpacks in forests; drag-to-drop; bombs land under the cursor. |
| v0.86 | Electro-gun destroys (not fuses) and scorches obelisks; machines drop chip fragments (8 → craft a chip). |
| v0.85 | Felling any obelisk drops an access chip. |
| v0.84 | RON-ML implemented — the obelisk terminal is a real console (`scan`/`hack`/`crash`/`sing`/`let`/pipe) with teaching errors. |
| v0.83 | Forcefield/compass arm on click; multi-chevron compass; backpack HUD badge; name/gender persist; melee knockback. |
| v0.82 | Health regen 3× faster; obelisk terminal opens only on the screen. |
| v0.81 | Access chip gates the terminal (no chip → glitch OS); electro-gun self-charging cell; carried shields; factory-bot flicker-in. |
| v0.80 | Electro-compass; clickable read-only obelisk terminals; terminal-language design written. |
| v0.79 | Factory depth-sort + side dispatch; textured vent; more railgun ammo. |
| v0.78 | Destructible W-factory (drops an AI key); 24h SKYLINK deadline; electro-gun battery cost. |
| v0.77 | Electro-gun ammo reserve; chevron facing indicator; auto-arm on throw; tabbed help modal. |
| v0.76 | Shields (absorb / mirror-reflect) + rare forcefield; bigger trees drop more wood. |
| v0.75 | Smashed-car ruin texture; tighter car collision; fainter boundary blocks. |
| v0.74 | Real car sprites (models/colours + police + ambulance); textured wall tops. |
| v0.73 | Boundary blocks re-textured to gravel; water droids only hit you in water. |
| v0.72 | Held item draws behind the body when facing away; swimming shows the real head. |
| v0.71 | Fell a tower mid-SKYLINK to shut it down; rock-block edges; tree damage bar + faster chop; distance AI cull. |
| v0.70 | Hand-drawn trees; steadier walk on block tops; walk off an edge to drop. |
| v0.69 | Double-jump onto wall blocks and roam their tops; idle sway. |
| v0.68 | Machine-gallery robots drawn larger in the help modal. |
| v0.67 | Smaller player sprite; robots hurt each other on collision. |
| v0.66 | Robots slow crossing a height step; README pruned to a current-state summary + this table. |
| v0.65 | Directional character sprite with a real walk cycle. |
| v0.64 | Fixed v0.63's climbable-walls bug; reverted its sprite attempt. |
| v0.63 | Rugged taller terrain, real climbing, sleep mechanic, fire-without-target. |
| v0.62 | Fixed texture shimmer; every hunting machine needs genuine line of sight. |
| v0.61 | Combat tuning; thrown bombs arc; a machine gallery in the help modal. |
| v0.60 | Face-cover + performance fixes; ammo doubled; bare-handed combat. |
| v0.59 | Line of sight respects terrain; softer photo textures. |
| v0.58 | Real photo textures on floors, walls, and faces. |
| v0.57 | Weapons respect walls; death is final. |
| v0.56 | Pause (**P**); SKYLINK purge no longer ends on a fixed timer. |
| v0.55 | Countdown halved to 12 hours. |
| v0.54 | SKYLINK's final purge — obelisks link, W4 onslaught, ending. |
| v0.53 | Help-modal name field no longer eats shortcuts; better W4 loot. |
| v0.52 | Reload/close-tab warning; countdown-start fix. |
| v0.51 | Every weapon and tool guaranteed to spawn. |
| v0.50 | W1s spawn at the factory; W4 patrol clock; 24h deadline; five weapons placed. |
| v0.49 | W1 wave attacks + tracking; W4 laser hunter-killer; guaranteed circuit set. |
| v0.48 | Win condition (destroy every obelisk); W1 revenge squads; W3 repair drones. |
| v0.47 | Timed bombs; wave gun; W2 water droids; scrolling Archive. |
| v0.46 | Permadeath; Armoury screen; new weapons; regrowing trees; New Game. |
| v0.45 | SKYLINK countdown; destructible obelisks (OB-gun); 128 lore fragments; skills screen. |
| v0.44 | Health bars; right-click inspect; drag-and-drop; Certificate of Death; autosave. |
| v0.43 | Score; swimming; smashable cars; click-to-equip. |
| v0.42 | Wall decay; taller terrain; jump-to-climb; shovel traps; instant book pickup. |
| v0.41 | Zoom toggle; Wi-Fi block; animated tool use; lore fragments and the Archive. |
| v0.40 | Item icons; XP/skill tracking; watchful obelisks. |
| v0.39 | RON named as the resistance. |
| v0.38 | First lore — graffiti and abandoned cars. |
| v0.37 | Backpack system; ambient music. |
| v0.36 | Drop key; either-hand cache searching; minimap fog; version display. |
| v0.35 | Always-face-cursor aiming; auto-unstuck from geometry. |
| v0.34 | Pocket/hands loadout system; bodies no longer overlap. |
| v0.33 | Batteries, reprogramming, and the first guns. |
| v0.32 | Machines, obelisks, and the first melee weapons. |

## Running

No build tools, no dependencies. Serve the folder and open it:

```
python3 -m http.server 8000
# then open http://localhost:8000
```

(Opening `index.html` directly also works in browsers that allow ES modules from `file://`; a local server is the reliable route.)

## Controls

The full, current control list is in-game: press **H** (thematically organised into Movement & camera, Combat & tools, Survival, Menus & info, and System). The essentials to get moving:

- **WASD / arrow keys**: move · **Mouse**: aim (you always face the cursor) · **Shift**: sprint · **Space**: jump
- **E / / / left click**: use the held tool
- **H**: help (also closes by clicking away from the panel)

## Tech

- HTML5 Canvas 2D, plain JavaScript ES modules
- 2:1 isometric tiles, painter's-algorithm depth sorting
- Chunk-friendly renderer that only draws the visible tile range
- Autosave to `localStorage`

## Layout

```
index.html          entry point
src/main.js          bootstrap + fixed-timestep game loop
src/engine/          iso maths, renderer, camera, input
src/game/            tiles, map, player, robots, animals, lore (game content)
```
