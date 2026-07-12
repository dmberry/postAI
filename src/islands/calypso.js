// CALYPSO, island one: the current overworld, built as a World (islands Stage 0c,
// docs/islands-plan.md §3). createIsland(seed) runs the whole overworld construction
// that used to sit inline in main.js's boot, and returns a World carrying the entity
// arrays plus the calypso-specific controllers (fortress, wfactory, mainframe, torObjs)
// as named fields for main.js to alias. Moved VERBATIM (same RNG call order) so the
// world is seed-identical to before the extraction; the only change is WORLD_SEED->seed.
// Nothing here touches the player or lore: those, and the player/lore-coupled controllers
// (worldStir, onCoreDefeated), stay in main.js.

import { buildWorld } from '../game/worldgen.js';
import { spawnAnimals } from '../game/animals.js';
import { spawnRobots, spawnW5, spawnM4 } from '../game/robots.js';
import { spawnWaterDroids } from '../game/waterdroids.js';
import { spawnBirds } from '../game/birds.js';
import { placeTors } from '../game/hermes.js';
import { placeRuins } from '../game/ruins.js';
import { stampCoast } from '../engine/coast.js';
import { placeShipParts } from '../game/ships.js';
import { placeBoatYard } from '../game/boatyard.js';
import { createFortress } from '../game/fortress.js';
import { makeRng } from '../game/rng.js';
import { TAPES } from '../game/items.js';
import { createWorld } from '../game/world.js';

