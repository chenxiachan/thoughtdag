import { llmCallStream } from './api';
import { useStore } from '../store';
import { autoLayout } from './layout';
import { activeSummary, countTokens, generateId } from '../utils';
import type { ThoughtNode, ThoughtEdge, ThoughtData, Highlight } from '../types';

// Condense v4: the COPY-TREE model.
//
// Condensing never touches the original tree. It produces a condensed copy
// beside it: every node is duplicated, except that each chosen run of
// refinement turns collapses into ONE distill node (question = the run's
// span, response = distilled decisions + verbatim highlights). Wires are
// rebuilt so the copy is a complete, self-sufficient tree — ask from any
// of its nodes and the walk stays inside the copy. Compare the two trees
// side by side; archive the original when satisfied. Spatial versioning,
// no special node states, no second context mechanism: the One Rule reads
// the copy exactly like any other graph.
//
// Fidelity rules:
//  1. decision/pivot turns never collapse — they break a run in two;
//  2. highlights ride into the distill node VERBATIM (people's judgment
//     is not compressible);
//  3. fork nodes never enter a run (single-in/single-out by definition),
//     so branch context survives untouched.
//
// Distilling runs top-down, one small streamed call per run, each carrying
// a brief of what earlier runs established — the copy reads as one
// coherent document, and progress is visible run by run.

export interface CondenseSegment {
  nodeIds: string[];
  headQuestion: string;
  saving: number;
  totalTurns: number;
}

const isQaTurn = (n: ThoughtNode): boolean => {
  const d = n.data as ThoughtData;
  return !!d.response && !d.stepKind && !d.isLoading;
};

const moveType = (n: ThoughtNode): string | undefined => {
  const d = n.data as ThoughtData;
  return d.summaryTypes?.[d.responseIndex] ?? undefined;
};

/** Fidelity rule 1: these turns are landmarks — they never collapse. */
const isLandmark = (n: ThoughtNode): boolean => ['decision', 'pivot'].includes(moveType(n) ?? '');

function turnSaving(n: ThoughtNode): number {
  const d = n.data as ThoughtData;
  const full = countTokens(`${d.question}\n${d.response}`);
  const condensed = countTokens(activeSummary(d) ?? d.response.slice(0, 200));
  return Math.max(0, full - condensed);
}

/** Local discovery: maximal single-in/single-out runs of NON-landmark Q/A
    turns, ≥3 long. Instant — no model call. */
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
  // Frontier protection: the last few turns before every leaf are live
  // working context — condensing them would yank the ground from under an
  // ongoing conversation. A structural signal, deliberately NOT an LLM
  // judgment: recency and distance-to-leaf are graph facts.
  const FRONTIER_DEPTH = 3;
  const frontier = new Set<string>();
  for (const n of nodes) {
    if (!isQaTurn(n) || (out.get(n.id) ?? []).length > 0) continue; // leaves only
    let cur: string | undefined = n.id;
    for (let d = 0; d < FRONTIER_DEPTH && cur; d++) {
      frontier.add(cur);
      const parents: string[] = inn.get(cur) ?? [];
      cur = parents.length === 1 ? parents[0] : undefined;
    }
  }
  const collapsible = (n: ThoughtNode) => isQaTurn(n) && !isLandmark(n) && !(n.data as ThoughtData).archived && !frontier.has(n.id);
  const isRunStart = (id: string): boolean => {
    const parents = inn.get(id) ?? [];
    if (parents.length !== 1) return true;
    const p = byId.get(parents[0]);
    return !p || !collapsible(p) || !single(out, parents[0]);
  };
  const segments: CondenseSegment[] = [];
  for (const n of nodes) {
    if (!collapsible(n) || !isRunStart(n.id)) continue;
    const run: ThoughtNode[] = [n];
    let cur = n.id;
    while (single(out, cur)) {
      const next = byId.get(out.get(cur)![0]);
      if (!next || !collapsible(next) || (inn.get(next.id) ?? []).length !== 1) break;
      run.push(next);
      cur = next.id;
    }
    if (run.length < 3) continue;
    segments.push({
      nodeIds: run.map((x) => x.id),
      headQuestion: (run[0].data as ThoughtData).question.replace(/\s+/g, ' ').slice(0, 80),
      saving: run.reduce((s, x) => s + turnSaving(x), 0),
      totalTurns: run.length,
    });
  }
  // Early runs first: the older a refinement run, the safer and more
  // valuable its condensation; savings break ties.
  const headTime = (s: CondenseSegment) => {
    const n = byId.get(s.nodeIds[0]);
    return (n?.data as ThoughtData | undefined)?.createdAt ?? '';
  };
  segments.sort((a, b) => headTime(a).localeCompare(headTime(b)) || b.saving - a.saving);
  return segments;
}

