import type { ThoughtNode, ThoughtEdge } from '../types';

/**
 * Post-order DFS up ALL incoming edges (blue, orange, cross-link).
 * Returns ancestors in topological order (roots first, start node last)
 * plus the set of edge ids traversed — the single source of truth for
 * "what does this node's context consist of".
 */
export function walkUpAncestors(
  startIds: string | string[],
  nodes: ThoughtNode[],
  edges: ThoughtEdge[],
): { ordered: ThoughtNode[]; visitedEdgeIds: Set<string> } {
  const starts = Array.isArray(startIds) ? startIds : [startIds];
  const ordered: ThoughtNode[] = [];
  const visited = new Set<string>();
  const visitedEdgeIds = new Set<string>();

  function walkUp(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    for (const edge of edges) {
      if (edge.target !== id) continue;
      visitedEdgeIds.add(edge.id);
      walkUp(edge.source);
    }
    ordered.push(node);
  }

  for (const id of starts) walkUp(id);
  return { ordered, visitedEdgeIds };
}

const CONTENT_KINDS = new Set(['note', 'file', 'link']);

/** One dashed reference feeding a context: the node it quotes, the edge
    that brought it, and (for depth 'full') the structural chain behind it. */
export interface ContextReference {
  source: ThoughtNode;
  edge: ThoughtEdge;
  depth: 'quote' | 'full';
  /** Structural ancestors of the source (roots first), source EXCLUDED.
      Quote depth renders these as a one-line question trail; full depth
      renders their whole Q/A transcript inside the block. */
  chain: ThoughtNode[];
}

export interface ContextPartition {
  /** Content nodes (notes / files / links) feeding this context, any edge kind. */
  materials: ThoughtNode[];
  /** Dashed cross-links into the mainline, one reference block each. */
  references: ContextReference[];
  /** Structural ancestors in chain order, the node itself last. */
  mainline: ThoughtNode[];
}

/**
 * The layered view of a node's context — the single structure behind the
 * prompt builder, the panel's context tree and the follow-up preview, so
 * what the model reads and what the user sees never drift apart.
 *
 * Layers by HOW content enters (the One Rule, ordered):
 *   materials  — content nodes: background blocks with [Note]/[File] identity
 *   references — dashed edges: fenced [Reference] blocks (quote or full)
 *   mainline   — solid edges: the live conversation, strict chain order
 * A reference never forwards its own references (one level of indirection).
 */
export function partitionContext(
  nodeId: string,
  nodes: ThoughtNode[],
  edges: ThoughtEdge[],
): ContextPartition {
  const structural = edges.filter((e) => !e.data?.isCrossLink);
  const crossLinks = edges.filter((e) => e.data?.isCrossLink);

  // Mainline: structural walk only (content ancestors pulled out as materials)
  const { ordered: structuralOrdered } = walkUpAncestors(nodeId, nodes, structural);
  const materials: ThoughtNode[] = [];
  const mainline: ThoughtNode[] = [];
  for (const n of structuralOrdered) {
    (CONTENT_KINDS.has(n.data.stepKind ?? '') ? materials : mainline).push(n);
  }
  const mainlineIds = new Set(structuralOrdered.map((n) => n.id));

  // References: cross-links pointing at the node or any structural ancestor
  const references: ContextReference[] = [];
  const seenRefSources = new Set<string>();
  for (const edge of crossLinks) {
    if (!mainlineIds.has(edge.target)) continue;
    if (mainlineIds.has(edge.source)) continue; // already in the conversation
    if (seenRefSources.has(edge.source)) continue;
    const source = nodes.find((n) => n.id === edge.source);
    if (!source) continue;
    seenRefSources.add(edge.source);
    if (CONTENT_KINDS.has(source.data.stepKind ?? '')) {
      // Hand-wired material is still material — full identity block, no trail
      materials.push(source);
      continue;
    }
    const { ordered: refOrdered } = walkUpAncestors(edge.source, nodes, structural);
    const chain: ThoughtNode[] = [];
    for (const n of refOrdered) {
      if (n.id === edge.source) continue;
      if (mainlineIds.has(n.id)) continue; // shared ancestry stays deduped
      if (CONTENT_KINDS.has(n.data.stepKind ?? '')) continue; // trail is Q/A only
      chain.push(n);
    }
    references.push({ source, edge, depth: edge.data?.contextDepth === 'full' ? 'full' : 'quote', chain });
  }

  return { materials, references, mainline };
}

// Context path of a node: all ancestors in topological order, node itself last.
export function getContextPath(
  nodeId: string,
  nodes: ThoughtNode[],
  edges: ThoughtEdge[]
): ThoughtNode[] {
  return walkUpAncestors(nodeId, nodes, edges).ordered;
}

/**
 * Transitive reduction of a selection: keep only the nodes with NO selected
 * STRUCTURAL descendant (the maximal antichain / the sinks of each selected
 * cluster). Wiring the sinks alone feeds the complete context — every
 * selected ancestor flows in along its chain — with zero redundant
 * "residual" edges. Reachability deliberately ignores dashed references:
 * they carry quotes, not full content, so they must not justify dropping a
 * solid edge.
 */
export function selectionSinks(nodeIds: string[], edges: ThoughtEdge[]): string[] {
  const selected = new Set(nodeIds);
  return nodeIds.filter((id) => !getDescendantIds(id, edges).some((d) => selected.has(d)));
}

// All structural descendants (cross-links don't count as parent-child).
export function getDescendantIds(
  nodeId: string,
  edges: ThoughtEdge[]
): string[] {
  const descendants: string[] = [];
  const queue = [nodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = edges.filter((e) => e.source === current && !e.data?.isCrossLink).map((e) => e.target);
    descendants.push(...children);
    queue.push(...children);
  }
  return descendants;
}
