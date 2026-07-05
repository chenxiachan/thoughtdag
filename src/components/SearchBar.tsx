import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useStore } from '../store';
import { useT, fmt } from '../i18n';

// Cmd+F node search: filter nodes by question/response/summary, arrow keys
// to move through matches, Enter (or click) pans the canvas to the node.
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

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return nodes
      .filter((n) =>
        n.data.question.toLowerCase().includes(q) ||
        (n.data.response || '').toLowerCase().includes(q) ||
        (n.data.summary || '').toLowerCase().includes(q))
      .slice(0, 30);
  }, [nodes, query]);

  if (!open) return null;

  const locate = (id: string) => { onLocate(id); };

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 w-[440px]">
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
              if (e.key === 'Enter' && matches[cursor]) { e.preventDefault(); locate(matches[cursor].id); }
            }}
            placeholder={t('search.placeholder')}
            className="flex-1 bg-transparent text-sm text-ink placeholder-ink-faint focus:outline-none"
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
            {matches.map((n, i) => (
              <li key={n.id}>
                <button
                  onClick={() => locate(n.id)}
                  onMouseEnter={() => setCursor(i)}
                  className={`w-full text-left px-4 py-2 transition-colors ${i === cursor ? 'bg-accent/8' : ''}`}
                >
                  <p className={`text-xs font-medium truncate ${i === cursor ? 'text-accent' : 'text-ink'}`}>
                    {n.data.question || '—'}
                  </p>
                  <p className="text-2xs text-ink-faint truncate mt-0.5">
                    {(n.data.summary || n.data.response || '').replace(/[#*`>]/g, '').slice(0, 90)}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
