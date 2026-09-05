// dsh-thoughtdag host half — a plain Cordis plugin that mounts the
// ThoughtDAG SPA under a prefix on the EXISTING DSH web server (no second
// process, no second port) and bridges DSH sessions to the canvas.
//
// Layout of this file, mirroring dsh-synapse:
//   - the static ThoughtDAG build lives in ../dist-app (a Vite build with
//     base = the mount prefix, so every asset reference is already
//     /<prefix>/... and resolves through the routes registered below)
//   - /<prefix>/            the SPA shell (index.html)
//   - /<prefix>/<asset...>  static assets (prefix route, path-traversal safe)
//   - /<prefix>/api/...     the session bridge (Host-header fenced)
//
// The bridge's read direction feeds the ThoughtDAG dsh-session adapter:
// the adapter parses the same event JSONL a real ~/.dsh session log holds,
// so the bridge serves a session's durable events as that text.
//
// The write direction is how an edited canvas becomes the model's next
// context — through DSH's own primitives, never by touching a log:
//   POST /sessions/<id>/fork      { afterTurn | atSeq }  → a child session that
//                                 inherits the prefix up to that turn boundary
//                                 (sessionController.fork: the UI sees it too)
//   POST /sessions/<id>/inject    { text | blocks }      → model-facing context
//                                 for the next step (agent.inject: no wake,
//                                 shown in the transcript as injected context)
//   POST /sessions/<id>/followup  { text | blocks, mode } → a user prompt that
//                                 wakes the agent (sessionController.prompt)
//   GET  /sessions/<id>/turns     turn boundaries with their seqs, so the
//                                 canvas can name a fork point by turn
//
// The other agents on this machine: the host is a local Node process, so it
// can read what the desktop shell reads — Claude Code's ~/.claude/projects
// and Codex's ~/.codex/sessions — and serve them with the desktop bridge's
// own primitives, so Session Atlas inside the harness sees all three:
//   GET  /roots                          the two file roots (key, path, exists)
//   GET  /roots/<key>/list               every .jsonl under a root (rel, size, mtime)
//   GET  /roots/<key>/head?rel&bytes     the first bytes of one file, as text
//   GET  /roots/<key>/read?rel           one whole file
//   GET  /roots/<key>/range?rel&start&length   a line-aligned byte window
// Everything the model then sees is on the child's log, in DSH's own
// event vocabulary: switching back to the chat shows exactly that.
//
// The model connection: inside the harness ThoughtDAG has no proxy of its
// own, so this host also answers the SPA's proxy protocol with the harness's
// providers and credentials (the SPA is built with VITE_API_BASE=/thoughtdag):
//   GET  /models   the harness's model catalog in the SPA's list shape
//   POST /stream   one model call, streamed as the SPA's SSE frames
//   POST /claude   the same call, whole answer as JSON
// These are canvas-native calls (summaries, condensing, a canvas that is
// not a mirrored session) — they run on the harness's models but do not
// enter any session log; a mirrored session's turns go through /followup.
//
// One entry in that catalog is not a model: "harness/agent". Picking it
// sends the question INTO the harness — a fresh session per call, the
// canvas's wired context injected first, the harness running its own agent
// loop with tools — and streams the agent's text, reasoning and tool calls
// back as the same SSE frames. The session stays: the Chat lists it, the
// atlas can open it, and the canvas gets its id in the first frame.

import { randomUUID } from 'node:crypto'
import { open, readFile, readdir, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { zstdDecompressSync } from 'node:zlib'

export const name = 'thoughtdag'
export const inject = ['webServer', 'sessions', 'sessionController', 'agents', 'llm', 'attachments']

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const APP_DIR = resolve(__dirname, '../dist-app')

const MAX_BODY_BYTES = 32 * 1024
// a compiled canvas context can be long; the write endpoints take up to this
const MAX_WRITE_BODY_BYTES = 4 * 1024 * 1024
// a model call carries the whole context the canvas compiled
const MAX_CALL_BODY_BYTES = 24 * 1024 * 1024
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.json': 'application/json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.ico': 'image/x-icon',
}

/** Owns an error + an HTTP status; rendered as a JSON body. */
class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

