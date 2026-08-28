import { toast, useUiStore } from './ui-store';
import { t, fmt } from '../i18n';

// One-command session handoff: `/thoughtdag` starts a short-lived bridge on
// the loopback interface and opens the app with #import-url=<loopback URL>.
// The page fetches the session snapshot from the user's OWN machine and
// imports it — content never leaves the device; the fragment itself is
// never sent to any server.
//
// SECURITY: the URL must point at loopback, full stop. Without that rule
// this hash would be a remote-injection cannon — any crafted link could
// make the canvas fetch and import attacker content. On a victim's machine
// a loopback URL resolves to nothing unless THEY started a bridge.

const LOOPBACK = /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\//i;

export async function consumeSessionHandoff(): Promise<void> {
  const hash = window.location.hash;
  const m = hash.match(/[#&]import-url=([^&]+)/);
  if (!m) return;
  const harvest = /[#&]mode=harvest\b/.test(hash);
  // one-shot: strip the fragment first so a reload never re-imports
  history.replaceState(null, '', window.location.pathname + window.location.search);
  const url = decodeURIComponent(m[1]);
  if (!LOOPBACK.test(url)) {
    toast('error', t('handoff.notLoopback'), 9000);
    return;
  }
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (harvest && (await harvestIntoAnchor(text))) return;
    const { anyRunnerSessionConversation } = await import('./adapters');
    const conv = await anyRunnerSessionConversation(text);
    if (!conv) throw new Error(t('handoff.notASession'));
    const { importChatConversations } = await import('./export');
    await importChatConversations([conv]);
    // the canvas is real but browser-local; the backup dialog is the path
    // to a file on disk — offer it right here
    toast('info', fmt(t('handoff.saved'), { n: conv.messageCount }), 12000, {
      label: t('handoff.backupAction'),
      run: () => useUiStore.getState().setBackupDialogOpen(true),
    });
  } catch (err) {
    // the bridge is short-lived by design: point at the manual road instead
    toast('error', fmt(t('handoff.failed'), { msg: err instanceof Error ? err.message : String(err) }), 12000);
  }
}

/** Harvest: the experiment session hangs off the node it was compiled
 *  from — the anchor traveled inside the session's own first message.
 *  Returns false when no live anchor resolves (caller falls back to a
 *  plain import so nothing is ever lost). */
async function harvestIntoAnchor(text: string): Promise<boolean> {
  const { parseAnchor } = await import('./experiment-loop');
  const anchor = parseAnchor(text);
  if (!anchor) {
    toast('info', t('handoff.noAnchor'), 9000);
    return false;
  }
  const { useProjects, switchProject } = await import('../store/projects');
  if (useProjects.getState().activeId !== anchor.project) {
    if (!useProjects.getState().projects.some((p) => p.id === anchor.project)) {
      toast('info', t('handoff.anchorProjectGone'), 9000);
      return false;
    }
    await switchProject(anchor.project);
  }
  const { useStore } = await import('../store');
  const anchorNode = useStore.getState().nodes.find((n) => n.id === anchor.node);
  if (!anchorNode) {
    toast('info', t('handoff.anchorNodeGone'), 9000);
    return false;
  }
  const { claudeCodeSessionAsBranch } = await import('./adapters/claude-code-session');
  const branch = claudeCodeSessionAsBranch(text, {
    id: anchorNode.id,
    x: anchorNode.position.x,
    y: anchorNode.position.y,
  });
  if (!branch) return false;
  useStore.getState().pushHistory();
  useStore.setState((s) => ({ nodes: [...s.nodes, ...branch.nodes], edges: [...s.edges, ...branch.edges] }));
  useUiStore.getState().setArrivalFocusNodeId(branch.nodes[branch.nodes.length - 1].id);
  toast('success', fmt(t('handoff.harvested'), { n: branch.turnCount }), 12000);
  return true;
}