const DISTILL_PROMPT = {
  zh: `下面是一段连续对话的轮次列表（问题 + 收获句 + 认知动作标签），之前可能附有「前情提要」。写一份「蒸馏稿」：用 markdown 要点列出这段过程确立的、至今仍然有效的决策、结论与约束。不是流水账；被后续轮次推翻的内容不要列；前情提要里已确立的内容不要重复。只输出蒸馏稿正文。`,
  en: `Below is a consecutive run of conversation turns (question + takeaway + cognitive-move tag), possibly preceded by a brief of earlier runs. Write a "distillate": markdown bullets of the decisions, conclusions and constraints established in THIS run that are still in force. No play-by-play; drop anything overturned later; do not repeat what the brief already established. Output only the distillate body.`,
};

const TAG: Record<string, string> = { ruleout: 'RULEOUT', decision: 'DECISION', pivot: 'PIVOT', open: 'OPEN', insight: 'INSIGHT' };

/** One streamed call for one run. `prior` = what earlier runs established
    (keeps the copy-tree coherent, avoids repetition). Idle-based timeout;
    reasoning output counts as liveness. */
export async function distillSegment(
  seg: CondenseSegment,
  lang: 'zh' | 'en',
  model?: string,
  onChunk?: (soFar: string) => void,
  prior?: string,
): Promise<string> {
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
  const user = prior
    ? `[${lang === 'zh' ? '前情提要' : 'Brief of earlier runs'}]\n${prior}\n\n[${lang === 'zh' ? '本段轮次' : 'This run'}]\n${lines}`
    : lines;

  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let rejectIdle: ((e: Error) => void) | undefined;
  const armIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => rejectIdle?.(new Error(lang === 'zh' ? '蒸馏停滞（3 分钟无输出），换个更快的模型试试' : 'distill stalled (3 min without output) — try a faster model')), 180_000);
  };
  const idleGate = new Promise<never>((_, reject) => { rejectIdle = reject; });
  armIdle();
  try {
    const raw = await Promise.race([
      llmCallStream(
        [
          { role: 'system', content: DISTILL_PROMPT[lang] },
          { role: 'user', content: user },
        ],
        (_chunk, fullSoFar) => { armIdle(); onChunk?.(fullSoFar); },
        undefined, undefined,
        // reasoning chunks count as liveness — thinking models are silent
        // on content for a long first stretch
        { onReasoning: () => armIdle() },
        undefined, model,
      ),
      idleGate,
    ]);
    return raw.trim().slice(0, 6000);
  } finally {
    clearTimeout(idleTimer);
  }
}

/** Fidelity rule 2: the run's highlights, verbatim. */
function collectHighlights(seg: CondenseSegment, byId: Map<string, ThoughtNode>): Highlight[] {
  const out: Highlight[] = [];
  for (const id of seg.nodeIds) {
    const n = byId.get(id);
    for (const h of (n?.data as ThoughtData | undefined)?.highlights ?? []) out.push(h);
  }
  return out;
}

export interface CondenseCopyResult {
  copiedNodes: number;
  collapsedRuns: number;
  distillIds: string[];
}

/** Build the condensed copy-tree: duplicate every node, collapse the chosen
    segments into distill nodes, rewire, lay out beside the original. One
    history step. `distillates` aligns with `segments`. */
