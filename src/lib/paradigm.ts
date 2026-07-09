import type { ThoughtNode, ThoughtEdge, ThoughtData } from '../types';
import { generateId } from '../utils';
import { autoLayout } from './layout';
import { COLORS } from './constants';

// Paradigm = the score; a chat canvas = the performance. This module turns
// an orchestration graph (steps, instructions, roles, flow kinds) into a
// runnable chat graph. Nothing executes here — instantiation only lays the
// structure out; every generation is initiated by the human on the canvas.

export interface ParadigmFile {
  kind: 'thoughtdag-paradigm';
  version: 1;
  name: string;
  description?: string;
  nodes: ThoughtNode[];
  edges: ThoughtEdge[];
}

export function serializeParadigm(name: string, nodes: ThoughtNode[], edges: ThoughtEdge[]): ParadigmFile {
  return { kind: 'thoughtdag-paradigm', version: 1, name, nodes, edges };
}

/**
 * Run lock: while any instantiated paradigm node is still incomplete the
 * canvas is a run in progress — follow-up inputs, node deletion and the
 * floating root input hide until the run finishes, then the graph unlocks
 * into an ordinary conversation canvas.
 */
export function isRunLocked(nodes: ThoughtNode[]): boolean {
  return nodes.some((n) =>
    (n.data.stepKind === 'human' && !n.data.question) ||
    (n.data.stepKind === 'prompt' && (n.data.isLoading || (!n.data.response && !n.data.generationFailed)))
  );
}

export function isParadigmFile(parsed: unknown): parsed is ParadigmFile {
  const p = parsed as Record<string, unknown> | null;
  return !!p && typeof p === 'object' && p.kind === 'thoughtdag-paradigm' && Array.isArray(p.nodes) && Array.isArray(p.edges);
}

// NOTE: ThoughtData extends Record<string, unknown>, whose index signature
// makes Omit<> collapse to a bare index type — so return the full shape.
const baseData = (): ThoughtData => ({
  question: '',
  response: '',
  responses: [],
  responseIndex: -1,
  isCollapsed: false,
  isEditing: false,
  isEditingResponse: false,
  isLoading: false,
  tokenCount: 0,
  highlights: [],
  highlightMode: 'tag',
  attachments: [],
  excludedAttachmentIds: [],
  includedAttachmentIds: [],
  roleMode: 'inherit',
  isRoot: false,
  isBranch: false,
});

/**
 * Score → performance: convert a paradigm graph into a chat graph that RUNS
 * itself forward (see triggerParadigmCascade in store/streaming.ts).
 * - human           → EMPTY question slot tagged stepKind 'human'; the
 *                     operator guidance (instruction) becomes its placeholder.
 *                     The human types here and submits WITHOUT generating —
 *                     answers belong to downstream prompt nodes.
 * - prompt          → node tagged stepKind 'prompt' (question = the prompt);
 *                     auto-runs once all its structural parents complete.
 *                     Legacy files may still carry a rolePrompt — honored.
 * Legacy v1 kinds keep their behavior so old .paradigm.json files still work:
 * - step/synthesis  → ordinary node awaiting a manual first run
 * - review          → reviewer preset (persona + autoRerun); incoming edges
 *                     become red followsTip edges, like attachEvaluator's
 * - fanout          → placeholder node keeping stepKind + fanoutRoles; the
 *                     canvas renders an "expand N perspectives" button and
 *                     the HUMAN decides when to fan out
 */
export function instantiateParadigm(pNodes: ThoughtNode[], pEdges: ThoughtEdge[]): { nodes: ThoughtNode[]; edges: ThoughtEdge[] } {
  const idMap = new Map<string, string>();
  const nodes: ThoughtNode[] = pNodes.map((pn) => {
    const id = generateId();
    idMap.set(pn.id, id);
    const kind = pn.data.stepKind ?? 'prompt';
    const question = (pn.data.instruction?.trim() || pn.data.question || '').trim();

    const data: ThoughtData = {
      ...baseData(),
      question,
      rolePrompt: pn.data.rolePrompt || undefined,
      roleMode: pn.data.rolePrompt ? 'reset' : 'inherit',
    };
    if (kind === 'human') {
      data.stepKind = 'human';
      data.question = '';
      data.instruction = pn.data.instruction?.trim() || undefined; // shown as the input placeholder
      data.rolePrompt = undefined;
      data.roleMode = 'inherit';
    }
    if (kind === 'prompt') {
      data.stepKind = 'prompt';
      // Per-step search permissions travel with the paradigm; unset means
      // "follow the runner's defaults" (also how legacy files behave)
      data.webSearch = pn.data.webSearch;
      data.scholarSearch = pn.data.scholarSearch;
    }
    if (kind === 'review') {
      data.isEvaluator = true; // red visual identity
      data.autoRerun = true;
      if (!data.rolePrompt) data.roleMode = 'inherit';
    }
    if (kind === 'fanout') {
      data.stepKind = 'fanout';
      data.fanoutRoles = pn.data.fanoutRoles;
    }
    return { id, type: 'thought', position: { ...pn.position }, dragHandle: '.drag-handle', data };
  });

  const reviewTargets = new Set(
    pNodes.filter((n) => (n.data.stepKind ?? 'step') === 'review').map((n) => idMap.get(n.id)!)
  );

  const edges: ThoughtEdge[] = pEdges
    .filter((e) => idMap.has(e.source) && idMap.has(e.target))
    .map((e) => {
      const source = idMap.get(e.source)!;
      const target = idMap.get(e.target)!;
      if (reviewTargets.has(target)) {
        // reviewer wiring: red sliding edge, same as the attach preset
        return {
          id: `watch-${source}-${target}`,
          source,
          target,
          sourceHandle: 'branch',
          targetHandle: 'left',
          type: 'smoothstep',
          style: { stroke: COLORS.watch, strokeWidth: 2, strokeDasharray: '4 4' },
          animated: true,
          markerEnd: { type: 'arrowclosed' as const, color: COLORS.watch, width: 18, height: 18 },
          data: { isCrossLink: true, isWatch: true, followsTip: true },
        };
      }
      return {
        id: `edge-${source}-${target}`,
        source,
        target,
        sourceHandle: 'continue',
        targetHandle: 'top',
        type: 'smoothstep',
        style: { stroke: COLORS.accent, strokeWidth: 2 },
        animated: false,
        markerEnd: { type: 'arrowclosed' as const, color: COLORS.accent, width: 18, height: 18 },
        data: {},
      };
    });

  // roots keep isRoot semantics for layout
  const hasIncoming = new Set(edges.map((e) => e.target));
  for (const n of nodes) {
    if (!hasIncoming.has(n.id)) n.data.isRoot = true;
  }

  return { nodes: autoLayout(nodes, edges), edges };
}
