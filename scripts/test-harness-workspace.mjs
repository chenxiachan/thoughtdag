#!/usr/bin/env node
// A Harness Agent question that starts a fresh session (#85). The harness
// files a session under a workspace only when it is created with that
// workspace's id; a bare cwd leaves it ungrouped. The plugin
// (dsh/lib/index.js) is mounted on a stand-in host with a workspace registry,
// and each question records the request it sent to session.create:
//   - the workspace's own folder, a symlink to it and a trailing slash all
//     create by the workspace's id (the host stores workspace paths through
//     realpath)
//   - a subfolder, a folder no workspace has and a folder that does not
//     exist create by the folder, as before
//   - no folder sends nothing, and a host without the registry gets the
//     folder
//
// Run: node scripts/test-harness-workspace.mjs
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0, failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'td-ws-')));
const ws = join(tmp, 'project');
const other = join(tmp, 'elsewhere');
mkdirSync(join(ws, 'src'), { recursive: true });
mkdirSync(other);
symlinkSync(ws, join(tmp, 'link'));

// the stand-in host: a registry with one workspace, and a session controller
// that records each create request and stops the turn there
const creates = [];
let apiHandler = null;
let dropRegistry = null;
const noop = () => {};
const ctx = {
  effect: (fn) => fn(),
  on: noop,
  inject: (deps, fn) => {
    if (deps[0] !== 'workspaceRegistry') return;
    const registry = { list: () => [{ id: 'workspace-1', path: ws }] };
    fn({ workspaceRegistry: registry, effect: (f) => { dropRegistry = f(); } });
  },
  logger: { info: noop, warn: noop, error: noop, debug: noop },
  webServer: { register: ({ path, handler }) => { if (path.endsWith('/api')) apiHandler = handler; return noop; } },
  sessionController: { create: async (req) => { creates.push(req); throw new Error('stand-in host: stop after create'); } },
};
const plugin = await import(pathToFileURL(join(ROOT, 'dsh', 'lib', 'index.js')).href);
await plugin.apply(ctx, { whyTools: false, whyPrompt: false });
const host = createServer((req, res) => apiHandler(req, res));
await new Promise((r) => host.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${host.address().port}/thoughtdag/api/claude`;

/** The create request one question sends, for a canvas folder (or none). */
async function createFor(cwd) {
  creates.length = 0;
  await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'harness/agent', messages: [{ role: 'user', content: 'hello' }], ...(cwd !== undefined ? { harness: { cwd } } : {}) }),
  }).then((r) => r.text());
  return creates.length === 1 ? creates[0] : { calls: creates.length };
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

try {
  console.log('A fresh Harness Agent session, by folder');
  let r = await createFor(ws);
  ok("the workspace's folder: created by the workspace's id", same(r, { workspaceId: 'workspace-1' }), JSON.stringify(r));
  r = await createFor(join(tmp, 'link'));
  ok('a symlink to it: the same workspace', same(r, { workspaceId: 'workspace-1' }), JSON.stringify(r));
  r = await createFor(ws + '/');
  ok('a trailing slash: the same workspace', same(r, { workspaceId: 'workspace-1' }), JSON.stringify(r));
  r = await createFor(join(ws, 'src'));
  ok('a subfolder: created by the folder', same(r, { cwd: join(ws, 'src') }), JSON.stringify(r));
  r = await createFor(other);
  ok('a folder no workspace has: created by the folder', same(r, { cwd: other }), JSON.stringify(r));
  r = await createFor(join(tmp, 'gone'));
  ok('a folder that does not exist: created by the folder, for the host to report', same(r, { cwd: join(tmp, 'gone') }), JSON.stringify(r));
  r = await createFor(undefined);
  ok('no folder: nothing sent', same(r, {}), JSON.stringify(r));
  dropRegistry?.();
  r = await createFor(ws);
  ok('a host without the registry: created by the folder', same(r, { cwd: ws }), JSON.stringify(r));
} finally {
  host.close();
  rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
