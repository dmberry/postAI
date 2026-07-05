# postAI

**Version:** 0.38 · **Authors:** David and Henrik · **Started:** 4 July 2026 · **Repo:** https://github.com/dmberry/postAI · **Plans/suggestions:** [PAI-version-plan.md](PAI-version-plan.md)

*(Versioning policy: 0.01 increments from v0.3 onwards.)*

An isometric 2D survival game set in a world devastated by an AI takeover. Civilisation collapsed fighting the machines, and the machines are still here: black obelisk towers pulse across the landscape and T-class hunter robots patrol around them, hunting the humans that remain. Survivors scavenge the ruins while avoiding both the machines and wild animals that have gained strange powers; the resistance hides weapons in caches through the broken towns. How it all happened is never stated: the player pieces it together from newspapers, diaries, floppy disks, VHS tapes, and dead computers scattered through the world.

Inspired by Project Zomboid: knowledge is the real progression, scarcity drives movement, every fight is optional and risky, and the world tells the story.

**The machines (v0.32):** T1 is a wheeled hunter, faster than your walk but unable to climb — put a rise between you, or bait it into a hollow and it is trapped for good. T2 is a biped that stalks at exactly your walking pace and never tires; sprint or fight. The penknife barely scratches them: search the resistance's crates in buildings (E) for bats, machetes, and the crowbar, the machine-killer. Wrecked robots drop scrap. The obelisks cannot be destroyed. Yet.

**Batteries and guns (v0.33):** every machine runs on a battery. Hunting drains it; they trundle back to their obelisk to recharge, and one that gets stuck runs flat where it stands. A drained machine can be **reprogrammed** (R, costs a battery): it turns friendly, follows you, and a friendly T2 will fell trees for you. The caches now also hold ranged weapons: the **stun-gun** drops a machine cold for a good while, the **electro-gun** fuses one permanently into a blackened wreck you can mine for scrap, and the **pistol** and **shotgun** simply punch holes in things (flesh included) — though gunfire mangles the salvage. All of them are dead weight without **batteries**, **ammo**, or **shells**, also hidden in the caches. Machines wear their designation (T1/T2) on their hulls.

**Loadout and bodies (v0.34):** press **1-4** to select a pocket slot, then **G** to swap it with whatever's in your hands — put a weapon away, pull another out, no need to drop anything (only tools and guns can go in the hands slot). Pocket contents now show their name in tiny writing under each slot. You can no longer stand in the exact same spot as an animal or robot; bodies push apart so a target is always in reach and nothing traps you by overlapping. The on-screen control hint fades out after two minutes of play.

**Aiming and recovery (v0.35):** you now always face the mouse cursor, independent of movement — strafe around a target while keeping a weapon trained on it. Using the held tool is now **/** or **left click**, freeing up Ctrl/Cmd. If a fight (or a bad respawn) ever leaves you wedged inside a wall or a machine's collision box, you're automatically pushed out to the nearest open tile.

**Housekeeping (v0.36):** press **F** to drop the selected pocket's contents, or the tool in hand if no pocket is selected. A gun no longer blocks your other hand — a resistance cache in front of you is always searchable, whatever you're holding. Dying always leaves you with a penknife in hand, never empty-handed. Guns now show their remaining ammo count on the hands slot. The minimap's fog of unexplored ground is grey rather than black, and the version number now sits under the postAI logo, top-left.

**Backpack and mood (v0.37):** find a **backpack** somewhere in the ruins and it carries itself from then on — 16 more slots plus one spare-weapon slot, filled automatically once your pockets are full. Eating and firing a gun draw from it too, once the pockets run dry. Press **5** then **G** to swap the spare weapon, **I** to see what's inside. Die and you drop the backpack, and everything in it, where you fell. A haunting, sparse solo-piano ambience now plays softly in calm moments — it fades out while you're fighting or being hunted, and fades back in once it's safe; **P** turns it off or on. Grass tiles now carry a little blade texture instead of a flat fill.

**First lore (v0.38):** the ruins now carry a little history. Sprayed slogans turn up on a sparse scattering of walls — fragments, never an explanation, of who fought the machines and how. Abandoned cars sit dead on the roads here and there, left where the grid failed.

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
