# The Archipelago — multi-island plan (ITHACA + the other three AIs)

Design and build plan for expanding NostOS from one island to an archipelago:
the current island (CALYPSO's), three new islands seated by the remaining AIs
(**APOLLO**, **ATHENA**, **HADES**), and the player's home island (**ITHACA**),
reached by swimming (exhausting but possible) or by a **boat crafted from wood
using tools**. Each island is laid out differently according to its god's/AI's
character.

**Status: design APPROVED (David, 2026-07-10) — §10 decisions are settled
except island owners. No island code exists yet, but the prerequisites have
landed** (v1.58 guard roster + fortress map; v1.59 island-agnostic daemon-kill
endgame; v1.61 Crown→Daemon rename; v1.62 death-aria + testament — see §2 and
§9) **and Stage 0 is unblocked.** Stage 0 is the gating
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

1. **0a — introduce `currentWorld` for the overworld only.** Wrap the existing
   map + entity arrays in a world object built at boot (`calypso` id), point
   every consumer at `currentWorld.robots` etc. Pure mechanical move-and-alias;
   no behaviour change. *Verify: full run plays identically; seed unchanged
   produces the identical world; no console errors.*
2. **0b — port the Backspace.** `createUnderworldPocket` returns a World; the
   `inUnderworld` boolean and every ternary die, replaced by
   `currentWorld.ambience` and world switching (`switchWorld(w, player)` in
   world.js: calls onExit/onEnter, moves the player, keeps `player.map` in
   sync). The overworld freeze-while-away behaviour is preserved because
   main.js only ever ticks `currentWorld`. *Verify: tear in, wander, lurker
   hunts, EXIT out, overworld resumed exactly where it was; save/reload mid-
   Backspace does whatever it does today (no regression).*
3. **0c — wrap the current island as `src/islands/calypso.js`.** Move the
   world-assembly block out of main.js (the buildWorld call, spawns, fortress/
   factory/obelisk wiring, loot seeding at ~line 100–450) into
   `createIsland(seed)` returning a World. main.js boot becomes: make player,
   `switchWorld(createIsland(WORLD_SEED), player)`. *Verify: seed-identical
   world, full run, fortress alarm still works, POSEIDON countdown still runs.*

Stage 0 is also the natural moment to take the ROADMAP's file-size refactor
partially: whatever main.js sheds here should not come back.

## 4. Stage 1 — the boat and the crossing (voyage v1)

`src/game/voyage.js` plus small items/player additions. Ship the **cheap
crossing first**; a real open-sea map can replace it later without touching
the islands (it just becomes another World).

- **Boat item + crafting** — follow the `craftFortressMap`/`craftSword`
  pattern exactly: `boat` in items.js (kind 'vehicle', stack 1),
  `canCraftBoat()`/`craftBoat()` in player.js gated on wood (proposed **12**)
  plus a real tool in hand (axe/saw class), wired into the **C** craft chain
  and the craft prompt in main.js. A crafted boat is *placed at the shore*
  (nearest water-adjacent tile), not pocketed: it's a world object you board.
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

| Island | AI | Character → mechanics |
|---|---|---|
| **CALYPSO** | CALYPSO | The keeper (current island, becomes the reference implementation). Survivable *because* she wants you kept. |
| **APOLLO** | APOLLO | Light and prophecy. Sun-bleached palette, **no true night** (stealth and torches useless, different survival rhythm), oracle terminals that answer truthfully at a price, the siren mechanic escalated to a choir. |
| **ATHENA** | ATHENA | Craft and strategy. Machines fight in **formation** (generalise the M6 pack logic), fortifications rather than wilderness, but also the best workshops/craftables in the game: the island that rewards planning over force. |
| **HADES** | HADES | The dead. Dark palette, sparse life, and the structural gift: **his fortress connects to the Backspace** — the deletion realm is his underworld, and the two systems finally meet (a tear that opens from his side; the lurker explained). |
| **ITHACA** | none | Home. Small, machine-free or nearly. Someone waiting (the Argos thread). No fortress; reaching it *after* the four AIs fall is the ending. Cheapest island — **build it first** as the full test of "an island that is not CALYPSO". |

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
2. **Stage 0** — world contract; port Backspace; wrap CALYPSO. One session,
   quiet window. No visible change. **Now unblocked**, subject to the
   coordination check above.
3. **Stage 1** — boat + cheap crossing + stub islet. Proves travel round-trip
   and campaign save.
4. **Stage 2** — islandkit extraction, seed-diff verified.
5. **Stage 3** — ITHACA first (small, proves the contract), then APOLLO /
   ATHENA / HADES in parallel, one owner each. Each island wires
   `Player.onCoreDefeated` to its own robots set (see §2) — the endgame loop
   is already built.
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