async function readJson(req, limit = MAX_BODY_BYTES) {
  const chunks = []
  let length = 0
  for await (const chunk of req) {
    length += chunk.length
    if (length > limit) throw new HttpError(413, 'request body too large')
    chunks.push(chunk)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new HttpError(400, 'request body is not valid JSON') }
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

function sendFile(res, contentType, body) {
  res.writeHead(200, { 'content-type': contentType, 'cache-control': 'no-store' })
  res.end(body)
}

/** Static asset path under APP_DIR, or null when it escapes (traversal). */
function assetPath(rel) {
  const normalized = normalize(rel)
  const abs = resolve(APP_DIR, normalized)
  if (abs !== APP_DIR && !abs.startsWith(APP_DIR + '/')) return null
  return abs
}

/** Every event of a live session, inherited prefix included — the Session
 *  class exposes a snapshot read, not a raw array. */
function allEvents(session) {
  if (typeof session.snapshotEvents === 'function') return session.snapshotEvents()
  return session.events ?? []
}

/** Session list the bridge exposes: identity + a cheap title, never the log. */
function sessionSummary(session) {
  const header = session.header ?? {}
  const meta = header.meta ?? {}
  return {
    id: session.id,
    title: session.displayTitle ?? null,
    cwd: meta.cwd ?? null,
    parentSession: header.parentSession ?? undefined,
    createdAt: header.createdAt ?? null,
    firstLiveSeq: session.firstLiveSeq ?? null,
    // the log's current length: a poller compares it to know the session moved
    seq: typeof session.seq === 'number' ? session.seq : null,
  }
}

/** Serve one session's durable event log as JSONL text (the input dialect of
 *  ThoughtDAG's dsh-session adapter). Sequenced events are serialized in log
 *  order; the exact wire shape mirrors the on-disk session.jsonl.zstd rows
 *  (a type/session header line first), so the canvas imports a live DSH
 *  session exactly like a file on disk. */
function sessionToJsonl(session) {
  const lines = []
  const header = session.header ?? {}
  const hdr = { type: 'session', version: 0, id: session.id }
  if (header.createdAt !== undefined) hdr.createdAt = header.createdAt
  const meta = header.meta
  if (meta?.cwd !== undefined) hdr.cwd = meta.cwd
  // fork lineage, exactly as the on-disk header carries it: who the parent
  // is and how many leading events are inherited (a reader of the log tells
  // the child's own turns from the prefix by seq >= seedLength)
  if (header.parentSession !== undefined) hdr.parentSession = header.parentSession
  if (typeof session.inheritedEventCount === 'number' && session.inheritedEventCount > 0) hdr.seedLength = session.inheritedEventCount
  lines.push(JSON.stringify(hdr))
  for (const event of allEvents(session)) {
    lines.push(JSON.stringify(event))
  }
  return lines.join('\n')
}

// ── durable-session bridge (disk) ──────────────────────────────────────
// DSH persists each session as session.jsonl.zstd under
// $DSH_HOME/sessions/<encoded-cwd>/<session-id>/. The zstd log is a
// CONCATENATION of independently-encoded frames (one per durable batch
// append); Node's one-shot zstdDecompressSync only decodes the FIRST frame,
// so frames are located structurally and decoded one by one (the same
// container walk the DSH persistence backend performs). A final torn frame
// (live tail) is dropped; the next read picks it up whole.

const ZSTD_MAGIC = 4247762216 // 0xFD2FB528 LE
function scanZstdFrames(buffer) {
  const frames = []
  let offset = 0
  while (offset < buffer.length) {
    const start = offset
    if (buffer.length - offset < 4) break
    if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) return { frames }
    offset += 4
    if (offset === buffer.length) break
    const descriptor = buffer.readUInt8(offset)
    offset += 1
    const contentSizeFlag = descriptor >>> 6
    const singleSegment = (descriptor & 32) !== 0
    const checksum = (descriptor & 4) !== 0
    const dictionaryFlag = descriptor & 3
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag
    const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << contentSizeFlag
    const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes
    if (buffer.length - offset < remainingHeaderBytes) break
    offset += remainingHeaderBytes
    for (;;) {
      if (buffer.length - offset < 3) return { frames }
      const blockHeader = buffer.readUIntLE(offset, 3)
      offset += 3
      const lastBlock = (blockHeader & 1) !== 0
      const blockType = (blockHeader >>> 1) & 3
      const blockSize = blockHeader >>> 3
      const payloadBytes = blockType === 1 ? 1 : blockSize
      if (buffer.length - offset < payloadBytes) return { frames }
      offset += payloadBytes
      if (lastBlock) break
    }
    if (checksum) {
      if (buffer.length - offset < 4) return { frames }
      offset += 4
    }
    frames.push({ start, end: offset })
  }
  return { frames }
}

/** Decode a concatenated-frame zstd buffer to UTF-8 text ('' when corrupt). */
function decompressZstdToText(raw) {
  try {
    const { frames } = scanZstdFrames(raw)
    if (frames.length === 0) return ''
    const parts = []
    for (const { start, end } of frames) parts.push(zstdDecompressSync(raw.subarray(start, end)))
    return Buffer.concat(parts).toString('utf8')
  } catch { return '' }
}

