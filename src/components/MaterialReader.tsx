import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Link2, Loader2, Pencil, ScanText, Send, StickyNote, X } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { ThoughtNode } from '../types';
import { useStore } from '../store';
import { useUiStore } from '../lib/ui-store';
import { recognizePdfPages } from '../lib/content';
import { Markdown } from './Markdown';
import { isImeComposing } from '../utils';
import { useT, fmt } from '../i18n';

// MaterialReader: the reading overlay — a VIEW onto a material node, never a
// container. Select a passage (in the original PDF's text layer, or in the
// extracted Markdown copy) and ask: the question lands on the canvas
// IMMEDIATELY as a branch node wired to this material (the One Rule; nothing
// happens at close time). Scanned PDFs have no text layer, so the extracted
// copy is the readable surface there; "Recognize" rewrites page images into
// Markdown through the same visible-extraction channel image nodes use.

type Pdfjs = typeof import('pdfjs-dist');
let pdfjsPromise: Promise<Pdfjs> | null = null;
function loadPdfjs(): Promise<Pdfjs> {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]).then(([m, worker]) => {
      m.GlobalWorkerOptions.workerSrc = worker.default;
      return m;
    });
  }
  return pdfjsPromise;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const PAGE_MARK_SPLIT = /<!--\s*tdag-page:(\d+)\s*-->/;

/** Split the extracted copy on page markers so each section knows its page. */
function splitByPageMarks(text: string): { page: number | null; md: string }[] {
  const parts = text.split(PAGE_MARK_SPLIT);
  const sections: { page: number | null; md: string }[] = [];
  if (parts[0].trim()) sections.push({ page: null, md: parts[0] });
  for (let i = 1; i < parts.length; i += 2) {
    sections.push({ page: Number(parts[i]), md: parts[i + 1] ?? '' });
  }
  return sections.length > 0 ? sections : [{ page: null, md: text }];
}

const TEXT_LAYER_PROBE_CHARS = 60; // below this across the first pages = scanned

export default function MaterialReader({ onLocate }: { onLocate: (id: string) => void }) {
  const readerNodeId = useUiStore((s) => s.readerNodeId);
  const node = useStore((s) => (readerNodeId ? s.nodes.find((n) => n.id === readerNodeId) : undefined));
  useEffect(() => {
    // the node can be deleted from the canvas while the reader is open
    if (readerNodeId && !node) useUiStore.getState().setReaderNodeId(null);
  }, [readerNodeId, node]);
  if (!node) return null;
  return <ReaderOverlay key={node.id} node={node} onLocate={onLocate} />;
}

