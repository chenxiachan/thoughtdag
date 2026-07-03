import { useState, useRef, useCallback, useEffect } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import 'katex/dist/katex.min.css';
import type { ThoughtNode as ThoughtNodeType } from '../types';
import { useStore } from '../store';
import { generateId } from '../utils';
import { processFile } from '../lib/attachments';
import { Markdown, HighlightedMarkdown } from './Markdown';

export default function ThoughtNode({ id, data }: NodeProps<ThoughtNodeType>) {
  const {
    deleteNode, toggleCollapse, setEditing, editQuestion, regenerate,
    setEditingResponse, editResponse, addHighlight, navigateVersion, deleteVersion,
    setSelectedNodeId, selectedNodeId, addAttachment,
  } = useStore();
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
      className={`thought-node rounded-2xl w-[480px] animate-fade-in transition-all duration-200 ${
        isBranch ? 'orange-node' : isRoot ? 'root-node' : 'branch-node'
      } ${data.isLoading ? 'loading-border' : ''} ${selectedNodeId === id ? 'ring-4 ring-accent selected-glow' : ''} ${isDropTarget ? 'ring-4 ring-accent/50 ring-dashed' : ''}`}
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

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-line cursor-grab active:cursor-grabbing drag-handle">
        <div className="flex items-center gap-2">
          <button onClick={() => toggleCollapse(id)} className={`hover:bg-wash rounded-lg w-7 h-7 flex items-center justify-center transition-all text-sm font-bold ${data.isCollapsed ? 'text-accent bg-accent/10' : 'text-ink-faint'}`}>
            {data.isCollapsed ? '▶' : '▼'}
          </button>
          <span className="text-xs text-ink-faint font-mono">{data.tokenCount} tok</span>
          {data.appliedRole && (
            <span className="text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded-md truncate max-w-[120px]" title={data.appliedRole}>
              {data.appliedRole.slice(0, 20)}{data.appliedRole.length > 20 ? '…' : ''}
            </span>
          )}
          {hasMultipleVersions && (
            <div className="flex items-center gap-1 text-xs text-ink-muted">
              <button onClick={() => navigateVersion(id, 'prev')} className="hover:text-accent hover:bg-wash rounded-full w-5 h-5 flex items-center justify-center transition-colors">‹</button>
              <span className="text-accent font-medium">v{data.responseIndex + 1}/{data.responses.length}</span>
              <button onClick={() => navigateVersion(id, 'next')} className="hover:text-accent hover:bg-wash rounded-full w-5 h-5 flex items-center justify-center transition-colors">›</button>
              {data.responses.length > 1 && (
                <button
                  onClick={() => deleteVersion(id, data.responseIndex)}
                  className="text-ink-faint hover:text-red-500 hover:bg-red-50 rounded-full w-5 h-5 flex items-center justify-center transition-colors ml-0.5"
                  title="Delete this version"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <button onClick={() => regenerate(id)} className="text-ink-faint hover:text-accent hover:bg-wash rounded-full w-7 h-7 flex items-center justify-center transition-colors" title="Regenerate">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          </button>
          <button onClick={() => deleteNode(id)} className="text-ink-faint hover:text-red-500 hover:bg-red-50 rounded-full w-7 h-7 flex items-center justify-center transition-colors" title="Delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
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
              className="text-sm text-accent font-medium mb-3 cursor-pointer hover:bg-wash rounded-xl px-2 py-1.5 -mx-1 transition-colors"
            >
              {data.question}
            </div>
          )}

          {/* Branch context */}
          {data.branchContext && (
            <div className="text-xs text-ink-muted italic mb-3 pl-3 border-l-2 border-warm/40 bg-warm/15 rounded-r py-1.5 pr-2">
              📌 Explored from: &ldquo;{data.branchContext.slice(0, 100)}{data.branchContext.length > 100 ? '...' : ''}&rdquo;
            </div>
          )}

          {/* Highlights */}
          {data.highlights.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1">
              {data.highlights.map((h) => (
                <span key={h.id} className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                  ⭐ {h.text.slice(0, 30)}{h.text.length > 30 ? '…' : ''}
                </span>
              ))}
            </div>
          )}

          {/* Response */}
          {data.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-ink-muted">
              <span className="animate-pulse text-accent">●</span> Thinking...
            </div>
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
                <button onClick={() => setEditingResponse(id, false)} className="text-xs text-ink-muted hover:text-ink px-3 py-1.5 rounded-lg hover:bg-wash transition-colors">Cancel</button>
                <button onClick={handleResponseEditSubmit} className="text-xs bg-accent hover:bg-accent-strong text-white px-4 py-1.5 rounded-lg transition-colors">Save</button>
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

          {/* Branch context indicator when branching from selection */}
          {branchFromText && (
            <div className="mt-3 text-xs pl-3 py-2 pr-2 border-l-3 border-accent bg-accent/5 rounded-r">
              <span className="text-accent font-medium">⑂ Exploring from selection:</span>
              <p className="text-ink-muted mt-1 leading-relaxed">&ldquo;{branchFromText.slice(0, 150)}{branchFromText.length > 150 ? '...' : ''}&rdquo;</p>
            </div>
          )}

          {/* Inline continue input — always visible at bottom */}
          {!data.isLoading && !data.isEditingResponse && (
            <div className="mt-3 pt-3 border-t border-line">
              <div className="flex items-center gap-2 bg-wash rounded-xl px-4 py-2.5">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                  placeholder="Follow up..."
                  className="flex-1 bg-transparent text-sm text-ink placeholder-ink-faint focus:outline-none nopan nodrag"
                />
                <button
                  onClick={handleSubmitBranch}
                  disabled={!inputValue.trim()}
                  className="text-ink-faint hover:text-accent disabled:opacity-30 disabled:hover:text-ink-faint transition-colors shrink-0 rounded-full w-7 h-7 flex items-center justify-center hover:bg-line"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Collapsed view — question + summary */}
      {data.isCollapsed && (
        <div className="px-5 py-3">
          <div className="text-sm text-accent font-medium truncate flex items-center gap-1.5">
            {data.question.slice(0, 80)}{data.question.length > 80 ? '…' : ''}
            {(data.attachments?.length > 0) && (
              <span className="text-[10px] bg-wash text-ink-muted px-1.5 py-0.5 rounded-full shrink-0">📎{data.attachments.length}</span>
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
  );
}
