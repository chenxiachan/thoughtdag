// HTML materials: parse → sanitize (scripts never execute) → slide detection
// → Markdown with tdag-page markers, all in the browser. The extracted
// Markdown is the ONLY thing a model ever sees; raw source serves the
// reader's original view. Heavy converters load lazily — non-HTML users
// never pay for them (same pattern as mammoth for .docx).

export interface HtmlExtraction {
  markdown: string;
  numPages?: number;
  title?: string;
}

export interface ReaderPage {
  page: number | null;
  srcdoc: string;
}

export interface HtmlSourceOptions {
  /** Set for fetched web pages: relative URLs get absolutized against it and
   *  external stylesheets survive (a saved page without its CSS is a wall of
   *  unstyled text). Local .html files leave it unset — decks embed styles,
   *  and their relative paths point nowhere anyway. */
  baseUrl?: string;
}

async function sanitize(source: string, opts?: HtmlSourceOptions): Promise<Document> {
  const { default: DOMPurify } = await import('dompurify');
  const clean = DOMPurify.sanitize(source, {
    WHOLE_DOCUMENT: true,
    ADD_TAGS: ['style'],
    // scripts/handlers go regardless; meta/base close off URL rebasing.
    // link stays only for remote snapshots (filtered to stylesheets below)
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'base', 'meta', ...(opts?.baseUrl ? [] : ['link'])],
  });
  const doc = new DOMParser().parseFromString(clean, 'text/html');
  if (opts?.baseUrl) rebaseUrls(doc, opts.baseUrl);
  return doc;
}

/** Make a fetched page renderable away from home: absolutize the URLs the
 *  reader will actually dereference, keep only stylesheet links, drop
 *  srcset (relative candidates would override the fixed src). */
function rebaseUrls(doc: Document, baseUrl: string): void {
  const abs = (v: string): string | null => {
    try {
      const u = new URL(v, baseUrl);
      return /^https?:$/.test(u.protocol) ? u.href : null;
    } catch {
      return null;
    }
  };
  doc.querySelectorAll('link').forEach((l) => {
    const href = l.getAttribute('href');
    const a = href ? abs(href) : null;
    if ((l.getAttribute('rel') ?? '').toLowerCase() !== 'stylesheet' || !a) l.remove();
    else l.setAttribute('href', a);
  });
  for (const [sel, attr] of [['img', 'src'], ['source', 'src'], ['video', 'poster'], ['a', 'href']] as const) {
    doc.querySelectorAll(`${sel}[${attr}]`).forEach((el) => {
      const v = el.getAttribute(attr);
      const a = v ? abs(v) : null;
      if (a) el.setAttribute(attr, a);
      else el.removeAttribute(attr);
    });
  }
  doc.querySelectorAll('img[srcset], source[srcset]').forEach((el) => el.removeAttribute('srcset'));
}

async function makeTurndown() {
  const [{ default: TurndownService }, gfmMod] = await Promise.all([
    import('turndown'),
    import('@joplin/turndown-plugin-gfm'),
  ]);
  const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', hr: '---' });
  td.use(gfmMod.gfm);
  td.remove(['style', 'script', 'noscript', 'title']);
  return td;
}

function hasSubstance(el: Element): boolean {
  return (el.textContent ?? '').trim().length > 0 || !!el.querySelector('img,svg,canvas,video');
}

/** Deck heuristics, conservative → generic. Returns slide elements in
 *  document order, or null when the file reads as one continuous page.
 *  Known false positive: an article embedding a ≥2-item ".slide" carousel
 *  reads as a deck — degraded (sectioned) but not broken. */
export function detectSlides(doc: Document): Element[] | null {
  // reveal-style structure; nested sections are vertical stacks — flatten
  const reveal = Array.from(doc.querySelectorAll('.reveal .slides > section'));
  if (reveal.length >= 2) {
    const flat: Element[] = [];
    for (const s of reveal) {
      const nested = Array.from(s.children).filter((c) => c.tagName === 'SECTION');
      if (nested.length > 0) flat.push(...nested);
      else flat.push(s);
    }
    return flat;
  }
  // generic decks: the largest same-parent sibling group whose class names
  // say slide/page ("slide-3" yes, "slides"/"slideshow" wrappers no)
  const groups = new Map<Element, Element[]>();
  for (const el of Array.from(doc.body?.querySelectorAll('[class]') ?? [])) {
    const cls = el.getAttribute('class') ?? '';
    if (!/(?:^|[\s_-])(?:slide|page)(?:[\s_-]|$)/i.test(cls)) continue;
    if (!hasSubstance(el)) continue;
    const parent = el.parentElement;
    if (!parent) continue;
    const g = groups.get(parent) ?? [];
    g.push(el);
    groups.set(parent, g);
  }
  let best: Element[] | null = null;
  for (const g of groups.values()) if (g.length >= 2 && (!best || g.length > best.length)) best = g;
  if (best) return best;
  // plain sectioned decks: repeated top-level sections
  const sections = Array.from(doc.querySelectorAll('body > section')).filter(hasSubstance);
  if (sections.length >= 3) return sections;
  return null;
}

