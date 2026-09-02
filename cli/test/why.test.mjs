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
  cc('a4', 'u2', 'assistant', [{ type: 'tool_use', id: 't3', name: 'Read', input: { file_path: `${proj}/README.md` } }, { type: 'tool_use', id: 't3b', name: 'WebFetch', input: { url: 'https://arxiv.org/abs/2506.07962v2', prompt: 'summarize' } }, { type: 'tool_use', id: 't3c', name: 'WebFetch', input: { url: 'https://Example.com/a#frag', prompt: 'read' } }, { type: 'tool_use', id: 't3d', name: 'Read', input: { file_path: `${proj}/paper.pdf`, pages: '1-5' } }, { type: 'tool_use', id: 't3e', name: 'Read', input: { file_path: `${proj}/paper.pdf`, pages: '9-10' } }]),
  cc('r3', 'a4', 'user', [{ type: 'tool_result', tool_use_id: 't3', content: '# hi' }, { type: 'tool_result', tool_use_id: 't3b', content: 'paper text' }, { type: 'tool_result', tool_use_id: 't3c', content: 'page text' }, { type: 'tool_result', tool_use_id: 't3d', content: 'pp' }, { type: 'tool_result', tool_use_id: 't3e', content: 'pp' }]),
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
// a codex rollout whose turn id is REUSED after a compaction: two segments, both touch the file
writeFileSync(join(cxRoot, '2026/09/01', 'rollout-2026-09-01T13-00-00-cx-3.jsonl'), [
  cx('session_meta', { id: 'cx-3', cwd: proj, timestamp: '2026-08-03T10:00:00.000Z' }, '2026-08-03T10:00:00.000Z'),
  cx('turn_context', { turn_id: 'T1' }, '2026-08-03T10:00:00.000Z'),
  cx('response_item', { type: 'message', role: 'user', content: [{ type: 'input_text', text: '第一段改 reuse.ts' }] }, '2026-08-03T10:00:00.000Z'),
  cx('response_item', { type: 'custom_tool_call', call_id: 'r1', name: 'apply_patch', input: '*** Begin Patch\n*** Update File: src/reuse.ts\n@@\n-a\n+b\n*** End Patch' }, '2026-08-03T10:00:00.000Z'),
  cx('response_item', { type: 'custom_tool_call_output', call_id: 'r1', output: 'Done' }, '2026-08-03T10:00:00.000Z'),
  cx('response_item', { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '改了 a。' }] }, '2026-08-03T10:00:00.000Z'),
  cx('compacted', {}, '2026-08-03T10:05:00.000Z'),
  cx('turn_context', { turn_id: 'T1' }, '2026-08-03T10:06:00.000Z'),
  cx('response_item', { type: 'message', role: 'user', content: [{ type: 'input_text', text: '压缩后第二段再改 reuse.ts' }] }, '2026-08-03T10:06:00.000Z'),
  cx('response_item', { type: 'custom_tool_call', call_id: 'r2', name: 'apply_patch', input: '*** Begin Patch\n*** Update File: src/reuse.ts\n@@\n-b\n+c\n*** End Patch' }, '2026-08-03T10:06:00.000Z'),
  cx('response_item', { type: 'custom_tool_call_output', call_id: 'r2', output: 'Done' }, '2026-08-03T10:06:00.000Z'),
  cx('response_item', { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '改了 b。' }] }, '2026-08-03T10:06:00.000Z'),
].join('\n'));
// a resumed codex thread: a second rollout file, same session id, new turn — one logical session, two source files
writeFileSync(join(cxRoot, '2026/09/01', 'rollout-2026-09-01T12-00-00-cx-2.jsonl'), [
  cx('session_meta', { id: 'cx-2', cwd: other, timestamp: '2026-08-02T10:00:00.000Z' }, '2026-08-02T10:00:00.000Z'),
  cx('turn_context', { turn_id: 'T9' }, '2026-08-02T10:00:00.000Z'),
  cx('response_item', { type: 'message', role: 'user', content: [{ type: 'input_text', text: '续接后再改' }] }, '2026-08-02T10:00:00.000Z'),
  cx('response_item', { type: 'custom_tool_call', call_id: 'c9', name: 'apply_patch', input: '*** Begin Patch\n*** Update File: frag.ts\n@@\n-x\n+y\n*** End Patch' }, '2026-08-02T10:00:00.000Z'),
  cx('response_item', { type: 'custom_tool_call_output', call_id: 'c9', output: 'Done' }, '2026-08-02T10:00:00.000Z'),
  cx('response_item', { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '改了。' }] }, '2026-08-02T10:00:00.000Z'),
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
  assert.match(out, /indexed 7 sessions \(0 unchanged, 1 not sessions?, 0 gone\)/);
});

