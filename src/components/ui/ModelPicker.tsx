import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Cpu } from 'lucide-react';
import { useUiStore } from '../../lib/ui-store';
import { useModels } from '../../lib/use-models';
import { fmt } from '../../i18n';
import { useT } from '../../i18n';

interface PickerProps {
  /** Node mode: controlled value (undefined = inherit global) + change handler. */
  value?: string;
  onChange?: (id: string | undefined) => void;
  /** Compact styling for embedding in panel rows. */
  compact?: boolean;
}

// Dropdown listing every model the server registered (driven by which API
// keys exist in .env), grouped by provider. Without props it edits the
// GLOBAL selection; with value/onChange it edits a per-node override and
// offers an "inherit" entry.
export default function ModelPicker({ value, onChange, compact }: PickerProps) {
  const t = useT();
  const nodeMode = !!onChange;
  const selectedModel = useUiStore((s) => s.selectedModel);
  const setSelectedModel = useUiStore((s) => s.setSelectedModel);
  const data = useModels();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const models = data?.models ?? [];
  // Node mode: with one model there is nothing to pin. The GLOBAL picker
  // stays even then — it also carries the capability report, and a sparse
  // install is exactly when the hints matter.
  if (models.length < 2 && (nodeMode || !data)) return null;

  const globalId = selectedModel && models.some((m) => m.id === selectedModel) ? selectedModel : data?.default;
  const activeId = nodeMode ? (value ?? null) : globalId;
  const active = activeId ? models.find((m) => m.id === activeId) : null;
  const providers = [...new Set(models.map((m) => m.provider))];

  const label = nodeMode
    ? (active ? active.name : t('model.inherit'))
    : (active?.name ?? activeId);

  const pick = (id: string | null) => {
    if (nodeMode) onChange!(id ?? undefined);
    else setSelectedModel(id === data?.default ? null : id);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className={compact
          ? `text-xs px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 max-w-[200px] ${value ? 'bg-accent/10 text-accent' : 'bg-wash hover:bg-line text-ink-muted'}`
          : 'bg-card/90 backdrop-blur border border-line rounded-lg h-8 px-2.5 flex items-center gap-1.5 shadow-sm hover:bg-wash transition-colors text-ink-muted max-w-[190px]'}
        title={t('toolbar.model')}
      >
        <Cpu size={14} strokeWidth={1.75} className={`shrink-0 ${compact && !value ? '' : 'text-accent'}`} />
        <span className="text-xs truncate">{label}</span>
        <ChevronDown size={12} strokeWidth={1.75} className="shrink-0" />
      </button>

      {open && (
        // Both placements drop DOWN: the compact picker lives in the panel
        // header now (an upward menu would fly off the viewport top)
        <div className="absolute top-9 right-0 bg-card border border-line rounded-xl shadow-xl py-1.5 w-64 max-h-[60vh] overflow-y-auto z-30">
          {nodeMode && (
            <button
              onClick={() => pick(null)}
              className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors hover:bg-wash ${!value ? 'text-accent font-medium' : 'text-ink'}`}
            >
              <span className="truncate flex-1">{t('model.inherit')}</span>
              {!value && <Check size={13} strokeWidth={2} className="shrink-0" />}
            </button>
          )}
          {providers.map((provider) => (
            <div key={provider}>
              <p className="text-2xs text-ink-faint uppercase tracking-wider font-medium px-3 pt-2 pb-1">{provider}</p>
              {models.filter((m) => m.provider === provider).map((m) => (
                <button
                  key={m.id}
                  onClick={() => pick(m.id)}
                  className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors hover:bg-wash ${
                    m.id === activeId ? 'text-accent font-medium' : 'text-ink'
                  }`}
                >
                  <span className="truncate flex-1">{m.name.replace(` (${m.provider})`, '')}</span>
                  {m.vision && <span className="text-2xs text-ink-faint shrink-0">{t('model.vision')}</span>}
                  {m.id === activeId && <Check size={13} strokeWidth={2} className="shrink-0" />}
                </button>
              ))}
            </div>
          ))}
          {!nodeMode && <GlobalCapabilities />}
        </div>
      )}
    </div>
  );
}

// ── Capabilities: the engine-room report at the picker's foot ──
// What this installation can do, what is missing (the ONLY place that
// hints at hidden features), and the one extra model choice: which
// vision model reads images and recognizes scanned pages.
function GlobalCapabilities() {
  const t = useT();
  const data = useModels();
  const visionModelPref = useUiStore((s) => s.visionModelPref);
  const setVisionModelPref = useUiStore((s) => s.setVisionModelPref);
  const caps = data?.capabilities;
  const visionModels = (data?.models ?? []).filter((m) => m.vision);
  // an old proxy / offline fetch reports nothing — say nothing, not "missing"
  if (!caps) return null;
  const hasVision = visionModels.length > 0;
  const dot = (on: boolean) => (
    <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${on ? 'bg-emerald-500' : 'bg-line-strong'}`} />
  );
  return (
    <div className="border-t border-line mt-1.5 pt-1 pb-1">
      <p className="text-2xs text-ink-faint uppercase tracking-wider font-medium px-3 pt-1 pb-1">{t('caps.title')}</p>
      <div className="px-3 py-1 flex items-start gap-2">
        {dot(!!caps?.webSearch)}
        <p className="text-2xs text-ink-faint leading-relaxed flex-1">
          <span className="text-ink-muted font-medium">{t('caps.webSearch')}</span>{' · '}
          {caps?.webSearch ? fmt(t('caps.webSearchOn'), { engine: caps.searchEngine }) : t('caps.webSearchOff')}
        </p>
      </div>
      <div className="px-3 py-1 flex items-start gap-2">
        {dot(true)}
        <p className="text-2xs text-ink-faint leading-relaxed flex-1">
          <span className="text-ink-muted font-medium">{t('caps.scholar')}</span>{' · '}{t('caps.scholarDesc')}
        </p>
      </div>
      <div className="px-3 py-1 flex items-start gap-2">
        {dot(hasVision)}
        <div className="flex-1 min-w-0">
          <p className="text-2xs text-ink-muted font-medium">{t('caps.vision')}</p>
          {hasVision ? (
            <select
              value={visionModels.some((m) => m.id === visionModelPref) ? visionModelPref : 'auto'}
              onChange={(e) => setVisionModelPref(e.target.value)}
              onClick={(e) => e.stopPropagation()}
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
  );
}
