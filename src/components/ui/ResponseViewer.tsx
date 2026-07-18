import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GitBranch, Loader2, Send, Star, X } from 'lucide-react';
import { useStore } from '../../store';
import { useUiStore } from '../../lib/ui-store';
import { Markdown, HighlightedMarkdown } from '../Markdown';
import ReasoningDisclosure from './ReasoningDisclosure';
import { isViewerMode } from '../../lib/viewer';
import { generateId, isImeComposing } from '../../utils';
import { useT } from '../../i18n';

// The answer, reading-size: the same reading loop the PDF reader gives
// external material, for the model's own text — select to highlight or to
// branch from a passage, ask a follow-up below. Every answer is reading
// material; every reading invites divergence. Follow-ups keep you in the
// viewer: it swaps to the new node and streams the answer in place, so a
// whole chain of questions can be read and asked without leaving.

export default function ResponseViewer() {
  const nodeId = useUiStore((s) => s.responseViewerNodeId);
  const node = useStore((s) => (nodeId ? s.nodes.find((n) => n.id === nodeId) : undefined));
  const t = useT();
  const close = () => useUiStore.getState().setResponseViewerNodeId(null);

  const bodyRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [selectedText, setSelectedText] = useState('');
  const [selectionPos, setSelectionPos] = useState<{ x: number; y: number } | null>(null);
  const [branchFrom, setBranchFrom] = useState('');
  const [input, setInput] = useState('');

  useEffect(() => {
    if (!nodeId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [nodeId]);

  // Same selection bar as the card and the panel: select → highlight / branch
  const handleTextSelection = useCallback(() => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0 && bodyRef.current?.contains(selection.anchorNode)) {
      const text = selection.toString().trim();
      setSelectedText(text);
      const rangeRect = selection.getRangeAt(0).getBoundingClientRect();
      const shellRect = shellRef.current?.getBoundingClientRect();
      if (shellRect) {
        setSelectionPos({
          x: Math.max(70, Math.min(rangeRect.left + rangeRect.width / 2 - shellRect.left, shellRect.width - 70)),
          y: Math.max(8, rangeRect.top - shellRect.top - 46),
        });
      }
    } else {
      setSelectedText('');
      setSelectionPos(null);
    }
  }, []);

  useEffect(() => {
    if (!nodeId || isViewerMode) return;
    document.addEventListener('mouseup', handleTextSelection);
    return () => document.removeEventListener('mouseup', handleTextSelection);
  }, [nodeId, handleTextSelection]);

  // Reset staged input when the viewer swaps nodes
  useEffect(() => { setBranchFrom(''); setInput(''); setSelectedText(''); setSelectionPos(null); }, [nodeId]);

  if (!nodeId || !node) return null;
  const data = node.data;
  const reasoning = data.reasonings?.[data.responseIndex];
  const canInteract = !isViewerMode && !data.stepKind;

  const highlightSelection = () => {
    if (!selectedText) return;
    useStore.getState().addHighlight(nodeId, { id: generateId(), text: selectedText });
    setSelectedText('');
    setSelectionPos(null);
    window.getSelection()?.removeAllRanges();
  };

  const branchFromSelection = () => {
    setBranchFrom(selectedText);
    setSelectedText('');
    setSelectionPos(null);
    window.getSelection()?.removeAllRanges();
    setTimeout(() => inputRef.current?.focus(), 60);
  };

  const ask = () => {
    const q = input.trim();
    if (!q || data.isLoading) return;
    void useStore.getState().addQuestion(q, {
      parentId: nodeId,
      branchContext: branchFrom || undefined,
    });
    // addQuestion creates the node synchronously (generation is the async
    // part) — swap the viewer to it and read the answer as it streams
    const fresh = useStore.getState().nodes;
    const newId = fresh[fresh.length - 1]?.id;
    if (newId && newId !== nodeId) useUiStore.getState().setResponseViewerNodeId(newId);
    setInput('');
    setBranchFrom('');
  };

  return createPortal((
    <div className="fixed inset-0 z-[75] bg-ink/25 backdrop-blur-[2px] flex items-center justify-center animate-fade-in" onClick={close} data-response-viewer>
      <div ref={shellRef} className="relative bg-surface rounded-2xl shadow-2xl border border-line w-[min(920px,92vw)] h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 px-6 py-4 border-b border-line bg-card shrink-0">
          <div className="flex-1 min-w-0 text-sm font-semibold text-ink leading-snug line-clamp-2">{data.question}</div>
          <button onClick={close} title={t('panel.close')} className="w-7 h-7 rounded-lg text-ink-faint hover:bg-wash hover:text-ink flex items-center justify-center transition-colors shrink-0">
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6">
          <div className="max-w-[760px] mx-auto" ref={bodyRef}>
            {reasoning && <ReasoningDisclosure text={reasoning} />}
            {data.isLoading && (!data.response || data.restreaming) ? (
              data.reasoning ? (
                <div>
                  <div className="text-2xs text-ink-faint mb-1">💭 {t('node.reasoningLive')}</div>
                  <div className="text-xs text-ink-faint italic leading-relaxed whitespace-pre-wrap break-words">{data.reasoning}</div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-ink-muted py-10 justify-center">
                  <Loader2 size={16} strokeWidth={1.75} className="animate-spin text-accent" /> {t('common.thinking')}
                </div>
              )
            ) : (
              <div className="markdown-body text-[15px] text-ink leading-relaxed cursor-text">
                {data.highlights.length > 0 && !data.isLoading ? (
                  <HighlightedMarkdown content={data.response} highlights={new Set(data.highlights.map((h) => h.text))} />
                ) : (
                  <Markdown>{data.response}</Markdown>
                )}
                {data.isLoading && <span className="inline-block w-2 h-4 bg-accent animate-pulse rounded-sm ml-0.5" />}
              </div>
            )}
          </div>
        </div>

        {/* Selection bar: the card's grammar, in reading size */}
        {canInteract && selectedText && selectionPos && (
          <div
            className="absolute z-10 flex gap-1 bg-card border border-line rounded-xl shadow-lg p-1 animate-fade-in"
            style={{ left: selectionPos.x, top: selectionPos.y, transform: 'translateX(-50%)' }}
            onMouseDown={(e) => e.preventDefault()}
          >
            <button
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); branchFromSelection(); }}
              className="bg-accent hover:bg-accent-strong text-white text-xs px-3 py-1.5 rounded-lg transition-all whitespace-nowrap cursor-pointer"
            >
              <GitBranch size={14} strokeWidth={1.75} className="inline" /> {t('common.explore')}
            </button>
            <button
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); highlightSelection(); }}
              className="bg-amber-500 hover:bg-amber-400 text-white text-xs px-3 py-1.5 rounded-lg transition-all whitespace-nowrap cursor-pointer"
            >
              <Star size={14} strokeWidth={1.75} className="inline" /> {t('common.highlight')}
            </button>
          </div>
        )}

        {/* Follow-up right where you read — the answer streams back into
            this same viewer (the divergence loop never leaves the text) */}
        {canInteract && (
          <div className="border-t border-line bg-card px-6 py-3 shrink-0">
            <div className="max-w-[760px] mx-auto">
              {branchFrom && (
                <div className="mb-2 text-xs pl-3 py-1.5 pr-2 border-l-2 border-warm bg-warm/10 rounded-r text-ink-muted flex items-start gap-1.5">
                  <GitBranch size={13} strokeWidth={1.75} className="text-warm shrink-0 mt-0.5" />
                  <span className="italic leading-relaxed min-w-0 flex-1">“{branchFrom.slice(0, 160)}{branchFrom.length > 160 ? '…' : ''}”</span>
                  <button onClick={() => setBranchFrom('')} className="text-ink-faint hover:text-ink shrink-0" title={t('common.cancel')}>
                    <X size={13} strokeWidth={1.75} />
                  </button>
                </div>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !isImeComposing(e)) { e.preventDefault(); ask(); }
                  }}
                  placeholder={branchFrom ? t('viewerqa.placeholderBranch') : t('viewerqa.placeholder')}
                  rows={1}
                  className="flex-1 text-sm bg-wash border border-line rounded-xl px-3.5 py-2.5 resize-none focus:outline-none focus:ring-1 focus:ring-accent leading-relaxed"
                />
                <button
                  onClick={ask}
                  disabled={!input.trim() || data.isLoading}
                  title={t('viewerqa.askTitle')}
                  className="w-9 h-9 rounded-xl bg-accent text-white flex items-center justify-center hover:bg-accent-strong transition-colors disabled:opacity-30 shrink-0"
                >
                  <Send size={15} strokeWidth={1.75} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  ), document.body);
}
