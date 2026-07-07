import { screenDirToWorld } from '../engine/iso.js';
import { sfx } from '../engine/sound.js';
import { ITEMS } from './items.js';
import { OBJECTS } from './tiles.js';

const WALK_SPEED = 4.2;   // tiles per second
const SPRINT_SPEED = 7.5;
const BLOCK_WALK_MULT = 0.6; // slower, steadier pace while up on a block top
const WOUNDED_SPEED = 3.2; // hobble walking pace when health is very low
const WOUNDED_AT = 20;     // health threshold for the hobble
const WOUNDED_SPRINT_DRAIN = 2.5; // wounded sprinting burns stamina this much faster
const RADIUS = 0.28;      // collision radius in tiles
const REACH = 0.9;        // how far ahead the player can use a tool
const CHIP_FRAGMENTS_PER_CHIP = 8; // fragments shed by machines to craft one chip
const KNOCKBACK_DIST = 0.5; // tiles a melee hit shoves an animal/robot back
const KNOCKBACK_STUN = 0.4; // seconds it's frozen (no move, no attack) after
const TREE_HP = 4;        // penknife swings to fell a tree
const TREE_CHOP_SPEEDUP = 0.55; // chop cooldown vs a normal swing: faster axe work
const WOOD_PER_TREE = 2;
const PICKUP_RANGE = 0.55;

const STAMINA_MAX = 100;
const SPRINT_DRAIN = 9;   // stamina per second while sprinting
const STAMINA_REGEN = 12; // per second when not sprinting
const HEALTH_REGEN = 1.5; // per second while fed and unpoisoned
const VENOM_DRAIN = 2;    // health per second while poisoned

const FOOD_MAX = 100;
const FOOD_DRAIN = 0.14;      // per second; empties over ~1.5 game days
const FOOD_SPRINT_MULT = 1.5; // sprinting burns food faster
const STARVE_DRAIN = 0.8;     // health per second at zero food
const HUNGRY_AT = 25;         // stamina recovers slowly below this

const JUMP_VZ = 3.8;      // initial jump velocity (world units/s)
const GRAVITY = 12;
const JUMP_COST = 3;      // stamina
const CLIMB_COST = 2;     // stamina per height level climbed
const FORCEFIELD_MAX = 60;  // seconds of forcefield per battery
const FORCEFIELD_DRAIN = 1; // charge/sec while the field is up
const SHIELD_FRONT = 0.2;   // a shield covers shots from within this facing dot
const REFLECT_DAMAGE = 8;   // a mirror shield throws this back at the shooter

const WIFI_MAX = 600;    // Wi-Fi block charge in seconds (10 real minutes)
const SWIM_STAMINA_DRAIN = 8;  // stamina/sec while in deep water
const SWIM_HEALTH_DRAIN = 1.2; // health/sec: swimming a river is exhausting

// Survival score awards. A felled tree is the baseline point; skilled tools
// and tougher kills are worth more.
const SCORE = { tree: 1, animal: 3, robot: 10, wreck: 2, cache: 2, book: 5, fragment: 5 };

// Item kinds that can occupy the hands slot.
const HOLDABLE = new Set(['tool', 'gun', 'gadget', 'bomb']);

// Empty-handed is still a weapon, just a bad one: a stand-in "tool" so bare
// fists flow through the exact same melee path as a real one (target
// finding, wreck-mining, zombie immunity, tree handling) rather than the
// old "Your hands are empty" no-op. Barely scratches a machine and can't
// fell a tree at all — see the bare-hands branch alongside penknife's.
const BARE_HANDS = {
  name: 'Bare hands', kind: 'tool', tier: 0,
  treeDamage: 0, animalDamage: 2, robotDamage: 1,
  swingCooldown: 0.4, staminaCost: 2,
};

// A robot the OB-gun's beam has corrupted into a "zombie" shrugs off every
// weapon except the bow and the wave gun — the only two builds precise
// enough to hit whatever in it is still killable.
function zombieImmune(target, tool) {
  return !!(target && target.zombie) && tool.key !== 'bow' && tool.key !== 'wavegun';
}

// Soft ground a shovel can sink into; hard surfaces (road, boards, water)
// resist digging.
const DIGGABLE = new Set(['grass', 'tallgrass', 'dirt', 'sand']);
const PIT_DEPTH = -2;    // trap depth: a steep pit a T1 cannot climb out of

