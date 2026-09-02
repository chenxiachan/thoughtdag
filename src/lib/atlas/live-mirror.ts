import { toast } from '../ui-store';
import { t, fmt } from '../../i18n';
import { identityFromHead } from './discover';

// The live mirror, phase one of the listener: when the file behind the
// ACTIVE canvas's mirrored session grows, the appendix arrives on its
// own — the "refresh" button's job, automated. importOrAppendSession is
// idempotent (the ledger knows how far the mirror reached), so a noisy
// watcher can never double-append. Anchor-mounting NEW sessions stays
// manual until the chapter ledger lands — an auto-mount without
// idempotence would stack duplicate branches.

/** The file a session id names, by FILENAME: cc files are `<id>.jsonl`,
 *  codex rollouts embed the id, a subagent file is `agent-<id>.jsonl`. A
 *  path-wide match would hit `<parent-id>/subagents/…` first for any
 *  session that ever spawned an agent. */
export function pickSessionFile<T extends { rel: string }>(files: T[], sid: string): T | undefined {
  return files.find((f) => (f.rel.split('/').pop() ?? f.rel).includes(sid));
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
      const sid = identityFromHead(head);
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

  // thoughtdag://open?session=<id> — the /thoughtdag command's front
  // door. Locate the file (filename fast path: cc files are named by
  // sessionId, codex rollouts embed it; head-scan fallback), then hand
  // it to the canonical router: resubscribe, adopt, mount or mint.
  // Land on the exact turn: after the session is on the canvas, the node
  // carrying that message id becomes the arrival focus (App centers it).
  const focusTurn = async (item: string): Promise<void> => {
    if (!item) return;
    const { useStore } = await import('../../store');
    const { useUiStore } = await import('../ui-store');
    const node = useStore.getState().nodes.find((n) => n.data.importSource?.itemIds?.includes(item));
    if (node) useUiStore.getState().setArrivalFocusNodeId(node.id);
  };

  // thoughtdag://open?canvas=<project id | name>&node=<id> — a why hit on
  // the canvas's own record: the stable id first, a name only for backups
  // written before ids travelled (and then it must be unique).
  const openCanvasLink = async (ref: string, nodeId: string): Promise<void> => {
    const { useProjects, switchProject } = await import('../../store/projects');
    const all = useProjects.getState().projects;
    const byName = all.filter((p) => p.name === ref);
    const project = all.find((p) => p.id === ref) ?? (byName.length === 1 ? byName[0] : undefined);
    if (!project) { toast('error', t('handoff.deeplinkMiss')); return; }
    await switchProject(project.id);
    if (nodeId) {
      const { useStore } = await import('../../store');
      const { useUiStore } = await import('../ui-store');
      if (useStore.getState().nodes.some((n) => n.id === nodeId)) useUiStore.getState().setArrivalFocusNodeId(nodeId);
    }
  };

  const openDeepLink = async (url: string): Promise<void> => {
    let sid = '';
    let turn = '';
    try {
      const u = new URL(url);
      const canvas = u.searchParams.get('canvas');
      if (canvas) { await openCanvasLink(canvas, u.searchParams.get('node') ?? ''); return; }
      sid = u.searchParams.get('session') ?? '';
      turn = u.searchParams.get('turn') ?? '';
    } catch { return; }
    if (!/^[A-Za-z0-9_-]{8,}$/.test(sid)) return;
    if (!/^[A-Za-z0-9_-]*$/.test(turn)) turn = '';
    const roots = await bridge.roots().catch(() => []);
    let target: { rootKey: string; rel: string } | null = null;
    for (const r of roots) {
      const ls = await bridge.list(r.key).catch(() => []);
      const byName = pickSessionFile(ls, sid);
      if (byName) { target = { rootKey: r.key, rel: byName.rel }; break; }
    }
    if (!target) {
      const files: { rootKey: string; rel: string; mtime: number }[] = [];
      for (const r of roots) {
        for (const f of await bridge.list(r.key).catch(() => [])) files.push({ rootKey: r.key, rel: f.rel, mtime: f.mtime });
      }
      files.sort((a, b) => b.mtime - a.mtime);
      for (const f of files.slice(0, 40)) {
        const head = await bridge.head(f.rootKey, f.rel, 262144).catch(() => '');
        if (head && identityFromHead(head) === sid) { target = f; break; }
      }
    }
    if (!target) { toast('error', t('handoff.deeplinkMiss')); return; }
    const { streamRunnerConversation } = await import('../adapters');
    const { importOrAppendConversation, shellSessionReader } = await import('./canonical');
    const conv = await streamRunnerConversation(shellSessionReader(target.rootKey, target.rel)).catch(() => null);
    const result = await importOrAppendConversation(conv);
    if (!result) toast('error', t('handoff.notASession'));
    else if (result.kind === 'appended') toast('success', fmt(t('atlas.liveAppended'), { n: result.turns }), 8000);
    else if (result.kind === 'mounted') toast('success', fmt(t(result.mode === 'continue' ? 'atlas.mountedChapter' : 'atlas.mountedBranch'), { n: result.turns }), 9000);
    else if (result.kind === 'imported') toast('success', fmt(t('toast.importedChats'), { n: 1, m: result.nodeCount }), 8000);
    if (result && turn) await focusTurn(turn);
  };
  bridge.onDeepLink?.((url) => { void openDeepLink(url); });
  void (async () => {
    const { bootProjects } = await import('../../store/projects');
    await bootProjects();
    const url = await bridge.pendingDeepLink?.().catch(() => null);
    if (url) void openDeepLink(url);
  })();

  // Catch-up: the offline gap. Files that changed while the app was
  // closed fired no watch events — sweep them through the same
  // idempotent pipeline once the store is hydrated. Its own watermark
  // (last processed mtime+size per file — NOT the atlas badge
  // watermark, which records what the user has SEEN) keeps every run
  // cheap: listing is stat-only, and only files that actually changed
  // since the last sweep get their heads read. First run (no watermark
  // yet) processes the freshest 30 as a baseline and marks the rest.
  const MARK_KEY = 'thoughtdag.atlas.sweepmark';
  sweep = async () => {
    const { bootProjects } = await import('../../store/projects');
    await bootProjects();
    const roots = await bridge.roots().catch(() => []);
    const files: { rootKey: string; rel: string; mtime: number; size: number }[] = [];
    for (const r of roots) {
      const ls = await bridge.list(r.key).catch(() => []);
      for (const f of ls) files.push({ rootKey: r.key, rel: f.rel, mtime: f.mtime, size: f.size });
    }
    let mark: Record<string, string> = {};
    try { mark = JSON.parse(localStorage.getItem(MARK_KEY) ?? '{}') as Record<string, string>; } catch { /* fresh */ }
    const firstRun = Object.keys(mark).length === 0;
    files.sort((a, b) => b.mtime - a.mtime);
    const todo = files.filter((f, i) => {
      const stamp = `${f.mtime}|${f.size}`;
      if (mark[`${f.rootKey}|${f.rel}`] === stamp) return false;
      return firstRun ? i < 30 : true;
    });
    for (const f of todo) await handle({ rootKey: f.rootKey, rel: f.rel });
    for (const f of files) mark[`${f.rootKey}|${f.rel}`] = `${f.mtime}|${f.size}`;
    localStorage.setItem(MARK_KEY, JSON.stringify(mark));
  };
  void sweep();
}
