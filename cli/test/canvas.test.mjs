// The canvas is a source too — and the contract's acid test: hand-made
// turns, wires, materials with page anchors, a person's edits and marks,
// mirrored turns that must not be counted twice, and what each request
// was actually built from.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'thoughtdag.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'td-canvas-'));
const ccRoot = join(tmp, 'claude'); const canvasRoot = join(tmp, 'canvases'); const home = join(tmp, 'home');
mkdirSync(join(ccRoot, 'proj'), { recursive: true }); mkdirSync(canvasRoot, { recursive: true });
const proj = join(tmp, 'proj'); mkdirSync(proj, { recursive: true });
const L = (o) => JSON.stringify(o);

// the runner session a canvas node mirrors
const cc = (uuid, parent, type, content) => L({ type, uuid, parentUuid: parent, sessionId: 'sid-1', cwd: proj, isSidechain: false, timestamp: '2026-08-21T14:02:00.000Z', message: { role: type, content } });
writeFileSync(join(ccRoot, 'proj', 'sid-1.jsonl'), [
  cc('u1', null, 'user', '免费档模型一用就崩'),
  cc('a1', 'u1', 'assistant', [{ type: 'tool_use', id: 't1', name: 'Edit', input: { file_path: `${proj}/src/api.ts`, old_string: 'x = 1', new_string: 'x = 2' } }]),
  cc('r1', 'a1', 'user', [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }]),
  cc('a2', 'r1', 'assistant', [{ type: 'text', text: '修好了。' }]),
].join('\n'));

const node = (id, data, extra = {}) => ({ id, type: 'thought', position: { x: 0, y: 0 }, data: {
  question: '', response: '', responses: [data.response ?? ''], responseIndex: 0, isCollapsed: true, isEditing: false, isEditingResponse: false, isLoading: false,
  tokenCount: 1, highlights: [], attachments: [], ...data }, ...extra });
const canvas = {
  version: 1, name: '脉冲网络综述', exportedAt: '2026-09-01T10:00:00.000Z',
  nodes: [
    node('n1', { question: 'surrogate gradient 的核心思想是什么', response: '第一段。\n\n它用可导的近似替代不可导的脉冲函数。', createdAt: '2026-08-30T09:00:00.000Z', lastGeneratedAt: '2026-08-30T09:01:00.000Z', generatedBy: ['glm-5.3-flash'], lastContextHash: 'abc123',
      attachments: [{ id: 'att-1', name: 'snn-review.pdf', type: 'application/pdf', size: 1000, content: '', addedAt: '2026-08-30T08:59:00.000Z' }], anchor: { page: 7, attId: 'att-1' },
      highlights: [{ id: 'h1', text: '可导的近似', at: '2026-08-30T09:05:00.000Z' }], highlightMode: 'tag',
      references: [{ title: 'Neftci 2019', url: 'https://arxiv.org/abs/1901.09948' }] }),
    node('n2', { question: '那 STDP 呢', response: '第二段。\n\n它是局部的、无监督的时序规则。', createdAt: '2026-08-30T09:10:00.000Z', lastContextHash: 'def456' }),
    node('m1', { question: '免费档模型一用就崩（我改过）', response: '修好了。', importSource: { runner: 'claude-code', sessionId: 'sid-1', itemIds: ['u1', 'a1'], cwd: proj }, source: { question: '免费档模型一用就崩', response: '修好了。' } }),
  ],
  edges: [
    { id: 'e1', source: 'n1', target: 'n2', type: 'smoothstep' },
    { id: 'e2', source: 'm1', target: 'n2', type: 'smoothstep', data: { isCrossLink: true } },
  ],
  events: [
    { t: '2026-08-30T09:00:30.000Z', op: 'ask', id: 'n1', d: { chars: 20 } },
    { t: '2026-08-30T09:10:05.000Z', op: 'commit', id: 'n2', d: { ctx: 'h-req-2', n: 4, m: 'n1,m1' } },
  ],
};
const canvasFile = join(canvasRoot, '脉冲网络综述.thoughtdag.json');
writeFileSync(canvasFile, JSON.stringify(canvas));