export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.spawnX = x;
    this.spawnY = y;
    this.z = 0;           // height above ground while jumping
    this.vz = 0;
    this.doubleJumped = false; // a second, mid-air jump: reaches block tops
    this.forcefieldCharge = 0; // seconds of forcefield left in the current cell
    this.forcefieldArmed = false; // toggled by clicking the forcefield in any slot
    this.compassArmed = false; // toggled by clicking the electro-compass in any slot
    this.ronmlKeys = new Set(); // node ids RON-ML's `hack` has cracked open this session
    this.ammoFrac = {};        // accumulated fractional ammo per gun
    this.electroCharge = (ITEMS.electrogun && ITEMS.electrogun.internalMax) || 4; // electro-gun's self-charging internal cell
    this.terminalSafe = false;  // true while jacked into an obelisk terminal (invisible to machines)
    this.facing = { x: 0, y: 1 };
    this.moving = false;
    this.sprinting = false;
    this.walkPhase = 0; // drives the gait animation

    this.health = 100;
    this.maxHealth = 100;
    this.stamina = STAMINA_MAX;
    this.maxStamina = STAMINA_MAX;
    this.food = FOOD_MAX;
    this.maxFood = FOOD_MAX;
    this.venom = 0;       // seconds of poison remaining

    this.hands = 'penknife';                 // starting tool
    this.pockets = [null, null, null, null]; // {item, qty} or null
    this.backpack = null;                    // {slots: [16], weapon} once found; dropped on death
    this.selectedPocket = null;              // 0-3 (pockets), 'bw' (backpack weapon), or null
    this.swingTimer = 0;
    this.hurtTimer = 0;   // brief red flash after taking damage
    this.message = null;  // {text, ttl} transient HUD line

    this.name = 'Adam';
    this.gender = 'm';    // 'm' | 'f' | 'u'
    this.skills = new Set(); // knowledge from books; survives death
    this.skillLog = [];   // books read, in order (for the skills screen)
    this.weaponsFound = new Set(['penknife']); // for the weapon chart; survives death
    this.killLog = [];    // obelisks destroyed, by hex code name
    this.circuitNums = new Set(); // numbered circuit boards collected (1-8) for the wave gun

    this.wifiPower = 0;   // Wi-Fi block charge (seconds) while one is held
    this.wifiMax = WIFI_MAX;
    this.invisibleToRobots = false; // true while a charged block is in hand
    this.score = 0;       // survival score; persists across deaths
    this.skylinkActive = false; // true during the final 30s purge once SKYLINK comes online

    // Practice makes better: melee/guns sharpen with use, knowledge with
    // reading. Levels rise on a square-root curve (25, 100, 225... xp per
    // level) and, like skills, survive death and reloads.
    this.xp = { melee: 0, guns: 0, knowledge: 0 };
  }

  xpLevel(kind) {
    return Math.floor(Math.sqrt((this.xp[kind] || 0) / 25));
  }

  gainXp(kind, amount) {
    const before = this.xpLevel(kind);
    this.xp[kind] = (this.xp[kind] || 0) + amount;
    if (this.xpLevel(kind) > before) {
      const label = kind === 'guns' ? 'aim' : kind === 'melee' ? 'swordarm' : 'mind';
      this.say(`Practice pays off: your ${label} sharpens.`);
    }
    if (this.onXpGain) this.onXpGain();
  }

  setPersona(name, gender) {
    this.name = name;
    this.gender = gender;
  }

  addScore(n) {
    this.score += n;
    if (this.onScore) this.onScore();
  }

  // Record that a weapon has been seen at least once (for the weapon chart).
  discoverWeapon(key) {
    const def = ITEMS[key];
    if (!def || (def.kind !== 'tool' && def.kind !== 'gun')) return;
    if (!this.weaponsFound.has(key)) {
      this.weaponsFound.add(key);
      if (this.onWeaponFound) this.onWeaponFound();
    }
  }

  // True if a single named item sits anywhere on the player (hand, pockets,
  // backpack, spare-weapon slot).
  hasItem(key) {
    if (this.hands === key) return true;
    if (this.pockets.some((s) => s && s.item === key)) return true;
    if (this.backpack) {
      if (this.backpack.weapon === key) return true;
      if (this.backpack.slots.some((s) => s && s.item === key)) return true;
    }
    return false;
  }

  // Remove one of a named item from wherever it is. Returns whether it went.
  removeItem(key) {
    if (this.hands === key) { this.hands = null; return true; }
    let i = this.pockets.findIndex((s) => s && s.item === key);
    if (i >= 0) { this.pockets[i].qty -= 1; if (this.pockets[i].qty <= 0) this.pockets[i] = null; return true; }
    if (this.backpack) {
      if (this.backpack.weapon === key) { this.backpack.weapon = null; return true; }
      i = this.backpack.slots.findIndex((s) => s && s.item === key);
      if (i >= 0) { this.backpack.slots[i].qty -= 1; if (this.backpack.slots[i].qty <= 0) this.backpack.slots[i] = null; return true; }
    }
    return false;
  }

  // Total count of a named item across hand, pockets, and backpack.
  countItem(key) {
    let n = 0;
    if (this.hands === key) n += 1;
    for (const s of this.pockets) if (s && s.item === key) n += s.qty;
    if (this.backpack) {
      if (this.backpack.weapon === key) n += 1;
      for (const s of this.backpack.slots) if (s && s.item === key) n += s.qty;
    }
    return n;
  }

  // Can the OB-gun be crafted right now? (Stun-gun + electro-gun + Wi-Fi block.)
  canCraftObGun() {
    return this.hasItem('stungun') && this.hasItem('electrogun') && this.hasItem('wifiblock');
  }

  // Eight chip fragments (shed by destroyed machines) assemble into a whole
  // access chip.
  canCraftChip() {
    return this.countItem('chip_fragment') >= CHIP_FRAGMENTS_PER_CHIP;
  }

  craftChip() {
    if (!this.canCraftChip()) { this.say(`You need ${CHIP_FRAGMENTS_PER_CHIP} chip fragments; you have ${this.countItem('chip_fragment')}.`); return false; }
    for (let n = 0; n < CHIP_FRAGMENTS_PER_CHIP; n++) this.removeItem('chip_fragment');
    const stored = this.stow('chip', 1);
    if (stored <= 0) { this.say('No room to assemble the chip — free a slot first.');
      // put the fragments back so the craft isn't a silent loss
      for (let n = 0; n < CHIP_FRAGMENTS_PER_CHIP; n++) this.stow('chip_fragment', 1);
      return false;
    }
    sfx.play('zap');
    this.say('Eight fragments lock together into a working access chip.');
    return true;
  }

  // Eight distinct numbered circuit boards (from destroyed obelisks) build a
  // wave gun.
  canCraftWaveGun() {
    return this.circuitNums.size >= 8 && this.hasItem('circuit') && !this.weaponsFound.has('wavegun');
  }

  craftWaveGun(map) {
    if (!this.canCraftWaveGun()) { this.say('You need all eight numbered circuit boards.'); return false; }
    for (let n = 0; n < 8; n++) this.removeItem('circuit');
    this.circuitNums.clear();
    if (this.hands && this.hands !== 'wavegun') this.stow(this.hands, 1);
    this.hands = 'wavegun';
    this.discoverWeapon('wavegun');
    sfx.play('zap');
    this.say('The eight boards click together into a wave gun. It fans laser-fire across a whole crowd.');
    return true;
  }

  // Combine the three into the OB-gun and take it in hand. The Wi-Fi block is
  // consumed, so main respawns a fresh one somewhere random.
  craftObGun(map) {
    if (!this.canCraftObGun()) { this.say('You need a stun-gun, an electro-gun and a Wi-Fi block.'); return false; }
    this.removeItem('stungun');
    this.removeItem('electrogun');
    this.removeItem('wifiblock');
    if (this.hands && this.hands !== 'obgun') this.stow(this.hands, 1);
    this.hands = 'obgun';
    this.discoverWeapon('obgun');
    sfx.play('zap');
    this.say('You wire the three together into an OB-gun. It hums, hungry for a tower.');
    return true;
  }

  // A ground-item drop that carries the Wi-Fi block's remaining charge, so a
  // dropped block keeps its charge instead of resetting to full on re-pickup.
  giDrop(item, qty, x, y) {
    const g = { item, qty, x, y };
    if (item === 'wifiblock') g.power = this.wifiPower;
    return g;
  }

  // A brief burst of sparks where a weapon lands on a robot. Purely visual;
  // main.js ticks the ttl and the renderer draws + prunes it.
  sparkAt(map, x, y) {
    (map.sparks ??= []).push({ x, y, ttl: 0.3, max: 0.3 });
  }

  // A bright burst — several sparks scattered around a point (electro-gun kills).
  sparkBurst(map, x, y) {
    const off = [[0, 0], [0.4, 0.1], [-0.3, 0.2], [0.2, -0.3], [-0.25, -0.2]];
    for (const [ox, oy] of off) (map.sparks ??= []).push({ x: x + ox, y: y + oy, ttl: 0.35, max: 0.35 });
  }

  // Startle nearby animals into fleeing (e.g. the electro-gun's crackle). Sets
  // a scared timer that updateAnimals turns into a run away from the player.
  scareAnimals(animals, range) {
    for (const a of (animals || [])) {
      if (a.dead) continue;
      if (Math.hypot(a.x - this.x, a.y - this.y) > range) continue;
      a.scaredT = Math.max(a.scaredT || 0, 3);
      if (a.type === 'dog') { a.fleeTimer = Math.max(a.fleeTimer || 0, 3); a.aggro = false; }
    }
  }

  // How far a beam actually reaches along the facing direction before a
  // solid object (wall, tree, rock, wreck) cuts it short. Never further
  // than maxRange.
  beamRange(map, maxRange) {
    const steps = Math.ceil(maxRange * 4);
    for (let i = 1; i <= steps; i++) {
      const t = (i / steps) * maxRange;
      const x = Math.floor(this.x + this.facing.x * t), y = Math.floor(this.y + this.facing.y * t);
      if (map.blocksShot(x, y)) return t;
    }
    return maxRange;
  }

  // ---- generic slot access (for click-equip and pointer drag) ----------

  // Read the {item, qty} in a slot descriptor, or null.
  getSlot(slot) {
    if (slot.kind === 'hands') return this.hands ? { item: this.hands, qty: 1 } : null;
    if (slot.kind === 'bw') return this.backpack && this.backpack.weapon ? { item: this.backpack.weapon, qty: 1 } : null;
    if (slot.kind === 'pocket') return this.pockets[slot.i] || null;
    if (slot.kind === 'bpstore') return this.backpack ? (this.backpack.slots[slot.i] || null) : null;
    return null;
  }

  setSlot(slot, val) {
    if (slot.kind === 'hands') { this.hands = val ? val.item : null; return true; }
    if (slot.kind === 'bw') { if (!this.backpack) return false; this.backpack.weapon = val ? val.item : null; return true; }
    if (slot.kind === 'pocket') { this.pockets[slot.i] = val; return true; }
    if (slot.kind === 'bpstore') { if (!this.backpack) return false; this.backpack.slots[slot.i] = val; return true; }
    return false;
  }

  // Drag one slot's contents onto another, swapping if the target is full.
  // The hands and spare-weapon slots only accept a single holdable item.
  moveItem(from, to) {
    const a = this.getSlot(from);
    if (!a) return;
    const b = this.getSlot(to);
    const onlyHoldable = (s) => s.kind === 'hands' || s.kind === 'bw';
    if (onlyHoldable(to) && (!HOLDABLE.has(ITEMS[a.item].kind) || a.qty > 1)) {
      this.say("That won't go in the hand.");
      return;
    }
    if (onlyHoldable(from) && b && (!HOLDABLE.has(ITEMS[b.item].kind) || b.qty > 1)) {
      this.say("Can't swap that into the hand.");
      return;
    }
    this.setSlot(to, a);
    this.setSlot(from, b || null);
    this.say(`Moved ${ITEMS[a.item].name.toLowerCase()}.`);
  }

  // Equip / stow via a clicked dashboard or backpack slot. Clicking a pocket
  // (or the spare-weapon slot) swaps it with the hands slot; clicking the
  // hands slot puts the held item away; clicking a backpack storage slot
  // takes a weapon from it into the hand. The forcefield and electro-compass
  // are the exception: clicking either in any slot just arms/disarms it in
  // place — you never need to hold them, since they work the moment they're
  // carried and armed.
  equipSlot(slot) {
    const held = this.getSlot(slot);
    if (held && held.item === 'forcefield') {
      this.forcefieldArmed = !this.forcefieldArmed;
      this.say(this.forcefieldArmed ? 'Forcefield armed — it will power up once it has a battery.' : 'Forcefield disarmed.');
      return;
    }
    if (held && held.item === 'compass') {
      this.compassArmed = !this.compassArmed;
      this.say(this.compassArmed ? 'Compass armed — the chevrons will home on anything notable nearby.' : 'Compass disarmed.');
      return;
    }
    if (slot.kind === 'pocket') { this.selectedPocket = slot.i; this.swapHands(); return; }
    if (slot.kind === 'bw') { this.selectedPocket = 'bw'; this.swapHands(); return; }
    if (slot.kind === 'hands') {
      if (!this.hands) return;
      const item = this.hands;
      if (this.stow(item, 1) > 0) {
        this.hands = null;
        this.say(`You put the ${ITEMS[item].name.toLowerCase()} away.`);
      } else {
        this.say('No room to stow it.');
      }
      return;
    }
    if (slot.kind === 'bpstore' && this.backpack) {
      const s = this.backpack.slots[slot.i];
      if (s && !HOLDABLE.has(ITEMS[s.item].kind)) {
        this.say(`Can't hold ${ITEMS[s.item].name.toLowerCase()} in hand.`);
        return;
      }
      if (s && s.qty > 1) { this.say('Too many to take in hand.'); return; }
      const held = this.hands;
      this.hands = s ? s.item : null;
      this.backpack.slots[slot.i] = held ? { item: held, qty: 1 } : null;
      this.say(this.hands ? `You ready the ${ITEMS[this.hands].name.toLowerCase()}.` : 'You put your weapon away.');
    }
  }

  update(dt, input, map, animals = [], robots = [], mouseWorld = null) {
    this.swingTimer = Math.max(0, this.swingTimer - dt);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    if (this.message) {
      this.message.ttl -= dt;
      if (this.message.ttl <= 0) this.message = null;
    }
    this.unstickIfTrapped(map);

    // Face the cursor at all times, independent of movement direction —
    // lets the player strafe while keeping a weapon trained on a target.
    if (mouseWorld) {
      const fx = mouseWorld.x - this.x, fy = mouseWorld.y - this.y;
      const flen = Math.hypot(fx, fy);
      if (flen > 1e-4) this.facing = { x: fx / flen, y: fy / flen };
    }

    // Hunger: food drains steadily, faster while sprinting. At zero you
    // starve; health only recovers when you are properly fed.
    this.food = Math.max(0, this.food - FOOD_DRAIN * (this.sprinting ? FOOD_SPRINT_MULT : 1) * dt);
    if (this.food <= 0) {
      this.health -= STARVE_DRAIN * dt;
      if (this.health <= 0) { this.die(map, 'starvation'); return; }
    }

    // Venom drains health over time; otherwise health slowly recovers
    // while well fed.
    if (this.venom > 0) {
      this.venom = Math.max(0, this.venom - dt);
      this.health -= VENOM_DRAIN * dt;
      if (this.health <= 0) this.die(map, 'the venom');
    } else if (this.health < this.maxHealth && this.food > 50) {
      this.health = Math.min(this.maxHealth, this.health + HEALTH_REGEN * dt);
    }

    const intent = input.moveIntent();
    this.moving = intent.dx !== 0 || intent.dy !== 0;
    const wantSprint = input.sprinting() && this.moving;
    this.sprinting = wantSprint && this.stamina > 0;

    if (this.sprinting) {
      let drain = this.skills.has('fleetfoot') ? SPRINT_DRAIN * 0.45 : SPRINT_DRAIN;
      if (this.health < WOUNDED_AT) drain *= WOUNDED_SPRINT_DRAIN; // adrenaline is brief
      this.stamina = Math.max(0, this.stamina - drain * dt);
    } else {
      const regen = this.food < HUNGRY_AT ? STAMINA_REGEN * 0.5 : STAMINA_REGEN;
      this.stamina = Math.min(this.maxStamina, this.stamina + regen * dt);
    }

    if (this.moving) {
      const dir = screenDirToWorld(intent.dx, intent.dy);
      let speed = this.sprinting ? SPRINT_SPEED : WALK_SPEED;
      // Badly hurt, you hobble — though adrenaline still lets you sprint,
      // just not for long (see the wounded stamina drain above).
      if (this.health < WOUNDED_AT && !this.sprinting) speed = WOUNDED_SPEED;
      // Wading a stream is slow; swimming a river slower still; climbing
      // costs stamina (handled below).
      const under = map.floorAt(Math.floor(this.x), Math.floor(this.y));
      if (under === 'stream') speed *= 0.55;
      else if (under === 'water') speed *= 0.45;
      // Up on a block top, ease off the pace — the footprint is small and a
      // full walking speed makes edges twitchy to line up. Slower is easier
      // to control up there.
      const effBefore = map.effectiveHeightAt ? map.effectiveHeightAt(Math.floor(this.x), Math.floor(this.y)) : 0;
      const hBefore = map.heightAt ? map.heightAt(Math.floor(this.x), Math.floor(this.y)) : 0;
      if (this.z === 0 && effBefore > hBefore) speed *= BLOCK_WALK_MULT;
      this.moveAxis(dir.x * speed * dt, 0, map);
      this.moveAxis(0, dir.y * speed * dt, map);
      const effAfter = map.effectiveHeightAt ? map.effectiveHeightAt(Math.floor(this.x), Math.floor(this.y)) : 0;
      const hAfter = map.heightAt ? map.heightAt(Math.floor(this.x), Math.floor(this.y)) : 0;
      if (hAfter > hBefore) this.stamina = Math.max(0, this.stamina - CLIMB_COST);
      // Walked off the edge of a block onto lower ground: drop off it and
      // keep going, rather than snapping down. Seed `z` with the height lost
      // (z renders at 32px/unit, a level is 16px, so half the level drop) and
      // let the jump/gravity integrator below carry you down smoothly.
      if (this.z === 0 && this.vz === 0 && effAfter < effBefore) {
        this.z = (effBefore - effAfter) * 0.5;
        this.doubleJumped = false;
      }
      this.walkPhase += dt * (this.sprinting ? 13 : 9);
      // Footstep on each stride, voiced by the surface underfoot.
      const stride = Math.floor(this.walkPhase / Math.PI);
      if (stride !== this.lastStride && this.z === 0) {
        this.lastStride = stride;
        sfx.step(map.floorAt(Math.floor(this.x), Math.floor(this.y)) || 'grass');
      }
    } else {
      this.walkPhase = 0;
    }

    // Swimming a river is exhausting: it drains stamina fast and chips at
    // health, whether you're moving or treading water. Get across and out.
    this.swimming = map.floorAt(Math.floor(this.x), Math.floor(this.y)) === 'water';
    if (this.swimming) {
      this.stamina = Math.max(0, this.stamina - SWIM_STAMINA_DRAIN * dt);
      this.health = Math.max(0, this.health - SWIM_HEALTH_DRAIN * dt);
      if (this.health <= 0) { this.die(map, 'the cold river'); return; }
    }

    // Jump: purely vertical hop; collision footprint is unchanged. A normal
    // jump (from the ground) clears terrain steps and hops out of a dug pit
    // but is NOT tall enough to reach a block top. Press jump a second time
    // in mid-air for a double jump — a fresh upward kick that raises how
    // high you can step (see collides) just enough to land on a wall.
    const airborne = this.z > 0 || this.vz !== 0;
    if (input.jumpPressed()) {
      if (this.z === 0 && this.stamina >= JUMP_COST) {
        this.vz = JUMP_VZ;
        this.stamina -= JUMP_COST;
        this.doubleJumped = false;
        sfx.play('jump');
      } else if (airborne && !this.doubleJumped && this.stamina >= JUMP_COST) {
        this.vz = JUMP_VZ;         // fresh kick upward off the first hop
        this.stamina -= JUMP_COST;
        this.doubleJumped = true;
        sfx.play('jump');
      }
    }
    if (this.z > 0 || this.vz !== 0) {
      this.vz -= GRAVITY * dt;
      this.z += this.vz * dt;
      if (this.z <= 0) {
        this.z = 0;
        this.vz = 0;
        this.doubleJumped = false; // landed: next jump starts fresh
      }
    }

    // Wi-Fi block: works while carried anywhere, no need to hold it. Its
    // cell drains while active; when flat it pulls a fresh battery — but
    // only with a machine near, so it never wastes cells while you are safe.
    if (this.ownsWifiBlock()) {
      if (this.wifiPower > 0) {
        this.wifiPower = Math.max(0, this.wifiPower - dt);
      } else if (this.robotNear(robots) && this.consumeBattery()) {
        this.wifiPower = this.wifiMax;
        this.say('Your Wi-Fi block draws a fresh cell. You drop off their sensors.');
      } else if (this._wifiOn) {
        this.say('Your Wi-Fi block is flat. It needs a battery.');
      }
    }
    // Jacked into an obelisk terminal (with a chip), the obelisk shields you —
    // the machines lose you entirely, same as a live Wi-Fi block.
    this.invisibleToRobots = (this.ownsWifiBlock() && this.wifiPower > 0) || this.terminalSafe;
    this._wifiOn = this.ownsWifiBlock() && this.wifiPower > 0;

    // Forcefield: armed by clicking it in whatever slot it's carried in (hand,
    // pocket, or backpack — no need to hold it). While armed and carried it
    // burns its charge; when a cell runs out it pulls a fresh battery from
    // your kit, and with none left the field drops until you feed it one.
    // Losing the item entirely disarms it so a freshly found one starts off.
    if (!this.hasItem('forcefield')) this.forcefieldArmed = false;
    if (this.hasItem('forcefield') && this.forcefieldArmed) {
      if (this.forcefieldCharge > 0) {
        this.forcefieldCharge = Math.max(0, this.forcefieldCharge - FORCEFIELD_DRAIN * dt);
      } else if (this.consumeBattery()) {
        this.forcefieldCharge = FORCEFIELD_MAX;
        if (!this._ffOn) this.say('The forcefield hums up around you — a green shell nothing gets through.');
      } else if (this._ffOn) {
        this.say('The forcefield flickers out. It needs a battery.');
      }
      this._ffOn = this.forcefieldCharge > 0;
    } else {
      this._ffOn = false;
    }

    // Electro-compass: armed the same way — click it in whatever slot it's
    // carried in. Stays armed (chevrons on) until you drop the item entirely.
    if (!this.hasItem('compass')) this.compassArmed = false;

    // Electro-gun solar trickle: while you carry it (hand, pocket, or pack)
    // its internal cell slowly refills, so it comes back to life on its own.
    if (this.hasItem('electrogun')) {
      const eg = ITEMS.electrogun;
      this.electroCharge = Math.min(eg.internalMax, this.electroCharge + eg.chargeRate * dt);
    }

    if (input.usePressed()) this.useHands(map, animals, robots);
    if (input.eatPressed()) this.eat();
    if (input.readPressed()) this.read(robots);
    const picked = input.pocketSelectPressed();
    if (picked >= 0) this.selectPocket(picked);
    if (input.backpackWeaponSelectPressed()) this.selectBackpackWeapon();
    if (input.swapPressed()) this.swapHands();
    if (input.dropPressed()) this.drop(map);
    this.pickupNearby(map);
  }

  // F drops the selected pocket's contents, or the held tool/gun if no
  // pocket is selected. Lands a step ahead of the player (beyond pickup
  // range) so it doesn't just walk straight back into the pockets.
  drop(map) {
    const dropX = this.x + this.facing.x * (PICKUP_RANGE + 0.4);
    const dropY = this.y + this.facing.y * (PICKUP_RANGE + 0.4);
    if (this.selectedPocket === 'bw' && this.backpack && this.backpack.weapon) {
      map.groundItems.push(this.giDrop(this.backpack.weapon, 1, dropX, dropY));
      this.say(`You drop the ${ITEMS[this.backpack.weapon].name.toLowerCase()}.`);
      this.backpack.weapon = null;
      return;
    }
    if (this.selectedPocket != null && this.selectedPocket !== 'bw' && this.pockets[this.selectedPocket]) {
      const slot = this.pockets[this.selectedPocket];
      map.groundItems.push(this.giDrop(slot.item, slot.qty, dropX, dropY));
      this.pockets[this.selectedPocket] = null;
      this.say(`You drop the ${ITEMS[slot.item].name.toLowerCase()}.`);
      return;
    }
    if (this.hands) {
      map.groundItems.push(this.giDrop(this.hands, 1, dropX, dropY));
      this.say(`You drop the ${ITEMS[this.hands].name.toLowerCase()}.`);
      this.hands = null;
      return;
    }
    this.say('Nothing to drop.');
  }

  // Press 1-4 to select a pocket slot (toggle off by pressing it again).
  selectPocket(i) {
    this.selectedPocket = this.selectedPocket === i ? null : i;
  }

  // Press 5 to select the backpack's dedicated spare-weapon slot, once
  // you're carrying one.
  selectBackpackWeapon() {
    if (!this.backpack) {
      this.say('No backpack.');
      return;
    }
    this.selectedPocket = this.selectedPocket === 'bw' ? null : 'bw';
  }

  // G swaps the held tool with whatever is in the selected pocket (or the
  // backpack's spare-weapon slot), so a weapon can be put away and swapped
  // for another without dropping it. Only tools/guns move into the hands
  // slot; a pocket full of resources (wood, ammo, food, ...) has nothing
  // sensible to hold there.
  swapHands() {
    if (this.selectedPocket == null) {
      this.say('Select a pocket (1-4) first.');
      return;
    }
    if (this.selectedPocket === 'bw') {
      const heldItem = this.hands;
      this.hands = this.backpack.weapon || null;
      this.backpack.weapon = heldItem || null;
      this.say(this.hands ? `You ready the ${ITEMS[this.hands].name.toLowerCase()}.` : 'You put your weapon away.');
      return;
    }
    const i = this.selectedPocket;
    const slot = this.pockets[i];
    if (slot && !HOLDABLE.has(ITEMS[slot.item].kind)) {
      this.say(`Can't hold ${ITEMS[slot.item].name.toLowerCase()} in hand.`);
      return;
    }
    const heldItem = this.hands;
    this.hands = slot ? slot.item : null;
    this.pockets[i] = heldItem ? { item: heldItem, qty: 1 } : null;
    this.say(this.hands ? `You ready the ${ITEMS[this.hands].name.toLowerCase()}.` : 'You put your weapon away.');
  }

  // R interfaces with things: a drained robot nearby gets reprogrammed
  // (costs a battery); otherwise read the first book in the pockets.
  read(robots = []) {
    const bot = robots.find((r) => !r.dead && !r.fused && r.drained
      && Math.hypot(r.x - this.x, r.y - this.y) < 1.3);
    if (bot) {
      let batterySlots = this.pockets;
      let i = this.pockets.findIndex((s) => s && s.item === 'battery');
      if (i < 0 && this.backpack) {
        i = this.backpack.slots.findIndex((s) => s && s.item === 'battery');
        batterySlots = this.backpack.slots;
      }
      if (i < 0) {
        this.say('Its cells are flat. You need a battery to restart it.');
        return;
      }
      batterySlots[i].qty -= 1;
      if (batterySlots[i].qty <= 0) batterySlots[i] = null;
      bot.friendly = true;
      bot.drained = false;
      bot.battery = 100;
      bot.disabledT = 0;
      sfx.play('zap');
      this.say(`You splice into the ${bot.type.toUpperCase()} and rewrite its orders. It works for you now.`);
      return;
    }
    this.readBook();
  }

  // Read the first book in the pockets (then the backpack) and learn its
  // skill for good.
  readBook() {
    const slots = this.backpack ? [...this.pockets, ...this.backpack.slots] : this.pockets;
    const pocketsLen = this.pockets.length;
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (!slot) continue;
      const def = ITEMS[slot.item];
      if (def.kind !== 'book') continue;
      if (i < pocketsLen) this.pockets[i] = null;
      else this.backpack.slots[i - pocketsLen] = null;
      this.learnFromBook(slot.item);
      return;
    }
    this.say('Nothing to read.');
  }

  // Learn a book's skill (or re-read it for a little knowledge). Shared by
  // the R key and by walking onto / clicking a book, which reads it on the
  // spot rather than pocketing it.
  learnFromBook(itemKey) {
    const def = ITEMS[itemKey];
    if (this.skills.has(def.skill)) {
      this.gainXp('knowledge', 2); // re-reading still teaches a little
      this.say(`You have already read ${def.name}.`);
    } else {
      this.skills.add(def.skill);
      this.skillLog.push({ skill: def.skill });
      this.gainXp('knowledge', 10);
      this.addScore(SCORE.book);
      this.say(`You read "${def.name}". ${def.skillText}`);
      if (this.onSkillLearned) this.onSkillLearned(def.skill);
    }
  }

  // Eat the first edible thing in the pockets, then the backpack — a
  // backpack is just more room, not a separate inventory to manage by hand.
  eat() {
    const tryEat = (slots) => {
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        if (!slot) continue;
        const def = ITEMS[slot.item];
        if (def.food == null) continue;
        if (this.food >= this.maxFood - 2) {
          this.say('You are not hungry.');
          return true;
        }
        slot.qty -= 1;
        if (slot.qty <= 0) slots[i] = null;
        this.food = Math.min(this.maxFood, this.food + def.food);
        sfx.play('eat');
        if (slot.item === 'berries' && this.skills.has('herbalism')) {
          this.venom = 0;
          this.health = Math.min(this.maxHealth, this.health + 5);
          this.say('You eat the berries. The right ones: the venom fades.');
        } else {
          this.say(`You eat the ${def.name.toLowerCase()}.`);
        }
        return true;
      }
      return false;
    };
    if (tryEat(this.pockets)) return;
    if (this.backpack && tryEat(this.backpack.slots)) return;
    this.say('Nothing to eat.');
  }

  // Swing the held tool: hits a robot or animal in reach first, otherwise
  // searches a cache box or chops the tree on the faced tile. No swinging
  // mid-jump. A gun (or an empty hand) can't melee or chop, but a cache
  // ahead is always searched with the free hand regardless of what's in
  // the primary hand.
  useHands(map, animals = [], robots = []) {
    // Empty hands still throw a (weak) punch — see BARE_HANDS — rather than
    // refusing to do anything.
    const tool = this.hands ? ITEMS[this.hands] : BARE_HANDS;
    if (this.swingTimer > 0 || this.z > 0) return;

    const tx = Math.floor(this.x + this.facing.x * REACH);
    const ty = Math.floor(this.y + this.facing.y * REACH);
    const obj = map.objectAt(tx, ty);
    const facingBox = obj && obj.type === 'box';

    // Defensive gear is passive — a shield blocks by being held and facing the
    // shot, a forcefield by simply being up. Using it just searches a cache
    // ahead if there is one, otherwise does nothing.
    if (tool.kind === 'shield' || tool.kind === 'forcefield' || tool.kind === 'compass') {
      if (facingBox) this.openBox(obj, map);
      else if (tool.kind === 'compass') this.say('The compass needle swings, seeking.');
      else if (tool.kind === 'shield') this.say('You raise the shield.');
      return;
    }

    if (tool.kind === 'gun' || tool.kind === 'gadget' || tool.kind === 'bomb') {
      if (facingBox) { this.openBox(obj, map); return; }
      if (tool.kind === 'gun') this.fire(tool, map, animals, robots);
      else if (tool.kind === 'gadget') this.useGadget(tool);
      else if (tool.kind === 'bomb') this.dropBomb(tool, map);
      return;
    }
    if (this.stamina < tool.staminaCost) {
      this.say('Too exhausted to swing.');
      return;
    }

    // Nearest living creature or machine within reach and roughly in front.
    // Fused wrecks stay targetable: hitting one mines it for parts. A
    // drained (battery-flat) robot stays targetable too: R still offers a
    // free reprogram at close range, but a player who'd rather just be rid
    // of it can beat it down for scrap instead, same as any other kill.
    let target = null, best = Infinity, isRobot = false;
    const consider = (e, robot) => {
      if (e.dead || e.friendly) return;
      const dx = e.x - this.x, dy = e.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d > 1.1 || d === 0) return;
      if (dx * this.facing.x + dy * this.facing.y < 0) return; // behind us
      if (d < best) { best = d; target = e; isRobot = robot; }
    };
    for (const a of animals) consider(a, false);
    for (const r of robots) consider(r, true);
    if (target && isRobot && target.fused) {
      this.swingTimer = tool.swingCooldown;
      this.stamina -= tool.staminaCost;
      sfx.play('chop');
      this.sparkAt(map, target.x, target.y);
      target.mineCharges = (target.mineCharges ?? 3) - 1;
      map.groundItems.push({ item: 'scrap', qty: 2, x: target.x, y: target.y });
      if (target.mineCharges <= 0) {
        target.dead = true;
        this.addScore(SCORE.wreck);
        this.say('You strip the last usable parts from the wreck.');
      } else {
        this.say('You pry parts out of the fused machine.');
      }
      return;
    }
    if (target && isRobot && zombieImmune(target, tool)) {
      this.swingTimer = tool.swingCooldown;
      this.stamina -= tool.staminaCost;
      sfx.play('chop');
      this.say('The blade clangs off the husk without effect — only a bow or the wave gun can finish a zombie machine.');
      return;
    }
    if (target) {
      this.swingTimer = tool.swingCooldown;
      this.stamina -= tool.staminaCost;
      sfx.play('chop');
      // A practised swordarm hits harder.
      const bonus = this.xpLevel('melee');
      target.hp -= (isRobot ? (tool.robotDamage ?? 1) : (tool.animalDamage ?? 3)) + bonus;
      target.hurt = true; // modules read this (pack flee, boar enrage, robot aggro)
      // A solid blow shoves it back and rattles it for a beat (frozen, no
      // attack) — otherwise it just stands there trading hits nose-to-nose,
      // landing its own attack the instant yours lands and out-damaging you
      // even though you struck first.
      const kd = best > 1e-4 ? best : 1;
      const kx = target.x + ((target.x - this.x) / kd) * KNOCKBACK_DIST;
      const ky = target.y + ((target.y - this.y) / kd) * KNOCKBACK_DIST;
      if (!map.isSolid(Math.floor(kx), Math.floor(ky))) { target.x = kx; target.y = ky; }
      target.knockT = KNOCKBACK_STUN;
      this.gainXp('melee', target.hp <= 0 ? 5 : 1);
      if (isRobot) {
        this.sparkAt(map, target.x, target.y);
        // The robots module marks it dead and drops scrap on its next tick.
        if (target.hp <= 0) this.addScore(SCORE.robot);
        this.say(target.hp <= 0
          ? 'The machine sparks, shudders, and dies.'
          : `The ${tool.name.toLowerCase()} clangs off the machine.`);
      } else if (target.hp <= 0) {
        target.dead = true;
        map.groundItems.push({ item: 'meat', qty: 1, x: target.x, y: target.y });
        this.addScore(SCORE.animal);
        this.say(`The ${target.type} goes down.`);
      } else {
        this.say(`You catch the ${target.type} with the blade.`);
      }
      return;
    }

    // Resistance cache: search it rather than hit it.
    if (facingBox) { this.openBox(obj, map); return; }

    // Abandoned car: smash it open (best with a crowbar) for what's inside.
    if (obj && obj.type === 'car') { this.smashCar(obj, map, tool); return; }

    // The W-factory: hammer at its 8x8 hull. Many blows bring it down and it
    // drops an AI key.
    if (obj && obj.type === 'wfactory') { this.hitFactory(obj, map, tool); return; }

    // Shovel: dig a pit in the open ground ahead. A steep pit (height -2)
    // is a trap — a wheeled T1 rolls in and can't climb out, and you can
    // only get out yourself by jumping.
    if (tool.dig && !obj) { this.dig(map, tx, ty); return; }

    if (!obj || obj.type !== 'tree') {
      sfx.play('swing');
      return;
    }

    // A penknife is far too small to fell a tree — hacking away with one just
    // burns energy and wears you down. Bare hands are worse still.
    if (this.hands === 'penknife') {
      this.swingTimer = tool.swingCooldown;
      this.stamina = Math.max(0, this.stamina - 8);
      this.health = Math.max(1, this.health - 0.6);
      sfx.play('swing');
      this.say('The penknife is useless against a tree — you only tire yourself out.');
      return;
    }
    if (!this.hands) {
      this.swingTimer = tool.swingCooldown;
      this.stamina = Math.max(0, this.stamina - 6);
      sfx.play('swing');
      this.say('Bare hands against a tree trunk get you nowhere.');
      return;
    }

    // Chopping swings noticeably faster than a normal attack cooldown, so
    // felling a tree feels brisk rather than a slow plod.
    this.swingTimer = tool.swingCooldown * TREE_CHOP_SPEEDUP;
    this.stamina -= tool.staminaCost;
    sfx.play('chop');
    const treeDmg = this.skills.has('woodcraft') ? tool.treeDamage * 2 : tool.treeDamage;
    obj.maxHp = obj.maxHp ?? TREE_HP;   // for the damage bar drawn above it
    obj.hp = (obj.hp ?? TREE_HP) - treeDmg;
    obj.shake = 0.25;
    map.shaking.add(obj);

    if (obj.hp <= 0) {
      map.removeObject(obj);
      // Bigger trees yield more wood: the two large variants most, the medium
      // one less, a small one least, a bare/dead one somewhere between. A
      // part-grown sapling (obj.grow) yields proportionally less.
      const byVariant = [4, 4, 3, 1, 2];
      const wood = Math.max(1, Math.round((byVariant[obj.variant] ?? WOOD_PER_TREE) * (obj.grow == null ? 1 : obj.grow)));
      map.groundItems.push({ item: 'wood', qty: wood, x: obj.x + 0.5, y: obj.y + 0.5 });
      sfx.play('treefall');
      // A felled tree scores a point; the right tool (a saw) or the skill to
      // use it earns more.
      let pts = SCORE.tree;
      if (tool.sawBonus) pts += tool.sawBonus;
      if (this.skills.has('woodcraft')) pts += 1;
      this.addScore(pts);
      this.say(`The tree comes down. +${pts}`);
    } else {
      this.say(`You hack at the tree with the ${ITEMS[this.hands].name.toLowerCase()}.`);
    }
  }

  // Drop a ticking bomb a step ahead. It's consumed from your kit and lives
  // in map.bombs; main ticks its fuse and detonates it.
  dropBomb(tool, map) {
    this.swingTimer = 0.4;
    map.bombs = map.bombs || [];
    // Thrown, not just dropped: it lands a real distance out, in an arc —
    // like an actual lobbed grenade it clears a wall or a low block in its
    // path rather than stopping dead at the first one. Only pulled back if
    // the landing spot itself would be inside solid geometry.
    const THROW_RANGE = tool.throwRange ?? 4.5;
    let bx = this.x + this.facing.x * THROW_RANGE, by = this.y + this.facing.y * THROW_RANGE;
    if (map.isSolid(Math.floor(bx), Math.floor(by))) {
      for (let d = THROW_RANGE - 0.5; d > 0.5; d -= 0.5) {
        const tx = this.x + this.facing.x * d, ty = this.y + this.facing.y * d;
        if (!map.isSolid(Math.floor(tx), Math.floor(ty))) { bx = tx; by = ty; break; }
      }
    }
    map.bombs.push({ x: bx, y: by, fuse: tool.fuse, radius: tool.radius, damage: tool.damage, obelisk: !!tool.obelisk, key: tool.key });
    // The thrown bomb leaves your hand; rather than leave you empty-handed (or
    // fumbling to re-arm), your best weapon is brought straight to hand. Any
    // spare bombs stay in your pockets to re-select if you want another.
    if (this.hands === tool.key) this.hands = null;
    else this.removeItem(tool.key);
    this.autoEquipBestWeapon();
    sfx.play('pickup');
    this.say(`You lob the ${tool.name.toLowerCase()} out, ticking. Get clear.`);
  }

  // Bring the highest-power weapon you're carrying (pockets, then backpack)
  // into the hands slot. Used after throwing a bomb so you're immediately
  // ready to fight. Leaves the hand empty if you have no weapon at all.
  autoEquipBestWeapon() {
    if (this.hands) return;
    let bestArr = null, bestIdx = -1, bestPow = -1;
    const scan = (arr) => {
      if (!arr) return;
      for (let k = 0; k < arr.length; k++) {
        const s = arr[k];
        if (!s) continue;
        const def = ITEMS[s.item];
        if (!def || (def.kind !== 'tool' && def.kind !== 'gun')) continue;
        const pow = def.power || 0;
        if (pow > bestPow) { bestPow = pow; bestArr = arr; bestIdx = k; }
      }
    };
    scan(this.pockets);
    if (this.backpack) scan(this.backpack.slots);
    if (bestArr) {
      this.hands = bestArr[bestIdx].item;
      bestArr[bestIdx].qty -= 1;
      if (bestArr[bestIdx].qty <= 0) bestArr[bestIdx] = null;
      this.say(`You bring the ${ITEMS[this.hands].name.toLowerCase()} up.`);
    }
  }

  // Use the Wi-Fi block: spend a battery (pockets, then backpack) to top
  // its charge back to full. Batteries are the only way to keep it running.
  useGadget(tool) {
    this.swingTimer = 0.4;
    let slots = this.pockets;
    let i = this.pockets.findIndex((s) => s && s.item === 'battery');
    if (i < 0 && this.backpack) {
      i = this.backpack.slots.findIndex((s) => s && s.item === 'battery');
      slots = this.backpack.slots;
    }
    if (i < 0) {
      this.say(`The ${tool.name.toLowerCase()} is dead. It needs a battery.`);
      return;
    }
    slots[i].qty -= 1;
    if (slots[i].qty <= 0) slots[i] = null;
    this.wifiPower = this.wifiMax;
    sfx.play('zap');
    this.say('You slot a fresh cell into the block. The machines lose your signal.');
  }

  // True if a Wi-Fi block is anywhere on the player: in hand, a pocket, or
  // the backpack. It works wherever it is carried.
  ownsWifiBlock() {
    if (this.hands === 'wifiblock') return true;
    if (this.pockets.some((s) => s && s.item === 'wifiblock')) return true;
    if (this.backpack && this.backpack.slots.some((s) => s && s.item === 'wifiblock')) return true;
    return false;
  }

  // Spend one battery from the pockets, then the backpack. Returns whether
  // one was found.
  consumeBattery() {
    const take = (slots) => {
      const i = slots.findIndex((s) => s && s.item === 'battery');
      if (i < 0) return false;
      slots[i].qty -= 1;
      if (slots[i].qty <= 0) slots[i] = null;
      return true;
    };
    if (take(this.pockets)) return true;
    if (this.backpack && take(this.backpack.slots)) return true;
    return false;
  }

  robotNear(robots, range = 22) {
    for (const r of robots || []) {
      if (r.dead || r.friendly || r.drained || r.fused) continue;
      if (Math.hypot(r.x - this.x, r.y - this.y) < range) return true;
    }
    return false;
  }

  // Shovel: sink the faced tile one step, down to a steep pit at PIT_DEPTH.
  // Only soft, open ground digs. A finished pit traps a wheeled T1 (it can
  // never move onto a higher tile) while you can still jump out.
  dig(map, tx, ty) {
    const tool = ITEMS[this.hands];
    const f = map.floorAt(tx, ty);
    if (!DIGGABLE.has(f)) {
      this.say('The ground here is too hard to dig.');
      return;
    }
    if (this.stamina < tool.staminaCost) {
      this.say('Too exhausted to dig.');
      return;
    }
    const cur = map.heightAt ? map.heightAt(tx, ty) : 0;
    if (cur <= PIT_DEPTH) {
      this.say('The pit is already dug.');
      return;
    }
    this.swingTimer = tool.swingCooldown;
    this.stamina -= tool.staminaCost;
    map.setHeight(tx, ty, cur - 1);
    map.setFloor(tx, ty, 'dirt');
    sfx.play('chop');
    this.say(cur - 1 <= PIT_DEPTH
      ? 'You finish the pit. A machine will not climb out of that.'
      : 'You dig at the ground.');
  }

  // A melee blow on the W-factory hull.
  hitFactory(obj, map, tool) {
    if (obj.destroyed) { this.say('The factory is already a smoking ruin.'); return; }
    this.swingTimer = tool.swingCooldown || 0.5;
    this.stamina = Math.max(0, this.stamina - (tool.staminaCost ?? 0));
    sfx.play('chop');
    const cx = obj.x + (obj.fw || 1) / 2, cy = obj.y + (obj.fh || 1) / 2;
    this.sparkAt(map, cx, cy);
    obj.shake = 0.2;
    this.damageFactory(obj, map, (tool.robotDamage ?? 1) + this.xpLevel('melee'));
  }

  // Apply `amount` damage to the factory (from a melee blow or a bomb blast);
  // when its hull gives, flatten the whole footprint to a walkable heap and
  // spill an AI key + salvage.
  damageFactory(obj, map, amount) {
    if (obj.destroyed) return;
    obj.maxHp = obj.maxHp ?? obj.hp ?? 160;
    obj.hp = (obj.hp ?? obj.maxHp) - amount;
    if (obj.hp > 0) return;
    obj.destroyed = true;
    if (obj.footprint) {
      for (const t of obj.footprint) {
        if (map.objectGrid[t.y * map.w + t.x] === obj) map.objectGrid[t.y * map.w + t.x] = null;
      }
    }
    const cx = obj.x + (obj.fw || 1) / 2, cy = obj.y + (obj.fh || 1) / 2;
    map.groundItems.push({ item: 'ai_key', qty: 1, x: cx, y: cy });
    map.groundItems.push({ item: 'scrap', qty: 6, x: cx + 0.6, y: cy });
    map.groundItems.push({ item: 'battery', qty: 4, x: cx - 0.6, y: cy });
    this.addScore(40);
    sfx.play('treefall');
    this.say('The W-factory buckles and collapses in a roar. An AI key glints in the wreckage.');
  }

  // Smash an abandoned car open. A crowbar (high robotDamage) pries it apart
  // in a couple of blows; anything else takes longer. When it gives, scatter
  // what was left inside around the wreck.
  smashCar(obj, map, tool) {
    if (obj.smashed) { this.say('The wreck is already stripped.'); return; }
    if (!tool || (tool.kind !== 'tool' && tool.kind !== 'gun')) {
      this.say('You need something to break it open — a crowbar works best.');
      return;
    }
    if (this.stamina < (tool.staminaCost ?? 4)) { this.say('Too exhausted.'); return; }
    this.swingTimer = tool.swingCooldown ?? 0.5;
    this.stamina -= tool.staminaCost ?? 4;
    sfx.play('chop');
    obj.hp = (obj.hp ?? 10) - (tool.robotDamage ?? 1);
    obj.shake = 0.3;
    map.shaking.add(obj);
    if (obj.hp > 0) {
      this.say('You smash at the car. Glass and metal give.');
      return;
    }
    obj.smashed = true;
    this.addScore(3);
    sfx.play('treefall');
    // Loot spills out at your feet (the car footprint itself is solid, so it
    // must land on the walkable tile you're standing on to be collectable).
    // A car battery is a generous find; the rest is a grab-bag of salvage,
    // tools, and reading matter.
    const drop = (item, qty) => map.groundItems.push({
      item, qty, x: this.x + (Math.random() - 0.5) * 0.8, y: this.y + (Math.random() - 0.5) * 0.8,
    });
    drop('battery', 2 + Math.floor(Math.random() * 2)); // the big car battery
    if (Math.random() < 0.5) drop('seatbelt', 1);
    if (Math.random() < 0.35) drop(['bat', 'machete', 'crowbar'][Math.floor(Math.random() * 3)], 1);
    if (Math.random() < 0.3) drop(['book_wood', 'book_herbs', 'book_track', 'book_run'][Math.floor(Math.random() * 4)], 1);
    if (Math.random() < 0.5) drop('scrap', 1 + Math.floor(Math.random() * 2));
    if (Math.random() < 0.4) drop('tin', 1);
    if (Math.random() < 0.3) drop('torch', 1);
    this.say('You break the car open and strip what is inside.');
  }

  // Search a resistance cache with the free hand — usable whatever the
  // primary hand is holding, gun, tool, or nothing.
  openBox(obj, map) {
    this.swingTimer = 0.4;
    if (obj.opened) {
      this.say('The box is empty.');
      return;
    }
    obj.opened = true;
    const drops = Array.isArray(obj.loot) ? obj.loot : [obj.loot];
    for (const l of drops) map.groundItems.push({ ...l, x: this.x, y: this.y });
    this.addScore(SCORE.cache);
    sfx.play('pickup');
    this.say(`You prise open the cache: ${drops.map((l) => ITEMS[l.item].name.toLowerCase()).join(', ')}.`);
  }

  // Set fire to the nearest obelisk in range and roughly in front. Five hits
  // bring one down; it looks more damaged each time and finally collapses
  // into a heap of salvage. Costs a battery per shot.
  // The nearest un-destroyed obelisk in front and within range, or null.
  obeliskInFront(map, range) {
    let ob = null, best = Infinity;
    for (const o of map.objects) {
      if (o.type !== 'obelisk' || o.destroyed) continue;
      const dx = o.x + 0.5 - this.x, dy = o.y + 0.5 - this.y;
      const d = Math.hypot(dx, dy);
      if (d > range) continue;
      if (dx * this.facing.x + dy * this.facing.y < 0) continue;
      if (d < best) { best = d; ob = o; }
    }
    return ob;
  }

  burnObelisk(tool, map, range) {
    const ob = this.obeliskInFront(map, range);
    if (!ob) { this.say('No obelisk in your sights.'); return; }
    let i = this.pockets.findIndex((s) => s && s.item === 'battery');
    let slots = this.pockets;
    if (i < 0 && this.backpack) { i = this.backpack.slots.findIndex((s) => s && s.item === 'battery'); slots = this.backpack.slots; }
    if (i < 0) { this.say('The OB-gun needs a battery.'); return; }
    slots[i].qty -= 1; if (slots[i].qty <= 0) slots[i] = null;
    this.swingTimer = tool.swingCooldown;
    sfx.play('zap');
    this.damageObelisk(ob, map, 1);
  }

  // Land `amount` burns on an obelisk: scorch/shrink it, report the attack up
  // the network (a W4 is dispatched), and fell it once it reaches five. Shared
  // by the OB-gun (`burnObelisk`) and the electro-gun's arc.
  damageObelisk(ob, map, amount = 1) {
    ob.obDamage = (ob.obDamage || 0) + amount;
    ob.burning = 3; // seconds of visible flame, ticked by the renderer/main
    // Every attack on an obelisk is reported up the network: the W-factory
    // answers by dispatching a W4 hunter-killer after you (main throttles
    // this so it can't be spammed by rapid-fire hits).
    if (this.onObeliskAttacked) this.onObeliskAttacked(ob);
    if (ob.obDamage >= 5) {
      ob.destroyed = true;
      // The heap is walkable now, so the salvage on it can be collected.
      map.objectGrid[ob.y * map.w + ob.x] = null;
      this.spillObeliskSalvage(ob, map);
      this.say(`Obelisk ${ob.code || ''} buckles and comes down in a shower of sparks and circuitry.`);
    } else {
      this.say(`The obelisk catches fire. ${5 - ob.obDamage} more should finish it.`);
    }
  }

  // A bomb's fuse has run out: a cloud of fire that hurts every living thing
  // in its radius (you included), and — for the insane bomb — brings down any
  // obelisk caught in the blast. Called from main when b.fuse <= 0.
  detonateBomb(b, map, animals, robots, droids, obeliskObjs) {
    const hitList = (arr, robot) => {
      for (const e of arr) {
        if (e.dead || e.fused) continue;
        if (robot && e.zombie) continue; // bombs can't touch a zombified machine either
        if (Math.hypot(e.x - b.x, e.y - b.y) > b.radius) continue;
        e.hp -= b.damage; e.hurt = true; e.justHurt = true;
        if (robot) { e.scrapPenalty = true; this.sparkAt(map, e.x, e.y); }
        if (e.hp <= 0 && !robot) { e.dead = true; map.groundItems.push({ item: 'meat', qty: 1, x: e.x, y: e.y }); this.addScore(SCORE.animal); }
        else if (e.hp <= 0 && robot) this.addScore(SCORE.robot);
      }
    };
    hitList(animals, false);
    hitList(robots, true);
    if (droids) hitList(droids, true);
    if (Math.hypot(this.x - b.x, this.y - b.y) <= b.radius) this.takeDamage(b.damage * 0.6, 'the blast');
    // A blast near the W-factory chews into its hull too (its footprint is
    // big, so measure to the nearest edge of it, not just its centre).
    const fac = map.objects.find((o) => o.type === 'wfactory' && !o.destroyed);
    if (fac) {
      const nx = Math.max(fac.x, Math.min(b.x, fac.x + (fac.fw || 1)));
      const ny = Math.max(fac.y, Math.min(b.y, fac.y + (fac.fh || 1)));
      if (Math.hypot(nx - b.x, ny - b.y) <= b.radius) this.damageFactory(fac, map, b.damage);
    }
    if (b.obelisk && obeliskObjs) {
      for (const ob of obeliskObjs) {
        if (ob.destroyed) continue;
        if (Math.hypot(ob.x + 0.5 - b.x, ob.y + 0.5 - b.y) > b.radius) continue;
        ob.destroyed = true;
        map.objectGrid[ob.y * map.w + ob.x] = null;
        this.spillObeliskSalvage(ob, map);
      }
    }
  }

  // The heap of salvage a physically-destroyed obelisk leaves behind: its one
  // numbered circuit board (1-8, guaranteed spread across the towers — collect
  // all eight for a wave gun), batteries, scrap, and — always — an access chip,
  // so felling any tower hands you the means to jack into the others. Shared by
  // the OB-gun and the insane bomb. (Not called by RON-ML `crash`, which only
  // knocks a tower dark temporarily and leaves nothing behind.)
  spillObeliskSalvage(ob, map) {
    this.addScore(20);
    const num = ob.circuitNum || (1 + Math.floor(Math.random() * 8));
    map.groundItems.push({ item: 'circuit', qty: 1, num, x: ob.x + 0.5, y: ob.y + 0.5 });
    map.groundItems.push({ item: 'battery', qty: 4, x: ob.x + 0.5, y: ob.y + 0.5 });
    map.groundItems.push({ item: 'scrap', qty: 3, x: ob.x + 0.5, y: ob.y + 0.5 });
    map.groundItems.push({ item: 'chip', qty: 1, x: ob.x + 0.3, y: ob.y + 0.7 });
    if (ob.code) this.killLog.push(ob.code);
    if (this.onObeliskDestroyed) this.onObeliskDestroyed(ob);
  }

  // A piercing beam: cuts a straight line from the muzzle out to `range` and
  // damages every enemy it passes through. Costs one round of the gun's ammo.
  pierceShot(tool, map, animals, robots) {
    let ai = this.pockets.findIndex((s) => s && s.item === tool.ammoType);
    let slots = this.pockets;
    if (ai < 0 && this.backpack) { ai = this.backpack.slots.findIndex((s) => s && s.item === tool.ammoType); slots = this.backpack.slots; }
    if (ai < 0) { this.say(`The ${tool.name.toLowerCase()} needs ${ITEMS[tool.ammoType].name.toLowerCase()}.`); return; }
    slots[ai].qty -= 1; if (slots[ai].qty <= 0) slots[ai] = null;
    this.swingTimer = tool.swingCooldown;
    sfx.play('zap');
    const rng = tool.range + this.xpLevel('guns') * 0.3;
    // The beam stops dead at the first solid object in its path — it
    // doesn't cut through walls to hit whatever's cowering behind one.
    const maxAlong = this.beamRange(map, rng);
    let zombified = false;
    // Everything within a narrow corridor ahead, up to the beam's actual
    // (possibly wall-shortened) reach, gets hit.
    const hit = (e, robot) => {
      if (e.dead || e.fused || e.friendly) return;
      const dx = e.x - this.x, dy = e.y - this.y;
      const along = dx * this.facing.x + dy * this.facing.y;
      if (along < 0 || along > maxAlong) return;
      const perp = Math.abs(dx * -this.facing.y + dy * this.facing.x);
      if (perp > 0.8) return;
      // The OB-gun's own beam doesn't kill a machine outright — it corrupts
      // it into a zombie, immune to everything but a bow or the wave gun.
      // W1s are already the AI's own revenge squad, dispatched hostile from
      // the moment they're deployed — they can't be corrupted any further.
      if (robot && tool.effect === 'burn' && !e.zombie && e.type !== 'w1') {
        e.zombie = true; e.hurt = true; zombified = true;
        this.sparkAt(map, e.x, e.y);
        return;
      }
      if (robot && zombieImmune(e, tool)) return;
      e.hp -= robot ? (tool.robotDamage + this.xpLevel('guns')) : (tool.animalDamage + this.xpLevel('guns'));
      e.hurt = true;
      if (robot) { e.scrapPenalty = true; this.sparkAt(map, e.x, e.y); }
      this.gainXp('guns', 2);
      if (e.hp <= 0 && !robot) { e.dead = true; map.groundItems.push({ item: 'meat', qty: 1, x: e.x, y: e.y }); this.addScore(SCORE.animal); }
      else if (e.hp <= 0 && robot) this.addScore(SCORE.robot);
    };
    for (const a of animals) hit(a, false);
    for (const r of robots) hit(r, true);
    // A long tracer to the end of the beam (or the wall that stopped it).
    map.projectiles = map.projectiles || [];
    map.projectiles.push({ x0: this.x + this.facing.x * 0.4, y0: this.y + this.facing.y * 0.4, x1: this.x + this.facing.x * maxAlong, y1: this.y + this.facing.y * maxAlong, prog: 0, kind: 'fuse' });
    this.say(zombified
      ? "The beam doesn't kill the machine — it corrupts it into a lurching husk. Only a bow or the wave gun will finish it now."
      : 'The beam cuts a line clean through them.');
  }

  // The wave gun: a fan of laser shots that hits every enemy inside a wide
  // cone ahead, up to range — built to scythe a whole wave at once.
  coneShot(tool, map, animals, robots) {
    let ai = this.pockets.findIndex((s) => s && s.item === tool.ammoType);
    let slots = this.pockets;
    if (ai < 0 && this.backpack) { ai = this.backpack.slots.findIndex((s) => s && s.item === tool.ammoType); slots = this.backpack.slots; }
    if (ai < 0) { this.say(`The ${tool.name.toLowerCase()} needs ${ITEMS[tool.ammoType].name.toLowerCase()}.`); return; }
    slots[ai].qty -= 1; if (slots[ai].qty <= 0) slots[ai] = null;
    this.swingTimer = tool.swingCooldown;
    sfx.play('zap');
    const rng = tool.range + this.xpLevel('guns') * 0.3;
    const HALF = Math.cos(Math.PI / 5); // ~36° half-angle cone
    let hitCount = 0;
    const hit = (e, robot) => {
      if (e.dead || e.fused || e.friendly) return;
      const dx = e.x - this.x, dy = e.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d > rng || d === 0) return;
      if ((dx * this.facing.x + dy * this.facing.y) / d < HALF) return; // outside the cone
      if (!map.hasLineOfSight(this.x, this.y, e.x, e.y)) return; // a wall shadows this one
      e.hp -= robot ? tool.robotDamage : tool.animalDamage;
      e.hurt = true;
      if (robot) { e.scrapPenalty = true; this.sparkAt(map, e.x, e.y); }
      hitCount++;
      if (e.hp <= 0 && !robot) { e.dead = true; map.groundItems.push({ item: 'meat', qty: 1, x: e.x, y: e.y }); this.addScore(SCORE.animal); }
      else if (e.hp <= 0 && robot) this.addScore(SCORE.robot);
    };
    for (const a of animals) hit(a, false);
    for (const r of robots) hit(r, true);
    this.gainXp('guns', 2 + hitCount);
    // Three visible fan beams.
    map.projectiles = map.projectiles || [];
    for (const ang of [-0.5, 0, 0.5]) {
      const fx = this.facing.x * Math.cos(ang) - this.facing.y * Math.sin(ang);
      const fy = this.facing.x * Math.sin(ang) + this.facing.y * Math.cos(ang);
      map.projectiles.push({ x0: this.x + fx * 0.4, y0: this.y + fy * 0.4, x1: this.x + fx * rng, y1: this.y + fy * rng, prog: 0, kind: 'stun' });
    }
    this.say(hitCount ? `The wave gun scythes through ${hitCount}.` : 'The wave fans out into empty air.');
  }

  // Fire the held gun at the nearest target in range and roughly in front.
  // Guns consume ammunition (ammoType) from the pockets per shot. Stun and
  // fuse effects work on machines only; pistol and shotgun hit flesh too.
  fire(tool, map, animals, robots) {
    // Gun practice steadies the hand: range grows a little with the level.
    const range = tool.range + this.xpLevel('guns') * 0.3;

    // The OB-gun burns an obelisk if one is in front; otherwise it fires a
    // piercing beam that cuts through every enemy in its path. The railgun
    // always pierces.
    if (tool.effect === 'burn') {
      if (this.obeliskInFront(map, range)) { this.burnObelisk(tool, map, range); return; }
      this.pierceShot(tool, map, animals, robots, range); return;
    }
    if (tool.pierce) { this.pierceShot(tool, map, animals, robots, range); return; }
    if (tool.cone) { this.coneShot(tool, map, animals, robots, range); return; }
    let target = null, best = Infinity, isRobot = false;
    const consider = (e, robot) => {
      if (e.dead || e.fused || e.friendly) return;
      const dx = e.x - this.x, dy = e.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d > range || d === 0) return;
      if (dx * this.facing.x + dy * this.facing.y < 0) return;
      if (d < best && map.hasLineOfSight(this.x, this.y, e.x, e.y)) { best = d; target = e; isRobot = robot; }
    };
    if (tool.animalDamage != null) for (const a of animals) consider(a, false);
    for (const r of robots) consider(r, true);

    // The electro-gun's arc bites obelisks too — a slower way to fell a tower
    // than the OB-gun, but it works. If one's in front and no closer than any
    // machine, it takes the shot instead.
    let obTarget = null;
    if (tool.effect === 'fuse') {
      const ob = this.obeliskInFront(map, range);
      if (ob) {
        const od = Math.hypot(ob.x + 0.5 - this.x, ob.y + 0.5 - this.y);
        if (od <= best) obTarget = ob;
      }
    }

    // The electro-gun runs off its own self-charging cell — no pocket ammo.
    // When the cell's too low it just needs a moment to trickle back up.
    if (tool.selfCharge) {
      if (this.electroCharge < tool.shotCost) {
        this.say('The electro-gun hums, near flat — give its cell a moment to recharge.');
        return;
      }
      this.electroCharge -= tool.shotCost;
      // Firing near wildlife spooks it: the crackle sends animals bolting.
      this.scareAnimals(animals, 7);
    } else {
      // Other guns draw ammo from the pockets first, then the backpack — no
      // need to manually shuffle rounds forward. Consumed whether or not
      // there's a target in range: pulling the trigger with nothing in your
      // sights still wastes the round rather than refusing to fire.
      let ammoSlots = this.pockets;
      let i = this.pockets.findIndex((s) => s && s.item === tool.ammoType);
      if (i < 0 && this.backpack) {
        i = this.backpack.slots.findIndex((s) => s && s.item === tool.ammoType);
        ammoSlots = this.backpack.slots;
      }
      if (i < 0) {
        this.say(`The ${tool.name.toLowerCase()} is dead weight without ${ITEMS[tool.ammoType].name.toLowerCase()}.`);
        return;
      }
      ammoSlots[i].qty -= 1;
      if (ammoSlots[i].qty <= 0) ammoSlots[i] = null;
    }
    this.swingTimer = tool.swingCooldown;
    this.stamina = Math.max(0, this.stamina - (tool.staminaCost ?? 0));

    // Obelisk in the arc's path (electro-gun only): the bolt flies to it and
    // scorches it, same as an OB-gun burn but from the electro-gun's cell.
    if (obTarget) {
      const bx = obTarget.x + 0.5, by = obTarget.y + 0.5;
      map.projectiles = map.projectiles || [];
      map.projectiles.push({
        x0: this.x + this.facing.x * 0.4, y0: this.y + this.facing.y * 0.4,
        x1: bx, y1: by, prog: 0, kind: 'fuse',
      });
      sfx.play('zap');
      this.sparkBurst(map, bx, by);
      this.damageObelisk(obTarget, map, 1);
      return;
    }

    // A visible round travels from the muzzle to the target (cosmetic; the
    // hit itself is instant). Electric guns fire a cyan/violet bolt. With no
    // target it still flies out to the shot's real reach (a wall or a hill
    // stops it early, same as beamRange elsewhere) rather than nowhere.
    const missRange = this.beamRange(map, range);
    const tx = target ? target.x : this.x + this.facing.x * missRange;
    const ty = target ? target.y : this.y + this.facing.y * missRange;
    map.projectiles = map.projectiles || [];
    map.projectiles.push({
      x0: this.x + this.facing.x * 0.4, y0: this.y + this.facing.y * 0.4,
      x1: tx, y1: ty, prog: 0,
      kind: tool.effect === 'stun' ? 'stun' : tool.effect === 'fuse' ? 'fuse' : 'bullet',
    });

    if (!target) {
      sfx.play('shot');
      this.say('You fire into the empty air.');
      return;
    }

    if (isRobot && zombieImmune(target, tool)) {
      this.say('The shot has no effect — the husk is only vulnerable to a bow or the wave gun now.');
    } else if (tool.effect === 'stun') {
      sfx.play('zap');
      target.disabledT = tool.stunTime;
      this.sparkAt(map, target.x, target.y);
      this.say('The stun bolt drops the machine cold. It will not stay down forever.');
    } else if (tool.effect === 'fuse') {
      sfx.play('zap');
      // A full charge destroys the machine outright — a clean kill (no scrap
      // penalty), so it drops its full salvage on the robots module's next
      // tick, chip fragment and all.
      target.hp = 0;
      target.hurt = true;
      target.scrapPenalty = false;
      this.sparkBurst(map, target.x, target.y);
      this.addScore(SCORE.robot);
      this.say('The machine convulses in a storm of sparks and dies where it stands.');
    } else if (isRobot) {
      sfx.play('shot');
      target.scrapPenalty = true; // gunfire mangles the salvage
      target.hp -= tool.robotDamage + this.xpLevel('guns');
      target.hurt = true;
      this.sparkAt(map, target.x, target.y);
      this.gainXp('guns', target.hp <= 0 ? 5 : 1);
      if (target.hp <= 0) this.addScore(SCORE.robot);
      this.say(target.hp <= 0
        ? 'The machine collapses in a shower of sparks.'
        : 'The round punches into the machine.');
    } else {
      sfx.play('shot');
      target.hp -= tool.animalDamage + this.xpLevel('guns');
      target.hurt = true;
      this.gainXp('guns', target.hp <= 0 ? 5 : 1);
      if (target.hp <= 0) {
        target.dead = true;
        map.groundItems.push({ item: 'meat', qty: 1, x: target.x, y: target.y });
        this.addScore(SCORE.animal);
        this.say(`The ${target.type} drops where it stands.`);
      } else {
        this.say(`You wing the ${target.type}.`);
      }
    }
  }

  // Walk over dropped loot to collect it (if there is room). A backpack
  // found on the ground is worn, not stowed. A better weapon than the one
  // in hand is equipped on the spot; the old tool goes to the backpack's
  // spare-weapon slot if there's one free, otherwise a pocket, otherwise
  // the ground.
  pickupNearby(map) {
    for (const gi of map.groundItems) {
      if (Math.hypot(gi.x - this.x, gi.y - this.y) > PICKUP_RANGE) continue;
      const def = ITEMS[gi.item];
      if (def.kind === 'backpack') {
        if (this.backpack) continue; // already carrying one; leave it be
        this.backpack = { slots: new Array(16).fill(null), weapon: null };
        gi.qty -= 1;
        sfx.play('pickup');
        this.say('You find a backpack — 16 more slots, and room for a spare weapon.');
        continue;
      }
      // Books are read on the spot for their knowledge, not carried.
      if (def.kind === 'book') {
        gi.qty -= 1;
        sfx.play('pickup');
        this.learnFromBook(gi.item);
        continue;
      }
      if (def.kind === 'tool' && (def.tier ?? 0) > (ITEMS[this.hands]?.tier ?? 0)) {
        const old = this.hands;
        this.hands = gi.item;
        this.discoverWeapon(gi.item);
        gi.qty -= 1;
        // Only stow the displaced item if there was one — grabbing a tool
        // with empty hands must not try to stow null (that used to throw and
        // freeze the game when opening a crate bare-handed).
        if (old) {
          if (this.backpack && !this.backpack.weapon) {
            this.backpack.weapon = old;
          } else if (this.stow(old, 1) === 0) {
            map.groundItems.push({ item: old, qty: 1, x: this.x, y: this.y });
          }
        }
        sfx.play('pickup');
        this.say(`You take the ${def.name.toLowerCase()} in hand.`);
        continue;
      }
      const stored = this.stow(gi.item, gi.qty);
      if (stored <= 0) continue;
      gi.qty -= stored;
      this.discoverWeapon(gi.item);
      // Numbered circuit boards go toward the wave gun.
      if (gi.item === 'circuit' && gi.num != null) this.circuitNums.add(gi.num);
      // A found Wi-Fi block comes with a charge — a genuine reward, and
      // usable at once (hold it, and top it up with batteries later).
      if (gi.item === 'wifiblock') this.wifiPower = (gi.power != null) ? gi.power : this.wifiMax;
      sfx.play('pickup');
      this.say(gi.item === 'wifiblock'
        ? 'You find a Wi-Fi block — hold it and the machines cannot see you.'
        : `+${stored} ${ITEMS[gi.item].name.toLowerCase()}`);
    }
    map.groundItems = map.groundItems.filter((gi) => gi.qty > 0);
  }

  forcefieldActive() {
    return this.hasItem('forcefield') && this.forcefieldArmed && this.forcefieldCharge > 0;
  }

  // While the electro-compass is armed and carried, the facing chevron
  // becomes a cluster of pointers — one per category of notable thing,
  // each to the nearest of its kind, colour-coded: factory (blue), obelisk
  // (green), a dropped backpack (yellow), a dropped OB-gun (orange). The AI
  // mainframe (red) will slot in here once it exists. Returns an array of
  // {x, y, color}, one entry per category that has something to point at.
  compassTargets() {
    const map = this.map;
    if (!map) return [];
    const nearest = {}; // color -> {x,y,d}
    const consider = (x, y, color) => {
      const d = Math.hypot(x - this.x, y - this.y);
      if (!nearest[color] || d < nearest[color].d) nearest[color] = { x, y, d };
    };
    for (const o of map.objects) {
      if (o.type === 'wfactory' && !o.destroyed) consider(o.x + (o.fw || 1) / 2, o.y + (o.fh || 1) / 2, '#4f8fe0');
      else if (o.type === 'obelisk' && !o.destroyed) consider(o.x + 0.5, o.y + 0.5, '#4fe07a');
    }
    for (const gi of (map.groundItems || [])) {
      if (gi.item === 'backpack') consider(gi.x, gi.y, '#e6d24a');
      else if (gi.item === 'obgun') consider(gi.x, gi.y, '#e0842f');
    }
    return Object.entries(nearest).map(([color, t]) => ({ x: t.x, y: t.y, color }));
  }

  // A laser is on its way. Returns how it's stopped, if at all:
  //  'reflect' — a mirror shield throws it back, destroying the shooter
  //  'absorb'  — a plain shield or the forcefield eats it
  //  null      — nothing stops it; it lands
  // Shields work while simply CARRIED (hand, pocket, or pack) — they're a
  // worn deflector, not something you have to hold up and aim — and cover you
  // from any direction. The mirror shield takes priority over the plain one.
  blockRangedShot() {
    if (this.forcefieldActive()) return 'absorb';
    if (this.hasItem('mirror_shield')) return 'reflect';
    if (this.hasItem('shield')) return 'absorb';
    return null;
  }

  // True if a carried shield/forcefield is currently shielding you — used to
  // draw the protective glow even when the item isn't in hand.
  shielded() {
    return this.forcefieldActive() || this.hasItem('mirror_shield') || this.hasItem('shield');
  }

  takeDamage(amount, source) {
    // The forcefield stops everything — shot or blow — while it's up.
    if (this.forcefieldActive()) { this.hurtTimer = 0.12; return; }
    this.health -= amount;
    this.hurtTimer = 0.35;
    if (source === 'viper') sfx.play('hiss');
    sfx.play('hurt');
    if (this.health <= 0) {
      if (this.skylinkActive) this.dieToSkylink();
      else this.die(this.map, `the ${source}`);
    }
  }

  // Caught in SKYLINK's final 30-second purge: there is no waking back up
  // at the road this time — the certificate shows straight away, same
  // ending as simply running out the clock.
  dieToSkylink() {
    if (this._ended) return;
    this._ended = true;
    this.deaths = (this.deaths || 0) + 1;
    this.deathCert = {
      name: this.name, cause: 'SKYLINK-9000 coming online',
      score: this.score, skills: [...this.skills], deaths: this.deaths, skylink: true,
    };
    if (this.onDeath) this.onDeath();
    sfx.play('die');
  }

  // Death: you lose everything you were carrying (it is not dropped — it's
  // gone), and wake back at the spawn point with just a penknife.
  die(map, cause) {
    map = map || this.map;
    // A certificate of death, snapped from the run's final state. The score
    // is cumulative and survives; deaths count up. main shows it as a modal.
    this.deaths = (this.deaths || 0) + 1;
    this.deathCert = {
      name: this.name, cause, score: this.score,
      skills: [...this.skills], deaths: this.deaths,
    };
    if (this.onDeath) this.onDeath();

    this.pockets = [null, null, null, null];
    this.backpack = null;
    this.selectedPocket = null;
    this.hands = 'penknife';
    this.health = this.maxHealth;
    this.stamina = this.maxStamina;
    this.food = this.maxFood;
    this.venom = 0;
    this.x = this.spawnX;
    this.y = this.spawnY;
    this.z = 0;
    this.vz = 0;
    sfx.play('die');
    this.say(`You were killed by ${cause}. You lose everything and wake back at the road.`);
  }

  // Add qty of an item to pockets, stacking first, then overflow into the
  // backpack (if carried). Returns how many fitted.
  stow(itemKey, qty) {
    if (!itemKey || !ITEMS[itemKey]) return 0; // never stow a null/unknown item
    let left = this._fillSlots(this.pockets, itemKey, qty);
    if (left > 0 && this.backpack) left = this._fillSlots(this.backpack.slots, itemKey, left);
    return qty - left;
  }

  // Stack into existing matching slots first, then fill empty ones.
  // Returns how much of qty is left over (didn't fit in this slot array).
  _fillSlots(slots, itemKey, qty) {
    const def = ITEMS[itemKey];
    let left = qty;
    for (let i = 0; i < slots.length && left > 0; i++) {
      const slot = slots[i];
      if (slot && slot.item === itemKey && slot.qty < def.stack) {
        const take = Math.min(left, def.stack - slot.qty);
        slot.qty += take;
        left -= take;
      }
    }
    for (let i = 0; i < slots.length && left > 0; i++) {
      if (!slots[i]) {
        const take = Math.min(left, def.stack);
        slots[i] = { item: itemKey, qty: take };
        left -= take;
      }
    }
    return left;
  }

  say(text) {
    this.message = { text, ttl: 3 };
  }

  moveAxis(dx, dy, map) {
    const nx = this.x + dx;
    const ny = this.y + dy;
    if (!this.collides(nx, ny, map)) {
      this.x = nx;
      this.y = ny;
    }
  }

  // Knockback from a fight (or a bad spawn spot) can leave the player
  // embedded in solid geometry. Detect it and step out to the nearest open
  // tile, spiralling outward ring by ring, rather than leaving them stuck.
  unstickIfTrapped(map) {
    if (!this.collides(this.x, this.y, map)) return;
    const cx = Math.floor(this.x), cy = Math.floor(this.y);
    for (let r = 1; r <= 6; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // ring only
          const nx = cx + dx + 0.5, ny = cy + dy + 0.5;
          if (!this.collides(nx, ny, map)) {
            this.x = nx;
            this.y = ny;
            this.say('You wrench yourself free.');
            return;
          }
        }
      }
    }
  }

  // Sample the four corners of the player's bounding square. A corner
  // blocks if its tile is solid or too many height levels away. The height
  // you can step in one move depends on what you're doing:
  //   on foot        -> 1  (walk up a terrain step, over rubble/rock)
  //   a normal jump   -> 2  (hop onto higher ground, out of a dug pit)
  //   a double jump   -> 3  (reach a block top: walls are climbHeight 2.5)
  // A "climbable" object (wall, rubble, rock — tiles.js) counts as a raised
  // step of its climbHeight instead of flatly blocking, so it can be climbed
  // and stood on top of once there — but a wall's 2.5 is out of reach of a
  // single jump, so it takes the double jump. None of this lets a jump skip
  // terrain, which is always at most one level between adjacent tiles (the
  // generator's Lipschitz guarantee). A wheeled robot can't climb at all.
  //
  // Stepping UP is capped by maxStep (that's what stops you walking through a
  // wall from the ground). Stepping DOWN is capped too — normally — so you
  // can't stroll off a cliff or into a dug pit. The exception is when you're
  // already standing on top of a climbable object (a wall/rock): then you can
  // drop off any edge freely, so roaming a block top and walking off it feels
  // natural instead of being fenced into the middle of the block.
  collides(x, y, map) {
    const cfx = Math.floor(this.x), cfy = Math.floor(this.y);
    const h = map.effectiveHeightAt ? map.effectiveHeightAt(cfx, cfy)
      : (map.heightAt ? map.heightAt(cfx, cfy) : 0);
    const curObj = map.objectAt ? map.objectAt(cfx, cfy) : null;
    const onLedge = !!(curObj && OBJECTS[curObj.type] && OBJECTS[curObj.type].climbable);
    const airborne = this.z > 0 || this.vz !== 0;
    const maxStep = !airborne ? 1 : (this.doubleJumped ? 3 : 2);

    // A flatly-solid, NON-climbable object (obelisk, box, car, factory)
    // blocks whenever any corner of the footprint overlaps it — that keeps
    // the body from clipping into a building or a crate. Climbable objects
    // (walls/rock/rubble) are deliberately excluded here; their passability
    // is a height question, handled below, so you can stand on and step off
    // them. Water is passable (the player swims).
    const solidCorner = (tx, ty) => {
      const obj = map.objectAt ? map.objectAt(tx, ty) : null;
      const climbable = obj && OBJECTS[obj.type] && OBJECTS[obj.type].climbable;
      return map.isSolid(tx, ty) && map.floorAt(tx, ty) !== 'water' && !climbable;
    };
    if (solidCorner(Math.floor(x - RADIUS), Math.floor(y - RADIUS))
      || solidCorner(Math.floor(x + RADIUS), Math.floor(y - RADIUS))
      || solidCorner(Math.floor(x - RADIUS), Math.floor(y + RADIUS))
      || solidCorner(Math.floor(x + RADIUS), Math.floor(y + RADIUS))) return true;

    // The height step is judged on the destination's CENTRE tile, not the
    // four corners. Cornerwise height checks make a tall thin wall miserable
    // to stand on: near any edge one corner overhangs the drop and blocks
    // you, fencing you into the middle of the block and snagging you at the
    // base when you step off. Centre-tile keeps walking on, along, and off a
    // block smooth; a wall you approach from the ground still blocks because
    // its centre is a +2.5 step (out of reach on foot), and you only overlap
    // its base by the footprint radius, which reads as standing against it.
    if (!map.heightAt) return false;
    const targetH = map.effectiveHeightAt ? map.effectiveHeightAt(Math.floor(x), Math.floor(y))
      : map.heightAt(Math.floor(x), Math.floor(y));
    const dh = targetH - h;
    if (dh > maxStep) return true;              // too high to step up
    if (dh < -maxStep && !onLedge) return true; // too far to drop, unless walking off a ledge
    return false;
  }
}
