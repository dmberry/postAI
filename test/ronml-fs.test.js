// Unit tests for the RON-ML terminal filesystem — Stage S1 of the Calypso
// escape chain (docs/calypso-escape-chain.md, §8). Exercises the LANGUAGE layer
// in ronml.js: filenames lexing to `file` values, the cd/ls verbs, and the
// polymorphic `copy` (a file to a device vs the classic `copy aikey` key-bind).
// The main.js device wiring (which card state maps to which files) is verified
// live in the browser; here we drive runRonml against a self-contained fake ctx.
//
// Zero dependencies: `node --test test/` (Node 18+).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runRonml } from '../src/game/ronml.js';

// A minimal stand-in for main.js's fs ctx: an `aikey` drive holding the card's
// two files, and a writable `ob` scratch. cwd + scratch live in the closure the
// way replSession holds them in the real terminal.
function fakeCtx() {
  const files = { aikey: ['access-ai-code.ml', 'factory-id.ml'], ob: [] };
  let cwd = 'aikey';
  return {
    station: 'ob',
    session: {},
    hasAiKey: () => true,
    bindSession() {},
    cd: (d) => {
      const dev = d === 'card' ? 'aikey' : d;
      if (!(dev in files)) return { ok: false, msg: `no drive '${d}'` };
      cwd = dev; return { ok: true };
    },
    ls: () => files[cwd].slice(),
    copyFile: (name, destRaw) => {
      const dest = destRaw === 'card' ? 'aikey' : destRaw;
      if (!files[cwd].includes(name)) return { ok: false, msg: `no file '${name}'` };
      if (dest !== 'ob') return { ok: false, msg: 'sealed' };
      if (!files.ob.includes(name)) files.ob.push(name);
      return { ok: true };
    },
    _files: files,
  };
}

test('a filename lexes to a file value (not a node)', () => {
  const r = runRonml('factory-id.ml', fakeCtx());
  assert.ok(r.ok, r.text);
  assert.equal(r.text, 'factory-id.ml');
});

test('ls lists the card files on the default (aikey) drive', () => {
  const r = runRonml('ls', fakeCtx());
  assert.ok(r.ok, r.text);
  assert.match(r.text, /factory-id\.ml/);
  assert.match(r.text, /access-ai-code\.ml/);
});

test('cd ob then ls shows the (empty) scratch, not the card', () => {
  const ctx = fakeCtx();
  assert.ok(runRonml('cd ob', ctx).ok);
  assert.equal(runRonml('ls', ctx).text, '[]');
});

test('copy moves a file from the card to the ob scratch', () => {
  const ctx = fakeCtx();
  const c = runRonml('copy factory-id.ml ob', ctx);
  assert.ok(c.ok, c.text);
  assert.equal(c.text, 'factory-id.ml');
  assert.deepEqual(ctx._files.ob, ['factory-id.ml']);
  // and now it lists on the ob drive
  runRonml('cd ob', ctx);
  assert.match(runRonml('ls', ctx).text, /factory-id\.ml/);
});

test('copy aikey still binds the sealed key token (polymorphism preserved)', () => {
  const r = runRonml('copy aikey', fakeCtx());
  assert.ok(r.ok, r.text);
  assert.match(r.text, /AIKEY:sealed/);
});

test('copying to the sealed card is refused with a teaching error', () => {
  const r = runRonml('copy factory-id.ml aikey', fakeCtx());
  assert.ok(!r.ok);
  assert.match(r.text, /ERR:/);
  assert.match(r.text, /sealed/);
});

test('copy with no device left of it reports the file usage, not the key one', () => {
  const r = runRonml('copy factory-id.ml', fakeCtx());
  assert.ok(!r.ok);
  assert.match(r.text, /copy factory-id\.ml ob|a file to a device/);
});

test('cd to an unknown drive errors', () => {
  const r = runRonml('cd nowhere', fakeCtx());
  assert.ok(!r.ok);
  assert.match(r.text, /ERR:/);
});

test('a hyphen-only identifier is still a node (OB-XXXX unaffected)', () => {
  const r = runRonml('OB-BB05', fakeCtx());
  assert.ok(r.ok, r.text);
  assert.equal(r.text, 'OB-BB05');
});

// ---- S2: the ELIZA transform (eliza <file>) --------------------------------

test('eliza <file> runs the transform via ctx and returns the output file', () => {
  let called = null;
  const ctx = { station: 'ob', session: {}, elizaTransform: (n) => { called = n; return { ok: true, out: 'root-access.ml' }; } };
  const r = runRonml('eliza factory-id.ml', ctx);
  assert.ok(r.ok, r.text);
  assert.equal(called, 'factory-id.ml');
  assert.equal(r.text, 'root-access.ml');
});

test('eliza needs a file, not a bare word (bare eliza is a REPL mode, tested live)', () => {
  const ctx = { station: 'ob', session: {}, elizaTransform: () => ({ ok: true, out: 'x' }) };
  const r = runRonml('eliza banana', ctx);
  assert.ok(!r.ok);
  assert.match(r.text, /needs a file/);
});

test('eliza transform failure surfaces the ctx message', () => {
  const ctx = { station: 'ob', session: {}, elizaTransform: () => ({ ok: false, msg: 'no factory-id.ml on the ob bench — copy it here first' }) };
  const r = runRonml('eliza factory-id.ml', ctx);
  assert.ok(!r.ok);
  assert.match(r.text, /ob bench/);
});

// ---- S4: the HERMES forge (forge <file>) -----------------------------------

test('forge <file> runs the ctx forge and returns the output file', () => {
  let called = null;
  const ctx = { station: 'hermes', session: {}, forge: (n) => { called = n; return { ok: true, out: 'zeus-lightning.ml' }; } };
  const r = runRonml('forge zeus-virus.ml', ctx);
  assert.ok(r.ok, r.text);
  assert.equal(called, 'zeus-virus.ml');
  assert.equal(r.text, 'zeus-lightning.ml');
});

test('forge failure surfaces the ctx message', () => {
  const ctx = { station: 'hermes', session: {}, forge: () => ({ ok: false, msg: 'forge needs a Trojan card in hand' }) };
  const r = runRonml('forge zeus-virus.ml', ctx);
  assert.ok(!r.ok);
  assert.match(r.text, /Trojan card/);
});

test('forge is a HERMES verb — refused at an obelisk', () => {
  const ctx = { station: 'ob', session: {}, forge: () => ({ ok: true, out: 'x' }) };
  const r = runRonml('forge zeus-virus.ml', ctx);
  assert.ok(!r.ok);
  assert.match(r.text, /isn't a command on this terminal/);
});

test('read accepts a file value (readme.md), not just a topic', () => {
  let readArg = null;
  const ctx = { station: 'hermes', session: {}, read: (t) => { readArg = t; } };
  const r = runRonml('read readme.md', ctx);
  assert.ok(r.ok, r.text);
  assert.equal(readArg, 'readme.md');
});
