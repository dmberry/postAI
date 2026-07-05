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
  wall:    { solid: true },
  rubble:  { solid: true },
  rock:    { solid: true },
  obelisk: { solid: true }, // AI signal tower; destructible in a later phase
  box:     { solid: true }, // resistance weapons cache, searchable
  car:     { solid: true }, // abandoned wreck littering the roads; scenery only
  wfactory: { solid: true }, // W-unit foundry; periodically fields a W3 repair drone
};
