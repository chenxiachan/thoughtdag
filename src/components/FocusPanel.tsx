import { useState, useRef, useCallback, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import { useStore } from '../store';
import { countTokens, getContextPath, generateId } from '../utils';
import type { Attachment } from '../types';

export default function FocusPanel({ onFocusNode }: { onFocusNode?: (id: string) => void }) {
  const {
    nodes, edges, selectedNodeId, setSelectedNodeId,
    editQuestion, editResponse, setEditing, setEditingResponse,
    regenerate, deleteNode, addQuestion, addHighlight, removeHighlight,
    setHighlightMode, distillRegenerate, duplicateNode,
    navigateVersion, deleteVersion, stopGeneration, setRolePrompt, setInheritRole, setRoleMode,
    setRoleSource, getAvailableRoles,
    addAttachment, removeAttachment, toggleExcludeAttachment, setAttachmentRenderMode, getInheritedAttachments,
  } = useStore();

  const [editValue, setEditValue] = useState('');
  const [editResponseValue, setEditResponseValue] = useState('');
  const [branchInput, setBranchInput] = useState('');
  const [showBranchInput, setShowBranchInput] = useState(false);
  const [branchContext, setBranchContext] = useState(''); // preserved selected text for branch
  const [continueInput, setContinueInput] = useState('');
  const continueRef = useRef<HTMLInputElement>(null);
  const [contextOpen, setContextOpen] = useState(true);
  const [selectedText, setSelectedText] = useState('');
  const [selectionPos, setSelectionPos] = useState<{ x: number; y: number } | null>(null);
  const [highlightExploreContext, setHighlightExploreContext] = useState('');
  const [highlightExploreInput, setHighlightExploreInput] = useState('');
  const [roleChanged, setRoleChanged] = useState(false);
  const [branchInheritRole, setBranchInheritRole] = useState(true);
  const [continueInheritRole, setContinueInheritRole] = useState(true);
  const [continueInheritAttachments, setContinueInheritAttachments] = useState(true);
  const [exploreInheritRole, setExploreInheritRole] = useState(true);
  const highlightExploreRef = useRef<HTMLInputElement>(null);
  const responseRef = useRef<HTMLDivElement>(null);

  // Reset states when switching nodes
  useEffect(() => {
    setShowBranchInput(false);
    setBranchInput('');
    setBranchContext('');
    setSelectedText('');
    setSelectionPos(null);
    setContinueInput('');
    setHighlightExploreContext('');
    setHighlightExploreInput('');
    setRoleChanged(false);
    // Auto-focus continue input when switching to a new node
    setTimeout(() => continueRef.current?.focus(), 100);
  }, [selectedNodeId]);

  // Auto-focus highlight explore input when context is set
  useEffect(() => {
    if (highlightExploreContext) {
      setTimeout(() => highlightExploreRef.current?.focus(), 100);
    }
  }, [highlightExploreContext]);

  const node = nodes.find((n) => n.id === selectedNodeId);
  const isOpen = !!selectedNodeId && !!node;

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

  if (!node) {
    return null;
  }

  const data = node.data;
  const roleMode = data.roleMode || 'inherit';
  const needsRegenerate = roleChanged && roleMode === 'reset' && !!data.response && !data.isLoading;
  const hasMultipleVersions = data.responses.length > 1;

  // Compute inherited role for display in Inherit mode
  const inheritedRole = (() => {
    if (roleMode !== 'inherit') return '';
    // Walk ancestors to find nearest role, respecting roleSourceNodeId choices
    const visited = new Set<string>();
    function findRole(id: string): string {
      if (visited.has(id)) return '';
      visited.add(id);
      const n = nodes.find((nd) => nd.id === id);
      if (!n) return '';

      // If this ancestor has a roleSourceNodeId override, use that
      if (n.data.roleSourceNodeId && n.data.roleSourceNodeId !== '__none__') {
        const sourceNode = nodes.find((nd) => nd.id === n.data.roleSourceNodeId);
        if (sourceNode?.data.rolePrompt) return sourceNode.data.rolePrompt;
      }
      if (n.data.roleSourceNodeId === '__none__') return '';

      const mode = n.data.roleMode || 'inherit';
      if (mode === 'reset') return ''; // blocks inheritance
      if (n.data.rolePrompt && n.id !== selectedNodeId) return n.data.rolePrompt;

      // Keep walking up
      const parentEdges = edges.filter((e) => e.target === id);
      for (const pe of parentEdges) {
        const found = findRole(pe.source);
        if (found) return found;
      }
      return '';
    }
    // Start from parent edges of current node
    const parentEdges = edges.filter((e) => e.target === selectedNodeId);
    for (const pe of parentEdges) {
      const found = findRole(pe.source);
      if (found) return found;
    }
    return '';
  })();
  // Available roles for multi-parent conflict resolution
  const availableRoles = roleMode === 'inherit' ? getAvailableRoles(selectedNodeId!) : [];
  const hasRoleConflict = availableRoles.length > 1;

  const contextPath = getContextPath(selectedNodeId!, nodes, edges);
  const ancestors = contextPath.slice(0, -1); // exclude current node
  const totalContextTokens = contextPath.reduce((sum, n) => sum + countTokens(n.data.question + n.data.response), 0);
  const highlightedTexts = new Set(data.highlights.map((h) => h.text));

  const handleDoubleClickQuestion = () => {
    setEditValue(data.question);
    setEditing(selectedNodeId!, true);
  };

  const handleDoubleClickResponse = () => {
    setEditResponseValue(data.response);
    setEditingResponse(selectedNodeId!, true);
  };

  const handleEditSubmit = () => {
    if (editValue.trim()) {
      editQuestion(selectedNodeId!, editValue.trim());
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditSubmit(); }
    if (e.key === 'Escape') setEditing(selectedNodeId!, false);
  };

  const handleResponseEditSubmit = () => {
    editResponse(selectedNodeId!, editResponseValue);
  };

  const handleResponseEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setEditingResponse(selectedNodeId!, false);
  };

  const handleBranch = () => {
    setBranchContext(''); // no selection context from button
    setShowBranchInput(true);
    setBranchInput('');
  };

  const handleBranchSubmit = () => {
    if (!branchInput.trim()) return;
    addQuestion(branchInput.trim(), selectedNodeId!, branchContext || undefined, undefined, branchInheritRole ? undefined : false);
    setBranchInput('');
    setShowBranchInput(false);
    setBranchContext('');
    setBranchInheritRole(true);
  };

  const handleHighlight = () => {
    if (!selectedText) return;
    addHighlight(selectedNodeId!, {
      id: generateId(),
      text: selectedText,
      startOffset: 0,
      endOffset: 0,
    });
    setSelectedText('');
    setSelectionPos(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleBranchFromSelection = () => {
    setBranchContext(selectedText); // save before selection clears
    setBranchInput('');
    setShowBranchInput(true);
    setSelectedText('');
    setSelectionPos(null);
    window.getSelection()?.removeAllRanges();
  };

  return (
    <div className="w-1/2 shrink-0 h-full bg-white border-l border-[#E8E5E0] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#E8E5E0] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-sm font-semibold text-[#1A1A1A] truncate">
            {data.question.slice(0, 50)}{data.question.length > 50 ? '…' : ''}
          </h2>
          <span className="text-xs text-[#6B6560] bg-[#F5F3F0] px-2 py-0.5 rounded-full shrink-0 font-mono">
            {data.tokenCount} tok
          </span>
        </div>
        <button
          onClick={() => setSelectedNodeId(null)}
          className="text-[#B8B2A8] hover:text-[#1A1A1A] transition-colors shrink-0 ml-2"
        >
          ✕
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Role (System Prompt) Section — above Question */}
        <div className="px-4 py-3 border-b border-[#E8E5E0]">
          <details className="group" open={roleMode !== 'inherit'}>
            <summary className="text-xs text-[#B8B2A8] uppercase tracking-wide font-medium cursor-pointer hover:text-[#6B6560] transition-colors flex items-center gap-1.5 select-none">
              <span className="transition-transform group-open:rotate-90 text-[10px]">▶</span>
              Role (System Prompt)
              {roleMode === 'set-next' && <span className="text-[#6B5CE7] font-medium normal-case ml-1">Set for next ↓</span>}
              {roleMode === 'reset' && <span className="text-amber-600 font-medium normal-case ml-1">Reset</span>}
              {roleMode === 'inherit' && (data.rolePrompt || inheritedRole) && (
                <span className="text-[#6B5CE7]/60 font-medium normal-case ml-1 truncate max-w-[200px]">
                  {data.rolePrompt ? data.rolePrompt.slice(0, 30) : `← ${inheritedRole.slice(0, 30)}`}{(data.rolePrompt || inheritedRole).length > 30 ? '…' : ''}
                </span>
              )}
            </summary>
            <div className="mt-2 space-y-2">
              {/* Three-mode radio */}
              <div className="flex gap-1">
                {([
                  { mode: 'inherit' as const, label: 'Inherit from previous' },
                  { mode: 'set-next' as const, label: 'Set for next ↓' },
                  { mode: 'reset' as const, label: 'Reset for this node' },
                ]).map(({ mode, label }) => (
                  <button
                    key={mode}
                    onClick={() => {
                      // Don't clear rolePrompt — preserve it when switching modes
                      setRoleMode(selectedNodeId!, mode);
                      setRoleChanged(false);
                    }}
                    className={`text-xs px-2.5 py-1.5 rounded-lg transition-colors ${
                      roleMode === mode ? 'bg-[#6B5CE7] text-white' : 'bg-[#F5F3F0] text-[#6B6560] hover:bg-[#E8E5E0]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {/* Inherit: read-only display of role prompt */}
              {roleMode === 'inherit' && (
                (data.rolePrompt || inheritedRole) ? (
                  <div className="text-xs text-[#6B6560] bg-[#F5F3F0] rounded-lg px-3 py-2 leading-relaxed border border-[#E8E5E0]">
                    {data.rolePrompt || inheritedRole}
                  </div>
                ) : (
                  <p className="text-xs text-[#B8B2A8] italic">No role set</p>
                )
              )}
              {/* Multi-role source selector */}
              {roleMode === 'inherit' && hasRoleConflict && (
                <div className="space-y-1.5">
                  <p className="text-[10px] text-amber-600 font-medium">Multiple roles from incoming edges:</p>
                  {availableRoles.map((r) => {
                    const isSelected = data.roleSourceNodeId === r.nodeId || (!data.roleSourceNodeId && r.isPrimary);
                    return (
                      <label key={r.nodeId} className={`flex items-start gap-2 text-xs cursor-pointer select-none rounded-lg px-2.5 py-2 transition-colors ${isSelected ? 'bg-[#6B5CE7]/10 border border-[#6B5CE7]/30' : 'bg-[#F5F3F0] border border-transparent hover:border-[#E8E5E0]'}`}>
                        <input
                          type="radio"
                          name="roleSource"
                          checked={isSelected}
                          onChange={() => setRoleSource(selectedNodeId!, r.nodeId)}
                          className="mt-0.5 text-[#6B5CE7] focus:ring-[#6B5CE7]"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${r.isPrimary ? 'bg-[#6B5CE7]/15 text-[#6B5CE7]' : 'bg-[#E8E5E0] text-[#6B6560]'}`}>
                              {r.isPrimary ? 'Primary' : 'Cross-link'}
                            </span>
                            <span className="text-[#6B6560] truncate">{r.label}</span>
                          </div>
                          <p className="text-[#B8B2A8] mt-0.5 truncate">{r.role.slice(0, 60)}{r.role.length > 60 ? '…' : ''}</p>
                        </div>
                      </label>
                    );
                  })}
                  <label className={`flex items-center gap-2 text-xs cursor-pointer select-none rounded-lg px-2.5 py-2 transition-colors ${!data.roleSourceNodeId && !availableRoles.some((r) => r.isPrimary) ? 'bg-[#6B5CE7]/10 border border-[#6B5CE7]/30' : 'bg-[#F5F3F0] border border-transparent hover:border-[#E8E5E0]'}`}>
                    <input
                      type="radio"
                      name="roleSource"
                      checked={data.roleSourceNodeId === '__none__'}
                      onChange={() => setRoleSource(selectedNodeId!, '__none__')}
                      className="mt-0.5 text-[#6B5CE7] focus:ring-[#6B5CE7]"
                    />
                    <span className="text-[#6B6560]">None (no role)</span>
                  </label>
                </div>
              )}
              {/* Set for next / Reset: editable textarea */}
              {roleMode !== 'inherit' && (
                <textarea
                  value={data.rolePrompt || ''}
                  onChange={(e) => {
                    setRolePrompt(selectedNodeId!, e.target.value);
                    setRoleChanged(true);
                  }}
                  placeholder="e.g. You are a strict paper reviewer. Be critical and specific."
                  className="w-full text-xs border border-[#E8E5E0] rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#6B5CE7] bg-[#FAFAF8] text-[#1A1A1A] resize-none leading-relaxed"
                  rows={2}
                  autoFocus
                />
              )}
              {/* Regenerate button for Reset mode — show whenever reset mode is active with a prompt */}
              {roleMode === 'reset' && data.rolePrompt && !!data.response && !data.isLoading && (
                <button
                  onClick={() => { regenerate(selectedNodeId!); setRoleChanged(false); }}
                  className="w-full text-xs bg-[#6B5CE7] hover:bg-[#5A4BD6] text-white px-3 py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                >
                  ↻ Regenerate with new role
                </button>
              )}
              {roleChanged && roleMode === 'set-next' && !!data.response && !data.isLoading && (
                <p className="text-[10px] text-[#6B5CE7]">Role will apply to new child nodes from here.</p>
              )}
              <p className="text-[10px] text-[#B8B2A8] leading-relaxed">
                {roleMode === 'inherit' && !data.rolePrompt && !inheritedRole && 'No role set. Use Set for next or Reset to define one.'}
                {roleMode === 'inherit' && !data.rolePrompt && inheritedRole && 'Inherited from ancestor.'}
                {roleMode === 'inherit' && data.rolePrompt && 'Role active. Applies here and passes to descendants.'}
                {roleMode === 'set-next' && 'Sets the role for this node\'s descendants. Current response is unchanged.'}
                {roleMode === 'reset' && 'Resets this node\'s role. Regenerate to apply. Descendants won\'t inherit.'}
              </p>
            </div>
          </details>
        </div>

        {/* Attachments Section */}
        <AttachmentsSection
          nodeId={selectedNodeId!}
          attachments={data.attachments || []}
          excludedAttachmentIds={data.excludedAttachmentIds || []}
          includedAttachmentIds={data.includedAttachmentIds || []}
          addAttachment={addAttachment}
          removeAttachment={removeAttachment}
          toggleExcludeAttachment={toggleExcludeAttachment}
          setAttachmentRenderMode={setAttachmentRenderMode}
          getInheritedAttachments={getInheritedAttachments}
        />

        {/* Question Section */}
        <div className="px-4 py-3 border-b border-[#E8E5E0]">
          <label className="text-xs text-[#B8B2A8] uppercase tracking-wide font-medium mb-1.5 block">Question</label>
          {data.isEditing ? (
            <textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleEditKeyDown}
              onBlur={handleEditSubmit}
              className="w-full bg-[#F5F3F0] border border-[#6B5CE7] rounded-xl p-3 text-sm text-[#1A1A1A] resize-none focus:outline-none focus:ring-2 focus:ring-[#6B5CE7]/20"
              rows={3}
              autoFocus
            />
          ) : (
            <div
              onDoubleClick={handleDoubleClickQuestion}
              className="text-sm text-[#6B5CE7] font-medium cursor-pointer hover:bg-[#F5F3F0] rounded-xl px-2 py-1.5 -mx-1 transition-colors"
            >
              {data.question}
            </div>
          )}
        </div>

        {/* Response Section */}
        <div className="px-4 py-3 border-b border-[#E8E5E0]">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs text-[#B8B2A8] uppercase tracking-wide font-medium">Response</label>
            {hasMultipleVersions && (
              <div className="flex items-center gap-1 text-xs text-[#6B6560]">
                <button onClick={() => navigateVersion(selectedNodeId!, 'prev')} className="hover:text-[#6B5CE7] hover:bg-[#F5F3F0] rounded-full w-5 h-5 flex items-center justify-center transition-colors">‹</button>
                <span className="text-[#6B5CE7] font-medium">v{data.responseIndex + 1}/{data.responses.length}</span>
                <button onClick={() => navigateVersion(selectedNodeId!, 'next')} className="hover:text-[#6B5CE7] hover:bg-[#F5F3F0] rounded-full w-5 h-5 flex items-center justify-center transition-colors">›</button>
                {data.responses.length > 1 && (
                  <button
                    onClick={() => deleteVersion(selectedNodeId!, data.responseIndex)}
                    className="text-[#B8B2A8] hover:text-red-500 hover:bg-red-50 rounded-full w-5 h-5 flex items-center justify-center transition-colors ml-0.5"
                    title="Delete this version"
                  >
                    🗑
                  </button>
                )}
              </div>
            )}
          </div>

          {data.isLoading && !data.response ? (
            <div className="flex items-center gap-2 text-sm text-[#6B6560]">
              <span className="animate-pulse text-[#6B5CE7]">●</span> Thinking...
            </div>
          ) : data.isLoading && data.response ? (
            <div className="markdown-body text-sm text-[#1A1A1A] leading-relaxed max-h-[500px] overflow-y-auto px-3 py-2.5 bg-[#FAFAF8] rounded-xl">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeRaw, rehypeHighlight, rehypeKatex]}>
                {data.response}
              </ReactMarkdown>
              <span className="inline-block w-2 h-4 bg-[#6B5CE7] animate-pulse rounded-sm ml-0.5 align-text-bottom" />
            </div>
          ) : data.isEditingResponse ? (
            <div>
              <textarea
                value={editResponseValue}
                onChange={(e) => setEditResponseValue(e.target.value)}
                onKeyDown={handleResponseEditKeyDown}
                className="w-full bg-[#F5F3F0] border border-[#6B5CE7] rounded-xl p-3 text-sm text-[#1A1A1A] resize-y focus:outline-none focus:ring-2 focus:ring-[#6B5CE7]/20 min-h-[150px]"
                rows={10}
                autoFocus
              />
              <div className="flex justify-end gap-2 mt-2">
                <button onClick={() => setEditingResponse(selectedNodeId!, false)} className="text-xs text-[#6B6560] hover:text-[#1A1A1A] px-3 py-1.5 rounded-lg hover:bg-[#F5F3F0] transition-colors">Cancel</button>
                <button onClick={handleResponseEditSubmit} className="text-xs bg-[#6B5CE7] hover:bg-[#5A4BD6] text-white px-4 py-1.5 rounded-lg transition-colors">Save</button>
              </div>
            </div>
          ) : (
            <div ref={responseRef} onDoubleClick={handleDoubleClickResponse} className="relative">
              <div className="markdown-body text-sm text-[#1A1A1A] leading-relaxed cursor-text px-3 py-2.5 bg-[#FAFAF8] rounded-xl">
                {highlightedTexts.size > 0 ? (
                  <HighlightedMarkdown content={data.response} highlights={highlightedTexts} />
                ) : (
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeRaw, rehypeHighlight, rehypeKatex]}>
                    {data.response}
                  </ReactMarkdown>
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
                  <div className="flex gap-1 bg-white border border-[#E8E5E0] rounded-xl shadow-lg p-1 animate-fade-in">
                    <button
                      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); handleBranchFromSelection(); }}
                      className="bg-[#6B5CE7] hover:bg-[#5A4BD6] text-white text-xs px-3 py-1.5 rounded-lg transition-all whitespace-nowrap cursor-pointer"
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

        {/* Highlights Section */}
        <div className={`px-4 py-3 border-b border-[#E8E5E0] ${needsRegenerate ? 'opacity-40 pointer-events-none' : ''}`}>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-[#B8B2A8] uppercase tracking-wide font-medium">Highlights</label>
            {data.highlights.length > 0 && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => distillRegenerate(selectedNodeId!)}
                  className="text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1"
                  title="Distill: keep highlights, remove redundancy"
                >
                  ✨ Distill
                </button>
                <button
                  onClick={() => {
                    const highlightTexts = data.highlights.map((h) => h.text).join('\n\n');
                    addQuestion(`Summarize the following key points concisely:\n\n${highlightTexts}`, selectedNodeId!, highlightTexts);
                  }}
                  className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1"
                  title="Summarize highlighted content in a new branch"
                >
                  📋 Summary
                </button>
                <button
                  onClick={() => {
                    const highlightTexts = data.highlights.map((h) => h.text).join('\n\n');
                    setHighlightExploreContext(highlightTexts);
                  }}
                  className="text-xs bg-[#6B5CE7]/10 hover:bg-[#6B5CE7]/20 text-[#6B5CE7] px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1"
                  title="Ask a follow-up question about highlighted content"
                >
                  ⑂ Explore
                </button>
              </div>
            )}
          </div>
          {data.highlights.length === 0 ? (
            <p className="text-xs text-[#B8B2A8] italic">No highlights yet — select text above to highlight</p>
          ) : (
            <>
              <div className="space-y-1.5 mb-3">
                {data.highlights.map((h) => (
                  <div key={h.id} className="flex items-start gap-2 bg-amber-50 rounded-lg px-3 py-2 group">
                    <span className="text-xs text-amber-700 flex-1 leading-relaxed">
                      ⭐ {h.text.slice(0, 80)}{h.text.length > 80 ? '…' : ''}
                    </span>
                    <button
                      onClick={() => removeHighlight(selectedNodeId!, h.id)}
                      className="text-amber-300 hover:text-red-500 transition-colors shrink-0 opacity-0 group-hover:opacity-100"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              {/* Highlight context mode */}
              <div className="space-y-2">
                <span className="text-xs text-[#B8B2A8] font-medium">Pass to downstream</span>
                <div className="flex items-center gap-1.5">
                  {([
                    { mode: 'tag' as const, icon: '🏷️', label: 'Tag important' },
                    { mode: 'filter' as const, icon: '✂️', label: 'Highlights only' },
                    { mode: 'off' as const, icon: '📄', label: 'Full text' },
                  ]).map(({ mode, icon, label }) => (
                    <button
                      key={mode}
                      onClick={() => setHighlightMode(selectedNodeId!, mode)}
                      className={`text-xs px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 ${
                        data.highlightMode === mode
                          ? 'bg-[#6B5CE7] text-white'
                          : 'bg-[#F5F3F0] text-[#6B6560] hover:bg-[#E8E5E0]'
                      }`}
                    >
                      <span>{icon}</span> {label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-[#B8B2A8] leading-relaxed">
                  {data.highlightMode === 'off' && 'Downstream nodes receive the full response'}
                  {data.highlightMode === 'tag' && 'Highlighted parts wrapped with [Important] tags to guide AI focus'}
                  {data.highlightMode === 'filter' && 'Downstream nodes only receive highlighted content, rest discarded'}
                </p>
              </div>
              {/* Highlight Explore input */}
              {highlightExploreContext && (
                <div className="mt-3 space-y-1.5">
                  <span className="text-xs text-[#6B5CE7] font-medium">⑂ Ask about highlights:</span>
                  <div className="flex gap-1.5">
                    <input
                      ref={highlightExploreRef}
                      type="text"
                      value={highlightExploreInput}
                      onChange={(e) => setHighlightExploreInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && highlightExploreInput.trim()) {
                          addQuestion(highlightExploreInput.trim(), selectedNodeId!, highlightExploreContext, undefined, exploreInheritRole ? undefined : false);
                          setHighlightExploreInput('');
                          setHighlightExploreContext('');
                          setExploreInheritRole(true);
                        }
                        if (e.key === 'Escape') {
                          setHighlightExploreContext('');
                          setHighlightExploreInput('');
                        }
                      }}
                      placeholder="What do you want to explore about these highlights?"
                      className="flex-1 text-xs border border-[#6B5CE7]/30 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#6B5CE7] bg-[#6B5CE7]/5"
                    />
                    <button
                      onClick={() => {
                        if (highlightExploreInput.trim()) {
                          addQuestion(highlightExploreInput.trim(), selectedNodeId!, highlightExploreContext, undefined, exploreInheritRole ? undefined : false);
                          setHighlightExploreInput('');
                          setHighlightExploreContext('');
                          setExploreInheritRole(true);
                        }
                      }}
                      className="text-xs bg-[#6B5CE7] text-white px-3 py-2 rounded-lg hover:bg-[#5A4BD6] transition-colors shrink-0"
                    >
                      Go
                    </button>
                    <button
                      onClick={() => { setHighlightExploreContext(''); setHighlightExploreInput(''); }}
                      className="text-xs text-[#B8B2A8] hover:text-[#6B6560] px-1.5 py-2 transition-colors shrink-0"
                    >
                      ✕
                    </button>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-[#6B6560] cursor-pointer select-none">
                    <input type="checkbox" checked={exploreInheritRole} onChange={(e) => setExploreInheritRole(e.target.checked)} className="rounded border-[#E8E5E0] text-[#6B5CE7] focus:ring-[#6B5CE7] w-3 h-3" />
                    Inherit role
                  </label>
                </div>
              )}
            </>
          )}
        </div>

        {/* Actions Bar */}
        <div className={`px-4 py-3 border-b border-[#E8E5E0] ${needsRegenerate ? 'opacity-40 pointer-events-none' : ''}`}>
          <label className="text-xs text-[#B8B2A8] uppercase tracking-wide font-medium mb-2 block">Actions</label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => regenerate(selectedNodeId!)}
              className="text-xs bg-[#F5F3F0] hover:bg-[#E8E5E0] text-[#6B6560] px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
              Regenerate
            </button>
            {data.isLoading ? (
              <button
                onClick={() => stopGeneration(selectedNodeId!)}
                className="text-xs bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
                Stop
              </button>
            ) : (
              <button
                onClick={() => duplicateNode(selectedNodeId!)}
                className="text-xs bg-[#F5F3F0] hover:bg-[#E8E5E0] text-[#6B6560] px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5"
              >
                📋 Duplicate
              </button>
            )}
            <button
              onClick={() => { deleteNode(selectedNodeId!); setSelectedNodeId(null); }}
              className="text-xs bg-red-50 hover:bg-red-100 text-red-500 px-3 py-2 rounded-lg transition-colors"
            >
              🗑 Delete
            </button>
          </div>
          {showBranchInput && (
            <div className="mt-3">
              {branchContext && (
                <div className="text-xs pl-3 py-1.5 pr-2 mb-2 border-l-2 border-[#6B5CE7] bg-[#6B5CE7]/5 rounded-r text-[#6B6560]">
                  <span className="text-[#6B5CE7] font-medium">⑂ Exploreed from selection:</span>
                  &ldquo;{branchContext.slice(0, 100)}{branchContext.length > 100 ? '…' : ''}&rdquo;
                </div>
              )}
              <div className="flex items-center gap-2 bg-[#F5F3F0] rounded-xl px-3 py-2">
                <input
                  type="text"
                  value={branchInput}
                  onChange={(e) => setBranchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleBranchSubmit(); }
                    if (e.key === 'Escape') { setShowBranchInput(false); setBranchContext(''); }
                  }}
                  placeholder="Branch question..."
                  className="flex-1 bg-transparent text-sm text-[#1A1A1A] placeholder-[#B8B2A8] focus:outline-none"
                  autoFocus
                />
                <button
                  onClick={handleBranchSubmit}
                  disabled={!branchInput.trim()}
                  className="text-[#6B5CE7] hover:text-[#5A4BD6] disabled:opacity-30 transition-colors"
                >
                  ↵
                </button>
              </div>
              <label className="flex items-center gap-2 text-xs text-[#6B6560] mt-1.5 cursor-pointer select-none">
                <input type="checkbox" checked={branchInheritRole} onChange={(e) => setBranchInheritRole(e.target.checked)} className="rounded border-[#E8E5E0] text-[#6B5CE7] focus:ring-[#6B5CE7] w-3 h-3" />
                Inherit role
              </label>
            </div>
          )}
        </div>

        {/* Context Chain Section */}
        <div className="px-4 py-3">
          <button
            onClick={() => setContextOpen(!contextOpen)}
            className="flex items-center gap-1.5 text-xs text-[#B8B2A8] uppercase tracking-wide font-medium mb-2 hover:text-[#6B6560] transition-colors w-full"
          >
            <span>{contextOpen ? '▾' : '▸'}</span>
            <span>Context Chain</span>
            <span className="text-[#6B5CE7] font-mono normal-case ml-auto">{totalContextTokens} tok</span>
          </button>

          {contextOpen && (
            <div className="space-y-1.5">
              {ancestors.length === 0 ? (
                <p className="text-xs text-[#B8B2A8] italic">Root node — no ancestors</p>
              ) : (
                ancestors.map((ancestor, i) => (
                  <button
                    key={ancestor.id}
                    onClick={() => { setSelectedNodeId(ancestor.id); onFocusNode?.(ancestor.id); }}
                    className="w-full text-left border border-[#E8E5E0] hover:border-[#6B5CE7]/40 rounded-lg p-2.5 transition-colors group"
                  >
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-[#B8B2A8]">{i === 0 ? '🌱' : '↳'}</span>
                      <span className="text-[#1A1A1A] group-hover:text-[#6B5CE7] transition-colors truncate">
                        {ancestor.data.question.slice(0, 60)}{ancestor.data.question.length > 60 ? '…' : ''}
                      </span>
                      <span className="text-[#B8B2A8] font-mono shrink-0 ml-auto">
                        {countTokens(ancestor.data.question + ancestor.data.response)} tok
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Continue input — pinned at bottom */}
      <div className={`shrink-0 border-t border-[#E8E5E0] px-4 py-3 bg-white ${needsRegenerate ? 'opacity-40 pointer-events-none' : ''}`}>
        <div className="flex items-center gap-2 bg-[#F5F3F0] rounded-xl px-4 py-2.5">
          <input
            ref={continueRef}
            type="text"
            value={continueInput}
            onChange={(e) => setContinueInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (continueInput.trim()) {
                  addQuestion(continueInput.trim(), selectedNodeId!, undefined, undefined, continueInheritRole ? undefined : false, undefined, undefined, !continueInheritAttachments);
                  setContinueInput('');
                  setContinueInheritRole(true);
                }
              }
            }}
            placeholder="Follow up..."
            className="flex-1 bg-transparent text-sm text-[#1A1A1A] placeholder-[#B8B2A8] focus:outline-none"
          />
          <button
            onClick={() => {
              if (continueInput.trim()) {
                addQuestion(continueInput.trim(), selectedNodeId!, undefined, undefined, continueInheritRole ? undefined : false, undefined, undefined, !continueInheritAttachments);
                setContinueInput('');
                setContinueInheritRole(true);
              }
            }}
            disabled={!continueInput.trim()}
            className="text-[#B8B2A8] hover:text-[#6B5CE7] disabled:opacity-30 disabled:hover:text-[#B8B2A8] transition-colors shrink-0 rounded-full w-7 h-7 flex items-center justify-center hover:bg-[#E8E5E0]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
        <div className="flex gap-4 mt-1.5 px-1">
          <label className="flex items-center gap-2 text-xs text-[#6B6560] cursor-pointer select-none">
            <input type="checkbox" checked={continueInheritRole} onChange={(e) => setContinueInheritRole(e.target.checked)} className="rounded border-[#E8E5E0] text-[#6B5CE7] focus:ring-[#6B5CE7] w-3 h-3" />
            Inherit role
          </label>
          <label className="flex items-center gap-2 text-xs text-[#6B6560] cursor-pointer select-none">
            <input type="checkbox" checked={continueInheritAttachments} onChange={(e) => setContinueInheritAttachments(e.target.checked)} className="rounded border-[#E8E5E0] text-[#6B5CE7] focus:ring-[#6B5CE7] w-3 h-3" />
            Inherit attachments
          </label>
        </div>
      </div>
    </div>
  );
}

function AttachmentsSection({
  nodeId,
  attachments,
  excludedAttachmentIds,
  includedAttachmentIds,
  addAttachment,
  removeAttachment,
  toggleExcludeAttachment,
  setAttachmentRenderMode,
  getInheritedAttachments,
}: {
  nodeId: string;
  attachments: Attachment[];
  excludedAttachmentIds: string[];
  includedAttachmentIds: string[];
  addAttachment: (nodeId: string, attachment: Attachment) => void;
  removeAttachment: (nodeId: string, attachmentId: string) => void;
  toggleExcludeAttachment: (nodeId: string, attachmentId: string, ancestorExcluded?: boolean) => void;
  setAttachmentRenderMode: (nodeId: string, attachmentId: string, mode: 'full' | 'text-only') => void;
  getInheritedAttachments: (nodeId: string) => { attachment: Attachment; sourceNodeId: string; sourceQuestion: string; excludedByAncestor: boolean }[];
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inherited = getInheritedAttachments(nodeId);
  const excludeSet = new Set(excludedAttachmentIds);

  const processFile = useCallback(async (file: File) => {
    const id = generateId();
    const isImage = file.type.startsWith('image/');
    const isPDF = file.type === 'application/pdf' || file.name.endsWith('.pdf');
    const isText = file.type.startsWith('text/') || /\.(md|txt|js|ts|tsx|jsx|py|json|csv|yaml|yml|toml|sh|bash|zsh|c|cpp|h|hpp|java|rs|go|rb|swift|kt|css|html|xml|sql|r|m|lua)$/i.test(file.name);

    if (isImage) {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        addAttachment(nodeId, { id, name: file.name, type: file.type, size: file.size, content: base64, thumbnailUrl: reader.result as string });
      };
      reader.readAsDataURL(file);
    } else if (isPDF) {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        // Add immediately as extracting
        addAttachment(nodeId, { id, name: file.name, type: 'application/pdf', size: file.size, content: base64, isExtracting: true });
        try {
          const res = await fetch('http://localhost:3001/api/pdf-extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base64, scale: 1.5 }),
          });
          const data = await res.json();
          const numPages = data.numPages || 0;
          // Update the attachment in-place with extracted data
          const store = useStore.getState();
          store.setAttachmentData(nodeId, id, {
            extractedText: data.text,
            pageImages: data.images,
            numPages,
            renderMode: numPages > 10 ? 'text-only' : 'full',
            isExtracting: false,
          });
        } catch (err) {
          console.error('PDF extraction failed:', err);
          const store = useStore.getState();
          store.setAttachmentData(nodeId, id, { isExtracting: false });
        }
      };
      reader.readAsDataURL(file);
    } else if (isText) {
      const text = await file.text();
      addAttachment(nodeId, { id, name: file.name, type: file.type || 'text/plain', size: file.size, content: text });
    }
  }, [nodeId, addAttachment]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    for (const file of Array.from(e.dataTransfer.files)) {
      processFile(file);
    }
  }, [processFile]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    for (const item of Array.from(e.clipboardData.items)) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) processFile(file);
      }
    }
  }, [processFile]);

  const hasContent = attachments.length > 0 || inherited.length > 0;

  return (
    <div className="px-4 py-3 border-b border-[#E8E5E0]">
      <details className="group" open={hasContent}>
        <summary className="text-xs text-[#B8B2A8] uppercase tracking-wide font-medium cursor-pointer hover:text-[#6B6560] transition-colors flex items-center gap-1.5 select-none">
          <span className="transition-transform group-open:rotate-90 text-[10px]">▶</span>
          Attachments
          {hasContent && (
            <span className="text-[#6B5CE7]/60 font-medium normal-case ml-1">
              {attachments.length} local{inherited.length > 0 ? ` + ${inherited.length} inherited` : ''}
            </span>
          )}
        </summary>
        <div className="mt-2 space-y-3">
          {/* Upload area */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onPaste={handlePaste}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl px-4 py-3 text-center cursor-pointer transition-all ${
              isDragging
                ? 'border-[#6B5CE7] bg-[#6B5CE7]/5'
                : 'border-[#E8E5E0] hover:border-[#6B5CE7]/40 hover:bg-[#FAFAF8]'
            }`}
          >
            <p className="text-xs text-[#B8B2A8]">
              {isDragging ? 'Drop files here' : '📎 Drop, paste, or click to upload'}
            </p>
            <p className="text-[10px] text-[#B8B2A8]/60 mt-0.5">Images (Vision) • PDF • Text files (txt/md/code)</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.txt,.md,.js,.ts,.tsx,.jsx,.py,.json,.csv,.yaml,.yml,.toml,.sh,.c,.cpp,.h,.java,.rs,.go,.rb,.swift,.css,.html,.xml,.sql"
              className="hidden"
              onChange={(e) => {
                for (const file of Array.from(e.target.files || [])) {
                  processFile(file);
                }
                e.target.value = '';
              }}
            />
          </div>

          {/* Local attachments */}
          {attachments.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[10px] text-[#B8B2A8] font-medium uppercase">This node</span>
              {attachments.map((att) => (
                <div key={att.id} className="flex items-center gap-2 bg-[#F5F3F0] rounded-lg px-3 py-2 group">
                  {att.thumbnailUrl ? (
                    <img src={att.thumbnailUrl} className="w-8 h-8 rounded object-cover shrink-0" alt={att.name} />
                  ) : (
                    <span className="w-8 h-8 rounded bg-[#E8E5E0] flex items-center justify-center text-xs text-[#6B6560] shrink-0">{att.type === 'application/pdf' ? '📕' : '📄'}</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-[#1A1A1A] truncate">{att.name}</p>
                    <p className="text-[10px] text-[#B8B2A8]">
                      {(att.size / 1024).toFixed(1)} KB
                      {att.isExtracting && <span className="ml-1 text-[#6B5CE7] animate-pulse">⏳ Extracting...</span>}
                      {att.numPages != null && <span className="ml-1 text-[#6B6560]">• {att.numPages} pages</span>}
                      {att.renderMode && <span className="ml-1 text-[#6B6560]">• {att.renderMode === 'full' ? 'Text + Vision' : 'Text only'}</span>}
                    </p>
                    {/* Render mode toggle for PDFs with >10 pages */}
                    {att.type === 'application/pdf' && att.numPages != null && att.numPages > 10 && !att.isExtracting && (
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="text-[10px] text-amber-600">⚠ {att.numPages} pages (~{(att.numPages * 1500).toLocaleString()} tokens with Vision)</span>
                        <button
                          onClick={() => setAttachmentRenderMode(nodeId, att.id, att.renderMode === 'full' ? 'text-only' : 'full')}
                          className={`text-[10px] px-2 py-0.5 rounded-lg transition-colors ${
                            att.renderMode === 'full'
                              ? 'bg-[#6B5CE7]/10 text-[#6B5CE7]'
                              : 'bg-[#E8E5E0] text-[#6B6560]'
                          }`}
                        >
                          {att.renderMode === 'full' ? 'Switch to Text only' : 'Enable Vision'}
                        </button>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => removeAttachment(nodeId, att.id)}
                    className="text-[#B8B2A8] hover:text-red-500 transition-colors shrink-0 opacity-0 group-hover:opacity-100"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Inherited attachments */}
          {inherited.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[10px] text-[#B8B2A8] font-medium uppercase">Inherited from ancestors</span>
              {inherited.map(({ attachment: att, sourceQuestion, excludedByAncestor }) => {
                const isExcludedSelf = excludeSet.has(att.id);
                const includeSet = new Set(includedAttachmentIds);
                const isOverridden = includeSet.has(att.id); // re-included despite ancestor exclusion
                const isEffectivelyExcluded = isExcludedSelf || (excludedByAncestor && !isOverridden);
                return (
                  <div key={att.id} className={`flex items-center gap-2 rounded-lg px-3 py-2 transition-all ${isEffectivelyExcluded ? 'bg-red-50/50 opacity-50' : 'bg-[#F5F3F0]'}`}>
                    {att.thumbnailUrl ? (
                      <img src={att.thumbnailUrl} className="w-8 h-8 rounded object-cover shrink-0" alt={att.name} />
                    ) : (
                      <span className="w-8 h-8 rounded bg-[#E8E5E0] flex items-center justify-center text-xs text-[#6B6560] shrink-0">{att.type === 'application/pdf' ? '📕' : '📄'}</span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs truncate ${isEffectivelyExcluded ? 'text-[#B8B2A8] line-through' : 'text-[#1A1A1A]'}`}>{att.name}</p>
                      <p className="text-[10px] text-[#B8B2A8] truncate">
                        ← {sourceQuestion.slice(0, 40)}{sourceQuestion.length > 40 ? '…' : ''}
                        {excludedByAncestor && !isOverridden && !isExcludedSelf && <span className="ml-1 text-amber-500">• excluded upstream</span>}
                        {isOverridden && <span className="ml-1 text-green-500">• re-included</span>}
                      </p>
                    </div>
                    <button
                      onClick={() => toggleExcludeAttachment(nodeId, att.id, excludedByAncestor)}
                      className={`text-xs px-2 py-1 rounded-lg transition-colors shrink-0 ${
                        isEffectivelyExcluded
                          ? 'bg-red-100 text-red-500 hover:bg-red-200'
                          : isOverridden
                          ? 'bg-green-100 text-green-600 hover:bg-green-200'
                          : 'bg-[#E8E5E0] text-[#6B6560] hover:bg-[#6B5CE7]/10 hover:text-[#6B5CE7]'
                      }`}
                      title={excludedByAncestor && !isOverridden ? 'Excluded upstream — click to re-include' : isOverridden ? 'Re-included (override) — click to respect upstream exclusion' : isExcludedSelf ? 'Include in context' : 'Exclude from context'}
                    >
                      {excludedByAncestor && !isOverridden && !isExcludedSelf ? 'Upstream ✕' : isOverridden ? 'Re-included' : isExcludedSelf ? 'Excluded' : 'Included'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {!hasContent && (
            <p className="text-[10px] text-[#B8B2A8] italic">No attachments. Upload files or they'll be inherited from ancestor nodes.</p>
          )}
        </div>
      </details>
    </div>
  );
}

function HighlightedMarkdown({ content, highlights }: { content: string; highlights: Set<string> }) {
  // Simple approach: replace in markdown source, skip LaTeX regions
  let processed = content;
  for (const h of highlights) {
    const escaped = h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    processed = processed.replace(new RegExp(escaped, 'g'), `<mark class="bg-amber-100 text-amber-800 px-0.5 rounded">${h}</mark>`);
  }
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeRaw, rehypeHighlight, rehypeKatex]}
    >
      {processed}
    </ReactMarkdown>
  );
}
