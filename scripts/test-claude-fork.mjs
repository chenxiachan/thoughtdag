#!/usr/bin/env node
// A Claude Code question asked off an earlier turn branches the session at
// that turn (#89). Checked on two layers, neither reaching a real model:
//   1. the canvas's route (src/lib/agents/agent-runtime.ts, agentOutbound),
//      on a canvas mirroring a four-turn session A → B → C → D: off the tail
//      it continues the session; off B it resumes the session at B's last
//      entry under a new id; a second input, another runtime, a delegated
//      run, a turn without entries, another working directory or a missing
//      session file get a fresh session, as before; a canvas without a
//      ledger still branches, and a branch's own tail continues the branch
//   2. the runtime (runtime/agents/claude.cjs) against a stand-in `claude`:
//      a branch passes --resume, --resume-session-at and --fork-session, a
//      plain continuation only --resume, and a refused run names its reason
//      (the CLI's `errors`, or its last stderr line when it printed no result)
//
// Run: node scripts/test-claude-fork.mjs
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0, checks = 0;
const ok = (name, cond, extra = '') => { checks++; if (!cond) failures++; console.log(`${cond ? 'ok  ' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'tdag-ccfork-')));

// ── 1. the canvas's route ──
const STUBS = {
  'store': 'export const useStore = { getState: () => globalThis.__canvas, setState: () => {} };',
  'projects': 'export const useProjects = { getState: () => globalThis.__projects };',
  'ui-store': 'export const useUiStore = { getState: () => ({}) };',
  'dsh-bridge': 'export const currentDshSession = () => null;',
  'adapters': 'export {};',
  'attachment-vault': 'export {};',
};
const bundle = join(tmp, 'route.mjs');
await build({
  entryPoints: [join(ROOT, 'src/lib/agents/agent-runtime.ts')],
  bundle: true, format: 'esm', platform: 'node', outfile: bundle, logLevel: 'silent',
  define: { 'import.meta.env.DEV': 'false' },
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /^\.\.?\/.*(store|projects|ui-store|dsh-bridge|adapters|attachment-vault)$/ }, (a) => ({ path: a.path.split('/').pop(), namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: STUBS[a.path], loader: 'js' }));
  } }],
});
const { agentOutbound } = await import(pathToFileURL(bundle).href);

const CWD = '/work/project';
const WS = '/td/workspaces/p1';
const PROJ = '/home/.claude/projects';
const S = '11111111-1111-4111-8111-111111111111';
const F = '22222222-2222-4222-8222-222222222222';
const turn = (id, items, extra = {}) => ({ id, data: { question: id, response: id, importSource: { runner: 'claude-code', sessionId: S, itemIds: items, cwd: CWD }, ...extra } });
const files = [`-work-project/${S}.jsonl`];
const edge = (source, target) => ({ id: `${source}-${target}`, source, target });
function canvas({ extraNodes = [], extraEdges = [], ledger = true, agentCwd, sessionFiles = files } = {}) {
  const nodes = [turn('A', ['a-u', 'a-1']), turn('B', ['b-u', 'b-1', 'b-2']), turn('C', ['c-u', 'c-1']), turn('D', ['d-u', 'd-1']), { id: 'N', data: { question: 'new', response: '' } }, ...extraNodes];
  const edges = [edge('A', 'B'), edge('B', 'C'), edge('C', 'D'), ...extraEdges];
  globalThis.__canvas = { nodes, edges };
  const ss = { sessionId: S, runner: 'claude-code', importedCount: 4, tailNodeId: 'D', chapters: [{ sessionId: F, runner: 'claude-code', importedCount: 3, tailNodeId: 'G' }] };
  globalThis.__projects = { activeId: 'p1', projects: [{ id: 'p1', ...(ledger ? { sourceSession: ss } : {}), ...(agentCwd ? { agentCwd } : {}) }] };
  globalThis.window = {
    desktopAgents: { workspace: async () => WS },
    desktopSessions: { roots: async () => [{ key: 'claude-projects', path: PROJ }], list: async () => sessionFiles.map((rel) => ({ rel })) },
  };
}
const CC = 'claude/claude-code/opus';
const asked = async (parents, model = CC, opts = {}) => {
  canvas({ ...opts, extraEdges: [...(opts.extraEdges ?? []), ...parents.map((p) => edge(p, 'N'))] });
  return agentOutbound(model, 'N');
};
const show = (r) => JSON.stringify(r);
const fresh = (r, cwd = CWD) => !!r && r.cwd === cwd && !r.sessionPath && !r.forkEntryId && !r.continue;

let r = await asked(['D']);
ok('off the tail: continues the session', r?.continue === true && r.sessionPath === `${PROJ}/-work-project/${S}.jsonl` && !r.forkEntryId && r.cwd === CWD, show(r));
r = await asked(['B']);
ok('off B: branches at B\'s last entry', r?.continue === true && r.forkEntryId === 'b-2' && r.sessionPath === `${PROJ}/-work-project/${S}.jsonl` && r.cwd === CWD, show(r));
r = await asked(['B', 'A']);
ok('two inputs: a fresh session', fresh(r), show(r));
r = await asked(['B'], 'codex/gpt-5');
ok('another runtime off B: a fresh session', fresh(r), show(r));
r = await asked(['P'], 'pi/anthropic/x', { extraNodes: [{ id: 'P', data: { question: 'p', response: 'p', importSource: { runner: 'pi', sessionId: S, itemIds: ['p-1', 'p-2'], cwd: CWD } } }] });
ok('a Pi turn further up: a fresh session (only Claude Code branches)', fresh(r), show(r));
r = await asked(['K'], CC, { extraNodes: [{ id: 'K', data: { question: 'k', response: 'k', importSource: { runner: 'claude-code', sessionId: S, itemIds: ['toolu_1'], cwd: CWD, subagent: { agent: 'Explore', of: 'b-u' } } } }] });
ok('a delegated run: a fresh session', fresh(r), show(r));
r = await asked(['E'], CC, { extraNodes: [turn('E', [])] });
ok('a turn without entries yet: a fresh session', fresh(r), show(r));
r = await asked(['B'], CC, { agentCwd: '/elsewhere' });
ok('the canvas works in another directory: a fresh session there', fresh(r, '/elsewhere'), show(r));
r = await asked(['B'], CC, { sessionFiles: [] });
ok('no session file: a fresh session', fresh(r), show(r));
r = await asked(['B'], CC, { ledger: false });
ok('a canvas without a ledger still branches', r?.forkEntryId === 'b-2' && r.continue === true, show(r));
r = await asked(['G'], CC, {
  extraNodes: [{ id: 'G', data: { question: 'g', response: 'g', agentSession: { runtime: 'claude-code', sessionId: F, sessionFile: `${PROJ}/-work-project/${F}.jsonl`, cwd: CWD, continued: true, forked: true }, importSource: { runner: 'claude-code', sessionId: F, itemIds: ['g-u', 'g-1'], cwd: CWD } } }],
  extraEdges: [edge('B', 'G')],
});
ok('off a branch\'s own tail: continues the branch', r?.continue === true && !r.forkEntryId && r.sessionPath === `${PROJ}/-work-project/${F}.jsonl`, show(r));

// ── 2. the runtime against a stand-in claude ──
const home = join(tmp, 'home');
const bin = join(tmp, 'bin');
const work = join(tmp, 'work');
for (const d of [home, bin, work]) mkdirSync(d, { recursive: true });
const argvLog = join(tmp, 'argv.json');
const NEW = '33333333-3333-4333-8333-333333333333';
writeFileSync(join(bin, 'claude'), `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.writeFileSync(${JSON.stringify(argvLog)}, JSON.stringify(args));
const at = args[args.indexOf('--resume-session-at') + 1];
if (args.includes('--resume-session-at') && process.env.STANDIN_OLD) { process.stderr.write("error: unknown option '--resume-session-at'\\n"); process.exit(1); }
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
out({ type: 'system', subtype: 'init', session_id: ${JSON.stringify(NEW)} });
if (at === 'missing') { out({ type: 'result', subtype: 'error_during_execution', is_error: true, errors: ['No message found with message.uuid of: missing'] }); process.stderr.write('No message found with message.uuid of: missing\\n'); process.exit(1); }
process.stdin.once('data', () => { out({ type: 'result', subtype: 'success', result: 'ok' }); process.exit(0); });
`);
chmodSync(join(bin, 'claude'), 0o755);
process.env.HOME = home;
process.env.PATH = `${bin}:${process.env.PATH}`;
const require = createRequire(import.meta.url);
const { createClaudeRuntime } = require(join(ROOT, 'runtime/agents/claude.cjs'));
const rt = createClaudeRuntime();
const run = (req, env = {}) => new Promise((resolve) => {
  Object.assign(process.env, env);
  const events = [];
  void rt.run({ cwd: work, prompt: 'q', model: { provider: 'claude-code', id: 'haiku' }, ...req }, ({ event }) => {
    events.push(event);
    if (event.type === 'run_end') { for (const k of Object.keys(env)) delete process.env[k]; resolve({ events, argv: JSON.parse(readFileSync(argvLog, 'utf8')) }); }
  });
});
const flag = (argv, name) => { const i = argv.indexOf(name); return i < 0 ? null : (argv[i + 1] ?? ''); };

let out = await run({ sessionPath: `/x/-work/${S}.jsonl`, forkEntryId: 'b-2' });
ok('a branch resumes at the entry under a new id', flag(out.argv, '--resume') === S && flag(out.argv, '--resume-session-at') === 'b-2' && out.argv.includes('--fork-session'), out.argv.join(' '));
ok('the branch names its new session', out.events.some((e) => e.type === 'session' && e.sessionId === NEW));
out = await run({ sessionPath: `/x/-work/${S}.jsonl` });
ok('a continuation resumes the session as it is', flag(out.argv, '--resume') === S && !out.argv.includes('--resume-session-at') && !out.argv.includes('--fork-session'), out.argv.join(' '));
out = await run({ sessionPath: `/x/-work/${S}.jsonl`, forkEntryId: 'missing' });
let err = out.events.find((e) => e.type === 'run_error');
ok('an entry the transcript lacks: the error names it', /No message found/.test(err?.message ?? ''), err?.message);
out = await run({ sessionPath: `/x/-work/${S}.jsonl`, forkEntryId: 'b-2' }, { STANDIN_OLD: '1' });
err = out.events.find((e) => e.type === 'run_error');
ok('a CLI without the flag: the error carries its words', /unknown option '--resume-session-at'/.test(err?.message ?? ''), err?.message);
rt.shutdown();

rmSync(tmp, { recursive: true, force: true });
console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
