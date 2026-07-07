# postAI

**Version:** 0.97 · **Authors:** David and Henrik · **Started:** 4 July 2026 · **Repo:** https://github.com/dmberry/postAI · **Plans/suggestions:** [PAI-version-plan.md](PAI-version-plan.md)

*(Versioning policy: 0.01 increments from v0.3 onwards.)*

An isometric 2D survival game set in a world devastated by an AI takeover. Civilisation collapsed fighting the machines, and the machines are still here: black obelisk towers pulse across the landscape and T-class hunter robots patrol around them, hunting the humans that remain. Survivors scavenge the ruins while avoiding both the machines and wild animals that have gained strange powers; a resistance calling itself **RON** — Reality or Nothing — hid weapons in caches through the broken towns, and their name still turns up sprayed on walls. Whether RON is still out there is never settled. How it all happened is never stated: the player pieces it together from newspapers, diaries, floppy disks, VHS tapes, and dead computers scattered through the world.

Inspired by Project Zomboid: knowledge is the real progression, scarcity drives movement, every fight is optional and risky, and the world tells the story.

## Current build (v0.97)

**The world:** a seeded 128x128 isometric map — a river with two bridges, a ten-building town, a ruined hamlet, forests, tall grass, and roads. Away from the towns the terrain gets properly rugged: steep hills and deep hollows, always climbable one step at a time. Rubble and rocks are low enough to step straight over; a **wall block** is taller, so it takes a **double jump** (press jump again in mid-air) to get on top — once up there you move a little slower for control, can roam the block tops, and just walk off any edge to drop back down and carry on. **Up on a block you're safe from ground attacks** — machines and animals can't reach you, so a block top is high ground to catch your breath (a bomb blast still finds you, and the flying machines to come will too). Building walls still stop you on foot, so a town or house is a real boundary until you deliberately climb it. The forests are drawn with proper hand-drawn tree art — mostly full leafy trees, with the odd small or bare/dead one — and a chopped tree shows a damage bar so you can see how many swings it has left. The map is ringed by impassable dark-gravel rock cliffs at its edge — drawn semi-transparent so you still see yourself if one stands between you and the camera. Streams can be waded; the river can be swum (only your head and shoulders show above the water), slowly and at a cost. Day and night cycle, with genuinely dark nights and torches to push them back.

**Survival:** food, health, stamina, and venom all need managing. Health only recovers when fed and unpoisoned — on its own at a decent clip, or press **B** to lie down and rest — the screen dims, the clock visibly spins on, and health returns as you sleep — if you're hurt, off cooldown, and nothing's hunting you. Dying wipes score, skills, and kills and restarts the run from scratch, same as starting a New Game (**N**) yourself — but who you are doesn't reset: your chosen name and gender carry over into the new run.

**The machines:** black obelisk towers anchor wheeled **T1** hunters (can't climb — trap them in a hollow) and biped **T2** stalkers (match your walking pace exactly). Topple a tower and the **W-factory** — a huge 8×8 foundry — answers with melee **W1** revenge squads and a ranged **W4** laser hunter-killer (which, if it can't hurt you through a shield or forcefield, stops plinking from range and bears right down on you instead); unarmed **W3** drones repair damaged obelisks left standing; **W2** droids patrol the river — but their shots can only reach you while you're in the water, so pick them off from the bank. The factory itself can be brought down: hammer its hull (a damage bar shows when you're near) and after many blows it collapses, spilling an **AI key** — a way into one AI's mainframe, ahead of the terminal-hacking to come. Every hunting machine needs genuine line of sight — break it behind cover and it gives up. Crossing a slope costs a machine effort too, same as it costs you stamina — expect any of them to slow down climbing or descending a height step. Machines never overlap each other's tile — a crowd spreads out automatically — and a collision between two of them chips both, so a jammed-together squad is quietly hurting itself. All of them run on a battery: a drained one goes flat and inert, and can either be **reprogrammed** (**R**, costs a battery — it fights for you) or just destroyed for scrap if you'd rather not bother.

