import type { ThoughtNode, ThoughtEdge } from '../types';

export interface ExploreMark {
  /** The passage the branch explores (reader page prefix stripped). */
  text: string;
  /** The child node born from that selection. */
  nodeId: string;
  /** Its question, for the hover preview. */
  question: string;
}

/** Passages of a node's answer that child branches explore from. Derived
    entirely from the children's branchContext — nothing new is stored, so
    existing canvases grow the marks retroactively. PDF-anchored branches
    are excluded: their mark lives in the reader, and the same words
    showing up in the answer would be a false anchor. */
export function collectExploreMarks(nodeId: string, nodes: ThoughtNode[], edges: ThoughtEdge[]): ExploreMark[] {
  return JSON.parse(collectExploreMarksKey(nodeId, nodes, edges)) as ExploreMark[];
}

// Every card runs the selector below on every store change; walking
// edges×nodes per card multiplies into real work during streaming. One
// O(N+E) pass builds the whole canvas's marks and is reused until the
// nodes/edges array references change.
let cacheNodes: ThoughtNode[] | null = null;
let cacheEdges: ThoughtEdge[] | null = null;
let cacheMap: Map<string, string> = new Map();
const EMPTY = '[]';

/** Store-selector form: returns the serialized marks for one node. A fresh
    array from a selector re-renders forever (zustand compares snapshots
    with Object.is), so selectors take this string and components parse it
    back behind useMemo. */
export function collectExploreMarksKey(nodeId: string, nodes: ThoughtNode[], edges: ThoughtEdge[]): string {
  if (cacheNodes !== nodes || cacheEdges !== edges) {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const bySource = new Map<string, ExploreMark[]>();
    for (const e of edges) {
      const child = byId.get(e.target);
      if (!child?.data.branchContext || child.data.anchor) continue;
      const arr = bySource.get(e.source) ?? [];
      arr.push({
        text: child.data.branchContext.replace(/^\(p\.\s?\d+\)\s*/, ''),
        nodeId: child.id,
        question: child.data.question,
      });
      bySource.set(e.source, arr);
    }
    cacheMap = new Map([...bySource].map(([k, v]) => [k, JSON.stringify(v)]));
    cacheNodes = nodes;
    cacheEdges = edges;
  }
  return cacheMap.get(nodeId) ?? EMPTY;
}
