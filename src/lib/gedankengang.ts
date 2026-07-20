import { llmCall } from './api';
import { activeSummary } from '../utils';
import { collectTimeline } from './timeline';
import type { ThoughtNode, ThoughtEdge, ThoughtData } from '../types';

// The Gedankengang narrator: one on-demand LLM call that reads the whole
// map's takeaways and writes the journey as a short paragraph — from where
// the thinking started, what it ruled out, where it turned, where it landed.
// Session-cached by graph fingerprint: reopening the overview costs nothing
// until the graph actually changes. Deliberately NOT canvas data (yet): the
// narrative is a reading of the map, not part of it.

export type Gedankengang = { text: string; fp: string; at: string };

/** Cheap stable fingerprint over what the narrator actually reads. */
export function graphFingerprint(nodes: ThoughtNode[]): string {
  const parts = nodes
    .filter((n) => !(n.data as ThoughtData).archived)
    .map((n) => `${n.id}:${activeSummary(n.data) ?? ''}:${(n.data as ThoughtData).summaryTypes?.[(n.data as ThoughtData).responseIndex] ?? ''}`)
    .sort();
  let h = 5381;
  for (const p of parts) for (let i = 0; i < p.length; i++) h = ((h << 5) + h + p.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

const cache = new Map<string, Gedankengang>();
export const getCached = (fp: string) => cache.get(fp);

const TAG: Record<string, string> = { ruleout: 'RULEOUT', decision: 'DECISION', pivot: 'PIVOT', open: 'OPEN', insight: 'INSIGHT' };

export async function generateGedankengang(nodes: ThoughtNode[], edges: ThoughtEdge[]): Promise<Gedankengang> {
  const fp = graphFingerprint(nodes);
  const hit = cache.get(fp);
  if (hit) return hit;

  const root = nodes.find((n) => (n.data as ThoughtData).isRoot);
  const entries = collectTimeline(nodes.filter((n) => !(n.data as ThoughtData).archived), 0);
  // On very large maps, feed the narrator the turns, not the full log: keep
  // every badged line plus the first/last stretches, collapse the rest.
  const MAX_LINES = 60;
  const source = entries.length > MAX_LINES
    ? entries.filter((e, i) => e.badged || i < 10 || i >= entries.length - 10)
    : entries;
  const omitted = entries.length - source.length;
  const lines = source
    .map((e) => {
      const n = nodes.find((x) => x.id === e.id);
      if (!n) return null;
      const d = n.data as ThoughtData;
      const s = activeSummary(d);
      if (!s) return null;
      const type = d.summaryTypes?.[d.responseIndex] ?? undefined;
      return `- ${type && TAG[type] ? `${TAG[type]}: ` : ''}${e.topic ? `[${e.topic}] ` : ''}${s}`;
    })
    .filter((l): l is string => !!l);
  if (omitted > 0) lines.push(`(${omitted} plain steps omitted from this list)`);
  void edges; // topology folds into creation order for now — wiring detail

  const raw = await llmCall([
    {
      role: 'user',
      content: `Opening question of a thinking map: ${root?.data.question?.slice(0, 300) ?? '(untitled)'}\n\nThe takeaway of every step, in the order they were thought (tags: RULEOUT = killed an option, DECISION = chose, PIVOT = reframed, OPEN = still unresolved):\n${lines.join('\n')}\n\nWrite the JOURNEY of this thinking as one flowing paragraph a reader absorbs in twenty seconds: where it started, what got ruled out, where it turned, where it landed, what remains open. Only the turns that mattered — do not enumerate every step. Hard limit: 250 characters for CJK languages, 500 characters otherwise. Same language as the takeaway lines. Never use dash characters (—, –, -); use commas, colons or full stops. Output only the paragraph.`,
    },
  ]);
  const result: Gedankengang = { text: raw.trim(), fp, at: new Date().toISOString() };
  cache.set(fp, result);
  return result;
}
