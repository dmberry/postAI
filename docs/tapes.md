# Cassette tapes

The walkman plays cassette tapes found in the world. Tapes are **data-driven**:
the canonical list is the `TAPES` array in [`src/game/items.js`](../src/game/items.js),
which this file mirrors for humans. Adding a tape is one entry — no other code
changes.

## How playback works

- A tape has two sides, **A** and **B**. Each side is a list of track files that
  play in order and loop (a single-track side just loops that one track).
- Audio lives under folders named `assets/audio/Tape-NN <artist> - <title>/A/`
  and `/B/` — a **zero-padded number first** (keeps them ordered and gives an
  unambiguous handle) followed by the readable artist and title. The manifest
  is the source of truth, so the folder text is for humans; `dir` just has to
  match the folder exactly.
- In game the tape's item key is `tape_<num>`. The walkman starter is `tape_1`;
  the world-scatter seed and the underworld box reference tapes by that key.

## Adding a tape

1. Make a folder `assets/audio/Tape-NN <artist> - <title>/` (next free number)
   with `A/` and `B/` subfolders, and drop the `.mp3` tracks in.
2. Add an entry to the `TAPES` array in `items.js` with the **next number**,
   its `dir` matching the folder exactly:

   ```js
   {
     num: 5, artist: 'someone', title: 'the title', dir: 'Tape-05 someone - the title',
     color: '#c9a44a',
     a: { label: 'side a name', tracks: ['track one.mp3'] },
     b: { label: 'side b name', tracks: ['track two.mp3', 'track three.mp3'] },
   },
   ```

3. Seed it somewhere (optional): `drop(boards, 'tape_5', 1)` in `main.js` for the
   overworld, or a yellow box in `underworld.js` for the liminal space.

## Current tapes

| # | Folder | Artist | Title | Side A | Side B | Where |
|---|--------|--------|-------|--------|--------|-------|
| 1 | `Tape-01 meme - compilation` | meme | compilation | resonance | eliza · slip | walkman starter |
| 2 | `Tape-02 meme - maieutics` | meme | maieutics | maieutics 1 · 2 | maieutics 3 | scattered in the ruins |
| 3 | `Tape-03 WARD - bare stanhope` | WARD | bare stanhope | five · glock | tau bootis | yellow box, first underworld room |
| 4 | `Tape-04 Meme vs Xan - 24 EP` | Meme vs Xan | 24 EP | 24 · High | Release · Världen · Incognito | underworld / scatter |

> Note: the folder format could later be read from a manifest at runtime (so
> non-coders can add tapes without touching JS). For now the JS array is the
> single source of truth and this file is kept in step by hand.
