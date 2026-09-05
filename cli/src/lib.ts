// The why layer as a library: the stores under ~/.thoughtdag, the index over
// every runner's session files, and the four questions (why_check, why_file,
// find, recall_turn) as functions that return text. `main.ts` is the command
// line and the MCP server over this; the DeepSeek Harness plugin bundles it
// and registers the same four questions as native harness tools.
// thoughtdag — the why layer's command line.
//
//   thoughtdag index [--full]          build or refresh the footprint index
//   thoughtdag why <path> [--include-read] [--all] [--limit N] [--json]
//   thoughtdag recall <session> <n>    one turn in full
//   thoughtdag status                  what the index holds, and how much of it is evidence
//   thoughtdag purge                   delete everything this tool stored
//
// Facts come straight off tool calls in the local session files, never
// from free text or a model. Three stores, three kinds of content:
//   fact-index.json           observed events + verbatim excerpts + pointers
//   interpretation-cache.json heuristics read off the answers (deletable)
//   text-index.jsonl          what was asked, answered and attached, verbatim, one
//                             turn per line — streamed, never parsed whole — for exact
//                             phrase search (deletable, rebuilt on index); text-index.json
//                             is its small manifest (which sources are in it)
// Source files are read, never written. The index is derived and can
// always be rebuilt; a query refreshes it first when a source moved on.

import { promises as fsp, createReadStream, createWriteStream } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
import os from 'node:os';
import * as zlib from 'node:zlib';
import { ClaudeSessionCollector } from '../../src/lib/adapters/claude-code-session';
import { CodexSessionCollector } from '../../src/lib/adapters/codex-session';
import { DshSessionCollector } from '../../src/lib/adapters/dsh-session';
import { decompressZstdFrames } from '../../src/lib/adapters/dsh-zstd';
import { conclusionOf } from '../../src/lib/turn-insight';
import type { RunnerTurn } from '../../src/lib/adapters/shared';
import { sessionToEvents, deriveTouches, absolutePath, fileUri, filePathOf, urlArtifact, arxivArtifact, type ProjectableSession } from '../../src/lib/events/project';
import type { Locator } from '../../src/lib/events/types';
import { MANIFESTS } from '../../src/lib/events/manifests';
import { canvasToEvents, isCanvasBackup } from '../../src/lib/adapters/thoughtdag-canvas';
import type { CanonicalEvent } from '../../src/lib/events/types';

// ─── records ─────────────────────────────────────────────────────────

type Op = 'read' | 'fetch' | 'attach' | 'write' | 'edit';
const readLike = (op: Op): boolean => op === 'read' || op === 'fetch' || op === 'attach';
/** observed: the op, and the first differing line of the change (verbatim, partial) */
interface Touch { op: Op; d?: string; l?: Locator[] }
interface FactTurn { i: number; t: string; item?: string; at?: string; q: string; ops: Record<string, Touch> }
/** One SOURCE FILE's worth of facts. A logical session (`id`) can span
 *  several — a resumed Codex thread opens a new rollout each time — so
 *  the store is keyed by source, and readers group by `id`. */
interface FactSession {
  id: string; runner: 'claude-code' | 'codex' | 'dsh' | 'thoughtdag'; file: string; mtime: number; size: number;
  cwd: string; workspace: string; title: string; subagent?: boolean; turns: FactTurn[];
  /** opened from a canvas hand-off */
  anchor?: { project: string; node: string; bundle: string };
}
interface FactIndex {
  version: number; builtAt: string;
  /** keyed by canonical source file path */
  sessions: Record<string, FactSession>;
  /** display names for artifacts that are not files (a canvas attachment's file name) */
  names: Record<string, string>;
  /** bundles a canvas handed off (a `bundle` commit), by bundle id: what an anchor is checked against */
  bundles: Record<string, { canvas: string; node: string }>;
  /** .jsonl files seen that are not sessions, with the stat they had —
      remembered so a stray file does not make every query refresh */
  skipped: Record<string, { mtime: number; size: number }>;
}
/** heuristics: the answer's closing paragraph, the earlier ask a bare "ok"
 *  answers, the paragraph naming each file — candidates, not facts */
interface CacheTurn { c?: string; p?: string; m?: Record<string, string> }
interface CacheIndex { version: number; sessions: Record<string, Record<string, CacheTurn>> }
/** verbatim text per turn: q = what was asked, a = what was answered, m = what the
 *  node's materials say (extracted text, head only). Search runs over this. */
interface TextTurn { q: string; a: string; m?: string }
/** manifest of the text lines: source key → number of turns present */
interface TextIndex { version: number; sessions: Record<string, number> }
interface TextLine extends TextTurn { k: string; i: number }

const INDEX_VERSION = 10;
const EXCERPT = 200;

