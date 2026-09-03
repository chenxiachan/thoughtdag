// setup: explicit, reversible, project-scoped for Claude Code; the two rules
// as a marked block; nothing written unless asked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'thoughtdag.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'td-setup-'));
const home = join(tmp, 'fakehome'); const proj = join(tmp, 'proj');
mkdirSync(home, { recursive: true }); mkdirSync(proj, { recursive: true });
writeFileSync(join(proj, 'CLAUDE.md'), '# My project\n\nSome rules of my own.\n');
// an existing codex config with another server must be preserved
mkdirSync(join(home, '.codex'), { recursive: true });
writeFileSync(join(home, '.codex', 'config.toml'), 'model = "gpt"\n\n[mcp_servers.other]\ncommand = "npx"\nargs = ["-y", "other-mcp"]\n');
const env = { ...process.env, HOME: home, THOUGHTDAG_HOME: join(home, '.thoughtdag') };
const run = (...a) => execFileSync(process.execPath, [CLI, ...a], { env, cwd: proj, encoding: 'utf8' });

test('bare setup only reports; nothing is written', () => {
  const out = run('setup');
  assert.match(out, /claude-code mcp \(project\): not registered/); assert.match(out, /codex mcp: not registered/);
  assert.match(out, /CLAUDE\.md: no rules/); assert.match(out, /AGENTS\.md: absent/);
  assert.ok(!existsSync(join(proj, '.mcp.json')));
});

test('setup mcp registers project-scoped for Claude Code and once in the Codex config, keeping what was there', () => {
  run('setup', 'mcp');
  const mcp = JSON.parse(readFileSync(join(proj, '.mcp.json'), 'utf8'));
  assert.ok(mcp.mcpServers.thoughtdag.command); assert.deepEqual(mcp.mcpServers.thoughtdag.args.slice(-1), ['mcp']);
  const toml = readFileSync(join(home, '.codex', 'config.toml'), 'utf8');
  assert.match(toml, /\[mcp_servers\.other\]/); assert.match(toml, /\[mcp_servers\.thoughtdag\]/); assert.match(toml, /args = \[.*"mcp"\]/);
  run('setup', 'mcp');
  assert.equal((readFileSync(join(home, '.codex', 'config.toml'), 'utf8').match(/\[mcp_servers\.thoughtdag\]/g) || []).length, 1, 'idempotent');
  assert.match(run('setup'), /claude-code mcp \(project\): registered/);
});

test('setup rules adds one marked block to CLAUDE.md and AGENTS.md, keeps the user\'s text, is idempotent, and --remove takes it out cleanly', () => {
  run('setup', 'rules');
  const claude = readFileSync(join(proj, 'CLAUDE.md'), 'utf8');
  assert.match(claude, /^# My project\n\nSome rules of my own\.\n\n<!-- thoughtdag:begin -->/);
  assert.match(claude, /thoughtdag why --check <path>/); assert.match(claude, /<!-- thoughtdag:end -->\n$/);
  const agents = readFileSync(join(proj, 'AGENTS.md'), 'utf8');
  assert.match(agents, /^<!-- thoughtdag:begin -->/);
  run('setup', 'rules');
  assert.equal((readFileSync(join(proj, 'CLAUDE.md'), 'utf8').match(/thoughtdag:begin/g) || []).length, 1, 'idempotent');
  run('setup', 'rules', '--remove');
  assert.equal(readFileSync(join(proj, 'CLAUDE.md'), 'utf8'), '# My project\n\nSome rules of my own.\n', 'the user\'s file is exactly as it was');
  assert.ok(!readFileSync(join(proj, 'AGENTS.md'), 'utf8').includes('thoughtdag'));
  rmSync(tmp, { recursive: true, force: true });
});
