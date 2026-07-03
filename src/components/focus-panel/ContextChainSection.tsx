import { useState } from 'react';
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
        className="flex items-center gap-1.5 text-xs text-ink-faint uppercase tracking-wide font-medium mb-2 hover:text-ink-muted transition-colors w-full"
      >
        <span>{contextOpen ? '▾' : '▸'}</span>
        <span>Context Chain</span>
        <span className="text-accent font-mono normal-case ml-auto">{totalContextTokens} tok</span>
      </button>

      {contextOpen && (
        <div className="space-y-1.5">
          {ancestors.length === 0 ? (
            <p className="text-xs text-ink-faint italic">Root node — no ancestors</p>
          ) : (
            ancestors.map((ancestor, i) => (
              <button
                key={ancestor.id}
                onClick={() => { setSelectedNodeId(ancestor.id); onFocusNode?.(ancestor.id); }}
                className="w-full text-left border border-line hover:border-accent/40 rounded-lg p-2.5 transition-colors group"
              >
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-ink-faint">{i === 0 ? '🌱' : '↳'}</span>
                  <span className="text-ink group-hover:text-accent transition-colors truncate">
                    {ancestor.data.question.slice(0, 60)}{ancestor.data.question.length > 60 ? '…' : ''}
                  </span>
                  <span className="text-ink-faint font-mono shrink-0 ml-auto">
                    {countTokens(ancestor.data.question + ancestor.data.response)} tok
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
