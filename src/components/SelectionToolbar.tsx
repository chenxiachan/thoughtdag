import { useState, useRef, useEffect } from 'react';
import { ClipboardList, FileDown, GitBranch, Star, Trash2 } from 'lucide-react';
import { useStore } from '../store';
import { confirmDialog } from '../lib/ui-store';
import { selectionMarkdown, downloadMarkdown } from '../lib/export';
import { useT, t as ti, fmt } from '../i18n';

export default function SelectionToolbar() {
  const { selectedNodeIds, nodes, batchDelete, batchMergeSummarize, addQuestion } = useStore();
  const t = useT();
  const [exploreOpen, setExploreOpen] = useState(false);
  const [exploreInput, setExploreInput] = useState('');
  const exploreRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (exploreOpen) setTimeout(() => exploreRef.current?.focus(), 100);
  }, [exploreOpen]);

  // Reset explore when selection changes
  const [prevSelectionCount, setPrevSelectionCount] = useState(selectedNodeIds.length);
  if (prevSelectionCount !== selectedNodeIds.length) {
    setPrevSelectionCount(selectedNodeIds.length);
    setExploreOpen(false);
    setExploreInput('');
  }

  if (selectedNodeIds.length < 2) return null;

  const selectedNodes = selectedNodeIds
    .map((id) => nodes.find((n) => n.id === id))
    .filter(Boolean);

  const totalTokens = selectedNodes.reduce((sum, n) => sum + (n?.data.tokenCount || 0), 0);

  // Collect all highlights from selected nodes
  const allHighlights = selectedNodes.flatMap((n) => n?.data.highlights || []);

  // Build context from selected nodes for explore
  const selectedContent = selectedNodes
    .map((n) => `Q: ${n?.data.question}\nA: ${n?.data.response}`)
    .join('\n\n---\n\n');

  const handleExplore = () => {
    if (!exploreInput.trim()) return;
    // Use first selected node as parent
    addQuestion(exploreInput.trim(), { parentId: selectedNodeIds[0], branchContext: selectedContent });
    setExploreOpen(false);
    setExploreInput('');
  };

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
          {/* Summarize Highlights — only if highlights exist */}
          {allHighlights.length > 0 && (
            <button
              onClick={() => {
                const highlightTexts = allHighlights.map((h) => h.text).join('\n\n');
                addQuestion(
                  `Summarize the following highlights from ${selectedNodeIds.length} nodes concisely. Use the same language as the content:\n\n${highlightTexts}`,
                  { parentId: selectedNodeIds[0] }
                );
              }}
              className="text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 px-3 py-1.5 rounded-lg transition-colors"
              title={t('toolbar.summaryHighlightsTitle')}
            >
              <Star size={14} strokeWidth={1.75} className="inline" /> {t('toolbar.summaryHighlights')}
            </button>
          )}

          <button
            onClick={() => batchMergeSummarize(selectedNodeIds)}
            className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 px-3 py-1.5 rounded-lg transition-colors"
            title={t('toolbar.mergeSummaryTitle')}
          >
            <ClipboardList size={14} strokeWidth={1.75} className="inline" /> {t('toolbar.mergeSummary')}
          </button>

          <button
            onClick={() => batchMergeSummarize(selectedNodeIds, true)}
            className="text-xs bg-accent/10 hover:bg-accent/20 text-accent px-3 py-1.5 rounded-lg transition-colors"
            title={t('toolbar.mergeDeleteTitle')}
          >
            <ClipboardList size={14} strokeWidth={1.75} className="inline" /> {t('toolbar.mergeDelete')}
          </button>

          <button
            onClick={() => setExploreOpen(!exploreOpen)}
            className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
              exploreOpen
                ? 'bg-accent text-white'
                : 'bg-accent/10 hover:bg-accent/20 text-accent'
            }`}
            title={t('toolbar.exploreTitle')}
          >
            <GitBranch size={14} strokeWidth={1.75} className="inline" /> {t('common.explore')}
          </button>

          <button
            onClick={() => downloadMarkdown(selectionMarkdown(selectedNodeIds))}
            className="text-xs bg-wash hover:bg-line text-ink-muted px-3 py-1.5 rounded-lg transition-colors"
            title={t('toolbar.exportTitle')}
          >
            <FileDown size={14} strokeWidth={1.75} className="inline" /> {t('common.exportMd')}
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

        {/* Explore input */}
        {exploreOpen && (
          <div className="flex gap-1.5 pt-1">
            <input
              ref={exploreRef}
              type="text"
              value={exploreInput}
              onChange={(e) => setExploreInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && exploreInput.trim()) handleExplore();
                if (e.key === 'Escape') { setExploreOpen(false); setExploreInput(''); }
              }}
              placeholder={t('toolbar.explorePlaceholder')}
              className="flex-1 text-xs border border-accent/30 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent bg-accent/5 min-w-[300px]"
            />
            <button
              onClick={handleExplore}
              disabled={!exploreInput.trim()}
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
