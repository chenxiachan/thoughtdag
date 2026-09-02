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

const cxResumed = join(tmp, 'rollout-cx-2.jsonl');
writeFileSync(cxResumed, [
  cx('session_meta', { id: 'cx-2', cwd: proj, timestamp: '2026-07-31T10:00:00.000Z' }),
  cx('turn_context', { turn_id: 'T1' }),
  cx('response_item', { type: 'message', role: 'user', content: [{ type: 'input_text', text: '第一段' }] }),
  cx('response_item', { type: 'function_call', call_id: 'call-A', name: 'shell', arguments: '{"command":["ls"]}' }),
  cx('response_item', { type: 'function_call_output', call_id: 'call-A', output: 'a.ts' }),
  cx('response_item', { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '第一段答。' }] }),
  cx('compacted', {}),
  cx('turn_context', { turn_id: 'T1' }),
  cx('response_item', { type: 'message', role: 'user', content: [{ type: 'input_text', text: '压缩后再问' }] }),
  cx('response_item', { type: 'function_call', call_id: 'call-B', name: 'shell', arguments: '{"command":["cat a.ts"]}' }),
  cx('response_item', { type: 'function_call_output', call_id: 'call-B', output: 'const a = 1;' }),
  cx('response_item', { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '第二段答。' }] }),
].join('\n'));

// artifact identity: spaces, a paper URL, a page URL, a locator, a relative path with no cwd
const ccArt = join(tmp, 'sid-art.jsonl');
const ccNoCwd = (uuid, parent, type, content) => L({ type, uuid, parentUuid: parent, sessionId: 'sid-art', isSidechain: false, timestamp: '2026-08-21T14:02:00.000Z', message: { role: type, content } });
writeFileSync(ccArt, [
  ccNoCwd('u1', null, 'user', '看材料'),
  ccNoCwd('a1', 'u1', 'assistant', [
    { type: 'tool_use', id: 'k1', name: 'Read', input: { file_path: '/Users/x/My Notes/别说服.md', offset: 10, limit: 5 } },
    { type: 'tool_use', id: 'k2', name: 'Read', input: { file_path: '/Users/x/paper.pdf', pages: '1-5' } },
    { type: 'tool_use', id: 'k3', name: 'WebFetch', input: { url: 'https://arxiv.org/pdf/2410.08900v3.pdf', prompt: 'p' } },
    { type: 'tool_use', id: 'k4', name: 'WebFetch', input: { url: 'https://Docs.Example.com/Guide#top', prompt: 'p' } },
    { type: 'tool_use', id: 'k5', name: 'Read', input: { file_path: 'relative/without/cwd.ts' } },
  ]),
  ccNoCwd('r1', 'a1', 'user', [{ type: 'tool_result', tool_use_id: 'k1', content: 'x' }, { type: 'tool_result', tool_use_id: 'k2', content: 'y' }, { type: 'tool_result', tool_use_id: 'k3', content: 'z' }, { type: 'tool_result', tool_use_id: 'k4', content: 'w' }, { type: 'tool_result', tool_use_id: 'k5', content: 'v' }]),
  ccNoCwd('a2', 'r1', 'assistant', [{ type: 'text', text: '看完了。' }]),
].join('\n'));

const cxFrag2 = join(tmp, 'rollout-cx-1-b.jsonl');
writeFileSync(cxFrag2, [
  cx('session_meta', { id: 'cx-1', cwd: proj, timestamp: '2026-08-01T10:00:00.000Z' }),
  cx('turn_context', { turn_id: 'T7' }),
  cx('response_item', { type: 'message', role: 'user', content: [{ type: 'input_text', text: '第二个文件' }] }),
  cx('response_item', { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '好。' }] }),
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

test('event ids are globally unique, even when a runner reuses its turn id after a compaction', () => {
  for (const file of [ccFile, cxFile, cxResumed]) {
    const ids = events(file).filter((e) => e.kind !== 'adapter.manifest').map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length, `duplicate ids in ${file}`);
  }
  const ev = events(cxResumed);
  const turns = ev.filter((e) => e.kind === 'turn.started');
  assert.equal(turns.length, 2);
  assert.notEqual(turns[0].turnId, turns[1].turnId);
  assert.ok(turns[1].turnId.endsWith('~2'), turns[1].turnId);
  assert.equal(ev.filter((e) => e.kind === 'boundary.compaction').length, 1);
});

