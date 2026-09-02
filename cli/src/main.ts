#!/usr/bin/env node
// thoughtdag — the why layer's command line.
//
//   thoughtdag index [--full]          build or refresh the footprint index
//   thoughtdag why <path> [--include-read] [--all] [--limit N] [--json]
//   thoughtdag recall <session> <n>    one turn in full
//   thoughtdag status                  what the index holds, and how much of it is evidence
//   thoughtdag purge                   delete everything this tool stored
//
// Facts come straight off tool calls in the local session files, never
// from free text or a model. Two stores, two kinds of content:
//   fact-index.json           observed events + verbatim excerpts + pointers
//   interpretation-cache.json heuristics read off the answers (deletable)
// Source files are read, never written. The index is derived and can
// always be rebuilt; a query refreshes it first when a source moved on.

import { promises as fsp, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
import os from 'node:os';
import { ClaudeSessionCollector } from '../../src/lib/adapters/claude-code-session';
import { CodexSessionCollector } from '../../src/lib/adapters/codex-session';
import { conclusionOf } from '../../src/lib/turn-insight';
import type { RunnerTurn } from '../../src/lib/adapters/shared';
import { sessionToEvents, deriveTouches, absolutePath, fileUri, filePathOf, urlArtifact, arxivArtifact, type ProjectableSession } from '../../src/lib/events/project';
import type { Locator } from '../../src/lib/events/types';
import { MANIFESTS } from '../../src/lib/events/manifests';

// ─── records ─────────────────────────────────────────────────────────

type Op = 'read' | 'fetch' | 'write' | 'edit';
const readLike = (op: Op): boolean => op === 'read' || op === 'fetch';
/** observed: the op, and the first differing line of the change (verbatim, partial) */
interface Touch { op: Op; d?: string; l?: Locator[] }
interface FactTurn { i: number; item?: string; at?: string; q: string; ops: Record<string, Touch> }
/** One SOURCE FILE's worth of facts. A logical session (`id`) can span
 *  several — a resumed Codex thread opens a new rollout each time — so
 *  the store is keyed by source, and readers group by `id`. */
interface FactSession {
  id: string; runner: 'claude-code' | 'codex'; file: string; mtime: number; size: number;
  cwd: string; workspace: string; title: string; subagent?: boolean; turns: FactTurn[];
}
interface FactIndex {
  version: number; builtAt: string;
  /** keyed by canonical source file path */
  sessions: Record<string, FactSession>;
  /** .jsonl files seen that are not sessions, with the stat they had —
      remembered so a stray file does not make every query refresh */
  skipped: Record<string, { mtime: number; size: number }>;
}
/** heuristics: the answer's closing paragraph, the earlier ask a bare "ok"
 *  answers, the paragraph naming each file — candidates, not facts */
interface CacheTurn { c?: string; p?: string; m?: Record<string, string> }
interface CacheIndex { version: number; sessions: Record<string, Record<string, CacheTurn>> }

const INDEX_VERSION = 7;
const EXCERPT = 200;

const HOME = process.env.THOUGHTDAG_HOME ?? path.join(os.homedir(), '.thoughtdag');
const FACT_FILE = path.join(HOME, 'fact-index.json');
const CACHE_FILE = path.join(HOME, 'interpretation-cache.json');
const LEGACY_FILE = path.join(HOME, 'why-index.json');
const ROOTS = (process.env.THOUGHTDAG_SESSION_ROOTS?.split(path.delimiter).filter(Boolean))
  ?? [path.join(os.homedir(), '.claude', 'projects'), path.join(os.homedir(), '.codex', 'sessions')];

// ─── files ───────────────────────────────────────────────────────────

interface FileStat { file: string; mtime: number; size: number }

async function walk(dir: string, depth: number, out: FileStat[]): Promise<void> {
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

async function listSources(): Promise<FileStat[]> {
  const files: FileStat[] = [];
  for (const root of ROOTS) await walk(root, 0, files);
  return files;
}

async function firstLine(file: string): Promise<string> {
  const rl = createInterface({ input: createReadStream(file, { encoding: 'utf8', highWaterMark: 65536 }) });
  for await (const line of rl) { rl.close(); return line; }
  return '';
}

async function realOr(p: string): Promise<string> { try { return await fsp.realpath(p); } catch { return p; } }

/** One spelling per path, on both sides of a query: the real path when
 *  it exists, else the real path of its nearest existing ancestor plus
 *  the rest (macOS /var → /private/var, symlinked checkouts). Runners
 *  write paths as they saw them; the index keys them canonically. */
async function canonicalPath(p: string, memo?: Map<string, string>): Promise<string> {
  const hit = memo?.get(p);
  if (hit) return hit;
  let out: string;
  try { out = await fsp.realpath(p); } catch {
    const parent = path.dirname(p);
    out = parent === p ? p : path.join(await canonicalPath(parent, memo), path.basename(p));
  }
  memo?.set(p, out);
  return out;
}

/** The workspace a directory belongs to: its git root, else the directory
 *  itself. Sessions started from a subfolder of one repo share a workspace. */
async function workspaceOf(dir: string): Promise<string> {
  let cur = await realOr(dir);
  for (;;) {
    try { await fsp.stat(path.join(cur, '.git')); return cur; } catch { /* keep climbing */ }
    const up = path.dirname(cur);
    if (up === cur) return await realOr(dir);
    cur = up;
  }
}

// ─── parsing ─────────────────────────────────────────────────────────

const strongest = (a: Op | undefined, b: Op): Op => (a === 'edit' || a === 'write') ? a : b;

/** An artifact id with its real filesystem spelling: file:// ids go through
 *  realpath (symlinks, /var → /private/var); web and paper ids are already
 *  canonical. */
async function canonicalArtifact(id: string, memo: Map<string, string>): Promise<string> {
  const p = filePathOf(id);
  return p ? fileUri(await canonicalPath(p, memo)) : id;
}

/** The name a paragraph would use for this artifact. */
function mentionKey(id: string): string {
  const p = filePathOf(id);
  if (p) return path.basename(p);
  if (id.startsWith('arxiv:')) return id.slice('arxiv:'.length);
  try { const u = new URL(id); return u.pathname.split('/').filter(Boolean).pop() ?? u.hostname; } catch { return id; }
}

/** How a person reads an artifact id: a path relative to here, a URL, a paper id. */
async function displayOf(id: string): Promise<string> {
  const p = filePathOf(id);
  if (!p) return id;
  const rel = path.relative(await realOr(process.cwd()), await realOr(p));
  return rel.startsWith('..') || path.isAbsolute(rel) ? p : rel;
}
const clipLine = (s: string, max: number): string => { const l = s.trim(); return l.length > max ? `${l.slice(0, max)}…` : l; };

/** The last paragraph of the answer that names the file — a candidate
 *  explanation, not a verified reason. */
function mentionOf(response: string, key: string): string | undefined {
  const base = key.toLowerCase();
  if (base.length < 4) return undefined;
  const paras = response.replace(/```[\s\S]*?```/g, '').split(/\n\s*\n/)
    .map((p) => p.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[#*`>|_~]/g, '').replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 12 && p.toLowerCase().includes(base));
  const last = paras[paras.length - 1];
  return last ? clipLine(last, 240) : undefined;
}

function questionExcerpt(text: string): string {
  const cmd = text.match(/<command-name>([^<]+)<\/command-name>/);
  const line = (cmd ? cmd[1] : text).split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('<')) ?? '';
  return clipLine(line, EXCERPT);
}

/** Read one source file through its adapter: the collector's output, plus
 *  what the projection needs to name the session. */
async function collect(file: string): Promise<{ runner: FactSession['runner']; s: NonNullable<ReturnType<ClaudeSessionCollector['finish']>> & { subagent?: boolean } } | null> {
  let meta: { type?: string } = {};
  try { meta = JSON.parse(await firstLine(file)) as { type?: string }; } catch { /* not json */ }
  const runner: FactSession['runner'] = meta.type === 'session_meta' ? 'codex' : 'claude-code';
  const collector = runner === 'codex' ? new CodexSessionCollector() : new ClaudeSessionCollector();
  const rl = createInterface({ input: createReadStream(file, { encoding: 'utf8', highWaterMark: 1 << 20 }) });
  for await (const line of rl) collector.feedLine(line);
  const s = collector.finish();
  return s ? { runner, s } : null;
}

/** The canonical events of one source file — the contract every reader
 *  shares. `events <file>` prints exactly this. */
async function eventsOf(file: string) {
  const c = await collect(file);
  if (!c) return null;
  const { runner, s } = c;
  const subagent = 'subagent' in s ? !!s.subagent : runner === 'claude-code' && /\/subagents\//.test(file);
  const session: ProjectableSession = {
    runner, nativeId: s.sessionId, title: s.title, file, schema: MANIFESTS[runner].schema,
    ...(('cwd' in s && s.cwd) ? { cwd: s.cwd } : {}), ...(subagent ? { subagent } : {}), turns: s.turns,
  };
  return { session, events: sessionToEvents(session), manifest: MANIFESTS[runner] };
}

async function parseSession(f: FileStat): Promise<{ fact: FactSession; cache: Record<string, CacheTurn> } | null> {
  const c = await collect(f.file);
  if (!c) return null;
  const { runner, s } = c;
  const memo = new Map<string, string>();
  const rawCwd = ('cwd' in s && s.cwd) ? s.cwd : '';
  const cwd = rawCwd ? await canonicalPath(rawCwd, memo) : '';
  const workspace = cwd ? await workspaceOf(cwd) : '';
  const subagent = 'subagent' in s ? !!s.subagent : runner === 'claude-code' && /\/subagents\//.test(f.file);
  // the contract first: the index is a reduction of the same events every
  // other reader sees, never a second reading of the log
  const sourceId = await canonicalPath(f.file, memo);
  const session: ProjectableSession = {
    runner, nativeId: s.sessionId, title: s.title, file: f.file, sourceId, schema: MANIFESTS[runner].schema,
    ...(rawCwd ? { cwd: rawCwd } : {}), ...(subagent ? { subagent } : {}), turns: s.turns,
  };
  const opsByTurn = new Map<number, Record<string, Touch>>();
  for (const t of deriveTouches(sessionToEvents(session))) {
    const id = await canonicalArtifact(t.artifact, memo);
    const ops = opsByTurn.get(t.turnIndex) ?? opsByTurn.set(t.turnIndex, {}).get(t.turnIndex)!;
    const prev = ops[id];
    const d = prev?.d ?? t.change;
    const l = [...(prev?.l ?? []), ...(t.locators ?? [])].filter((x, i, arr) => arr.findIndex((y) => JSON.stringify(y) === JSON.stringify(x)) === i);
    ops[id] = { op: strongest(prev?.op, t.op as Op), ...(d ? { d } : {}), ...(l.length ? { l } : {}) };
  }
  const turns: FactTurn[] = [];
  const cache: Record<string, CacheTurn> = {};
  let lastSubstantive = '';
  for (const [i, t] of (s.turns as RunnerTurn[]).entries()) {
    const ops = opsByTurn.get(i) ?? {};
    const q = questionExcerpt(t.question);
    turns.push({ i, ...(t.itemIds[0] ? { item: t.itemIds[0] } : {}), ...(t.at ? { at: t.at } : {}), q, ops });
    // interpretation: never in the fact record
    const entry: CacheTurn = {};
    const con = conclusionOf(t.response, 240);
    if (con) entry.c = con;
    if (q.length < 12 && lastSubstantive) entry.p = lastSubstantive;
    if (q.length >= 12) lastSubstantive = q;
    for (const id of Object.keys(ops)) {
      const m = mentionOf(t.response, mentionKey(id));
      if (m) (entry.m ??= {})[id] = m;
    }
    if (Object.keys(entry).length) cache[String(i)] = entry;
  }
  return {
    fact: { id: s.sessionId, runner, file: f.file, mtime: f.mtime, size: f.size, cwd, workspace, title: s.title, ...(subagent ? { subagent } : {}), turns },
    cache,
  };
}

// ─── stores ──────────────────────────────────────────────────────────

const emptyFacts = (): FactIndex => ({ version: INDEX_VERSION, builtAt: '', sessions: {}, skipped: {} });
const emptyCache = (): CacheIndex => ({ version: INDEX_VERSION, sessions: {} });

async function readJson<T>(file: string, empty: () => T): Promise<T> {
  try {
    const v = JSON.parse(await fsp.readFile(file, 'utf8')) as T & { version?: number };
    return v.version === INDEX_VERSION ? v : empty();
  } catch { return empty(); }
}

/** Private by construction: the directory is 0700, every file 0600, and
 *  a write never leaves a half-written index behind. */
async function writePrivate(file: string, data: unknown): Promise<void> {
  await fsp.mkdir(HOME, { recursive: true, mode: 0o700 });
  await fsp.chmod(HOME, 0o700).catch(() => undefined);
  const tmp = `${file}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(data), { mode: 0o600 });
  await fsp.chmod(tmp, 0o600).catch(() => undefined);
  await fsp.rename(tmp, file);
}

const loadFacts = async (): Promise<FactIndex> => {
  const f = await readJson(FACT_FILE, emptyFacts);
  f.skipped ??= {}; f.sessions ??= {};
  return f;
};
const loadCache = (): Promise<CacheIndex> => readJson(CACHE_FILE, emptyCache);

// ─── index ───────────────────────────────────────────────────────────

interface BuildReport { parsed: number; kept: number; skipped: number; removed: number; seconds: number }

async function buildIndex(full: boolean): Promise<BuildReport> {
  const t0 = Date.now();
  await fsp.rm(LEGACY_FILE, { force: true }).catch(() => undefined);
  const facts = full ? emptyFacts() : await loadFacts();
  const cache = full ? emptyCache() : await loadCache();
  const files = await listSources();
  let parsed = 0, kept = 0, skipped = 0, removed = 0;
  const seen = new Set<string>();
  for (const f of files) {
    const key = await canonicalPath(f.file);
    seen.add(key);
    const prev = facts.sessions[key];
    const sk = facts.skipped[key];
    if (sk && sk.mtime === f.mtime && sk.size === f.size) { skipped++; continue; }
    // unchanged AND its interpretation is still there: a deleted cache
    // must come back on the next index, or "deletable" was a lie
    if (prev && prev.mtime === f.mtime && prev.size === f.size && cache.sessions[key]) { kept++; continue; }
    const r = await parseSession(f).catch(() => null);
    if (!r) { facts.skipped[key] = { mtime: f.mtime, size: f.size }; skipped++; continue; }
    delete facts.skipped[key];
    facts.sessions[key] = r.fact;
    cache.sessions[key] = r.cache;
    parsed++;
  }
  for (const key of Object.keys(facts.sessions)) {
    if (!seen.has(key)) { delete facts.sessions[key]; delete cache.sessions[key]; removed++; }
  }
  for (const key of Object.keys(facts.skipped)) if (!seen.has(key)) delete facts.skipped[key];
  facts.builtAt = new Date().toISOString();
  await writePrivate(FACT_FILE, facts);
  await writePrivate(CACHE_FILE, cache);
  return { parsed, kept, skipped, removed, seconds: (Date.now() - t0) / 1000 };
}

/** A query answers from the present: when any source changed since the
 *  index was built, refresh incrementally first (usually well under a
 *  second thanks to the per-file watermark). */
async function ensureFresh(): Promise<FactIndex> {
  const facts = await loadFacts();
  const cache = await loadCache();
  const files = await listSources();
  const keyed = await Promise.all(files.map(async (f) => ({ ...f, key: await canonicalPath(f.file) })));
  const known = (f: FileStat & { key: string }): boolean => {
    const p = facts.sessions[f.key];
    if (p) return p.mtime === f.mtime && p.size === f.size && !!cache.sessions[f.key];
    const sk = facts.skipped[f.key];
    return !!sk && sk.mtime === f.mtime && sk.size === f.size;
  };
  const stale = !facts.builtAt
    || keyed.some((f) => !known(f))
    || Object.keys(facts.sessions).length + Object.keys(facts.skipped).length !== keyed.length;
  if (!stale) return facts;
  const r = await buildIndex(false);
  console.error(`(index refreshed: ${r.parsed} session${r.parsed === 1 ? '' : 's'} re-read, ${r.removed} gone, ${r.seconds.toFixed(1)}s)`);
  return loadFacts();
}

interface Stats { sessions: number; sources: number; turns: number; artifacts: { file: number; url: number; arxiv: number; other: number }; touches: number; changes: number; withChangeHead: number; withMention: number }
const schemeOf = (id: string): keyof Stats['artifacts'] => id.startsWith('file://') ? 'file' : id.startsWith('arxiv:') ? 'arxiv' : /^https?:\/\//.test(id) ? 'url' : 'other';
const artifactsLine = (a: Stats['artifacts']): string => [`${a.file} files`, a.url ? `${a.url} urls` : '', a.arxiv ? `${a.arxiv} papers` : '', a.other ? `${a.other} other` : ''].filter(Boolean).join(' · ');

function summarize(facts: FactIndex, cache: CacheIndex): Stats {
  const seen = new Set<string>();
  const artifacts = { file: 0, url: 0, arxiv: 0, other: 0 };
  let turns = 0, touches = 0, changes = 0, withChangeHead = 0, withMention = 0;
  for (const [key, s] of Object.entries(facts.sessions)) {
    turns += s.turns.length;
    for (const t of s.turns) {
      const ct = cache.sessions[key]?.[String(t.i)];
      for (const [p, x] of Object.entries(t.ops)) {
        if (!seen.has(p)) { seen.add(p); artifacts[schemeOf(p)]++; }
        touches++;
        if (!readLike(x.op)) { changes++; if (x.d) withChangeHead++; }
        if (ct?.m?.[p]) withMention++;
      }
    }
  }
  const sessions = new Set(Object.values(facts.sessions).map((s) => s.id)).size;
  return { sessions, sources: Object.keys(facts.sessions).length, turns, artifacts, touches, changes, withChangeHead, withMention };
}

// ─── why ─────────────────────────────────────────────────────────────

interface Hit { session: FactSession; sourceKey: string; turn: FactTurn; touch: Touch }

const allPaths = (facts: FactIndex): Set<string> => {
  const all = new Set<string>();
  for (const s of Object.values(facts.sessions)) for (const t of s.turns) for (const p of Object.keys(t.ops)) all.add(p);
  return all;
};

/** Exact path first (as typed, then canonical). A bare name matches by
 *  suffix — inside this workspace unless --all: the same file name lives
 *  in many projects, and the question is about this one. */
async function resolveQuery(facts: FactIndex, arg: string, all: boolean): Promise<{ path: string | null; candidates: string[]; elsewhere: number }> {
  const ids = allPaths(facts);
  // a web resource or a paper has one exact identity — no suffix games
  const web = urlArtifact(arg) ?? arxivArtifact(arg);
  if (web) return ids.has(web.id) ? { path: web.id, candidates: [web.id], elsewhere: 0 } : { path: null, candidates: [], elsewhere: 0 };
  const abs = absolutePath(arg, process.cwd());
  if (abs) {
    const typed = fileUri(abs);
    if (ids.has(typed)) return { path: typed, candidates: [typed], elsewhere: 0 };
    const real = fileUri(await canonicalPath(abs));
    if (ids.has(real)) return { path: real, candidates: [real], elsewhere: 0 };
  }
  const needle = arg.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
  const files = [...ids].flatMap((id) => { const p = filePathOf(id); return p ? [{ id, p }] : []; });
  const bySuffix = files.filter(({ p }) => p === needle || p.endsWith(`/${needle}`));
  const ws = (await workspaceOf(process.cwd())).replace(/\\/g, '/');
  const inside = all ? bySuffix : bySuffix.filter(({ p }) => p.startsWith(`${ws}/`));
  if (inside.length === 1) return { path: inside[0].id, candidates: [inside[0].p], elsewhere: bySuffix.length - inside.length };
  return { path: null, candidates: inside.map((x) => x.p).sort(), elsewhere: bySuffix.length - inside.length };
}

/** Every turn that touched the file, once each: a continued session
 *  replays the turns it continued from under the same message ids, and
 *  those belong to the session that first recorded them. */
function hitsFor(facts: FactIndex, artifact: string, includeRead: boolean): { hits: Hit[]; readsHidden: number } {
  const all: Hit[] = [];
  const seen = new Set<string>();
  const sources = Object.entries(facts.sessions).sort((a, b) => a[1].mtime - b[1].mtime);
  for (const [sourceKey, session] of sources) {
    for (const turn of session.turns) {
      const touch = turn.ops[artifact];
      if (!touch) continue;
      if (turn.item) { if (seen.has(turn.item)) continue; seen.add(turn.item); }
      all.push({ session, sourceKey, turn, touch });
    }
  }
  // reads hide behind changes; an artifact that was only ever read (or
  // fetched — a paper, a page) shows its reads, or there is nothing to say
  const hasChanges = all.some((h) => !readLike(h.touch.op));
  if (includeRead || !hasChanges) return { hits: all, readsHidden: 0 };
  const hits = all.filter((h) => !readLike(h.touch.op));
  return { hits, readsHidden: all.length - hits.length };
}

const OP_MARK: Record<Op, string> = { edit: '✏️ edit ', write: '✏️ write', read: '📖 read ', fetch: '🌐 fetch' };
function when(t: FactTurn, s: FactSession): string {
  const d = new Date(t.at ?? s.mtime);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const EVIDENCE = {
  footprint: 'observed',
  change: 'observed, partial (first differing line)',
  askedBefore: 'inferred (the earlier question a bare reply answers)',
  about: 'inferred (a paragraph of the answer naming the file)',
  conclusion: 'inferred (the answer\'s closing paragraph)',
} as const;

/** Turn numbers count through a logical session's fragments in time
 *  order, so `#n` in why and `recall <session> n` agree even when the
 *  runner split the session across files. */
function fragmentsOf(facts: FactIndex, sessionId: string): { key: string; s: FactSession; offset: number }[] {
  const frags = Object.entries(facts.sessions).filter(([, s]) => s.id === sessionId).sort((a, b) => a[1].mtime - b[1].mtime);
  let offset = 0;
  return frags.map(([key, s]) => { const f = { key, s, offset }; offset += s.turns.length; return f; });
}
function turnNumber(facts: FactIndex, h: Hit): number {
  return (fragmentsOf(facts, h.session.id).find((f) => f.key === h.sourceKey)?.offset ?? 0) + h.turn.i;
}

async function printWhy(facts: FactIndex, file: string, hits: Hit[], readsHidden: number, cache: CacheIndex, limit: number, json: boolean): Promise<void> {
  const bySession = new Map<string, Hit[]>();
  for (const h of hits) (bySession.get(h.session.id) ?? bySession.set(h.session.id, []).get(h.session.id)!).push(h);
  const groups = [...bySession.values()]
    .map((hs) => hs.sort((a, b) => a.turn.i - b.turn.i))
    .sort((a, b) => (b[b.length - 1].turn.at ?? '').localeCompare(a[a.length - 1].turn.at ?? ''));
  const shown = new Set<Hit>();
  for (const g of groups) for (const h of g) if (shown.size < limit) shown.add(h);
  const interp = (h: Hit): CacheTurn => cache.sessions[h.sourceKey]?.[String(h.turn.i)] ?? {};

  if (json) {
    console.log(JSON.stringify({
      artifact: file, file: filePathOf(file), turns: hits.length, sessions: bySession.size, readsHidden, evidence: EVIDENCE,
      hits: [...shown].map((h) => {
        const c = interp(h);
        return {
          session: h.session.id, runner: h.session.runner, title: h.session.title, subagent: !!h.session.subagent,
          turn: turnNumber(facts, h), at: h.turn.at ?? null, op: h.touch.op, locators: h.touch.l ?? null, question: h.turn.q,
          askedBefore: c.p ?? null, change: h.touch.d ?? null, about: c.m?.[file] ?? null, conclusion: c.c ?? null,
          open: `thoughtdag://open?session=${h.session.id}`,
        };
      }),
    }, null, 1));
    return;
  }

  const label = await displayOf(file);
  const n = hits.length;
  const head = `why ${label}  ·  ${n} turn${n === 1 ? '' : 's'} in ${bySession.size} session${bySession.size === 1 ? '' : 's'}`;
  const notes = [
    readsHidden ? `${readsHidden} read${readsHidden === 1 ? '' : 's'} hidden, --include-read` : '',
    n > limit ? `showing ${limit}, --limit for more` : '',
  ].filter(Boolean);
  console.log(`${head}${notes.length ? `  (${notes.join('; ')})` : ''}\n`);
  let printed = 0;
  for (const g of groups) {
    const mine = g.filter((h) => shown.has(h));
    if (!mine.length) continue;
    const s = g[0].session;
    console.log(`${s.runner}  「${s.title.slice(0, 70)}」${s.subagent ? '  (subagent)' : ''}  thoughtdag://open?session=${s.id}`);
    for (const h of mine) {
      const c = interp(h);
      const where = h.touch.l?.map((l) => l.pages ? `p.${l.pages}` : l.lines ? `L${l.lines[0]}-${l.lines[1]}` : '').filter(Boolean).join(' ');
      console.log(`  ${when(h.turn, s)}  ${OP_MARK[h.touch.op]}  #${turnNumber(facts, h)}${where ? `  ${where}` : ''}`);
      console.log(`    Q: ${h.turn.q}${c.p ? `   ⤴ ${c.p}` : ''}`);
      if (h.touch.d) console.log(`    Δ ${h.touch.d}`);
      const about = c.m?.[file];
      if (about) console.log(`    ≈ ${about}`);
      else if (c.c) console.log(`    ≈ ${c.c}   (closing line)`);
      printed++;
    }
    console.log('');
  }
  if (!printed) console.log('(no turns)\n');
  console.log('Δ observed change · ≈ read from the answer, a candidate explanation, not a verified reason · ⤴ the earlier question this reply answers');
}

// ─── recall ──────────────────────────────────────────────────────────

async function recall(facts: FactIndex, sidPrefix: string, n: number): Promise<void> {
  const any = Object.values(facts.sessions).find((x) => x.id.startsWith(sidPrefix));
  if (!any) { console.error(`no session starts with ${sidPrefix}`); process.exit(1); }
  // the fragment that holds turn n of the logical session
  const frag = fragmentsOf(facts, any.id).find((f) => n >= f.offset && n < f.offset + f.s.turns.length);
  const s = frag?.s ?? any;
  const local = frag ? n - frag.offset : n;
  const collector = s.runner === 'codex' ? new CodexSessionCollector() : new ClaudeSessionCollector();
  const rl = createInterface({ input: createReadStream(s.file, { encoding: 'utf8', highWaterMark: 1 << 20 }) });
  for await (const line of rl) collector.feedLine(line);
  const turn = collector.finish()?.turns[local];
  if (!turn) { console.error(`session ${s.id.slice(0, 8)} has no turn #${n}`); process.exit(1); }
  console.log(`${s.runner}  「${s.title}」  turn #${n}${turn.at ? `  ${turn.at.slice(0, 16).replace('T', ' ')}` : ''}\n`);
  console.log(`## Question\n\n${turn.question.trim()}\n`);
  console.log(`## Answer\n\n${turn.response.trim() || '(none)'}\n`);
  if (turn.tools.length) {
    console.log(`## Tools (${turn.tools.length})\n`);
    for (const t of turn.tools) {
      console.log(`- ${t.name}${t.paths?.length ? `  ${t.paths.join(', ')}` : ''}`);
      if (t.op === 'edit' || t.op === 'write') console.log(t.call.slice(0, 1200).split('\n').map((l) => `    ${l}`).join('\n'));
    }
  }
}

// ─── main ────────────────────────────────────────────────────────────

const USAGE = `thoughtdag — the why layer

  thoughtdag index [--full]                        build or refresh the footprint index
  thoughtdag why <path> [--include-read] [--all] [--limit N] [--json]
                                                   the turns that touched a file, and what they said
  thoughtdag recall <session> <n>                  one turn in full (session id or prefix)
  thoughtdag status                                what the index holds, and how much is evidence
  thoughtdag purge [--cache]                       delete everything this tool stored (--cache: only the interpretation)
  thoughtdag events <session-file> [--touches]     the canonical events of one source file, one JSON per line
`;

async function main(argv: string[]): Promise<void> {
  const [cmd, ...rest] = argv;
  const flag = (name: string): boolean => rest.includes(`--${name}`);
  const value = (name: string): string | undefined => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : undefined; };
  const args = rest.filter((a, i) => !a.startsWith('--') && !(i > 0 && rest[i - 1] === '--limit'));

  if (cmd === 'index') {
    const r = await buildIndex(flag('full'));
    const st = summarize(await loadFacts(), await loadCache());
    console.log(`indexed ${r.parsed} session${r.parsed === 1 ? '' : 's'} (${r.kept} unchanged, ${r.skipped} not sessions, ${r.removed} gone) in ${r.seconds.toFixed(1)}s`);
    console.log(`${st.sessions} sessions in ${st.sources} files · ${st.turns} turns · ${artifactsLine(st.artifacts)} · ${HOME}`);
    return;
  }
  if (cmd === 'status') {
    const facts = await loadFacts();
    if (!facts.builtAt) { console.log('no index yet — run: thoughtdag index'); return; }
    const st = summarize(facts, await loadCache());
    const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : '–');
    console.log(`${st.sessions} sessions in ${st.sources} files · ${st.turns} turns · ${artifactsLine(st.artifacts)} · built ${facts.builtAt.slice(0, 16).replace('T', ' ')}`);
    console.log(`evidence: ${st.touches} touches · ${st.changes} edits/writes, ${st.withChangeHead} with an observed change head (${pct(st.withChangeHead, st.changes)} of changes, ${pct(st.withChangeHead, st.touches)} of touches) · ${st.withMention} answers name the file (${pct(st.withMention, st.touches)}, candidates only)`);
    console.log(`store: ${HOME} (0700) · fact-index.json + interpretation-cache.json (0600)`);
    return;
  }
  if (cmd === 'purge') {
    // --cache drops only the interpretation; the next index recomputes it
    const targets = flag('cache') ? [CACHE_FILE, `${CACHE_FILE}.tmp`] : [FACT_FILE, CACHE_FILE, LEGACY_FILE, `${FACT_FILE}.tmp`, `${CACHE_FILE}.tmp`];
    let n = 0;
    for (const f of targets) {
      try { await fsp.rm(f); n++; } catch { /* absent */ }
    }
    console.log(`removed ${n} file${n === 1 ? '' : 's'} from ${HOME}`);
    return;
  }
  if (cmd === 'why') {
    if (!args[0]) { console.error(USAGE); process.exit(2); }
    const facts = flag('no-refresh') ? await loadFacts() : await ensureFresh();
    if (!facts.builtAt) { console.error('no index yet — run: thoughtdag index'); process.exit(1); }
    const { path: file, candidates, elsewhere } = await resolveQuery(facts, args[0], flag('all'));
    if (!file) {
      if (candidates.length === 0) {
        console.log(elsewhere
          ? `why ${args[0]}  ·  no match in this workspace (${elsewhere} elsewhere, --all to include)`
          : `why ${args[0]}  ·  no session touched this file`);
        return;
      }
      console.log(`${candidates.length} files match "${args[0]}" — pick one:\n`);
      for (const c of candidates.slice(0, 20)) console.log(`  ${c}`);
      return;
    }
    const { hits, readsHidden } = hitsFor(facts, file, flag('include-read'));
    return printWhy(facts, file, hits, readsHidden, await loadCache(), Number(value('limit') ?? 10) || 10, flag('json'));
  }
  if (cmd === 'events') {
    if (!args[0]) { console.error(USAGE); process.exit(2); }
    const r = await eventsOf(path.resolve(process.cwd(), args[0]));
    if (!r) { console.error('not a session file'); process.exit(1); }
    if (flag('touches')) { for (const t of deriveTouches(r.events)) console.log(JSON.stringify(t)); return; }
    console.log(JSON.stringify({ kind: 'adapter.manifest', ...r.manifest }));
    for (const e of r.events) console.log(JSON.stringify(e));
    return;
  }
  if (cmd === 'recall') {
    if (!args[0] || args[1] === undefined) { console.error(USAGE); process.exit(2); }
    return recall(await ensureFresh(), args[0], Number(args[1]));
  }
  console.log(USAGE);
  if (cmd && cmd !== 'help' && cmd !== '--help') process.exit(2);
}

main(process.argv.slice(2)).catch((err) => { console.error(err instanceof Error ? err.message : String(err)); process.exit(1); });
