import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Archive, Check, Copy, Loader2, Minimize2, X } from 'lucide-react';
import { useUiStore, toast } from '../../lib/ui-store';
import { useStore } from '../../store';
import { useModels } from '../../lib/use-models';
import { findCandidateSegments, distillSegment, buildCondensedCopy, type CondenseSegment } from '../../lib/condense';
import { useI18n, useT, fmt } from '../../i18n';

// Condense v4 surface: pick runs (all pre-checked — nothing touches the
// original tree, so the safe default is generous), then one button builds
// the CONDENSED COPY beside the original. Distilling goes top-down, one
// streamed call per run with live text and a run counter; the finished
// copy is a complete tree of ordinary nodes. Compare side by side, then
// archive the original from right here.

type Phase = 'pick' | 'building' | 'done';

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
  const [phase, setPhase] = useState<Phase>('pick');
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<{ current: number; total: number; streaming: string }>({ current: 0, total: 0, streaming: '' });
  const [error, setError] = useState('');
  const originalIds = useRef<string[]>([]);
  const runToken = useRef(0);
  const key = (s: CondenseSegment) => s.nodeIds.join(',');
  const picked = segments.filter((s) => !unchecked.has(key(s)));
  const pickedSaving = picked.reduce((sum, s) => sum + s.saving, 0);

  const close = () => {
    runToken.current++;
    useUiStore.getState().setCondenseDialogOpen(false);
    useUiStore.getState().setCondenseHighlightIds([]);
    setPhase('pick'); setUnchecked(new Set()); setError(''); setProgress({ current: 0, total: 0, streaming: '' });
  };
  if (!open) return null;

  const build = async () => {
    if (picked.length === 0) return;
    const token = ++runToken.current;
    setPhase('building');
    setError('');
    originalIds.current = nodes.map((n) => n.id);
    try {
      const distillates: string[] = [];
      let brief = '';
      for (let i = 0; i < picked.length; i++) {
        setProgress({ current: i + 1, total: picked.length, streaming: '' });
        const d = await distillSegment(picked[i], lang, model || globalModel || undefined,
          (soFar) => { if (runToken.current === token) setProgress({ current: i + 1, total: picked.length, streaming: soFar }); },
          brief || undefined);
        if (runToken.current !== token) return; // cancelled
        distillates.push(d);
        brief = `${brief}\n${d}`.slice(-1500); // rolling brief keeps later runs coherent
      }
      const res = buildCondensedCopy(picked, distillates, lang);
      if (runToken.current !== token) return;
      setPhase('done');
      toast('success', fmt(t('condense.copyDone'), { runs: String(res.collapsedRuns), n: String(res.copiedNodes) }));
      const st = useStore.getState();
      const copyNodes = st.nodes.filter((n) => res.distillIds.includes(n.id));
      if (copyNodes.length) onFocusSegment?.(copyNodes.map((n) => n.id));
    } catch (err) {
      if (runToken.current !== token) return;
      setError(err instanceof Error ? err.message : String(err));
      setPhase('pick');
    }
  };

  const archiveOriginal = () => {
    useStore.getState().setArchived(originalIds.current, true);
    toast('success', t('condense.originalArchived'));
    close();
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

        {phase === 'pick' && (
          <>
            <p className="text-2xs text-ink-faint leading-relaxed mb-2">{t('condense.copyIntro')}</p>
            <div className="flex items-center gap-2 mb-3">
              <label className="text-2xs text-ink-muted shrink-0">{t('condense.modelLabel')}</label>
              <select value={model} onChange={(e) => setModel(e.target.value)} data-condense-model
                className="text-xs bg-wash text-ink rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent/40 max-w-[240px] truncate">
                <option value="">{fmt(t('condense.modelGlobal'), { model: globalModel || 'auto' })}</option>
                {models.map((m) => <option key={m.id} value={m.id}>{m.id}</option>)}
              </select>
            </div>
            {error && <p className="text-2xs text-red-600 mb-2">{error}</p>}
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
              <div className="flex items-center justify-between pt-3 mt-2 border-t border-line">
                <span className="text-2xs text-ink-faint">{t('condense.copyFootnote')}</span>
                <button
                  onClick={() => void build()}
                  disabled={picked.length === 0}
                  data-condense-build
                  className="text-xs bg-accent text-white px-4 py-2 rounded-lg disabled:opacity-40 transition-colors flex items-center gap-1.5"
                >
                  <Copy size={13} strokeWidth={1.75} />
                  {fmt(t('condense.buildCopy'), { n: String(picked.length), tok: String(pickedSaving) })}
                </button>
              </div>
            )}
          </>
        )}

        {phase === 'building' && (
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex items-center gap-2 text-sm text-ink-muted mb-2">
              <Loader2 size={15} className="animate-spin text-accent" />
              {fmt(t('condense.buildingRun'), { i: String(progress.current), n: String(progress.total) })}
            </div>
            {progress.streaming && (
              <div className="flex-1 min-h-0 overflow-y-auto text-2xs text-ink-muted bg-wash rounded-lg p-2.5 whitespace-pre-wrap leading-relaxed" data-condense-streaming>
                {progress.streaming}
              </div>
            )}
            <button onClick={() => { runToken.current++; setPhase('pick'); }} className="self-start mt-3 text-xs text-ink-muted hover:text-ink px-3 py-1.5 rounded-lg hover:bg-wash transition-colors">
              {t('common.cancel')}
            </button>
          </div>
        )}

        {phase === 'done' && (
          <div className="flex flex-col gap-3 py-4">
            <div className="flex items-center gap-2 text-sm text-green-700">
              <Check size={16} /> {t('condense.copyReady')}
            </div>
            <p className="text-2xs text-ink-faint leading-relaxed">{t('condense.copyCompareHint')}</p>
            <button onClick={archiveOriginal} data-condense-archive-original
              className="self-start text-xs border border-line text-ink-muted hover:text-ink hover:bg-wash px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5">
              <Archive size={13} strokeWidth={1.75} /> {t('condense.archiveOriginal')}
            </button>
            <button onClick={close} className="self-start text-xs text-ink-faint hover:text-ink transition-colors">{t('common.close')}</button>
          </div>
        )}
      </div>
    </div>
  ), document.body);
}