const HOME = process.env.THOUGHTDAG_HOME ?? path.join(os.homedir(), '.thoughtdag');
const FACT_FILE = path.join(HOME, 'fact-index.json');
const CACHE_FILE = path.join(HOME, 'interpretation-cache.json');
const TEXT_FILE = path.join(HOME, 'text-index.json');
const TEXT_LINES = path.join(HOME, 'text-index.jsonl');
const LEGACY_FILE = path.join(HOME, 'why-index.json');
const CONFIG_FILE = path.join(HOME, 'config.json');
// DSH keeps one directory per session under <DSH_HOME>/sessions/<encoded cwd>/
const DSH_ROOT = path.join(process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh'), 'sessions');
const ROOTS = (process.env.THOUGHTDAG_SESSION_ROOTS?.split(path.delimiter).filter(Boolean))
  ?? [path.join(os.homedir(), '.claude', 'projects'), path.join(os.homedir(), '.codex', 'sessions'), DSH_ROOT];

/** Folders holding canvases (*.thoughtdag.json). Always: the records the
 *  desktop app writes itself under <home>/canvases. Plus the env var, or
 *  what `index --canvas <dir>` remembered — backup folders, for canvases
 *  that live on another machine or were deleted from the app. The same
 *  project in two files collapses to one session. */
const CANVAS_RECORDS = path.join(HOME, 'canvases');
async function canvasRoots(): Promise<string[]> {
  const env = process.env.THOUGHTDAG_CANVAS_ROOTS?.split(path.delimiter).filter(Boolean);
  if (env) return [CANVAS_RECORDS, ...env];
  try { const c = JSON.parse(await fsp.readFile(CONFIG_FILE, 'utf8')) as { canvasRoots?: string[] }; return [CANVAS_RECORDS, ...(c.canvasRoots ?? [])]; } catch { return [CANVAS_RECORDS]; }
}
async function rememberCanvasRoot(dir: string): Promise<void> {
  const roots = await canvasRoots();
  const abs = path.resolve(dir);
  if (!roots.includes(abs)) await writePrivate(CONFIG_FILE, { canvasRoots: [...roots, abs] });
}

// ─── files ───────────────────────────────────────────────────────────

interface FileStat { file: string; mtime: number; size: number }

const isCanvasFile = (name: string): boolean => /\.thoughtdag\.json$/i.test(name);
// a runner's log: JSONL, or DSH's zstd-framed JSONL
const isSessionFile = (name: string): boolean => name.endsWith('.jsonl') || name.endsWith('.jsonl.zstd');

async function walk(dir: string, depth: number, out: FileStat[], accept: (name: string) => boolean): Promise<void> {
  if (depth > 5) return;
  let entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const ent of entries) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) await walk(p, depth + 1, out, accept);
    else if (ent.isFile() && accept(ent.name)) {
      try { const st = await fsp.stat(p); out.push({ file: p, mtime: st.mtimeMs, size: st.size }); } catch { /* raced */ }
    }
  }
}

async function listSources(): Promise<FileStat[]> {
  const files: FileStat[] = [];
  for (const root of ROOTS) await walk(root, 0, files, isSessionFile);
  for (const root of await canvasRoots()) await walk(root, 0, files, isCanvasFile);
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
async function displayOf(id: string, names: Record<string, string> = {}): Promise<string> {
  const p = filePathOf(id);
  if (!p) return names[id] ? `${names[id]}  (${id})` : id;
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
    // a sources list or a lead-in to a block names the file without saying anything about it
    .filter((p) => p.length > 12 && p.toLowerCase().includes(base) && !/[:：]$/.test(p) && !/^(sources?|references?|来源|参考)\b/i.test(p));
  const last = paras[paras.length - 1];
  return last ? clipLine(last, 240) : undefined;
}

function questionExcerpt(text: string): string {
  const cmd = text.match(/<command-name>([^<]+)<\/command-name>/);
  const line = (cmd ? cmd[1] : text).split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('<')) ?? '';
  return clipLine(line, EXCERPT);
}

// node:zlib grew zstd in 22.15; on an older Node a DSH log is skipped and
// `index` says so once, instead of failing the whole build.
const zstdInflate = (zlib as unknown as { zstdDecompressSync?: (b: Uint8Array) => Buffer }).zstdDecompressSync;
const ZSTD_MAX = 512 * 1024 * 1024;
let zstdSkipped = 0;

/** Read one source file through its adapter: a runner's JSONL through
 *  its collector, a canvas backup through the canvas adapter. Both come
 *  back as the same thing — events, plus the full text per turn that the
 *  interpretation cache reads and the fact index never stores. */
interface Projected {
  runner: FactSession['runner'];
  nativeId: string;
  title: string;
  anchor?: FactSession['anchor'];
  cwd?: string;
  subagent?: boolean;
  events: CanonicalEvent[];
  texts: Map<string, { question: string; response: string; material?: string }>;
  manifest: (typeof MANIFESTS)[string];
  /** jsonl only: the collector's turns, for `recall` */
  turns?: RunnerTurn[];
}

async function eventsOf(file: string, sourceId?: string): Promise<Projected | null> {
  if (isCanvasFile(file)) {
    let parsed: unknown;
    try { parsed = JSON.parse(await fsp.readFile(file, 'utf8')); } catch { return null; }
    if (!isCanvasBackup(parsed)) return null;
    const c = canvasToEvents(parsed, { file, sourceId });
    return { runner: 'thoughtdag', nativeId: c.nativeId, title: c.title, events: c.events, texts: c.texts, manifest: MANIFESTS.thoughtdag };
  }
  // DSH logs are zstd frames: whole-file decode (the frame walk needs the
  // container), then the same line-by-line collector as everyone else. The
  // other runners' plain JSONL streams through unchanged.
  let meta: { type?: string; id?: unknown } = {};
  let lines: Iterable<string> | AsyncIterable<string>;
  if (file.endsWith('.zstd')) {
    if (!zstdInflate) { zstdSkipped++; return null; }
    let raw: Buffer;
    try { raw = await fsp.readFile(file); } catch { return null; }
    if (raw.length > ZSTD_MAX) return null;
    let text: string;
    try { text = Buffer.from(decompressZstdFrames(raw, zstdInflate)).toString('utf8'); } catch { return null; }
    const arr = text.split('\n');
    try { meta = JSON.parse(arr[0] ?? '') as { type?: string; id?: unknown }; } catch { /* not json */ }
    lines = arr;
  } else {
    try { meta = JSON.parse(await firstLine(file)) as { type?: string; id?: unknown }; } catch { /* not json */ }
    lines = createInterface({ input: createReadStream(file, { encoding: 'utf8', highWaterMark: 1 << 20 }) });
  }
  // the runner is read off the first line's own signature, never off the folder
  const runner: 'claude-code' | 'codex' | 'dsh' = meta.type === 'session_meta' ? 'codex'
    : (meta.type === 'session' && typeof meta.id === 'string') ? 'dsh' : 'claude-code';
  const collector = runner === 'codex' ? new CodexSessionCollector() : runner === 'dsh' ? new DshSessionCollector() : new ClaudeSessionCollector();
  for await (const line of lines) collector.feedLine(line);
  const s = collector.finish();
  if (!s) return null;
  const subagent = 'subagent' in s ? !!s.subagent : runner === 'claude-code' && /\/subagents\//.test(file);
  const cwd = ('cwd' in s && s.cwd) ? s.cwd : undefined;
  const session: ProjectableSession = {
    runner, nativeId: s.sessionId, title: s.title, file, ...(sourceId ? { sourceId } : {}), schema: MANIFESTS[runner].schema,
    ...(cwd ? { cwd } : {}), ...(subagent ? { subagent } : {}), turns: s.turns,
  };
  const events = sessionToEvents(session);
  const texts = new Map<string, { question: string; response: string; material?: string }>();
  for (const e of events) if (e.kind === 'turn.started') { const t = s.turns[e.turnIndex]; if (t) texts.set(e.turnId, { question: t.question, response: t.response }); }
  const started = events.find((e): e is Extract<CanonicalEvent, { kind: 'session.started' }> => e.kind === 'session.started');
  const anchor = started?.anchor ? { project: started.anchor.project, node: started.anchor.node, bundle: started.anchor.bundle } : undefined;
  return { runner, nativeId: s.sessionId, title: s.title, ...(anchor ? { anchor } : {}), ...(cwd ? { cwd } : {}), ...(subagent ? { subagent } : {}), events, texts, manifest: MANIFESTS[runner], turns: s.turns };
}

