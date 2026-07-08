// Item definitions. Tools live in the hands slot; resources stack in pockets.

export const ITEMS = {
  penknife: {
    name: 'Penknife',
    kind: 'tool',
    tier: 1,
    treeDamage: 1,     // hits per swing against a tree
    animalDamage: 3,
    robotDamage: 1,    // barely scratches the machines
    swingCooldown: 0.5,
    staminaCost: 4,
    color: '#b8412f',
  },
  bat: {
    name: 'Baseball bat',
    kind: 'tool',
    tier: 2,
    treeDamage: 1,
    animalDamage: 5,
    robotDamage: 3,
    swingCooldown: 0.55,
    staminaCost: 5,
    color: '#9a7b4f',
  },
  machete: {
    name: 'Machete',
    kind: 'tool',
    tier: 3,
    treeDamage: 2,
    animalDamage: 7,
    robotDamage: 2,    // blades glance off armour
    swingCooldown: 0.5,
    staminaCost: 4,
    color: '#aab2b8',
  },
  crowbar: {
    name: 'Crowbar',
    kind: 'tool',
    tier: 3,
    treeDamage: 1,
    animalDamage: 4,
    robotDamage: 5,    // the resistance's anti-machine weapon of choice
    swingCooldown: 0.6,
    staminaCost: 5,
    color: '#6a6f7a',
  },
  // Dig pits to trap the wheeled machines: face open ground and use it to
  // sink the tile in front into a steep pit a T1 rolls into and can't climb
  // out of. Also a passable melee weapon.
  shovel: {
    name: 'Shovel',
    kind: 'tool',
    tier: 2,
    treeDamage: 1,
    animalDamage: 4,
    robotDamage: 2,
    swingCooldown: 0.7,
    staminaCost: 6,
    dig: true,
    color: '#7c6a4a',
  },
  // Cuts wood fast and scores more per tree than an improvised blade.
  saw: {
    name: 'Saw',
    kind: 'tool',
    tier: 2,
    treeDamage: 3,
    animalDamage: 3,
    robotDamage: 1,
    sawBonus: 2,       // extra score per felled tree
    swingCooldown: 0.5,
    staminaCost: 4,
    color: '#b0b6bc',
  },
  // Salvaged from a wrecked car: an improvised flail of a weapon.
  seatbelt: {
    name: 'Seatbelt',
    kind: 'tool',
    tier: 1,
    treeDamage: 0,
    animalDamage: 4,
    robotDamage: 1,
    swingCooldown: 0.45,
    staminaCost: 3,
    color: '#4a4640',
  },
  // Silent, super-accurate, long range. Fires arrows.
  bow: {
    name: 'Bow',
    kind: 'gun',
    tier: 3,
    range: 18,
    robotDamage: 9,
    animalDamage: 16,
    ammoType: 'arrow',
    swingCooldown: 0.7,
    staminaCost: 2,
    color: '#8a6a3c',
  },
  arrow: {
    name: 'Arrows',
    kind: 'resource',
    stack: 30, // holds a full cache pickup (24, since v0.60's ammo doubling) in one pocket
    color: '#c9b48a',
  },
  // A cool late-game find: an energy lance that punches clean through
  // anything in a line. Thirsty for batteries.
  railgun: {
    name: 'Railgun',
    kind: 'gun',
    tier: 6,
    range: 10,
    robotDamage: 9,
    animalDamage: 12,
    pierce: true,
    ammoType: 'battery',
    swingCooldown: 1.1,
    staminaCost: 2,
    color: '#7fb0d8',
  },
  // Two-handed and brutal on flesh and light machines alike.
  sledgehammer: {
    name: 'Sledgehammer',
    kind: 'tool',
    tier: 3,
    treeDamage: 1,
    animalDamage: 9,
    robotDamage: 4,
    swingCooldown: 0.9,
    staminaCost: 8,
    color: '#5a5f66',
  },
  // A resistance blade — fast and vicious.
  katana: {
    name: 'Katana',
    kind: 'tool',
    tier: 4,
    treeDamage: 2,
    animalDamage: 11,
    robotDamage: 3,
    swingCooldown: 0.4,
    staminaCost: 4,
    color: '#cdd3d8',
  },
  // Forged from ten scrap (press C): a heavy blade beaten out of machine parts,
  // and it bites the machines hard — the best melee answer to a robot.
  robot_sword: {
    name: 'Robot sword',
    kind: 'tool',
    tier: 4,
    treeDamage: 2,
    animalDamage: 12,
    robotDamage: 9,
    swingCooldown: 0.45,
    staminaCost: 4,
    color: '#b8c0c8',
  },
  scrap: {
    name: 'Scrap',
    kind: 'resource',
    stack: 10,
    color: '#7a7f88',
  },
  // Timed bombs: use (E) while holding one to drop it ticking. It goes off
  // after `fuse` seconds in a cloud of fire, hurting everything in `radius`.
  // The insane bomb is a rare find and can even bring down an obelisk.
  bomb_small: { name: 'Small bomb', kind: 'bomb', stack: 5, fuse: 3, radius: 2.2, damage: 22, color: '#c0552f' },
  bomb_medium: { name: 'Medium bomb', kind: 'bomb', stack: 5, fuse: 3.5, radius: 3.4, damage: 40, color: '#d0552f' },
  bomb_large: { name: 'Large bomb', kind: 'bomb', stack: 5, fuse: 4, radius: 4.8, damage: 70, color: '#e0552f' },
  bomb_insane: { name: 'Insane bomb', kind: 'bomb', stack: 3, fuse: 5, radius: 7, damage: 140, obelisk: true, color: '#ff3010' },
  // Ranged weapons. Guns need ammunition from the pockets: ammoType names
  // the item consumed per shot. effect 'stun' disables a robot for a spell;
  // 'fuse' kills it in place as a mineable wreck.
  stungun: {
    name: 'Stun-gun',
    kind: 'gun',
    tier: 4,
    range: 6,
    effect: 'stun',
    stunTime: 20,
    ammoType: 'battery',
    swingCooldown: 0.8,
    staminaCost: 2,
    color: '#4fc3d8',
  },
  electrogun: {
    name: 'Electro-gun',
    kind: 'gun',
    tier: 5,
    range: 6,
    effect: 'fuse',
    ammoType: 'battery',
    // Self-sufficient: a sealed internal cell worth 4 normal batteries that
    // trickle-charges from a solar film while carried (in hand, pocket, or
    // pack). Each fuse shot spends 5% of a battery; the trickle refills a
    // whole battery over a few minutes, so it recovers on its own between
    // fights and never needs feeding.
    selfCharge: true,
    internalMax: 4,        // in battery-units
    shotCost: 0.05,        // battery-units per shot (~80 shots from full)
    chargeRate: 0.0085,    // battery-units per second while carried (~8min to full)
    swingCooldown: 1.0,
    staminaCost: 2,
    color: '#7f5fd8',
  },
  pistol: {
    name: 'Pistol',
    kind: 'gun',
    tier: 4,
    range: 8,
    robotDamage: 6,
    animalDamage: 8,
    ammoType: 'ammo',
    swingCooldown: 0.5,
    staminaCost: 1,
    color: '#3a3f46',
  },
  shotgun: {
    name: 'Shotgun',
    kind: 'gun',
    tier: 5,
    range: 5,
    robotDamage: 12,
    animalDamage: 14,
    ammoType: 'shells',
    swingCooldown: 0.9,
    staminaCost: 2,
    color: '#5a4632',
  },
  // A rare gadget: held in hand, it jams robot sensors so they can't find
  // you. Runs on charge (10 real minutes); feed it a battery (use key) to
  // top it back up. Held item, so it lives in the hands slot like a weapon.
  wifiblock: {
    name: 'Wi-Fi block',
    kind: 'gadget',
    tier: 4,
    ammoType: 'battery',
    color: '#4fd8c3',
  },
  // Access chip: carried (not held), it's your interface into the obelisk
  // terminals — the RON-DOS console only opens for someone holding one. While
  // you're jacked in, the obelisk masks you: the machines lose you entirely.
  chip: {
    name: 'Access chip',
    kind: 'chip',
    stack: 1,
    color: '#6ad0a0',
  },
  // Chip fragment: a shard of circuitry every destroyed machine sheds.
  // Collect eight and you can craft a whole access chip (press C), so there's
  // always a route to a terminal even without felling a tower.
  chip_fragment: {
    name: 'Chip fragment',
    kind: 'material',
    stack: 64,
    color: '#8fe0c0',
  },
  // Printed map: the RON-ML `print` command runs one off at a terminal and it
  // drops as a physical object you can pick up. Hold it and use it (E / click)
  // to unfold the SKYLINK territory map anywhere, away from a terminal.
  printed_map: {
    name: 'Printed map',
    kind: 'map',
    stack: 1,
    color: '#d8cfa8',
  },
  // Electro-compass: click it (in hand, pocket, or pack) to arm it — once
  // armed and carried, your facing chevron becomes a cluster of homing
  // pointers, one per notable thing nearby, colour-coded (see
  // Player.compassTargets). Stays armed until you drop it. A navigation aid,
  // not a weapon.
  compass: {
    name: 'Electro-compass',
    kind: 'compass',
    tier: 2,
    color: '#8fd0e0',
  },
  // Held defensive gear (kind 'shield'): while it's in your hands a laser
  // coming at you from roughly the front is stopped. A plain shield absorbs
  // it; a mirror shield throws it straight back at whoever fired. Holding one
  // means no weapon in hand, so it's a real choice.
  shield: {
    name: 'Riot shield',
    kind: 'shield',
    tier: 3,
    reflect: false,
    color: '#5a6b7a',
  },
  mirror_shield: {
    name: 'Mirror shield',
    kind: 'shield',
    tier: 5,
    reflect: true,
    color: '#a6dbe6',
  },
  // A rare held gadget: while carried it wraps you in a green energy bubble
  // that nothing — shot or blow — can get through, but it burns a battery a
  // minute. When the cell runs out it pulls another from your kit; with none
  // left the field drops.
  forcefield: {
    name: 'Forcefield',
    kind: 'forcefield',
    tier: 6,
    ammoType: 'battery',
    color: '#4fe08a',
  },
  // Crafted from a stun-gun + electro-gun + Wi-Fi block (press C when you
  // hold all three). Sets an obelisk ablaze; five hits bring one down.
  obgun: {
    name: 'OB-gun',
    kind: 'gun',
    tier: 6,
    range: 7,
    effect: 'burn',
    ammoType: 'battery',
    swingCooldown: 1.2,
    staminaCost: 3,
    stack: 1,
    color: '#e0642f',
  },
  circuit: {
    name: 'Circuit board',
    kind: 'resource',
    stack: 10,
    color: '#3f8f5f',
  },
  // Built from 8 numbered circuit boards (collected from destroyed obelisks).
  // Fires a fan of laser shots that scythe through a whole crowd at once.
  wavegun: {
    name: 'Wave gun',
    kind: 'gun',
    tier: 6,
    range: 9,
    robotDamage: 8,
    animalDamage: 10,
    cone: true,
    ammoType: 'battery',
    swingCooldown: 1.0,
    staminaCost: 2,
    stack: 1,
    color: '#40e0d0',
  },
  // Dropped by a destroyed W-factory. A physical key into one AI's mainframe —
  // the way in for the obelisk terminals / code-hacking to come. Kept even
  // through death would be too strong later, but for now it's a rare trophy.
  ai_key: {
    name: 'AI key',
    kind: 'key',
    stack: 4,
    color: '#e6d24a',
  },
  // Spat out by the fortress gate terminal once you hack it with RON-ML. Its
  // bolts throw the grand doorway in the southern rampart open — the only way
  // into Adamantine's fortress. A one-way trophy; carried, not held.
  fortress_key: {
    name: 'fortress key',
    kind: 'key',
    stack: 1,
    color: '#7fe0ff',
  },
  // Ubik: a battered aerosol can, its label half-worn. Held and used (E / click)
  // it sprays the world back into focus — wherever the mist settles the ground
  // and everything on it goes brighter, warmer, more real, as if the fake had a
  // fake under it and this dissolved the top layer. Five sprays, then dry.
  // (kind 'spray' — routed in Player.useHands to sprayUbik. Charge tracked on
  // the player, not the stack.)
  ubik: {
    name: 'Ubik',
    kind: 'spray',
    stack: 1,
    color: '#e6c93a',
  },
  battery: {
    name: 'Battery',
    kind: 'resource',
    stack: 6,
    color: '#d8c94f',
  },
  // Found rarely, worn once found (see Player.backpack): 16 more general
  // slots plus one dedicated spare-weapon slot. Dropped with everything in
  // it on death.
  backpack: {
    name: 'Backpack',
    kind: 'backpack',
    stack: 1,
    color: '#5a4a32',
  },
  ammo: {
    name: 'Ammo (9mm)',
    kind: 'resource',
    stack: 12,
    color: '#8f8a6a',
  },
  shells: {
    name: 'Shotgun shells',
    kind: 'resource',
    stack: 8,
    color: '#a5493a',
  },
  wood: {
    name: 'Wood',
    kind: 'resource',
    stack: 10,
    color: '#8a6437',
  },
  meat: {
    name: 'Meat',
    kind: 'resource',
    stack: 5,
    color: '#a34545',
    food: 25, // raw; cooking comes later
  },
  tin: {
    name: 'Tinned food',
    kind: 'resource',
    stack: 4,
    color: '#9fa8b0',
    food: 40,
  },
  berries: {
    name: 'Berries',
    kind: 'resource',
    stack: 8,
    color: '#7a3a8a',
    food: 15,
  },
  torch: {
    name: 'Torch',
    kind: 'resource',
    stack: 3,
    color: '#e0a030',
  },
  // Books: read (R) to gain a permanent skill. Knowledge survives death.
  book_wood: {
    name: 'Whittling & Woodcraft',
    kind: 'book',
    stack: 1,
    color: '#7d5a3c',
    skill: 'woodcraft',
    skillText: 'Woodcraft: your blade fells trees in half the swings.',
  },
  book_herbs: {
    name: 'Hedgerow Remedies',
    kind: 'book',
    stack: 1,
    color: '#5d7a3c',
    skill: 'herbalism',
    skillText: 'Herbalism: berries now purge venom and mend you a little.',
  },
  book_track: {
    name: 'Reading the Wild',
    kind: 'book',
    stack: 1,
    color: '#8a4a3a',
    skill: 'tracking',
    skillText: 'Tracking: nearby animals show on your minimap.',
  },
  book_run: {
    name: 'The Long Road',
    kind: 'book',
    stack: 1,
    color: '#4a5a7a',
    skill: 'fleetfoot',
    skillText: 'Fleet foot: sprinting drains far less stamina.',
  },
  // The RON-ML manual and its torn pages: readable like a skill book (kind
  // 'book' so R / walk-onto reads them), but flagged `manual` so they teach
  // the console language instead of a survival skill (Player.learnFromBook).
  book_ronml: {
    name: 'the RON-DOS Operator’s Manual',
    kind: 'book',
    manual: true,
    stack: 1,
    color: '#3fbf6a',
    text: 'The obelisk console runs RON-ML. Verbs: scan (list the wire), nearest (closest of a list), hack a node for its key, crash it with that key, sleep, repel, map, print. Pipe with |> and bind with let … in. At any terminal, type help for the full reference.',
  },
  ronml_page: {
    name: 'a torn page of RON-ML',
    kind: 'book',
    manual: true,
    tip: true,
    stack: 1,
    color: '#b8ac82',
    text: 'A water-stained page from an operator’s manual. One block survives: "scan |> nearest — lists the wire, takes the closest. can’t crash blind: hack first for the key. type help at the console for the rest."',
  },
  // (Cassette tapes are generated from the TAPES manifest below, so a new one
  // is a single numbered entry — see docs/tapes.md.)
};