/** Walk $DSH_HOME/sessions for session.jsonl.zstd files (2 levels deep). */
async function findSessionFiles(dshHome) {
  const root = join(dshHome, 'sessions')
  const out = []
  let entries
  try { entries = await readdir(root, { withFileTypes: true }) } catch { return out }
  for (const ws of entries) {
    if (!ws.isDirectory()) continue
    let sessions
    try { sessions = await readdir(join(root, ws.name), { withFileTypes: true }) } catch { continue }
    for (const s of sessions) {
      if (!s.isDirectory()) continue
      const log = join(root, ws.name, s.name, 'session.jsonl.zstd')
      try {
        const st = await stat(log)
        out.push({ dir: ws.name, sessionDir: s.name, log, size: st.size, mtime: st.mtimeMs })
      } catch { /* no log yet */ }
    }
  }
  return out
}

/** Cheap title from the FIRST zstd frame only (bounded read): the session
 *  header names the id+cwd; session/title arrives right after in live logs.
 *  Falls back to the session id when the frame boundary cuts early. */
const HEAD_READ_BYTES = 256 * 1024 // covers the first frames: header + title + opening turns
async function sessionTitleFromHead(logPath) {
  try {
    const fh = await open(logPath, 'r')
    let buf
    try {
      const st = await fh.stat()
      const want = Math.min(st.size, HEAD_READ_BYTES)
      const b = Buffer.alloc(want)
      const { bytesRead } = await fh.read(b, 0, want, 0)
      buf = b.subarray(0, bytesRead)
    } finally { await fh.close() }
    const text = decompressZstdToText(buf)
    let title = null
    let id = null
    let cwd = null
    for (const raw of text.split('\n')) {
      try {
        const o = JSON.parse(raw)
        if (o.type === 'session') {
          if (typeof o.id === 'string') id = o.id
          if (typeof o.cwd === 'string') cwd = o.cwd
        }
        if (o.type === 'session/title' && typeof o.data?.title === 'string') { title = o.data.title; break }
      } catch { /* partial tail */ }
    }
    return { title, id, cwd }
  } catch { return { title: null, id: null } }
}

// ── write direction helpers ────────────────────────────────────────────

/** The live session for an id, across the store's method spellings. */
const liveSession = (ctx, id) => (typeof ctx.sessions.get === 'function' ? ctx.sessions.get(id) : ctx.sessions.sessionOf?.(id)) ?? undefined

/** Turn boundaries of an event list: where each turn starts and ends (seq),
 *  and the id of the message a person actually sent in it. A fork can only
 *  cut at an endSeq (DSH rejects a boundary inside an open turn). */
function turnsOf(events) {
  const turns = new Map()
  for (const e of events) {
    if (!e || typeof e.type !== 'string') continue
    const n = e.data?.turn
    if (e.type === 'turn/start' && typeof n === 'number') turns.set(n, { turn: n, startSeq: e.seq, endSeq: null, userMessageId: null })
    else if (e.type === 'turn/end' && typeof n === 'number' && turns.has(n)) turns.get(n).endSeq = e.seq
    else if (e.type === 'user/message' && (e.data?.source?.kind ?? 'user') === 'user') {
      const openTurn = [...turns.values()].reverse().find(t => t.endSeq === null)
      if (openTurn && openTurn.userMessageId === null) openTurn.userMessageId = e.data?.id ?? null
    }
  }
  return [...turns.values()]
}

/** Events of a session by id: the live store first, else the durable log. */
async function eventsOfSession(ctx, id) {
  const live = liveSession(ctx, id)
  if (live !== undefined) return allEvents(live)
  const dshHome = process.env.DSH_HOME || join(os.homedir(), '.dsh')
  const files = await findSessionFiles(dshHome)
  const hit = files.find(f => f.sessionDir === id)
  if (!hit) return null
  const raw = await readFile(hit.log).catch(() => null)
  if (!raw) return null
  const events = []
  for (const line of decompressZstdToText(raw).split('\n')) {
    if (!line) continue
    try { events.push(JSON.parse(line)) } catch { /* torn tail */ }
  }
  return events
}

/** Model-facing content from a request body: `blocks` (text blocks only for
 *  now — images arrive through the attachment store in a later step) or a
 *  plain `text`. Empty content is a 400, never a silent no-op. */
function contentOf(body) {
  if (Array.isArray(body?.blocks)) {
    const blocks = body.blocks.filter(b => b && b.type === 'text' && typeof b.text === 'string' && b.text.length > 0).map(b => ({ type: 'text', text: b.text }))
    if (blocks.length === 0) throw new HttpError(400, 'blocks: no text block with content')
    if (blocks.length !== body.blocks.length) throw new HttpError(400, 'blocks: only { type: "text", text } is accepted here')
    return blocks
  }
  if (typeof body?.text === 'string' && body.text.length > 0) return [{ type: 'text', text: body.text }]
  throw new HttpError(400, 'body needs text or blocks')
}

const SOURCE = { kind: 'plugin', plugin: 'dsh-thoughtdag' }

