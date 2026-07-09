import { useEffect, useRef, useState } from 'react';
import { Archive, ArchiveRestore, ClipboardCopy, Copy, Ellipsis, Eye, FileDown, RefreshCw, Split, Square, Trash2 } from 'lucide-react';
import { useStore } from '../../store';
import { contextChainMarkdown, downloadMarkdown, copyText } from '../../lib/export';
import { ROLE_TEMPLATES, rolePromptFor } from '../../lib/role-templates';
import ModelPicker from '../ui/ModelPicker';
import FanOutModal from '../FanOutModal';
import { useT, useI18n } from '../../i18n';

// Compact action strip: the two actions you actually reach for (regenerate,
// archive) plus the model chip, everything else behind "…". Component
// creation (fan out, reviewer) lives here only until the palette lands.

export default function HeaderActions({ nodeId, isLoading }: { nodeId: string; isLoading: boolean }) {
  const regenerate = useStore((s) => s.regenerate);
  const stopGeneration = useStore((s) => s.stopGeneration);
  const duplicateNode = useStore((s) => s.duplicateNode);
  const deleteNode = useStore((s) => s.deleteNode);
  const setSelectedNodeId = useStore((s) => s.setSelectedNodeId);
  const attachEvaluator = useStore((s) => s.attachEvaluator);
  const setNodeModel = useStore((s) => s.setNodeModel);
  const nodeModel = useStore((s) => s.nodes.find((n) => n.id === nodeId)?.data.model);
  const setArchived = useStore((s) => s.setArchived);
  const isArchived = useStore((s) => !!s.nodes.find((n) => n.id === nodeId)?.data.archived);
  const nodeQuestion = useStore((s) => s.nodes.find((n) => n.id === nodeId)?.data.question ?? '');
  const t = useT();
  const lang = useI18n((s) => s.lang);

  const [menuOpen, setMenuOpen] = useState(false);
  const [evaluatorPickerOpen, setEvaluatorPickerOpen] = useState(false);
  const [fanOutOpen, setFanOutOpen] = useState(false);
  const [customRole, setCustomRole] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen && !evaluatorPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
      if (!pickerRef.current?.contains(e.target as Node)) setEvaluatorPickerOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [menuOpen, evaluatorPickerOpen]);

  const iconBtn = 'text-ink-faint hover:text-ink hover:bg-wash rounded-lg w-7 h-7 flex items-center justify-center transition-colors';
  const menuItem = 'w-full text-left px-3 py-2 text-xs text-ink-muted hover:bg-wash transition-colors flex items-center gap-2';

  return (
    <div className="relative flex items-center gap-1 shrink-0">
      {isLoading ? (
        <button
          onClick={() => stopGeneration(nodeId)}
          title={t('actions.stop')}
          className="text-white bg-red-500 hover:bg-red-600 rounded-lg w-7 h-7 flex items-center justify-center transition-colors"
        >
          <Square size={11} strokeWidth={1.75} fill="currentColor" />
        </button>
      ) : (
        <button onClick={() => regenerate(nodeId)} title={t('common.regenerate')} className={iconBtn}>
          <RefreshCw size={14} strokeWidth={1.75} />
        </button>
      )}
      <button
        onClick={() => setArchived([nodeId], !isArchived)}
        title={isArchived ? t('archive.restoreTitle') : t('archive.title')}
        className={isArchived ? 'text-amber-600 bg-amber-500/10 rounded-lg w-7 h-7 flex items-center justify-center' : iconBtn}
      >
        {isArchived ? <ArchiveRestore size={14} strokeWidth={1.75} /> : <Archive size={14} strokeWidth={1.75} />}
      </button>
      <ModelPicker compact value={nodeModel} onChange={(m) => setNodeModel(nodeId, m)} />

      <div ref={menuRef} className="relative">
        <button onClick={() => setMenuOpen((v) => !v)} title={t('panel.more')} className={`${iconBtn} ${menuOpen ? 'bg-wash text-ink' : ''}`}>
          <Ellipsis size={15} strokeWidth={1.75} />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 bg-card border border-line rounded-xl shadow-lg py-1 w-[190px] z-30 animate-fade-in">
            <button className={menuItem} onClick={() => { setMenuOpen(false); setFanOutOpen(true); }} title={t('fanout.entryTitle')}>
              <Split size={13} strokeWidth={1.75} /> {t('fanout.entry')}
            </button>
            <button className={menuItem} onClick={() => { setMenuOpen(false); setEvaluatorPickerOpen(true); }} title={t('evaluator.attachTitle')}>
              <Eye size={13} strokeWidth={1.75} /> {t('evaluator.attach')}
            </button>
            <button className={menuItem} onClick={() => { setMenuOpen(false); duplicateNode(nodeId); }}>
              <Copy size={13} strokeWidth={1.75} /> {t('common.duplicate')}
            </button>
            <button className={menuItem} onClick={() => { setMenuOpen(false); downloadMarkdown(contextChainMarkdown(nodeId)); }} title={t('actions.exportTitle')}>
              <FileDown size={13} strokeWidth={1.75} /> {t('common.exportMd')}
            </button>
            <button className={menuItem} onClick={() => { setMenuOpen(false); void copyText(contextChainMarkdown(nodeId)); }} title={t('actions.copyTitle')}>
              <ClipboardCopy size={13} strokeWidth={1.75} /> {t('actions.copyMd')}
            </button>
            <div className="border-t border-line my-1" />
            <button
              className="w-full text-left px-3 py-2 text-xs text-red-500 hover:bg-red-50 transition-colors flex items-center gap-2"
              onClick={() => { setMenuOpen(false); deleteNode(nodeId); setSelectedNodeId(null); }}
            >
              <Trash2 size={13} strokeWidth={1.75} /> {t('common.delete')}
            </button>
          </div>
        )}
      </div>

      {/* Reviewer role picker — opened from the … menu */}
      {evaluatorPickerOpen && (
        <div ref={pickerRef} className="absolute right-0 top-full mt-1 bg-card border border-line rounded-xl shadow-lg p-3 w-[300px] z-30 space-y-1.5 animate-fade-in">
          <p className="text-2xs text-ink-faint uppercase tracking-wider font-medium mb-1">{t('evaluator.pickRole')}</p>
          {ROLE_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => {
                setEvaluatorPickerOpen(false);
                void attachEvaluator(nodeId, rolePromptFor(tpl, lang), lang === 'zh' ? tpl.nameZh : tpl.nameEn);
              }}
              className="w-full text-left text-xs text-ink hover:bg-wash rounded-lg px-3 py-2 transition-colors flex items-center gap-2"
            >
              <Eye size={13} strokeWidth={1.75} className="text-watch shrink-0" />
              {lang === 'zh' ? tpl.nameZh : tpl.nameEn}
            </button>
          ))}
          <div className="flex gap-1.5 pt-1.5 border-t border-line/60">
            <input
              type="text"
              value={customRole}
              onChange={(e) => setCustomRole(e.target.value)}
              placeholder={t('evaluator.customPlaceholder')}
              className="flex-1 text-xs border border-line rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-watch/50 bg-card"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && customRole.trim()) {
                  setEvaluatorPickerOpen(false);
                  void attachEvaluator(nodeId, customRole.trim(), t('evaluator.badge'));
                  setCustomRole('');
                }
                if (e.key === 'Escape') setEvaluatorPickerOpen(false);
              }}
              autoFocus
            />
            <button
              onClick={() => {
                if (!customRole.trim()) return;
                setEvaluatorPickerOpen(false);
                void attachEvaluator(nodeId, customRole.trim(), t('evaluator.badge'));
                setCustomRole('');
              }}
              disabled={!customRole.trim()}
              className="text-xs bg-watch/90 hover:bg-watch text-white px-3 py-2 rounded-lg transition-colors disabled:opacity-30 shrink-0"
            >
              {t('evaluator.create')}
            </button>
          </div>
        </div>
      )}

      {fanOutOpen && (
        <FanOutModal parentId={nodeId} initialQuestion={nodeQuestion} onClose={() => setFanOutOpen(false)} />
      )}
    </div>
  );
}