// ---- cassette tapes (data-driven) -----------------------------------------
// Adding a tape is one entry here: drop its folder under
// assets/audio/Tape-<artist>-<title>/{A,B}, list the track filenames per side,
// and give it the next number. The item key is `tape_<num>` (referenced by the
// walkman starter, the world seeds and the underworld box). Each side's tracks
// play in order and loop; a single-track side just loops. Mirror of docs/tapes.md.
export const TAPES = [
  {
    num: 1, artist: 'meme', title: 'compilation', dir: 'Tape-meme-compilation', color: '#c9a44a',
    a: { label: 'resonance', tracks: ['resonance.mp3'] },
    b: { label: 'eliza · slip', tracks: ['eliza.mp3', 'slip.mp3'] },
  },
  {
    num: 2, artist: 'meme', title: 'maieutics', dir: 'Tape-meme-Maieutics', color: '#9aa45a',
    a: { label: 'maieutics 1 · 2', tracks: ['maieutics 1.mp3', 'maieutics 2.mp3'] },
    b: { label: 'maieutics 3', tracks: ['maieutics 3.mp3'] },
  },
  {
    num: 3, artist: 'WARD', title: 'bare stanhope', dir: 'Tape-WARD-bare-stanhope', color: '#b06a4a',
    a: { label: 'five', tracks: ['01 five.mp3'] },
    b: { label: 'glock', tracks: ['02 glock.mp3'] },
  },
  {
    num: 4, artist: 'Meme', title: 'Versus Xan', dir: 'Tape-Meme-Versus-Xan-24-EP', color: '#7a8fb0',
    a: { label: '24 · High', tracks: ['01-01- 24.mp3', '01-02- High.mp3'] },
    b: { label: 'Release · Världen · Incognito', tracks: ['01-03- Release.mp3', '01-04- Världen.mp3', '01-05- Incognito.mp3'] },
  },
];
for (const t of TAPES) {
  const side = (s) => ({ label: s.label, tracks: s.tracks.map((f) => `assets/audio/${t.dir}/${s === t.a ? 'A' : 'B'}/${f}`) });
  ITEMS[`tape_${t.num}`] = {
    name: `a cassette — ${t.artist}, ${t.title}`,
    kind: 'tape', stack: 1, color: t.color || '#c9a44a',
    artist: t.artist, tapeNum: t.num,
    sideA: side(t.a), sideB: side(t.b),
  };
}

