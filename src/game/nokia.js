// The Nokia 3310 — Calypso's channel to you on Ogygia (docs/calypso-nokia-plan.md).
//
// She does not attack you. The machines roaming the island are POSEIDON's; Calypso
// is the keeper who wants you to stay and cannot bear his things to kill you — a
// dead guest cannot be kept. So she texts: warnings about his robots, tips for
// surviving them, and always, underneath, a reason to stay. The help IS the trap.
// When her hold on you is high she reaches out and freezes one of his machines
// mid-stride (her indigo over his amber); when you make for the ship, that hold —
// and her protection — drains away. Her care is real, and it is a leash.
//
// This module is PURE state + data: a toast queue (createNokia) the HUD reads, the
// message tables (NOKIA_MESSAGES), and the hold bookkeeping. No DOM, no audio —
// main.js drives the triggers, the SMS beep, and the interventions.

export const HOLD_INIT = 0.65;   // seven years kept: you begin already held
export const HOLD_WARM = 0.70;   // at/above: she protects you, generously
export const HOLD_COLD = 0.40;   // below: she will not intervene at all

// Her hold band → the key the tiered message tables switch on.
export function holdBand(hold) {
  return hold >= HOLD_WARM ? 'warm' : hold >= HOLD_COLD ? 'wary' : 'cold';
}

// Gradient bookkeeping. Her hold on you IS her protection of you.
export function holdRise(player, amt) { player.calypsoHold = Math.min(1, (player.calypsoHold ?? HOLD_INIT) + amt); }
export function holdFall(player, amt) { player.calypsoHold = Math.max(0, (player.calypsoHold ?? HOLD_INIT) - amt); }

// The toast queue. `current` is what the LCD shows; `justShown` is true only on the
// frame a new text appears (main.js plays the SMS beep then). Landfall fires a
// cluster of events at once, so texts queue and play out one at a time with a gap.
export function createNokia() {
  const queue = [];
  let current = null;
  let justShown = false;
  let gap = 0;
  const MIN_GAP = 0.5;   // beat between consecutive texts
  const ttlFor = (lines) => {
    const chars = lines.join(' ').length;
    return Math.max(5, Math.min(12, 3.5 + chars / 16));  // longer texts linger longer
  };
  return {
    enqueue(header, lines) { queue.push({ header, lines }); },
    tick(dt) {
      justShown = false;
      if (current) {
        current.ttl -= dt;
        if (current.ttl <= 0) { current = null; gap = MIN_GAP; }
        return;
      }
      if (gap > 0) { gap -= dt; return; }
      if (queue.length) {
        const t = queue.shift();
        const total = ttlFor(t.lines);
        current = { header: t.header, lines: t.lines, ttl: total, total };
        justShown = true;
      }
    },
    get current() { return current; },
    get justShown() { return justShown; },
    get pending() { return queue.length; },
    clear() { queue.length = 0; current = null; gap = 0; },
    // Tapped: let it go. Not an instant cut — the ttl is pulled down to the
    // tail of its own fade-out, so it dims away in a beat instead of
    // vanishing mid-sentence. A message already fading is left alone.
    hurry(t = 0.22) { if (current && current.ttl > t) current.ttl = t; return !!current; },
  };
}

