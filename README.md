# postAI

**Version:** 0.64 · **Authors:** David and Henrik · **Started:** 4 July 2026 · **Repo:** https://github.com/dmberry/postAI · **Plans/suggestions:** [PAI-version-plan.md](PAI-version-plan.md)

*(Versioning policy: 0.01 increments from v0.3 onwards.)*

An isometric 2D survival game set in a world devastated by an AI takeover. Civilisation collapsed fighting the machines, and the machines are still here: black obelisk towers pulse across the landscape and T-class hunter robots patrol around them, hunting the humans that remain. Survivors scavenge the ruins while avoiding both the machines and wild animals that have gained strange powers; a resistance calling itself **RON** — Reality or Nothing — hid weapons in caches through the broken towns, and their name still turns up sprayed on walls. Whether RON is still out there is never settled. How it all happened is never stated: the player pieces it together from newspapers, diaries, floppy disks, VHS tapes, and dead computers scattered through the world.

Inspired by Project Zomboid: knowledge is the real progression, scarcity drives movement, every fight is optional and risky, and the world tells the story.

**The machines (v0.32):** T1 is a wheeled hunter, faster than your walk but unable to climb — put a rise between you, or bait it into a hollow and it is trapped for good. T2 is a biped that stalks at exactly your walking pace and never tires; sprint or fight. The penknife barely scratches them: search the resistance's crates in buildings (E) for bats, machetes, and the crowbar, the machine-killer. Wrecked robots drop scrap. The obelisks cannot be destroyed. Yet.

**Batteries and guns (v0.33):** every machine runs on a battery. Hunting drains it; they trundle back to their obelisk to recharge, and one that gets stuck runs flat where it stands. A drained machine can be **reprogrammed** (R, costs a battery): it turns friendly, follows you, and a friendly T2 will fell trees for you. The caches now also hold ranged weapons: the **stun-gun** drops a machine cold for a good while, the **electro-gun** fuses one permanently into a blackened wreck you can mine for scrap, and the **pistol** and **shotgun** simply punch holes in things (flesh included) — though gunfire mangles the salvage. All of them are dead weight without **batteries**, **ammo**, or **shells**, also hidden in the caches. Machines wear their designation (T1/T2) on their hulls.

**Loadout and bodies (v0.34):** press **1-4** to select a pocket slot, then **G** to swap it with whatever's in your hands — put a weapon away, pull another out, no need to drop anything (only tools and guns can go in the hands slot). Pocket contents now show their name in tiny writing under each slot. You can no longer stand in the exact same spot as an animal or robot; bodies push apart so a target is always in reach and nothing traps you by overlapping. The on-screen control hint fades out after two minutes of play.

