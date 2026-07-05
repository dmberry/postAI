# postAI

**Version:** 0.45 · **Authors:** David and Henrik · **Started:** 4 July 2026 · **Repo:** https://github.com/dmberry/postAI · **Plans/suggestions:** [PAI-version-plan.md](PAI-version-plan.md)

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
