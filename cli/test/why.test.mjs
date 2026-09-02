// End to end on synthetic session stores: the trust properties of the why
// layer. Run with `npm test` in cli/ (builds first) — every scenario here
// is reproducible from a clean checkout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, statSync, existsSync, rmSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(CLI_DIR, 'dist', 'thoughtdag.mjs');

// ─── fixture stores ─────────────────────────────────────────────────
const tmp = mkdtempSync(join(tmpdir(), 'td-why-'));
const ccRoot = join(tmp, 'claude'); const cxRoot = join(tmp, 'codex'); const home = join(tmp, 'home');
const proj = join(tmp, 'proj'); mkdirSync(join(proj, 'src', 'lib'), { recursive: true }); mkdirSync(join(proj, '.git'));
const realProj = realpathSync(proj);
const other = join(tmp, 'other'); mkdirSync(other, { recursive: true });
mkdirSync(join(ccRoot, 'proj', 'sid-1', 'subagents'), { recursive: true }); mkdirSync(join(cxRoot, '2026/09/01'), { recursive: true });
const L = (o) => JSON.stringify(o);
const cc = (uuid, parent, type, content, extra = {}) => L({ type, uuid, parentUuid: parent, sessionId: 'sid-1', cwd: join(proj, 'src'), isSidechain: false, timestamp: extra.at ?? '2026-08-21T14:02:00.000Z', message: { role: type, content }, ...extra });
const mainFile = join(ccRoot, 'proj', 'sid-1.jsonl');
writeFileSync(mainFile, [
  cc('u1', null, 'user', '免费档模型一用就崩，帮我查'),
  cc('a1', 'u1', 'assistant', [{ type: 'text', text: '先看一下。' }, { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: `${proj}/src/lib/api.ts` } }]),
  cc('r1', 'a1', 'user', [{ type: 'tool_result', tool_use_id: 't1', content: 'export const x = 1;' }]),
  cc('a2', 'r1', 'assistant', [{ type: 'tool_use', id: 't2', name: 'Edit', input: { file_path: `${proj}/src/lib/api.ts`, old_string: 'x = 1', new_string: 'x = retry(1)' } }]),
  cc('r2', 'a2', 'user', [{ type: 'tool_result', tool_use_id: 't2', content: 'ok' }]),
  cc('a3', 'r2', 'assistant', [{ type: 'text', text: '找到了。\n\n崩溃来自流式输出没有节流，加了重试和退避，不是模型的问题。' }]),
  cc('u2', 'a3', 'user', '顺便看看 README', { at: '2026-08-21T15:00:00.000Z' }),
  cc('a4', 'u2', 'assistant', [{ type: 'tool_use', id: 't3', name: 'Read', input: { file_path: `${proj}/README.md` } }]),
  cc('r3', 'a4', 'user', [{ type: 'tool_result', tool_use_id: 't3', content: '# hi' }]),
  cc('a5', 'r3', 'assistant', [{ type: 'text', text: 'README 没问题。' }]),
].join('\n'));
writeFileSync(join(ccRoot, 'proj', 'sid-1', 'subagents', 'agent-abc123.jsonl'), [
  L({ type: 'user', uuid: 'x1', parentUuid: null, sessionId: 'sid-1', isSidechain: true, agentId: 'abc123', cwd: proj, timestamp: '2026-08-21T14:10:00.000Z', message: { role: 'user', content: 'Survey the retry code' } }),
  L({ type: 'assistant', uuid: 'x2', parentUuid: 'x1', sessionId: 'sid-1', isSidechain: true, agentId: 'abc123', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'y1', name: 'Read', input: { file_path: `${proj}/src/lib/api.ts` } }] } }),
  L({ type: 'user', uuid: 'x3', parentUuid: 'x2', sessionId: 'sid-1', isSidechain: true, agentId: 'abc123', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'y1', content: 'code' }] } }),
  L({ type: 'assistant', uuid: 'x4', parentUuid: 'x3', sessionId: 'sid-1', isSidechain: true, agentId: 'abc123', message: { role: 'assistant', content: [{ type: 'text', text: 'Report: retry lives in api.ts.' }] } }),
].join('\n'));
// a continued session replays the turn it continued from: same message id, second file
writeFileSync(join(ccRoot, 'proj', 'sid-2.jsonl'), [
  cc('u1', null, 'user', '免费档模型一用就崩，帮我查', { sessionId: 'sid-2' }),
  cc('a1', 'u1', 'assistant', [{ type: 'tool_use', id: 't1', name: 'Edit', input: { file_path: `${proj}/src/lib/api.ts`, old_string: 'x = 1', new_string: 'x = retry(1)' } }], { sessionId: 'sid-2' }),
  cc('r1', 'a1', 'user', [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }], { sessionId: 'sid-2' }),
  cc('a2', 'r1', 'assistant', [{ type: 'text', text: '同上。' }], { sessionId: 'sid-2' }),
].join('\n'));
// codex: apply_patch names a RELATIVE path (resolved against cwd); a second rollout touches a same-named file elsewhere
const cx = (type, payload, ts = '2026-07-31T10:00:00.000Z') => L({ timestamp: ts, type, payload });
writeFileSync(join(cxRoot, '2026/09/01', 'rollout-2026-09-01T10-00-00-cx-1.jsonl'), [
  cx('session_meta', { id: 'cx-1', cwd: proj, timestamp: '2026-07-31T10:00:00.000Z' }),
  cx('response_item', { type: 'message', role: 'user', content: [{ type: 'input_text', text: '帮我把订阅登录接进来' }] }),
  cx('response_item', { type: 'custom_tool_call', call_id: 'c1', name: 'apply_patch', input: '*** Begin Patch\n*** Update File: src/lib/api.ts\n@@\n-a\n+b\n*** End Patch' }),
  cx('response_item', { type: 'custom_tool_call_output', call_id: 'c1', output: 'Done' }),
  cx('response_item', { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '接好了。\n\n走 OAuth，服务端零改动，重试逻辑先留着兼容旧接口。' }] }),
].join('\n'));
writeFileSync(join(cxRoot, '2026/09/01', 'rollout-2026-09-01T11-00-00-cx-2.jsonl'), [
  cx('session_meta', { id: 'cx-2', cwd: other, timestamp: '2026-08-01T10:00:00.000Z' }),
  cx('response_item', { type: 'message', role: 'user', content: [{ type: 'input_text', text: '另一个项目' }] }),
  cx('response_item', { type: 'custom_tool_call', call_id: 'c1', name: 'apply_patch', input: '*** Begin Patch\n*** Update File: api.ts\n@@\n-a\n+b\n*** End Patch' }),
  cx('response_item', { type: 'custom_tool_call_output', call_id: 'c1', output: 'Done' }),
  cx('response_item', { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '好了。' }] }),
].join('\n'));
// a .jsonl that is not a session at all (a log some other tool left behind)
writeFileSync(join(ccRoot, 'proj', 'not-a-session.jsonl'), '{"hello":"world"}\n{"ping":1}\n');

