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

/** Files as the runner wrote them → canonical artifact ids. Relative
 *  paths resolve against the session cwd; canonicalization of the real
 *  filesystem (symlinks) is the index's job, where a filesystem exists. */
export function fileArtifact(observed: string, cwd?: string): ArtifactRef {
  const abs = observed.startsWith('/') ? observed : cwd ? joinPath(cwd, observed) : observed;
  return { id: `file://${abs}`, observedPath: observed };
}

function joinPath(base: string, rel: string): string {
  const parts = base.replace(/\/+$/, '').split('/');
  for (const seg of rel.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') { if (parts.length > 1) parts.pop(); continue; }
    parts.push(seg);
  }
  return parts.join('/');
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
  const started: SessionStarted = {
    id: `${sid}/session`, kind: 'session.started', sessionId: sid, source: src(s.nativeId), ...OBS_FULL,
    runner: s.runner, nativeId: s.nativeId, title: s.title,
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
      const artifacts: ArtifactRef[] = (tool.paths ?? []).map((p) => fileArtifact(p, s.cwd));
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
 *  from. Reads, writes and edits only — a search root is not a touch. */
export function deriveTouches(events: CanonicalEvent[]): ArtifactTouch[] {
  const rank: Record<string, number> = { read: 1, write: 2, edit: 2 };
  const byKey = new Map<string, ArtifactTouch>();
  for (const e of events) {
    if (e.kind !== 'tool.called' || !(e.op in rank)) continue;
    for (const a of e.artifacts) {
      const key = `${e.turnId}|${a.id}`;
      const prev = byKey.get(key);
      const stronger = !prev || rank[e.op] > rank[prev.op];
      if (!prev || stronger) {
        byKey.set(key, {
          artifact: a.id, op: e.op, sessionId: e.sessionId, turnId: e.turnId, turnIndex: e.turnIndex ?? 0,
          derivedFrom: e.id, ...(e.at ? { at: e.at } : {}),
          ...((stronger ? e.change : prev?.change) ? { change: stronger ? (e.change ?? prev?.change) : prev?.change } : {}),
        });
      } else if (!prev.change && e.change) {
        prev.change = e.change;
      }
    }
  }
  return [...byKey.values()];
}

export { EVENT_SCHEMA };
