import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Copy, GitBranch, Maximize2, RefreshCw, Star, Trash2 } from 'lucide-react';
import { useStore } from '../../store';
import { useUiStore } from '../../lib/ui-store';
import { generateId } from '../../utils';
import { copyText } from '../../lib/export';
import { Markdown, HighlightedMarkdown } from '../Markdown';
import { useT } from '../../i18n';
import { isViewerMode } from '../../lib/viewer';
import { collectExploreMarksKey, type ExploreMark } from '../../lib/explore-marks';
import ReasoningDisclosure from '../ui/ReasoningDisclosure';
import type { ThoughtData } from '../../types';

export default function ResponseSection({
  nodeId,
  data,
  hasMultipleVersions,
  highlightedTexts,
  onExploreSelection,
  onFocusNode,
}: {
  nodeId: string;
  data: ThoughtData;
  hasMultipleVersions: boolean;
  highlightedTexts: Set<string>;
  onExploreSelection: (text: string) => void;
  onFocusNode?: (id: string) => void;
}) {
  const editResponse = useStore((s) => s.editResponse);
  const editQuestion = useStore((s) => s.editQuestion);
  const setEditingResponse = useStore((s) => s.setEditingResponse);
  const navigateVersion = useStore((s) => s.navigateVersion);
  const rerunNode = useStore((s) => s.rerunNode);
  const deleteVersion = useStore((s) => s.deleteVersion);
  const addHighlight = useStore((s) => s.addHighlight);
  const setSelectedNodeId = useStore((s) => s.setSelectedNodeId);
  // Passages child branches explore from (derived from the children).
  // Clicking a mark walks the panel to that branch and centers it. The
  // selector returns the serialized form: a fresh array from a selector
  // re-renders forever (Object.is snapshot comparison).
  const exploreMarksKey = useStore((s) => collectExploreMarksKey(nodeId, s.nodes, s.edges));
  const exploreMarks = useMemo(() => JSON.parse(exploreMarksKey) as ExploreMark[], [exploreMarksKey]);
  const t = useT();
  const exploreSpecs = exploreMarks.map((m) => ({
    text: m.text,
    nodeId: m.nodeId,
    title: `${t('node.exploredHere')} · ${m.question.slice(0, 80)}`,
  }));
  const handleExploreMarkClick = (e: React.MouseEvent) => {
    const m = (e.target as HTMLElement).closest?.('mark[data-explore-target]');
    if (!m) return;
    if (window.getSelection()?.toString()) return; // a drag-select, not a click
    e.stopPropagation();
    const childId = m.getAttribute('data-explore-target');
    if (!childId) return;
    setSelectedNodeId(childId);
    onFocusNode?.(childId);
  };

  const [editResponseValue, setEditResponseValue] = useState('');
  const [selectedText, setSelectedText] = useState('');
  const [selectionPos, setSelectionPos] = useState<{ x: number; y: number } | null>(null);
  const responseRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<HTMLDivElement>(null);

  // Follow the stream — but only while the reader is at the bottom. Scroll
  // up during generation and the view stays put (read from the top while
  // the rest streams in); scroll back down to re-engage following.
  useEffect(() => {
    const el = streamRef.current;
    if (!data.isLoading || !el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) {
      el.scrollTop = el.scrollHeight;
    }
  }, [data.isLoading, data.response, data.reasoning]);

  // Text selection handler
  const handleTextSelection = useCallback((e: MouseEvent) => {
    // Don't clear selection if clicking inside an input/textarea (branch input, etc.)
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON') {
      return;
    }

    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0 && responseRef.current?.contains(selection.anchorNode)) {
      const text = selection.toString().trim();
      setSelectedText(text);
      const range = selection.getRangeAt(0);
      const rangeRect = range.getBoundingClientRect();
      const panelRect = responseRef.current?.getBoundingClientRect();
      if (panelRect) {
        setSelectionPos({
          x: rangeRect.left + rangeRect.width / 2 - panelRect.left,
          y: rangeRect.top - panelRect.top - 48,
        });
      }
    } else {
      setSelectedText('');
      setSelectionPos(null);
    }
  }, []);

  useEffect(() => {
    if (isViewerMode) return; // selection menu stages writes
    document.addEventListener('mouseup', handleTextSelection);
    return () => document.removeEventListener('mouseup', handleTextSelection);
  }, [handleTextSelection]);

  const handleDoubleClickResponse = () => {
    if (isViewerMode) return;
    if (isViewerMode) return;
    setEditResponseValue(data.response);
    setEditingResponse(nodeId, true);
  };

  const handleResponseEditSubmit = () => {
    editResponse(nodeId, editResponseValue);
  };

  const handleResponseEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setEditingResponse(nodeId, false);
  };

  const handleHighlight = () => {
    if (!selectedText) return;
    addHighlight(nodeId, { id: generateId(), text: selectedText });
    setSelectedText('');
    setSelectionPos(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleBranchFromSelection = () => {
    onExploreSelection(selectedText); // save before selection clears
    setSelectedText('');
    setSelectionPos(null);
    window.getSelection()?.removeAllRanges();
  };

  // No response yet and nothing in flight (e.g. a fresh ask node or a
  // paradigm human turn) — the card would be an empty box, so skip it.
  if (!data.response && !data.isLoading && !data.isEditingResponse && !data.generationFailed) {
    return null;
  }

  return (
    <div className="panel-card px-4 py-3">
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-2xs font-semibold text-green-600">{t('panel.response')}</label>
        {(data.response || data.isLoading) && (
          <button
            onClick={() => useUiStore.getState().setResponseViewerNodeId(nodeId)}
            title={t('panel.expandResponse')}
            className="text-ink-faint hover:text-accent w-6 h-6 rounded-md hover:bg-wash flex items-center justify-center transition-colors"
            data-response-expand
          >
            <Maximize2 size={13} strokeWidth={1.75} />
          </button>
        )}
      </div>

      {data.isLoading && (!data.response || data.restreaming) ? (
        data.reasoning ? (
          <div className="py-1">
            <div className="text-2xs text-ink-faint mb-1">💭 {t('node.reasoningLive')}</div>
            <div ref={streamRef} className="text-xs text-ink-faint italic leading-relaxed whitespace-pre-wrap break-words max-h-[300px] overflow-y-auto">
              {data.reasoning.length > 4000 ? '…' + data.reasoning.slice(-4000) : data.reasoning}
            </div>
          </div>
        ) : (
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <span className="animate-pulse text-accent">●</span> {t('common.thinking')}
        </div>
        )
      ) : data.isLoading && data.response && !data.restreaming ? (
        <div ref={streamRef} className="markdown-body text-sm text-ink leading-relaxed max-h-[500px] overflow-y-auto py-1">
          <Markdown>{data.response}</Markdown>
          <span className="inline-block w-2 h-4 bg-accent animate-pulse rounded-sm ml-0.5 align-text-bottom" />
        </div>
      ) : data.isEditingResponse ? (
        <div>
          <textarea
            value={editResponseValue}
            onChange={(e) => setEditResponseValue(e.target.value)}
            onKeyDown={handleResponseEditKeyDown}
            className="w-full bg-wash border border-accent rounded-xl p-3 text-sm text-ink resize-y focus:outline-none focus:ring-2 focus:ring-accent/20 min-h-[150px]"
            rows={10}
            autoFocus
          />
          <div className="flex justify-end gap-2 mt-2">
            <button onClick={() => setEditingResponse(nodeId, false)} className="text-xs text-ink-muted hover:text-ink px-3 py-1.5 rounded-lg hover:bg-wash transition-colors">{t('common.cancel')}</button>
            <button onClick={handleResponseEditSubmit} className="text-xs bg-accent hover:bg-accent-strong text-white px-4 py-1.5 rounded-lg transition-colors">{t('common.save')}</button>
          </div>
        </div>
      ) : (
        <div ref={responseRef} onDoubleClick={handleDoubleClickResponse} className="relative">
          {data.reasonings?.[data.responseIndex] && (
            <ReasoningDisclosure text={data.reasonings[data.responseIndex]!} />
          )}
          <div className="markdown-body text-sm text-ink leading-relaxed cursor-text py-1" onClick={handleExploreMarkClick}>
            {highlightedTexts.size > 0 || exploreSpecs.length > 0 ? (
              <HighlightedMarkdown content={data.response} highlights={highlightedTexts} exploreMarks={exploreSpecs} />
            ) : (
              <Markdown>{data.response}</Markdown>
            )}
          </div>

          {/* Floating toolbar for text selection */}
          {selectedText && selectionPos && (
            <div
              style={{
                position: 'absolute',
                left: Math.max(0, Math.min(selectionPos.x, 420)),
                top: Math.max(-40, selectionPos.y),
                transform: 'translateX(-50%)',
                zIndex: 9999,
              }}
              onMouseDown={(e) => e.preventDefault()}
            >
              <div className="flex gap-1 bg-card border border-line rounded-xl shadow-lg p-1 animate-fade-in">
                <button
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); handleBranchFromSelection(); }}
                  className="bg-accent hover:bg-accent-strong text-white text-xs px-3 py-1.5 rounded-lg transition-all whitespace-nowrap cursor-pointer"
                >
                  <GitBranch size={14} strokeWidth={1.75} className="inline" /> {t('common.explore')}
                </button>
                <button
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); handleHighlight(); }}
                  className="bg-amber-500 hover:bg-amber-400 text-white text-xs px-3 py-1.5 rounded-lg transition-all whitespace-nowrap cursor-pointer"
                >
                  <Star size={14} strokeWidth={1.75} className="inline" /> {t('common.highlight')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Response action row — the actions that act on THIS answer live
          under it (LLM-chat convention); the sibling-branch variant is in
          the header's ⋯ menu */}
      {data.response && !data.isLoading && !data.isEditingResponse && !data.generationFailed && (
        <div className="mt-2 flex items-center gap-0.5 text-ink-faint">
          {!isViewerMode && <button
            onClick={() => void rerunNode(nodeId, {})}
            className="rounded-full w-7 h-7 flex items-center justify-center hover:text-accent hover:bg-wash transition-colors"
            title={t('common.regenerate')}
          >
            <RefreshCw size={15} strokeWidth={1.75} />
          </button>}
          <button
            onClick={() => void copyText(data.response)}
            className="rounded-full w-7 h-7 flex items-center justify-center hover:text-accent hover:bg-wash transition-colors"
            title={t('actions.copyResponse')}
          >
            <Copy size={14} strokeWidth={1.75} />
          </button>
          {(data.generatedBy?.[data.responseIndex]) && (
            <span
              className="text-2xs text-ink-faint font-mono ml-1 truncate max-w-[170px]"
              title={t('node.generatedByTitle')}
            >
              {data.generatedBy[data.responseIndex]!.split('/').pop()}
            </span>
          )}
          {hasMultipleVersions && (
            <div className="flex items-center gap-1 text-xs text-ink-muted ml-1">
              <button onClick={() => navigateVersion(nodeId, 'prev')} className="hover:text-accent hover:bg-wash rounded-full w-5 h-5 flex items-center justify-center transition-colors"><ChevronLeft size={14} strokeWidth={1.75} /></button>
              <span className="text-accent font-medium">v{data.responseIndex + 1}/{data.responses.length}</span>
              <button onClick={() => navigateVersion(nodeId, 'next')} className="hover:text-accent hover:bg-wash rounded-full w-5 h-5 flex items-center justify-center transition-colors"><ChevronRight size={14} strokeWidth={1.75} /></button>
              {!isViewerMode && <button
                onClick={() => deleteVersion(nodeId, data.responseIndex)}
                className="text-ink-faint hover:text-red-500 hover:bg-red-50 rounded-full w-5 h-5 flex items-center justify-center transition-colors"
                title={t('common.deleteVersion')}
              >
                <Trash2 size={13} strokeWidth={1.75} />
              </button>}
            </div>
          )}
        </div>
      )}

      {/* Web references consulted for this response */}
      {data.references && data.references.length > 0 && !data.isLoading && (
        <div className="mt-3 pt-2 border-t border-line/60">
          <p className="text-2xs text-ink-faint font-medium mb-1.5">{t('refs.title')}</p>
          <ol className="space-y-1">
            {data.references.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-xs leading-snug">
                <span className="shrink-0 text-2xs text-ink-faint font-mono mt-0.5">[{i + 1}]</span>
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noreferrer" className="text-accent hover:text-accent-strong hover:underline break-all">
                    {r.title}
                  </a>
                ) : (
                  <span className="text-ink-muted">{r.title}</span>
                )}
                {(r.media || r.date) && (
                  <span className="shrink-0 text-2xs text-ink-faint">{[r.media, r.date].filter(Boolean).join(' · ')}</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Failed generation: retry in place */}
      {data.generationFailed && !data.isLoading && (
        <div className="mt-2 flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <AlertTriangle size={14} strokeWidth={1.75} className="shrink-0" />
          {t('common.generationFailed')}
          {!isViewerMode && <button
            onClick={() => editQuestion(nodeId, data.question)}
            className="ml-auto bg-card border border-red-200 hover:bg-red-100 text-red-600 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1"
          >
            <RefreshCw size={12} strokeWidth={1.75} /> {t('common.retry')}
          </button>}
        </div>
      )}
    </div>
  );
}
