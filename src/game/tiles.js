// Floor tile and object type registries. Pure data: the renderer decides how
// to draw each kind, so swapping placeholder colours for sprites later only
// touches the renderer.

export const FLOORS = {
  grass:  { color: '#5a8f4c', solid: false },
  dirt:   { color: '#8a6f47', solid: false },
  road:   { color: '#63635e', solid: false },
  boards: { color: '#9c8055', solid: false },
  sand:   { color: '#c2b280', solid: false },
  water:  { color: '#3a6ea5', solid: true },
  stream: { color: '#4f83b5', solid: false }, // shallow water, wadeable
  bridge: { color: '#8a7048', solid: false },
  tallgrass: { color: '#6f8f3f', solid: false },
};

export const OBJECTS = {
  tree:    { solid: true },
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
  box:     { solid: true }, // resistance weapons cache, searchable (kept flatly solid so you bump-and-search it rather than climbing on top)
  car:     { solid: true }, // abandoned wreck littering the roads; scenery only
  wfactory: { solid: true }, // W-unit foundry; periodically fields a W3 repair drone
};
