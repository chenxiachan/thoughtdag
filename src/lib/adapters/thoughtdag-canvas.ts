import type { CanvasEvent, ThoughtEdge, ThoughtNode } from '../../types';
import type {
  ArtifactAttached, ArtifactRef, CanonicalEvent, ContextCommitted, EdgeRecorded, MessageRecorded, RecordEdited,
  SessionStarted, SourcePointer, TurnStarted,
} from '../events/types';
import { fragmentTag, sessionKey, urlArtifact, EXCERPT_CHARS } from '../events/project';
import { THOUGHTDAG_MANIFEST } from '../events/manifests';

// The canvas is ThoughtDAG's own record — a backup (.thoughtdag.json) is
// its source file. This adapter projects it onto the same contract the
// runners use, and it is the contract's acid test: history (hand-made
// turns), structure (wires), materials (attachments, references, page
// anchors), a person's interventions (edits, highlights) and what a
// request was actually built from (commits) all have to fit.
//
// Mirrored nodes (importSource) are placed, not restated: their turn
// events carry `mirrorOf` and no message text — those facts live in the
// runner's session and would otherwise be counted twice.

export interface CanvasBackup {
  version?: number;
  name?: string;
  /** the project's stable id (backups written since 0.4.3); older files have only a name */
  projectId?: string;
  exportedAt?: string;
  nodes: ThoughtNode[];
  edges: ThoughtEdge[];
  events?: CanvasEvent[];
}

export interface CanvasProjection {
  sessionId: string;
  nativeId: string;
  title: string;
  events: CanonicalEvent[];
  /** full text per turn, for the interpretation and text caches (never stored in facts);
      `material` is the extracted text of the node's attachments, head only */
  texts: Map<string, { question: string; response: string; material?: string }>;
}

const OBS_FULL = { basis: 'observed', completeness: 'full' } as const;
const OBS_PART = { basis: 'observed', completeness: 'partial' } as const;
const clip = (s: string, max = EXCERPT_CHARS): string => { const t = s.trim(); return t.length > max ? `${t.slice(0, max)}…` : t; };

export function isCanvasBackup(v: unknown): v is CanvasBackup {
  return !!v && typeof v === 'object' && Array.isArray((v as CanvasBackup).nodes) && Array.isArray((v as CanvasBackup).edges);
}

/** The canvas's own name in the store is not written into its backup;
 *  the file name is the identity we have. */
export function canvasNativeId(file: string): string {
  const base = file.replace(/\\/g, '/').split('/').pop() ?? file;
  return base.replace(/\.thoughtdag\.json$/i, '');
}

