# Build: the Nokia 3310 — Calypso texts you (Ogygia rework, phone-first)

**Status: S1–S3 BUILT (v1.112); openable phone BUILT (v1.115, 2026-07-16) —
PHONE dashboard slot beside the walkman opens a handset+LCD modal with CALYPSO
and RON SMS threads, keyword responders (calypsoSms by hold band, ronSms in
radio voice), signal bars scaling with distance to Calypso's core, no-signal
send failure off-island, and a persisted nokiaLog. Texting Calypso nudges hold
+0.02. `player.phone` slot ready for future handset swaps. Snake BUILT
(v1.116): SNAKE tab, 84x48 authentic-resolution canvas, wrap edges, 7 a feed,
high score persisted; plus click-to-eat, the washed-ashore beach start, and
the sci-17 DCT3/MAD2WD1 lore fragment. v1.117–1.119: the handset IS the modal — the
live LCD is overlaid on the sprite's own screen window, zoomed all the way in
so the glass fills ~70% of the viewport and the maker's badge stays out of
frame; the LCD type scales with the glass, and texts and Snake happen on the
phone's actual screen (LCD-only fallback under 720px). The
depart-mode flip (R3) remains deferred. Draft copy (including the SMS responder tables) is live and flagged
for David's voice pass before it is canon.**

## 1. The reframe this build implements

The machines on Ogygia were never hers. The network is literally named POSEIDON —
the countdown, the obelisks, the skylink — and Poseidon is the god who turns you
back at sea. So: **the robots that roam Calypso's island are Poseidon's, and
Calypso is the local keeper caught between wanting you to stay and not wanting
his things to kill you — because a dead guest cannot be kept.**

This resolves the tutorial-island contradiction without touching combat numbers:
Poseidon's machines stay exactly as lethal as they are (the island keeps its
teeth; it is where the player learns to fight before Aegilia's raid). What
changes is that Calypso becomes *present* across the whole island instead of a
voice at one terminal — and her presence is a **Nokia 3310** you land with.

**The help is the trap.** Her texts are the game's tutorial: warnings about
Poseidon's robots, tips for avoiding and fighting them, where things are. Every
kindness is an argument to stay. The tutorial content and the seduction are the
same messages. Occasionally she *intervenes* — a robot bearing down on you
flickers amber and freezes mid-stride ("I bought you a moment. Rest now.") —
and her willingness to do this is a **gradient tied to leaving**: strong while
you linger, gone when you make for the ship. Her care is real, and it is a leash.

## 2. The device: why a 3310

- **Register.** Sibling to the Walkman and the cassette title-screen — the
  retro-tech register is established. And the 3310 is *the* phone that would
  survive the apocalypse; it being the one working handset left is the joke
  telling itself.
- **Voice contrast.** A goddess does not use txtspk. Her SMSes arrive in full
  sentences, perfectly punctuated, on a 84×48 monochrome screen. The collision
  of the Odyssey Book 5 register with a green-backlit LCD *is* the wrongness.
- **Fixture, not item** (walkman precedent, player.js:186): `player.nokia` is
  worn, never dropped, never eats a pocket slot. You cannot lose her number.
- **Sound.** The authentic Nokia SMS tone is Morse code for "SMS"
  (`··· −− ···`). sound.js is a case-based procedural synth — add case `'sms'`:
  three short square blips, two long, three short, ~1400Hz. Instantly readable.

## 3. The gradient: `calypsoHold` (0..1)

One scalar, on the player, persisted. **Her hold on you IS her protection of
you** — the keeping and the caring are the same number, which is the theme.

- **Starts at 0.65** on a new game (she has kept you seven years; you begin held).
- **Rises** (capped 1.0): resting (+0.10 per full rest), slow ambient drift
  while ashore on Ogygia doing non-leaving things (+0.005/s while within the
  island interior, not near the shore vessels).
- **Falls** (event step-downs): pick up a ship part (oar/rope/sail) −0.05 each;
  craft the boat −0.15; refunction her / obtain the golden axe −0.25; craft the
  greek ship −0.20; linger within 6 tiles of a beached vessel −0.01/s; board a
  vessel (attempt) −0.30.
- **The Poseidon beat:** when the failed crossing throws you back onto her sand
  (crossFail landfall), hold **rises +0.15** and she texts warm relief — *"The
  sea sent you back to me. It always will."* The two gods are one system
  keeping you there; the player feels the pincer.

What hold gates:

| hold | texts | intervention |
|---|---|---|
| ≥ 0.70 — **warm** | tender, protective, generous tips | active: chance-roll when a hostile is within DANGER_R (6 tiles) of you; freeze it `disabledT = 5s` (existing stun + amber flicker), cooldown 60s (40s at hold ≥ 0.85) |
| 0.40–0.70 — **wary** | still helpful, edged with hurt | halved chance, cooldown 120s |
| < 0.40 — **cold** | sparse, pleading, then silent watching | **never** — you lose your guardian exactly when you most want her |

Interventions and the ambient drift run **only on `currentWorld.keeper`** — a
new world flag set by calypso.js alone (house style: `transmute`, `prohibition`,
`departTrial`). Texts also only fire there; on every other island the phone
shows one line, once, on arrival: **NO SIGNAL** (see S3 — one world-building
line, and it quietly promises the phone a future).

## 4. Stages (each shippable + verifiable)

### S1 — the phone exists: fixture, toast, beep, first text
- `player.nokia = true` (fixture; granted on load for existing saves — the
  golden-axe backfill precedent, v1.93 lesson).