async function parseSession(f: FileStat): Promise<{ fact: FactSession; cache: Record<string, CacheTurn>; text: Record<string, TextTurn>; names: Record<string, string>; bundles: FactIndex['bundles'] } | null> {
  const memo = new Map<string, string>();
  const sourceId = await canonicalPath(f.file, memo);
  const p = await eventsOf(f.file, sourceId);
  if (!p) return null;
  const cwd = p.cwd ? await canonicalPath(p.cwd, memo) : '';
  const workspace = cwd ? await workspaceOf(cwd) : '';
  // the index is a reduction of the contract: touches per turn, keyed by
  // canonical artifact id; names kept for artifacts that are not files
  const names: Record<string, string> = {};
  const opsByTurn = new Map<string, Record<string, Touch>>();
  for (const t of deriveTouches(p.events)) {
    const id = await canonicalArtifact(t.artifact, memo);
    const ops = opsByTurn.get(t.turnId) ?? opsByTurn.set(t.turnId, {}).get(t.turnId)!;
    const prev = ops[id];
    const d = prev?.d ?? t.change;
    const l = [...(prev?.l ?? []), ...(t.locators ?? [])].filter((x, i, arr) => arr.findIndex((y) => JSON.stringify(y) === JSON.stringify(x)) === i);
    ops[id] = { op: strongest(prev?.op, t.op as Op), ...(d ? { d } : {}), ...(l.length ? { l } : {}) };
  }
  for (const e of p.events) if (e.kind === 'artifact.attached' && e.artifact.observedPath && !e.artifact.id.startsWith('file://')) names[e.artifact.id] = e.artifact.observedPath;
  const bundles: FactIndex['bundles'] = {};
  for (const e of p.events) if (e.kind === 'context.committed' && e.hashOf === 'bundle' && e.turnId) bundles[e.requestId] = { canvas: p.nativeId, node: e.turnId.split('#').pop() ?? '' };
  const questions = new Map<string, string>();
  for (const e of p.events) if (e.kind === 'message.recorded' && e.role === 'user' && !questions.has(e.turnId)) questions.set(e.turnId, e.excerpt);
  const turns: FactTurn[] = [];
  const cache: Record<string, CacheTurn> = {};
  const text_: Record<string, TextTurn> = {};
  let lastSubstantive = '';
  const starts = p.events.filter((e): e is Extract<CanonicalEvent, { kind: 'turn.started' }> => e.kind === 'turn.started').sort((a, b) => a.turnIndex - b.turnIndex);
  for (const ts of starts) {
    const text = p.texts.get(ts.turnId);
    const q = text ? questionExcerpt(text.question) : (questions.get(ts.turnId) ?? (ts.mirrorOf ? '(mirrored turn)' : ''));
    // the id that makes a replayed turn count once across files: the
    // runner's own message id, or the mirrored turn's
    // A replayed record (a continued session carries its parent's turns
    // under the same message ids) counts once; a runner REUSING an id for a
    // new segment (~2) is a new turn and keeps its suffix.
    const item = ts.mirrorOf?.item ?? (p.runner === 'thoughtdag' ? ts.turnId : ts.turnId.split('#').pop());
    turns.push({ i: ts.turnIndex, t: ts.turnId, ...(item ? { item } : {}), ...(ts.at ? { at: ts.at } : {}), q, ops: opsByTurn.get(ts.turnId) ?? {} });
    if (!text) continue;
    // the words a turn can be found by — verbatim, all of them
    if (text.question.trim() || text.response.trim() || text.material?.trim()) {
      text_[String(ts.turnIndex)] = { q: text.question, a: text.response, ...(text.material ? { m: text.material } : {}) };
    }
    const entry: CacheTurn = {};
    const con = conclusionOf(text.response, 240);
    if (con) entry.c = con;
    if (q.length < 12 && lastSubstantive) entry.p = lastSubstantive;
    if (q.length >= 12) lastSubstantive = q;
    for (const id of Object.keys(opsByTurn.get(ts.turnId) ?? {})) {
      const m = mentionOf(text.response, mentionKey(names[id] ? `file://${names[id]}` : id));
      if (m) (entry.m ??= {})[id] = m;
    }
    if (Object.keys(entry).length) cache[String(ts.turnIndex)] = entry;
  }
  return {
    fact: { id: p.nativeId, runner: p.runner, file: f.file, mtime: f.mtime, size: f.size, cwd, workspace, title: p.title, ...(p.subagent ? { subagent: true } : {}), ...(p.anchor ? { anchor: p.anchor } : {}), turns },
    cache, text: text_, names, bundles,
  };
}

