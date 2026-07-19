import { useEffect, useMemo, useState } from 'react';
import { History } from 'lucide-react';
import { useReactFlow, useStore as useRfStore } from '@xyflow/react';
import { useStore } from '../../store';
import { useUiStore } from '../../lib/ui-store';
import { useZoomTier } from '../../lib/use-map-mode';
import { useT } from '../../i18n';
import { collectTimeline } from '../../lib/timeline';

// The map's second axis. Space answers "where is it in the graph"; this rail
// answers "when did I think it". Not a floating panel — a bare ruler drawn
// onto the canvas itself: one hairline baseline, one horizontal tick per
// node (badge-colored, fisheye-swelling under the pointer), dates annotated
// beside the axis. It hangs under the content palette and yields to the
// zoom controls below via bottom-anchoring. Ticks in the current viewport
// run at full strength; the rest fade back. Appears only at map / glyph
// tiers: zoomed in you are working, zoomed out you are searching.

const TICK_W = 14;
/** Fisheye: the hovered tick swells, neighbours ripple down by distance. */
const tickWidth = (i: number, hoverIdx: number | null) => {
  if (hoverIdx == null) return TICK_W;
  const d = Math.abs(i - hoverIdx);
  return d === 0 ? 28 : d === 1 ? 21 : d === 2 ? 17 : TICK_W;
};

export function TimelineBar() {
  const tier = useZoomTier();
  const nodes = useStore((s) => s.nodes);
  const setSelectedNodeId = useStore((s) => s.setSelectedNodeId);
  const setOverviewOpen = useUiStore((s) => s.setTimelineOverviewOpen);
  const rf = useReactFlow();
  const t = useT();
  const [hover, setHover] = useState<{ id: string; idx: number; y: number } | null>(null);
  // Clock for the "recently edited" glow — a state tick keeps the memo pure
  // and lets stale glows actually fade out during long sessions.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  // Live viewport rectangle (world coords) → which ticks run at full strength.
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
  const hovered = hover ? entries.find((e) => e.id === hover.id) : null;

  return (
    // bottom-36 keeps the rail clear of the React Flow zoom controls in the
    // bottom-left corner at any viewport height. pointer-events pass through
    // everywhere except the ticks and the button themselves.
    <div
      className="absolute left-[2px] top-[52%] bottom-36 w-[76px] z-10 tdag-timeline pointer-events-none"
      data-timeline-bar
      role="navigation"
      aria-label={t('timeline.label')}
    >
      {hovered && hover && (
        <div
          className="fixed left-[86px] max-w-[320px] bg-card border border-line rounded-lg shadow-md px-3 py-2 text-xs pointer-events-none z-20"
          style={{ top: hover.y - 14 }}
        >
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
        className="pointer-events-auto absolute top-0 left-[24px] w-7 h-7 rounded-lg flex items-center justify-center text-ink-faint/70 hover:text-accent hover:bg-accent/10 transition-colors"
      >
        <History size={14} strokeWidth={1.75} />
      </button>
      {/* the axis itself: a hairline through the tick centers */}
      <div className="absolute left-[37px] top-8 bottom-0 w-px bg-line/70" />
      <div className="pointer-events-auto absolute top-8 bottom-0 inset-x-0 overflow-y-auto tdag-noscrollbar">
        <div className="flex flex-col items-center gap-[6px] py-1.5">
          {entries.map((e, i) => {
            const prevDay = i > 0 ? dayOf(entries[i - 1].createdAt) : '';
            const day = dayOf(e.createdAt);
            const newDay = day !== '' && day !== prevDay;
            return (
              <span key={e.id} className="relative flex justify-center w-full shrink-0">
                {newDay && (
                  <span className="absolute left-[calc(50%+18px)] top-1/2 -translate-y-1/2 text-[8px] leading-none text-ink-faint select-none whitespace-nowrap">
                    {fmtDay(day)}
                  </span>
                )}
                <button
                  data-timeline-dot={e.id}
                  onMouseEnter={(ev) => setHover({ id: e.id, idx: i, y: ev.currentTarget.getBoundingClientRect().top })}
                  onMouseLeave={() => setHover((h) => (h?.id === e.id ? null : h))}
                  onClick={() => {
                    setSelectedNodeId(e.id);
                    rf.setCenter(e.x + 260, e.y + 110, { zoom: 1, duration: 350 });
                  }}
                  className={`shrink-0 rounded-full ${e.recentlyEdited ? 'tdag-timeline-pulse' : ''}`}
                  style={{
                    width: tickWidth(i, hover?.idx ?? null),
                    height: 3,
                    background: e.color,
                    opacity: e.archived ? 0.3 : inView.has(e.id) ? 1 : 0.45,
                    transition: 'width .18s ease, opacity .3s ease',
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
