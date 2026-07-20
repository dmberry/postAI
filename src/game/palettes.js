// Per-island ground palettes (B2 of the island character pass).
//
// Every island used to render in exactly the same greens, because FLOORS
// (tiles.js) is a shared singleton read straight by the renderer. These tables
// are hung on the map as `map.palette` / `map.treeTint`, and the renderer's
// drawFloor + minimap + drawTree prefer them over the defaults — so an island's
// whole ground character is one entry here, and no other island is touched.
//
// Only the *natural* floors are overridden. The fortress decks (panel/quad/
// sanctum) stay identical everywhere on purpose: the machine architecture is
// the one thing that is the same wherever you land, and it should read as
// imported, not native.
//
// The colours are chosen against each island's Homeric character rather than
// for variety's sake:
//
//   OGYGIA (Calypso)     lush, cool, over-green — a place that keeps you
//   AEGILIA (Polyphemus) hard volcanic rock and coarse scrub; the goat isle
//   AEAEA (Circe)        dark enchanted growth, everything a little too rich
//   THRINACIA (Helios)   sun-bleached, parched, gold — the cattle's meadows
//   ITHACA               home: warm, soft, the most beautiful ground in the game

export const ISLAND_PALETTES = {
  // Ogygia: deep sappy green, pale shell sand. The island is a comfortable
  // prison, so it is the greenest and softest of the martial four.
  calypso: {
    palette: {
      grass: '#4f8f52',
      tallgrass: '#5f9243',
      dirt: '#7d6a4c',
      sand: '#d8cba6',
      stream: '#4f83b5',
    },
    treeTint: { color: '#63b06a', strength: 0.30 },
  },

  // Aegilia, the goat isle: burnt volcanic ground, ash-grey sand, scrub
  // clinging on. Polyphemus's rock, and it should feel like rock.
  polyphemus: {
    palette: {
      grass: '#6b7042',
      tallgrass: '#79763f',
      dirt: '#6b5340',
      sand: '#a89b84',
      stream: '#5b7d92',
    },
    treeTint: { color: '#7d7a4a', strength: 0.45 },
  },

  // Aeaea: Circe's garden. Everything grows too well here — a dark, wet,
  // over-fed green with the faintest violet in the shadows.
  circe: {
    palette: {
      grass: '#3f7a45',
      tallgrass: '#4a7c3a',
      dirt: '#5f4a44',
      sand: '#b3a48f',
      stream: '#4a7f8c',
    },
    treeTint: { color: '#2f6b46', strength: 0.5 },
  },

  // Thrinacia: the sun's own island, where the light is the sensor. Parched
  // gold, bleached ground, the grass burnt pale by a sun that never looks away.
  helios: {
    palette: {
      grass: '#94914a',
      tallgrass: '#a89b46',
      dirt: '#93764a',
      sand: '#dcc98d',
      stream: '#6f96a8',
    },
    treeTint: { color: '#b09a4e', strength: 0.5 },
  },

  // Ithaca: home. The warmest, kindest ground in the archipelago — olive and
  // meadow green, soft golden sand. Nothing here is bleached or burnt; it is
  // the one island whose colour is meant to be a relief after the others.
  ithaca: {
    palette: {
      grass: '#5d9a4e',
      tallgrass: '#7aa54a',
      dirt: '#8a7050',
      sand: '#e2d2a4',
      stream: '#5a93bd',
      water: '#3f7cb4',
    },
    treeTint: { color: '#7cbf63', strength: 0.32 },
  },
};

// Per-island TERRAIN profiles (B1) — passed to buildWorld(seed, cfg). These are
// what stop the five islands being the same map with a different RNG stream:
// where the water runs (or whether there is any), how mountainous, how built-up,
// how wooded. Omitting an island here gives it the original Ogygia layout.
export const ISLAND_TERRAIN = {
  // Ogygia: the reference layout, unchanged — north-south river, the full town,
  // moderate hills. It is the island everyone has already played, and the one
  // the tutorial's landmarks are tuned against. The lotus grove is HERS ALONE
  // (it used to be generated on every island, at the identical spot).
  calypso: {
    lotus: true,
  },

  // Aegilia: the goat isle. Cyclopes keep no towns — a thin scatter of huts, no
  // proper road grid, and the most mountainous ground in the archipelago (goats
  // and caves). The river is a narrow torrent cutting the east.
  polyphemus: {
    river: { cx: 88, amp: 5, freq: 0.07, halfMin: 0.6, halfMax: 1.2 },
    roads: 'spur',
    lots: 5,
    hills: { count: 9 },
    hollows: { count: 5 },
    forests: { density: 0.55 },
    meadows: { count: 3 },
    wrecks: { count: 2 },
  },

  // Aeaea: Circe's wooded island. Homer's men see smoke through dense oak and
  // thicket — so the heaviest forest cover of the five, a broad slow river
  // running EAST-WEST across the middle, and only the hall and its outbuildings.
  circe: {
    river: { cx: 58, amp: 12, freq: 0.03, halfMin: 1.6, halfMax: 3.0, axis: 'ew' },
    roads: 'none',
    lots: 4,
    hills: { count: 4 },
    hollows: { count: 2 },
    forests: { density: 1.9 },
    meadows: { count: 5 },
    wrecks: { count: 0 },
  },

  // Thrinacia: the sun's meadows, where the cattle graze. Wide open pasture —
  // barely any forest, no river at all (a parched island), gentle ground, and a
  // single coastal road. The emptiness is the point: nowhere to hide from a sun
  // that is also the sensor.
  helios: {
    river: null,
    roads: 'coastal',
    lots: 6,
    hills: { count: 3 },
    hollows: { count: 1 },
    forests: { density: 0.3 },
    meadows: { count: 7 },
    wrecks: { count: 3 },
  },

  // Ithaca: home, and the most beautiful ground in the game. A generous river,
  // rolling hills, deep woods AND open meadows, the full town intact — every
  // landscape feature the archipelago has, at its kindest. Nothing here is
  // stripped back; the abundance is the reward.
  ithaca: {
    river: { cx: 46, amp: 14, freq: 0.038, halfMin: 1.2, halfMax: 2.4 },
    roads: 'grid',
    lots: null,
    hills: { count: 7 },
    hollows: { count: 4 },
    forests: { density: 1.4 },
    meadows: { count: 7 },
    wrecks: { count: 1 },  // one wreck, long grown over: the war barely touched here
  },
};

export function islandTerrain(islandId) {
  return ISLAND_TERRAIN[islandId] || {};
}

// Hang an island's palette on its map. Safe to call with an unknown id (the
// island simply keeps the shared defaults).
export function applyIslandPalette(map, islandId) {
  const p = ISLAND_PALETTES[islandId];
  if (!p) return map;
  map.palette = p.palette;
  map.treeTint = p.treeTint;
  return map;
}