// ─── stores ──────────────────────────────────────────────────────────

const emptyFacts = (): FactIndex => ({ version: INDEX_VERSION, builtAt: '', sessions: {}, skipped: {}, names: {}, bundles: {} });
const emptyCache = (): CacheIndex => ({ version: INDEX_VERSION, sessions: {} });
const emptyText = (): TextIndex => ({ version: INDEX_VERSION, sessions: {} });

async function readJson<T>(file: string, empty: () => T): Promise<T> {
  try {
    const v = JSON.parse(await fsp.readFile(file, 'utf8')) as T & { version?: number };
    return v.version === INDEX_VERSION ? v : empty();
  } catch { return empty(); }
}

/** A temp name no other process can be using: pid and a time tag. Two
 *  queries refreshing at once used to share one `.tmp` and one of them
 *  lost the rename race. */
const tmpFor = (file: string): string => `${file}.${process.pid}.${Date.now().toString(36)}.tmp`;

const LOCK_FILE = path.join(HOME, 'index.lock');
const LOCK_STALE_MS = 10 * 60_000;

/** One refresher at a time. Returns a release function, or null when
 *  another live process holds the lock. A lock left by a dead process
 *  (or older than ten minutes) is broken. */
async function acquireLock(): Promise<(() => Promise<void>) | null> {
  await fsp.mkdir(HOME, { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fh = await fsp.open(LOCK_FILE, 'wx', 0o600);
      await fh.writeFile(JSON.stringify({ pid: process.pid, at: Date.now() }));
      await fh.close();
      return async () => { await fsp.rm(LOCK_FILE, { force: true }).catch(() => undefined); };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      let holder: { pid?: number; at?: number } = {};
      try { holder = JSON.parse(await fsp.readFile(LOCK_FILE, 'utf8')) as typeof holder; } catch { /* unreadable: treat as stale */ }
      const alive = (() => { if (!holder.pid) return false; try { process.kill(holder.pid, 0); return true; } catch { return false; } })();
      const stale = !alive || !holder.at || Date.now() - holder.at > LOCK_STALE_MS;
      if (!stale) return null;
      await fsp.rm(LOCK_FILE, { force: true }).catch(() => undefined);
    }
  }
  return null;
}

/** Wait for another process's refresh to finish (the lock to disappear),
 *  bounded; true when it did. */
async function waitForLock(maxMs = 20_000): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    try { await fsp.access(LOCK_FILE); } catch { return true; }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

/** Private by construction: the directory is 0700, every file 0600, and
 *  a write never leaves a half-written index behind. */
async function writePrivate(file: string, data: unknown): Promise<void> {
  await fsp.mkdir(HOME, { recursive: true, mode: 0o700 });
  await fsp.chmod(HOME, 0o700).catch(() => undefined);
  const tmp = tmpFor(file);
  await fsp.writeFile(tmp, JSON.stringify(data), { mode: 0o600 });
  await fsp.chmod(tmp, 0o600).catch(() => undefined);
  await fsp.rename(tmp, file);
}

const loadFacts = async (): Promise<FactIndex> => {
  const f = await readJson(FACT_FILE, emptyFacts);
  f.skipped ??= {}; f.sessions ??= {}; f.names ??= {}; f.bundles ??= {};
  return f;
};
const loadCache = (): Promise<CacheIndex> => readJson(CACHE_FILE, emptyCache);
const loadText = (): Promise<TextIndex> => readJson(TEXT_FILE, emptyText);

// ─── index ───────────────────────────────────────────────────────────

interface BuildReport { parsed: number; kept: number; skipped: number; removed: number; seconds: number; waited?: boolean }

/** The text lines file is rewritten by streaming: lines of unchanged
 *  sources pass through, lines of re-read or vanished sources are dropped,
 *  new lines are appended. Never held in memory whole. */
async function rewriteTextLines(replaced: Map<string, Record<string, TextTurn>>, removed: Set<string>, full: boolean): Promise<void> {
  await fsp.mkdir(HOME, { recursive: true, mode: 0o700 });
  const tmp = tmpFor(TEXT_LINES);
  const out = createWriteStream(tmp, { mode: 0o600 });
  const write = (line: string): Promise<void> => new Promise((res, rej) => { out.write(line + '\n', (e) => (e ? rej(e) : res())); });
  if (!full) {
    let old: ReturnType<typeof createInterface> | null = null;
    try { await fsp.access(TEXT_LINES); old = createInterface({ input: createReadStream(TEXT_LINES, { encoding: 'utf8', highWaterMark: 1 << 20 }) }); } catch { /* first build */ }
    if (old) {
      for await (const line of old) {
        const at = line.indexOf('"k":"'); if (at < 0) continue;
        const k = JSON.parse(line.slice(at + 4, line.indexOf('"', at + 5) + 1)) as string;
        if (replaced.has(k) || removed.has(k)) continue;
        await write(line);
      }
    }
  }
  for (const [k, turns] of replaced) {
    for (const [i, t] of Object.entries(turns)) await write(JSON.stringify({ k, i: Number(i), ...t } satisfies TextLine));
  }
  await new Promise<void>((res, rej) => out.end((e?: Error | null) => (e ? rej(e) : res())));
  await fsp.chmod(tmp, 0o600).catch(() => undefined);
  await fsp.rename(tmp, TEXT_LINES);
}

