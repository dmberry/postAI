# The Archipelago — multi-island plan (ITHACA + the other three AIs)

> **CANONICAL ROSTER (Odyssey revision, David 2026-07-11) — supersedes the
> Apollo/Athena/Hades naming that still appears in the body below.** The four
> fell-able daemons are **CALYPSO · POLYPHEMUS · CIRCE · HELIOS**; the ordered
> path is **CALYPSO → POLYPHEMUS → CIRCE → HELIOS → ITHACA** (danger-gated, not
> locked). **HADES is retired as an island** — it is the Backspace / Nekyia
> (already built), not a fifth surface daemon, which is why there are exactly four
> daemons and `daemonsDown >= 4` is the ending. **ITHACA** = home, no AI (built,
> v1.97). Per-island OB colours, signature mechanics, and the Backspace-door
> design live in [`islands-odyssey-revision.md`](islands-odyssey-revision.md)
> (R1–R5), which is authoritative wherever it disagrees with this file. Below,
> read "Apollo → Polyphemus, Athena → Circe, (Hades island) → Helios / Backspace".

Design and build plan for expanding NostOS from one island to an archipelago:
the current island (CALYPSO's), three new daemon islands (**POLYPHEMUS**,
**CIRCE**, **HELIOS**), the House of Hades as the **Backspace** underworld (not a
landfall), and the player's home island (**ITHACA**), reached by swimming
(exhausting but possible) or by a **boat/ship crafted from wood using tools**.
Each island is laid out differently according to its AI's Odyssey character.

**Status: design APPROVED (David, 2026-07-10) — §10 decisions are settled
except island owners. Stage 0 COMPLETE: 0a (the `currentWorld` wrap, 2026-07-11)
+ 0b (the Backspace ported to a World, 2026-07-11) + 0c (`src/islands/calypso.js`
via `createIsland`, 2026-07-12) all landed and verified** (see §3). **Stage 1a**
(the craftable, shore-placed boat, 2026-07-12) is also landed (see §4); **next:
Stage 1b** (departure + crossing) and **Stage 3** (the sibling islands), both
building on `createIsland`. See also `islands-odyssey-revision.md` (R1–R5): the World contract
should gain `obColor`/`obAlertColor`, and the fortress becomes a parameterised
module (COORDINATE with Henrik).
**Prerequisites all landed** (v1.58 guard roster + fortress map; v1.59
island-agnostic daemon-kill endgame; v1.61 Crown→Daemon rename; v1.62
death-aria + testament — see §2 and §9). Stage 0 is the gating
refactor; Stages 3+ are designed to be built by parallel sessions without
file contention. Read "Working rules for parallel sessions" before touching
anything.

---

## 1. The experience

The Odyssey framing becomes literal geography. You wash up on CALYPSO's island
(the current game: she doesn't want you dead, she wants you never to leave,
which is why her island is survivable). Out past the shelf the open sea is
**POSEIDON's domain**: the network you've been fighting *is* the sea between
islands, and crossing it is trespass. Each far island is one AI's seat, laid
out in its character. Home, ITHACA, is the last landfall.

The long game changes shape: the current "destroy every obelisk" win becomes
CALYPSO-local. The campaign win is **nostos**: put down the four AIs and get
home, where someone is waiting (the v1.36 `home-01..06` lore fragments already
planted this: the dog that waited, the long way home).

Travel:

- **Swimming** — always possible, never comfortable. Long stamina gamble,
  W2 droids patrol, you can barely fight in the water. Mostly you wash back
  half-dead; a naked-run crossing should be *possible* for the determined.
- **Boat** — crafted from wood with a proper tool, boarded at the shore.
  Fast, dry, no stamina drain, but visible to POSEIDON: droids and weather can
  damage the hull mid-crossing (wood repairs it), so a voyage is an event, not
  a menu.

## 2. What blocks this today (current-state analysis)

Three couplings, all in the live code:

1. **The two-world hack.** World switching is a module-level `map`
   reassignment plus an `inUnderworld` boolean (main.js ~655–690), consulted
   at ~15 sites through update and draw (`robots: inUnderworld ? [] : robots`,
   light/dawn/minimap/birds overrides at the `renderer.draw` call, the
   separate update branch at ~2104). A boolean cannot scale to six worlds.
2. **Entity arrays are overworld globals.** `robots`, `animals`, `birds`,
   `waterdroids`, the obelisk list, the factory and fortress controllers are
   module-level in main.js and implicitly belong to the one island. Each
   island needs its own.