- **The SMS toast**: a small Nokia-LCD panel, lower-right above the hint line —
  greenish backlit ground (`#9fb98a`-family), dark-olive pixels, monospace/pixel
  font, `CALYPSO` header, message body. Distinct from say() narration and the
  walkman toast. A **queue** with min-interval ~4s (landfall clusters events);
  auto-dismiss ~7s, longer for long texts.
- sound.js case `'sms'` (Morse SMS as above).
- One wired text: landfall on Ogygia. End-to-end plumbing proof.

### S2 — the message script: tutorial-as-seduction
- `src/game/nokia.js`: the text tables + trigger bookkeeping. Data, not code:
  `{ trigger, tier?, once?, lines }`. One-shot triggers record into
  `player.nokiaSent` (a Set, persisted) so reloads don't re-tutorial.
- Triggers (all Ogygia-gated): landfall · first hostile within 10 tiles (+
  per-class first-sighting tips: T1/T2/W1/W4...) · first weapon picked up ·
  first rest (her happiest text) · nightfall · HP < 35% · first obelisk
  approach · boat crafted · golden axe granted · ship crafted · boarding
  attempt · crossFail return · the moment you finally sail (her last text).
- Tier tables where tone varies (same trigger, different line by hold band).
- **Draft copy for every trigger ships with this stage — flagged for David's
  voice pass before it's canon.** Samples, to set the register:
  - *landfall:* "You are awake. There are machines on the island tonight — his,
    not mine. Stay near the house lights and they will not find you."
  - *first W1 near, warm:* "The one hunting you now is a runner. It cannot
    swim. The stream is your friend, as I am."
  - *rest, warm:* "Good. Sleep. Nothing out there is worth what it costs to
    reach it, and everything here is already yours."
  - *ship crafted, cold:* "I can see it from the hill. It is well made. You were
    always going to be good at leaving."
  - *crossFail return:* "The sea sent you back to me. It always will."
- **This stage replaces nothing** — say() narration and existing hints stay;
  the phone is an added channel.

### S3 — the hold gradient + her interventions
- `player.calypsoHold` (init 0.65; persisted; the rises/falls of §3).
- The intervention roll in the Ogygia combat loop (a 0.5s-tick scan of
  `currentWorld.robots` within DANGER_R — trivial cost): freeze via
  `r.disabledT = 5` (setter precedent: main.js:1259, combat.js:274), fire the
  intervention text (tiered), sfx `'sms'` then `'zap'`.
- Tier selection goes live for all tiered triggers.
- `keeper` world flag in world.js + calypso.js; **NO SIGNAL** one-shot on
  arriving anywhere that isn't Ogygia.
- HUD: nothing new — the toast is the phone's whole presence (dashboard space
  is tight; we just fixed an overlap there).

### S4 — DEFERRED (own conversation): the openable 3310
- A modal (ronnotebook precedent, main.js:1723): the 3310 chrome drawn around
  an 84×48-logical LCD scaled ~4× nearest-neighbour; **Messages** inbox of
  everything received (from `player.nokiaSent` + a stored log).
- Easter eggs that pay for the modal: **Snake.** (And the ringtone, composed.)
- The cross-island future (design later, build later): Aeaea — texts arrive in
  *your own* voice; Aegilia — the eye jams her ("NO SIGNAL" gains meaning);
  Ithaca — the phone finally rings.

## 5. Files
- `src/game/nokia.js` (new) — text tables, queue, triggers, hold bookkeeping.
- `src/engine/sound.js` — case `'sms'`.
- `src/engine/ui.js` — the Nokia toast panel (drawn like the walkman toast).
- `src/game/player.js` — `nokia`, `nokiaSent`, `calypsoHold`; fall-hooks in
  craftBoat/craftGreekShip/stow(part)/boardBoat.
- `src/game/world.js` + `src/islands/calypso.js` — `keeper` flag.
- `src/main.js` — trigger scan + intervention roll (Ogygia branch), crossFail
  return hook, save/restore of the three player fields, NO SIGNAL on switch.

## 6. Verification
- Unit: hold arithmetic (rises/falls/clamps; the crossFail +0.15 beat); trigger
  one-shots survive a save/load round-trip; tier selection at band edges.
- Live (browser, the usual discipline): land on Ogygia → landfall text renders
  in the LCD toast with the beep; walk at a robot → warning text; force hold
  high + robot adjacent → it freezes amber with the intervention text; drain
  hold below 0.4 → interventions stop, texts go cold; board the unfinished
  boat → Poseidon returns you → the relief text and hold visibly rises; sail to
  another island → NO SIGNAL, then silence. `node --check` + tests + the
  dynamic-import black-screen guard before every push.

## 7. Decisions (David, 2026-07-15 — all four settled)
1. **Sender name: `CALYPSO`.** Full name on every text — the tutorial channel
   must instantly attribute itself; it matches her core terminal and the island
   label.
2. **Intervention tell: her indigo on his machine.** The frozen robot's
   stun-flicker overrides the standard amber with Calypso's indigo (`#4b5cc4`)
   for the freeze duration — her colour touching Poseidon's machine. Implement
   as a per-stun colour override (`r.stunColor`, read where STUN_AMBER is
   applied, robots.js:302/1794; cleared when `disabledT` expires).
3. **Boarding texts: both, different lines.** Cold as you shove off (she
   watches you go); warm relief when Poseidon returns you. The two texts
   bracket the failed voyage — the pincer made audible.
4. **Toast position: lower-right, above the hint line** — where a phone sits,
   clear of the say() narration (lower-left). On touch devices it lifts above
   the JUMP/run button cluster that owns that corner.
