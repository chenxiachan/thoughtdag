import { useEffect, useRef, useState } from 'react';
import { Settings2 } from 'lucide-react';
import { useModels } from '../lib/use-models';
import { useUiStore } from '../lib/ui-store';
import { useT, fmt } from '../i18n';

// The capabilities panel: what this installation can do, what is missing,
// and the few real choices that exist. The rule it institutionalizes: a
// feature whose key is missing disappears from the working UI entirely —
// the ONLY place that hints at it is this list. No dead buttons.

function Dot({ on }: { on: boolean }) {
  return <span className={`w-2 h-2 rounded-full shrink-0 ${on ? 'bg-emerald-500' : 'bg-line-strong'}`} />;
}

export default function CapabilitiesPanel() {
  const t = useT();
  const data = useModels();
  const visionModelPref = useUiStore((s) => s.visionModelPref);
  const setVisionModelPref = useUiStore((s) => s.setVisionModelPref);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  const caps = data?.capabilities;
  const visionModels = (data?.models ?? []).filter((m) => m.vision);
  const hasVision = visionModels.length > 0;

  const row = 'px-3 py-2.5 border-b border-line/50 last:border-0 flex items-start gap-2.5';

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`bg-card/90 backdrop-blur border rounded-lg w-8 h-8 flex items-center justify-center shadow-sm transition-colors ${
          open ? 'border-accent/40 text-accent' : 'border-line text-ink-faint hover:bg-wash'
        }`}
        title={t('toolbar.capabilities')}
      >
        <Settings2 size={15} strokeWidth={1.75} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 bg-card border border-line rounded-xl shadow-lg py-1 w-[320px] z-30 animate-fade-in">
          <div className="px-3 py-1.5 text-2xs font-semibold text-ink-muted border-b border-line">
            {t('caps.title')}
          </div>

          {/* Web search — powered by Zhipu server-side */}
          <div className={row}>
            <div className="mt-1"><Dot on={!!caps?.webSearch} /></div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-ink font-medium">{t('caps.webSearch')}</p>
              <p className="text-2xs text-ink-faint leading-relaxed mt-0.5">
                {caps?.webSearch
                  ? fmt(t('caps.webSearchOn'), { engine: caps.searchEngine })
                  : t('caps.webSearchOff')}
              </p>
            </div>
          </div>

          {/* Scholarly search — free public APIs, always on */}
          <div className={row}>
            <div className="mt-1"><Dot on /></div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-ink font-medium">{t('caps.scholar')}</p>
              <p className="text-2xs text-ink-faint leading-relaxed mt-0.5">{t('caps.scholarDesc')}</p>
            </div>
          </div>

          {/* Image reading & Recognize — the one row with a real choice */}
          <div className={row}>
            <div className="mt-1"><Dot on={hasVision} /></div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-ink font-medium">{t('caps.vision')}</p>
              {hasVision ? (
                <select
                  value={visionModels.some((m) => m.id === visionModelPref) ? visionModelPref : 'auto'}
                  onChange={(e) => setVisionModelPref(e.target.value)}
                  title={t('caps.visionPickTitle')}
                  className="mt-1 w-full text-2xs text-ink-muted bg-wash border border-line rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent/40"
                >
                  <option value="auto">{t('caps.visionAuto')}</option>
                  {visionModels.map((m) => (
                    <option key={m.id} value={m.id}>{m.id.split('/').pop()}</option>
                  ))}
                </select>
              ) : (
                <p className="text-2xs text-ink-faint leading-relaxed mt-0.5">{t('caps.visionOff')}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
