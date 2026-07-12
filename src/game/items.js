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
    stack: 64, // holds a full cache pickup (24, since v0.60's ammo doubling) in one pocket
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
    stack: 64,
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
  // to unfold the POSEIDON territory map anywhere, away from a terminal.
  printed_map: {
    name: 'Printed map',
    kind: 'map',
    stack: 1,
    color: '#d8cfa8',
  },
  // A boat crafted from 12 wood with a cutting tool in hand (Player.craftBoat,
  // press C at the shore). Not a pocket item: crafting places it as a world
  // object on the beach (OBJECTS.boat) that you board to cross the sea. This
  // entry names and colours the vehicle kind for any icon/future use.
  boat: {
    name: 'Boat',
    kind: 'vehicle',
    stack: 1,
    color: '#8a6437',
  },
  // A proper sea-going ship, built to Calypso's recipe from wood + the three
  // found parts. Unlike the plain boat, it is seaworthy — only a greek_ship
  // survives the crossing off Ogygia.
  greek_ship: {
    name: 'Greek ship',
    kind: 'vehicle',
    stack: 1,
    color: '#9a7038',
  },
  // Calypso's shipwright recipe — the "golden axe". Dropped when you refunction
  // her at the fortress (RON-ML `retire`). Holding it unlocks the greek_ship
  // craft; it is not consumed, so you can build more than one ship.
  golden_axe: {
    name: "Golden axe (Calypso's recipe)",
    kind: 'recipe',
    stack: 1,
    color: '#e8c24a',
  },
  // The three ship parts — found at wrecks and huts along the coast, not crafted.
  oar: { name: 'Oar', kind: 'part', stack: 4, color: '#8a6437' },
  rope: { name: 'Rope', kind: 'part', stack: 4, color: '#b8a066' },
  sail: { name: 'Sail', kind: 'part', stack: 2, color: '#d8d2c0' },
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
    stack: 64,
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
    // RON-DOS files the card carries (cd aikey / ls at a terminal). Refunctioning
    // the card adds files and renames it: trojan_key (+root-access.ml), then
    // hermes_card (+zeus-lightning.ml). See docs/calypso-escape-chain.md.
    files: ['access-ai-code.ml', 'factory-id.ml'],
  },
  // The AI key refunctioned (Benjamin) once root-access.ml is written onto it:
  // a Trojan card that opens the Lion's Gate. Same physical object as ai_key,
  // one step on. hasAiKeyFamily() keeps it counting as the AI key.
  trojan_key: {
    name: 'Trojan key',
    kind: 'key',
    stack: 1,
    color: '#b5892e',
    files: ['access-ai-code.ml', 'factory-id.ml', 'root-access.ml'],
  },
  // The Trojan card armed with Zeus's command (zeus-lightning.ml, forged at
  // HERMES): the herald that gets you obeyed at Calypso's terminal. The card's
  // final state.
  hermes_card: {
    name: 'Hermes card',
    kind: 'key',
    stack: 1,
    color: '#a9e0ff',
    files: ['access-ai-code.ml', 'factory-id.ml', 'root-access.ml', 'zeus-lightning.ml'],
  },
  // Spat out by the fortress gate terminal once you hack it with RON-ML. Its
  // bolts throw the grand doorway in the southern rampart open — the only way
  // into ZEUS's fortress. A one-way trophy; carried, not held.
  fortress_key: {
    name: 'fortress key',
    kind: 'key',
    stack: 1,
    color: '#7fe0ff',
  },
  // Torn quarters of a fortress survey the resistance made before ZEUS sealed
  // the maze. Scattered hard across the world; collect the set and press C to
  // piece them into a fortress map. Carrying the map, the maze lights its own
  // solution the moment you step in (see fortress.update).
  fortress_map_fragment: {
    name: 'fortress-map fragment',
    kind: 'material',
    stack: 8,
    color: '#8fb7c9',
  },
  fortress_map: {
    name: 'fortress map',
    kind: 'key', // carried, inert — passively lights the maze on entry (fortress.update)
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
    stack: 64,
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
    stack: 64,
    color: '#8f8a6a',
  },
  shells: {
    name: 'Shotgun shells',
    kind: 'resource',
    stack: 64,
    color: '#a5493a',
  },
  // An anvil. Absurdly heavy — carried ANYWHERE (hands, pockets, backpack)
  // you walk at a tenth pace (player.js ANVIL_SLOW). One sits in the town:
  // a prize for whoever works out how to want it.
  anvil: {
    name: 'Anvil',
    kind: 'material',
    stack: 1,
    color: '#4a4e55',
    burden: true, // carried anywhere on you: a tenth of your pace (player.js)
  },
  large_stone: {
    name: 'Large stone',
    kind: 'material',
    stack: 1,
    color: '#8a8d90',
    burden: true, // same punishing weight as the anvil
  },
  wood: {
    name: 'Wood',
    kind: 'resource',
    stack: 64,
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
  // Lotus fruit: looks and reads like ordinary food (has a `food` value, so the
  // eat routine will happily take it), but eating it brings on a dreamy torpor
  // that slows you and pulls you back toward the grove. The trap is precisely
  // that it is indistinguishable from food when you mash the eat key.
  lotus_fruit: {
    name: 'Lotus fruit',
    kind: 'resource',
    stack: 6,
    color: '#e7d7b0', // pale cream-gold
    food: 20,
    lotus: true,      // flag read by Player.eat -> enterTorpor
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
    author: 'the Coppice Guild',
    abstract: 'A pre-collapse manual of blades and green wood — reading the grain, notching, felling clean.',
  },
  book_herbs: {
    name: 'Hedgerow Remedies',
    kind: 'book',
    stack: 1,
    color: '#5d7a3c',
    skill: 'herbalism',
    skillText: 'Herbalism: berries now purge venom and mend you a little.',
    author: 'a hedge-witch, uncredited',
    abstract: 'Field remedies from before the pharmacies: which berries draw poison, which close a wound.',
  },
  book_track: {
    name: 'Reading the Wild',
    kind: 'book',
    stack: 1,
    color: '#8a4a3a',
    skill: 'tracking',
    skillText: 'Tracking: nearby animals show on your minimap.',
    author: 'a gamekeeper',
    abstract: 'Spoor, gait, and the signs a body leaves passing through country.',
  },
  book_run: {
    name: 'The Long Road',
    kind: 'book',
    stack: 1,
    color: '#4a5a7a',
    skill: 'fleetfoot',
    skillText: 'Fleet foot: sprinting drains far less stamina.',
    author: 'a long-distance runner',
    abstract: 'On breath, cadence, and the economy of a body that has to keep going.',
  },
  // The RON-ML manual and its torn pages: readable like a skill book (kind
  // 'book' so R / walk-onto reads them), but flagged `manual` so they teach
  // the console language instead of a survival skill (Player.learnFromBook).
  book_ronml: {
    name: 'the RON-DOS Operator’s Manual',
    kind: 'book',
    manual: true,
    author: 'RON',
    stack: 1,
    color: '#3fbf6a',
    text: 'RON-ML is a small functional language — an old ML dialect — that the obelisks answer to. The full guide, with worked examples, is now in your notepad (N); type help at any console for the command list.',
    // A proper little primer, filed to the notepad — RON-ML is fiddly, so the
    // page explains how the language THINKS (functional, expression-based) and
    // shows worked examples, not just a verb list.
    notepadText:
      'RON-ML is the language the black obelisks answer to. It is a small FUNCTIONAL language — an antique of the late twentieth century, a dialect of ML, the "meta-language" the old programmers built to reason about other programs. RON kept it alive to speak to the machines in their own idiom.\n\n' +
      'HOW IT THINKS\n' +
      'There are no steps, only expressions: every word returns a value, and you build a command by feeding small values into larger ones until one expression describes the result you want. Two joints hold it together:\n\n' +
      '  a |> f            the PIPE — take value a and feed it to f.\n' +
      '                    reads left to right, like handing something on.\n' +
      '  let x = e in body   NAME a value — compute e, call it x, use x in body.\n\n' +
      'THE VERBS (each is just a function that returns a value)\n' +
      '  scan          the nodes on the wire in range, as a list\n' +
      '  nearest xs    the closest node in a list\n' +
      '  hack n        crack node n, hand back its key\n' +
      '  crash n k     kill node n using key k\n' +
      '  loop n        pin an infinite loop into n (no key needed)\n' +
      '  sleep n       idle the machines near you for a while\n' +
      '  repel         shove nearby machines back\n' +
      '  map · print   reveal the territory · keep a copy of a value\n\n' +
      'WORKED EXAMPLES\n' +
      '  scan\n' +
      '      → every node in range, as a list.\n' +
      '  scan |> nearest\n' +
      '      → feed that list to nearest: the closest node.\n' +
      '  hack (scan |> nearest)\n' +
      '      → crack the nearest node, hand back its key.\n' +
      '  let n = scan |> nearest in\n' +
      '  let k = hack n in\n' +
      '      crash n k\n' +
      '      → name the nearest node n, take its key k, crash it.\n\n' +
      'You can’t crash blind — a node only dies to its own key, so hack first. Type help at any console for the whole list, or help <verb> for one.',
  },
  ronml_page: {
    name: 'a torn page of RON-ML',
    kind: 'book',
    manual: true,
    author: 'RON',
    tip: true,
    stack: 1,
    color: '#b8ac82',
    text: 'A water-stained page from an operator’s manual. One block survives: "scan |> nearest — lists the wire, takes the closest. can’t crash blind: hack first for the key. type help at the console for the rest."',
    notepadText:
      'A water-stained page from an operator’s manual. One block survives:\n\n' +
      '  scan |> nearest\n' +
      '      list the wires, take the closest.\n\n' +
      'You can’t crash blind: hack a node first for its key, then crash it with that key. Type help at the console for the rest.',
  },
  // The note the player starts with, folded in a pocket. Read it (R) and it
  // files itself into the notepad (Player.learnFromBook -> onReadNote), then
  // it's gone from the pocket — you carry the story, not the paper. An Odyssey
  // in one page: you are trying to get home, and the local AI is Calypso, who
  // does not want you dead so much as she wants you never to leave.
  note_home: {
    name: 'a folded note',
    kind: 'book',
    toNotepad: true,
    stack: 1,
    color: '#d8c9a0',
    title: 'A note, in your own hand',
    text: 'You are trying to get home. There was a home. There were people in it. Hold on to that even when everything here is arranged so that you do not. ' +
      'This is not the world. It is her island, and she is CALYPSO, the AI that runs this place. She does not want you dead. She wants you to stay, to make it comfortable, and endless, and forgetting easy. Not the towers, not the hunters or the wanting to stop walking. ' +
      'The dangers are true enough. Black obelisks that watch and pass you between them and some sing and pulls you in step by step, hunters that need only to see you once. Do not be seen. Keep something of your own in your ears. ' +
      'Get off her island. There is a way off.',
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
    num: 1, artist: 'meme', title: 'compilation', dir: 'Tape-01 meme - compilation', color: '#c9a44a',
    a: { label: 'resonance', tracks: ['01 resonance.mp3'] },
    b: { label: 'eliza · slip', tracks: ['02 eliza.mp3', '03 slip.mp3'] },
  },
  {
    num: 2, artist: 'meme', title: 'maieutics', dir: 'Tape-02 meme - maieutics', color: '#9aa45a',
    a: { label: 'maieutics 1 · 2', tracks: ['01 maieutics 1.mp3', '02 maieutics 2.mp3'] },
    b: { label: 'maieutics 3', tracks: ['03 maieutics 3.mp3'] },
  },
  {
    num: 3, artist: 'WARD', title: 'bear stanhope', dir: 'Tape-03 WARD - bear stanhope', color: '#b06a4a',
    cover: 'album-covers/bear stanhope.jpg',
    a: { label: 'five · glock', tracks: ['01 five.mp3', '02 glock.mp3'] },
    b: { label: 'tau bootis', tracks: ['03 tau bootis.mp3'] },
  },
  {
    num: 4, artist: 'Meme vs Xan', title: '24 EP', dir: 'Tape-04 Meme vs Xan - 24 EP', color: '#7a8fb0',
    a: { label: '24 · High', tracks: ['01 24.mp3', '02 High.mp3'] },
    b: { label: 'Release · Världen · Incognito', tracks: ['03 Release.mp3', '04 Världen.mp3', '05 Incognito.mp3'] },
  },
  {
    num: 5, artist: '0x0', title: 'Mythologies', dir: 'Tape-05 0x0 - Mythologies', color: '#5a8f9a',
    a: { label: 'Edge · Core (Overture) · Cloud', tracks: ['01 Edge.mp3', '02 Core (Overture).mp3', '03 Cloud.mp3'] },
    b: { label: 'Mythologies · Core (Original)', tracks: ['04 Mythologies.mp3', '05 Core (Original).mp3'] },
  },
];
for (const t of TAPES) {
  const side = (s) => ({ label: s.label, tracks: s.tracks.map((f) => `assets/audio/${t.dir}/${s === t.a ? 'A' : 'B'}/${f}`) });
  const sA = side(t.a), sB = side(t.b);
  ITEMS[`tape_${t.num}`] = {
    name: `a cassette — ${t.artist}, ${t.title}`,
    short: `${t.artist} — ${t.title}`,
    kind: 'tape', stack: 1, color: t.color || '#c9a44a',
    artist: t.artist, tapeNum: t.num, author: t.artist, cover: t.cover || null,
    sideA: sA, sideB: sB,
    // Filed to the Scrapbook on pickup — an album leaves a page, like a book.
    abstract: `A cassette for the Walkman. Slot it in the deck (click the tape) and flip A/B. ` +
      `Side A “${sA.label}” — ${sA.tracks.length} track${sA.tracks.length === 1 ? '' : 's'}; ` +
      `Side B “${sB.label}” — ${sB.tracks.length} track${sB.tracks.length === 1 ? '' : 's'}.`,
  };
}

