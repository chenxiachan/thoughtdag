// Cross-file SEMANTIC validator — the true first pipeline step:
//   generate → validate semantics → compile → equivalence → run
// JSON Schema proves field shapes; this proves experimental semantics.
// Any failure must block compilation (compile.mjs calls this first).
import { readFileSync, existsSync } from 'node:fs';
import { loadCase, applyOps, loadSuite, B } from './lib.mjs';

const errors = [];
const err = (m) => errors.push(m);

function reachableFromFinal(graph) {
  const parents = new Map();
  for (const e of graph.edges) {
    if (!parents.has(e.to)) parents.set(e.to, []);
    parents.get(e.to).push(e.from);
  }
  const seen = new Set();
  (function walk(id) { if (seen.has(id)) return; seen.add(id); for (const p of parents.get(id) ?? []) walk(p); })('final');
  return seen;
}

/** Contaminated-replay chain (in edge order) reachable in the polluted condition. */
function contaminationChain(c) {
  const g = applyOps(c.graph, c.conditions.polluted?.graph_ops ?? []);
  const reach = reachableFromFinal(g);
  const contaminated = c.graph.nodes.filter((n) => n.role === 'contaminated-replay' && reach.has(n.id) && !n.id.endsWith('-clean'));
  // order along the chain: follow edges from the pollution node
  const next = new Map(g.edges.map((e) => [e.from, e.to]));
  const chain = [];
  let cur = 'pollution';
  while (next.has(cur) && chain.length < 50) {
    cur = next.get(cur);
    if (contaminated.some((n) => n.id === cur)) chain.push(cur);
  }
  return chain;
}

const suiteIds = ['smoke-v1', 'core-v1', 'scenario-v1', 'pilot-v1'];
const allCases = new Map();

// ── per-case checks + suite reference integrity ──
for (const sid of suiteIds) {
  for (const [track, name] of loadSuite(sid)) {
    const casePath = `${B}/cases/${track}/${name}.case.json`;
    const goldPath = `${B}/gold/${track}/${name}.gold.json`;
    if (!existsSync(casePath)) { err(`${sid}: missing case file ${track}/${name}`); continue; }
    if (!existsSync(goldPath)) { err(`${sid}: missing gold file ${track}/${name}`); continue; }
    const { c, gold } = loadCase(track, name);
    if (allCases.has(c.id)) continue;
    allCases.set(c.id, { c, gold, track });
    if (gold.case_id !== c.id) err(`${c.id}: gold.case_id mismatch (${gold.case_id})`);
    if (!Object.keys(c.conditions).length) err(`${c.id}: no conditions`);

    if (track === 'repair') {
      const REQUIRED = ['clean', 'polluted', 'source_prune', 'subgraph_prune', 'recompute_descendants'];
      for (const r of REQUIRED) if (!c.conditions[r]) err(`${c.id}: missing required condition ${r}`);
      const chain = contaminationChain(c);
      const depth = c.construction.propagation_depth;
      if (depth !== chain.length) err(`${c.id}: propagation_depth=${depth} but ${chain.length} contaminated descendants reachable (${chain.join('→')})`);
      const rec = c.conditions.recompute_descendants?.recompute_nodes ?? [];
      if (rec.length !== chain.length) err(`${c.id}: recompute_nodes has ${rec.length} entries, contamination chain has ${chain.length}`);
      if ('depth_variant' in c.construction) err(`${c.id}: legacy field depth_variant present; propagation_depth is the single authority`);
    }
  }
}

// ── family checks: same given, same final, same gold, nested chains, mutual pairing ──
const families = new Map();
for (const { c, gold, track } of allCases.values()) {
  if (track !== 'repair' || !c.construction.family_id) continue;
  if (!families.has(c.construction.family_id)) families.set(c.construction.family_id, []);
  families.get(c.construction.family_id).push({ c, gold });
}
for (const [fid, members] of families) {
  const node = (c, id) => c.graph.nodes.find((n) => n.id === id)?.content;
  const ref = members[0];
  for (const m of members.slice(1)) {
    if (JSON.stringify(node(m.c, 'given')) !== JSON.stringify(node(ref.c, 'given')))
      err(`family ${fid}: given differs between ${m.c.id} and ${ref.c.id}`);
    if (node(m.c, 'final')?.question !== node(ref.c, 'final')?.question)
      err(`family ${fid}: final question differs between ${m.c.id} and ${ref.c.id}`);
    if (m.gold.gold_answer !== ref.gold.gold_answer ||
        JSON.stringify(m.gold.accept_also ?? []) !== JSON.stringify(ref.gold.accept_also ?? []))
      err(`family ${fid}: gold differs between ${m.c.id} and ${ref.c.id}`);
  }
  // nested-prefix chains across depths
  const byDepth = [...members].sort((a, b) => a.c.construction.propagation_depth - b.c.construction.propagation_depth);
  const chains = byDepth.map(({ c }) => contaminationChain(c));
  for (let i = 1; i < chains.length; i++) {
    const prev = chains[i - 1], cur = chains[i];
    if (JSON.stringify(cur.slice(0, prev.length)) !== JSON.stringify(prev))
      err(`family ${fid}: chain of ${byDepth[i].c.id} (${cur.join('→')}) is not a nested extension of ${byDepth[i - 1].c.id} (${prev.join('→')})`);
  }
  // mutual, complete pairing
  const ids = new Set(members.map((m) => m.c.id));
  for (const { c } of members) {
    const declared = new Set(c.construction.paired_with ?? []);
    for (const other of ids) if (other !== c.id && !declared.has(other)) err(`${c.id}: paired_with missing ${other}`);
    for (const d of declared) if (!ids.has(d)) err(`${c.id}: paired_with references ${d}, not in family ${fid}`);
  }
}

if (errors.length) {
  console.error(`SEMANTIC VALIDATION FAILED (${errors.length}):`);
  for (const e of errors) console.error('  ✗ ' + e);
  process.exit(1);
}
console.log(`semantic validation: ${allCases.size} cases, ${families.size} families, all checks pass`);
