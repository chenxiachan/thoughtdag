// window.desktopAgents over HTTP: the same surface the desktop shell
// exposes through IPC, implemented on a host's /agents endpoints — the
// harness plugin's host, or the local server. Events arrive on one
// server-sent-events feed. Installed only when the host answers; the
// hosted deployment has no machine to run an agent on and never does.

import { IN_HARNESS_FRAME } from '../embedded';

export async function installAgentsHttpBridge(apiBase: string): Promise<boolean> {
  if (window.desktopAgents) return true;
  const api = apiBase.replace(/\/+$/, '');
  let available: Record<string, string | null>;
  try {
    const r = await fetch(api + '/agents/available', { credentials: 'same-origin' });
    if (!r.ok) return false;
    available = await r.json();
  } catch { return false; }
  const post = async <T,>(path: string, body: unknown): Promise<T> => {
    const r = await fetch(api + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body ?? {}) });
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.json() as Promise<T>;
  };
  const listeners: ((p: { runId: string; event: Record<string, unknown> & { type: string } }) => void)[] = [];
  let feed: EventSource | null = null;
  const ensureFeed = () => {
    if (feed) return;
    feed = new EventSource(api + '/agents/events');
    feed.onmessage = (ev) => {
      try { const p = JSON.parse(ev.data); for (const cb of listeners) cb(p); } catch { /* a heartbeat */ }
    };
  };
  // A browser tab cannot learn an absolute path from the system's own file
  // dialog. Inside the harness the shim can: the harness has a directory
  // picker of its own (the OS dialog when it runs on this machine, its
  // in-app browser when reached remotely), and the canvas asks for it by
  // message. On a plain local server the field stays a typed path.
  const embedded = IN_HARNESS_FRAME;
  const capabilities = { nativePicker: embedded };
  const pickThroughHarness = (): Promise<string | null> => new Promise((resolve) => {
    if (!embedded) return resolve(null);
    const requestId = `cwd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const onMessage = (ev: MessageEvent) => {
      const d = ev.data as { source?: string; type?: string; requestId?: string; path?: string | null; unsupported?: boolean } | null;
      if (ev.origin !== window.location.origin || d?.source !== 'dsh-thoughtdag' || d.type !== 'td:picked-cwd' || d.requestId !== requestId) return;
      window.removeEventListener('message', onMessage);
      // a harness without the picker: the chip falls back to the typed field from now on
      if (d.unsupported) capabilities.nativePicker = false;
      resolve(typeof d.path === 'string' && d.path ? d.path : null);
    };
    window.addEventListener('message', onMessage);
    window.parent.postMessage({ source: 'dsh-thoughtdag', type: 'td:pick-cwd', requestId }, window.location.origin);
  });
  window.desktopAgents = {
    capabilities,
    available: async () => available,
    models: async (runtime) => {
      const r = await fetch(api + '/agents/models' + (runtime ? `?runtime=${encodeURIComponent(runtime)}` : ''), { credentials: 'same-origin' });
      return r.json();
    },
    run: async (request) => { ensureFeed(); const r = await post<{ runId: string }>('/agents/run', request); return r.runId; },
    abort: async (runId) => (await post<{ ok: boolean }>('/agents/abort', { runId })).ok,
    answer: async (runId, requestId, response) => (await post<{ ok: boolean }>('/agents/answer', { runId, requestId, response })).ok,
    workspace: async (canvasId) => (await post<{ dir: string }>('/agents/workspace', { canvasId })).dir,
    pickCwd: () => pickThroughHarness(),
    guardWrite: async (cwd, config) => (await post<{ ok: boolean }>('/agents/guard', { cwd, config })).ok,
    writeMaterials: async (cwd, files) => post('/agents/materials', { cwd, files }),
    // the host writes the backup file (#66). Inside the harness frame the
    // canvas has no directory handle — Chromium's picker never returns there
    // on Windows — so the backup keeps a plain path string and the host does
    // the writing. A host that does not serve /backup fails the probe-free
    // first call, and the backup falls back to the browser handle path.
    backupJson: async (dir, name, json) => post<{ file: string }>('/backup', { dir, name, json }),
    onEvent: (cb) => { listeners.push(cb); ensureFeed(); },
  };
  return true;
}
