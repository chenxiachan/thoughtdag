import { useState } from 'react';
import { NodeResizer, useStore as useRfStore, type NodeProps } from '@xyflow/react';
import { Trash2 } from 'lucide-react';
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
  const zoomedOut = useRfStore((s) => s.transform[2] < 0.55);
  // glyph tier: the frame title becomes the region name on the skeleton map
  const glyphTier = useRfStore((s) => s.transform[2] < 0.32);

  const [editing, setEditing] = useState(!data.question);
  const [draft, setDraft] = useState(data.question);

  const color = FRAME_COLORS[data.frameColor ?? 'gray'] ?? FRAME_COLORS.gray;

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
      className={`w-full h-full rounded-2xl border-2 border-dashed flex flex-col transition-colors ${color.border} ${color.bg} ${
        selected ? 'ring-1 ring-accent/40' : ''
      }`}
      onClick={() => setSelectedNodeId(id)}
    >
      {/* Title bar — the only drag surface */}
      <div className="drag-handle cursor-grab active:cursor-grabbing px-4 py-2 flex items-center gap-2 min-w-0">
        {editing ? (
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if ((e.key === 'Enter' && !isImeComposing(e)) || e.key === 'Escape') commit(); }}
            placeholder={t('frame.titlePlaceholder')}
            autoFocus
            className="flex-1 min-w-0 bg-transparent text-sm font-semibold text-ink-muted focus:outline-none placeholder-ink-faint nodrag"
          />
        ) : (
          <span
            onDoubleClick={() => { setDraft(data.question); setEditing(true); }}
            className={`flex-1 min-w-0 truncate font-semibold text-ink-muted/80 uppercase tracking-wider select-none ${glyphTier ? 'text-6xl normal-case tracking-normal' : zoomedOut ? 'text-3xl normal-case tracking-normal' : 'text-xs'}`}
            title={t('content.noteEditTitle')}
          >
            {data.question || <span className="text-ink-faint normal-case tracking-normal">{t('frame.titlePlaceholder')}</span>}
          </span>
        )}
        {selected && (
          <>
            {/* fixed palette — color is wayfinding, not decoration */}
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
      <NodeResizer isVisible={selected} minWidth={280} minHeight={180} lineClassName="!border-accent/40" handleClassName="!bg-accent !w-2.5 !h-2.5 !rounded-sm" />
    </div>
  );
}