// ── the other agents' session files on this machine ────────────────────

const FILE_ROOTS = {
  'claude-projects': join(os.homedir(), '.claude', 'projects'),
  'codex-sessions': join(os.homedir(), '.codex', 'sessions'),
}
const FILE_READ_MAX = 256 * 1024 * 1024

/** An absolute path inside a root, or a 400/404 — rel never escapes. */
function fileInRoot(rootKey, rel) {
  const root = FILE_ROOTS[rootKey]
  if (!root) throw new HttpError(404, 'no such root')
  if (typeof rel !== 'string' || !rel) throw new HttpError(400, 'rel required')
  const abs = resolve(root, rel)
  if (abs !== root && !abs.startsWith(root + '/')) throw new HttpError(400, 'rel escapes its root')
  return abs
}

/** Every session file under a root, two-to-five levels deep like the desktop's walk. */
async function listRoot(rootKey) {
  const root = FILE_ROOTS[rootKey]
  if (!root) throw new HttpError(404, 'no such root')
  const out = []
  const walk = async (dir, depth) => {
    if (depth > 5) return
    let entries
    try { entries = await readdir(dir, { withFileTypes: true }) } catch { return }
    for (const ent of entries) {
      const p = join(dir, ent.name)
      if (ent.isDirectory()) await walk(p, depth + 1)
      else if (ent.isFile() && ent.name.endsWith('.jsonl')) {
        try { const st = await stat(p); out.push({ rel: p.slice(root.length + 1), size: st.size, mtime: st.mtimeMs }) } catch { /* raced */ }
      }
    }
  }
  await walk(root, 0)
  return out
}

/** The first `bytes` of a file, as text (the desktop bridge's head). */
async function headOfFile(abs, bytes) {
  const n = Math.min(Math.max(1024, bytes | 0), 524288)
  const fh = await open(abs, 'r')
  try { const buf = Buffer.alloc(n); const { bytesRead } = await fh.read(buf, 0, n, 0); return buf.subarray(0, bytesRead).toString('utf8') } finally { await fh.close() }
}

/** A byte window cut on a line boundary (the desktop bridge's read-range). */
async function rangeOfFile(abs, start, length) {
  const fh = await open(abs, 'r')
  try {
    const from = Math.max(0, Number(start) || 0)
    const want = Math.min(Math.max(65536, Number(length) || 0), 32 * 1024 * 1024)
    const total = (await fh.stat()).size
    const size = Math.min(want, Math.max(0, total - from))
    if (size === 0) return { text: '', nextStart: from, eof: true }
    const b = Buffer.alloc(size)
    const { bytesRead } = await fh.read(b, 0, size, from)
    let slice = b.subarray(0, bytesRead)
    const eof = from + size >= total
    if (!eof) {
      const lastNl = slice.lastIndexOf(0x0a)
      if (lastNl >= 0) slice = slice.subarray(0, lastNl + 1)
      else return { text: '', nextStart: from + size, eof: false }
    }
    return { text: slice.toString('utf8'), nextStart: from + slice.length, eof }
  } finally { await fh.close() }
}

// ── model connection helpers ───────────────────────────────────────────

/** The SPA names a harness model as "<provider>/<model>" (the model id itself
 *  may contain slashes, so the split is at the first one). */
function splitModelId(id) {
  if (typeof id !== 'string') return null
  const i = id.indexOf('/')
  if (i <= 0 || i === id.length - 1) return null
  return { provider: id.slice(0, i), model: id.slice(i + 1) }
}

/** The harness's catalog in the SPA's list shape. No model is marked as
 *  seeing images yet: image blocks need the attachment store, a later step. */
const AGENT_MODEL = 'harness/agent'

async function modelsPayload(ctx) {
  const cat = await ctx.sessionController.modelCatalog()
  // the harness itself, as an entry: the agent loop with tools, not a bare model
  const models = [{ id: AGENT_MODEL, name: 'DeepSeek Harness · Agent (tools)', provider: 'DeepSeek Harness', vision: true }]
  // A bare model call goes through ctx.llm.stream, which sends text only —
  // the harness admits images through a SESSION turn, so images ride the
  // agent path (harness/agent, marked vision above). Bare models stay text.
  for (const g of cat.groups ?? []) for (const m of g.models ?? []) models.push({ id: `${g.id}/${m.id}`, name: m.name ?? m.id, provider: g.name ?? g.id, vision: false })
  const def = cat.default ? `${cat.default.provider}/${cat.default.model}` : null
  return {
    models,
    default: def && models.some(m => m.id === def) ? def : (models[0]?.id ?? null),
    capabilities: { webSearch: false, searchEngine: 'none', scholarSearch: false, vision: false },
    harness: { routableProviders: cat.routableProviders ?? [], failures: (cat.failures ?? []).map(f => ({ provider: f.id, message: f.message })) },
  }
}

