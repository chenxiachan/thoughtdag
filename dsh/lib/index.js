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
//   GET  /models     the harness's model catalog in the SPA's list shape
//                    (vision from each adapter's declared input modalities)
//   POST /stream     one model call, streamed as the SPA's SSE frames; images
//                    enter the attachment store and ride the last user message
//   POST /claude     the same call, whole answer as JSON
//   POST /fetch-url  the SPA's link snapshot, through the harness's bounded fetcher
//
// The why layer inside the harness: the CLI's library (bundled as ./why.mjs at
// build time) answers the same four questions here, over the same
// ~/.thoughtdag index the CLI and the MCP server use — as native harness tools
// the agent calls like any other (why_check, why_file, why_find, why_recall),
// as a /why command a person types in the chat, and as a short system-prompt
// section that says when to ask. Relative paths resolve against the session's
// working directory.
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
import { extname, join, normalize, resolve, sep } from 'node:path'
import { createRequire } from 'node:module'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { zstdDecompressSync } from 'node:zlib'

export const name = 'thoughtdag'
export const inject = ['webServer', 'sessions', 'sessionController', 'agents', 'llm', 'attachments', 'web', 'tools', 'commands', 'systemPrompt', 'approval']

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const require = createRequire(import.meta.url)
const APP_DIR = resolve(__dirname, '../dist-app')
// the path rules for the canvas's local backup (#66); the route below shells
// this, and it is required HERE because the handler needs it in scope — inside
// agentsHttp() it would be a function-local binding the handler cannot see
const { writeBackup, BackupRequestError } = require(resolve(__dirname, 'runtime', 'backup-write.cjs'))

// The plugin's own version travels into the canvas's URL (?dv=), so the
// update dialog and the release history know which release runs here, as
// they do in the desktop shell. The registry is asked for the newest
// version at most once a day; a failed lookup is silence, not an error.
const PLUGIN_VERSION = (() => { try { return require(resolve(__dirname, '..', 'package.json')).version ?? null } catch { return null } })()
let latestLookup = { value: null, at: 0 }
async function latestPluginVersion() {
  if (Date.now() - latestLookup.at < 24 * 60 * 60 * 1000) return latestLookup.value
  latestLookup = { value: latestLookup.value, at: Date.now() }
  try {
    const r = await fetch('https://registry.npmjs.org/dsh-thoughtdag/latest', { signal: AbortSignal.timeout(5000), headers: { accept: 'application/json' } })
    if (r.ok) { const j = await r.json(); if (typeof j?.version === 'string') latestLookup.value = j.version }
  } catch { /* offline, or the registry is slow: keep what we had */ }
  return latestLookup.value
}
// the shared runtime, copied under lib/runtime by the build (Node code, no harness dependency)
let agentsHttpInstance = null
function agentsHttp() {
  if (!agentsHttpInstance) {
    const { createAgentsHttp } = require(resolve(__dirname, 'runtime', 'agents', 'http.cjs'))
    agentsHttpInstance = createAgentsHttp({ log: (line) => console.error(line) })
  }
  return agentsHttpInstance
}

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
  // the platform's separator: resolve() hands back backslashes on Windows,
  // and a check against '/' there rejects every path (issue #23)
  if (abs !== APP_DIR && !abs.startsWith(APP_DIR + sep)) return null
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

/** The events after `since`, as lines — the tail a reader appends to the
 *  log it already holds, instead of fetching the whole log again. */
function eventsJsonlSince(session, since) {
  const lines = []
  for (const event of allEvents(session)) if (typeof event.seq === 'number' && event.seq > since) lines.push(JSON.stringify(event))
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

/** Walk $DSH_HOME/sessions for the session log (2 levels deep). DSH writes the
 *  session format version into the file name: early builds used
 *  `session.jsonl.zstd`, while session format V3 (0.1.5-rc.2 and later) uses
 *  `session.v3.jsonl.zstd`. Probe the known names, newest first, so a listing
 *  keeps working across both. */
// `session.jsonl.zstd` (≤ 0.1.4), `session.v3.jsonl.zstd` (0.1.5), `session.v4.jsonl.zstd` (the 0.2
// desktop) …: the session directory is listed and the highest version wins, so the next format
// version is found before this file learns its name (the 0.2 desktop's own sessions were invisible
// while only v3 was probed)
const SESSION_LOG_RE = /^session(?:\.v(\d+))?\.jsonl\.zstd?$/
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
      let names
      try { names = await readdir(join(root, ws.name, s.name)) } catch { continue }
      const best = names.map(n => ({ n, m: SESSION_LOG_RE.exec(n) })).filter(x => x.m !== null).sort((a, b) => Number(b.m[1] ?? 0) - Number(a.m[1] ?? 0))[0]
      if (best === undefined) continue
      const log = join(root, ws.name, s.name, best.n)
      let st
      try { st = await stat(log) } catch { continue }
      out.push({ dir: ws.name, sessionDir: s.name, log, size: st.size, mtime: st.mtimeMs })
    }
  }
  return out
}

/** Cheap title from the FIRST zstd frame only (bounded read): the session
 *  header names the id+cwd; session/title arrives right after in live logs.
 *  Falls back to the session id when the frame boundary cuts early. */
const HEAD_READ_BYTES = 256 * 1024 // covers the first frames: header + title + opening turns
// a session's head is decoded once per (path, size, mtime): the listing is
// polled, and a poll must not decompress sixty files it already knows
const headCache = new Map()
async function cachedHead(f) {
  const key = `${f.log}|${f.size}|${f.mtime}`
  const hit = headCache.get(key)
  if (hit) return hit
  const head = await sessionTitleFromHead(f.log)
  if (headCache.size > 4000) headCache.clear()
  headCache.set(key, head)
  return head
}
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
  'pi-sessions': join(os.homedir(), '.pi', 'agent', 'sessions'),
}
const FILE_READ_MAX = 256 * 1024 * 1024

