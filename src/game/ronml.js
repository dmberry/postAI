// RON-ML: the tiny functional console language typed into an obelisk
// terminal. Design: docs/ob-terminal-language.md. Shipped without lambdas
// (per the doc's own call) — `let` alone teaches binding, and every verb is
// a plain named builtin, applied by juxtaposition or piped with `|>`.
//
// Runtime values are tagged objects, never raw JS primitives, so error
// messages can name what went wrong:
//   {tag:'node', id}   {tag:'key', id}   {tag:'num', v}
//   {tag:'list', items}  {tag:'unit'}   {tag:'fn', name, builtin, args}

export class RonmlError extends Error {}

// ---- Tokenizer --------------------------------------------------------

function tokenize(src) {
  const toks = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    if (c === '(' && src[i + 1] === '*') {
      const end = src.indexOf('*)', i + 2);
      i = end < 0 ? n : end + 2;
      continue;
    }
    if (c === '|' && src[i + 1] === '>') { toks.push({ t: 'PIPE' }); i += 2; continue; }
    if (c === '(') { toks.push({ t: 'LP' }); i++; continue; }
    if (c === ')') { toks.push({ t: 'RP' }); i++; continue; }
    if (c === '[') { toks.push({ t: 'LB' }); i++; continue; }
    if (c === ']') { toks.push({ t: 'RB' }); i++; continue; }
    if (c === ',') { toks.push({ t: 'COMMA' }); i++; continue; }
    if (c === '=') { toks.push({ t: 'EQ' }); i++; continue; }
    if (/[0-9]/.test(c)) {
      let j = i + 1;
      while (j < n && /[0-9.]/.test(src[j])) j++;
      toks.push({ t: 'NUM', v: parseFloat(src.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[A-Za-z]/.test(c)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_-]/.test(src[j])) j++;
      toks.push({ t: 'IDENT', v: src.slice(i, j) });
      i = j;
      continue;
    }
    throw new RonmlError(`unexpected character '${c}'`);
  }
  toks.push({ t: 'EOF' });
  return toks;
}

// ---- Parser: expr -> tiny AST (Let, App, Var, Lit, ListLit) -----------

function isKeyword(tok, word) {
  return tok.t === 'IDENT' && tok.v.toLowerCase() === word;
}

function parse(toks) {
  let p = 0;
  const peek = () => toks[p];
  const eat = (t) => {
    if (toks[p].t !== t) throw new RonmlError(`expected ${t.toLowerCase()}, got '${toks[p].v ?? toks[p].t}'`);
    return toks[p++];
  };

  function parseExpr() {
    if (isKeyword(peek(), 'let')) {
      p++;
      const nameTok = eat('IDENT');
      eat('EQ');
      const value = parseExpr();
      if (!isKeyword(peek(), 'in')) throw new RonmlError("expected 'in' after let — try: let k = hack OB-XXXX in crash OB-XXXX k");
      p++;
      const body = parseExpr();
      return { type: 'Let', name: nameTok.v, value, body };
    }
    return parsePipe();
  }

  function parsePipe() {
    let left = parseApp();
    while (peek().t === 'PIPE') {
      p++;
      const right = parseApp();
      left = { type: 'App', fn: right, arg: left };
    }
    return left;
  }

  function atomStarts(tok) {
    if (tok.t === 'IDENT' && (tok.v.toLowerCase() === 'in' || tok.v.toLowerCase() === 'let')) return false;
    return tok.t === 'NUM' || tok.t === 'IDENT' || tok.t === 'LP' || tok.t === 'LB';
  }

  function parseApp() {
    let node = parseAtom();
    while (atomStarts(peek())) {
      const arg = parseAtom();
      node = { type: 'App', fn: node, arg };
    }
    return node;
  }

  function parseAtom() {
    const tok = peek();
    if (tok.t === 'NUM') { p++; return { type: 'Lit', value: tok.v }; }
    if (tok.t === 'IDENT') { p++; return { type: 'Var', name: tok.v }; }
    if (tok.t === 'LP') {
      p++;
      const e = parseExpr();
      eat('RP');
      return e;
    }
    if (tok.t === 'LB') {
      p++;
      const items = [];
      if (peek().t !== 'RB') {
        items.push(parseExpr());
        while (peek().t === 'COMMA') { p++; items.push(parseExpr()); }
      }
      eat('RB');
      return { type: 'ListLit', items };
    }
    throw new RonmlError(tok.t === 'EOF' ? 'unexpected end of command' : `unexpected '${tok.v ?? tok.t}'`);
  }

  const expr = parseExpr();
  eat('EOF');
  return expr;
}

