// Per-island virus codes: one hermes card must NOT open the whole archipelago.
// Each island's HERMES relay holds its own daemon's payload, and arming the card
// there arms it against that daemon alone (player.virusArmed).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/game/player.js';
import { VIRUS_BY_AI, virusFor, virusFilesFor, virusDocsFor } from '../src/game/hermes.js';

// A card-holder stub exposing the real credential predicates.
function holder(armed = [], items = ['hermes_card']) {
  return {
    virusArmed: new Set(armed),
    _items: items,
    hasItem(k) { return this._items.includes(k); },
    hasTrojanCard: Player.prototype.hasTrojanCard,
    hasVirusFor: Player.prototype.hasVirusFor,
  };
}

test('every daemon has its own distinct payload and armed file', () => {
  const ais = ['CALYPSO', 'POLYPHEMUS', 'CIRCE', 'HELIOS'];
  const files = ais.map((a) => virusFor(a).file);
  const armed = ais.map((a) => virusFor(a).armed);
  assert.equal(new Set(files).size, ais.length, 'no two islands share a payload');
  assert.equal(new Set(armed).size, ais.length, 'no two islands share an armed file');
  // the Homeric counter-forces
  assert.equal(virusFor('CALYPSO').file, 'zeus-virus.ml');
  assert.equal(virusFor('POLYPHEMUS').file, 'nobody-virus.ml');
  assert.equal(virusFor('CIRCE').file, 'moly-virus.ml');
  assert.equal(virusFor('HELIOS').file, 'eclipse-virus.ml');
});

test("a relay lists only its own island's payload", () => {
  assert.deepEqual(virusFilesFor('POLYPHEMUS'), ['readme.md', 'nobody-virus.ml']);
  assert.ok(!virusFilesFor('POLYPHEMUS').includes('zeus-virus.ml'), "Ogygia's code is not on Aegilia's bench");
  const docs = virusDocsFor('CIRCE');
  assert.ok(docs['moly-virus.ml'], 'the sealed payload reads');
  assert.ok(!docs['zeus-virus.ml']);
});

test('a card armed on one island is armed against that daemon ALONE', () => {
  const p = holder(['CALYPSO']);
  assert.equal(p.hasVirusFor('CALYPSO'), true);
  assert.equal(p.hasVirusFor('POLYPHEMUS'), false, 'the Ogygia card means nothing on Aegilia');
  assert.equal(p.hasVirusFor('CIRCE'), false);
  assert.equal(p.hasVirusFor('HELIOS'), false);
});

test('the Lion’s Gate still opens to any Trojan card — entry stays quick', () => {
  const p = holder([], ['trojan_key']); // armed against nobody
  assert.equal(p.hasTrojanCard(), true, 'gets you through the front door anywhere');
  assert.equal(p.hasVirusFor('POLYPHEMUS'), false, 'and no further');
});

test('arming stacks as you work down the archipelago', () => {
  const p = holder(['CALYPSO']);
  p.virusArmed.add('POLYPHEMUS');
  assert.equal(p.hasVirusFor('CALYPSO'), true);
  assert.equal(p.hasVirusFor('POLYPHEMUS'), true);
  assert.equal(p.hasVirusFor('HELIOS'), false, 'still not the ones you haven’t forged');
});

test('lose the card and the arming goes with it — the code lives on the card', () => {
  const p = holder(['CALYPSO', 'POLYPHEMUS'], []);
  assert.equal(p.hasVirusFor('CALYPSO'), false);
  assert.equal(p.hasTrojanCard(), false);
});

test('a shielded core turns every weapon route until its virus runs', () => {
  const core = { hp: 250, maxHp: 250, defeated: false, shielded: true, ai: 'POLYPHEMUS' };
  const stub = {
    say() {}, sparkAt() {}, xpLevel() { return 0; }, daemonSpeak() {}, addScore() {},
    _fired: 0, onCoreDefeated() { this._fired++; },
    damageCore: Player.prototype.damageCore,
  };
  stub.damageCore(core, null, 9999);   // a bomb / the electro-arc
  assert.equal(core.hp, 250, 'the field turns it');
  assert.equal(core.defeated, false);
  assert.equal(stub._fired, 0, 'no kill hook while shielded');
  core.shielded = false;                // the island's virus has been run
  stub.damageCore(core, null, 30);
  assert.equal(core.hp, 220, 'now it wounds');
});
