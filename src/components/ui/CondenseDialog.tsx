import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, Loader2, Minimize2, X } from 'lucide-react';
import { useUiStore, toast } from '../../lib/ui-store';
import { useStore } from '../../store';
import { useModels } from '../../lib/use-models';
import { findCandidateSegments, distillSegment, applySegment, type CondenseSegment } from '../../lib/condense';
import { useI18n, useT, fmt } from '../../i18n';

// The condense surface, per-segment edition. Candidates are found LOCALLY
// (a graph walk over the judge's takeaways) and appear the moment the
// dialog opens; hovering a row lights its segment up on the canvas behind
// the dialog. Each segment is its own small decision: one quick distill
// call, a previewable note, one apply, one undo. No whole-map audit, no
// opaque wait.

type SegState = { status: 'idle' | 'distilling' | 'ready' | 'applied'; distilled?: string; error?: string; keepNote: boolean };

export default function CondenseDialog({ onFocusSegment }: { onFocusSegment?: (nodeIds: string[]) => void }) {
  const open = useUiStore((s) => s.condenseDialogOpen);
  const t = useT();
  const lang = useI18n((s) => s.lang);
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const segments = useMemo(() => (open ? findCandidateSegments(nodes, edges) : []), [open, nodes, edges]);
  const globalModel = useUiStore((s) => s.selectedModel);
  const models = useModels()?.models ?? [];
  const [model, setModel] = useState('');
  const [segState, setSegState] = useState<Record<string, SegState>>({});
  const key = (s: CondenseSegment) => s.nodeIds.join(',');

  const close = () => {
    useUiStore.getState().setCondenseDialogOpen(false);
    useUiStore.getState().setCondenseHighlightIds([]);
    setSegState({});
  };
  if (!open) return null;

  const patch = (k: string, p: Partial<SegState>) => setSegState((prev) => { const base: SegState = prev[k] ?? { status: 'idle', keepNote: true }; return { ...prev, [k]: { ...base, ...p } }; });

  const distill = async (seg: CondenseSegment) => {
    const k = key(seg);
    patch(k, { status: 'distilling', error: undefined, distilled: '' });
    try {
      const d = await distillSegment(seg, lang, model || globalModel || undefined,
        (soFar) => patch(k, { distilled: soFar }));
      patch(k, { status: 'ready', distilled: d });
    } catch (err) {
      patch(k, { status: 'idle', error: err instanceof Error ? err.message : String(err) });
    }
  };

  const apply = (seg: CondenseSegment) => {
    const k = key(seg);
    const st = segState[k];
    const { lowered } = applySegment(seg, st?.keepNote ? st?.distilled : undefined);
    patch(k, { status: 'applied' });
    useUiStore.getState().setCondenseHighlightIds([]);
    toast('success', fmt(t('condense.segApplied'), { n: String(lowered) }));
  };

  return createPortal((
    <div className="fixed inset-0 z-[80] flex items-stretch justify-end animate-fade-in pointer-events-none" data-condense-dialog>
      <div className="bg-surface h-full shadow-2xl border-l border-line w-[min(480px,94vw)] flex flex-col p-5 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-1">
          <div className="text-sm font-semibold text-ink flex items-center gap-2">
            <Minimize2 size={15} strokeWidth={1.75} className="text-accent" /> {t('condense.title')}
          </div>
          <button onClick={close} className="text-ink-faint hover:text-ink rounded-lg w-7 h-7 flex items-center justify-center hover:bg-wash transition-colors"><X size={15} /></button>
        </div>
        <p className="text-2xs text-ink-faint leading-relaxed mb-2">{t('condense.segIntro')}</p>
        <div className="flex items-center gap-2 mb-3">
          <label className="text-2xs text-ink-muted shrink-0">{t('condense.modelLabel')}</label>
          <select value={model} onChange={(e) => setModel(e.target.value)} data-condense-model
            className="text-xs bg-wash text-ink rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent/40 max-w-[240px] truncate">
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
              const st = segState[k] ?? { status: 'idle', keepNote: true };
              return (
                <div
                  key={k}
                  data-condense-item
                  className={`border rounded-xl p-3 transition-colors ${st.status === 'applied' ? 'border-green-300 bg-green-50/40' : 'border-line hover:border-accent/50'}`}
                  onClick={() => {
                    // click = point AND travel; buttons inside stop propagation
                    useUiStore.getState().setCondenseHighlightIds(seg.nodeIds);
                    onFocusSegment?.(seg.nodeIds);
                  }}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-2xs text-ink-faint font-mono">{fmt(t('condense.segMeta'), { n: String(seg.nodeIds.length), tok: String(seg.saving) })}</span>
                    {seg.keyMoves > 0 && (
                      <span className="text-2xs text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                        <AlertTriangle size={10} strokeWidth={1.75} /> {fmt(t('condense.segKeyMoves'), { n: String(seg.keyMoves) })}
                      </span>
                    )}
                    {st.status === 'applied' && <span className="text-2xs text-green-700 flex items-center gap-1"><Check size={11} /> {t('condense.segDone')}</span>}
                  </div>
                  <p className="text-xs text-ink mt-1 leading-snug line-clamp-2">{seg.headQuestion}</p>
                  {st.error && <p className="text-2xs text-red-600 mt-1">{st.error}</p>}

                  {st.status === 'idle' && (
                    <div className="flex items-center gap-2 mt-2">
                      <button onClick={(e) => { e.stopPropagation(); void distill(seg); }} data-condense-distill
                        className="text-2xs bg-accent text-white px-3 py-1.5 rounded-lg transition-colors">
                        {t('condense.segDistill')}
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); apply(seg); }} data-condense-apply-plain
                        className="text-2xs text-ink-muted hover:text-ink px-3 py-1.5 rounded-lg hover:bg-wash transition-colors" title={t('condense.segApplyPlainTitle')}>
                        {t('condense.segApplyPlain')}
                      </button>
                    </div>
                  )}
                  {st.status === 'distilling' && (
                    <>
                      <div className="flex items-center gap-2 text-2xs text-ink-muted mt-2">
                        <Loader2 size={12} className="animate-spin text-accent" /> {t('condense.segDistilling')}
                      </div>
                      {st.distilled && (
                        <div className="text-2xs text-ink-muted bg-wash rounded-lg p-2 mt-2 whitespace-pre-wrap leading-relaxed max-h-[180px] overflow-y-auto" data-condense-streaming>{st.distilled}</div>
                      )}
                    </>
                  )}
                  {st.status === 'ready' && (
                    <>
                      <div className="text-2xs text-ink-muted bg-wash rounded-lg p-2 mt-2 whitespace-pre-wrap leading-relaxed max-h-[180px] overflow-y-auto" data-condense-preview>{st.distilled}</div>
                      <div className="flex items-center justify-between mt-2">
                        <label className="text-2xs text-ink-muted flex items-center gap-1.5">
                          <input type="checkbox" checked={st.keepNote} onChange={(e) => patch(k, { keepNote: e.target.checked })} className="accent-[var(--color-accent)]" />
                          {t('condense.segKeepNote')}
                        </label>
                        <button onClick={(e) => { e.stopPropagation(); apply(seg); }} data-condense-apply
                          className="text-2xs bg-accent text-white px-3 py-1.5 rounded-lg transition-colors">
                          {fmt(t('condense.segApply'), { n: String(seg.nodeIds.length), tok: String(seg.saving) })}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <p className="text-2xs text-ink-faint pt-3 mt-2 border-t border-line">{t('condense.reversible')}</p>
      </div>
    </div>
  ), document.body);
}
