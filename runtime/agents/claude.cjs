// Claude Code as an agent runtime: one `claude -p` process per turn, spoken
// to in stream-json both ways. The turn's text and thinking arrive as
// content-block deltas, tool calls as tool_use blocks with their
// tool_result, permission prompts as control requests answered on stdin
// (`--permission-prompt-tool stdio`), the end as a result message. A session
// continues with `--resume`; a branch from an earlier turn resumes up to that
// turn's last entry (`--resume-session-at`, print mode only) under a new id
// (`--fork-session`), so the original session is left as it was. Claude Code
// keeps its session files under ~/.claude/projects, its login and its model
// aliases; the shell only asks. Same event kinds as the other runtimes.
'use strict';

const { spawn, execFile } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { snapshotDir, diffSnapshots } = require('./fs-diff.cjs');

const fsp = fs.promises;
const { locate, childEnv: envWith } = require('./where.cjs');
const EXTRA_HOMES = [path.join(os.homedir(), '.claude', 'local')];   // the CLI's own install location, on top of the usual ones

/** The claude binary and the directories walked to find it (see where.cjs). */
let located = null;
const findClaude = () => (located ??= locate('claude', EXTRA_HOMES));
const childEnv = () => envWith(EXTRA_HOMES);

/** Claude Code has no model list; its aliases resolve to the newest model
 *  of each family inside the CLI, so they never go stale. The CLI's own
 *  "default" is not offered: which model it means lives in the CLI's settings
 *  and can change under the person, so the picker names families only. */
/** The effort levels this CLI accepts, in its own words, read from its own
 *  `--help` (the `--effort <level>` entry lists them in parentheses) — so a
 *  CLI that adds a level shows it without a change here. Empty when the
 *  CLI has no such flag. Read once per launch. */
let effortsPromise = null;
function effortsOf(bin) {
  if (!effortsPromise) effortsPromise = new Promise((resolve) => {
    execFile(bin, ['--help'], { env: childEnv(), timeout: 8000, maxBuffer: 1 << 20 }, (_err, stdout) => {
      const help = String(stdout || '');
      const at = help.indexOf('--effort');
      if (at < 0) return resolve([]);
      const next = help.indexOf('\n  --', at + 1);
      const m = help.slice(at, next > 0 ? next : undefined).match(/\(([a-z0-9_, \n-]+)\)/i);
      resolve(m ? m[1].split(',').map((s) => s.trim()).filter(Boolean) : []);
    });
  });
  return effortsPromise;
}

const MODELS = [
  { provider: 'claude-code', id: 'fable', name: 'Fable', reasoning: true, vision: true },
  { provider: 'claude-code', id: 'opus', name: 'Opus', reasoning: true, vision: true },
  { provider: 'claude-code', id: 'sonnet', name: 'Sonnet', reasoning: true, vision: true },
  { provider: 'claude-code', id: 'haiku', name: 'Haiku', reasoning: true, vision: true },
];

/** The effort a turn ran at, as the transcript records it on every
 *  assistant entry (`effort`) — the CLI's own setting when the canvas named none. */
async function turnEffortOf(file) {
  if (!file) return null;
  try {
    const lines = (await fsp.readFile(file, 'utf8')).split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      if (!lines[i].includes('"effort"')) continue;
      try { const o = JSON.parse(lines[i]); if (o.type === 'assistant' && typeof o.effort === 'string') return o.effort; } catch { /* torn line */ }
    }
  } catch { /* no file */ }
  return null;
}

/** The CLI's configured effort (`effortLevel` in ~/.claude/settings.json), when set. */
async function configuredEffort() {
  try { const s = JSON.parse(await fsp.readFile(path.join(os.homedir(), '.claude', 'settings.json'), 'utf8')); return typeof s.effortLevel === 'string' ? s.effortLevel : null; } catch { return null; }
}

/** ~/.claude/projects/<slug>/<sessionId>.jsonl. The slug is the cwd with
 *  '/' and '.' turned into '-', but a long path is cut and given a short
 *  suffix by Claude Code itself — so the file is found by its id across the
 *  project directories when the computed name is not there. */
