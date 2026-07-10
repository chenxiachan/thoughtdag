import { useMemo } from 'react';
import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from '@xyflow/react';
import { X } from 'lucide-react';
import { useStore } from '../store';
import { routeEdge } from '../lib/edge-path';
import { walkUpAncestors } from '../lib/graph';
import { referenceBlockContent } from '../store/context-builder';
import { countTokens } from '../utils';
import { useT, fmt } from '../i18n';
import type { ThoughtEdge } from '../types';

/**
 * Custom edge registered under the 'smoothstep' type name (overrides the
 * built-in, so edges persisted before this component existed pick it up
 * with no migration). Renders as a bezier ARC with collision avoidance:
 * aligned nodes get a near-straight line, offset nodes a gentle curve,
 * and when the natural arc would cut through a card the path bends
 * sideways until it clears (see lib/edge-path). Click an edge to select
 * it — a delete button appears at its midpoint, and Delete/Backspace
 * removes it via App's key handler.
 */
export default function ThoughtEdgeView({
  id, source, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
  style, markerEnd, markerStart, selected, interactionWidth, data,
}: EdgeProps<ThoughtEdge>) {
  const deleteEdges = useStore((s) => s.deleteEdges);
  const setCrossLinkDepth = useStore((s) => s.setCrossLinkDepth);
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const t = useT();

  // Reference edges wear their depth on the line: selected, they show a
  // toggle chip pricing what the block would feed (quote vs full chain).
  const isRef = !!data?.isCrossLink;
  const depth = data?.contextDepth === 'full' ? 'full' : 'quote';
  const refTok = useMemo(() => {
    if (!selected || !isRef) return 0;
    const src = nodes.find((n) => n.id === source);
    if (!src || ['note', 'file', 'link'].includes(src.data.stepKind ?? '')) return 0;
    const structural = edges.filter((e) => !e.data?.isCrossLink);
    const chain = walkUpAncestors(source, nodes, structural).ordered
      .filter((n) => n.id !== source && !['note', 'file', 'link'].includes(n.data.stepKind ?? ''));
    return countTokens(referenceBlockContent({ source: src, edge: { id, source, target, data } as ThoughtEdge, depth, chain }));
  }, [selected, isRef, depth, source, target, id, nodes, edges, data]);
  const { path, labelX, labelY } = useMemo(
    () => routeEdge(sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, source, target, nodes),
    [sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, source, target, nodes],
  );

  // When selected, force full visibility (overrides the ancestor-dim pass)
  // and thicken the stroke as selection feedback.
  const edgeStyle = selected ? { ...style, strokeWidth: 3, opacity: 1 } : style;

  return (
    <>
      <BaseEdge
        path={path}
        style={edgeStyle}
        markerEnd={markerEnd}
        markerStart={markerStart}
        interactionWidth={interactionWidth}
      />
      {selected && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan"
            style={{
              position: 'absolute',
              pointerEvents: 'all',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            <div className="flex items-center gap-1">
              {isRef && refTok > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); setCrossLinkDepth(id, depth === 'full' ? 'quote' : 'full'); }}
                  className="h-6 px-2 rounded-full bg-card border border-line shadow-md flex items-center text-2xs text-ink-muted hover:text-accent hover:border-accent/40 transition-colors whitespace-nowrap"
                  title={t('edge.depthToggleTitle')}
                >
                  {fmt(t(depth === 'full' ? 'edge.fullChip' : 'edge.quoteChip'), { n: refTok })}
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); deleteEdges([id]); }}
                className="w-6 h-6 rounded-full bg-card border border-line shadow-md flex items-center justify-center text-ink-faint hover:text-red-500 hover:border-red-300 transition-colors"
                title={t('canvas.deleteEdgeTitle')}
              >
                <X size={13} strokeWidth={2} />
              </button>
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
