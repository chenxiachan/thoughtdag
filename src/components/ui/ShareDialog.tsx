import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, Copy, Eye, ImageDown, Mail, X } from 'lucide-react';
import { useUiStore } from '../../lib/ui-store';
import { useStore } from '../../store';
import { useI18n, useT } from '../../i18n';
import { exportGedankengangPoster } from '../../lib/poster';

// Share the read-only link: copy + hand-off buttons to the platforms with a
// web share intent. Platform names here are functional identifiers (the
// button literally opens that platform), not endorsements.

// Share intents choke on very long URLs well before browsers do — beyond
// this, only copy/download paths are reliable.
const INTENT_LIMIT = 4000;

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
  const tooLongForIntents = url.length > INTENT_LIMIT;
  const rootQuestion = useStore.getState().nodes.find((n) => n.data.isRoot)?.data.question ?? '';
  const text = rootQuestion ? rootQuestion.slice(0, 120) : 'ThoughtDAG';

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const targets = [
    { name: 'X', href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, intent: true },
    { name: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`, intent: true },
    { name: 'Email', href: `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(url)}`, intent: false, icon: true },
  ];

  return createPortal((
    <div className="fixed inset-0 z-[80] bg-ink/25 backdrop-blur-[2px] flex items-center justify-center animate-fade-in" onClick={close} data-share-dialog>
      <div className="bg-surface rounded-2xl shadow-2xl border border-line w-[min(480px,92vw)] p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-1">
          <div className="text-sm font-semibold text-ink flex items-center gap-2">
            <Eye size={15} strokeWidth={1.75} className="text-accent" /> {t('viewer.shareDialogTitle')}
          </div>
          <button onClick={close} className="w-7 h-7 rounded-lg text-ink-faint hover:bg-wash hover:text-ink flex items-center justify-center transition-colors">
            <X size={15} strokeWidth={1.75} />
          </button>
        </div>
        <p className="text-xs text-ink-muted mb-3">{t('viewer.shareNote')}</p>

        <div className="flex gap-1.5 mb-3">
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

        {tooLongForIntents && (
          <div className="mb-3 flex items-start gap-2 text-xs text-amber-700 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
            <AlertTriangle size={14} strokeWidth={1.75} className="shrink-0 mt-0.5" />
            {t('viewer.linkLongWarn')}
          </div>
        )}

        <div className="flex items-center gap-2">
          <span className="text-2xs text-ink-faint">{t('viewer.shareVia')}</span>
          {targets.map((s) => (
            <a
              key={s.name}
              href={tooLongForIntents && s.intent ? undefined : s.href}
              target="_blank"
              rel="noreferrer"
              aria-disabled={tooLongForIntents && s.intent}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${
                tooLongForIntents && s.intent
                  ? 'border-line text-ink-faint/50 cursor-not-allowed'
                  : 'border-line text-ink-muted hover:bg-wash hover:text-ink'
              }`}
              onClick={(e) => { if (tooLongForIntents && s.intent) e.preventDefault(); }}
            >
              {s.icon && <Mail size={13} strokeWidth={1.75} />}
              {s.name}
            </a>
          ))}
          <span className="flex-1" />
          {/* The picture path: a link is cold in a feed — the chronicle
              poster is the same canvas as something you can actually post. */}
          <button
            onClick={() => { setExporting(true); void exportGedankengangPoster(lang).finally(() => setExporting(false)); }}
            disabled={exporting}
            data-share-poster
            title={t('tlov.exportPosterTitle')}
            className="text-xs px-3 py-1.5 rounded-lg border border-line text-ink-muted hover:bg-wash hover:text-ink transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <ImageDown size={13} strokeWidth={1.75} />
            {exporting ? t('tlov.exportingPoster') : t('tlov.exportPoster')}
          </button>
        </div>
      </div>
    </div>
  ), document.body);
}
