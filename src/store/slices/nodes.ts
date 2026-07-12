import type { StateCreator } from 'zustand';
import type { ThoughtNode, ThoughtEdge } from '../../types';
import { generateId, countTokens } from '../../utils';
import { COLORS } from '../../lib/constants';
import { autoLayout, estimateNodeHeight, nodeHeight } from '../../lib/layout';
import { getDescendantIds, walkUpAncestors } from '../../lib/graph';
import { referenceBlockContent, upstreamFingerprint } from '../context-builder';
import { pruneHighlights } from '../../lib/highlight-match';
import { toast } from '../../lib/ui-store';
import { t, fmt } from '../../i18n';
import type { StoreState, NodeSlice } from '../types';

export const createNodeSlice: StateCreator<StoreState, [], [], NodeSlice> = (set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  selectedNodeIds: [],

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  setSelectedNodeId: (id) => set({ selectedNodeId: id, selectedNodeIds: id ? [id] : [] }),
  setSelectedNodeIds: (ids) => set({ selectedNodeIds: ids, selectedNodeId: ids.length === 1 ? ids[0] : null }),

  deleteNode: (nodeId: string) => {
    get().pushHistory();
    const { edges } = get();
    const descendants = getDescendantIds(nodeId, edges);
    const removeIds = new Set([nodeId, ...descendants]);
    set((state) => ({
      nodes: state.nodes.filter((n) => !removeIds.has(n.id)),
      edges: state.edges.filter((e) => !removeIds.has(e.source) && !removeIds.has(e.target)),
    }));
    get().pushHistory();
  },

  deleteEdges: (edgeIds: string[]) => {
    const remove = new Set(edgeIds);
    if (!get().edges.some((e) => remove.has(e.id))) return;
    get().pushHistory();
    set((state) => ({ edges: state.edges.filter((e) => !remove.has(e.id)) }));
    get().pushHistory();
  },

  editResponse: (nodeId: string, response: string) => {
    get().pushHistory();
    const tokenCount = countTokens(get().nodes.find((n) => n.id === nodeId)?.data.question + response || response);
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              data: {
                ...n.data,
                response,
                responses: n.data.responses.map((r, i) => (i === n.data.responseIndex ? response : r)),
                // a hand-edited answer invalidates its auto summary
                summaries: n.data.summaries?.map((s, i) => (i === n.data.responseIndex ? undefined : s)),
                highlights: pruneHighlights(n.data.highlights, response),
                isEditingResponse: false,
                tokenCount,
              },
            }
          : n
      ),
    }));
    get().pushHistory();
  },

  toggleCollapse: (nodeId: string) => {
    const node = get().nodes.find((n) => n.id === nodeId);
    if (!node) return;

    // Current height is measured; the post-toggle height must be estimated
    const oldHeight = nodeHeight(node);
    const newHeight = estimateNodeHeight({ ...node, data: { ...node.data, isCollapsed: !node.data.isCollapsed } });
    const delta = newHeight - oldHeight;

    // Find all descendants of this node
    const descendants = getDescendantIds(nodeId, get().edges);
    const descSet = new Set(descendants);

    set((state) => ({
      nodes: state.nodes.map((n) => {
        if (n.id === nodeId) {
          return { ...n, data: { ...n.data, isCollapsed: !n.data.isCollapsed } };
        }
        // Shift descendants vertically by delta
        if (descSet.has(n.id)) {
          return { ...n, position: { ...n.position, y: n.position.y + delta } };
        }
        return n;
      }),
    }));
  },

  setEditing: (nodeId: string, editing: boolean) => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, isEditing: editing } } : n
      ),
    }));
  },

  setEditingResponse: (nodeId: string, editing: boolean) => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, isEditingResponse: editing } } : n
      ),
    }));
  },

  duplicateNode: (nodeId: string) => {
    const node = get().nodes.find((n) => n.id === nodeId);
    if (!node) return;
    get().pushHistory();
    const id = generateId();
    const newNode: ThoughtNode = {
      id,
      type: 'thought',
      position: { x: 0, y: 0 },
      dragHandle: '.drag-handle',
      data: {
        ...node.data,
        isCollapsed: true,
        isEditing: false,
        isEditingResponse: false,
        isLoading: false,
        highlights: node.data.highlights.map((h) => ({ ...h, id: generateId() })),
      },
    };
    // Find parent edge and create same type of edge
    const parentEdge = get().edges.find((e) => e.target === nodeId);
    const newEdge = parentEdge ? {
      ...parentEdge,
      id: `edge-${parentEdge.source}-${id}`,
      target: id,
    } : null;
    const newEdges = newEdge ? [...get().edges, newEdge] : get().edges;
    const newNodes = autoLayout([...get().nodes, newNode], newEdges);
    set({ nodes: newNodes, edges: newEdges, selectedNodeId: id });
    get().pushHistory();
  },

  addCrossLink: (sourceId: string, targetId: string) => {
    const { edges, nodes } = get();
    // Block only an identical edge. The REVERSE direction is allowed on
    // purpose: writer->critic->writer loops are how auto-refresh iterates
    // (context walks are visited-guarded, and auto-chains are budgeted).
    const exists = edges.some((e) => e.source === sourceId && e.target === targetId);
    if (exists) return;
    get().pushHistory();
    // Anchor by geometry: a reference into a node right below reads as part
    // of the vertical grammar (bottom→top); anything else routes via the
    // side channel so dashed lines never cut across the chain columns.
    const src = nodes.find((n) => n.id === sourceId);
    const tgt = nodes.find((n) => n.id === targetId);
    const vertical = !!src && !!tgt
      && tgt.position.y > src.position.y + 60
      && Math.abs(tgt.position.x - src.position.x) < 320;
    const newEdge: ThoughtEdge = {
      id: `crosslink-${sourceId}-${targetId}`,
      source: sourceId,
      sourceHandle: vertical ? 'continue' : 'branch',
      target: targetId,
      targetHandle: vertical ? 'top' : 'left',
      type: 'smoothstep',
      style: { stroke: COLORS.accent, strokeDasharray: '8 4', strokeWidth: 2 },
      animated: true,
      data: { isCrossLink: true },
    };
    set((state) => ({ edges: [...state.edges, newEdge] }));
    get().pushHistory();
    // Price tag at the moment of connection — BOTH prices, so it's a
    // decision, not a nudge. When the source has no upstream chain the two
    // depths are the same thing; asking would be noise, so we don't.
    if (src && !['note', 'file', 'link'].includes(src.data.stepKind ?? '')) {
      const { ordered } = walkUpAncestors(sourceId, nodes, edges.filter((e) => !e.data?.isCrossLink));
      const chain = ordered.filter((n) => n.id !== sourceId && !['note', 'file', 'link'].includes(n.data.stepKind ?? ''));
      if (chain.length > 0) {
        const quoteTok = countTokens(referenceBlockContent({ source: src, edge: newEdge, depth: 'quote', chain }));
        const fullTok = countTokens(referenceBlockContent({ source: src, edge: newEdge, depth: 'full', chain }));
        toast('info', fmt(t('edge.linkedQuote'), { n: quoteTok }), 8000, {
          label: fmt(t('edge.makeFull'), { m: fullTok }),
          run: () => get().setCrossLinkDepth(newEdge.id, 'full'),
        });
      }
    }
  },

  staleIds: [],

  // A node is stale when the live fingerprint of everything it depended on
  // (materials, references, ancestor turns) no longer matches the one
  // recorded when its answer was generated. Nodes generated before
  // provenance recording (no lastContextHash) are never flagged — honest:
  // unknown provenance, not known-stale. Re-running a node re-records.
  recomputeStaleness: () => {
    const { nodes, edges } = get();
    const stale: string[] = [];
    for (const n of nodes) {
      if (!n.data.lastContextHash || !n.data.response) continue;
      if (['note', 'file', 'link', 'frame'].includes(n.data.stepKind ?? '')) continue;
      if (upstreamFingerprint(n.id, nodes, edges) !== n.data.lastContextHash) stale.push(n.id);
    }
    const prev = get().staleIds;
    if (prev.length === stale.length && prev.every((id, i) => id === stale[i])) return;
    set({ staleIds: stale });
  },

  setCrossLinkDepth: (edgeId: string, depth: 'quote' | 'full') => {
    get().pushHistory();
    set((state) => ({
      edges: state.edges.map((e) => {
        if (e.id !== edgeId || !e.data?.isCrossLink) return e;
        return {
          ...e,
          // full = denser dash + heavier stroke; the depth is readable off the line
          style: { ...e.style, strokeDasharray: depth === 'full' ? '12 3' : '8 4', strokeWidth: depth === 'full' ? 3 : 2 },
          data: { ...e.data, contextDepth: depth === 'full' ? 'full' as const : undefined },
        };
      }),
    }));
    get().pushHistory();
  },

  navigateVersion: (nodeId: string, direction: 'prev' | 'next') => {
    set((state) => ({
      nodes: state.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        const { responses, responseIndex } = n.data;
        let newIndex = direction === 'prev' ? responseIndex - 1 : responseIndex + 1;
        if (newIndex < 0) newIndex = responses.length - 1;
        if (newIndex >= responses.length) newIndex = 0;
        return {
          ...n,
          data: { ...n.data, responseIndex: newIndex, response: responses[newIndex], highlights: pruneHighlights(n.data.highlights, responses[newIndex]) },
        };
      }),
    }));
  },

  deleteVersion: (nodeId: string, versionIndex: number) => {
    get().pushHistory();
    set((state) => ({
      nodes: state.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        const newResponses = n.data.responses.filter((_, i) => i !== versionIndex);
        if (newResponses.length === 0) return n; // Don't delete last version
        const newIndex = Math.min(n.data.responseIndex, newResponses.length - 1);
        return {
          ...n,
          data: {
            ...n.data,
            responses: newResponses,
            responseIndex: newIndex,
            response: newResponses[newIndex],
            summaries: n.data.summaries?.filter((_, i) => i !== versionIndex),
            generatedBy: n.data.generatedBy?.filter((_, i) => i !== versionIndex),
            highlights: pruneHighlights(n.data.highlights, newResponses[newIndex]),
          },
        };
      }),
    }));
    get().pushHistory();
  },

  relayout: () => {
    get().pushHistory();
    set((state) => ({ nodes: autoLayout(state.nodes, state.edges) }));
    get().pushHistory();
  },

  setArchived: (nodeIds: string[], archived: boolean) => {
    const ids = new Set(nodeIds);
    get().pushHistory();
    set((state) => ({
      nodes: state.nodes.map((n) =>
        ids.has(n.id) ? { ...n, data: { ...n.data, archived: archived || undefined } } : n
      ),
    }));
    get().pushHistory();
  },

  setNodeModel: (nodeId: string, model: string | undefined) => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, model } } : n
      ),
    }));
  },

  alignSelection: (nodeIds: string[]) => {
    if (nodeIds.length < 2) return;
    const selected = new Set(nodeIds);
    const { nodes, edges } = get();

    // Conversation order: within the selection, an arrow-ancestor comes
    // before its descendants (structural + adopted links); ties break by y.
    const depth = new Map<string, number>();
    const structural = edges.filter((e) => !e.data?.isWatch);
    const depthOf = (id: string, seen: Set<string>): number => {
      if (depth.has(id)) return depth.get(id)!;
      if (seen.has(id)) return 0;
      seen.add(id);
      const parents = structural.filter((e) => e.target === id && selected.has(e.source));
      const d = parents.length === 0 ? 0 : 1 + Math.max(...parents.map((e) => depthOf(e.source, seen)));
      depth.set(id, d);
      return d;
    };
    const ordered = nodeIds
      .map((id) => nodes.find((n) => n.id === id))
      .filter((n): n is ThoughtNode => !!n)
      .sort((a, b) =>
        (depthOf(a.id, new Set()) - depthOf(b.id, new Set())) || (a.position.y - b.position.y)
      );

    get().pushHistory();
    const anchor = ordered[0].position;
    let y = anchor.y;
    const placed = new Map<string, { x: number; y: number }>();
    for (const n of ordered) {
      placed.set(n.id, { x: anchor.x, y });
      y += nodeHeight(n) + 40;
    }
    set((state) => ({
      nodes: state.nodes.map((n) => {
        const pos = placed.get(n.id);
        return pos ? { ...n, position: pos } : n;
      }),
    }));
    get().pushHistory();
  },

  batchDelete: (nodeIds: string[]) => {
    get().pushHistory();
    const removeSet = new Set(nodeIds);
    set((state) => ({
      nodes: state.nodes.filter((n) => !removeSet.has(n.id)),
      edges: state.edges.filter((e) => !removeSet.has(e.source) && !removeSet.has(e.target)),
      selectedNodeId: null,
      selectedNodeIds: [],
    }));
    get().pushHistory();
  },
});
