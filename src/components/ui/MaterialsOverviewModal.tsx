import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, FileText, Image as ImageIcon, Link2, Paperclip, StickyNote, X } from 'lucide-react';
import { useStore } from '../../store';
import { useUiStore } from '../../lib/ui-store';
import { useT, fmt } from '../../i18n';

// Every material on the canvas, in one place — the sibling of the
// highlights overview. Attachments wherever they live (thought nodes and
// file nodes alike) plus note and link materials, two lenses (by time /
// by node), each row pinpointing its node and opening straight into the
// reader when there is something to read.

interface Entry {
  key: string;
  name: string;
  icon: 'pdf' | 'img' | 'txt' | 'note' | 'link';
  sizeKB?: number;
  at?: string;
  nodeId: string;
  nodeTitle: string;
  canOpen: boolean;
  showGroup?: boolean;
}

const ICONS = {
  pdf: FileText,
  img: ImageIcon,
  txt: FileText,
  note: StickyNote,
  link: Link2,
} as const;

export default function MaterialsOverviewModal({ onLocate }: { onLocate: (nodeId: string) => void }) {
  const open = useUiStore((s) => s.materialsOverviewOpen);
  const setOpen = useUiStore((s) => s.setMaterialsOverviewOpen);
  const nodes = useStore((s) => s.nodes);
  const t = useT();
  const [sort, setSort] = useState<'time' | 'node'>('time');

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = [];
    for (const n of nodes) {
      const kind = n.data.stepKind;
      if (kind === 'note' || kind === 'link') {
        const title = kind === 'link'
          ? (n.data.linkTitle || n.data.linkUrl || '—')
          : (n.data.question.split('\n')[0].replace(/^#+\s*/, '').slice(0, 60) || '—');
        out.push({ key: n.id, name: title, icon: kind, at: n.data.createdAt, nodeId: n.id, nodeTitle: title, canOpen: true });
        continue;
      }
      const holder = n.data.question.replace(/\s+/g, ' ').trim().slice(0, 60) || (kind === 'file' ? t('glyph.file') : '—');
      for (const a of n.data.attachments || []) {
        const icon = a.type === 'application/pdf' ? 'pdf' : a.type.startsWith('image/') ? 'img' : 'txt';
        out.push({
          key: a.id, name: a.name, icon,
          sizeKB: a.size / 1024, at: a.addedAt,
          nodeId: n.id, nodeTitle: holder,
          canOpen: icon === 'pdf',
        });
      }
    }
    const sorted = sort === 'time'
      ? [...out].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))
      : out;
    return sorted.map((e, i) => ({ ...e, showGroup: sort === 'node' && (i === 0 || sorted[i - 1].nodeTitle !== e.nodeTitle) }));
  }, [nodes, sort, t]);

  if (!open) return null;

  const close = () => setOpen(false);
  const openReader = (nodeId: string) => {
    close();
    useUiStore.getState().setReaderNodeId(nodeId);
  };

  const chip = 'shrink-0 text-2xs font-mono text-accent bg-accent/10 hover:bg-accent/20 rounded-full px-1.5 py-0.5 transition-colors';
  const sortBtn = (v: 'time' | 'node', label: string) => (
    <button
      onClick={() => setSort(v)}
      className={`text-2xs px-2.5 py-1 rounded-full transition-colors ${sort === v ? 'bg-accent/10 text-accent' : 'text-ink-faint hover:bg-wash'}`}
    >
      {label}
    </button>
  );

  return createPortal((
    <div className="fixed inset-0 z-[60] bg-ink/30 backdrop-blur-sm flex items-center justify-center p-6" onClick={close}>
      <div className="bg-card rounded-2xl shadow-2xl border border-line w-[640px] max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 py-3 border-b border-line shrink-0">
          <Paperclip size={15} strokeWidth={1.75} className="text-warm" />
          <span className="text-sm font-semibold text-ink">{t('matov.title')}</span>
          <span className="text-2xs text-ink-faint">{fmt(t('matov.count'), { n: entries.length })}</span>
          <div className="flex-1" />
          {sortBtn('time', t('hlov.byTime'))}
          {sortBtn('node', t('hlov.byNode'))}
          <button onClick={close} className="text-ink-faint hover:text-ink w-7 h-7 rounded-lg hover:bg-wash flex items-center justify-center transition-colors ml-1">
            <X size={15} strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3">
          {entries.length === 0 && <p className="text-xs text-ink-faint italic py-2">{t('matov.empty')}</p>}
          {entries.map((e) => {
            const Icon = ICONS[e.icon];
            return (
              <div key={e.key}>
                {e.showGroup && (
                  <div className="text-2xs text-ink-faint font-medium mt-3 mb-1 first:mt-0 truncate">{e.nodeTitle}</div>
                )}
                <div className="group flex items-center gap-2.5 py-1.5 border-b border-line/50 last:border-0">
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                    e.icon === 'note' ? 'bg-amber-100 text-amber-600' : e.icon === 'link' ? 'bg-cyan-100 text-cyan-700' : 'bg-wash text-ink-muted'
                  }`}>
                    <Icon size={14} strokeWidth={1.75} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-ink truncate">{e.name}</p>
                    <p className="text-2xs text-ink-faint">
                      {e.sizeKB != null ? `${e.sizeKB.toFixed(1)} KB` : t(`matov.kind.${e.icon}` as Parameters<typeof t>[0])}
                      {e.at ? ` · ${e.at.slice(0, 10)}` : ''}
                    </p>
                  </div>
                  {sort === 'time' && (
                    <button className={chip} onClick={() => { close(); onLocate(e.nodeId); }} title={t('hlov.locateTitle')}>
                      {e.nodeTitle.slice(0, 14)}{e.nodeTitle.length > 14 ? '…' : ''}
                    </button>
                  )}
                  {sort === 'node' && (
                    <button className={chip} onClick={() => { close(); onLocate(e.nodeId); }} title={t('hlov.locateTitle')}>
                      ↦
                    </button>
                  )}
                  {e.canOpen && (
                    <button
                      onClick={() => openReader(e.nodeId)}
                      title={t('attach.openReader')}
                      className="w-7 h-7 rounded-lg text-ink-faint hover:text-accent hover:bg-wash flex items-center justify-center transition-colors shrink-0"
                    >
                      <BookOpen size={14} strokeWidth={1.75} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  ), document.body);
}
