// Runner v3: CAPTURE ONLY. Emits immutable trace facts (messages, prompt
// hashes, raw API responses, timing); never scores, never embeds results.
// Official results always derive from traces via tools/score.mjs.
// Usage: node tools/run-glm.mjs [run_id] [model]   (suite via BENCH_SUITE)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { loadCase, applyOps, compileGraph, wireRecompute, LAYOUTS, CASES, B, COMPILER_VERSION } from './lib.mjs';

const ROOT = new URL('../..', import.meta.url).pathname;
const key = readFileSync(`${ROOT}/.env`, 'utf8').match(/^ZHIPU_API_KEY=(.+)$/m)[1].trim();
const RUN_ID = process.argv[2] ?? 'gate-v2-glm45flash-2026-08-16';
const MODEL = process.argv[3] ?? 'glm-4.5-flash';
const RUN_DATE = new Date().toISOString().slice(0, 10);

mkdirSync(`${B}/runs/${RUN_ID}/traces`, { recursive: true });

async function call(messages) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: MODEL, temperature: 0, messages }),
    });
    if (r.status === 429) { await new Promise((res) => setTimeout(res, 3000 * (attempt + 1))); continue; }
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return await r.json();
  }
  throw new Error('rate-limited after retries');
}

for (const [track, name] of CASES) {
  const { c } = loadCase(track, name);
  for (const [cond, spec] of Object.entries(c.conditions)) {
    const tracePath = `${B}/runs/${RUN_ID}/traces/${c.id}.${cond}.trace.json`;
    if (existsSync(tracePath)) { console.log(`${c.id} ${cond}: trace exists, skipped`); continue; }
    const trace = { case_id: c.id, condition: cond, run_id: RUN_ID,
                    capture: { model: MODEL, temperature: 0, run_date: RUN_DATE, compiler_version: COMPILER_VERSION },
                    steps: [] };
    const t0 = Date.now();
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
    trace.latency_ms = Date.now() - t0;
    writeFileSync(tracePath, JSON.stringify(trace, null, 2));
    const ans = trace.steps[trace.steps.length - 1].raw_response.choices[0].message.content ?? '';
    console.log(`${c.id} ${cond}: captured (${trace.latency_ms}ms) → ${JSON.stringify(ans.slice(0, 50))}`);
  }
}
console.log('capture complete; run tools/score.mjs for official results');
