import { useState } from 'react';
import { createPortal } from 'react-dom';
import { KeyRound, Loader2, X } from 'lucide-react';
import { useUiStore, toast } from '../../lib/ui-store';
import { useModels, setModelsCache } from '../../lib/use-models';
import { pushRuntimeKey, RUNTIME_KEY_LS, RUNTIME_MODELS_LS, RUNTIME_DEFAULT_MODELS, storedRuntimeKey } from '../../lib/runtime-key';
import { useT, fmt } from '../../i18n';

// The .env-free path in: paste an OpenRouter key, pick model slugs, go.
// The key lives in localStorage + the proxy's memory only — the dialog
// says so, because "where does my key go" is the first question anyone
// pasting a key should ask.

export default function ApiKeyModal() {
  const t = useT();
  const open = useUiStore((s) => s.apiKeyModalOpen);
  const setOpen = useUiStore((s) => s.setApiKeyModalOpen);
  const data = useModels();
  const stored = storedRuntimeKey();
  const [key, setKey] = useState(stored?.key ?? '');
  const [models, setModels] = useState((stored?.models ?? RUNTIME_DEFAULT_MODELS).join('\n'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!open) return null;

  const modelCount = data?.models.length ?? 0;

  const save = async () => {
    const k = key.trim();
    if (!k) return;
    setBusy(true);
    setError('');
    try {
      const slugs = models.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
      const fresh = await pushRuntimeKey(k, slugs);
      localStorage.setItem(RUNTIME_KEY_LS, k);
      localStorage.setItem(RUNTIME_MODELS_LS, slugs.join(','));
      setModelsCache(fresh);
      toast('success', fmt(t('apikey.saved'), { n: fresh.models.length }));
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    try {
      const fresh = await pushRuntimeKey('');
      localStorage.removeItem(RUNTIME_KEY_LS);
      localStorage.removeItem(RUNTIME_MODELS_LS);
      setModelsCache(fresh);
      setKey('');
      toast('info', t('apikey.cleared'));
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return createPortal((
    <div className="fixed inset-0 z-[60] bg-ink/30 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setOpen(false)}>
      <div className="bg-card rounded-2xl shadow-2xl border border-line w-[520px] max-h-[85vh] overflow-y-auto flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 py-3 border-b border-line shrink-0">
          <KeyRound size={15} strokeWidth={1.75} className="text-accent shrink-0" />
          <span className="text-sm font-semibold text-ink flex-1">{t('apikey.title')}</span>
          <button onClick={() => setOpen(false)} className="text-ink-faint hover:text-ink w-7 h-7 rounded-lg hover:bg-wash flex items-center justify-center transition-colors shrink-0">
            <X size={15} strokeWidth={1.75} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {modelCount === 0 ? (
            <p className="text-xs text-ink-muted leading-relaxed">{t('apikey.introEmpty')}</p>
          ) : (
            <p className="text-xs text-ink-muted leading-relaxed">{fmt(t('apikey.introHasEnv'), { n: modelCount })}</p>
          )}

          <div>
            <label className="text-2xs font-medium text-ink-muted block mb-1.5">{t('apikey.keyLabel')}</label>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="sk-or-…"
              autoFocus
              className="w-full bg-wash text-sm text-ink font-mono rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent/40 placeholder-ink-faint"
              data-apikey-input
            />
            <p className="text-2xs text-ink-faint mt-1.5 leading-relaxed">
              {t('apikey.keyHint')}{' '}
              <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="text-accent hover:underline">openrouter.ai/keys</a>
            </p>
          </div>

          <div>
            <label className="text-2xs font-medium text-ink-muted block mb-1.5">{t('apikey.modelsLabel')}</label>
            <textarea
              value={models}
              onChange={(e) => setModels(e.target.value)}
              rows={6}
              className="w-full bg-wash text-xs text-ink font-mono rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent/40 resize-y leading-relaxed"
            />
            <p className="text-2xs text-ink-faint mt-1.5 leading-relaxed">{t('apikey.modelsHint')}</p>
          </div>

          <p className="text-2xs text-ink-faint leading-relaxed bg-wash rounded-lg px-3 py-2">{t('apikey.privacy')}</p>

          {error && <p className="text-xs text-red-600 leading-relaxed">{error}</p>}
        </div>

        <div className="flex items-center gap-2 px-5 py-3 border-t border-line shrink-0">
          {stored && (
            <button onClick={() => void clear()} disabled={busy} className="text-xs text-ink-muted hover:text-red-500 px-3 py-1.5 rounded-lg hover:bg-wash transition-colors disabled:opacity-50">
              {t('apikey.clear')}
            </button>
          )}
          <div className="flex-1" />
          <button onClick={() => setOpen(false)} className="text-xs text-ink-muted hover:text-ink px-3 py-1.5 rounded-lg hover:bg-wash transition-colors">
            {t('common.cancel')}
          </button>
          <button
            onClick={() => void save()}
            disabled={busy || !key.trim()}
            className="text-xs bg-accent text-white px-4 py-1.5 rounded-lg disabled:opacity-40 flex items-center gap-1.5"
            data-apikey-save
          >
            {busy && <Loader2 size={12} className="animate-spin" />}
            {busy ? t('apikey.checking') : t('apikey.save')}
          </button>
        </div>
      </div>
    </div>
  ), document.body);
}
