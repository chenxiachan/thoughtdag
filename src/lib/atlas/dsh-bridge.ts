// ThoughtDAG inside DeepSeek Harness: the same session bridge the desktop
// shell exposes as window.desktopSessions, implemented over the dsh-thoughtdag
// plugin's HTTP bridge on the harness's own web server (same origin — the SPA
// is served under /thoughtdag/). Everything the atlas and the live mirror do
// with the desktop bridge works unchanged: one root ("DeepSeek Harness"),
// one file per session, the decoded JSONL as the file's text, offsets over
// that text, and a change feed driven by the live sessions' seq.
//
// "Open" means what it means here: stage the session in the harness chat.
// The plugin's client half listens for td:select-session and switches.
//
// The other agents on this machine come through the same host: it serves
// Claude Code's and Codex's session directories with the desktop bridge's
// file primitives (/roots…), so the atlas lists all three sources and a
// Claude Code or Codex session mirrors inside the harness exactly as it
// does in the desktop shell. Those files change on disk without a seq; the
// poll compares their mtimes instead.

import type { StoreApi } from 'zustand';
import type { StoreState } from '../../store/types';
import { liveTailPlan } from './live-log';
import { useUiStore } from '../ui-store';

type Bridge = NonNullable<Window['desktopSessions']>;
type Root = Awaited<ReturnType<Bridge['roots']>>[number];
type Listed = Awaited<ReturnType<Bridge['list']>>[number];

const ROOT_KEY = 'dsh-sessions';
// the bridge's rows are addressed by session id; this suffix only dresses the
// id up as the file-shaped `rel` the atlas expects and is peeled off again —
// it never touches the disk, whatever the log is actually named there
const REL_SUFFIX = '/session.jsonl.zstd';
const CACHE_MS = 1500;
const POLL_MS = 2500;
/** the cadence while the canvas is hidden (the overlay closed, or the tab in the background) */
const HIDDEN_POLL_MS = 60000;
/** a full walk of every root and the disk sessions, at most this often; in between only files that changed lately are stat'd */
const LIST_EVERY_MS = 60000;
const HOT_WINDOW_MS = 10 * 60 * 1000;

interface Entry { id: string; live: boolean; size: number; mtime: number; seq: number | null; cwd: string | null }

interface DiskSession { id: string; title?: string | null; cwd?: string | null; size: number; mtime: number }
interface FileRoot { key: string; path: string; builtin: boolean; exists: boolean }
interface FileEntry { rel: string; size: number; mtime: number }
interface LiveSession { id: string; seq?: number | null; createdAt?: number | null }

/** The harness session the chat currently shows, as its client half tells us. */
let currentSession: { id: string; title: string | null; cwd: string | null } | null = null;
export const currentDshSession = (): { id: string; title: string | null; cwd: string | null } | null => currentSession;

