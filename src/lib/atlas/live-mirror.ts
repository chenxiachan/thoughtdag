import { toast } from '../ui-store';
import { t, fmt } from '../../i18n';

// The live mirror, phase one of the listener: when the file behind the
// ACTIVE canvas's mirrored session grows, the appendix arrives on its
// own — the "refresh" button's job, automated. importOrAppendSession is
// idempotent (the ledger knows how far the mirror reached), so a noisy
// watcher can never double-append. Anchor-mounting NEW sessions stays
// manual until the chapter ledger lands — an auto-mount without
// idempotence would stack duplicate branches.

function sessionIdFromHead(head: string): string | null {
  for (const raw of head.split('\n')) {
    try {
      const line = JSON.parse(raw) as { type?: string; sessionId?: string; payload?: { id?: string } };
      if (line.type === 'session_meta' && line.payload?.id) return line.payload.id;
      if (typeof line.sessionId === 'string') return line.sessionId;
    } catch { /* truncated head tail */ }
  }
  return null;
}

let started = false;
let sweep: (() => Promise<void>) | null = null;

/** Sweep the freshest session files through the idempotent pipeline —
 *  the offline/inactive gap closer. Called at startup and on every
 *  canvas arrival (the live watcher only serves the ACTIVE canvas, so
 *  a canvas you switch TO may have missed its sessions' growth). */
export function sweepRecentSessions(): void {
  void sweep?.();
}

export function startLiveMirror(): void {
  const bridge = window.desktopSessions;
  if (!bridge || started) return;
  started = true;
  void bridge.watchStart();

  let busy = false;
  let dirty: { rootKey: string; rel: string } | null = null;

  const handle = async (ev: { rootKey: string; rel: string }): Promise<void> => {
    if (busy) { dirty = ev; return; }
    busy = true;
    try {
      // anyone listening for atlas-level freshness (badges, folder counts)
      window.dispatchEvent(new CustomEvent('td:sessions-changed'));
      const { useProjects, subscribedSessionIds } = await import('../../store/projects');
      const { activeId, projects } = useProjects.getState();
      const activeMeta = projects.find((p) => p.id === activeId);
      const head = await bridge.head(ev.rootKey, ev.rel, 262144).catch(() => '');
      if (!head) return;
      const sid = sessionIdFromHead(head);
      if (!sid) return;

      const subscribedHere = !!activeMeta && subscribedSessionIds(activeMeta).includes(sid);
      let anchorProject: string | null = null;
      if (!subscribedHere) {
        // a NEW session: if its opening carries a live anchor, the mount
        // is automatic — the harvest command's job, command-free. Only
        // the ACTIVE canvas mounts eagerly; other targets get a hint
        // (opening that canvas or clicking the card mounts it then,
        // through the same anchor-first canonical path).
        const anyRegistered = projects.some((p) => subscribedSessionIds(p).includes(sid));
        if (anyRegistered) return; // another canvas's session; not ours to touch
        // the ACTIVE canvas may hold this session's mirror nodes without
        // a ledger entry (a healed-away subscription): let the canonical
        // router adopt it at the break point instead of ignoring it
        const { useStore } = await import('../../store');
        const activeHasProvenance = useStore.getState().nodes.some((n) => n.data.importSource?.sessionId === sid);
        if (!activeHasProvenance) {
          const { parseAnchor } = await import('../experiment-loop');
          const anchor = parseAnchor(head);
          if (!anchor || !projects.some((p) => p.id === anchor.project)) return;
          anchorProject = anchor.project;
          if (anchorProject !== activeId) {
            toast('info', t('atlas.mountPending'), 9000);
            return;
          }
        }
      }

      const { streamRunnerConversation } = await import('../adapters');
      const { importOrAppendConversation, shellSessionReader } = await import('./canonical');
      const conv = await streamRunnerConversation(shellSessionReader(ev.rootKey, ev.rel)).catch(() => null);
      const result = await importOrAppendConversation(conv);
      if (result?.kind === 'appended') {
        toast('success', fmt(t('atlas.liveAppended'), { n: result.turns }), 8000);
      } else if (result?.kind === 'mounted') {
        toast('success', fmt(t(result.mode === 'continue' ? 'atlas.mountedChapter' : 'atlas.mountedBranch'), { n: result.turns }), 9000);
      }
    } finally {
      busy = false;
      if (dirty) { const next = dirty; dirty = null; void handle(next); }
    }
  };

  bridge.onSessionsChanged((ev) => { void handle(ev); });

  // Catch-up: the offline gap. Files that changed while the app was
  // closed fired no watch events — sweep the freshest files through the
  // same idempotent pipeline once the store is hydrated, so the active
  // canvas's mirror settles on arrival instead of waiting for the next
  // keystroke in the CLI.
  sweep = async () => {
    const { bootProjects } = await import('../../store/projects');
    await bootProjects();
    const roots = await bridge.roots().catch(() => []);
    const files: { rootKey: string; rel: string; mtime: number }[] = [];
    for (const r of roots) {
      const ls = await bridge.list(r.key).catch(() => []);
      for (const f of ls) files.push({ rootKey: r.key, rel: f.rel, mtime: f.mtime });
    }
    files.sort((a, b) => b.mtime - a.mtime);
    for (const f of files.slice(0, 30)) await handle({ rootKey: f.rootKey, rel: f.rel });
  };
  void sweep();
}