async function buildIndex(full: boolean, canvasDir?: string): Promise<BuildReport> {
  const t0 = Date.now();
  if (canvasDir) await rememberCanvasRoot(canvasDir);
  // one refresher at a time; a second caller waits for the first and
  // then simply reads what it wrote
  const release = await acquireLock();
  if (!release) {
    const done = await waitForLock();
    return { parsed: 0, kept: 0, skipped: 0, removed: 0, seconds: (Date.now() - t0) / 1000, waited: done };
  }
  try {
    return await buildIndexLocked(full, t0);
  } finally {
    await release();
  }
}

async function buildIndexLocked(full: boolean, t0: number): Promise<BuildReport> {
  await fsp.rm(LEGACY_FILE, { force: true }).catch(() => undefined);
  const facts = full ? emptyFacts() : await loadFacts();
  const cache = full ? emptyCache() : await loadCache();
  const text = full ? emptyText() : await loadText();
  const files = await listSources();
  let parsed = 0, kept = 0, skipped = 0, removed = 0;
  const seen = new Set<string>();
  const replacedText = new Map<string, Record<string, TextTurn>>();
  const removedKeys = new Set<string>();
  for (const f of files) {
    const key = await canonicalPath(f.file);
    seen.add(key);
    const prev = facts.sessions[key];
    const sk = facts.skipped[key];
    if (sk && sk.mtime === f.mtime && sk.size === f.size) { skipped++; continue; }
    // unchanged AND its interpretation is still there: a deleted cache
    // must come back on the next index, or "deletable" was a lie
    // presence, not truthiness: a session with no text at all (an empty rollout) is still indexed
    if (prev && prev.mtime === f.mtime && prev.size === f.size && key in cache.sessions && key in text.sessions) { kept++; continue; }
    const r = await parseSession(f).catch(() => null);
    if (!r) { facts.skipped[key] = { mtime: f.mtime, size: f.size }; skipped++; continue; }
    delete facts.skipped[key];
    facts.sessions[key] = r.fact;
    cache.sessions[key] = r.cache;
    replacedText.set(key, r.text);
    text.sessions[key] = Object.keys(r.text).length;
    Object.assign(facts.names, r.names);
    Object.assign(facts.bundles, r.bundles);
    parsed++;
  }
  for (const key of Object.keys(facts.sessions)) {
    if (!seen.has(key)) { delete facts.sessions[key]; delete cache.sessions[key]; delete text.sessions[key]; removedKeys.add(key); removed++; }
  }
  for (const key of Object.keys(facts.skipped)) if (!seen.has(key)) delete facts.skipped[key];
  facts.builtAt = new Date().toISOString();
  await writePrivate(FACT_FILE, facts);
  await writePrivate(CACHE_FILE, cache);
  if (full || replacedText.size || removedKeys.size) await rewriteTextLines(replacedText, removedKeys, full);
  await writePrivate(TEXT_FILE, text);
  return { parsed, kept, skipped, removed, seconds: (Date.now() - t0) / 1000 };
}

/** A query answers from the present: when any source changed since the
 *  index was built, refresh incrementally first (usually well under a
 *  second thanks to the per-file watermark). */