// Each def keeps a self-reference to its own key, so any code holding a
// resolved item (ITEMS[k]) can still look up which icon to draw for it.
// Tools/guns don't stack, but still need stack:1 — stow() falls back to
// pocketing a displaced weapon (e.g. swapping tools with no backpack
// room), and without a stack size that path divides by an undefined and
// leaves the slot with qty: NaN.
for (const k in ITEMS) {
  ITEMS[k].key = k;
  if (ITEMS[k].stack == null) ITEMS[k].stack = 1;
  // A power rating for the weapon chart: damage + reach + special-effect
  // bonuses, capped at 10 for a tidy scale.
  const d = ITEMS[k];
  if ((d.kind === 'tool' || d.kind === 'gun') && d.power == null) {
    let p = Math.max(d.robotDamage || 0, d.animalDamage || 0);
    p += Math.round((d.range || 0) / 3);
    if (d.effect === 'fuse') p += 6;
    if (d.effect === 'stun') p += 4;
    if (d.effect === 'burn') p += 8;
    if (d.pierce) p += 5;
    d.power = Math.max(1, Math.min(10, Math.round(p)));
  }
}

// The weapons, ordered for the chart (roughly weakest to strongest).
export const WEAPON_ORDER = [
  'penknife', 'seatbelt', 'bat', 'shovel', 'saw', 'machete', 'crowbar', 'sledgehammer',
  'bow', 'katana', 'robot_sword', 'pistol', 'stungun', 'shotgun', 'electrogun', 'railgun', 'wavegun', 'obgun',
];
