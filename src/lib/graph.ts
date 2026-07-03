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

// Context path of a node: all ancestors in topological order, node itself last.
export function getContextPath(
  nodeId: string,
  nodes: ThoughtNode[],
  edges: ThoughtEdge[]
): ThoughtNode[] {
  return walkUpAncestors(nodeId, nodes, edges).ordered;
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