const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
async function sessionFileFor(cwd, sessionId) {
  const guess = path.join(PROJECTS_DIR, cwd.replace(/[/.]/g, '-'), `${sessionId}.jsonl`);
  if (await fsp.access(guess).then(() => true, () => false)) return guess;
  try {
    const dirs = await fsp.readdir(PROJECTS_DIR, { withFileTypes: true });
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      const candidate = path.join(PROJECTS_DIR, d.name, `${sessionId}.jsonl`);
      if (await fsp.access(candidate).then(() => true, () => false)) return candidate;
    }
  } catch { /* no projects yet */ }
  return null;
}
// the session id is the file's name; a directory on the way may carry a
// UUID of its own (a project path that names a session), so take the LAST
const sessionIdOf = (sessionPath) => { const all = String(sessionPath ?? '').match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi); return all && all.length ? all[all.length - 1] : null; };

/** The guard file the canvas writes per working directory, as a permission
 *  mode: ask → the CLI's default (it asks before edits and commands), auto →
 *  its classifier decides and asks only what it holds risky, allow → nothing
 *  asked. Questions the model puts to the person reach the canvas in all three. */
async function permissionModeFor(cwd) {
  try {
    const raw = JSON.parse(await fsp.readFile(path.join(cwd, '.thoughtdag', 'guard.json'), 'utf8'));
    if (raw?.mode === 'allow') return 'bypassPermissions';
    if (raw?.mode === 'auto') return 'auto';
  } catch { /* default */ }
  return 'default';
}

