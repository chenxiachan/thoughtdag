import { useState } from 'react';
import { ChevronDown, ChevronRight, CornerDownRight, Sprout } from 'lucide-react';
import { useStore } from '../../store';
import { countTokens } from '../../utils';
import type { ThoughtNode } from '../../types';

export default function ContextChainSection({
  ancestors,
  totalContextTokens,
  onFocusNode,
}: {
  ancestors: ThoughtNode[];
  totalContextTokens: number;
  onFocusNode?: (id: string) => void;
}) {
  const setSelectedNodeId = useStore((s) => s.setSelectedNodeId);

  const [contextOpen, setContextOpen] = useState(true);

  return (
    <div className="px-4 py-3">
      <button
        onClick={() => setContextOpen(!contextOpen)}
        className="flex items-center gap-1.5 text-xs text-ink-faint uppercase tracking-wider font-medium mb-2 hover:text-ink-muted transition-colors w-full"
      >
        <span>{contextOpen ? <ChevronDown size={14} strokeWidth={1.75} /> : <ChevronRight size={14} strokeWidth={1.75} />}</span>
        <span>Context Chain</span>
        <span className="text-ink-muted font-mono normal-case ml-auto">{totalContextTokens} tok</span>
      </button>

      {contextOpen && (
        <div>
          {ancestors.length === 0 ? (
            <p className="text-xs text-ink-faint italic">Root node — no ancestors</p>
          ) : (
            ancestors.map((ancestor, i) => (
              <button
                key={ancestor.id}
                onClick={() => { setSelectedNodeId(ancestor.id); onFocusNode?.(ancestor.id); }}
                className="w-full text-left rounded-lg px-2 py-1.5 hover:bg-wash transition-colors group flex items-center gap-2 text-xs"
              >
                <span className="text-ink-faint shrink-0">{i === 0 ? <Sprout size={14} strokeWidth={1.75} /> : <CornerDownRight size={14} strokeWidth={1.75} />}</span>
                <span className="text-ink-muted group-hover:text-accent transition-colors truncate flex-1">
                  {ancestor.data.question.slice(0, 70)}{ancestor.data.question.length > 70 ? '…' : ''}
                </span>
                <span className="text-2xs text-ink-faint font-mono shrink-0">
                  {countTokens(ancestor.data.question + ancestor.data.response)}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