/** The extraction pipeline: deck → per-slide Markdown with tdag-page
 *  markers (the same markers PDF extraction uses, so the text view's page
 *  sections and p.N provenance ride for free); article → Defuddle main
 *  content, falling back to a boilerplate-stripped body conversion. */
export async function extractHtmlMaterial(source: string, opts?: HtmlSourceOptions): Promise<HtmlExtraction> {
  const doc = await sanitize(source, opts);
  const td = await makeTurndown();

  const slides = detectSlides(doc);
  if (slides) {
    const parts = slides.map(
      (s, i) => `<!-- tdag-page:${i + 1} -->\n\n${td.turndown((s.cloneNode(true) as Element).outerHTML).trim()}`,
    );
    return { markdown: parts.join('\n\n').trim(), numPages: slides.length, title: doc.title || undefined };
  }

  let title = doc.title || undefined;
  let contentHtml: string | null = null;
  try {
    const { default: Defuddle } = await import('defuddle');
    const res = new Defuddle(doc.cloneNode(true) as Document).parse();
    // an over-aggressive extraction is worse than none — fall through
    if (res?.content && res.content.replace(/<[^>]+>/g, ' ').trim().length > 40) {
      contentHtml = res.content;
      if (res.title) title = res.title;
    }
  } catch {
    /* fall through to the body conversion */
  }
  if (contentHtml == null && doc.body) {
    const body = doc.body.cloneNode(true) as HTMLElement;
    body.querySelectorAll('script,style,noscript,nav,header,footer,aside').forEach((n) => n.remove());
    contentHtml = body.innerHTML;
  }
  return { markdown: contentHtml ? td.turndown(contentHtml).trim() : '', title };
}

// ── reader pages: sanitized HTML rendered per page in same-origin,
// script-less iframes (selection readable, styles isolated, nothing runs) ──

const BASE_CSS = [
  ':root{color-scheme:light}',
  'html,body{margin:0;padding:0;overflow-x:hidden}',
  // ancestor shells exist so the deck's descendant selectors still match a
  // detached slide; their own sizing/positioning must not (they were built
  // for a stage, we render a scroll)
  '[data-tdag-shell]{position:static !important;transform:none !important;width:auto !important;height:auto !important;min-height:0 !important;max-height:none !important;overflow:visible !important;display:block !important;margin:0 !important;padding:0 !important}',
  '[data-tdag-slide]{display:block !important;visibility:visible !important;opacity:1 !important;position:relative !important;inset:auto !important;transform:none !important;margin:0 auto !important}',
].join('\n');

function escapeAttr(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function shellWrap(el: Element, inner: string): string {
  const tag = el.tagName.toLowerCase();
  const attrs = ['class', 'id', 'style']
    .map((a) => {
      const v = el.getAttribute(a);
      return v ? ` ${a}="${escapeAttr(v)}"` : '';
    })
    .join('');
  return `<${tag}${attrs} data-tdag-shell>${inner}</${tag}>`;
}

function pageDoc(styles: string, bodyHtml: string, bodyClass?: string | null, bodyStyle?: string | null): string {
  const cls = bodyClass ? ` class="${escapeAttr(bodyClass)}"` : '';
  const bst = bodyStyle ? ` style="${escapeAttr(bodyStyle)}"` : '';
  return `<!doctype html><html><head><meta charset="utf-8">${styles}<style>${BASE_CSS}</style></head><body${cls}${bst}>${bodyHtml}</body></html>`;
}

export async function buildReaderPages(source: string, opts?: HtmlSourceOptions): Promise<ReaderPage[]> {
  const doc = await sanitize(source, opts);
  const styles = Array.from(doc.querySelectorAll('style, link[rel="stylesheet" i]')).map((s) => s.outerHTML).join('\n');
  const bodyClass = doc.body?.getAttribute('class');
  const bodyStyle = doc.body?.getAttribute('style');
  const slides = detectSlides(doc);
  if (!slides) {
    return [{ page: null, srcdoc: pageDoc(styles, doc.body?.innerHTML ?? '', bodyClass, bodyStyle) }];
  }
  return slides.map((slide, i) => {
    const copy = slide.cloneNode(true) as Element;
    copy.setAttribute('data-tdag-slide', '');
    let html = copy.outerHTML;
    for (let anc = slide.parentElement; anc && anc !== doc.body && anc.tagName !== 'HTML'; anc = anc.parentElement) {
      html = shellWrap(anc, html);
    }
    return { page: i + 1, srcdoc: pageDoc(styles, html, bodyClass, bodyStyle) };
  });
}