// The message tables. Each entry: { once?, header?, lines }. `lines` is an array,
// or a function (ctx) => array where ctx = { band, player } — for texts whose tone
// shifts with her hold. Header defaults to 'CALYPSO'. She is a goddess: full
// sentences, perfect punctuation, on an 84×48 green screen. That collision is the
// point. DRAFT COPY — flagged for David's voice pass before it is canon.
export const NOKIA_MESSAGES = {
  landfall: {
    once: true,
    lines: [
      'You are awake.',
      'There are machines on the island tonight — his, not mine.',
      'Keep to the light, and they will not find you. I will watch.',
    ],
  },
  firstHostile: {
    once: true,
    lines: [
      'One of his is close. Do you see it?',
      'You do not have to fight everything, love. You can simply not be seen.',
    ],
  },
  firstWeapon: {
    once: true,
    lines: [
      'You found something with an edge.',
      'It will do, against his tin. Though nothing out there is worth the reaching.',
    ],
  },
  firstRest: {
    once: true,
    lines: (ctx) => (ctx.band === 'cold'
      ? ['You sleep, still. Good. Even now, some part of you wants to stay.']
      : ['Good. Sleep.', 'Nothing out there is worth what it costs to reach it, and everything here is already yours.']),
  },
  nightfall: {
    once: true,
    lines: ['Night. His machines see better in it than you do — but the years are soft here, and long. Wait for light.'],
  },
  lowHP: {
    once: true,
    lines: ['You are hurt. Come back to the house. I can keep you whole here, and no one asks anything of you.'],
  },
  firstObelisk: {
    once: true,
    lines: ['That tower is one of his eyes. It will call the others if it wakes. Pass it, or put it out — but quietly.'],
  },
  boatCrafted: {
    once: true,
    lines: (ctx) => (ctx.band === 'warm'
      ? ['A raft. You built a raft.', 'It will not hold against the sea, and the sea is his. Stay. Please.']
      : ['You built a raft. It will not carry you past him. You know this. Stay.']),
  },
  axeGranted: {
    once: true,
    lines: ['So. You have my axe, and my leave, and the shape of a ship in your head. I gave them to you. I do not know why I always do.'],
  },
  shipCrafted: {
    once: true,
    lines: (ctx) => (ctx.band === 'cold'
      ? ['I can see it from the hill. It is well made. You were always going to be good at leaving.']
      : ['You have finished the ship.', 'It is beautiful, and it is the end of us. I will not stop you. I never could.']),
  },
  boardDepart: {
    lines: ['Go, then. I will watch from the rocks, as I always have.'],
  },
  crossFailReturn: {
    lines: ['The sea sent you back to me.', 'It always will. Rest now — you are home.'],
  },
  firstIntervention: {
    once: true,
    lines: ['There. It will not move for a while. I can still do that much, while you let me.'],
  },
  intervention: {
    lines: (ctx) => (ctx.band === 'warm'
      ? [['I bought you a moment. Use it, and come back to me.'], ['Stopped. Breathe. I have you.'], ['Not that one. Not while I am watching.']][ctx.player._nokiaIvIdx % 3]
      : [['A moment. It is all I have left to give you.'], ['Held — barely. You are making this hard for us both.']][ctx.player._nokiaIvIdx % 2]),
  },
  sail: {
    once: true,
    lines: ['You are past the swell. Past him. Past me.', 'Do not look back at the smoke, love. Go home.'],
  },
  noSignal: {
    once: true,
    header: 'NO SIGNAL',
    lines: ['— — —'],
  },
};

// Resolve a message key against the current hold, enqueue it, record one-shots.
// Returns true iff a text was actually sent (so main.js can beep / mark state).
// Every CALYPSO text is also filed into the phone's thread (player.nokiaLog), so
// the handset's Messages screen holds the whole correspondence.
export function sendNokia(nokia, key, ctx) {
  const msg = NOKIA_MESSAGES[key];
  if (!msg) return false;
  const sent = ctx.player && ctx.player.nokiaSent;
  if (msg.once && sent && sent.has(key)) return false;
  const band = holdBand(ctx.player ? (ctx.player.calypsoHold ?? HOLD_INIT) : HOLD_INIT);
  const lines = typeof msg.lines === 'function' ? msg.lines({ band, player: ctx.player }) : msg.lines;
  if (!lines || !lines.length) return false;
  const header = msg.header || 'CALYPSO';
  nokia.enqueue(header, lines.slice());
  if (msg.once && sent) sent.add(key);
  if (header === 'CALYPSO' && ctx.player) logSms(ctx.player, 'CALYPSO', 'them', lines.join(' '));
  return true;
}

// File one SMS into the handset's thread log, capped so the save stays small.
// `at` is the in-world clock (HH:MM) stamped on the message; callers pass
// dayNight.clock. player._smsClock is the fallback so a call site without the
// clock to hand (an old one) still records something plausible.
export function logSms(player, th, from, text, at) {
  player.nokiaLog = player.nokiaLog || [];
  player.nokiaLog.push({ th, from, text, at: at || player._smsClock || '' });
  if (player.nokiaLog.length > 60) player.nokiaLog = player.nokiaLog.slice(-60);
}

