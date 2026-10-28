#!/usr/bin/env node
// Where an agent turn's tokens go, measured on local session logs.
//
// Two passes over every session file in the window:
//
//  1. Composition, as ThoughtDAG imports the turn: the runner's own importer
//     (src/lib/adapters) reduces the file to turns, and each turn is split
//     into question, answer, tool record (calls and results as stored on the
//     canvas, clipped at import; and their original size, from the clip
//     markers) and thinking (the importer's count).
//
//  2. Carry-over, from the providers' own token counts: every model call's
//     prompt size, output and reasoning, in file order, with the turn
//     boundaries (a message the person typed). Across a boundary the prompt
//     grows by what the runtime keeps of the previous turn plus the new
//     message; whether the previous turn's thinking is among what it keeps
//     shows as the share of that thinking the growth still contains. Inside
//     a turn the same measure is a control: the APIs require thinking to be
//     passed back between tool calls.
//
// Output: aggregate numbers only (no text from any session), to
// benchmark/runs/turn-cost/<date>.json.
//
// Run: node benchmark/tools/turn-cost.mjs [--days 30]
import { createReadStream, mkdirSync, readdirSync, statSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { tmpdir, homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DAYS = Number(process.argv[process.argv.indexOf('--days') + 1]) || 30;
const NOW = Date.now();
const SINCE = NOW - DAYS * 86400e3;

const tmp = mkdtempSync(join(tmpdir(), 'tdag-cost-'));
const bundle = join(tmp, 'b.mjs');
await build({
  stdin: {
    contents: `
      export { ClaudeSessionCollector } from './lib/adapters/claude-code-session';
      export { PiSessionCollector } from './lib/adapters/pi-session';
      export { DshSessionCollector } from './lib/adapters/dsh-session';
      export { CodexSessionCollector } from './lib/adapters/codex-session';
      export { countTokens } from './utils';`,
    resolveDir: join(ROOT, 'src'), loader: 'ts',
  },
  bundle: true, format: 'esm', platform: 'node', outfile: bundle, logLevel: 'silent',
  define: { 'import.meta.env.VITE_API_BASE': '""', 'import.meta.env.DEV': 'false', 'import.meta.env': '{}' },
});
const { ClaudeSessionCollector, PiSessionCollector, DshSessionCollector, CodexSessionCollector, countTokens } = await import(pathToFileURL(bundle).href);
rmSync(tmp, { recursive: true, force: true });

// ── the corpus ──
const H = homedir();
const walk = (dir, depth, test) => {
  const out = [];
  let ents = [];
  try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const p = join(dir, e.name);
    if (e.isDirectory() && depth > 0) out.push(...walk(p, depth - 1, test));
    else if (e.isFile() && test(e.name)) out.push(p);
  }
  return out;
};
const recent = (files) => files.filter((f) => statSync(f).mtimeMs >= SINCE);
const CORPUS = {
  'claude-code': recent(walk(join(H, '.claude', 'projects'), 1, (n) => n.endsWith('.jsonl'))),
  codex: recent(walk(join(H, '.codex', 'sessions'), 4, (n) => n.endsWith('.jsonl'))),
  pi: recent(walk(join(H, '.pi', 'agent', 'sessions'), 2, (n) => n.endsWith('.jsonl'))),
  dsh: recent(walk(join(H, '.dsh', 'sessions'), 2, (n) => n.endsWith('.zstd'))),
};

async function* lines(file) {
  if (file.endsWith('.zstd')) {
    const p = spawn('zstdcat', ['-q', file]);
    for await (const l of createInterface({ input: p.stdout, crlfDelay: Infinity })) yield l;
  } else {
    for await (const l of createInterface({ input: createReadStream(file), crlfDelay: Infinity })) yield l;
  }
}
const parse = (l) => { try { return JSON.parse(l); } catch { return null; } };

// ── pass 1: composition through the importers ──
const CLIP = /\n…\[truncated, (\d+) chars total\]$/;
const fullTokens = (s) => {
  const m = s.match(CLIP);
  if (!m) return countTokens(s);
  const head = s.slice(0, m.index);
  return head.length ? Math.round(countTokens(head) * Number(m[1]) / head.length) : 0;
};
const COLLECTOR = { 'claude-code': ClaudeSessionCollector, codex: CodexSessionCollector, pi: PiSessionCollector, dsh: DshSessionCollector };

async function composition(runner, file) {
  const c = new COLLECTOR[runner]();
  for await (const l of lines(file)) c.feedLine(l);
  const s = c.finish();
  if (!s || (runner === 'codex' && s.subagent)) return [];
  return s.turns.map((t) => {
    let toolStored = 0, toolFull = 0;
    for (const x of t.tools) {
      toolStored += countTokens(`[call] ${x.call}\n[result]\n${x.result}`);
      toolFull += fullTokens(x.call) + fullTokens(x.result);
    }
    return { q: countTokens(t.question), a: countTokens(t.response), toolStored, toolFull, steps: t.tools.length, think: t.reasoningTokens ?? 0 };
  });
}

// ── pass 2: model calls and turn boundaries from the providers' counts ──
// call: { ctx, out, reason, model, boundary (a typed message came before it), user (its tokens), compact }
const PLAIN = (s) => typeof s === 'string' ? s : '';

async function callsClaude(file) {
  const calls = [];
  const byId = new Map();
  let boundary = false, user = 0, tools = 0, img = false, compact = false;
  for await (const l of lines(file)) {
    const o = parse(l);
    if (!o || o.isSidechain) continue;
    if (o.type === 'system' && o.subtype === 'compact_boundary') { compact = true; continue; }
    if (o.type === 'user') {
      const c = o.message?.content;
      const text = typeof c === 'string' ? c : Array.isArray(c) ? c.filter((p) => p?.type === 'text').map((p) => PLAIN(p.text)).join('\n') : '';
      for (const p of Array.isArray(c) ? c : []) {
        if (p?.type === 'image') img = true;
        if (p?.type !== 'tool_result') continue;
        const r = p.content;
        if (typeof r === 'string') tools += countTokens(r);
        else for (const x of Array.isArray(r) ? r : []) { if (x?.type === 'text') tools += countTokens(PLAIN(x.text)); else if (x?.type === 'image') img = true; }
      }
      // what the person typed opens a turn; injected reminders only add to the prompt
      if (text.trim()) { user += countTokens(text); if (!o.isMeta && !/^\s*<task-notification>/.test(text)) boundary = true; }
      continue;
    }
    if (o.type !== 'assistant') continue;
    const m = o.message;
    if (!m?.id || !m.usage) continue;
    let call = byId.get(m.id);
    if (!call) {
      const u = m.usage;
      const ctx = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
      if (!ctx && !u.output_tokens) continue; // a synthetic placeholder, no request behind it
      call = { ctx, out: 0, visible: 0, thinkText: 0, model: m.model, boundary, user, tools, img, compact };
      boundary = false; user = 0; tools = 0; img = false; compact = false;
      byId.set(m.id, call);
      calls.push(call);
    }
    call.out = Math.max(call.out, m.usage.output_tokens ?? 0);
    for (const p of Array.isArray(m.content) ? m.content : []) {
      if (p?.type === 'text') call.visible += countTokens(PLAIN(p.text));
      else if (p?.type === 'tool_use') call.visible += countTokens(JSON.stringify(p.input ?? {})) + 8;
      else if (p?.type === 'thinking') call.thinkText += countTokens(PLAIN(p.thinking));
    }
  }
  // the billed output counts the whole thinking; the file holds a summary of it,
  // so the thinking is what the output holds beyond what was visibly written
  for (const c of calls) c.reason = Math.max(0, c.out - c.visible);
  return calls;
}

async function callsCodex(file) {
  const calls = [];
  let boundary = false, user = 0, tools = 0, compact = false, model = '', lastTotal = -1, child = false;
  for await (const l of lines(file)) {
    const o = parse(l);
    const p = o?.payload;
    if (!p) continue;
    if (o.type === 'session_meta' && p.parent_thread_id) child = true;
    if (o.type === 'compacted') { compact = true; continue; }
    if (o.type === 'turn_context' && p.model) model = p.model;
    if (o.type === 'response_item' && p.type === 'message' && (p.role === 'user' || p.role === 'developer' || p.role === 'system')) {
      // every message added to the prompt counts toward its growth; only one
      // the person typed (not the runner's injected context) opens a turn
      const parts = (p.content ?? []).filter((x) => (x.type === 'input_text' || x.type === 'text') && x.text);
      user += countTokens(parts.map((x) => x.text).join('\n'));
      const typed = p.role === 'user' && parts.some((x) => !/^\s*<\/?[a-zA-Z_][\w-]*[^>]*>/.test(x.text) && !x.text.trimStart().startsWith('# AGENTS.md'));
      if (typed) boundary = true;
      continue;
    }
    if (o.type === 'response_item' && (p.type === 'function_call_output' || p.type === 'custom_tool_call_output')) {
      const r = p.output;
      tools += countTokens(typeof r === 'string' ? r : Array.isArray(r) ? r.map((x) => PLAIN(x?.text)).join('\n') : JSON.stringify(r ?? ''));
      continue;
    }
    if (o.type === 'event_msg' && p.type === 'token_count') {
      const last = p.info?.last_token_usage, total = p.info?.total_token_usage?.total_tokens;
      if (!last || total === lastTotal) continue; // the same event twice
      lastTotal = total;
      calls.push({ ctx: last.input_tokens ?? 0, out: last.output_tokens ?? 0, reason: last.reasoning_output_tokens ?? 0, model, boundary, user, tools, img: false, compact });
      boundary = false; user = 0; tools = 0; compact = false;
    }
  }
  return child ? [] : calls;
}

async function callsDsh(file) {
  const calls = [];
  let boundary = false, user = 0, tools = 0, compact = false, model = '';
  for await (const l of lines(file)) {
    const o = parse(l);
    if (!o) continue;
    if (o.type === 'compaction/summary') { compact = true; continue; }
    if (o.type === 'tool/result') { tools += countTokens((o.data?.message?.content ?? []).map((x) => PLAIN(x?.text)).join('\n')); continue; }
    if (o.type === 'request/context' && o.data?.model) model = o.data.model;
    if (o.type === 'user/message') {
      if (o.data?.source?.kind && o.data.source.kind !== 'user') continue;
      const text = (o.data?.content ?? []).filter((x) => x?.type === 'text').map((x) => PLAIN(x.text)).join('\n');
      if (text.trim()) { boundary = true; user += countTokens(text); }
      continue;
    }
    if (o.type !== 'assistant/message' || !o.data?.usage) continue;
    const u = o.data.usage;
    let visible = 0, reasonText = 0;
    for (const x of o.data.message?.content ?? []) {
      if (x?.type === 'reasoning') reasonText += countTokens(PLAIN(x.text));
      else if (x?.type === 'text') visible += countTokens(PLAIN(x.text));
      else if (x?.type === 'tool-call') visible += countTokens(PLAIN(x.arguments)) + 8;
    }
    // DeepSeek returns the reasoning whole: counted from its text
    calls.push({ ctx: (u.inputTokens ?? 0) + (u.cacheReadTokens ?? 0) + (u.cacheWriteTokens ?? 0), out: u.outputTokens ?? 0, reason: reasonText, visible, model, boundary, user, tools, img: false, compact });
    boundary = false; user = 0; tools = 0; compact = false;
  }
  return calls;
}

async function callsPi(file) {
  const calls = [];
  let boundary = false, user = 0, tools = 0;
  for await (const l of lines(file)) {
    const o = parse(l);
    const m = o?.message;
    if (o?.type !== 'message' || !m) continue;
    if (m.role === 'toolResult') { tools += countTokens(typeof m.content === 'string' ? m.content : (m.content ?? []).map((x) => PLAIN(x?.text)).join('\n')); continue; }
    if (m.role === 'user') {
      const text = typeof m.content === 'string' ? m.content : (m.content ?? []).filter((x) => x?.type === 'text').map((x) => PLAIN(x.text)).join('\n');
      if (text.trim()) { boundary = true; user += countTokens(text); }
      continue;
    }
    if (m.role !== 'assistant' || !m.usage) continue;
    const u = m.usage;
    let visible = 0, reasonText = 0;
    for (const x of Array.isArray(m.content) ? m.content : []) {
      if (x?.type === 'thinking') reasonText += countTokens(PLAIN(x.thinking));
      else if (x?.type === 'text') visible += countTokens(PLAIN(x.text));
      else if (x?.type === 'toolCall') visible += countTokens(JSON.stringify(x.arguments ?? {})) + 8;
    }
    calls.push({ ctx: (u.input ?? 0) + (u.cacheRead ?? 0) + (u.cacheWrite ?? 0), out: u.output ?? 0, reason: typeof u.reasoning === 'number' && u.reasoning > 0 ? u.reasoning : reasonText, visible, model: `${m.provider ?? ''}/${m.model ?? ''}`, boundary, user, tools, img: false, compact: false });
    boundary = false; user = 0; tools = 0;
  }
  return calls;
}
const CALLS = { 'claude-code': callsClaude, codex: callsCodex, pi: callsPi, dsh: callsDsh };

/** Across each boundary (last call of a turn → first call of the next) and
 *  between calls inside a turn: the share of the earlier thinking that the
 *  later prompt still holds. Kept → about 1; dropped → about 0. */
function carry(calls) {
  const across = [], within = [];
  let turnThink = 0; // thinking of the calls so far in the current turn
  for (let k = 1; k < calls.length; k++) {
    const prev = calls[k - 1], cur = calls[k];
    if (cur.boundary) {
      const R = turnThink + prev.reason; // all the thinking the previous turn produced
      const growth = cur.ctx - prev.ctx;
      // kept: the prompt grows by the last output whole plus the new message;
      // dropped: by the visible part only, minus the thinking held mid-turn
      const dropped = prev.out - prev.reason + cur.user + cur.tools - turnThink;
      if (!cur.compact && !prev.compact && !cur.img && cur.model === prev.model && R >= 1000 && prev.ctx > 0) {
        across.push({ share: (growth - dropped) / R, R, growth, model: cur.model });
      }
      turnThink = 0;
    } else {
      // inside a turn the prompt grows by the last output and the tool
      // results that answered it: the thinking's share is what remains
      if (!cur.compact && !cur.img && prev.reason >= 500 && cur.model === prev.model) {
        within.push({ share: (cur.ctx - prev.ctx - (prev.out - prev.reason) - cur.tools - cur.user) / prev.reason, model: cur.model });
      }
      turnThink += prev.reason;
    }
  }
  return { across, within };
}

// ── run ──
const q = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; };
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const round = (x, d = 2) => x == null ? null : Math.round(x * 10 ** d) / 10 ** d;
const out = { generatedAt: new Date(NOW).toISOString(), windowDays: DAYS, since: new Date(SINCE).toISOString(), runners: {} };

