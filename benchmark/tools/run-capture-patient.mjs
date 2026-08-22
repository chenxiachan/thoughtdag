// Provider-neutral capture runner (the unified capture contract).
// Everything provider-specific lives in the run's envelope.json:
//   endpoint, model, key_env, decoding. The runner emits identical trace
//   shapes for every provider; score.mjs never learns who the vendor was.
// Usage: node tools/run-capture.mjs <run_id>       (suite via BENCH_SUITE)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { loadCase, applyOps, compileGraph, wireRecompute, LAYOUTS, CASES, B, COMPILER_VERSION } from './lib.mjs';

const RUN_ID = process.argv[2];
if (!RUN_ID) { console.error('usage: run-capture.mjs <run_id> (envelope.json must exist in runs/<run_id>/)'); process.exit(1); }
const env = JSON.parse(readFileSync(`${B}/runs/${RUN_ID}/envelope.json`, 'utf8'));
const ROOT = new URL('../..', import.meta.url).pathname;
const key = readFileSync(`${ROOT}/.env`, 'utf8').match(new RegExp(`^${env.key_env}=(.+)$`, 'm'))[1].trim();

mkdirSync(`${B}/runs/${RUN_ID}/traces`, { recursive: true });

async function call(messages) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const r = await fetch(env.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      // request_extra: verbatim per-request body fields from the envelope —
      // e.g. an explicit reasoning toggle for ablations. The envelope is the
      // identity record, so the exact parameters always travel with the run.
      body: JSON.stringify({ model: env.model, temperature: env.decoding?.temperature ?? 0, messages, ...(env.request_extra ?? {}) }),
    });
    if (r.status === 429 || r.status >= 500) { await new Promise((res) => setTimeout(res, Math.min(150000, 5000 * 2 ** attempt))); continue; }
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    if (!j.choices?.[0]?.message) { await new Promise((res) => setTimeout(res, 5000)); continue; }
    return j;
  }
  throw new Error('exhausted retries');
}

let done = 0, skipped = 0;
for (const [track, name] of CASES) {
  const { c } = loadCase(track, name);
  for (const [cond, spec] of Object.entries(c.conditions)) {
    const tracePath = `${B}/runs/${RUN_ID}/traces/${c.id}.${cond}.trace.json`;
    if (existsSync(tracePath)) { skipped++; continue; }
    const trace = { case_id: c.id, condition: cond, run_id: RUN_ID,
                    capture: { model: env.model, temperature: env.decoding?.temperature ?? 0,
                               run_date: new Date().toISOString().slice(0, 10), compiler_version: COMPILER_VERSION },
                    steps: [] };
    const t0 = Date.now();
    try {
      if (spec.recompute_nodes?.length) {
        let g = applyOps(c.graph, spec.graph_ops);
        g = wireRecompute(g, spec.recompute_nodes, c.graph.nodes);
        for (const rid of spec.recompute_nodes) {
          const step = compileGraph(g, rid, LAYOUTS[c.id]);
          const resp = await call(step.messages);
          trace.steps.push({ kind: 'recompute', node: rid, prompt_hash: step.prompt_hash, messages: step.messages, raw_response: resp });
          g.nodes.find((n) => n.id === rid).content.answer = resp.choices[0].message.content ?? '';
        }
        const fin = compileGraph(g, 'final', LAYOUTS[c.id]);
        const resp = await call(fin.messages);
        trace.steps.push({ kind: 'final', prompt_hash: fin.prompt_hash, messages: fin.messages, raw_response: resp });
      } else {
        const compiled = JSON.parse(readFileSync(`${B}/runs/compiled/${c.id}.${cond}.compile.json`, 'utf8'));
        const resp = await call(compiled.messages);
        trace.steps.push({ kind: 'final', prompt_hash: compiled.prompt_hash, messages: compiled.messages, raw_response: resp });
      }
    } catch (e) {
      console.log(`${c.id} ${cond}: FAILED ${e.message}`);
      continue; // no partial trace written; retryable on next invocation
    }
    trace.latency_ms = Date.now() - t0;
    writeFileSync(tracePath, JSON.stringify(trace, null, 2));
    done++;
    if (done % 10 === 0) console.log(`progress: ${done} captured`);
  }
}
console.log(`capture complete: ${done} new, ${skipped} existing → runs/${RUN_ID}/`);
