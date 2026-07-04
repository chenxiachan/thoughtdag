import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from '@xyflow/react';
import { X } from 'lucide-react';
import { useStore } from '../store';
import { useT } from '../i18n';
import type { ThoughtEdge } from '../types';

/**
 * Custom edge registered under the 'smoothstep' type name (overrides the
 * built-in, so edges persisted before this component existed pick it up
 * with no migration). Click an edge to select it — a delete button appears
 * at its midpoint, and Delete/Backspace removes it via App's key handler.
 */
export default function ThoughtEdgeView({
  id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
  style, markerEnd, markerStart, selected, pathOptions, interactionWidth,
}: EdgeProps<ThoughtEdge> & { pathOptions?: { borderRadius?: number; offset?: number } }) {
  const deleteEdges = useStore((s) => s.deleteEdges);
  const t = useT();
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
    borderRadius: pathOptions?.borderRadius,
    offset: pathOptions?.offset,
  });

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
            <button
              onClick={(e) => { e.stopPropagation(); deleteEdges([id]); }}
              className="w-6 h-6 rounded-full bg-card border border-line shadow-md flex items-center justify-center text-ink-faint hover:text-red-500 hover:border-red-300 transition-colors"
              title={t('canvas.deleteEdgeTitle')}
            >
              <X size={13} strokeWidth={2} />
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
