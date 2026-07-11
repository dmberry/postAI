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
export function switchWorld(from, to, player) {
  if (from) {
    if (from.keepsPosition) from.returnPos = { x: player.x, y: player.y };
    from.onExit(player);
  }
  const at = (to.keepsPosition && to.returnPos) ? to.returnPos : to.spawn;
  player.x = at.x;
  player.y = at.y;
  player.map = to.map;
  to.onEnter(player);
  return to;
}
