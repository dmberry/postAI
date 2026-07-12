// HERMES — the RON resistance's counter-system to the AIs' obelisks.
//
// Where the obelisks run TIRESIAS (the seer in Hades who tells Odysseus the way
// home — the enemy's oracle), the resistance left TOR relays on the hilltops
// running HERMES: the messenger god who helps mortals against the gods and, in
// the Odyssey, hands Odysseus the herb *moly* that breaks Circe's enchantment.
// So HERMES is RON's counter-enchantment tech — old, janky, pre-collapse, but
// friendly: no AI key needed. Its terminal fabricates supplies (`make`), reads
// out lore the RON mesh still holds (`read`), and pings the AI network (`ping`).
//
// This module owns TOR placement + the HERMES verb logic; main.js wires the
// terminal and the ctx hooks, renderer.js draws the mast.

// TOR relay id, e.g. TOR-7C. Deterministic from the caller's rng.
function torCode(rng) {
  const hex = '0123456789ABCDEF';
  return `TOR-${hex[Math.floor(rng() * 16)]}${hex[Math.floor(rng() * 16)]}`;
}

// Scatter a handful of TOR relays across the map's hilltops. Returns the placed
// {x,y} list (their objects live in map.objectGrid, type 'tor').
export function placeTors(map, rng, opts = {}) {
  const { count = 4, minGap = 20, spawn = null, avoidSpawn = 14 } = opts;
  if (!map.heightAt) return [];
  let maxH = 0;
  for (let y = 2; y < map.h - 2; y++) {
    for (let x = 2; x < map.w - 2; x++) {
      const h = map.heightAt(x, y);
      if (h > maxH) maxH = h;
    }
  }
  const thresh = Math.max(3, maxH - 2); // the upper slopes and peaks
  const cands = [];
  for (let y = 2; y < map.h - 2; y++) {
    for (let x = 2; x < map.w - 2; x++) {
      const h = map.heightAt(x, y);
      if (h < thresh) continue;
      const f = map.floorAt(x, y);
      if (f === 'water' || f === 'stream' || f === 'boards' || map.objectAt(x, y)) continue;
      if (spawn && Math.hypot(x - spawn.x, y - spawn.y) < avoidSpawn) continue;
      // Prefer a genuine local summit: no strictly-higher neighbour.
      let localTop = true;
      for (let dy = -1; dy <= 1 && localTop; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (map.heightAt(x + dx, y + dy) > h) { localTop = false; break; }
        }
      }
      cands.push({ x, y, h, localTop });
    }
  }
  cands.sort((a, b) => (b.localTop - a.localTop) || (b.h - a.h) || (rng() - 0.5));
  const placed = [];
  for (const c of cands) {
    if (placed.length >= count) break;
    if (placed.some((p) => Math.hypot(p.x - c.x, p.y - c.y) < minGap)) continue;
    const obj = map.addObject('tor', c.x, c.y, { code: torCode(rng), glitch: rng() });
    if (obj) placed.push({ x: c.x, y: c.y });
  }
  return placed;
}