export function createIsland(seed) {
  const { map, spawn } = buildWorld(seed);

  const animals = spawnAnimals(map, seed, { x: spawn.x, y: spawn.y, r: 12 });

  // Scatter loot: torches and tinned food in building interiors (night and
  // hunger both push you to scavenge), berries in the tallgrass meadows.
  {
    const rng = makeRng(seed ^ 0x7031);
    const boards = [], tallgrass = [];
    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        const f = map.floorAt(x, y);
        if (f === 'boards') boards.push([x, y]);
        else if (f === 'tallgrass') tallgrass.push([x, y]);
      }
    }
    const drop = (list, item, qty) => {
      if (!list.length) return;
      const [x, y] = list[Math.floor(rng() * list.length)];
      // keep: true — world-placed loot never decays. Only things that appear
      // during play (combat drops, items you drop, loot spilled from an opened
      // box) run the decay timer, so the world isn't stripped bare before you
      // reach it, and a cache still holds its prize whenever you find it.
      map.groundItems.push({ item, qty, x: x + 0.5, y: y + 0.5, keep: true });
    };
    for (let i = 0; i < 12; i++) drop(boards, 'torch', 1);
    // Exactly two anvils on the whole island, both indoors. Good luck.
    drop(boards, 'anvil', 1);
    drop(boards, 'anvil', 1);
    for (let i = 0; i < 14; i++) drop(boards, 'tin', 1);
    for (let i = 0; i < 16; i++) drop(tallgrass, 'berries', 2 + Math.floor(rng() * 2));
    // Books are rarer: one copy of each plus two duplicates, buildings only.
    const books = ['book_wood', 'book_herbs', 'book_track', 'book_run', 'book_herbs', 'book_track'];
    for (const b of books) drop(boards, b, 1);
    // A single backpack, somewhere in the ruins.
    drop(boards, 'backpack', 1);
    // A few more spare backpacks dropped out in the forests, where they're
    // easier to stumble on than deep in the ruins: open grass tiles that sit
    // next to a tree (so they read as "in the woods", not on bare meadow).
    const forestGrass = [];
    for (let y = 1; y < map.h - 1; y++) {
      for (let x = 1; x < map.w - 1; x++) {
        if (map.floorAt(x, y) !== 'grass' || map.objectAt(x, y)) continue;
        let nearTree = false;
        for (let dy = -1; dy <= 1 && !nearTree; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const o = map.objectAt(x + dx, y + dy);
            if (o && o.type === 'tree') { nearTree = true; break; }
          }
        }
        if (nearTree) forestGrass.push([x, y]);
      }
    }
    // Spare backpacks in the forests — SPACED, so two never land in the same
    // grove (a huddle of backpacks reads as a bug, not four finds).
    {
      const bpAt = [];
      for (let i = 0; i < 4 && forestGrass.length; i++) {
        for (let tries = 0; tries < 30; tries++) {
          const [x, y] = forestGrass[Math.floor(rng() * forestGrass.length)];
          if (bpAt.some(([px, py]) => Math.hypot(px - x, py - y) < 18)) continue;
          map.groundItems.push({ item: 'backpack', qty: 1, x: x + 0.5, y: y + 0.5, keep: true });
          bpAt.push([x, y]);
          break;
        }
      }
    }
    // Torn pages of the RON-ML manual, scattered — mostly in the ruins, a couple
    // out in the woods — as loose scraps that echo the bound manual in the caches.
    for (let i = 0; i < 4; i++) drop(boards, 'ronml_page', 1);
    // Fortress-map fragments: quarters of a ZEUS-era survey, scattered hard and
    // WIDE (ruins, woods, meadows) so assembling the set (5, press C) means really
    // exploring. Seven placed, a little slack against an unlucky drop.
    for (let i = 0; i < 3; i++) drop(boards, 'fortress_map_fragment', 1);
    for (let i = 0; i < 2; i++) drop(forestGrass, 'fortress_map_fragment', 1);
    // Large stones out in the wilds — same absurd weight as the anvil.
    // (Placed HERE, after forestGrass/tallgrass exist: seeding them beside the
    // anvils above threw a TDZ error at module load and blanked the whole game.)
    drop(forestGrass, 'large_stone', 1);
    drop(forestGrass, 'large_stone', 1);
    drop(tallgrass, 'large_stone', 1);
    for (let i = 0; i < 2; i++) drop(tallgrass, 'fortress_map_fragment', 1);
    for (let i = 0; i < 2; i++) drop(forestGrass, 'ronml_page', 1);
    // Cassette tapes for the walkman. Every tape EXCEPT the WARD "bear stanhope"
    // one is scattered in the overworld ruins, two copies each (one in a building,
    // one out in the forest) so a lost tape is always recoverable. WARD is the
    // Backspace's own — it turns up only down there (see underworld.js).
    for (const t of TAPES) {
      if (t.num === 3) continue; // WARD: Backspace only
      drop(boards, `tape_${t.num}`, 1);
      drop(forestGrass, `tape_${t.num}`, 1);
    }
  }

  // The AIs control the landscape: black obelisk towers dot the wilds (their
  // signal network; destructible in a later phase), each garrisoned by
  // T-class hunter robots. The resistance hides weapon caches in buildings.
  const obelisks = [];
  {
    const rng = makeRng(seed ^ 0x0b31);
    let guard = 0;
    while (obelisks.length < 12 && guard++ < 5000) {
      const x = 4 + Math.floor(rng() * (map.w - 8));
      const y = 4 + Math.floor(rng() * (map.h - 8));
      const f = map.floorAt(x, y);
      if ((f !== 'grass' && f !== 'tallgrass') || map.objectAt(x, y)) continue;
      if (Math.hypot(x - spawn.x, y - spawn.y) < 16) continue;
      if (obelisks.some((o) => Math.hypot(o.x - x, o.y - y) < 14)) continue;
      // OB classes: exactly ONE tower in the world is the SIREN — a singular,
      // teal-lit landmark whose song pulls you in up close (see the obelisk loop
      // below). The first obelisk placed is it; every other is standard.
      const cls = obelisks.length === 0 ? 'siren' : undefined;
      map.addObject('obelisk', x, y, { cls });
      obelisks.push({ x, y });
    }

    // Resistance caches: searchable boxes on interior tiles (never doorways:
    // all four neighbours must be boards too).
    const inner = [];
    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        if (map.floorAt(x, y) !== 'boards' || map.objectAt(x, y)) continue;
        if (map.floorAt(x + 1, y) === 'boards' && map.floorAt(x - 1, y) === 'boards'
          && map.floorAt(x, y + 1) === 'boards' && map.floorAt(x, y - 1) === 'boards') {
          inner.push([x, y]);
        }
      }
    }
    // Group interior tiles by connected board region — one per house/room in
    // practice, since a doorway gap always breaks the 4-connectivity between
    // buildings — so no single building can be flooded with every cache in
    // reach: capped at BOXES_PER_HOUSE below.
    const BOXES_PER_HOUSE = 5;
    const houseOf = new Map(); // "x,y" -> house index
    {
      const innerSet = new Set(inner.map(([x, y]) => `${x},${y}`));
      let houseId = 0;
      for (const [sx, sy] of inner) {
        const key0 = `${sx},${sy}`;
        if (houseOf.has(key0)) continue;
        const stack = [[sx, sy]];
        houseOf.set(key0, houseId);
        while (stack.length) {
          const [cx, cy] = stack.pop();
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nk = `${cx + dx},${cy + dy}`;
            if (innerSet.has(nk) && !houseOf.has(nk)) {
              houseOf.set(nk, houseId);
              stack.push([cx + dx, cy + dy]);
            }
          }
        }
        houseId++;
      }
    }
    const houseBoxCount = new Map(); // house index -> boxes placed so far
    const bumpHouse = (x, y) => {
      const h = houseOf.get(`${x},${y}`);
      houseBoxCount.set(h, (houseBoxCount.get(h) || 0) + 1);
    };
    const houseFull = (x, y) => (houseBoxCount.get(houseOf.get(`${x},${y}`)) || 0) >= BOXES_PER_HOUSE;
    // A hand-picked "welcome kit": the resistance building nearest spawn gets
    // a backpack, a shield, a decent ranged weapon and some food together in
    // one box, so a new run's very first find is worth a detour for. It's the
    // one box the renderer nudges a beginner toward with a pulsing glow (see
    // drawBox / Player.threatEase) — the glow fades on its own once the
    // player no longer reads as a beginner.
    if (inner.length) {
      inner.sort((a, b) => Math.hypot(a[0] - spawn.x, a[1] - spawn.y) - Math.hypot(b[0] - spawn.x, b[1] - spawn.y));
      const [sx, sy] = inner.shift();
      bumpHouse(sx, sy);
      const starterLoot = [
        { item: 'backpack', qty: 1 },
        { item: 'shield', qty: 1 },
        { item: 'shotgun', qty: 1 }, { item: 'shells', qty: 8 },
        { item: 'tin', qty: 2 }, { item: 'berries', qty: 3 },
      ];
      map.addObject('box', sx, sy, { loot: starterLoot, opened: false, starterCache: true });
    }
    // Each cache holds a list of drops. The first few are guaranteed so every
    // run can find the key anti-machine gear; the rest roll on a table.
    // Ammo/battery quantities doubled from their original defaults — the
    // railgun (batteries) and other guns were running dry far too fast.
    const guaranteed = [
      [{ item: 'stungun', qty: 1 }, { item: 'battery', qty: 4 }],
      [{ item: 'pistol', qty: 1 }, { item: 'ammo', qty: 12 }],
      [{ item: 'electrogun', qty: 1 }, { item: 'battery', qty: 2 }],
      [{ item: 'shotgun', qty: 1 }, { item: 'shells', qty: 8 }],
      [{ item: 'crowbar', qty: 1 }],
      [{ item: 'battery', qty: 4 }],
      // Exactly one Wi-Fi block per world: rare, in a random guaranteed cache.
      [{ item: 'wifiblock', qty: 1 }, { item: 'battery', qty: 4 }],
      // A shovel for digging robot traps.
      [{ item: 'shovel', qty: 1 }],
      // A saw: fells trees fast and scores more per tree.
      [{ item: 'saw', qty: 1 }],
      // Demolition caches: a couple of bombs to get you started.
      [{ item: 'bomb_small', qty: 1 }, { item: 'bomb_small', qty: 1 }],
      [{ item: 'bomb_medium', qty: 1 }],
      // Late-game weapons: previously defined in ITEMS but never actually
      // placed anywhere in the world, so they were unobtainable in play.
      [{ item: 'bow', qty: 1 }, { item: 'arrow', qty: 24 }],
      [{ item: 'katana', qty: 1 }],
      [{ item: 'sledgehammer', qty: 1 }],
      [{ item: 'railgun', qty: 1 }, { item: 'battery', qty: 14 }],
      // Every remaining tool/weapon in ITEMS gets at least one guaranteed
      // spawn too — except the wave gun and OB-gun, which stay crafting-only.
      [{ item: 'penknife', qty: 1 }],
      [{ item: 'seatbelt', qty: 1 }],
      [{ item: 'bat', qty: 1 }],
      [{ item: 'machete', qty: 1 }],
      // Defensive gear: a plain riot shield (common-ish), a rarer mirror shield
      // that reflects lasers, and a single very rare forcefield with a few
      // cells to run it.
      [{ item: 'shield', qty: 1 }],
      [{ item: 'mirror_shield', qty: 1 }, { item: 'battery', qty: 2 }],
      [{ item: 'forcefield', qty: 1 }, { item: 'battery', qty: 4 }],
      // A navigation aid: the electro-compass.
      [{ item: 'compass', qty: 1 }],
      // The access chip: your interface into the obelisk terminals.
      [{ item: 'chip', qty: 1 }],
      // The RON-ML manual: teaches the terminal console language.
      [{ item: 'book_ronml', qty: 1 }],
      // A single battered can of Ubik, somewhere in the ruins.
      [{ item: 'ubik', qty: 1 }],
    ];
    const rollLoot = () => {
      const r = rng();
      if (r < 0.28) {
        const MELEE = ['crowbar', 'bat', 'machete', 'crowbar'];
        return [{ item: MELEE[Math.floor(rng() * MELEE.length)], qty: 1 }];
      }
      if (r < 0.58) {
        const AMMO = [
          [{ item: 'battery', qty: 4 }],
          [{ item: 'ammo', qty: 12 }],
          [{ item: 'shells', qty: 8 }],
        ];
        return AMMO[Math.floor(rng() * AMMO.length)];
      }
      // Bombs: small/medium common, large uncommon, insane a rare find.
      if (r < 0.80) {
        const br = rng();
        const bomb = br < 0.45 ? 'bomb_small' : br < 0.78 ? 'bomb_medium' : br < 0.97 ? 'bomb_large' : 'bomb_insane';
        return [{ item: bomb, qty: 1 }];
      }
      return rng() < 0.5 ? [{ item: 'tin', qty: 1 }] : [{ item: 'torch', qty: 1 }];
    };
    // At least as many boxes as guaranteed drops, plus a healthy handful left
    // over to roll on the random table.
    const boxCount = Math.max(20, guaranteed.length + 9);
    for (let i = 0; i < boxCount && inner.length; i++) {
      // Pick uniformly among tiles whose house hasn't hit BOXES_PER_HOUSE yet;
      // stop placing early if every remaining house is already full.
      const eligible = [];
      for (let k = 0; k < inner.length; k++) if (!houseFull(inner[k][0], inner[k][1])) eligible.push(k);
      if (!eligible.length) break;
      const pick = eligible[Math.floor(rng() * eligible.length)];
      const [x, y] = inner.splice(pick, 1)[0];
      bumpHouse(x, y);
      const loot = i < guaranteed.length ? guaranteed[i] : rollLoot();
      map.addObject('box', x, y, { loot, opened: false });
    }
    // A chip is the only way into a terminal, so the world must always contain
    // one in a box — even if interior tiles ran short before the chip's
    // guaranteed cache (late in the list) was placed. Backstop it here.
    const boxes = map.objects.filter((o) => o.type === 'box');
    if (boxes.length && !boxes.some((b) => (b.loot || []).some((l) => l.item === 'chip'))) {
      const b = boxes[Math.floor(rng() * boxes.length)];
      (b.loot ??= []).push({ item: 'chip', qty: 1 });
    }
  }

  // The W-factory: the AI's foundry for repair drones. It never attacks on
  // its own, but every so often — while any obelisk is damaged but not yet
  // toppled — it fields a W3 to go and mend one.
  let wfactory = null;
  {
    const rng = makeRng(seed ^ 0x5a11c0de);
    const FW = 8, FH = 8;               // a big 8x8 industrial structure
    const FACTORY_HP = 420;             // takes a long, committed assault to bring down
    let guard = 0;
    while (!wfactory && guard++ < 8000) {
      const x = 4 + Math.floor(rng() * (map.w - FW - 8));
      const y = 4 + Math.floor(rng() * (map.h - FH - 8));
      // The whole 8x8 footprint must be clear, flat, grassy ground.
      let ok = true;
      for (let dy = 0; dy < FH && ok; dy++) {
        for (let dx = 0; dx < FW; dx++) {
          const f = map.floorAt(x + dx, y + dy);
          if ((f !== 'grass' && f !== 'tallgrass') || map.objectAt(x + dx, y + dy)
            || (map.heightAt && map.heightAt(x + dx, y + dy) !== 0)) { ok = false; break; }
        }
      }
      if (!ok) continue;
      if (Math.hypot(x + FW / 2 - spawn.x, y + FH / 2 - spawn.y) < 26) continue;
      const footprint = [];
      for (let dy = 0; dy < FH; dy++) for (let dx = 0; dx < FW; dx++) footprint.push({ x: x + dx, y: y + dy });
      wfactory = map.addObject('wfactory', x, y, { fw: FW, fh: FH, footprint, hp: FACTORY_HP, maxHp: FACTORY_HP });
      // Every footprint tile points back at the one factory object, so it's
      // solid across its whole 8x8 and a hit anywhere on it counts.
      for (const t of footprint) map.objectGrid[t.y * map.w + t.x] = wfactory;
    }
  }

  const robots = spawnRobots(map, seed, obelisks, { x: spawn.x, y: spawn.y, r: 14 });

  // A couple of gardener drones already out wandering the world at the start, at
  // random spots away from the remote factory, so you actually come across one
  // early instead of it only ever spawning at the (distant) factory. The factory
  // clock below keeps roughly this many topped up over time.
  for (let placed = 0, tries = 0; placed < 2 && tries < 120; tries++) {
    const gx = 6 + Math.floor(Math.random() * (map.w - 12));
    const gy = 6 + Math.floor(Math.random() * (map.h - 12));
    const g = spawnW5(map, (seed ^ (0x5ad + placed * 131)) >>> 0, gx, gy);
    if (g) { robots.push(g); placed++; }
  }
  const waterdroids = spawnWaterDroids(map, seed);
  // The tower objects themselves (for alert/blink state): {x,y} plus the
  // alert level cannot live on the plain {x,y} obelisks list, since that's
  // shared with spawnRobots as a read-only anchor list.
  const obeliskObjs = obelisks.map((o) => map.objectAt(o.x, o.y)).filter(Boolean);
  for (const ob of obeliskObjs) {
    ob.alert = 0; ob.blinkFlash = 0; ob._blinkT = 2 + Math.random() * 5; ob._nudgeT = 0;
    // A hex code name identifying this tower, so the kill record can list it.
    ob.code = 'OB-' + ((ob.x * 4096 + ob.y * 31) & 0xffff).toString(16).toUpperCase().padStart(4, '0');
  }
  // RON's hilltop TOR relays — the friendly HERMES terminals, the counter-system
  // to the AI obelisks. Placed on the summits (see placeTors); their objects live
  // in the map grid, and torObjs holds them for click detection.
  const torPlacements = placeTors(map, makeRng(seed ^ 0x40b1e5), { spawn, count: 4 });
  const torObjs = torPlacements.map((t) => map.objectAt(t.x, t.y)).filter(Boolean);

  // Every obelisk is assigned one of the eight circuit-board numbers, spread
  // round-robin then shuffled, so destroying towers always guarantees full
  // coverage of 1-8 (rather than random drops that could dupe forever).
  {
    const rng = makeRng(seed ^ 0xc1c0de);
    const nums = obeliskObjs.map((_, i) => (i % 8) + 1);
    for (let i = nums.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [nums[i], nums[j]] = [nums[j], nums[i]];
    }
    obeliskObjs.forEach((ob, i) => { ob.circuitNum = nums[i]; });
  }

  // ZEUS's fortress — one of the four AI daemons. Grown as a sealed annex onto the
  // south edge of the map (all overworld spawning above has already happened on
  // the 128x128 grid, so the annex stays clean). Reached only by hacking the
  // boundary gate terminal in RON-ML. `mainframe` points at the core so the
  // existing map overlay marks it; `fortress` owns the gate/door logic. (fortress.js
  // now names the AI ZEUS at source, so no override is needed here.)
  const fortress = createFortress(map, seed, spawn, { aiName: 'CALYPSO' });
  const mainframe = fortress.core; // { x, y } of the core, for the RON-ML map star
  // Ring the island in sea: stamp a dithered sand+water coast into the border
  // tiles now that the towers, relays and fortress are placed (so it leaves them
  // standing). Beyond the outer water band the map edge is still the hard bound,
  // with the open ocean drawn past it.
  stampCoast(map, spawn);
  // Ruined marble columns: a few groves of fallen temple columns strewn across
  // the island, after the coast so none land in the sea.
  // Grove centres are kept: standing among the old stones heals you faster
  // (player.js TEMPLE_HEAL_R / TEMPLE_HEAL_MULT reads map.temples).
  map.temples = placeRuins(map, makeRng(seed ^ 0x2c01dd), { spawn, clusters: 4 });
  // Ship parts for the greek-ship craft: a boat-builder's yard on the shore
  // (jetty + ruined boat-house + loot boxes holding oar/rope/sail + salvage).
  // Falls back to the old scattered placement (sail at a wreck, oar/rope in huts)
  // if no shore site is found, so the parts can never be unobtainable. After the
  // coast so shore tiles exist. (src/game/boatyard.js, src/game/ships.js)
  if (!placeBoatYard(map, seed, spawn)) placeShipParts(map, seed, spawn);
  // The dormant fortress's only garrison: one or two light M4 report drones on
  // the quad. Sneak past them; if one holds you in sight the breach reports and
  // the core spits out its M6 pack + M5 snipers (worldStir.spawnWave below).
  robots.push(...fortress.spawnGuards(spawnM4));

  const birds = spawnBirds(map, seed);
  const world = createWorld('calypso', {
    map, spawn, robots, animals, birds, waterdroids, obelisks, obeliskObjs,
    obColor: '#232a46', obAlertColor: '#4b5cc4', // Ogygia: kalyptō — indigo at rest, brightening on alert (R1)
    combat: true, // a martial island: main.js runs the full combat/fortress/obelisk loop here
  });
  // calypso-specific controllers, aliased by name in main.js (its ~60 runtime sites use these names).
  world.fortress = fortress;
  world.wfactory = wfactory;
  world.mainframe = mainframe;
  world.torObjs = torObjs;
  return world;
}
