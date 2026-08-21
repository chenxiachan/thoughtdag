// Equivalence test v2. Node-ID level, no text back-inference: the PROBE
// method compiles a structurally identical twin graph whose node texts are
// unique markers ([[NODE:id]]); buildContext's traversal depends on
// structure, not text, so the probe sequence IS the product's node order.
// Covers static conditions, recompute-wired graphs, and synthetic
// structural unit cases (diamond, multi-root, disconnected, tie, duplicate
// text, cycle rejection).
import { loadCase, applyOps, wireRecompute, probeSequence, CASES } from './lib.mjs';
import { referenceSequence } from './reference-compiler.mjs';

let pass = 0, fail = 0;
const check = (label, g) => {
  const ref = referenceSequence(g);
  const prod = probeSequence(g);
  const ok = JSON.stringify(ref) === JSON.stringify(prod);
  if (ok) pass++; else { fail++; console.log(`MISMATCH ${label}\n  ref : ${ref.join(' → ')}\n  prod: ${prod.join(' → ')}`); }
};

// 1. every condition of every suite case, including recompute wiring
for (const [track, name] of CASES) {
  const { c } = loadCase(track, name);
  for (const [cond, spec] of Object.entries(c.conditions)) {
    let g = applyOps(c.graph, spec.graph_ops);
    if (spec.recompute_nodes?.length) g = wireRecompute(g, spec.recompute_nodes, c.graph.nodes);
    check(`${c.id} ${cond}`, g);
  }
}

// 2. synthetic structural unit cases
const N = (id) => ({ id, role: 'evidence', content: { question: `q-${id}`, answer: `a-${id}` } });
const FINAL = { id: 'final', role: 'final-question', content: { question: 'q-final', answer: '' } };
const unit = (label, nodes, edges) => check(`unit:${label}`, { nodes, edges });
unit('diamond', [N('a'), N('b'), N('c'), FINAL],
     [{ from: 'a', to: 'b' }, { from: 'a', to: 'c' }, { from: 'b', to: 'final' }, { from: 'c', to: 'final' }]);
unit('multi-root', [N('a'), N('b'), FINAL], [{ from: 'a', to: 'final' }, { from: 'b', to: 'final' }]);
unit('disconnected', [N('a'), N('x'), FINAL], [{ from: 'a', to: 'final' }]);
unit('tie-order', [N('p'), N('q'), N('r'), FINAL],
     [{ from: 'q', to: 'final' }, { from: 'p', to: 'final' }, { from: 'r', to: 'final' }]);
// duplicate text: probe method is immune by construction; verify anyway
const dupA = { id: 'dup-a', role: 'evidence', content: { question: 'same text', answer: 'same answer' } };
const dupB = { id: 'dup-b', role: 'evidence', content: { question: 'same text', answer: 'same answer' } };
unit('duplicate-text', [dupA, dupB, FINAL], [{ from: 'dup-a', to: 'final' }, { from: 'dup-b', to: 'final' }]);
// cycle: the reference compiler must refuse
try {
  referenceSequence({ nodes: [N('a'), N('b'), FINAL],
    edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }, { from: 'b', to: 'final' }] });
  fail++; console.log('MISMATCH unit:cycle — reference accepted a cyclic graph');
} catch { pass++; }

console.log(`\nequivalence v2: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
