import { llmCallStream } from './api';
import { buildContentNode } from './content';
import { autoLayout } from './layout';
import { useStore } from '../store';
import { activeSummary, countTokens } from '../utils';
import type { ThoughtNode, ThoughtEdge, ThoughtData } from '../types';

// Condense, rebuilt on two lessons from real use:
// 1. SEGMENT FINDING IS NOT AN LLM JOB. Consecutive single-in/single-out
//    runs with low decision density are a graph walk over data the judge
//    already produced — instant, free, and highlightable on the canvas.
// 2. DISTILLING IS A SMALL, LOCAL LLM JOB. One segment's takeaways are a
//    dozen lines; the call returns in seconds and the user confirms each
//    segment separately. The one-shot whole-map audit (slow, opaque,
//    timeout-prone) is gone.
// Applying still only uses the two known moves: takeaway form (now ALSO
// the node's visual form — what you see is what the model gets) plus an
// optional distilled note. Wiring untouched, one undo per segment.

export interface CondenseSegment {
  /** Q/A nodes in chain order (only those still in full form). */
  nodeIds: string[];
  headQuestion: string;
  saving: number;
  /** decision/pivot badges inside the segment — shown as a caution. */
  keyMoves: number;
  totalTurns: number;
}

const isQaTurn = (n: ThoughtNode): boolean => {
  const d = n.data as ThoughtData;
  return !!d.response && !d.stepKind && !d.isLoading;
};

function moveType(n: ThoughtNode): string | undefined {
  const d = n.data as ThoughtData;
  return d.summaryTypes?.[d.responseIndex] ?? undefined;
}

function turnSaving(n: ThoughtNode): number {
  const d = n.data as ThoughtData;
  const full = countTokens(`${d.question}\n${d.response}`);
  const condensed = countTokens(activeSummary(d) ?? d.response.slice(0, 200));
  return Math.max(0, full - condensed);
}

/** Local segment discovery: maximal single-in/single-out runs of Q/A turns,
    ≥3 turns still in full form. No model call — candidates appear the
    moment the dialog opens, and hovering one highlights it on the canvas. */
export function findCandidateSegments(nodes: ThoughtNode[], edges: ThoughtEdge[]): CondenseSegment[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const structural = edges.filter((e) => !e.data?.isCrossLink);
  const out = new Map<string, string[]>();
  const inn = new Map<string, string[]>();
  for (const e of structural) {
    out.set(e.source, [...(out.get(e.source) ?? []), e.target]);
    inn.set(e.target, [...(inn.get(e.target) ?? []), e.source]);
  }
  const single = (m: Map<string, string[]>, id: string) => (m.get(id) ?? []).length === 1;
  const isRunStart = (id: string): boolean => {
    const parents = inn.get(id) ?? [];
    if (parents.length !== 1) return true;
    const p = byId.get(parents[0]);
    return !p || !isQaTurn(p) || !single(out, parents[0]);
  };
  const segments: CondenseSegment[] = [];
  for (const n of nodes) {
    if (!isQaTurn(n) || !isRunStart(n.id)) continue;
    const run: ThoughtNode[] = [n];
    let cur = n.id;
    while (single(out, cur)) {
      const next = byId.get(out.get(cur)![0]);
      if (!next || !isQaTurn(next) || (inn.get(next.id) ?? []).length !== 1) break;
      run.push(next);
      cur = next.id;
    }
    // condensable members: still in full form; keep the segment when 3+ remain
    const members = run.filter((x) => (x.data as ThoughtData).contextForm !== 'summary' && !(x.data as ThoughtData).archived);
    if (members.length < 3) continue;
    segments.push({
      nodeIds: members.map((x) => x.id),
      headQuestion: (run[0].data as ThoughtData).question.replace(/\s+/g, ' ').slice(0, 80),
      saving: members.reduce((s, x) => s + turnSaving(x), 0),
      keyMoves: members.filter((x) => ['decision', 'pivot'].includes(moveType(x) ?? '')).length,
      totalTurns: run.length,
    });
  }
  segments.sort((a, b) => b.saving - a.saving);
  return segments;
}

