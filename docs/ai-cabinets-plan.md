# The AI cabinets — one arcade game per daemon

**Status:** ideas, not yet built. Filed under Phase 2 of
[ROADMAP.md](ROADMAP.md), which is the master list; this doc is only the detail
behind that one line. Raised 2026-07-21 after the narrows cabinet
(v1.150–v1.167) turned out to work. Nothing here is committed to; it is the
design conversation written down so it survives the night.

## Why this is worth doing

The narrows works for one reason, and it is not that arcade games are fun. It
works because **the form is the argument**. Homer's bargain is a choice made
continuously, under pressure, with your hands — and as a two-button modal it was
made once and watched. Turning it into a played channel did not decorate the
idea, it stated it.

So the test for every cabinet below is the same, and it is a hard one:

> Does the mechanic say something true about *this* AI that prose could not say
> as economically?

A minigame that is merely a game bolted onto a door fails the test. If a cabinet
cannot pass it, the terminal hack we already have is better.

## The shared chassis

The narrows already established the parts, and they are tested:

- attract screen with a coin (`narrowsStart`)
- a run-in, a channel, a **run-out**, so a passage has a shape
- a damage economy that ends the run (`hull`, `HULL_MAX`)
- a **GAME OVER / THROUGH card** with a tally, holding for ENTER
- pure rules in `src/game/*.js`, unit-tested with no canvas
- touch and keyboard through the one `moveIntent()` path

So each cabinet is **one rules module in the shape of `narrows.js`** plus a draw
method, not a new subsystem. If we build a second one, the first refactor is
lifting the attract/hold/card furniture out of `narrows.js` into a small shell
the rules modules plug into.

**A unifying frame worth considering:** every cabinet is the same delivery
problem wearing different clothes — you are firing `zeus-lightning.ml` past a
defence, and each AI defends in the way that AI defends. That gives the four
games a common spine and a reason to exist inside the escape chain rather than
beside it.

---

## CALYPSO — Pong you are not allowed to win  ·  BUILT v1.171

**The mechanic.** Pong, and she never misses. She returns everything, forever.
The rally is *pleasant*: the longer it runs the warmer the palette, the softer
the tone, the more the cabinet settles. There is no score to reach.

**The hack is to stop playing.** Hold still, let the ball past you, lose on
purpose. That is the only input that ends it.

**Why it is right.** She does not want you dead, she wants you to stay, and the
danger of her island is that staying is comfortable. Every other cabinet is
survived; hers is *refused*. It also lands exactly on the existing
`winMode: 'depart'` — you leave her, you do not beat her — and on the fact that
her core is indestructible by design.

**Risk to watch.** A game whose solution is inaction can read as broken rather
than as a point. It needs the rally to be genuinely nice and the exit to be
discoverable: probably she says something, in her own register, the longer you
keep the ball up.

**Smallest to build. Recommended first.**

## POLYPHEMUS — Breakout, played blind

**The mechanic.** Breakout, but the playfield is lit only inside the sweep of his
gaze. Outside the cone you are playing from memory: you hear a brick go, you do
not see which. A well-placed shot at the pupil blinds him and the whole field
lights for a few seconds — and the sweep comes back faster.

**Why it is right.** He is an eye. The whole island is a seeing problem, and
`nobody` is already the password: the terminal takes an empty username, which is
why it lets you in at all. Blinding him to see is the Odyssey's own joke about
him, made mechanical.

**Risk to watch.** Darkness plus a bouncing ball is frustrating fast. The lit
cone has to be generous and the memory of the field has to persist faintly
(afterimage), or it is guesswork rather than recall.

## CIRCE — memory, against an opponent editing your memory

**The mechanic.** A grid of pairs: each object and its transformed twin — man and
pig, ship and wreck, herb and poison. Match them and they stay matched. But every
few moves **she retransforms a pair you have already solved**, and you have to
notice. **Moly** is a single card that cannot be transformed: play it beside a
pair and that pair is locked for good.

**Why it is right.** She is the transformer. A matching game is about holding a
stable picture of what things are, and she is precisely the thing that will not
let a picture stay stable. Moly as the one fixed point is straight out of Od. X
and is already an item in the game.

**Risk to watch.** Memory games are slow, and this one is against a clock in a
game about deadlines. It may want to be small (4x3) and quick rather than a full
concentration grid.

## HELIOS — two candidates, pick one

**(a) The cattle.** His herd grazes the field and *your own crew* are walking
toward it. You are not shooting anything: you are heading your men off, and every
one that reaches a cow ends the run. The Homeric version, and the cruellest —
the failure state is not the monster winning, it is your people being hungry.

**(b) Missile Command, inverted.** He is the sun and sees everything. You are not
defending a city, you are intercepting light, and the sky brightens over the run
until there is nowhere dark left to move the payload through.

**Why (a) is right.** Thrinacia is the one island where the crew destroys itself
through appetite while Odysseus sleeps. A game where you lose by failing to
manage your own side is the only one of the four that is not about an antagonist
at all.

**Risk to watch.** (a) needs a crew to exist as a concept in the game; right now
you sail alone, which is exactly the translation problem the strait already had
to solve. That may make (b) the practical one.

---

## Open questions for the morning

- **Four cabinets, or one plus three terminal hacks?** Four is a lot of surface
  for one act of the game. It may be better to build Calypso's and see whether it
  earns the pattern before committing to the rest.
- **Do these replace the RON-ML terminal hack, or gate it?** Recommended: they
  gate it. The terminal is how you *say* the thing; the cabinet is how you get
  close enough to say it.
- **Where does the difficulty live?** The narrows has one hull and one ram. If
  each cabinet invents its own economy they will not feel like one game.
- **Refactor first.** Before cabinet two, lift attract/hold/GAME OVER out of
  `narrows.js`. Doing it during cabinet two is how the shell ends up shaped like
  whichever game happened to be second.
