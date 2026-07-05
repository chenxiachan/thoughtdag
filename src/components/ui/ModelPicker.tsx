import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Cpu } from 'lucide-react';
import { API_BASE } from '../../lib/constants';
import { useUiStore } from '../../lib/ui-store';
import { useT } from '../../i18n';

interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  vision: boolean;
}

// Toolbar dropdown listing every model the server registered (driven by
// which API keys exist in .env), grouped by provider. Selection is a global
// preference; null falls back to the server default.
export default function ModelPicker() {
  const t = useT();
  const selectedModel = useUiStore((s) => s.selectedModel);
  const setSelectedModel = useUiStore((s) => s.setSelectedModel);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [serverDefault, setServerDefault] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/models`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setModels(data.models ?? []);
        setServerDefault(data.default ?? null);
      })
      .catch(() => { /* server offline — picker stays hidden */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  // With one model (or the server unreachable) there is nothing to pick
  if (models.length < 2) return null;

  const activeId = selectedModel && models.some((m) => m.id === selectedModel)
    ? selectedModel
    : serverDefault;
  const active = models.find((m) => m.id === activeId);

  const providers = [...new Set(models.map((m) => m.provider))];

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="bg-card/90 backdrop-blur border border-line rounded-lg h-8 px-2.5 flex items-center gap-1.5 shadow-sm hover:bg-wash transition-colors text-ink-muted max-w-[190px]"
        title={t('toolbar.model')}
      >
        <Cpu size={14} strokeWidth={1.75} className="shrink-0 text-accent" />
        <span className="text-xs truncate">{active?.name ?? activeId}</span>
        <ChevronDown size={12} strokeWidth={1.75} className="shrink-0" />
      </button>

      {open && (
        <div className="absolute top-9 right-0 bg-card border border-line rounded-xl shadow-xl py-1.5 w-64 max-h-[60vh] overflow-y-auto z-30">
          {providers.map((provider) => (
            <div key={provider}>
              <p className="text-2xs text-ink-faint uppercase tracking-wider font-medium px-3 pt-2 pb-1">{provider}</p>
              {models.filter((m) => m.provider === provider).map((m) => (
                <button
                  key={m.id}
                  onClick={() => { setSelectedModel(m.id === serverDefault ? null : m.id); setOpen(false); }}
                  className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors hover:bg-wash ${
                    m.id === activeId ? 'text-accent font-medium' : 'text-ink'
                  }`}
                >
                  <span className="truncate flex-1">{m.name}</span>
                  {m.vision && <span className="text-2xs text-ink-faint shrink-0">{t('model.vision')}</span>}
                  {m.id === activeId && <Check size={13} strokeWidth={2} className="shrink-0" />}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
