import type { StateCreator } from 'zustand';
import type { ThoughtNode, ThoughtEdge } from '../../types';
import { generateId, countTokens } from '../../utils';
import { COLORS } from '../../lib/constants';
import { healLegacyNoteEdges, autoLayout, estimateNodeHeight, nodeHeight } from '../../lib/layout';
import { getDescendantIds, walkUpAncestors } from '../../lib/graph';
import { referenceBlockContent, upstreamFingerprint, buildContext } from '../context-builder';
import { pruneHighlights } from '../../lib/highlight-match';
import { toast } from '../../lib/ui-store';
import { t, fmt } from '../../i18n';
import type { StoreState, NodeSlice } from '../types';
import { condenseGuard } from '../../lib/condense-guard';

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
    if (condenseGuard()) return;
    get().logEvent('delete', nodeId, { n: 1 });
    get().pushHistory();
    const { edges } = get();
    const descendants = getDescendantIds(nodeId, edges);
    const removeIds = new Set([nodeId, ...descendants]);
    set((state) => ({
      nodes: state.nodes.filter((n) => !removeIds.has(n.id)),
      edges: state.edges.filter((e) => !removeIds.has(e.source) && !removeIds.has(e.target)),
    }));
    get().pushHistory();
    // deletion IS unsubscription — see canonical.unsubscribeOrphanedSessions
    void import('../../lib/atlas/canonical').then((m) => m.unsubscribeOrphanedSessions());
  },

  deleteEdges: (edgeIds: string[]) => {
    if (condenseGuard()) return;
    get().logEvent('disconnect', edgeIds[0], { n: edgeIds.length });
    const remove = new Set(edgeIds);
    if (!get().edges.some((e) => remove.has(e.id))) return;
    get().pushHistory();
    set((state) => ({ edges: state.edges.filter((e) => !remove.has(e.id)) }));
    get().pushHistory();
  },

  editResponse: (nodeId: string, response: string) => {
    if (condenseGuard()) return;
    get().logEvent('edit-response', nodeId, { chars: response.length });
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
                summaryTypes: n.data.summaryTypes?.map((s, i) => (i === n.data.responseIndex ? undefined : s)),
                // timeline: the human revised this version (generation stamp stays)
                editedAts: n.data.responses.map((_, i) => (i === n.data.responseIndex ? new Date().toISOString() : n.data.editedAts?.[i])),
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
    if (editing && condenseGuard()) return;
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, isEditing: editing } } : n
      ),
    }));
  },

  setEditingResponse: (nodeId: string, editing: boolean) => {
    if (editing && condenseGuard()) return;
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
    // MATERIAL sources wire SOLID by default. A dashed reference carries a
    // node's Q/A transcript — a material has none, so a dashed wire from a
    // material is a nearly-empty gesture that LOOKS like "file connected"
    // (the exact misreading a real canvas produced). Solid is the only
    // honest default; the toast offers the way back down.
    const srcNode = nodes.find((x) => x.id === sourceId);
    if (srcNode && ['note', 'file', 'link'].includes(srcNode.data.stepKind ?? '')) {
      get().pushHistory();
      const matEdge: ThoughtEdge = {
        id: `edge-${sourceId}-${targetId}`,
        source: sourceId, sourceHandle: 'continue',
        target: targetId, targetHandle: 'top',
        type: 'smoothstep',
        style: { stroke: COLORS.accent, strokeDasharray: '8 4', strokeWidth: 2 },
        animated: true,
        data: { isCrossLink: true, createdAt: new Date().toISOString() },
      };
      set((state) => ({ edges: [...state.edges, matEdge] }));
      get().logEvent('connect', matEdge.id);
      // structural conversion reuses the cycle guard, styling, layout and
      // staleness reaction in one place; on refusal the edge stays dashed.
      get().setEdgeStructural(matEdge.id, true);
      const converted = get().edges.find((e) => e.id === matEdge.id);
      if (converted && !converted.data?.isCrossLink) {
        const ctx = buildContext(sourceId, get().nodes, get().edges);
        const tok = ctx.messages.reduce((s2, m) => s2 + countTokens(m.content), 0);
        toast('success', fmt(t('edge.materialWiredFull'), { n: tok.toLocaleString() }), 8000, {
          label: t('edge.materialMakeQuote'),
          run: () => get().setEdgeStructural(matEdge.id, false),
        });
      }
      return;
    }
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
      // createdAt only here: manual connect is the one edge born
      // independently of a node (elsewhere edge time = target's createdAt)
      data: { isCrossLink: true, createdAt: new Date().toISOString() },
    };
    set((state) => ({ edges: [...state.edges, newEdge] }));
    get().logEvent('connect', newEdge.id);
    get().pushHistory();
    // Price tag at the moment of connection — BOTH prices, so it's a
    // decision, not a nudge. When the source has no upstream chain the two
    // depths are the same thing; asking would be noise, so we don't.
    if (src && !['note', 'file', 'link'].includes(src.data.stepKind ?? '')) {
      const { ordered } = walkUpAncestors(sourceId, nodes, edges.filter((e) => !e.data?.isCrossLink));
      const chain = ordered.filter((n) => n.id !== sourceId && !['note', 'file', 'link'].includes(n.data.stepKind ?? ''));
      if (chain.length > 0) {
        const quoteTok = countTokens(referenceBlockContent({ source: src, edge: newEdge, depth: 'quote', chain }));
        // Full tier = SOLID wiring: the target reads the source's whole
        // upstream, files included — price the real thing, not a transcript.
        const ctx = buildContext(sourceId, nodes, edges);
        const fullTok = ctx.messages.reduce((sum, m) => sum + countTokens(m.content), 0)
          + countTokens(src.data.question + src.data.response);
        toast('info', fmt(t('edge.linkedQuote'), { n: quoteTok }), 8000, {
          label: fmt(t('edge.makeFull'), { m: fullTok }),
          run: () => get().setEdgeStructural(newEdge.id, true),
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

  setEdgeStructural: (edgeId: string, structural: boolean) => {
    const { nodes, edges } = get();
    const edge = edges.find((e) => e.id === edgeId);
    if (!edge) return;
    if (structural) {
      // Dashed → solid: the target will read the source's whole upstream.
      // Guard the DAG: if the source already sits downstream of the target
      // along structural edges, going solid would close a cycle.
      const structuralEdges = edges.filter((e) => !e.data?.isCrossLink);
      const { ordered } = walkUpAncestors(edge.source, nodes, structuralEdges);
      if (ordered.some((n) => n.id === edge.target)) {
        toast('error', t('edge.cycleBlocked'));
        return;
      }
    }
    get().pushHistory();
    get().logEvent(structural ? 'connect' : 'disconnect', edgeId, { convert: true });
    set((state) => ({
      edges: state.edges.map((e) => {
        if (e.id !== edgeId) return e;
        if (structural) {
          const rest = { ...(e.data ?? {}) };
          delete rest.isCrossLink; delete rest.contextDepth; delete rest.isWatch;
          return {
            ...e,
            sourceHandle: 'continue', targetHandle: 'top',
            animated: false,
            style: { stroke: COLORS.accent, strokeWidth: 2 },
            markerEnd: { type: 'arrowclosed' as const, color: COLORS.accent, width: 18, height: 18 },
            data: rest,
          };
        }
        return {
          ...e,
          animated: true,
          style: { stroke: COLORS.accent, strokeDasharray: '8 4', strokeWidth: 2 },
          markerEnd: { type: 'arrowclosed' as const, color: COLORS.accent, width: 18, height: 18 },
          data: { ...(e.data ?? {}), isCrossLink: true, contextDepth: undefined },
        };
      }),
    }));
    // Solid lines obey the arrow grammar — re-run the column tree
    set((state) => ({ nodes: autoLayout(state.nodes, state.edges) }));
    get().pushHistory();
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
          // navigating away from a failed placeholder reclaims the older answer;
          // the question mirrors its version's wording (a version is a PAIR)
          data: { ...n.data, responseIndex: newIndex, response: responses[newIndex], question: n.data.questions?.[newIndex] ?? n.data.question, generationFailed: undefined, highlights: pruneHighlights(n.data.highlights, responses[newIndex]) },
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
            questions: n.data.questions?.filter((_, i) => i !== versionIndex),
            question: n.data.questions?.filter((_, i) => i !== versionIndex)[newIndex] ?? n.data.question,
            summaries: n.data.summaries?.filter((_, i) => i !== versionIndex),
            generatedBy: n.data.generatedBy?.filter((_, i) => i !== versionIndex),
            summaryTypes: n.data.summaryTypes?.filter((_, i) => i !== versionIndex),
            reasonings: n.data.reasonings?.filter((_, i) => i !== versionIndex),
            generatedAts: n.data.generatedAts?.filter((_, i) => i !== versionIndex),
            editedAts: n.data.editedAts?.filter((_, i) => i !== versionIndex),
            highlights: pruneHighlights(n.data.highlights, newResponses[newIndex]),
          },
        };
      }),
    }));
    get().pushHistory();
  },

  relayout: () => {
    if (condenseGuard()) return;
    get().pushHistory();
    set((state) => {
      // one-click relayout also heals legacy mirror wiring (notes once
      // sat INSIDE the chain) — otherwise no relayout could ever fix
      // those canvases and the button would look broken
      const edges = healLegacyNoteEdges(state.nodes, state.edges);
      return { nodes: autoLayout(state.nodes, edges), edges };
    });
    get().pushHistory();
  },

  setArchived: (nodeIds: string[], archived: boolean) => {
    const ids = new Set(nodeIds);
    get().pushHistory();
    get().logEvent(archived ? 'archive' : 'unarchive', nodeIds[0], { n: nodeIds.length });
    set((state) => ({
      nodes: state.nodes.map((n) =>
        ids.has(n.id)
          ? { ...n, data: { ...n.data, archived: archived || undefined, archivedAt: archived ? new Date().toISOString() : undefined } }
          : n
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
    if (condenseGuard()) return;
    get().logEvent('delete', nodeIds[0], { n: nodeIds.length });
    get().pushHistory();
    const removeSet = new Set(nodeIds);
    set((state) => ({
      nodes: state.nodes.filter((n) => !removeSet.has(n.id)),
      edges: state.edges.filter((e) => !removeSet.has(e.source) && !removeSet.has(e.target)),
      selectedNodeId: null,
      selectedNodeIds: [],
    }));
    get().pushHistory();
    // deletion IS unsubscription — see canonical.unsubscribeOrphanedSessions
    void import('../../lib/atlas/canonical').then((m) => m.unsubscribeOrphanedSessions());
  },

  duplicateSelection: (nodeIds: string[]) => {
    const { nodes, edges } = get();
    const selected = new Set(nodeIds);
    const originals = nodes.filter((n) => selected.has(n.id));
    if (originals.length === 0) return;
    get().pushHistory();

    const boxOf = (n: ThoughtNode) => ({
      x: n.position.x,
      y: n.position.y,
      w: n.measured?.width ?? n.width ?? 520,
      h: n.measured?.height ?? n.height ?? nodeHeight(n),
    });

    // Selection bounding box → candidate landing spots (right, below,
    // diagonal, then farther out) — first collision-free offset wins.
    const boxes = originals.map(boxOf);
    const bbox = {
      x: Math.min(...boxes.map((b) => b.x)),
      y: Math.min(...boxes.map((b) => b.y)),
      right: Math.max(...boxes.map((b) => b.x + b.w)),
      bottom: Math.max(...boxes.map((b) => b.y + b.h)),
    };
    const GAP = 80;
    const stepX = bbox.right - bbox.x + GAP;
    const stepY = bbox.bottom - bbox.y + GAP;
    const candidates: { dx: number; dy: number }[] = [];
    for (let k = 1; k <= 6; k++) {
      candidates.push({ dx: k * stepX, dy: 0 }, { dx: 0, dy: k * stepY }, { dx: k * stepX, dy: k * stepY });
    }
    // Frames are background regions, not obstacles — copies may land inside one.
    const obstacles = nodes.filter((n) => n.data.stepKind !== 'frame').map(boxOf);
    const overlaps = (a: ReturnType<typeof boxOf>, b: ReturnType<typeof boxOf>) =>
      a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    const offset = candidates.find((c) =>
      !boxes.some((b) => obstacles.some((o) => overlaps({ ...b, x: b.x + c.dx, y: b.y + c.dy }, o)))
    ) ?? { dx: stepX, dy: stepY };

    // Attachments are shared by REFERENCE (content is never copied) but get
    // NEW ids: exclude/include and digest links work by id, so shared ids
    // would entangle the copy with its source.
    const idMap = new Map<string, string>();
    const attIdMap = new Map<string, string>();
    for (const n of originals) {
      idMap.set(n.id, generateId());
      for (const a of n.data.attachments ?? []) attIdMap.set(a.id, generateId());
    }
    const remapAttIds = (ids?: string[]) => (ids ?? []).map((x) => attIdMap.get(x) ?? x);

    const copies: ThoughtNode[] = originals.map((n) => ({
      ...n,
      id: idMap.get(n.id)!,
      position: { x: n.position.x + offset.dx, y: n.position.y + offset.dy },
      selected: true,
      data: {
        ...n.data,
        attachments: (n.data.attachments ?? []).map((a) => ({ ...a, id: attIdMap.get(a.id)! })),
        excludedAttachmentIds: remapAttIds(n.data.excludedAttachmentIds),
        includedAttachmentIds: remapAttIds(n.data.includedAttachmentIds),
        digestOf: n.data.digestOf ? (attIdMap.get(n.data.digestOf) ?? n.data.digestOf) : undefined,
        highlights: (n.data.highlights ?? []).map((h) => ({ ...h, id: generateId() })),
        isEditing: false,
        isEditingResponse: false,
        isLoading: false,
      },
    }));

    // Edges INSIDE the selection are copied; edges crossing the boundary are
    // cut — the copy has no wires to the original graph, so its stale check
    // (lastContextHash vs. the now-empty upstream) flags it naturally.
    const innerEdges: ThoughtEdge[] = edges
      .filter((e) => selected.has(e.source) && selected.has(e.target))
      .map((e) => ({
        ...e,
        id: `edge-${idMap.get(e.source)!}-${idMap.get(e.target)!}`,
        source: idMap.get(e.source)!,
        target: idMap.get(e.target)!,
        data: e.data ? { ...e.data } : e.data,
      }));

    const newIds = copies.map((c) => c.id);
    set((state) => ({
      nodes: [...state.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)), ...copies],
      edges: [...state.edges, ...innerEdges],
      selectedNodeId: newIds.length === 1 ? newIds[0] : null,
      selectedNodeIds: newIds,
    }));
    get().pushHistory();
  },
});
