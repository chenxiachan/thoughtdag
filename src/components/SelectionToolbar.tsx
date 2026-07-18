import { useState, useRef, useEffect } from 'react';
import { AlignVerticalJustifyStart, Archive, ClipboardList, Copy, FileDown, GitBranch, Highlighter, Trash2 } from 'lucide-react';
import { useStore } from '../store';
import { confirmDialog } from '../lib/ui-store';
import { selectionMarkdown, downloadMarkdown } from '../lib/export';
import { isImeComposing } from '../utils';
import { useT, t as ti, fmt } from '../i18n';

// The two families of batch actions share one input row:
//   explore   → REQUIRED question (a new direction needs words)
//   merge / merge-delete / weave → OPTIONAL intent (empty = standard run);
// the row opens under whichever button was pressed, Enter runs, Esc closes.
type PendingAction = 'explore' | 'merge' | 'mergeDelete' | 'weave' | null;

export default function SelectionToolbar() {
  const { selectedNodeIds, nodes, batchDelete, batchMergeSummarize, weaveHighlights, exploreFrom, alignSelection, setArchived, duplicateSelection } = useStore();
  const t = useT();
  const [pending, setPending] = useState<PendingAction>(null);
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (pending) setTimeout(() => inputRef.current?.focus(), 100);
  }, [pending]);

  // Reset the input row when selection changes
  const [prevSelectionCount, setPrevSelectionCount] = useState(selectedNodeIds.length);
  if (prevSelectionCount !== selectedNodeIds.length) {
    setPrevSelectionCount(selectedNodeIds.length);
    setPending(null);
    setInput('');
  }

  if (selectedNodeIds.length < 2) return null;

  const selectedNodes = selectedNodeIds
    .map((id) => nodes.find((n) => n.id === id))
    .filter(Boolean);

  const totalTokens = selectedNodes.reduce((sum, n) => sum + (n?.data.tokenCount || 0), 0);

  // Collect all highlights from selected nodes
  const allHighlights = selectedNodes.flatMap((n) => n?.data.highlights || []);

  const run = () => {
    const text = input.trim();
    if (pending === 'explore') {
      if (!text) return;
      void exploreFrom(selectedNodeIds, text);
    } else if (pending === 'merge') {
      batchMergeSummarize(selectedNodeIds, false, text || undefined);
    } else if (pending === 'mergeDelete') {
      batchMergeSummarize(selectedNodeIds, true, text || undefined);
    } else if (pending === 'weave') {
      void weaveHighlights(selectedNodeIds, text || undefined);
    }
    setPending(null);
    setInput('');
  };

  const toggle = (a: Exclude<PendingAction, null>) => {
    setPending(pending === a ? null : a);
    setInput('');
  };

  const actionBtn = (a: Exclude<PendingAction, null>, active: string, idle: string) =>
    `text-xs px-3 py-1.5 rounded-lg transition-colors ${pending === a ? active : idle}`;

  return (
    <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 animate-fade-in">
      <div className="bg-card/95 backdrop-blur border border-line rounded-xl px-4 py-3 shadow-lg space-y-2">
        {/* Header */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-ink-muted font-medium">
            {fmt(t('toolbar.nodesSelected'), { n: selectedNodeIds.length })}
            <span className="text-xs text-ink-faint ml-1.5">
              ({fmt(t('toolbar.tokens'), { n: totalTokens })}{allHighlights.length > 0 ? fmt(t('toolbar.highlightCount'), { n: allHighlights.length }) : ''})
            </span>
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => toggle('merge')}
            className={actionBtn('merge', 'bg-blue-600 text-white', 'bg-blue-50 hover:bg-blue-100 text-blue-600')}
            title={t('toolbar.mergeSummaryTitle')}
          >
            <ClipboardList size={14} strokeWidth={1.75} className="inline" /> {t('toolbar.mergeSummary')}
          </button>

          <button
            onClick={() => toggle('mergeDelete')}
            className={actionBtn('mergeDelete', 'bg-accent text-white', 'bg-accent/10 hover:bg-accent/20 text-accent')}
            title={t('toolbar.mergeDeleteTitle')}
          >
            <ClipboardList size={14} strokeWidth={1.75} className="inline" /> {t('toolbar.mergeDelete')}
          </button>

          {allHighlights.length > 0 && (
            <button
              onClick={() => toggle('weave')}
              className={actionBtn('weave', 'bg-amber-500 text-white', 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-600')}
              title={t('toolbar.weaveTitle')}
            >
              <Highlighter size={14} strokeWidth={1.75} className="inline" /> {t('toolbar.weave')}
            </button>
          )}

          <button
            onClick={() => toggle('explore')}
            className={actionBtn('explore', 'bg-accent text-white', 'bg-accent/10 hover:bg-accent/20 text-accent')}
            title={t('toolbar.exploreTitle')}
          >
            <GitBranch size={14} strokeWidth={1.75} className="inline" /> {t('common.explore')}
          </button>

          {/* Low-frequency actions: icon-only so the row stays one line in
              both languages (full label lives in the tooltip). */}
          <button
            onClick={() => { setArchived(selectedNodeIds, true); }}
            className="bg-wash hover:bg-line text-ink-muted w-8 h-7 rounded-lg transition-colors flex items-center justify-center"
            title={`${t('archive.label')} — ${t('archive.batchTitle')}`}
          >
            <Archive size={14} strokeWidth={1.75} />
          </button>

          <button
            onClick={() => duplicateSelection(selectedNodeIds)}
            className="bg-wash hover:bg-line text-ink-muted w-8 h-7 rounded-lg transition-colors flex items-center justify-center"
            title={`${t('toolbar.duplicate')} — ${t('toolbar.duplicateTitle')}`}
          >
            <Copy size={14} strokeWidth={1.75} />
          </button>

          <button
            onClick={() => {
              void confirmDialog({
                title: t('confirm.alignTitle'),
                message: fmt(t('confirm.alignMsg'), { n: selectedNodeIds.length }),
                confirmLabel: t('common.confirmAlign'),
              }).then((ok) => { if (ok) alignSelection(selectedNodeIds); });
            }}
            className="bg-wash hover:bg-line text-ink-muted w-8 h-7 rounded-lg transition-colors flex items-center justify-center"
            title={`${t('toolbar.align')} — ${t('confirm.alignTitle')}`}
          >
            <AlignVerticalJustifyStart size={14} strokeWidth={1.75} />
          </button>

          <button
            onClick={() => downloadMarkdown(selectionMarkdown(selectedNodeIds))}
            className="bg-wash hover:bg-line text-ink-muted w-8 h-7 rounded-lg transition-colors flex items-center justify-center"
            title={`${t('common.exportMd')} — ${t('toolbar.exportTitle')}`}
          >
            <FileDown size={14} strokeWidth={1.75} />
          </button>

          <div className="w-px h-5 bg-line" />

          <button
            onClick={() => {
              void confirmDialog({
                title: ti('confirm.deleteNodesTitle'),
                message: fmt(ti('confirm.deleteNodes'), { n: selectedNodeIds.length }),
                confirmLabel: ti('common.delete'),
                danger: true,
              }).then((ok) => { if (ok) batchDelete(selectedNodeIds); });
            }}
            className="text-xs bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Trash2 size={14} strokeWidth={1.75} className="inline" /> {t('toolbar.deleteAll')}
          </button>
        </div>

        {/* Shared input row: question (explore) or optional intent (converge) */}
        {pending && (
          <div className="flex gap-1.5 pt-1">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isImeComposing(e) && (pending !== 'explore' || input.trim())) run();
                if (e.key === 'Escape') { setPending(null); setInput(''); }
              }}
              placeholder={pending === 'explore' ? t('toolbar.explorePlaceholder') : t('toolbar.intentPlaceholder')}
              className="flex-1 text-xs border border-accent/30 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent bg-accent/5 min-w-[300px]"
            />
            <button
              onClick={run}
              disabled={pending === 'explore' && !input.trim()}
              className="text-xs bg-accent text-white px-3 py-2 rounded-lg hover:bg-accent-strong transition-colors shrink-0 disabled:opacity-30"
            >
              {t('common.go')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
