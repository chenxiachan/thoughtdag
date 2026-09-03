// The MCP face: the same four questions as tools over stdio JSON-RPC,
// read-only, frames only on stdout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'thoughtdag.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'td-mcp-'));
const ccRoot = join(tmp, 'claude'); const home = join(tmp, 'home'); const proj = join(tmp, 'proj');
mkdirSync(join(ccRoot, 'proj'), { recursive: true }); mkdirSync(proj, { recursive: true });
const L = (o) => JSON.stringify(o);
const cc = (uuid, parent, type, content) => L({ type, uuid, parentUuid: parent, sessionId: 'sid-m', cwd: proj, isSidechain: false, timestamp: '2026-08-21T14:02:00.000Z', message: { role: type, content } });
writeFileSync(join(ccRoot, 'proj', 'sid-m.jsonl'), [
  cc('u1', null, 'user', '给 api.ts 加重试'),
  cc('a1', 'u1', 'assistant', [{ type: 'tool_use', id: 't1', name: 'Edit', input: { file_path: `${proj}/src/api.ts`, old_string: 'x = 1', new_string: 'x = retry(1)' } }]),
  cc('r1', 'a1', 'user', [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }]),
  cc('a2', 'r1', 'assistant', [{ type: 'text', text: '加好了。\n\n重试用指数退避，三次为限。' }]),
].join('\n'));
const env = { ...process.env, THOUGHTDAG_HOME: home, THOUGHTDAG_SESSION_ROOTS: ccRoot, THOUGHTDAG_CANVAS_ROOTS: join(tmp, 'none') };
execFileSync(process.execPath, [CLI, 'index'], { env, cwd: proj, stdio: 'ignore' });

/** drive the server: send frames, collect responses by id */
function session(frames) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, 'mcp'], { env, cwd: proj });
    let out = ''; let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', () => {
      const msgs = out.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return { badFrame: l }; } });
      resolve({ msgs, err });
    });
    child.on('error', reject);
    for (const f of frames) child.stdin.write(`${JSON.stringify(f)}\n`);
    child.stdin.end();
  });
}

test('initialize, list, call: frames only on stdout, tools are the four read-only questions', async () => {
  const { msgs } = await session([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'ping' },
    { jsonrpc: '2.0', id: 4, method: 'resources/list' },
  ]);
  assert.ok(msgs.every((m) => !m.badFrame), 'every stdout line is a JSON frame');
  const init = msgs.find((m) => m.id === 1); assert.equal(init.result.serverInfo.name, 'thoughtdag'); assert.deepEqual(init.result.capabilities, { tools: {} });
  const list = msgs.find((m) => m.id === 2); assert.deepEqual(list.result.tools.map((t) => t.name), ['why_check', 'why_file', 'find', 'recall_turn']);
  assert.deepEqual(msgs.find((m) => m.id === 3).result, {});
  assert.equal(msgs.find((m) => m.id === 4).error.code, -32601);
});

test('the tools answer with the same text the CLI prints', async () => {
  const { msgs } = await session([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'why_check', arguments: { path: 'src/api.ts' } } },
    { jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'why_file', arguments: { path: 'src/api.ts' } } },
    { jsonrpc: '2.0', id: 12, method: 'tools/call', params: { name: 'find', arguments: { phrase: '指数退避' } } },
    { jsonrpc: '2.0', id: 13, method: 'tools/call', params: { name: 'recall_turn', arguments: { session: 'sid-m', turn: 0 } } },
    { jsonrpc: '2.0', id: 14, method: 'tools/call', params: { name: 'why_check', arguments: { path: 'src/nothing.ts' } } },
    { jsonrpc: '2.0', id: 15, method: 'tools/call', params: { name: 'nope', arguments: {} } },
  ]);
  const text = (id) => msgs.find((m) => m.id === id).result.content[0].text;
  assert.match(text(10), /^src\/api\.ts: 1 turn in 1 session · 1 edit\/write/);
  assert.match(text(11), /why src\/api\.ts  ·  1 turn in 1 session/); assert.match(text(11), /Δ x = 1 → x = retry\(1\)/); assert.match(text(11), /not a verified reason/);
  assert.match(text(12), /A: .*指数退避/);
  assert.match(text(13), /## Question\n\n给 api\.ts 加重试/);
  assert.equal(text(14), 'src/nothing.ts: no history');
  assert.equal(msgs.find((m) => m.id === 15).result.isError, true);
  rmSync(tmp, { recursive: true, force: true });
});
