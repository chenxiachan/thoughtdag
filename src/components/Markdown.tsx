import { useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import { Check, Copy } from 'lucide-react';
import { fuzzyHighlightRegex } from '../lib/highlight-match';
import { useT } from '../i18n';

const REMARK_PLUGINS = [remarkGfm, remarkMath];

// Models freely emit \( \) and \[ \] math delimiters; remark-math only
// parses $-style. Normalize outside code fences/spans so formulas render
// everywhere (cards, panel, rail, reader) instead of leaking raw.
function normalizeMath(src: string): string {
  if (!src || (!src.includes('\\(') && !src.includes('\\['))) return src;
  const parts = src.split(/(```[\s\S]*?```|`[^`\n]*`)/g);
  return parts
    .map((seg, i) => (i % 2 === 1 ? seg : seg
      .replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => `\n$$\n${m.trim()}\n$$\n`)
      .replace(/\\\((.+?)\\\)/g, (_, m) => `$${m.trim()}$`)))
    .join('');
}
const REHYPE_PLUGINS = [rehypeRaw, rehypeHighlight, rehypeKatex];

// Code blocks get a hover copy button (no toast: too frequent an action —
// the icon flashes a check instead).
function Pre(props: React.HTMLAttributes<HTMLPreElement>) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const t = useT();
  return (
    <div className="relative group/pre">
      <pre {...props} ref={ref} />
      <button
        onClick={(e) => {
          e.stopPropagation();
          void navigator.clipboard.writeText(ref.current?.innerText ?? '');
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        }}
        title={t('common.copyCode')}
        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-md bg-card/90 border border-line text-ink-faint hover:text-accent flex items-center justify-center opacity-0 group-hover/pre:opacity-100 transition-opacity nodrag nopan"
      >
        {copied ? <Check size={12} strokeWidth={2} className="text-green-600" /> : <Copy size={12} strokeWidth={1.75} />}
      </button>
    </div>
  );
}

// Wide tables scroll inside their own container instead of blowing the card
function Table(props: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table {...props} />
    </div>
  );
}

const COMPONENTS = { pre: Pre, table: Table };

// Standard markdown rendering (GFM + math + syntax highlighting).
export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={COMPONENTS}>
      {normalizeMath(children)}
    </ReactMarkdown>
  );
}

const MARK_OPEN = '<mark class="bg-amber-100 text-amber-800 px-0.5 rounded">';

// A match spanning list items / paragraphs cannot live in ONE <mark>: an
// inline tag wrapped around "\n- item" breaks the block parse (the list
// stops being a list, the tag never closes in its block). Wrap each line's
// CONTENT separately, leaving list/quote/heading prefixes outside the tag.
function wrapMatch(m: string): string {
  if (!m.includes('\n')) return `${MARK_OPEN}${m}</mark>`;
  return m
    .split('\n')
    .map((line) => {
      const parsed = line.match(/^(\s*(?:(?:\d{1,3}[.)]|[-*+>]|#{1,6})\s+)*)(.*)$/);
      const prefix = parsed?.[1] ?? '';
      const rest = parsed?.[2] ?? line;
      return rest.trim() ? `${prefix}${MARK_OPEN}${rest}</mark>` : line;
    })
    .join('\n');
}

// Markdown with user highlights wrapped in <mark> before rendering.
export function HighlightedMarkdown({ content, highlights }: { content: string; highlights: Set<string> }) {
  // Fuzzy-locate each highlight in the markdown source (selections come from
  // the RENDERED text and cross bold/list/line-break syntax); wrap the
  // matched source verbatim so its markdown keeps rendering inside <mark>.
  let processed = content;
  for (const h of highlights) {
    const re = fuzzyHighlightRegex(h);
    if (!re) continue;
    processed = processed.replace(re, wrapMatch);
  }
  return <Markdown>{processed}</Markdown>;
}
