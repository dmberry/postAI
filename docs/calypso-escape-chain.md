# The Calypso escape chain — hack CALYPSO to leave Ogygia

Companion to [`islands-plan.md`](islands-plan.md) §10 decision #8 ("Departure gate:
Calypso's leave") and to `islands-odyssey-revision.md` R3 (Calypso as the
break-out-to-the-raft tutorial — that doc currently lives in the `postAI` worktree,
see *Sequencing*). This is the **puzzle spine** of Calypso's depart-mode island: the
multi-step hack that earns "Calypso's leave" and lifts Poseidon's turn-back.

**Status: design agreed (David + Henrik, 2026-07-12). Not yet built.** Sits downstream
of R1/R2/R3. The Lion's Gate is the fortress entry, so **COORDINATE with Henrik**
(`fortress.js`).

---

## 1. The myth, mechanised

*Odyssey* Book 5: Zeus decrees Odysseus's release and sends Hermes to command Calypso;
she, compelled, gives him the tools to build a raft and lets him go; Poseidon storms the
crossing. The chain mechanises exactly that, with **two deliberate inversions** — the
Benjamin *Umfunktionierung* the whole game runs on:

- where Homer's Calypso *gives* the tools, you *seize* the master key from the factory;
- where Homer's Hermes *delivers* Zeus's command, you *forge* it yourself.

You do not receive the gods' authority. You refunction the machines' own apparatus into it.

---

## 2. One object, three names

| State | Gained by | Carries |
|---|---|---|
| **ai-key** | wreck the W-factory (or reprint at an OB) | `access-ai-code.ml`, `factory-id.ml` |
| **Trojan key** | copy `root-access.ml` onto the ai-key | + `root-access.ml` |
| **hermes card** | copy `zeus-lightning.ml` onto the Trojan key | + `zeus-lightning.ml` |

Files are **copied, never moved** — `factory-id.ml` and `access-ai-code.ml` each do
double duty downstream, so they must persist on the card.

---

## 3. The chain