**Combat & weapons:** a full armoury from the penknife up through swords, guns, and a railgun, viewable with a power rating in the Armoury (**V**) as you find each one. Bombs come in four sizes and stack in a pocket; they land on the tile under your cursor (out to their throw range). Ten scrap can be beaten into a **robot sword** (press **C**), a heavy anti-machine blade; the **bow** is a hard-hitting long-range option. Melee and gun practice both build XP over time. Every ranged weapon fires by line of sight and stops at a solid wall; pulling the trigger with nothing in view still spends the round. The **OB-gun** brings down obelisk towers (five burns to fell one, with a damage bar over the tower as it scorches — W3 drones repair the damage if left standing, so it takes the heavy kit; a felled tower always spills an **access chip** among its salvage, so bringing one down hands you the means to jack into the others) or corrupts a robot into a **zombie**, killable only by the bow or wave gun; the **wave gun** fans laser fire through a crowd. The **electro-gun** now runs on a self-charging internal cell (worth four batteries) that trickles back up while you carry it — it destroys a machine outright in a shower of sparks, scares any nearby animals into fleeing, and its arc even scorches **obelisks** (a slower way to fell a tower than the OB-gun, but it works). On defence there are **shields** that protect while simply carried, no need to hold them: a riot shield absorbs a laser, a **mirror shield** bounces it straight back to destroy the shooter, and a rare battery-hungry **forcefield** wraps you in a green shell nothing gets through at all — a deflector ring shows around you whenever a shield is up. The forcefield is the one exception that needs a deliberate **click** (in whichever slot it's sitting in) to arm; click again to disarm and stop the drain. Landing a melee hit now **knocks the target back** and rattles it for a beat, Minecraft-style, so it can't just stand there trading blows and out-damaging you the instant your swing connects.

**Story & progression:** books teach permanent skills (woodcraft, herbalism, tracking, fleet foot). Carry the **electro-compass** and **click it** to arm it — it stays on until you drop it, and your aim chevron becomes a small cluster of homing needles, one per nearest notable thing, colour-coded (blue factory, green obelisk, yellow dropped backpack, orange dropped OB-gun). Each obelisk has a little **terminal screen** you can click (only the screen itself, not the tower body) to jack in — but you need an **access chip** (carried, not held) to use it: with the chip, a connect bar opens a channel into a live green console, and while you're logged in the obelisk hides you from the machines. Click a terminal **without** a chip and you get the AI's own OS instead — a magenta wall of restless, unreadable data you can't touch. That console runs **RON-ML** ([design](docs/ob-terminal-language.md)), a tiny functional language the resistance left scattered through the ruins as runnable fragments: `scan` lists nearby obelisks, `scan |> nearest` pipes that to the closest one, and with an **AI key** (dropped by a destroyed W-factory) `hack node` then `crash node key` knocks a tower dark for a while. `map` pulls up a schematic of the whole AI territory — obelisks, machines, the factory, and the **mainframe** you're ultimately hunting for; `print` runs off a physical copy that drops at your feet, so you can carry the map and unfold it anywhere (just click it in your inventory). Type `help` for a command reference (or `help <verb>` for one), and once you've found and read **the RON-DOS Operator's Manual** (a book in a cache, with torn pages scattered around), the console autocompletes verbs for you as faded ghost text — press **Tab** to accept. Bad commands get a hint on what to try instead. There's a secret word too, never written down whole anywhere — find it and the terminal lets go of you so you can watch what happens. Lore fragments scattered through the ruins build into a scrollable Archive (**J**) — newspapers, diaries, disks, tapes — that never quite states what happened, only lets you assemble it. RON graffiti and abandoned cars (real 3/4-view sprites — classic saloons in several colours, a police car, an ambulance — pointing every which way) litter the world for texture. Resistance caches restock over time. Loot you find placed in the world — in caches and scattered through buildings — waits for you and never rots; only what's dropped *during play* decays off the ground at its own pace, to keep the world from silting up with salvage: meat and berries go quickly, scrap and ammo linger a while, dropped weapons last longest, and a few irreplaceable things (the Wi-Fi block, the AI key, circuit boards, a backpack) never vanish at all.

**Character & UI:** play as Adam, Eve, or Neve (or a custom name), now rendered as a directional pixel-art sprite with a real walk cycle that turns to face wherever you aim. Backpack (**I**), skills (**K**), Armoury (**V**), and Archive (**J**) all close on **H** — or by clicking away from the panel, same as the help modal. Dying (or winning) shows a shareable Certificate of Death.

**Win condition:** a countdown runs to SKYLINK's completion. Destroy every obelisk before it finishes and you win; run out the clock instead and every surviving tower links up for an escalating W4 onslaught. Even then it isn't hopeless: felling a tower mid-purge collapses the SKYLINK web and shuts it down for a reprieve, until a repair drone reaches the wreck and raises the tower again. Knock them down faster than they can be rebuilt and you can still win outright during the purge.

**Still queued (large systems):** a mobile phone + RON text tips.

Created by David and Henrik.

## Version history

Full technical detail (root causes, exact numbers) lives in [PAI-version-plan.md](PAI-version-plan.md); this is the one-line summary.

| Version | Summary |
|---|---|
| v0.97 | The robot choir quietens as you walk away from it, and a lonely `sing` now summons the nearest machines from across the map to march in and fill out a full choir |
| v0.96 | Singing machines drop their damage bars (the choir reads as a performance, not a fight); the four AI minds — Adamantine, Behemoth, Colossus, Demiurge — named obliquely in new lore fragments |
| v0.95 | The robot choir now actually sings — the opening of Dowland's *Flow My Tears* (parsed from MIDI, synthesised as soft voices), with each machine's red light flashing to its own vocal part so the row blinks out of step; a torn song-sheet of the lyrics hidden in the ruins |
| v0.94 | RON-DOS Operator's Manual + torn pages seeded around the map (teach the console language); world-placed loot never decays (only stuff dropped during play does); reading the manual unlocks terminal autocomplete (faded ghost text, Tab to accept) |
| v0.93 | Safe from ground attacks while standing on top of a block (a bomb blast still reaches you); the electro-compass keeps the normal chevron alongside its homing needles; thinner shield/forcefield deflector rings; `sing` sends robots back to work instead of shutting them down |
| v0.92 | Backpacks never decay (join the permanent-item set); a chip is always guaranteed in a box; RON-ML `help` prints a command reference; W4 hunter-killers close in and press a shielded/forcefielded player instead of plinking uselessly from range |
| v0.91 | Dropped items decay off the ground at tiered rates (perishables fast, salvage slower, gear slowest), fading out over their last seconds; progression-critical uniques (Wi-Fi block, AI key, circuit boards) never decay |
| v0.90 | RON-ML `print` runs off a physical, carryable copy of the map (hold and use it to unfold anywhere); pebbledash texture on the sand/riverbank tiles at a soft opacity |
| v0.89 | RON-ML `map` command draws the AI's territory (obelisks, machines, factory, the mainframe you're hunting); craft a robot sword from 10 scrap; bombs stack; arrows buffed; sleep slower; smaller/higher obelisk damage bar; lighter unopened crates; hint trimmed to bottom-right (sight cone built but parked off) |
| v0.88 | Resting (B) is now animated: the character lies down, the screen dims, and the clock spins 5x while health returns, instead of an instant heal |
| v0.87 | Opened loot boxes clearly look spent (dark, lid thrown open); spare backpacks scattered in the forests; drag an item off the open backpack to drop it; bombs land on the tile under the cursor (capped at throw range) |
| v0.86 | Electro-gun destroys machines outright (not fuses) and its arc scorches obelisks too; every destroyed machine drops a chip fragment, collect eight and press C to craft an access chip |
| v0.85 | Felling an obelisk (OB-gun or insane bomb) now always drops an access chip among its salvage, so bringing down any tower gives you the means to jack into the others |
| v0.84 | RON-ML implemented: the obelisk terminal is a real console now (`scan`, `nearest`, `hack`/`crash`, `sleep`, `repel`, `sing`, `let`/pipe), with teaching errors, lore fragments seeding the language in-world, and `sing` dropping you out of the terminal to watch |
| v0.83 | Forcefield and electro-compass now arm/disarm on click, wherever carried; compass tracks all categories at once (multi-chevron); backpack HUD badge opens the panel on click; name/gender persist through death and New Game; melee hits knock the target back and stun it briefly |
| v0.82 | Health regenerates 3x faster (0.5 → 1.5/s); obelisk terminal only opens on a click on the screen itself, not the whole tower |
| v0.81 | Access chip gates the obelisk terminal (connect bar + hides you while jacked in); no chip shows the AI's glitch OS; electro-gun self-charging cell, spark-kills bots, scares animals; shields protect while carried, mirror shield destroys the shooter; obelisk damage bar; factory bots flicker into existence |
| v0.80 | Electro-compass (chevron homes on the nearest thing, colour-coded); clickable obelisk terminals with a VT220 screen (read-only for now); design written for the terminal mini-language |
| v0.79 | Factory sorts by its centre so trees/machines behind it are hidden; robots dispatch beside it, not inside; grubby textured vent; more railgun ammo; whiter chevron |
| v0.78 | Destructible 8×8 W-factory (damage bar, drops an AI key); 24h SKYLINK deadline; electro-gun sips 5% battery/shot; ravens only perch on big trees; jumpable crates; greyer chevron |
| v0.77 | Electro-gun built-in ammo reserve; cars faintly weathered; facing indicator is a chevron; throwing a bomb auto-arms your best weapon; tabbed help modal; version plan pruned |
| v0.76 | Shields (absorb / mirror-reflect a laser) and a rare battery-powered forcefield; bigger trees drop more wood; in-hand tool sits at hand height; softer car shadow |
| v0.75 | Smashed cars show a grime/ruin texture; tighter car collision; smaller in-hand tool icons; boundary blocks fainter still |
| v0.74 | Abandoned cars replaced with real sprites (several models/colours + police + ambulance, random facings); wall tops carry the same texture as the sides at low opacity; boundary blocks more transparent |
| v0.73 | Boundary blocks re-textured to dark gravel (distinct from roads); water droids can only hit you while you're in the water |
| v0.72 | Held item draws behind the body when facing away; boundary blocks road-textured + semi-transparent + fixed south sorting; swimming shows the real character's head |
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
