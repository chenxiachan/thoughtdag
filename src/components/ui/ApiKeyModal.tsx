import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, KeyRound, Loader2, Plus, Trash2, X, Pencil } from 'lucide-react';
import { useUiStore, toast } from '../../lib/ui-store';
import { useModels, setModelsCache } from '../../lib/use-models';
import {
  PROVIDER_PRESETS, type ProviderPreset, type RuntimeModel, type RuntimeProvider,
  probeModels, pushProviders, saveProviders, storedProviders,
} from '../../lib/runtime-providers';
import { useT, fmt, useI18n } from '../../i18n';

// The model-interface manager: one door for every way in. Presets carry a
// baseURL and a key page; the model list is always fetched live from the
// endpoint's /models route (protocol standard), so nothing here goes stale.
// Local runtimes need no key; a custom endpoint field catches everything
// else that speaks the OpenAI-compatible protocol.

export default function ApiKeyModal() {
  const t = useT();
  const open = useUiStore((s) => s.apiKeyModalOpen);
  const setOpen = useUiStore((s) => s.setApiKeyModalOpen);
  const data = useModels();
  const [providers, setProviders] = useState<RuntimeProvider[]>(() => storedProviders());
  useEffect(() => { if (open) setProviders(storedProviders()); }, [open]);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // ── add-flow state ──
  const lang = useI18n((st) => st.lang);
  // Region twins (智谱/Z.ai, Kimi cn/intl) collapse to the one matching the
  // UI language — the same provider never appears twice in the row.
  const visiblePresets = PROVIDER_PRESETS.filter((p) => !p.region || p.region === lang);
  const [preset, setPreset] = useState<ProviderPreset>(visiblePresets[0]);
  const [key, setKey] = useState('');
  const [customURL, setCustomURL] = useState('');
  const [customName, setCustomName] = useState('');
  const [probed, setProbed] = useState<RuntimeModel[] | null>(null);
  const [picked, setPicked] = useState<Map<string, boolean>>(new Map()); // id → vision
  const [filter, setFilter] = useState('');
  const [sortMode, setSortMode] = useState<'time' | 'name'>('time');
  const [initialPicked, setInitialPicked] = useState<Set<string>>(new Set());

  const serverModels = useMemo(
    () => (data?.models ?? []).filter((m) => !providers.some((p) => p.models.some((x) => x.id === m.id))),
    [data, providers],
  );
  const visionCount = (data?.models ?? []).filter((m) => m.vision).length;

  if (!open) return null;

  const resetAdd = () => {
    setAdding(false); setProbed(null); setPicked(new Map()); setKey(''); setCustomURL(''); setCustomName(''); setFilter(''); setError('');
  };

  const commit = async (next: RuntimeProvider[]) => {
    setBusy(true);
    setError('');
    try {
      const fresh = await pushProviders(next);
      saveProviders(next);
      setProviders(next);
      setModelsCache(fresh);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  // One-click re-probe: keeps your picked models, updates vision metadata,
  // drops delisted ids, and — for providers with small catalogs — adopts
  // newly listed models automatically. Huge catalogs (gateways) stay on the
  // picked+recommended whitelist; use Add to browse their new arrivals.
  const refresh = async (p: RuntimeProvider) => {
    const match = PROVIDER_PRESETS.find((x) => x.baseURL === p.baseURL);
    setPreset(match ?? PROVIDER_PRESETS.find((x) => x.id === 'custom')!);
    if (!match) { setCustomURL(p.baseURL); setCustomName(p.name); }
    setKey(p.apiKey);
    setAdding(true);
    await doProbe(p.baseURL, p.apiKey, p.models);
  };


  const doProbe = async (baseURLArg?: string, keyArg?: string, keepPicked?: RuntimeModel[]) => {
    setBusy(true);
    setError('');
    setProbed(null);
    try {
      const baseURL = baseURLArg ?? (preset.id === 'custom' ? customURL.trim() : preset.baseURL);
      const models = await probeModels(baseURL, (keyArg ?? key).trim());
      if (models.length === 0) throw new Error(t('provider.probeEmpty'));
      const preselect = new Map<string, boolean>();
      if (keepPicked) {
        // refresh flow: your current picks stay checked; everything the
        // provider newly lists is visible right here, unchecked
        const listed = new Set(models.map((m) => m.id));
        for (const m of keepPicked) if (listed.has(m.id)) {
          preselect.set(m.id, models.find((x) => x.id === m.id)?.vision ?? !!m.vision);
        }
      } else if (models.some((m) => m.created)) {
        // release times available: preselect the newest 8
        [...models].sort((a, b) => (b.created ?? 0) - (a.created ?? 0)).slice(0, 8)
          .forEach((m) => preselect.set(m.id, !!m.vision));
      } else {
        const rec = new Set(preset.recommend ?? []);
        for (const m of models) {
          if (rec.size > 0 ? rec.has(m.id) : models.length <= 12) preselect.set(m.id, !!m.vision);
        }
      }
      setPicked(preselect);
      setInitialPicked(new Set(preselect.keys()));
      setProbed(models);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const doAdd = async () => {
    const baseURL = preset.id === 'custom' ? customURL.trim() : preset.baseURL;
    const name = preset.id === 'custom' ? (customName.trim() || t('provider.customName')) : preset.name;
    const probedMeta = new Map((probed ?? []).map((m) => [m.id, m]));
    const models: RuntimeModel[] = [...picked.entries()].map(([id, vision]) => {
      const cl = probedMeta.get(id)?.contextLength;
      return { id, ...(vision ? { vision } : {}), ...(cl ? { contextLength: cl } : {}) };
    });
    if (!baseURL || models.length === 0) return;
    const next = [...providers.filter((p) => p.baseURL !== baseURL), {
      preset: preset.id, name, baseURL, apiKey: key.trim(), models,
    }];
    if (await commit(next)) {
      toast('success', fmt(t('provider.added'), { n: models.length, name }));
      resetAdd();
    }
  };

  const remove = async (baseURL: string) => {
    await commit(providers.filter((p) => p.baseURL !== baseURL));
  };

  const shown = (probed?.filter((m) => !filter || m.id.toLowerCase().includes(filter.toLowerCase())) ?? [])
    .sort((a, b) =>
      (Number(initialPicked.has(b.id)) - Number(initialPicked.has(a.id))) ||
      (sortMode === 'time' ? (b.created ?? 0) - (a.created ?? 0) : a.id.localeCompare(b.id)));

  return createPortal((
    <div className="fixed inset-0 z-[60] bg-ink/30 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => { setOpen(false); resetAdd(); }}>
      <div className="bg-card rounded-2xl shadow-2xl border border-line w-[560px] max-h-[86vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 py-3 border-b border-line shrink-0">
          <KeyRound size={15} strokeWidth={1.75} className="text-accent shrink-0" />
          <span className="text-sm font-semibold text-ink flex-1">{t('provider.title')}</span>
          <button onClick={() => { setOpen(false); resetAdd(); }} className="text-ink-faint hover:text-ink w-7 h-7 rounded-lg hover:bg-wash flex items-center justify-center transition-colors shrink-0">
            <X size={15} strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3">
          {!adding && (<>
            {(data?.models.length ?? 0) === 0 && (
              <p className="text-xs text-ink-muted leading-relaxed">{t('provider.introEmpty')}</p>
            )}

            {serverModels.length > 0 && (
              <div className="border border-line rounded-xl px-3 py-2.5 bg-wash/50 text-xs text-ink-muted">
                {fmt(t('provider.serverRow'), { n: serverModels.length })}
              </div>
            )}

            {providers.map((p) => (
              <div key={p.baseURL} className="border border-line rounded-xl px-3 py-2.5 bg-surface flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-ink font-medium">{p.name}</div>
                  <div className="text-2xs text-ink-faint mt-0.5 font-mono truncate">{p.baseURL}</div>
                  <div className="text-2xs text-ink-muted mt-1">
                    {fmt(t('provider.modelCount'), { n: p.models.length })}
                    {p.models.some((m) => m.vision) && <span> · 📷 {p.models.filter((m) => m.vision).length}</span>}
                  </div>
                </div>
                <button onClick={() => void refresh(p)} disabled={busy} title={t('provider.refreshTitle')} className="text-ink-faint hover:text-accent w-6 h-6 rounded-full flex items-center justify-center transition-colors shrink-0" data-provider-refresh>
                  <Pencil size={13} strokeWidth={1.75} />
                </button>
                <button onClick={() => void remove(p.baseURL)} disabled={busy} title={t('common.delete')} className="text-ink-faint hover:text-red-500 w-6 h-6 rounded-full flex items-center justify-center transition-colors shrink-0">
                  <Trash2 size={13} strokeWidth={1.75} />
                </button>
              </div>
            ))}

            {(data?.models.length ?? 0) > 0 && (
              <p className="text-2xs text-ink-faint leading-relaxed">
                {fmt(t('provider.capabilityLine'), { n: data!.models.length, v: visionCount })}
                {!data?.capabilities?.webSearch && ` ${t('provider.noSearchNote')}`}
              </p>
            )}

            <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 text-xs text-accent hover:bg-accent/10 px-3 py-1.5 rounded-lg transition-colors" data-provider-add>
              <Plus size={14} strokeWidth={1.75} /> {t('provider.add')}
            </button>
          </>)}

          {adding && (<>
            <div>
              <label className="text-2xs font-medium text-ink-muted block mb-1.5">{t('provider.pickSource')}</label>
              <div className="flex flex-wrap gap-1.5">
                {visiblePresets.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { setPreset(p); setProbed(null); setPicked(new Map()); setError(''); }}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${preset.id === p.id ? 'border-accent bg-accent/10 text-accent font-medium' : 'border-line text-ink-muted hover:bg-wash'}`}
                    data-preset={p.id}
                  >
                    {p.id === 'custom' ? t('provider.customName') : p.noKey ? `${p.name} · ${t('provider.local')}` : p.name}
                  </button>
                ))}
              </div>
            </div>

            {preset.id === 'custom' && (<>
              <div>
                <label className="text-2xs font-medium text-ink-muted block mb-1.5">{t('provider.baseURL')}</label>
                <input value={customURL} onChange={(e) => setCustomURL(e.target.value)} placeholder="https://…/v1"
                  className="w-full bg-wash text-sm text-ink font-mono rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent/40 placeholder-ink-faint" data-provider-url />
                <p className="text-2xs text-ink-faint mt-1">{t('provider.baseURLHint')}</p>
              </div>
              <div>
                <label className="text-2xs font-medium text-ink-muted block mb-1.5">{t('provider.displayName')}</label>
                <input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder={t('provider.customName')}
                  className="w-full bg-wash text-sm text-ink rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent/40 placeholder-ink-faint" />
              </div>
            </>)}

            {!preset.noKey && (
              <div>
                <label className="text-2xs font-medium text-ink-muted block mb-1.5">API key</label>
                <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-…" autoFocus
                  className="w-full bg-wash text-sm text-ink font-mono rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent/40 placeholder-ink-faint" data-provider-key />
                {preset.keyUrl && (
                  <p className="text-2xs text-ink-faint mt-1.5">
                    {t('provider.keyHint')}{' '}
                    <a href={preset.keyUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">{preset.keyUrl.replace('https://', '')}</a>
                  </p>
                )}
              </div>
            )}
            {preset.noKey && <p className="text-2xs text-ink-faint leading-relaxed">{t((preset.hintKey ?? 'provider.localHint') as Parameters<typeof t>[0])}</p>}

            {!probed && (
              <button onClick={() => void doProbe()} disabled={busy || (preset.id === 'custom' ? !customURL.trim() : !preset.noKey && !key.trim())}
                className="text-xs bg-accent text-white px-4 py-1.5 rounded-lg disabled:opacity-40 flex items-center gap-1.5" data-provider-probe>
                {busy && <Loader2 size={12} className="animate-spin" />}
                {busy ? t('provider.probing') : t('provider.probe')}
              </button>
            )}

            {probed && (<>
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <label className="text-2xs font-medium text-ink-muted flex-1">{fmt(t('provider.pickModels'), { n: probed.length })}</label>
                  {probed.length > 15 && (
                    <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t('provider.filter')}
                      className="bg-wash text-2xs text-ink rounded-md px-2 py-1 w-36 focus:outline-none focus:ring-1 focus:ring-accent/40 placeholder-ink-faint" />
                  )}
                  {probed.some((m) => m.created) && (
                    <button
                      onClick={() => setSortMode((v) => (v === 'time' ? 'name' : 'time'))}
                      className="text-2xs px-2.5 py-1.5 rounded-lg border border-line text-ink-muted hover:bg-wash transition-colors shrink-0"
                      data-sort-toggle
                    >
                      {sortMode === 'time' ? t('provider.sortTime') : t('provider.sortName')}
                    </button>
                  )}
                </div>
                <div className="border border-line rounded-xl max-h-[220px] overflow-y-auto divide-y divide-line/60" data-provider-models>
                  {shown.slice(0, 200).map((m) => (
                    <label key={m.id} className="flex items-center gap-2 px-3 py-1.5 text-xs text-ink hover:bg-wash cursor-pointer">
                      <input type="checkbox" checked={picked.has(m.id)}
                        onChange={(e) => {
                          const next = new Map(picked);
                          if (e.target.checked) next.set(m.id, !!m.vision); else next.delete(m.id);
                          setPicked(next);
                        }} />
                      <span className="font-mono flex-1 truncate">{m.id}</span>
                      {m.vision != null ? (
                        m.vision && <span title={t('provider.visionYes')}>📷</span>
                      ) : picked.has(m.id) && (
                        <button
                          onClick={(e) => { e.preventDefault(); const next = new Map(picked); next.set(m.id, !next.get(m.id)); setPicked(next); }}
                          title={t('provider.visionToggle')}
                          className={`flex items-center gap-0.5 text-2xs px-1.5 py-0.5 rounded-full transition-colors ${picked.get(m.id) ? 'bg-accent/10 text-accent' : 'bg-wash text-ink-faint'}`}
                        >
                          <Camera size={11} strokeWidth={1.75} />
                        </button>
                      )}
                    </label>
                  ))}
                </div>
                <p className="text-2xs text-ink-faint mt-1">{fmt(t('provider.pickedCount'), { n: picked.size })}</p>
              </div>
            </>)}

            <p className="text-2xs text-ink-faint leading-relaxed bg-wash rounded-lg px-3 py-2">{t('provider.privacy')}</p>
            {error && <p className="text-xs text-red-600 leading-relaxed">{error}</p>}
          </>)}
          {!adding && error && <p className="text-xs text-red-600 leading-relaxed">{error}</p>}
        </div>

        <div className="flex items-center gap-2 px-5 py-3 border-t border-line shrink-0">
          <div className="flex-1" />
          {adding ? (<>
            <button onClick={resetAdd} className="text-xs text-ink-muted hover:text-ink px-3 py-1.5 rounded-lg hover:bg-wash transition-colors">{t('common.cancel')}</button>
            <button onClick={() => void doAdd()} disabled={busy || picked.size === 0}
              className="text-xs bg-accent text-white px-4 py-1.5 rounded-lg disabled:opacity-40 flex items-center gap-1.5" data-provider-save>
              {busy && <Loader2 size={12} className="animate-spin" />}
              {t('provider.save')}
            </button>
          </>) : (
            <button onClick={() => { setOpen(false); resetAdd(); }} className="text-xs text-ink-muted hover:text-ink px-3 py-1.5 rounded-lg hover:bg-wash transition-colors">{t('common.close')}</button>
          )}
        </div>
      </div>
    </div>
  ), document.body);
}
