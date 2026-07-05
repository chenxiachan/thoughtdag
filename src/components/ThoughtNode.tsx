import { useState, useRef, useCallback, useEffect } from 'react';
import { Handle, Position, useStore as useRfStore, type NodeProps } from '@xyflow/react';
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Eye, GitBranch, Globe, Paperclip, RefreshCw, Send, Star, Trash2, X } from 'lucide-react';
import 'katex/dist/katex.min.css';
import type { ThoughtNode as ThoughtNodeType } from '../types';
import { useStore } from '../store';
import { generateId } from '../utils';
import { processFile } from '../lib/attachments';
import { Markdown, HighlightedMarkdown } from './Markdown';
import { useT } from '../i18n';

export default function ThoughtNode({ id, data }: NodeProps<ThoughtNodeType>) {
  const {
    deleteNode, toggleCollapse, setEditing, editQuestion, regenerate,
    setEditingResponse, editResponse, addHighlight, navigateVersion, deleteVersion,
    setSelectedNodeId, selectedNodeId, addAttachment, evaluateNow, setEvaluatorTrigger,
  } = useStore();
  const t = useT();
  const [isDropTarget, setIsDropTarget] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [selectionPos, setSelectionPos] = useState<{ x: number; y: number } | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [branchFromText, setBranchFromText] = useState('');
  const [branchYRatio, setBranchYRatio] = useState(0.5);
  const [editValue, setEditValue] = useState(data.question);
  const [editResponseValue, setEditResponseValue] = useState(data.response);
  const responseRef = useRef<HTMLDivElement>(null);
  const nodeRef = useRef<HTMLDivElement>(null);
  const addQuestion = useStore((s) => s.addQuestion);
  // Semantic zoom: below this level cards render as large-type thumbnails
  const zoomedOut = useRfStore((s) => s.transform[2] < 0.55);

  // Sync local edit buffer when the response changes externally (streaming, undo)
  const [prevResponse, setPrevResponse] = useState(data.response);
  if (prevResponse !== data.response) {
    setPrevResponse(data.response);
    setEditResponseValue(data.response);
  }

  const handleTextSelection = useCallback(() => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0 && responseRef.current?.contains(selection.anchorNode)) {
      const text = selection.toString().trim();
      setSelectedText(text);
      const range = selection.getRangeAt(0);
      const rangeRect = range.getBoundingClientRect();
      const nodeRect = nodeRef.current?.getBoundingClientRect();
      if (nodeRect) {
        setSelectionPos({
          x: rangeRect.left + rangeRect.width / 2 - nodeRect.left,
          y: rangeRect.top - nodeRect.top - 48,
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

  const handleBranch = () => {
    setBranchFromText(selectedText);
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && nodeRef.current) {
      const range = selection.getRangeAt(0);
      const selRect = range.getBoundingClientRect();
      const nodeRect = nodeRef.current.getBoundingClientRect();
      const ratio = Math.max(0.1, Math.min(0.9, (selRect.top + selRect.height / 2 - nodeRect.top) / nodeRect.height));
      setBranchYRatio(ratio);
    }
    setInputValue('');
    setSelectedText('');
    setSelectionPos(null);
  };

  const handleHighlight = () => {
    if (!selectedText) return;
    addHighlight(id, { id: generateId(), text: selectedText });
    setSelectedText('');
    setSelectionPos(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleSubmitBranch = () => {
    if (!inputValue.trim()) return;
    addQuestion(inputValue.trim(), {
      parentId: id,
      branchContext: branchFromText || undefined,
      branchYRatio: branchFromText ? branchYRatio : undefined,
    });
    setInputValue('');
    setBranchFromText('');
    setSelectedText('');
    setSelectionPos(null);
  };

  const handleDoubleClickQuestion = () => {
    setEditValue(data.question);
    setEditing(id, true);
  };

  const handleDoubleClickResponse = () => {
    setEditResponseValue(data.response);
    setEditingResponse(id, true);
  };

  const handleEditSubmit = () => {
    if (editValue.trim()) {
      editQuestion(id, editValue.trim());
    }
  };

  const handleResponseEditSubmit = () => {
    editResponse(id, editResponseValue);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditSubmit(); }
    if (e.key === 'Escape') setEditing(id, false);
  };

  const handleResponseEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setEditingResponse(id, false);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmitBranch(); }
    if (e.key === 'Escape') { setBranchFromText(''); }
  };

  const isRoot = data.isRoot;
  const isBranch = data.isBranch;
  const hasMultipleVersions = data.responses.length > 1;

  const highlightedTexts = new Set(data.highlights.map((h) => h.text));

  return (
    <div
      ref={nodeRef}
      className={`thought-node rounded-xl w-[520px] animate-fade-in transition-all duration-200 ${
        data.isEvaluator ? 'evaluator-node' : isBranch ? 'orange-node' : isRoot ? 'root-node' : 'branch-node'
      } ${data.isLoading ? 'loading-border' : ''} ${selectedNodeId === id ? 'ring-2 ring-accent !border-accent selected-glow' : ''} ${isDropTarget ? 'ring-2 ring-accent/50 ring-dashed' : ''}`}
      onClick={() => setSelectedNodeId(id)}
      onDrop={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDropTarget(false);
        for (const file of Array.from(e.dataTransfer.files)) {
          await processFile(file, {
            add: (att) => addAttachment(id, att),
            update: (attId, patch) => useStore.getState().setAttachmentData(id, attId, patch),
          });
        }
        setSelectedNodeId(id);
      }}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDropTarget(true); }}
      onDragLeave={() => setIsDropTarget(false)}
    >
      <Handle type="target" position={Position.Top} id="top" className="!bg-accent !w-3 !h-3 !border-2 !border-white" />
      <Handle type="target" position={Position.Left} id="left" className="!bg-warm !w-3 !h-3 !border-2 !border-white" style={{ top: '40%' }} />

      {zoomedOut ? (
        // Semantic zoom thumbnail: large type that stays legible from afar
        <div className="drag-handle cursor-grab active:cursor-grabbing px-6 py-5">
          <div className="text-2xl font-semibold text-ink leading-snug line-clamp-3">
            {data.question}
          </div>
          {(data.summary || data.response) && (
            <div className="text-lg text-ink-faint mt-2 leading-snug line-clamp-2">
              {data.summary || data.response.replace(/[#*`>-]/g, '').slice(0, 140)}
            </div>
          )}
        </div>
      ) : (
      <>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-line cursor-grab active:cursor-grabbing drag-handle">
        <div className="flex items-center gap-2">
          <button onClick={() => toggleCollapse(id)} className={`hover:bg-wash rounded-lg w-7 h-7 flex items-center justify-center transition-all text-sm font-bold ${data.isCollapsed ? 'text-accent bg-accent/10' : 'text-ink-faint'}`}>
            {data.isCollapsed ? <ChevronRight size={18} strokeWidth={1.75} /> : <ChevronDown size={18} strokeWidth={1.75} />}
          </button>
          <span className="text-xs text-ink-faint font-mono">{data.tokenCount} tok</span>
          {data.isEvaluator ? (
            <span className="text-2xs bg-watch/10 text-watch px-1.5 py-0.5 rounded-md flex items-center gap-1 font-medium">
              <Eye size={12} strokeWidth={1.75} /> {t('evaluator.badge')}
            </span>
          ) : data.appliedRole && (
            <span className="text-2xs bg-accent/10 text-accent px-1.5 py-0.5 rounded-md truncate max-w-[120px]" title={data.appliedRole}>
              {data.appliedRole.slice(0, 20)}{data.appliedRole.length > 20 ? '…' : ''}
            </span>
          )}
          {hasMultipleVersions && (
            <div className="flex items-center gap-1 text-xs text-ink-muted">
              <button onClick={() => navigateVersion(id, 'prev')} className="hover:text-accent hover:bg-wash rounded-full w-5 h-5 flex items-center justify-center transition-colors"><ChevronLeft size={14} strokeWidth={1.75} /></button>
              <span className="text-accent font-medium">v{data.responseIndex + 1}/{data.responses.length}</span>
              <button onClick={() => navigateVersion(id, 'next')} className="hover:text-accent hover:bg-wash rounded-full w-5 h-5 flex items-center justify-center transition-colors"><ChevronRight size={14} strokeWidth={1.75} /></button>
              {data.responses.length > 1 && (
                <button
                  onClick={() => deleteVersion(id, data.responseIndex)}
                  className="text-ink-faint hover:text-red-500 hover:bg-red-50 rounded-full w-5 h-5 flex items-center justify-center transition-colors ml-0.5"
                  title={t('common.deleteVersion')}
                >
                  <Trash2 size={14} strokeWidth={1.75} />
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {data.isEvaluator ? (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEvaluatorTrigger(id, data.evaluatorTrigger === 'auto' ? 'manual' : 'auto');
                }}
                className={`text-2xs px-2 h-6 rounded-full font-medium transition-colors ${
                  data.evaluatorTrigger === 'auto' ? 'bg-watch/10 text-watch' : 'bg-wash text-ink-faint'
                }`}
                title={data.evaluatorTrigger === 'auto' ? t('evaluator.autoTitle') : t('evaluator.manualTitle')}
              >
                {data.evaluatorTrigger === 'auto' ? t('evaluator.auto') : t('evaluator.manual')}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); void evaluateNow(id); }}
                disabled={data.isLoading}
                className="text-ink-faint hover:text-watch hover:bg-red-50 rounded-full w-7 h-7 flex items-center justify-center transition-colors disabled:opacity-30"
                title={t('evaluator.evaluateNow')}
              >
                <RefreshCw size={16} strokeWidth={1.75} className={data.isLoading ? 'animate-spin' : ''} />
              </button>
            </>
          ) : (
            <button onClick={() => regenerate(id)} className="text-ink-faint hover:text-accent hover:bg-wash rounded-full w-7 h-7 flex items-center justify-center transition-colors" title={t('common.regenerate')}>
              <RefreshCw size={16} strokeWidth={1.75} />
            </button>
          )}
          <button onClick={() => deleteNode(id)} className="text-ink-faint hover:text-red-500 hover:bg-red-50 rounded-full w-7 h-7 flex items-center justify-center transition-colors" title={t('common.delete')}>
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {!data.isCollapsed && (
        <div className="px-5 py-4">
          {/* Question */}
          {data.isEditing ? (
            <textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleEditKeyDown}
              onBlur={handleEditSubmit}
              className="w-full bg-wash border border-accent rounded-xl p-3 text-sm text-ink resize-none focus:outline-none focus:ring-2 focus:ring-accent/20"
              rows={2}
              autoFocus
            />
          ) : (
            <div
              onDoubleClick={handleDoubleClickQuestion}
              className="text-sm text-ink font-semibold mb-3 cursor-pointer hover:bg-wash rounded-xl px-2 py-1.5 -mx-1 transition-colors"
            >
              {data.question}
            </div>
          )}

          {/* Branch context */}
          {data.branchContext && (
            <div className="text-xs text-ink-muted italic mb-3 pl-3 border-l-2 border-warm/40 bg-warm/15 rounded-r py-1.5 pr-2">
              <GitBranch size={14} strokeWidth={1.75} className="inline" /> {t('node.exploredFrom')} &ldquo;{data.branchContext.slice(0, 100)}{data.branchContext.length > 100 ? '...' : ''}&rdquo;
            </div>
          )}

          {/* Highlights */}
          {data.highlights.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1">
              {data.highlights.map((h) => (
                <span key={h.id} className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                  <Star size={14} strokeWidth={1.75} />
                  {h.text.slice(0, 30)}{h.text.length > 30 ? '…' : ''}
                </span>
              ))}
            </div>
          )}

          {/* Response */}
          {data.isLoading ? (
            data.response ? (
              // Streaming: show the live tail of the response on the canvas
              <div className="text-sm text-ink-muted leading-relaxed px-3 py-2.5 bg-surface rounded-xl max-h-[180px] overflow-hidden flex flex-col justify-end whitespace-pre-wrap break-words">
                {data.response.length > 400 ? '…' + data.response.slice(-400) : data.response}
                <span className="inline-block w-2 h-4 bg-accent animate-pulse rounded-sm" />
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-ink-muted">
                <span className="animate-pulse text-accent">●</span> {t('common.thinking')}
              </div>
            )
          ) : data.isEditingResponse ? (
            <div>
              <textarea
                value={editResponseValue}
                onChange={(e) => setEditResponseValue(e.target.value)}
                onKeyDown={handleResponseEditKeyDown}
                className="w-full bg-wash border border-accent rounded-xl p-3 text-sm text-ink resize-y focus:outline-none focus:ring-2 focus:ring-accent/20 min-h-[100px]"
                rows={6}
                autoFocus
              />
              <div className="flex justify-end gap-2 mt-2">
                <button onClick={() => setEditingResponse(id, false)} className="text-xs text-ink-muted hover:text-ink px-3 py-1.5 rounded-lg hover:bg-wash transition-colors">{t('common.cancel')}</button>
                <button onClick={handleResponseEditSubmit} className="text-xs bg-accent hover:bg-accent-strong text-white px-4 py-1.5 rounded-lg transition-colors">{t('common.save')}</button>
              </div>
            </div>
          ) : (
            <div
              ref={responseRef}
              onDoubleClick={handleDoubleClickResponse}
              className="markdown-body text-sm text-ink leading-relaxed max-h-[400px] overflow-y-auto cursor-text nopan nodrag nowheel px-3 py-2.5 bg-surface rounded-xl"
            >
              {highlightedTexts.size > 0 ? (
                <HighlightedMarkdown content={data.response} highlights={highlightedTexts} />
              ) : (
                <Markdown>{data.response}</Markdown>
              )}
            </div>
          )}

          {/* Web references consulted for this response (compact) */}
          {(data.references?.length ?? 0) > 0 && !data.isLoading && !data.isEditingResponse && (
            <div className="mt-2 px-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-ink-faint">
              <Globe size={11} strokeWidth={1.75} className="shrink-0" />
              {data.references!.slice(0, 3).map((r, i) =>
                r.url ? (
                  <a key={i} href={r.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-accent/80 hover:text-accent hover:underline nopan">
                    [{i + 1}] {r.title.length > 44 ? r.title.slice(0, 44) + '…' : r.title}
                  </a>
                ) : (
                  <span key={i}>[{i + 1}] {r.title.slice(0, 44)}</span>
                )
              )}
              {data.references!.length > 3 && <span>+{data.references!.length - 3}</span>}
            </div>
          )}

          {/* Failed generation: retry in place */}
          {data.generationFailed && !data.isLoading && (
            <div className="mt-2 flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              <AlertTriangle size={14} strokeWidth={1.75} className="shrink-0" />
              {t('common.generationFailed')}
              <button
                onClick={(e) => { e.stopPropagation(); editQuestion(id, data.question); }}
                className="ml-auto bg-card border border-red-200 hover:bg-red-100 text-red-600 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1"
              >
                <RefreshCw size={12} strokeWidth={1.75} /> {t('common.retry')}
              </button>
            </div>
          )}

          {/* Branch context indicator when branching from selection */}
          {branchFromText && (
            <div className="mt-3 text-xs pl-3 py-2 pr-2 border-l-3 border-accent bg-accent/5 rounded-r">
              <span className="text-accent font-medium"><GitBranch size={14} strokeWidth={1.75} className="inline" /> {t('node.exploringFrom')}</span>
              <p className="text-ink-muted mt-1 leading-relaxed">&ldquo;{branchFromText.slice(0, 150)}{branchFromText.length > 150 ? '...' : ''}&rdquo;</p>
            </div>
          )}

          {/* Inline continue input — always visible at bottom */}
          {!data.isLoading && !data.isEditingResponse && (
            <div className="mt-3 pt-3 border-t border-line">
              <div className="flex items-center gap-2 bg-wash rounded-xl px-4 py-2.5 transition-shadow focus-within:ring-1 focus-within:ring-accent/40">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                  placeholder={t('common.followUp')}
                  className="flex-1 bg-transparent text-sm text-ink placeholder-ink-faint focus:outline-none nopan nodrag"
                />
                <button
                  onClick={handleSubmitBranch}
                  disabled={!inputValue.trim()}
                  className="text-ink-faint hover:text-accent disabled:opacity-30 disabled:hover:text-ink-faint transition-colors shrink-0 rounded-full w-7 h-7 flex items-center justify-center hover:bg-line"
                >
                  <Send size={18} strokeWidth={1.75} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Collapsed view — question + summary */}
      {data.isCollapsed && (
        <div className="px-5 py-3">
          <div className="text-sm text-ink font-semibold truncate flex items-center gap-1.5">
            {data.question.slice(0, 80)}{data.question.length > 80 ? '…' : ''}
            {(data.attachments?.length > 0) && (
              <span className="text-2xs bg-wash text-ink-muted px-1.5 py-0.5 rounded-full shrink-0"><Paperclip size={12} strokeWidth={1.75} className="inline" />{data.attachments.length}</span>
            )}
            {(data.references?.length ?? 0) > 0 && (
              <span className="text-2xs bg-wash text-ink-muted px-1.5 py-0.5 rounded-full shrink-0"><Globe size={12} strokeWidth={1.75} className="inline" /> {data.references!.length}</span>
            )}
          </div>
          {data.summary ? (
            <div className="text-xs text-ink-faint mt-1.5 leading-relaxed line-clamp-2">
              {data.summary}
            </div>
          ) : data.response ? (
            <div className="text-xs text-ink-faint mt-1.5 leading-relaxed line-clamp-2 italic">
              {data.response.replace(/[#*`>-]/g, '').slice(0, 120)}{data.response.length > 120 ? '…' : ''}
            </div>
          ) : null}
        </div>
      )}

      </>
      )}

      <Handle type="source" position={Position.Bottom} id="continue" className="!bg-accent !w-3 !h-3 !border-2 !border-white" />
      <Handle
        type="source"
        position={Position.Right}
        id="branch"
        className="!bg-transparent !w-0 !h-0 !border-0"
        style={{ top: '50%' }}
      />

      {/* Floating toolbar for text selection */}
      {selectedText && selectionPos && (
        <div
          style={{
            position: 'absolute',
            left: Math.max(0, Math.min(selectionPos.x, 400)),
            top: Math.max(-40, selectionPos.y),
            transform: 'translateX(-50%)',
            zIndex: 9999,
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="flex gap-1 bg-card border border-line rounded-xl shadow-lg p-1 animate-fade-in">
            <button
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); handleBranch(); }}
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
  );
}
