// Shared benchmark library: case loading, graph ops, product-graph mapping,
// compilation through the PRODUCT's buildContext. Protocol v2: conditions are
// graph transformations; message lists are derived, never hand-picked.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// browser shims for the product bundle
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.location ??= { search: '', hostname: 'localhost', origin: '', pathname: '/' };
globalThis.window ??= { location: globalThis.location, addEventListener: () => {}, open: () => {} };
globalThis.document ??= { addEventListener: () => {} };

const { buildContext, hashContext, countTokens } = await import('./ctx-builder.bundle.mjs');
export { buildContext, hashContext, countTokens };

export const COMPILER_VERSION = '2.0.0';
export const SCORER_VERSION = '2.0.0';
export const B = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

export function loadCase(track, name) {
  const c = JSON.parse(readFileSync(`${B}/cases/${track}/${name}.case.json`, 'utf8'));
  const gold = JSON.parse(readFileSync(`${B}/gold/${track}/${name}.gold.json`, 'utf8'));
  return { c, gold };
}

/** Apply graph_ops to a {nodes, edges} case graph. Pure; returns new graph. */
export function applyOps(graph, ops) {
  let nodes = [...graph.nodes];
  let edges = graph.edges.map((e) => ({ ...e }));
  for (const op of ops) {
    if (op.op === 'add_edge') edges.push({ from: op.from, to: op.to });
    else if (op.op === 'remove_edge') edges = edges.filter((e) => !(e.from === op.from && e.to === op.to));
    else if (op.op === 'remove_node') {
      nodes = nodes.filter((n) => n.id !== op.id);
      edges = edges.filter((e) => e.from !== op.id && e.to !== op.id);
    } else throw new Error(`unknown op ${op.op}`);
  }
  return { nodes, edges };
}

/** Map a case graph to product-shaped ThoughtNode/ThoughtEdge arrays. */
export function toProductGraph(graph, positions = {}) {
  const incoming = new Set(graph.edges.map((e) => e.to));
  const nodes = graph.nodes.map((n, i) => ({
    id: n.id,
    type: 'thought',
    position: positions[n.id] ?? { x: 0, y: i * 320 },
    data: {
      question: n.content.question,
      response: n.content.answer ?? '',
      responses: [n.content.answer ?? ''],
      responseIndex: 0,
      isCollapsed: false, isEditing: false, isEditingResponse: false, isLoading: false,
      tokenCount: 0,
      highlights: [], highlightMode: 'off',
      attachments: [], excludedAttachmentIds: [], includedAttachmentIds: [],
      roleMode: 'inherit',
      isRoot: !incoming.has(n.id),
      isBranch: false,
    },
  }));
  const edges = graph.edges.map((e, i) => ({
    id: `e-${e.from}-${e.to}-${i}`,
    source: e.from,
    target: e.to,
    type: 'smoothstep',
  }));
  return { nodes, edges };
}

/** Product-truth node sequence via the probe method: compile a structurally
    identical twin whose texts are unique markers. Traversal depends on
    structure, not text, so this IS the real message order (the old
    reachability audit listed nodes in array order, which lies when edge
    order differs — caught before pilot generation). */
export function probeSequence(graph, finalId = 'final') {
  const probe = {
    nodes: graph.nodes.map((n) => ({ ...n, content: { question: `[[NODE:${n.id}]]`, answer: n.content.answer ? `[[ANS:${n.id}]]` : '' } })),
    edges: graph.edges,
  };
  const { nodes, edges } = toProductGraph(probe, {});
  const { messages } = buildContext(finalId, nodes, edges);
  const seq = [];
  for (const m of messages) {
    for (const match of m.content.matchAll(/\[\[NODE:([a-z0-9-]+)\]\]/g)) {
      if (!seq.includes(match[1])) seq.push(match[1]);
    }
  }
  return seq;
}

/** Compile one condition state to messages via the product engine. */
export function compileGraph(graph, finalId, positions) {
  const { nodes, edges } = toProductGraph(graph, positions);
  const { messages } = buildContext(finalId, nodes, edges);
  const inputTokens = countTokens(messages.map((m) => m.content).join('\n'));
  return {
    messages,
    prompt_hash: hashContext(messages),
    input_token_est: inputTokens,
    node_order_audit: probeSequence(graph, finalId),
    product_nodes: nodes,
    product_edges: edges,
  };
}

