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
        const { parseAnchor } = await import('../experiment-loop');
        const anchor = parseAnchor(head);
        if (!anchor || !projects.some((p) => p.id === anchor.project)) return;
        anchorProject = anchor.project;
        if (anchorProject !== activeId) {
          toast('info', t('atlas.mountPending'), 9000);
          return;
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
}
