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
      const { useProjects } = await import('../../store/projects');
      const { activeId, projects } = useProjects.getState();
      const ledger = projects.find((p) => p.id === activeId)?.sourceSession;
      if (!ledger) return;
      const head = await bridge.head(ev.rootKey, ev.rel, 262144).catch(() => '');
      if (!head || sessionIdFromHead(head) !== ledger.sessionId) return;
      const { streamRunnerConversation } = await import('../adapters');
      const { importOrAppendConversation, shellSessionReader } = await import('./canonical');
      const conv = await streamRunnerConversation(shellSessionReader(ev.rootKey, ev.rel)).catch(() => null);
      const result = await importOrAppendConversation(conv);
      if (result?.kind === 'appended') {
        toast('success', fmt(t('atlas.liveAppended'), { n: result.turns }), 8000);
      }
    } finally {
      busy = false;
      if (dirty) { const next = dirty; dirty = null; void handle(next); }
    }
  };

  bridge.onSessionsChanged((ev) => { void handle(ev); });
}
