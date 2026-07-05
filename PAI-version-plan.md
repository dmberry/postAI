# postAI — Version Plan

This file is the shared planning board for the game. **Henrik: add your ideas and suggestions in the section at the bottom (or anywhere) and push — everything here gets read when the next version is planned.**

Versioning: 0.01 increments (v0.32, v0.33, ...). The game is pushed after every sizeable change so the latest build is always on `main`.

## Where we are (v0.33)

- Isometric world, seeded 128x128: river, two bridges, ten-building town, hamlet, forests, tall grass, hills and hollows, wadeable streams.
- Survival: food/hunger, health, stamina, venom, day/night (dark nights), torches, minimap with fog of war, permadeath that drops your loot where you fell.
- Animals with tells: dog packs, charging boars, ambush vipers, shrieking food-stealing ravens.
- The machines: black obelisk towers; T1 wheeled hunters (cannot climb, trapped by hollows); T2 biped stalkers (walk exactly at your pace).
- Robot batteries: they drain, machines return to their obelisk to recharge, stuck ones run flat, and a drained robot can be reprogrammed with a battery (R) to work for you (T2s fell trees).
- Weapons: penknife → bat/machete/crowbar (resistance caches, E to search) → stun-gun (disables), electro-gun (fuses into a mineable wreck), pistol, shotgun. Batteries/ammo/shells in caches. Gun kills yield less salvage than melee or mining a fused wreck.
- Books teach permanent skills (R): woodcraft, herbalism, tracking, fleet foot. Knowledge survives death.
- Character: Adam / Eve / Neve or a custom name (help modal, H).
- Synthesized sound: footsteps by surface, action and creature sounds, wind, night crickets.

## Planned / backlog

**v0.34 (in progress — David's requests, 5 July)**
- Version number in tiny writing under the postAI logo in the UI.
- Item icons that look like the thing they are (weapons, guns, food, books, ammo), in the dashboard slots and on the ground.
- Item names under the pocket slots.
- Weapon toggling: press 1-4 to select a pocket, G to swap it with the hands slot (lets you put weapons away).
- Show the held weapon in the player sprite's hands.
- Mouse-cursor aiming: facing follows the cursor, for better fighting control.
- Player collides with animals/robots — never overlapping the same space, so a target is always hittable.
- Experience points: melee practice improves fighting, gun practice sharpens aim and effect, books give knowledge points.
- Crickets fall silent when a machine is near (they are scared of them).
- Machines carry a quiet drone hum you can hear approaching.
- Obelisk light: blinks occasionally rather than pulsing; goes deeper red when it senses you close, and reports your closeness (not exact position) to robots nearby.

**Near term**
- Obelisk destruction mechanic — towers are placed and pulsing but indestructible. Idea: destroying one quiets/disables the robots it controls, making tower-toppling the endgame loop.
- Friendly-robot orders: currently follow + (T2) tree-felling; add "collect wood/loot and bring it back", guard mode, and a way to see your robots on the minimap.
- Visual pass on the new machines art (obelisks, crates, robots) and hollows.
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

- 