test('every tool.completed answers exactly one tool.called, and both point at the runner\'s own call id', () => {
  for (const file of [ccFile, cxFile, cxResumed]) {
    const ev = events(file);
    const calls = ev.filter((e) => e.kind === 'tool.called');
    for (const r of ev.filter((e) => e.kind === 'tool.completed')) {
      const owners = calls.filter((c) => c.id === r.calledEventId);
      assert.equal(owners.length, 1, `${file}: ${r.id} has ${owners.length} calls`);
      assert.equal(owners[0].source.ref, r.source.ref, 'call and result share the native ref');
    }
  }
  const cc = events(ccFile).filter((e) => e.kind === 'tool.called');
  assert.deepEqual(cc.map((c) => c.source.ref), ['t1', 't2', cc[2].source.ref], 'claude-code refs are tool_use ids');
  assert.equal(cc[0].callId, 't1');
  const cxCalls = events(cxResumed).filter((e) => e.kind === 'tool.called');
  assert.deepEqual(cxCalls.map((c) => c.source.ref), ['call-A', 'call-B'], 'codex refs are call_ids');
});

test('artifact identity is canonical and only ever certain', () => {
  const calls = events(ccArt).filter((e) => e.kind === 'tool.called');
  assert.deepEqual(calls[0].artifacts, [{ id: 'file:///Users/x/My%20Notes/%E5%88%AB%E8%AF%B4%E6%9C%8D.md', observedPath: '/Users/x/My Notes/别说服.md', locator: { lines: [10, 14] } }]);
  assert.deepEqual(calls[1].artifacts, [{ id: 'file:///Users/x/paper.pdf', observedPath: '/Users/x/paper.pdf', locator: { pages: '1-5' } }]);
  assert.deepEqual(calls[2].artifacts, [{ id: 'arxiv:2410.08900', observedPath: 'https://arxiv.org/pdf/2410.08900v3.pdf' }]);
  assert.deepEqual(calls[3].artifacts, [{ id: 'https://docs.example.com/Guide', observedPath: 'https://Docs.Example.com/Guide#top' }]);
  assert.deepEqual(calls[4].artifacts, [], 'a relative path with no cwd is not an artifact');
  const touches = run('events', ccArt, '--touches').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(touches.map((t) => [t.artifact, t.op]).sort(), [
    ['arxiv:2410.08900', 'fetch'], ['file:///Users/x/My%20Notes/%E5%88%AB%E8%AF%B4%E6%9C%8D.md', 'read'], ['file:///Users/x/paper.pdf', 'read'], ['https://docs.example.com/Guide', 'fetch'],
  ].sort());
});

test('one logical session in two files: same sessionId, distinct session.started ids, no turn collision', () => {
  const a = events(cxFile); const b = events(cxFrag2);
  const sa = a.find((e) => e.kind === 'session.started'); const sb = b.find((e) => e.kind === 'session.started');
  assert.equal(sa.sessionId, sb.sessionId);
  assert.notEqual(sa.id, sb.id);
  assert.equal(sa.sourceId, cxFile); assert.equal(sb.sourceId, cxFrag2);
  const ids = new Set([...a, ...b].filter((e) => e.kind !== 'adapter.manifest').map((e) => e.id));
  assert.equal(ids.size, a.length + b.length - 2, 'no event id shared across the two fragments');
});

test('touches keep every distinct locator of the turn', () => {
  const touches = run('events', ccArt, '--touches').trim().split('\n').map((l) => JSON.parse(l));
  const pdf = touches.find((t) => t.artifact === 'file:///Users/x/paper.pdf');
  assert.deepEqual(pdf.locators, [{ pages: '1-5' }]);
  const notes = touches.find((t) => t.artifact.endsWith('.md'));
  assert.deepEqual(notes.locators, [{ lines: [10, 14] }]);
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
