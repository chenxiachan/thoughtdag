import { useEffect, useMemo, useState } from 'react';
import { AtSign, X } from 'lucide-react';
import { useStore } from '../../store';
import { useT } from '../../i18n';
import { nodeMentionTitle, type MentionState } from '../../lib/mentions';

/** The @-picker (rendered right above the textarea) plus the attached
    chips row. Keyboard handling registers back into the mention state so
    the host textarea can defer to the picker while it is open. */
export default function MentionSurface({ m, text, setText }: {
  m: MentionState; text: string; setText: (v: string) => void;
}) {
  const nodes = useStore((s) => s.nodes);
  const t = useT();
  const [active, setActive] = useState(0);

  const candidates = useMemo(() => {
    if (m.query === null) return [];
    const q = m.query.toLowerCase();
    return nodes
      .filter((n) => n.id !== m.selfNodeId
        && n.data.stepKind !== 'frame'
        && (n.data.question || n.data.response)
        && !m.mentions.some((x) => x.nodeId === n.id))
      .filter((n) => !q
        || n.data.question.toLowerCase().includes(q)
        || n.data.response.toLowerCase().includes(q))
      .slice(0, 6);
  }, [nodes, m.query, m.selfNodeId, m.mentions]);

  useEffect(() => {
    m.setKeyHandler((e) => {
      if (m.query === null || candidates.length === 0) return false;
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % candidates.length); return true; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + candidates.length) % candidates.length); return true; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); m.pick(candidates[Math.min(active, candidates.length - 1)], text, setText); setActive(0); return true; }
      if (e.key === 'Escape') { e.preventDefault(); m.close(); return true; }
      return false;
    });
  });

  return (
    <>
      {m.query !== null && candidates.length > 0 && (
        <div className="absolute bottom-full mb-1.5 left-0 right-0 z-30 bg-card border border-line rounded-xl shadow-lg py-1 max-h-[220px] overflow-y-auto animate-fade-in nodrag nopan">
          <div className="px-3 py-1 text-2xs text-ink-faint flex items-center gap-1">
            <AtSign size={11} strokeWidth={1.75} /> {t('mention.hint')}
          </div>
          {candidates.map((n, i) => (
            <button
              key={n.id}
              onMouseDown={(e) => { e.preventDefault(); m.pick(n, text, setText); setActive(0); }}
              onMouseEnter={() => setActive(i)}
              className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors ${i === active ? 'bg-accent/10 text-accent' : 'text-ink hover:bg-wash'}`}
            >
              <span className="truncate flex-1">{nodeMentionTitle(n)}</span>
              {n.data.stepKind && <span className="text-2xs text-ink-faint shrink-0">{n.data.stepKind}</span>}
            </button>
          ))}
        </div>
      )}
      {m.mentions.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {m.mentions.map((x) => (
            <span key={x.nodeId} className="inline-flex items-center gap-1 text-2xs bg-accent/10 text-accent rounded-full pl-2 pr-1 py-0.5 max-w-[220px]" data-mention-chip>
              <AtSign size={10} strokeWidth={2} className="shrink-0" />
              <span className="truncate">{x.title}</span>
              <button
                onMouseDown={(e) => { e.preventDefault(); m.remove(x.nodeId); }}
                className="w-3.5 h-3.5 rounded-full hover:bg-accent/20 flex items-center justify-center shrink-0"
              >
                <X size={9} strokeWidth={2.5} />
              </button>
            </span>
          ))}
        </div>
      )}
    </>
  );
}
