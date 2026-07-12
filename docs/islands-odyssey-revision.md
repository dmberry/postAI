# The Archipelago — Odyssey revision (Calypso, per-island colour, the fortress as a module, the Backspace as a door)

Companion and partial supersession of [`islands-plan.md`](islands-plan.md). That
document's Stage 0–3 architecture (the World contract, the boat crossing, the
islandkit brushes, per-island files) stands unchanged and is the substrate for
everything here. This revision records the design decisions taken 2026-07-11
that change *what the islands are* and *how you move between them*, and stages
them so that no existing work is lost — in particular the fortress, which
becomes a reusable per-island module rather than being rewritten.

**Status: design agreed (David, 2026-07-11). Not yet built. Two questions still
open (see §7).** This doc supersedes the parts of `islands-plan.md` listed in
§6; where the two disagree, this one wins.

**Governing constraint: nothing we invested time in gets deleted.** Every stage
below leaves the game fully playable and shippable, extracts and parameterises
rather than removes, and preserves the fortress raid intact as one *mode* of a
general module. The fortress is Henrik's code; every change that touches
`fortress.js` or the guard AI is marked COORDINATE and needs his sign-off before
anyone edits the file.

---

## 1. What changed today (the decisions of record)

1. **The four daemons are renamed to stops on the Odyssey, not Olympians.** The
   roster `['ZEUS','APOLLO','ATHENA','HADES']` becomes
   `['CALYPSO','POLYPHEMUS','CIRCE','HELIOS']`. Reason: Athena is Odysseus's
   *helper*, Apollo barely figures, Zeus is the god who *orders* his release —
   none is a trial on the way home. **POSEIDON stays** as the network / the sea
   itself: he is the divine antagonist of the whole nostos, and the sea between
   islands being his domain is exactly right.
