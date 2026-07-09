import { useEffect, useRef, useState } from 'react';
import { Archive, ArchiveRestore, ClipboardCopy, Copy, Ellipsis, FileDown, RefreshCw, Split, Square, Trash2 } from 'lucide-react';
import { useStore } from '../../store';
import { contextChainMarkdown, downloadMarkdown, copyText } from '../../lib/export';
import ModelPicker from '../ui/ModelPicker';
import FanOutModal from '../FanOutModal';
import { useT } from '../../i18n';

// Compact action strip: the two actions you actually reach for (regenerate,
// archive) plus the model chip, everything else behind "…". Perspectives
// (once = candidates, follow = reviewers) live here until the palette lands.

export default function HeaderActions({ nodeId, isLoading }: { nodeId: string; isLoading: boolean }) {
  const regenerate = useStore((s) => s.regenerate);
  const stopGeneration = useStore((s) => s.stopGeneration);
  const duplicateNode = useStore((s) => s.duplicateNode);
  const deleteNode = useStore((s) => s.deleteNode);
  const setSelectedNodeId = useStore((s) => s.setSelectedNodeId);
  const setNodeModel = useStore((s) => s.setNodeModel);
  const nodeModel = useStore((s) => s.nodes.find((n) => n.id === nodeId)?.data.model);
  const setArchived = useStore((s) => s.setArchived);
  const isArchived = useStore((s) => !!s.nodes.find((n) => n.id === nodeId)?.data.archived);
  const nodeQuestion = useStore((s) => s.nodes.find((n) => n.id === nodeId)?.data.question ?? '');
  const t = useT();

  const [menuOpen, setMenuOpen] = useState(false);
  const [fanOutOpen, setFanOutOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const iconBtn = 'text-ink-faint hover:text-ink hover:bg-wash rounded-lg w-8 h-8 flex items-center justify-center transition-colors';
  const menuItem = 'w-full text-left px-3 py-2 text-xs text-ink-muted hover:bg-wash transition-colors flex items-center gap-2';

  return (
    <div className="relative flex items-center gap-1 shrink-0">
      {isLoading ? (
        <button
          onClick={() => stopGeneration(nodeId)}
          title={t('actions.stop')}
          className="text-white bg-red-500 hover:bg-red-600 rounded-lg w-8 h-8 flex items-center justify-center transition-colors"
        >
          <Square size={12} strokeWidth={1.75} fill="currentColor" />
        </button>
      ) : (
        <button onClick={() => regenerate(nodeId)} title={t('common.regenerate')} className={iconBtn}>
          <RefreshCw size={16} strokeWidth={1.75} />
        </button>
      )}
      <button
        onClick={() => setArchived([nodeId], !isArchived)}
        title={isArchived ? t('archive.restoreTitle') : t('archive.title')}
        className={isArchived ? 'text-amber-600 bg-amber-500/10 rounded-lg w-8 h-8 flex items-center justify-center' : iconBtn}
      >
        {isArchived ? <ArchiveRestore size={16} strokeWidth={1.75} /> : <Archive size={16} strokeWidth={1.75} />}
      </button>
      <ModelPicker compact value={nodeModel} onChange={(m) => setNodeModel(nodeId, m)} />

      <div ref={menuRef} className="relative">
        <button onClick={() => setMenuOpen((v) => !v)} title={t('panel.more')} className={`${iconBtn} ${menuOpen ? 'bg-wash text-ink' : ''}`}>
          <Ellipsis size={17} strokeWidth={1.75} />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 bg-card border border-line rounded-xl shadow-lg py-1 w-[210px] z-30 animate-fade-in">
            <button className={menuItem} onClick={() => { setMenuOpen(false); setFanOutOpen(true); }} title={t('fanout.entryTitle')}>
              <Split size={15} strokeWidth={1.75} /> {t('fanout.entry')}
            </button>
            <button className={menuItem} onClick={() => { setMenuOpen(false); duplicateNode(nodeId); }}>
              <Copy size={15} strokeWidth={1.75} /> {t('common.duplicate')}
            </button>
            <button className={menuItem} onClick={() => { setMenuOpen(false); downloadMarkdown(contextChainMarkdown(nodeId)); }} title={t('actions.exportTitle')}>
              <FileDown size={15} strokeWidth={1.75} /> {t('common.exportMd')}
            </button>
            <button className={menuItem} onClick={() => { setMenuOpen(false); void copyText(contextChainMarkdown(nodeId)); }} title={t('actions.copyTitle')}>
              <ClipboardCopy size={15} strokeWidth={1.75} /> {t('actions.copyMd')}
            </button>
            <div className="border-t border-line my-1" />
            <button
              className="w-full text-left px-3 py-2 text-xs text-red-500 hover:bg-red-50 transition-colors flex items-center gap-2"
              onClick={() => { setMenuOpen(false); deleteNode(nodeId); setSelectedNodeId(null); }}
            >
              <Trash2 size={15} strokeWidth={1.75} /> {t('common.delete')}
            </button>
          </div>
        )}
      </div>

      {fanOutOpen && (
        <FanOutModal parentId={nodeId} initialQuestion={nodeQuestion} onClose={() => setFanOutOpen(false)} />
      )}
    </div>
  );
}
