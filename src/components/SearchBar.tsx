import { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, FileText, Frame, Link2, MessageSquare, Minimize2, Search, StickyNote, X } from 'lucide-react';
import { useStore } from '../store';
import { useUiStore } from '../lib/ui-store';
import { searchCanvas, type SearchHit } from '../lib/canvas-search';
import { isImeComposing } from '../utils';
import { useT, fmt } from '../i18n';

// The canvas searchlight (Cmd+F, or the toolbar icon). Exact search over
// everything a node remembers — questions, active answers, note bodies,
// highlights, link titles, attachment names, plaque summaries — rendered as
// BOTH a result list and a canvas filter: hits stay lit, the rest dims out,
// so the search sharpens the map instead of teleporting past it. Picking a
// result flies there, opens the panel, and scrolls to the first occurrence.

const KIND_ICON = {
  qa: MessageSquare, note: StickyNote, file: FileText,
  link: Link2, frame: Frame, distill: Minimize2,
} as const;

const SHOW_LIMIT = 50;

export default function SearchBar({
  open,
  onClose,
  onLocate,
}: {
  open: boolean;
  onClose: () => void;
  onLocate: (nodeId: string) => void;
}) {
  const t = useT();
  const nodes = useStore((s) => s.nodes);
  const setHitIds = useUiStore((s) => s.setSearchHitIds);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset on open (render-time state sync, no effect cascade)
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) { setQuery(''); setCursor(0); }
  }
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query), 120);
    return () => clearTimeout(id);
  }, [query]);

  const matches: SearchHit[] = useMemo(
    () => (open ? searchCanvas(nodes, debounced) : []),
    [open, nodes, debounced],
  );

  // The searchlight follows the result set; closing lifts the filter.
  useEffect(() => {
    if (!open || !debounced.trim()) { setHitIds(null); return; }
    setHitIds(new Set(matches.map((m) => m.nodeId)));
  }, [open, debounced, matches, setHitIds]);
  useEffect(() => () => setHitIds(null), [setHitIds]);

  if (!open) return null;

  const locate = (hit: SearchHit) => {
    onLocate(hit.nodeId);
    // last mile: once the panel opens, scroll to the first occurrence and
    // flash it — finding the node is not yet finding the words
    const q = debounced.trim().toLowerCase();
    setTimeout(() => {
      const panel = document.querySelector('[data-focus-panel]');
      if (!panel || !q) return;
      const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
      let tn: Node | null;
      while ((tn = walker.nextNode())) {
        if (tn.textContent?.toLowerCase().includes(q)) {
          const el = tn.parentElement;
          el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
          el?.animate(
            [{ backgroundColor: 'rgba(107, 92, 231, 0.22)' }, { backgroundColor: 'transparent' }],
            { duration: 1800, easing: 'ease-out' },
          );
          break;
        }
      }
    }, 500);
  };

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 w-[460px]" data-canvas-search>
      <div className="bg-card border border-line rounded-xl shadow-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 transition-shadow focus-within:ring-1 focus-within:ring-accent/40">
          <Search size={15} strokeWidth={1.75} className="text-ink-faint shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setCursor(0); }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
              if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, matches.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
              if (e.key === 'Enter' && !isImeComposing(e) && matches[cursor]) { e.preventDefault(); locate(matches[cursor]); }
            }}
            placeholder={t('search.placeholder')}
            className="flex-1 bg-transparent text-sm text-ink placeholder-ink-faint focus:outline-none"
            data-search-input
          />
          {query && (
            <span className="text-2xs text-ink-faint shrink-0">
              {fmt(t('search.count'), { n: matches.length })}
            </span>
          )}
          <button onClick={onClose} className="text-ink-faint hover:text-ink transition-colors shrink-0">
            <X size={14} strokeWidth={1.75} />
          </button>
        </div>

        {matches.length > 0 && (
          <ul className="border-t border-line/60 max-h-72 overflow-y-auto py-1">
            {matches.slice(0, SHOW_LIMIT).map((m, i) => {
              const Icon = KIND_ICON[m.kind];
              const node = nodes.find((n) => n.id === m.nodeId);
              const title = node?.data.question || '—';
              return (
                <li key={m.nodeId}>
                  <button
                    onClick={() => locate(m)}
                    onMouseEnter={() => setCursor(i)}
                    className={`w-full text-left px-4 py-2 transition-colors ${i === cursor ? 'bg-accent/8' : ''} ${m.archived ? 'opacity-55' : ''}`}
                    data-search-hit-row
                  >
                    <p className={`text-xs font-medium truncate flex items-center gap-1.5 ${i === cursor ? 'text-accent' : 'text-ink'}`}>
                      <Icon size={12} strokeWidth={1.75} className="text-ink-faint shrink-0" />
                      <span className="truncate flex-1 min-w-0">{title}</span>
                      {m.archived && <Archive size={11} strokeWidth={1.75} className="text-ink-faint shrink-0" />}
                      {m.count > 1 && <span className="text-2xs text-ink-faint font-normal shrink-0">×{m.count}</span>}
                    </p>
                    <p className="text-2xs text-ink-faint mt-0.5 break-all leading-relaxed">
                      {m.snippet.slice(0, m.matchStart)}
                      <mark className="bg-accent/20 text-accent rounded-sm px-px">
                        {m.snippet.slice(m.matchStart, m.matchStart + m.matchLen)}
                      </mark>
                      {m.snippet.slice(m.matchStart + m.matchLen)}
                    </p>
                  </button>
                </li>
              );
            })}
            {matches.length > SHOW_LIMIT && (
              <li className="px-4 py-2 text-2xs text-ink-faint">{fmt(t('search.more'), { n: matches.length - SHOW_LIMIT })}</li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
