import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Folder, FolderOpen, Loader2, RefreshCw, SquareTerminal, Import, X, Inbox } from 'lucide-react';
import { scanSessions, groupByCwd, type SessionCard, type AtlasGroup } from '../lib/atlas/discover';
import { useProjects, switchProject } from '../store/projects';
import { useT, t as ti, fmt } from '../i18n';
import { toast } from '../lib/ui-store';

// The session atlas: the external world's view. Project folders on the
// left are cwd groups discovered across ALL runner stores — one folder can
// hold sessions from different CLIs, which is the whole point: the canvas
// is where their knowledge meets. "My canvases" is the separate, native
// region — hand-made canvases belong to no folder.
// Desktop-only surface: it exists exactly where the fenced fs bridge does.

const dateLabel = (ms: number) => new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const sizeLabel = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export default function SessionAtlas({ onClose, onSwitched }: { onClose: () => void; onSwitched: () => void }) {
  const t = useT();
  const projects = useProjects((s) => s.projects);
  const [cards, setCards] = useState<SessionCard[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [selected, setSelected] = useState<string | 'canvases' | null>(null); // group cwd key, or the native region
  const [busyRel, setBusyRel] = useState<string | null>(null);

  const refresh = async () => {
    setScanning(true);
    try { setCards(await scanSessions()); } finally { setScanning(false); }
  };
  useEffect(() => { void refresh(); }, []);

  const groups = useMemo(() => groupByCwd(cards ?? []), [cards]);
  const activeGroup: AtlasGroup | null = selected === 'canvases' ? null : groups.find((g) => (g.cwd ?? '') === (selected ?? groups[0]?.cwd ?? '')) ?? groups[0] ?? null;

  const importCard = async (card: SessionCard) => {
    if (busyRel) return;
    setBusyRel(card.rel);
    try {
      const text = await window.desktopSessions!.read(card.rootKey, card.rel);
      const { anyRunnerSessionConversation } = await import('../lib/adapters');
      const conv = await anyRunnerSessionConversation(text);
      if (!conv) throw new Error(ti('handoff.notASession'));
      const { importChatConversations } = await import('../lib/export');
      await importChatConversations([conv]);
      onClose();
      onSwitched();
    } catch (err) {
      toast('error', fmt(ti('atlas.parseFailed'), { msg: err instanceof Error ? err.message : String(err) }));
    } finally {
      setBusyRel(null);
    }
  };

  const openInCli = async (card: SessionCard) => {
    const r = await window.desktopSessions!.openInCli(card.runner, card.cwd, card.sessionId).catch(() => ({ opened: false, command: '' }));
    if (r.opened) toast('success', ti('atlas.opened'));
    else if (r.command) {
      await navigator.clipboard.writeText(r.command).catch(() => {});
      toast('info', ti('atlas.cmdCopied'), 9000);
    }
  };

  // Portal to body: the switcher that opens us lives in a z-20 stacking
  // context, which would clamp this overlay UNDER the focus panel — the
  // atlas must veil the whole canvas, side panel included.
  return createPortal(
    <div className="fixed inset-0 z-50 bg-ink/30 backdrop-blur-sm flex items-center justify-center p-6" data-session-atlas>
      <div className="bg-surface border border-line rounded-2xl shadow-2xl w-full max-w-[980px] h-[min(680px,90vh)] flex flex-col overflow-hidden">
        <div className="flex items-start gap-3 px-5 pt-4 pb-3 border-b border-line">
          <div className="flex-1 min-w-0">
            <div className="text-base font-semibold text-ink">{t('atlas.title')}</div>
            <div className="text-xs text-ink-muted mt-0.5">{t('atlas.subtitle')}</div>
          </div>
          <button
            onClick={() => void refresh()}
            disabled={scanning}
            className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink border border-line rounded-lg px-2.5 py-1.5 hover:bg-wash transition-colors disabled:opacity-60"
            data-atlas-refresh
          >
            {scanning ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} strokeWidth={1.75} />}
            {scanning ? t('atlas.scanning') : t('atlas.refresh')}
          </button>
          <button onClick={onClose} className="text-ink-faint hover:text-ink p-1.5 rounded-lg hover:bg-wash transition-colors" data-atlas-close>
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex-1 flex min-h-0">
          {/* left: folders + the native region */}
          <div className="w-[260px] border-r border-line overflow-y-auto py-2 shrink-0">
            <div className="px-4 py-1 text-2xs uppercase tracking-wide text-ink-faint">{t('atlas.folders')}</div>
            {cards === null && (
              <div className="px-4 py-2 text-sm text-ink-faint flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> {t('atlas.scanning')}</div>
            )}
            {cards !== null && groups.length === 0 && (
              <div className="px-4 py-2 text-xs text-ink-faint">{t('atlas.empty')}</div>
            )}
            {groups.map((g) => {
              const key = g.cwd ?? '';
              const isActive = selected !== 'canvases' && activeGroup === g;
              return (
                <button
                  key={key}
                  onClick={() => setSelected(key)}
                  className={`w-full text-left px-4 py-2 flex items-center gap-2 transition-colors ${isActive ? 'bg-accent/5 text-accent' : 'text-ink hover:bg-wash'}`}
                  data-atlas-folder={g.name || 'unfiled'}
                >
                  {isActive ? <FolderOpen size={15} strokeWidth={1.75} className="shrink-0" /> : <Folder size={15} strokeWidth={1.75} className="shrink-0 text-ink-faint" />}
                  <span className="flex-1 truncate text-sm">{g.name || t('atlas.unfiled')}</span>
                  <span className="text-2xs text-ink-faint shrink-0">{g.cards.length}</span>
                </button>
              );
            })}
            <div className="border-t border-line mt-2 pt-2">
              <button
                onClick={() => setSelected('canvases')}
                className={`w-full text-left px-4 py-2 flex items-center gap-2 transition-colors ${selected === 'canvases' ? 'bg-accent/5 text-accent' : 'text-ink hover:bg-wash'}`}
                data-atlas-canvases
              >
                <Inbox size={15} strokeWidth={1.75} className="shrink-0" />
                <span className="flex-1 truncate text-sm">{t('atlas.myCanvases')}</span>
                <span className="text-2xs text-ink-faint shrink-0">{projects.length}</span>
              </button>
            </div>
          </div>

          {/* right: the selected group's sessions, or native canvases */}
          <div className="flex-1 overflow-y-auto p-4">
            {selected === 'canvases' ? (
              <div className="space-y-1.5">
                {[...projects].sort((a, b) => b.updatedAt - a.updatedAt).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { onClose(); void switchProject(p.id).then(onSwitched); }}
                    className="w-full text-left border border-line rounded-xl px-4 py-3 hover:bg-wash transition-colors"
                  >
                    <div className="text-sm text-ink font-medium truncate">{p.name}</div>
                    <div className="text-2xs text-ink-faint mt-0.5">{dateLabel(p.updatedAt)}</div>
                  </button>
                ))}
              </div>
            ) : activeGroup ? (
              <>
                {activeGroup.cwd && <div className="text-2xs text-ink-faint mb-3 truncate">{activeGroup.cwd} · {fmt(t('atlas.sessions'), { n: activeGroup.cards.length })}</div>}
                <div className="space-y-1.5">
                  {activeGroup.cards.map((card) => (
                    <div
                      key={card.rel}
                      className="group border border-line rounded-xl px-4 py-3 hover:bg-wash transition-colors cursor-pointer flex items-center gap-3"
                      onClick={() => void importCard(card)}
                      data-atlas-session={card.sessionId}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-ink truncate">{card.title}</div>
                        <div className="text-2xs text-ink-faint mt-0.5 flex items-center gap-2">
                          {/* runner identity is functional provenance, not promotion */}
                          <span className="border border-line rounded px-1 py-px font-mono">{card.runner}</span>
                          <span>{dateLabel(card.mtime)}</span>
                          <span>{sizeLabel(card.size)}</span>
                        </div>
                      </div>
                      {busyRel === card.rel
                        ? <Loader2 size={16} className="animate-spin text-accent shrink-0" />
                        : (
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 shrink-0">
                            <span title={t('atlas.import')} className="text-ink-faint hover:text-accent p-1.5"><Import size={16} strokeWidth={1.75} /></span>
                            <button
                              title={t('atlas.openCli')}
                              className="text-ink-faint hover:text-accent p-1.5 rounded transition-colors"
                              onClick={(e) => { e.stopPropagation(); void openInCli(card); }}
                              data-atlas-open-cli
                            >
                              <SquareTerminal size={16} strokeWidth={1.75} />
                            </button>
                          </div>
                        )}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-ink-faint">{cards === null ? t('atlas.scanning') : t('atlas.empty')}</div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
