import type { StateCreator } from 'zustand';
import type { ThoughtNode, ThoughtEdge } from '../../types';
import { generateId, countTokens } from '../../utils';
import { COLORS } from '../../lib/constants';
import { autoLayout, estimateNodeHeight } from '../../lib/layout';
import { getDescendantIds } from '../../lib/graph';
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
                isEditingResponse: false,
                tokenCount,
                highlights: n.data.highlights.filter((h) => response.includes(h.text)),
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

    // Estimate height before and after toggle
    const oldHeight = estimateNodeHeight(node);
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
    const { edges } = get();
    // Don't add if already exists or if it's a structural parent-child
    const exists = edges.some(
      (e) => (e.source === sourceId && e.target === targetId) || (e.source === targetId && e.target === sourceId)
    );
    if (exists) return;
    get().pushHistory();
    const newEdge: ThoughtEdge = {
      id: `crosslink-${sourceId}-${targetId}`,
      source: sourceId,
      target: targetId,
      type: 'smoothstep',
      style: { stroke: COLORS.accent, strokeDasharray: '8 4', strokeWidth: 2 },
      animated: true,
      data: { isCrossLink: true },
    };
    set((state) => ({ edges: [...state.edges, newEdge] }));
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
          data: { ...n.data, responseIndex: newIndex, response: responses[newIndex] },
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
          },
        };
      }),
    }));
    get().pushHistory();
  },

  relayout: () => {
    get().pushHistory();
    set((state) => {
      const laid = autoLayout(state.nodes, state.edges);
      // Evaluators skip the column tree — seat them beside their watched
      // node, stacking downward when several watch the same node.
      const stacked = new Map<string, number>();
      const nodes = laid.map((n) => {
        if (!n.data.isEvaluator) return n;
        const watchEdge = state.edges.find((e) => e.target === n.id && e.data?.isWatch);
        const watched = watchEdge ? laid.find((x) => x.id === watchEdge.source) : undefined;
        if (!watched) return n;
        const offset = stacked.get(watched.id) ?? 0;
        stacked.set(watched.id, offset + 1);
        return { ...n, position: { x: watched.position.x + 640, y: watched.position.y + offset * 280 } };
      });
      return { nodes };
    });
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
