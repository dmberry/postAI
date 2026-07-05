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

const WIFI_MAX = 600;    // Wi-Fi block charge in seconds (10 real minutes)
const SWIM_STAMINA_DRAIN = 8;  // stamina/sec while in deep water
const SWIM_HEALTH_DRAIN = 1.2; // health/sec: swimming a river is exhausting

// Survival score awards. A felled tree is the baseline point; skilled tools
// and tougher kills are worth more.
const SCORE = { tree: 1, animal: 3, robot: 10, wreck: 2, cache: 2, book: 5, fragment: 5 };

// Item kinds that can occupy the hands slot.
const HOLDABLE = new Set(['tool', 'gun', 'gadget']);

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

    this.wifiPower = 0;   // Wi-Fi block charge (seconds) while one is held
    this.wifiMax = WIFI_MAX;
    this.invisibleToRobots = false; // true while a charged block is in hand
    this.score = 0;       // survival score; persists across deaths

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

  // Can the OB-gun be crafted right now? (Stun-gun + electro-gun + Wi-Fi block.)
  canCraftObGun() {
    return this.hasItem('stungun') && this.hasItem('electrogun') && this.hasItem('wifiblock');
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
  // takes a weapon from it into the hand.
  equipSlot(slot) {
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

    // Swimming a river is exhausting: it drains stamina fast and chips at
    // health, whether you're moving or treading water. Get across and out.
    this.swimming = map.floorAt(Math.floor(this.x), Math.floor(this.y)) === 'water';
    if (this.swimming) {
      this.stamina = Math.max(0, this.stamina - SWIM_STAMINA_DRAIN * dt);
      this.health = Math.max(0, this.health - SWIM_HEALTH_DRAIN * dt);
      if (this.health <= 0) { this.die(map, 'the cold river'); return; }
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
    this.invisibleToRobots = this.ownsWifiBlock() && this.wifiPower > 0;
    this._wifiOn = this.invisibleToRobots;

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
    const tool = ITEMS[this.hands];
    if (this.swingTimer > 0 || this.z > 0) return;

    const tx = Math.floor(this.x + this.facing.x * REACH);
    const ty = Math.floor(this.y + this.facing.y * REACH);
    const obj = map.objectAt(tx, ty);
    const facingBox = obj && obj.type === 'box';

    if (!tool || tool.kind === 'gun' || tool.kind === 'gadget') {
      if (facingBox) { this.openBox(obj, map); return; }
      if (tool && tool.kind === 'gun') this.fire(tool, map, animals, robots);
      else if (tool && tool.kind === 'gadget') this.useGadget(tool);
      else if (!tool) this.say('Your hands are empty.');
      return;
    }
    if (tool.kind !== 'tool') return;
    if (this.stamina < tool.staminaCost) {
      this.say('Too exhausted to swing.');
      return;
    }

    // Nearest living creature or machine within reach and roughly in front.
    // Fused wrecks stay targetable: hitting one mines it for parts.
    let target = null, best = Infinity, isRobot = false;
    const consider = (e, robot) => {
      if (e.dead || e.drained || e.friendly) return;
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
    if (target) {
      this.swingTimer = tool.swingCooldown;
      this.stamina -= tool.staminaCost;
      sfx.play('chop');
      // A practised swordarm hits harder.
      const bonus = this.xpLevel('melee');
      target.hp -= (isRobot ? (tool.robotDamage ?? 1) : (tool.animalDamage ?? 3)) + bonus;
      target.hurt = true; // modules read this (pack flee, boar enrage, robot aggro)
      this.gainXp('melee', target.hp <= 0 ? 5 : 1);
      if (isRobot) {
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

    // Shovel: dig a pit in the open ground ahead. A steep pit (height -2)
    // is a trap — a wheeled T1 rolls in and can't climb out, and you can
    // only get out yourself by jumping.
    if (tool.dig && !obj) { this.dig(map, tx, ty); return; }

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
  burnObelisk(tool, map, range) {
    let ob = null, best = Infinity;
    for (const o of map.objects) {
      if (o.type !== 'obelisk' || o.destroyed) continue;
      const dx = o.x + 0.5 - this.x, dy = o.y + 0.5 - this.y;
      const d = Math.hypot(dx, dy);
      if (d > range) continue;
      if (dx * this.facing.x + dy * this.facing.y < 0) continue;
      if (d < best) { best = d; ob = o; }
    }
    if (!ob) { this.say('No obelisk in your sights.'); return; }
    let i = this.pockets.findIndex((s) => s && s.item === 'battery');
    let slots = this.pockets;
    if (i < 0 && this.backpack) { i = this.backpack.slots.findIndex((s) => s && s.item === 'battery'); slots = this.backpack.slots; }
    if (i < 0) { this.say('The OB-gun needs a battery.'); return; }
    slots[i].qty -= 1; if (slots[i].qty <= 0) slots[i] = null;
    this.swingTimer = tool.swingCooldown;
    sfx.play('zap');
    ob.obDamage = (ob.obDamage || 0) + 1;
    ob.burning = 3; // seconds of visible flame, ticked by the renderer/main
    if (ob.obDamage >= 5) {
      ob.destroyed = true;
      // The heap is walkable now, so the salvage on it can be collected.
      map.objectGrid[ob.y * map.w + ob.x] = null;
      this.addScore(20);
      // A heap of salvage where the tower stood.
      for (let k = 0; k < 3; k++) map.groundItems.push({ item: 'circuit', qty: 1 + Math.floor(Math.random() * 2), x: ob.x + 0.5 + (Math.random() - 0.5), y: ob.y + 0.5 + (Math.random() - 0.5) });
      map.groundItems.push({ item: 'battery', qty: 2, x: ob.x + 0.5, y: ob.y + 0.5 });
      map.groundItems.push({ item: 'scrap', qty: 3, x: ob.x + 0.5, y: ob.y + 0.5 });
      if (this.onObeliskDestroyed) this.onObeliskDestroyed(ob);
      this.say('The obelisk buckles and comes down in a shower of sparks and circuitry.');
    } else {
      this.say(`The obelisk catches fire. ${5 - ob.obDamage} more should finish it.`);
    }
  }

  // Fire the held gun at the nearest target in range and roughly in front.
  // Guns consume ammunition (ammoType) from the pockets per shot. Stun and
  // fuse effects work on machines only; pistol and shotgun hit flesh too.
  fire(tool, map, animals, robots) {
    // Gun practice steadies the hand: range grows a little with the level.
    const range = tool.range + this.xpLevel('guns') * 0.3;

    // The OB-gun burns obelisks, not creatures: find the nearest tower in
    // range and set it alight.
    if (tool.effect === 'burn') { this.burnObelisk(tool, map, range); return; }
    let target = null, best = Infinity, isRobot = false;
    const consider = (e, robot) => {
      if (e.dead || e.fused || e.drained || e.friendly) return;
      const dx = e.x - this.x, dy = e.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d > range || d === 0) return;
      if (dx * this.facing.x + dy * this.facing.y < 0) return;
      if (d < best) { best = d; target = e; isRobot = robot; }
    };
    if (tool.animalDamage != null) for (const a of animals) consider(a, false);
    for (const r of robots) consider(r, true);
    if (!target) {
      this.say('No clear shot.');
      return;
    }
    // Ammo comes from the pockets first, then the backpack — no need to
    // manually shuffle rounds forward before a fight.
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
    this.swingTimer = tool.swingCooldown;
    this.stamina = Math.max(0, this.stamina - (tool.staminaCost ?? 0));

    // A visible round travels from the muzzle to the target (cosmetic; the
    // hit itself is instant). Electric guns fire a cyan/violet bolt.
    map.projectiles = map.projectiles || [];
    map.projectiles.push({
      x0: this.x + this.facing.x * 0.4, y0: this.y + this.facing.y * 0.4,
      x1: target.x, y1: target.y, prog: 0,
      kind: tool.effect === 'stun' ? 'stun' : tool.effect === 'fuse' ? 'fuse' : 'bullet',
    });

    if (tool.effect === 'stun') {
      sfx.play('zap');
      target.disabledT = tool.stunTime;
      this.say('The stun bolt drops the machine cold. It will not stay down forever.');
    } else if (tool.effect === 'fuse') {
      sfx.play('zap');
      target.fused = true;
      target.mineCharges = 3;
      target.disabledT = 0;
      this.say('The machine fuses solid: blackened, dead, and full of parts.');
    } else if (isRobot) {
      sfx.play('shot');
      target.scrapPenalty = true; // gunfire mangles the salvage
      target.hp -= tool.robotDamage + this.xpLevel('guns');
      target.hurt = true;
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

  takeDamage(amount, source) {
    this.health -= amount;
    this.hurtTimer = 0.35;
    if (source === 'viper') sfx.play('hiss');
    sfx.play('hurt');
    if (this.health <= 0) this.die(this.map, `the ${source}`);
  }

  // Death: drop everything where you fell (including the backpack itself
  // and everything in it), wake back at the spawn point.
  die(map, cause) {
    map = map || this.map;
    if (map) {
      for (const slot of this.pockets) {
        if (slot) map.groundItems.push(this.giDrop(slot.item, slot.qty, this.x, this.y));
      }
      if (this.backpack) {
        for (const slot of this.backpack.slots) {
          if (slot) map.groundItems.push(this.giDrop(slot.item, slot.qty, this.x, this.y));
        }
        if (this.backpack.weapon) {
          map.groundItems.push(this.giDrop(this.backpack.weapon, 1, this.x, this.y));
        }
        map.groundItems.push({ item: 'backpack', qty: 1, x: this.x, y: this.y });
      }
    }
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
    this.say(`You were killed by ${cause}. You wake back at the road.`);
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
  // blocks if its tile is solid or too many height levels away. On foot you
  // can step one level; while airborne (jumping) you can clear two, so a
  // jump gets you up onto higher ground and out of a dug pit — where a
  // wheeled robot, which cannot climb at all, stays stuck.
  collides(x, y, map) {
    const h = map.heightAt ? map.heightAt(Math.floor(this.x), Math.floor(this.y)) : 0;
    const maxStep = (this.z > 0 || this.vz !== 0) ? 2 : 1;
    const blocked = (tx, ty) => {
      // The player can swim: water is passable for them (slow and tiring,
      // handled in movement) even though it stays solid for everything else.
      if (map.isSolid(tx, ty) && map.floorAt(tx, ty) !== 'water') return true;
      if (!map.heightAt) return false;
      return Math.abs(map.heightAt(tx, ty) - h) > maxStep;
    };
    return (
      blocked(Math.floor(x - RADIUS), Math.floor(y - RADIUS)) ||
      blocked(Math.floor(x + RADIUS), Math.floor(y - RADIUS)) ||
      blocked(Math.floor(x - RADIUS), Math.floor(y + RADIUS)) ||
      blocked(Math.floor(x + RADIUS), Math.floor(y + RADIUS))
    );
  }
}
