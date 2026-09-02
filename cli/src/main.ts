#!/usr/bin/env node
// thoughtdag — the why layer's command line.
//
//   thoughtdag index            build or refresh the footprint index
//   thoughtdag why <path>       the turns that touched a file, and why
//   thoughtdag recall <sid> <n> one turn in full
//   thoughtdag status           what the index holds
//
// The index is deterministic: paths come straight off tool calls in the
// local session files (Claude Code, Codex), never from free text or a
// model. Source files are read, never written. The same adapters that
// draw the canvas feed the index, so the two never disagree.

import { promises as fsp, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
import os from 'node:os';
import { ClaudeSessionCollector } from '../../src/lib/adapters/claude-code-session';
import { CodexSessionCollector } from '../../src/lib/adapters/codex-session';
import { conclusionOf } from '../../src/lib/turn-insight';
import type { RunnerTool } from '../../src/lib/adapters/shared';

type Op = 'read' | 'write' | 'edit';
/** what one turn did to one file: the op, the head of its diff, and the
 *  paragraph of the answer that names the file (when one does) */
interface Touch { op: Op; d?: string; m?: string }
interface IndexTurn {
  i: number; at?: string;
  q: string;
  /** the nearest earlier question with substance, when q is a bare "ok" */
  p?: string;
  c: string; item?: string; ops: Record<string, Touch>;
}
interface IndexSession {
  id: string; runner: 'claude-code' | 'codex'; file: string; mtime: number; size: number;
  cwd: string; title: string; subagent?: boolean; turns: IndexTurn[];
}
interface WhyIndex { version: number; builtAt: string; sessions: Record<string, IndexSession> }
const INDEX_VERSION = 3; // bump when the record shape changes; an old index is rebuilt, never misread

const HOME = process.env.THOUGHTDAG_HOME ?? path.join(os.homedir(), '.thoughtdag');
const INDEX_FILE = path.join(HOME, 'why-index.json');
const ROOTS = (process.env.THOUGHTDAG_SESSION_ROOTS?.split(':').filter(Boolean))
  ?? [path.join(os.homedir(), '.claude', 'projects'), path.join(os.homedir(), '.codex', 'sessions')];

// ─── files ───────────────────────────────────────────────────────────

async function walk(dir: string, depth: number, out: { file: string; mtime: number; size: number }[]): Promise<void> {
  if (depth > 5) return;
  let entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const ent of entries) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) await walk(p, depth + 1, out);
    else if (ent.isFile() && ent.name.endsWith('.jsonl')) {
      try { const st = await fsp.stat(p); out.push({ file: p, mtime: st.mtimeMs, size: st.size }); } catch { /* raced */ }
    }
  }
}

async function firstLine(file: string): Promise<string> {
  const rl = createInterface({ input: createReadStream(file, { encoding: 'utf8', highWaterMark: 65536 }) });
  for await (const line of rl) { rl.close(); return line; }
  return '';
}

const strongest = (a: Op | undefined, b: Op): Op => (a === 'edit' || a === 'write') ? a : b;
const opOf = (t: RunnerTool): Op | null => (t.op === 'read' || t.op === 'write' || t.op === 'edit') ? t.op : null;

const oneLine = (s: string, max: number): string => {
  const l = s.split('\n').map((x) => x.trim()).find(Boolean) ?? '';
  return l.length > max ? `${l.slice(0, max)}…` : l;
};

/** The head of what a call changed, from the call text the adapters
 *  render: an Edit's first old → new line, a Write's first line. */
