import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { History, ImageDown, Sparkles, X } from 'lucide-react';
import { useStore } from '../../store';
import { useUiStore } from '../../lib/ui-store';
import { useDateLocale, useI18n, useT, fmt } from '../../i18n';
import { collectTimeline } from '../../lib/timeline';
import { generateGedankengang, getCached, graphFingerprint, type Gedankengang } from '../../lib/gedankengang';
import { exportGedankengangPoster } from '../../lib/poster';

// The third overview, after highlights and materials: the canvas as a
// chronicle. Every node in creation order, grouped by day, each row carrying
// its takeaway (or question), both timestamps, and a locate chip. The rail
// under the palette is for jumping while zoomed out; this is for reading the
// journey itself.

export default function TimelineOverviewModal({ onLocate }: { onLocate: (nodeId: string) => void }) {
  const open = useUiStore((s) => s.timelineOverviewOpen);
  const setOpen = useUiStore((s) => s.setTimelineOverviewOpen);
  const nodes = useStore((s) => s.nodes);
  const t = useT();
  const dateLocale = useDateLocale();
  // The modal never renders the recent-edit glow, so the clock is moot: 0.
  const entries = useMemo(() => collectTimeline(nodes, 0), [nodes]);
  // The journey paragraph: session-cached by graph fingerprint, so reopening
  // is free until the map actually changes.
  const fp = useMemo(() => graphFingerprint(nodes), [nodes]);
  const [ged, setGed] = useState<Gedankengang | null>(null);
  const [gedLoading, setGedLoading] = useState(false);
  const [gedFailed, setGedFailed] = useState(false);
  const shown = ged ?? getCached(fp) ?? null;
  const stale = !!shown && shown.fp !== fp;
  const writeJourney = () => {
    setGedLoading(true);
    setGedFailed(false);
    const { nodes: ns, edges: es } = useStore.getState();
    generateGedankengang(ns, es)
      .then(setGed)
      .catch(() => setGedFailed(true))
      .finally(() => setGedLoading(false));
  };

  // The poster IS this overview, printable: journey paragraph + the badge
  // chronicle on manuscript paper. Missing journey? It writes one first —
  // and shows it here too, via the hook.
  const lang = useI18n((s) => s.lang);
  const [exporting, setExporting] = useState(false);
  const exportPoster = () => {
    setExporting(true);
    exportGedankengangPoster(lang, { onJourney: setGed }).finally(() => setExporting(false));
  };

  if (!open) return null;

  const close = () => setOpen(false);
  const dayOf = (iso?: string) => (iso ? iso.slice(0, 10) : '');
  const fmtClock = (iso?: string) =>
    iso ? new Date(iso).toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' }) : '—';

  return createPortal((
    <div className="fixed inset-0 z-[60] bg-ink/30 backdrop-blur-sm flex items-center justify-center p-6" onClick={close}>
      <div className="bg-card rounded-2xl shadow-2xl border border-line w-[640px] max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 py-3 border-b border-line shrink-0">
          <History size={15} strokeWidth={1.75} className="text-accent" />
          <span className="text-sm font-semibold text-ink">{t('tlov.title')}</span>
          <span className="text-2xs text-ink-faint">{fmt(t('tlov.count'), { n: entries.length })}</span>
          <div className="flex-1" />
          <button
            onClick={exportPoster}
            disabled={exporting || entries.length === 0}
            data-poster-export
            title={t('tlov.exportPosterTitle')}
            className="flex items-center gap-1.5 text-2xs text-ink-muted hover:text-accent hover:bg-accent/10 rounded-full px-2.5 py-1 transition-colors disabled:opacity-50"
          >
            <ImageDown size={13} strokeWidth={1.75} />
            {exporting ? t('tlov.exportingPoster') : t('tlov.exportPoster')}
          </button>
          <button onClick={close} className="text-ink-faint hover:text-ink w-7 h-7 rounded-lg hover:bg-wash flex items-center justify-center transition-colors">
            <X size={15} strokeWidth={1.75} />
          </button>
        </div>

        <div className="px-5 pt-3 shrink-0" data-gedankengang>
          {!shown && !gedLoading && (
            <button
              onClick={writeJourney}
              className="flex items-center gap-1.5 text-2xs text-accent bg-accent/10 hover:bg-accent/20 rounded-full px-3 py-1.5 transition-colors"
            >
              <Sparkles size={12} strokeWidth={1.75} />
              {t('tlov.gedankenGenerate')}
            </button>
          )}
          {gedLoading && (
            <p className="text-2xs text-ink-faint italic py-1.5">{t('tlov.gedankenLoading')}</p>
          )}
          {gedFailed && !gedLoading && (
            <p className="text-2xs text-red-500 py-1">{t('tlov.gedankenFailed')}</p>
          )}
          {shown && !gedLoading && (
            <div className={`rounded-xl bg-wash px-4 py-3 ${stale ? 'opacity-60' : ''}`}>
              <p className="text-sm text-ink leading-relaxed">{shown.text}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-2xs text-ink-faint">
                  {stale ? t('tlov.gedankenStale') : new Date(shown.at).toLocaleString(dateLocale)}
                </span>
                {stale && (
                  <button onClick={writeJourney} className="text-2xs text-accent hover:underline">
                    {t('tlov.gedankenRedo')}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3" data-timeline-overview>
          {entries.length === 0 && <p className="text-xs text-ink-faint italic py-2">{t('tlov.empty')}</p>}
          {entries.map((e, i) => {
            const prevDay = i > 0 ? dayOf(entries[i - 1].createdAt) : undefined;
            const day = dayOf(e.createdAt);
            const newDay = i === 0 || day !== prevDay;
            return (
              <div key={e.id}>
                {newDay && (
                  <div className="sticky top-0 bg-card text-2xs text-ink-faint font-medium pt-3 pb-1 first:pt-0">
                    {day || t('tlov.undated')}
                  </div>
                )}
                <div className="group flex items-center gap-2.5 py-1.5 border-b border-line/50 last:border-0">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: e.color, opacity: e.archived ? 0.35 : 1 }}
                  />
                  <span className="text-2xs font-mono text-ink-faint shrink-0 w-11">{fmtClock(e.createdAt)}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${e.archived ? 'text-ink-faint line-through' : e.badged ? 'text-ink' : 'text-ink-muted'}`}>
                      {e.topic && <span className="font-medium text-accent">{e.topic} · </span>}
                      {e.label || '…'}
                    </p>
                    {e.modifiedAt && e.modifiedAt !== e.createdAt && (
                      <p className="text-2xs text-ink-faint">{t('timeline.modified')} {new Date(e.modifiedAt).toLocaleString(dateLocale)}</p>
                    )}
                  </div>
                  <button
                    className="shrink-0 text-2xs font-mono text-accent bg-accent/10 hover:bg-accent/20 rounded-full px-1.5 py-0.5 transition-colors opacity-0 group-hover:opacity-100"
                    onClick={() => { close(); onLocate(e.id); }}
                    title={t('hlov.locateTitle')}
                  >
                    {t('tlov.locate')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  ), document.body);
}
