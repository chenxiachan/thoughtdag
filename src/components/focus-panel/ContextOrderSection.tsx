import { ArrowDown, ArrowUp } from 'lucide-react';
import { useStore } from '../../store';
import { useT } from '../../i18n';

// The order of a merge's incoming BLOCKS — visible and adjustable only
// where several parents feed one node. Reordering moves whole upstream
// blocks (an entry = one incoming edge = its entire chain); the order of
// nodes INSIDE a single chain is conversational fact and never offered
// here. Changing the order changes the context, so staleness recomputes
// and downstream honestly flags itself.
export default function ContextOrderSection({ nodeId }: { nodeId: string }) {
  const t = useT();
  const edges = useStore((s) => s.edges);
  const nodes = useStore((s) => s.nodes);
  const incoming = edges
    .filter((e) => e.target === nodeId && !e.data?.isCrossLink)
    .sort((a, b) => (a.data?.contextOrder ?? Number.MAX_SAFE_INTEGER) - (b.data?.contextOrder ?? Number.MAX_SAFE_INTEGER));
  if (incoming.length < 2) return null;

  const labelOf = (sourceId: string): string => {
    const n = nodes.find((x) => x.id === sourceId);
    if (!n) return sourceId.slice(0, 8);
    const text = n.data.summaries?.[n.data.responseIndex] || n.data.question || '';
    return text.replace(/\s+/g, ' ').slice(0, 42) || sourceId.slice(0, 8);
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= incoming.length) return;
    const next = [...incoming];
    [next[i], next[j]] = [next[j], next[i]];
    const orderOf = new Map(next.map((e, k) => [e.id, k]));
    const store = useStore.getState();
    store.pushHistory();
    useStore.setState((s) => ({
      edges: s.edges.map((e) => (orderOf.has(e.id) ? { ...e, data: { ...e.data, contextOrder: orderOf.get(e.id)! } } : e)),
    }));
    store.recomputeStaleness();
  };

  return (
    <div className="px-4 py-3 border-b border-line" data-context-order>
      <div className="text-2xs uppercase tracking-wide text-ink-faint mb-1.5">{t('panel.ctxOrder')}</div>
      <div className="flex flex-col gap-1">
        {incoming.map((e, i) => (
          <div key={e.id} className="flex items-center gap-1.5 text-xs text-ink" data-context-order-item={e.source}>
            <span className="text-2xs font-mono text-ink-faint w-4 shrink-0">{i + 1}</span>
            <span className="flex-1 truncate">{labelOf(e.source)}</span>
            <button
              className="text-ink-faint hover:text-ink disabled:opacity-25 p-0.5"
              disabled={i === 0}
              onClick={() => move(i, -1)}
              title={t('panel.ctxOrderUp')}
              data-ctx-up
            >
              <ArrowUp size={13} strokeWidth={1.75} />
            </button>
            <button
              className="text-ink-faint hover:text-ink disabled:opacity-25 p-0.5"
              disabled={i === incoming.length - 1}
              onClick={() => move(i, 1)}
              title={t('panel.ctxOrderDown')}
              data-ctx-down
            >
              <ArrowDown size={13} strokeWidth={1.75} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
