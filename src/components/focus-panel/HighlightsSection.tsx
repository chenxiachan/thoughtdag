import { useState, useRef, useEffect } from 'react';
import { ChevronRight, GitBranch, Scissors, Star, Tag, X } from 'lucide-react';
import { useStore } from '../../store';
import { isImeComposing } from '../../utils';
import { useT } from '../../i18n';
import { isViewerMode } from '../../lib/viewer';
import type { Highlight } from '../../types';

// Highlights: the list, how they pass downstream (tag / filter-only — no
// highlights at all IS the "pass everything" state), and one way to act on
// them: ask a question about them (an explore branch).

export default function HighlightsSection({
  nodeId,
  highlights,
  highlightMode,
}: {
  nodeId: string;
  highlights: Highlight[];
  highlightMode: 'off' | 'tag' | 'filter';
}) {
  const addQuestion = useStore((s) => s.addQuestion);
  const removeHighlight = useStore((s) => s.removeHighlight);
  const setHighlightMode = useStore((s) => s.setHighlightMode);
  const t = useT();

  const [highlightExploreContext, setHighlightExploreContext] = useState('');
  const [highlightExploreInput, setHighlightExploreInput] = useState('');
  const highlightExploreRef = useRef<HTMLInputElement>(null);

  // Auto-focus highlight explore input when context is set
  useEffect(() => {
    if (highlightExploreContext) {
      setTimeout(() => highlightExploreRef.current?.focus(), 100);
    }
  }, [highlightExploreContext]);

  const submitExplore = () => {
    if (!highlightExploreInput.trim()) return;
    addQuestion(highlightExploreInput.trim(), { parentId: nodeId, branchContext: highlightExploreContext });
    setHighlightExploreInput('');
    setHighlightExploreContext('');
  };

  return (
    <div className="panel-card px-4 py-3">
      <details className="group" open={highlights.length > 0}>
        <summary className="text-2xs font-semibold text-amber-600 cursor-pointer hover:text-amber-500 transition-colors flex items-center gap-1.5 select-none">
          <ChevronRight size={12} strokeWidth={1.75} className="transition-transform group-open:rotate-90" />
          {t('highlight.title')}
          {highlights.length > 0 && (
            <span className="text-ink-faint font-normal">({highlights.length})</span>
          )}
        </summary>
        <div className="mt-2">
          {highlights.length === 0 ? (
            <p className="text-xs text-ink-faint italic">{t('highlight.empty')}</p>
          ) : (
            <>
              <div className="space-y-1.5 mb-3">
                {highlights.map((h) => (
                  <div key={h.id} className="flex items-start gap-2 bg-amber-50 rounded-lg px-3 py-2 group/hl">
                    <span className="text-xs text-amber-700 flex-1 leading-relaxed">
                      <Star size={14} strokeWidth={1.75} className="inline" /> {h.text.slice(0, 80)}{h.text.length > 80 ? '…' : ''}
                    </span>
                    {!isViewerMode && <button
                      onClick={() => removeHighlight(nodeId, h.id)}
                      className="text-amber-300 hover:text-red-500 transition-colors shrink-0 opacity-0 group-hover/hl:opacity-100"
                    >
                      <X size={14} strokeWidth={1.75} />
                    </button>}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                {/* Downstream mode: tag or filter-only */}
                <div className="flex items-center gap-1.5">
                  {([
                    { mode: 'tag' as const, icon: <Tag size={14} strokeWidth={1.75} />, label: t('highlight.modeTag') },
                    { mode: 'filter' as const, icon: <Scissors size={14} strokeWidth={1.75} />, label: t('highlight.modeFilter') },
                  ]).map(({ mode, icon, label }) => (
                    <button
                      key={mode}
                      onClick={() => setHighlightMode(nodeId, mode)}
                      title={mode === 'tag' ? t('highlight.hintTag') : t('highlight.hintFilter')}
                      className={`text-xs px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 ${
                        highlightMode === mode
                          ? 'bg-accent text-white'
                          : 'bg-wash text-ink-muted hover:bg-line'
                      }`}
                    >
                      <span>{icon}</span> {label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setHighlightExploreContext(highlights.map((h) => h.text).join('\n\n'))}
                  className="text-xs bg-accent/10 hover:bg-accent/20 text-accent px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                  title={t('highlight.exploreTitle')}
                >
                  <GitBranch size={14} strokeWidth={1.75} />
                  {t('common.explore')}
                </button>
              </div>
              {/* Highlight Explore input */}
              {highlightExploreContext && (
                <div className="mt-3 flex gap-1.5">
                  <input
                    ref={highlightExploreRef}
                    type="text"
                    value={highlightExploreInput}
                    onChange={(e) => setHighlightExploreInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isImeComposing(e)) submitExplore();
                      if (e.key === 'Escape') { setHighlightExploreContext(''); setHighlightExploreInput(''); }
                    }}
                    placeholder={t('highlight.explorePlaceholder')}
                    className="flex-1 text-xs border border-accent/30 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent bg-accent/5"
                  />
                  <button
                    onClick={submitExplore}
                    className="text-xs bg-accent text-white px-3 py-2 rounded-lg hover:bg-accent-strong transition-colors shrink-0"
                  >
                    {t('common.go')}
                  </button>
                  <button
                    onClick={() => { setHighlightExploreContext(''); setHighlightExploreInput(''); }}
                    className="text-xs text-ink-faint hover:text-ink-muted px-1.5 py-2 transition-colors shrink-0"
                  >
                    <X size={14} strokeWidth={1.75} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </details>
    </div>
  );
}