/** An absolute path inside a root, or a 400/404 — rel never escapes. */
function fileInRoot(rootKey, rel) {
  const root = FILE_ROOTS[rootKey]
  if (!root) throw new HttpError(404, 'no such root')
  if (typeof rel !== 'string' || !rel) throw new HttpError(400, 'rel required')
  const abs = resolve(root, rel)
  if (abs !== root && !abs.startsWith(root + sep)) throw new HttpError(400, 'rel escapes its root')
  return abs
}

/** Every session file under a root, two-to-five levels deep like the desktop's walk. */
const listCache = new Map() // rootKey → { at, files }: a walk is reused for a few seconds
const LIST_CACHE_MS = 5000
async function listRoot(rootKey) {
  const root = FILE_ROOTS[rootKey]
  if (!root) throw new HttpError(404, 'no such root')
  const hit = listCache.get(rootKey)
  if (hit && Date.now() - hit.at < LIST_CACHE_MS) return hit.files
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
  listCache.set(rootKey, { at: Date.now(), files: out })
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
 *  seeing images: a model is marked vision when its adapter declares image
 *  input; those images then enter the attachment store and ride the call. */
const AGENT_MODEL = 'harness/agent'
/** One agent entry per catalog model: 'harness/agent/<provider>/<model>'.
 *  The bare 'harness/agent' stays accepted (older canvases) and means the
 *  session's current model. */
const isAgentModelId = (id) => typeof id === 'string' && (id === AGENT_MODEL || id.startsWith(AGENT_MODEL + '/'))
function agentTargetOf(id) {
  if (!isAgentModelId(id) || id === AGENT_MODEL) return null
  const rest = id.slice(AGENT_MODEL.length + 1)
  const i = rest.indexOf('/')
  return i > 0 && i < rest.length - 1 ? { provider: rest.slice(0, i), model: rest.slice(i + 1) } : null
}
// the picker groups every agent-run entry under this key (the SPA's AGENT_PROVIDER)
const AGENT_GROUP = '__agent__'

/** Which of a provider's models take images: the adapter's declared input
 *  modalities; a name that says "vision" only when the adapter says nothing. */
async function visionIdsOf(ctx, providerId, catalogModels) {
  const out = new Set()
  try {
    for (const m of await ctx.llm.listModels(providerId)) if ((m.inputModalities ?? []).includes('image')) out.add(m.id)
    if (out.size > 0) return out
  } catch { /* provider not routable right now */ }
  for (const m of catalogModels) if (/vision/i.test(m.id) || /vision/i.test(m.name ?? '')) out.add(m.id)
  return out
}

async function modelsPayload(ctx, ownProviders = []) {
  const cat = await ctx.sessionController.modelCatalog()
  // the harness itself, as an entry: the agent loop with tools, not a bare model
  // the harness's agent loop with tools, once per model it can run on —
  // grouped with the other agent runtimes; the bare models follow by provider
  const models = []
  const agents = []
  for (const g of cat.groups ?? []) {
    const vision = await visionIdsOf(ctx, g.id, g.models ?? [])
    for (const m of g.models ?? []) {
      models.push({ id: `${g.id}/${m.id}`, name: m.name ?? m.id, provider: g.name ?? g.id, vision: vision.has(m.id) })
      agents.push({ id: `${AGENT_MODEL}/${g.id}/${m.id}`, name: `Harness · ${m.name ?? m.id}`, provider: AGENT_GROUP, vision: vision.has(m.id) })
    }
  }
  models.push(...agents)
  // the person's own interfaces follow, under their own names; a harness id wins a collision
  const own = ownModelEntries(ownProviders, new Set(models.map(m => m.id)))
  models.push(...own)
  const def = cat.default ? `${cat.default.provider}/${cat.default.model}` : null
  return {
    models,
    default: def && models.some(m => m.id === def) ? def : (models[0]?.id ?? null),
    capabilities: { webSearch: ownProviders.some(p => isOpenRouterURL(p.baseURL)), searchEngine: 'none', scholarSearch: false, vision: models.some(m => m.vision) },
    harness: { routableProviders: cat.routableProviders ?? [], failures: (cat.failures ?? []).map(f => ({ provider: f.id, message: f.message })) },
  }
}

// ── the person's own interfaces ────────────────────────────────────────
// The canvas keeps API interfaces in the browser (the same list the desktop
// app has) and sends them along with every call and with a registration
// at boot (POST /runtime-providers). Here they are spoken to directly over
// the OpenAI-compatible protocol, so a key added inside the harness works
// the way it does in the app; the harness's own models are untouched.
const OWN_PROVIDER_CAP = 12
const OWN_MODEL_CAP = 60
const isOpenRouterURL = (u) => /openrouter\.ai/i.test(String(u ?? ''))

/** The providers a request or a registration carries, sanitised. */
function ownProvidersOf(list) {
  const out = []
  for (const p of (Array.isArray(list) ? list : []).slice(0, OWN_PROVIDER_CAP)) {
    const baseURL = String(p?.baseURL ?? '').trim().replace(/\/+$/, '')
    if (!/^https?:\/\//i.test(baseURL)) continue
    const name = String(p?.name || 'Custom').slice(0, 40)
    const models = (Array.isArray(p?.models) ? p.models : [])
      .map(m => (typeof m === 'string' ? { id: m } : m))
      .filter(m => m && typeof m.id === 'string' && m.id)
      .slice(0, OWN_MODEL_CAP)
      .map(m => ({ id: m.id, ...(typeof m.vision === 'boolean' ? { vision: m.vision } : {}) }))
    if (models.length === 0) continue
    out.push({ name, baseURL, apiKey: typeof p?.apiKey === 'string' ? p.apiKey : '', models })
  }
  return out
}

/** Model entries for the picker: the model's short id and its interface's name, like the app shows them. */
function ownModelEntries(providers, taken) {
  const entries = []
  for (const p of providers) {
    for (const m of p.models) {
      if (taken.has(m.id)) continue
      taken.add(m.id)
      const shortId = m.id.includes('/') ? m.id.split('/').slice(1).join('/') : m.id
      entries.push({ id: m.id, name: `${shortId} (${p.name})`, provider: p.name, vision: m.vision })
    }
  }
  return entries
}

/** The interface a requested model belongs to, from the request's own list first, then the registered list. */
function ownTargetOf(requested, fromBody, registered) {
  if (typeof requested !== 'string' || !requested) return null
  for (const p of [...fromBody, ...registered]) if (p.models.some(m => m.id === requested)) return { provider: p, model: requested }
  return null
}

/** The canvas's { role, content } messages and images as OpenAI-compatible messages. */
function ownMessagesOf(body) {
  const messages = []
  for (const m of Array.isArray(body?.messages) ? body.messages : []) {
    if (!m || typeof m.content !== 'string') continue
    messages.push({ role: m.role === 'system' ? 'system' : m.role === 'assistant' ? 'assistant' : 'user', content: m.content })
  }
  if (messages.length === 0) throw new HttpError(400, 'messages: nothing to send')
  const images = Array.isArray(body?.images) ? body.images.filter(i => i && typeof i.data === 'string' && IMAGE_MEDIA.has(i.mimeType)) : []
  if (images.length > 0) {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role !== 'user') continue
      messages[i] = { role: 'user', content: [{ type: 'text', text: messages[i].content }, ...images.map(img => ({ type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${img.data}` } }))] }
      break
    }
  }
  return messages
}

/** One chat-completions request to the interface; the response as fetched (the caller reads it). */
async function ownRequest(target, body, stream) {
  const { provider, model } = target
  // OpenRouter searches through its `:online` variant and takes a reasoning switch; a fast call never thinks out loud
  const openrouter = isOpenRouterURL(provider.baseURL)
  const id = openrouter && body?.webSearch && !model.endsWith(':online') ? `${model}:online` : model
  const payload = { model: id, messages: ownMessagesOf(body), stream, ...(openrouter ? { reasoning: { enabled: !body?.fast } } : {}) }
  const headers = { 'content-type': 'application/json', ...(provider.apiKey ? { authorization: `Bearer ${provider.apiKey}` } : {}), ...(openrouter ? { 'HTTP-Referer': 'https://github.com/chenxiachan/thoughtdag', 'X-Title': 'ThoughtDAG' } : {}) }
  const res = await fetch(`${provider.baseURL}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(10 * 60 * 1000) })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let detail = text.slice(0, 300)
    try { const j = JSON.parse(text); detail = j?.error?.message ?? j?.message ?? detail } catch { /* not json */ }
    throw new HttpError(res.status === 401 || res.status === 403 ? 401 : 502, `${provider.name}: HTTP ${res.status}${detail ? ' · ' + detail : ''}`)
  }
  return res
}

/** Stream one answer from the interface as the canvas's frames: { text }, { reasoning }, [DONE]. */
async function ownStream(res, target, body, isClosed) {
  const upstream = await ownRequest(target, body, true)
  const decoder = new TextDecoder()
  let buffer = ''
  for await (const chunk of upstream.body) {
    if (isClosed()) break
    buffer += decoder.decode(chunk, { stream: true })
    let nl
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim(); buffer = buffer.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (data === '[DONE]') return
      let parsed
      try { parsed = JSON.parse(data) } catch { continue }
      if (parsed?.error) { res.write(`data: ${JSON.stringify({ error: parsed.error.message ?? String(parsed.error) })}\n\n`); return }
      const delta = parsed?.choices?.[0]?.delta ?? {}
      const reasoning = delta.reasoning_content ?? delta.reasoning
      if (typeof reasoning === 'string' && reasoning) res.write(`data: ${JSON.stringify({ reasoning })}\n\n`)
      if (typeof delta.content === 'string' && delta.content) res.write(`data: ${JSON.stringify({ text: delta.content })}\n\n`)
    }
  }
}

/** One whole answer from the interface (the canvas's background calls). */
async function ownCall(target, body) {
  const upstream = await ownRequest(target, body, false)
  const j = await upstream.json()
  const c = j?.choices?.[0]?.message?.content
  return typeof c === 'string' ? c : Array.isArray(c) ? c.map(x => (typeof x?.text === 'string' ? x.text : '')).join('') : ''
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
  // the canvas sends images only to a model it was told sees them; they
  // enter the attachment store first (the harness's image contract), then
  // ride the last user message as image blocks
  const images = Array.isArray(body?.images) ? body.images.filter(i => i && typeof i.data === 'string' && IMAGE_MEDIA.has(i.mimeType)) : []
  if (images.length > 0) {
    let lastUser = null
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'user') { lastUser = messages[i]; break }
    if (lastUser) {
      for (const img of images) {
        try {
          const ref = await ctx.attachments.saveImage({ data: Buffer.from(img.data, 'base64'), mediaType: img.mimeType, name: 'canvas-image' })
          lastUser.content.push({ type: 'image', attachment: ref })
        } catch (error) {
          throw new HttpError(400, 'image rejected by the harness: ' + (error instanceof Error ? error.message : String(error)))
        }
      }
    }
  }
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

// ── approvals from the canvas ──────────────────────────────────────────
// A turn launched from the canvas runs behind the harness's own approval
// panel, which the canvas view covers. So the plugin answers first: while a
// canvas turn is running, its session is registered here; an approval the
// harness asks for that session becomes an `approval` frame on the turn's
// stream, the node shows the question, and the person's answer comes back
// through POST /approvals/:id. When the canvas stream is gone, the request
// is handed down the chain (`next()`) to the harness's panel instead.

/** sessionId → the canvas turn running in it: its frame emitter, its
 *  close probe, and the tool calls seen so far (callId → name, arguments). */
const canvasTurns = new Map()
/** approval id → the resolver waiting for the person's decision */
const pendingApprovals = new Map()

const APPROVAL_OUTCOMES = new Set(['allowed-once', 'rejected'])

function installApprovalAnswerer(ctx) {
  ctx.on('approval/request', async function (req, next) {
    const entry = canvasTurns.get(req?.agent?.id)
    if (!entry) return next()
    // an approval raised by another turn of the same session (the person's
    // own tool call, running before or after ours) stays with the harness UI
    if (entry.turn === null || entry.current() !== entry.turn) return next()
    const id = 'td-' + randomUUID()
    const call = req.callId !== undefined ? entry.calls.get(req.callId) : undefined
    const name = call?.name ?? req.toolName
    entry.emit({ approval: {
      id, toolName: req.toolName, callId: req.callId ?? null, reason: req.reason ?? null,
      name, query: call ? toolQuery(name, call.arguments) : '', arguments: typeof call?.arguments === 'string' ? call.arguments : (call?.arguments ? JSON.stringify(call.arguments) : null),
    } })
    let clear
    const decision = new Promise(resolve => { pendingApprovals.set(id, { resolve, sessionId: req.agent.id }) })
    const closed = new Promise(resolve => { const t = setInterval(() => { if (entry.isClosed()) { clearInterval(t); resolve('closed') } }, 500); clear = () => clearInterval(t) })
    const aborted = new Promise(resolve => {
      if (!req.signal) return
      if (req.signal.aborted) resolve('aborted')
      else req.signal.addEventListener('abort', () => resolve('aborted'), { once: true })
    })
    const r = await Promise.race([decision, closed, aborted])
    pendingApprovals.delete(id)
    clear?.()
    if (r === 'closed') return next()
    const outcome = r === 'aborted' ? 'cancelled' : r
    entry.emit({ approvalDecided: { id, outcome } })
    return outcome
  }, true)
}

/** Run one question through the harness's agent loop, continuing a mirrored
 *  session, forking a dsh mirror at the parent's exact turn, or creating a
 *  fresh session. Report progress as SSE-style frames via `emit`; resolves
 *  when the turn ends. */
async function runAgentTurn(ctx, body, emit, isClosed, { answerApprovals = true } = {}) {
  const { question, context } = compileForAgent(body)
  // A parent that is a current ledger tail continues in place. A historical
  // dsh mirror forks at the exact turn named by its user-message id, so later
  // turns (including sibling work) cannot leak into the branch. Otherwise a
  // fresh session receives the compiled canvas context.
  const continueId = typeof body?.harness?.session === 'string' && body.harness.session ? body.harness.session : null
  const forkId = typeof body?.harness?.forkSession === 'string' && body.harness.forkSession ? body.harness.forkSession : null
  const forkAnchor = typeof body?.harness?.forkAnchor === 'string' && body.harness.forkAnchor ? body.harness.forkAnchor : null
  let sessionId = null
  let forkedFrom = null
  if (continueId && (liveSession(ctx, continueId) || (await eventsOfSession(ctx, continueId)) !== null)) {
    sessionId = continueId
  } else if (forkId && forkAnchor) {
    const events = await eventsOfSession(ctx, forkId)
    if (events !== null) {
      const turn = turnsOf(events).find(t => t.userMessageId === forkAnchor)
      if (!turn) throw new HttpError(400, 'no such fork anchor: ' + forkAnchor)
      if (turn.endSeq === null) throw new HttpError(409, 'turn ' + turn.turn + ' is still open; a fork needs a completed turn')
      sessionId = (await ctx.sessionController.fork({ sessionId: forkId, atSeq: turn.endSeq })).sessionId
      forkedFrom = forkId
    }
  }
  if (!sessionId) {
    const cwd = typeof body?.harness?.cwd === 'string' && body.harness.cwd ? { cwd: body.harness.cwd } : {}
    sessionId = (await ctx.sessionController.create({ ...cwd })).sessionId
  }
  emit({ harnessSession: sessionId, continued: sessionId === continueId, ...(forkedFrom ? { forkedFrom } : {}) })
  // a streaming caller can show and answer approvals; a one-shot caller
  // (/claude) cannot, so its requests fall through to the harness's own panel
  // turn/current are filled once our message enters the session: the approval
  // answerer uses them to take only the approvals our turn raises
  const turnEntry = { emit, isClosed, calls: new Map(), turn: null, current: () => null }
  if (answerApprovals) canvasTurns.set(sessionId, turnEntry)
  const hasImages = Array.isArray(body?.images) && body.images.length > 0
  if (hasImages) {
    const vm = await visionModel(ctx).catch(() => null)
    if (vm) await ctx.sessionController.selectModel({ sessionId, provider: vm.provider, model: vm.model }).catch(() => {})
  }
  // the model the canvas picked for this agent turn, unless images already
  // moved the session to a vision model
  const picked = agentTargetOf(body?.model)
  if (picked && !hasImages) await ctx.sessionController.selectModel({ sessionId, provider: picked.provider, model: picked.model }).catch(() => {})
  const agent = await agentOf(ctx, sessionId)
  let sawChunk = false      // text deltas reached us live
  let sawReasoning = false  // reasoning deltas reached us live
  let fullText = ''
  let done
  const finished = new Promise(resolve => { done = resolve })
  // The session is shared with the person chatting in the harness: their
  // turns may run before, after or around ours (ours is queued behind
  // whatever is running). Everything below is scoped to OUR turn. dsh stamps
  // the prompt's requestId on the user message it creates (source.rpcId), so
  // that message is recognised exactly; it names our turn, and only that
  // turn's text, tool calls, approvals and end belong to this node (#42).
  const requestId = 'td-' + randomUUID()
  let currentTurn = null
  let ourTurn = null
  let ourMessagePending = false
  const claimTurn = (turn) => { ourTurn = turn; turnEntry.turn = turn }
  const isOurs = (event) => ourTurn !== null && (typeof event.data?.turn === 'number' ? event.data.turn === ourTurn : currentTurn === ourTurn)
  turnEntry.current = () => currentTurn
  const onDelta = (c) => {
    if (c?.type === 'text-delta' && c.text) { sawChunk = true; fullText += c.text; emit({ text: c.text }) }
    else if (c?.type === 'reasoning-delta' && c.text) { sawReasoning = true; emit({ reasoning: c.text }) }
  }
  // Since 0.1.5-rc.3 the deltas are no longer rows of the session log: the
  // loop publishes them process-locally as agent/assistant-stream frames
  // (start names the turn and step, chunk carries one model delta, end
  // points at the committed assistant/message). Only OUR turn's attempts
  // are followed; the committed message still arrives on the log and is
  // then skipped as already streamed. On an older runtime this event never
  // fires and the log rows above carry the deltas as before.
  const attemptTurn = new Map()
  const offStream = ctx.on('agent/assistant-stream', ({ agent, frame }) => {
    if (agent?.session?.id !== sessionId || !frame) return
    if (frame.type === 'start') { if (typeof frame.turn === 'number') attemptTurn.set(frame.attemptId, frame.turn); return }
    const turn = attemptTurn.get(frame.attemptId)
    if (frame.type === 'end') { attemptTurn.delete(frame.attemptId); return }
    if (turn === undefined || ourTurn === null || turn !== ourTurn) return
    if (frame.type === 'chunk') onDelta(frame.chunk)
  })
  const off = ctx.on('session/event', (session, event) => {
    if (session?.id !== sessionId || !event) return
    if (event.type === 'turn/start') {
      currentTurn = event.data?.turn ?? null
      if (ourMessagePending && currentTurn !== null) { ourMessagePending = false; claimTurn(currentTurn) }
      return
    }
    // the person's question entering the surface: THIS is the turn the
    // canvas node stands for — with its id the canvas marks the node as the
    // mirror of that turn, and the live mirror does not append it a second
    // time. Only our own message counts; a message the person typed in the
    // chat meanwhile belongs to their turn, not to this node.
    if (event.type === 'user/message') {
      const source = event.data?.source
      if (ourTurn === null && !ourMessagePending && (source?.kind ?? 'user') === 'user' && source?.rpcId === requestId) {
        if (currentTurn === null) ourMessagePending = true; else claimTurn(currentTurn)
        emit({ harnessTurn: { session: sessionId, turn: currentTurn, userMessageId: event.data?.id ?? null, seq: event.seq ?? null } })
      }
      return
    }
    if (!isOurs(event)) return
    if (event.type === 'assistant/chunk') {
      // up to 0.1.5-rc.2 the deltas are rows of the session log
      onDelta(event.data?.chunk)
    } else if (event.type === 'assistant/message') {
      // deltas did not reach us live (a compacted row, or a runtime whose
      // stream we do not know): the whole step at once, reasoning first
      const blocks = event.data?.message?.content ?? []
      if (!sawReasoning) {
        const reasoning = blocks.filter(b => b.type === 'reasoning').map(b => (typeof b.text === 'string' ? b.text : '')).join('')
        if (reasoning) emit({ reasoning })
      }
      if (!sawChunk) {
        const text = blocks.filter(b => b.type === 'text').map(b => b.text).join('')
        if (text) { fullText += text; emit({ text }) }
      }
    } else if (event.type === 'tool/call' || event.type === 'tool/code-dispatch-start' || event.type === 'tool/ptc-dispatch-start') {
      if (event.data?.callId) turnEntry.calls.set(event.data.callId, { name: event.data?.name ?? 'tool', arguments: event.data?.arguments })
      emit({ tool: { name: event.data?.name ?? 'tool', query: toolQuery(event.data?.name, event.data?.arguments) } })
    } else if (event.type === 'turn/end') {
      done()
    }
  })
  try {
    const inheritsSessionContext = (continueId && sessionId === continueId) || forkedFrom
    const injectContext = inheritsSessionContext ? (typeof body?.harness?.extraContext === 'string' ? body.harness.extraContext : '') : context
    if (injectContext) agent.inject({ id: 'td-' + randomUUID(), role: 'user', content: [{ type: 'text', text: injectContext }], source: SOURCE })
    const promptContent = [{ type: 'text', text: question }]
    for (const img of Array.isArray(body?.images) ? body.images : []) {
      if (img && typeof img.data === 'string' && IMAGE_MEDIA.has(img.mimeType)) promptContent.push({ type: 'image', mediaType: img.mimeType, data: img.data })
    }
    await ctx.sessionController.prompt({ requestId, sessionId, mode: 'queue', content: promptContent }, AbortSignal.timeout(30000))
    const timeout = new Promise(resolve => setTimeout(resolve, 20 * 60 * 1000))
    const closed = new Promise(resolve => { const t = setInterval(() => { if (isClosed()) { clearInterval(t); resolve() } }, 500); finished.then(() => clearInterval(t)) })
    await Promise.race([finished, agent.whenIdle().then(() => finished), timeout, closed])
    if (isClosed()) { try { agent.cancel({ kind: 'user' }) } catch { /* best effort */ } }
  } finally {
    if (typeof off === 'function') off()
    if (typeof offStream === 'function') offStream()
    if (canvasTurns.get(sessionId) === turnEntry) canvasTurns.delete(sessionId)
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
  const payload = await modelsPayload(ctx)  // the harness's own; the person's interfaces are resolved before this is asked
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

// ── the why layer ──────────────────────────────────────────────────────

/** The working directory a session runs in, as its header records it. */
const cwdOfSession = (session) => session?.header?.cwd ?? session?.header?.meta?.cwd ?? null

/** A path the person or model typed, made absolute against the session's
 *  working directory when it is relative; URLs and arxiv ids pass through. */
function resolveAgainst(cwd, q) {
  const s = String(q ?? '').trim().replace(/^@/, '')
  if (!s || /^(https?:\/\/|arxiv:)/i.test(s) || s.startsWith('/') || !cwd) return s
  return resolve(cwd, s)
}

/** What the why layer managed to register — served at /why/status so a
 *  deployment can see it without reading logs. */
const whyStatus = { loaded: false, tools: [], command: false, prompt: false, error: null }

// the harness's tool names: one family, no collision with its own read/find tools
const TOOL_NAMES = { why_check: 'why_check', why_file: 'why_file', find: 'why_find', recall_turn: 'why_recall' }
const PATH_ARGS = new Set(['path'])

const WHY_PROMPT = `ThoughtDAG why layer. The tools why_check, why_file, why_find and why_recall read the local index of past agent conversations (Claude Code, Codex, this harness) — evidence from session logs, not opinion.
- Before editing a file that may have history, call why_check(path); if it has history, why_file(path) lists the turns that changed it: when, what was asked, what changed, and what the answer said about it.
- why_find(phrase) finds where exact words were asked or answered; why_recall(session, turn) reads one turn in full.
Cite what you learn briefly; do not restate whole turns.`

/** the loaded why library, for the HTTP routes the canvas asks (null until installWhyLayer ran) */
let whyLib = null

async function installWhyLayer(ctx, config) {
  const wantTools = config?.whyTools !== false
  const wantPrompt = config?.whyPrompt !== false
  if (!wantTools && !wantPrompt) return
  let why
  try {
    why = await import('./why.mjs')
    why.setQuiet?.(true)
  } catch (error) {
    whyStatus.error = error instanceof Error ? error.message : String(error)
    ctx.logger.warn('[dsh-thoughtdag] why layer not loaded: ' + whyStatus.error)
    console.error('[dsh-thoughtdag] why layer not loaded: ' + whyStatus.error)
    return
  }
  whyStatus.loaded = true
  whyLib = why
  const ask = async (mcpName, args, cwd) => {
    const a = { ...args }
    for (const k of PATH_ARGS) if (typeof a[k] === 'string') a[k] = resolveAgainst(cwd, a[k])
    return why.mcpCall(mcpName, a)
  }
  if (wantTools) {
    // raw definitions: the MCP tool schemas are already JSON Schema, and a
    // bare import of @deepseek-ai/dsh-tools does not resolve from a linked
    // plugin directory — the registry accepts either form
    for (const t of why.MCP_TOOLS) {
      const name = TOOL_NAMES[t.name] ?? t.name
      try {
        ctx.effect(() => ctx.tools.register({
          name,
          description: t.description,
          parameters: t.inputSchema,
          output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
          async execute(args, exec) { return ask(t.name, args ?? {}, cwdOfSession(exec?.agent?.session)) },
        }), 'thoughtdag: tool ' + name)
        whyStatus.tools.push(name)
      } catch (error) {
        whyStatus.error = `${name}: ${error instanceof Error ? error.message : String(error)}`
        console.error('[dsh-thoughtdag] tool not registered ' + whyStatus.error)
      }
    }
    ctx.effect(() => ctx.commands.register({
      name: 'why',
      description: 'ThoughtDAG: which past conversations touched this file, URL or paper',
      input: { hint: '<path | url | arxiv:id>' },
      async handler(inv) {
        const q = String(inv.rawInput ?? '').trim()
        if (!q) return { kind: 'error', text: 'usage: /why <path | url | arxiv:id>' }
        try { return { kind: 'success', text: await ask('why_file', { path: q }, cwdOfSession(inv.agent?.session)) } }
        catch (error) { return { kind: 'error', text: error instanceof Error ? error.message : String(error) } }
      },
    }), 'thoughtdag: /why')
    whyStatus.command = true
  }
  if (wantPrompt && wantTools) { ctx.effect(() => ctx.systemPrompt.section({ name: 'thoughtdag-why', order: 900, text: WHY_PROMPT }), 'thoughtdag: why prompt'); whyStatus.prompt = true }
  ctx.logger.info('[dsh-thoughtdag] why layer: ' + (wantTools ? 'why_check why_file why_find why_recall, /why' : 'no tools') + (wantPrompt && wantTools ? ', prompt section' : ''))
}

export async function apply(ctx, config) {
  const prefix = typeof config?.mountPrefix === 'string' && config.mountPrefix.startsWith('/') && config.mountPrefix.length > 1
    ? config.mountPrefix.replace(/\/+$/, '')
    : '/thoughtdag'
  const trustedHosts = new Set(['localhost', '127.0.0.1', ...[...(config?.trustedHosts ?? [])].map(h => String(h).trim().toLowerCase()).filter(Boolean)])

  // the interfaces the canvas registered (memory only: a restart forgets them, the canvas registers again at boot)
  let registeredProviders = []
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
          const head = await cachedHead(f)
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
        if (one[2] === '/log') {
          const since = url.searchParams.get('since')
          if (since !== null && since !== '') return sendFile(res, 'application/x-ndjson; charset=utf-8', eventsJsonlSince(session, Number(since)))
          return sendFile(res, 'application/x-ndjson; charset=utf-8', sessionToJsonl(session))
        }
        return sendJson(res, 200, { session: sessionSummary(session) })
      }
      if (path === '/why/status' && req.method === 'GET') return sendJson(res, 200, whyStatus)
      // ── the why layer for the canvas: find across sessions and memories, recall one turn or entry, list the memory files ──
      if (path.startsWith('/why/') && req.method === 'GET') {
        if (!whyLib) return sendJson(res, 503, { error: 'why layer not loaded', ...whyStatus })
        if (path === '/why/find') {
          const phrase = url.searchParams.get('phrase') ?? ''
          const scope = url.searchParams.get('scope') ?? 'all'
          const limit = Number(url.searchParams.get('limit') ?? 20) || 20
          const cwd = url.searchParams.get('cwd') ?? undefined
          return sendJson(res, 200, await whyLib.findJson(phrase, { scope, limit, ...(cwd ? { cwd } : {}) }))
        }
        if (path === '/why/turns') return sendJson(res, 200, await whyLib.turnsJson({ offset: Number(url.searchParams.get('offset') ?? 0) || 0, ...(url.searchParams.get('limit') === null ? {} : { limit: Number(url.searchParams.get('limit')) || 0 }), head: Number(url.searchParams.get('head') ?? 300) || 300 }))
        if (path === '/why/recall') {
          try { return sendJson(res, 200, await whyLib.recallJson(url.searchParams.get('session') ?? '', Number(url.searchParams.get('turn') ?? 0))) }
          catch (e) { return sendJson(res, 404, { error: e instanceof Error ? e.message : String(e) }) }
        }
        if (path === '/why/memories') return sendJson(res, 200, await whyLib.memoriesJson())
        if (path === '/why/suggest') return sendJson(res, 200, await whyLib.suggestJson(url.searchParams.get('term') ?? '', Number(url.searchParams.get('limit') ?? 8) || 8))
        if (path === '/why/topics') return sendJson(res, 200, await whyLib.topicsJson())
        if (path === '/why/by-topic') return sendJson(res, 200, await whyLib.byTopicJson((url.searchParams.get('ids') ?? '').split(',').filter(Boolean), { minP: Number(url.searchParams.get('minP') ?? 0.6) || 0.6, limit: Number(url.searchParams.get('limit') ?? 60) || 60 }))
        if (path === '/why/sample') return sendJson(res, 200, await whyLib.sampleQuestions(Number(url.searchParams.get('n') ?? 120) || 120))
        if (path === '/why/dossiers') return sendJson(res, 200, await whyLib.dossiersJson())
        if (path === '/why/dossier') return sendJson(res, 200, await whyLib.dossierJson(url.searchParams.get('id') ?? ''))
        if (path === '/why/dossier/new') return sendJson(res, 200, await whyLib.dossierNewTurns(url.searchParams.get('id') ?? '', { limit: Number(url.searchParams.get('limit') ?? 120) || 120 }))
      }
      if (path === '/version' && req.method === 'GET') return sendJson(res, 200, { version: PLUGIN_VERSION, latest: await latestPluginVersion(), checkedAt: latestLookup.at || null })
      // ── the other agents' session files ──
      if (path === '/roots' && req.method === 'GET') {
        const roots = []
        for (const [key, p] of Object.entries(FILE_ROOTS)) roots.push({ key, path: p, builtin: true, exists: await stat(p).then(st => st.isDirectory()).catch(() => false) })
        return sendJson(res, 200, { roots })
      }
      const rootRoute = /^\/roots\/([a-z-]+)\/(list|head|read|range|stat)$/.exec(path)
      if (rootRoute !== null && req.method === 'GET') {
        const key = rootRoute[1]
        if (rootRoute[2] === 'list') return sendJson(res, 200, { files: await listRoot(key) })
        const rel = url.searchParams.get('rel') ?? ''
        const abs = fileInRoot(key, rel)
        if (rootRoute[2] === 'stat') { const st = await stat(abs).catch(() => null); return st ? sendJson(res, 200, { size: st.size, mtime: st.mtimeMs }) : sendJson(res, 404, { error: 'no such file' }) }
        if (rootRoute[2] === 'head') return sendFile(res, 'text/plain; charset=utf-8', await headOfFile(abs, Number(url.searchParams.get('bytes')) || 16384).catch(() => ''))
        if (rootRoute[2] === 'read') {
          const st = await stat(abs).catch(() => null)
          if (!st) return sendJson(res, 404, { error: 'no such file' })
          if (st.size > FILE_READ_MAX) return sendJson(res, 413, { error: 'file too large to read whole; use range' })
          return sendFile(res, 'application/x-ndjson; charset=utf-8', await readFile(abs))
        }
        return sendJson(res, 200, await rangeOfFile(abs, url.searchParams.get('start'), url.searchParams.get('length')))
      }
      // ── link snapshots: the SPA's /api/fetch-url on the harness's bounded fetcher ──
      // ── topics: the table and the labelling job (POST) ──
      if (path.startsWith('/why/') && req.method === 'POST') {
        if (!whyLib) return sendJson(res, 503, { error: 'why layer not loaded', ...whyStatus })
        const body = await readJson(req)
        if (path === '/why/topics') return sendJson(res, 200, await whyLib.setTopics(Array.isArray(body?.topics) ? body.topics : []))
        if (path === '/why/label/start') { try { return sendJson(res, 200, await whyLib.labelStart(body?.call, body?.opts ?? {})) } catch (e) { return sendJson(res, 400, { error: e instanceof Error ? e.message : String(e) }) } }
        if (path === '/why/label/stop') return sendJson(res, 200, whyLib.labelStop())
        if (path === '/why/dossier') return sendJson(res, 200, await whyLib.setDossier(String(body?.id ?? ''), body?.dossier ?? {}))
        if (path === '/why/dossier/delete') { await whyLib.deleteDossier(String(body?.id ?? '')); return sendJson(res, 200, { ok: true }) }
        if (path === '/why/dossier/pending') return sendJson(res, 200, await whyLib.dossierAddPending(String(body?.id ?? ''), body?.item ?? { text: '' }))
      }
      // ── the judge (a System One decision endpoint) forwarded for the canvas; the key rides in the request ──
      if (path === '/judge' && req.method === 'POST') {
        const body = await readJson(req)
        const target = typeof body?.url === 'string' ? body.url.trim() : ''
        if (!/^https?:\/\//i.test(target)) return sendJson(res, 400, { error: 'url must be http(s)' })
        try {
          const r = await fetch(target, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(body.headers && typeof body.headers === 'object' ? body.headers : {}) }, body: JSON.stringify(body.body ?? {}), signal: AbortSignal.timeout(60000) })
          const text = await r.text()
          res.writeHead(r.status, { 'content-type': 'application/json; charset=utf-8' }); res.end(text || '{}'); return
        } catch (error) { return sendJson(res, 502, { error: error instanceof Error ? error.message : String(error) }) }
      }
      if (path === '/fetch-url' && req.method === 'POST') {
        const body = await readJson(req)
        const target = typeof body?.url === 'string' ? body.url.trim() : ''
        if (!/^https?:\/\//i.test(target)) return sendJson(res, 400, { error: 'url must be http(s)' })
        let r
        try { r = await ctx.web.fetch({ url: target }, AbortSignal.timeout(30000)) } catch (error) { return sendJson(res, 502, { error: error instanceof Error ? error.message : String(error) }) }
        if (r.statusCode >= 400) return sendJson(res, 502, { error: `HTTP ${r.statusCode} from ${target}` })
        const html = r.body?.kind === 'html' ? r.body.content : null
        const title = (html && /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim()) || new URL(target).hostname
        const text = html
          ? html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+\n/g, '\n').replace(/[ \t]+/g, ' ').trim()
          : String(r.body?.content ?? '')
        return sendJson(res, 200, { title, text, fetchedAt: new Date().toISOString(), ...(html ? { html } : {}), url: r.url ?? target, truncated: !!r.truncated })
      }
      // ── agent runtimes on this machine (Pi today), the same surface the desktop shell has ──
      if (path.startsWith('/agents/')) {
        const body = req.method === 'POST' ? await readJson(req, MAX_WRITE_BODY_BYTES).catch(() => null) : null
        if (await agentsHttp().handle(req, res, path, body)) return
      }
      // ── the canvas's local backup, written by THIS host (#66) ──
      // The File System Access API needs a directory handle, and Chromium's own
      // picker never returns inside the harness frame on Windows, so the canvas
      // cannot write the file itself there. It keeps the absolute path the
      // harness's own picker handed it and asks this endpoint to write instead.
      // The path rules live in runtime/backup-write.cjs so they can be tested
      // without a harness: scripts/test-backup-write.mjs.
      if (path === '/backup' && req.method === 'POST') {
        const body = await readJson(req, MAX_WRITE_BODY_BYTES).catch(() => null)
        try {
          return sendJson(res, 200, { file: await writeBackup(body) })
        } catch (error) {
          if (error instanceof BackupRequestError) return sendJson(res, 400, { error: error.message })
          return sendJson(res, 500, { error: 'could not write the backup: ' + (error instanceof Error ? error.message : String(error)) })
        }
      }
      // ── model connection (the SPA's proxy protocol, on the harness's providers) ──
      if (path === '/models' && req.method === 'GET') return sendJson(res, 200, await modelsPayload(ctx, registeredProviders))
      // the canvas registers its browser-stored interfaces at boot (and after a change): the list answers with them in it
      // the interface dialog asks an endpoint what it serves (the /models protocol standard), through this host
      if (path === '/probe-models' && req.method === 'POST') {
        const body = await readJson(req, MAX_WRITE_BODY_BYTES)
        const baseURL = String(body?.baseURL ?? '').trim().replace(/\/+$/, '')
        if (!/^https?:\/\//i.test(baseURL)) return sendJson(res, 400, { error: 'baseURL required' })
        try {
          const r = await fetch(`${baseURL}/models`, { headers: body?.apiKey ? { authorization: `Bearer ${body.apiKey}` } : {}, signal: AbortSignal.timeout(15000) })
          if (!r.ok) return sendJson(res, r.status, { error: `endpoint answered HTTP ${r.status}` })
          const j = await r.json()
          const list = Array.isArray(j?.data) ? j.data : Array.isArray(j?.models) ? j.models : []
          const models = list.map(m => ({
            id: typeof (m?.id ?? m?.name) === 'string' ? (m.id ?? m.name).replace(/^models\//, '') : '',
            ...(typeof m?.created === 'number' ? { created: m.created } : {}),
            ...(Array.isArray(m?.architecture?.input_modalities) ? { vision: m.architecture.input_modalities.includes('image') } : {}),
            ...(typeof m?.context_length === 'number' ? { contextLength: m.context_length } : {}),
          })).filter(m => m.id)
          return sendJson(res, 200, { models })
        } catch (error) {
          return sendJson(res, 502, { error: 'could not reach the endpoint: ' + (error instanceof Error ? error.message : String(error)) })
        }
      }
      if (path === '/runtime-providers' && req.method === 'POST') {
        const body = await readJson(req, MAX_CALL_BODY_BYTES)
        registeredProviders = ownProvidersOf(body?.providers)
        return sendJson(res, 200, await modelsPayload(ctx, registeredProviders))
      }
      const approvalRoute = /^\/approvals\/([^/]+)$/.exec(path)
      if (approvalRoute !== null && req.method === 'POST') {
        const id = decodeURIComponent(approvalRoute[1])
        const body = await readJson(req, MAX_WRITE_BODY_BYTES)
        const pending = pendingApprovals.get(id)
        if (!pending) return sendJson(res, 404, { error: 'no such pending approval' })
        const outcome = APPROVAL_OUTCOMES.has(body?.outcome) ? body.outcome : 'rejected'
        pending.resolve(outcome)
        return sendJson(res, 200, { id, outcome })
      }
      if ((path === '/stream' || path === '/claude') && req.method === 'POST') {
        const body = await readJson(req, MAX_CALL_BODY_BYTES)
        if (isAgentModelId(body?.model)) {
          if (path === '/claude') {
            const r = await runAgentTurn(ctx, body, () => {}, () => false, { answerApprovals: false })
            return sendJson(res, 200, { text: r.text, model: body.model, harnessSession: r.sessionId })
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
        // the person's own interface, when the model is one of theirs
        const own = ownTargetOf(body?.model, ownProvidersOf(body?.providers), registeredProviders)
        if (own) {
          if (path === '/claude') return sendJson(res, 200, { text: await ownCall(own, body), model: own.model })
          res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
          let closed = false
          req.on('close', () => { closed = true })
          try {
            await ownStream(res, own, body, () => closed)
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
  installApprovalAnswerer(ctx)
  await installWhyLayer(ctx, config)
}
