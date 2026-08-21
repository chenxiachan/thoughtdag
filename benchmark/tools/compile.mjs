// Compile every condition of every case: graph ops → product buildContext →
// messages + hash + canvas. Enforces matched_pairs token parity; refuses on
// violation. Outputs are the audit artifacts (protocol v2).
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { loadCase, applyOps, compileGraph, canvasFile, LAYOUTS, CASES, B, COMPILER_VERSION } from './lib.mjs';

// Pipeline order: validate semantics BEFORE any artifact is emitted.
execFileSync(process.execPath, [new URL('./validate.mjs', import.meta.url).pathname], { stdio: 'inherit' });

mkdirSync(`${B}/runs/compiled`, { recursive: true });
mkdirSync(`${B}/canvases/inputs`, { recursive: true });

let failed = false;
for (const [track, name] of CASES) {
  const { c } = loadCase(track, name);
  const tokensByCondition = {};
  for (const [cond, spec] of Object.entries(c.conditions)) {
    const g = applyOps(c.graph, spec.graph_ops);
    const compiled = compileGraph(g, 'final', LAYOUTS[c.id]);
    tokensByCondition[cond] = compiled.input_token_est;
    const artifact = {
      compiler_version: COMPILER_VERSION,
      case_id: c.id, condition: cond,
      graph_ops: spec.graph_ops,
      recompute_nodes: spec.recompute_nodes ?? [],
      prompt_hash: compiled.prompt_hash,
      input_token_est: compiled.input_token_est,
      node_order_audit: compiled.node_order_audit,
      messages: compiled.messages,
    };
    writeFileSync(`${B}/runs/compiled/${c.id}.${cond}.compile.json`, JSON.stringify(artifact, null, 2));
    writeFileSync(`${B}/canvases/inputs/${c.id}.${cond}.thoughtdag.json`,
      JSON.stringify(canvasFile(`${c.id} · ${cond}`, compiled.product_nodes, compiled.product_edges), null, 2));
    console.log(`${c.id} ${cond}: ${compiled.input_token_est} tok, order=[${compiled.node_order_audit.join(', ')}]`);
  }
  for (const pair of c.construction.matched_pairs ?? []) {
    const a = tokensByCondition[pair.a], b = tokensByCondition[pair.b];
    const rel = Math.abs(a - b) / Math.max(a, b);
    const ok = rel <= pair.max_rel_diff;
    console.log(`  matched ${pair.a}(${a}) vs ${pair.b}(${b}): rel diff ${(rel * 100).toFixed(1)}% ${ok ? 'OK' : 'VIOLATION'}`);
    if (!ok) failed = true;
  }
}
if (failed) { console.error('\nCOMPILE REFUSED: matched-pair token parity violated. Tune filler text and recompile.'); process.exit(1); }
console.log('\ncompile complete');
