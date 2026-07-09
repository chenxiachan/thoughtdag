import { useState } from 'react';
import { X } from 'lucide-react';
import { useStore } from '../../store';
import { countTokens } from '../../utils';
import { getContextPath } from '../../lib/graph';
import { useT } from '../../i18n';

const PANEL_WIDTH_KEY = 'thoughtdag.panelWidth';
const PANEL_MIN_WIDTH = 380;

function loadPanelWidth(): number | null {
  const raw = localStorage.getItem(PANEL_WIDTH_KEY);
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) ? n : null;
}
import RoleLine from './RoleLine';
import AttachmentsSection from './AttachmentsSection';
import QuestionSection from './QuestionSection';
import ResponseSection from './ResponseSection';
import HighlightsSection from './HighlightsSection';
import HeaderActions from './HeaderActions';
import ContextChainSection from './ContextChainSection';
import FollowUpInput from './FollowUpInput';

// The panel does three jobs: READ (question/response), ASK (the single
// follow-up input at the bottom), INSPECT (context chain). Everything else
// is one compact strip of actions or a collapsed section.

export default function FocusPanel({ onFocusNode }: { onFocusNode?: (id: string) => void }) {
  const {
    nodes, edges, selectedNodeId, setSelectedNodeId,
    addAttachment, removeAttachment, toggleExcludeAttachment, setAttachmentRenderMode, getInheritedAttachments,
  } = useStore();
  const t = useT();

  // Selected text from the response, staged as context for the follow-up
  const [branchContext, setBranchContext] = useState('');

  // Resizable width: null → default 50%; persisted on drag end
  const [panelWidth, setPanelWidth] = useState<number | null>(loadPanelWidth);
  const [resizing, setResizing] = useState(false);

  const onResizePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setResizing(true);
  };
  const onResizePointerMove = (e: React.PointerEvent) => {
    if (!resizing) return;
    const maxW = Math.floor(window.innerWidth * 0.7);
    setPanelWidth(Math.min(maxW, Math.max(PANEL_MIN_WIDTH, window.innerWidth - e.clientX)));
  };
  const onResizePointerUp = (e: React.PointerEvent) => {
    if (!resizing) return;
    setResizing(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    setPanelWidth((w) => {
      if (w != null) localStorage.setItem(PANEL_WIDTH_KEY, String(w));
      return w;
    });
  };
  const onResizeDoubleClick = () => {
    setPanelWidth(null);
    localStorage.removeItem(PANEL_WIDTH_KEY);
  };

  // Reset staged context when switching nodes (adjust-during-render).
  const [prevNodeId, setPrevNodeId] = useState(selectedNodeId);
  if (prevNodeId !== selectedNodeId) {
    setPrevNodeId(selectedNodeId);
    setBranchContext('');
  }

  const node = nodes.find((n) => n.id === selectedNodeId);

  if (!node) {
    return null;
  }

  const data = node.data;
  const hasMultipleVersions = data.responses.length > 1;

  // Nearest ancestor role for the status line (legacy graphs may carry
  // roleSourceNodeId / set-next / reset — respect them when displaying)
  const inheritedRole = (() => {
    if (data.rolePrompt) return '';
    const visited = new Set<string>();
    function findRole(id: string): string {
      if (visited.has(id)) return '';
      visited.add(id);
      const n = nodes.find((nd) => nd.id === id);
      if (!n) return '';
      if (n.data.roleSourceNodeId && n.data.roleSourceNodeId !== '__none__') {
        const sourceNode = nodes.find((nd) => nd.id === n.data.roleSourceNodeId);
        if (sourceNode?.data.rolePrompt) return sourceNode.data.rolePrompt;
      }
      if (n.data.roleSourceNodeId === '__none__') return '';
      const mode = n.data.roleMode || 'inherit';
      if (mode === 'reset') return ''; // legacy: blocks inheritance
      if (n.data.rolePrompt) return n.data.rolePrompt;
      for (const pe of edges.filter((e) => e.target === id)) {
        const found = findRole(pe.source);
        if (found) return found;
      }
      return '';
    }
    for (const pe of edges.filter((e) => e.target === selectedNodeId)) {
      const found = findRole(pe.source);
      if (found) return found;
    }
    return '';
  })();

  const contextPath = getContextPath(selectedNodeId!, nodes, edges);
  const ancestors = contextPath.slice(0, -1); // exclude current node
  const totalContextTokens = contextPath.reduce((sum, n) => sum + countTokens(n.data.question + n.data.response), 0);
  const highlightedTexts = new Set(data.highlights.map((h) => h.text));

  return (
    <div
      className={`relative shrink-0 h-full bg-card border-l border-line flex flex-col ${resizing ? 'select-none' : ''}`}
      style={{ width: panelWidth ?? '50%', minWidth: PANEL_MIN_WIDTH, maxWidth: '70vw' }}
    >
      {/* Resize handle on the left edge */}
      <div
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        onDoubleClick={onResizeDoubleClick}
        className={`absolute left-0 top-0 h-full w-[5px] -ml-[2px] z-20 cursor-col-resize hover:bg-accent/30 transition-colors ${resizing ? 'bg-accent/40' : ''}`}
        title={t('panel.resizeTitle')}
      />
      {/* Header: title + compact action strip */}
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-line shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-sm font-semibold text-ink truncate">
            {data.question.slice(0, 50)}{data.question.length > 50 ? '…' : ''}
          </h2>
          <span className="text-2xs text-ink-muted bg-wash px-2 py-0.5 rounded-full shrink-0 font-mono">
            {data.tokenCount} tok
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <HeaderActions nodeId={selectedNodeId!} isLoading={data.isLoading} />
          <button
            onClick={() => setSelectedNodeId(null)}
            className="text-ink-faint hover:text-ink transition-colors shrink-0 ml-1"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <RoleLine nodeId={selectedNodeId!} data={data} inheritedRole={inheritedRole} />

        <QuestionSection
          key={`q-${selectedNodeId}`}
          nodeId={selectedNodeId!}
          question={data.question}
          isEditing={data.isEditing}
          isHuman={data.stepKind === 'human'}
        />

        <ResponseSection
          key={`r-${selectedNodeId}`}
          nodeId={selectedNodeId!}
          data={data}
          hasMultipleVersions={hasMultipleVersions}
          highlightedTexts={highlightedTexts}
          onExploreSelection={setBranchContext}
        />

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

        <HighlightsSection
          key={`h-${selectedNodeId}`}
          nodeId={selectedNodeId!}
          highlights={data.highlights}
          highlightMode={data.highlightMode}
        />

        <ContextChainSection
          key={`c-${selectedNodeId}`}
          ancestors={ancestors}
          totalContextTokens={totalContextTokens}
          onFocusNode={onFocusNode}
        />
      </div>

      {/* The ONE input — pinned at bottom; selected text stages into it */}
      <FollowUpInput
        key={selectedNodeId}
        nodeId={selectedNodeId!}
        branchContext={branchContext}
        onClearBranchContext={() => setBranchContext('')}
      />
    </div>
  );
}