async function ensureFresh(): Promise<FactIndex> {
  const facts = await loadFacts();
  const cache = await loadCache();
  const text = await loadText();
  const files = await listSources();
  const keyed = await Promise.all(files.map(async (f) => ({ ...f, key: await canonicalPath(f.file) })));
  const known = (f: FileStat & { key: string }): boolean => {
    const p = facts.sessions[f.key];
    if (p) return p.mtime === f.mtime && p.size === f.size && f.key in cache.sessions && f.key in text.sessions;
    const sk = facts.skipped[f.key];
    return !!sk && sk.mtime === f.mtime && sk.size === f.size;
  };
  const stale = !facts.builtAt
    || keyed.some((f) => !known(f))
    || Object.keys(facts.sessions).length + Object.keys(facts.skipped).length !== keyed.length;
  if (!stale) return facts;
  const r = await buildIndex(false);
  if (r.waited !== undefined) console.error(r.waited ? '(index refreshed by another process)' : '(index refresh in progress elsewhere; answering from the current index)');
  else console.error(`(index refreshed: ${r.parsed} session${r.parsed === 1 ? '' : 's'} re-read, ${r.removed} gone, ${r.seconds.toFixed(1)}s)`);
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
async function resolveQuery(facts: FactIndex, rawArg: string, all: boolean): Promise<{ path: string | null; candidates: string[]; elsewhere: number }> {
  // agents hand us paths as their host writes them: `@file` (a Claude Code
  // reference), quoted, or with a trailing colon — the target is the path
  const arg = rawArg.trim().replace(/^@/, '').replace(/^["'`]|["'`:]+$/g, '');
  const ids = allPaths(facts);
  // a web resource or a paper has one exact identity — no suffix games
  const web = urlArtifact(arg) ?? arxivArtifact(arg);
  if (web) return ids.has(web.id) ? { path: web.id, candidates: [web.id], elsewhere: 0 } : { path: null, candidates: [], elsewhere: 0 };
  if (arg.startsWith('thoughtdag:')) return ids.has(arg) ? { path: arg, candidates: [arg], elsewhere: 0 } : { path: null, candidates: [], elsewhere: 0 };
  // a canvas attachment answers to its file name
  const named = Object.entries(facts.names).filter(([, name]) => name === arg || name.endsWith(`/${arg}`)).map(([id]) => id);
  if (named.length === 1) return { path: named[0], candidates: named, elsewhere: 0 };
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

/** An anchor is a CLAIM in a session's first message. It is matched when
 *  an indexed canvas logged that bundle's hand-off from that node,
 *  mismatched when the bundle exists but names another node, unverified
 *  when no indexed canvas knows the bundle (older hand-offs, or a canvas
 *  folder not yet indexed). */
type AnchorStatus = 'matched' | 'mismatch' | 'unverified';
function anchorStatus(facts: FactIndex, a: NonNullable<FactSession['anchor']>): AnchorStatus {
  const b = facts.bundles[a.bundle];
  if (!b) return 'unverified';
  return b.node === a.node ? 'matched' : 'mismatch';
}

/** Where a hit opens: the mirrored session at that very turn, or the
 *  canvas project at that node. */
function openLink(h: Hit): string {
  // canvas: the project's own id when the backup carried one, its name otherwise
  if (h.session.runner === 'thoughtdag') return `thoughtdag://open?canvas=${encodeURIComponent(h.session.id)}&node=${encodeURIComponent(h.turn.t.split('#').pop() ?? '')}`;
  return `thoughtdag://open?session=${h.session.id}${h.turn.item ? `&turn=${encodeURIComponent(h.turn.item)}` : ''}`;
}

const OP_MARK: Record<Op, string> = { edit: '✏️ edit ', write: '✏️ write', read: '📖 read ', fetch: '🌐 fetch', attach: '📎 attach' };
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

async function renderWhy(facts: FactIndex, file: string, hits: Hit[], readsHidden: number, cache: CacheIndex, limit: number, json: boolean): Promise<string> {
  const out: string[] = [];
  const bySession = new Map<string, Hit[]>();
  for (const h of hits) (bySession.get(h.session.id) ?? bySession.set(h.session.id, []).get(h.session.id)!).push(h);
  const groups = [...bySession.values()]
    .map((hs) => hs.sort((a, b) => a.turn.i - b.turn.i))
    .sort((a, b) => (b[b.length - 1].turn.at ?? '').localeCompare(a[a.length - 1].turn.at ?? ''));
  const shown = new Set<Hit>();
  for (const g of groups) for (const h of g) if (shown.size < limit) shown.add(h);
  const interp = (h: Hit): CacheTurn => cache.sessions[h.sourceKey]?.[String(h.turn.i)] ?? {};

  if (json) {
    out.push(JSON.stringify({
      artifact: file, file: filePathOf(file), turns: hits.length, sessions: bySession.size, readsHidden, evidence: EVIDENCE,
      hits: [...shown].map((h) => {
        const c = interp(h);
        return {
          session: h.session.id, runner: h.session.runner, title: h.session.title, subagent: !!h.session.subagent,
          anchor: h.session.anchor ? { ...h.session.anchor, status: anchorStatus(facts, h.session.anchor) } : null,
          turn: turnNumber(facts, h), at: h.turn.at ?? null, op: h.touch.op, locators: h.touch.l ?? null, question: h.turn.q,
          askedBefore: c.p ?? null, change: h.touch.d ?? null, about: c.m?.[file] ?? null, conclusion: c.c ?? null,
          open: openLink(h),
        };
      }),
    }, null, 1));
    return out.join('\n');
  }

  const label = await displayOf(file, facts.names);
  const n = hits.length;
  const head = `why ${label}  ·  ${n} turn${n === 1 ? '' : 's'} in ${bySession.size} session${bySession.size === 1 ? '' : 's'}`;
  const notes = [
    readsHidden ? `${readsHidden} read${readsHidden === 1 ? '' : 's'} hidden, --include-read` : '',
    n > limit ? `showing ${limit}, --limit for more` : '',
  ].filter(Boolean);
  out.push(`${head}${notes.length ? `  (${notes.join('; ')})` : ''}\n`);
  let printed = 0;
  for (const g of groups) {
    const mine = g.filter((h) => shown.has(h));
    if (!mine.length) continue;
    const s = g[0].session;
    out.push(`${s.runner}  「${s.title.slice(0, 70)}」${s.subagent ? '  (subagent)' : ''}${s.anchor ? `  ↩ from canvas node ${s.anchor.node} (${s.anchor.bundle}, ${anchorStatus(facts, s.anchor)})` : ''}`);
    for (const h of mine) {
      const c = interp(h);
      const where = h.touch.l?.map((l) => l.pages ? `p.${l.pages}` : l.lines ? `L${l.lines[0]}-${l.lines[1]}` : '').filter(Boolean).join(' ');
      out.push(`  ${when(h.turn, s)}  ${OP_MARK[h.touch.op]}  #${turnNumber(facts, h)}${where ? `  ${where}` : ''}  ${openLink(h)}`);
      out.push(`    Q: ${h.turn.q}${c.p ? `   ⤴ ${c.p}` : ''}`);
      if (h.touch.d) out.push(`    Δ ${h.touch.d}`);
      const about = c.m?.[file];
      if (about) out.push(`    ≈ ${about}`);
      else if (c.c) out.push(`    ≈ ${c.c}   (closing line)`);
      printed++;
    }
    out.push('');
  }
  if (!printed) out.push('(no turns)\n');
  out.push('Δ observed change · ≈ read from the answer, a candidate explanation, not a verified reason · ⤴ the earlier question this reply answers');
  return out.join('\n');
}

// ─── find ────────────────────────────────────────────────────────────

/** Exact phrase, case-insensitive, over everything that was said: the
 *  questions (Q), the answers (A) and the text of attached materials (M),
 *  all verbatim. Recall is bounded by wording — a synonym is not a hit —
 *  and every hit is a quote with a pointer, never a guess. */
interface FindHit { session: FactSession; sourceKey: string; turn: FactTurn; where: 'Q' | 'A' | 'M'; snippet: string }

function snippetAround(text: string, needle: string, width = 70): string {
  const at = text.toLowerCase().indexOf(needle);
  if (at < 0) return '';
  const start = Math.max(0, at - width); const end = Math.min(text.length, at + needle.length + width);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${end < text.length ? '…' : ''}`;
}

async function findHits(facts: FactIndex, phrase: string, scope: 'q' | 'a' | 'm' | 'all'): Promise<FindHit[]> {
  const needle = phrase.toLowerCase();
  const turnsOf = new Map<string, Map<number, FactTurn>>();
  const lookup = (k: string, i: number): FactTurn | undefined => {
    let m = turnsOf.get(k);
    if (!m) { m = new Map(facts.sessions[k]?.turns.map((t) => [t.i, t]) ?? []); turnsOf.set(k, m); }
    return m.get(i);
  };
  const raw: FindHit[] = [];
  let lines: ReturnType<typeof createInterface> | null = null;
  try { await fsp.access(TEXT_LINES); lines = createInterface({ input: createReadStream(TEXT_LINES, { encoding: 'utf8', highWaterMark: 1 << 20 }) }); } catch { return []; }
  for await (const line of lines) {
    // cheap gate before any parsing: the phrase must be somewhere in the line
    if (!line.toLowerCase().includes(needle)) continue;
    let t: TextLine;
    try { t = JSON.parse(line) as TextLine; } catch { continue; }
    const session = facts.sessions[t.k]; const turn = lookup(t.k, t.i);
    if (!session || !turn) continue;
    const fields: ['Q' | 'A' | 'M', string | undefined][] = [['Q', t.q], ['A', t.a], ['M', t.m]];
    for (const [where, body] of fields) {
      if (!body) continue;
      if (scope !== 'all' && where.toLowerCase() !== scope) continue;
      if (!body.toLowerCase().includes(needle)) continue;
      raw.push({ session, sourceKey: t.k, turn, where, snippet: snippetAround(body, needle) });
      break; // one hit per turn, the strongest field first
    }
  }
  // a replayed turn counts once, credited to the session that first recorded it
  const seen = new Set<string>();
  const hits: FindHit[] = [];
  for (const h of raw.sort((a, b) => a.session.mtime - b.session.mtime)) {
    if (h.turn.item) { if (seen.has(h.turn.item)) continue; seen.add(h.turn.item); }
    hits.push(h);
  }
  return hits.sort((a, b) => (b.turn.at ?? '').localeCompare(a.turn.at ?? ''));
}

function renderFind(facts: FactIndex, phrase: string, hits: FindHit[], limit: number, json: boolean): string {
  const out: string[] = [];
  const shown = hits.slice(0, limit);
  const sessions = new Set(hits.map((h) => h.session.id)).size;
  if (json) {
    out.push(JSON.stringify({ phrase, turns: hits.length, sessions, evidence: { Q: 'observed (a question, verbatim)', A: 'observed (an answer, verbatim)', M: "observed (an attached material's text, verbatim)" },
      hits: shown.map((h) => ({ session: h.session.id, runner: h.session.runner, title: h.session.title, turn: turnNumber(facts, h), at: h.turn.at ?? null, where: h.where, snippet: h.snippet, open: openLink(h) })) }, null, 1));
    return out.join('\n');
  }
  out.push(`find "${phrase}"  ·  ${hits.length} turn${hits.length === 1 ? '' : 's'} in ${sessions} session${sessions === 1 ? '' : 's'}${hits.length > limit ? `  (showing ${limit}, --limit for more)` : ''}\n`);
  for (const h of shown) {
    const s = h.session;
    out.push(`${when(h.turn, s)}  ${s.runner}  「${s.title.slice(0, 60)}」  #${turnNumber(facts, h)}  ${openLink(h)}`);
    out.push(`    ${h.where}: ${h.snippet}`);
  }
  if (!shown.length) out.push('(nothing asked, answered or attached in those words — try another wording; matching is exact)');
  else out.push('\nQ: asked · A: answered · M: in an attached material — all verbatim; the phrase must appear in those words');
  return out.join('\n');
}

// ─── check ───────────────────────────────────────────────────────────

/** The cheap question an agent asks before touching a file: is there any
 *  history here at all? Facts only, one line, exit code 0 when there is.
 *  Reads a recent index as-is (the last ten minutes), refreshes only when
 *  it is older — a rule that fires before every edit must cost almost
 *  nothing. */
const CHECK_FRESH_MS = 10 * 60_000;

async function factsForCheck(force: boolean): Promise<FactIndex> {
  const facts = await loadFacts();
  const age = facts.builtAt ? Date.now() - new Date(facts.builtAt).getTime() : Infinity;
  return force || age > CHECK_FRESH_MS ? ensureFresh() : facts;
}

function renderCheck(facts: FactIndex, arg: string, file: string | null, hits: Hit[], json: boolean): { text: string; has: boolean } {
  const changes = hits.filter((h) => !readLike(h.touch.op)).length;
  const reads = hits.length - changes;
  const sessions = new Set(hits.map((h) => h.session.id)).size;
  const latest = hits.map((h) => h.turn.at ?? '').filter(Boolean).sort().pop();
  const has = hits.length > 0;
  if (json) return { text: JSON.stringify({ query: arg, artifact: file, history: has, turns: hits.length, sessions, changes, reads, latest: latest ?? null }), has };
  if (!has) return { text: `${arg}: no history`, has };
  const parts = [`${hits.length} turn${hits.length === 1 ? '' : 's'} in ${sessions} session${sessions === 1 ? '' : 's'}`, changes ? `${changes} edit${changes === 1 ? '' : 's'}/write${changes === 1 ? '' : 's'}` : '', reads ? `${reads} read${reads === 1 ? '' : 's'}` : '', latest ? `latest ${latest.slice(0, 10)}` : ''].filter(Boolean);
  return { text: `${arg}: ${parts.join(' · ')}  →  thoughtdag why ${arg}`, has };
}

// ─── recall ──────────────────────────────────────────────────────────

async function renderRecall(facts: FactIndex, sidPrefix: string, n: number): Promise<string> {
  const out: string[] = [];
  const any = Object.values(facts.sessions).find((x) => x.id.startsWith(sidPrefix));
  if (!any) throw new Error(`no session starts with ${sidPrefix}`);
  // the fragment that holds turn n of the logical session
  const frag = fragmentsOf(facts, any.id).find((f) => n >= f.offset && n < f.offset + f.s.turns.length);
  const s = frag?.s ?? any;
  const local = frag ? n - frag.offset : n;
  const p = await eventsOf(s.file);
  const turn = p?.turns?.[local] ?? (() => {
    // a canvas turn: the node's own text
    const tid = s.turns[local]?.t;
    const text = tid ? p?.texts.get(tid) : undefined;
    return text ? { question: text.question, response: text.response, tools: [] as RunnerTurn['tools'], at: s.turns[local]?.at } : undefined;
  })();
  if (!turn) throw new Error(`session ${s.id.slice(0, 8)} has no turn #${n}`);
  out.push(`${s.runner}  「${s.title}」  turn #${n}${turn.at ? `  ${turn.at.slice(0, 16).replace('T', ' ')}` : ''}\n`);
  out.push(`## Question\n\n${turn.question.trim()}\n`);
  out.push(`## Answer\n\n${turn.response.trim() || '(none)'}\n`);
  if (turn.tools.length) {
    out.push(`## Tools (${turn.tools.length})\n`);
    for (const t of turn.tools) {
      out.push(`- ${t.name}${t.paths?.length ? `  ${t.paths.join(', ')}` : ''}`);
      if (t.op === 'edit' || t.op === 'write') out.push(t.call.slice(0, 1200).split('\n').map((l) => `    ${l}`).join('\n'));
    }
  }
  return out.join('\n');
}

// ─── mcp ─────────────────────────────────────────────────────────────
//
// The same four questions as tools an agent calls itself, over the Model
// Context Protocol's stdio transport (newline-delimited JSON-RPC 2.0).
// Read-only by construction: nothing here writes a canvas or a session.
// stdout carries protocol frames only; every notice goes to stderr.

const CLI_VERSION = '0.1.0';
const MCP_TOOLS = [
  { name: 'why_check', description: 'Cheap first question before editing a file: does this artifact have any history in local agent sessions? One line; history true/false.', inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'file path (absolute or relative to cwd), URL, or arxiv:<id>' } }, required: ['path'] } },
  { name: 'why_file', description: 'The turns across local Claude Code, Codex, DeepSeek Harness and ThoughtDAG sessions that touched a file, URL or paper: when, what changed (Δ, observed), what was asked, what the answer said about it (≈, a candidate explanation, not a verified reason). Each hit carries a deep link.', inputSchema: { type: 'object', properties: { path: { type: 'string' }, include_read: { type: 'boolean', description: 'also list turns that only read it (default false)' }, limit: { type: 'number', description: 'max hits (default 10)' } }, required: ['path'] } },
  { name: 'find', description: 'Where these exact words were asked (Q), answered (A) or attached (M) across local sessions and canvases. Exact, case-insensitive match; every hit is a verbatim snippet with a pointer.', inputSchema: { type: 'object', properties: { phrase: { type: 'string' }, in: { type: 'string', enum: ['q', 'a', 'm', 'all'] }, limit: { type: 'number' } }, required: ['phrase'] } },
  { name: 'recall_turn', description: 'One turn in full — the question, the answer, the tool calls with their diffs — by session id (or prefix) and turn number as shown by why_file.', inputSchema: { type: 'object', properties: { session: { type: 'string' }, turn: { type: 'number' } }, required: ['session', 'turn'] } },
];

