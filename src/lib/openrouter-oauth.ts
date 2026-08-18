import { toast, useUiStore } from './ui-store';
import { t, fmt } from '../i18n';
import { API_BASE } from './constants';

// Sign in with OpenRouter (OAuth PKCE): the officially supported one-click
// door. No app registration, no client secret, no server of ours anywhere
// in the loop — the verifier waits in sessionStorage for the round-trip,
// the code→key exchange happens in this browser (the endpoint sends CORS),
// and the minted key lands in localStorage exactly like a pasted one. The
// user can revoke it any time from their OpenRouter keys page.
//
// Two shapes of the same flow:
// - Web: same-window redirect; the callback returns to this URL and
//   consumeOpenRouterCallback() picks it up at boot.
// - Desktop shell: the consent page belongs in the SYSTEM browser (that is
//   where the user is already signed in — the shell's window is a clean
//   session). The callback lands on the bundled local server, the app polls
//   the code out, and the exchange still happens right here, verifier and
//   key never leaving the app.

const VERIFIER_KEY = 'thoughtdag.orVerifier';
const AUTH_URL = 'https://openrouter.ai/auth';
const EXCHANGE_URL = 'https://openrouter.ai/api/v1/auth/keys';

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function makeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(digest));
}

/** Open the OpenRouter consent page. Web: same-window redirect (resolved at
    next boot). Desktop: system browser + local-server callback, resolved in
    place — toasts report the outcome, the caller fires and forgets. */
export async function startOpenRouterOAuth(): Promise<void> {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = await makeChallenge(verifier);

  if (window.desktop) {
    const callback = `${location.origin}/oauth/openrouter`;
    window.open(`${AUTH_URL}?callback_url=${encodeURIComponent(callback)}&code_challenge=${challenge}&code_challenge_method=S256`);
    toast('info', t('provider.oauthBrowserWait'));
    const code = await pollDesktopCallback();
    if (!code) {
      toast('error', fmt(t('provider.oauthFailed'), { error: t('provider.oauthTimeout') }));
      return;
    }
    const r = await exchangeAndConnect(code, verifier);
    if (r.status === 'minted') {
      toast('success', t('provider.oauthMinted'));
      // the return signal: the modal opens on the model-picking view with
      // the key filled in and the catalog probed — the USER confirms which
      // models to enable; nothing is saved silently on their behalf
      handMintedKeyToModal(r.key);
    } else {
      toast('error', fmt(t('provider.oauthFailed'), { error: r.error }));
    }
    return;
  }

  sessionStorage.setItem(VERIFIER_KEY, verifier);
  const callback = `${location.origin}${location.pathname}`;
  location.href = `${AUTH_URL}?callback_url=${encodeURIComponent(callback)}&code_challenge=${challenge}&code_challenge_method=S256`;
}

/** Poll the bundled server for the code the browser callback parked there.
    3s cadence, 5-minute window — consent is a human in another window. */
async function pollDesktopCallback(): Promise<string | null> {
  for (let i = 0; i < 100; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const res = await fetch(`${API_BASE}/oauth/openrouter/code`);
      const { code } = await res.json() as { code?: string | null };
      if (code) return code;
    } catch { /* server hiccup: keep polling */ }
  }
  return null;
}

export type OAuthResult =
  | { status: 'minted'; key: string }
  | { status: 'failed'; error: string }
  | null;

/** Park the minted key for the ApiKeyModal and open it: the modal's pickup
    effect selects the OpenRouter preset, fills the key and probes the
    catalog with the recommended set pre-checked — the user saves. */
export function handMintedKeyToModal(key: string): void {
  useUiStore.getState().setOauthMintedKey(key);
  useUiStore.getState().setApiKeyModalOpen(true);
}

/** Consume a pending ?code= callback at boot. Returns null when there is none.
    The verifier is cleared and the URL cleaned BEFORE the exchange, so a
    reload can never retry a spent code. */
export async function consumeOpenRouterCallback(): Promise<OAuthResult> {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!code || !verifier) return null;
  sessionStorage.removeItem(VERIFIER_KEY);
  params.delete('code');
  const qs = params.toString();
  history.replaceState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
  return exchangeAndConnect(code, verifier);
}

/** code + verifier → minted key. The key is handed to the ApiKeyModal for
    the user's model confirmation — the exchange itself saves nothing. */
async function exchangeAndConnect(code: string, verifier: string): Promise<Exclude<OAuthResult, null>> {
  try {
    const res = await fetch(EXCHANGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { key } = await res.json() as { key?: string };
    if (!key) throw new Error('no key in exchange response');
    return { status: 'minted', key };
  } catch (err) {
    return { status: 'failed', error: err instanceof Error ? err.message : String(err) };
  }
}
