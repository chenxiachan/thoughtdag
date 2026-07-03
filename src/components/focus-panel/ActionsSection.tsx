import { useStore } from '../../store';

export default function ActionsSection({
  nodeId,
  isLoading,
  dimmed,
  branchInput,
  setBranchInput,
  showBranchInput,
  setShowBranchInput,
  branchContext,
  setBranchContext,
  branchInheritRole,
  setBranchInheritRole,
}: {
  nodeId: string;
  isLoading: boolean;
  dimmed: boolean;
  branchInput: string;
  setBranchInput: (value: string) => void;
  showBranchInput: boolean;
  setShowBranchInput: (value: boolean) => void;
  branchContext: string;
  setBranchContext: (value: string) => void;
  branchInheritRole: boolean;
  setBranchInheritRole: (value: boolean) => void;
}) {
  const addQuestion = useStore((s) => s.addQuestion);
  const regenerate = useStore((s) => s.regenerate);
  const deleteNode = useStore((s) => s.deleteNode);
  const duplicateNode = useStore((s) => s.duplicateNode);
  const stopGeneration = useStore((s) => s.stopGeneration);
  const setSelectedNodeId = useStore((s) => s.setSelectedNodeId);

  const handleBranchSubmit = () => {
    if (!branchInput.trim()) return;
    addQuestion(branchInput.trim(), {
      parentId: nodeId,
      branchContext: branchContext || undefined,
      inheritRole: branchInheritRole ? undefined : false,
    });
    setBranchInput('');
    setShowBranchInput(false);
    setBranchContext('');
    setBranchInheritRole(true);
  };

  return (
    <div className={`px-4 py-3 border-b border-line ${dimmed ? 'opacity-40 pointer-events-none' : ''}`}>
      <label className="text-xs text-ink-faint uppercase tracking-wide font-medium mb-2 block">Actions</label>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => regenerate(nodeId)}
          className="text-xs bg-wash hover:bg-line text-ink-muted px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          Regenerate
        </button>
        {isLoading ? (
          <button
            onClick={() => stopGeneration(nodeId)}
            className="text-xs bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
            Stop
          </button>
        ) : (
          <button
            onClick={() => duplicateNode(nodeId)}
            className="text-xs bg-wash hover:bg-line text-ink-muted px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5"
          >
            📋 Duplicate
          </button>
        )}
        <button
          onClick={() => { deleteNode(nodeId); setSelectedNodeId(null); }}
          className="text-xs bg-red-50 hover:bg-red-100 text-red-500 px-3 py-2 rounded-lg transition-colors"
        >
          🗑 Delete
        </button>
      </div>
      {showBranchInput && (
        <div className="mt-3">
          {branchContext && (
            <div className="text-xs pl-3 py-1.5 pr-2 mb-2 border-l-2 border-accent bg-accent/5 rounded-r text-ink-muted">
              <span className="text-accent font-medium">⑂ Exploring from selection:</span>
              &ldquo;{branchContext.slice(0, 100)}{branchContext.length > 100 ? '…' : ''}&rdquo;
            </div>
          )}
          <div className="flex items-center gap-2 bg-wash rounded-xl px-3 py-2">
            <input
              type="text"
              value={branchInput}
              onChange={(e) => setBranchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleBranchSubmit(); }
                if (e.key === 'Escape') { setShowBranchInput(false); setBranchContext(''); }
              }}
              placeholder="Branch question..."
              className="flex-1 bg-transparent text-sm text-ink placeholder-ink-faint focus:outline-none"
              autoFocus
            />
            <button
              onClick={handleBranchSubmit}
              disabled={!branchInput.trim()}
              className="text-accent hover:text-accent-strong disabled:opacity-30 transition-colors"
            >
              ↵
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs text-ink-muted mt-1.5 cursor-pointer select-none">
            <input type="checkbox" checked={branchInheritRole} onChange={(e) => setBranchInheritRole(e.target.checked)} className="rounded border-line text-accent focus:ring-accent w-3 h-3" />
            Inherit role
          </label>
        </div>
      )}
    </div>
  );
}
