import type { RunnerTool, RunnerTurn } from '../adapters/shared';
import type {
  ArtifactRef, ArtifactTouch, CanonicalEvent, Evidence, MessageRecorded, SourcePointer, ToolCalled, ToolCompleted, ToolOp,
  TurnStarted, SessionStarted, BoundaryCompaction,
} from './types';
import { EVENT_SCHEMA } from './types';

// Projection of what the collectors already produce (turns with paired
// tools) onto canonical events. The collectors are not rewritten: this
// is a pure function over their output, so the canvas keeps working
// unchanged while every other reader moves to events. The loss is
// declared, not hidden: a turn's assistant text arrives as ONE message
// record (manifest: messages partial).

export const EXCERPT_CHARS = 200;

/** A collector's turn, plus what the tree-aware collectors add. */
export interface ProjectableTurn extends RunnerTurn {
  parentItemId?: string;
  compactionBefore?: string;
}

export interface ProjectableSession {
  runner: string;
  nativeId: string;
  title: string;
  file: string;
  /** canonical identity of the source file; defaults to `file` */
  sourceId?: string;
  schema: string;
  cwd?: string;
  workspace?: string;
  parentSessionId?: string;
  subagent?: boolean;
  turns: ProjectableTurn[];
}

const OBS_FULL: Evidence = { basis: 'observed', completeness: 'full' };
const OBS_PART: Evidence = { basis: 'observed', completeness: 'partial' };

const clip = (s: string, max = EXCERPT_CHARS): string => {
  const t = s.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
};

/** Everything an adapter tells us about a turn's identity funnels into
 *  one string, so ids survive rebuilds and never depend on position alone. */
export const sessionKey = (runner: string, nativeId: string): string => `${runner}:${nativeId}`;

/** Short, stable tag for a source file — the fragment discriminator on
 *  session-level events (djb2, base36; no crypto needed in a browser). */
