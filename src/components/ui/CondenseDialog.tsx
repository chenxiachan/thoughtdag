import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Archive, Check, Copy, Loader2, Minimize2, X } from 'lucide-react';
import { useUiStore, toast } from '../../lib/ui-store';
import { useStore } from '../../store';
import { useModels } from '../../lib/use-models';
import { findCandidateSegments, startCondenseRun, cancelCondenseRun, type CondenseSegment } from '../../lib/condense';
import { useI18n, useT, fmt } from '../../i18n';

// Condense v4b: a FLOATING window on the canvas's left side (the focus
// panel owns the right — the two never fight), and the build itself is a
// BACKGROUND run living in the store: closing this window hides the view,
// never cancels the work. The toolbar icon carries the progress while the
// window is away; the store guards hold edits still until the copy lands.

export default function CondenseDialog({ onFocusSegment }: { onFocusSegment?: (nodeIds: string[]) => void }) {
  const open = useUiStore((s) => s.condenseDialogOpen);
  const run = useUiStore((s) => s.condenseRun);
  const t = useT();
  const lang = useI18n((s) => s.lang);
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const [refreshTick, setRefreshTick] = useState(0);
  const segments = useMemo(() => (open && run.status === 'idle' ? findCandidateSegments(nodes, edges) : []), [open, run.status, nodes, edges, refreshTick]);
  const globalModel = useUiStore((s) => s.selectedModel);
  const models = useModels()?.models ?? [];
  const [model, setModel] = useState('');
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  // draggable: grab the title row, put the window anywhere
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const winRef = useRef<HTMLDivElement>(null);
  const startDrag = (e: React.MouseEvent) => {
    const r = winRef.current?.getBoundingClientRect();
    if (!r) return;
    const dx = e.clientX - r.left, dy = e.clientY - r.top;
    const onMove = (ev: MouseEvent) => setPos({
      x: Math.min(window.innerWidth - 120, Math.max(0, ev.clientX - dx)),
      y: Math.min(window.innerHeight - 80, Math.max(0, ev.clientY - dy)),
    });
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };
  const key = (s: CondenseSegment) => s.nodeIds.join(',');
  const picked = segments.filter((s) => !unchecked.has(key(s)));
  const pickedSaving = picked.reduce((sum, s) => sum + s.saving, 0);

  // closing HIDES the window; the background run keeps going
  const close = () => {
    useUiStore.getState().setCondenseDialogOpen(false);
    useUiStore.getState().setCondenseHighlightIds([]);
  };
  if (!open) return null;

  const build = () => {
    if (picked.length === 0) return;
    void startCondenseRun(picked, lang, model || globalModel || undefined);
  };

  const archiveOriginal = () => {
    useStore.getState().setArchived(run.originalIds, true);
    toast('success', t('condense.originalArchived'));
    useUiStore.getState().setCondenseRun({ status: 'idle', current: 0, total: 0, streaming: '', originalIds: [], distillIds: [] });
    close();
  };

  const focusCopy = () => {
    const st = useStore.getState();
    const copyNodes = st.nodes.filter((n) => run.distillIds.includes(n.id));
    if (copyNodes.length) onFocusSegment?.(copyNodes.map((n) => n.id));
  };

  return createPortal((
    <div
      ref={winRef}
      className="fixed z-[70] bg-surface border border-line rounded-2xl shadow-2xl w-[400px] max-h-[72vh] flex flex-col p-4 animate-fade-in"
      style={pos ? { left: pos.x, top: pos.y } : { left: 80, bottom: 16 }}
      data-condense-dialog
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between mb-1 cursor-grab active:cursor-grabbing select-none" onMouseDown={startDrag}>
        <div className="text-sm font-semibold text-ink flex items-center gap-2">
          <Minimize2 size={15} strokeWidth={1.75} className="text-accent" /> {t('condense.title')}
        </div>
        <button onClick={close} title={run.status === 'building' ? t('condense.runningBg') : undefined}
          className="text-ink-faint hover:text-ink rounded-lg w-7 h-7 flex items-center justify-center hover:bg-wash transition-colors"><X size={15} /></button>
      </div>

      {run.status === 'idle' && (
        <>
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-2xs text-ink-faint leading-snug" title={t('condense.copyIntroFull')}>{t('condense.copyIntroShort')}</p>
            <button
              onClick={() => setRefreshTick((v) => v + 1)}
              title={t('condense.rescanTitle')}
              data-condense-rescan
              className="text-2xs text-ink-muted hover:text-accent px-2 py-1 rounded-lg hover:bg-wash transition-colors shrink-0"
            >
              ⟳ {t('condense.rescan')}
            </button>
          </div>
          <p className="text-2xs text-ink-faint mb-2" data-condense-scanline>
            {fmt(t('condense.scanLine'), { turns: String(nodes.filter((n) => n.data.response && !n.data.stepKind).length), n: String(segments.length) })}
          </p>
          <div className="flex items-center gap-2 mb-3">
            <label className="text-2xs text-ink-muted shrink-0">{t('condense.modelLabel')}</label>
            <select value={model} onChange={(e) => setModel(e.target.value)} data-condense-model
              className="text-xs bg-wash text-ink rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent/40 max-w-[220px] truncate">
              <option value="">{fmt(t('condense.modelGlobal'), { model: globalModel || 'auto' })}</option>
              {models.map((m) => <option key={m.id} value={m.id}>{m.id}</option>)}
            </select>
          </div>
          {segments.length === 0 ? (
            <p className="text-xs text-ink-muted py-4">{t('condense.segNothing')}</p>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
              {segments.map((seg) => {
                const k = key(seg);
                const on = !unchecked.has(k);
                return (
                  <div
                    key={k}
                    data-condense-item
                    className={`border rounded-xl p-3 transition-colors cursor-pointer ${on ? 'border-accent/60 bg-accent/5' : 'border-line opacity-60'}`}
                    onClick={() => {
                      useUiStore.getState().setCondenseHighlightIds(seg.nodeIds);
                      onFocusSegment?.(seg.nodeIds);
                    }}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        type="checkbox"
                        checked={on}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => setUnchecked((prev) => { const nx = new Set(prev); if (nx.has(k)) nx.delete(k); else nx.add(k); return nx; })}
                        className="accent-[var(--color-accent)]"
                        data-condense-check
                      />
                      <span className="text-2xs text-ink-faint font-mono">{fmt(t('condense.segMeta'), { n: String(seg.nodeIds.length), tok: String(seg.saving) })}</span>
                    </div>
                    <p className="text-xs text-ink mt-1 leading-snug line-clamp-2">{seg.headQuestion}</p>
                  </div>
                );
              })}
            </div>
          )}
          {segments.length > 0 && (
            <div className="flex items-center justify-between gap-2 pt-3 mt-2 border-t border-line">
              <span className="text-2xs text-ink-faint">{t('condense.copyFootnote')}</span>
              <button
                onClick={build}
                disabled={picked.length === 0}
                data-condense-build
                className="text-xs bg-accent text-white px-3.5 py-2 rounded-lg disabled:opacity-40 transition-colors flex items-center gap-1.5 shrink-0"
              >
                <Copy size={13} strokeWidth={1.75} />
                {fmt(t('condense.buildCopy'), { n: String(picked.length), tok: String(pickedSaving) })}
              </button>
            </div>
          )}
        </>
      )}

      {run.status === 'building' && (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex items-center gap-2 text-sm text-ink-muted mb-1.5">
            <Loader2 size={15} className="animate-spin text-accent" />
            {fmt(t('condense.buildingRun'), { i: String(run.current), n: String(run.total) })}
          </div>
          <p className="text-2xs text-ink-faint mb-2">{t('condense.runningBg')}</p>
          {run.streaming && (
            <div className="flex-1 min-h-0 overflow-y-auto text-2xs text-ink-muted bg-wash rounded-lg p-2.5 whitespace-pre-wrap leading-relaxed" data-condense-streaming>
              {run.streaming}
            </div>
          )}
          <button onClick={() => cancelCondenseRun()} data-condense-cancel
            className="self-start mt-3 text-xs text-ink-muted hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-wash transition-colors">
            {t('common.cancel')}
          </button>
        </div>
      )}

      {run.status === 'error' && (
        <div className="flex flex-col gap-2 py-3">
          <p className="text-2xs text-red-600">{run.error}</p>
          <button onClick={() => useUiStore.getState().setCondenseRun({ status: 'idle', error: undefined })}
            className="self-start text-xs text-ink-muted hover:text-ink px-3 py-1.5 rounded-lg hover:bg-wash transition-colors">
            {t('common.cancel')}
          </button>
        </div>
      )}

      {run.status === 'done' && (
        <div className="flex flex-col gap-3 py-3">
          <div className="flex items-center gap-2 text-sm text-green-700">
            <Check size={16} /> {t('condense.copyReady')}
          </div>
          <p className="text-2xs text-ink-faint leading-relaxed">{t('condense.copyCompareHint')}</p>
          <div className="flex items-center gap-2">
            <button onClick={focusCopy} className="text-xs bg-accent/10 text-accent hover:bg-accent/20 px-3 py-2 rounded-lg transition-colors">
              {t('condense.viewCopy')}
            </button>
            <button onClick={archiveOriginal} data-condense-archive-original
              className="text-xs border border-line text-ink-muted hover:text-ink hover:bg-wash px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5">
              <Archive size={13} strokeWidth={1.75} /> {t('condense.archiveOriginal')}
            </button>
          </div>
          <button onClick={() => { useUiStore.getState().setCondenseRun({ status: 'idle' }); close(); }}
            className="self-start text-xs text-ink-faint hover:text-ink transition-colors">{t('common.close')}</button>
        </div>
      )}
    </div>
  ), document.body);
}