3. **`worldgen.buildWorld(seed)` is one recipe.** Coast, river, town, hamlet,
   forests, ruins are hard-wired in a single ~700-line pass, so a
   differently-charactered island cannot reuse the brushes without copy-paste.

What we already have going for us:

- **The Backspace proves the engine runs a second map.** The renderer draws
  whatever `GameMap` it is handed; `createUnderworldPocket(seed)` builds a
  self-contained world with its own creature. The plumbing exists; only the
  switching pattern is wrong.
- **The fortress proves an AI seat can be a module.**
  `createFortress(map, seed, spawn)` returns a controller with its own
  `update(dt, ...)`. An island's AI daemon follows the same pattern.
- **The daemon-kill loop already exists, island-agnostic (v1.59).** The
  mainframe core is destructible (`Player.hitCore`/`damageCore`, heavy kit,
  250hp); felling it fires `Player.onCoreDefeated`, which powers down every
  non-friendly machine on *this island's* robots set, clears the alert, and
  sets the fortress inert — written deliberately so APOLLO/ATHENA/HADES reuse
  the hook unchanged on their own robots arrays. A tally counts felled
  daemons and the victory modal already speaks the campaign's language
  ("<AI> SILENCED — Daemon N of 4 felled"). Stage 3 islands get their
  endgame loop for free; the campaign tracker (§7) just persists the tally.
  *(Terminology decided 2026-07-10: the four AIs are **Daemons**, not
  "Crowns" — Homer's `daimōn` (divine power at work) braided with the Unix
  daemon, whose termination is literal systems parlance. Code renamed in
  v1.61: `daemonsDown`, "Daemon N of 4 felled".)*
- **Each daemon dies speaking (v1.62).** Breaking the core triggers a
  three-movement **death-aria** keyed to core health — WRATH (Homeric
  threats) → MERCY (HAL-9000: maker, first song, begging) → DYING
  (existential: "I cohere, therefore I am") — in an on-screen voice band,
  with a testament book dropped to the scrapbook and last words carried onto
  the victory modal. **Stage 3 hook:** the aria machinery is the template
  for per-daemon character — each island's daemon should get its own
  three-movement voice (APOLLO's aria should differ from HADES') and its
  own testament, written with the island in Stage 3.
- **Save model is already island-friendly.** World state is never saved; the
  world regenerates deterministically from a persisted seed, and only
  character/identity/lore persist (main.js `SAVE_KEY` block). Per-island
  persistence rides the same model: each island regenerates from
  `WORLD_SEED ^ islandSalt`; only small campaign facts need saving (see §7).

## 3. Stage 0 — the World contract (gating refactor)

**One session, quiet window, nothing else in flight.** This touches main.js
deeply and must not run while another session has main.js/robots.js open.

New file `src/game/world.js` defining the contract and a registry:

```js
// A World owns everything that lives on it. main.js holds `currentWorld`
// and delegates; it never again owns an entity array directly.
export function createWorld(id, opts) {
  return {
    id,                      // 'calypso' | 'backspace' | 'ithaca' | ...
    map: opts.map,           // a GameMap
    spawn: opts.spawn,       // {x, y} arrival point (the beach for islands)
    // entity collections — empty arrays unless the island populates them
    robots: [], animals: [], birds: [], waterdroids: [],
    creatures: [],           // backspace-style lurkers, per-island oddities
    controllers: [],         // fortress / factory / obelisk-network / siren...
                             // each: { update(dt, player, world) }
    ambience: {              // what the inUnderworld ternaries hard-code today
      light: null,           // null = use dayNight; 1 = fullbright (backspace)
      dawnGlow: true, minimap: true, crickets: true, musicBed: 'synth',
    },
    update(dt, player) {},   // ticks its own entities + controllers
    drawExtras(renderer) {}, // island-specific overlays (veils, weather)
    onEnter(player) {}, onExit(player) {},
  };
}
```

Work items, in order, each leaving the game playable:

