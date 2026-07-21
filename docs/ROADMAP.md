# postAI — outstanding work, phased

A living list of everything raised across our sessions that isn't built yet,
grouped into phases by size and dependency. Shipped features live in the README
version table and `PAI-version-plan.md`; this file is only what's *ahead*.

Order within a phase is rough priority. Nothing here is committed to — it's a
map, not a schedule.

*Last reconciled against the code at v1.145.*

---

## Recently cleared off this list

Kept briefly so the map reads honestly — these were Phase 2/3 items here for a
long time and are now in the game:

- **The phone / comms** — built as the **Nokia 3310** (v1.112–v1.122). Calypso's
  channel on Ogygia, per-island daemon threads elsewhere, roaming welcomes,
  Snake, and an SMS log that survives reload. The "dead-internet browser of
  cached pages" idea was *not* built and is parked below.
- **The other three AIs as islands** — built as the archipelago (v1.95–v1.131):
  OGYGIA, AEGILIA (Polyphemus), AEAEA (Circe), THRINACIA (Helios), ITHACA. Note
  the roster changed: the old APOLLO / ATHENA / HADES names in earlier drafts of
  this file were superseded by the Homeric roster in
  [islands-odyssey-revision.md](islands-odyssey-revision.md).
- **Sea crossings + boat crafting** — the row-out, the Homeric heading chart, the
  greek-ship recipe, Poseidon's refusal, and the Backspace's labelled doors.
- **The fortress as a per-island module** (R1/R2) and **Calypso's depart mode**
  (R3) — she is left, not killed.
- **Scylla and Charybdis** (v1.145, rebuilt as an arcade cabinet v1.150–v1.160) —
  the AEAEA ↔ THRINACIA passage. It began as a two-button modal: you picked your
  loss once and watched it happen. It is now a played 8-bit run with a title card
  and a coin, a helm that works across the channel and along it, one Scylla who
  keeps station on you and lunges out of the water, one Charybdis who comes down
  the channel as a widening whirlpool, walking rock chicanes in the back half, and
  a bronze ram found on Aeaea that shoulders three rocks aside. Rules in
  `src/game/narrows.js`, unit-tested without a canvas.
- **Per-island save fidelity** (v1.147) — the run snapshot now stores each
  island's own world state instead of reading Calypso's arrays whatever island
  you were on. Found while preparing the v1.147 release.

---

## Ideas parked with a design doc

- **The AI cabinets** — one arcade game per daemon, each mechanic saying
  something true about that AI (Calypso's un-winnable Pong, Polyphemus's blind
  Breakout, Circe's memory game against an opponent editing your memory, Helios's
  cattle). Written up in [ai-cabinets-plan.md](ai-cabinets-plan.md) with the test
  each one has to pass, the shared chassis the narrows already established, and
  the open questions. Not committed to.

## Phase 1 — polish & small wins (low risk, mostly self-contained)

- **Limping / WOUNDED tell**: the low-health slowdown exists; add the limp
  animation + a WOUNDED tag so the player can read it.
- **Persist fog of war across reload/death** (like skills already do), so map
  knowledge survives.
- **Walkman deck cover art**: tapes carry a `cover` (the WARD tape's *bear
  stanhope* sleeve shows in the Scrapbook). Remaining: render that cover on the
  walkman deck itself while a tape is loaded.
- **Tapes as a runtime manifest**: tapes are already data-driven (`items.js`
  `TAPES` + `docs/tapes.md`). Optional next step: read the list from a markdown/
  JSON file at startup so a non-coder can add a tape without touching JS.
- **Friendly-robot orders**: currently follow + (T2) tree-felling. Add
  "collect wood/loot and bring it back", a guard/hold mode, and show your
  reprogrammed robots on the minimap.
- **Gate `retire` to Calypso's own terminal** (minor, noted in the escape-chain
  doc): the OB verb still fires the refunction from anywhere.

## Phase 2 — world & story depth (the atmospheric layer)

- **The rest of the sea's own monsters** — the strait proved the pattern (a held
  crossing + a modal + consequences, all on `game/strait.js`-style pure rules),
  so these are now cheap. Listed in §8 of
  [islands-odyssey-revision.md](islands-odyssey-revision.md): the
  **Laestrygonians** (an ambush that costs you on arrival), **Aeolus and the bag
  of winds** (a boon that turns on you), the **Cicones** (an opening raid), and
  seeding a **Siren** on a crossing as well as on the islands.
- **The dead-internet browser**: cached pages from before the collapse, as a
  reading surface alongside the notepad and Scrapbook. The phone shipped without
  it.
- **Deeper underworld**: the Backspace is one generated level. Add stacked
  levels — a tear/door within it dropping to a deeper, stranger floor (different
  palette, worse lurkers), Backrooms "levels" style. The separate-map plumbing
  exists, and the doors are now a crossing road, so this compounds.
- **More animals from the original design**: stags with shockwave antlers,
  wolves that track scent, bears, the panther.
- **Per-island character pass (R5)**: per-island daemon voice and colour beyond
  what the palette/OB-colour work already does.

## Phase 3 — big machine systems (combat & AI escalation)

- **The portal gun** (a separate item from the Ubik tear): the clean sci-fi
  paired-portal teleporter, a deliberate homage. The Ubik tear was restyled to
  clear this aesthetic; the item itself is unbuilt.
- **Awareness meter + escalation event** (Henrik): chain raven-sightings and
  obelisk-proximity into a rising "AI awareness"; crossing a threshold flips
  the game into a short, brutal, retry-friendly escalation (fast converging
  robots, paradrops, a telegraphed drone hum) — a different register for its
  duration, over quickly either way.
- **Ravens as scout drones** (Henrik): recast the bird as the AI's eyes in the
  sky — its spotting *is* the alert reaching the obelisk — shootable for scrap,
  wired into the awareness meter.
- **Hacking-parts resource** (Henrik): a rare salvage type from destroyed
  robots that accumulates toward disabling a specific obelisk — a concrete
  collectible goal for "quiet this area".
- **Scent / noise stealth model**: gunshots (already loud, low-salvage) draw
  attention; feeds the escalation and firearms trade-off.
- **"Scary approach" telegraph** for an incoming hunter (from the original
  design).

## Phase 4 — survival-sim depth (Project Zomboid register)

- **Wounds by type** (scratch / bite / gore) with bandages and infection (venom
  is in; the rest isn't).
- **Clothing & protection**: layers with bite/claw/venom resistance and
  mobility trade-offs.
- **Cooking**: raw meat is risky; a fire cooks it but attracts things at night.
- **Weather** (rain masks sound) + a **Field Journal** that fills in each
  animal's tells as you learn them.

## Phase 5 — infrastructure & tech debt

- **Four boat sprites** (se/sw/ne/nw, the way `CAR_SPRITES` already are): one
  sprite plus its mirror covers only the two down-screen headings, so sailing
  away from the camera still shows the bow rather than the stern.
- **Title screen seed selection** — carry a whole run from a chosen seed. (Full
  world save/load and the checkpoint Load list are in.)
- **File-size refactor, round two**: `renderer.js`, `player.js`, `robots.js` and
  `main.js` are large again. The systems registry landed in v1.85 and the
  renderer's HUD split into `ui.js`; remaining split candidates are robots' AI
  update apart from its draw code, and main.js's growing voyage/crossing block.
  Do it in a quiet window, one focused pass, since both of us push daily.
- **Visual pass on the machines art** (obelisks, crates, robots) and hollows.

---

*Maintained alongside `PAI-version-plan.md` (design detail + shipped changelog).
When something here ships, move it there and delete it from this list.*
