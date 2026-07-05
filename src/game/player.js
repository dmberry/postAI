import { screenDirToWorld } from '../engine/iso.js';
import { sfx } from '../engine/sound.js';
import { ITEMS } from './items.js';

const WALK_SPEED = 4.2;   // tiles per second
const SPRINT_SPEED = 7.5;
const WOUNDED_SPEED = 3.2; // hobble walking pace when health is very low
const WOUNDED_AT = 20;     // health threshold for the hobble
const WOUNDED_SPRINT_DRAIN = 2.5; // wounded sprinting burns stamina this much faster
const RADIUS = 0.28;      // collision radius in tiles
const REACH = 0.9;        // how far ahead the player can use a tool
const TREE_HP = 4;        // penknife swings to fell a tree
const WOOD_PER_TREE = 2;
const PICKUP_RANGE = 0.55;

const STAMINA_MAX = 100;
const SPRINT_DRAIN = 9;   // stamina per second while sprinting
const STAMINA_REGEN = 12; // per second when not sprinting
const HEALTH_REGEN = 0.5; // per second while fed and unpoisoned
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

export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.spawnX = x;
    this.spawnY = y;
    this.z = 0;           // height above ground while jumping
    this.vz = 0;
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
    this.swingTimer = 0;
    this.hurtTimer = 0;   // brief red flash after taking damage
    this.message = null;  // {text, ttl} transient HUD line

    this.name = 'Adam';
    this.gender = 'm';    // 'm' | 'f' | 'u'
    this.skills = new Set(); // knowledge from books; survives death
  }

  setPersona(name, gender) {
    this.name = name;
    this.gender = gender;
  }

  update(dt, input, map, animals = []) {
    this.swingTimer = Math.max(0, this.swingTimer - dt);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    if (this.message) {
      this.message.ttl -= dt;
      if (this.message.ttl <= 0) this.message = null;
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
      this.facing = dir;
      let speed = this.sprinting ? SPRINT_SPEED : WALK_SPEED;
      // Badly hurt, you hobble — though adrenaline still lets you sprint,
      // just not for long (see the wounded stamina drain above).
      if (this.health < WOUNDED_AT && !this.sprinting) speed = WOUNDED_SPEED;
      // Wading a stream is slow; climbing costs stamina (handled below).
      if (map.floorAt(Math.floor(this.x), Math.floor(this.y)) === 'stream') speed *= 0.55;
      const hBefore = map.heightAt ? map.heightAt(Math.floor(this.x), Math.floor(this.y)) : 0;
      this.moveAxis(dir.x * speed * dt, 0, map);
      this.moveAxis(0, dir.y * speed * dt, map);
      const hAfter = map.heightAt ? map.heightAt(Math.floor(this.x), Math.floor(this.y)) : 0;
      if (hAfter > hBefore) this.stamina = Math.max(0, this.stamina - CLIMB_COST);
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

    // Jump: purely vertical hop; collision footprint is unchanged.
    if (input.jumpPressed() && this.z === 0 && this.stamina >= JUMP_COST) {
      this.vz = JUMP_VZ;
      this.stamina -= JUMP_COST;
      sfx.play('jump');
    }
    if (this.z > 0 || this.vz !== 0) {
      this.vz -= GRAVITY * dt;
      this.z += this.vz * dt;
      if (this.z <= 0) {
        this.z = 0;
        this.vz = 0;
      }
    }

    if (input.usePressed()) this.useHands(map, animals);
    if (input.eatPressed()) this.eat();
    if (input.readPressed()) this.read();
    this.pickupNearby(map);
  }

  // Read the first book in the pockets and learn its skill for good.
  read() {
    for (let i = 0; i < this.pockets.length; i++) {
      const slot = this.pockets[i];
      if (!slot) continue;
      const def = ITEMS[slot.item];
      if (def.kind !== 'book') continue;
      this.pockets[i] = null;
      if (this.skills.has(def.skill)) {
        this.say(`You have already read ${def.name}.`);
      } else {
        this.skills.add(def.skill);
        this.say(`You read "${def.name}". ${def.skillText}`);
        if (this.onSkillLearned) this.onSkillLearned(def.skill);
      }
      return;
    }
    this.say('Nothing to read.');
  }

  // Eat the first edible thing in the pockets.
  eat() {
    for (let i = 0; i < this.pockets.length; i++) {
      const slot = this.pockets[i];
      if (!slot) continue;
      const def = ITEMS[slot.item];
      if (def.food == null) continue;
      if (this.food >= this.maxFood - 2) {
        this.say('You are not hungry.');
        return;
      }
      slot.qty -= 1;
      if (slot.qty <= 0) this.pockets[i] = null;
      this.food = Math.min(this.maxFood, this.food + def.food);
      sfx.play('eat');
      if (slot.item === 'berries' && this.skills.has('herbalism')) {
        this.venom = 0;
        this.health = Math.min(this.maxHealth, this.health + 5);
        this.say('You eat the berries. The right ones: the venom fades.');
      } else {
        this.say(`You eat the ${def.name.toLowerCase()}.`);
      }
      return;
    }
    this.say('Nothing to eat.');
  }

  // Swing the held tool: hits an animal in reach first, otherwise the
  // object on the faced tile. No swinging mid-jump.
  useHands(map, animals = []) {
    const tool = ITEMS[this.hands];
    if (!tool || tool.kind !== 'tool' || this.swingTimer > 0 || this.z > 0) return;
    if (this.stamina < tool.staminaCost) {
      this.say('Too exhausted to swing.');
      return;
    }

    // Nearest living animal within reach and roughly in front.
    let target = null, best = Infinity;
    for (const a of animals) {
      if (a.dead) continue;
      const dx = a.x - this.x, dy = a.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d > 1.1 || d === 0) continue;
      if (dx * this.facing.x + dy * this.facing.y < 0) continue; // behind us
      if (d < best) { best = d; target = a; }
    }
    if (target) {
      this.swingTimer = tool.swingCooldown;
      this.stamina -= tool.staminaCost;
      sfx.play('chop');
      target.hp -= tool.animalDamage ?? 3;
      target.hurt = true; // animals module reads this for pack flee/enrage
      if (target.hp <= 0) {
        target.dead = true;
        map.groundItems.push({ item: 'meat', qty: 1, x: target.x, y: target.y });
        this.say(`The ${target.type} goes down.`);
      } else {
        this.say(`You catch the ${target.type} with the blade.`);
      }
      return;
    }

    const tx = Math.floor(this.x + this.facing.x * REACH);
    const ty = Math.floor(this.y + this.facing.y * REACH);
    const obj = map.objectAt(tx, ty);
    if (!obj || obj.type !== 'tree') {
      sfx.play('swing');
      return;
    }

    this.swingTimer = tool.swingCooldown;
    this.stamina -= tool.staminaCost;
    sfx.play('chop');
    const treeDmg = this.skills.has('woodcraft') ? tool.treeDamage * 2 : tool.treeDamage;
    obj.hp = (obj.hp ?? TREE_HP) - treeDmg;
    obj.shake = 0.3;
    map.shaking.add(obj);

    if (obj.hp <= 0) {
      map.removeObject(obj);
      map.groundItems.push({ item: 'wood', qty: WOOD_PER_TREE, x: obj.x + 0.5, y: obj.y + 0.5 });
      sfx.play('treefall');
      this.say('The tree comes down.');
    } else {
      this.say('You hack at the tree with the penknife.');
    }
  }

  // Walk over dropped loot to collect it (if there is pocket room).
  pickupNearby(map) {
    for (const gi of map.groundItems) {
      if (Math.hypot(gi.x - this.x, gi.y - this.y) > PICKUP_RANGE) continue;
      const stored = this.stow(gi.item, gi.qty);
      if (stored <= 0) continue;
      gi.qty -= stored;
      sfx.play('pickup');
      this.say(`+${stored} ${ITEMS[gi.item].name.toLowerCase()}`);
    }
    map.groundItems = map.groundItems.filter((gi) => gi.qty > 0);
  }

  takeDamage(amount, source) {
    this.health -= amount;
    this.hurtTimer = 0.35;
    if (source === 'viper') sfx.play('hiss');
    sfx.play('hurt');
    if (this.health <= 0) this.die(this.map, `the ${source}`);
  }

  // Death: drop everything where you fell, wake back at the spawn point.
  die(map, cause) {
    map = map || this.map;
    if (map) {
      for (const slot of this.pockets) {
        if (slot) map.groundItems.push({ item: slot.item, qty: slot.qty, x: this.x, y: this.y });
      }
    }
    this.pockets = [null, null, null, null];
    this.health = this.maxHealth;
    this.stamina = this.maxStamina;
    this.food = this.maxFood;
    this.venom = 0;
    this.x = this.spawnX;
    this.y = this.spawnY;
    this.z = 0;
    this.vz = 0;
    sfx.play('die');
    this.say(`You were killed by ${cause}. You wake back at the road.`);
  }

  // Add qty of an item to pockets, stacking first. Returns how many fitted.
  stow(itemKey, qty) {
    const def = ITEMS[itemKey];
    let left = qty;
    for (let i = 0; i < this.pockets.length && left > 0; i++) {
      const slot = this.pockets[i];
      if (slot && slot.item === itemKey && slot.qty < def.stack) {
        const take = Math.min(left, def.stack - slot.qty);
        slot.qty += take;
        left -= take;
      }
    }
    for (let i = 0; i < this.pockets.length && left > 0; i++) {
      if (!this.pockets[i]) {
        const take = Math.min(left, def.stack);
        this.pockets[i] = { item: itemKey, qty: take };
        left -= take;
      }
    }
    return qty - left;
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

  // Sample the four corners of the player's bounding square. A corner
  // blocks if its tile is solid or more than one height level away.
  collides(x, y, map) {
    const h = map.heightAt ? map.heightAt(Math.floor(this.x), Math.floor(this.y)) : 0;
    const blocked = (tx, ty) => {
      if (map.isSolid(tx, ty)) return true;
      if (!map.heightAt) return false;
      return Math.abs(map.heightAt(tx, ty) - h) > 1;
    };
    return (
      blocked(Math.floor(x - RADIUS), Math.floor(y - RADIUS)) ||
      blocked(Math.floor(x + RADIUS), Math.floor(y - RADIUS)) ||
      blocked(Math.floor(x - RADIUS), Math.floor(y + RADIUS)) ||
      blocked(Math.floor(x + RADIUS), Math.floor(y + RADIUS))
    );
  }
}
