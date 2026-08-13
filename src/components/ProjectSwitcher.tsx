import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Dna, FolderOpen, Loader2, Pencil, Plus, RefreshCw, Trash2, Upload } from 'lucide-react';
import { useProjects, switchProject, createProject, renameProject, deleteProject } from '../store/projects';
import { useI18n } from '../i18n';
import { parseImportFile } from '../lib/export';
import ImportChatModal from './ImportChatModal';
import type { ImportableConversation } from '../lib/import-chat';
import { confirmDialog, toast } from '../lib/ui-store';
import { isImeComposing } from '../utils';
import { useT, t as ti, fmt } from '../i18n';

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return ti('switcher.justNow');
  if (min < 60) return fmt(ti('switcher.minAgo'), { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return fmt(ti('switcher.hourAgo'), { n: h });
  const d = Math.floor(h / 24);
  if (d < 30) return fmt(ti('switcher.dayAgo'), { n: d });
  return new Date(ts).toLocaleDateString(useI18n.getState().lang === 'zh' ? 'zh-CN' : 'en-US');
}

export default function ProjectSwitcher({ onSwitched }: { onSwitched: () => void }) {
  const t = useT();
  const projects = useProjects((s) => s.projects);
  const activeId = useProjects((s) => s.activeId);
  const switching = useProjects((s) => s.switching);
  const activeIsParadigm = projects.find((p) => p.id === activeId)?.kind === 'paradigm';
  const [open, setOpen] = useState(false);
  const [chatImport, setChatImport] = useState<ImportableConversation[] | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const importFileRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const active = projects.find((p) => p.id === activeId);
  const sorted = [...projects].sort((a, b) => b.updatedAt - a.updatedAt);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  const doSwitch = async (id: string) => {
    setOpen(false);
    await switchProject(id);
    onSwitched();
  };

  return (
    // z-20: the open dropdown must cover the content palette below (both
    // live on the left edge; the palette is z-10)
    <div ref={rootRef} className="absolute top-4 left-4 z-20">
      <button
        onClick={() => setOpen(!open)}
        disabled={switching}
        className="bg-card/90 backdrop-blur border border-line rounded-xl px-3.5 py-2 shadow-sm hover:bg-wash transition-colors flex items-center gap-2 text-sm text-ink max-w-[240px] disabled:opacity-60"
      >
        {switching
          ? <Loader2 size={16} strokeWidth={1.75} className="animate-spin shrink-0 text-accent" />
          : activeIsParadigm
            ? <Dna size={16} strokeWidth={1.75} className="shrink-0 text-accent" />
            : <FolderOpen size={16} strokeWidth={1.75} className="shrink-0 text-ink-muted" />}
        <span className="truncate font-medium">{active?.name ?? '…'}</span>
        <ChevronDown size={14} strokeWidth={1.75} className="shrink-0 text-ink-faint" />
      </button>

      {open && (
        <div className="mt-1.5 bg-card border border-line rounded-xl shadow-lg py-1.5 w-[280px] animate-fade-in">
          <div className="max-h-[320px] overflow-y-auto">
            {sorted.map((p) => (
              <div
                key={p.id}
                className={`group flex items-center gap-1 px-3 py-2 hover:bg-wash cursor-pointer transition-colors ${p.id === activeId ? 'bg-accent/5' : ''}`}
                onClick={() => { if (renamingId !== p.id && p.id !== activeId) void doSwitch(p.id); }}
              >
                {renamingId === p.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isImeComposing(e) && renameValue.trim()) {
                        void renameProject(p.id, renameValue.trim());
                        setRenamingId(null);
                      }
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    onBlur={() => setRenamingId(null)}
                    className="flex-1 text-sm text-ink border border-accent/40 rounded-lg px-2 py-1 bg-surface focus:outline-none"
                  />
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm truncate ${p.id === activeId ? 'text-accent font-medium' : 'text-ink'}`}>
                        {p.name}
                      </div>
                      <div className="text-2xs text-ink-faint">{relativeTime(p.updatedAt)}</div>
                    </div>
                    <button
                      title={t('switcher.rename')}
                      className="opacity-0 group-hover:opacity-100 text-ink-faint hover:text-ink p-1 rounded transition-all shrink-0"
                      onClick={(e) => { e.stopPropagation(); setRenamingId(p.id); setRenameValue(p.name); }}
                    >
                      <Pencil size={14} strokeWidth={1.75} />
                    </button>
                    <button
                      title={t('common.delete')}
                      className="opacity-0 group-hover:opacity-100 text-ink-faint hover:text-red-500 p-1 rounded transition-all shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        void confirmDialog({
                          title: ti('confirm.deleteCanvasTitle'),
                          message: fmt(ti('confirm.deleteCanvas'), { name: p.name }),
                          confirmLabel: ti('common.delete'),
                          danger: true,
                        }).then((ok) => { if (ok) void deleteProject(p.id).then(onSwitched); });
                      }}
                    >
                      <Trash2 size={14} strokeWidth={1.75} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>

          <div className="border-t border-line mt-1 pt-1">
            <button
              onClick={() => { setOpen(false); void createProject().then(onSwitched); }}
              className="w-full text-left px-3 py-2 text-sm text-accent hover:bg-wash transition-colors flex items-center gap-2"
            >
              <Plus size={15} strokeWidth={1.75} /> {t('switcher.newCanvas')}
            </button>
            <button
              onClick={() => importFileRef.current?.click()}
              className="w-full text-left px-3 py-2 text-sm text-ink-muted hover:bg-wash transition-colors flex items-center gap-2"
            >
              <Upload size={15} strokeWidth={1.75} /> {t('switcher.importBackup')}
            </button>
            {window.desktop && (
              <button
                onClick={() => { setOpen(false); void window.desktop!.checkForUpdates(); }}
                className="w-full text-left px-3 py-2 text-sm text-ink-muted hover:bg-wash transition-colors flex items-center gap-2"
                data-check-updates
              >
                <RefreshCw size={15} strokeWidth={1.75} /> {t('update.checkMenu')}
                {/* the one place that answers "which version am I on" at a glance */}
                <span className="ml-auto text-2xs text-ink-faint">
                  v{new URLSearchParams(window.location.search).get('dv')}
                </span>
              </button>
            )}
            <input
              ref={importFileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  // Every failure path must surface — a silently swallowed
                  // rejection here reads as "the import does nothing".
                  void parseImportFile(f).then((r) => {
                    if (r.kind === 'own' && r.ok) { setOpen(false); onSwitched(); }
                    else if (r.kind === 'chat') { setOpen(false); setChatImport(r.conversations); }
                  }).catch((err) => {
                    toast('error', fmt(ti('toast.importFailedGeneric'), { msg: err instanceof Error ? err.message : String(err) }));
                  });
                }
                e.target.value = '';
              }}
            />
          </div>
        </div>
      )}
      {chatImport && (
        <ImportChatModal
          conversations={chatImport}
          onClose={() => setChatImport(null)}
          onDone={() => { setChatImport(null); onSwitched(); }}
        />
      )}
    </div>
  );
}
