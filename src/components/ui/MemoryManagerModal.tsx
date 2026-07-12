import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Plus, Trash2, X } from 'lucide-react';
import { useUiStore } from '../../lib/ui-store';
import { downloadFile } from '../../lib/export';
import { generateId } from '../../utils';
import { useT, fmt } from '../../i18n';

// The memory manager: the ChatGPT-style curation surface, and the ONLY
// standing entry point to memory (writes announce themselves via toasts;
// nothing on the canvas). Easy in, easy out: entries paste in as plain
// lines (ChatGPT/Claude memory pages copy out that way) and export as a
// JSON file you own.

export default function MemoryManagerModal() {
  const t = useT();
  const open = useUiStore((s) => s.memoryManagerOpen);
  const setOpen = useUiStore((s) => s.setMemoryManagerOpen);
  const memories = useUiStore((s) => s.memories);
  const setMemories = useUiStore((s) => s.setMemories);
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState('');
  if (!open) return null;

  const kindLabel = (k: string) => t(k === 'auto' ? 'memory.kindAuto' : k === 'imported' ? 'memory.kindImported' : 'memory.kindManual');

  const add = () => setMemories([...memories, { id: generateId(), text: '', kind: 'manual', at: new Date().toISOString() }]);
  const commit = (id: string, text: string) => {
    const v = text.trim();
    if (!v) { setMemories(memories.filter((m) => m.id !== id)); return; }
    setMemories(memories.map((m) => (m.id === id ? { ...m, text: v } : m)));
  };
  const doImport = () => {
    const lines = importText.split('\n').map((l) => l.replace(/^[-•\s]+/, '').trim()).filter((l) => l.length > 1);
    if (lines.length === 0) { setImporting(false); return; }
    const now = new Date().toISOString();
    setMemories([...memories, ...lines.map((text) => ({ id: generateId(), text, kind: 'imported' as const, at: now }))]);
    setImportText('');
    setImporting(false);
  };
  const doExport = () => downloadFile('thoughtdag-memory.json', JSON.stringify(memories, null, 2), 'application/json');

  return createPortal((
    <div className="fixed inset-0 z-[60] bg-ink/30 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setOpen(false)}>
      <div className="bg-card rounded-2xl shadow-2xl border border-line w-[600px] max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 py-3 border-b border-line shrink-0">
          <span className="text-sm font-semibold text-ink">{t('memory.managerTitle')}</span>
          <span className="text-2xs text-ink-faint flex-1">{fmt(t('memory.hint'), { n: memories.length })}</span>
          <button onClick={() => setOpen(false)} className="text-ink-faint hover:text-ink w-7 h-7 rounded-lg hover:bg-wash flex items-center justify-center transition-colors shrink-0">
            <X size={15} strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3 space-y-2">
          {memories.length === 0 && !importing && (
            <p className="text-xs text-ink-faint italic py-2">{t('memory.empty')}</p>
          )}
          {memories.map((m) => (
            <div key={m.id} className="border border-line rounded-xl px-3 py-2 bg-surface group">
              <div className="flex items-start gap-2">
                <textarea
                  defaultValue={m.text}
                  onBlur={(e) => commit(m.id, e.target.value)}
                  rows={1}
                  className="flex-1 text-sm text-ink bg-transparent focus:outline-none resize-y leading-relaxed"
                />
                <button
                  onClick={() => setMemories(memories.filter((x) => x.id !== m.id))}
                  title={t('common.delete')}
                  className="text-ink-faint hover:text-red-500 w-6 h-6 rounded-full flex items-center justify-center transition-colors shrink-0 opacity-0 group-hover:opacity-100"
                >
                  <Trash2 size={13} strokeWidth={1.75} />
                </button>
              </div>
              <p className="text-2xs text-ink-faint mt-1 font-mono">
                {kindLabel(m.kind)}{m.project ? ` · ${m.project}` : ''} · {m.at.slice(0, 10)}
              </p>
            </div>
          ))}
          {importing && (
            <div className="border border-accent/40 rounded-xl px-3 py-2 bg-surface space-y-2">
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={t('memory.importPlaceholder')}
                rows={5}
                autoFocus
                className="w-full text-xs text-ink bg-transparent focus:outline-none resize-y leading-relaxed placeholder-ink-faint"
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setImporting(false)} className="text-xs text-ink-muted hover:text-ink px-3 py-1 rounded-lg hover:bg-wash transition-colors">{t('common.cancel')}</button>
                <button onClick={doImport} className="text-xs bg-accent text-white px-3 py-1 rounded-lg">{t('memory.importConfirm')}</button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 px-5 py-3 border-t border-line shrink-0">
          <button onClick={add} className="flex items-center gap-1.5 text-xs text-accent hover:bg-accent/10 px-3 py-1.5 rounded-lg transition-colors">
            <Plus size={14} strokeWidth={1.75} /> {t('memory.add')}
          </button>
          <button onClick={() => setImporting(true)} className="text-xs text-ink-muted hover:text-ink hover:bg-wash px-3 py-1.5 rounded-lg transition-colors">
            {t('memory.import')}
          </button>
          <div className="flex-1" />
          {memories.length > 0 && (
            <button onClick={doExport} className="flex items-center gap-1.5 text-2xs text-ink-faint hover:text-ink-muted transition-colors" title={t('memory.exportTitle')}>
              <Download size={12} strokeWidth={1.75} /> {t('memory.export')}
            </button>
          )}
        </div>
      </div>
    </div>
  ), document.body);
}
