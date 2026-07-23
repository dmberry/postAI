// The daemon death-aria must speak the core's OWN name. It shipped hardcoded to
// ZEUS — a god not in this game — so breaking POLYPHEMUS's or CIRCE's core had it
// introduce itself as Zeus. `{AI}` is now templated with obj.ai at speak time.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/game/player.js';
import { DAEMON_VOICE, AI_ROSTER } from '../src/game/fortress.js';

// Drive daemonSpeak over a real Player; capture whatever it puts on daemonVoice.
function speakAll(ai) {
  const p = new Player(0, 0);
  const said = [];
  // A core we can drag through every tier: wrath (>=20%), mercy (<20%), dying (<10%).
  const core = { ai, hp: 250, maxHp: 250 };
  let t = 0;
  for (const frac of [1.0, 0.5, 0.25, 0.19, 0.12, 0.09, 0.04]) {
    core.hp = frac * core.maxHp;
    core._voiceTier = undefined; // force a fresh line at each step
    for (let i = 0; i < 8; i++) {
      p.playSeconds = (t += 3);  // clear the MIN_VOICE_GAP each call
      core._voiceAt = -99; core._voiceTier = undefined;
      core._voiceIdx = i;
      p.daemonSpeak(core);
      if (p.daemonVoice) said.push(p.daemonVoice.text);
    }
  }
  return said;
}

test('the aria speaks the core’s own name, never a foreign god', () => {
  for (const ai of AI_ROSTER) {
    const lines = speakAll(ai);
    assert.ok(lines.length > 0, `${ai} said nothing`);
    // Whatever it says, it must not name a daemon that is not this one.
    for (const other of AI_ROSTER) {
      if (other === ai) continue;
      for (const line of lines) {
        assert.ok(!line.includes(other), `${ai}'s aria named ${other}: "${line}"`);
      }
    }
    // And ZEUS, the old hardcoded default, must never appear for a real daemon.
    for (const line of lines) {
      assert.ok(!line.includes('ZEUS'), `${ai}'s aria still says ZEUS: "${line}"`);
    }
    // The name templating actually fired: at least one line carries the AI name.
    assert.ok(lines.some((l) => l.includes(ai)), `${ai}'s aria never used its own name`);
  }
});

test('no aria line still carries an unsubstituted {AI} placeholder', () => {
  // A template token leaking to the screen is as bad as the wrong name.
  const p = new Player(0, 0);
  const core = { ai: 'POLYPHEMUS', hp: 50, maxHp: 250 };
  p.playSeconds = 10; core._voiceAt = -99;
  p.daemonSpeak(core);
  assert.ok(p.daemonVoice && !p.daemonVoice.text.includes('{AI}'), 'placeholder leaked to the aria');
  // and the raw pool genuinely contains the token we rely on
  assert.ok(DAEMON_VOICE.wrath.some((l) => l.includes('{AI}')), 'the wrath pool lost its {AI} token');
});
