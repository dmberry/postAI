# postAI

**Version:** 0.71 · **Authors:** David and Henrik · **Started:** 4 July 2026 · **Repo:** https://github.com/dmberry/postAI · **Plans/suggestions:** [PAI-version-plan.md](PAI-version-plan.md)

*(Versioning policy: 0.01 increments from v0.3 onwards.)*

An isometric 2D survival game set in a world devastated by an AI takeover. Civilisation collapsed fighting the machines, and the machines are still here: black obelisk towers pulse across the landscape and T-class hunter robots patrol around them, hunting the humans that remain. Survivors scavenge the ruins while avoiding both the machines and wild animals that have gained strange powers; a resistance calling itself **RON** — Reality or Nothing — hid weapons in caches through the broken towns, and their name still turns up sprayed on walls. Whether RON is still out there is never settled. How it all happened is never stated: the player pieces it together from newspapers, diaries, floppy disks, VHS tapes, and dead computers scattered through the world.

Inspired by Project Zomboid: knowledge is the real progression, scarcity drives movement, every fight is optional and risky, and the world tells the story.

## Current build (v0.71)

**The world:** a seeded 128x128 isometric map — a river with two bridges, a ten-building town, a ruined hamlet, forests, tall grass, and roads. Away from the towns the terrain gets properly rugged: steep hills and deep hollows, always climbable one step at a time. Rubble and rocks are low enough to step straight over; a **wall block** is taller, so it takes a **double jump** (press jump again in mid-air) to get on top — once up there you move a little slower for control, can roam the block tops, and just walk off any edge to drop back down and carry on. Building walls still stop you on foot, so a town or house is a real boundary until you deliberately climb it. The forests are drawn with proper hand-drawn tree art — mostly full leafy trees, with the odd small or bare/dead one — and a chopped tree shows a damage bar so you can see how many swings it has left. The map is ringed by impassable grey rock cliffs at its edge. Streams can be waded; the river can be swum, slowly and at a cost. Day and night cycle, with genuinely dark nights and torches to push them back.

**Survival:** food, health, stamina, and venom all need managing. Health only recovers when fed and unpoisoned — slowly on its own, or press **B** to rest 10 game-minutes for a much faster recovery, if you're hurt, off cooldown, and nothing's hunting you. Dying wipes score, skills, and kills and restarts the run from scratch, same as starting a New Game (**N**) yourself.