export function buildCondensedCopy(segments: CondenseSegment[], distillates: string[], lang: 'zh' | 'en'): CondenseCopyResult {
  const st = useStore.getState();
  const { nodes, edges } = st;
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const segOf = new Map<string, number>();
  segments.forEach((s, i) => s.nodeIds.forEach((id) => segOf.set(id, i)));

  // The copy sits to the RIGHT of the original's bounding box.
  const xs = nodes.map((n) => n.position.x);
  const offsetX = (Math.max(...xs) - Math.min(...xs)) + 1400;

  const idMap = new Map<string, string>();
  const copies: ThoughtNode[] = [];
  const distillIds: string[] = [];

  // 1. distill nodes: one per segment, anchored at the segment head's spot
  segments.forEach((seg, i) => {
    const head = byId.get(seg.nodeIds[0])!;
    const tail = byId.get(seg.nodeIds[seg.nodeIds.length - 1])!;
    const highlights = collectHighlights(seg, byId);
    const fidelity = highlights.length
      ? `\n\n---\n${lang === 'zh' ? '**高光（原文保真）**' : '**Highlights (verbatim)**'}\n${highlights.map((h) => `> ${h.text}`).join('\n')}`
      : '';
    const id = generateId();
    distillIds.push(id);
    const question = `${lang === 'zh' ? '凝练' : 'Condensed'}: ${(head.data as ThoughtData).question.replace(/\s+/g, ' ').slice(0, 60)} → ${(tail.data as ThoughtData).question.replace(/\s+/g, ' ').slice(0, 60)}`;
    const response = `${distillates[i] || ''}${fidelity}`;
    copies.push({
      id,
      type: 'thought',
      position: { x: head.position.x + offsetX, y: head.position.y },
      dragHandle: '.drag-handle',
      data: {
        question,
        response,
        responses: [response],
        responseIndex: 0,
        condensedFrom: seg.nodeIds,
        createdAt: new Date().toISOString(),
        isCollapsed: false, isEditing: false, isEditingResponse: false, isLoading: false,
        tokenCount: countTokens(`${question}\n${response}`),
        highlights: [], highlightMode: 'tag',
        attachments: [], excludedAttachmentIds: [], includedAttachmentIds: [],
        roleMode: 'inherit', isRoot: false, isBranch: false,
      } as ThoughtData,
    } as ThoughtNode);
    seg.nodeIds.forEach((oid) => idMap.set(oid, id));
  });

  // 2. plain copies for every node outside the segments
  for (const n of nodes) {
    if (segOf.has(n.id)) continue;
    const id = generateId();
    idMap.set(n.id, id);
    const d = n.data as ThoughtData;
    copies.push({
      ...n,
      id,
      position: { x: n.position.x + offsetX, y: n.position.y },
      selected: false,
      data: { ...d, isEditing: false, isEditingResponse: false, isLoading: false },
    } as ThoughtNode);
  }

  // 3. rewire: every original edge maps through idMap; edges interior to a
  // segment vanish (both ends map to the same distill node)
  const newEdges: ThoughtEdge[] = [];
  const seen = new Set<string>();
  for (const e of edges) {
    const s = idMap.get(e.source), t2 = idMap.get(e.target);
    if (!s || !t2 || s === t2) continue;
    const key = `${s}→${t2}`;
    if (seen.has(key)) continue;
    seen.add(key);
    newEdges.push({ ...e, id: `e-${generateId()}`, source: s, target: t2, selected: false });
  }

  st.pushHistory();
  useStore.setState((state) => {
    const merged = [...state.nodes, ...copies];
    const mergedEdges = [...state.edges, ...newEdges];
    // one layout pass fixes the copy's post-collapse geometry; autoLayout
    // is deterministic for the untouched original, so both stay tidy
    return { nodes: autoLayout(merged, mergedEdges), edges: mergedEdges };
  });
  return { copiedNodes: copies.length, collapsedRuns: segments.length, distillIds };
}

// ── The background runner: lives at module level so closing the window
// never cancels a build. Progress flows through uiStore.condenseRun; the
// editing guard (condenseGuard) holds the graph still while it runs.
import { useUiStore } from './ui-store';
import { t as i18nT } from '../i18n';
import { toast } from './ui-store';

let runCounter = 0;

export function cancelCondenseRun(): void {
  runCounter++;
  useUiStore.getState().setCondenseRun({ status: 'idle', current: 0, total: 0, streaming: '' });
}

export async function startCondenseRun(picked: CondenseSegment[], lang: 'zh' | 'en', model?: string): Promise<void> {
  if (picked.length === 0) return;
  const token = ++runCounter;
  const ui = useUiStore.getState();
  const originalIds = useStore.getState().nodes.map((n) => n.id);
  ui.setCondenseRun({ status: 'building', current: 0, total: picked.length, streaming: '', error: undefined, originalIds, distillIds: [] });
  try {
    const distillates: string[] = [];
    let brief = '';
    for (let i = 0; i < picked.length; i++) {
      if (runCounter !== token) return;
      useUiStore.getState().setCondenseRun({ current: i + 1, streaming: '' });
      const d = await distillSegment(picked[i], lang, model,
        (soFar) => { if (runCounter === token) useUiStore.getState().setCondenseRun({ streaming: soFar }); },
        brief || undefined);
      if (runCounter !== token) return;
      distillates.push(d);
      brief = `${brief}\n${d}`.slice(-1500);
    }
    const res = buildCondensedCopy(picked, distillates, lang);
    if (runCounter !== token) return;
    useUiStore.getState().setCondenseRun({ status: 'done', streaming: '', distillIds: res.distillIds });
    // completion is when sharing intent peaks — one unobtrusive offer
    toast('success', i18nT('condense.copyReady'), 8000, {
      label: i18nT('tmap.export'),
      run: () => useUiStore.getState().setThoughtMapOpen(true),
    });
  } catch (err) {
    if (runCounter !== token) return;
    useUiStore.getState().setCondenseRun({ status: 'error', error: err instanceof Error ? err.message : String(err) });
  }
}
