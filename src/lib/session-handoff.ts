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
    void harvest; // legacy flag: anchor-first mounting is built into the canonical path now
    // canonical contract: a session already on a canvas OPENS that canvas
    // (appending only what's new); an anchored experiment session mounts
    // where it departed from — no separate harvest machinery
    const { importOrAppendSession } = await import('./atlas/canonical');
    const result = await importOrAppendSession(text);
    if (!result) throw new Error(t('handoff.notASession'));
    if (result.kind === 'appended') {
      toast('success', fmt(t('atlas.appended'), { n: result.turns }), 9000);
    } else if (result.kind === 'mounted') {
      toast('success', fmt(t(result.mode === 'continue' ? 'atlas.mountedChapter' : 'atlas.mountedBranch'), { n: result.turns }), 12000);
    } else if (result.kind === 'opened') {
      toast('info', t('atlas.upToDate'), 6000);
    } else {
      // the canvas is real but browser-local; the backup dialog is the path
      // to a file on disk — offer it right here
      toast('info', fmt(t('handoff.saved'), { n: result.nodeCount }), 12000, {
        label: t('handoff.backupAction'),
        run: () => useUiStore.getState().setBackupDialogOpen(true),
      });
    }
  } catch (err) {
    // the bridge is short-lived by design: point at the manual road instead
    toast('error', fmt(t('handoff.failed'), { msg: err instanceof Error ? err.message : String(err) }), 12000);
  }
}