// ---- Builtins ----------------------------------------------------------
// Each `ctx` method is supplied by the caller (main.js) and does the actual
// world-mutation; this module only handles language mechanics and gating.

function makeBuiltins(station) {
  const B = {
    scan: {
      arity: 0,
      fn: (_args, ctx) => ({ tag: 'list', items: ctx.listObelisks().map((id) => ({ tag: 'node', id })) }),
    },
    keys: {
      arity: 0,
      fn: (_args, ctx) => ({ tag: 'list', items: [...ctx.heldKeys()].map((id) => ({ tag: 'key', id })) }),
    },
    repel: {
      arity: 0,
      fn: (_args, ctx) => { ctx.requireAiKey('repel'); ctx.repelNearby(); return { tag: 'unit' }; },
    },
    sing: {
      arity: 0,
      fn: (_args, ctx) => { ctx.sing(); return { tag: 'unit' }; },
    },
    map: {
      arity: 0,
      fn: (_args, ctx) => { ctx.showMap(); return { tag: 'unit' }; },
    },
    print: {
      arity: 0,
      fn: (_args, ctx) => { ctx.printMap(); return { tag: 'unit' }; },
    },
    // Opens the browsable notepad overlay (ctx.showNotepad, main.js) rather
    // than printing to the console — a real page you flip through, not a
    // wall of scrollback.
    notes: {
      arity: 0,
      fn: (_args, ctx) => { ctx.showNotepad(); return { tag: 'unit' }; },
    },
    // Loads ELIZA — the 1966 DOCTOR script — into the node as an interactive
    // program. A verb like any other (`eliza`, or the readable `run eliza`);
    // the terminal then routes your lines to the doctor until you leave.
    eliza: {
      arity: 0,
      fn: (_args, ctx) => {
        if (!ctx.eliza) throw new RonmlError('no ELIZA image on this node.');
        ctx.eliza();
        return { tag: 'unit' };
      },
    },
    // ---- HERMES station verbs (RON hilltop relays only) ------------------
    // RON tech is off-grid on purpose, and it's an INFORMATION resource, not a
    // workshop: no network verb (touching the wire would give the relay away),
    // nothing fabricated. It keeps the human record — read it here, or print a
    // copy for your notes. (A HERMES `print` is added in makeBuiltins below, so
    // it can take a topic; the obelisk's own arity-0 `print` maps the network.)
    read: {
      arity: 1,
      fn: ([topic], ctx) => {
        const name = topic && (topic.id || '') || '';
        ctx.read(String(name).toLowerCase());
        return { tag: 'unit' };
      },
    },
    // Lists the human knowledge this relay still holds — RON kept it alive when
    // the machines were deleting it.
    archive: {
      arity: 0,
      fn: (_args, ctx) => { ctx.archive(); return { tag: 'unit' }; },
    },
    // Pull the next of RON's own field records off the relay mesh into your
    // Scrapbook — the half of the record RON kept on its relays, not in caches.
    records: {
      arity: 0,
      fn: (_args, ctx) => { ctx.records(); return { tag: 'unit' }; },
    },
    // Override a nearby machine and see through its eyes — RON turning the
    // enemy's own units. You drive it until it leaves the relay's short range
    // or you trip its self-destruct.
    drive: {
      arity: 0,
      fn: (_args, ctx) => { ctx.drive(); return { tag: 'unit' }; },
    },
    nearest: {
      arity: 1,
      fn: ([list], ctx) => {
        if (!list || list.tag !== 'list') throw new RonmlError('nearest needs a list — try: scan |> nearest');
        if (!list.items.length) throw new RonmlError('nothing in range to pick from');
        let best = null, bestD = Infinity;
        for (const item of list.items) {
          if (item.tag !== 'node') throw new RonmlError('nearest only works on a list of nodes');
          const d = ctx.distanceToNode(item.id);
          if (d < bestD) { bestD = d; best = item; }
        }
        return best;
      },
    },
    hack: {
      arity: 1,
      fn: ([node], ctx) => {
        if (!node || node.tag !== 'node') throw new RonmlError('hack needs a node — try: hack OB-XXXX');
        ctx.requireAiKey('hack');
        if (!ctx.nodeExists(node.id)) throw new RonmlError(`no node ${node.id} on the wire`);
        ctx.recordHack(node.id);
        return { tag: 'key', id: node.id };
      },
    },
    crash: {
      arity: 2,
      fn: ([node, key], ctx) => {
        if (!node || node.tag !== 'node') throw new RonmlError('crash needs a node first — try: crash OB-XXXX k');
        const label = node.id || 'OB-XXXX';
        if (!key || key.tag !== 'key' || key.id !== node.id) {
          throw new RonmlError(`crash needs ${label}'s own key. try: let k = hack ${label} in crash ${label} k`);
        }
        if (!ctx.nodeExists(node.id)) throw new RonmlError(`${label} is already dark`);
        ctx.crashNode(node.id);
        return { tag: 'unit' };
      },
    },
    // The easy way in: one word, one node, no key. Pins an infinite loop
    // into the node instead of physically felling it — it and its garrison
    // freeze where they stand, burning CPU, until a repair drone eventually
    // resets it. Weaker than crash (nothing is destroyed, and it self-heals
    // on its own schedule) but far cheaper to pull off.
    loop: {
      arity: 1,
      fn: ([node], ctx) => {
        if (!node || node.tag !== 'node') throw new RonmlError('loop needs a node — try: loop OB-XXXX');
        const label = node.id || 'OB-XXXX';
        if (!ctx.nodeExists(node.id)) throw new RonmlError(`no node ${label} on the wire`);
        if (ctx.nodeFrozen(node.id)) throw new RonmlError(`${label} is already looping — it needs a repair drone, not a second one`);
        ctx.loopNode(node.id);
        return { tag: 'unit' };
      },
    },
    sleep: {
      arity: 1,
      fn: ([num], ctx) => {
        if (!num || num.tag !== 'num') throw new RonmlError('sleep needs a number of minutes — try: sleep 30');
        ctx.requireAiKey('sleep');
        ctx.sleepNearby(num.v);
        return { tag: 'unit' };
      },
    },
    // Claws hours back off the POSEIDON deadline — the resistance's own clock
    // sabotage, buying more time before the towers link up for the purge.
    // Only meaningful before the purge starts; once POSEIDON is actually live
    // the deadline clock isn't running anymore, so ctx reports back if so.
    rewind: {
      arity: 1,
      fn: ([num], ctx) => {
        if (!num || num.tag !== 'num') throw new RonmlError('rewind needs a number of hours — try: rewind 3');
        ctx.requireAiKey('rewind');
        if (ctx.skylinkActive()) throw new RonmlError('POSEIDON is already live — the deadline clock isn\'t running anymore. Knock towers dark instead.');
        ctx.rewindClock(num.v);
        return { tag: 'unit' };
      },
    },
    // Extract a fortress key from the network using a node key you hacked — the
    // program that actually earns its keep: `let k = hack OB-XXXX in unlock k`.
    // The argument must be a key from hack; it drops a single fortress key.
    unlock: {
      arity: 1,
      fn: ([key], ctx) => {
        if (!key || key.tag !== 'key') {
          throw new RonmlError('unlock needs a hacked key. try: let k = hack OB-XXXX in unlock k');
        }
        ctx.unlock(key.id);
        return { tag: 'unit' };
      },
    },
  };
  // The obelisk (TIRESIAS) and the HERMES relay are two different systems, each
  // with its own commands — not one language that refuses half its verbs. So we
  // hand back only the verbs that belong to the station you're at. A verb from
  // the other system simply isn't a command here (see evalNode's unknown path).
  // Neutral verbs (notes; help/let are handled outside this table) belong to
  // both. A station-less caller (tools/tests) gets everything.
  for (const k of OB_VERBS) if (B[k]) B[k].station = 'ob';
  for (const k of HERMES_VERBS) if (B[k]) B[k].station = 'hermes';
  if (!station) return B;
  const out = {};
  for (const k of Object.keys(B)) {
    if (!B[k].station || B[k].station === station) out[k] = B[k];
  }
  // A HERMES relay prints DOCUMENTS, not maps — override `print` here so it
  // takes a topic (`print fortress`). The obelisk keeps its own arity-0 `print`.
  if (station === 'hermes') {
    out.print = {
      arity: 1, station: 'hermes',
      fn: ([topic], ctx) => { ctx.printDoc(String((topic && topic.id) || '').toLowerCase()); return { tag: 'unit' }; },
    };
  }
  return out;
}

