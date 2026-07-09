// Floor tile and object type registries. Pure data: the renderer decides how
// to draw each kind, so swapping placeholder colours for sprites later only
// touches the renderer.

export const FLOORS = {
  grass:  { color: '#5a8f4c', solid: false },
  dirt:   { color: '#8a6f47', solid: false },
  road:   { color: '#63635e', solid: false },
  boards: { color: '#9c8055', solid: false },
  sand:   { color: '#c2b280', solid: false },
  water:  { color: '#3a6ea5', solid: true },  // the river — flat blue, swum, NOT the sea
  sea:    { color: '#22304a', solid: true },  // open ocean at the island edge; swum like the river, but drawn by Renderer.drawSeaTile (wine-dark, textured)
  stream: { color: '#4f83b5', solid: false }, // shallow water, wadeable
  bridge: { color: '#8a7048', solid: false },
  tallgrass: { color: '#6f8f3f', solid: false },
  // Adamantine's fortress (the map's southern annex): a cold metal-panel deck
  // for the corridors and maze, a paved quadrangle for the open killing-ground,
  // and a dark charcoal deck for the inner sanctum. All walkable.
  panel:  { color: '#3c4045', solid: false },
  quad:   { color: '#55575c', solid: false },
  sanctum:{ color: '#26282c', solid: false },
  // The underworld (a Ubik tear's liminal pocket): a faded, damp-carpet
  // yellow-beige, all walkable — no FLOOR_TEXTURES entry exists for it, so
  // drawFloor falls back to this flat colour automatically.
  liminal:{ color: '#b9a862', solid: false },
};

export const OBJECTS = {
  tree:    { solid: true, soft: true }, // `soft`: the PLAYER pushes through (a human edge in the woods), but it still blocks robots and blocks shots (cover)
  column:  { solid: true },  // ruined marble column: a pillar that blocks and gives shot-cover
  colfall: { solid: false }, // toppled column / drum lying in the grass: decorative, walk over it
  marbleblock: { solid: true }, // fallen entablature / altar stone among the columns: blocks, gives cover
  // "climbable" objects are solid for everything except the player's own
  // climb check (Player.collides via GameMap.effectiveHeightAt), which
  // treats them as a raised step of `climbHeight` levels rather than an
  // outright wall — so they can be climbed onto and stood on top of, same
  // as a rise in the terrain.
  //
  // The step height is what gates walking vs jumping. Rubble and rock are a
  // single level: low enough to step straight over on foot. A wall is
  // `climbHeight` 2.5 (= WALL_H 40px / ELEV 16px, so standing on top lines
  // up with its drawn height): more than the on-foot step of 1, so you still
  // can't walk through a building or town wall (the v0.64 boundary the game
  // is built around holds), but within a jump's reach, so a deliberate jump
  // gets you up onto it. Obelisks/boxes/cars/the factory stay flatly solid;
  // climbing onto those doesn't make sense (and a box you bump-and-search,
  // not stand on).
  wall:    { solid: true, climbable: true, climbHeight: 2.5 },
  rubble:  { solid: true, climbable: true, climbHeight: 1 },
  rock:    { solid: true, climbable: true, climbHeight: 1 },
  obelisk: { solid: true }, // AI signal tower; destructible in a later phase
  tor: { solid: true }, // RON resistance relay on a hilltop — the friendly HERMES terminal
  box:     { solid: true, climbable: true, climbHeight: 1 }, // resistance cache — a low crate you can step or jump onto, still searchable from beside it
  car:     { solid: true }, // abandoned wreck littering the roads; scenery only
  wfactory: { solid: true }, // W-unit foundry; periodically fields a W3 repair drone
  furniture: { solid: true }, // stacked junk cluttering the underworld's rooms; solid, you weave around it
  exitdoor: { solid: true },  // a plain door in the underworld: walk up to it to leave. Solid; you exit on approach
  lamp: { solid: false },     // a standing underworld floor lamp; drawn scenery, walk past it
  // --- Adamantine's fortress (southern annex) ---
  // Deliberately NON-climbable, unlike a town wall: the fortress rampart and
  // its inner maze can't be double-jumped, so the hacked doorway is the only
  // way in. `material` ('metal' | 'darkstone') selects the wall texture.
  fortwall: { solid: true },
  // The red uplink mast: wires the fortress into the overworld POSEIDON. Hammer
  // it down to cut the fortress off, so a breach no longer stirs the world.
  uplink: { solid: true },
  // The grand doorway in the rampart: solid until the terminal hack drops a
  // fortress key and the key throws its bolts. Removed from the grid when open.
  fortdoor: { solid: true },
  // The console kiosk beside the doorway: walk up and click to open its RON-ML
  // hack. A low pillar you bump into, not climb.
  gateterm: { solid: true },
  // Adamantine's mainframe core: the multi-tile structure at the far end.
  mainframe: { solid: true },
};
