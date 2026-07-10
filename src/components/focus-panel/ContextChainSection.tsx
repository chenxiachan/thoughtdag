import { useState } from 'react';
import { ChevronDown, ChevronRight, CornerDownRight, Link2, Paperclip, Sprout, StickyNote } from 'lucide-react';
import { useStore } from '../../store';
import { countTokens } from '../../utils';
import { useT } from '../../i18n';
import type { ThoughtNode } from '../../types';

// Content ancestors (notes / files / links) show up in the chain with their
// own identity — the material feeding this node is part of its provenance.
function chainEntry(ancestor: ThoughtNode): { icon: React.ReactNode | null; label: string } {
  const kind = ancestor.data.stepKind;
  if (kind === 'note') {
    return { icon: <StickyNote size={14} strokeWidth={1.75} className="text-amber-600" />, label: ancestor.data.question };
  }
  if (kind === 'file') {
    const atts = ancestor.data.attachments || [];
    return { icon: <Paperclip size={14} strokeWidth={1.75} />, label: atts.map((a) => a.name).join(', ') };
  }
  if (kind === 'link') {
    return { icon: <Link2 size={14} strokeWidth={1.75} className="text-accent" />, label: ancestor.data.linkTitle || ancestor.data.linkUrl || '' };
  }
  return { icon: null, label: ancestor.data.question };
}

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
  const t = useT();

  const [contextOpen, setContextOpen] = useState(true);

  return (
    <div className="panel-card px-4 py-3">
      <button
        onClick={() => setContextOpen(!contextOpen)}
        className="flex items-center gap-1.5 text-2xs font-semibold text-ink-muted mb-2 hover:text-ink transition-colors w-full"
      >
        <span>{contextOpen ? <ChevronDown size={14} strokeWidth={1.75} /> : <ChevronRight size={14} strokeWidth={1.75} />}</span>
        <span>{t('chain.title')}</span>
        <span className="text-ink-faint font-normal ml-auto">{totalContextTokens} tok</span>
      </button>

      {contextOpen && (
        <div>
          {ancestors.length === 0 ? (
            <p className="text-xs text-ink-faint italic">{t('chain.rootNode')}</p>
          ) : (
            ancestors.map((ancestor, i) => {
              const { icon, label } = chainEntry(ancestor);
              return (
                <button
                  key={ancestor.id}
                  onClick={() => { setSelectedNodeId(ancestor.id); onFocusNode?.(ancestor.id); }}
                  className="w-full text-left rounded-lg px-2 py-1.5 hover:bg-wash transition-colors group flex items-center gap-2 text-xs"
                >
                  <span className="text-ink-faint shrink-0">{icon ?? (i === 0 ? <Sprout size={14} strokeWidth={1.75} /> : <CornerDownRight size={14} strokeWidth={1.75} />)}</span>
                  <span className="text-ink-muted group-hover:text-accent transition-colors truncate flex-1">
                    {label.slice(0, 70)}{label.length > 70 ? '…' : ''}
                  </span>
                  <span className="text-2xs text-ink-faint font-mono shrink-0">
                    {countTokens(ancestor.data.question + ancestor.data.response)}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
