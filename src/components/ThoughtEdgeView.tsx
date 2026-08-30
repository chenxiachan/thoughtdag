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
  const setEdgeStructural = useStore((s) => s.setEdgeStructural);
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const t = useT();

  // The line kind IS the context weight: dashed = summary reference, solid
  // = full wiring (files included). Selected, the edge wears a chip that
  // prices and performs the conversion. Explore and watch edges keep their
  // own semantics and don't convert.
  const isRef = !!data?.isCrossLink;
  const depth = data?.contextDepth === 'full' ? 'full' : 'quote';
  const src = nodes.find((n) => n.id === source);
  const srcIsMaterial = !src || ['note', 'file', 'link'].includes(src.data.stepKind ?? '');
  const convertible = isRef
    ? !data?.isWatch && !srcIsMaterial
    : !data?.isBranchFromSelection && !data?.isWatch && !srcIsMaterial;
  const refTok = useMemo(() => {
    if (!selected || !convertible) return 0;
    if (!src) return 0;
    if (isRef) {
      const structural = edges.filter((e) => !e.data?.isCrossLink);
      const chain = walkUpAncestors(source, nodes, structural).ordered
        .filter((n) => n.id !== source && !['note', 'file', 'link'].includes(n.data.stepKind ?? ''));
      return countTokens(referenceBlockContent({ source: src, edge: { id, source, target, data } as ThoughtEdge, depth, chain }));
    }
    // solid: price what the SUMMARY would be after demotion
    const structural = edges.filter((e) => !e.data?.isCrossLink && e.id !== id);
    const chain = walkUpAncestors(source, nodes, structural).ordered
      .filter((n) => n.id !== source && !['note', 'file', 'link'].includes(n.data.stepKind ?? ''));
    return countTokens(referenceBlockContent({ source: src, edge: { id, source, target, data } as ThoughtEdge, depth: 'quote', chain }));
  }, [selected, convertible, isRef, depth, source, target, id, nodes, edges, data, src]);
  const { path, labelX, labelY } = useMemo(
    () => routeEdge(sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, source, target, nodes),
    [sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, source, target, nodes],
  );

  // When selected, force full visibility (overrides the ancestor-dim pass)
  // and thicken the stroke as selection feedback.
  const edgeStyle = selected ? { ...style, strokeWidth: 3, opacity: 1 } : style;

  // A merge's incoming blocks have a stated order — show it AT the join,
  // where the question "which reads first?" is asked. Only merges wear
  // numbers; a single-parent edge needs none.
  const mergeIndex = useMemo(() => {
    if (isRef) return -1;
    const siblings = edges.filter((e) => e.target === target && !e.data?.isCrossLink);
    if (siblings.length < 2) return -1;
    siblings.sort((a, b) => (a.data?.contextOrder ?? Number.MAX_SAFE_INTEGER) - (b.data?.contextOrder ?? Number.MAX_SAFE_INTEGER));
    return siblings.findIndex((e) => e.id === id);
  }, [edges, target, id, isRef]);

  return (
    <>
      <BaseEdge
        path={path}
        style={edgeStyle}
        markerEnd={markerEnd}
        markerStart={markerStart}
        interactionWidth={interactionWidth}
      />
      {mergeIndex >= 0 && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan"
            style={{
              position: 'absolute',
              pointerEvents: 'none',
              transform: `translate(-50%, -50%) translate(${targetX}px, ${targetY - 22}px)`,
            }}
            data-merge-order={mergeIndex + 1}
          >
            <div className="w-4.5 h-4.5 min-w-[18px] px-0.5 rounded-full bg-card border border-line shadow-sm flex items-center justify-center text-2xs font-mono text-ink-muted" style={{ fontSize: 10 }}>
              {mergeIndex + 1}
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
      {data?.focusRole === 'path' && (
        // Context Focus feed line: bright dots gliding INSIDE the solid
        // stroke (narrower than it, so the line never reads as dashed —
        // dashed is taken: references)
        <path d={path} className="tdag-flow-ov" fill="none" />
      )}
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
              {convertible && refTok > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); setEdgeStructural(id, isRef); }}
                  className="h-6 px-2 rounded-full bg-card border border-line shadow-md flex items-center text-2xs text-ink-muted hover:text-accent hover:border-accent/40 transition-colors whitespace-nowrap"
                  title={isRef ? t('edge.depthToggleTitle') : t('edge.solidChipTitle')}
                >
                  {isRef
                    ? fmt(t(depth === 'full' ? 'edge.fullChip' : 'edge.quoteChip'), { n: refTok })
                    : fmt(t('edge.solidChip'), { n: refTok })}
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
