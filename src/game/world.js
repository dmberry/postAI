// The World contract: a World owns everything that lives on one island — its map,
// arrival point, and entity collections. main.js holds one `currentWorld` and reads
// `currentWorld.robots` (etc.) at runtime instead of bare module-level arrays. See
// docs/islands-plan.md §3 for the archipelago plan this unblocks.
//
// Stage 0a builds createWorld + a minimal registry ONLY. The forward-compat fields
// (creatures, controllers, ambience, update, drawExtras, onEnter, onExit) are inert
// defaults so 0b (Backspace port + switchWorld) and 0c (CALYPSO extraction) can
// populate them WITHOUT reshaping this contract. Nothing in 0a calls those methods or
// reads ambience — main.js still drives the loop exactly as before.

const NOOP = () => {};

// Build a World. Entity arrays are stored BY REFERENCE, never copied: the array on
// `currentWorld.robots` IS the same array the construction block builds and pushes to.
// That reference identity is what makes the 0a wrap a pure alias (one set of arrays,
// two names) — do not spread/clone the opts arrays.
export function createWorld(id, opts = {}) {
  return {
    id,                                   // 'calypso' | 'backspace' | 'ithaca' | ...
    map: opts.map ?? null,                // a GameMap (overworldMap for calypso)
    spawn: opts.spawn ?? { x: 0, y: 0 },  // {x, y} arrival point (the beach for islands)
    // Martial island? main.js runs the full combat/fortress/obelisk/factory loop on
    // combat worlds (CALYPSO, POLYPHEMUS, …) and the slim loop on the rest (the
    // Backspace, ITHACA). Off by default so a plain island is peaceful.
    combat: opts.combat ?? false,
    // AEAEA (CIRCE): her swine-magic rewrites what you ARE while you are ashore.
    // main.js runs the transmutation pass on worlds that set this.
    transmute: opts.transmute ?? false,
    // THRINACIA (HELIOS): the cattle of the Sun graze here, and are forbidden.
    // main.js runs the prohibition pass on worlds that set this — a warning near
    // the herd, and the god's wrath if you slaughter one.
    prohibition: opts.prohibition ?? false,
    // OGYGIA (CALYPSO): her island, where she keeps you. main.js runs the Nokia
    // channel on worlds that set this — her texts, and her interventions against
    // POSEIDON's roaming machines (docs/calypso-nokia-plan.md).
    keeper: opts.keeper ?? false,
    // OGYGIA (CALYPSO) only: the island whose whole gate is the boat. Launch an
    // unfinished hull here and you get the voyage — out to sea, and Poseidon turns
    // you back — over and over until you build a proper ship to her recipe. It
    // belongs to Ogygia and nowhere else: you LEAVE every later island in the greek
    // ship you arrived in, so there is nothing there for the sea to refuse.
    departTrial: opts.departTrial ?? false,
    // Endgame shape (R3). 'kill' (default) = raze the core (the martial daemons);
    // 'depart' = the win is leaving, not killing — her core is indestructible and
    // her fortress guards detain rather than slay (CALYPSO / Ogygia only).
    winMode: opts.winMode ?? 'kill',

    // Entity collections. 0a passes CALYPSO's already-built arrays in; other islands
    // may omit any and populate the empty array themselves.
    robots:      opts.robots      ?? [],
    animals:     opts.animals     ?? [],
    birds:       opts.birds       ?? [],
    waterdroids: opts.waterdroids ?? [],
    obelisks:    opts.obelisks    ?? [],  // POSEIDON-network anchors {x,y}; empty on islands with no network
    obeliskObjs: opts.obeliskObjs ?? [],  // the tower objects (alert/blink state)
    creatures:   opts.creatures   ?? [],  // Backspace-style lurkers (0b) / per-island oddities
    controllers: opts.controllers ?? [],  // fortress / factory / obelisk-network (wired in 0c)

    // Per-island obelisk colour (R1). The OB eye/glow and minimap dots read these
    // off the current world; the defaults reproduce today's red so any world that
    // doesn't set them looks exactly as before.
    obColor:      opts.obColor      ?? '#ff281e',  // eye at rest
    obAlertColor: opts.obAlertColor ?? '#ff001e',  // eye fully alert

    // Where the player arrives. Normal worlds remember where you left them
    // (returnPos, set on exit); the Backspace opts out so you always land at its
    // door. spawn is the fallback / first-arrival point.
    keepsPosition: opts.keepsPosition ?? true,

    // Render mood — what the inUnderworld ternaries hard-code today. calypso's
    // light:null means "use the day/night clock"; the Backspace is fullbright with
    // its own veil. Consumed by the draw in main.js (0b).
    ambience: Object.assign(
      { light: null, dawnGlow: true, minimap: true, underworld: false, crickets: true, musicBed: 'synth' },
      opts.ambience,
    ),
    update:     opts.update     ?? NOOP,  // (dt, player) -> ticks own entities/controllers
    drawExtras: opts.drawExtras ?? NOOP,  // (renderer)   -> island overlays (veils, weather)
    onEnter:    opts.onEnter    ?? NOOP,  // (player)     -> arrival hook (0b switchWorld)
    onExit:     opts.onExit     ?? NOOP,  // (player)     -> departure hook (0b switchWorld)
  };
}

// Minimal registry. 0a registers 'calypso'; 0c / Stage-3 add one line per island;
// 0b's switchWorld(id|world, player) looks worlds up here. Kept tiny on purpose.
const _worlds = new Map();
export function registerWorld(world) { _worlds.set(world.id, world); return world; }
export function getWorld(id) { return _worlds.get(id); }
export function allWorlds() { return [..._worlds.values()]; }

// Move the player from `from` to `to`: run the world lifecycle hooks, place the
// player, and keep player.map in sync. The caller (main.js) reassigns its
// `currentWorld` to the returned world and syncs its own map local / camera.
//   - `from.returnPos` is stamped on exit (so returning to a keepsPosition world
//     lands you where you left it); worlds with keepsPosition:false (the
//     Backspace) skip that and always arrive at `spawn`.
//   - onExit fires before the move, onEnter after — matching the old
//     enter/exitUnderworld ordering (position set, then the narration/sfx hook).
//   - `opts.beach` marks a SEA crossing (the boat, or the Backspace's crossing
//     doors): you arrive by keel on the destination's beach (its `spawn`), and
//     the world you leave is stamped for a beach return too — never at the
//     mid-sea coordinate the row-out left the player on. Without this, leaving an
//     island by boat stored an offshore returnPos and sailing back dropped you in
//     the water (true for every island, first noticed returning to Ogygia).
export function switchWorld(from, to, player, opts = {}) {
  if (from) {
    // A sea departure re-beaches on return: clear the stale/offshore returnPos so
    // the next arrival falls back to `spawn`. A land crossing (a door) remembers
    // where you stood, as before.
    if (opts.beach) from.returnPos = null;
    else if (from.keepsPosition) from.returnPos = { x: player.x, y: player.y };
    from.onExit(player);
  }
  const at = opts.beach ? to.spawn
    : (to.keepsPosition && to.returnPos) ? to.returnPos : to.spawn;
  player.x = at.x;
  player.y = at.y;
  player.map = to.map;
  to.onEnter(player);
  return to;
}
