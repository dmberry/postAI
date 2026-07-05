# postAI — Version Plan

This file is the shared planning board for the game. **Henrik: add your ideas and suggestions in the section at the bottom (or anywhere) and push — everything here gets read when the next version is planned.**

Versioning: 0.01 increments (v0.32, v0.33, ...). The game is pushed after every sizeable change so the latest build is always on `main`.

## Where we are (v0.38)

- Isometric world, seeded 128x128: river, two bridges, ten-building town, hamlet, forests, tall grass, hills and hollows, wadeable streams.
- Survival: food/hunger, health, stamina, venom, day/night (dark nights), torches, minimap with fog of war (grey, not black), permadeath that drops your loot where you fell.
- Animals with tells: dog packs, charging boars, ambush vipers, shrieking food-stealing ravens.
- The machines: black obelisk towers; T1 wheeled hunters (cannot climb, trapped by hollows); T2 biped stalkers (walk exactly at your pace).
- Robot batteries: they drain, machines return to their obelisk to recharge, stuck ones run flat, and a drained robot can be reprogrammed with a battery (R) to work for you (T2s fell trees).
- Weapons: penknife → bat/machete/crowbar (resistance caches, E to search) → stun-gun (disables), electro-gun (fuses into a mineable wreck), pistol, shotgun. Batteries/ammo/shells in caches. Gun kills yield less salvage than melee or mining a fused wreck. Guns show remaining ammo on the hands slot; a cache in front of you is always searchable with your other hand, gun in hand or not.
- Loadout: press 1-4 to select a pocket, G to swap it with the hands slot (put a weapon away, pull another out), F to drop it (or the held tool, if no pocket selected); pocket slots show the item name in tiny writing.
- Player never overlaps an animal or robot's exact tile — bodies push apart, so a target is always hittable.
- Player always faces the mouse cursor, independent of movement direction. Using the held tool is **/** or **left click** (Ctrl/Cmd retired).
- If a fight or a bad respawn leaves the player wedged in solid geometry, they're auto-pushed out to the nearest open tile.
- Death always leaves you holding a penknife, never empty-handed.
- The version number shows under the postAI logo, top-left. The on-screen control hint fades out after two minutes of play.
- Books teach permanent skills (R): woodcraft, herbalism, tracking, fleet foot. Knowledge survives death.
- Character: Adam / Eve / Neve or a custom name (help modal, H).
- **Backpack**: a rare find in the ruins. Once found, it's automatic — 16 more slots and one spare-weapon slot (select with 5, swap with G), filled from overflow; eating and gunfire draw from it once the pockets are empty. I views it (read-only — nothing to drag, the split is automatic). Dropped, with everything in it, on death.
- Synthesized sound: footsteps by surface, action and creature sounds, wind, night crickets, and now a sparse, haunting solo-piano ambience that only plays in calm moments — it fades out while fighting or being hunted and back in once safe. P toggles it.
- Grass tiles carry a little blade texture instead of a flat colour fill.
- First lore pass: sparse sprayed slogans on walls (generic anti-machine — no faction identity yet), and abandoned cars littering the roads here and there. Environmental only, no readable/interactive layer yet (that's still the planned "hidden story" phase below).

## Planned / backlog

**v0.39 (in progress — David's requests, 5 July)**
- Item icons that look like the thing they are (weapons, guns, food, books, ammo), in the dashboard slots and on the ground.
- Show the held weapon in the player sprite's hands.
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

- **Awareness meter feeding an escalation event.** Ravens already flush and shriek when they spot the player (existing mechanic) and obelisks already plan to report player-closeness to nearby robots (v0.34). Chain these into a single rising "AI awareness" value — normal ambient patrol most of the time, but crossing a threshold (too many sightings, too close for too long, a raven that reaches an obelisk) flips the game into a short, hard escalation sequence: robots converge fast, and more are paradropped or flown in overhead. Telegraph the drop itself — a growing drone hum, something visible crossing the sky — so the player gets a beat to brace or run before it lands.
- **Escalation should feel like a different game for its duration** — brutal, punishing, retry-friendly pacing (Flappy Bird / Getting Over It register) rather than the calmer scavenge-and-avoid pace of normal play. Short, intense, and over quickly either way (survive it or die and respawn), not a sustained new difficulty floor.
- **Hacking parts as the resource for the already-planned obelisk destruction mechanic.** A new rare salvage type alongside batteries/scrap/ammo, dropped mostly by destroyed robots and reprogramming failures, that accumulates toward disabling a specific obelisk. Gives "quiet the machines in this area" a concrete collectible goal rather than an abstract endgame trigger.
- **Firearms as loud, high-value, high-risk tools against robots specifically** — guns already yield less salvage than melee/mining a fused wreck (per v0.33), which is a good lever: keep gunfire mechanically tempting against a hunting robot wave but expensive in loot, and (tying into the planned scent/noise model) loud enough to draw in more attention, so using guns during an escalation event is a real trade-off, not a free upgrade.
- **Ravens should be robots, not wildlife.** Recast the existing "bird" as a small flying drone/scout machine rather than an animal — same flush-and-shriek spotting behaviour, but now it's mechanically the AI's own eyes in the sky, wired directly into the awareness-meter idea above (a scout drone spotting you *is* the alert reaching the obelisk, not a metaphor for it). Also gives a reason for a drone to be shootable/knockable-out-of-the-sky for scrap, and frees up "ravens" as an actual wild animal slot later if wanted.
- **Weeping angel robot (T3).** A machine that only moves while unobserved — freezes solid the instant it's on-screen or in the player's sight cone, closes the distance the moment you look away or turn your back. Pairs naturally with the mouse-facing/sight-cone idea below: its whole threat depends on the game actually tracking what the player can and can't currently see.
- **Sight cone with peripheral indistinctness.** Render things outside the player's facing cone (now driven by the mouse, so this is cheap to compute) as dimmer/blurrier/desaturated — true peripheral vision rather than full-fidelity 360° awareness. Raises the stakes on facing choices (aiming at one threat leaves you genuinely worse at spotting another) and is the mechanical backbone a T3 weeping-angel robot would need to be fair rather than cheap.