export function installDshSessionsBridge(apiBase: string): void {
  if (window.desktopSessions) return;
  const api = apiBase.replace(/\/+$/, '');
  const json = async <T,>(path: string): Promise<T> => {
    const r = await fetch(api + path, { credentials: 'same-origin' });
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.json() as Promise<T>;
  };
  const text = async (path: string): Promise<string> => {
    const r = await fetch(api + path, { credentials: 'same-origin' });
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.text();
  };

  // one row per session; live wins for reading (fresher), disk for size/mtime
  const index = new Map<string, Entry>();
  const relOf = (id: string): string => `${id}${REL_SUFFIX}`;
  // give the first line (the session header event) a cwd when it lacks one
  const withHeaderCwd = (t: string, cwd: string): string => {
    const nl = t.indexOf('\n');
    const first = nl < 0 ? t : t.slice(0, nl);
    try {
      const o = JSON.parse(first) as { type?: string; cwd?: string };
      if (o.type === 'session' && o.cwd === undefined) { o.cwd = cwd; return JSON.stringify(o) + (nl < 0 ? '' : t.slice(nl)); }
    } catch { /* header not json — leave it */ }
    return t;
  };
  const idOf = (rel: string): string | null => (rel.endsWith(REL_SUFFIX) ? rel.slice(0, -REL_SUFFIX.length) : null);

  const refreshIndex = async (): Promise<Entry[]> => {
    const [disk, live] = await Promise.all([
      json<{ sessions: DiskSession[] }>('/disksessions').then((d) => d.sessions).catch(() => [] as DiskSession[]),
      json<{ sessions: LiveSession[] }>('/sessions').then((d) => d.sessions).catch(() => [] as LiveSession[]),
    ]);
    const seen = new Set<string>();
    for (const s of disk) {
      seen.add(s.id);
      const prev = index.get(s.id);
      index.set(s.id, { id: s.id, live: false, size: s.size, mtime: s.mtime, seq: prev?.seq ?? null, cwd: s.cwd ?? prev?.cwd ?? null });
    }
    for (const s of live) { seen.add(s.id); mergeLive(s); }
    for (const id of [...index.keys()]) if (!seen.has(id)) index.delete(id);
    return [...index.values()];
  };
  // a live session's file grows behind its log; a seq step is the honest
  // "it changed" signal, so mtime follows the seq we observe
  const mergeLive = (s: LiveSession): void => {
    const prev = index.get(s.id);
    const seq = typeof s.seq === 'number' ? s.seq : null;
    const moved = seq !== null && prev?.seq !== null && prev?.seq !== undefined && seq > prev.seq;
    index.set(s.id, {
      id: s.id, live: true, size: prev?.size ?? 0,
      mtime: moved || !prev ? Date.now() : prev.mtime, seq, cwd: prev?.cwd ?? null,
    });
  };
  /** The live sessions only — the small list a tick can afford; disk
   *  entries stay as the last full pass left them. */
  const refreshLive = async (): Promise<Entry[]> => {
    const live = await json<{ sessions: LiveSession[] }>('/sessions').then((d) => d.sessions).catch(() => [] as LiveSession[]);
    for (const s of live) mergeLive(s);
    return [...index.values()];
  };

  // decoded text per session, briefly cached: head + read + range calls
  // arrive in bursts for the same file
  const cache = new Map<string, { at: number; seq: number | null; text: string }>();
  const textOf = async (id: string): Promise<string> => {
    const e = index.get(id) ?? (await refreshIndex(), index.get(id));
    if (!e) return '';
    const hit = cache.get(id);
    if (hit && Date.now() - hit.at < CACHE_MS && hit.seq === e.seq) return hit.text;
    let t: string;
    // a live log grows: fetch only the events past the last one we hold
    // (see liveTailPlan for why the held log, not the list's seq, decides)
    const plan = e.live ? liveTailPlan(hit?.text, e.seq) : { kind: 'full' as const };
    if (plan.kind === 'reuse' && hit) t = hit.text;
    else if (plan.kind === 'tail' && hit) {
      const tail = await text(`/sessions/${encodeURIComponent(id)}/log?since=${plan.since}`).catch(() => null);
      t = tail ? `${hit.text}\n${tail}` : hit.text;
    } else {
      t = await text(e.live ? `/sessions/${encodeURIComponent(id)}/log` : `/disksessions/${encodeURIComponent(id)}/log`).catch(() => '');
      if (e.live && e.cwd) t = withHeaderCwd(t, e.cwd);
    }
    cache.set(id, { at: Date.now(), seq: e.seq, text: t });
    return t;
  };

  // the other agents' files: root list cached per session, mtimes remembered
  // so the poll can tell which file grew
  let fileRoots: FileRoot[] | null = null;
  const fileRootsOf = async (): Promise<FileRoot[]> => {
    if (fileRoots) return fileRoots;
    fileRoots = await json<{ roots: FileRoot[] }>('/roots').then((r) => r.roots.filter((x) => x.exists)).catch(() => [] as FileRoot[]);
    return fileRoots;
  };
  const fileMtimes = new Map<string, number>(); // `${rootKey}|${rel}` → mtime
  const listFiles = async (rootKey: string): Promise<FileEntry[]> => json<{ files: FileEntry[] }>(`/roots/${encodeURIComponent(rootKey)}/list`).then((r) => r.files).catch(() => [] as FileEntry[]);
  const fileUrl = (rootKey: string, op: string, rel: string, extra = ''): string => `/roots/${encodeURIComponent(rootKey)}/${op}?rel=${encodeURIComponent(rel)}${extra}`;

  const listeners: ((e: { rootKey: string; rel: string }) => void)[] = [];
  let polling = false;
  // files that changed lately: the ones a running agent is writing. Between
  // full listings only these are stat'd — a few calls, not a walk of every root
  const hot = new Map<string, { rootKey: string; rel: string; mtime: number }>();
  let lastFullListing = 0;
  const noteFile = (rootKey: string, f: FileEntry): void => {
    const k = `${rootKey}|${f.rel}`;
    const prev = fileMtimes.get(k);
    fileMtimes.set(k, f.mtime);
    if (Date.now() - f.mtime < HOT_WINDOW_MS) hot.set(k, { rootKey, rel: f.rel, mtime: f.mtime }); else hot.delete(k);
    if (prev !== undefined && f.mtime > prev) for (const cb of listeners) cb({ rootKey, rel: f.rel });
  };
  const poll = async (): Promise<void> => {
    const full = Date.now() - lastFullListing >= LIST_EVERY_MS;
    const before = new Map([...index].map(([id, e]) => [id, e.seq]));
    // the live sessions every tick (a small list); the disk sessions with the full pass
    const now = await (full ? refreshIndex() : refreshLive()).catch(() => [] as Entry[]);
    for (const e of now) {
      if (!e.live) continue;
      const prev = before.get(e.id);
      // new live session, or one whose log moved on
      if (prev === undefined || (e.seq !== null && prev !== null && e.seq > prev)) {
        for (const cb of listeners) cb({ rootKey: ROOT_KEY, rel: relOf(e.id) });
      }
    }
    if (full) {
      lastFullListing = Date.now();
      for (const r of await fileRootsOf()) for (const f of await listFiles(r.key)) noteFile(r.key, f);
      return;
    }
    for (const h of [...hot.values()]) {
      const st = await json<{ size: number; mtime: number }>(fileUrl(h.rootKey, 'stat', h.rel)).catch(() => null);
      if (!st) { hot.delete(`${h.rootKey}|${h.rel}`); continue; }
      noteFile(h.rootKey, { rel: h.rel, size: st.size, mtime: st.mtime });
    }
  };

  // cadence follows visibility: the canvas shown polls every few seconds;
  // hidden (overlay closed, tab in the background) it looks once a minute
  // and catches up the moment it is shown again
  let shown = true;
  let timer: number | null = null;
  const visible = () => shown && document.visibilityState !== 'hidden';
  const schedule = (): void => {
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(async () => { await poll().catch(() => {}); schedule(); }, visible() ? POLL_MS : HIDDEN_POLL_MS);
  };
  const wake = (): void => { if (!polling || !visible()) return; void poll().catch(() => {}).then(schedule); };
  document.addEventListener('visibilitychange', wake);

  const select = (id: string): void => {
    window.parent.postMessage({ source: 'dsh-thoughtdag', type: 'td:select-session', session: id }, window.location.origin);
  };

  const bridge: Bridge = {
    roots: async (): Promise<Root[]> => [{ key: ROOT_KEY, path: '~/.dsh/sessions', builtin: true, exists: true }, ...(await fileRootsOf())],
    addRoot: async () => null,
    removeRoot: async () => {},
    list: async (rootKey: string): Promise<Listed[]> => {
      if (rootKey !== ROOT_KEY) {
        const files = await listFiles(rootKey);
        for (const f of files) fileMtimes.set(`${rootKey}|${f.rel}`, f.mtime);
        return files;
      }
      return (await refreshIndex()).map((e) => ({ rel: relOf(e.id), size: e.size, mtime: e.mtime }));
    },
    head: async (rootKey, rel, bytes) => {
      if (rootKey !== ROOT_KEY) return text(fileUrl(rootKey, 'head', rel, `&bytes=${Math.max(1024, bytes | 0)}`)).catch(() => '');
      const id = idOf(rel);
      if (!id) return '';
      const t = await textOf(id);
      return t.slice(0, Math.min(Math.max(1024, bytes | 0), 524288));
    },
    read: async (rootKey, rel) => {
      if (rootKey !== ROOT_KEY) return text(fileUrl(rootKey, 'read', rel)).catch(() => '');
      const id = idOf(rel);
      return id ? textOf(id) : '';
    },
    // offsets address the decoded text; chunks cut on line boundaries — the
    // same contract as the desktop's read-range over a .zstd session
    readRange: async (rootKey, rel, start, length) => {
      if (rootKey !== ROOT_KEY) {
        return json<{ text: string; nextStart: number; eof: boolean }>(fileUrl(rootKey, 'range', rel, `&start=${start | 0}&length=${length | 0}`))
          .catch(() => ({ text: '', nextStart: start | 0, eof: true }));
      }
      const id = idOf(rel);
      const t = id ? await textOf(id) : '';
      const from = Math.max(0, start | 0);
      const want = Math.min(Math.max(65536, length | 0), 32 * 1024 * 1024);
      const size = Math.min(want, Math.max(0, t.length - from));
      if (size === 0) return { text: '', nextStart: from, eof: true };
      let slice = t.slice(from, from + size);
      const eof = from + size >= t.length;
      if (!eof) {
        const lastNl = slice.lastIndexOf('\n');
        if (lastNl < 0) return { text: '', nextStart: from + size, eof: false };
        slice = slice.slice(0, lastNl + 1);
      }
      return { text: slice, nextStart: from + slice.length, eof };
    },
    // a harness session opens in the chat; another agent's session has no
    // terminal to open from a browser — the atlas hears "not opened"
    openInCli: async (runner, cwd, sessionId) => {
      if (runner === 'dsh') { select(sessionId); return { opened: true, via: 'app' as const, command: '' }; }
      // another runner's session opens in a terminal on the host's machine
      try {
        const r = await fetch(api + '/agents/open-in-cli', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ runner, cwd, sessionId }) });
        if (r.ok) { const j = await r.json() as { opened: boolean; command: string }; return { opened: !!j.opened, via: 'terminal' as const, command: j.command ?? '' }; }
      } catch { /* no host for it */ }
      return { opened: false, via: 'app' as const, command: '' };
    },
    openTargets: async () => ({ terminals: [], apps: [{ runner: 'dsh', name: 'DeepSeek Harness' }], prefs: { terminal: '' }, canAddCustom: false }),
    setOpenPrefs: async (prefs) => prefs,
    addTerminal: async () => null,
    watchStart: async () => {
      if (!polling) {
        polling = true;
        await refreshIndex().catch(() => {});
        lastFullListing = Date.now();
        for (const r of await fileRootsOf()) for (const f of await listFiles(r.key)) noteFile(r.key, f);
        schedule();
      }
      return true;
    },
    onSessionsChanged: (cb) => { listeners.push(cb); },
  };
  window.desktopSessions = bridge;

  // the client half tells us which session the chat shows; keep it for the
  // canvas to offer "mirror this one" and to name a fork's parent
  window.addEventListener('message', (ev: MessageEvent) => {
    const d = ev.data as { source?: string; type?: string; session?: { id: string; title: string | null; cwd: string | null } | null } | null;
    if (ev.origin !== window.location.origin || d?.source !== 'dsh-thoughtdag') return;
    if (d.type === 'td:current-session') {
      currentSession = d.session ?? null;
      window.dispatchEvent(new CustomEvent('td:dsh-current', { detail: currentSession }));
    }
    if (d.type === 'td:view') {
      const was = shown;
      const v = d as { shown?: boolean; bar?: boolean; desktop?: boolean; pill?: boolean };
      shown = v.shown !== false;
      // the host says whether its title band carries the 对话|思维图 switch, whether it keeps the floating
      // pill for both views (then the canvas hides its own — the iframe starts below the strip, the twin
      // could never sit at strip height, #61), and whether it is the desktop app
      if (v.bar !== undefined || v.desktop !== undefined || v.pill !== undefined) useUiStore.getState().setHarnessHost({ bar: !!v.bar, desktop: !!v.desktop, pill: !!v.pill });
      if (shown && !was) wake(); else if (!shown && was) schedule();
    }
  });
  window.parent.postMessage({ source: 'dsh-thoughtdag', type: 'td:request-current' }, window.location.origin);
  // the host's title band names the canvas: told now and on every switch (a lazy import keeps the store cycle out)
  void import('../../store/projects').then(({ useProjects }) => {
    let last: string | null = null;
    const tell = () => {
      const st = useProjects.getState();
      const name = st.projects.find((pr) => pr.id === st.activeId)?.name ?? '';
      if (name === last) return;
      last = name;
      window.parent.postMessage({ source: 'dsh-thoughtdag', type: 'td:title', name }, window.location.origin);
    };
    tell(); useProjects.subscribe(tell);
  });
}

