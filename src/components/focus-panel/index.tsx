import { useState } from 'react';
import { X } from 'lucide-react';
import { useStore } from '../../store';
import { countTokens } from '../../utils';
import { getContextPath } from '../../lib/graph';
import RoleSection from './RoleSection';
import AttachmentsSection from './AttachmentsSection';
import QuestionSection from './QuestionSection';
import ResponseSection from './ResponseSection';
import HighlightsSection from './HighlightsSection';
import ActionsSection from './ActionsSection';
import ContextChainSection from './ContextChainSection';
import FollowUpInput from './FollowUpInput';

export default function FocusPanel({ onFocusNode }: { onFocusNode?: (id: string) => void }) {
  const {
    nodes, edges, selectedNodeId, setSelectedNodeId,
    getAvailableRoles,
    addAttachment, removeAttachment, toggleExcludeAttachment, setAttachmentRenderMode, getInheritedAttachments,
  } = useStore();

  const [branchInput, setBranchInput] = useState('');
  const [showBranchInput, setShowBranchInput] = useState(false);
  const [branchContext, setBranchContext] = useState(''); // preserved selected text for branch
  const [branchInheritRole, setBranchInheritRole] = useState(true);
  const [roleChanged, setRoleChanged] = useState(false);

  // Reset states when switching nodes (adjust-during-render, no effect needed).
  // Section-local states are reset via key={...selectedNodeId} on the sections below.
  const [prevNodeId, setPrevNodeId] = useState(selectedNodeId);
  if (prevNodeId !== selectedNodeId) {
    setPrevNodeId(selectedNodeId);
    setShowBranchInput(false);
    setBranchInput('');
    setBranchContext('');
    setRoleChanged(false);
  }

  const node = nodes.find((n) => n.id === selectedNodeId);

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

  const handleExploreSelection = (text: string) => {
    setBranchContext(text); // save before selection clears
    setBranchInput('');
    setShowBranchInput(true);
  };

  return (
    <div className="w-1/2 shrink-0 h-full bg-card border-l border-line flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-line shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-sm font-semibold text-ink truncate">
            {data.question.slice(0, 50)}{data.question.length > 50 ? '…' : ''}
          </h2>
          <span className="text-xs text-ink-muted bg-wash px-2 py-0.5 rounded-full shrink-0 font-mono">
            {data.tokenCount} tok
          </span>
        </div>
        <button
          onClick={() => setSelectedNodeId(null)}
          className="text-ink-faint hover:text-ink transition-colors shrink-0 ml-2"
        >
          <X size={16} strokeWidth={1.75} />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Role (System Prompt) Section — above Question */}
        <RoleSection
          nodeId={selectedNodeId!}
          data={data}
          roleMode={roleMode}
          inheritedRole={inheritedRole}
          availableRoles={availableRoles}
          hasRoleConflict={hasRoleConflict}
          setRoleChanged={setRoleChanged}
          roleChanged={roleChanged}
        />

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
        <QuestionSection
          key={`q-${selectedNodeId}`}
          nodeId={selectedNodeId!}
          question={data.question}
          isEditing={data.isEditing}
        />

        {/* Response Section */}
        <ResponseSection
          key={`r-${selectedNodeId}`}
          nodeId={selectedNodeId!}
          data={data}
          hasMultipleVersions={hasMultipleVersions}
          highlightedTexts={highlightedTexts}
          onExploreSelection={handleExploreSelection}
        />

        {/* Highlights Section */}
        <HighlightsSection
          key={`h-${selectedNodeId}`}
          nodeId={selectedNodeId!}
          highlights={data.highlights}
          highlightMode={data.highlightMode}
          dimmed={needsRegenerate}
        />

        {/* Actions Bar */}
        <ActionsSection
          nodeId={selectedNodeId!}
          isLoading={data.isLoading}
          dimmed={needsRegenerate}
          branchInput={branchInput}
          setBranchInput={setBranchInput}
          showBranchInput={showBranchInput}
          setShowBranchInput={setShowBranchInput}
          branchContext={branchContext}
          setBranchContext={setBranchContext}
          branchInheritRole={branchInheritRole}
          setBranchInheritRole={setBranchInheritRole}
        />

        {/* Context Chain Section */}
        <ContextChainSection
          key={`c-${selectedNodeId}`}
          ancestors={ancestors}
          totalContextTokens={totalContextTokens}
          onFocusNode={onFocusNode}
        />
      </div>

      {/* Continue input — pinned at bottom */}
      <FollowUpInput
        key={selectedNodeId}
        nodeId={selectedNodeId!}
        dimmed={needsRegenerate}
      />
    </div>
  );
}
