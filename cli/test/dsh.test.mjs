// DeepSeek Harness sessions in the why layer: a zstd-framed log under its own
// root, decoded frame by frame; the footprint comes from the file operations
// run_code dispatched, not from the code text. Own fixture store so the
// counts in why.test.mjs stay what they are.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as zlib from 'node:zlib';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'thoughtdag.mjs');
const hasZstd = typeof zlib.zstdCompressSync === 'function' && typeof zlib.zstdDecompressSync === 'function';
const t = hasZstd ? test : test.skip; // Node < 22.15 has no zstd; the CLI then skips these logs and says so

const tmp = mkdtempSync(join(tmpdir(), 'td-dsh-'));
const proj = join(tmp, 'proj'); mkdirSync(join(proj, 'src', 'lib'), { recursive: true }); mkdirSync(join(proj, '.git'));
const home = join(tmp, 'home'); const dshRoot = join(tmp, 'dsh');
const dir = join(dshRoot, '--proj--', 'session-dsh-1'); mkdirSync(dir, { recursive: true });
const blankDir = join(dshRoot, '--proj--', 'session-dsh-blank'); mkdirSync(blankDir, { recursive: true });
const file = join(dir, 'session.jsonl.zstd');
const L = (o) => JSON.stringify(o);
const T = 1788522596653;
const header = (id) => L({ type: 'session', version: 0, id, createdAt: T, cwd: proj, delegationDepth: 0, agentPreset: 'standard' });
const api = join(proj, 'src', 'lib', 'api.ts'); const backoff = join(proj, 'src', 'lib', 'backoff.ts');
// frame 1: header, turn open, the harness's own injected context (not a question), the human's question, the title
const frame1 = [
  header('session-dsh-1'),
  L({ type: 'turn/start', seq: 1, time: T, data: { turn: 1 } }),
  L({ type: 'user/message', seq: 2, time: T, data: { content: [{ type: 'text', text: '<runtime-context>now: 2026-09-04</runtime-context>' }], source: { kind: 'plugin', plugin: 'dsh-time-context' }, role: 'user', id: 'm-inj' }, surfaceOp: 'append' }),
  L({ type: 'user/message', seq: 3, time: T, data: { content: [{ type: 'text', text: '把 backoff.ts 的重试改成退避' }], source: { kind: 'user' }, role: 'user', id: 'm-u1' }, surfaceOp: 'append' }),
  L({ type: 'session/title', seq: 4, time: T, data: { title: '改成退避', messageSeqs: [3], source: { kind: 'llm' } } }),
];
// frame 2: one run_code call whose code reads api.ts (a window), runs a shell command, edits backoff.ts; then the answer with reasoning
const frame2 = [
  L({ type: 'tool/call', seq: 5, time: T + 1, data: { turn: 1, step: 1, callId: 'c1', name: 'run_code', arguments: L({ code: "await tools.read({file_path: 'src/lib/api.ts'}); await tools.bash({command: 'npm test'}); await tools.edit({file_path: 'src/lib/backoff.ts'})" }) } }),
  L({ type: 'tool/code-dispatch', seq: 6, time: T + 2, data: { rootCallId: 'c1', parentCallId: 'c1', subCallId: 'c1:code:1', name: 'read', arguments: { file_path: api, offset: 10, limit: 20 }, isError: false, content: [{ type: 'text', text: 'export const x = retry(1);' }] } }),
  L({ type: 'tool/code-dispatch', seq: 7, time: T + 3, data: { rootCallId: 'c1', parentCallId: 'c1', subCallId: 'c1:code:2', name: 'bash', arguments: { command: 'npm test', workdir: proj }, isError: false, content: [{ type: 'text', text: 'ok' }] } }),
  L({ type: 'tool/code-dispatch', seq: 8, time: T + 4, data: { rootCallId: 'c1', parentCallId: 'c1', subCallId: 'c1:code:3', name: 'edit', arguments: { file_path: backoff, old_string: 'x = retry(1)', new_string: 'x = backoff(1)' }, isError: false, content: [{ type: 'text', text: 'edited' }] } }),
  L({ type: 'tool/result', seq: 9, time: T + 5, data: { turn: 1, step: 1, message: { source: { callId: 'c1' }, content: [{ type: 'text', text: 'done' }] } }, surfaceOp: 'append' }),
  L({ type: 'assistant/message', seq: 10, time: T + 6, data: { turn: 1, step: 2, message: { id: 'm-a1', content: [{ type: 'reasoning', text: 'The user wants backoff.' }, { type: 'text', text: '改好了。\n\n重试改成指数退避，接口不变。' }] } }, surfaceOp: 'append' }),
  L({ type: 'turn/end', seq: 11, time: T + 7, data: { turn: 1, reason: 'completed' } }),
];
if (hasZstd) {
  writeFileSync(file, Buffer.concat([zlib.zstdCompressSync(Buffer.from(frame1.join('\n') + '\n')), zlib.zstdCompressSync(Buffer.from(frame2.join('\n') + '\n'))]));
  writeFileSync(join(blankDir, 'session.jsonl.zstd'), zlib.zstdCompressSync(Buffer.from(header('session-dsh-blank') + '\n')));
}
const env = { ...process.env, THOUGHTDAG_HOME: home, THOUGHTDAG_SESSION_ROOTS: dshRoot };
const run = (...a) => execFileSync(process.execPath, [CLI, ...a], { env, cwd: proj, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

t('index reads a two-frame zstd log and a blank one as two sessions', () => {
  assert.match(run('index'), /indexed 2 sessions \(0 unchanged, 0 not sessions, 0 gone\)/);
  assert.match(run('status'), /2 sessions in 2 files · 1 turn/);
});

t('the footprint is the edit run_code dispatched, shown as the runner\'s own change', () => {
  const why = run('why', 'src/lib/backoff.ts');
  assert.match(why.split('\n')[0], /1 turn in 1 session/);
  assert.match(why, /dsh  「改成退避」/, 'runner and the harness\'s own title');
  assert.match(why, /✏️ edit/);
  assert.match(why, /Δ x = retry\(1\) → x = backoff\(1\)/);
  assert.match(why, /Q: 把 backoff\.ts 的重试改成退避/);
  assert.ok(!why.includes('runtime-context'), 'the injected context is not a question');
  assert.ok(!why.includes('The user wants backoff'), 'reasoning is not the answer');
  assert.match(why, /thoughtdag:\/\/open\?session=session-dsh-1&turn=m-u1/);
});

t('a read dispatched from run_code is a read, with its line window; a file nobody changed still answers', () => {
  // reads hide only behind changes; api.ts was only read here, so the read IS the answer
  const why = run('why', 'src/lib/api.ts');
  assert.match(why.split('\n')[0], /1 turn in 1 session/);
  assert.match(why, /📖 read .*L10-29/);
  assert.match(run('why', 'src/lib/api.ts', '--include-read').split('\n')[0], /1 turn in 1 session/);
});

t('the shell dispatch is not a footprint; words in the answer are found', () => {
  assert.match(run('find', 'npm test'), /0 turns/);
  assert.match(run('find', '指数退避', '--in', 'a'), /1 turn in 1 session/);
  assert.match(run('find', 'The user wants backoff'), /0 turns/, 'reasoning is not indexed text');
});

t('recall shows the question, the edit as a diff, and no reasoning', () => {
  const rec = run('recall', 'session-dsh-1', '0');
  assert.ok(rec.includes('把 backoff.ts 的重试改成退避') && rec.includes('+++ new\n') && rec.includes('x = backoff(1)'));
  assert.ok(!rec.includes('The user wants backoff'));
});

t('events projects the log onto the contract with runner dsh and an observed edit', () => {
  const ev = run('events', file);
  assert.match(ev, /"kind":"session.started".*"runner":"dsh"/);
  assert.match(ev, /"kind":"tool.called".*"op":"edit"/);
  assert.match(ev, /"kind":"tool.called".*"op":"read"/);
  assert.ok(!/"op":"run"/.test(ev) || !/npm test.*"artifacts":\[\{/.test(ev), 'a shell dispatch carries no artifact');
});

t('purge, then the fixture goes', () => {
  run('purge');
  rmSync(tmp, { recursive: true, force: true });
});
