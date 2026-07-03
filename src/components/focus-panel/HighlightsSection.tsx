import { useState, useRef, useEffect } from 'react';
import { ClipboardList, FileText, GitBranch, Scissors, Sparkles, Star, Tag, X } from 'lucide-react';
import { useStore } from '../../store';
import type { Highlight } from '../../types';

export default function HighlightsSection({
  nodeId,
  highlights,
  highlightMode,
  dimmed,
}: {
  nodeId: string;
  highlights: Highlight[];
  highlightMode: 'off' | 'tag' | 'filter';
  dimmed: boolean;
}) {
  const addQuestion = useStore((s) => s.addQuestion);
  const removeHighlight = useStore((s) => s.removeHighlight);
  const setHighlightMode = useStore((s) => s.setHighlightMode);
  const distillRegenerate = useStore((s) => s.distillRegenerate);

  const [highlightExploreContext, setHighlightExploreContext] = useState('');
  const [highlightExploreInput, setHighlightExploreInput] = useState('');
  const [exploreInheritRole, setExploreInheritRole] = useState(true);
  const highlightExploreRef = useRef<HTMLInputElement>(null);

  // Auto-focus highlight explore input when context is set
  useEffect(() => {
    if (highlightExploreContext) {
      setTimeout(() => highlightExploreRef.current?.focus(), 100);
    }
  }, [highlightExploreContext]);

  return (
    <div className={`px-4 py-3 border-b border-line ${dimmed ? 'opacity-40 pointer-events-none' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs text-ink-faint uppercase tracking-wide font-medium">Highlights</label>
        {highlights.length > 0 && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => distillRegenerate(nodeId)}
              className="text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1"
              title="Distill: keep highlights, remove redundancy"
            >
              <Sparkles size={12} strokeWidth={1.75} />
              Distill
            </button>
            <button
              onClick={() => {
                const highlightTexts = highlights.map((h) => h.text).join('\n\n');
                addQuestion(`Summarize the following key points concisely:\n\n${highlightTexts}`, { parentId: nodeId, branchContext: highlightTexts });
              }}
              className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1"
              title="Summarize highlighted content in a new branch"
            >
              <ClipboardList size={12} strokeWidth={1.75} />
              Summary
            </button>
            <button
              onClick={() => {
                const highlightTexts = highlights.map((h) => h.text).join('\n\n');
                setHighlightExploreContext(highlightTexts);
              }}
              className="text-xs bg-accent/10 hover:bg-accent/20 text-accent px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1"
              title="Ask a follow-up question about highlighted content"
            >
              <GitBranch size={12} strokeWidth={1.75} />
              Explore
            </button>
          </div>
        )}
      </div>
      {highlights.length === 0 ? (
        <p className="text-xs text-ink-faint italic">No highlights yet — select text above to highlight</p>
      ) : (
        <>
          <div className="space-y-1.5 mb-3">
            {highlights.map((h) => (
              <div key={h.id} className="flex items-start gap-2 bg-amber-50 rounded-lg px-3 py-2 group">
                <span className="text-xs text-amber-700 flex-1 leading-relaxed">
                  <Star size={12} strokeWidth={1.75} className="inline" /> {h.text.slice(0, 80)}{h.text.length > 80 ? '…' : ''}
                </span>
                <button
                  onClick={() => removeHighlight(nodeId, h.id)}
                  className="text-amber-300 hover:text-red-500 transition-colors shrink-0 opacity-0 group-hover:opacity-100"
                >
                  <X size={12} strokeWidth={1.75} />
                </button>
              </div>
            ))}
          </div>
          {/* Highlight context mode */}
          <div className="space-y-2">
            <span className="text-xs text-ink-faint font-medium">Pass to downstream</span>
            <div className="flex items-center gap-1.5">
              {([
                { mode: 'tag' as const, icon: <Tag size={12} strokeWidth={1.75} />, label: 'Tag important' },
                { mode: 'filter' as const, icon: <Scissors size={12} strokeWidth={1.75} />, label: 'Highlights only' },
                { mode: 'off' as const, icon: <FileText size={12} strokeWidth={1.75} />, label: 'Full text' },
              ]).map(({ mode, icon, label }) => (
                <button
                  key={mode}
                  onClick={() => setHighlightMode(nodeId, mode)}
                  className={`text-xs px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 ${
                    highlightMode === mode
                      ? 'bg-accent text-white'
                      : 'bg-wash text-ink-muted hover:bg-line'
                  }`}
                >
                  <span>{icon}</span> {label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-ink-faint leading-relaxed">
              {highlightMode === 'off' && 'Downstream nodes receive the full response'}
              {highlightMode === 'tag' && 'Highlighted parts wrapped with [Important] tags to guide AI focus'}
              {highlightMode === 'filter' && 'Downstream nodes only receive highlighted content, rest discarded'}
            </p>
          </div>
          {/* Highlight Explore input */}
          {highlightExploreContext && (
            <div className="mt-3 space-y-1.5">
              <span className="text-xs text-accent font-medium"><GitBranch size={12} strokeWidth={1.75} className="inline" /> Ask about highlights:</span>
              <div className="flex gap-1.5">
                <input
                  ref={highlightExploreRef}
                  type="text"
                  value={highlightExploreInput}
                  onChange={(e) => setHighlightExploreInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && highlightExploreInput.trim()) {
                      addQuestion(highlightExploreInput.trim(), { parentId: nodeId, branchContext: highlightExploreContext, inheritRole: exploreInheritRole ? undefined : false });
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
                  className="flex-1 text-xs border border-accent/30 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent bg-accent/5"
                />
                <button
                  onClick={() => {
                    if (highlightExploreInput.trim()) {
                      addQuestion(highlightExploreInput.trim(), { parentId: nodeId, branchContext: highlightExploreContext, inheritRole: exploreInheritRole ? undefined : false });
                      setHighlightExploreInput('');
                      setHighlightExploreContext('');
                      setExploreInheritRole(true);
                    }
                  }}
                  className="text-xs bg-accent text-white px-3 py-2 rounded-lg hover:bg-accent-strong transition-colors shrink-0"
                >
                  Go
                </button>
                <button
                  onClick={() => { setHighlightExploreContext(''); setHighlightExploreInput(''); }}
                  className="text-xs text-ink-faint hover:text-ink-muted px-1.5 py-2 transition-colors shrink-0"
                >
                  <X size={12} strokeWidth={1.75} />
                </button>
              </div>
              <label className="flex items-center gap-2 text-xs text-ink-muted cursor-pointer select-none">
                <input type="checkbox" checked={exploreInheritRole} onChange={(e) => setExploreInheritRole(e.target.checked)} className="rounded border-line text-accent focus:ring-accent w-3 h-3" />
                Inherit role
              </label>
            </div>
          )}
        </>
      )}
    </div>
  );
}
