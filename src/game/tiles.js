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
  // Rubble and rock are "solid" for everything except the player's own
  // climb check (Player.collides via GameMap.effectiveHeightAt), which
  // treats them as a +1 height step instead of an outright wall — so they
  // can be climbed (on foot, or jumped in one go) and stood on top of, same
  // as any other terrain step. Walls stay flatly solid: they're the same
  // generic type used for building/town perimeter walls (worldgen.js), and
  // making those climbable let the player walk straight over any building
  // or town boundary, breaking the interiors/exteriors the game builds
  // around them. Obelisks/boxes/cars/the factory stay flatly solid too;
  // climbing onto those doesn't make sense.
  wall:    { solid: true },
  rubble:  { solid: true, climbable: true, climbHeight: 1 },
  rock:    { solid: true, climbable: true, climbHeight: 1 },
  obelisk: { solid: true }, // AI signal tower; destructible in a later phase
  box:     { solid: true }, // resistance weapons cache, searchable
  car:     { solid: true }, // abandoned wreck littering the roads; scenery only
  wfactory: { solid: true }, // W-unit foundry; periodically fields a W3 repair drone
};