export function fragmentTag(sourceId: string): string {
  let h = 5381;
  for (let i = 0; i < sourceId.length; i++) h = ((h << 5) + h + sourceId.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** One key per conversation segment, even when a runner reuses its turn
 *  id: a codex turn that resumes after a compaction — with new user input
 *  in between — carries the same turn_id twice. The second segment gets
 *  `~2`; deterministic by order of appearance, so ids stay stable. */
function turnKeys(session: string, turns: ProjectableTurn[]): string[] {
  const seen = new Map<string, number>();
  return turns.map((t, i) => {
    const base = t.itemIds[0] ?? `i${i}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? `${session}#${base}` : `${session}#${base}~${n}`;
  });
}

// ─── artifact identity ───────────────────────────────────────────────
//
// One id per thing, by scheme. Deterministic from what the tool wrote;
// anything that cannot be pinned down is NOT an artifact (a relative path
// with no cwd, a malformed URL) — better absent than guessed.

const isWindowsAbs = (p: string): boolean => /^[A-Za-z]:[\\/]/.test(p);

/** POSIX or Windows path → normalized absolute path with forward slashes,
 *  `.` and `..` resolved lexically. Symlink resolution needs a filesystem
 *  and is the index's job. */
export function absolutePath(observed: string, cwd?: string): string | null {
  const p = observed.replace(/\\/g, '/');
  let base: string;
  if (p.startsWith('/') || isWindowsAbs(p)) base = p;
  else if (cwd) base = `${cwd.replace(/\\/g, '/').replace(/\/+$/, '')}/${p}`;
  else return null;
  const drive = isWindowsAbs(base) ? base.slice(0, 2) : '';
  const parts: string[] = [];
  for (const seg of base.slice(drive.length).split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') { parts.pop(); continue; }
    parts.push(seg);
  }
  return `${drive}/${parts.join('/')}`;
}

/** file:///abs/path with every segment percent-encoded (spaces, #, %,
 *  non-ASCII), slashes kept; a Windows drive rides as file:///C:/… */
export function fileUri(absPath: string): string {
  const drive = isWindowsAbs(absPath) ? absPath.slice(0, 2) : '';
  const rest = absPath.slice(drive.length);
  const encoded = rest.split('/').map((seg) => encodeURIComponent(seg)).join('/');
  return `file://${drive ? `/${drive}` : ''}${encoded}`;
}

/** The path back out of a file:// id. */
export function filePathOf(id: string): string | null {
  if (!id.startsWith('file://')) return null;
  const raw = id.slice('file://'.length);
  const decoded = raw.split('/').map((seg) => { try { return decodeURIComponent(seg); } catch { return seg; } }).join('/');
  return /^\/[A-Za-z]:\//.test(decoded) ? decoded.slice(1) : decoded;
}

export function fileArtifact(observed: string, cwd?: string): ArtifactRef | null {
  const abs = absolutePath(observed, cwd);
  return abs ? { id: fileUri(abs), observedPath: observed } : null;
}

const ARXIV_RE = /^\/(?:abs|pdf|html)\/(\d{4}\.\d{4,5})(?:v\d+)?(?:\.pdf)?\/?$/;

/** A fetched URL → `arxiv:<id>` when it is an arXiv paper (version and
 *  abs/pdf/html spelling folded into one identity, the URL kept as
 *  observed), else the URL itself with host lowercased and fragment
 *  dropped. Not a URL → not an artifact. */
export function urlArtifact(url: string): ArtifactRef | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase();
  if (host === 'arxiv.org' || host === 'www.arxiv.org') {
    const m = u.pathname.match(ARXIV_RE);
    if (m) return { id: `arxiv:${m[1]}`, observedPath: url };
  }
  u.hash = '';
  return { id: u.href, observedPath: url };
}

/** An arXiv id typed by hand ("arxiv:2401.12345", "2401.12345") → canonical. */
export function arxivArtifact(text: string): ArtifactRef | null {
  const m = text.trim().match(/^(?:arxiv:)?(\d{4}\.\d{4,5})(?:v\d+)?$/i);
  return m ? { id: `arxiv:${m[1]}`, observedPath: text } : null;
}

/** Every artifact one tool call touched: its files (with the locator the
 *  call used) and the URL it fetched. */
export function toolArtifacts(tool: RunnerTool, cwd?: string): ArtifactRef[] {
  const out: ArtifactRef[] = [];
  for (const p of tool.paths ?? []) {
    const a = fileArtifact(p, cwd);
    if (a) out.push(tool.locator ? { ...a, locator: tool.locator } : a);
  }
  if (tool.url) { const a = urlArtifact(tool.url); if (a) out.push(a); }
  return out;
}

/** The first line that actually changed: an Edit's old → new, a codex
 *  patch's first removed → added line, a Write's opening line. */
export function changeHead(t: RunnerTool): string | undefined {
  const one = (s: string, max = 70): string => { const l = s.trim(); return l.length > max ? `${l.slice(0, max)}…` : l; };
  if (t.op === 'edit' && /^\*\*\* Begin Patch/m.test(t.call)) {
    const lines = t.call.split('\n');
    const minus = lines.find((l) => l.startsWith('-') && !l.startsWith('---'))?.slice(1) ?? '';
    const plus = lines.find((l) => l.startsWith('+') && !l.startsWith('+++'))?.slice(1) ?? '';
    if (minus || plus) return `${one(minus) || '∅'} → ${one(plus) || '∅'}`;
  }
  if (t.op === 'edit') {
    const m = t.call.match(/\n--- old\n([\s\S]*?)\n\+\+\+ new\n([\s\S]*)$/);
    if (!m) return undefined;
    const a = m[1].split('\n'); const b = m[2].split('\n');
    let k = 0;
    while (k < a.length && k < b.length && a[k] === b[k]) k++;
    const before = a.slice(k).find((l) => l.trim()) ?? '';
    const after = b.slice(k).find((l) => l.trim()) ?? '';
    return `${one(before) || '∅'} → ${one(after) || '∅'}`;
  }
  if (t.op === 'write') {
    const body = t.call.replace(/^[^\n]*\n\n?/, '');
    const first = body.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
    return `new file, ${body.length} chars: ${one(first, 80)}`;
  }
  return undefined;
}

const opOf = (t: RunnerTool): ToolOp => t.op ?? 'unknown';

/** Project one session's turns onto canonical events, in file order. */
export function sessionToEvents(s: ProjectableSession): CanonicalEvent[] {
  const sid = sessionKey(s.runner, s.nativeId);
  const src = (ref: string): SourcePointer => ({ runner: s.runner, file: s.file, ref, schema: s.schema });
  const out: CanonicalEvent[] = [];
  const sourceId = s.sourceId ?? s.file;
  const started: SessionStarted = {
    id: `${sid}/session@${fragmentTag(sourceId)}`, kind: 'session.started', sessionId: sid, source: src(s.nativeId), ...OBS_FULL,
    runner: s.runner, nativeId: s.nativeId, sourceId, title: s.title,
    ...(s.cwd ? { cwd: s.cwd } : {}), ...(s.workspace ? { workspace: s.workspace } : {}),
    ...(s.parentSessionId ? { parentSessionId: s.parentSessionId } : {}), ...(s.subagent ? { subagent: true } : {}),
  };
  out.push(started);
  const keys = turnKeys(sid, s.turns);
  // the tree's address book: message id → the FIRST turn that carries it
  const byItem = new Map<string, string>();
  s.turns.forEach((t, i) => { for (const id of t.itemIds) if (!byItem.has(id)) byItem.set(id, keys[i]); });

  s.turns.forEach((t, i) => {
    const tid = keys[i];
    const at = t.at;
    const base = { sessionId: sid, turnId: tid, turnIndex: i, ...(at ? { at } : {}) };
    if (t.compactionBefore) {
      const b: BoundaryCompaction = {
        id: `${tid}/compaction`, kind: 'boundary.compaction', sessionId: sid, source: src(t.itemIds[0] ?? `turn-${i}`), ...OBS_PART,
        ...(at ? { at } : {}), summaryExcerpt: clip(t.compactionBefore),
      };
      out.push(b);
    }
    const parent = t.parentItemId ? byItem.get(t.parentItemId) : undefined;
    const ts: TurnStarted = {
      id: `${tid}/turn`, kind: 'turn.started', ...base, source: src(t.itemIds[0] ?? `turn-${i}`), ...OBS_FULL,
      ...(parent && parent !== tid ? { parentTurnId: parent } : {}),
      humanAuthored: !!t.question.trim(),
    };
    out.push(ts);
    if (t.question.trim()) {
      const m: MessageRecorded = {
        id: `${tid}/q`, kind: 'message.recorded', ...base, source: src(t.itemIds[0] ?? `turn-${i}`), ...OBS_FULL,
        role: 'user', actor: 'human', modelVisible: true, excerpt: clip(t.question), length: t.question.length,
      };
      out.push(m);
    }
    t.tools.forEach((tool, k) => {
      const callId = `${tid}/t${k}`;
      // the runner's own call id names both records; a synthetic ref only
      // when the runner recorded none
      const nativeRef = tool.nativeCallId ?? `${t.itemIds[0] ?? `turn-${i}`}:tool${k}`;
      const artifacts: ArtifactRef[] = toolArtifacts(tool, s.cwd);
      const change = changeHead(tool);
      const called: ToolCalled = {
        id: callId, kind: 'tool.called', ...base, source: src(nativeRef), ...OBS_PART,
        callId: tool.nativeCallId ?? callId, name: tool.name, op: opOf(tool), artifacts, excerpt: clip(tool.call), length: tool.call.length,
        ...(change ? { change } : {}),
      };
      out.push(called);
      const done: ToolCompleted = {
        id: `${callId}/result`, kind: 'tool.completed', ...base, source: src(nativeRef),
        basis: 'observed', completeness: tool.truncated ? 'partial' : 'full',
        calledEventId: callId, excerpt: clip(tool.result), length: tool.result.length, truncated: tool.truncated,
      };
      out.push(done);
    });
    if (t.response.trim()) {
      const m: MessageRecorded = {
        id: `${tid}/a`, kind: 'message.recorded', ...base, source: src(t.itemIds[t.itemIds.length - 1] ?? `turn-${i}`), ...OBS_PART,
        role: 'assistant', actor: 'model', modelVisible: true, excerpt: clip(t.response), length: t.response.length,
      };
      out.push(m);
    }
  });
  return out;
}

/** The derived edge behind `why`: one touch per (turn, artifact), the
 *  strongest op winning, always pointing back at the tool.called it came
 *  from. Reads, fetches, writes and edits — a search root is not a touch. */
export function deriveTouches(events: CanonicalEvent[]): ArtifactTouch[] {
  const rank: Record<string, number> = { read: 1, fetch: 1, write: 2, edit: 2 };
  const byKey = new Map<string, ArtifactTouch>();
  for (const e of events) {
    if (e.kind !== 'tool.called' || !(e.op in rank)) continue;
    for (const a of e.artifacts) {
      const key = `${e.turnId}|${a.id}`;
      const prev = byKey.get(key);
      const stronger = !prev || rank[e.op] > rank[prev.op];
      // every distinct place the turn looked, kept across the fold
      const locators = [...(prev?.locators ?? [])];
      if (a.locator && !locators.some((l) => JSON.stringify(l) === JSON.stringify(a.locator))) locators.push(a.locator);
      if (!prev || stronger) {
        const change = stronger ? (e.change ?? prev?.change) : prev?.change;
        byKey.set(key, {
          artifact: a.id, op: e.op, sessionId: e.sessionId, turnId: e.turnId, turnIndex: e.turnIndex ?? 0,
          derivedFrom: e.id, ...(e.at ? { at: e.at } : {}), ...(change ? { change } : {}), ...(locators.length ? { locators } : {}),
        });
      } else {
        if (!prev.change && e.change) prev.change = e.change;
        if (locators.length) prev.locators = locators;
      }
    }
  }
  return [...byKey.values()];
}

export { EVENT_SCHEMA };