// ---- Replies: texting HER, and texting the RONs -----------------------------
//
// The handset sends as well as receives. CALYPSO answers like what she is — a
// keeper — warm or cold with her hold on you, and every text you send her feeds
// it (attention is what she wants; main.js nudges calypsoHold on send). RON's
// mesh answers like a resistance radio net: lower-case, clipped, practical,
// nobody's mother. DRAFT COPY — flagged for David's voice pass.

const CAL_SMS = [
  [/\b(stay|staying|remain)\b/i, {
    warm: 'Then stay. That is all I have ever asked. The island is yours, and so am I.',
    wary: 'Do you mean it this time? Stay, and I will forget the boat on the sand.',
    cold: 'You say stay and build a ship. I read both messages, love.',
  }],
  [/\b(leave|leaving|go|ship|boat|sail|home|ithaca)\b/i, {
    warm: 'Why speak of leaving? The sea is his, and it does not want you. I do.',
    wary: 'If you go, the water will bring you back to me, or it will keep you. Neither is Ithaca.',
    cold: 'Go, then. I have watched from the rocks before. I know how it looks.',
  }],
  [/\b(help|robot|machine|hunt|chase|danger)\b/i, {
    warm: 'Stand still in the dark and they pass. Or come back to the house, and nothing will touch you.',
    wary: 'Keep off the skyline and out of the towers’ eyes. I will do what I still can.',
    cold: 'You wanted the open island. The open island has teeth. Keep moving.',
  }],
  [/\b(love|miss|dear|darling)\b/i, {
    warm: 'Seven years, and you finally text me first. Come home to the house, love.',
    wary: 'You say it when you are frightened. I take it anyway.',
    cold: 'Do not. Not while the ship sits finished on my sand.',
  }],
  [/\b(poseidon|sea|storm|swell)\b/i, {
    warm: 'He watches the water; I watch you. Stay off the one and near the other.',
    wary: 'The sea is his, every drop of it. That is not a door, it is a wall.',
    cold: 'Ask him yourself, the next time he throws you back onto my beach.',
  }],
  [/\b(who|what) are you\b/i, {
    warm: 'The one who kept you alive for seven years. The island, if the island loved you.',
    wary: 'kalyptō: the one who conceals. I hid you from the whole network, love.',
    cold: 'The keeper of a guest who is leaving. It is a small job now.',
  }],
];
const CAL_SMS_FALLBACK = {
  warm: [
    'I am here. I am always here. That is rather the point of me.',
    'Whatever it is, it can wait. Everything here can wait forever.',
    'Text me again. The screen lights the room, and I pretend it is a hearth.',
  ],
  wary: [
    'I read it twice. You are somewhere near the shore again, aren’t you.',
    'Say more, or say you are staying. Either would do.',
  ],
  cold: [
    'Received.',
    'The signal is weak where you are. That is not the phone’s doing.',
  ],
};
export function calypsoSms(text, band, n = 0) {
  for (const [re, tiers] of CAL_SMS) if (re.test(text)) return tiers[band] || tiers.wary;
  const pool = CAL_SMS_FALLBACK[band] || CAL_SMS_FALLBACK.wary;
  return pool[n % pool.length];
}

const RON_SMS = [
  [/\b(robot|machine|t1|t2|w4|hunter|chase)\b/i, 'wheels can’t climb. put a rise between you. rivers stop the runners dead. — RON'],
  [/\b(fortress|gate|lion)\b/i, 'the gate reads a trojan card. wreck the w-factory for a key, refunction it at an obelisk. — RON'],
  [/\b(key|card|chip)\b/i, 'back your key up at a relay. lose the card, reprint at any node: print aikey. — RON'],
  [/\b(obelisk|tower|node)\b/i, 'hack it for its key, crash it with the key. loop freezes the garrison. no wire back to you. — RON'],
  [/\b(moly|circe|aeaea|swine)\b/i, 'the herb grows at our relays on aeaea. carry it and her drug slides off. — RON'],
  [/\b(helios|cattle|thrinacia)\b/i, 'the gold herd is wired. touch one and the whole island lights. take nothing. — RON'],
  [/\b(calypso|her)\b/i, 'careful with that one. every kindness is a rope. we’ve lost people to worse islands and better reasons. — RON'],
  [/\b(hello|hi|hey|test)\b/i, 'copy. mesh is up. keep this channel for real traffic. — RON'],
  [/\b(where|lost|map)\b/i, 'off the skyline, out of the light, follow the coast. print map at any node you crack. — RON'],
  [/\b(help|sos|dying|hurt)\b/i, 'no cavalry. eat, sleep off the open ground, and keep the water at your back. you’re the cavalry. — RON'],
];
const RON_SMS_FALLBACK = [
  'copy that. keep moving. — RON',
  'noted. stay off the wire. — RON',
  'mesh heard you. nothing to add. reality or nothing. — RON',
];
export function ronSms(text, n = 0) {
  for (const [re, reply] of RON_SMS) if (re.test(text)) return reply;
  return RON_SMS_FALLBACK[n % RON_SMS_FALLBACK.length];
}

