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
  const m = window.location.hash.match(/[#&]import-url=([^&]+)/);
  if (!m) return;
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
    const { claudeCodeSessionConversation } = await import('./adapters/claude-code-session');
    const conv = claudeCodeSessionConversation(text);
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
