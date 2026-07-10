import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import { fuzzyHighlightRegex } from '../lib/highlight-match';

const REMARK_PLUGINS = [remarkGfm, remarkMath];
const REHYPE_PLUGINS = [rehypeRaw, rehypeHighlight, rehypeKatex];

// Standard markdown rendering (GFM + math + syntax highlighting).
export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS}>
      {children}
    </ReactMarkdown>
  );
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
    processed = processed.replace(re, (m) => `<mark class="bg-amber-100 text-amber-800 px-0.5 rounded">${m}</mark>`);
  }
  return <Markdown>{processed}</Markdown>;
}