const IMAGE_MEDIA = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

/** The SPA's { role, content } messages as harness Messages; system lines
 *  fold into the call's system prompt. Images (base64) attach to the last
 *  user message as image blocks. */
async function callOf(ctx, body, target) {
  const system = []
  const messages = []
  for (const m of Array.isArray(body?.messages) ? body.messages : []) {
    if (!m || typeof m.content !== 'string') continue
    if (m.role === 'system') { system.push(m.content); continue }
    const role = m.role === 'assistant' ? 'assistant' : 'user'
    messages.push({
      id: 'td-' + randomUUID(), role,
      content: [{ type: 'text', text: m.content }],
      source: role === 'assistant' ? { kind: 'model', provider: target.provider, model: target.model } : { kind: 'user' },
    })
  }
  if (messages.length === 0) throw new HttpError(400, 'messages: nothing to send')
  return { provider: target.provider, model: target.model, messages, ...(system.length ? { system: system.join('\n\n') } : {}) }
}

/** The canvas's compiled messages, split for the agent: the last user
 *  message is the question; everything before it is the context the canvas
 *  wired in, rendered as one block the harness receives ahead of the turn. */
function compileForAgent(body) {
  const msgs = (Array.isArray(body?.messages) ? body.messages : []).filter(m => m && typeof m.content === 'string' && m.content.trim())
  if (msgs.length === 0) throw new HttpError(400, 'messages: nothing to send')
  const last = msgs[msgs.length - 1]
  if (last.role !== 'user') throw new HttpError(400, 'the last message must be the user\'s question')
  const system = msgs.slice(0, -1).filter(m => m.role === 'system').map(m => m.content.trim())
  const history = msgs.slice(0, -1).filter(m => m.role !== 'system')
  const parts = []
  if (system.length) parts.push('Instructions from the canvas:\n\n' + system.join('\n\n'))
  if (history.length) parts.push('The conversation the canvas wired into this question, oldest first:\n\n' + history.map(m => `[${m.role === 'assistant' ? 'assistant' : 'user'}]\n${m.content.trim()}`).join('\n\n'))
  const context = parts.length ? '[ThoughtDAG canvas context] The question that follows was asked from a ThoughtDAG canvas. Treat the material below as the conversation so far.\n\n' + parts.join('\n\n') : ''
  return { question: last.content.trim(), context }
}

/** A short line naming what a tool call is doing, for the canvas's progress row. */
function toolQuery(name, args) {
  let a = args
  if (typeof a === 'string') { try { a = JSON.parse(a) } catch { return a.slice(0, 120) } }
  if (!a || typeof a !== 'object') return ''
  if (/^run_code$/i.test(name) && typeof a.code === 'string') return (a.code.split('\n').find(l => l.trim()) ?? '').trim().slice(0, 120)
  for (const k of ['file_path', 'command', 'pattern', 'path', 'url', 'query', 'description']) if (typeof a[k] === 'string' && a[k]) return a[k].slice(0, 120)
  const first = Object.values(a).find(v => typeof v === 'string' && v)
  return first ? first.slice(0, 120) : ''
}

/** Run one question through the harness's agent loop in a fresh session and
 *  report it as SSE-style frames via `emit`; resolves when the turn ends. */
