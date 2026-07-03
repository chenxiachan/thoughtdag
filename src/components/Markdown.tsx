import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';

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
  let processed = content;
  for (const h of highlights) {
    const escaped = h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    processed = processed.replace(new RegExp(escaped, 'g'), `<mark class="bg-amber-100 text-amber-800 px-0.5 rounded">${h}</mark>`);
  }
  return <Markdown>{processed}</Markdown>;
}