**Aiming and recovery (v0.35):** you now always face the mouse cursor, independent of movement — strafe around a target while keeping a weapon trained on it. Using the held tool is now **/** or **left click**, freeing up Ctrl/Cmd. If a fight (or a bad respawn) ever leaves you wedged inside a wall or a machine's collision box, you're automatically pushed out to the nearest open tile.

**Housekeeping (v0.36):** press **F** to drop the selected pocket's contents, or the tool in hand if no pocket is selected. A gun no longer blocks your other hand — a resistance cache in front of you is always searchable, whatever you're holding. Dying always leaves you with a penknife in hand, never empty-handed. Guns now show their remaining ammo count on the hands slot. The minimap's fog of unexplored ground is grey rather than black, and the version number now sits under the postAI logo, top-left.

**Backpack and mood (v0.37):** find a **backpack** somewhere in the ruins and it carries itself from then on — 16 more slots plus one spare-weapon slot, filled automatically once your pockets are full. Eating and firing a gun draw from it too, once the pockets run dry. Press **5** then **G** to swap the spare weapon, **I** to see what's inside. Die and you drop the backpack, and everything in it, where you fell. A haunting, sparse solo-piano ambience now plays softly in calm moments — it fades out while you're fighting or being hunted, and fades back in once it's safe; **P** turns it off or on. Grass tiles now carry a little blade texture instead of a flat fill.

**First lore (v0.38):** the ruins now carry a little history. Sprayed slogans turn up on a sparse scattering of walls — fragments, never an explanation, of who fought the machines and how. Abandoned cars sit dead on the roads here and there, left where the grid failed.

**RON (v0.39):** the resistance has a name now — **RON, Reality or Nothing** — and it shows up in the graffiti: some of it reads like a living movement (*RON LIVES*, *RON NEVER LEFT*), some like an epitaph (*RON IS DEAD*, *no one is coming*), painted fainter as if older or written by a less certain hand. Whether RON still exists is left open on purpose; nothing in the game answers it.

**Icons, aim, XP, and watchful towers (v0.40):** every item now draws as a little picture of the thing it is — guns, blades, batteries, food, books — in your pockets, in hand, and on the ground; the held weapon shows in your sprite's hand too, kicking out when swung or fired. Fighting now trains you: melee practice hits harder, gun practice steadies your aim and its range, and reading books builds a knowledge level — all three show in the stats line and, like your skills, survive death. The obelisk towers blink only occasionally rather than pulsing constantly, and when you linger close their light deepens to a saturated blood-red — they have sensed you, and quietly steer nearby patrols to sweep the area (never your exact position). Machines now carry a faint drone that swells as one nears, and the crickets fall silent around any active robot — they are scared of them too.

**Zoom, jamming, and the first fragments (v0.41):** the game now plays at a closer over-the-shoulder zoom by default; press **Z** to pull the camera out to the wide view and back. A rare **Wi-Fi block** hides in one of the resistance caches — hold it and the machines simply cannot find you, their sensors jammed. It runs on a ten-minute charge (shown as a battery gauge on the hands slot); feed it a battery (use key) to keep it going. Using a tool or weapon now visibly animates — melee sweeps through an arc, guns kick back with a muzzle flash — so you can always see a swing land. And the hidden story has begun: scattered paper **fragments** wait in the ruins; walk over one to recover it, and press **J** to open the **Archive** and read what you have found. Six to start, deliberately out of order and ambiguous — the truth is never stated, only assembled.

**Ruin, terrain, traps, and knowledge (v0.42):** the world has more character now. Walls weather through a range of decay — new, old, mossy, breaking down, crumbling — so the ruins read as genuinely aged. The land is more dramatic: hills rise higher and trenches cut deeper. You can **jump** to clamber up onto higher ground you couldn't just walk up. A **shovel** (found in a cache) digs pits: sink the ground in front of you into a steep trap that a wheeled T1 rolls into and can never climb out of, while you can still jump clear. The **Wi-Fi block** no longer needs to be held — carry it anywhere and it jams the machines, drawing on a battery only when one is actually near. **Books and notes are read simply by picking them up** — a book grants its skill on the spot, a note goes into the Archive. The grass texture is sparser, and the aim dot sits further from your character so your facing reads at a glance.

**Score, swimming, cars, and click-to-equip (v0.43):** the dashboard now keeps a **score** — a point for felling a tree (more with a saw or the woodcraft skill), and more again for killing an animal, wrecking a machine, cracking a cache, reading a book, or recovering a fragment; it survives death. You can now **swim across rivers** — slow and exhausting, chipping at your health, so pick your crossing. **Click a weapon or tool** in a pocket or backpack slot to put it straight in your hand (and click the hands slot to stow it). Abandoned **cars are big now** — a six-tile hulk you can **smash open with a crowbar** for what was left inside: a hefty car battery, a salvaged seatbelt, weapons, books, and odds and ends. Finding a lore fragment now shows its text in a soft, transparent note bottom-right that fades on its own or clears when you click. Crickets sing only at dusk now, and the machines' designation reads in a softer grey.

**Health bars, death certificates, and a saved game (v0.44):** a lot of quality-of-life and polish. Go near a creature or a machine and a small **health bar** floats over it, so you can read how hurt it is. **Right-click any tile** to inspect it — the make and model of a car, the age of a stone or brick wall, what a floor is. Item slots now support **drag and drop**: drag a weapon or tool from a pocket or the backpack straight into your hand (or between slots) with the pointer, as well as clicking. **Zoom on the scroll wheel** now, smoothly, with the HUD held at its normal size. Guns fire a visible **round that streaks toward the target**. Buildings come in **red brick** as well as stone, both weathering through the same decay. Dug pits finally hold everything: **animals respect the depth** and can't just stroll out. And when you die you get a **Certificate of Death** — a modal totting up your score, skills, and deaths, and ranking you with a straight face from COMPOST through NOOB up to L33T. Lore fragments in the Archive now read as their own little notes — handwritten, newsprint, terminal-green disks — each in its own typeface on its own paper. Finally, the game **autosaves**: your character, progress, and current run persist to local storage and resume when you come back.

**The clock, the OB-gun, and a library of the dead (v0.45):** postAI has a spine now. A **countdown** runs at the top-right — **seven days** to bring the AI down before it finishes **SKYLINK-9000**; run out and it's game over. The obelisks can finally be **destroyed**: build an **OB-gun** by carrying a stun-gun, an electro-gun and a Wi-Fi block together (you're prompted to press **C**), then set a tower alight — five hits and it collapses into a heap of **circuit boards, batteries and scrap**. Pull down every obelisk before the deadline and you win. The Wi-Fi block now **remembers its charge** when dropped (it used to reset to full — fixed), and a fresh one respawns each time you spend one crafting. The **hidden story deepens hugely**: there are now **128 fragments** across **eight kinds** — science reports, handwritten notes, letters, scraps, code logs, RON messages, redacted intercepts, and torn crafting recipes — each rendered in the Archive as its own note, in its own typeface on its own paper. The dashboard is tidier: the idle/skill clutter is gone, replaced by a **skills screen** (**K**) that keeps your practice levels and the books you've read. Health bars sit a little higher over creatures, and when you **swim** only your head shows, bobbing, above the ripples.

**Urgent fix:** opening a crate bare-handed no longer freezes the game (a null item was being stowed and throwing inside the loop).

**Queued for the next push** (large new systems, not in this build yet): the **W1 hunter-killer robots** and their **AI factory** (released in waves when an obelisk falls), and the **mobile phone** (call to draw every machine to you, or pocket it and receive RON's tips and new weapon designs).

**Higher stakes, an armoury, and a comeback for the forest (v0.46):** the clock is tighter — **48 hours** now, shown as a raw hours-to-SKYLINK countdown. **Death costs you everything** — no more dropping your gear to pick back up; you lose it all and start again with a penknife (so those 48 hours mean something). A new **Armoury** screen (**V**) charts every weapon in the game with a power rating: the ones you've found show named and lit, the rest are faded "???" until you discover them. New weapons to find: a silent, long-range **bow** (and arrows), a piercing **railgun**, a **sledgehammer**, and a **katana** — and the **OB-gun** now doubles as a beam weapon that cuts clean through a whole line of enemies, so the rare one a **T1 might drop** is a real prize. Every obelisk carries a **hex code name** (OB-XXXX) and your kill record keeps them. The lore is spread far more **sparsely across the whole map** now, not piled in the buildings, and a few fragments quietly teach the **OB-gun recipe**. **Trees come in three kinds** and slowly **grow back** — saplings sprout on open ground and thicken over time. And you can now **start a new game** (**N**, with a confirm) or just continue — the game autosaves and reloads your run.

**The war escalates: a win condition, revenge squads, and zombie machines (v0.48):** knocking down every obelisk on the map now gets you a proper victory — bring the whole array low before SKYLINK completes and the AI is defeated. It doesn't take that lying down: the instant a tower falls, a **revenge squad of W1 hunters** boils out of the wreckage, tougher and faster than a T2 and already hunting you, and somewhere on the map a **W-factory** fields unarmed **W3 repair drones** that will quietly mend a damaged-but-not-yet-destroyed obelisk if you leave it too long. Fire the **OB-gun** at a robot instead of a tower and you get a nasty surprise — it corrupts the machine into a **zombie**, immune to everything except the **bow** and the **wave gun**. Every weapon strike on a machine now throws a shower of **sparks**, and the **Certificate of Death** can be shared: press **S** to copy it to your clipboard as an image (or download it) to show off your run. Under the hood, the world's **seed is now randomised** every new game instead of a fixed layout — no more memorising where the guns are — and an emptied resistance cache gets **quietly restocked by RON** every couple of minutes. Every weapon in the game, including the wave gun, bow, katana, sledgehammer and railgun, now has its own hand-drawn icon.

**Bombs, a crowd-killer, droids on the river, and a name for the end (v0.47):** you can now find and set **timed bombs** — small, medium, large, and a rare **insane** one. Hold a bomb and use it to drop it ticking a step ahead; get clear before it goes off in a cloud of fire that hurts everything nearby, yourself included. The insane bomb is powerful enough to **bring down an obelisk** on its own. Toppled towers now drop **numbered circuit boards**: collect all eight and you're prompted to build a **wave gun**, which fans a spread of laser beams to cut through a whole crowd at once. The river has new tenants — **W2 water droids** that hover just above the water in squads; wander onto the bank near them and the whole squad turns and fires on you in waves. Your **Certificate of Death** now ranks you by score across fifteen bands, from **LAME** through NOOB, NORMIE, SNIPER and AI STALKER up to **MEGA L33T**. The **penknife can no longer fell trees** — it just tires you out and nicks your health. Six new lore fragments make **SKYLINK** feel imminent — the towers' single waking mind, hours from completion — and the **Archive scrolls** now, so a full collection no longer runs off the screen.

**Waves, triangulation, and a laser hunter-killer (v0.49):** the machines got smarter. **W1 hunters now attack in real waves** — each one closes in, strikes, falls back, then closes in again, independently of its squad-mates, and they now **swarm around you instead of stacking on one tile**. They also track a position **triangulated from the obelisk network**, refreshed every few seconds rather than live, so a jammed Wi-Fi block no longer makes you fully invisible to them (though a hit still needs one standing right next to you). The **W-factory now dispatches W1 waves on its own clock**, not just as a one-off revenge squad, and fields a new **W4 laser hunter-killer** the instant you attack an obelisk — it holds its range and fires rather than closing to melee. Every obelisk is now assigned one of the eight circuit numbers at world generation, so destroying towers **always builds toward a complete set** rather than risking duplicates forever. Your live rank now shows on the dashboard next to the score, and the **Certificate of Death**'s Copy button (or **S**) copies straight to the clipboard — no more silent download fallback, and the skills line no longer runs past the panel edge. Reloading the page without using New Game now costs you **-1000 score and one obelisk kill off the record** — New Game itself still wipes everything clean and starts fresh. The world is thick with trees now, and the hills and hollows undulate more than before.

**Factory-built hunters, a harsher reload, and a shorter clock (v0.50):** revenge-squad **W1s now spawn at the W-factory itself**, not at the crater of the tower that fell — matching the fiction that the factory is where every W-unit is actually built. They also **can't be corrupted into zombies** by the OB-gun beam anymore (they're already hostile) — it just damages them instead. The **W4 laser hunter-killer now also rolls out on a 30-in-game-minute clock** from the factory, independent of the existing attack-triggered dispatch, capped so it can't snowball. The countdown to SKYLINK is **24 hours now**, down from 48. Five weapons — **bow, arrows, katana, sledgehammer, and railgun** — were fully implemented but never actually placed anywhere in the world; they're now in the resistance caches like everything else. And **reloading the page without a proper New Game now wipes your score and your entire obelisk kill record**, not just a small tax — New Game itself is untouched and still starts you clean.

**Every weapon guaranteed (v0.51):** the penknife, seatbelt, baseball bat, and machete previously only turned up if the random loot roll happened to favour them; they're now guaranteed cache finds like everything else. Every weapon and tool in the game is now findable in a single run — except the wave gun and OB-gun, which stay deliberately crafting-only.

**Reload warning and a countdown fix (v0.52):** reloading or closing the tab now triggers the browser's own "leave site?" warning, since it wipes your score and kill record. Also fixed a real bug: the 24-hour countdown was quietly starting at ~15:00 remaining instead of 24:00 (it was measuring from the day-clock's absolute hour rather than from when the run actually began) — it now genuinely starts at 24 hours.

**Name field fix and better W4 loot (v0.53):** the character name field in the help modal no longer swallows the letter H (or any other game shortcut key) while you're typing — it also has an explicit **Save** button now. Bringing down a **W4** is properly worth it: on top of the usual scrap it now drops three batteries, bonus scrap, and a heavy bomb.

**SKYLINK's final purge (v0.54):** running out the clock no longer ends the game the instant it hits zero. Every surviving obelisk lights up and links to its neighbours in a web of bright blue lasers, a countdown banner appears, and the W-factory throws overwhelming waves of W4 hunter-killers at you for 30 seconds — dozens of them by the end — before the ending plays regardless of whether you're still standing. Dying during the purge is final too, not the usual respawn.

**Deadline halved (v0.55):** the countdown to SKYLINK is 12 hours now, down from 24.

**Pause, and a purge with no clock (v0.56):** **P** now pauses the game (music toggle moved to **M** to make room). And running out the countdown no longer ends things after a fixed 30 seconds — SKYLINK's W4 onslaught just keeps coming, capped so it can't tank the frame rate, and the run only ends when it actually catches you.

**Walls stop bullets, and death is final (v0.57):** a real bug is fixed — weapons could shoot straight through walls. Every ranged attack now checks line of sight against solid objects first. And death now restarts the game from scratch, same as New Game — score, skills, kills, all wiped — since surviving with everything intact after dying stopped making sense once the world got this dangerous.

**Real textures (v0.58):** floors and walls now render with actual photo textures (grass, water, dirt, road, wooden boards, stone, brick) warped to fit the isometric tiles, instead of flat colour fills — day/night and wall decay shading still applies on top. Adam, Eve, and Neve each now show a real face when you look at them. A folder of texture assets (`assets/textures/`) got renamed from opaque asset-pack names to ones that describe what they're for; several more (alternate wall finishes, a graffiti stamp, decor) are renamed and ready for a future pass.

**Line of sight fixed, softer textures (v0.59):** a real bug — line of sight ignored terrain entirely, so a hill between you and a W4 didn't block its shot. Fixed: a tile now blocks sight if it's higher than both ends of the shot. The v0.58 photo textures also read as too busy; they're blended at 55% opacity over the flat colour now instead of drawn at full strength.

**Face fix, ammo economy, a real perf fix, bare-handed combat (v0.60):** the player's face was being covered by the procedural hair drawing (both personas showed only a sliver of chin — that's the "bearded" look reported, not a wrong-image bug). Removed an unnecessary `ctx.clip()` call happening on every floor tile and wall face, every frame — a genuine performance regression severe enough to make picking things back up feel broken. Battery/ammo/shells/arrow quantities doubled across the board. And bare hands can throw a (weak) punch now instead of refusing outright.

**Combat tuning, thrown bombs, a machine gallery (v0.61):** grass texture opacity dropped further. A W4 that loses sight of you for 6 seconds straight gives up and heads home instead of hunting forever. W1s are proper melee now — a hit needs one genuinely touching you, and it hits softer. Bombs are thrown a real distance in an arc that clears a wall or low block in the way, instead of just dropping a step ahead. And the help modal now shows a picture of every machine type, rendered straight from the actual in-game art.

**Texture shimmer fixed, hiding actually works now (v0.62):** floor and wall textures no longer shimmer while moving — a real minification/aliasing bug, fixed by pre-shrinking each source photo instead of re-warping it at full resolution every tile, every frame. Grass opacity dropped further, and a sparse dirt-patch variant breaks up grass tiles here and there. Biggest change: every hunting machine (T1, T2, W1, W4) now needs genuine line of sight, not just proximity — duck behind a wall or a hill for a few seconds and it gives up and wanders off, so hiding is a real tactic.

**Rugged terrain, real climbing, sleep, and real character art (v0.63):** the wilds away from the towns are properly rugged now — taller hills, deeper hollows, more of both — while staying climbable (the height-step rule that guarantees no impassable one-tile cliffs still holds). Rubble and rocks can now be **climbed** and walked across the top of, not just bumped into. Graffiti no longer floats past the blocks it's sprayed on — it's warped to match the wall's actual isometric face. Press **B** to **sleep** for 10 game-minutes and recover health, if nothing's hunting you nearby. Firing at empty air now genuinely fires — it spends the round and sends a tracer out to range instead of silently refusing. Arrows stack to 30.

**Two fixes (v0.64):** walls were wrongly made climbable in v0.63 — since building and town walls are the same object type as standalone obstacles, that let you climb straight over any building or town boundary. Walls are flatly solid again; only rubble and rocks stay climbable. Also reverted the new Kenney sprite player character back to the original procedurally-drawn look, per feedback that it looked wrong.

**Directional character sprites, done right this time (v0.65):** the player is now a proper 3D-rendered character (Kenney's CC0 "Animated Characters Retro" pack) instead of the procedurally-drawn head/torso — but pre-rendered offline into eight screen-facing directions with a four-frame walk cycle, so the character genuinely turns to face wherever you aim and strides when moving, rather than a flat icon rotated in place (the thing that read wrong before). Adam and Eve have their own look; Neve reuses Adam's for now. The old procedural body, the face-photo system, and the retired top-down-shooter art are all gone. The hurt/sprint red flash now tints only the character, not the ground square around it. Rendering is capped at 60fps to stop high-refresh displays from repainting twice as often as the game needs. A reusable offline render tool (`tools/sprite-render.html`) can regenerate the sprite sheets from any Kenney rig.

**Still queued (large systems):** a mobile phone + RON text tips.

Created by David and Henrik.

## Running

No build tools, no dependencies. Serve the folder and open it:

```
python3 -m http.server 8000
# then open http://localhost:8000
```

(Opening `index.html` directly also works in browsers that allow ES modules from `file://`; a local server is the reliable route.)

## Controls

- **WASD / arrow keys**: move
- **Mouse**: aim — you always face the cursor
- **Shift**: sprint
- **Space**: jump
- **E / / / left click**: use the held tool (start with a penknife; face a tree and swing to cut it down — felled trees drop wood you pick up by walking over it; the blade also fends off animals)
- **1 / 2 / 3 / 4**: select a pocket slot
- **5**: select the backpack's spare-weapon slot (if you have one)
- **G**: swap the selected pocket (or spare-weapon slot) with your hands
- **F**: drop the selected pocket's contents (or the held tool, if none selected)
- **I**: view your backpack
- **P**: toggle the ambient music

The dashboard along the bottom of the screen shows health, stamina, the hands slot (current tool), four pocket slots (each labelled with its contents), and current stats.

## The world (v0.2)

A seeded 128x128 world: a meandering river with two bridges, a ten-building town of broken-down buildings, a ruined hamlet across the water, forests, tall-grass meadows, and roads connecting it all. Wild animals roam it, each with a signature move, a readable tell, and a counter to learn:

- **Feral dogs** hunt in packs: they bark ("!") when they spot you, fan out, and bite. Hurt one and the pack breaks off.
- **Boars** paw the ground, then charge in a straight line. Sidestep: a boar that hits a wall stuns itself.
- **Vipers** lurk in tall grass and strike your ankles with venom that drains health over time. Watch for the raised coil.

Killed animals drop meat. If you die, you drop everything where you fell and wake back at the spawn point.

## Tech

- HTML5 Canvas 2D, plain JavaScript ES modules
- 2:1 isometric tiles, painter's-algorithm depth sorting
- Chunk-friendly renderer that only draws the visible tile range
- Saves (later phases) in `localStorage`

## Layout

```
index.html          entry point
src/main.js         bootstrap + fixed-timestep game loop
src/engine/         iso maths, renderer, camera, input
src/game/           tiles, map, player (game content)
```

## Build phases

1. **Iso foundation** — renderer, camera, input, test map, walkable player with collision *(current)*
2. **World generation** — seeded terrain, hills, rivers/bridges, towns with broken buildings, day/night
3. **Survival core** — hunger/thirst/stamina/health moodles, inventory, looting, saving
4. **First animals** — feral dogs, boars, vipers; perception, noise/scent, wounds, death screen
5. **Combat and equipment** — weapons, timed shield blocking, layered clothing protection, durability
6. **Full roster and journal** — all eight animals, animal-vs-animal behaviour, persistent Field Journal
7. **The hidden story** — lore fragments, playback devices and power, the Archive timeline
8. **Polish** — weather, sound cues, balancing, title screen, seed selection