// Which verbs belong to which system. Used to filter each terminal's builtins,
// and to tell "not a command here" (a real verb, wrong system) apart from a
// plain bad word.
const OB_VERBS = ['scan', 'nearest', 'keys', 'hack', 'crash', 'loop', 'sleep', 'rewind', 'repel', 'sing', 'map', 'print', 'unlock', 'eliza'];
// Note: HERMES's `print` is added as an override in makeBuiltins (it takes a
// topic), not tagged here — tagging it would steal the obelisk's own arity-0
// `print`. `print` is already in OB_VERBS, so ALL_VERBS still covers it.
const HERMES_VERBS = ['read', 'archive', 'records', 'drive'];
// Retired verbs kept only so typing one gives a clean "not a command" instead
// of a cryptic node error (make/ping were removed when TORs became info-only).
const RETIRED_VERBS = ['make', 'ping'];
const ALL_VERBS = new Set([...OB_VERBS, ...HERMES_VERBS, ...RETIRED_VERBS]);

// ---- Evaluator -----------------------------------------------------------

function applyValue(fnVal, argVal) {
  if (!fnVal || fnVal.tag !== 'fn') {
    throw new RonmlError(`${describeValue(fnVal)} isn't something you can apply an argument to`);
  }
  const args = [...fnVal.args, argVal];
  if (args.length >= fnVal.builtin.arity) return fnVal.builtin.fn(args, fnVal.ctx);
  return { tag: 'fn', name: fnVal.name, builtin: fnVal.builtin, args, ctx: fnVal.ctx };
}

