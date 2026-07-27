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
  const marks: ExploreMark[] = [];
  for (const e of edges) {
    if (e.source !== nodeId) continue;
    const child = nodes.find((n) => n.id === e.target);
    if (!child?.data.branchContext || child.data.anchor) continue;
    marks.push({
      text: child.data.branchContext.replace(/^\(p\.\s?\d+\)\s*/, ''),
      nodeId: child.id,
      question: child.data.question,
    });
  }
  return marks;
}

/** Store-selector form: a fresh array from a selector re-renders forever
    (zustand compares snapshots with Object.is), so selectors take the
    serialized form and components parse it back behind useMemo. */
export function collectExploreMarksKey(nodeId: string, nodes: ThoughtNode[], edges: ThoughtEdge[]): string {
  return JSON.stringify(collectExploreMarks(nodeId, nodes, edges));
}