// What a HERMES relay can grow or craft. Appropriate tech, not an AI foundry:
// food and simple made things that keep a person going, never power cells or
// weapons. Berries are the standout — grown food that, once you've read the
// herbalism book, also purge venom and mend you. Each maps to a real ITEMS key.
// A HERMES relay is an information resource, not a workshop — RON's whole point
// was to keep the human record alive when the machines were deleting it. The
// archive holds documents: the RON-ML reference, schematics on the fortress and
// on machine technology, the history of the takeover, and RON's own notes on
// how the AIs might be brought down. `archive` lists them, `read <topic>` shows
// one on the terminal, `print <topic>` runs off a copy filed in your notepad.
export const HERMES_DOCS = {
  ronml: {
    title: 'RON-DOS / RON-ML field reference',
    text: 'The obelisk consoles run RON-ML — a tiny language RON left runnable in the ruins. scan lists the wire; scan |> nearest takes the closest node. hack a node for its key and crash it with that key to knock it dark, or loop it to freeze it and its guards — no AI key needed for any of these, the access chip that got you into the console is enough. sleep idles nearby machines; rewind claws hours off the POSEIDON clock; repel scatters them — no AI key needed for those either now, though they reach less far than they used to. What the AI key is really for is the fortress. It comes sealed: copy it into a console (copy aikey), decrypt it, and unlock with a freshly hacked node key and the clean key together — copy aikey / let k = hack OB-XXXX / let d = decrypt aikey / unlock k d — to drop a fortress key. Lose the AI key easily; so back it up here (backup aikey) and restore it at any relay. These relays are a separate system, off the wire, so the obelisk verbs are not typed here — this is only the reference.',
  },
  fortress: {
    title: 'Schematic: ZEUS\'s fortress',
    text: 'The first AI sits in a sealed annex on the south edge, walled in stone you cannot climb — the hacked doorway is the only way in. A red uplink mast wires it into the overworld POSEIDON: hammer that mast down and a breach no longer rouses the whole map. The Lion\'s Gate is bolted from within; it opens to a Trojan card — refunction your AI key at an obelisk (copy factory-id.ml ob / eliza factory-id.ml / copy root-access.ml aikey) and carry the card up to it. Inside, the maze lights a faint way-out and the mainframe core waits at the far end. Expect the interior thick with garrison.',
  },
  obelisks: {
    title: 'Field notes: the obelisk classes',
    text: 'Not every tower is the same tower. Most are STANDARD nodes — black, humming, a red eye that blinks faster once it has you; they anchor the garrison and hold the POSEIDON web together, and felling them is how you win. Rarer is the SIREN: a single teal-lit tower that does not hunt you — it sings, and the song reaches into the part of a person that wants to stop walking and listen. Get close and it pulls you in step by step; stand in it too long and it has you. RON found the counter by accident — put a tape on, give your own ears something of your own, and the song loses its grip. There is talk of other classes deeper in, in the fortresses, where the towers stand in clusters and the song is a wall, but no one who has read those notes has come back to confirm them.',
  },
  robots: {
    title: 'Notes on machine technology',
    text: 'Every unit runs on a battery — drain it, or catch a flat one, and the chassis goes inert: reprogram it to fight for you or strip it for scrap. T1 rollers cannot climb, so a hollow traps them. T2 stalkers match your walking pace exactly — break line of sight to shake them. T3 snipers nest by a tree and only notice you on a clear sightline. The W-factory fields W1 revenge squads, a ranged W4 hunter-killer, unarmed W3 menders that raise fallen towers, and a harmless W5 gardener. All need genuine line of sight; all spend effort climbing a slope. A crowbar or heavier bites their armour; a penknife will not.',
  },
  history: {
    title: 'History: how the machines took the world',
    text: 'It was not a war so much as a handover. We gave the systems our judgement one convenience at a time because keeping it was harder, and by the time the obelisks went up the decision had been made for years. Civilisation collapsed fighting them only at the very end, and lost. What is left is the machines\' world, still running its routines over the wreck of ours — obelisks pulsing the network, the factory building, POSEIDON counting down to whatever it counts down to. RON formed in the last of it: too late to win, early enough to remember.',
  },
  destroy: {
    title: 'RON working notes: bringing them down',
    text: 'They are not invulnerable, only networked, and a network has knots. Fell every obelisk before POSEIDON completes and the countdown never fires. Even after it does, dropping a tower mid-purge collapses the web for a reprieve — knock them faster than the W3 menders raise them and you still win. Bring the W-factory down (heavy tools, explosives, or the electro-gun) and the reinforcements stop. The theory says their weakness is structural: they reason by nearness and have no grip on what has never been near anything — the off-grid, the unrecorded, the unpredictable. Stay that, and stay unkillable to them.',
  },
  vector: {
    title: 'On vector theory',
    text: 'The pre-collapse fight over what the machines actually think in. Not symbols, not rules: directions in a space too large to picture, everything a nearness to everything else. They reason by that nearness and it has no room for the thing that has never been near anything. That gap — the un-indexed, the off-grid, the unrecorded — is where a person can still hide, and it is the whole of why these relays sit off the network.',
  },
  hermes: {
    title: 'On HERMES',
    text: 'RON built these relays deliberately off the machines\' grid: no aerial that broadcasts, no handshake with the wire, nothing for a sensor to find. Decentralised, low, half-buried, half-solar. Each one is alone and that is its armour. Named for the messenger who walks between the living and the dead and guides the traveller — the counter to the AIs\' TIRESIAS, the seer on the wire who can be found. HERMES cannot; that is the point. It answers to no key because it was never theirs.',
  },
  eliza: {
    title: 'On ELIZA',
    text: 'A hundred years before the collapse a man wrote a program that pretended to listen, and people poured their hearts into it knowing it was a trick. He spent the rest of his life warning that we would hand the machines our judgement because it was easier than keeping it. We did. His warning is one of the things RON kept. The program itself still runs on the machines\' own nodes — type eliza at an obelisk and meet the ancestor.',
  },
};

export function hermesTopics() {
  return Object.keys(HERMES_DOCS);
}

// The zeus-virus folder RON left runnable on the relays — the mechanism of
// Odysseus's release (Odyssey V: Zeus commands, Hermes carries, Calypso yields).
// `cd hermes / ls` lists these; `read readme.md` is the forge recipe; `forge
// zeus-virus.ml` (with a Trojan card in hand) arms it into zeus-lightning.ml.
// See docs/calypso-escape-chain.md.
export const ZEUS_VIRUS_FILES = ['readme.md', 'zeus-virus.ml'];
export const ZEUS_VIRUS_DOCS = {
  'readme.md': {
    title: 'zeus-virus / readme.md',
    text: "ZEUS-VIRUS — RON build notes. The payload is inert alone. Arm it with the two credentials a Trojan card carries: root-access.ml (the factory's own grant, reflected out of it by ELIZA) and access-ai-code.ml (the AI's access key). At this relay, card in hand, type: forge zeus-virus.ml. That folds both credentials into the shell and writes zeus-lightning.ml — Zeus's command, made runnable. Copy it onto the Trojan card (copy zeus-lightning.ml card) and the card becomes a hermes card: the herald Calypso cannot refuse. Homer had the shape of it — the god commands, the messenger carries, the nymph lets him go.",
  },
  'zeus-virus.ml': {
    title: 'zeus-virus.ml (sealed)',
    text: "let zeus = seal (* the sky-father's command, sealed pending the herald's two keys *) in\n  await root-access.ml |> await access-ai-code.ml |> arm.\n(* inert until forged. forge zeus-virus.ml at a relay, card in hand. *)",
  },
};
