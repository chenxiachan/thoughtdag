#!/usr/bin/env node
// thoughtdag — the command line and the MCP server over the why layer in
// ./lib.ts (see there for the stores, the index and the four questions).
import { promises as fsp, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
import os from 'node:os';
import { deriveTouches } from '../../src/lib/events/project';
import {
  HOME,
  FACT_FILE,
  CACHE_FILE,
  TEXT_FILE,
  TEXT_LINES,
  LEGACY_FILE,
  zstdSkipped,
  eventsOf,
  LOCK_FILE,
  loadFacts,
  loadCache,
  buildIndex,
  ensureFresh,
  artifactsLine,
  summarize,
  resolveQuery,
  hitsFor,
  renderWhy,
  findHits,
  renderFind,
  factsForCheck,
  renderCheck,
  renderRecall,
  CLI_VERSION,
  MCP_TOOLS,
  mcpCall,
} from './lib';

async function serveMcp(): Promise<void> {
  const send = (msg: unknown): void => { process.stdout.write(`${JSON.stringify(msg)}\n`); };
  const rl = createInterface({ input: process.stdin });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let req: { id?: unknown; method?: string; params?: Record<string, unknown> };
    try { req = JSON.parse(line) as typeof req; } catch { continue; }
    const { id, method, params } = req;
    if (method === 'notifications/initialized' || method === 'notifications/cancelled') continue;
    if (id === undefined) continue; // a notification we do not handle
    try {
      if (method === 'initialize') {
        send({ jsonrpc: '2.0', id, result: { protocolVersion: (params?.protocolVersion as string) ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'thoughtdag', version: CLI_VERSION } } });
      } else if (method === 'ping') {
        send({ jsonrpc: '2.0', id, result: {} });
      } else if (method === 'tools/list') {
        send({ jsonrpc: '2.0', id, result: { tools: MCP_TOOLS } });
      } else if (method === 'tools/call') {
        const name = String(params?.name ?? '');
        const args = (params?.arguments as Record<string, unknown>) ?? {};
        try {
          const text = await mcpCall(name, args);
          send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } });
        } catch (err) {
          send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }], isError: true } });
        }
      } else {
        send({ jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${method}` } });
      }
    } catch (err) {
      send({ jsonrpc: '2.0', id, error: { code: -32603, message: err instanceof Error ? err.message : String(err) } });
    }
  }
}

// ─── setup: MCP registration and the two rules, explicit and reversible ──
//
// `setup mcp` registers the server for Claude Code in THIS project's
// .mcp.json (project scope) and for Codex in ~/.codex/config.toml (the
// only place Codex reads). `setup rules` appends a marked block to this
// project's CLAUDE.md and AGENTS.md; --remove takes it out. Nothing is
// written globally for Claude Code, nothing is written without being asked.

const RULES_BEGIN = '<!-- thoughtdag:begin -->';
const RULES_END = '<!-- thoughtdag:end -->';
const RULES_BLOCK = `${RULES_BEGIN}
## ThoughtDAG (the why layer)
- Before editing a file, run \`thoughtdag why --check <path>\` (or the why_check tool). If it reports history, run \`thoughtdag why <path>\` and read what shaped the file before changing it.
- When asked why code is the way it is, query first — \`thoughtdag why <path>\`, \`thoughtdag find "<words>"\` — then read the code.
${RULES_END}
`;

/** How to start the server from a config file: the PATH command when
 *  installed, else node plus this very file. */
function mcpCommand(): { command: string; args: string[] } {
  const onPath = (process.env.PATH ?? '').split(path.delimiter).some((d) => { try { return !!d && statSync(path.join(d, 'thoughtdag')).isFile(); } catch { return false; } });
  return onPath ? { command: 'thoughtdag', args: ['mcp'] } : { command: process.execPath, args: [process.argv[1], 'mcp'] };
}

async function setupMcp(): Promise<string[]> {
  const notes: string[] = [];
  const cmd = mcpCommand();
  // Claude Code: project-scoped .mcp.json
  const mcpJson = path.join(process.cwd(), '.mcp.json');
  let cfg: { mcpServers?: Record<string, unknown> } = {};
  try { cfg = JSON.parse(await fsp.readFile(mcpJson, 'utf8')) as typeof cfg; } catch { /* new file */ }
  cfg.mcpServers = { ...(cfg.mcpServers ?? {}), thoughtdag: { command: cmd.command, args: cmd.args } };
  await fsp.writeFile(mcpJson, `${JSON.stringify(cfg, null, 2)}\n`);
  notes.push(`claude-code: registered in ${mcpJson} (project scope)`);
  // Codex: ~/.codex/config.toml, a marked block, once
  const codexCfg = path.join(os.homedir(), '.codex', 'config.toml');
  let toml = '';
  try { toml = await fsp.readFile(codexCfg, 'utf8'); } catch { /* new file */ }
  if (!/^\[mcp_servers\.thoughtdag\]/m.test(toml)) {
    const block = `\n# thoughtdag — the why layer (added by \`thoughtdag setup mcp\`)\n[mcp_servers.thoughtdag]\ncommand = ${JSON.stringify(cmd.command)}\nargs = ${JSON.stringify(cmd.args)}\n`;
    await fsp.mkdir(path.dirname(codexCfg), { recursive: true });
    await fsp.writeFile(codexCfg, `${toml.replace(/\s*$/, '')}${toml.trim() ? '\n' : ''}${block}`);
    notes.push(`codex: registered in ${codexCfg}`);
  } else notes.push(`codex: already registered in ${codexCfg}`);
  return notes;
}

async function setupRules(remove: boolean): Promise<string[]> {
  const notes: string[] = [];
  for (const name of ['CLAUDE.md', 'AGENTS.md']) {
    const file = path.join(process.cwd(), name);
    let text = '';
    try { text = await fsp.readFile(file, 'utf8'); } catch { if (remove) { notes.push(`${name}: absent`); continue; } }
    const has = text.includes(RULES_BEGIN);
    if (remove) {
      if (!has) { notes.push(`${name}: no thoughtdag block`); continue; }
      const stripped = text.replace(new RegExp(`\\n?${RULES_BEGIN}[\\s\\S]*?${RULES_END}\\n?`), '\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '\n');
      await fsp.writeFile(file, stripped);
      notes.push(`${name}: thoughtdag block removed`);
    } else {
      if (has) { notes.push(`${name}: already has the thoughtdag block`); continue; }
      await fsp.writeFile(file, `${text.replace(/\s*$/, '')}${text.trim() ? '\n\n' : ''}${RULES_BLOCK}`);
      notes.push(`${name}: thoughtdag block added`);
    }
  }
  return notes;
}

async function setupStatus(): Promise<string[]> {
  const notes: string[] = [];
  try { const c = JSON.parse(await fsp.readFile(path.join(process.cwd(), '.mcp.json'), 'utf8')) as { mcpServers?: Record<string, unknown> }; notes.push(`claude-code mcp (project): ${c.mcpServers?.thoughtdag ? 'registered' : 'not registered'}`); } catch { notes.push('claude-code mcp (project): not registered'); }
  try { const t = await fsp.readFile(path.join(os.homedir(), '.codex', 'config.toml'), 'utf8'); notes.push(`codex mcp: ${/^\[mcp_servers\.thoughtdag\]/m.test(t) ? 'registered' : 'not registered'}`); } catch { notes.push('codex mcp: not registered'); }
  for (const name of ['CLAUDE.md', 'AGENTS.md']) {
    try { const t = await fsp.readFile(path.join(process.cwd(), name), 'utf8'); notes.push(`${name}: ${t.includes(RULES_BEGIN) ? 'rules present' : 'no rules'}`); } catch { notes.push(`${name}: absent`); }
  }
  return notes;
}

// ─── main ────────────────────────────────────────────────────────────

const USAGE = `thoughtdag — the why layer

  thoughtdag index [--full] [--canvas <dir>]       build or refresh the index (--canvas: also read canvas backups in <dir>, remembered)
  thoughtdag why <path> [--include-read] [--all] [--limit N] [--json]
                                                   the turns that touched a file, and what they said
  thoughtdag why --check <path> [--fresh] [--json]  one line: is there history here? exit 0 yes, 1 no (cheap; refreshes only a stale index)
  thoughtdag find "<phrase>" [--in q|a|m] [--limit N] [--json]
                                                   the turns where those words were asked (Q), answered (A) or attached (M)
  thoughtdag recall <session> <n>                  one turn in full (session id or prefix)
  thoughtdag status                                what the index holds, and how much is evidence
  thoughtdag purge [--cache]                       delete everything this tool stored (--cache: only the interpretation and text caches)
  thoughtdag events <session-file> [--touches]     the canonical events of one source file, one JSON per line
  thoughtdag mcp                                   serve why_check / why_file / find / recall_turn over MCP (stdio, read-only)
  thoughtdag setup [mcp | rules [--remove]]        register the MCP server (this project + Codex), add/remove the two rules in this project's CLAUDE.md and AGENTS.md; bare: show status
`;

async function main(argv: string[]): Promise<void> {
  const [cmd, ...rest] = argv;
  const flag = (name: string): boolean => rest.includes(`--${name}`);
  const value = (name: string): string | undefined => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : undefined; };
  const args = rest.filter((a, i) => !a.startsWith('--') && !(i > 0 && (rest[i - 1] === '--limit' || rest[i - 1] === '--canvas' || rest[i - 1] === '--in')));

  if (cmd === 'index') {
    const r = await buildIndex(flag('full'), value('canvas'));
    const st = summarize(await loadFacts(), await loadCache());
    console.log(`indexed ${r.parsed} session${r.parsed === 1 ? '' : 's'} (${r.kept} unchanged, ${r.skipped} not sessions, ${r.removed} gone) in ${r.seconds.toFixed(1)}s`);
    if (zstdSkipped) console.error(`${zstdSkipped} DeepSeek Harness log${zstdSkipped === 1 ? '' : 's'} skipped: this Node (${process.version}) has no zstd; 22.15 or newer reads them`);
    console.log(`${st.sessions} sessions in ${st.sources} files · ${st.turns} turns · ${artifactsLine(st.artifacts)} · ${HOME}`);
    return;
  }
  if (cmd === 'status') {
    const facts = await loadFacts();
    if (!facts.builtAt) { console.log('no index yet — run: thoughtdag index'); return; }
    const st = summarize(facts, await loadCache());
    const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : '–');
    console.log(`${st.sessions} sessions in ${st.sources} files · ${st.turns} turns · ${artifactsLine(st.artifacts)} · built ${facts.builtAt.slice(0, 16).replace('T', ' ')}`);
    console.log(`evidence: ${st.touches} touches · ${st.changes} edits/writes, ${st.withChangeHead} with an observed change head (${pct(st.withChangeHead, st.changes)} of changes, ${pct(st.withChangeHead, st.touches)} of touches) · ${st.withMention} answers name the file (${pct(st.withMention, st.touches)}, candidates only)`);
    console.log(`store: ${HOME} (0700) · fact-index.json + interpretation-cache.json + text-index.jsonl (0600)`);
    return;
  }
  if (cmd === 'purge') {
    // --cache drops only the interpretation; the next index recomputes it
    const targets = flag('cache') ? [CACHE_FILE, TEXT_FILE, TEXT_LINES] : [FACT_FILE, CACHE_FILE, TEXT_FILE, TEXT_LINES, LEGACY_FILE, LOCK_FILE];
    let n = 0;
    for (const f of targets) {
      try { await fsp.rm(f); n++; } catch { /* absent */ }
    }
    // leftovers of interrupted writes
    for (const name of await fsp.readdir(HOME).catch(() => [] as string[])) {
      if (/\.tmp$/.test(name)) { await fsp.rm(path.join(HOME, name), { force: true }).catch(() => undefined); }
    }
    console.log(`removed ${n} file${n === 1 ? '' : 's'} from ${HOME}`);
    return;
  }
  if (cmd === 'why' && flag('check')) {
    if (!args[0]) { console.error(USAGE); process.exit(2); }
    const facts = await factsForCheck(flag('fresh'));
    if (!facts.builtAt) { console.error('no index yet — run: thoughtdag index'); process.exit(1); }
    const { path: file } = await resolveQuery(facts, args[0], flag('all'));
    const hits = file ? hitsFor(facts, file, true).hits : [];
    const r = renderCheck(facts, args[0], file, hits, flag('json'));
    console.log(r.text);
    process.exit(r.has ? 0 : 1);
  }
  if (cmd === 'why') {
    if (!args[0]) { console.error(USAGE); process.exit(2); }
    const facts = flag('no-refresh') ? await loadFacts() : await ensureFresh();
    if (!facts.builtAt) { console.error('no index yet — run: thoughtdag index'); process.exit(1); }
    const { path: file, candidates, elsewhere } = await resolveQuery(facts, args[0], flag('all'));
    if (!file) {
      if (candidates.length === 0) {
        console.log(elsewhere
          ? `why ${args[0]}  ·  no match in this workspace (${elsewhere} elsewhere, --all to include)`
          : `why ${args[0]}  ·  no session touched this file`);
        return;
      }
      console.log(`${candidates.length} files match "${args[0]}" — pick one:\n`);
      for (const c of candidates.slice(0, 20)) console.log(`  ${c}`);
      return;
    }
    const { hits, readsHidden } = hitsFor(facts, file, flag('include-read'));
    console.log(await renderWhy(facts, file, hits, readsHidden, await loadCache(), Number(value('limit') ?? 10) || 10, flag('json')));
    return;
  }
  if (cmd === 'mcp') return serveMcp();
  if (cmd === 'setup') {
    const what = args[0];
    const notes = what === 'mcp' ? await setupMcp() : what === 'rules' ? await setupRules(flag('remove')) : await setupStatus();
    for (const n of notes) console.log(n);
    return;
  }
  if (cmd === 'events') {
    if (!args[0]) { console.error(USAGE); process.exit(2); }
    const r = await eventsOf(path.resolve(process.cwd(), args[0]));
    if (!r) { console.error('not a session file'); process.exit(1); }
    if (flag('touches')) { for (const t of deriveTouches(r.events)) console.log(JSON.stringify(t)); return; }
    console.log(JSON.stringify({ kind: 'adapter.manifest', ...r.manifest }));
    for (const e of r.events) console.log(JSON.stringify(e));
    return;
  }
  if (cmd === 'find') {
    if (!args[0]) { console.error(USAGE); process.exit(2); }
    const facts = flag('no-refresh') ? await loadFacts() : await ensureFresh();
    if (!facts.builtAt) { console.error('no index yet — run: thoughtdag index'); process.exit(1); }
    const scope = value('in') === 'q' ? 'q' : value('in') === 'a' ? 'a' : value('in') === 'm' ? 'm' : 'all';
    console.log(renderFind(facts, args[0], await findHits(facts, args[0], scope), Number(value('limit') ?? 10) || 10, flag('json')));
    return;
  }
  if (cmd === 'recall') {
    if (!args[0] || args[1] === undefined) { console.error(USAGE); process.exit(2); }
    console.log(await renderRecall(await ensureFresh(), args[0], Number(args[1])));
    return;
  }
  console.log(USAGE);
  if (cmd && cmd !== 'help' && cmd !== '--help') process.exit(2);
}

main(process.argv.slice(2)).catch((err) => { console.error(err instanceof Error ? err.message : String(err)); process.exit(1); });

