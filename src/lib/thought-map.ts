import type { ThoughtNode, ThoughtEdge } from '../types';

// Thought map: the structure-only share image. Everything here works on
// SHAPE — positions, kinds, takeaway marks, edge classes — never on text.
// The exported picture carries exactly: the graph's geometry, the counts,
// and whatever title/subtitle the user typed by hand.

export interface MapNode {
  id: string;
  x: number;
  y: number;
  material: boolean;
  root: boolean;
  marked: boolean; // decision / pivot / ruleout — the red dots
  /** creation time in ms, mined from the id ('node-<ms>-<n>') — fuels the
      time-ink gradient (early thoughts pale, late thoughts full ink) */
  ts?: number;
}
export interface MapEdge { s: string; t: string; dashed: boolean }
export interface MapStructure { nodes: MapNode[]; edges: MapEdge[] }

export interface MapStats {
  steps: number;
  materials: number;
  decisions: number;
  pivots: number;
  ruleouts: number;
}

const MATERIAL_KINDS = new Set(['file', 'note', 'link']);

export function extractStructure(nodes: ThoughtNode[], edges: ThoughtEdge[]): MapStructure {
  return {
    nodes: nodes.map((n) => {
      const st = n.data.summaryTypes;
      const tk = Array.isArray(st) ? (st[n.data.responseIndex] ?? st[0]) : undefined;
      const tsMatch = n.id.match(/-(\d{13})-/);
      return {
        id: n.id,
        x: n.position.x,
        y: n.position.y,
        material: MATERIAL_KINDS.has(n.data.stepKind ?? ''),
        root: !!n.data.isRoot,
        marked: tk === 'decision' || tk === 'pivot' || tk === 'ruleout',
        ts: tsMatch ? Number(tsMatch[1]) : undefined,
      };
    }),
    edges: edges.map((e) => ({
      s: e.source,
      t: e.target,
      dashed: !!(e.style?.strokeDasharray) || !!e.data?.isWatch,
    })),
  };
}

export function computeStats(nodes: ThoughtNode[]): MapStats {
  let steps = 0, materials = 0, decisions = 0, pivots = 0, ruleouts = 0;
  for (const n of nodes) {
    if (MATERIAL_KINDS.has(n.data.stepKind ?? '')) { materials++; continue; }
    steps++;
    const st = n.data.summaryTypes;
    const tk = Array.isArray(st) ? (st[n.data.responseIndex] ?? st[0]) : undefined;
    if (tk === 'decision') decisions++;
    else if (tk === 'pivot') pivots++;
    else if (tk === 'ruleout') ruleouts++;
  }
  return { steps, materials, decisions, pivots, ruleouts };
}

/** Column-tree relayout, mirroring the canvas law: a continuation stays in
 *  its column, each extra branch steps into a fresh one; materials sit
 *  beside their first target. Gives every exported map the same visual
 *  grammar regardless of how the canvas was hand-arranged. */
export function tidyPositions(g: MapStructure): Record<string, [number, number]> {
  const byId: Record<string, MapNode> = {};
  g.nodes.forEach((n) => { byId[n.id] = n; });
  const kids: Record<string, string[]> = {};
  const hasQaParent = new Set<string>();
  g.edges.filter((e) => !e.dashed).forEach((e) => {
    (kids[e.s] = kids[e.s] || []).push(e.t);
    if (byId[e.s] && !byId[e.s].material) hasQaParent.add(e.t);
  });
  const pos: Record<string, [number, number]> = {};
  let nextCol = 0;
  const place = (id: string, col: number, depth: number) => {
    if (pos[id]) return;
    pos[id] = [col, depth];
    const qaKids = (kids[id] || []).filter((k) => byId[k] && !byId[k].material && !pos[k]);
    qaKids.forEach((k, i) => place(k, i === 0 ? col : ++nextCol, depth + 1));
  };
  g.nodes.filter((n) => !n.material && !hasQaParent.has(n.id)).forEach((rt) => { place(rt.id, nextCol, 0); nextCol++; });
  const matStack: Record<string, number> = {};
  g.nodes.filter((n) => n.material).forEach((n) => {
    const e = g.edges.find((e) => e.s === n.id && pos[e.t]);
    if (e) {
      const [c, d] = pos[e.t];
      const i = (matStack[e.t] = (matStack[e.t] || 0) + 1);
      pos[n.id] = [c - 0.62, d - 0.55 - (i - 1) * 0.55];
    } else pos[n.id] = [nextCol++, 0];
  });
  g.nodes.forEach((n) => { if (!pos[n.id]) pos[n.id] = [nextCol++, 0]; });
  return Object.fromEntries(Object.entries(pos).map(([id, [c, d]]) => [id, [c * 92, d * 64] as [number, number]]));
}

export function handPositions(g: MapStructure): Record<string, [number, number]> {
  return Object.fromEntries(g.nodes.map((n) => [n.id, [n.x, n.y] as [number, number]]));
}

export const TMAP_SITE_URL = 'https://chenxiachan.github.io/thoughtdag/';

/** The mark a stat item wears on the sheet: ink dot for steps, hollow
 *  diamond for materials, red dot for the judgement family. The stats line
 *  doubles as the legend — numbers and marks point at each other. */
export type StatKind = 'dot' | 'dia' | 'red';

export function statParts(stats: MapStats, lang: 'zh' | 'en'): [number, string, StatKind][] {
  const zh = lang === 'zh';
  const parts: [number, string, StatKind][] = [
    [stats.steps, zh ? '步思考' : stats.steps === 1 ? 'step' : 'steps', 'dot'],
  ];
  if (stats.materials) parts.push([stats.materials, zh ? '份材料' : stats.materials === 1 ? 'source' : 'sources', 'dia']);
  if (stats.decisions) parts.push([stats.decisions, zh ? '项决策' : stats.decisions === 1 ? 'decision' : 'decisions', 'red']);
  if (stats.pivots) parts.push([stats.pivots, zh ? '次转向' : stats.pivots === 1 ? 'pivot' : 'pivots', 'red']);
  if (stats.ruleouts) parts.push([stats.ruleouts, zh ? '次排除' : stats.ruleouts === 1 ? 'rule-out' : 'rule-outs', 'red']);
  return parts;
}

/** The no-key caption: template composed from public pieces only. The
 *  attribution line is appended by the CALLER at copy/share time — it is
 *  never part of the editable body. */
export function fallbackCaption(lang: 'zh' | 'en', title: string, stats: MapStats): string {
  const s = statParts(stats, lang);
  if (lang === 'zh') {
    return `${title}。${s.map(([n, l]) => `${n} ${l}`).join('、')}。这是我思考时留下的形状。`;
  }
  return `${title}. ${s.map(([n, l]) => `${n} ${l}`).join(', ')}.\n\nMapped as I thought.`;
}

/** Visual-width budget: CJK counts 2, latin 1 — 24 Chinese characters and
 *  48 English ones spend the same ink on the sheet. */
export function textWeight(str: string): number {
  let w = 0;
  for (const ch of str) w += /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFF60\u3000-\u303F]/.test(ch) ? 2 : 1;
  return w;
}
export function clampWeight(str: string, max: number): string {
  let w = 0, out = '';
  for (const ch of str) {
    w += /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFF60\u3000-\u303F]/.test(ch) ? 2 : 1;
    if (w > max) break;
    out += ch;
  }
  return out;
}

export function attributionLine(): string {
  return `Made with ThoughtDAG (${TMAP_SITE_URL})`;
}
