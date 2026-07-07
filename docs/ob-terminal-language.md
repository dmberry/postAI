# RON-ML — the obelisk terminal language (design)

*Status: implemented in v0.84 (`src/game/ronml.js` + the REPL wired into `#obterminal`
in `main.js`). The terminal UI + click-to-open shipped in v0.80 as a read-only VT220
shell; this doc was the plan for making it do something, and is now also the reference
for how it actually works. Shipped without lambdas, per §8. `sing` deviates from the
"kicked out on a hit" plan below: instead of an interrupt-on-hit mechanic, being
jacked in keeps you fully hidden from the machines the whole time (`player.terminalSafe`),
and typing `sing` deliberately drops you straight out of the terminal so you can watch
the choir sequence happen in the world, rather than reading about it in the console.*

## 1. The fiction

The obelisks are terminals into SKYLINK — the AI network. Before the collapse, RON
(the resistance) reverse-engineered a sliver of the operators' own console language
and left fragments of it scrawled across the world: on walls, in notebooks, on
floppy disks and dead machines. A survivor who collects those fragments, finds an
**AI key** (dropped by a destroyed W-factory), and jacks into an obelisk can type
those fragments back in to make the machines do things they were never meant to.

The language is **RON-ML**: a tiny, functional, ML-flavoured console language. It is
deliberately small enough that a player can *learn* it — not copy-paste blindly, but
come to understand `let ... in`, function application, and the pipe, and start
composing their own commands. That understanding is the real reward: late game, the
same language hacks robots directly, not just obelisks.

Design north star: **the player should be able to write a command they were never
handed, because they understood the pieces.**

## 2. Why ML (functional), and how small

Functional because it fits the fiction (a query/console language over "the network"
reads as declarative), and because a pure expression language is the *smallest*
thing that still feels like a real language — no statements, loops, or mutable state
to teach. Everything is an expression that evaluates to a value; some values, when
they reach the top level, *happen* (an effect).

The whole language is ~7 primitives + 3 syntactic forms. That's the entire surface
area a player must learn.

### Values (implicit types — never written)
- **node** — an obelisk/robot id, written as its hex, e.g. `OB-BB05`, `T2-1F` .
- **key** — an access token (from `hack`, or the physical AI key you hold).
- **num** — `30`, `0`.
- **list** — `[OB-BB05, OB-1C0E]` (what `scan` returns).
- **unit** — `()`, the result of an effect.