const DISTILL_PROMPT = {
  zh: `下面是一段连续对话的轮次列表（问题 + 收获句 + 认知动作标签）。写一份「蒸馏便签」：用 markdown 要点列出这段过程确立的、至今仍然有效的决策、结论与约束。不是流水账摘要；被后续轮次推翻的内容不要列。只输出便签正文，不要标题、不要其他说明。`,
  en: `Below is a consecutive run of conversation turns (question + takeaway + cognitive-move tag). Write a "distilled note": markdown bullets of the decisions, conclusions and constraints established along the way that are STILL in force. Not a play-by-play summary; drop anything overturned by later turns. Output only the note body — no title, no commentary.`,
};

const TAG: Record<string, string> = { ruleout: 'RULEOUT', decision: 'DECISION', pivot: 'PIVOT', open: 'OPEN', insight: 'INSIGHT' };

/** One small LLM call for ONE segment — STREAMED, so slow models read as
    progress instead of a hang. The timeout is idle-based: it only fires
    when no chunk has arrived for a while. */
export async function distillSegment(seg: CondenseSegment, lang: 'zh' | 'en', model?: string, onChunk?: (soFar: string) => void): Promise<string> {
  const { nodes } = useStore.getState();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const lines = seg.nodeIds.map((id) => {
    const n = byId.get(id);
    if (!n) return null;
    const d = n.data as ThoughtData;
    const ty = moveType(n);
    const s = activeSummary(d) ?? d.response.replace(/\s+/g, ' ').slice(0, 160);
    return `- Q: ${(d.question || '').replace(/\s+/g, ' ').slice(0, 90)}\n  ${ty && TAG[ty] ? `[${TAG[ty]}] ` : ''}${s}`;
  }).filter(Boolean).join('\n');
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let rejectIdle: ((e: Error) => void) | undefined;
  const armIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => rejectIdle?.(new Error('distill stalled (90s without output) — try a faster model')), 90_000);
  };
  const idleGate = new Promise<never>((_, reject) => { rejectIdle = reject; });
  armIdle();
  try {
    const raw = await Promise.race([
      llmCallStream(
        [
          { role: 'system', content: DISTILL_PROMPT[lang] },
          { role: 'user', content: lines },
        ],
        (_chunk, fullSoFar) => { armIdle(); onChunk?.(fullSoFar); },
        undefined, undefined, undefined, undefined, model,
      ),
      idleGate,
    ]);
    return raw.trim().slice(0, 4000);
  } finally {
    clearTimeout(idleTimer);
  }
}

/** Apply one segment in ONE history step: members take takeaway form (visual
    AND context — the plaque you see is the line the model gets); the
    distilled note, when kept, lands beside the segment head. */
export function applySegment(seg: CondenseSegment, distilled?: string): { lowered: number; noteId?: string } {
  const st = useStore.getState();
  st.pushHistory();
  const ids = new Set(seg.nodeIds);
  const head = st.nodes.find((n) => n.id === seg.nodeIds[0]);
  const note = distilled?.trim() && head
    ? buildContentNode('note', { x: head.position.x - 460, y: head.position.y }, { question: distilled.trim() })
    : null;
  useStore.setState((state) => {
    const withForms = state.nodes.map((n) => (ids.has(n.id) ? { ...n, data: { ...n.data, contextForm: 'summary' as const } } : n));
    const all = note ? [...withForms, note] : withForms;
    // Relayout with the plaques' REAL (short) heights: the condensed chain
    // visibly contracts — this is the feedback that something happened.
    return { nodes: autoLayout(all, state.edges) };
  });
  return { lowered: ids.size, noteId: note?.id };
}