function evalNode(node, env, ctx, builtins) {
  switch (node.type) {
    case 'Lit': return { tag: 'num', v: node.value };
    case 'ListLit': return { tag: 'list', items: node.items.map((it) => evalNode(it, env, ctx, builtins)) };
    case 'Var': {
      const lower = node.name.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(env, lower)) return env[lower];
      const b = builtins[lower];
      if (b) {
        if (b.arity === 0) return b.fn([], ctx);
        return { tag: 'fn', name: lower, builtin: b, args: [], ctx };
      }
      // A real verb from the OTHER system, typed at this terminal: it just isn't
      // a command here (the two systems don't know each other). Distinct from a
      // plain node id like OB-XXXX or an atom like berries, which stay nodes.
      if (ctx && ctx.station && ALL_VERBS.has(lower)) {
        throw new RonmlError(`'${node.name}' isn't a command on this terminal.`);
      }
      return { tag: 'node', id: node.name };
    }
    case 'Let': {
      const v = evalNode(node.value, env, ctx, builtins);
      const env2 = Object.create(env);
      env2[node.name.toLowerCase()] = v;
      return evalNode(node.body, env2, ctx, builtins);
    }
    case 'App': {
      const fn = evalNode(node.fn, env, ctx, builtins);
      const arg = evalNode(node.arg, env, ctx, builtins);
      return applyValue(fn, arg);
    }
    default:
      throw new RonmlError('malformed command');
  }
}