### Syntactic forms (all a player must learn)
1. **Application by juxtaposition** — `sleep 30`, `hack OB-BB05`. (Not `sleep(30)`,
   though we accept parens too, so beginners aren't punished.)
2. **`let name = expr in expr`** — bind a result to reuse it. This is the one real
   idea to teach, and the HACK→CRASH chain forces it.
3. **Pipe `|>`** — `scan |> nearest |> crash` feeds a value left-to-right. Sugar for
   nested application; entirely optional, but it's how the elegant one-liners read.

Comments are `(* ml style *)`. Whitespace-insensitive. Case-insensitive keywords.

## 3. The primitives (the "verbs")

| verb | type | effect | gate |
|---|---|---|---|
| `scan` | `unit -> list` | returns nodes/robots in range of this terminal | always |
| `nearest` | `list -> node` | the closest element of a list | always |
| `hack n` | `node -> key` | returns node `n`'s access key (its hex) | needs an **AI key** held |
| `crash n k` | `node -> key -> unit` | knocks node `n` offline until a repair drone reaches it; wrong/absent key fails | needs `k` from `hack n` |
| `sleep t` | `num -> unit` | this AI's local machines idle for `t` game-minutes | needs AI key |
| `repel` | `unit -> unit` | nearby robots' targeting inverts: they flee you for a spell | needs AI key |
| `sing` | `unit -> unit` | the Portal easter egg (§6) | secret; needs the exact fragment |
| `keys` | `unit -> list` | the keys you currently hold | always |
| `map` | `unit -> unit` | opens a schematic of the AI's territory: obelisks (coded), machines, the factory, the mainframe you're hunting, and you | always (added post-design) |
| `print` | `unit -> unit` | runs off a physical **printed map** item that drops at your feet — pick it up and use it to unfold the map anywhere, away from a terminal | always (added post-design) |

Two more worth adding once the base works:
- `disable n` (`node -> key -> unit`) — permanently fuses a *robot* (not an obelisk)
  you've hacked, for scrap. The robot analogue of `crash`.
- `beacon` (`unit -> unit`) — flip the awareness meter to *quiet* for this zone (ties
  into Henrik's awareness-meter idea).

### The HACK → CRASH chain (the teaching moment)
`crash` refuses to run without the node's own key. `hack` is the only way to get it.
So the first real program the player writes is the two-step:

```ml
let k = hack OB-BB05 in
crash OB-BB05 k
```

Once they've typed that a few times, the pipe version is a small, satisfying step up:

```ml
scan |> nearest |> (fn n => crash n (hack n))
```

(We can ship without lambdas; `let` alone teaches the idea. `fn x => e` is a stretch
goal for the players who want it.)

## 4. Gating — key, range, and not-getting-hit

Three gates, each doing narrative + mechanical work:

1. **You need an AI key** (physical item, from a destroyed W-factory) to do anything
   with teeth. `scan`/`keys`/`nearest` are free (they read, they don't act). One key
   unlocks one AI's quadrant of nodes (ties straight into the eventual four-AI map).
2. **Range** — a terminal only `scan`s / `hack`s / `crash`es nodes in its own network
   neighbourhood, so you have to physically get to the right obelisk.
3. **You must not be hit while typing.** The terminal is a modal, but the world keeps
   running behind it (robots still hunt). Taking a hit **kicks you out** of the
   terminal mid-command ("CONNECTION LOST"). So hacking is a real decision: clear the
   area, or `repel`/`sleep` first to buy the seconds you need for the big command.
   This is why the modal deliberately does **not** pause the game.

## 5. Seeding the language in lore

The fragments already exist as a system (`lore.js`, the Archive). Add a new fragment
`kind: 'code'` (green-on-black, already styled) whose text is a runnable snippet plus
a scrap of operator commentary. The player learns by collecting and reading them:

- **Fragment A (early, teaches application):**
  > `sleep 30` — "typed it and the whole yard went quiet for half an hour. don't
  > know why it's minutes. — J"
- **Fragment B (teaches `scan`/`nearest`/pipe):**
  > `scan |> nearest` — "it lists what's on the wire. nearest picks the closest. the
  > `|>` just passes it along, like handing it down a line."
- **Fragment C (teaches `let`, the HACK→CRASH chain):**
  > ```
  > let k = hack node in
  > crash node k
  > ```
  > "you can't crash blind. hack first — it hands you the node's own key — then crash
  > with it. put your obelisk's code where it says node."
- **Fragment D (REPEL):** `repel` — "flips them. they run from you instead of at you.
  buys a minute, no more."
- **Fragment E (the secret):** a torn, half-legible page that only hints at `sing`
  (§6) — never spells it out, so discovering it feels earned.

Fragments teach one idea each, in roughly this order. The player assembles a
**personal cheat-sheet** in their head (or on paper) — that's the intended loop.

## 6. `sing` — the Portal easter egg

The secret command. Typing `sing` (only discoverable from Fragment E's riddle, or by
experiment) makes every robot within range **stop hunting, form a line, face the
player, and perform the choir/credits refrain**, then power down one by one — a
direct nod to *Portal*'s "Still Alive"/end sequence. It's a pure treat: no key
needed, no combat value beyond the deactivation, and it should feel like the game
winking at you. Implementation: a scripted `choir` state on the affected robots
(line-up target positions + a shared timed animation + a synthesised a-cappella
motif), then `drained = true`.

## 7. Implementation plan

Small and self-contained. Suggested new module `src/game/ronml.js`:

1. **Tokenizer** — identifiers/hex, numbers, `let`/`in`/`|>`/`=`/parens, `(* *)`
   comments. ~40 lines.
2. **Parser** → tiny AST: `App`, `Let`, `Pipe`, `Var`, `Lit`, `NodeRef`. Pratt or
   recursive-descent; the grammar is trivial. ~80 lines.
3. **Evaluator** — an environment of built-ins; each primitive is a JS function
   `(args, ctx) => value`, where `ctx` carries the world (`map`, `player`, `robots`,
   the terminal's owning obelisk, the player's held keys). Effects mutate the world
   via the same hooks the game already exposes (e.g. reuse the SKYLINK-cancel path
   for `crash`, the sleep mechanic for `sleep`, a targeting flag for `repel`). ~120
   lines.
4. **Terminal REPL** — wire the existing `#obterminal` modal to accept typed input:
   an input line, an output log, command history (up/down). Print results/errors
   RON-DOS style. Errors are *teaching* errors: `crash OB-BB05` alone →
   `ERR: crash needs a key. try: let k = hack OB-BB05 in crash OB-BB05 k`.
5. **Interrupt hook** — `player.takeDamage` (while a terminal is open) closes it with
   `CONNECTION LOST`.

Nothing here needs the four-AI map first; it works against the current single network
(one AI key, the existing obelisks/factory). The four-AI world later just means
"which key opens which quadrant's nodes."

## 8. Open questions (decide before building)

- **Lambdas or not?** `let` alone is enough for the HACK→CRASH chain and keeps the
  language teachable. Ship without `fn x => e`; add it only if players want the
  one-liner.
- **Persist learned commands?** A "known fragments" list survives death (like skills),
  so re-typing isn't punished — but you still need a key and range each time.
- **How forgiving is the parser?** Lean forgiving: accept both `sleep 30` and
  `sleep(30)`, ignore case, ignore trailing junk, and make every error a hint. The
  goal is teaching, not gatekeeping.
- **Effect scope of `sleep`/`repel`** — this obelisk's neighbourhood, or the whole
  AI's quadrant? Suggest neighbourhood now, quadrant once the key/quadrant model
  exists.