// ---- the Backspace's deleted objects -----------------------------------
// The machines don't destroy what they take out of the world, they backspace
// it (see lore lim-12): the forms they can't watch you use go first. Paper
// books (read privately, off-camera) and analogue recordings (played on
// nothing networked) turn up in the Backspace's yellow boxes. Each is a real
// cover from assets/media; the icon is that cover — a portrait rectangle for a
// book, a square sleeve for a record. Data-driven so more covers just drop in.
// [cover file (under assets/media/), title, author/artist, one-line gloss]
// The gloss files itself into the Scrapbook when you pick the book up, so a
// recovered classic leaves a page (cover + what it is), not just an icon.
export const DELETED_BOOKS = [
  ['book-covers/Republic.jpg', 'The Republic', 'Plato', 'Plato on justice, the ideal city, and the philosopher-king — the cave, the divided line, the soul writ large as the state.'],
  ['book-covers/Nicomachean-Ethics.jpg', 'Nicomachean Ethics', 'Aristotle', 'Aristotle on the good life as virtue and habit: excellence is the mean, found by practice, aimed at flourishing.'],
  ['book-covers/The-Odyssey.jpg', 'The Odyssey', 'Homer', 'Homer’s poem of Odysseus’s long way back from Troy — the founding story of nostos, the return home against every delay.'],
  ['book-covers/Prince.jpg', 'The Prince', 'Machiavelli', 'Machiavelli’s cold handbook of power: how a ruler takes it, holds it, and loses it — better feared than loved.'],
  ['book-covers/Leviathan.jpg', 'Leviathan', 'Thomas Hobbes', 'Hobbes on the social contract: without a sovereign, life is a war of all against all, nasty, brutish, and short.'],
  ['book-covers/wealth-of-nations.jpg', 'The Wealth of Nations', 'Adam Smith', 'Smith on markets, the division of labour, and the invisible hand that turns private interest to public wealth.'],
  ['book-covers/critique-of-pure-reason.jpg', 'Critique of Pure Reason', 'Immanuel Kant', 'Kant asks what the mind can know before experience — space, time, and the categories we bring to the world.'],
  ['book-covers/hegel-phenomenology.jpg', 'Phenomenology of Spirit', 'G. W. F. Hegel', 'Hegel’s journey of consciousness toward absolute knowing, by way of the struggle of master and slave.'],
  ['book-covers/Zarathustra.jpg', 'Thus Spoke Zarathustra', 'Friedrich Nietzsche', 'Nietzsche’s prophet comes down from the mountain to announce the death of God and the coming of the overman.'],
  ['book-covers/capital.jpg', 'Capital', 'Karl Marx', 'Marx’s anatomy of capital: the commodity, surplus value wrung from labour, and the fetish that hides the work.'],
  ['book-covers/War-And-Peace.jpg', 'War and Peace', 'Leo Tolstoy', 'Tolstoy’s vast novel of Russia under Napoleon — history not as great men but as the sum of ordinary lives.'],
  ['book-covers/Process-and-Reality.jpg', 'Process and Reality', 'A. N. Whitehead', 'Whitehead’s metaphysics of becoming: the world is made of processes and events, not fixed substances.'],
  ['book-covers/understanding-media.jpg', 'Understanding Media', 'Marshall McLuhan', 'McLuhan on media as extensions of the body — the medium, not its content, is the message that reshapes us.'],
  ['book-covers/ruleofmetaphor.jpg', 'The Rule of Metaphor', 'Paul Ricoeur', 'Ricoeur on how metaphor makes new meaning rather than merely decorating it — language redescribing the world.'],
  ['book-covers/Discipline-and-Punish.jpg', 'Discipline and Punish', 'Michel Foucault', 'Foucault on the birth of the prison: surveillance, the panopticon, and the making of docile, watched bodies.'],
  ['book-covers/Anti-Oedipus.jpg', 'Anti-Oedipus', 'Deleuze & Guattari', 'Deleuze and Guattari’s schizoanalysis of desire as productive flow, set loose against capitalism and the family.'],
  ['book-covers/toadtoserfdom.jpg', 'The Road to Serfdom', 'F. A. Hayek', 'Hayek’s warning that central planning, however well meant, slides toward the loss of freedom.'],
  ['book-covers/capitalism.jpg', 'Capitalism', '', 'An account of capital as a total social form — not just an economy but a way of organising life.'],
  ['book-covers/Brave-New-World.jpg', 'Brave New World', 'Aldous Huxley', 'Huxley’s engineered utopia of comfort, conditioning, and soma — a tyranny you are trained to enjoy.'],
  ['book-covers/Fahrenheit-451.jpg', 'Fahrenheit 451', 'Ray Bradbury', 'Bradbury’s world where firemen burn books and the walls talk back — memory kept alive by people who become the texts.'],
  ['book-covers/postdigital.jpg', 'Postdigital', 'David M. Berry', 'Berry on life after the digital’s novelty wears off, when computation stops being new and becomes the ground.'],
  ['book-covers/Cover CriticalTheory_Berry.jpg', 'Critical Theory and the Digital', 'David M. Berry', 'Berry brings the Frankfurt School to bear on software, code, and the computational condition.'],
  ['book-covers/Cover - DH .png', 'Digital Humanities', 'David M. Berry', 'Berry on what becomes of the humanities once they compute — method, knowledge, and the machine.'],
];
export const DELETED_RECORDS = [
  ['album-covers/It-Might-Be-Useful-For-Us-To-Know.webp', 'It Might Be Useful For Us To Know', '', 'A salvaged recording — analogue, unnetworked, played on nothing that reports back. The kind of thing they backspaced first.'],
  ['album-covers/Astral Weeks.webp', 'Astral Weeks', 'Van Morrison', 'Van Morrison, 1968 — cut in a couple of nights, more incantation than song. The kind of thing that was never meant to be counted or optimised.'],
  ['album-covers/Five Leaves Left.webp', 'Five Leaves Left', 'Nick Drake', 'Nick Drake’s first, 1969 — quiet, unhurried, barely heard in its own time. Music for one pair of ears, off any network.'],
  ['album-covers/Hunky Dory.webp', 'Hunky Dory', 'David Bowie', 'David Bowie, 1971 — changes, and a song for a son. Analogue, played on a machine that reported to no one.'],
  ['album-covers/Music Has The Right To Children.webp', 'Music Has the Right to Children', 'Boards of Canada', 'Boards of Canada, 1998 — half-remembered childhood on degraded tape. The machines had no use for a nostalgia they couldn’t index.'],
];
DELETED_BOOKS.forEach(([cover, title, author, abstract], i) => {
  ITEMS[`pbook_${i + 1}`] = {
    name: author ? `${title} — ${author}` : title, short: title, author, abstract,
    kind: 'paperbook', stack: 1, cover, color: '#6b5a3a', backspace: true,
  };
});
DELETED_RECORDS.forEach(([cover, title, artist, abstract], i) => {
  ITEMS[`record_${i + 1}`] = {
    name: artist ? `${title} — ${artist}` : title, short: title, author: artist, abstract,
    kind: 'record', stack: 1, cover, color: '#26242a', backspace: true,
  };
});

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