function diffHead(t: RunnerTool): string | undefined {
  if (t.op === 'edit') {
    const m = t.call.match(/\n--- old\n([\s\S]*?)\n\+\+\+ new\n([\s\S]*)$/);
    if (m) {
      // the first line that actually differs — an Edit's old/new usually
      // share their opening context lines
      const a = m[1].split('\n'); const b = m[2].split('\n');
      let k = 0;
      while (k < a.length && k < b.length && a[k] === b[k]) k++;
      const before = a.slice(k).find((l) => l.trim()) ?? '';
      const after = b.slice(k).find((l) => l.trim()) ?? '';
      const clip = (s: string) => { const l = s.trim(); return l.length > 70 ? `${l.slice(0, 70)}…` : l; };
      return `${clip(before) || '∅'} → ${clip(after) || '∅'}`;
    }
  }
  if (t.op === 'write') {
    const body = t.call.replace(/^[^\n]*\n\n?/, '');
    return `new file, ${body.length} chars: ${oneLine(body, 80)}`;
  }
  return undefined;
}

/** The last paragraph of the answer that names the file — the sentence
 *  about THIS file beats the answer's global conclusion. */
function mentionOf(response: string, file: string): string | undefined {
  const base = path.basename(file).toLowerCase();
  if (base.length < 4) return undefined;
  const paras = response.replace(/```[\s\S]*?```/g, '').split(/\n\s*\n/)
    .map((p) => p.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[#*`>|_~]/g, '').replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 12 && p.toLowerCase().includes(base));
  const last = paras[paras.length - 1];
  return last ? (last.length > 240 ? `${last.slice(0, 240)}…` : last) : undefined;
}

/** Parse one session file into its index record, or null when it is not
 *  a session (the head says what it is: codex rollouts open with
 *  session_meta; claude-code files carry sessionId on message lines). */
async function parseSession(file: string, mtime: number, size: number): Promise<IndexSession | null> {
  const head = await firstLine(file);
  let meta: { type?: string } = {};
  try { meta = JSON.parse(head) as { type?: string }; } catch { /* not json */ }
  const runner: IndexSession['runner'] = meta.type === 'session_meta' ? 'codex' : 'claude-code';
  const collector = runner === 'codex' ? new CodexSessionCollector() : new ClaudeSessionCollector();
  const rl = createInterface({ input: createReadStream(file, { encoding: 'utf8', highWaterMark: 1 << 20 }) });
  for await (const line of rl) collector.feedLine(line);
  const s = collector.finish();
  if (!s) return null;
  const cwd = ('cwd' in s && s.cwd) ? s.cwd : '';
  const turns: IndexTurn[] = s.turns.map((t, i) => {
    const ops: Record<string, Touch> = {};
    for (const tool of t.tools) {
      const op = opOf(tool);
      if (!op) continue;
      for (const p of tool.paths ?? []) {
        const abs = path.isAbsolute(p) ? p : cwd ? path.resolve(cwd, p) : p;
        const prev = ops[abs];
        const d = op === 'read' ? undefined : (prev?.d ?? diffHead(tool));
        ops[abs] = { op: strongest(prev?.op, op), ...(d ? { d } : {}) };
      }
    }
    for (const abs of Object.keys(ops)) {
      const m = mentionOf(t.response, abs);
      if (m) ops[abs].m = m;
    }
    return {
      i, ...(t.at ? { at: t.at } : {}),
      q: firstLineOf(t.question, 200), c: conclusionOf(t.response, 240),
      ...(t.itemIds[0] ? { item: t.itemIds[0] } : {}), ops,
    };
  });
  // "好" / "ok" / "继续" answers an earlier ask: carry that ask along, or
  // the reader sees a turn that changed a file for no stated reason
  let lastSubstantive = '';
  for (const t of turns) {
    if (t.q.length < 12 && lastSubstantive) t.p = lastSubstantive;
    if (t.q.length >= 12) lastSubstantive = t.q;
  }
  const subagent = 'subagent' in s ? !!s.subagent : runner === 'claude-code' && /\/subagents\//.test(file);
  return { id: s.sessionId, runner, file, mtime, size, cwd, title: s.title, ...(subagent ? { subagent } : {}), turns };
}

function firstLineOf(text: string, max: number): string {
  const cmd = text.match(/<command-name>([^<]+)<\/command-name>/);
  const line = (cmd ? cmd[1] : text).split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('<')) ?? '';
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

// ─── index ───────────────────────────────────────────────────────────

const EMPTY = (): WhyIndex => ({ version: INDEX_VERSION, builtAt: '', sessions: {} });

async function loadIndex(): Promise<WhyIndex> {
  try {
    const idx = JSON.parse(await fsp.readFile(INDEX_FILE, 'utf8')) as WhyIndex;
    return idx.version === INDEX_VERSION ? idx : EMPTY();
  } catch { return EMPTY(); }
}

async function saveIndex(idx: WhyIndex): Promise<void> {
  await fsp.mkdir(HOME, { recursive: true });
  const tmp = `${INDEX_FILE}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(idx));
  await fsp.rename(tmp, INDEX_FILE);
}

async function buildIndex(full: boolean): Promise<void> {
  const t0 = Date.now();
  const idx = full ? EMPTY() : await loadIndex();
  const files: { file: string; mtime: number; size: number }[] = [];
  for (const root of ROOTS) await walk(root, 0, files);
  const byFile = new Map(Object.values(idx.sessions).map((s) => [s.file, s]));
  let parsed = 0, kept = 0, skipped = 0;
  const seen = new Set<string>();
  for (const f of files) {
    seen.add(f.file);
    const prev = byFile.get(f.file);
    if (prev && prev.mtime === f.mtime && prev.size === f.size) { kept++; continue; }
    const s = await parseSession(f.file, f.mtime, f.size).catch(() => null);
    if (!s) { skipped++; continue; }
    if (prev && prev.id !== s.id) delete idx.sessions[prev.id];
    idx.sessions[s.id] = s;
    parsed++;
  }
  // files that vanished take their sessions with them
  for (const s of Object.values(idx.sessions)) if (!seen.has(s.file)) delete idx.sessions[s.id];
  idx.builtAt = new Date().toISOString();
  await saveIndex(idx);
  idx.version = INDEX_VERSION;
  const stats = summarize(idx);
  console.log(`indexed ${parsed} session${parsed === 1 ? '' : 's'} (${kept} unchanged, ${skipped} not sessions) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`${stats.sessions} sessions · ${stats.turns} turns · ${stats.paths} files touched · ${INDEX_FILE}`);
}

function summarize(idx: WhyIndex): { sessions: number; turns: number; paths: number } {
  const paths = new Set<string>();
  let turns = 0;
  for (const s of Object.values(idx.sessions)) {
    turns += s.turns.length;
    for (const t of s.turns) for (const p of Object.keys(t.ops)) paths.add(p);
  }
  return { sessions: Object.keys(idx.sessions).length, turns, paths: paths.size };
}

// ─── why ─────────────────────────────────────────────────────────────

interface Hit { session: IndexSession; turn: IndexTurn; op: Op }

// Runners write paths as they saw them; the shell's cwd may be a symlink
// (/var → /private/var on macOS). Match both spellings before falling
// back to a suffix match.
async function realOr(p: string): Promise<string> { try { return await fsp.realpath(p); } catch { return p; } }

async function resolveQuery(idx: WhyIndex, arg: string): Promise<{ path: string | null; candidates: string[] }> {
  const all = new Set<string>();
  for (const s of Object.values(idx.sessions)) for (const t of s.turns) for (const p of Object.keys(t.ops)) all.add(p);
  const abs = path.resolve(process.cwd(), arg);
  if (all.has(abs)) return { path: abs, candidates: [abs] };
  const real = await realOr(abs);
  if (all.has(real)) return { path: real, candidates: [real] };
  const needle = arg.replace(/^\.\//, '').replace(/\/+$/, '');
  const suffix = [...all].filter((p) => p === needle || p.endsWith(`/${needle}`));
  if (suffix.length === 1) return { path: suffix[0], candidates: suffix };
  return { path: null, candidates: suffix.sort() };
}

// A continued session's file carries the turns it continued FROM: the
// same turn (same message id) shows up in two files. It happened once —
// credit the session that first recorded it.
function hitsFor(idx: WhyIndex, file: string): Hit[] {
  const hits: Hit[] = [];
  const seen = new Set<string>();
  const sessions = Object.values(idx.sessions).sort((a, b) => a.mtime - b.mtime);
  for (const session of sessions) {
    for (const turn of session.turns) {
      const touch = turn.ops[file];
      if (!touch) continue;
      if (turn.item) { if (seen.has(turn.item)) continue; seen.add(turn.item); }
      hits.push({ session, turn, op: touch.op });
    }
  }
  return hits;
}

const OP_MARK: Record<Op, string> = { edit: '✏️ edit ', write: '✏️ write', read: '📖 read ' };
/** local wall-clock time, YYYY-MM-DD HH:MM */
function when(t: IndexTurn, s: IndexSession): string {
  const d = new Date(t.at ?? s.mtime);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function printWhy(file: string, hits: Hit[], limit: number, json: boolean): Promise<void> {
  // sessions ordered by their latest touch, newest first; turns inside a
  // session in the order they happened
  const bySession = new Map<string, Hit[]>();
  for (const h of hits) (bySession.get(h.session.id) ?? bySession.set(h.session.id, []).get(h.session.id)!).push(h);
  const groups = [...bySession.values()]
    .map((hs) => hs.sort((a, b) => a.turn.i - b.turn.i))
    .sort((a, b) => (b[b.length - 1].turn.at ?? '').localeCompare(a[a.length - 1].turn.at ?? ''));
  const shown: Hit[] = [];
  for (const g of groups) for (const h of g) if (shown.length < limit) shown.push(h);
  if (json) {
    console.log(JSON.stringify({
      file, turns: hits.length, sessions: bySession.size,
      hits: shown.map((h) => ({ session: h.session.id, runner: h.session.runner, title: h.session.title, turn: h.turn.i, at: h.turn.at ?? null, op: h.op, question: h.turn.q, askedBefore: h.turn.p ?? null, change: h.turn.ops[file]?.d ?? null, about: h.turn.ops[file]?.m ?? null, conclusion: h.turn.c, open: `thoughtdag://open?session=${h.session.id}` })),
    }, null, 1));
    return;
  }
  const rel = path.relative(await realOr(process.cwd()), await realOr(file));
  console.log(`why ${rel.startsWith('..') ? file : rel}  ·  ${hits.length} turn${hits.length === 1 ? '' : 's'} in ${bySession.size} session${bySession.size === 1 ? '' : 's'}${hits.length > limit ? ` (showing ${limit}, --limit for more)` : ''}\n`);
  let printed = 0;
  for (const g of groups) {
    const s = g[0].session;
    const mine = g.filter((h) => shown.includes(h));
    if (!mine.length) continue;
    console.log(`${s.runner}  「${s.title.slice(0, 70)}」${s.subagent ? '  (subagent)' : ''}  thoughtdag://open?session=${s.id}`);
    for (const h of mine) {
      console.log(`  ${when(h.turn, s)}  ${OP_MARK[h.op]}  #${h.turn.i}`);
      console.log(`    Q: ${h.turn.q}${h.turn.p ? `   ⤴ ${h.turn.p}` : ''}`);
      const touch = h.turn.ops[file];
      if (touch?.d) console.log(`    Δ ${touch.d}`);
      const said = touch?.m ?? h.turn.c;
      if (said) console.log(`    → ${said}`);
      printed++;
    }
    console.log('');
  }
  if (!printed) console.log('(no turns)');
}

// ─── recall ──────────────────────────────────────────────────────────

async function recall(idx: WhyIndex, sidPrefix: string, n: number): Promise<void> {
  const s = Object.values(idx.sessions).find((x) => x.id.startsWith(sidPrefix));
  if (!s) { console.error(`no session starts with ${sidPrefix}`); process.exit(1); }
  const fresh = await parseSession(s.file, s.mtime, s.size);
  const collector = s.runner === 'codex' ? new CodexSessionCollector() : new ClaudeSessionCollector();
  const rl = createInterface({ input: createReadStream(s.file, { encoding: 'utf8', highWaterMark: 1 << 20 }) });
  for await (const line of rl) collector.feedLine(line);
  const full = collector.finish();
  const turn = full?.turns[n];
  if (!fresh || !turn) { console.error(`session ${s.id.slice(0, 8)} has no turn #${n}`); process.exit(1); }
  console.log(`${s.runner}  「${s.title}」  turn #${n}${turn.at ? `  ${turn.at.slice(0, 16).replace('T', ' ')}` : ''}\n`);
  console.log(`## Question\n\n${turn.question.trim()}\n`);
  console.log(`## Answer\n\n${turn.response.trim() || '(none)'}\n`);
  if (turn.tools.length) {
    console.log(`## Tools (${turn.tools.length})\n`);
    for (const t of turn.tools) {
      const paths = t.paths?.length ? `  ${t.paths.join(', ')}` : '';
      console.log(`- ${t.name}${paths}`);
      if (t.op === 'edit' || t.op === 'write') console.log(indent(t.call.slice(0, 1200)));
    }
  }
}

const indent = (s: string): string => s.split('\n').map((l) => `    ${l}`).join('\n');

// ─── main ────────────────────────────────────────────────────────────

const USAGE = `thoughtdag — the why layer

  thoughtdag index [--full]          build or refresh the footprint index
  thoughtdag why <path> [--limit N] [--json]
                                     the turns that touched a file, and why
  thoughtdag recall <session> <n>    one turn in full (session id or prefix)
  thoughtdag status                  what the index holds
`;

async function main(argv: string[]): Promise<void> {
  const [cmd, ...rest] = argv;
  const flag = (name: string): boolean => rest.includes(`--${name}`);
  const value = (name: string): string | undefined => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : undefined; };
  const args = rest.filter((a, i) => !a.startsWith('--') && !(i > 0 && rest[i - 1] === '--limit'));
  if (cmd === 'index') return buildIndex(flag('full'));
  if (cmd === 'status') {
    const idx = await loadIndex();
    const st = summarize(idx);
    console.log(idx.builtAt ? `${st.sessions} sessions · ${st.turns} turns · ${st.paths} files touched · built ${idx.builtAt.slice(0, 16).replace('T', ' ')} · ${INDEX_FILE}` : `no index yet — run: thoughtdag index`);
    return;
  }
  if (cmd === 'why') {
    if (!args[0]) { console.error(USAGE); process.exit(2); }
    const idx = await loadIndex();
    if (!idx.builtAt) { console.error('no index yet — run: thoughtdag index'); process.exit(1); }
    const { path: file, candidates } = await resolveQuery(idx, args[0]);
    if (!file) {
      if (candidates.length === 0) { console.log(`why ${args[0]}  ·  no session touched this file`); return; }
      console.log(`${candidates.length} files match "${args[0]}" — pick one:\n`);
      for (const c of candidates.slice(0, 20)) console.log(`  ${c}`);
      return;
    }
    return printWhy(file, hitsFor(idx, file), Number(value('limit') ?? 10) || 10, flag('json'));
  }
  if (cmd === 'recall') {
    if (!args[0] || args[1] === undefined) { console.error(USAGE); process.exit(2); }
    return recall(await loadIndex(), args[0], Number(args[1]));
  }
  console.log(USAGE);
  if (cmd && cmd !== 'help' && cmd !== '--help') process.exit(2);
}

main(process.argv.slice(2)).catch((err) => { console.error(err instanceof Error ? err.message : String(err)); process.exit(1); });
