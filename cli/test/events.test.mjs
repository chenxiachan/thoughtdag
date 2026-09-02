// The event contract, checked on both adapters through `thoughtdag events`.
// These are the invariants the ADR promised: stable ids across rebuilds,
// atomic tool pairing, one namespaced identity, evidence that never
// upgrades, artifacts as canonical ids, a rewind that forks the tree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'thoughtdag.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'td-events-'));
const L = (o) => JSON.stringify(o);
const proj = '/repo';
const cc = (uuid, parent, type, content, extra = {}) => L({ type, uuid, parentUuid: parent, sessionId: 'sid-1', cwd: proj, isSidechain: false, timestamp: '2026-08-21T14:02:00.000Z', message: { role: type, content }, ...extra });
const ccFile = join(tmp, 'sid-1.jsonl');
writeFileSync(ccFile, [
  cc('u1', null, 'user', '问一'),
  cc('a1', 'u1', 'assistant', [{ type: 'text', text: '看一下。' }, { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: `${proj}/src/a.ts` } }]),
  cc('r1', 'a1', 'user', [{ type: 'tool_result', tool_use_id: 't1', content: 'const a = 1;' }]),
  cc('a2', 'r1', 'assistant', [{ type: 'tool_use', id: 't2', name: 'Edit', input: { file_path: `${proj}/src/a.ts`, old_string: 'a = 1', new_string: 'a = 2' } }]),
  cc('r2', 'a2', 'user', [{ type: 'tool_result', tool_use_id: 't2', content: 'ok' }]),
  cc('a3', 'r2', 'assistant', [{ type: 'text', text: '改好了。' }]),
  cc('u2', 'a3', 'user', '问二'),
  cc('a4', 'u2', 'assistant', [{ type: 'text', text: '答二。' }]),
  // Esc-rewind: the third turn forks from the FIRST answer, not the second
  cc('u3', 'a3', 'user', '回退后重问'),
  cc('a5', 'u3', 'assistant', [{ type: 'text', text: '答三。' }]),
  // a task notification: a user line nobody typed
  cc('n1', 'a5', 'user', '<task-notification>\n<summary>Agent finished</summary>\n</task-notification>'),
].join('\n'));
const cx = (type, payload) => L({ timestamp: '2026-07-31T10:00:00.000Z', type, payload });
const cxFile = join(tmp, 'rollout-cx-1.jsonl');
writeFileSync(cxFile, [
  cx('session_meta', { id: 'cx-1', cwd: proj, timestamp: '2026-07-31T10:00:00.000Z' }),
  cx('response_item', { type: 'message', role: 'user', content: [{ type: 'input_text', text: '接登录' }] }),
  cx('response_item', { type: 'custom_tool_call', call_id: 'c1', name: 'apply_patch', input: '*** Begin Patch\n*** Update File: src/a.ts\n@@\n-a\n+b\n*** End Patch' }),
  cx('response_item', { type: 'custom_tool_call_output', call_id: 'c1', output: 'Done' }),
  cx('response_item', { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '接好了。' }] }),
].join('\n'));

const run = (...a) => execFileSync(process.execPath, [CLI, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const events = (file) => run('events', file).trim().split('\n').map((l) => JSON.parse(l));

test('every event carries id, kind, namespaced session, source pointer, basis and completeness', () => {
  const ev = events(ccFile).filter((e) => e.kind !== 'adapter.manifest');
  assert.ok(ev.length > 8);
  for (const e of ev) {
    assert.ok(e.id && e.kind && e.sessionId.startsWith('claude-code:'), JSON.stringify(e).slice(0, 120));
    assert.ok(e.source?.file === ccFile && e.source.ref && e.source.schema);
    assert.ok(['observed', 'reconstructed', 'inferred'].includes(e.basis));
    assert.ok(['full', 'partial', 'unknown'].includes(e.completeness));
    assert.ok(!('turnId' in e) || typeof e.turnId === 'string', 'turnId is a string, never -1');
  }
  assert.equal(events(ccFile)[0].kind, 'adapter.manifest');
});

test('ids are stable across two projections of the same file', () => {
  const a = events(ccFile).map((e) => e.id).join('\n');
  const b = events(ccFile).map((e) => e.id).join('\n');
  assert.equal(a, b);
});

test('a tool call and its result are one atomic pair', () => {
  const ev = events(ccFile);
  const calls = ev.filter((e) => e.kind === 'tool.called');
  const results = ev.filter((e) => e.kind === 'tool.completed');
  // read, edit, and the task notification folded in as an agent arrival
  assert.equal(calls.length, 3); assert.equal(results.length, 3);
  for (const r of results) assert.ok(calls.some((c) => c.id === r.calledEventId), 'result points at its call');
  assert.equal(calls[2].op, 'agent'); assert.deepEqual(calls[2].artifacts, []);
  assert.equal(calls[1].op, 'edit');
  assert.equal(calls[1].change, 'a = 1 → a = 2');
  assert.deepEqual(calls[1].artifacts, [{ id: 'file:///repo/src/a.ts', observedPath: '/repo/src/a.ts' }]);
  assert.equal(calls[1].completeness, 'partial', 'a call excerpt is observed but partial — never upgraded');
});

test('messages carry role, actor and model visibility; the rewind forks the tree; the notification is not a human turn', () => {
  const ev = events(ccFile);
  const q = ev.filter((e) => e.kind === 'message.recorded' && e.role === 'user');
  assert.equal(q.length, 3);
  assert.ok(q.every((m) => m.actor === 'human' && m.modelVisible === true));
  const turns = ev.filter((e) => e.kind === 'turn.started');
  assert.equal(turns.length, 3, 'the notification folded into turn 3, not a fourth turn');
  assert.equal(turns[1].parentTurnId, turns[0].turnId);
  assert.equal(turns[2].parentTurnId, turns[0].turnId, 'rewound turn hangs off the first turn');
  const answers = ev.filter((e) => e.kind === 'message.recorded' && e.role === 'assistant');
  assert.ok(answers.every((m) => m.completeness === 'partial'), 'merged assistant text is declared partial');
});

test('codex projects through the same contract: relative patch paths resolve against cwd', () => {
  const ev = events(cxFile);
  assert.equal(ev[0].runner, 'codex');
  const call = ev.find((e) => e.kind === 'tool.called');
  assert.equal(call.sessionId, 'codex:cx-1');
  assert.deepEqual(call.artifacts, [{ id: 'file:///repo/src/a.ts', observedPath: 'src/a.ts' }]);
  assert.equal(call.change, 'a → b');
});

test('derived touches: one per turn and artifact, strongest op, pointing back at the call', () => {
  const touches = run('events', ccFile, '--touches').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(touches.length, 1);
  assert.equal(touches[0].op, 'edit');
  assert.equal(touches[0].artifact, 'file:///repo/src/a.ts');
  assert.ok(touches[0].derivedFrom.endsWith('/t1'), 'the edit call, not the read');
  assert.equal(touches[0].change, 'a = 1 → a = 2');
  rmSync(tmp, { recursive: true, force: true });
});
