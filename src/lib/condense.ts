import { llmCall } from './api';
import { buildContentNode } from './content';
import { useStore } from '../store';
import { activeSummary, countTokens } from '../utils';
import type { ThoughtNode, ThoughtEdge, ThoughtData } from '../types';

// The condense auditor: one on-demand LLM call that reads the map's
// STRUCTURE and takeaways (never the full prose — an order of magnitude
// cheaper, and the judge's cognitive badges already answer "what mattered")
// and proposes a condensation plan. The auditor can only suggest the two
// primitive moves the user already understands:
//   lower  — nodes enter downstream context as their takeaway line
//   merge  — same, plus a distilled note (still-valid principles) beside
//            the segment; wiring is NEVER touched
// Every suggestion is a proposal: the trust surface (CondenseDialog) shows
// reason + saving per item, nothing applies without a checkbox.

export interface CondenseSuggestion {
  type: 'lower' | 'merge';
  nodeIds: string[];
  reason: string;
  /** merge only: the distilled note draft (still-valid decisions/constraints). */
  distilled?: string;
  /** tokens saved if applied (full form minus condensed form). */
  saving: number;
  /** contains decision/pivot badges — surfaced as a caution, never pre-checked. */
  touchesKeyMoves: boolean;
}

export interface CondensePlan {
  suggestions: CondenseSuggestion[];
  auditedNodes: number;
  totalSaving: number;
}

const TAG: Record<string, string> = { ruleout: 'RULEOUT', decision: 'DECISION', pivot: 'PIVOT', open: 'OPEN', insight: 'INSIGHT' };

/** The turn's cost in full form vs takeaway form — the saving column. */
function nodeSaving(n: ThoughtNode): number {
  const d = n.data as ThoughtData;
  const full = countTokens(`${d.question}\n${d.response}`);
  const condensed = countTokens(activeSummary(d) ?? d.response.slice(0, 200));
  return Math.max(0, full - condensed);
}

function auditCorpus(nodes: ThoughtNode[], edges: ThoughtEdge[]): string {
  const structural = edges.filter((e) => !e.data?.isCrossLink);
  const parentOf = new Map<string, string>();
  for (const e of structural) if (!parentOf.has(e.target)) parentOf.set(e.target, e.source);
  const lines: string[] = [];
  for (const n of nodes) {
    const d = n.data as ThoughtData;
    if (!d.response || d.stepKind) continue; // Q/A turns only
    const s = activeSummary(d);
    const type = d.summaryTypes?.[d.responseIndex] ?? '';
    lines.push(
      `id=${n.id} parent=${parentOf.get(n.id) ?? '-'} tokens=${d.tokenCount ?? 0}` +
      `${type && TAG[type] ? ` move=${TAG[type]}` : ''}` +
      ` q="${(d.question || '').replace(/\s+/g, ' ').slice(0, 70)}"` +
      `${s ? ` takeaway="${s.replace(/\s+/g, ' ').slice(0, 120)}"` : ''}`,
    );
  }
  return lines.join('\n');
}

const PROMPT = {
  zh: `你是一张思维图的"凝练审查员"。下面是图中每个问答节点的一行式档案（id、父节点、token 数、认知动作标签、问题、收获句）。

你的任务：找出可以降低信息颗粒度而不伤害后续推理的节点，输出一份建议清单。判断标准：
- 同一话题的连续雕琢/迭代轮次（措辞修改、重复确认、被后续版本完全覆盖的中间稿）是最佳候选；
- 带 DECISION / PIVOT 标签的节点通常承载关键推理，除非明显冗余，不要建议；
- 独立的、被下游引用的结论性节点不要建议。

只允许两种建议动作：
- "lower"：这些节点各自以收获句形式进入下游上下文；
- "merge"：一段连续链整体降低颗粒度，并附一份"蒸馏稿"——用要点列出这段过程中确立的、至今仍然有效的决策与约束（不是流水账摘要）。

只输出 JSON，格式：
{"suggestions":[{"type":"lower"|"merge","nodeIds":["..."],"reason":"一句话理由（中文）","distilled":"merge 时给出的蒸馏稿（中文，markdown 要点）"}]}
没有值得建议的就输出 {"suggestions":[]}。不要输出其他文字。`,
  en: `You are the "condense auditor" of a thought map. Below is a one-line dossier for every Q/A node (id, parent, tokens, cognitive-move tag, question, takeaway).

Your task: find nodes whose information granularity can be lowered without hurting downstream reasoning, and output a suggestion list. Criteria:
- consecutive refinement/iteration turns on the same topic (wording tweaks, repeated confirmations, intermediate drafts fully superseded later) are the best candidates;
- nodes tagged DECISION / PIVOT usually carry key reasoning — do not suggest them unless clearly redundant;
- standalone conclusive nodes referenced downstream should not be suggested.

Only two moves are allowed:
- "lower": these nodes each enter downstream context as their takeaway line;
- "merge": a consecutive chain segment is lowered as a whole, plus a "distilled note" — bullet points of the decisions and constraints established along the way that are STILL in force (not a play-by-play summary).

Output JSON only:
{"suggestions":[{"type":"lower"|"merge","nodeIds":["..."],"reason":"one-sentence reason","distilled":"the distilled note for merge (markdown bullets)"}]}
If nothing is worth suggesting, output {"suggestions":[]}. No other text.`,
};

