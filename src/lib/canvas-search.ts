import type { ThoughtNode } from '../types';

// Canvas-wide exact search, entirely local: every field a user might
// remember lives in node data already (questions, active answers, note
// bodies, highlight texts, link titles, attachment names, plaque
// summaries). No index, no server, no cost — a substring scan over a few
// hundred nodes is a millisecond job. Semantic recall is a later, separate,
// explicitly-invoked layer; this one is the deterministic ground truth.

export interface SearchHit {
  nodeId: string;
  kind: 'qa' | 'note' | 'file' | 'link' | 'frame' | 'distill';
  archived: boolean;
  /** total occurrences across all searched fields of this node */
  count: number;
  /** ~40 chars of context either side of the first match */
  snippet: string;
  /** offset of the match inside `snippet` (for highlighting) */
  matchStart: number;
  matchLen: number;
}

function kindOf(n: ThoughtNode): SearchHit['kind'] {
  const k = n.data.stepKind;
  if (k === 'note' || k === 'file' || k === 'link' || k === 'frame') return k;
  if (n.data.condensedFrom?.length) return 'distill';
  return 'qa';
}

function countIn(haystack: string, needle: string): number {
  let c = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) { c += 1; i = haystack.indexOf(needle, i + needle.length); }
  return c;
}

function snippetAround(text: string, at: number, len: number): { snippet: string; matchStart: number } {
  const lead = 40;
  const start = Math.max(0, at - lead);
  const end = Math.min(text.length, at + len + 60);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  // No whitespace normalization here: it would shift matchStart out from
  // under the highlight. CSS collapses runs of whitespace in display anyway.
  return {
    snippet: prefix + text.slice(start, end) + suffix,
    matchStart: prefix.length + (at - start),
  };
}

export function searchCanvas(nodes: ThoughtNode[], rawQuery: string): SearchHit[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return [];
  const hits: SearchHit[] = [];
  for (const n of nodes) {
    const d = n.data;
    if (d.stepKind === 'fanout') continue;
    // fields in the order a user most likely remembers them
    const fields: string[] = [
      d.question ?? '',
      d.response ?? '',
      ...(d.highlights ?? []).map((h) => h.text),
      d.linkTitle ?? '',
      ...(d.attachments ?? []).map((a) => a.name),
      d.summaries?.[d.responseIndex] ?? d.summary ?? '',
    ];
    let count = 0;
    let first: { text: string; at: number } | null = null;
    for (const f of fields) {
      if (!f) continue;
      const lower = f.toLowerCase();
      const at = lower.indexOf(q);
      if (at === -1) continue;
      count += countIn(lower, q);
      if (!first) first = { text: f, at };
    }
    if (!first) continue;
    const { snippet, matchStart } = snippetAround(first.text, first.at, q.length);
    hits.push({
      nodeId: n.id,
      kind: kindOf(n),
      archived: !!d.archived,
      count,
      snippet,
      matchStart,
      matchLen: q.length,
    });
  }
  // live nodes before archived; more occurrences first within each group
  hits.sort((a, b) => Number(a.archived) - Number(b.archived) || b.count - a.count);
  return hits;
}
