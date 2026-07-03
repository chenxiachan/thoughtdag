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
  );
}