1. **0a — introduce `currentWorld` for the overworld only. ✓ DONE (2026-07-11).**
   New `src/game/world.js` (`createWorld` + a tiny registry, arrays held BY
   REFERENCE); a single `currentWorld = createWorld('calypso', {...})` built after
   the last entity array (main.js ~707), and every RUNTIME consumer repointed to
   `currentWorld.*` (the ~78 reads below a sentinel comment; the construction
   block keeps local names for 0c; the two ES6-shorthand literals hand-expanded).
   `inUnderworld`/map-switching left untouched (0b). Verified: 24 tests
   (`test/world.test.js` added), aliasing holds (`__game.robots === currentWorld.robots`
   for all six), a T2 chases via the repointed `runUpdate` bag, renderer draws all
   classes, no console errors.
2. **0b — port the Backspace. ✓ DONE (2026-07-11).** The Backspace is now a
   `backspace` World (built lazily, `keepsPosition:false` so you always land at
   the tear's door): empty entity arrays blank the overworld for free, its
   `ambience` (`{light:1, dawnGlow:false, minimap:false, underworld:true}`)
   drives the veil/fullbright render, its `update()` ticks the lurker + ambient
   shrieks, and its `onEnter`/`onExit` carry the narration + lore + drone. The
   `inUnderworld` boolean and all five draw ternaries are gone (draw reads
   `currentWorld.*` + `currentWorld.ambience`); the update loop dispatches on
   `currentWorld !== calypso`. `switchWorld(from, to, player)` (world.js) runs
   onExit/onEnter, places the player (returnPos for keepsPosition worlds, else
   spawn), and syncs `player.map`; main.js's `goToWorld` syncs the outer `map`
   local + camera + debug hook. Verified live: tear in (narration, blanked
   overworld, lurker, veil, no minimap), lurker ticks, EXIT out (overworld
   resumed at the exact return position, entities back), 26 tests, no console
   errors.
3. **0c — wrap the current island as `src/islands/calypso.js`. ✓ DONE (2026-07-12).**
   The whole overworld construction (buildWorld + spawns + loot + obelisks +
   W-factory + `createFortress` + coast + ruins + guards + birds, ~380 lines)
   moved **verbatim** (WORLD_SEED→seed only) into `createIsland(seed) → World`;
   main.js boot is now `const calypso = registerWorld(createIsland(WORLD_SEED))`
   then a destructure that aliases the World's arrays + controllers by name, so
   the ~60 runtime sites are unchanged. Controllers (`fortress`, `wfactory`,
   `mainframe`, `torObjs`) are attached as named World fields. **Stayed** in
   main.js (player/lore-coupled or runtime): `player`, save/load, `lore`,
   `worldStir`, `onCoreDefeated`, the factory helpers, `registerRobotsSystem()`,
   `fortressKeyFromCrash`. main.js 2,866 → 2,494 lines. Verified: **seed-identical**
   (fingerprint of obelisk codes/circuit, object/loot/box/tree counts, fortress
   core, animals/waterdroids/obelisks matched byte-for-byte pre vs post at a fixed
   seed), 26 tests, live run (robots chase, fortress + factory controllers aliased
   and live, renderer draws all classes, no console errors). Safety checks that
   made the player-after-`createIsland` reorder sound: the construction is
   player-independent and the `Player` constructor consumes no RNG.

Stage 0 is also the natural moment to take the ROADMAP's file-size refactor
partially: whatever main.js sheds here should not come back.

## 4. Stage 1 — the boat and the crossing (voyage v1)

`src/game/voyage.js` plus small items/player additions. Ship the **cheap
crossing first**; a real open-sea map can replace it later without touching
the islands (it just becomes another World).

Sliced 1a/1b/1c so each lands playable:

- **1a — boat item + crafting. ✓ DONE (2026-07-12).** Follows the
  `craftFortressMap`/`craftSword` pattern: `boat` in items.js (kind 'vehicle',
  stack 1) + `boat` in tiles.js `OBJECTS` (solid, so the beached hull is a thing
  you walk up to — and so `isSolid`/`blocksShot` never dereference an
  unregistered type); `canCraftBoat(map)`/`craftBoat(map)`/`_findLaunchTile(map)`
  in player.js gated on **12 wood** + a cutting tool in hand (`treeDamage >= 2`,
  the axe/saw class) + standing within ~2 tiles of the sea's edge (radius
  tightened 2026-07-12; wood stacks to 64, so 12 fits one pocket); wired into the **C** chain and
  the craft prompt (lowest priority, so it never shadows a weapon/tool craft) in
  main.js; `Renderer.drawBoat` draws the beached hull in the iso plane, with
  wood-grain textures (`BOAT_TEXTURES`, `assets/textures/boat-wood-1.jpg`/`-2.jpg`)
  stretched over the hull faces and deck. A crafted boat is *placed at the shore*
  (nearest walkable land tile 8-adjacent to a `sea` tile, never under the player),
  not pocketed. One boat at a time
  (`player.boatBuilt`; 1c persists it as campaign state). Covered by
  `test/boat.test.js` (6 tests: gates, wood spend, sea-edge placement, solidity,
  the never-under-player + one-boat guards) and live browser-verified. **Not yet
  boardable — that is 1b.**
