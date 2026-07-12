// Bitmap textures for floors, walls, and player faces, sourced from
// assets/textures/. Images load asynchronously; canvas silently no-ops
// drawImage on an incomplete image, so the renderer just falls back to the
// existing flat-colour fill until each one finishes loading — no
// promises/await needed in the render loop.
function load(path) {
  const img = new Image();
  img.src = path;
  return img;
}

// Floor/wall textures are re-warped from scratch onto a tiny (~64x32)
// diamond every tile, every frame, via a transform tied to the camera's
// continuous, sub-pixel position — so each frame samples a very slightly
// different window of the full-resolution source. At the ~500px source vs
// ~50px destination minification ratio involved, that shift reads as a
// visible shimmer/moiré as soon as anything moves (the camera follows the
// player, so this hit constantly) and stops the instant it's still.
// Pre-shrinking the source once, in the background, to roughly the size it
// actually renders at removes almost all of that fine detail up front, so
// there's nothing left for the per-frame sub-pixel jitter to alias against.
function loadDownscaled(path, size = 64) {
  const raw = new Image();
  const out = new Image();
  raw.onload = () => {
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    c.getContext('2d').drawImage(raw, 0, 0, size, size);
    out.src = c.toDataURL('image/jpeg', 0.85);
  };
  raw.src = path;
  return out;
}

const T = 'assets/textures/';

// Keyed by FLOORS type (tiles.js). Types not listed here keep their flat
// colour fill (tallgrass2) — no matching photo texture was worth forcing.
export const FLOOR_TEXTURES = {
  grass: loadDownscaled(T + 'floor-grass.jpg'),
  tallgrass: loadDownscaled(T + 'floor-grass.jpg'),
  water: loadDownscaled(T + 'floor-water.jpg'),
  stream: loadDownscaled(T + 'floor-water.jpg'),
  dirt: loadDownscaled(T + 'floor-dirt.jpg'),
  road: loadDownscaled(T + 'floor-road.jpg'),
  boards: loadDownscaled(T + 'floor-boards.png'),
  bridge: loadDownscaled(T + 'floor-boards.png'),
  sand: loadDownscaled(T + 'Sand.png'),
  // ZEUS's fortress decks: riveted metal panels for the corridors/maze,
  // paving for the open quad, and a darker panel for the inner sanctum.
  panel: loadDownscaled(T + 'panel-metal-1.jpg'),
  quad: loadDownscaled(T + 'floor-pavingstone.jpg'),
  sanctum: loadDownscaled(T + 'panel-metal-2.jpg'),
};

// A sparse dirt-patch variant scattered thinly through grass tiles for
// ground variety — see Renderer.drawFloor, which rolls a low, per-tile
// deterministic chance to use this instead of the usual grass texture.
export const GRASS_PATCH_TEXTURE = loadDownscaled(T + 'floor-secret.jpg');

// Natural rock/boulder surfaces (David's field photos, centre-cropped to the
// clean stone): the scattered rocks map one of these onto their little dome so
// they read as real mossy granite instead of a flat grey blob. A rock picks its
// variant deterministically from its tile, so the same rock keeps the same face.
// Downscaled like the floors to keep the per-frame minification shimmer down.
export const ROCK_TEXTURES = [
  loadDownscaled(T + 'rock-surface-1.jpg', 72), // small-rock: granite + moss
  loadDownscaled(T + 'rock-surface-2.jpg', 72), // mossyrock: pink-grey, heavy moss
  loadDownscaled(T + 'rock-surface-3.jpg', 72), // smallrock2: plain grey stone
];

// Wood grain for the loot crates. Each crate picks a variant and a slightly
// different opacity (see drawBox) so a row of them doesn't look stamped out.
export const BOX_TEXTURES = [
  loadDownscaled(T + 'box-wood-1.jpg', 64),
  loadDownscaled(T + 'box-wood-2.jpg', 64),
];

// Wood grain for the crafted boat (Renderer.drawBoat), stretched over the hull
// faces. [0] is the darker, figured grain used for the hull sides and deck;
// [1] the lighter, finer grain for the interior boards.
export const BOAT_TEXTURES = [
  loadDownscaled(T + 'boat-wood-1.jpg', 96),
  loadDownscaled(T + 'boat-wood-2.jpg', 96),
];