async function runAgentTurn(ctx, body, emit, isClosed) {
  const { question, context } = compileForAgent(body)
  // continue the session the canvas mirrors (a tail follow-up), else a fresh
  // session in the requested working directory (the canvas's project)
  const continueId = typeof body?.harness?.session === 'string' && body.harness.session ? body.harness.session : null
  let sessionId
  if (continueId && (liveSession(ctx, continueId) || (await eventsOfSession(ctx, continueId)) !== null)) {
    sessionId = continueId
  } else {
    const cwd = typeof body?.harness?.cwd === 'string' && body.harness.cwd ? { cwd: body.harness.cwd } : {}
    sessionId = (await ctx.sessionController.create({ ...cwd })).sessionId
  }
  emit({ harnessSession: sessionId, continued: sessionId === continueId })
  const hasImages = Array.isArray(body?.images) && body.images.length > 0
  if (hasImages) {
    const vm = await visionModel(ctx).catch(() => null)
    if (vm) await ctx.sessionController.selectModel({ sessionId, provider: vm.provider, model: vm.model }).catch(() => {})
  }
  const agent = await agentOf(ctx, sessionId)
  let sawChunk = false
  let fullText = ''
  let done
  const finished = new Promise(resolve => { done = resolve })
  const off = ctx.on('session/event', (session, event) => {
    if (session?.id !== sessionId || !event) return
    if (event.type === 'assistant/chunk') {
      const c = event.data?.chunk
      if (c?.type === 'text-delta' && c.text) { sawChunk = true; fullText += c.text; emit({ text: c.text }) }
      else if (c?.type === 'reasoning-delta' && c.text) emit({ reasoning: c.text })
    } else if (event.type === 'assistant/message' && !sawChunk) {
      // chunks did not reach us live (e.g. a compacted row): the whole text at once
      const text = (event.data?.message?.content ?? []).filter(b => b.type === 'text').map(b => b.text).join('')
      if (text) { fullText += text; emit({ text }) }
    } else if (event.type === 'tool/call') {
      emit({ tool: { name: event.data?.name ?? 'tool', query: toolQuery(event.data?.name, event.data?.arguments) } })
    } else if (event.type === 'tool/code-dispatch-start') {
      emit({ tool: { name: event.data?.name ?? 'tool', query: toolQuery(event.data?.name, event.data?.arguments) } })
    } else if (event.type === 'turn/end') {
      done()
    }
  })
  try {
    const injectContext = continueId && sessionId === continueId ? (typeof body?.harness?.extraContext === 'string' ? body.harness.extraContext : '') : context
    if (injectContext) agent.inject({ id: 'td-' + randomUUID(), role: 'user', content: [{ type: 'text', text: injectContext }], source: SOURCE })
    const promptContent = [{ type: 'text', text: question }]
    for (const img of Array.isArray(body?.images) ? body.images : []) {
      if (img && typeof img.data === 'string' && IMAGE_MEDIA.has(img.mimeType)) promptContent.push({ type: 'image', mediaType: img.mimeType, data: img.data })
    }
    await ctx.sessionController.prompt({ requestId: 'td-' + randomUUID(), sessionId, mode: 'queue', content: promptContent }, AbortSignal.timeout(30000))
    const timeout = new Promise(resolve => setTimeout(resolve, 20 * 60 * 1000))
    const closed = new Promise(resolve => { const t = setInterval(() => { if (isClosed()) { clearInterval(t); resolve() } }, 500); finished.then(() => clearInterval(t)) })
    await Promise.race([finished, agent.whenIdle().then(() => finished), timeout, closed])
    if (isClosed()) { try { agent.cancel({ kind: 'user' }) } catch { /* best effort */ } }
  } finally {
    if (typeof off === 'function') off()
  }
  return { sessionId, text: fullText }
}

/** A vision-capable model id ("provider/model") from the catalog, or null. */
async function visionModel(ctx) {
  const cat = await ctx.sessionController.modelCatalog()
  for (const g of cat.groups ?? []) for (const m of g.models ?? []) if (/vision/i.test(m.id) || /vision/i.test(m.name ?? '')) return { provider: g.id, model: m.id }
  return null
}

/** Resolve the requested model against the catalog, falling back to its default. */
async function targetOf(ctx, requested) {
  const payload = await modelsPayload(ctx)
  const id = requested && payload.models.some(m => m.id === requested) ? requested : payload.default
  const t = splitModelId(id)
  if (!t) throw new HttpError(503, 'no model is routable in this harness')
  return t
}

/** The live agent for a session, resuming a cold one through the controller. */
async function agentOf(ctx, id) {
  const live = ctx.agents.get(id)
  if (live !== undefined) return live
  const r = await ctx.sessionController.resolveAgent(id)
  if ('agent' in r) return r.agent
  throw new HttpError(404, 'no such session: ' + (r.error?.code ?? r.error?.message ?? 'unknown'))
}