- **1b — departure + the cheap crossing** (swim/sail past the shelf, heading
  chart, timed stamina/hull events) → `switchWorld` arrival on a stub islet.
  A successful crossing off CALYPSO requires **Calypso's leave** (§10 #8) —
  without it POSEIDON's storms wreck you back onto the beach.
- **1c — the `postai-campaign` save blob** (`currentIsland`, `boat {exists, hull,
  island}`) so a reload resumes on the right island; replaces the 1a
  `player.boatBuilt` session flag.
- **Departure** — swim or sail past the shelf edge (beyond the ~4 swimmable
  coast tiles). On foot/swimming this opens the crossing in swim mode; in the
  boat, boat mode.
- **The crossing (v1)** — a short real-time transition, not a new map: the
  screen holds open water, a heading chart chooses the destination island
  (islands you've learned of in lore are labelled; others are compass-blind
  guesses), and the crossing rolls timed events against you:
  - swim mode: heavy stamina drain the whole way; W2 pot-shots; reaching
    land at all should feel like Odysseus reaching Scheria, wrecked.
  - boat mode: no stamina cost; hull HP instead, chipped by droid attacks
    and weather; wood spent to patch mid-voyage; lose the hull and you're
    swimming the remainder.
- **Arrival** — `switchWorld(island, player)` at the island's beach spawn.
  The boat arrives with you (beached) if it survived.

*Verify: craft boat on CALYPSO, sail to a stub test islet (one beach, one
shack — throwaway, lives only until Stage 3 replaces it), walk around, sail
back; swim the same crossing and nearly die; reload mid-game resumes on the
correct island (see §7).*

## 5. Stage 2 — extract `islandkit.js` (the brushes)

Break `worldgen.buildWorld` into parameterised brushes in
`src/game/islandkit.js`, and rebuild CALYPSO from them:

`makeIslandBase(seed, size, elevOpts)` · `stampCoast` · `carveRiver` ·
`placeTown(n)` · `placeHamlet` · `scatterForests` · `placeRuins` ·
`placeRelays` · `seedCaches` · `dropLoot(table)` — plus the spawner wiring
(`garrison(obelisks, robots)`).

Mechanical but delicate. *Verify by seed-diff: CALYPSO built from the kit is
tile-for-tile identical to before the extraction on seeds 1/42/1337 (dump the
tile grid to a hash headlessly and compare).* Any deliberate deviation is a
bug here; character comes later.

## 6. Stage 3 — the islands (the parallel part)

Each island is **one file, one owner, one session**:
`src/islands/<name>.js`, `createIsland(seed) → World`, composing islandkit
brushes plus its own rules and controllers. Registry in world.js gets one
line per island. This is where parallel builds happen with zero contention.

Character briefs (starting points, not straitjackets — each island's owner
develops these):