// Ship sprites (drawn as billboarded PNGs, transparency preserved, so `load`
// not `loadDownscaled`). `noSail` is the wood boat you can lash together without
// Calypso's recipe — launchable but never sea-ready; `greek` is the proper ship
// built to her recipe (wood + oar + rope + sail) that actually leaves Ogygia.
export const SHIP_SPRITES = {
  noSail: load(T + 'ships/boat-no-sail.png'),
  greek: load(T + 'ships/greek-ship.png'),
};
// The three found parts, drawn as their own item icons.
export const PART_SPRITES = {
  oar: load(T + 'ships/oar.png'),
  rope: load(T + 'ships/rope.png'),
  sail: load(T + 'ships/sail.png'),
};

// Keyed by the wall object's `material` field (tiles.js/worldgen.js).
export const WALL_TEXTURES = {
  stone: loadDownscaled(T + 'wall-stone.jpg'),
  brick: loadDownscaled(T + 'wall-brick.jpg'),
  // Fortress ramparts (riveted metal) and the inner charcoal maze (dark stone).
  metal: loadDownscaled(T + 'panel-metal-2.jpg'),
  darkstone: loadDownscaled(T + 'wall-darkstone-alt.png'),
  // ZEUS's inner maze: darker "AI" wall designs, mixed for variety —
  // riveted panels, an iron grate, and a louvred vent.
  aiwall: loadDownscaled(T + 'AI-texture/metal_06.jpg'),
  aigrate: loadDownscaled(T + 'AI-texture/grating_10.jpg'),
  aivent: loadDownscaled(T + 'AI-texture/grating_05.jpg'),
};

// Real photographic street-art/flyer photos (assets/textures/graffiti/), used
// as a rare, older register of wall-marking — an actual weathered poster
// stuck to a wall, distinct from the painted RON/UBIK/vector text tags.
// worldgen.js's paintGraffiti flags a wall with `graffitiImage` (an index
// into this array, kept in sync by count); Renderer.drawGraffitiPoster reads
// it. Downscaled like every other photo texture (see loadDownscaled above).
export const GRAFFITI_TEXTURES = [
  'graffiti_01.jpg', 'graffiti_02.jpg', 'graffiti_12.jpg', 'graffiti_19.jpg',
  'graffiti_21.jpg', 'graffiti_30.jpg', 'graffiti_33.jpg', 'sign_08.jpg',
].map((f) => loadDownscaled(T + 'graffiti/' + f, 96));

// Hand-drawn tree art (a copy of the CC0 "Premium Trees" sheet dropped in at
// assets/textures/Shadow/). One transparent 512x224 sheet; each TREE_SPRITE
// is the tight pixel bounds of one tree cut out of it via drawImage source
// rects (no need to slice separate files). The three chosen are full, leafy
// trees, one per `variant` (tiles/worldgen), each with its baked soft shadow.
// Bounds measured off the sheet's alpha. Rendered by Renderer.drawTree.
// Dark crushed-gravel/asphalt used to face the impassable blocks ringing the
// map edge — deliberately NOT the road texture, so the boundary reads as rock
// rather than another road. See Renderer.drawEdgeRock.
export const EDGE_TEXTURE = loadDownscaled(T + 'photo-unsorted-2.jpg');
// Open sea around the island edge — a deep-ocean battlemap, downscaled a little
// less than the floors so the swell keeps some detail.
export const SEA_TEXTURE = loadDownscaled(T + 'deep_ocean_battlemap.png', 128);

// Dark riveted-metal texture facing the big W-factory structure.
export const FACTORY_TEXTURE = loadDownscaled(T + 'decor-train.jpg');

// White marble with grey veining — the ruined columns strewn across the island
// (Renderer.drawColumn). One shared source, clipped into each shaft/drum.
export const MARBLE_TEXTURE = loadDownscaled(T + 'WhiteMarble_COLOR.jpg', 96);

// Aged paper for the Certificate of Death (Renderer.drawDeathCert). Kept large
// so it fills the panel without the fine grain blurring out.
export const PAPER_TEXTURE = loadDownscaled(T + 'paper.jpg', 512);