test('the store is private: directory 0700, files 0600', () => {
  assert.equal(mode(home), '700');
  assert.equal(mode(join(home, 'fact-index.json')), '600');
  assert.equal(mode(join(home, 'interpretation-cache.json')), '600');
  assert.equal(mode(join(home, 'text-index.json')), '600');
});

test('facts hold no interpretation and no full answers; the workspace is the git root', () => {
  const facts = JSON.parse(readFileSync(join(home, 'fact-index.json'), 'utf8'));
  const text = JSON.stringify(facts);
  assert.ok(!text.includes('崩溃来自流式输出') && !text.includes('走 OAuth'), 'fact index leaked answer text');
  const sid1 = Object.values(facts.sessions).find((x) => x.id === 'sid-1');
  assert.equal(sid1.workspace, realProj);
  assert.equal(sid1.cwd, join(realProj, 'src'));
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

test('a session split across files is one session: grouped, numbered through, recalled by that number', () => {
  const idx = JSON.parse(readFileSync(join(home, 'fact-index.json'), 'utf8'));
  assert.equal(Object.keys(idx.sessions).length, 7, 'facts are stored per source file');
  assert.equal(new Set(Object.values(idx.sessions).map((s) => s.id)).size, 6, 'six logical sessions');
  const status = run('status');
  assert.match(status, /6 sessions in 7 files/);
  const why = run('why', `${other}/frag.ts`);
  assert.match(why.split('\n')[0], /1 turn in 1 session/);
  assert.match(why, /#1\b/, 'the fragment\'s only turn is turn 1 of the logical session (turn 0 lives in the first file)');
  const rec = run('recall', 'cx-2', '1');
  assert.ok(rec.includes('续接后再改'), 'recall resolves the number through the fragments');
});

test('page ranges survive from the read call into the index and the answer', () => {
  const why = run('why', 'paper.pdf');
  assert.match(why, /📖 read\s+#1  p\.1-5 p\.9-10/, why.split('\n').find((l) => l.includes('read')) ?? 'no read line');
  const json = JSON.parse(run('why', 'paper.pdf', '--json'));
  assert.deepEqual(json.hits[0].locators, [{ pages: '1-5' }, { pages: '9-10' }]);
});

test('a host-flavoured path still resolves: @file, quotes, trailing colon', () => {
  assert.match(run('why', '@src/lib/api.ts').split('\n')[0], /^why src\/lib\/api\.ts/);
  assert.match(run('why', '"api.ts"').split('\n')[0], /^why src\/lib\/api\.ts/);
  assert.match(run('why', 'src/lib/api.ts:').split('\n')[0], /^why src\/lib\/api\.ts/);
});

test('a bare filename resolves inside this workspace; --all widens', () => {
  assert.match(run('why', 'api.ts').split('\n')[0], /why src\/lib\/api\.ts/);
  assert.match(run('why', 'api.ts', '--all').split('\n')[0], /2 files match/);
  assert.match(run('why', 'nope.ts'), /no session touched/);
});

test('a paper and a page are artifacts too: why arxiv:<id> and why <url>', () => {
  const paper = run('why', 'arxiv:2506.07962');
  assert.match(paper.split('\n')[0], /^why arxiv:2506\.07962  ·  1 turn in 1 session$/);
  assert.match(paper, /🌐 fetch/);
  assert.match(run('why', '2506.07962').split('\n')[0], /1 turn in 1 session/);
  const page = run('why', 'https://example.com/a');
  assert.match(page.split('\n')[0], /^why https:\/\/example\.com\/a  ·  1 turn in 1 session$/, 'host lowercased, fragment dropped');
  assert.match(run('why', 'https://nowhere.example/x'), /no session touched/);
});

test('a turn id reused after a compaction is two turns, not one swallowed', () => {
  const why = run('why', 'src/reuse.ts');
  assert.match(why.split('\n')[0], /2 turns in 1 session/, why.split('\n')[0]);
  assert.match(why, /Δ a → b/); assert.match(why, /Δ b → c/);
});

test('every hit opens at its own turn; a session opened from a canvas says so', () => {
  const json = JSON.parse(run('why', 'src/lib/api.ts', '--json'));
  assert.ok(json.hits.every((h) => /^thoughtdag:\/\/open\?session=[^&]+&turn=[^&]+$/.test(h.open)), JSON.stringify(json.hits.map((h) => h.open)));
  const text = run('why', 'src/lib/api.ts', '--include-read');
  const hitLines = text.split('\n').filter((l) => /^  \d{4}-\d{2}-\d{2} /.test(l));
  assert.ok(hitLines.length >= 3 && hitLines.every((l) => /thoughtdag:\/\/open\?session=[^&\s]+&turn=\S+$/.test(l)), 'every hit line in the TEXT output ends with its own deep link');
  assert.ok(text.includes('thoughtdag://open?session=sid-1&turn=u1'));
});

test('find: exact words asked (Q) or answered (A), anywhere in the text, newest first, with pointers', () => {
  const asked = run('find', '模型一用就崩');
  assert.match(asked.split('\n')[0], /^find "模型一用就崩"  ·  1 turn in 1 session$/);
  assert.match(asked, /Q: 免费档模型一用就崩，帮我查/);
  assert.match(asked, /thoughtdag:\/\/open\?session=sid-1&turn=u1/);
  const said = run('find', 'OAuth');
  assert.match(said, /A: .*走 OAuth，服务端零改动/);
  assert.match(run('find', 'OAuth', '--in', 'q'), /0 turns/);
  // words buried in the MIDDLE of an answer, nowhere near its conclusion
  const mid = run('find', '流式输出没有节流');
  assert.match(mid.split('\n')[0], /1 turn in 1 session/);
  assert.match(mid, /A: .*崩溃来自流式输出没有节流/);
  assert.match(run('find', '流式输出没有节流', '--in', 'q'), /0 turns/);
  assert.match(run('find', '不存在的短语'), /0 turns/);
  const json = JSON.parse(run('find', '崩', '--json'));
  assert.equal(json.hits[0].where, 'Q');
});

test('--json carries the evidence legend and per-hit fields', () => {
  const json = JSON.parse(run('why', 'src/lib/api.ts', '--json'));
  assert.equal(json.turns, 2); assert.equal(json.readsHidden, 1);
  assert.match(json.evidence.change, /^observed/);
  assert.equal(json.artifact, `file://${realProj}/src/lib/api.ts`); assert.equal(json.file, `${realProj}/src/lib/api.ts`);
  assert.ok(json.hits.every((h) => h.open.startsWith('thoughtdag://open?session=')));
});

test('deleted interpretation and text caches come back on the next index', () => {
  assert.match(run('purge', '--cache'), /removed 2 files/);
  assert.ok(!existsSync(join(home, 'interpretation-cache.json')) && !existsSync(join(home, 'text-index.json')));
  run('index');
  assert.ok(existsSync(join(home, 'interpretation-cache.json')) && existsSync(join(home, 'text-index.json')));
  assert.match(run('find', '流式输出没有节流'), /1 turn/);
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
  assert.match(status, /6 sessions in 7 files · 10 turns · 7 files · 1 urls · 1 papers/);
  assert.match(status, /8 edits\/writes, 8 with an observed change head/);
  assert.match(status, /candidates only/);
});

test('purge removes every stored file', () => {
  assert.match(run('purge'), /removed 3 files/);
  assert.ok(!existsSync(join(home, 'fact-index.json')) && !existsSync(join(home, 'interpretation-cache.json')) && !existsSync(join(home, 'text-index.json')));
  rmSync(tmp, { recursive: true, force: true });
});

test('npm pack ships the executable and the license from a clean tree', () => {
  const out = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: CLI_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const files = JSON.parse(out)[0].files.map((f) => f.path);
  for (const f of ['dist/thoughtdag.mjs', 'LICENSE', 'README.md', 'package.json']) assert.ok(files.includes(f), `missing ${f} in ${files.join(', ')}`);
});
