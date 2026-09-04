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

type Bridge = NonNullable<Window['desktopSessions']>;
type Root = Awaited<ReturnType<Bridge['roots']>>[number];
type Listed = Awaited<ReturnType<Bridge['list']>>[number];

const ROOT_KEY = 'dsh-sessions';
const REL_SUFFIX = '/session.jsonl.zstd';
const CACHE_MS = 1500;
const POLL_MS = 2500;

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
    for (const s of live) {
      seen.add(s.id);
      const prev = index.get(s.id);
      // a live session's file grows behind its log; a seq step is the honest
      // "it changed" signal, so mtime follows the seq we observe
      const seq = typeof s.seq === 'number' ? s.seq : null;
      const moved = seq !== null && prev?.seq !== null && prev?.seq !== undefined && seq > prev.seq;
      index.set(s.id, {
        id: s.id, live: true, size: prev?.size ?? 0,
        mtime: moved || !prev ? Date.now() : prev.mtime, seq, cwd: prev?.cwd ?? null,
      });
    }
    for (const id of [...index.keys()]) if (!seen.has(id)) index.delete(id);
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
    let t = await text(e.live ? `/sessions/${encodeURIComponent(id)}/log` : `/disksessions/${encodeURIComponent(id)}/log`).catch(() => '');
    if (e.live && e.cwd) t = withHeaderCwd(t, e.cwd);
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
  const poll = async (): Promise<void> => {
    const before = new Map([...index].map(([id, e]) => [id, e.seq]));
    const now = await refreshIndex().catch(() => [] as Entry[]);
    for (const e of now) {
      if (!e.live) continue;
      const prev = before.get(e.id);
      // new live session, or one whose log moved on
      if (prev === undefined || (e.seq !== null && prev !== null && e.seq > prev)) {
        cache.delete(e.id);
        for (const cb of listeners) cb({ rootKey: ROOT_KEY, rel: relOf(e.id) });
      }
    }
    // the other agents' files: a grown mtime is the change signal
    for (const r of await fileRootsOf()) {
      for (const f of await listFiles(r.key)) {
        const k = `${r.key}|${f.rel}`;
        const prev = fileMtimes.get(k);
        fileMtimes.set(k, f.mtime);
        if (prev !== undefined && f.mtime > prev) for (const cb of listeners) cb({ rootKey: r.key, rel: f.rel });
      }
    }
  };

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
    openInCli: async (runner, _cwd, sessionId) => {
      if (runner !== 'dsh') return { opened: false, via: 'app' as const, command: '' };
      select(sessionId);
      return { opened: true, via: 'app' as const, command: '' };
    },
    openTargets: async () => ({ terminals: [], apps: [{ runner: 'dsh', name: 'DeepSeek Harness' }], prefs: { terminal: '' }, canAddCustom: false }),
    setOpenPrefs: async (prefs) => prefs,
    addTerminal: async () => null,
    watchStart: async () => {
      if (!polling) {
        polling = true;
        await refreshIndex().catch(() => {});
        window.setInterval(() => { void poll(); }, POLL_MS);
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
  });
  window.parent.postMessage({ source: 'dsh-thoughtdag', type: 'td:request-current' }, window.location.origin);
}

// ── outbound context for a question asked inside the harness ────────────
// The one place the canvas tells the harness bridge WHERE and INTO WHICH
// session a `harness/agent` question runs. Absent (returns undefined)
// everywhere but inside the embedded harness, so the send path stays
// byte-identical elsewhere.

export const HARNESS_AGENT_MODEL = 'harness/agent';

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

/** For the node about to generate: the harness routing for its request, or
 *  undefined when not embedded / not a harness-agent question. A question
 *  asked DIRECTLY off the mirrored session's current tail, with nothing else
 *  wired in, continues that session (a follow-up); any richer wiring gets a
 *  fresh session carrying the compiled context. */
export async function harnessOutbound(nodeId: string, model: string | undefined): Promise<{ cwd?: string; session?: string } | undefined> {
  if (!window.desktopSessions || model !== HARNESS_AGENT_MODEL) return undefined;
  const cwd = (await activeCanvasCwd()) ?? currentSession?.cwd ?? undefined;
  try {
    const { useStore } = await import('../../store');
    const { useProjects } = await import('../../store/projects');
    const { projects, activeId } = useProjects.getState();
    const meta = projects.find((p) => p.id === activeId);
    const ss = meta?.sourceSession;
    if (ss && ss.runner === 'dsh') {
      const incoming = useStore.getState().edges.filter((e) => e.target === nodeId);
      // exactly one parent, and it is the mirror's current tail → continue
      if (incoming.length === 1 && incoming[0].source === ss.tailNodeId) {
        return { ...(cwd ? { cwd } : {}), session: ss.sessionId };
      }
    }
  } catch { /* store not ready — fall through to a fresh session */ }
  return cwd ? { cwd } : {};
}
