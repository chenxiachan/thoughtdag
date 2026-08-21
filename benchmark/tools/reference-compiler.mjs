// Independent reference compiler: defines the CANONICAL context semantics
// without touching any product code. Given a case graph + ops, it answers:
// which nodes enter context, in what order. The product's buildContext must
// agree at this level (equivalence.mjs); text rendering stays product-side.
//
// Canonical rules (pre-registered):
// 1. A node enters context iff it can reach `final` by directed edges.
// 2. Order = Kahn topological order; ties broken by the index of a node's
//    FIRST OUTGOING edge in the edge array (the product orders siblings by
//    incoming-edge declaration order — discovered by the tie-order unit
//    case, 2026-08-16; node-array order was wrong), then node array order.
// 3. The final node comes last, its question only.
export function referenceSequence(graph, finalId = 'final') {
  // reachability to final
  const parentsOf = new Map();
  for (const e of graph.edges) {
    if (!parentsOf.has(e.to)) parentsOf.set(e.to, []);
    parentsOf.get(e.to).push(e.from);
  }
  const reach = new Set();
  (function walk(id) {
    if (reach.has(id)) return;
    reach.add(id);
    for (const p of parentsOf.get(id) ?? []) walk(p);
  })(finalId);

  const nodes = graph.nodes.filter((n) => reach.has(n.id));
  const ids = new Set(nodes.map((n) => n.id));
  const edges = graph.edges.filter((e) => ids.has(e.from) && ids.has(e.to));

  // Kahn with stable tie-breaking: candidates kept in (edge order, node order)
  const indeg = new Map([...ids].map((id) => [id, 0]));
  for (const e of edges) indeg.set(e.to, indeg.get(e.to) + 1);
  const nodeRank = new Map(graph.nodes.map((n, i) => [n.id, i]));
  const edgeRank = new Map();
  graph.edges.forEach((e, i) => { if (!edgeRank.has(e.from)) edgeRank.set(e.from, i); });
  const rank = (id) => [edgeRank.get(id) ?? -1, nodeRank.get(id)];
  let queue = [...ids].filter((id) => indeg.get(id) === 0);
  const order = [];
  while (queue.length) {
    queue.sort((a, b) => { const ra = rank(a), rb = rank(b); return ra[0] - rb[0] || ra[1] - rb[1]; });
    const id = queue.shift();
    order.push(id);
    for (const e of edges.filter((x) => x.from === id)) {
      indeg.set(e.to, indeg.get(e.to) - 1);
      if (indeg.get(e.to) === 0) queue.push(e.to);
    }
  }
  // final last (topology guarantees it; assert anyway)
  if (order[order.length - 1] !== finalId) throw new Error('canonical order did not end at final');
  return order;
}