function describeValue(v) {
  if (!v) return 'nothing';
  switch (v.tag) {
    case 'unit': return '()';
    case 'num': return `the number ${v.v}`;
    case 'node': return `node ${v.id}`;
    case 'key': return 'a key';
    case 'list': return 'a list';
    case 'fn': return `${v.name} (needs ${v.builtin.arity - v.args.length} more arg${v.builtin.arity - v.args.length === 1 ? '' : 's'})`;
    default: return 'that';
  }
}

function formatValue(v) {
  if (!v) return '()';
  switch (v.tag) {
    case 'unit': return '()';
    case 'num': return String(v.v);
    case 'node': return v.id;
    case 'key': return `KEY:${v.id}`;
    case 'list': return '[' + v.items.map(formatValue).join(', ') + ']';
    case 'fn': return `<${describeValue(v)}>`;
    default: return String(v);
  }
}

// Usage hints for a builtin left short of its full argument count — shown
// as the teaching error instead of a cryptic partial-function value, per the
// design doc's "crash OB-BB05 alone -> ERR: crash needs a key..." example.
const USAGE_HINTS = {
  hack: 'hack needs a node. try: hack OB-XXXX',
  crash: "crash needs a node and its key. try: let k = hack OB-XXXX in crash OB-XXXX k",
  loop: 'loop needs a node. try: loop OB-XXXX',
  nearest: 'nearest needs a list. try: scan |> nearest',
  sleep: 'sleep needs a number of minutes. try: sleep 30',
  rewind: 'rewind needs a number of hours. try: rewind 3',
  unlock: 'unlock needs a hacked key. try: let k = hack OB-XXXX in unlock k',
  print: 'print needs a topic — try: print fortress (archive lists them)',
  read: 'read needs a topic — try: read history (archive lists them)',
};