export function canvasToEvents(backup: CanvasBackup, opts: { file: string; sourceId?: string }): CanvasProjection {
  // identity: the project's own id when the backup carries it; the file
  // name otherwise (older backups) — the deep link says which it got
  const nativeId = backup.projectId?.trim() || canvasNativeId(opts.file);
  const sid = sessionKey('thoughtdag', nativeId);
  const sourceId = opts.sourceId ?? opts.file;
  const schema = THOUGHTDAG_MANIFEST.schema;
  const src = (ref: string): SourcePointer => ({ runner: 'thoughtdag', file: opts.file, ref, schema });
  const out: CanonicalEvent[] = [];
  const texts = new Map<string, { question: string; response: string; material?: string }>();
  const title = backup.name?.trim() || nativeId;

  const started: SessionStarted = {
    id: `${sid}/session@${fragmentTag(sourceId)}`, kind: 'session.started', sessionId: sid, source: src('canvas'), ...OBS_FULL,
    runner: 'thoughtdag', nativeId, sourceId, title, ...(backup.exportedAt ? { at: backup.exportedAt } : {}),
  };
  out.push(started);

  const turnIdOf = (nodeId: string): string => `${sid}#${nodeId}`;
  // a node's turn index: file order, which the store keeps as creation order
  const index = new Map<string, number>();
  backup.nodes.forEach((n, i) => index.set(n.id, i));

  for (const n of backup.nodes) {
    const d = n.data;
    const tid = turnIdOf(n.id);
    const i = index.get(n.id) ?? 0;
    const at = d.createdAt ?? d.lastGeneratedAt;
    const base = { sessionId: sid, turnId: tid, turnIndex: i, ...(at ? { at } : {}) };
    const mirror = d.importSource ? { sessionId: sessionKey(d.importSource.runner, d.importSource.sessionId), item: d.importSource.itemIds[0] ?? n.id } : undefined;
    const isMaterial = d.stepKind === 'file' || d.stepKind === 'link' || d.stepKind === 'frame';
    const isNote = d.stepKind === 'note';

    const ts: TurnStarted = {
      id: `${tid}/turn`, kind: 'turn.started', ...base, source: src(n.id), ...OBS_FULL,
      humanAuthored: !isMaterial, ...(mirror ? { mirrorOf: mirror } : {}),
    };
    out.push(ts);

    // a material node has no question of its own; it answers to what it holds
    if (isMaterial) {
      const held = (d.attachments ?? []).filter((a) => !a.name.startsWith('tool: ')).map((a) => a.name);
      texts.set(tid, { question: held.length ? `[${d.stepKind}] ${held.join(', ')}` : `[${d.stepKind}] ${clip(d.question ?? '', 80)}`, response: '' });
    }
    if (!mirror && !isMaterial) {
      texts.set(tid, { question: d.question ?? '', response: d.response ?? '' });
      if (d.question?.trim()) {
        const m: MessageRecorded = {
          id: `${tid}/q`, kind: 'message.recorded', ...base, source: src(`${n.id}:question`), ...OBS_FULL,
          role: isNote ? 'custom' : 'user', actor: 'human', modelVisible: true, excerpt: clip(d.question), length: d.question.length,
        };
        out.push(m);
      }
      if (d.response?.trim() && !isNote) {
        const model = d.generatedBy?.[d.responseIndex ?? 0] ?? undefined;
        const a: MessageRecorded = {
          id: `${tid}/a`, kind: 'message.recorded', ...base, source: src(`${n.id}:response`), ...OBS_FULL,
          ...(d.lastGeneratedAt ? { at: d.lastGeneratedAt } : {}),
          role: 'assistant', actor: model ? 'model' : 'unknown', modelVisible: true, excerpt: clip(d.response), length: d.response.length,
        };
        out.push(a);
      }
    }

    // a person changed what the runner wrote
    if (mirror && d.source) {
      for (const field of ['question', 'response'] as const) {
        const now = d[field] ?? ''; const was = d.source[field] ?? '';
        if (now !== was) {
          const e: RecordEdited = {
            id: `${tid}/edit:${field}`, kind: 'record.edited', ...base, source: src(`${n.id}:${field}`), ...OBS_FULL,
            field, excerpt: clip(now), length: now.length,
          };
          out.push(e);
        }
      }
    }

    // highlights: a person's marks; they shape the request only in filter/tag mode
    for (const h of d.highlights ?? []) {
      const visible = d.highlightMode === 'filter' || d.highlightMode === 'tag';
      const m: MessageRecorded = {
        id: `${tid}/hl:${h.id}`, kind: 'message.recorded', ...base, ...(h.at ? { at: h.at } : {}), source: src(`${n.id}:highlight:${h.id}`), ...OBS_FULL,
        role: 'custom', actor: 'human', modelVisible: visible, excerpt: clip(h.text), length: h.text.length,
      };
      out.push(m);
    }

    // materials: attachments the person placed (the runner's tool trail is not a material)
    const excluded = new Set(d.excludedAttachmentIds ?? []);
    for (const att of d.attachments ?? []) {
      if (att.name.startsWith('tool: ') || att.op) continue;
      const artifact: ArtifactRef = {
        id: `thoughtdag:attachment/${att.id}`, observedPath: att.name,
        ...(d.anchor && d.anchor.attId === att.id ? { locator: { pages: String(d.anchor.page) } } : {}),
      };
      const e: ArtifactAttached = {
        id: `${tid}/att:${att.id}`, kind: 'artifact.attached', ...base, ...(att.addedAt ? { at: att.addedAt } : {}), source: src(`${n.id}:attachment:${att.id}`), ...OBS_FULL,
        artifact, via: 'attachment', mediaType: att.type, inContext: !excluded.has(att.id),
      };
      out.push(e);
    }
    // a page anchor into an attachment that lives on another node
    if (d.anchor?.attId && !(d.attachments ?? []).some((a) => a.id === d.anchor?.attId)) {
      const e: ArtifactAttached = {
        id: `${tid}/anchor`, kind: 'artifact.attached', ...base, source: src(`${n.id}:anchor`), ...OBS_FULL,
        artifact: { id: `thoughtdag:attachment/${d.anchor.attId}`, locator: { pages: String(d.anchor.page) } }, via: 'anchor', inContext: 'unknown',
      };
      out.push(e);
    }
    // web references the answer cited — URLs the search tool returned
    for (const [k, r] of (d.references ?? []).entries()) {
      const a = r.url ? urlArtifact(r.url) : null;
      if (!a) continue;
      const e: ArtifactAttached = {
        id: `${tid}/ref:${k}`, kind: 'artifact.attached', ...base, source: src(`${n.id}:reference:${k}`), ...OBS_FULL,
        artifact: a, via: 'reference', inContext: 'unknown',
      };
      out.push(e);
    }

    // what the node's materials SAY (their extracted text, head only): the
    // words a paper is found by, whatever the file is called now
    const material = (d.attachments ?? [])
      .filter((a) => !a.name.startsWith('tool: ') && !a.op && typeof a.extractedText === 'string' && a.extractedText.trim())
      .map((a) => `[${a.name}]\n${a.extractedText!.slice(0, 4000)}`)
      .join('\n\n');
    if (material) {
      const prev = texts.get(tid) ?? { question: '', response: '' };
      texts.set(tid, { ...prev, material });
    }

    // the upstream fingerprint recorded at generation: real, but it blanks
    // the node itself and names no members — partial, and says so
    if (d.lastContextHash && !mirror) {
      const c: ContextCommitted = {
        id: `${tid}/ctx:upstream`, kind: 'context.committed', ...base, ...(d.lastGeneratedAt ? { at: d.lastGeneratedAt } : {}), source: src(`${n.id}:lastContextHash`), ...OBS_PART,
        requestId: `${n.id}@${d.lastGeneratedAt ?? 'unknown'}`, members: [], contentHash: d.lastContextHash, hashOf: 'upstream', decidedBy: 'user', confirmed: true,
      };
      out.push(c);
    }
  }

  // the wires: the only edges that compile
  for (const e of backup.edges) {
    if (!index.has(e.source) || !index.has(e.target)) continue;
    const ev: EdgeRecorded = {
      id: `${sid}/edge:${e.id}`, kind: 'edge.recorded', sessionId: sid, source: src(e.id), ...OBS_FULL,
      edgeType: 'context', via: e.data?.isCrossLink ? 'reference' : 'mainline', fromTurnId: turnIdOf(e.source), toTurnId: turnIdOf(e.target),
    };
    out.push(ev);
  }

  // exact commits, written at the dispatch boundary: a SHA-256 over the
  // request as sent (or a bundle as handed off), the message count, the
  // model, the member nodes. Ids come from node and time, never from the
  // log's position — the log is capped and may be trimmed.
  for (const ev of backup.events ?? []) {
    if (ev.op !== 'commit' || !ev.id || !ev.d) continue;
    const sha = typeof ev.d.sha === 'string' ? ev.d.sha : '';
    if (!sha) continue;
    const kind = ev.d.kind === 'bundle' ? 'bundle' : 'request';
    const members = typeof ev.d.m === 'string' && ev.d.m ? ev.d.m.split(',').filter(Boolean).map((nodeId) => ({ nodeId })) : [];
    const truncated = ev.d.more === true;
    const c: ContextCommitted = {
      id: `${sid}/commit:${ev.id}@${ev.t}${kind === 'bundle' ? ':bundle' : ''}`, kind: 'context.committed', sessionId: sid, turnId: turnIdOf(ev.id), turnIndex: index.get(ev.id) ?? 0, at: ev.t,
      source: src(`event:commit:${ev.id}@${ev.t}`), basis: 'observed', completeness: truncated || !members.length ? 'partial' : 'full',
      requestId: typeof ev.d.bundle === 'string' ? ev.d.bundle : `${ev.id}@${ev.t}`, members, contentHash: sha.startsWith('sha256:') ? sha : `sha256:${sha}`, hashOf: kind,
      ...(typeof ev.d.n === 'number' ? { messageCount: ev.d.n } : {}), ...(typeof ev.d.model === 'string' && ev.d.model ? { model: ev.d.model } : {}),
      decidedBy: 'user', confirmed: true,
    };
    out.push(c);
  }

  return { sessionId: sid, nativeId, title, events: out, texts };
}
