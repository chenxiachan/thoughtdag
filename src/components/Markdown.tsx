import { createContext, memo, useContext, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import { Check, Copy } from 'lucide-react';
import { fuzzyHighlightRegex } from '../lib/highlight-match';
import { useT } from '../i18n';
import { localPathOf, openLocalPath, basenameOf } from '../lib/local-path';

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

// Links leave the card, never the app. A web URL opens a new tab (the
// desktop shell hands it to the system browser); a LOCAL path — a file
// or folder the agent named — opens on this machine and never becomes a
// web address. Either way the click does not reach the canvas as a node
// selection.
// The writer's working directory, when the text came from a session: a
// relative path in it resolves against this, not against the app.
const BaseContext = createContext<string | undefined>(undefined);

function Anchor(props: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const local = localPathOf(props.href, useContext(BaseContext));
  if (local) {
    return (
      <a
        {...props}
        title={local}
        data-local-path={local}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); void openLocalPath(local); }}
      />
    );
  }
  return <a {...props} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()} />;
}

// An image the agent produced shows inline, read from disk through the
// shell; where there is no disk (the browser) a chip names the file.
function LocalImage({ path, alt }: { path: string; alt?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  // no shell, no disk: the chip is final from the first paint
  const [failed, setFailed] = useState(() => !window.desktopLocal);
  useEffect(() => {
    const bridge = window.desktopLocal;
    if (!bridge) return;
    let live = true;
    void bridge.image(path).then((d) => { if (!live) return; if (d) setSrc(d); else setFailed(true); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [path]);
  if (src) {
    return <img src={src} alt={alt ?? basenameOf(path)} title={path} className="cursor-zoom-in nopan" onClick={(e) => { e.stopPropagation(); void openLocalPath(path); }} />;
  }
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs border border-line rounded-md px-1.5 py-0.5 font-mono nopan cursor-pointer ${failed ? 'text-ink-faint' : 'text-ink-muted'}`}
      title={path}
      data-local-image={path}
      onClick={(e) => { e.stopPropagation(); void openLocalPath(path); }}
    >
      🖼 {basenameOf(path)}
    </span>
  );
}

function Img(props: React.ImgHTMLAttributes<HTMLImageElement>) {
  const local = localPathOf(props.src, useContext(BaseContext));
  if (local) return <LocalImage path={local} alt={props.alt} />;
  return <img {...props} />;
}

const COMPONENTS = { pre: Pre, table: Table, a: Anchor, img: Img };

// Standard markdown rendering (GFM + math + syntax highlighting).
// memo: the unified parse + KaTeX layout is the most expensive render on a
// card, and cards re-render far more often than their text changes (every
// streamed chunk anywhere re-renders every card). Same string → skip.
export const Markdown = memo(function Markdown({ children, base }: { children: string; base?: string }) {
  return (
    <BaseContext.Provider value={base}>
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={COMPONENTS}>
        {normalizeMath(children)}
      </ReactMarkdown>
    </BaseContext.Provider>
  );
});

const MARK_OPEN = '<mark class="bg-amber-100 text-amber-800 px-0.5 rounded">';

// A match spanning list items / paragraphs / table cells cannot live in
// ONE <mark>: an inline tag wrapped around "\n- item" breaks the block
// parse, and a tag swallowing a table's "|" breaks the row into mismatched
// cells. Wrap each line's CONTENT separately — list/quote/heading prefixes
// and cell pipes stay OUTSIDE the tag; table delimiter rows pass untouched.
function wrapLine(line: string, open: string): string {
  const parsed = line.match(/^(\s*(?:(?:\d{1,3}[.)]|[-*+>]|#{1,6})\s+)*)(.*)$/);
  const prefix = parsed?.[1] ?? '';
  const rest = parsed?.[2] ?? line;
  if (!rest.trim()) return line;
  if (rest.includes('|')) {
    if (/^[\s|:-]+$/.test(rest)) return line; // |---|---| delimiter row
    return prefix + rest
      .split('|')
      .map((cell) => cell.trim()
        ? cell.replace(/^(\s*)([\s\S]*?)(\s*)$/, (_, a, c, b) => `${a}${open}${c}</mark>${b}`)
        : cell)
      .join('|');
  }
  return `${prefix}${open}${rest}</mark>`;
}

function wrapMatch(m: string, open: string): string {
  if (!m.includes('\n') && !m.includes('|')) return `${open}${m}</mark>`;
  return m.split('\n').map((l) => wrapLine(l, open)).join('\n');
}

const escapeAttr = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A passage a child branch explores from: rendered as a warm dotted
    underline (structural trace), never a fill (fills belong to the user's
    own highlights). data-explore-target lets hosts delegate clicks. */
export interface ExploreMarkSpec { text: string; nodeId: string; title: string }

// Markdown with user highlights (and explore traces) wrapped in <mark>
// before rendering. Callers rebuild the Set/array props every render, so
// memo compares by CONTENT (see areMarkPropsEqual below).
export const HighlightedMarkdown = memo(function HighlightedMarkdown({ content, highlights, exploreMarks }: { content: string; highlights: Set<string>; exploreMarks?: ExploreMarkSpec[] }) {
  // Fuzzy-locate every span in the CLEAN markdown source first, then splice
  // tags in back-to-front. A second replace pass over already-tagged text
  // would let the fuzzy noise classes swallow pieces of the inserted tags
  // (`>` is legal markdown noise, so a match can start ON a tag's closing
  // bracket) and emit broken HTML — locating on the pristine source makes
  // that impossible. Selections come from the RENDERED text and cross
  // bold/list/line-break syntax; wrapping the matched source verbatim keeps
  // its markdown rendering inside <mark>.
  const spans: { start: number; end: number; open: string; prio: number }[] = [];
  const collect = (text: string, open: string, prio: number) => {
    const re = fuzzyHighlightRegex(text);
    if (!re) return;
    for (const m of content.matchAll(re)) {
      if (m[0]) spans.push({ start: m.index!, end: m.index! + m[0].length, open, prio });
    }
  };
  for (const h of highlights) collect(h, MARK_OPEN, 0);
  for (const em of exploreMarks ?? []) {
    collect(em.text, `<mark class="explore-mark" data-explore-target="${escapeAttr(em.nodeId)}" title="${escapeAttr(em.title)}">`, 1);
  }
  // Overlaps: the user's own highlight outranks the structural trace.
  spans.sort((a, b) => a.prio - b.prio || a.start - b.start);
  const kept: typeof spans = [];
  for (const s of spans) {
    if (kept.some((k) => s.start < k.end && k.start < s.end)) continue;
    kept.push(s);
  }
  kept.sort((a, b) => b.start - a.start); // splice back-to-front so offsets hold
  let processed = content;
  for (const s of kept) {
    processed = processed.slice(0, s.start) + wrapMatch(processed.slice(s.start, s.end), s.open) + processed.slice(s.end);
  }
  return <Markdown>{processed}</Markdown>;
}, areMarkPropsEqual);

type HMProps = { content: string; highlights: Set<string>; exploreMarks?: ExploreMarkSpec[] };
function areMarkPropsEqual(prev: HMProps, next: HMProps): boolean {
  if (prev.content !== next.content) return false;
  if (prev.highlights.size !== next.highlights.size) return false;
  for (const h of prev.highlights) if (!next.highlights.has(h)) return false;
  const a = prev.exploreMarks ?? [];
  const b = next.exploreMarks ?? [];
  if (a.length !== b.length) return false;
  return a.every((m, i) => m.text === b[i].text && m.nodeId === b[i].nodeId && m.title === b[i].title);
}
