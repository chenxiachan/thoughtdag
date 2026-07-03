import { useState, useRef, useCallback, useEffect } from 'react';
import { useStore } from '../../store';
import { generateId } from '../../utils';
import { Markdown, HighlightedMarkdown } from '../Markdown';
import type { ThoughtData } from '../../types';

export default function ResponseSection({
  nodeId,
  data,
  hasMultipleVersions,
  highlightedTexts,
  onExploreSelection,
}: {
  nodeId: string;
  data: ThoughtData;
  hasMultipleVersions: boolean;
  highlightedTexts: Set<string>;
  onExploreSelection: (text: string) => void;
}) {
  const editResponse = useStore((s) => s.editResponse);
  const setEditingResponse = useStore((s) => s.setEditingResponse);
  const navigateVersion = useStore((s) => s.navigateVersion);
  const deleteVersion = useStore((s) => s.deleteVersion);
  const addHighlight = useStore((s) => s.addHighlight);

  const [editResponseValue, setEditResponseValue] = useState('');
  const [selectedText, setSelectedText] = useState('');
  const [selectionPos, setSelectionPos] = useState<{ x: number; y: number } | null>(null);
  const responseRef = useRef<HTMLDivElement>(null);

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
    document.addEventListener('mouseup', handleTextSelection);
    return () => document.removeEventListener('mouseup', handleTextSelection);
  }, [handleTextSelection]);

  const handleDoubleClickResponse = () => {
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

  return (
    <div className="px-4 py-3 border-b border-line">
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs text-ink-faint uppercase tracking-wide font-medium">Response</label>
        {hasMultipleVersions && (
          <div className="flex items-center gap-1 text-xs text-ink-muted">
            <button onClick={() => navigateVersion(nodeId, 'prev')} className="hover:text-accent hover:bg-wash rounded-full w-5 h-5 flex items-center justify-center transition-colors">‹</button>
            <span className="text-accent font-medium">v{data.responseIndex + 1}/{data.responses.length}</span>
            <button onClick={() => navigateVersion(nodeId, 'next')} className="hover:text-accent hover:bg-wash rounded-full w-5 h-5 flex items-center justify-center transition-colors">›</button>
            {data.responses.length > 1 && (
              <button
                onClick={() => deleteVersion(nodeId, data.responseIndex)}
                className="text-ink-faint hover:text-red-500 hover:bg-red-50 rounded-full w-5 h-5 flex items-center justify-center transition-colors ml-0.5"
                title="Delete this version"
              >
                🗑
              </button>
            )}
          </div>
        )}
      </div>

      {data.isLoading && !data.response ? (
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <span className="animate-pulse text-accent">●</span> Thinking...
        </div>
      ) : data.isLoading && data.response ? (
        <div className="markdown-body text-sm text-ink leading-relaxed max-h-[500px] overflow-y-auto px-3 py-2.5 bg-surface rounded-xl">
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
            <button onClick={() => setEditingResponse(nodeId, false)} className="text-xs text-ink-muted hover:text-ink px-3 py-1.5 rounded-lg hover:bg-wash transition-colors">Cancel</button>
            <button onClick={handleResponseEditSubmit} className="text-xs bg-accent hover:bg-accent-strong text-white px-4 py-1.5 rounded-lg transition-colors">Save</button>
          </div>
        </div>
      ) : (
        <div ref={responseRef} onDoubleClick={handleDoubleClickResponse} className="relative">
          <div className="markdown-body text-sm text-ink leading-relaxed cursor-text px-3 py-2.5 bg-surface rounded-xl">
            {highlightedTexts.size > 0 ? (
              <HighlightedMarkdown content={data.response} highlights={highlightedTexts} />
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
                  ⑂ Explore
                </button>
                <button
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); handleHighlight(); }}
                  className="bg-amber-500 hover:bg-amber-400 text-white text-xs px-3 py-1.5 rounded-lg transition-all whitespace-nowrap cursor-pointer"
                >
                  ⭐ Highlight
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
