import { useState } from 'react';
import { ChevronDown, ChevronRight, CornerDownRight, Link2, Paperclip, Quote, Sprout, StickyNote } from 'lucide-react';
import { useStore } from '../../store';
import { useUiStore } from '../../lib/ui-store';
import { countTokens } from '../../utils';
import { referenceBlockContent } from '../../store/context-builder';
import type { ContextPartition } from '../../lib/graph';
import { useT } from '../../i18n';
import type { ThoughtNode } from '../../types';

// The context TREE, grouped the same way the prompt is assembled
// (materials → references → the conversation): what you read here is
// literally the order the model reads. References show their depth
// (quote / full) and price; every row jumps to its node.

// The ambient memory layer, when enabled: the panel's promise is that what
// you read here is what the model reads — memory rides context, so it shows.
function MemoryRow() {
  const t = useT();
  const enabled = useUiStore((s) => s.memoryEnabled);
  const memories = useUiStore((s) => s.memories);
  const setMemoryManagerOpen = useUiStore((s) => s.setMemoryManagerOpen);
  if (!enabled || memories.length === 0) return null;
  const tok = countTokens(memories.map((m) => m.text).join('\n'));
  return (
    <button
      onClick={() => setMemoryManagerOpen(true)}
      className="w-full text-left rounded-lg px-2 py-1.5 hover:bg-wash transition-colors group flex items-center gap-2 text-xs"
      title={t('memory.rowTitle')}
    >
      <span className="text-ink-faint shrink-0">🧠</span>
      <span className="text-ink-muted group-hover:text-accent transition-colors truncate flex-1">
        {t('memory.rowLabel')}
      </span>
      <span className="text-2xs text-ink-faint font-mono shrink-0">{memories.length} · {tok} tok</span>
    </button>
  );
}

function materialEntry(node: ThoughtNode): { icon: React.ReactNode; label: string } {
  const kind = node.data.stepKind;
  if (kind === 'file') {
    const atts = node.data.attachments || [];
    return { icon: <Paperclip size={14} strokeWidth={1.75} />, label: atts.map((a) => a.name).join(', ') };
  }
  if (kind === 'link') {
    return { icon: <Link2 size={14} strokeWidth={1.75} className="text-accent" />, label: node.data.linkTitle || node.data.linkUrl || '' };
  }
  return { icon: <StickyNote size={14} strokeWidth={1.75} className="text-amber-600" />, label: node.data.question };
}

export default function ContextChainSection({
  partition,
  totalContextTokens,
  onFocusNode,
}: {
  partition: ContextPartition;
  totalContextTokens: number;
  onFocusNode?: (id: string) => void;
}) {
  const setSelectedNodeId = useStore((s) => s.setSelectedNodeId);
  const setEdgeStructural = useStore((s) => s.setEdgeStructural);
  const staleIds = useStore((s) => s.staleIds);
  const t = useT();

  // Open by default: visible context IS the product. A collapsed one-liner
  // read as "the panel hides the history" to first-run users (HN feedback).
  const [contextOpen, setContextOpen] = useState(true);
  const jump = (id: string) => { setSelectedNodeId(id); onFocusNode?.(id); };
  const staleDot = (id: string) => staleIds.includes(id) && (
    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" title={t('node.staleBadge')} />
  );

  const ancestors = partition.mainline.slice(0, -1); // exclude current node
  const rowCls = 'w-full text-left rounded-lg px-2 py-1.5 hover:bg-wash transition-colors group flex items-center gap-2 text-xs';
  const groupCls = 'text-2xs text-ink-faint font-medium mt-2 mb-0.5';

  return (
    <div className="panel-card px-4 py-3">
      <button
        onClick={() => setContextOpen(!contextOpen)}
        className="flex items-center gap-1.5 text-2xs font-semibold text-ink-muted mb-1 hover:text-ink transition-colors w-full"
      >
        <span>{contextOpen ? <ChevronDown size={14} strokeWidth={1.75} /> : <ChevronRight size={14} strokeWidth={1.75} />}</span>
        <span>{t('chain.title')}</span>
        <span className="text-ink-faint font-normal ml-auto">{totalContextTokens} tok</span>
      </button>

      {contextOpen && (
        <div>
          <MemoryRow />
          {/* Materials */}
          {partition.materials.length > 0 && (
            <>
              <p className={groupCls}>{t('chain.materials')}</p>
              {partition.materials.map((m) => {
                const { icon, label } = materialEntry(m);
                return (
                  <button key={m.id} onClick={() => jump(m.id)} className={rowCls}>
                    <span className="text-ink-faint shrink-0">{icon}</span>
                    <span className="text-ink-muted group-hover:text-accent transition-colors truncate flex-1">
                      {label.slice(0, 70)}{label.length > 70 ? '…' : ''}
                    </span>
                  </button>
                );
              })}
            </>
          )}

          {/* References: dashed edges, depth + price on each row */}
          {partition.references.length > 0 && (
            <>
              <p className={groupCls}>{t('chain.references')}</p>
              {partition.references.map((ref) => (
                <button key={ref.edge.id} onClick={() => jump(ref.source.id)} className={rowCls}>
                  <span className="text-ink-faint shrink-0"><Quote size={13} strokeWidth={1.75} /></span>
                  <span className="text-ink-muted group-hover:text-accent transition-colors truncate flex-1">
                    {ref.source.data.question.slice(0, 60)}{ref.source.data.question.length > 60 ? '…' : ''}
                  </span>
                  {staleDot(ref.source.id)}
                  <span
                    onClick={(e) => { e.stopPropagation(); setEdgeStructural(ref.edge.id, true); }}
                    title={t('edge.depthToggleTitle')}
                    className={`text-2xs px-1.5 py-px rounded-full shrink-0 cursor-pointer transition-shadow hover:ring-1 hover:ring-accent/40 ${ref.depth === 'full' ? 'bg-accent/10 text-accent' : 'bg-wash text-ink-faint'}`}
                  >
                    {t(ref.depth === 'full' ? 'chain.refDepthFull' : 'chain.refDepthQuote')} →—
                  </span>
                  <span className="text-2xs text-ink-faint font-mono shrink-0">
                    {countTokens(referenceBlockContent(ref))}
                  </span>
                </button>
              ))}
            </>
          )}

          {/* The conversation itself */}
          {ancestors.length === 0 && partition.materials.length === 0 && partition.references.length === 0 ? (
            <p className="text-xs text-ink-faint italic mt-1">{t('chain.rootNode')}</p>
          ) : (
            <>
            {(partition.materials.length > 0 || partition.references.length > 0) && ancestors.length > 0 && (
              <p className={groupCls}>{t('chain.conversation')}</p>
            )}
            {ancestors.map((ancestor, i) => (
              <button key={ancestor.id} onClick={() => jump(ancestor.id)} className={rowCls}>
                <span className="text-ink-faint shrink-0">
                  {i === 0 ? <Sprout size={14} strokeWidth={1.75} /> : <CornerDownRight size={14} strokeWidth={1.75} />}
                </span>
                <span className="text-ink-muted group-hover:text-accent transition-colors truncate flex-1">
                  {ancestor.data.question.slice(0, 70)}{ancestor.data.question.length > 70 ? '…' : ''}
                </span>
                {staleDot(ancestor.id)}
                <span className="text-2xs text-ink-faint font-mono shrink-0">
                  {countTokens(ancestor.data.question + ancestor.data.response)}
                </span>
              </button>
            ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
