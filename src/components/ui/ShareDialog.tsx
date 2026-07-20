import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Eye, ImageDown, X } from 'lucide-react';
import { useUiStore } from '../../lib/ui-store';
import { useI18n, useT } from '../../i18n';
import { exportGedankengangPoster } from '../../lib/poster';

// Two jobs, two lanes. LANE 1: the read-only canvas link — it CARRIES the
// whole graph, so it is long by design; the right channels are the ones
// tolerant of long URLs (chat, mail, docs), and the right control is Copy.
// LANE 2: posting to social feeds — share intents truncate long URLs, so
// the buttons carry the REPO link (permanent, survives any domain move,
// unfurls into a preview card) and sit beside the poster export: on a feed,
// the picture does the talking and the link does the pointing. Platform
// names are functional identifiers (each button opens that platform).

// The link follows the UI language: a zh share lands the reader on the
// Chinese README, an en share on the repo front page. GitHub's social
// preview image covers both, so the unfurl card stays identical.
const REPO_URL = {
  en: 'https://github.com/chenxiachan/thoughtdag',
  zh: 'https://github.com/chenxiachan/thoughtdag/blob/main/README_ZH.md',
};

export default function ShareDialog() {
  const url = useUiStore((s) => s.shareDialogUrl);
  const t = useT();
  const lang = useI18n((s) => s.lang);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const close = () => useUiStore.getState().setShareDialogUrl(null);

  useEffect(() => {
    if (!url) return;
    setCopied(false);
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [url]);

  if (!url) return null;

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const socialText = lang === 'zh' ? 'ThoughtDAG — 思考值得一张地图' : 'ThoughtDAG — your thinking deserves a map';
  const repo = REPO_URL[lang];
  const targets = [
    { name: 'X', href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(socialText)}&url=${encodeURIComponent(repo)}` },
    { name: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(repo)}` },
  ];

  return createPortal((
    <div className="fixed inset-0 z-[80] bg-ink/25 backdrop-blur-[2px] flex items-center justify-center animate-fade-in" onClick={close} data-share-dialog>
      <div className="bg-surface rounded-2xl shadow-2xl border border-line w-[min(480px,92vw)] p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3">
          <div className="text-sm font-semibold text-ink flex items-center gap-2">
            <Eye size={15} strokeWidth={1.75} className="text-accent" /> {t('viewer.shareDialogTitle')}
          </div>
          <button onClick={close} className="w-7 h-7 rounded-lg text-ink-faint hover:bg-wash hover:text-ink flex items-center justify-center transition-colors">
            <X size={15} strokeWidth={1.75} />
          </button>
        </div>

        {/* Lane 1: hand the graph to someone who will open it */}
        <div className="text-2xs font-semibold text-accent mb-1">{t('share.directLane')}</div>
        <p className="text-xs text-ink-muted mb-2">{t('share.directNote')}</p>
        <div className="flex gap-1.5 mb-4">
          <input
            readOnly
            value={url}
            onFocus={(e) => e.target.select()}
            className="flex-1 min-w-0 text-xs font-mono text-ink-muted bg-wash border border-line rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent/40 truncate"
          />
          <button
            onClick={() => void copy()}
            className={`shrink-0 text-xs px-3 py-2 rounded-lg flex items-center gap-1.5 transition-colors ${
              copied ? 'bg-green-600 text-white' : 'bg-accent text-white hover:bg-accent-strong'
            }`}
            data-share-copy
          >
            {copied ? <Check size={13} strokeWidth={2} /> : <Copy size={13} strokeWidth={1.75} />}
            {copied ? t('viewer.copied') : t('viewer.copyLink')}
          </button>
        </div>

        {/* Lane 2: post to a feed — picture + permanent repo link */}
        <div className="border-t border-line pt-3">
          <div className="text-2xs font-semibold text-accent mb-1">{t('share.socialLane')}</div>
          <p className="text-xs text-ink-muted mb-2">{t('share.socialNote')}</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setExporting(true); void exportGedankengangPoster(lang).finally(() => setExporting(false)); }}
              disabled={exporting}
              data-share-poster
              title={t('tlov.exportPosterTitle')}
              className="text-xs px-3 py-1.5 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <ImageDown size={13} strokeWidth={1.75} />
              {exporting ? t('tlov.exportingPoster') : t('tlov.exportPoster')}
            </button>
            {targets.map((s) => (
              <a
                key={s.name}
                href={s.href}
                target="_blank"
                rel="noreferrer"
                className="text-xs px-3 py-1.5 rounded-lg border border-line text-ink-muted hover:bg-wash hover:text-ink transition-colors"
              >
                {s.name}
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  ), document.body);
}
