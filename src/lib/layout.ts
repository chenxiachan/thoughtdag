import type { ThoughtNode, ThoughtEdge } from '../types';
import { getDescendantIds } from './graph';
import { COLLAPSED_NODE_HEIGHT, LAYOUT_COL_WIDTH, LAYOUT_H_GAP, LAYOUT_V_GAP } from './constants';

// Estimated rendered height of a node — used for layout and collapse shifting.
export function estimateNodeHeight(node: ThoughtNode): number {
  if (node.data.isCollapsed) return COLLAPSED_NODE_HEIGHT;
  const responseLen = (node.data.response || '').length;
  const estimated = 150 + (responseLen / 3);
  return Math.max(220, Math.min(600, estimated));
}

/**
 * Column-Tree layout with collision resolution.
 *
 * Pass 1 — Column assignment:
 *   - Each continuation chain (first non-branch child) inherits the parent's column.
 *   - Additional children (explore / duplicate / distill / regenerate siblings)
 *     are assigned to the next available column to the right.
 *   - Multiple roots each get their own column group.
 *
 * Pass 2 — Vertical positioning:
 *   - Within a column, nodes are placed top-to-bottom in chain order.
 *   - A branch child's y aligns with (or slightly below) its parent's y.
 *
 * Pass 3 — Collision detection & nudge:
 *   - Sort all nodes by y, then by column.
 *   - Any overlap (bbox intersection + padding) pushes the lower node down.
 *   - Iterates until stable (max 5 passes).
 */
