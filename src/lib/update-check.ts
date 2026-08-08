import { toast } from './ui-store';
import { t, fmt } from '../i18n';

// New-version nudge for a long-lived SPA tab: deploys land on push, but an
// open tab keeps running the bundle it loaded — bug reports of "still
// broken" are often just a stale tab. No build-pipeline versioning needed:
// this bundle knows its own hashed URL (import.meta.url), so compare it
// against the one index.html currently references. Checks when the tab
// regains focus (THE stale-tab moment) plus a slow interval; one sticky
// toast with a Refresh action, shown once per session.

const CHECK_INTERVAL_MS = 15 * 60_000;
let notified = false;

// ── Desktop build channel ──
// The shell hands its version over in the URL (?dv=). The web bundle can't
// self-update a desktop install, so the nudge points at the download page
// (the shell's window-open handler routes it to the system browser).
// Anonymous GitHub API is rate-limited per IP: throttle to one look per
// half hour, sticky toast once per session.
const desktopVersion = new URLSearchParams(window.location.search).get('dv');
const DESKTOP_THROTTLE_MS = 30 * 60_000;
let notifiedDesktop = false;
let lastDesktopCheck = 0;

async function checkDesktop(): Promise<void> {
  if (!desktopVersion || notifiedDesktop) return;
  if (Date.now() - lastDesktopCheck < DESKTOP_THROTTLE_MS) return;
  lastDesktopCheck = Date.now();
  try {
    const res = await fetch('https://api.github.com/repos/chenxiachan/thoughtdag/releases?per_page=1');
    if (!res.ok) return;
    const releases = await res.json() as { tag_name?: string }[];
    const latest = releases?.[0]?.tag_name?.replace(/^v/, '');
    if (!latest || latest === desktopVersion) return;
    notifiedDesktop = true;
    toast('info', fmt(t('update.desktopAvailable'), { v: latest }), 0, {
      label: t('update.desktopDownload'),
      run: () => window.open('https://chenxiachan.github.io/thoughtdag/#download', '_blank'),
    });
  } catch { /* offline or rate-limited: try again later */ }
}

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
    if (document.visibilityState === 'visible') { void check(); void checkDesktop(); }
  });
  setInterval(() => { void check(); void checkDesktop(); }, CHECK_INTERVAL_MS);
  // desktop: one early look shortly after boot
  if (desktopVersion) setTimeout(() => void checkDesktop(), 5000);
}
