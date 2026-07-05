# postAI

**Version:** 0.31 · **Authors:** David M. Berry and Henrik · **Started:** 4 July 2026 · **Repo:** https://github.com/dmberry/postAI

*(Versioning policy: 0.01 increments from v0.3 onwards.)*

An isometric 2D survival game set in a world devastated by the collapse that followed a failed AI takeover. Civilisation burned down its own infrastructure to win, and years later the survivors scavenge the ruins while avoiding wild animals that have gained strange powers. The truth of what happened is never stated: the player pieces it together from newspapers, diaries, floppy disks, VHS tapes, and dead computers scattered through the world.

Inspired by Project Zomboid: knowledge is the real progression, scarcity drives movement, every fight is optional and risky, and the world tells the story.

Created by David M. Berry and Henrik.

## Running

No build tools, no dependencies. Serve the folder and open it:

```
python3 -m http.server 8000
# then open http://localhost:8000
```

(Opening `index.html` directly also works in browsers that allow ES modules from `file://`; a local server is the reliable route.)

## Controls

- **WASD / arrow keys**: move
- **Shift**: sprint
- **Space**: jump
- **E / Ctrl / Cmd**: use the held tool (start with a penknife; face a tree and swing to cut it down — felled trees drop wood you pick up by walking over it; the blade also fends off animals)

The dashboard along the bottom of the screen shows health, stamina, the hands slot (current tool), four pocket slots, and current stats.

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