/** Run the audit. One explicit LLM call; caller shows the price tag first. */
export async function auditForCondense(lang: 'zh' | 'en'): Promise<CondensePlan> {
  const { nodes, edges } = useStore.getState();
  const live = nodes.filter((n) => !(n.data as ThoughtData).archived && (n.data as ThoughtData).contextForm !== 'summary');
  const corpus = auditCorpus(live, edges);
  const raw = await llmCall([
    { role: 'system', content: PROMPT[lang] },
    { role: 'user', content: corpus || '(empty map)' },
  ]);
  const jsonText = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
  let parsed: { suggestions?: { type?: string; nodeIds?: unknown[]; reason?: string; distilled?: string }[] };
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('auditor returned unparseable output');
  }
  const byId = new Map(live.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const suggestions: CondenseSuggestion[] = [];
  for (const s of parsed.suggestions ?? []) {
    if (s.type !== 'lower' && s.type !== 'merge') continue;
    // validate: ids must exist, not the map's leaves-in-progress, not duplicated across suggestions
    const ids = (Array.isArray(s.nodeIds) ? s.nodeIds : [])
      .filter((i): i is string => typeof i === 'string')
      .filter((i) => byId.has(i) && !seen.has(i));
    if (ids.length === 0) continue;
    ids.forEach((i) => seen.add(i));
    const members = ids.map((i) => byId.get(i)!);
    suggestions.push({
      type: s.type,
      nodeIds: ids,
      reason: (s.reason || '').slice(0, 300),
      distilled: s.type === 'merge' ? (s.distilled || '').slice(0, 4000) : undefined,
      saving: members.reduce((sum, n) => sum + nodeSaving(n), 0),
      touchesKeyMoves: members.some((n) => {
        const ty = (n.data as ThoughtData).summaryTypes?.[(n.data as ThoughtData).responseIndex];
        return ty === 'decision' || ty === 'pivot';
      }),
    });
  }
  suggestions.sort((a, b) => b.saving - a.saving);
  return {
    suggestions,
    auditedNodes: live.filter((n) => (n.data as ThoughtData).response && !(n.data as ThoughtData).stepKind).length,
    totalSaving: suggestions.reduce((s, x) => s + x.saving, 0),
  };
}

/** Apply the picked suggestions in ONE history step: lowered forms are set
    in a single state write; merge suggestions additionally leave their
    distilled note beside the segment head. Wiring untouched, one undo. */
export function applyCondense(picked: CondenseSuggestion[]): { lowered: number; notes: number } {
  const st = useStore.getState();
  if (picked.length === 0) return { lowered: 0, notes: 0 };
  st.pushHistory();
  const ids = new Set(picked.flatMap((s) => s.nodeIds));
  const notes: ThoughtNode[] = [];
  for (const s of picked) {
    if (s.type !== 'merge' || !s.distilled?.trim()) continue;
    const head = st.nodes.find((n) => n.id === s.nodeIds[0]);
    if (!head) continue;
    notes.push(buildContentNode('note', { x: head.position.x - 460, y: head.position.y + notes.length * 60 }, {
      question: s.distilled.trim(),
    }));
  }
  useStore.setState((state) => ({
    nodes: [
      ...state.nodes.map((n) => (ids.has(n.id) ? { ...n, data: { ...n.data, contextForm: 'summary' as const } } : n)),
      ...notes,
    ],
  }));
  return { lowered: ids.size, notes: notes.length };
}
