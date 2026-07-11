import type { ThoughtNode, ThoughtEdge } from '../types';
import { countTokens } from '../utils';

// Topology diagnostics: the whole-graph mirror (see TOPOLOGY_DIAGNOSTICS.md).
// Tier 1 findings are deterministic (zero thresholds, zero false positives
// at the graph-theory level) and each maps to an existing action. Tier 2
// are observations with conservative hardcoded thresholds — shown, never
// auto-fixed. Detection reads SHAPES, never asks the user to label nodes.

export type FindingKind =
  | 'residual-edge' | 'shadow-reference' | 'blind-pool-breach' | 'pool-asymmetry'
  | 'long-chain' | 'open-branches' | 'collider-continuation' | 'orphan-materials' | 'load-bearing';

export interface Finding {
  tier: 1 | 2;
  kind: FindingKind;
  /** i18n params rendered by the panel. */
  params: Record<string, string | number>;
  /** Jump targets (first one is centered). */
  nodeIds: string[];
  /** Offending edges — deleting them IS the fix (Tier 1 only). */
  edgeIds: string[];
  fixable: boolean;
}

const CONTENT_KINDS = new Set(['note', 'file', 'link']);
const title = (n: ThoughtNode | undefined) => {
  const q = (n?.data.question ?? '').replace(/\s+/g, ' ').trim();
  return q.length > 24 ? `${q.slice(0, 24)}…` : q || '(空)';
};

function reachable(from: string, to: string, adj: Map<string, string[]>): boolean {
  const seen = new Set<string>([from]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const next of adj.get(cur) ?? []) {
      if (next === to) return true;
      if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  return false;
}

function adjacency(edges: ThoughtEdge[]): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  }
  return adj;
}

