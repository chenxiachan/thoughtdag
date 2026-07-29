import { useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, Minimize2, X } from 'lucide-react';
import { useUiStore, toast } from '../../lib/ui-store';
import { useStore } from '../../store';
import { auditForCondense, applyCondense, type CondensePlan } from '../../lib/condense';
import { useI18n, useT, fmt } from '../../i18n';

// The condense trust surface. Three rules make it trustworthy:
// 1. the auditor can only propose the two moves the user already knows
//    (takeaway form / takeaway form + distilled note), never invent others;
// 2. nothing is pre-checked — every row is opted INTO, with its reason,
//    its token saving, and a caution flag when key moves are touched;
// 3. applying is ONE undo step, and every lowered node wears a visible
//    badge that restores full form with one click.

export default function CondenseDialog() {
  const open = useUiStore((s) => s.condenseDialogOpen);
  const t = useT();
  const lang = useI18n((s) => s.lang);
  const [phase, setPhase] = useState<'intro' | 'auditing' | 'plan'>('intro');
  const [plan, setPlan] = useState<CondensePlan | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [error, setError] = useState('');
  const nodeCount = useStore((s) => s.nodes.filter((n) => n.data.response && !n.data.stepKind).length);

  const close = () => {
    useUiStore.getState().setCondenseDialogOpen(false);
    setPhase('intro'); setPlan(null); setPicked(new Set()); setExpanded(new Set()); setError('');
  };
  if (!open) return null;

  const runAudit = async () => {
    setPhase('auditing');
    setError('');
    try {
      const p = await auditForCondense(lang);
      setPlan(p);
      setPhase('plan');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('intro');
    }
  };

  const toggle = (i: number) => {
    setPicked((prev) => { const next = new Set(prev); if (next.has(i)) next.delete(i); else next.add(i); return next; });
  };
  const pickedSuggestions = plan ? [...picked].map((i) => plan.suggestions[i]) : [];
  const pickedSaving = pickedSuggestions.reduce((s, x) => s + x.saving, 0);

  const apply = () => {
    const { lowered, notes } = applyCondense(pickedSuggestions);
    toast('success', fmt(t('condense.applied'), { n: String(lowered), notes: String(notes) }));
    close();
  };

  return createPortal((
    <div className="fixed inset-0 z-[80] bg-ink/25 backdrop-blur-[2px] flex items-center justify-center animate-fade-in" onClick={close} data-condense-dialog>
      <div className="bg-surface rounded-2xl shadow-2xl border border-line w-[min(560px,94vw)] max-h-[84vh] flex flex-col p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-1">
          <div className="text-sm font-semibold text-ink flex items-center gap-2">
            <Minimize2 size={15} strokeWidth={1.75} className="text-accent" /> {t('condense.title')}
          </div>
          <button onClick={close} className="text-ink-faint hover:text-ink rounded-lg w-7 h-7 flex items-center justify-center hover:bg-wash transition-colors"><X size={15} /></button>
        </div>

        {phase === 'intro' && (
          <>
            <p className="text-xs text-ink-muted leading-relaxed mb-2">{t('condense.intro')}</p>
            <p className="text-2xs text-ink-faint leading-relaxed mb-4">{t('condense.introTrust')}</p>
            {error && <p className="text-2xs text-red-600 mb-2">{error}</p>}
            <button
              onClick={() => void runAudit()}
              disabled={nodeCount < 4}
              data-condense-run
              className="self-start text-xs bg-accent text-white px-4 py-2 rounded-lg disabled:opacity-40 transition-colors"
            >
              {fmt(t('condense.run'), { n: String(nodeCount) })}
            </button>
            {nodeCount < 4 && <p className="text-2xs text-ink-faint mt-2">{t('condense.tooSmall')}</p>}
          </>
        )}

        {phase === 'auditing' && (
          <div className="flex items-center gap-2 text-sm text-ink-muted py-8 justify-center">
            <Loader2 size={16} className="animate-spin text-accent" /> {t('condense.auditing')}
          </div>
        )}

        {phase === 'plan' && plan && (
          <>
            <p className="text-2xs text-ink-faint mb-3">
              {fmt(t('condense.planHead'), { audited: String(plan.auditedNodes), n: String(plan.suggestions.length), tok: String(plan.totalSaving) })}
            </p>
            {plan.suggestions.length === 0 ? (
              <p className="text-xs text-ink-muted py-4">{t('condense.nothing')}</p>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
                {plan.suggestions.map((s, i) => (
                  <div key={i} className={`border rounded-xl p-3 transition-colors ${picked.has(i) ? 'border-accent bg-accent/5' : 'border-line'}`} data-condense-item>
                    <div className="flex items-start gap-2.5">
                      <input type="checkbox" checked={picked.has(i)} onChange={() => toggle(i)} className="mt-0.5 accent-[var(--color-accent)]" data-condense-check />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-2xs font-medium text-accent bg-accent/10 px-1.5 py-0.5 rounded-full">
                            {s.type === 'merge' ? t('condense.typeMerge') : t('condense.typeLower')}
                          </span>
                          <span className="text-2xs text-ink-faint font-mono">{fmt(t('condense.itemMeta'), { n: String(s.nodeIds.length), tok: String(s.saving) })}</span>
                          {s.touchesKeyMoves && (
                            <span className="text-2xs text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                              <AlertTriangle size={10} strokeWidth={1.75} /> {t('condense.keyMoves')}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-ink mt-1 leading-relaxed">{s.reason}</p>
                        {s.distilled && (
                          <button onClick={() => setExpanded((p) => { const n2 = new Set(p); if (n2.has(i)) n2.delete(i); else n2.add(i); return n2; })}
                            className="text-2xs text-ink-faint hover:text-accent mt-1 flex items-center gap-1">
                            {expanded.has(i) ? <ChevronDown size={11} /> : <ChevronRight size={11} />} {t('condense.previewDistilled')}
                          </button>
                        )}
                        {s.distilled && expanded.has(i) && (
                          <div className="text-2xs text-ink-muted bg-wash rounded-lg p-2 mt-1 whitespace-pre-wrap leading-relaxed max-h-[160px] overflow-y-auto">{s.distilled}</div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between pt-3 mt-2 border-t border-line">
              <span className="text-2xs text-ink-faint">{t('condense.reversible')}</span>
              <button
                onClick={apply}
                disabled={picked.size === 0}
                data-condense-apply
                className="text-xs bg-accent text-white px-4 py-2 rounded-lg disabled:opacity-40 transition-colors"
              >
                {fmt(t('condense.apply'), { n: String(picked.size), tok: String(pickedSaving) })}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  ), document.body);
}