function createClaudeRuntime({ log } = {}) {
  const say = log || (() => {});
  const runs = new Map();     // runId → state
  let binPromise = null;
  const bin = () => {
    if (!binPromise) binPromise = findClaude().then((r) => { if (!r.path) { located = null; binPromise = null; } return r.path; });
    return binPromise;
  };
  /** Where the lookup walked, for the picker's "not found" note. */
  const searched = async () => (await findClaude()).searched;

  return {
    available: () => bin(),

    async models() {
      const b = await bin();
      if (!b) return { installed: false, models: [], default: null, searched: await searched() };
      const [efforts, defaultEffort] = await Promise.all([effortsOf(b), configuredEffort()]);
      return { installed: true, models: MODELS.map((m) => ({ ...m, efforts, defaultEffort })), default: 'claude/claude-code/opus' };
    },

    async run(req, onEvent) {
      const cwd = String(req.cwd || '');
      if (!cwd || !path.isAbsolute(cwd)) throw new Error('run needs an absolute cwd');
      await fsp.mkdir(cwd, { recursive: true });
      const b = await bin();
      if (!b) throw new Error('claude is not installed (no `claude` on PATH or in the usual places)');
      const runId = randomUUID();
      const emit = (event) => { try { onEvent({ runId, event }); } catch { /* renderer gone */ } };
      const state = { runId, proc: null, asks: new Map(), text: '', final: null, sessionId: null, waiting: false, ended: false, aborted: false, lastErr: '',
        // what this conversation already allowed for good (see README: `rule`)
        allowRules: new Set(Array.isArray(req.allowRules) ? req.allowRules.filter((s) => typeof s === 'string' && s.startsWith('claude:')) : []) };
      runs.set(runId, state);

      void (async () => {
        const IDLE = Number(process.env.TD_AGENT_IDLE_MS) || 10 * 60 * 1000;
        let lastEvent = Date.now();
        const mark = (event) => { lastEvent = Date.now(); if (event.type === 'question') state.waiting = true; if (event.type === 'question_answered') state.waiting = false; emit(event); };
        let watchdog = null;
        const before = await snapshotDir(cwd).catch(() => null);
        try {
          const mode = await permissionModeFor(cwd);
          const model = req.model && typeof req.model === 'object' && req.model.id && req.model.id !== 'default' ? req.model.id : null;
          const resumeId = req.sessionPath ? sessionIdOf(req.sessionPath) : null;
          // the prompt channel stays open in every mode: with nothing to
          // approve, AskUserQuestion still comes through it
          const args = ['-p', '--output-format', 'stream-json', '--input-format', 'stream-json', '--verbose', '--include-partial-messages', '--permission-mode', mode, '--permission-prompt-tool', 'stdio'];
          if (model) args.push('--model', model);
          // only a level the CLI itself lists; anything else means its default
          if (req.effort && (await effortsOf(b)).includes(req.effort)) args.push('--effort', req.effort);
          if (resumeId) { args.push('--resume', resumeId); if (req.forkEntryId) args.push('--resume-session-at', String(req.forkEntryId), '--fork-session'); }
          const proc = spawn(b, args, { cwd, env: childEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
          state.proc = proc;
          let buf = '';
          const finished = new Promise((resolve) => {
            const done = (how) => { if (state.ended) return; state.ended = true; resolve(how); };
            proc.stdout.on('data', (d) => {
              buf += d.toString();
              let i;
              while ((i = buf.indexOf('\n')) >= 0) {
                const line = buf.slice(0, i); buf = buf.slice(i + 1);
                if (!line.trim()) continue;
                let m; try { m = JSON.parse(line); } catch { continue; }
                handle(m, done);
              }
            });
            proc.stderr.on('data', (d) => { const s = d.toString().trim(); if (s) state.lastErr = s.split('\n').pop().slice(0, 300); say('[claude stderr] ' + s.slice(0, 400)); });
            proc.on('error', (e) => { mark({ type: 'run_error', message: 'spawn error: ' + e.message }); done('error'); });
            proc.on('exit', (code, signal) => { if (!state.ended) { if (!state.aborted && code) mark({ type: 'run_error', message: `claude exited (${signal || code})${state.lastErr ? ': ' + state.lastErr : ''}` }); done(state.aborted ? 'aborted' : (code ? 'error' : 'end')); } });
          });
          watchdog = setInterval(() => {
            if (state.waiting || Date.now() - lastEvent < IDLE) return;
            mark({ type: 'run_error', message: `no activity for ${IDLE >= 60000 ? Math.round(IDLE / 60000) + ' min' : Math.round(IDLE / 1000) + ' s'}; the turn was stopped` });
            state.aborted = true; try { proc.kill(); } catch { /* gone */ }
          }, 15000);

          const handle = (m, done) => {
            switch (m.type) {
              case 'system':
                if (m.subtype === 'init') {
                  state.sessionId = m.session_id;
                  // the file appears once the first lines are written; the
                  // completion re-emits the session with its real path
                  mark({ type: 'session', sessionId: m.session_id, sessionFile: null, model: model ? { provider: 'claude-code', id: model, name: model } : null, cwd });
                } else if (m.subtype === 'permission_denied') {
                  mark({ type: 'tool_execution_end', toolCallId: m.tool_use_id ?? '', toolName: m.tool_name ?? 'tool', result: 'permission denied', isError: true });
                }
                break;
              case 'stream_event': {
                const ev = m.event ?? {};
                if (ev.type === 'content_block_delta') {
                  const d = ev.delta ?? {};
                  if (d.type === 'text_delta' && d.text) { state.text += d.text; mark({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: d.text } }); }
                  else if (d.type === 'thinking_delta' && d.thinking) mark({ type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', delta: d.thinking } });
                }
                break;
              }
              case 'assistant':
                // the alias resolved to a real model inside the CLI; the final session event carries it
                if (!state.resolvedModel && typeof m.message?.model === 'string') state.resolvedModel = m.message.model;
                for (const b of m.message?.content ?? []) if (b.type === 'tool_use') mark({ type: 'tool_execution_start', toolCallId: b.id, toolName: b.name, args: b.input ?? {} });
                break;
              case 'user':
                for (const b of m.message?.content ?? []) if (b.type === 'tool_result') mark({ type: 'tool_execution_end', toolCallId: b.tool_use_id, toolName: '', result: typeof b.content === 'string' ? b.content : JSON.stringify(b.content ?? null).slice(0, 4000), isError: !!b.is_error });
                break;
              case 'control_request': {
                const r = m.request ?? {};
                if (r.subtype !== 'can_use_tool') { write(proc, { type: 'control_response', response: { subtype: 'error', request_id: m.request_id, error: 'unsupported request' } }); break; }
                const id = `q-${m.request_id}`;
                const input = r.input ?? {};
                // the model's own questions for the person: one form, answered
                // through the same channel — the answers ride back in the tool's
                // input, keyed by each question's text (a skip is a refusal the
                // model reads as "not answered")
                if (r.tool_name === 'AskUserQuestion' && Array.isArray(input.questions)) {
                  const qs = input.questions.filter((q) => q && typeof q.question === 'string');
                  state.asks.set(id, (answer) => {
                    const given = Array.isArray(answer?.answers) ? answer.answers : null;
                    if (!given || answer?.cancelled) {
                      write(proc, { type: 'control_response', response: { subtype: 'success', request_id: m.request_id, response: { behavior: 'deny', message: 'The person skipped these questions without answering.' } } });
                      mark({ type: 'question_answered', id, outcome: 'cancelled', value: null });
                      return;
                    }
                    const answers = {};
                    qs.forEach((q, i) => {
                      const a = given.find((x) => x && x.id === String(i));
                      if (!a) return;
                      const own = typeof a.custom === 'string' && a.custom.trim() ? a.custom.trim() : null;
                      const picked = (Array.isArray(a.selected) ? a.selected : []).filter((x) => typeof x === 'string');
                      if (q.multiSelect) { const all = own ? [...picked, own] : picked; if (all.length) answers[q.question] = all; }
                      else if (own || picked[0]) answers[q.question] = own ?? picked[0];
                    });
                    write(proc, { type: 'control_response', response: { subtype: 'success', request_id: m.request_id, response: { behavior: 'allow', updatedInput: { ...input, answers } } } });
                    mark({ type: 'question_answered', id, outcome: 'answered', value: Object.entries(answers).map(([k, v]) => `${k} → ${Array.isArray(v) ? v.join(', ') : v}`).join('; ') || null });
                  });
                  mark({
                    type: 'question', kind: 'form', id, title: 'AskUserQuestion', message: qs.map((q) => q.question).join('\n'),
                    questions: qs.map((q, i) => ({
                      id: String(i), question: q.question, ...(typeof q.header === 'string' ? { header: q.header } : {}),
                      options: (Array.isArray(q.options) ? q.options : []).filter((o) => o && typeof o.label === 'string').map((o) => ({ label: o.label, ...(typeof o.description === 'string' ? { description: o.description } : {}) })),
                      multiSelect: !!q.multiSelect, custom: true,
                    })),
                    options: [], placeholder: null, prefill: null, paths: [], suggest: null,
                  });
                  break;
                }
                const line = typeof input.command === 'string' ? input.command : (input.file_path ?? input.path ?? JSON.stringify(input).slice(0, 200));
                // the CLI's own "don't ask again" suggestion names what a standing
                // allowance covers; sent back scoped to the session, never to settings
                const suggest = (Array.isArray(r.permission_suggestions) ? r.permission_suggestions : []).find((s) => s && s.type === 'addRules' && Array.isArray(s.rules) && s.rules.length);
                const rule = suggest ? 'claude:' + JSON.stringify(suggest.rules.map((x) => ({ toolName: x.toolName, ...(x.ruleContent ? { ruleContent: x.ruleContent } : {}) }))) : null;
                const allow = (forSession) => write(proc, { type: 'control_response', response: { subtype: 'success', request_id: m.request_id, response: { behavior: 'allow', updatedInput: input, ...(forSession && suggest ? { updatedPermissions: [{ ...suggest, destination: 'session' }] } : {}) } } });
                const title = `${r.tool_name ?? 'tool'} needs approval`;
                if (rule && state.allowRules.has(rule)) {
                  allow(true);
                  mark({ type: 'question_answered', id, outcome: 'allowed-session', value: null, auto: true, title, message: line, rule });
                  break;
                }
                state.asks.set(id, (answer) => {
                  const yes = !!answer?.confirmed;
                  const forSession = yes && answer?.scope === 'session' && !!rule;
                  if (forSession) state.allowRules.add(rule);
                  if (yes) allow(forSession); else write(proc, { type: 'control_response', response: { subtype: 'success', request_id: m.request_id, response: { behavior: 'deny', message: 'the person did not allow this step' } } });
                  mark({ type: 'question_answered', id, outcome: yes ? (forSession ? 'allowed-session' : 'allowed-once') : 'rejected', value: null, ...(forSession ? { rule } : {}) });
                });
                mark({ type: 'question', kind: 'confirm', id, rule, title, message: [line, r.description].filter(Boolean).join('\n'), options: [], placeholder: null, prefill: null, paths: [], suggest: null });
                break;
              }
              case 'result':
                state.final = typeof m.result === 'string' ? m.result : null;
                // a run the CLI refused (say, a branch entry the transcript lacks) names why in `errors`
                if (m.subtype && m.subtype !== 'success') mark({ type: 'run_error', message: String(m.result ?? (Array.isArray(m.errors) && m.errors.length ? m.errors.join('; ') : m.subtype)) });
                done(m.subtype === 'success' ? 'end' : 'error');
                break;
              default: break;
            }
          };

          // the prompt goes in as one user message; stdin stays open for answers
          const content = [{ type: 'text', text: String(req.prompt ?? '') }];
          for (const img of Array.isArray(req.images) ? req.images : []) if (img && typeof img.data === 'string') content.push({ type: 'image', source: { type: 'base64', media_type: img.mimeType, data: img.data } });
          write(proc, { type: 'user', message: { role: 'user', content } });

          const how = await finished;
          // let the CLI finish writing its transcript: it exits on its own
          // after the result; a kill is only the fallback
          await new Promise((resolve) => { if (proc.exitCode !== null || proc.signalCode) return resolve(); const t = setTimeout(() => { try { proc.kill(); } catch { /* gone */ } resolve(); }, 8000); proc.once('exit', () => { clearTimeout(t); resolve(); }); });
          if (state.sessionId) {
            const file = await sessionFileFor(cwd, state.sessionId);
            const ran = await turnEffortOf(file);
            mark({ type: 'session', effort: ran, sessionId: state.sessionId, sessionFile: file, model: { provider: 'claude-code', id: model ?? 'default', name: model ?? 'default', ...(state.resolvedModel ? { resolved: state.resolvedModel } : {}) }, cwd });
          }
          if (before) {
            const after = await snapshotDir(cwd).catch(() => null);
            if (after) { const d = diffSnapshots(before, after); if (d.changed.length || d.added.length || d.removed.length || d.truncated) mark({ type: 'fs_changes', ...d }); }
          }
          mark({ type: 'run_end', text: state.final ?? state.text, how });
        } catch (e) {
          mark({ type: 'run_error', message: e instanceof Error ? e.message : String(e) });
          mark({ type: 'run_end', text: state.final ?? state.text, how: 'error' });
        } finally {
          if (watchdog) clearInterval(watchdog);
          runs.delete(runId);
        }
      })();
      return runId;
    },

    abort(runId) {
      const r = runs.get(runId);
      if (!r) return false;
      r.aborted = true;
      for (const [id, respond] of r.asks) { respond({ confirmed: false }); r.asks.delete(id); }
      try { r.proc?.kill(); } catch { /* gone */ }
      return true;
    },

    answer(runId, requestId, response) {
      const r = runs.get(runId);
      const respond = r?.asks.get(String(requestId));
      if (!respond) return false;
      r.asks.delete(String(requestId));
      const a = response && typeof response === 'object' ? response : { confirmed: !!response };
      respond(a.cancelled ? { confirmed: false } : a);
      return true;
    },

    shutdown() { for (const r of runs.values()) { try { r.proc?.kill(); } catch { /* gone */ } } },
  };
}

function write(proc, obj) { try { proc.stdin.write(JSON.stringify(obj) + '\n'); return true; } catch { return false; } }

module.exports = { createClaudeRuntime, findClaude };