const env = { ...process.env, THOUGHTDAG_HOME: home, THOUGHTDAG_SESSION_ROOTS: [ccRoot, cxRoot].join(delimiter) };
const run = (...a) => execFileSync(process.execPath, [CLI, ...a], { env, cwd: proj, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const runBoth = (...a) => { // stdout + stderr, for the refresh notice
  const r = spawnSync(process.execPath, [CLI, ...a], { env, cwd: proj, encoding: 'utf8' });
  return { out: r.stdout, err: r.stderr, status: r.status };
};
const mode = (f) => (statSync(f).mode & 0o777).toString(8);

test('index parses both runners, the subagent file, the continued session; skips the stray file', () => {
  const out = run('index');
  assert.match(out, /indexed 5 sessions \(0 unchanged, 1 not sessions?, 0 gone\)/);
});

test('the store is private: directory 0700, files 0600', () => {
  assert.equal(mode(home), '700');
  assert.equal(mode(join(home, 'fact-index.json')), '600');
  assert.equal(mode(join(home, 'interpretation-cache.json')), '600');
});

test('facts hold no interpretation and no full answers; the workspace is the git root', () => {
  const facts = JSON.parse(readFileSync(join(home, 'fact-index.json'), 'utf8'));
  const text = JSON.stringify(facts);
  assert.ok(!text.includes('崩溃来自流式输出') && !text.includes('走 OAuth'), 'fact index leaked answer text');
  assert.equal(facts.sessions['sid-1'].workspace, realProj);
  assert.equal(facts.sessions['sid-1'].cwd, join(realProj, 'src'));
});

test('a stray non-session .jsonl does not make every query refresh', () => {
  const before = JSON.parse(readFileSync(join(home, 'fact-index.json'), 'utf8')).builtAt;
  const r = runBoth('why', 'src/lib/api.ts');
  assert.equal(r.status, 0);
  assert.ok(!/index refreshed/.test(r.err), `unexpected refresh: ${r.err}`);
  assert.equal(JSON.parse(readFileSync(join(home, 'fact-index.json'), 'utf8')).builtAt, before);
});

test('why: reads hidden by default, every turn once with --include-read, evidence marked', () => {
  const why = run('why', 'src/lib/api.ts');
  assert.match(why.split('\n')[0], /2 turns in 2 sessions  \(1 read hidden, --include-read\)/);
  assert.ok(why.indexOf('免费档模型') < why.indexOf('订阅登录'), 'newest session first');
  assert.match(why, /Δ x = 1 → x = retry\(1\)/);
  assert.match(why, /Δ a → b/);
  assert.match(why, /≈ 崩溃来自流式输出/);
  assert.match(why, /not a verified reason/);
  assert.ok(why.includes('「免费档模型一用就崩，帮我查」'), 'session named by what was asked');
  assert.equal((why.match(/thoughtdag:\/\/open\?session=/g) ?? []).length, 2);
  const withReads = run('why', 'src/lib/api.ts', '--include-read');
  assert.match(withReads.split('\n')[0], /3 turns in 3 sessions/);
  assert.match(withReads, /\(subagent\)/);
});

test('a bare filename resolves inside this workspace; --all widens', () => {
  assert.match(run('why', 'api.ts').split('\n')[0], /why src\/lib\/api\.ts/);
  assert.match(run('why', 'api.ts', '--all').split('\n')[0], /2 files match/);
  assert.match(run('why', 'nope.ts'), /no session touched/);
});

test('--json carries the evidence legend and per-hit fields', () => {
  const json = JSON.parse(run('why', 'src/lib/api.ts', '--json'));
  assert.equal(json.turns, 2); assert.equal(json.readsHidden, 1);
  assert.match(json.evidence.change, /^observed/);
  assert.ok(json.hits.every((h) => h.open.startsWith('thoughtdag://open?session=')));
});

test('a deleted interpretation cache comes back on the next index', () => {
  assert.match(run('purge', '--cache'), /removed 1 file/);
  assert.ok(!existsSync(join(home, 'interpretation-cache.json')));
  run('index');
  assert.ok(existsSync(join(home, 'interpretation-cache.json')));
  assert.match(run('why', 'src/lib/api.ts'), /≈ 崩溃来自流式输出/);
});

test('a query refreshes a stale index on its own, and says so', () => {
  appendFileSync(mainFile, '\n' + [
    cc('u3', 'a5', 'user', '再改一下 other.ts', { at: '2026-08-21T16:00:00.000Z' }),
    cc('a6', 'u3', 'assistant', [{ type: 'tool_use', id: 't4', name: 'Write', input: { file_path: `${proj}/src/other.ts`, content: 'export const y = 2;\n' } }]),
    cc('r4', 'a6', 'user', [{ type: 'tool_result', tool_use_id: 't4', content: 'ok' }]),
    cc('a7', 'r4', 'assistant', [{ type: 'text', text: '写好了。' }]),
  ].join('\n'));
  const r = runBoth('why', 'src/other.ts');
  assert.match(r.err, /index refreshed: 1 session re-read/);
  assert.match(r.out.split('\n')[0], /1 turn in 1 session/);
  assert.match(r.out, /Δ new file/);
});

test('recall prints the turn in full with its diff', () => {
  const rec = run('recall', 'sid-1', '0');
  assert.ok(rec.includes('## Question') && rec.includes('免费档模型') && rec.includes('+++ new\n') && rec.includes('x = retry(1)'));
});

test('status reports the evidence breakdown', () => {
  const status = run('status');
  assert.match(status, /5 sessions · 7 turns · 4 files touched/);
  assert.match(status, /5 edits\/writes, 5 with an observed change head/);
  assert.match(status, /candidates only/);
});

test('purge removes every stored file', () => {
  assert.match(run('purge'), /removed 2 files/);
  assert.ok(!existsSync(join(home, 'fact-index.json')) && !existsSync(join(home, 'interpretation-cache.json')));
  rmSync(tmp, { recursive: true, force: true });
});

test('npm pack ships the executable and the license from a clean tree', () => {
  const out = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: CLI_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const files = JSON.parse(out)[0].files.map((f) => f.path);
  for (const f of ['dist/thoughtdag.mjs', 'LICENSE', 'README.md', 'package.json']) assert.ok(files.includes(f), `missing ${f} in ${files.join(', ')}`);
});