2. **CALYPSO is island one (the current island).** This resolves a live
   inconsistency: the start island is already narratively Calypso's
   (`items.js` "she is CALYPSO", `coast.js` "the world is an island
   (CALYPSO's)"), yet the daemon you fell there is named ZEUS. The rename
   unifies them.
3. **Each daemon-island has its own obelisk colour — a dark version keyed to
   that island's Odyssey imagery.** The OB eye and network glow take the
   island's dark signature hue at rest and brighten in the same hue on alert
   (the "eye blinks faster once it has you" mechanic is preserved, just
   recoloured). Palette:

   | Island | AI | Odyssey cue | Rest (dark) | Alert (bright) |
   |---|---|---|---|---|
   | Ogygia | CALYPSO | *kalyptō*, "to veil / conceal"; drowse, forgetting | indigo `#232a46` | `#4b5cc4` |
   | Cyclopes | POLYPHEMUS | the single burning eye, fire-stake, blood | ember `#4e1410` | `#ff2a20` |
   | Aeaea | CIRCE | the drugged *kykeon*, swine-magic, the herb | venom green `#1f3a24` | `#46d06a` |
   | Thrinacia | HELIOS | the cattle of the Sun, the sun-god darkened | burnt gold `#5c4310` | `#e0a010` |

   POLYPHEMUS red is today's default eye — the Cyclops is the ur-obelisk, the
   one red eye, and the other three are variations on it. The SIREN class keeps
   its teal as a cross-archipelago special, so no island uses teal as a base.
4. **The Backspace has no obelisks and is not a daemon-island.** It is a Nekyia,
   a passage down to the deleted dead, with no network presence. This retires
   HADES as a daemon you kill: you end with exactly four fell-able daemons
   (Calypso, Polyphemus, Circe, Helios), which matches the existing "Daemon N
   of 4" count without a fifth. The Backspace can still be the House of Hades in
   the lore — a place you pass through, not a mind you sledgehammer.
5. **ITHACA has no obelisks.** Home has no network presence; the absence of a
   signature glow is itself the signal that you have arrived.
6. **The journey is an ordered sequence, danger-gated (confirmed
   2026-07-11).** CALYPSO → POLYPHEMUS → CIRCE → HELIOS → ITHACA. Five landfalls
   in a line: the start island, the three martial daemons in escalating
   difficulty, then home. The order is the *survivable* path, not a lock —
   nothing stops you sailing early into a slaughter (the "every risk is chosen"
   register of `islands-plan.md` §10.4/§10.5; Ithaca glimpsed early and turned
   back by a Poseidon storm). Backspace doors to later islands are open but
   lethal, softened only by the peek-and-retreat (R4).
7. **The Backspace is an underworld you can enter, not a stage.** It is not one
   of the five ordered landfalls and never becomes a level you progress
   *through*. It is a place you drop *into* — from an island, via the Ubik tear —
   with its own faded-yellow dread and the lurker, and it doubles as an
   alternative way to make a crossing (an underworld route between islands
   instead of Poseidon's sea). Enterable, optional, dangerous; never a stage in
   the sequence. This generalises and replaces the old plan's narrower idea that
   only HADES' fortress connected to the Backspace.
8. **Calypso becomes the break-out-to-the-raft tutorial (confirmed
   2026-07-11).** She detains by comfort, not violence (the lore already says
   "there is a way off"), and island one is the tutorial, so its climax is
   *leaving*, not killing: a break-out to the raft launched under a Poseidon
   assault, not a core sledgehammered. The straight kill-raid stays as the
   endgame of the *martial* daemons, and the hard raid migrates to Polyphemus
   before Calypso is ever softened (see §4).

---

## 2. Why the fortress must become a module (the preservation argument)

The fortress is a large, finished system: `growSouth`, `buildMaze`, the M-class
guard roster (v1.58), the `unlock` gate flow, the breach/violation response, the
destructible core, the three-movement death-aria (v1.62), the testament book.
`createFortress(map, seed, spawn)` already returns a controller with its own
`update`, so it is *almost* a per-island module. The one thing stopping it is
that identity is hard-wired at module scope: `AI_NAME = 'ZEUS'`, and the core,
voice, and colour all read that constant.

The move is to make identity a parameter and keep the current behaviour as the
default. This loses nothing: the raid you built is called four times, once per
island, three in kill mode and Calypso in depart mode. That is the concrete
meaning of "the fortress code needs to be a module that can still be called for
particular islands."

Target signature (COORDINATE with Henrik — this edits `fortress.js`):

```js
// Backward-compatible: opts is optional; omitting it reproduces today's ZEUS
// fortress exactly (now under the name CALYPSO).
export function createFortress(map, seed, spawn, opts = {}) {
  const {
    aiName    = 'CALYPSO',            // was the AI_NAME constant
    obColor, obAlertColor,           // island signature hues (also used by OBs)
    winMode   = 'kill',              // 'kill' | 'depart'
    voice     = DAEMON_VOICE,        // per-island three-movement aria (Stage 3)
    testament = DAEMON_BOOK_ID,      // per-island testament book
    mazeCfg,                         // per-island maze dimensions/character
  } = opts;
  // ...existing body, with AI_NAME → aiName throughout...
}
```

`AI_ROSTER` moves to the four Odyssey names but stays exported for the campaign
tracker.

---

## 3. The staged build (R1–R5)

Each stage is independently shippable and leaves the game playable. Stages map
onto `islands-plan.md`'s existing stages where noted.

### R1 — Roster rename + per-island OB colour (data, text, one renderer read)
Extends `islands-plan.md` §3 (World contract) and §6 (island character).
Lowest risk; almost entirely additive.

- **World contract gains colour.** Add `obColor` and `obAlertColor` to
  `createWorld(id, opts)` in `world.js`. This is the natural home: swap islands,
  the towers recolour for free.
- **Renderer reads the world, not a constant.** The obelisk eye at
  `renderer.js:~3009` (`rgba(255, 40*(1-alert), 30, a)`) and the network glow at
  `~2366` read `currentWorld.obColor` / `obAlertColor` and interpolate between
  them by `alert`. Minimap obelisk dots (currently all `#4fe07a`,
  `renderer.js:~3560`) tint to `obColor` too, so the map tells you whose sea you
  are in.
- **Roster rename.** `AI_ROSTER` → `['CALYPSO','POLYPHEMUS','CIRCE','HELIOS']`
  in `fortress.js` (COORDINATE). CALYPSO replaces ZEUS as island one's name.
- **Text generalisation.** The "red eye" descriptions become hue-neutral: HERMES
  tower-classes lore (`hermes.js:83`), the SIREN inspect line (`main.js:~2023`),
  the terminal class readout (`main.js:~1632`).
- Calypso's own hues: rest `#232a46`, alert `#4b5cc4`.

*Verify (live browser):* Calypso OBs glow indigo, brighten to `#4b5cc4` on
alert, felled towers go dark, the SIREN is still teal, minimap dots are indigo,
no console errors. Seed-identical world otherwise.

### R2 — Fortress as a per-island module (parameterise; preserve the raid)
Extends `islands-plan.md` §2 and Stage 0c. COORDINATE — edits `fortress.js`.

- Apply the §2 signature: `opts` with `aiName`, `obColor`/`obAlertColor`,
  `winMode='kill'` default, `voice`, `testament`, `mazeCfg`. Replace the
  `AI_NAME` constant reads with `aiName` throughout the body and the returned
  `core.ai`.
- No behaviour change when `opts` is omitted. This is a pure parameterisation.

*Verify:* Calypso's fortress, built via `createFortress(map, seed, spawn, {aiName:'CALYPSO', obColor:'#232a46', obAlertColor:'#4b5cc4'})`, plays tile-for-tile
and beat-for-beat as before (breach, maze, guards, core kill, aria, testament,
victory modal). Then a throwaway second call with different opts on the Stage 1
stub islet builds a *second* fortress that also works — proof of reusability.

### R3 — Calypso the break-out-to-the-raft tutorial (`winMode: 'depart'`)
**Confirmed (David, 2026-07-11).** Builds on R2, and must not land until
Polyphemus carries the hard raid (see §4, "never orphan the endgame").
COORDINATE — touches `fortress.js` and the guard AI.

Calypso becomes the tutorial island: it teaches the systems, and its climax is
leaving, not killing. The kill path stays intact for the martial daemons; depart
mode is an added branch, not a replacement:

- **Guards become detainers.** In depart mode the M-class response does not kill;
  it turns you back toward the centre and dazes you, reusing the existing lotus
  torpor. Being "caught" on Calypso means being pulled back and made comfortable.
- **The core becomes the raft.** No destructible 250hp core in depart mode;
  instead a departure object at the shore (the raft Odysseus builds to leave
  Ogygia). The win condition is reaching and launching it.
- **The climax is a break-out, not a break-in.** You fight your way to the shore
  and launch the raft while machines converge and Poseidon's sea turns hostile
  the instant you push off. Escape is not bloodless; it is a set-piece shaped as
  departure. Victory reads "you have left Ogygia" and seeds the crossing — the
  same launch that Poseidon will wreck (Stage 1's crossing danger).
- **Endgame system now has two shapes.** Calypso = depart; Polyphemus / Circe /
  Helios = kill (the island-agnostic `onCoreDefeated` loop of v1.59, unchanged).
  Calypso is the deliberate exception, the tutorial island whose whole point is
  refusing to stay.

*Verify:* On Calypso, launching the raft ends the island as a departure with no
core-kill available; the daemons-down tally still records CALYPSO as fallen; the
other three islands still kill-raid.

### R4 — The Backspace as an underworld crossing (a door, not a stage)
Extends `islands-plan.md` Stage 0b (Backspace-as-World) and parallels Stage 1
(the boat). Depends on 0b landing first.

The Backspace is not a landfall in the CALYPSO→…→ITHACA sequence and never
becomes a level you clear. It stays what it is — an underworld you drop *into*
from an island, with its own dread and the lurker — and it gains a second use:
an alternative way to make a crossing. Where the boat takes Poseidon's sea, the
Backspace takes the road under it.

Today the Backspace is one shared pocket with a single EXIT door
(`underworld.js:240`) that returns you to the overworld spot you left
(`exitUnderworld`, `main.js:750`). The door mechanic is: make the exit a *set*
of doors, each tagged with a destination island. Because the journey is ordered
(§1.6), the doors respect the order — they are a route *forward to the next
island or back to a prior one*, not a free jump that skips the sequence. The
Backspace is an alternative road along the same line, not a shortcut past it.

- **Backspace becomes a hub World** (once ported by 0b). `createUnderworldPocket`
  returns a World whose single `exit` becomes `exits: [{ islandId, x, y }]` —
  several EXIT doors, one per island, **scattered far apart** across the pocket
  so no two sit near each other.
- **Doors are labelled by island PLACE-name, not the AI/daemon.** A door reads
  OGYGIA, not CALYPSO; AEAEA, not CIRCE. The place-names:

  | AI (daemon) | Island (door label) |
  |---|---|
  | CALYPSO | OGYGIA |
  | POLYPHEMUS | AEGILIA (Goat Isle) |
  | CIRCE | AEAEA |
  | HELIOS | THRINACIA |
  | — | ITHACA |

- **Traversal.** Tear in from an island (the Ubik triple-spray, unchanged), cross
  the pocket, read the doors, and take the one for where you mean to go; it calls
  `switchWorld(islandWorld, player)` at that island's Backspace-arrival spawn.
- **Danger 1 — getting lost.** The doors are scattered and the pocket is a maze
  with the lurker in it. Finding the door you actually want, rather than
  wandering into the lurker or losing your bearings, is the core hazard. This is
  the trade against the sea: no storms or droids, but you can get lost down here.
- **Danger 2 — arriving under-levelled, with a peek-and-retreat.** A door can
  drop you on an island whose threats far outclass your XP. But arrival is not a
  commitment: you can step out, take stock, and **go straight back through the
  same door** if it is too hot. So the Backspace doubles as a scouting tool —
  peek at Thrinacia early, see what waits, run back — at the risk of the crossing
  itself. No item-deletion hazard: the danger is spatial and level-based, not
  loss of what you carry.
- **Gating** stays consistent with §10.4 (open but scaled): the door to a later
  island is *there* and takeable early; what stops you is what walks the far
  beach, softened by the peek-and-retreat.

*Verify:* Tear in on Ogygia, cross to a far-scattered door labelled with a place-
name, emerge on that island, look around, step back through and return; the
lurker still hunts; save / reload mid-Backspace resumes without corruption.

### R5 — Per-island character pass (folds into Stage 3)
When each island file is built (`islands-plan.md` Stage 3), it supplies its
`createFortress` opts (name, colour, `mazeCfg`, per-daemon `voice` and
`testament`) and its Backspace door. Polyphemus is the natural home for the full
kill-raid template (a cave-stronghold and a single eye); Circe and Helios reuse
the same module in kill mode with their own maze character and colour. Calypso
is the reference implementation in depart mode.

---

## 4. Build order

R1 and R2 are safe and can land in either order in a quiet window (both are
mostly parameterisation). R3 needs R2. R4 needs `islands-plan.md` Stage 0b
(Backspace-as-World). R5 rides Stage 3.

1. **R1** — roster + colour. Ships visibly (islands will read distinct), no
   gameplay change.
2. **R2** — fortress parameterised. No visible change; proves reusability on the
   stub islet.
3. **Stage 0b** (from `islands-plan.md`) — Backspace ported to a World.
4. **R4** — Backspace doors, once 0b is in.
5. **R5 / Stage 3, Polyphemus first** — the full kill-raid template migrates to
   Polyphemus (its proper martial, hard-difficulty home). **This must land before
   R3.**
6. **R3** — only *after* Polyphemus carries the hard raid, soften Calypso's
   fortress into the departure/break-out tutorial (detainer guards + raft), with
   Henrik.
7. **Stage 3 remainder** — Circe, Helios, Ithaca.

**Never orphan the endgame (governing sequencing rule).** The fortress was built
as the game's *endgame*; Calypso is now the *tutorial*. That is a difficulty
inversion, so the hard raid must *migrate* to a martial island, not be softened
in place. Until Polyphemus exists, Calypso keeps the fortress mechanically
intact (R1 rename + a release-not-murder narration is all that changes); the
core-kill stays the game's only complete climax. Calypso is downgraded to the
break-out tutorial (R3) *only once* Polyphemus carries the hard content. Removing
or softening Calypso's fortress before then would leave the game with no working
endgame — the exact loss this plan exists to prevent.

---

## 5. File temperature (adds to `islands-plan.md` §8)

| Files | Rule |
|---|---|
| `world.js` (add `obColor`/`obAlertColor`, exits registry) | Stage-0 contract; surgical, announce first. |
| `fortress.js`, guard AI | **COORDINATE with Henrik.** His system. R2/R3 must be agreed before the file is opened. |
| `renderer.js` (obelisk eye/glow reads, minimap tint) | Coordinate; surgical blocks only. |
| `underworld.js`, `main.js` enter/exit | Coordinate; R4 depends on 0b already having reshaped these. |
| `hermes.js`, `items.js` text | Low-risk text edits. |

---

## 6. What this supersedes in `islands-plan.md`

Apply these in a coordinated pass on the shared doc (not done here to avoid
clobbering it):

- **Intro + §1 + §6 + §10.6:** the three new islands are POLYPHEMUS, CIRCE,
  HELIOS (not APOLLO, ATHENA, HADES). CALYPSO replaces ZEUS as island one.
- **§6 character table:** replace the APOLLO/ATHENA/HADES/ITHACA rows with
  Polyphemus (cave, single eye, "Nobody" evasion, the kill-raid's home), Circe
  (transformation debuffs, the moly counter), Helios (forbidden solar herd,
  transgression triggers doom), Ithaca (unchanged: home, no fortress, no OBs).
- **§6 HADES row is retired as an island.** Its structural gift — the fortress
  connecting to the Backspace — is generalised in R4: the Backspace connects
  *all* islands, not just one.
- **§7 campaign blob:** `aisDown` stores the new names; add per-island OB colour
  is derived from the island, not saved.
- **§9 / §2:** note that `createFortress` is now parameterised (R2) and that the
  endgame has two shapes, kill and depart (R3).
- **§10.4 / §10.5:** the five landfalls run CALYPSO→POLYPHEMUS→CIRCE→HELIOS→
  ITHACA (§1.6). The "sail anywhere" register is *kept* — the order is
  danger-gated, not hard-gated (§7.1), so §10.4/§10.5 stand as written.
- **§0b / Backspace:** the Backspace is enterable underworld and an alternative
  crossing road, explicitly *not* a stage in the sequence (§1.7 here).
- Add the OB palette (§1.3 here) and the Backspace-door design (R4 here) as new
  subsections.

---

## 7. Resolved decisions (2026-07-11)

All design questions on this revision are now closed. What remains is
implementation and per-island balance in Stage 3.

1. **Progression: danger-gated, not hard-gated.** The order
   CALYPSO→POLYPHEMUS→CIRCE→HELIOS→ITHACA is the *survivable* path, not a lock.
   A bold player can sail early into a slaughter; Ithaca is glimpsed early and
   turned back by a Poseidon storm. Backspace doors to later islands are open
   but lethal, softened only by the peek-and-retreat (§1.6, R4).
2. **Circe keeps venom green** (`#1f3a24` / `#46d06a`). Lean into the near-clash
   as enchantment mimicking help; it is largely defused now the RON console is
   amber, so green no longer reads as a friendly relay (§1.3).
3. **Polyphemus's island is AEGILIA (Goat Isle).** Its Backspace door reads
   AEGILIA, from the wooded goat-island offshore that Odysseus's fleet lands on
   (Odyssey 9.116–124) — a place-name with textual warrant, not the daemon name
   (R4).
4. **Backspace danger** is **getting lost** plus **arriving under-levelled with
   a peek-and-retreat** (R4). No item-deletion hazard. Doors are labelled by
   island place-name and scattered far apart.

## 8. Still to place — the sea's own monsters

Journey hazards that live *between* islands, not on them, and still need a home
somewhere in the archipelago (probably on the crossings or the coasts, not as
landfalls):

- **Scylla and Charybdis — the two monsters.** The forced-choice strait: the
  six-headed cliff-thing that takes a few of you for certain, and the whirlpool
  that risks all of you. The natural fit is a narrows on one of the crossings
  (sea route or the Backspace road), where the player must choose which loss to
  take. These two want building somewhere; flagged so they are not forgotten.
- **The Sirens** — already in the game (the teal SIREN obelisk, tape as counter).
  Keep, and consider seeding one on a crossing as well as on the islands.
- **Other unplaced encounters** worth a home eventually: the Laestrygonians (an
  ambush that costs you on arrival), Aeolus and the bag of winds (a boon that
  turns on you), the Cicones (an opening raid). Lower priority than Scylla and
  Charybdis; listed so the map of what is left is honest.