async function mcpCall(name: string, a: Record<string, unknown>): Promise<string> {
  if (name === 'why_check') {
    const facts = await factsForCheck(false);
    const q = String(a.path ?? '');
    const { path: file } = await resolveQuery(facts, q, false);
    return renderCheck(facts, q, file, file ? hitsFor(facts, file, true).hits : [], false).text;
  }
  if (name === 'why_file') {
    const facts = await ensureFresh();
    const q = String(a.path ?? '');
    const { path: file, candidates, elsewhere } = await resolveQuery(facts, q, false);
    if (!file) return candidates.length ? `${candidates.length} files match "${q}" — pick one:\n${candidates.slice(0, 20).map((c) => `  ${c}`).join('\n')}` : elsewhere ? `no match in this workspace (${elsewhere} elsewhere)` : `no session touched ${q}`;
    const { hits, readsHidden } = hitsFor(facts, file, a.include_read === true);
    return renderWhy(facts, file, hits, readsHidden, await loadCache(), Number(a.limit ?? 10) || 10, false);
  }
  if (name === 'find') {
    const facts = await ensureFresh();
    const scope = (['q', 'a', 'm'] as const).find((x) => x === a.in) ?? 'all';
    return renderFind(facts, String(a.phrase ?? ''), await findHits(facts, String(a.phrase ?? ''), scope), Number(a.limit ?? 10) || 10, false);
  }
  if (name === 'recall_turn') return renderRecall(await ensureFresh(), String(a.session ?? ''), Number(a.turn ?? 0));
  throw new Error(`unknown tool: ${name}`);
}


export {
  HOME,
  FACT_FILE,
  CACHE_FILE,
  TEXT_FILE,
  TEXT_LINES,
  LEGACY_FILE,
  zstdSkipped,
  eventsOf,
  LOCK_FILE,
  loadFacts,
  loadCache,
  buildIndex,
  ensureFresh,
  artifactsLine,
  summarize,
  resolveQuery,
  hitsFor,
  when,
  renderWhy,
  findHits,
  renderFind,
  factsForCheck,
  renderCheck,
  renderRecall,
  CLI_VERSION,
  MCP_TOOLS,
  mcpCall,
};
