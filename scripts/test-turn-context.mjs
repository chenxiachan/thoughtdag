#!/usr/bin/env node
// What an agent turn hands downstream, and what it spent: each runner's
// importer counts the turn's thinking (Claude Code, Pi and DSH from the
// thinking text, Codex from the running reasoning total in its token_count
// events) and keeps the count, not the text; a turn's tool steps arrive
// switched off, so a question asked below it reads the answer and the one
// line naming the files it touched, and switching the record on brings
// every call and result back. The turn bar reads the same state: solid for
// what goes downstream, hatched for what stays.
//
// Run: node scripts/test-turn-context.mjs
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'tdag-turn-'));
const bundle = join(tmp, 'turn.mjs');
const STUBS = {
  attachments: 'export const attachmentFingerprint = (a) => `${a.name}|${a.size}|${a.content?.substring(0, 100)}`;',
};
await build({
  stdin: {
    contents: `
      export { ClaudeSessionCollector } from './lib/adapters/claude-code-session';
      export { PiSessionCollector } from './lib/adapters/pi-session';
      export { DshSessionCollector } from './lib/adapters/dsh-session';
      export { CodexSessionCollector } from './lib/adapters/codex-session';
      export { turnComposition, thinkingTokens, toolStepIds } from './lib/turn-insight';
      export { buildContext } from './store/context-builder';
      export { countTokens } from './utils';`,
    resolveDir: join(ROOT, 'src'),
    loader: 'ts',
  },
  bundle: true, format: 'esm', platform: 'node', outfile: bundle, logLevel: 'silent',
  define: { 'import.meta.env.VITE_API_BASE': '""', 'import.meta.env.DEV': 'false', 'import.meta.env': '{}' },
  plugins: [{
    name: 'stubs',
    setup(b) {
      b.onResolve({ filter: /\/attachments$/ }, (a) => ({ path: a.path.split('/').pop(), namespace: 'stub' }));
      b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: STUBS[a.path], loader: 'js' }));
    },
  }],
});
const m = await import(pathToFileURL(bundle).href);
rmSync(tmp, { recursive: true, force: true });
const { ClaudeSessionCollector, PiSessionCollector, DshSessionCollector, CodexSessionCollector, turnComposition, thinkingTokens, toolStepIds, buildContext, countTokens } = m;

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : `\n    ${detail}`}`);
};
const feed = (c, lines) => { for (const l of lines) c.feedLine(JSON.stringify(l)); return c; };
const THINK_A = 'First I should look at the parser, then check where the tokens are counted. '.repeat(20);
const THINK_B = 'The read shows the counter; the answer is the estimate. '.repeat(10);
const qaNodes = (built) => built.nodes.filter((n) => n.data.importSource && n.data.stepKind !== 'note');

// ── Claude Code: thinking counted from its text, tools arrive switched off ──
const cc = feed(new ClaudeSessionCollector(), [
  { type: 'user', uuid: 'u1', parentUuid: null, sessionId: 's-cc', cwd: '/w', timestamp: '2026-10-27T10:00:00Z', message: { role: 'user', content: 'Where are tokens counted?' } },
  // one message over two lines, both repeating its usage: 900 billed, the visible part a tool call
  { type: 'assistant', uuid: 'a1', parentUuid: 'u1', sessionId: 's-cc', message: { id: 'm1', role: 'assistant', content: [{ type: 'thinking', thinking: THINK_A, signature: 'x' }], usage: { output_tokens: 900 } } },
  { type: 'assistant', uuid: 'a2', parentUuid: 'a1', sessionId: 's-cc', message: { id: 'm1', role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/w/src/utils.ts' } }], usage: { output_tokens: 900 } } },
  { type: 'user', uuid: 'r1', parentUuid: 'a2', sessionId: 's-cc', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'export function countTokens(text) { /* cjk + latin/4 */ }\n'.repeat(30) }] } },
  // an older line without usage: its thinking summary is all there is to count
  { type: 'assistant', uuid: 'a3', parentUuid: 'r1', sessionId: 's-cc', message: { id: 'm2', role: 'assistant', content: [{ type: 'thinking', thinking: THINK_B, signature: 'y' }, { type: 'text', text: 'In src/utils.ts: CJK one token each, Latin four characters a token.' }] } },
]);
const ccBuilt = cc.toConversation().build();
const [ccTurn] = qaNodes(ccBuilt);
const toolCallVisible = countTokens(JSON.stringify({ file_path: '/w/src/utils.ts' })) + 8;
check('Claude Code: a message\'s thinking is its billed output beyond what it wrote, counted once over its lines; a line without usage falls back to the summary', ccTurn.data.reasoningTokens?.[0] === (900 - toolCallVisible) + countTokens(THINK_B), JSON.stringify(ccTurn.data.reasoningTokens));
check('Claude Code: the thinking text itself is not kept', !JSON.stringify(ccTurn.data).includes('First I should look at the parser'));
const ids = toolStepIds(ccTurn.data);
check('Claude Code: the tool step arrives switched off', ids.length === 1 && ids.every((id) => ccTurn.data.excludedAttachmentIds.includes(id)), JSON.stringify(ccTurn.data.excludedAttachmentIds));

// a question asked below the turn
const child = {
  id: 'child', type: 'thought', position: { x: 0, y: 400 },
  data: { ...ccTurn.data, question: 'And for code blocks?', response: '', responses: [], responseIndex: -1, attachments: [], excludedAttachmentIds: [], includedAttachmentIds: [], importSource: undefined, reasoningTokens: undefined },
};
const graph = (turn) => ({ nodes: [turn, child], edges: [{ id: 'e1', source: turn.id, target: 'child', type: 'smoothstep' }] });
const textOf = (r) => r.messages.map((x) => x.content).join('\n');
const off = textOf(buildContext('child', graph(ccTurn).nodes, graph(ccTurn).edges));
check('switched off: the question below reads the answer', off.includes('CJK one token each'));
check('switched off: it reads which files the turn touched', off.includes('[Files this turn touched in /w') && off.includes('utils.ts'), off.slice(0, 400));
check('switched off: no call or result reaches it', !off.includes('[Execution record') && !off.includes('cjk + latin/4'));
check('thinking never reaches it', !off.includes('look at the parser'));
const onTurn = { ...ccTurn, data: { ...ccTurn.data, excludedAttachmentIds: [] } };
const on = textOf(buildContext('child', graph(onTurn).nodes, graph(onTurn).edges));
check('switched on: the execution record with every result reaches it', on.includes('[Execution record') && on.includes('cjk + latin/4'));
check('switched on: thinking still never reaches it', !on.includes('look at the parser'));

// ── the turn bar reads the same state ──
const cOff = turnComposition(ccTurn.data);
check('bar: a switched-off record is held, none of it forwarded', cOff.toolForwarded === 'none' && cOff.toolForwardedTokens === 0 && cOff.tool > 0);
check('bar: the thinking count shows', cOff.think === ccTurn.data.reasoningTokens[0]);
const cOn = turnComposition(onTurn.data);
check('bar: a switched-on record is all forwarded', cOn.toolForwarded === 'all' && cOn.toolForwardedTokens === cOn.tool);
const twoSteps = { ...ccTurn.data, attachments: [...ccTurn.data.attachments, { ...ccTurn.data.attachments[0], id: 'second' }], excludedAttachmentIds: ['second'] };
const cSome = turnComposition(twoSteps);
check('bar: one step of two forwarded is "some"', cSome.toolForwarded === 'some' && cSome.toolStepsForwarded === 1 && cSome.toolSteps === 2);
check('thinking of a live answer counts from its text, ahead of any stored count', thinkingTokens({ reasonings: [undefined, 'abcdefgh'], reasoningTokens: [500, 999], responseIndex: 1 }) === 2);
check('thinking of an imported version reads the stored count', thinkingTokens({ reasonings: undefined, reasoningTokens: [500], responseIndex: 0 }) === 500);
check('a turn with no tool steps has no bar', turnComposition({ ...ccTurn.data, attachments: [] }) === null);

// ── Pi: thinking blocks ──
const pi = feed(new PiSessionCollector(), [
  { type: 'session', version: 3, id: 'pi-1', timestamp: '2026-10-27T10:00:00.000Z', cwd: '/w' },
  { type: 'message', id: 'u1', parentId: null, message: { role: 'user', content: [{ type: 'text', text: 'List the files' }] } },
  { type: 'message', id: 'a1', parentId: 'u1', message: { role: 'assistant', content: [{ type: 'thinking', thinking: THINK_A }, { type: 'toolCall', id: 'c1', name: 'bash', arguments: { command: 'ls' } }] } },
  { type: 'message', id: 'r1', parentId: 'a1', message: { role: 'toolResult', toolCallId: 'c1', content: [{ type: 'text', text: 'a.ts\nb.ts' }] } },
  { type: 'message', id: 'a2', parentId: 'r1', message: { role: 'assistant', content: [{ type: 'thinking', thinking: THINK_B }, { type: 'text', text: 'Two files.' }], usage: { reasoning: 777 } } },
]);
const [piTurn] = qaNodes(pi.toConversation().build());
check('Pi: the provider\'s reasoning count where recorded, the thinking text elsewhere', piTurn.data.reasoningTokens?.[0] === countTokens(THINK_A) + 777, JSON.stringify(piTurn.data.reasoningTokens));
check('Pi: tool steps arrive switched off', toolStepIds(piTurn.data).every((id) => piTurn.data.excludedAttachmentIds.includes(id)) && toolStepIds(piTurn.data).length === 1);

// ── DSH: reasoning parts ──
const dsh = feed(new DshSessionCollector(), [
  { type: 'session', id: 'session-d1', createdAt: 1, cwd: '/w' },
  { type: 'user/message', seq: 1, time: 1, data: { id: 'm1', source: { kind: 'user' }, content: [{ type: 'text', text: 'What changed?' }] } },
  { type: 'assistant/message', seq: 2, data: { turn: 1, step: 1, message: { id: 'am1', content: [{ type: 'reasoning', text: THINK_A }, { type: 'text', text: 'Nothing yet.' }] } } },
  { type: 'assistant/message', seq: 3, data: { turn: 1, step: 2, message: { id: 'am2', content: [{ type: 'reasoning', text: '' }, { type: 'text', text: 'Done.' }] } } },
]);
const [dshTurn] = qaNodes(dsh.toConversation().build());
check('DSH: reasoning parts counted, empty ones add nothing', dshTurn.data.reasoningTokens?.[0] === countTokens(THINK_A), JSON.stringify(dshTurn.data.reasoningTokens));
check('DSH: the reasoning is not in the answer', !dshTurn.data.response.includes('look at the parser'));

// ── Codex: the running total in token_count events ──
const tc = (total, last) => ({ type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { reasoning_output_tokens: total }, last_token_usage: { reasoning_output_tokens: last } } } });
const codex = feed(new CodexSessionCollector(), [
  { type: 'session_meta', payload: { id: 'cx-1', cwd: '/w', timestamp: '2026-10-27T10:00:00Z' } },
  tc(1000, 1000), // an earlier session's total, before this file's first turn: no turn to own it
  { type: 'turn_context', payload: { turn_id: 't1' } },
  { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Fix the test' }] } },
  { type: 'response_item', payload: { type: 'function_call', name: 'exec_command', call_id: 'c1', arguments: '{"cmd":"npm test"}' } },
  tc(1300, 300),
  tc(1300, 300), // the same event twice: counted once
  { type: 'response_item', payload: { type: 'function_call_output', call_id: 'c1', output: '1 failing' } },
  { type: 'turn_context', payload: { turn_id: 't1b' } }, // a scheduling split: folds back into the turn
  { type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Fixed.' }] } },
  tc(1450, 150),
  { type: 'turn_context', payload: { turn_id: 't2' } },
  { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Thanks' }] } },
  { type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Welcome.' }] } },
  tc(1460, 10),
]);
const cx = qaNodes(codex.toConversation().build());
check('Codex: a turn keeps the reasoning it spent, a split folded back in, a repeated event once', cx[0].data.reasoningTokens?.[0] === 450, JSON.stringify(cx.map((n) => n.data.reasoningTokens)));
check('Codex: the next turn keeps its own', cx[1].data.reasoningTokens?.[0] === 10);
check('Codex: tool steps arrive switched off', toolStepIds(cx[0].data).every((id) => cx[0].data.excludedAttachmentIds.includes(id)) && toolStepIds(cx[0].data).length === 1);
const resumed = feed(new CodexSessionCollector(), [
  { type: 'session_meta', payload: { id: 'cx-2', cwd: '/w', timestamp: '2026-10-27T11:00:00Z' } },
  { type: 'turn_context', payload: { turn_id: 'r1' } },
  { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Continue' }] } },
  { type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'On it.' }] } },
  tc(173000, 40), // a resumed rollout: the total carries earlier files' reasoning
  tc(173060, 60),
]);
const [rs] = qaNodes(resumed.toConversation().build());
check('Codex: a resumed rollout counts its own calls, not the total it opened on', rs.data.reasoningTokens?.[0] === 100, JSON.stringify(rs.data.reasoningTokens));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
