# postAI — outstanding work, phased

A living list of everything raised across our sessions that isn't built yet,
grouped into phases by size and dependency. Shipped features live in the README
version table and `PAI-version-plan.md`; this file is only what's *ahead*.

Order within a phase is rough priority. Nothing here is committed to — it's a
map, not a schedule.

---

## Phase 1 — polish & small wins (low risk, mostly self-contained)

- **Limping / WOUNDED tell**: the low-health slowdown exists; add the limp
  animation + a WOUNDED tag so the player can read it.
- **Persist fog of war across reload/death** (like skills already do), so map
  knowledge survives.
- **Walkman tape covers**: the WARD tape folder already ships a cover image;
  show the current tape's cover art on the walkman deck.
- **Tapes as a runtime manifest**: tapes are already data-driven (`items.js`
  `TAPES` + `docs/tapes.md`). Optional next step: read the list from a markdown/
  JSON file at startup so a non-coder can add a tape without touching JS.
- **Friendly-robot orders**: currently follow + (T2) tree-felling. Add
  "collect wood/loot and bring it back", a guard/hold mode, and show your
  reprogrammed robots on the minimap.

## Phase 2 — world & story depth (the atmospheric layer)

- **ELIZA in the terminal**: an interactive DOCTOR/ELIZA conversational mode you
  can open at an obelisk terminal — you type, it reflects your words back in
  Weizenbaum's 1966 pattern-matching style. Ties directly to the ELIZA/
  Weizenbaum lore already seeded. Its own small parser; unsettling, optional,
  and thematically load-bearing.
- **The phone / comms ("the browser")**: a mobile phone the player carries, with
  **RON text messages** arriving over time (guidance, warnings, lore), and
  possibly a dead-internet "browser" of cached pages from before the collapse.
  A new HUD surface; pairs with the notepad/scrapbook reading UIs.
- **Deeper underworld**: the liminal pocket is one generated level. Add stacked
  levels — a tear/door within the underworld dropping to a deeper, stranger
  floor (different palette, worse lurkers), Backrooms "levels" style. The
  separate-map plumbing already exists.
- **More animals from the original design**: stags with shockwave antlers,
  wolves that track scent, bears, the panther.

## Phase 3 — big machine systems (combat & AI escalation)

- **The portal gun** (a separate item from the Ubik tear): the clean sci-fi
  paired-portal teleporter, a deliberate homage. The Ubik tear was restyled to
  clear this aesthetic; the item itself is unbuilt.
- **The other three AIs**: Adamantine's fortress is in (+ Henrik's M6 guards).
  Build Behemoth, Colossus, Demiurge as their own annexes/fortresses, plus the
  deeper fortress content (mainframe raid, multiple internal factories, M5/M6
  elite guards, breach escalation).
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

- **Full world save/load** (localStorage) + a **title screen** with seed
  selection — carry a whole run, not just character/skills. *(Flagged as
  wanted — a strong candidate to pull forward once a quiet window opens.)*
- **File-size refactor**: `renderer.js`, `player.js`, `robots.js`, `main.js`
  are large. Split candidates: renderer's HUD/modal drawing → `ui.js`; player's
  weapon-fire (`fire`/`pierceShot`/`coneShot`/`burnObelisk`) → `combat.js`;
  robots' AI-update functions apart from the draw code. Do it in a quiet window,
  one focused pass, since both of us push daily.
- **Visual pass on the machines art** (obelisks, crates, robots) and hollows.

---

*Maintained alongside `PAI-version-plan.md` (design detail + shipped changelog).
When something here ships, move it there and delete it from this list.*