// `help` reference, shown when the operator types it at the terminal. Per-verb
// detail lines keyed by name; `sing` is deliberately omitted (it's a secret).
// Each row: [sig, type, desc, gate, station]. `station` scopes the verb to a
// terminal — 'ob' (AI obelisk / TIRESIAS), 'hermes' (RON relay), or '' for the
// verbs that work anywhere. `help` filters to the terminal you're at.
const HELP_VERBS = [
  ['scan', 'unit -> list', 'obelisks/machines in range of this terminal', '', 'ob'],
  ['nearest', 'list -> node', 'the closest element of a list', '', 'ob'],
  ['keys', 'unit -> list', 'the access keys you currently hold', '', 'ob'],
  ['hack n', 'node -> key', "take node n's access key", 'needs an AI key', 'ob'],
  ['crash n k', 'node key -> unit', 'knock node n dark until a drone mends it', 'needs k from hack', 'ob'],
  ['loop n', 'node -> unit', 'pin an infinite loop into node n — freezes it and its garrison until a drone resets it', 'no key needed', 'ob'],
  ['sleep t', 'num -> unit', 'idle local machines for t game-minutes', 'needs AI key', 'ob'],
  ['rewind t', 'num -> unit', 'claw t hours back off the POSEIDON deadline', 'needs AI key; before the purge only', 'ob'],
  ['repel', 'unit -> unit', 'nearby machines turn tail and flee you', 'needs AI key', 'ob'],
  ['map', 'unit -> unit', 'show the territory map (obelisks, machines, mainframe)', '', 'ob'],
  ['print', 'unit -> unit', 'print a carryable map that drops at your feet', '', 'ob'],
  ['unlock k', 'key -> unit', 'extract a fortress key from the network using a hacked node key', 'needs k from hack', 'ob'],
  ['eliza', 'unit -> unit', 'run ELIZA, the 1966 DOCTOR script — talk to it (also: run eliza); Ctrl+C or quit to leave', '', 'ob'],
  ['read t', 'atom -> unit', 'read a document — read ronml / fortress / obelisks / robots / history / destroy', 'HERMES relay only', 'hermes'],
  ['print t', 'atom -> unit', 'print a copy of a document into your notepad (N)', 'HERMES relay only', 'hermes'],
  ['archive', 'unit -> unit', 'list the documents this relay holds', 'HERMES relay only', 'hermes'],
  ['records', 'unit -> unit', "pull the next of RON's own field records into your Scrapbook (J); repeat until dry", 'HERMES relay only', 'hermes'],
  ['drive', 'unit -> unit', 'override a nearby machine and see through its eyes — drive it till it leaves range', 'HERMES relay only', 'hermes'],
  ['notes', 'unit -> unit', 'open the notepad — browse the pages you\'ve found worth keeping', '', ''],
  ['help', 'unit -> unit', 'this reference, or `help <verb>` for one verb', '', ''],
];
function helpText(topic, station, hasManual) {
  if (topic) {
    const row = HELP_VERBS.find((v) => v[0].split(' ')[0] === topic);
    if (!row) return `no help for '${topic}'. try: help`;
    const [sig, type, desc, gate] = row;
    return `${sig}\n  : ${type}\n  ${desc}${gate ? `\n  (${gate})` : ''}`;
  }
  // Show only the verbs that work at the terminal you're actually at — an
  // obelisk (TIRESIAS) lists the AI-network verbs, a HERMES relay lists RON's.
  const here = HELP_VERBS.filter((v) => !v[4] || !station || v[4] === station);
  const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);
  const lines = here.map(([sig, , desc, gate]) =>
    `  ${pad(sig, 11)} ${desc}${gate ? `  [${gate}]` : ''}`);
  const title = station === 'hermes' ? 'HERMES reference (RON relay)' : 'RON-ML reference';
  const example = station === 'hermes'
    ? '  e.g.  read moly      make berries      archive'
    : '  e.g.  scan |> nearest      let k = hack OB-1A2B in crash OB-1A2B k';
  const out = [
    title,
    ...lines,
    '',
    '  let x = e in body   bind a value    |>   pipe left into right',
    example,
  ];
  // If the player hasn't read the full manual yet, say so — this reference is
  // the short form, and the bound RON-DOS Operator's Manual is a real find
  // (teaches the language properly and unlocks console autocomplete).
  if (!hasManual) {
    out.push('', '  TIP: this is only the short reference. The full RON-DOS',
      '  Operator\'s Manual is out there — a bound copy in a resistance',
      '  cache, torn pages in the ruins. Find and READ it: it teaches the',
      '  language properly, and this console will start finishing your',
      '  typing for you.');
  }
  return out.join('\n');
}

// Runs one line of RON-ML against a world context. Returns
// {ok, text} — text is either the printed result or a "ERR: ..." message,
// always a teaching error per the design doc (never a raw stack trace).
export function runRonml(source, ctx) {
  // `help` is a console meta-command, not a language expression — intercept it
  // before evaluation so a bare `help` prints the reference instead of failing
  // as an unknown name. `help <verb>` gives detail on one verb. (`notes` is a
  // real builtin now — see makeBuiltins — since it opens a UI overlay rather
  // than printing text.)
  const trimmed = source.trim();
  if (trimmed === 'help' || trimmed.startsWith('help ')) {
    return { ok: true, text: helpText(trimmed.slice(4).trim(), ctx && ctx.station, ctx && ctx.hasManual) };
  }
  try {
    const toks = tokenize(source);
    const ast = parse(toks);
    const builtins = makeBuiltins(ctx && ctx.station);
    const result = evalNode(ast, {}, ctx, builtins);
    if (result && result.tag === 'fn') {
      return { ok: false, text: `ERR: ${USAGE_HINTS[result.name] || `${result.name} needs more arguments`}` };
    }
    return { ok: true, text: formatValue(result) };
  } catch (e) {
    if (e instanceof RonmlError) return { ok: false, text: `ERR: ${e.message}` };
    return { ok: false, text: `ERR: ${e.message || 'malformed command'}` };
  }
}
