import {
  PROVIDER_PRESETS, type RuntimeProvider,
  probeModels, pushProviders, saveProviders, storedProviders,
} from './runtime-providers';
import { setModelsCache } from './use-models';
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
    if (r.status === 'connected') {
      toast('success', fmt(t('provider.oauthConnected'), { n: r.n }));
      // the return signal: the setup modal closes, the model picker opens
      // on the fresh list — the screen answers "it worked" by itself
      useUiStore.getState().setApiKeyModalOpen(false);
      useUiStore.getState().pingModelPicker();
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
  | { status: 'connected'; n: number }
  | { status: 'failed'; error: string }
  | null;

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

/** code + verifier → minted key → registered provider. Shared by both flows. */
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
    const n = await connectOpenRouterKey(key);
    return { status: 'connected', n };
  } catch (err) {
    return { status: 'failed', error: err instanceof Error ? err.message : String(err) };
  }
}

/** Register a freshly minted key as a provider: probe the catalog, keep the
    recommended set (newest 8 as fallback), replace any existing OpenRouter
    entry, push to the proxy. Same end state as the paste flow. */
async function connectOpenRouterKey(key: string): Promise<number> {
  const preset = PROVIDER_PRESETS.find((p) => p.id === 'openrouter')!;
  const catalog = await probeModels(preset.baseURL, key);
  const rec = new Set(preset.recommend ?? []);
  let picked = catalog.filter((m) => rec.has(m.id));
  if (picked.length === 0) {
    picked = [...catalog].sort((a, b) => (b.created ?? 0) - (a.created ?? 0)).slice(0, 8);
  }
  const provider: RuntimeProvider = {
    preset: preset.id, name: preset.name, baseURL: preset.baseURL, apiKey: key,
    models: picked.map((m) => ({
      id: m.id,
      ...(m.vision ? { vision: true } : {}),
      ...(m.contextLength ? { contextLength: m.contextLength } : {}),
    })),
  };
  const next = [...storedProviders().filter((p) => p.baseURL !== preset.baseURL), provider];
  const fresh = await pushProviders(next);
  saveProviders(next);
  setModelsCache(fresh);
  return provider.models.length;
}