export function runDiagnostics(nodes: ThoughtNode[], edges: ThoughtEdge[]): Finding[] {
  const findings: Finding[] = [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const structural = edges.filter((e) => !e.data?.isCrossLink);
  const references = edges.filter((e) => e.data?.isCrossLink);
  const structAdj = adjacency(structural);
  const allAdj = adjacency(edges);

  // ── Tier 1.1 residual solid edges: u→v shadowed by a longer solid path ──
  for (const e of structural) {
    const without = adjacency(structural.filter((x) => x.id !== e.id));
    if (reachable(e.source, e.target, without)) {
      findings.push({
        tier: 1, kind: 'residual-edge', fixable: true,
        params: { a: title(byId.get(e.source)), b: title(byId.get(e.target)) },
        nodeIds: [e.target, e.source], edgeIds: [e.id],
      });
    }
  }

  // ── Tier 1.2 shadow references: dashed u⇢v while u's FULL content already
  //    flows to v along solid edges (content enters twice) ──
  for (const e of references) {
    if (reachable(e.source, e.target, structAdj)) {
      findings.push({
        tier: 1, kind: 'shadow-reference', fixable: true,
        params: { a: title(byId.get(e.source)), b: title(byId.get(e.target)) },
        nodeIds: [e.target, e.source], edgeIds: [e.id],
      });
    }
  }

  // ── candidate pools: paradigm prompt-siblings AND manual fan-out siblings
  //    (isBranch), grouped by their shared structural parent ──
  const childrenOf = new Map<string, string[]>();
  for (const e of structural) {
    if (!childrenOf.has(e.source)) childrenOf.set(e.source, []);
    childrenOf.get(e.source)!.push(e.target);
  }
  const pools: string[][] = [];
  for (const kids of childrenOf.values()) {
    const prompts = kids.filter((k) => byId.get(k)?.data.stepKind === 'prompt');
    const branches = kids.filter((k) => byId.get(k)?.data.isBranch);
    if (prompts.length >= 2) pools.push(prompts);
    if (branches.length >= 2) pools.push(branches);
  }

  // ── Tier 1.3 blind-pool breach: a candidate can read a sibling ──
  for (const pool of pools) {
    for (const a of pool) {
      for (const b of pool) {
        if (a === b) continue;
        if (reachable(a, b, allAdj)) {
          const direct = edges.find((e) => e.source === a && e.target === b);
          findings.push({
            tier: 1, kind: 'blind-pool-breach', fixable: !!direct,
            params: { a: title(byId.get(b)), b: title(byId.get(a)) },
            nodeIds: [b, a], edgeIds: direct ? [direct.id] : [],
          });
        }
      }
    }
  }

  // ── Tier 1.4 pool asymmetry: a candidate has private inputs its siblings
  //    lack (someone fed one juror extra evidence) ──
  for (const pool of pools) {
    const inSources = pool.map((id) => new Set(edges.filter((e) => e.target === id).map((e) => e.source)));
    const shared = new Set([...inSources[0]].filter((s) => inSources.every((set) => set.has(s))));
    pool.forEach((id, i) => {
      const extra = [...inSources[i]].filter((s) => !shared.has(s) && !pool.includes(s));
      if (extra.length > 0) {
        findings.push({
          tier: 1, kind: 'pool-asymmetry', fixable: false,
          params: { a: title(byId.get(id)), n: extra.length },
          nodeIds: [id, ...extra], edgeIds: [],
        });
      }
    });
  }

  // ── Tier 2: longest chains (depth + cumulative tokens, DP over the DAG) ──
  const qaNodes = nodes.filter((n) => !CONTENT_KINDS.has(n.data.stepKind ?? '') && n.data.stepKind !== 'frame');
  const depth = new Map<string, number>();
  const cumTok = new Map<string, number>();
  const nodeTok = (n: ThoughtNode) => countTokens(n.data.question + n.data.response);
  const indeg = new Map<string, number>();
  for (const n of qaNodes) indeg.set(n.id, 0);
  for (const e of structural) if (indeg.has(e.target) && indeg.has(e.source)) indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
  const queue = qaNodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
  const order: string[] = [];
  const indegWork = new Map(indeg);
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of structAdj.get(id) ?? []) {
      if (!indegWork.has(next)) continue;
      indegWork.set(next, indegWork.get(next)! - 1);
      if (indegWork.get(next) === 0) queue.push(next);
    }
  }
  for (const id of order) {
    const n = byId.get(id)!;
    const parents = structural.filter((e) => e.target === id && depth.has(e.source));
    const d = parents.length ? Math.max(...parents.map((e) => depth.get(e.source)!)) + 1 : 1;
    const tok = parents.length ? Math.max(...parents.map((e) => cumTok.get(e.source)!)) + nodeTok(n) : nodeTok(n);
    depth.set(id, d);
    cumTok.set(id, tok);
  }
  const leaves = qaNodes.filter((n) => !(structAdj.get(n.id) ?? []).length && !n.data.archived);
  const heavy = leaves
    .filter((n) => (depth.get(n.id) ?? 0) >= 8 || (cumTok.get(n.id) ?? 0) >= 15000)
    .sort((x, y) => (depth.get(y.id) ?? 0) - (depth.get(x.id) ?? 0))
    .slice(0, 3);
  for (const n of heavy) {
    findings.push({
      tier: 2, kind: 'long-chain', fixable: false,
      params: { a: title(n), d: depth.get(n.id) ?? 0, tok: cumTok.get(n.id) ?? 0 },
      nodeIds: [n.id], edgeIds: [],
    });
  }

  // ── Tier 2: open branches (unarchived QA leaves piling up) ──
  const openLeaves = leaves.filter((n) => n.data.response);
  if (openLeaves.length >= 4) {
    findings.push({
      tier: 2, kind: 'open-branches', fixable: false,
      params: { n: openLeaves.length },
      nodeIds: openLeaves.map((n) => n.id), edgeIds: [],
    });
  }

  // ── Tier 2: collider continuation (attribution collapse markers) ──
  for (const n of qaNodes) {
    const indegN = structural.filter((e) => e.target === n.id).length;
    const outdegN = (structAdj.get(n.id) ?? []).length;
    if (indegN >= 2 && outdegN >= 1) {
      findings.push({
        tier: 2, kind: 'collider-continuation', fixable: false,
        params: { a: title(n), n: indegN },
        nodeIds: [n.id], edgeIds: [],
      });
    }
  }

  // ── Tier 2: orphan materials (aggregate of the per-node badge) ──
  const orphans = nodes.filter((n) => CONTENT_KINDS.has(n.data.stepKind ?? '') && !edges.some((e) => e.source === n.id));
  if (orphans.length > 0) {
    findings.push({
      tier: 2, kind: 'orphan-materials', fixable: false,
      params: { n: orphans.length },
      nodeIds: orphans.map((n) => n.id), edgeIds: [],
    });
  }

  // ── Tier 2: load-bearing nodes (large dominated sets → edit blast radius) ──
  const descCount = (id: string): number => {
    const seen = new Set<string>();
    const q = [id];
    while (q.length) {
      for (const next of structAdj.get(q.shift()!) ?? []) {
        if (!seen.has(next)) { seen.add(next); q.push(next); }
      }
    }
    return seen.size;
  };
  const bearers = qaNodes
    .map((n) => ({ n, c: descCount(n.id) }))
    .filter(({ c }) => c >= 5)
    .sort((x, y) => y.c - x.c)
    .slice(0, 3);
  for (const { n, c } of bearers) {
    findings.push({
      tier: 2, kind: 'load-bearing', fixable: false,
      params: { a: title(n), n: c },
      nodeIds: [n.id], edgeIds: [],
    });
  }

  return findings.sort((a, b) => a.tier - b.tier);
}