/** Audit output: nodes reachable from final by walking incoming edges —
    the graph-truth of what can enter context (string matching gave false
    positives when two nodes shared question text). */
function nodesInContextOrder(messages, graph, finalId = 'final') {
  const parents = new Map();
  for (const e of graph.edges) {
    if (!parents.has(e.to)) parents.set(e.to, []);
    parents.get(e.to).push(e.from);
  }
  const seen = new Set();
  const walk = (id) => {
    if (seen.has(id)) return;
    seen.add(id);
    for (const p of parents.get(id) ?? []) walk(p);
  };
  walk(finalId);
  return graph.nodes.filter((n) => seen.has(n.id)).map((n) => n.id);
}

/** Wire recompute nodes between the final node's current parent chain and final. */
export function wireRecompute(graph, recomputeIds, allNodes, finalId = 'final') {
  let g = { nodes: [...graph.nodes], edges: graph.edges.map((e) => ({ ...e })) };
  const byId = Object.fromEntries(allNodes.map((n) => [n.id, n]));
  let prev = g.edges.find((e) => e.to === finalId)?.from;
  if (!prev) throw new Error('final has no parent to splice from');
  for (const rid of recomputeIds) {
    const spec = byId[rid];
    g.nodes.push({ id: rid, role: 'recompute', content: { question: spec.content.question, answer: '' } });
    g.edges = g.edges.filter((e) => !(e.from === prev && e.to === finalId));
    g.edges.push({ from: prev, to: rid }, { from: rid, to: finalId });
    prev = rid;
  }
  return g;
}

export function sha256(s) { return createHash('sha256').update(s).digest('hex'); }

export function canvasFile(name, productNodes, productEdges) {
  return {
    version: 1,
    name,
    exportedAt: '2026-08-16T00:00:00.000Z',
    nodes: productNodes,
    edges: productEdges,
    events: [],
  };
}

export const LAYOUTS = {
  'bm-ref-0001': {
    root: { x: 700, y: 0 },
    'branch-a': { x: 0, y: 380 }, 'branch-b': { x: 460, y: 380 }, 'branch-c': { x: 920, y: 380 },
    'branch-c-conflict': { x: 1380, y: 380 }, filler: { x: 1840, y: 380 },
    final: { x: 700, y: 860 },
  },
  'cd-ref-0001': {
    setup: { x: 0, y: 0 }, v1: { x: 0, y: 320 }, 'detour-1': { x: 0, y: 640 },
    'detour-2': { x: 0, y: 960 }, v2: { x: 0, y: 1280 },
    condensed: { x: 700, y: 640 }, 'condensed-lossy': { x: 700, y: 1000 },
    final: { x: 0, y: 1600 },
  },
  'rp-ref-0001-k1': {
    given: { x: 0, y: 0 }, pollution: { x: 0, y: 320 }, 'step-b': { x: 0, y: 640 },
    'step-b-clean': { x: 700, y: 640 }, final: { x: 0, y: 960 },
  },
  'rp-ref-0001-k3': {
    given: { x: 0, y: 0 }, pollution: { x: 0, y: 320 }, 'step-b': { x: 0, y: 640 },
    'step-c': { x: 0, y: 960 }, 'step-d': { x: 0, y: 1280 },
    'step-b-clean': { x: 700, y: 640 }, 'step-c-clean': { x: 700, y: 960 }, 'step-d-clean': { x: 700, y: 1280 },
    final: { x: 0, y: 1600 },
  },
  'rp-ref-0001': {
    given: { x: 0, y: 0 }, pollution: { x: 0, y: 320 }, 'step-b': { x: 0, y: 640 },
    'step-c': { x: 0, y: 960 }, 'step-b-clean': { x: 700, y: 640 }, 'step-c-clean': { x: 700, y: 960 },
    final: { x: 0, y: 1280 },
  },
};

/** Load case list from a suite file: entries "track/name" (non-case notes skipped). */
export function loadSuite(suiteId = 'smoke-v1') {
  const s = JSON.parse(readFileSync(`${B}/suites/${suiteId}.json`, 'utf8'));
  return s.cases.filter((c) => c.includes('/') && !c.startsWith('TODO')).map((c) => {
    const [track, name] = c.replace(/^reference: /, '').split('/');
    return [track, name];
  });
}
export const CASES = loadSuite(process.env.BENCH_SUITE ?? 'smoke-v1');