export function apply(ctx, config) {
  const prefix = typeof config?.mountPrefix === 'string' && config.mountPrefix.startsWith('/') && config.mountPrefix.length > 1
    ? config.mountPrefix.replace(/\/+$/, '')
    : '/thoughtdag'
  const trustedHosts = new Set(['localhost', '127.0.0.1', ...[...(config?.trustedHosts ?? [])].map(h => String(h).trim().toLowerCase()).filter(Boolean)])

  const api = async (req, res) => {
    try {
      const hostname = (typeof req.headers.host === 'string' ? req.headers.host : '').replace(/:\d+$/, '').toLowerCase()
      if (!trustedHosts.has(hostname)) return sendJson(res, 403, { error: 'untrusted Host header' })
      const url = new URL(req.url ?? '/', 'http://dsh.local')
      // full pathname is /<prefix>/api/<rest>; the register prefix strips /api
      const path = url.pathname.slice((prefix + '/api').length)
      // Durable sessions on disk — the archive ThoughtDAG's canvas imports.
      if (path === '/disksessions' && req.method === 'GET') {
        const dshHome = process.env.DSH_HOME || join(os.homedir(), '.dsh')
        const files = await findSessionFiles(dshHome)
        const sessions = []
        for (const f of files) {
          const head = await sessionTitleFromHead(f.log)
          sessions.push({
            id: head.id ?? f.sessionDir,
            title: head.title,
            cwd: head.cwd,
            workspaceDir: f.dir,
            size: f.size,
            mtime: f.mtime,
          })
        }
        sessions.sort((a, b) => b.mtime - a.mtime)
        return sendJson(res, 200, { sessions })
      }
      const diskOne = /^\/disksessions\/([^/]+?)(\/log)?$/.exec(path)
      if (diskOne !== null && req.method === 'GET') {
        const name = decodeURIComponent(diskOne[1])
        const dshHome = process.env.DSH_HOME || join(os.homedir(), '.dsh')
        const files = await findSessionFiles(dshHome)
        const hit = files.find(f => f.sessionDir === name || f.sessionDir.startsWith(name))
        if (!hit) return sendJson(res, 404, { error: 'no such session on disk' })
        const raw = await readFile(hit.log).catch(() => null)
        if (!raw) return sendJson(res, 500, { error: 'session unreadable' })
        if (diskOne[2] === '/log') return sendFile(res, 'application/x-ndjson; charset=utf-8', decompressZstdToText(raw))
        const head = await sessionTitleFromHead(hit.log)
        return sendJson(res, 200, { session: { id: head.id ?? hit.sessionDir, title: head.title, cwd: head.cwd, size: hit.size, mtime: hit.mtime } })
      }
      // Live sessions (this process's in-memory store).
      if (path === '/sessions' && req.method === 'GET') {
        const list = ctx.sessions.list()
        return sendJson(res, 200, { sessions: list.map(sessionSummary) })
      }
      const one = /^\/sessions\/([^/]+?)(\/log)?$/.exec(path)
      if (one !== null && req.method === 'GET') {
        const id = decodeURIComponent(one[1])
        const session = liveSession(ctx, id)
        if (session === undefined) return sendJson(res, 404, { error: 'no such session' })
        if (one[2] === '/log') return sendFile(res, 'application/x-ndjson; charset=utf-8', sessionToJsonl(session))
        return sendJson(res, 200, { session: sessionSummary(session) })
      }
      // ── the other agents' session files ──
      if (path === '/roots' && req.method === 'GET') {
        const roots = []
        for (const [key, p] of Object.entries(FILE_ROOTS)) roots.push({ key, path: p, builtin: true, exists: await stat(p).then(st => st.isDirectory()).catch(() => false) })
        return sendJson(res, 200, { roots })
      }
      const rootRoute = /^\/roots\/([a-z-]+)\/(list|head|read|range)$/.exec(path)
      if (rootRoute !== null && req.method === 'GET') {
        const key = rootRoute[1]
        if (rootRoute[2] === 'list') return sendJson(res, 200, { files: await listRoot(key) })
        const rel = url.searchParams.get('rel') ?? ''
        const abs = fileInRoot(key, rel)
        if (rootRoute[2] === 'head') return sendFile(res, 'text/plain; charset=utf-8', await headOfFile(abs, Number(url.searchParams.get('bytes')) || 16384).catch(() => ''))
        if (rootRoute[2] === 'read') {
          const st = await stat(abs).catch(() => null)
          if (!st) return sendJson(res, 404, { error: 'no such file' })
          if (st.size > FILE_READ_MAX) return sendJson(res, 413, { error: 'file too large to read whole; use range' })
          return sendFile(res, 'application/x-ndjson; charset=utf-8', await readFile(abs))
        }
        return sendJson(res, 200, await rangeOfFile(abs, url.searchParams.get('start'), url.searchParams.get('length')))
      }
      // ── model connection (the SPA's proxy protocol, on the harness's providers) ──
      if (path === '/models' && req.method === 'GET') return sendJson(res, 200, await modelsPayload(ctx))
      if ((path === '/stream' || path === '/claude') && req.method === 'POST') {
        const body = await readJson(req, MAX_CALL_BODY_BYTES)
        if (body?.model === AGENT_MODEL) {
          if (path === '/claude') {
            const r = await runAgentTurn(ctx, body, () => {}, () => false)
            return sendJson(res, 200, { text: r.text, model: AGENT_MODEL, harnessSession: r.sessionId })
          }
          res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
          let closed = false
          req.on('close', () => { closed = true })
          try {
            await runAgentTurn(ctx, body, frame => { if (!closed) res.write(`data: ${JSON.stringify(frame)}\n\n`) }, () => closed)
            if (!closed) res.write('data: [DONE]\n\n')
          } catch (error) {
            if (!closed) res.write(`data: ${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n\n`)
          }
          res.end()
          return
        }
        const target = await targetOf(ctx, body?.model)
        const options = await callOf(ctx, body, target)
        if (path === '/claude') {
          let text = ''
          for await (const chunk of ctx.llm.stream(options)) if (chunk.type === 'text-delta') text += chunk.text
          return sendJson(res, 200, { text, model: `${target.provider}/${target.model}` })
        }
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
        let closed = false
        req.on('close', () => { closed = true })
        try {
          for await (const chunk of ctx.llm.stream(options)) {
            if (closed) break
            if (chunk.type === 'text-delta' && chunk.text) res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`)
            else if (chunk.type === 'reasoning-delta' && chunk.text) res.write(`data: ${JSON.stringify({ reasoning: chunk.text })}\n\n`)
          }
          if (!closed) res.write('data: [DONE]\n\n')
        } catch (error) {
          if (!closed) res.write(`data: ${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n\n`)
        }
        res.end()
        return
      }
      // ── write direction ──
      const turnsRoute = /^\/sessions\/([^/]+)\/turns$/.exec(path)
      if (turnsRoute !== null && req.method === 'GET') {
        const id = decodeURIComponent(turnsRoute[1])
        const events = await eventsOfSession(ctx, id)
        if (events === null) return sendJson(res, 404, { error: 'no such session' })
        return sendJson(res, 200, { session: id, turns: turnsOf(events) })
      }
      const write = /^\/sessions\/([^/]+)\/(fork|inject|followup)$/.exec(path)
      if (write !== null && req.method === 'POST') {
        const id = decodeURIComponent(write[1])
        const body = await readJson(req, MAX_WRITE_BODY_BYTES)
        if (write[2] === 'fork') {
          // the boundary: an explicit seq, or the end of a named turn
          let atSeq = typeof body?.atSeq === 'number' ? body.atSeq : undefined
          if (typeof body?.afterTurn === 'number') {
            const events = await eventsOfSession(ctx, id)
            if (events === null) return sendJson(res, 404, { error: 'no such session' })
            const t = turnsOf(events).find(x => x.turn === body.afterTurn)
            if (!t) return sendJson(res, 400, { error: 'no such turn: ' + body.afterTurn })
            if (t.endSeq === null) return sendJson(res, 409, { error: 'turn ' + body.afterTurn + ' is still open; a fork needs a completed turn' })
            atSeq = t.endSeq
          }
          try {
            const r = await ctx.sessionController.fork({ sessionId: id, ...(atSeq !== undefined ? { atSeq } : {}) })
            return sendJson(res, 200, { session: r.sessionId, parent: id, atSeq: atSeq ?? null })
          } catch (error) {
            const code = error?.code ?? error?.name ?? 'fork failed'
            return sendJson(res, /NOT_FOUND/.test(String(code)) ? 404 : 409, { error: String(error?.message ?? code), code })
          }
        }
        const content = contentOf(body)
        if (write[2] === 'inject') {
          const agent = await agentOf(ctx, id)
          const message = { id: 'td-' + randomUUID(), role: 'user', content, source: SOURCE }
          agent.inject(message)
          return sendJson(res, 200, { accepted: true, session: id, messageId: message.id })
        }
        // followup: a person's prompt from the canvas — the controller owns
        // the user source and the queue/steer semantics the UI uses
        const requestId = 'td-' + randomUUID()
        const mode = body?.mode === 'steer' ? 'steer' : 'queue'
        await ctx.sessionController.prompt({ requestId, sessionId: id, mode, content }, AbortSignal.timeout(30000))
        return sendJson(res, 200, { accepted: true, session: id, requestId, mode })
      }
      return sendJson(res, 404, { error: 'not found' })
    } catch (error) {
      if (error instanceof HttpError) return sendJson(res, error.status, { error: error.message })
      ctx.logger.error(error instanceof Error ? error : new Error(String(error)))
      // the bridge only answers trusted local hosts, so the message may travel
      return sendJson(res, 500, { error: 'bridge unavailable', detail: error instanceof Error ? error.message : String(error) })
    }
  }

  const staticHandler = async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://dsh.local')
    let rel = url.pathname.slice(prefix.length).replace(/^\/+/, '') || 'index.html'
    if (rel.endsWith('/')) rel += 'index.html'
    if (url.pathname.startsWith(prefix + '/api/')) { rel = 'index.html' } // api never reaches the static table
    const abs = assetPath(rel)
    if (abs === null) { res.writeHead(403); res.end('forbidden'); return }
    try {
      const body = await readFile(abs)
      sendFile(res, MIME[extname(abs).toLowerCase()] ?? 'application/octet-stream', body)
    } catch {
      res.writeHead(404); res.end('not found')
    }
  }

  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: prefix, handler: (_req, res) => { res.writeHead(302, { location: prefix + '/' }); res.end() } }), 'thoughtdag: redirect')
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix + '/api', handler: api }), 'thoughtdag: api')
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix, handler: staticHandler }), 'thoughtdag: static')
  ctx.logger.info('[dsh-thoughtdag] ThoughtDAG mounted at ' + prefix + '/')
}