// Abandoned cars: real 3/4-view sprites (assets/textures/cars/) instead of the
// old procedural hull. Several models/colours, each in the four iso-diagonal
// facings so a street of wrecks points every which way. A car object carries
// numeric carModel/carDir indices (worldgen); the renderer resolves them
// against these lists (modulo, so the counts can change freely).
export const CAR_MODEL_KEYS = ['chevrolet', 'rolls-blue', 'rolls-red', 'rolls-white', 'police', 'ambulance'];
export const CAR_DIR_KEYS = ['se', 'sw', 'ne', 'nw'];
// A mottled metallic grime texture painted faintly over a smashed car so a
// wreck reads as burnt/ruined, not just a darker version of the intact car.
export const CAR_RUIN_TEXTURE = loadDownscaled(T + 'misc-ring-bottoms.jpg');
export const CAR_SPRITES = {};
for (const m of CAR_MODEL_KEYS) {
  CAR_SPRITES[m] = {};
  for (const d of CAR_DIR_KEYS) CAR_SPRITES[m][d] = load(`${T}cars/${m}-${d}.png`);
}

export const TREE_SHEET = load(T + 'trees.png');
export const TREE_SPRITES = [
  { sx: 454, sy: 121, sw: 51, sh: 95 }, // variant 0: big leafy round
  { sx: 454, sy: 13, sw: 51, sh: 91 },  // variant 1: big bushy
  { sx: 392, sy: 145, sw: 46, sh: 71 }, // variant 2: medium
  { sx: 355, sy: 176, sw: 25, sh: 35 }, // variant 3: small (used rarely)
  { sx: 139, sy: 147, sw: 42, sh: 69 }, // variant 4: bare/dead (used rarely)
];

// Directional character renders for Adam/Eve/Neve, used by
// Renderer.drawPlayer/drawPlayerSprite. Sourced from Kenney's CC0
// "Animated Characters Retro" pack
// (assets/textures/kenney_animated-characters-retro/), pre-rendered offline
// via tools/sprite-render.html into 8 screen-facing directions x a 4-frame
// walk cycle, so the game can pick the right frame instead of rotating one
// flat icon. Keyed by gender, then state ('idle' | 'walk'), then compass
// direction.
const CHAR_DIRS = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
const C = T + 'characters/';
function loadCharacterSet(prefix) {
  const set = { idle: {}, walk: {} };
  for (const dir of CHAR_DIRS) {
    set.idle[dir] = load(`${C}${prefix}_idle0_${dir}.png`);
    set.walk[dir] = [0, 1, 2, 3].map(i => load(`${C}${prefix}_walk${i}_${dir}.png`));
  }
  return set;
}
const maleSet = loadCharacterSet('humanMaleA');
export const CHARACTER_SPRITE_SETS = {
  m: maleSet,
  f: loadCharacterSet('humanFemaleA'),
  u: maleSet, // Neve reuses Adam's set — no distinct "other" skin rendered yet.
};
export const CHAR_COMPASS_DIRS = CHAR_DIRS;

// Directional animal renders sourced from Kenney's CC0 "Cube Pets" pack
// (assets/textures/animals/), pre-rendered offline via tools/pet-render.html
// into 8 screen-facing directions x idle (1 frame) + walk (4-frame cycle)
// per species — same shape as CHARACTER_SPRITE_SETS above, since the models
// turned out to be rigged with matching clip names across the whole pack
// (checked via gltf.animations, having wrongly assumed "static" at first).
// Kenney normalises every model to a similar bounding cube regardless of
// the real animal's size, so these are NOT drawn at a shared scale — see
// ANIMAL_SPRITE_SCALE in animals.js for the per-species fudge factor
// applied at draw time.
const A = T + 'animals/';
function loadAnimalSet(species) {
  const set = { idle: {}, walk: {} };
  for (const dir of CHAR_DIRS) {
    set.idle[dir] = load(`${A}${species}_idle0_${dir}.png`);
    set.walk[dir] = [0, 1, 2, 3].map(i => load(`${A}${species}_walk${i}_${dir}.png`));
  }
  return set;
}
export const ANIMAL_SPECIES = [
  'beaver', 'bee', 'bunny', 'cat', 'caterpillar', 'chick', 'cow', 'crab',
  'deer', 'dog', 'elephant', 'fish', 'fox', 'giraffe', 'hog', 'koala',
  'lion', 'monkey', 'panda', 'parrot', 'penguin', 'pig', 'polar', 'tiger',
];
export const ANIMAL_SPRITE_SETS = {};
for (const species of ANIMAL_SPECIES) ANIMAL_SPRITE_SETS[species] = loadAnimalSet(species);