const env = { ...process.env, THOUGHTDAG_HOME: home, THOUGHTDAG_SESSION_ROOTS: ccRoot, THOUGHTDAG_CANVAS_ROOTS: canvasRoot };
const run = (...a) => execFileSync(process.execPath, [CLI, ...a], { env, cwd: proj, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const events = (file) => run('events', file).trim().split('\n').map((l) => JSON.parse(l));

test('a canvas backup projects onto the contract with its own runner and manifest', () => {
  const ev = events(canvasFile);
  assert.equal(ev[0].kind, 'adapter.manifest'); assert.equal(ev[0].runner, 'thoughtdag');
  const s = ev.find((e) => e.kind === 'session.started');
  assert.equal(s.sessionId, 'thoughtdag:脉冲网络综述'); assert.equal(s.title, '脉冲网络综述'); assert.equal(s.sourceId, canvasFile);
  const ids = ev.filter((e) => e.kind !== 'adapter.manifest').map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, 'unique ids');
});

test('hand-made turns carry their messages; a mirrored turn is placed, not restated', () => {
  const ev = events(canvasFile);
  const turns = ev.filter((e) => e.kind === 'turn.started');
  assert.equal(turns.length, 3);
  const m1 = turns.find((t) => t.turnId.endsWith('#m1'));
  assert.deepEqual(m1.mirrorOf, { sessionId: 'claude-code:sid-1', item: 'u1' });
  assert.ok(!ev.some((e) => e.kind === 'message.recorded' && e.turnId.endsWith('#m1') && e.role !== 'custom'), 'no restated text for the mirror');
  const q1 = ev.find((e) => e.kind === 'message.recorded' && e.turnId.endsWith('#n1') && e.role === 'user');
  assert.equal(q1.actor, 'human'); assert.equal(q1.modelVisible, true);
  const a1 = ev.find((e) => e.kind === 'message.recorded' && e.turnId.endsWith('#n1') && e.role === 'assistant');
  assert.equal(a1.actor, 'model');
});

test('wires are context edges, mainline or reference — never time order', () => {
  const ev = events(canvasFile);
  const edges = ev.filter((e) => e.kind === 'edge.recorded');
  assert.equal(edges.length, 2);
  assert.ok(edges.every((e) => e.edgeType === 'context'));
  assert.equal(edges.find((e) => e.fromTurnId.endsWith('#n1')).via, 'mainline');
  assert.equal(edges.find((e) => e.fromTurnId.endsWith('#m1')).via, 'reference');
});

test('materials, marks and edits are facts: attachment with its page, cited paper, highlight visibility, edited mirror', () => {
  const ev = events(canvasFile);
  const att = ev.find((e) => e.kind === 'artifact.attached' && e.via === 'attachment');
  assert.deepEqual(att.artifact, { id: 'thoughtdag:attachment/att-1', observedPath: 'snn-review.pdf', locator: { pages: '7' } });
  assert.equal(att.inContext, true); assert.equal(att.mediaType, 'application/pdf');
  const ref = ev.find((e) => e.kind === 'artifact.attached' && e.via === 'reference');
  assert.equal(ref.artifact.id, 'arxiv:1901.09948');
  const hl = ev.find((e) => e.kind === 'message.recorded' && e.role === 'custom');
  assert.equal(hl.actor, 'human'); assert.equal(hl.modelVisible, true, 'tag mode: the mark shapes the request');
  const edit = ev.find((e) => e.kind === 'record.edited');
  assert.equal(edit.field, 'question'); assert.ok(edit.turnId.endsWith('#m1'));
});

test('context.committed: exact from a logged commit, upstream-only from the older fingerprint', () => {
  const ev = events(canvasFile);
  const commits = ev.filter((e) => e.kind === 'context.committed');
  const exact = commits.find((c) => c.hashOf === 'request');
  assert.equal(exact.contentHash, 'h-req-2'); assert.equal(exact.completeness, 'full'); assert.equal(exact.basis, 'observed');
  assert.deepEqual(exact.members, [{ nodeId: 'n1' }, { nodeId: 'm1' }]);
  const partial = commits.filter((c) => c.hashOf === 'upstream');
  assert.equal(partial.length, 2);
  assert.ok(partial.every((c) => c.completeness === 'partial' && c.members.length === 0));
});

test('indexed together, a mirrored turn counts once and the canvas answers why for its materials', () => {
  const out = run('index');
  assert.match(out, /indexed 2 sessions/);
  const why = run('why', `${proj}/src/api.ts`);
  assert.match(why.split('\n')[0], /1 turn in 1 session/, 'the mirror does not double the runner turn');
  const pdf = run('why', 'snn-review.pdf');
  assert.match(pdf.split('\n')[0], /why snn-review\.pdf  \(thoughtdag:attachment\/att-1\)  ·  1 turn in 1 session/);
  assert.match(pdf, /📎 attach\s+#0  p\.7/);
  assert.match(pdf, /thoughtdag  「脉冲网络综述」/);
  assert.match(pdf, /≈ 它用可导的近似替代不可导的脉冲函数/);
  const paper = run('why', 'arxiv:1901.09948');
  assert.match(paper.split('\n')[0], /1 turn in 1 session/);
  const facts = JSON.parse(readFileSync(join(home, 'fact-index.json'), 'utf8'));
  assert.ok(!JSON.stringify(facts).includes('它用可导的近似'), 'facts hold no answer text');
});

test('recall reads a canvas turn from the backup', () => {
  const rec = run('recall', '脉冲网络综述', '0');
  assert.ok(rec.includes('surrogate gradient') && rec.includes('它用可导的近似'), rec.slice(0, 200));
  rmSync(tmp, { recursive: true, force: true });
});
