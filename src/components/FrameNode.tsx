import { useState } from 'react';
import { NodeResizer, useStore as useRfStore, type NodeProps } from '@xyflow/react';
import { Link2, Link2Off, Trash2 } from 'lucide-react';
import type { ThoughtNode as ThoughtNodeType } from '../types';
import { useStore } from '../store';
import { isImeComposing } from '../utils';
import { FRAME_COLORS } from '../lib/constants';
import { useT } from '../i18n';

// Frame: a labeled background region — THE spatial annotation. No handles
// (it can never be wired, so it can never touch context), ignored by
// autoLayout, sits behind nodes (zIndex -1). Drag by the title bar; the
// title stays readable when zoomed out (same semantic-zoom trick as cards).
// Color is a FIXED palette (no picker): frames are pure navigation objects,
// so color is function, not decoration (palette lives in lib/constants).

export default function FrameNode({ id, data, selected }: NodeProps<ThoughtNodeType>) {
  const t = useT();
  const deleteNode = useStore((s) => s.deleteNode);
  const setSelectedNodeId = useStore((s) => s.setSelectedNodeId);
  // High-level info stays SCREEN-size constant: the whole title bar (name,
  // palette, carry toggle, delete) counter-scales against zoom-out, so region
  // names and their controls remain readable AND operable on the map.
  // Quantized to 0.1 steps so zooming doesn't re-render every frame.
  const barScale = useRfStore((s) => Math.min(5, Math.max(1, Math.round(10 / s.transform[2]) / 10)));

  const [editing, setEditing] = useState(!data.question);
  const [draft, setDraft] = useState(data.question);

  const color = FRAME_COLORS[data.frameColor ?? 'gray'] ?? FRAME_COLORS.gray;
  // Carry: dragging the frame moves the nodes inside it. Absent = linked
  // (legacy frames keep the behavior); new frames spawn unlinked so they can
  // be resized / positioned over their nodes first, then linked.
  const carry = data.frameCarry !== false;

  const patch = (p: Partial<ThoughtNodeType['data']>) => {
    useStore.setState((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...p } } : n)),
    }));
  };

  const commit = () => {
    setEditing(false);
    if (draft === data.question) return;
    useStore.getState().pushHistory();
    patch({ question: draft });
  };

  return (
    <div
      className={`relative w-full h-full rounded-2xl border-2 border-dashed flex flex-col transition-colors ${color.border} ${color.bg} ${
        selected ? 'ring-1 ring-accent/40' : ''
      }`}
      onClick={() => setSelectedNodeId(id)}
    >
      {/* Title bar — drag surface; counter-scaled width keeps it spanning the frame */}
      <div
        className="drag-handle cursor-grab active:cursor-grabbing px-4 py-2 flex items-center gap-2 min-w-0"
        style={barScale > 1 ? { transform: `scale(${barScale})`, transformOrigin: 'top left', width: `${100 / barScale}%` } : undefined}
      >
        {editing ? (
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if ((e.key === 'Enter' && !isImeComposing(e)) || e.key === 'Escape') commit(); }}
            placeholder={t('frame.titlePlaceholder')}
            autoFocus
            className="flex-1 min-w-24 bg-transparent text-sm font-semibold text-ink-muted focus:outline-none placeholder-ink-faint nodrag"
          />
        ) : (
          /* min-w floor: on a deep zoom-out the scaled controls must not squeeze
             the region name to nothing — the row overflows the frame edge
             instead (the title is the higher-value signal on the map) */
          <span
            onDoubleClick={() => { setDraft(data.question); setEditing(true); }}
            className={`flex-1 min-w-24 truncate font-semibold text-ink-muted/80 select-none text-xs ${barScale > 1 ? 'normal-case' : 'uppercase tracking-wider'}`}
            title={t('content.noteEditTitle')}
          >
            {data.question || <span className="text-ink-faint normal-case tracking-normal">{t('frame.titlePlaceholder')}</span>}
          </span>
        )}
        {/* Carry toggle — always visible: it changes what dragging does, and
            dragging doesn't require selecting first */}
        <button
          onClick={(e) => { e.stopPropagation(); useStore.getState().pushHistory(); patch({ frameCarry: !carry }); }}
          title={carry ? t('frame.carryOn') : t('frame.carryOff')}
          className={`rounded-full w-6 h-6 flex items-center justify-center transition-colors shrink-0 nodrag ${
            carry ? 'text-ink-muted hover:text-ink' : 'text-ink-faint/60 hover:text-ink-muted'
          }`}
        >
          {carry ? <Link2 size={13} strokeWidth={1.75} /> : <Link2Off size={13} strokeWidth={1.75} />}
        </button>
        {selected && (
          <>
            {/* fixed palette — color is wayfinding, not decoration; hidden on
                the deepest zoom, where the scaled row would spill over
                neighboring frames (recoloring is close-up work anyway) */}
            {barScale <= 2.5 && (
              <div className="flex items-center gap-1 shrink-0 nodrag">
                {Object.entries(FRAME_COLORS).map(([name, c]) => (
                  <button
                    key={name}
                    onClick={(e) => { e.stopPropagation(); patch({ frameColor: name }); }}
                    className={`w-3.5 h-3.5 rounded-full ${c.dot} transition-transform hover:scale-125 ${
                      (data.frameColor ?? 'gray') === name ? 'ring-2 ring-offset-1 ring-ink/40' : ''
                    }`}
                  />
                ))}
              </div>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); deleteNode(id); }}
              className="text-ink-faint hover:text-red-500 rounded-full w-6 h-6 flex items-center justify-center transition-colors shrink-0 nodrag"
            >
              <Trash2 size={13} strokeWidth={1.75} />
            </button>
          </>
        )}
      </div>
      {/* Body: just a region — clicks select the frame, nodes float above it */}
      <div className="flex-1 nodrag" />
      {/* Edge strips: the border is a drag handle too, so a large frame can be
          moved without reaching its title bar. Rendered BEFORE the resizer so
          the resizer's handles win when the frame is selected. */}
      <div className="drag-handle absolute inset-x-0 bottom-0 h-2.5 cursor-grab active:cursor-grabbing" />
      <div className="drag-handle absolute inset-y-0 left-0 w-2.5 cursor-grab active:cursor-grabbing" />
      <div className="drag-handle absolute inset-y-0 right-0 w-2.5 cursor-grab active:cursor-grabbing" />
      {/* resize handles: NO manual scaling — React Flow's autoScale already
          counter-scales them (Math.max(1/zoom, 1)), so they keep a constant
          screen size; scaling here again would compound to huge squares */}
      <NodeResizer isVisible={selected} minWidth={280} minHeight={180} lineClassName="!border-accent/40" handleClassName="!bg-accent !w-2.5 !h-2.5 !rounded-sm" />
    </div>
  );
}