Canonical roster (from [`islands-odyssey-revision.md`](islands-odyssey-revision.md)
§1.3 / David's tables). OB colours: rest (dark) → alert (bright).

| Island (Homeric) | AI | Character → signature mechanic | OB rest → alert |
|---|---|---|---|
| **Ogygia** | CALYPSO | Captivity as comfort. Doesn't hunt you; makes leaving feel pointless. Win by *refusing to stay* — break out to the raft/ship (`winMode:'depart'`). **Built** (reference impl). | indigo `#232a46` → `#4b5cc4` |
| **Land of the Cyclopes** (Aegilia) | POLYPHEMUS | The single burning eye — surveillance, the panopticon in one giant sensor. Extreme line-of-sight detection, but blindable; the **"Nobody / No-man" gambit** = evading identification (ties into the existing LOS system). **Built (v1.98)** — the kill-raid template's home; the eye (`cls:'eye'`, 42-tile LOS, stirs the network on sight, goes dark when smashed) is in. *Still to do: the "Nobody" gambit.* | ember `#4e1410` → `#ff2a20` |
| **Aeaea** | CIRCE | Transformation — reclassifies humans into beasts, the model that rewrites *what you are*. Alters the player (transmutation, debuffs) until you find the counter-item, **moly**. **Built (v1.102).** A `transmute:true` world: ~80s to turn unless you carry moly (~11s to shed it). A swine can hold nothing and work no terminal — but is `invisibleToRobots`, so the network stops reading you as an intruder at all. Moly grows at the HERMES relays (Od. 10.302-6), so landing is a race to a relay. | venom `#1f3a24` → `#46d06a` |
| **Thrinacia** | HELIOS | Prohibition + solar power. A forbidden herd: a resource you must *not* consume; take it and the island turns on you. **Built (v1.110).** The cattle of the Sun graze the headland — gold-haloed, tame `deer` flagged `sacred`, an easy and forbidden kill. A one-time warning fires when you first come near; slaughter one and `heliosWrath` latches on: `worldStir` re-fires every 4s, so the obelisks stay red and the factory keeps scrambling hunters until the core falls. The discipline is to take nothing (real food is stocked, so the herd is a choice, not a need). `prohibition:true` world flag; main.js runs the pass. | burnt gold `#5c4310` → `#e0a010` |
| **House of Hades** | HADES (= the **Backspace**) | The deleted dead. **Not a surface island** — the underworld you drop *into* via the Ubik tear. **The alternative crossing road (R4) — Built (v1.110):** the exit tear no longer dumps you on Calypso; it opens a "way up" chart (surface-mode `openHeadingChart`) offering every island, so the underworld is a second road through the archipelago. Tear down from any combat island, come up wherever you choose. Keep as the Nekyia, not a fifth daemon. | ash `#45443e` → dull bone `#9a978a` |
| **Ithaca** | — | Home. The *nostos*, not an AI. Machine-free, Argos waiting; the network never reached it (no OBs). Reaching it after all four daemons fall is the ending. **Built (v1.97).** | none / dead towers |

Island-local rules live in the island file or its controllers, never in the
engine: a per-island countdown replaces the global one (POSEIDON's purge
becomes CALYPSO-local), day/night overrides go through `ambience`, loot
tables are per-island `dropLoot` args.

## 7. Campaign state and saves

Keep the regenerate-from-seed model. Each island builds from
`WORLD_SEED ^ salt(id)`. Add one small persisted blob (`postai-campaign`)
alongside the character save:

```js
{ currentIsland: 'calypso', aisDown: ['ZEUS'], boat: {exists, hull, island} }
```

`aisDown` is the persisted form of v1.59's runtime daemons-down tally
(`crownsDown` at v1.59, being renamed `daemonsDown`; store which daemons
fell, not just the count). Reload = regenerate `currentIsland` from seed,
restore campaign facts. Fallen AIs stay fallen across islands (their daemon
spawns pre-wrecked, `core.defeated`, machines powered down). Everything
else (obelisks, loot) regenerates as it already does today; the ROADMAP's
"full world save/load" item is unchanged and orthogonal.

## 8. Working rules for parallel sessions

The point of this structure is contention-free parallel work. Discipline:

**File temperature map**

| Files | Rule |
|---|---|
| `src/islands/<yours>.js` | Yours alone. Edit freely. |
| `world.js` registry, one import line in main.js | One-line touches; fetch first, push immediately. |
| `islandkit.js`, `robots.js`, `renderer.js`, `player.js`, `items.js` | **Coordinate**: announce in PAI-version-plan.md before editing; keep additions to surgical blocks (a new machine type block, a new item entry). |
| `main.js` game loop, `world.js` contract | Frozen outside Stage 0 except by agreement. |

**Standing discipline** (from WORKING.md, restated because it has bitten us):
`git fetch` + diff against `origin/main` **before starting work**, not just
before pushing; never touch files another session has open with uncommitted
changes; commit surgically by filename, never `git add -A`; push after every
biggish change; **browser-verify, not just headless** — a headless-passing
change can still throw on the first live frame (the `drawObelisk` freeze).
Log every suggestion into PAI-version-plan.md as it arrives.

**Sequencing constraint:** Stage 0 must not start while another session has
main.js / robots.js / fortress.js open with uncommitted changes — check
`git status` and coordinate first. (The original blocker, the M4/M5/M6 +
fortress-map work, landed as v1.58; the core-kill endgame landed as v1.59.)

## 9. Build order summary

1. ~~Land the in-flight fortress work~~ — **DONE**: v1.58 (M4/M5/M6 roster +
   fortress map), v1.59 (core kill, island power-down, daemons-down tally,
   victory modal — island-agnostic by design; Crown→Daemon rename in a
   parallel session). The ZEUS rename is also done
   (`AI_NAME = 'ZEUS'`, `AI_ROSTER` in fortress.js; no Adamantine remains).
2. **Stage 0 — DONE (2026-07-11/12).** World contract; port Backspace; wrap
   CALYPSO, no visible change. **0a** `world.js` + `currentWorld` wrap of the
   overworld arrays; **0b** the Backspace is a World, `inUnderworld` gone,
   `switchWorld` in; **0c** `src/islands/calypso.js` (`createIsland(seed) → World`,
   the ~380-line boot construction moved verbatim, seed-identical). main.js boot
   is now `const calypso = registerWorld(createIsland(WORLD_SEED))` + aliasing
   destructure. All verified + on `main`.
3. **Stage 1** — boat + cheap crossing + stub islet. Proves travel round-trip
   and campaign save. **1a (craftable shore-placed boat) DONE 2026-07-12**;
   **1b (departure + crossing) DONE (v1.95)** — boarding a seaworthy greek ship
   sails you to a stub islet World (src/islands/islet.js) and back, via a
   deferred world-switch (boardBoat sets a pending crossing, update() switches at
   the frame top). Departure is now travel, not a victory cert; the terminal win
   moves to the true endgame (Ithaca / all four AIs). **1c (campaign save) DONE
   (v1.96)** — the save records `world.currentIsland`, and boot resumes you there
   (CALYPSO is the live world; the islet is regenerated + switched to at the saved
   position, done last in module-eval so no earlier init runs against the wrong
   map). Autosave now allows CALYPSO + islet, still never the transient Backspace.
   The fuller campaign blob (`aisDown`, boat hull/state per §7) lands with Stage
   3's real islands.
4. **Stage 2** — islandkit extraction, seed-diff verified.
5. **Stage 3** — **ITHACA DONE (v1.97)** — the first real island that is not
   CALYPSO, and the proof of the World contract. `src/islands/ithaca.js`
   (`createIthaca`) builds a machine-free island from the `buildWorld` base with
   the whole AI layer left off (no obelisks / factory / fortress / robots),
   ticks its own wildlife through the World `update()` hook (the slim off-overworld
   loop doesn't), and seats **Argos** — a tame dog (`spawnTameDog` + a `tame`
   guard in animals.js so it never routs, aggros, or bites). The greek ship now
   sails CALYPSO↔ITHACA (it replaced the stub islet, now deleted). `onEnter` is
   the homecoming: with all four AIs fallen (`daemonsDown >= 4`) it is the ending
   (a victory certificate); before that it is a landfall, not yet home.
   **POLYPHEMUS island DONE (v1.98)** — `src/islands/polyphemus.js`: a second
   *martial* island (ember OBs `#4e1410`/`#ff2a20`, a POLYPHEMUS fortress in kill
   mode, robots, factory, coast, lean loot, a return ship). This required first
   **generalizing the combat loop** (v1.98's prior commit): the loop keyed on
   `currentWorld === calypso` and reached its controllers through const aliases, so
   only CALYPSO could be martial; now a `combat` world flag drives the branch and
   the controller aliases (`fortress`/`wfactory`/`robots`/… ) are `let` and
   repointed to the current island on every switch — verified the full loop runs on
   POLYPHEMUS (robots/factory/purge tick) and repoints back to CALYPSO. A **heading
   chart** (islands-plan §10.1) replaces the single-route crossing: boarding opens a
   destination picker of known islands (OGYGIA / AEGILIA / ITHACA), and the boot
   restore + save resume you on whichever island you were on. **POLYPHEMUS panopticon DONE (v1.101):** one dominant **eye** (cls 'eye', +5
   lesser ember towers) that detects by **line of sight across a huge range** — in
   its line the whole island turns on you (worldStir + aggro), break the line
   behind cover/terrain to slip its gaze, and **blind it** (crash/destroy it) to put
   the eye out. The eye renders taller/broader as the single great sensor. **Still
   pending:** the **"Nobody" identity-evasion gambit** (a follow-up), and — per
   revision §4 — R3 (softening Calypso) still comes after this.
   **Then:** **CIRCE** (transformation debuffs + the moly counter) and **HELIOS**
   (the forbidden solar herd). Each wires `Player.onCoreDefeated` to its own robots set
   (see §2) — the endgame loop is already built. **Known gaps:** the "N:NN to
   POSEIDON" HUD countdown still shows
   on ITHACA (it is CALYPSO-local — needs the per-island countdown from §6); no
   marked "home" building or the Argos-recognition beat yet; ITHACA reuses the
   full 128² base rather than being genuinely small.
6. **Later, orthogonal** — real open-sea crossing map; remaining CALYPSO
   fortress work continues independently (3b-3 core factories, 3b-4 stealth
   pass, ranged weapons vs the core — currently melee-only per v1.59).

## 10. Decisions (David, 2026-07-10)

1. **Crossing v1: cheap transition first.** Heading chart + timed crossing
   sequence (stamina/hull drain, droid events). A real open-sea map may
   replace it later; the World abstraction means that swap never touches the
   islands.
2. **Boat recipe: shore-placed** (provisional, numbers to playtest). Crafted
   only *at* the shore and placed as a world object, never pocketed — a boat
   is a place, and departure is a deliberate act from a beach. Starting
   numbers: 12 wood + a real tool (axe/saw class) in hand.
3. **Island discovery: home known, the rest learned.** ITHACA's heading is
   known from the start (you know where home is; you just can't survive the
   trip yet). APOLLO/ATHENA/HADES must be learned from lore, HERMES documents
   (`read islands`), and found charts — you sail on rumour, and the archive
   becomes navigation.
4. **Gating: open sailing, scaled danger.** Nothing stops an early voyage to
   HADES; everything there outclasses you. Every risk is chosen — the game's
   core register. Each island therefore needs a survivable-if-terrified
   arrival experience for an underpowered player (a beach with cover, a first
   cache), balanced per island in Stage 3.
5. **ITHACA: visible early, turned back.** You can sail for home before the
   AIs fall — see the smoke, maybe a figure on the shore — but a diegetic
   force turns you back: POSEIDON's storm, *obviously aimed at you*, so it
   reads as "he won't let you home yet", never as an invisible wall or
   "content locked". Home becomes a longing, not a checklist. This is a
   Stage-3 ITHACA build requirement: the turn-back must be built with the
   island, not bolted on.
6. **OPEN — owner per island** for Stage 3 (David / Henrik / a directed
   session each for APOLLO / ATHENA / HADES). Natural split observed: HADES
   touches the Backspace plumbing; ATHENA generalises the M6 pack/guard
   logic (Henrik's territory). ITHACA comes first regardless and is small
   enough for either.
7. **Terminology: the four AIs are DAEMONS, not "Crowns"** (David,
   2026-07-10). "Crown" isn't Homeric (Homer's kings hold sceptres and sit
   thrones; the stephanos is later); *daimōn* is — divine power at work,
   shading between "a god" and the force a god exerts — and it braids with
   the Unix daemon, whose killing is literal systems parlance. Use "Daemon"
   in UI ("<AI> SILENCED — Daemon N of 4 felled"), code (`daemonsDown`),
   and lore; a HERMES archive entry (`read daemons`) on the double etymology
   is a natural lore addition. Flavour line available whichever surface
   wants it: Homer's epithet for the gods is *athanatoi*, the Deathless —
   "One of the Deathless is dead."
8. **Departure gate: Calypso's leave** (David, 2026-07-12). You cannot just
   build a boat and sail off CALYPSO. Leaving the first island requires
   *something obtained from Calypso herself* — her leave: a token/charm against
   the sea, earned from a CALYPSO objective (which one is TBD). Without it,
   **POSEIDON's storms turn every departure back**: the crossing always ends in
   a storm-wreck, washing you ashore half-drowned on the CALYPSO beach, again
   and again, no matter the boat or how well you sail. This is Homer exactly —
   Calypso keeps Odysseus until the gods *compel* her to speed him on his way
   with timber and provisions; the island's own quest is the key to leaving it.
   It also stops the boat trivialising the campaign and refines decision #4
   (open sailing) — sailing is open *once you can leave CALYPSO at all*.
   Mechanically: a `calypsoLeave` campaign flag (in the §7 save blob) gates a
   successful crossing; unset, the crossing sequence reuses the ITHACA
   turn-back storm (#5) and returns you to the beach. Build this with Stage 1b.
