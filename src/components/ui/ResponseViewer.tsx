import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import { useStore } from '../../store';
import { useUiStore } from '../../lib/ui-store';
import { Markdown } from '../Markdown';
import ReasoningDisclosure from './ReasoningDisclosure';
import { useT } from '../../i18n';

// The answer, reading-size: the same large overlay the PDF reader uses,
// for one node's Q&A. A live VIEW of the canvas node (streams in place),
// read-only — editing and follow-ups stay on the card and the panel.

export default function ResponseViewer() {
  const nodeId = useUiStore((s) => s.responseViewerNodeId);
  const node = useStore((s) => (nodeId ? s.nodes.find((n) => n.id === nodeId) : undefined));
  const t = useT();
  const close = () => useUiStore.getState().setResponseViewerNodeId(null);

  useEffect(() => {
    if (!nodeId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [nodeId]);

  if (!nodeId || !node) return null;
  const data = node.data;
  const reasoning = data.reasonings?.[data.responseIndex];

  return createPortal((
    <div className="fixed inset-0 z-[75] bg-ink/25 backdrop-blur-[2px] flex items-center justify-center animate-fade-in" onClick={close} data-response-viewer>
      <div className="bg-surface rounded-2xl shadow-2xl border border-line w-[min(920px,92vw)] h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 px-6 py-4 border-b border-line bg-card shrink-0">
          <div className="flex-1 min-w-0 text-sm font-semibold text-ink leading-snug line-clamp-2">{data.question}</div>
          <button onClick={close} title={t('panel.close')} className="w-7 h-7 rounded-lg text-ink-faint hover:bg-wash hover:text-ink flex items-center justify-center transition-colors shrink-0">
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6">
          <div className="max-w-[760px] mx-auto">
            {reasoning && <ReasoningDisclosure text={reasoning} />}
            {data.isLoading && !data.response ? (
              data.reasoning ? (
                <div>
                  <div className="text-2xs text-ink-faint mb-1">💭 {t('node.reasoningLive')}</div>
                  <div className="text-xs text-ink-faint italic leading-relaxed whitespace-pre-wrap break-words">{data.reasoning}</div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-ink-muted py-10 justify-center">
                  <Loader2 size={16} strokeWidth={1.75} className="animate-spin text-accent" /> {t('common.thinking')}
                </div>
              )
            ) : (
              <div className="markdown-body text-[15px] text-ink leading-relaxed">
                <Markdown>{data.response}</Markdown>
                {data.isLoading && <span className="inline-block w-2 h-4 bg-accent animate-pulse rounded-sm ml-0.5" />}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  ), document.body);
}
