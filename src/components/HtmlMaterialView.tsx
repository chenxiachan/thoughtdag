import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { Attachment } from '../types';
import { buildReaderPages, type ReaderPage } from '../lib/html-material';
import { toast } from '../lib/ui-store';
import { useT } from '../i18n';

// The original view for HTML materials: sanitized pages rendered in
// same-origin, script-less iframes — the file's own styles apply, nothing
// executes, and selections are readable across the frame boundary. Decks
// stack vertically with p.N separators (the wrapper divs carry data-page,
// so the reader's jumpToPage and the selection→anchor flow both work
// unchanged); articles render as one continuous page. Clip mode mirrors
// PdfPage: a rubber band in page-fraction space; the pixels come from
// rasterizing the frame's DOM (html-to-image) since, unlike a PDF page,
// there is no ready-made canvas to crop.

export interface HtmlSelection {
  text: string;
  page: number | null;
  x: number;
  y: number;
}

export function HtmlMaterialView({ att, onSelect, clipMode, onClipped, baseUrl }: {
  att: Attachment;
  onSelect: (sel: HtmlSelection | null) => void;
  clipMode?: boolean;
  onClipped?: (pageNo: number, rect: [number, number, number, number], dataUrl: string, screenRect?: { left: number; top: number; width: number; height: number }) => void;
  /** set for link snapshots: relative URLs resolve against the source page */
  baseUrl?: string;
}) {
  const t = useT();
  const [pages, setPages] = useState<ReaderPage[] | null>(null);
  const [failed, setFailed] = useState(false);

  // the reader mounts this view keyed by attachment id — content is fixed
  // for the lifetime of one instance, so a single build is enough
  useEffect(() => {
    let dead = false;
    buildReaderPages(att.content, baseUrl ? { baseUrl } : undefined)
      .then((p) => { if (!dead) setPages(p); })
      .catch(() => { if (!dead) setFailed(true); });
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (failed) {
    return <p className="text-sm text-ink-faint italic py-10 text-center">{t('reader.htmlNoText')}</p>;
  }
  if (!pages) {
    return (
      <div className="flex items-center justify-center gap-2 h-full min-h-[200px] text-sm text-ink-muted">
        <Loader2 size={16} strokeWidth={1.75} className="animate-spin text-accent" /> {t('reader.loading')}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center py-6 px-4">
      {pages.map((p) => (
        <div key={p.page ?? 0} data-page={p.page ?? undefined} className="w-full max-w-[860px]">
          {p.page != null && (
            <div className="text-2xs text-ink-faint font-mono text-center select-none pt-4 pb-2">— p.{p.page} —</div>
          )}
          <PageFrame srcdoc={p.srcdoc} page={p.page} onSelect={onSelect} clipMode={clipMode} onClipped={onClipped} clipFailedText={t('reader.clipFailed')} />
        </div>
      ))}
    </div>
  );
}

function PageFrame({ srcdoc, page, onSelect, clipMode, onClipped, clipFailedText }: {
  srcdoc: string;
  page: number | null;
  onSelect: (sel: HtmlSelection | null) => void;
  clipMode?: boolean;
  onClipped?: (pageNo: number, rect: [number, number, number, number], dataUrl: string, screenRect?: { left: number; top: number; width: number; height: number }) => void;
  clipFailedText: string;
}) {
  const holderRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(120);
  // clip-mode rubber band, in page-fraction space (same grammar as PdfPage)
  const [band, setBand] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [clipping, setClipping] = useState(false);

  const handleLoad = () => {
    const frame = ref.current;
    const idoc = frame?.contentDocument;
    if (!frame || !idoc?.body) return;
    // fixed-width decks (1280px stages) shrink to the column; measure after
    const bw = idoc.body.scrollWidth || idoc.documentElement.scrollWidth;
    const cw = frame.clientWidth;
    if (bw > cw + 2) (idoc.body.style as CSSStyleDeclaration & { zoom: string }).zoom = String(cw / bw);
    setHeight(Math.max(40, idoc.documentElement.scrollHeight + 2));

    idoc.addEventListener('mouseup', () => {
      const sel = frame.contentWindow?.getSelection();
      // a plain click inside the page dismisses the ask bar, same as the
      // reader body (whose own mouseup never hears frame-internal clicks)
      if (!sel || sel.isCollapsed) { onSelect(null); return; }
      const text = sel.toString().replace(/\s+/g, ' ').trim();
      if (text.length < 2) return;
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      const fr = frame.getBoundingClientRect();
      onSelect({ text, page, x: fr.left + rect.left + rect.width / 2, y: fr.top + rect.bottom });
    });
  };

  const frac = (e: React.MouseEvent) => {
    const pb = holderRef.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - pb.left) / pb.width)), y: Math.min(1, Math.max(0, (e.clientY - pb.top) / pb.height)) };
  };

  const finishClip = () => {
    if (!band || clipping) { setBand(null); return; }
    const x = Math.min(band.x0, band.x1), y = Math.min(band.y0, band.y1);
    const w = Math.abs(band.x1 - band.x0), h = Math.abs(band.y1 - band.y0);
    setBand(null);
    if (w < 0.02 || h < 0.01) return; // a stray click, not a capture
    const idoc = ref.current?.contentDocument;
    if (!idoc?.documentElement || !onClipped) return;
    setClipping(true);
    (async () => {
      // rasterize the whole page once, then crop in fraction space — the
      // fractions hold whatever internal scale the rasterizer chose
      const { toCanvas } = await import('html-to-image');
      const src = await toCanvas(idoc.documentElement, { pixelRatio: 2 });
      const sx = Math.floor(x * src.width), sy = Math.floor(y * src.height);
      const sw = Math.max(1, Math.floor(w * src.width)), sh = Math.max(1, Math.floor(h * src.height));
      const out = document.createElement('canvas');
      out.width = sw;
      out.height = sh;
      out.getContext('2d')!.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
      const pb = holderRef.current!.getBoundingClientRect();
      const screenRect = { left: pb.left + x * pb.width, top: pb.top + y * pb.height, width: w * pb.width, height: h * pb.height };
      onClipped(page ?? 1, [x, y, w, h], out.toDataURL('image/png'), screenRect);
    })()
      .catch(() => toast('error', clipFailedText))
      .finally(() => setClipping(false));
  };

  return (
    <div ref={holderRef} className="relative">
      <iframe
        ref={ref}
        sandbox="allow-same-origin"
        srcDoc={srcdoc}
        onLoad={handleLoad}
        style={{ height }}
        className="w-full border-0 bg-white shadow-md rounded-sm"
        // aria-label, not title: a title tooltip pops on hover anywhere over
        // the page surface — reader noise
        aria-label={page != null ? `p.${page}` : 'document'}
      />
      {clipMode && (
        <div
          className="absolute inset-0 cursor-crosshair"
          style={{ zIndex: 6 }}
          data-clip-overlay={page ?? 1}
          onMouseDown={(e) => { e.preventDefault(); const p = frac(e); setBand({ x0: p.x, y0: p.y, x1: p.x, y1: p.y }); }}
          onMouseMove={(e) => { if (band) { const p = frac(e); setBand({ ...band, x1: p.x, y1: p.y }); } }}
          onMouseUp={finishClip}
          onMouseLeave={() => { if (band) finishClip(); }}
        >
          {clipping && (
            <div className="absolute top-2 right-2 flex items-center gap-1.5 text-2xs text-warm bg-card/95 border border-line rounded-lg px-2 py-1 shadow-sm">
              <Loader2 size={11} strokeWidth={1.75} className="animate-spin" />
            </div>
          )}
          {band && (
            <div
              className="absolute border-2 border-warm bg-warm/10 rounded-sm pointer-events-none"
              style={{
                left: `${Math.min(band.x0, band.x1) * 100}%`,
                top: `${Math.min(band.y0, band.y1) * 100}%`,
                width: `${Math.abs(band.x1 - band.x0) * 100}%`,
                height: `${Math.abs(band.y1 - band.y0) * 100}%`,
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
