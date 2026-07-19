import { useEffect, useMemo, useState } from 'react';
import { History } from 'lucide-react';
import { useReactFlow, useStore as useRfStore } from '@xyflow/react';
import { useStore } from '../../store';
import { useUiStore } from '../../lib/ui-store';
import { useZoomTier } from '../../lib/use-map-mode';
import { useT } from '../../i18n';
import { collectTimeline } from '../../lib/timeline';

// The map's second axis. Space answers "where is it in the graph"; this rail
// answers "when did I think it". A vertical track under the content palette —
// time flows down, the same direction conversation chains flow on the canvas.
// Nodes line up by creation time inside a fixed-height scroll window, with
// date ticks where the sequence crosses midnight. Appears only at map /
// glyph tiers: zoomed in you are working, zoomed out you are searching.

export function TimelineBar() {
  const tier = useZoomTier();
  const nodes = useStore((s) => s.nodes);
  const setSelectedNodeId = useStore((s) => s.setSelectedNodeId);
  const setOverviewOpen = useUiStore((s) => s.setTimelineOverviewOpen);
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

  const entries = useMemo(() => collectTimeline(nodes, now), [nodes, now]);

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
  const fmtTime = (iso?: string) => (iso ? new Date(iso).toLocaleString() : '');
  const hovered = hover ? entries.find((e) => e.id === hover) : null;

  return (
    <div
      className="absolute left-4 top-[52%] z-10 tdag-timeline flex flex-col bg-card/90 backdrop-blur border border-line rounded-xl shadow-sm w-12"
      style={{ height: 'min(38vh, 420px)' }}
      data-timeline-bar
      role="navigation"
      aria-label={t('timeline.label')}
    >
      {hovered && (
        <div className="absolute left-full ml-2 top-2 max-w-[320px] bg-card border border-line rounded-lg shadow-md px-3 py-2 text-xs pointer-events-none z-20">
          <div className="font-medium text-ink truncate">{hovered.label || '…'}</div>
          {(hovered.createdAt || hovered.modifiedAt) && (
            <div className="text-ink-faint mt-0.5 whitespace-nowrap">
              {hovered.createdAt && <>{t('timeline.created')} {fmtTime(hovered.createdAt)}</>}
              {hovered.modifiedAt && hovered.modifiedAt !== hovered.createdAt && (
                <>{hovered.createdAt ? ' · ' : ''}{t('timeline.modified')} {fmtTime(hovered.modifiedAt)}</>
              )}
            </div>
          )}
        </div>
      )}
      <button
        onClick={() => setOverviewOpen(true)}
        title={t('timeline.openOverview')}
        data-timeline-overview-btn
        className="shrink-0 h-8 mx-1.5 mt-1.5 rounded-lg flex items-center justify-center text-ink-faint hover:text-accent hover:bg-accent/10 transition-colors"
      >
        <History size={15} strokeWidth={1.75} />
      </button>
      <div className="mx-2.5 border-t border-line shrink-0" />
      <div className="flex-1 min-h-0 overflow-y-auto tdag-timeline-scroll py-2">
        <div className="flex flex-col items-center gap-[7px]">
          {entries.map((e, i) => {
            const prevDay = i > 0 ? dayOf(entries[i - 1].createdAt) : '';
            const day = dayOf(e.createdAt);
            const newDay = day && day !== prevDay;
            return (
              <span key={e.id} className="flex flex-col items-center gap-[7px] shrink-0">
                {newDay && i > 0 && (
                  <span className="flex flex-col items-center gap-0.5 select-none">
                    <span className="w-5 h-px bg-line" />
                    <span className="text-[8px] leading-none text-ink-faint">{fmtDay(day)}</span>
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
                  className={`shrink-0 rounded-full transition-transform hover:scale-150 ${
                    e.recentlyEdited ? 'tdag-timeline-pulse' : ''
                  }`}
                  style={{
                    width: 8,
                    height: 8,
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
