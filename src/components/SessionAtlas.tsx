import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AppWindow, Archive, ArrowDownUp, Folder, FolderOpen, Loader2, Plug, RefreshCw, RotateCcw, Search, SquareTerminal, Import, Trash2, X, Inbox } from 'lucide-react';
import { scanSessions, groupByCwd, disabledRoots, setRootDisabled, type SessionCard, type AtlasGroup } from '../lib/atlas/discover';
import { diffAgainstWatermark, markSeen, markAllSeen, changeKeyOf, type CardChange } from '../lib/atlas/watermark';
import { useProjects, switchProject, setProjectArchived } from '../store/projects';
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

type SortKey = 'time' | 'name' | 'size' | 'runner';
const SORTERS: Record<SortKey, (a: SessionCard, b: SessionCard) => number> = {
  time: (a, b) => b.mtime - a.mtime,
  name: (a, b) => a.title.localeCompare(b.title),
  size: (a, b) => b.size - a.size,
  runner: (a, b) => a.runner.localeCompare(b.runner) || b.mtime - a.mtime,
};

// The intake dialog: built-in sources probe their standard paths; runners
// whose parser isn't ready yet stand as honest placeholders; custom
// directories enter ONLY through the native picker (shell-side whitelist).
function SourcesDialog({ roots, counts, onChanged, onClose }: {
  roots: SessionRoot[];
  counts: Map<string, number>;
  onChanged: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const off = disabledRoots();
  const builtinLabel: Record<string, string> = { 'claude-projects': 'Claude Code', 'codex-sessions': 'Codex' };
  const row = (root: SessionRoot) => (
    <div key={root.key} className="flex items-center gap-3 px-4 py-2.5 border-b border-line last:border-b-0" data-atlas-source={root.key}>
      <input
        type="checkbox"
        checked={!off.has(root.key)}
        disabled={!root.exists}
        onChange={(e) => { setRootDisabled(root.key, !e.target.checked); onChanged(); }}
        className="shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-ink">{builtinLabel[root.key] ?? root.path.split('/').filter(Boolean).pop()}</div>
        <div className="text-2xs text-ink-faint truncate">{root.path}</div>
      </div>
      <span className="text-2xs text-ink-faint shrink-0">
        {root.exists ? (counts.get(root.key) ?? 0) : t('atlas.rootMissing')}
      </span>
      {!root.builtin && (
        <button
          className="text-ink-faint hover:text-red-500 p-1 rounded transition-colors shrink-0"
          onClick={() => { void window.desktopSessions!.removeRoot(root.key).then(onChanged); }}
        >
          <Trash2 size={14} strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
  return (
    <div className="absolute inset-0 z-10 bg-ink/20 flex items-center justify-center" onClick={onClose}>
      <div className="bg-surface border border-line rounded-2xl shadow-xl w-[440px] max-h-[80%] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-atlas-sources-dialog>
        <div className="px-4 pt-3.5 pb-2.5 border-b border-line">
          <div className="text-sm font-semibold text-ink">{t('atlas.sourcesTitle')}</div>
          <div className="text-2xs text-ink-muted mt-0.5">{t('atlas.sourcesHint')}</div>
        </div>
        {roots.filter((r) => r.builtin).map(row)}
        {['Pi', 'DeepSeek Harness'].map((name) => (
          <div key={name} className="flex items-center gap-3 px-4 py-2.5 border-b border-line opacity-50">
            <input type="checkbox" disabled className="shrink-0" />
            <div className="flex-1 text-sm text-ink">{name}</div>
            <span className="text-2xs text-ink-faint">{t('atlas.parserSoon')}</span>
          </div>
        ))}
        {roots.filter((r) => !r.builtin).map(row)}
        <div className="flex items-center gap-2 px-4 py-3">
          <button
            onClick={onChanged}
            className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink border border-line rounded-lg px-2.5 py-1.5 hover:bg-wash transition-colors"
          >
            <RefreshCw size={13} strokeWidth={1.75} /> {t('atlas.autoDetect')}
          </button>
          <button
            onClick={() => { void window.desktopSessions!.addRoot().then((r) => { if (r) onChanged(); }); }}
            className="flex items-center gap-1.5 text-sm text-accent border border-line rounded-lg px-2.5 py-1.5 hover:bg-wash transition-colors"
            data-atlas-add-dir
          >
            <Plug size={13} strokeWidth={1.75} /> {t('atlas.addDir')}
          </button>
        </div>

      </div>
    </div>
  );
}

export default function SessionAtlas({ onClose, onSwitched, focusSessionId }: { onClose: () => void; onSwitched: () => void; focusSessionId?: string }) {
  const t = useT();
  const projects = useProjects((s) => s.projects);
  const isDesktop = !!window.desktopSessions;
  const [cards, setCards] = useState<SessionCard[] | null>(null);
  const [roots, setRoots] = useState<SessionRoot[]>([]);
  const [scanning, setScanning] = useState(false);
  // group cwd key, or the native region; the web build (no fs bridge)
  // starts — and mostly lives — on the native side
  const [selected, setSelected] = useState<string | 'canvases' | null>(window.desktopSessions ? null : 'canvases');
  const [busyRel, setBusyRel] = useState<string | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [runnerOff, setRunnerOff] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('time');
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [changes, setChanges] = useState<Map<string, CardChange>>(new Map());
  const [targets, setTargets] = useState<Awaited<ReturnType<NonNullable<Window['desktopSessions']>['openTargets']>> | null>(null);
  useEffect(() => { void window.desktopSessions?.openTargets().then(setTargets).catch(() => {}); }, []);
  const appHosts = useMemo(() => new Map((targets?.apps ?? []).map((a) => [a.runner, a.name])), [targets]);

  const refresh = async () => {
    setScanning(true);
    try {
      setRoots(await window.desktopSessions?.roots().catch(() => []) ?? []);
      const scanned = await scanSessions();
      setCards(scanned);
      setChanges(diffAgainstWatermark(scanned));
      // twin-badge arrival: land on the folder that holds the session
      // this canvas mirrors
      if (focusSessionId) {
        const hit = scanned.find((c) => c.sessionId === focusSessionId);
        if (hit) setSelected(hit.cwd ?? '');
      }
    } finally { setScanning(false); }
  };
  useEffect(() => { void refresh(); }, []);

  // live freshness: the watcher (live-mirror) broadcasts store changes;
  // an open atlas rescans, throttled — badges and counts stay current
  useEffect(() => {
    let cooling = false;
    const onChanged = () => {
      if (cooling || scanning) return;
      cooling = true;
      setTimeout(() => { cooling = false; void refresh(); }, 2000);
    };
    window.addEventListener('td:sessions-changed', onChanged);
    return () => window.removeEventListener('td:sessions-changed', onChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  // filters shape the whole atlas: folder counts follow them too
  const visible = useMemo(() => (cards ?? []).filter((c) =>
    !runnerOff.has(c.runner)
    && (!onlyChanged || changes.has(changeKeyOf(c)))
    && (!query.trim() || c.title.toLowerCase().includes(query.trim().toLowerCase()))), [cards, runnerOff, query, onlyChanged, changes]);
  const groups = useMemo(() => groupByCwd(visible), [visible]);
  const runners = useMemo(() => [...new Set((cards ?? []).map((c) => c.runner))].sort(), [cards]);
  const rootCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cards ?? []) m.set(c.rootKey, (m.get(c.rootKey) ?? 0) + 1);
    return m;
  }, [cards]);
  const activeGroup: AtlasGroup | null = selected === 'canvases' ? null : groups.find((g) => (g.cwd ?? '') === (selected ?? groups[0]?.cwd ?? '')) ?? groups[0] ?? null;
  const shownCards = useMemo(() => activeGroup ? [...activeGroup.cards].sort(SORTERS[sortKey]) : [], [activeGroup, sortKey]);

  const seen = (card: SessionCard) => {
    markSeen(card);
    setChanges((m) => { const n = new Map(m); n.delete(changeKeyOf(card)); return n; });
  };

  const importCard = async (card: SessionCard) => {
    if (busyRel) return;
    setBusyRel(card.rel);
    seen(card); // opening a card IS looking at it, whatever import does next
    try {
      const text = await window.desktopSessions!.read(card.rootKey, card.rel);
      const { importOrAppendSession } = await import('../lib/atlas/canonical');
      const result = await importOrAppendSession(text);
      if (!result) throw new Error(ti('handoff.notASession'));
      if (result.kind === 'appended') toast('success', fmt(ti('atlas.appended'), { n: result.turns }), 9000);
      else if (result.kind === 'opened') toast('info', ti('atlas.upToDate'), 6000);
      else toast('success', fmt(ti('toast.importedChats'), { n: 1, m: result.nodeCount }), 9000);
      onClose();
      onSwitched();
    } catch (err) {
      toast('error', fmt(ti('atlas.parseFailed'), { msg: err instanceof Error ? err.message : String(err) }));
    } finally {
      setBusyRel(null);
    }
  };

  // Re-mirror: the coarse tier of recoverability. The read-only source is
  // a permanent undo floor — delete the twin canvas (edits and all, after
  // an explicit confirm) and rebuild the full mirror from the file.
  const recast = async (card: SessionCard) => {
    const twin = useProjects.getState().projects.find((p) => p.sourceSession?.sessionId === card.sessionId);
    if (!twin || busyRel) return;
    const { confirmDialog } = await import('../lib/ui-store');
    const ok = await confirmDialog({
      title: ti('confirm.recastTitle'),
      message: fmt(ti('confirm.recast'), { name: twin.name }),
      confirmLabel: ti('confirm.recastTitle'),
      danger: true,
    });
    if (!ok) return;
    setBusyRel(card.rel);
    try {
      const text = await window.desktopSessions!.read(card.rootKey, card.rel);
      const { deleteProject } = await import('../store/projects');
      await deleteProject(twin.id);
      const { importOrAppendSession } = await import('../lib/atlas/canonical');
      const result = await importOrAppendSession(text);
      if (!result) throw new Error(ti('handoff.notASession'));
      toast('success', ti('atlas.recastDone'), 8000);
      onClose();
      onSwitched();
    } catch (err) {
      toast('error', fmt(ti('atlas.parseFailed'), { msg: err instanceof Error ? err.message : String(err) }));
    } finally {
      setBusyRel(null);
    }
  };

  const openInCli = async (card: SessionCard, mode: 'app' | 'terminal') => {
    const r = await window.desktopSessions!.openInCli(card.runner, card.cwd, card.sessionId, mode)
      .catch(() => ({ opened: false, via: '' as const, command: '' }));
    if (r.opened && r.via === 'app') {
      // no documented deep link to a specific session yet — hand the user
      // the id so the app's own search can land on it
      await navigator.clipboard.writeText(card.sessionId).catch(() => {});
      toast('success', ti('atlas.appOpened'), 9000);
    } else if (r.opened) toast('success', ti('atlas.opened'));
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
            {changes.size > 0 && (
              <div className="text-xs mt-1 flex items-center gap-2" data-atlas-changes>
                <span className="text-accent">
                  {fmt(t('atlas.changesSummary'), {
                    n: [...changes.values()].filter((c) => c.kind === 'new').length,
                    m: [...changes.values()].filter((c) => c.kind === 'updated').length,
                  })}
                </span>
                <button
                  className="text-ink-faint hover:text-ink underline decoration-dotted transition-colors"
                  onClick={() => { markAllSeen(cards ?? []); setChanges(new Map()); }}
                  data-atlas-mark-all
                >
                  {t('atlas.markAllSeen')}
                </button>
              </div>
            )}
          </div>
          {isDesktop && targets && targets.terminals.length > 0 && (
            <label className="flex items-center gap-1.5 text-sm text-ink-muted border border-line rounded-lg px-2.5 py-1.5 cursor-pointer" title={t('atlas.terminalChoice')}>
              <SquareTerminal size={14} strokeWidth={1.75} />
              <select
                value={targets.prefs.terminal}
                onChange={(e) => {
                  const terminal = e.target.value;
                  if (terminal === '__add__') {
                    // native app picker; the chosen app becomes the selection
                    void window.desktopSessions?.addTerminal().then(() =>
                      window.desktopSessions?.openTargets().then(setTargets));
                    return;
                  }
                  void window.desktopSessions?.setOpenPrefs({ terminal }).then((p) => setTargets((tg) => (tg ? { ...tg, prefs: p } : tg)));
                }}
                className="bg-transparent focus:outline-none text-sm text-ink cursor-pointer"
                data-atlas-terminal-select
              >
                {targets.terminals.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}
                {targets.canAddCustom && <option value="__add__">{t('atlas.otherTerminal')}</option>}
              </select>
            </label>
          )}
          {isDesktop && (
          <button
            onClick={() => setSourcesOpen(true)}
            className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink border border-line rounded-lg px-2.5 py-1.5 hover:bg-wash transition-colors"
            data-atlas-sources
          >
            <Plug size={14} strokeWidth={1.75} /> {t('atlas.sources')}
          </button>
          )}
          {isDesktop && (
          <button
            onClick={() => void refresh()}
            disabled={scanning}
            className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink border border-line rounded-lg px-2.5 py-1.5 hover:bg-wash transition-colors disabled:opacity-60"
            data-atlas-refresh
          >
            {scanning ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} strokeWidth={1.75} />}
            {scanning ? t('atlas.scanning') : t('atlas.refresh')}
          </button>
          )}
          <button onClick={onClose} className="text-ink-faint hover:text-ink p-1.5 rounded-lg hover:bg-wash transition-colors" data-atlas-close>
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex-1 flex min-h-0">
          {/* left: recent work first (the "where was I" answer), then the
              external world's folders, then the native region */}
          <div className="w-[260px] border-r border-line overflow-y-auto py-2 shrink-0">
            <div className="px-4 py-1 text-2xs uppercase tracking-wide text-ink-faint">{t('atlas.recent')}</div>
            {projects.filter((p) => !p.archived).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6).map((p) => (
              <button
                key={p.id}
                onClick={() => { onClose(); void switchProject(p.id).then(onSwitched); }}
                className="w-full text-left px-4 py-1.5 flex items-center gap-2 text-ink hover:bg-wash transition-colors"
                data-atlas-recent={p.id}
              >
                {p.sourceSession
                  ? <span className="text-2xs font-mono border border-line rounded px-1 py-px shrink-0 text-ink-faint">{p.sourceSession.runner}</span>
                  : <Inbox size={13} strokeWidth={1.75} className="shrink-0 text-ink-faint" />}
                <span className="flex-1 truncate text-sm">{p.name}</span>
              </button>
            ))}
            <div className="border-t border-line mt-2 pt-2 px-4 py-1 text-2xs uppercase tracking-wide text-ink-faint">{t('atlas.folders')}</div>
            {!isDesktop && (
              <div className="px-4 py-2 text-xs text-ink-faint">{t('atlas.webNoScan')}</div>
            )}
            {isDesktop && cards === null && (
              <div className="px-4 py-2 text-sm text-ink-faint flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> {t('atlas.scanning')}</div>
            )}
            {isDesktop && cards !== null && groups.length === 0 && (
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
                  {(() => {
                    const n = g.cards.filter((c) => changes.has(changeKeyOf(c))).length;
                    return n > 0 ? <span className="text-2xs text-accent shrink-0" data-atlas-folder-changes>+{n}</span> : null;
                  })()}
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
                {projects.filter((p) => !p.archived).sort((a, b) => b.updatedAt - a.updatedAt).map((p) => (
                  <div key={p.id} className="group flex items-center gap-2 border border-line rounded-xl px-4 py-3 hover:bg-wash transition-colors cursor-pointer"
                    onClick={() => { onClose(); void switchProject(p.id).then(onSwitched); }}>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-ink font-medium truncate">{p.name}</div>
                      <div className="text-2xs text-ink-faint mt-0.5 flex items-center gap-1.5">
                        <span>{dateLabel(p.updatedAt)}</span>
                        {p.sourceSession && <span className="font-mono border border-line rounded px-1 py-px">{p.sourceSession.runner}</span>}
                      </div>
                    </div>
                    <button
                      title={t('switcher.archive')}
                      className="opacity-0 group-hover:opacity-100 text-ink-faint hover:text-amber-600 p-1.5 rounded transition-all shrink-0"
                      onClick={(e) => { e.stopPropagation(); void setProjectArchived(p.id, true); }}
                      data-atlas-archive
                    >
                      <Archive size={15} strokeWidth={1.75} />
                    </button>
                  </div>
                ))}
                {projects.some((p) => p.archived) && (
                  <details className="pt-2" data-atlas-archived-group>
                    <summary className="text-2xs uppercase tracking-wide text-ink-faint cursor-pointer px-1 py-1">
                      {fmt(t('atlas.archivedGroup'), { n: projects.filter((p) => p.archived).length })}
                    </summary>
                    <div className="space-y-1.5 mt-1.5">
                      {projects.filter((p) => p.archived).sort((a, b) => b.updatedAt - a.updatedAt).map((p) => (
                        <button
                          key={p.id}
                          title={t('atlas.restoreOpen')}
                          onClick={() => { void setProjectArchived(p.id, false).then(() => { onClose(); void switchProject(p.id).then(onSwitched); }); }}
                          className="w-full text-left border border-dashed border-line rounded-xl px-4 py-2.5 hover:bg-wash transition-colors opacity-70 hover:opacity-100"
                          data-atlas-archived-item
                        >
                          <div className="text-sm text-ink truncate flex items-center gap-1.5">
                            <span className="truncate">{p.name}</span>
                            {p.sourceSession && <span className="text-2xs font-mono border border-line rounded px-1 py-px shrink-0 text-ink-faint">{p.sourceSession.runner}</span>}
                          </div>
                          <div className="text-2xs text-ink-faint mt-0.5">{dateLabel(p.updatedAt)}</div>
                        </button>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            ) : (
              <>
                {/* the toolbar stands OUTSIDE the group view: filters that
                    empty the atlas must stay reachable to be undone */}
                {(cards?.length ?? 0) > 0 && (
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <div className="flex items-center gap-1.5 border border-line rounded-lg px-2 py-1 bg-card">
                    <Search size={13} strokeWidth={1.75} className="text-ink-faint shrink-0" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={t('atlas.filterTitle')}
                      className="text-sm bg-transparent focus:outline-none w-[150px] text-ink placeholder:text-ink-faint"
                      data-atlas-filter
                    />
                  </div>
                  {runners.map((r) => (
                    <button
                      key={r}
                      onClick={() => setRunnerOff((s) => { const n = new Set(s); if (n.has(r)) n.delete(r); else n.add(r); return n; })}
                      className={`text-2xs font-mono border rounded-lg px-2 py-1 transition-colors ${runnerOff.has(r) ? 'border-line text-ink-faint line-through' : 'border-accent/40 text-accent bg-accent/5'}`}
                      data-atlas-runner-toggle={r}
                    >
                      {r}
                    </button>
                  ))}
                  {changes.size > 0 && (
                    <button
                      onClick={() => setOnlyChanged((v) => !v)}
                      className={`text-2xs border rounded-lg px-2 py-1 transition-colors ${onlyChanged ? 'border-accent text-white bg-accent' : 'border-line text-ink-muted hover:text-ink'}`}
                      data-atlas-only-changed
                    >
                      {t('atlas.onlyChanged')}
                    </button>
                  )}
                  <button
                    onClick={() => setSortKey((k) => (({ time: 'name', name: 'size', size: 'runner', runner: 'time' } as const)[k]))}
                    className="ml-auto flex items-center gap-1.5 text-2xs text-ink-muted hover:text-ink border border-line rounded-lg px-2 py-1 hover:bg-wash transition-colors"
                    data-atlas-sort
                  >
                    <ArrowDownUp size={12} strokeWidth={1.75} />
                    {t(`atlas.sort${sortKey[0].toUpperCase()}${sortKey.slice(1)}` as 'atlas.sortTime')}
                  </button>
                </div>
                )}
                {!activeGroup ? (
                  <div className="py-16 text-center text-sm text-ink-faint">
                    {cards === null ? t('atlas.scanning') : (cards.length > 0 ? t('atlas.filteredOut') : t('atlas.empty'))}
                  </div>
                ) : (
                <>
                {activeGroup.cwd && <div className="text-2xs text-ink-faint mb-3 truncate">{activeGroup.cwd} · {fmt(t('atlas.sessions'), { n: activeGroup.cards.length })}</div>}
                <div className="space-y-1.5">
                  {shownCards.map((card) => (
                    <div
                      key={card.rel}
                      className="group border border-line rounded-xl px-4 py-3 hover:bg-wash transition-colors cursor-pointer flex items-center gap-3"
                      onClick={() => void importCard(card)}
                      data-atlas-session={card.sessionId}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-ink truncate flex items-center gap-1.5">
                          <span className="truncate">{card.title}</span>
                          {changes.get(changeKeyOf(card))?.kind === 'new' && (
                            <span className="text-2xs text-white bg-accent rounded px-1 py-px shrink-0" data-atlas-badge="new">{t('atlas.badgeNew')}</span>
                          )}
                          {changes.get(changeKeyOf(card))?.kind === 'updated' && (
                            <span className="text-2xs text-accent border border-accent/40 rounded px-1 py-px shrink-0" data-atlas-badge="updated">
                              +{sizeLabel(changes.get(changeKeyOf(card))!.deltaSize)}
                            </span>
                          )}
                          {projects.some((p) => p.sourceSession?.sessionId === card.sessionId) && (
                            <span className="text-2xs text-ink-faint border border-line rounded px-1 py-px shrink-0" data-atlas-badge="canvas">{t('atlas.onCanvas')}</span>
                          )}
                        </div>
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
                          // three doors per session, each an explicit choice:
                          // canvas, host app (when one is installed), terminal
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 shrink-0">
                            <span title={t('atlas.import')} className="text-ink-faint hover:text-accent p-1.5"><Import size={16} strokeWidth={1.75} /></span>
                            {projects.some((p) => p.sourceSession?.sessionId === card.sessionId) && (
                              <button
                                title={t('atlas.recast')}
                                className="text-ink-faint hover:text-red-500 p-1.5 rounded transition-colors"
                                onClick={(e) => { e.stopPropagation(); void recast(card); }}
                                data-atlas-recast
                              >
                                <RotateCcw size={16} strokeWidth={1.75} />
                              </button>
                            )}
                            {appHosts.has(card.runner) && (
                              <button
                                title={fmt(t('atlas.openApp'), { name: appHosts.get(card.runner)! })}
                                className="text-ink-faint hover:text-accent p-1.5 rounded transition-colors"
                                onClick={(e) => { e.stopPropagation(); void openInCli(card, 'app'); }}
                                data-atlas-open-app
                              >
                                <AppWindow size={16} strokeWidth={1.75} />
                              </button>
                            )}
                            <button
                              title={t('atlas.openTerminal')}
                              className="text-ink-faint hover:text-accent p-1.5 rounded transition-colors"
                              onClick={(e) => { e.stopPropagation(); void openInCli(card, 'terminal'); }}
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
                )}
              </>
            )}
          </div>
        </div>
        {sourcesOpen && (
          <SourcesDialog
            roots={roots}
            counts={rootCounts}
            onChanged={() => void refresh()}
            onClose={() => setSourcesOpen(false)}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}
