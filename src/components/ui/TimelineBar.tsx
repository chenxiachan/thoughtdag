import { useEffect, useMemo, useState } from 'react';
import { useReactFlow, useStore as useRfStore } from '@xyflow/react';
import { useStore } from '../../store';
import { useZoomTier } from '../../lib/use-map-mode';
import { useT } from '../../i18n';
import type { ThoughtData } from '../../types';

// The map's second axis. Space answers "where is it in the graph"; this bar
// answers "when did I think it". Nodes line up by creation time (immutable —
// the moment you remember is the moment it was born, and regeneration must
// not teleport a point), evenly spaced (navigation wants order, not gaps),
// with date ticks where the sequence crosses midnight. Appears only at map /
// glyph tiers: zoomed in you are working, zoomed out you are searching.

const DOT_COLOR: Record<string, string> = {
  ruleout: '#ef4444',
  decision: '#6B5CE7',
  pivot: '#e8890c',
  open: '#d97706',
  insight: '#0284c7',
};

type Entry = {
  id: string;
  label: string;
  createdAt?: string;
  modifiedAt?: string;
  color: string;
  archived: boolean;
  recentlyEdited: boolean;
  x: number;
  y: number;
};

const last = (arr?: (string | undefined)[]) => {
  if (!arr) return undefined;
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i]) return arr[i];
  return undefined;
};

export function TimelineBar() {
  const tier = useZoomTier();
  const nodes = useStore((s) => s.nodes);
  const setSelectedNodeId = useStore((s) => s.setSelectedNodeId);
  const rf = useReactFlow();
  const t = useT();
  const [hover, setHover] = useState<string | null>(null);
  // Clock for the "recently edited" glow — a state tick keeps the memo pure
  // and lets stale glows actually fade out during long sessions.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  // Live viewport rectangle (world coords) → which dots get the "in view" ring.
  const transform = useRfStore((s) => s.transform);
  const vw = useRfStore((s) => s.width);
  const vh = useRfStore((s) => s.height);

  const entries = useMemo<Entry[]>(() => {
    const list = nodes
      .filter((n) => {
        const d = n.data as ThoughtData;
        return d.stepKind !== 'frame';
      })
      .map((n) => {
        const d = n.data as ThoughtData;
        const createdAt = d.createdAt ?? d.askedAt ?? d.generatedAts?.[0] ?? d.lastGeneratedAt;
        const modifiedAt = [d.askedAt, last(d.generatedAts), last(d.editedAts)]
          .filter(Boolean)
          .sort()
          .pop() as string | undefined;
        const type = d.summaryTypes?.[d.responseIndex ?? 0] ?? undefined;
        const summary = d.summaries?.[d.responseIndex ?? 0];
        const created = createdAt ? Date.parse(createdAt) : NaN;
        const modified = modifiedAt ? Date.parse(modifiedAt) : NaN;
        return {
          id: n.id,
          label: (summary || d.question || '').slice(0, 60),
          createdAt,
          modifiedAt,
          color: (type && DOT_COLOR[type]) || '#b8b3c7',
          archived: !!d.archived,
          // Second-order signal: touched noticeably after birth, and recently.
          recentlyEdited:
            !isNaN(created) && !isNaN(modified) && modified - created > 60_000 && now - modified < 30 * 60_000,
          x: n.position.x,
          y: n.position.y,
        };
      });
    // Stable sort: undated nodes keep graph order at the head of the track.
    return list
      .map((e, i) => ({ e, i }))
      .sort((a, b) => {
        const ka = a.e.createdAt ?? '';
        const kb = b.e.createdAt ?? '';
        return ka < kb ? -1 : ka > kb ? 1 : a.i - b.i;
      })
      .map(({ e }) => e);
  }, [nodes, now]);

  const inView = useMemo(() => {
    const [tx, ty, z] = transform;
    const x0 = -tx / z, y0 = -ty / z, x1 = (vw - tx) / z, y1 = (vh - ty) / z;
    const s = new Set<string>();
    for (const e of entries) {
      if (e.x + 520 > x0 && e.x < x1 && e.y + 220 > y0 && e.y < y1) s.add(e.id);
    }
    return s;
  }, [entries, transform, vw, vh]);

  if (tier === 'work' || entries.length < 2) return null;

  const dayOf = (iso?: string) => (iso ? iso.slice(0, 10) : '');
  const fmtDay = (iso: string) => iso.slice(5).replace('-', '/');
  const fmtTime = (iso?: string) => (iso ? new Date(iso).toLocaleString() : '—');
  const hovered = hover ? entries.find((e) => e.id === hover) : null;

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 tdag-timeline" data-timeline-bar>
      {hovered && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 max-w-[340px] bg-card border border-line rounded-lg shadow-md px-3 py-2 text-xs pointer-events-none whitespace-nowrap overflow-hidden text-ellipsis">
          <div className="font-medium text-ink truncate">{hovered.label || '…'}</div>
          {(hovered.createdAt || hovered.modifiedAt) && (
            <div className="text-ink-faint mt-0.5">
              {hovered.createdAt && <>{t('timeline.created')} {fmtTime(hovered.createdAt)}</>}
              {hovered.modifiedAt && hovered.modifiedAt !== hovered.createdAt && (
                <>{hovered.createdAt ? ' · ' : ''}{t('timeline.modified')} {fmtTime(hovered.modifiedAt)}</>
              )}
            </div>
          )}
        </div>
      )}
      <div
        className="flex items-center bg-card/90 backdrop-blur border border-line rounded-full shadow-sm px-4 h-9 max-w-[72vw]"
        role="navigation"
        aria-label={t('timeline.label')}
      >
        <div className="flex items-center justify-between gap-[5px] min-w-[180px]">
          {entries.map((e, i) => {
            const prevDay = i > 0 ? dayOf(entries[i - 1].createdAt) : '';
            const day = dayOf(e.createdAt);
            const newDay = day && day !== prevDay;
            return (
              <span key={e.id} className="flex items-center gap-[5px] shrink min-w-0">
                {newDay && i > 0 && (
                  <span className="flex items-center gap-1 shrink-0 text-[9px] text-ink-faint select-none">
                    <span className="w-px h-3.5 bg-line" />
                    {fmtDay(day)}
                  </span>
                )}
                <button
                  data-timeline-dot={e.id}
                  onMouseEnter={() => setHover(e.id)}
                  onMouseLeave={() => setHover((h) => (h === e.id ? null : h))}
                  onClick={() => {
                    setSelectedNodeId(e.id);
                    rf.setCenter(e.x + 260, e.y + 110, { zoom: 1, duration: 350 });
                  }}
                  className={`shrink rounded-full transition-transform hover:scale-150 ${
                    e.recentlyEdited ? 'tdag-timeline-pulse' : ''
                  }`}
                  style={{
                    width: 8,
                    height: 8,
                    minWidth: 4,
                    background: e.color,
                    opacity: e.archived ? 0.35 : 1,
                    boxShadow: inView.has(e.id) ? '0 0 0 2.5px rgba(107,92,231,.35)' : undefined,
                  }}
                  aria-label={e.label}
                />
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