function ReaderOverlay({ node, onLocate }: { node: ThoughtNode; onLocate: (id: string) => void }) {
  const t = useT();
  const data = node.data;
  const kind = data.stepKind === 'file' ? 'file' : data.stepKind === 'link' ? 'link' : 'note';
  const attachments = useMemo(() => data.attachments ?? [], [data.attachments]);
  const pdfAtt = attachments.find((a) => a.type === 'application/pdf');
  const close = () => useUiStore.getState().setReaderNodeId(null);

  // ── the readable copy for the text view ──
  const textBody = useMemo(() => {
    if (pdfAtt) return pdfAtt.extractedText ?? '';
    if (kind === 'file') {
      const textAtts = attachments.filter((a) => !a.type.startsWith('image/') && a.type !== 'application/pdf');
      return textAtts.map((a) => (textAtts.length > 1 ? `### ${a.name}\n\n${a.content}` : a.content)).join('\n\n');
    }
    return data.question;
  }, [pdfAtt, kind, attachments, data.question]);
  const sections = useMemo(() => splitByPageMarks(textBody), [textBody]);

  // ── PDF document + text-layer probe ──
  const [view, setView] = useState<'original' | 'text'>(pdfAtt ? 'original' : 'text');
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [pdfjs, setPdfjs] = useState<Pdfjs | null>(null);
  const [hasTextLayer, setHasTextLayer] = useState<boolean | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);

  useEffect(() => {
    if (!pdfAtt) return;
    let dead = false;
    (async () => {
      try {
        const m = await loadPdfjs();
        const d = await m.getDocument({ data: base64ToBytes(pdfAtt.content) }).promise;
        if (dead) { void d.destroy(); return; }
        docRef.current = d;
        let chars = 0;
        for (let p = 1; p <= Math.min(3, d.numPages); p++) {
          const content = await (await d.getPage(p)).getTextContent();
          chars += content.items.reduce((s, it) => s + ('str' in it ? it.str.length : 0), 0);
          if (chars > TEXT_LAYER_PROBE_CHARS) break;
        }
        if (dead) return;
        setPdfjs(m);
        setDoc(d);
        setHasTextLayer(chars > TEXT_LAYER_PROBE_CHARS);
        // decide the readable surface once the document is actually known:
        // original when it has a text layer, the extracted copy when scanned.
        // (The attachment can arrive AFTER mount — landing auto-open — so
        // the mount-time default may have been computed without a PDF.)
        setView(chars > TEXT_LAYER_PROBE_CHARS ? 'original' : 'text');
      } catch (err) {
        if (!dead) {
          setPdfError(err instanceof Error ? err.message : String(err));
          setView('text');
        }
      }
    })();
    return () => {
      dead = true;
      void docRef.current?.destroy();
      docRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfAtt?.id]);

  // ── selection → ask bar ──
  const bodyRef = useRef<HTMLDivElement>(null);
  const [ask, setAsk] = useState<{ text: string; page: number | null; x: number; y: number } | null>(null);
  const [draft, setDraft] = useState('');

  const handleMouseUp = () => {
    window.setTimeout(() => {
      const sel = window.getSelection();
      // a plain click (no selection) anywhere in the reading surface
      // dismisses the ask bar — the draft survives for the next selection
      if (!sel || sel.isCollapsed || !bodyRef.current) { setAsk(null); return; }
      const range = sel.getRangeAt(0);
      if (!bodyRef.current.contains(range.commonAncestorContainer)) return;
      const raw = sel.toString();
      // PDF text-layer spans carry hard breaks; the reading order is what matters
      const text = (view === 'original' ? raw.replace(/\s+/g, ' ') : raw).trim();
      if (text.length < 2) return;
      const rect = range.getBoundingClientRect();
      const el = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
      const page = el?.closest('[data-page]')?.getAttribute('data-page');
      setAsk({ text, page: page ? Number(page) : null, x: rect.left + rect.width / 2, y: rect.bottom });
    }, 0);
  };

  const submitAsk = () => {
    const q = draft.trim();
    if (!q || !ask) return;
    // p.N provenance rides inside the quoted passage
    const passage = ask.page != null ? `(p.${ask.page}) ${ask.text}` : ask.text;
    useStore.getState().addQuestion(q, { parentId: node.id, branchContext: passage });
    setDraft('');
    setAsk(null);
    window.getSelection()?.removeAllRanges();
  };

  // whole-material question: no passage, the full text flows along the wire.
  // Selection is the hero gesture; this keeps "the whole thing" one step away.
  const [wholeDraft, setWholeDraft] = useState('');
  const submitWhole = () => {
    const q = wholeDraft.trim();
    if (!q) return;
    useStore.getState().addQuestion(q, { parentId: node.id });
    setWholeDraft('');
  };

  // ── recognize (per-page vision rewrite) ──
  const [recog, setRecog] = useState<'idle' | 'confirm' | 'running'>('idle');
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const cancelRef = useRef(false);
  const startRecognize = async () => {
    if (!pdfAtt?.pageImages?.length) return;
    setRecog('running');
    cancelRef.current = false;
    await recognizePdfPages(node.id, pdfAtt.id, (a, b) => setProgress([a, b]), () => cancelRef.current);
    setRecog('idle');
    setProgress(null);
  };

  // ── edit the extracted copy (MinerU paste point) ──
  const [editing, setEditing] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const commitEdit = () => {
    setEditing(false);
    const v = editRef.current?.value ?? '';
    if (!pdfAtt || v === (pdfAtt.extractedText ?? '')) return;
    useStore.getState().pushHistory();
    useStore.getState().setAttachmentData(node.id, pdfAtt.id, { extractedText: v, extractedBy: 'manual' });
  };

  // ── questions grown from this material ──
  const edges = useStore((s) => s.edges);
  const nodes = useStore((s) => s.nodes);
  const children = useMemo(() => {
    const ids = edges.filter((e) => e.source === node.id && !e.data?.isCrossLink).map((e) => e.target);
    return nodes.filter((n) => ids.includes(n.id));
  }, [edges, nodes, node.id]);

  // Esc: close the ask bar first, then the overlay
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (editing) { commitEdit(); return; }
      setAsk((cur) => {
        if (cur) return null;
        close();
        return null;
      });
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const title = pdfAtt?.name
    ?? (kind === 'link' ? (data.linkTitle || data.linkUrl || '') : '')
    ?? '';
  const noteTitle = kind === 'note' ? (data.question.split('\n')[0].replace(/^#+\s*/, '').slice(0, 48) || t('reader.empty')) : '';
  const headerIcon = kind === 'note'
    ? <StickyNote size={15} strokeWidth={1.75} className="text-amber-600 shrink-0" />
    : kind === 'link'
      ? <Link2 size={15} strokeWidth={1.75} className="text-accent shrink-0" />
      : <FileText size={15} strokeWidth={1.75} className="text-ink-muted shrink-0" />;
  const fileFallbackTitle = kind === 'file' && !pdfAtt ? (attachments[0]?.name ?? '') : '';
  const numPages = doc?.numPages ?? pdfAtt?.numPages;

  const askLeft = ask ? Math.max(180, Math.min(ask.x, window.innerWidth - 200)) : 0;
  const askTop = ask ? Math.min(ask.y + 10, window.innerHeight - 150) : 0;

  return (
    <div className="fixed inset-0 z-[80] bg-ink/25 backdrop-blur-[2px] flex items-center justify-center animate-fade-in" data-material-reader>
      <div className="bg-surface rounded-2xl shadow-2xl border border-line w-[min(1060px,94vw)] h-[93vh] flex flex-col overflow-hidden">
        {/* header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-line bg-card shrink-0">
          {headerIcon}
          <span className="text-sm font-semibold text-ink truncate">{title || noteTitle || fileFallbackTitle}</span>
          {numPages != null && <span className="text-2xs text-ink-faint font-mono shrink-0">{numPages}p</span>}
          <div className="flex-1" />
          {pdfAtt && !pdfError && (
            <div className="flex items-center rounded-lg border border-line overflow-hidden shrink-0 text-xs">
              <button
                onClick={() => setView('original')}
                className={`px-3 py-1.5 transition-colors ${view === 'original' ? 'bg-accent/10 text-accent font-medium' : 'text-ink-muted hover:bg-wash'}`}
              >
                {t('reader.viewOriginal')}
              </button>
              <button
                onClick={() => setView('text')}
                className={`px-3 py-1.5 transition-colors border-l border-line ${view === 'text' ? 'bg-accent/10 text-accent font-medium' : 'text-ink-muted hover:bg-wash'}`}
              >
                {t('reader.viewText')}
              </button>
            </div>
          )}
          {pdfAtt && view === 'text' && (
            recog === 'running' ? (
              <span className="flex items-center gap-2 text-xs text-accent shrink-0">
                <Loader2 size={13} strokeWidth={1.75} className="animate-spin" />
                {progress ? fmt(t('reader.recognizing'), { a: progress[0], b: progress[1] }) : '…'}
                <button onClick={() => { cancelRef.current = true; }} className="text-ink-muted hover:text-red-500 underline decoration-dotted">
                  {t('reader.stop')}
                </button>
              </span>
            ) : (
              <button
                onClick={() => (recog === 'confirm' ? void startRecognize() : setRecog('confirm'))}
                onBlur={() => setRecog((r) => (r === 'confirm' ? 'idle' : r))}
                disabled={!pdfAtt.pageImages?.length}
                title={pdfAtt.pageImages?.length ? t('reader.recognizeTitle') : t('reader.noImages')}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
                  recog === 'confirm' ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-line text-ink-muted hover:bg-wash'
                }`}
              >
                <ScanText size={13} strokeWidth={1.75} />
                {recog === 'confirm' ? fmt(t('reader.recognizeConfirm'), { n: pdfAtt.pageImages?.length ?? 0 }) : t('reader.recognize')}
              </button>
            )
          )}
          {pdfAtt && view === 'text' && recog !== 'running' && (
            <button
              onClick={() => (editing ? commitEdit() : setEditing(true))}
              title={t('reader.editText')}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors shrink-0 ${editing ? 'bg-accent/10 text-accent' : 'text-ink-faint hover:bg-wash hover:text-ink'}`}
            >
              <Pencil size={13} strokeWidth={1.75} />
            </button>
          )}
          <button onClick={close} title={t('panel.close')} className="w-7 h-7 rounded-lg text-ink-faint hover:bg-wash hover:text-ink flex items-center justify-center transition-colors shrink-0">
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        {/* body */}
        <div ref={bodyRef} onMouseUp={handleMouseUp} className="flex-1 min-h-0 overflow-y-auto bg-wash/60">
          {view === 'original' && pdfAtt && (
            doc && pdfjs ? (
              <div className="flex flex-col items-center gap-4 py-6 px-4">
                {Array.from({ length: doc.numPages }, (_, i) => (
                  <PdfPage key={i + 1} doc={doc} pdfjs={pdfjs} pageNo={i + 1} width={Math.min(860, window.innerWidth * 0.94 - 96)} />
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 h-full text-sm text-ink-muted">
                {pdfError
                  ? <span className="text-red-600">{fmt(t('reader.pdfFailed'), { msg: pdfError })}</span>
                  : <><Loader2 size={16} strokeWidth={1.75} className="animate-spin text-accent" /> {t('reader.loading')}</>}
              </div>
            )
          )}

          {view === 'text' && (
            <div className="max-w-[820px] mx-auto px-8 py-6">
              {pdfAtt && hasTextLayer === false && (
                <div className="mb-4 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
                  {t('reader.scannedHint')}
                </div>
              )}
              {editing && pdfAtt ? (
                <textarea
                  ref={editRef}
                  defaultValue={pdfAtt.extractedText ?? ''}
                  onBlur={commitEdit}
                  autoFocus
                  className="w-full h-[70vh] text-xs font-mono text-ink bg-card border border-line rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-accent/40 leading-relaxed resize-none"
                />
              ) : textBody.trim() === '' ? (
                <p className="text-sm text-ink-faint italic py-10 text-center">{t('reader.empty')}</p>
              ) : (
                sections.map((s, i) => (
                  <div key={i} data-page={s.page ?? undefined}>
                    {s.page != null && (
                      <div className="text-2xs text-ink-faint font-mono text-center select-none pt-4 pb-1">— p.{s.page} —</div>
                    )}
                    <div className="markdown-body text-sm text-ink leading-relaxed">
                      <Markdown>{s.md}</Markdown>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* footer: ask about the whole material + the questions grown from it */}
        <div className="border-t border-line bg-card px-5 py-2.5 shrink-0 flex items-center gap-2.5">
          <input
            value={wholeDraft}
            onChange={(e) => setWholeDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !isImeComposing(e)) { e.preventDefault(); submitWhole(); } }}
            placeholder={t('reader.askWhole')}
            className="flex-1 min-w-[200px] bg-wash text-sm text-ink rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent/40 placeholder-ink-faint"
            data-reader-wholeask
          />
          <button
            onClick={submitWhole}
            disabled={!wholeDraft.trim()}
            className="w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center disabled:opacity-30 transition-opacity shrink-0"
          >
            <Send size={14} strokeWidth={1.75} />
          </button>
          {children.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto max-w-[45%] shrink-0">
              <span className="text-2xs text-ink-faint shrink-0">{fmt(t('reader.grown'), { n: children.length })}</span>
              {children.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { close(); onLocate(c.id); }}
                  title={t('reader.locate')}
                  className="text-2xs text-ink-muted bg-wash hover:bg-line rounded-full px-2.5 py-1 shrink-0 max-w-[200px] truncate transition-colors flex items-center gap-1.5"
                >
                  {c.data.isLoading && <Loader2 size={10} strokeWidth={2} className="animate-spin text-accent shrink-0" />}
                  {c.data.question.replace(/\s+/g, ' ').slice(0, 32) || '…'}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* floating ask bar under the selection */}
      {ask && (
        <div
          className="fixed z-[95] bg-card border border-line rounded-xl shadow-xl p-2.5 w-[360px] animate-fade-in"
          style={{ left: askLeft - 180, top: askTop }}
          data-reader-askbar
        >
          <div className="text-2xs text-ink-faint leading-snug mb-1.5 line-clamp-2 border-l-2 border-warm pl-2">
            “{ask.text.slice(0, 120)}{ask.text.length > 120 ? '…' : ''}”
            {ask.page != null && <span className="font-mono"> · p.{ask.page}</span>}
          </div>
          <div className="flex items-end gap-1.5">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !isImeComposing(e)) { e.preventDefault(); submitAsk(); }
                if (e.key === 'Escape') setAsk(null);
              }}
              placeholder={t('reader.askPlaceholder')}
              rows={1}
              autoFocus
              className="flex-1 bg-wash text-sm text-ink rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent/40 resize-none placeholder-ink-faint"
              style={{ minHeight: 32, maxHeight: 120 }}
              onInput={(e) => {
                const ta = e.currentTarget;
                ta.style.height = 'auto';
                ta.style.height = `${Math.min(120, ta.scrollHeight)}px`;
              }}
            />
            <button
              onClick={submitAsk}
              disabled={!draft.trim()}
              className="w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center disabled:opacity-30 transition-opacity shrink-0"
            >
              <Send size={14} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// One PDF page: canvas render + selectable text layer, lazily rendered as it
// scrolls into range so long papers stay light.
function PdfPage({ doc, pdfjs, pageNo, width }: { doc: PDFDocumentProxy; pdfjs: Pdfjs; pageNo: number; width: number }) {
  const holderRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(pageNo <= 2);
  const [height, setHeight] = useState(Math.round(width * 1.4142));

  useEffect(() => {
    if (visible) return;
    const el = holderRef.current;
    if (!el) return;
    const ob = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) { setVisible(true); ob.disconnect(); }
      },
      { rootMargin: '900px' },
    );
    ob.observe(el);
    return () => ob.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let dead = false;
    (async () => {
      const page = await doc.getPage(pageNo);
      if (dead) return;
      const scale = width / page.getViewport({ scale: 1 }).width;
      const viewport = page.getViewport({ scale });
      setHeight(Math.round(viewport.height));
      const canvas = canvasRef.current;
      const textDiv = textRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !textDiv || !ctx) return;
      const out = Math.min(window.devicePixelRatio || 1, 1.75);
      canvas.width = Math.floor(viewport.width * out);
      canvas.height = Math.floor(viewport.height * out);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      await page.render({
        canvasContext: ctx,
        viewport,
        ...(out !== 1 ? { transform: [out, 0, 0, out, 0, 0] } : {}),
      }).promise;
      if (dead) return;
      textDiv.innerHTML = '';
      textDiv.style.setProperty('--scale-factor', String(scale));
      const layer = new pdfjs.TextLayer({
        textContentSource: page.streamTextContent(),
        container: textDiv,
        viewport,
      });
      await layer.render();
    })().catch(() => { /* a cancelled render mid-close is fine */ });
    return () => { dead = true; };
  }, [visible, width, doc, pdfjs, pageNo]);

  return (
    <div ref={holderRef} data-page={pageNo} className="relative bg-white shadow-md rounded-sm shrink-0" style={{ width, height }}>
      <canvas ref={canvasRef} className="absolute inset-0" />
      <div ref={textRef} className="tdag-textlayer" />
      <span className="absolute -left-9 top-1 text-2xs text-ink-faint font-mono select-none">p.{pageNo}</span>
    </div>
  );
}
