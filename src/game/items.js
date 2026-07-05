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
  scrap: {
    name: 'Scrap',
    kind: 'resource',
    stack: 10,
    color: '#7a7f88',
  },
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
};

// Each def keeps a self-reference to its own key, so any code holding a
// resolved item (ITEMS[k]) can still look up which icon to draw for it.
// Tools/guns don't stack, but still need stack:1 — stow() falls back to
// pocketing a displaced weapon (e.g. swapping tools with no backpack
// room), and without a stack size that path divides by an undefined and
// leaves the slot with qty: NaN.
for (const k in ITEMS) {
  ITEMS[k].key = k;
  if (ITEMS[k].stack == null) ITEMS[k].stack = 1;
}