export function autoLayout(nodes: ThoughtNode[], edges: ThoughtEdge[]): ThoughtNode[] {
  if (nodes.length === 0) return nodes;

  const NODE_WIDTH = LAYOUT_COL_WIDTH;
  const H_GAP = LAYOUT_H_GAP;
  const V_GAP = LAYOUT_V_GAP;
  const V_PAD = 30; // extra vertical padding for collision

  // --- Structural edges (no cross-links) ---
  const structuralEdges = edges.filter((e) => !e.data?.isCrossLink);
  const targetIds = new Set(structuralEdges.map((e) => e.target));
  const roots = nodes.filter((n) => !targetIds.has(n.id));

  const childrenMap = new Map<string, string[]>();
  for (const edge of structuralEdges) {
    const list = childrenMap.get(edge.source) || [];
    list.push(edge.target);
    childrenMap.set(edge.source, list);
  }

  // Classify children into 3 types:
  // 1. Continuation — first non-explore child, inherits parent column
  // 2. Regenerate siblings — other non-explore children, columns adjacent to parent
  // 3. Explore branches — isBranchFromSelection, columns further out
  const exploreTargets = new Set(
    edges.filter((e) => e.data?.isBranchFromSelection).map((e) => e.target)
  );

  function classifyChildren(parentId: string): {
    continuation: string | null;
    regenerates: string[];
    explores: string[];
  } {
    const children = childrenMap.get(parentId) || [];
    const nonExplore = children.filter((c) => !exploreTargets.has(c));
    const explores = children.filter((c) => exploreTargets.has(c));
    return {
      continuation: nonExplore[0] ?? null,
      regenerates: nonExplore.slice(1),
      explores,
    };
  }

  // --- Pass 1: Assign columns ---
  const nodeColumn = new Map<string, number>();
  let nextColumn = 0;

  function assignColumns(nodeId: string, col: number) {
    if (nodeColumn.has(nodeId)) return;
    nodeColumn.set(nodeId, col);

    const { continuation, regenerates, explores } = classifyChildren(nodeId);

    // Continuation inherits same column
    if (continuation) {
      assignColumns(continuation, col);
    }

    // Regenerate siblings: columns immediately adjacent (col+1, col+2, ...)
    for (let i = 0; i < regenerates.length; i++) {
      const regenCol = col + 1 + i;
      nextColumn = Math.max(nextColumn, regenCol + 1);
      assignColumns(regenerates[i], regenCol);
    }

    // Explore branches: after all regenerate columns
    for (const ec of explores) {
      const exploreCol = nextColumn;
      nextColumn++;
      assignColumns(ec, exploreCol);
    }
  }

  for (const root of roots) {
    const rootCol = nextColumn;
    nextColumn++;
    assignColumns(root.id, rootCol);
  }

  // --- Pass 2: Vertical positioning ---
  const nodeHeightMap = new Map<string, number>();
  for (const node of nodes) {
    nodeHeightMap.set(node.id, estimateNodeHeight(node));
  }

  const positioned = new Map<string, { x: number; y: number }>();

  // BFS in topological order to assign y
  const visited = new Set<string>();
  const queue: string[] = [...roots.map((r) => r.id)];

  // Place roots at y=0
  for (const rootId of queue) {
    const col = nodeColumn.get(rootId) ?? 0;
    positioned.set(rootId, { x: col * (NODE_WIDTH + H_GAP), y: 0 });
    visited.add(rootId);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const parentPos = positioned.get(current)!;
    const parentHeight = nodeHeightMap.get(current) || 220;

    const { continuation, regenerates, explores } = classifyChildren(current);

    if (continuation && !visited.has(continuation)) {
      visited.add(continuation);
      const col = nodeColumn.get(continuation) ?? 0;
      positioned.set(continuation, {
        x: col * (NODE_WIDTH + H_GAP),
        y: parentPos.y + parentHeight + V_GAP,
      });
      queue.push(continuation);
    }

    // Regenerate siblings: same y as continuation (they're alternative answers)
    const continuationY = parentPos.y + parentHeight + V_GAP;
    for (const rc of regenerates) {
      if (visited.has(rc)) continue;
      visited.add(rc);
      const col = nodeColumn.get(rc) ?? 0;
      positioned.set(rc, {
        x: col * (NODE_WIDTH + H_GAP),
        y: continuationY,
      });
      queue.push(rc);
    }

    // Explore branches: start at parent's y (slight offset for visible edge)
    for (const ec of explores) {
      if (visited.has(ec)) continue;
      visited.add(ec);
      const col = nodeColumn.get(ec) ?? 0;
      positioned.set(ec, {
        x: col * (NODE_WIDTH + H_GAP),
        y: parentPos.y + parentHeight * 0.25,
      });
      queue.push(ec);
    }
  }

  // Handle any orphan nodes (shouldn't happen, but safety)
  for (const node of nodes) {
    if (!positioned.has(node.id)) {
      positioned.set(node.id, { x: 0, y: 0 });
    }
  }

  // --- Pass 3: Collision resolution ---
  // Group nodes by column, sort by y within each column, push down overlaps
  const columnNodes = new Map<number, string[]>();
  for (const node of nodes) {
    const col = nodeColumn.get(node.id) ?? 0;
    const list = columnNodes.get(col) || [];
    list.push(node.id);
    columnNodes.set(col, list);
  }

  for (let pass = 0; pass < 5; pass++) {
    let moved = false;

    for (const [, colNodeIds] of columnNodes) {
      // Sort by current y
      colNodeIds.sort((a, b) => (positioned.get(a)!.y) - (positioned.get(b)!.y));

      for (let i = 1; i < colNodeIds.length; i++) {
        const prevId = colNodeIds[i - 1];
        const currId = colNodeIds[i];
        const prevPos = positioned.get(prevId)!;
        const currPos = positioned.get(currId)!;
        const prevHeight = nodeHeightMap.get(prevId) || 220;

        const minY = prevPos.y + prevHeight + V_PAD;
        if (currPos.y < minY) {
          const delta = minY - currPos.y;
          currPos.y = minY;
          moved = true;

          // Push all descendants down too (within same column)
          const descIds = getDescendantIds(currId, structuralEdges);
          for (const dId of descIds) {
            const dPos = positioned.get(dId);
            if (dPos && nodeColumn.get(dId) === nodeColumn.get(currId)) {
              dPos.y += delta;
            }
          }
        }
      }
    }

    if (!moved) break;
  }

  return nodes.map((node) => {
    const pos = positioned.get(node.id);
    return pos ? { ...node, position: pos } : node;
  });
}
