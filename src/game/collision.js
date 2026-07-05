// Keeps the player from ever standing in the exact same spot as a living
// animal or robot: a simple circle-vs-circle push-apart, run once per frame
// after everyone has moved. Dead bodies and fused wrecks don't push (they're
// not obstacles worth fighting the map collision over); friendly/reprogrammed
// robots still do, since they're solid machines standing in the world.

const PLAYER_RADIUS = 0.28; // matches Player.RADIUS in player.js
const ANIMAL_RADIUS = 0.25; // matches RADIUS in animals.js
const ROBOT_RADIUS = 0.3;   // matches RADIUS in robots.js

function separate(player, other, otherRadius) {
  const dx = other.x - player.x;
  const dy = other.y - player.y;
  const minDist = PLAYER_RADIUS + otherRadius;
  let dist = Math.hypot(dx, dy);
  if (dist >= minDist) return;

  let nx, ny;
  if (dist < 1e-6) {
    // Exactly coincident: push along an arbitrary fixed axis.
    nx = 1; ny = 0; dist = 0;
  } else {
    nx = dx / dist; ny = dy / dist;
  }
  const overlap = minDist - dist;
  player.x -= nx * overlap * 0.5;
  player.y -= ny * overlap * 0.5;
  other.x += nx * overlap * 0.5;
  other.y += ny * overlap * 0.5;
}

export function resolveBodyOverlaps(player, animals, robots) {
  for (const a of animals) {
    if (a.dead) continue;
    separate(player, a, ANIMAL_RADIUS);
  }
  for (const r of robots) {
    if (r.dead || r.fused) continue;
    separate(player, r, ROBOT_RADIUS);
  }
}