**The machines:** black obelisk towers anchor wheeled **T1** hunters (can't climb — trap them in a hollow) and biped **T2** stalkers (match your walking pace exactly). Topple a tower and the W-factory answers with melee **W1** revenge squads and a ranged **W4** laser hunter-killer; unarmed **W3** drones repair damaged obelisks left standing; **W2** droids patrol the river. Every hunting machine needs genuine line of sight — break it behind cover and it gives up. Crossing a slope costs a machine effort too, same as it costs you stamina — expect any of them to slow down climbing or descending a height step. Machines never overlap each other's tile — a crowd spreads out automatically — and a collision between two of them chips both, so a jammed-together squad is quietly hurting itself. All of them run on a battery: a drained one goes flat and inert, and can either be **reprogrammed** (**R**, costs a battery — it fights for you) or just destroyed for scrap if you'd rather not bother.

**Combat & weapons:** a full armoury from the penknife up through swords, guns, and a railgun, viewable with a power rating in the Armoury (**V**) as you find each one. Bombs come in four sizes. Melee and gun practice both build XP over time. Every ranged weapon fires by line of sight and stops at a solid wall; pulling the trigger with nothing in view still spends the round. The **OB-gun** brings down obelisk towers (or corrupts a robot into a **zombie**, killable only by the bow or wave gun); the **wave gun** fans laser fire through a crowd.

**Story & progression:** books teach permanent skills (woodcraft, herbalism, tracking, fleet foot). Lore fragments scattered through the ruins build into a scrollable Archive (**J**) — newspapers, diaries, disks, tapes — that never quite states what happened, only lets you assemble it. RON graffiti and abandoned cars litter the world for texture. Resistance caches restock over time.

**Character & UI:** play as Adam, Eve, or Neve (or a custom name), now rendered as a directional pixel-art sprite with a real walk cycle that turns to face wherever you aim. Backpack (**I**), skills (**K**), Armoury (**V**), and Archive (**J**) all close on **H** — or by clicking away from the panel, same as the help modal. Dying (or winning) shows a shareable Certificate of Death.

**Win condition:** a countdown runs to SKYLINK's completion. Destroy every obelisk before it finishes and you win; run out the clock instead and every surviving tower links up for an escalating W4 onslaught. Even then it isn't hopeless: felling a tower mid-purge collapses the SKYLINK web and shuts it down for a reprieve, until a repair drone reaches the wreck and raises the tower again. Knock them down faster than they can be rebuilt and you can still win outright during the purge.

**Still queued (large systems):** a mobile phone + RON text tips.

Created by David and Henrik.

## Version history

Full technical detail (root causes, exact numbers) lives in [PAI-version-plan.md](PAI-version-plan.md); this is the one-line summary.

| Version | Summary |
|---|---|
| v0.71 | Fell a tower mid-SKYLINK to shut it down (repair drone rebuilds it); rock-block map edges; small/dead trees + tree damage bar + faster chop; far-away robots/animals skip their AI to save CPU |
| v0.70 | Hand-drawn tree art; slower, steadier walk on block tops; walk off a block edge to drop down and keep going |
| v0.69 | Double-jump onto wall blocks and roam their tops; textured box lids; graffiti orientation fixed; gentle idle sway on the player |
| v0.68 | Machine gallery robots drawn larger inside their help-modal boxes |
| v0.67 | Smaller player sprite, robots hurt each other on collision, bigger machine gallery pictures in help |
| v0.66 | Robots now slow crossing a height step, either way; README pruned to a current-state summary + this table |
| v0.65 | Directional character sprite with a real walk cycle, replacing the procedural body |
| v0.64 | Fixed v0.63's walls-wrongly-climbable bug; reverted that version's sprite attempt |
| v0.63 | Rugged taller terrain, real climbing, sleep mechanic, fire-without-target, graffiti warp fix |
| v0.62 | Fixed texture shimmer; every hunting machine now needs genuine line of sight |
| v0.61 | Combat tuning, thrown bombs in an arc, a machine gallery in the help modal |
| v0.60 | Fixed a face-covering bug and a real performance regression; ammo doubled; bare-handed combat |
| v0.59 | Fixed line of sight to respect terrain; softer photo textures |
| v0.58 | Real photo textures on floors, walls, and player faces |
| v0.57 | Weapons now respect walls (no shooting through them); death is final |
| v0.56 | Added pause (**P**); SKYLINK's purge no longer ends on a fixed timer |
| v0.55 | Countdown to SKYLINK halved to 12 hours |
| v0.54 | SKYLINK's final purge: obelisks link up, W4 onslaught, then the ending plays |
| v0.53 | Fixed the help modal's name field eating shortcut keys; better W4 loot |
| v0.52 | Reload/close-tab warning; fixed the countdown starting short |
| v0.51 | Every weapon and tool now guaranteed to spawn in a run |
| v0.50 | W1s spawn at the factory; W4 patrol clock; 24h deadline; five weapons placed in-world |
| v0.49 | W1 wave attacks and triangulated tracking; W4 laser hunter-killer; guaranteed circuit set |
| v0.48 | Win condition (destroy every obelisk); W1 revenge squads; W3 repair drones; zombie machines |
| v0.47 | Timed bombs; wave gun; W2 water droids; expanded death-rank ladder; scrolling Archive |
| v0.46 | Permadeath (lose everything); Armoury screen; new weapons; regrowing trees; New Game |
| v0.45 | SKYLINK countdown; destructible obelisks (OB-gun); 128 lore fragments; skills screen |
| v0.44 | Health bars; right-click inspect; drag-and-drop; Certificate of Death; autosave |
| v0.43 | Score; swimming; big smashable cars; click-to-equip |
| v0.42 | Wall decay; taller terrain; jump-to-climb; shovel traps; instant book/note pickup |
| v0.41 | Zoom toggle; Wi-Fi block; animated tool use; lore fragments and the Archive |
| v0.40 | Item icons; XP/skill tracking; watchful obelisks |
| v0.39 | RON named as the resistance |
| v0.38 | First lore: graffiti and abandoned cars |
| v0.37 | Backpack system; ambient music |
| v0.36 | Drop key; cache searching with either hand; minimap fog; version display |
| v0.35 | Always-face-cursor aiming; auto-unstuck from solid geometry |
| v0.34 | Pocket/hands loadout system; bodies no longer overlap |
| v0.33 | Batteries, reprogramming, and the first guns |
| v0.32 | Machines, obelisks, and the first melee weapons |

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
src/main.js         bootstrap + fixed-timestep game loop
src/engine/         iso maths, renderer, camera, input
src/game/           tiles, map, player, robots, animals, lore (game content)
```