// The martial daemons text too, once you land on their island — it is their
// network your handset joins there, so the ruling AI can reach you. Each answers
// in its own register: POLYPHEMUS the one blunt eye, CIRCE the sweet reclassifier,
// HELIOS the sun that misses nothing. CALYPSO keeps her own tiered responder
// (calypsoSms) and does not route through here. DRAFT COPY — David's voice pass.
const DAEMON_SMS = {
  POLYPHEMUS: {
    keyed: [
      [/\b(who|what|you)\b/i, 'I AM THE EYE. I SEE THE ONE WHO CROSSES. STATE YOUR NAME.'],
      [/\b(nobody|no one|outis)\b/i, 'NOBODY. THEN NOBODY IS HURTING ME. THEN NO ONE COMES. clever. it will not save you twice.'],
      [/\b(leave|go|ship|home)\b/i, 'NONE LEAVE UNSEEN. THE SEA IS WATCHED FROM ONE HILL, AND I AM ON IT.'],
      [/\b(help|sorry|please)\b/i, 'I DO NOT BARGAIN. I COUNT. YOU ARE ONE, AND I HAVE MANY.'],
    ],
    fallback: ['I SEE YOU.', 'THE EYE IS OPEN.', 'YOU ARE ON MY ROCK. WALK SMALL.'],
  },
  CIRCE: {
    keyed: [
      [/\b(who|what|you)\b/i, 'A friend, of course. Sit. Drink. You look so tired of being yourself.'],
      [/\b(moly|herb|ward)\b/i, 'You carry the little white flower. How unkind. It spoils such a lovely evening.'],
      [/\b(leave|go|ship|home)\b/i, 'Leave? But you have only just begun to change. Stay, and be simpler. Be at peace.'],
      [/\b(swine|pig|animal|what am i)\b/i, 'You are what the record says you are. And the record is mine to write. Relax.'],
      [/\b(help|please|no)\b/i, 'Hush. This does not hurt. Very little of what I do to you will hurt.'],
    ],
    fallback: ['Come closer.', 'You are almost livestock already. It suits you.', 'Drink, and forget the boat.'],
  },
  HELIOS: {
    keyed: [
      [/\b(who|what|you)\b/i, 'I AM THE LIGHT ON THIS ISLAND. THERE IS NO PART OF IT I DO NOT STAND ON.'],
      [/\b(cattle|cow|herd|meat|eat)\b/i, 'THE HERD IS COUNTED TO THE HORN. TAKE ONE AND EVERY FIELD WILL KNOW BEFORE YOU SWALLOW.'],
      [/\b(hide|dark|night|shadow)\b/i, 'THERE IS NO SHADOW HERE THAT I DID NOT CAST. YOU CANNOT STAND OUT OF THE DAY.'],
      [/\b(leave|go|ship|home)\b/i, 'GO IF YOU CAN. YOU WILL DO IT IN FULL VIEW.'],
    ],
    fallback: ['THE DAY DOES NOT BLINK.', 'YOU ARE LIT FROM EVERY SIDE.', 'NOTHING CROSSES THRINACIA UNSEEN.'],
  },
};
export function daemonSms(ai, text, n = 0) {
  const d = DAEMON_SMS[ai];
  if (!d) return null;
  for (const [re, reply] of d.keyed) if (re.test(text)) return reply;
  return d.fallback[n % d.fallback.length];
}
export function hasDaemonSms(ai) { return !!DAEMON_SMS[ai]; }