| # | Where | Needs → Makes |
|---|---|---|
| 1 | W-factory | wreck it → **ai-key** |
| 2 | any OB | insert → **auto-registers** the access code across the OB net (backup) |
| 3 | OB | `ELIZA factory-id.ml` → `root-access.ml`; copy onto key → **Trojan key** |
| 4 | Lion's Gate → Calypso terminal | Trojan key admits you; recce, but she rejects commands and holds you soporific |
| 5 | HERMES | read `readme.md`; forge `zeus-virus.ml` + `root-access.ml` + `access-ai-code.ml` → `zeus-lightning.ml`; copy onto card → **hermes card** |
| 6 | Calypso terminal | run `zeus-lightning.ml` → refunction Calypso (Zeus's command) → set `calypsoLeave` |
| 7 | shore | raft break-out under Poseidon (R3) → **escape** |

Acyclic and complete: every file is in hand before it is used; with the step-2 autocopy
there is no softlock at any stage.

---

## 4. Three access tiers at Calypso

1. **Lion's Gate** — opens to the **Trojan key**. The rename is the threshold: a bare
   aikey carries `factory-id.ml` but is not a Trojan key, so it cannot open the gate.
2. **Terminal access** — the Trojan key jacks you in to scout.
3. **Command / release** — the **hermes card** only. Without the virus, Calypso rejects
   your commands, drops you into torpor, and murmurs *stay* — `kalyptō` at the console,
   the same lotus-torpor the depart-mode guards use (R3). Her rejection carries the one
   thread that moves her: *"no will of yours commands me; only the sky-father's word"* —
   Book 5 exactly, and the pointer to Hermes.

---

## 5. Two benches

- **OB** — transform-and-backup workbench: the ELIZA transform, the autocopy backup, the
  aikey reprint.
- **HERMES** — the virus forge: read the recipe, combine the three files into
  `zeus-lightning.ml`. Off-grid still (no network verb — that would expose the relay),
  but now a maker's bench as well as an archive. **The charter comment at
  `ronml.js:~251` ("an INFORMATION resource, not a workshop… nothing fabricated") must be
  revised** to license local forging while keeping the no-network stealth rule, e.g.:

  > HERMES is off-grid: it never touches the network (that would expose the relay), but it
  > is a maker's bench as much as an archive. It forges only from what you carry in.

---

## 6. Recovery loop (autocopy)

Insertion auto-registers the access code across the OB net, so the backup is guaranteed
the first time you use any OB — which you must, to run the transform. Lose the card at any
stage → reprint a fresh ai-key at any OB → redo the ELIZA transform. Two conditions:

- **Network-wide**, not per-OB (reprint anywhere).
- **Surfaced once** on first insert (*"this node caches your key — reprint here if you lose
  the card"*); `show aikey` verifies it. A silent net will not stop the panic on loss.

This makes the OB the primary recovery route; HERMES `restore` becomes belt-and-braces.

---

## 7. Side by side with the Odyssey (Book 5)

Line references are approximate — firm against the text.

| Game beat | *Odyssey* (mostly Book 5) | Note |
|---|---|---|
| Wreck the W-factory for the **ai-key** | Calypso gives Odysseus the bronze axe and adze (~5.234) | **Inversion:** Homer's *gift* becomes the game's *theft* — refunction, not receive |
| `ELIZA` transform → **Trojan key** | Odysseus *polymētis*; the man of the Wooden Horse, recalled by Demodocus (8.492–520) | The Trojan key names his signature stratagem — deception turned on the citadel |
| Trojan key at the **Lion's Gate** | — (Ogygia is a cave-island, no citadel) | Game overlay: the daemon-fortress. The Trojan-through-the-gate reaches to the fall of Troy, not Book 5 |
| Recce the terminal under **torpor**; she says *stay* | Seven years' detention; the offer of immortality; Odysseus weeping on the shore (~5.151–158) | *kalyptō* — detention by comfort, not force |
| Forge the virus at **HERMES** → **hermes card** | Hermes carries Zeus's command to Ogygia (~5.28–148) | **Inversion:** Homer's Hermes *delivers*; the player *forges* the command |
| Run `zeus-lightning.ml` → Calypso released | Compelled by Zeus, Calypso lets him go (~5.160–170) | She yields to Zeus, never to Odysseus |
| **Raft break-out** under Poseidon | The raft built over four days, launched, wrecked by Poseidon's storm (~5.243–261, ~5.291–332) | Decision #8: without "her leave," Poseidon turns you back |
| The turn-back storm | Poseidon's grudge — Odysseus blinded Polyphemus | POSEIDON = the net / the sea, the nostos's standing antagonist |
| Autocopy / OB reprint | — | Game-only: a mercy of the save system, no Homeric beat |

---

## 8. To build (new subsystem over existing RON-ML primitives)

**Build status (2026-07-12): Layer A BUILT + the escape loop CLOSED.** The whole terminal
hack `ai_key → trojan_key → hermes_card` runs at the obelisk + HERMES consoles, with
autocopy/reprint recovery; 57 unit tests; live-verified card state machine. **Stages 6–7
now close the loop (v1.90):** the `retire` command (hermes card in hand) refunctions
Calypso and sets `player.calypsoLeave` (persisted in the save); boarding a beached boat at
the shore (`player.boardBoat`, reached via the E-key `useHands` path) reads that flag —
with it you sail off Ogygia (a victory certificate, "you sailed from Ogygia"); without it
Poseidon's storm hurls you back onto the sand (decision #8). Still deferred to the fortress
work: R3 `winMode:'depart'` (raft-launch break-out replacing the destructible core),
Calypso's soporific rejection of un-armed commands at her terminal, and per-island voice.


**Exists:** `copy`(key) / `decrypt` / `unlock` / `backup` / `restore` / `eliza`(DOCTOR) /
`print aikey`.

**New:**
- device/drive filesystem — `cd <device>`, `ls`, `copy <file> <device>`; files as carriable objects
- `eliza <file>` as a deterministic transform (arity-1 overload of today's arity-0 DOCTOR)
- the HERMES forge/combine verb (three files → `zeus-lightning.ml`), station-gated
- card-rename triggers (ai → Trojan → hermes)
- Calypso's terminal + a run-virus verb that sets `calypsoLeave` and fires the R3 release
- autocopy-on-insert + OB reprint-from-backup (extends `print aikey`, which today needs a held key)
- `show aikey`

---

## 9. Sequencing / prerequisites

- **R1 first** (roster rename ZEUS→CALYPSO) so "Zeus" reads as the sky-father, not the
  island's daemon.
- Rides **R2/R3** (fortress-as-module; depart mode).
- Per "never orphan the endgame," do not soften Calypso until **Polyphemus** carries the
  hard raid.
- **COORDINATE with Henrik**: the Lion's Gate is the fortress entry (`fortress.js`).
- **Docs hygiene:** `islands-odyssey-revision.md` (R1–R5) is not committed into this
  worktree — it lives in the `postAI` checkout. Worth committing so R1–R5 travel with the
  code and this doc can link it.

---

## 10. Open / to firm up

- The ELIZA transform is deterministic (A⇒B fixed): the challenge is *discovering* you must
  do it, not the transform itself. Fine for a first pass; revisit if it wants real puzzle depth.
- Odyssey line references in §7 are approximate — firm against the text.
- Final wording of Calypso's soporific rejection, and the HERMES charter rewrite.
