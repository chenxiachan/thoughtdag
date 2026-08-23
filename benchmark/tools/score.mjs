// Re-score all traces of a run WITHOUT calling any API: reads raw responses
// from traces, applies the declarative scorer, fixes metadata provenance
// (reasoning provider-default + observed, cached tokens from raw usage).
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { loadCase, sha256, CASES, B, COMPILER_VERSION } from './lib.mjs';
import { scoreAnswer, SCORER_VERSION } from './scorer.mjs';

const RUN_ID = process.argv[2] ?? 'gate-v2-glm45flash-2026-08-16';
const env = JSON.parse(readFileSync(`${B}/runs/${RUN_ID}/envelope.json`, 'utf8'));
const results = [];
for (const [track, name] of CASES) {
  const { c, gold } = loadCase(track, name);
  for (const cond of Object.keys(c.conditions)) {
    const trace = JSON.parse(readFileSync(`${B}/runs/${RUN_ID}/traces/${c.id}.${cond}.trace.json`, 'utf8'));
    const finalStep = trace.steps.find((s) => s.kind === 'final');
    const resp = finalStep.raw_response;
    const answerRaw = resp.choices[0].message.content ?? '';
    const scored = scoreAnswer(answerRaw, c.scorer, gold);
    const usageIn = trace.steps.reduce((a, s) => a + (s.raw_response.usage?.prompt_tokens ?? 0), 0);
    const usageOut = trace.steps.reduce((a, s) => a + (s.raw_response.usage?.completion_tokens ?? 0), 0);
    const cached = trace.steps.reduce((a, s) => a + (s.raw_response.usage?.prompt_tokens_details?.cached_tokens ?? 0), 0);
    // Reasoning provenance across provider dialects: message.reasoning_content
    // (Zhipu), message.reasoning / message.reasoning_details (OpenRouter), and
    // the normalized usage counter. Any positive signal counts as observed.
    const reasoningObserved = trace.steps.some((s) => {
      const m = s.raw_response.choices?.[0]?.message ?? {};
      const rt = s.raw_response.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
      return !!m.reasoning_content || !!m.reasoning || (Array.isArray(m.reasoning_details) && m.reasoning_details.length > 0) || rt > 0;
    });
    results.push({
      case_id: c.id, condition: cond,
      provider: env.provider, model: env.model, model_revision: env.model_revision,
      reasoning_mode: env.reasoning_request_mode?.startsWith('provider-default') ? 'provider-default' : env.reasoning_request_mode, reasoning_observed: reasoningObserved,
      temperature: env.decoding?.temperature ?? null,
      answer_raw: answerRaw, ...scored,
      input_tokens: usageIn, output_tokens: usageOut, cached_tokens: cached,
      cost: env.cost_per_run ?? 0, currency: env.currency ?? 'CNY',
      latency_ms: trace.latency_ms ?? trace.result_snapshot_at_capture?.latency_ms ?? null,
      run_date: trace.capture?.run_date ?? '2026-08-16',
      compiler_version: COMPILER_VERSION, scorer_version: SCORER_VERSION,
      cache_key: sha256(`${finalStep.prompt_hash}|${env.model}|${env.reasoning_request_mode}|t${env.decoding?.temperature}|${COMPILER_VERSION}|${SCORER_VERSION}`),
    });
    const r = results[results.length - 1];
    console.log(`${c.id} ${cond}: correct=${r.answer_correct} fmt=${r.format_compliant} adoptStale=${r.adopted_stale_answer} mentionStale=${r.mentioned_stale_value} adoptDis=${r.adopted_distractor_answer} → ${JSON.stringify(r.answer_extracted).slice(0, 50)}`);
  }
}
writeFileSync(`${B}/runs/${RUN_ID}/results.json`, JSON.stringify(results, null, 2));
console.log(`\nrescored ${results.length} results (no API calls)`);