// ── outbound context for a question asked inside the harness ────────────
// The one place the canvas tells the harness bridge WHERE and INTO WHICH
// session a `harness/agent` question runs. Absent (returns undefined)
// everywhere but inside the embedded harness, so the send path stays
// byte-identical elsewhere.

export const HARNESS_AGENT_MODEL = 'harness/agent';
/** The bare entry or one of its per-model forms ('harness/agent/<provider>/<model>'). */
export const isHarnessAgentModel = (id: string | undefined | null): boolean => !!id && (id === HARNESS_AGENT_MODEL || id.startsWith(HARNESS_AGENT_MODEL + '/'));

/** The working directory a fresh agent turn should run in: the project the
 *  active canvas mirrors, else the session the harness chat currently shows. */
async function activeCanvasCwd(): Promise<string | null> {
  try {
    const { useStore } = await import('../../store');
    const counts = new Map<string, number>();
    for (const n of useStore.getState().nodes) {
      const c = n.data.importSource?.cwd;
      if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    let best: string | null = null; let bestN = 0;
    for (const [c, n] of counts) if (n > bestN) { best = c; bestN = n; }
    return best;
  } catch { return null; }
}

type HarnessRoute = { cwd?: string; session?: string; forkSession?: string; forkAnchor?: string };

/** For the node about to generate: the harness routing for its request, or
 *  undefined when not embedded / not a harness-agent question. A simple
 *  child continues when its parent is the tail of ANY dsh ledger entry
 *  (main, chapter or branch). A dsh mirror parent that is not a current tail
 *  forks at that parent's own turn, identified by its user-message id. Any
 *  richer wiring, or a parent without an exact turn anchor, gets a fresh
 *  session carrying the compiled canvas context. */
export async function harnessOutbound(nodeId: string, model: string | undefined): Promise<HarnessRoute | undefined> {
  if (!window.desktopSessions || !isHarnessAgentModel(model)) return undefined;
  const { useProjects } = await import('../../store/projects');
  const { projects, activeId } = useProjects.getState();
  // the folder the person chose for this canvas first, then the project the
  // canvas mirrors, then the session the chat shows
  const chosen = projects.find((p) => p.id === activeId)?.agentCwd;
  const cwd = chosen ?? (await activeCanvasCwd()) ?? currentSession?.cwd ?? undefined;
  try {
    const { useStore } = await import('../../store');
    const ss = projects.find((p) => p.id === activeId)?.sourceSession;
    const { nodes, edges } = useStore.getState();
    const incoming = edges.filter((e) => e.target === nodeId);
    if (incoming.length === 1) {
      const parentId = incoming[0].source;
      // The live mirror may file a harness-created session under chapters or
      // branches rather than the placeholder main entry. Search the complete
      // ledger exactly as agentOutbound does for Pi/Codex/Claude Code.
      const entries = ss
        ? [ss, ...(ss.chapters ?? []), ...(ss.branches ?? [])].filter((e) => e.runner === 'dsh' && e.sessionId)
        : [];
      const tailEntry = entries.find((e) => e.tailNodeId === parentId);
      if (tailEntry) {
        return { ...(cwd ? { cwd } : {}), session: tailEntry.sessionId };
      }

      // A historical/non-tail dsh mirror must fork at the parent's OWN turn,
      // never at the session's latest turn: otherwise a sibling or later turn
      // can leak into this branch. itemIds[0] is the user's message id for the
      // mirrored turn and the host resolves it to that turn's endSeq.
      const parent = nodes.find((n) => n.id === parentId);
      const source = parent?.data.importSource;
      if (source?.runner === 'dsh' && source.sessionId && source.itemIds?.[0]) {
        return {
          ...(cwd ? { cwd } : {}),
          forkSession: source.sessionId,
          forkAnchor: source.itemIds[0],
        };
      }
    }
  } catch { /* store not ready — fall through to a fresh session */ }
  return cwd ? { cwd } : {};
}

type HarnessTurnRef = { session: string; turn: number | null; userMessageId: string | null; seq: number | null };

/** Provenance for a node that IS a dsh turn: runner, session, the person's
 *  message id (the deep-link and dedup key), the project it ran in. */
const stampProvenance = (
  set: StoreApi<StoreState>['setState'], nodeId: string, sessionId: string, route: HarnessRoute,
  userMessageId: string | null, source?: { question: string; response: string },
): void => {
  const itemIds = userMessageId ? [userMessageId] : [];
  set((s) => ({
    nodes: s.nodes.map((n) => (n.id === nodeId
      ? { ...n, data: { ...n.data,
          importSource: { runner: 'dsh', sessionId, itemIds, ...(route.cwd ? { cwd: route.cwd } : {}) },
          ...(source ? { source } : {}) } }
      : n)),
  }));
};

/** A tail follow-up continued the canvas's mirrored session: the new turn is
 *  a live node AND, to the live sweep, an unimported appendix — advance the
 *  ledger so it is only the node. A fresh session (route.session absent) has
 *  no ledger entry and is not swept. Returns whether an entry was advanced. */
async function advanceLedger(routeSession: string | undefined, nodeId: string): Promise<boolean> {
  if (!routeSession) return false;
  const { useProjects, patchLedgerEntry } = await import('../../store/projects');
  const { projects, activeId } = useProjects.getState();
  if (!activeId) return false;
  const ss = projects.find((p) => p.id === activeId)?.sourceSession;
  if (!ss) return false;
  const entry = ss.sessionId === routeSession ? ss
    : ss.chapters?.find((c) => c.sessionId === routeSession)
    ?? ss.branches?.find((b) => b.sessionId === routeSession);
  if (!entry) return false;
  await patchLedgerEntry(activeId, routeSession, { importedCount: entry.importedCount + 1, tailNodeId: nodeId });
  return true;
}

/** The moment the bridge names the dsh turn a question created, claim it:
 *  the node becomes that turn's mirror NOW — provenance stamped, ledger
 *  advanced — while the agent is still working. The live sweep polls every
 *  few seconds; a turn that runs longer than that would otherwise be seen
 *  as new and appended a second time before the completion stamp. Returns
 *  whether the ledger was advanced, so the completion stamp does not count
 *  the turn twice. No-op outside the harness. */
export async function claimHarnessTurn(
  set: StoreApi<StoreState>['setState'],
  nodeId: string,
  route: HarnessRoute,
  turn: HarnessTurnRef,
): Promise<boolean> {
  if (!window.desktopSessions) return false;
  stampProvenance(set, nodeId, route.session ?? turn.session, route, turn.userMessageId);
  return advanceLedger(route.session, nodeId);
}

/** After a harness-agent generation completes: the final provenance and the
 *  source snapshot (question, response) on the node. The ledger was normally
 *  advanced by {@link claimHarnessTurn} when the turn was named; only when
 *  that frame never arrived is it advanced here. No-op outside the harness. */
export async function stampHarnessTurn(
  set: StoreApi<StoreState>['setState'],
  _get: StoreApi<StoreState>['getState'],
  nodeId: string,
  turn: { question: string; response: string },
  route: HarnessRoute,
  harnessSession: string | undefined,
  harnessTurn: HarnessTurnRef | null,
  ledgerAdvanced = false,
): Promise<void> {
  if (!window.desktopSessions) return;
  const sessionId = route.session ?? harnessTurn?.session ?? harnessSession;
  if (!sessionId) return;
  stampProvenance(set, nodeId, sessionId, route, harnessTurn?.userMessageId ?? null, { question: turn.question, response: turn.response });
  if (!ledgerAdvanced) await advanceLedger(route.session, nodeId);
}