for (const [runner, files] of Object.entries(CORPUS)) {
  process.stderr.write(`${runner}: ${files.length} files\n`);
  const turns = [];
  const across = [], within = [];
  const models = {};
  let calls = 0;
  const usage = { out: 0, reason: 0, thinkText: 0 };
  for (const f of files) {
    try {
      turns.push(...await composition(runner, f));
      const cs = await CALLS[runner](f);
      calls += cs.length;
      for (const c of cs) { usage.out += c.out; usage.reason += c.reason; usage.thinkText += c.thinkText ?? 0; }
      for (const c of cs) models[c.model] = (models[c.model] ?? 0) + 1;
      const r = carry(cs);
      across.push(...r.across); within.push(...r.within);
    } catch (e) { process.stderr.write(`  skipped a file: ${e.message}\n`); }
  }
  const tool = turns.filter((t) => t.steps > 0);
  const pooled = { q: sum(turns.map((t) => t.q)), a: sum(turns.map((t) => t.a)), toolStored: sum(turns.map((t) => t.toolStored)), toolFull: sum(turns.map((t) => t.toolFull)), think: sum(turns.map((t) => t.think)) };
  const ratio = (xs, f) => xs.filter((t) => t.a > 0).map(f);
  // the share of all stored tool tokens held by the heaviest tenth of turns
  const byTool = [...turns].sort((x, y) => y.toolStored - x.toolStored);
  const top = byTool.slice(0, Math.max(1, Math.round(turns.length / 10)));
  const forward = (f) => ratio(turns, f);
  const byModel = (rows) => {
    const g = {};
    for (const r of rows) (g[r.model] ??= []).push(r.share);
    return Object.fromEntries(Object.entries(g).filter(([, v]) => v.length >= 5).map(([m, v]) => [m, { n: v.length, median: round(q(v, 0.5)), p25: round(q(v, 0.25)), p75: round(q(v, 0.75)) }]));
  };
  out.runners[runner] = {
    files: files.length, turns: turns.length, turnsWithTools: tool.length, calls, models, usage,
    pooled,
    perTurn: {
      toolStepsMedian: q(tool.map((t) => t.steps), 0.5),
      toolStoredOverAnswer: { median: round(q(ratio(tool, (t) => t.toolStored / t.a), 0.5), 1), p90: round(q(ratio(tool, (t) => t.toolStored / t.a), 0.9), 1) },
      toolFullOverAnswer: { median: round(q(ratio(tool, (t) => t.toolFull / t.a), 0.5), 1), p90: round(q(ratio(tool, (t) => t.toolFull / t.a), 0.9), 1) },
      thinkOverAnswer: { median: round(q(ratio(turns.filter((t) => t.think > 0), (t) => t.think / t.a), 0.5), 1), p90: round(q(ratio(turns.filter((t) => t.think > 0), (t) => t.think / t.a), 0.9), 1) },
      turnsWithThinking: turns.filter((t) => t.think > 0).length,
    },
    topTenthToolShare: round(pooled.toolStored ? sum(top.map((t) => t.toolStored)) / pooled.toolStored : null),
    forwarding: {
      // what a question asked below reads from this turn, over the answer-only handoff
      withTools: { median: round(q(forward((t) => (t.q + t.a + t.toolStored) / (t.q + t.a)), 0.5)), p90: round(q(forward((t) => (t.q + t.a + t.toolStored) / (t.q + t.a)), 0.9)), pooled: round((pooled.q + pooled.a + pooled.toolStored) / (pooled.q + pooled.a)) },
      withThinking: { median: round(q(forward((t) => (t.q + t.a + t.think) / (t.q + t.a)), 0.5)), p90: round(q(forward((t) => (t.q + t.a + t.think) / (t.q + t.a)), 0.9)), pooled: round((pooled.q + pooled.a + pooled.think) / (pooled.q + pooled.a)) },
      withBoth: { pooled: round((pooled.q + pooled.a + pooled.toolStored + pooled.think) / (pooled.q + pooled.a)) },
    },
    carryAcross: { n: across.length, median: round(q(across.map((x) => x.share), 0.5)), p25: round(q(across.map((x) => x.share), 0.25)), p75: round(q(across.map((x) => x.share), 0.75)), byModel: byModel(across), shares: across.map((x) => round(x.share, 3)) },
    carryWithin: { n: within.length, median: round(q(within.map((x) => x.share), 0.5)), p25: round(q(within.map((x) => x.share), 0.25)), p75: round(q(within.map((x) => x.share), 0.75)), shares: within.slice(0, 4000).map((x) => round(x.share, 3)) },
    // per-turn shares for the figures: [q, a, toolFull, think] per turn with any tools
    turnRows: tool.map((t) => [t.q, t.a, t.toolStored, t.toolFull, t.think]),
  };
}

const dir = join(ROOT, 'benchmark', 'runs', 'turn-cost');
mkdirSync(dir, { recursive: true });
const file = join(dir, `${new Date(NOW).toISOString().slice(0, 10)}.json`);
writeFileSync(file, JSON.stringify(out));
for (const [r, v] of Object.entries(out.runners)) {
  const { turnRows, carryAcross, carryWithin, ...rest } = v;
  console.log(r, JSON.stringify({ ...rest, carryAcross: { ...carryAcross, shares: undefined }, carryWithin: { ...carryWithin, shares: undefined } }));
}
console.log('wrote', file);
