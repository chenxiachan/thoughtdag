import { toast } from './ui-store';
import { t } from '../i18n';

// New-version nudge for a long-lived SPA tab: deploys land on push, but an
// open tab keeps running the bundle it loaded — bug reports of "still
// broken" are often just a stale tab. No build-pipeline versioning needed:
// this bundle knows its own hashed URL (import.meta.url), so compare it
// against the one index.html currently references. Checks when the tab
// regains focus (THE stale-tab moment) plus a slow interval; one sticky
// toast with a Refresh action, shown once per session.

const CHECK_INTERVAL_MS = 15 * 60_000;
let notified = false;

function currentBundle(): string | null {
  // This module is code-split, so its own import.meta.url is NOT the entry
  // bundle — read the entry <script> the page actually loaded instead.
  for (const s of document.querySelectorAll<HTMLScriptElement>('script[src]')) {
    const m = s.src.match(/assets\/index-[^/?#]+\.js/);
    if (m) return m[0];
  }
  return null;
}

async function liveBundle(): Promise<string | null> {
  try {
    const res = await fetch(`${window.location.pathname}?u=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const m = (await res.text()).match(/assets\/index-[^"'?#]+\.js/);
    return m ? m[0] : null;
  } catch {
    return null;
  }
}

async function check(): Promise<void> {
  if (notified) return;
  const cur = currentBundle();
  if (!cur) return; // dev server or non-hashed build: nothing to compare
  const live = await liveBundle();
  if (live && live !== cur) {
    notified = true;
    toast('info', t('update.available'), 0, {
      label: t('update.refresh'),
      run: () => window.location.reload(),
    });
  }
}

export function bootUpdateCheck(): void {
  if (import.meta.env.DEV) return;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check();
  });
  setInterval(() => void check(), CHECK_INTERVAL_MS);
}
