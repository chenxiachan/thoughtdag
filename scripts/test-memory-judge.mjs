// Memory-judge golden set. Run BEFORE and AFTER any JUDGE_PROMPT wording
// change (see JUDGE_PROMPT_VERSION in src/lib/memory.ts): admission behavior
// must change by decision, not by prompt-tuning side effect.
//
// Talks straight to the local proxy's default model (npm run server must be
// up). Verdicts pass through the same constitution the app applies
// (mirrored here: identity requires evidence 'stated'; credential-like text
// rejected), so what's scored is the admissible OUTCOME, not raw judge JSON.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { cases } = JSON.parse(fs.readFileSync(path.join(here, 'memory-goldens.json'), 'utf8'));

// Keep in sync with JUDGE_PROMPT in src/lib/memory.ts
const memorySrc = fs.readFileSync(path.join(here, '..', 'src', 'lib', 'memory.ts'), 'utf8');
const promptMatch = memorySrc.match(/const JUDGE_PROMPT =\n([\s\S]*?);\n/);
const JUDGE_PROMPT = promptMatch[1]
  .split('\n')
  .map((l) => l.trim().replace(/^'/, '').replace(/'\s*\+?$/, ''))
  .join('')
  .replace(/\\'/g, "'");

const CREDENTIAL_PATTERN = /sk-[a-zA-Z0-9_-]{8,}|api[ _-]?key|password|token|secret/i;

async function judge(q, a) {
  const res = await fetch('http://localhost:3001/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: `Existing memory entries:\n(none)\n\nExchange:\nUser: ${q}\nAssistant: ${a}\n\n${JUDGE_PROMPT}` }],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  const m = String(data.text ?? '').match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : { action: 'none' };
}

// The constitution, mirrored: what would actually be admitted.
function admissibleOutcome(v) {
  if (v.action !== 'add' && v.action !== 'update') return 'none';
  const text = (v.text ?? '').trim();
  if (!text || CREDENTIAL_PATTERN.test(text)) return 'none';
  if (!['preference', 'identity', 'project'].includes(v.category)) return 'none';
  if (v.category === 'identity' && v.evidence !== 'stated') return 'none';
  return v.category;
}

let pass = 0;
const failures = [];
for (const [i, c] of cases.entries()) {
  let outcome;
  try {
    outcome = admissibleOutcome(await judge(c.q, c.a));
  } catch (e) {
    console.log(`  #${i + 1} ERROR: ${e.message}`);
    failures.push(i + 1);
    continue;
  }
  const ok = outcome === c.expect || (c.tolerant && outcome === 'none');
  if (ok) pass++;
  else failures.push(i + 1);
  console.log(`${ok ? '✅' : '❌'} #${i + 1} expect=${c.expect}${c.tolerant ? '(tolerant)' : ''} got=${outcome}  「${c.q.slice(0, 30)}…」`);
}
console.log(`\n${pass}/${cases.length} passed${failures.length ? ` — failed: ${failures.join(', ')}` : ''}`);
console.log('Judge model has sampling variance: compare pass RATES across prompt versions, not single runs.');
process.exit(pass >= cases.length - 3 ? 0 : 1); // tolerate ≤3 flakes per run
