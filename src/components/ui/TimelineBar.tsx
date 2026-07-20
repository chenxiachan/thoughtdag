import { useEffect, useMemo, useState } from 'react';
import { History } from 'lucide-react';
import { useReactFlow, useStore as useRfStore } from '@xyflow/react';
import { useStore } from '../../store';
import { useUiStore } from '../../lib/ui-store';
import { useZoomTier } from '../../lib/use-map-mode';
import { useDateLocale, useT } from '../../i18n';
import { collectTimeline } from '../../lib/timeline';
import { PANEL_INSET } from '../../lib/constants';
import type { ThoughtData } from '../../types';

// The map's second axis. Space answers "where is it in the graph"; this rail
// answers "when did I think it". Not a floating panel — a bare ruler drawn
// onto the canvas itself: one hairline baseline, one horizontal tick per
// node (badge-colored, fisheye-swelling under the pointer), dates annotated
// beside the axis. It hangs under the content palette and yields to the
// zoom controls below via bottom-anchoring. Ticks in the current viewport
// run at full strength; the rest fade back. Appears only at map / glyph
// tiers: zoomed in you are working, zoomed out you are searching.

/** Screen pixels the focus panel will occupy on the right once this node is
    selected — 0 when the panel mode is off or the node is canvas material
    (content nodes never open the panel). */
function panelShift(nodeId: string): number {
  const ui = useUiStore.getState();
  if (!ui.panelOpen) return 0;
  const kind = (useStore.getState().nodes.find((n) => n.id === nodeId)?.data as ThoughtData | undefined)?.stepKind;
  if (kind === 'note' || kind === 'file' || kind === 'link' || kind === 'frame') return 0;
  return ui.panelWidth + PANEL_INSET + 12;
}

/** Landmarks (badged turns) rest longer than plain waypoints — the rail
    thins the same way the map does. */
const restWidth = (badged: boolean) => (badged ? 24 : 16);
/** Fisheye: the hovered tick swells, neighbours ripple down by distance. */
const tickWidth = (i: number, hoverIdx: number | null, badged: boolean) => {
  const rest = restWidth(badged);
  if (hoverIdx == null) return rest;
  const d = Math.abs(i - hoverIdx);
  return d === 0 ? rest + 14 : d === 1 ? rest + 7 : d === 2 ? rest + 3 : rest;
};

export function TimelineBar() {
  const tier = useZoomTier();
  const nodes = useStore((s) => s.nodes);
  const setSelectedNodeId = useStore((s) => s.setSelectedNodeId);
  const setOverviewOpen = useUiStore((s) => s.setTimelineOverviewOpen);
  const rf = useReactFlow();
  const t = useT();
  const dateLocale = useDateLocale();
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
  const fmtTime = (iso?: string) => (iso ? new Date(iso).toLocaleString(dateLocale) : '');
  const hovered = hover ? entries.find((e) => e.id === hover.id) : null;

  return (
    // One left-side axis group with the content palette: the rail hangs just
    // under it, sized to its content (capped at 240px, then it scrolls), and
    // everything — History button, resting ticks — centers on the palette's
    // own centerline (x≈41px). pointer-events pass through except the rows
    // and the button themselves.
    <div
      className="absolute left-[2px] top-[calc(38%+116px)] w-[100px] z-10 tdag-timeline pointer-events-none flex flex-col items-stretch"
      data-timeline-bar
      role="navigation"
      aria-label={t('timeline.label')}
    >
      {hovered && hover && (
        <div
          className="fixed left-[108px] max-w-[320px] bg-card border border-line rounded-lg shadow-md px-3 py-2 text-xs pointer-events-none z-20"
          style={{ top: hover.y - 14 }}
        >
          <div className="font-medium text-ink truncate">
            {hovered.topic && <span className="text-accent">{hovered.topic} · </span>}
            {hovered.label || '…'}
          </div>
          {hovered.createdAt && (
            <div className="text-ink-faint mt-0.5">{t('timeline.created')} {fmtTime(hovered.createdAt)}</div>
          )}
          {hovered.modifiedAt && hovered.modifiedAt !== hovered.createdAt && (
            <div className="text-ink-faint">{t('timeline.modified')} {fmtTime(hovered.modifiedAt)}</div>
          )}
          <div className="text-[10px] text-ink-faint/80 mt-1">{t('timeline.clickHint')}</div>
        </div>
      )}
      <button
        onClick={() => setOverviewOpen(true)}
        title={t('timeline.openOverview')}
        data-timeline-overview-btn
        className="pointer-events-auto self-start ml-[25px] w-7 h-7 rounded-lg flex items-center justify-center text-ink-faint/70 hover:text-accent hover:bg-accent/10 transition-colors"
      >
        <History size={14} strokeWidth={1.75} />
      </button>
      <div className="pointer-events-auto overflow-y-auto tdag-noscrollbar max-h-[170px] mt-0.5">
        <div className="flex flex-col py-1">
          {entries.map((e, i) => {
            const prevDay = i > 0 ? dayOf(entries[i - 1].createdAt) : '';
            const day = dayOf(e.createdAt);
            const newDay = day !== '' && day !== prevDay;
            return (
              // Each row is a full-width, gap-free hit area — the pointer
              // never falls between ticks. The tick itself is the visual
              // child, left-anchored, swelling rightward under the fisheye.
              <button
                key={e.id}
                data-timeline-dot={e.id}
                onMouseEnter={(ev) => setHover({ id: e.id, idx: i, y: ev.currentTarget.getBoundingClientRect().top })}
                onMouseLeave={() => setHover((h) => (h?.id === e.id ? null : h))}
                // Single click = pinpoint: pan the node into view at the
                // CURRENT zoom, so the rail survives and a miss costs one
                // more click. Double click = commit: fly into the card tier.
                // Either way the target is the center of the VISIBLE canvas:
                // selecting a Q&A node opens the focus panel on the right,
                // so the world target shifts right by half the panel width
                // (in world units) to land the node beside it, not under it.
                onClick={() => {
                  setSelectedNodeId(e.id);
                  const zoom = rf.getViewport().zoom;
                  rf.setCenter(e.x + 260 + panelShift(e.id) / (2 * zoom), e.y + 110, { zoom, duration: 300 });
                }}
                onDoubleClick={() => {
                  setSelectedNodeId(e.id);
                  rf.setCenter(e.x + 260 + panelShift(e.id) / 2, e.y + 110, { zoom: 1, duration: 350 });
                }}
                className="relative flex items-center w-full h-[14px] shrink-0 pl-[29px] cursor-pointer"
                aria-label={e.label}
              >
                <span
                  className={`rounded-full ${e.recentlyEdited ? 'tdag-timeline-pulse' : ''}`}
                  style={{
                    width: tickWidth(i, hover?.idx ?? null, e.badged),
                    height: 4,
                    background: e.color,
                    opacity: e.archived ? 0.3 : inView.has(e.id) ? 1 : 0.45,
                    transition: 'width .18s ease, opacity .3s ease',
                  }}
                />
                {newDay && (
                  <span className="absolute left-[67px] top-1/2 -translate-y-1/2 text-[10px] leading-none text-ink-faint select-none whitespace-nowrap">
                    {fmtDay(day)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
