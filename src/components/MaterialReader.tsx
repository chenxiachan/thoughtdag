import { useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, FileText, Highlighter, Link2, Loader2, Pencil, RefreshCw, ScanText, Send, Sparkles, StickyNote, X } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { ThoughtNode } from '../types';
import { useStore } from '../store';
import { useUiStore, toast } from '../lib/ui-store';
import { useModels } from '../lib/use-models';
import { generateDigest, recognizePdfPages, spawnContentNode, extractImage } from '../lib/content';
import { Markdown, HighlightedMarkdown } from './Markdown';
import { generateId, isImeComposing } from '../utils';
import { useT, fmt } from '../i18n';
import { isViewerMode } from '../lib/viewer';
import { loadAttachmentContent } from '../lib/attachment-vault';

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

// Where you were in each material, per session — reopening finds your place.
const scrollMemory = new Map<string, number>();

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
  // Plain thought nodes carrying a PDF read as files too — the reading
  // loop belongs to the material, not to the node kind.
  const kind = data.stepKind === 'file' || (!data.stepKind && (data.attachments ?? []).some((a) => a.type === 'application/pdf'))
    ? 'file' : data.stepKind === 'link' ? 'link' : 'note';
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
  const [view, setView] = useState<'original' | 'text' | 'digest'>(pdfAtt?.pageImages?.length ? 'original' : 'text');
  const [digestBusy, setDigestBusy] = useState(false);
  const startDigest = async () => {
    if (!pdfAtt || digestBusy) return;
    setDigestBusy(true);
    setView('digest'); // the digest node streams; watch it arrive in place
    if (isViewerMode) return;
    const ok = await generateDigest(node.id, pdfAtt.id);
    setDigestBusy(false);
    if (!ok) setView(pdfAtt ? 'original' : 'text');
  };
  // (p.N) references in the digest jump back into the original pages
  const jumpToPage = (n: number) => {
    setView('original');
    window.setTimeout(() => {
      bodyRef.current?.querySelector(`[data-page="${n}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  };
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
        const raw = await loadAttachmentContent(pdfAtt);
        if (!raw) { if (!dead) setPdfError('missing'); return; }
        const d = await m.getDocument({ data: base64ToBytes(raw) }).promise;
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
  const [ask, setAsk] = useState<{ text: string; page: number | null; x: number; y: number; targetNodeId?: string; rects?: [number, number, number, number][] } | null>(null);
  const [draft, setDraft] = useState('');

  const handleMouseUp = () => {
    if (isViewerMode) return;
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
      const pageEl = el?.closest('[data-page]') as HTMLElement | null;
      const page = pageEl?.getAttribute('data-page');
      // selection rectangles in page-fraction space → durable anchors that
      // survive zoom, reflow and future re-renders. Original view only: the
      // text view's sections are reflowed Markdown, their geometry says
      // nothing about the printed page
      let rects: [number, number, number, number][] | undefined;
      if (pageEl && view === 'original') {
        const pb = pageEl.getBoundingClientRect();
        rects = Array.from(range.getClientRects()).slice(0, 8)
          .filter((r) => r.width > 2 && r.height > 2)
          .map((r) => [(r.left - pb.left) / pb.width, (r.top - pb.top) / pb.height, r.width / pb.width, r.height / pb.height]);
      }
      setAsk({ text, page: page ? Number(page) : null, x: rect.left + rect.width / 2, y: rect.bottom, rects });
    }, 0);
  };

  // ── the annotation rail: answers arrive WHERE you read. It shows one
  // thread (a question node grown from this material plus its linear
  // continuations) — a live view of canvas nodes, never a separate store.
  // A canvas p.N chip can pre-address the landing: open on that thread,
  // scroll to that page (one-shot; consumed here so reopen starts clean).
  const jumpRef = useRef(useUiStore.getState().readerJump);
  const [threadId, setThreadId] = useState<string | null>(jumpRef.current?.threadId ?? null);
  useEffect(() => {
    if (useUiStore.getState().readerJump) useUiStore.setState({ readerJump: null });
  }, []);

  const submitAsk = () => {
    const q = draft.trim();
    if (!q || !ask) return;
    // p.N provenance rides inside the quoted passage (document selections only)
    const passage = ask.targetNodeId ? ask.text : (ask.page != null ? `(p.${ask.page}) ${ask.text}` : ask.text);
    useStore.getState().addQuestion(q, { parentId: ask.targetNodeId ?? node.id, branchContext: passage });
    const freshId = useStore.getState().selectedNodeId;
    // document selections remember the page they came from (both views);
    // original-view ones additionally leave a mark on that page
    if (!ask.targetNodeId && ask.page != null && freshId) {
      const anchor = { page: ask.page, ...(ask.rects?.length ? { rects: ask.rects } : {}) };
      useStore.setState((s) => ({
        nodes: s.nodes.map((n) => (n.id === freshId ? { ...n, data: { ...n.data, anchor } } : n)),
      }));
    }
    setThreadId(freshId); // the freshly landed node
    setDraft('');
    setAsk(null);
    window.getSelection()?.removeAllRanges();
  };

  // ── selection → an edge-less note node (clip): the passage becomes its
  // own material on the canvas, provenance rides anchor.attId instead of a
  // wire — wiring the note to the document would drag the WHOLE document
  // back into any context the note joins, defeating the point of clipping.
  const saveSelectionAsNote = () => {
    if (!ask || ask.targetNodeId) return;
    const st = useStore.getState();
    const base = st.nodes.find((n) => n.id === node.id);
    const pos = base
      ? { x: base.position.x + 460, y: base.position.y + ((st.nodes.filter((n) => n.data.anchor?.attId).length % 5) * 150) }
      : { x: 120, y: 120 };
    const freshId = spawnContentNode('note', pos, { question: ask.text });
    const srcAttId = pdfAtt?.id ?? attachments?.[0]?.id;
    if (ask.page != null || srcAttId) {
      const anchor = {
        page: ask.page ?? 1,
        ...(ask.rects?.length ? { rects: ask.rects } : {}),
        ...(srcAttId ? { attId: srcAttId } : {}),
      };
      useStore.setState((s) => ({
        nodes: s.nodes.map((n) => (n.id === freshId ? { ...n, data: { ...n.data, anchor } } : n)),
      }));
    }
    toast('success', t('reader.clippedNote'));
    setAsk(null);
    window.getSelection()?.removeAllRanges();
  };

  // ── area capture → an edge-less image node: the figure becomes its own
  // material, cropped straight from the rendered page canvas. Provenance
  // rides anchor.attId, the same as clipped notes; wire it into a question
  // and the image flows to a vision model.
  const [clipMode, setClipMode] = useState(false);
  const handleClipped = (pageNo: number, rect: [number, number, number, number], dataUrl: string) => {
    const base64 = dataUrl.split(',')[1] ?? '';
    if (!base64) return;
    // thumbnail: same pixels, capped width — cards show this, requests use content
    const st = useStore.getState();
    const baseNode = st.nodes.find((n) => n.id === node.id);
    const pos = baseNode
      ? { x: baseNode.position.x + 460, y: baseNode.position.y + ((st.nodes.filter((n) => n.data.anchor?.attId).length % 5) * 150) }
      : { x: 120, y: 120 };
    const freshId = spawnContentNode('file', pos);
    const attId = generateId();
    const img = new Image();
    img.onload = () => {
      const cap = 320;
      const scale = Math.min(1, cap / img.width);
      const tc = document.createElement('canvas');
      tc.width = Math.max(1, Math.round(img.width * scale));
      tc.height = Math.max(1, Math.round(img.height * scale));
      tc.getContext('2d')!.drawImage(img, 0, 0, tc.width, tc.height);
      const thumb = tc.toDataURL('image/jpeg', 0.8);
      useStore.getState().addAttachment(freshId, {
        id: attId,
        name: `clip-p${pageNo}.png`,
        type: 'image/png',
        size: Math.round(base64.length * 0.75),
        addedAt: new Date().toISOString(),
        content: base64,
        thumbnailUrl: thumb,
      });
      const anchor = { page: pageNo, rects: [rect], ...(pdfAtt ? { attId: pdfAtt.id } : {}) };
      useStore.setState((s) => ({
        nodes: s.nodes.map((n) => (n.id === freshId ? { ...n, data: { ...n.data, anchor } } : n)),
      }));
      // auto-read once (when a vision model exists): the companion text makes
      // the clip legible to text-only models too
      void extractImage(freshId, attId);
    };
    img.src = dataUrl;
    setClipMode(false);
    toast('success', t('reader.clippedImage'));
  };

  // highlight a rail-answer selection: same data the node card and the
  // context tags use — marked here, visible everywhere
  const highlightSelection = () => {
    if (!ask?.targetNodeId) return;
    useStore.getState().addHighlight(ask.targetNodeId, { id: generateId(), text: ask.text });
    setAsk(null);
    window.getSelection()?.removeAllRanges();
  };

  // selection inside the rail: only ANSWER text is explorable (the answer
  // node becomes the parent); question text and chrome stay inert
  const handleRailMouseUp = () => {
    if (isViewerMode) return;
    window.setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !railRef.current) { setAsk((a) => (a?.targetNodeId ? null : a)); return; }
      const range = sel.getRangeAt(0);
      if (!railRef.current.contains(range.commonAncestorContainer)) return;
      const el = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
      const wrap = el?.closest('[data-turn-answer]');
      if (!wrap) return;
      const text = sel.toString().trim();
      if (text.length < 2) return;
      const rect = range.getBoundingClientRect();
      setAsk({ text, page: null, x: rect.left + rect.width / 2, y: rect.bottom, targetNodeId: wrap.getAttribute('data-turn-answer') ?? undefined });
    }, 0);
  };

  // whole-material question: no passage, the full text flows along the wire.
  // Selection is the hero gesture; this keeps "the whole thing" one step away.
  const [wholeDraft, setWholeDraft] = useState('');
  const submitWhole = () => {
    const q = wholeDraft.trim();
    if (!q) return;
    useStore.getState().addQuestion(q, { parentId: node.id });
    setThreadId(useStore.getState().selectedNodeId);
    setWholeDraft('');
  };

  // ── recognize (per-page vision rewrite) ──
  const hasVisionModel = (useModels()?.models ?? []).some((m) => m.vision);
  const [recog, setRecog] = useState<'idle' | 'confirm' | 'running'>('idle');
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const cancelRef = useRef(false);
  const startRecognize = async () => {
    if (!pdfAtt?.pageImages?.length) return;
    setRecog('running');
    cancelRef.current = false;
    if (isViewerMode) return;
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

  // the guided digest lives on the canvas as a child node (One Rule: wire
  // it downstream to ride the material's compression); the digest tab is
  // that node's reading view. Legacy graphs may still carry a digest on
  // the attachment itself — shown until a node replaces it.
  const digestNode = pdfAtt ? children.find((c) => c.data.digestOf === pdfAtt.id) : undefined;
  const digestText = digestNode?.data.response?.trim() || pdfAtt?.digest || '';
  const digesting = digestBusy || !!digestNode?.data.isLoading;
  const digestModel = digestNode
    ? digestNode.data.generatedBy?.[digestNode.data.responseIndex]
    : pdfAtt?.digestBy;
  // the digest node has its own tab; the footer chips list the questions
  const grownChildren = useMemo(() => children.filter((c) => !c.data.digestOf), [children]);

  // interacted places wear marks on the original pages: every child of this
  // material that carries an anchor, grouped by page
  const anchorsByPage = useMemo(() => {
    const map = new Map<number, { id: string; question: string; rects: [number, number, number, number][] }[]>();
    const attIds = new Set((attachments ?? []).map((a) => a.id));
    // children carry anchors via their edge; edge-less clips (notes/images
    // extracted from this document) carry them via anchor.attId instead
    const childIds = new Set(children.map((c) => c.id));
    const anchored = [
      ...children,
      ...nodes.filter((n) => !childIds.has(n.id) && n.data.anchor?.attId && attIds.has(n.data.anchor.attId)),
    ];
    for (const c of anchored) {
      const a = c.data.anchor;
      if (!a?.rects?.length) continue;
      const list = map.get(a.page) ?? [];
      list.push({ id: c.id, question: c.data.question, rects: a.rects });
      map.set(a.page, list);
    }
    return map;
  }, [children, nodes, attachments]);

  // the rail's thread: the asked node plus its linear structural
  // continuations (follow-ups append here; forks belong to the canvas)
  const thread = useMemo(() => {
    if (!threadId) return [];
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const chain: ThoughtNode[] = [];
    let cur = byId.get(threadId);
    while (cur) {
      chain.push(cur);
      const kids = edges
        .filter((e) => e.source === cur!.id && !e.data?.isCrossLink)
        .map((e) => byId.get(e.target))
        .filter((n): n is ThoughtNode => !!n && !n.data.isBranch);
      cur = kids.length === 1 ? kids[0] : undefined;
    }
    return chain;
  }, [threadId, nodes, edges]);
  useEffect(() => {
    // the thread's node can be deleted from the canvas while the rail shows it
    if (threadId && thread.length === 0) setThreadId(null);
  }, [threadId, thread.length]);

  const [followDraft, setFollowDraft] = useState('');
  const submitFollow = () => {
    const q = followDraft.trim();
    const last = thread[thread.length - 1];
    if (!q || !last) return;
    useStore.getState().addQuestion(q, { parentId: last.id });
    setFollowDraft('');
  };

  // stream follows the reading eye: keep the rail pinned to the newest text
  const railRef = useRef<HTMLDivElement>(null);
  const lastTurn = thread[thread.length - 1];
  useEffect(() => {
    const el = railRef.current;
    if (!lastTurn?.data.isLoading || !el) return;
    // follow the stream only while the reader is near the bottom
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) {
      el.scrollTop = el.scrollHeight;
    }
  }, [lastTurn?.data.response, lastTurn?.data.isLoading]);

  // per-material scroll memory (session): reopening finds your place.
  // Recorded live on scroll (at unmount the DOM is already detached and
  // reads 0); restored once the document has grown tall enough to hold it.
  const scrollRestored = useRef(false);

  // p.N jump landing: scroll to the addressed page once its holder exists
  // (page holders mount with the document; sections mount immediately).
  // Claims scrollRestored — an explicit destination beats session memory.
  useEffect(() => {
    const page = jumpRef.current?.page;
    if (!page) return;
    scrollRestored.current = true;
    let tries = 0;
    const attempt = () => {
      const el = bodyRef.current?.querySelector(`[data-page="${page}"]`);
      if (el) { el.scrollIntoView({ block: 'start' }); return; }
      if (++tries < 25) window.setTimeout(attempt, 100);
    };
    window.setTimeout(attempt, 150);
  }, [doc]);

  useEffect(() => {
    const el = bodyRef.current;
    const saved = scrollMemory.get(node.id);
    if (!el || !saved || scrollRestored.current) return;
    let tries = 0;
    const attempt = () => {
      if (scrollRestored.current) return;
      if (el.scrollHeight - el.clientHeight >= saved) {
        el.scrollTop = saved;
        scrollRestored.current = true;
        return;
      }
      if (++tries < 25) window.setTimeout(attempt, 100);
    };
    window.setTimeout(attempt, 100);
  }, [node.id, doc]);

  // Esc: progressive dismissal — ask bar, then the rail, then the overlay
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (editing) { commitEdit(); return; }
      if (ask) { setAsk(null); return; }
      if (threadId) { setThreadId(null); return; }
      close();
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, ask, threadId]);

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
      <div className={`bg-surface rounded-2xl shadow-2xl border border-line ${threadId ? "w-[min(1480px,96vw)]" : "w-[min(1060px,94vw)]"} h-[93vh] flex flex-col overflow-hidden transition-all duration-200`}>
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
              {(digestText || digesting) && (
                <button
                  onClick={() => setView('digest')}
                  className={`px-3 py-1.5 transition-colors border-l border-line ${view === 'digest' ? 'bg-accent/10 text-accent font-medium' : 'text-ink-muted hover:bg-wash'}`}
                >
                  {t('reader.viewDigest')}
                </button>
              )}
            </div>
          )}
          {pdfAtt && view === 'original' && !isViewerMode && (
            <button
              onClick={() => setClipMode((v) => !v)}
              title={t('reader.clipTitle')}
              data-reader-clip-toggle
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors shrink-0 ${clipMode ? 'border-warm bg-warm/10 text-warm font-medium' : 'border-line text-ink-muted hover:bg-wash'}`}
            >
              <Crosshair size={13} strokeWidth={1.75} />
              {clipMode ? t('reader.clipActive') : t('reader.clip')}
            </button>
          )}
          {pdfAtt && !digestText && !digesting && !!pdfAtt.extractedText?.trim() && !isViewerMode && (
            <button
              onClick={() => void startDigest()}
              title={t('reader.digestTitle')}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-line text-ink-muted hover:bg-wash transition-colors shrink-0"
            >
              <Sparkles size={13} strokeWidth={1.75} />
              {t('reader.digest')}
            </button>
          )}
          {pdfAtt && view === 'text' && hasVisionModel && !isViewerMode && (
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

        {/* body: document column + (optional) annotation rail */}
        <div className="flex-1 min-h-0 flex">
        <div ref={bodyRef} onMouseUp={handleMouseUp} onScroll={(e) => scrollMemory.set(node.id, e.currentTarget.scrollTop)} className="flex-1 min-w-0 overflow-y-auto bg-wash/60">
          {view === 'original' && pdfAtt && (
            doc && pdfjs ? (
              <div className="flex flex-col items-center gap-4 py-6 px-4">
                {Array.from({ length: doc.numPages }, (_, i) => (
                  <PdfPage key={i + 1} doc={doc} pdfjs={pdfjs} pageNo={i + 1} width={Math.min(860, window.innerWidth * (threadId ? 0.96 : 0.94) - (threadId ? 420 : 0) - 96)} anchors={anchorsByPage.get(i + 1)} activeThreadId={threadId} onAnchorClick={setThreadId} clipMode={clipMode} onClipped={handleClipped} />
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

          {view === 'digest' && pdfAtt && (
            <div className="max-w-[760px] mx-auto px-8 py-8">
              {digestText ? (
                <div className="markdown-body text-[15px] text-ink leading-relaxed">
                  <DigestBody text={digestText} onJump={jumpToPage} />
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-muted">
                  <Loader2 size={16} strokeWidth={1.75} className="animate-spin text-accent" /> {t('reader.digesting')}
                </div>
              )}
              {digestText && !digesting && (
                <div className="mt-6 pt-4 border-t border-line flex items-center gap-3 text-2xs text-ink-faint">
                  <span className="font-mono">{digestModel ? digestModel.split('/').pop() : ''}</span>
                  <button onClick={() => void startDigest()} className="flex items-center gap-1 hover:text-ink-muted transition-colors">
                    <RefreshCw size={11} strokeWidth={1.75} /> {t('reader.redigest')}
                  </button>
                  {digestNode && (
                    <button onClick={() => { close(); onLocate(digestNode.id); }} className="flex items-center gap-1 hover:text-accent transition-colors" title={t('reader.locate')}>
                      <Crosshair size={11} strokeWidth={1.75} /> {t('reader.digestOnCanvas')}
                    </button>
                  )}
                </div>
              )}
            </div>
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

        {/* annotation rail: the thread lives on the canvas; this is its
            reading view — quote, streaming answer, follow-up */}
        {threadId && thread.length > 0 && (
          <div className="w-[420px] shrink-0 border-l border-line bg-card flex flex-col min-h-0" data-reader-rail>
            <div className="flex items-start gap-2 px-4 py-2.5 border-b border-line shrink-0">
              <div className="flex-1 min-w-0">
                {thread[0].data.branchContext ? (
                  <div className="text-2xs text-ink-faint leading-snug line-clamp-2 border-l-2 border-warm pl-2">
                    “{thread[0].data.branchContext.slice(0, 140)}{thread[0].data.branchContext.length > 140 ? '…' : ''}”
                  </div>
                ) : (
                  <div className="text-2xs text-ink-faint">{t('reader.wholeThread')}</div>
                )}
              </div>
              <button
                onClick={() => { close(); onLocate(thread[0].id); }}
                title={t('reader.locate')}
                className="w-6 h-6 rounded-md text-ink-faint hover:text-accent hover:bg-wash flex items-center justify-center transition-colors shrink-0"
              >
                <Crosshair size={13} strokeWidth={1.75} />
              </button>
              <button
                onClick={() => setThreadId(null)}
                title={t('reader.threadClose')}
                className="w-6 h-6 rounded-md text-ink-faint hover:text-ink hover:bg-wash flex items-center justify-center transition-colors shrink-0"
              >
                <X size={14} strokeWidth={1.75} />
              </button>
            </div>
            <div ref={railRef} onMouseUp={handleRailMouseUp} className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-4">
              {thread.map((turn) => (
                <div key={turn.id}>
                  <div className="text-sm font-semibold text-ink leading-snug mb-1.5">{turn.data.question}</div>
                  {turn.data.isLoading && !turn.data.response ? (
                    <div className="flex items-center gap-2 text-xs text-ink-muted py-1">
                      <Loader2 size={13} strokeWidth={1.75} className="animate-spin text-accent" /> {t('common.thinking')}
                    </div>
                  ) : (
                    <div className="markdown-body text-sm text-ink leading-relaxed" data-turn-answer={turn.id}>
                      {(turn.data.highlights?.length ?? 0) > 0 ? (
                        <HighlightedMarkdown content={turn.data.response} highlights={new Set(turn.data.highlights.map((h) => h.text))} />
                      ) : (
                        <Markdown>{turn.data.response}</Markdown>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="border-t border-line px-3 py-2.5 shrink-0 flex items-end gap-1.5">
              <textarea
                value={followDraft}
                onChange={(e) => setFollowDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !isImeComposing(e)) { e.preventDefault(); submitFollow(); } }}
                placeholder={t('common.followUp')}
                rows={1}
                className="flex-1 bg-wash text-sm text-ink rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent/40 resize-none placeholder-ink-faint"
                style={{ minHeight: 32, maxHeight: 120 }}
                onInput={(e) => {
                  const ta = e.currentTarget;
                  ta.style.height = 'auto';
                  ta.style.height = `${Math.min(120, ta.scrollHeight)}px`;
                }}
              />
              <button
                onClick={submitFollow}
                disabled={!followDraft.trim()}
                className="w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center disabled:opacity-30 transition-opacity shrink-0"
              >
                <Send size={14} strokeWidth={1.75} />
              </button>
            </div>
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
          {grownChildren.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto max-w-[45%] shrink-0">
              <span className="text-2xs text-ink-faint shrink-0">{fmt(t('reader.grown'), { n: grownChildren.length })}</span>
              {grownChildren.map((c) => (
                <span
                  key={c.id}
                  className={`text-2xs rounded-full pl-2.5 pr-1 py-0.5 shrink-0 max-w-[220px] transition-colors flex items-center gap-1 ${
                    threadId === c.id ? 'bg-accent/10 text-accent' : 'bg-wash text-ink-muted hover:bg-line'
                  }`}
                >
                  <button onClick={() => setThreadId(c.id)} className="flex items-center gap-1.5 min-w-0">
                    {c.data.isLoading && <Loader2 size={10} strokeWidth={2} className="animate-spin text-accent shrink-0" />}
                    {/* provenance at a glance: page-anchored vs whole-material */}
                    {(c.data.anchor || !c.data.branchContext) && (
                      <span className={`font-mono shrink-0 ${threadId === c.id ? 'text-accent' : 'text-ink-faint'}`}>
                        {c.data.anchor ? `p.${c.data.anchor.page}` : t('reader.wholeTag')}
                      </span>
                    )}
                    <span className="truncate">{c.data.question.replace(/\s+/g, ' ').slice(0, 32) || '…'}</span>
                  </button>
                  <button
                    onClick={() => { close(); onLocate(c.id); }}
                    title={t('reader.locate')}
                    className="w-4.5 h-4.5 rounded-full flex items-center justify-center text-ink-faint hover:text-accent shrink-0"
                  >
                    <Crosshair size={11} strokeWidth={1.75} />
                  </button>
                </span>
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
            {ask.targetNodeId && (
              <button
                onClick={highlightSelection}
                title={t('common.highlight')}
                className="w-8 h-8 rounded-lg bg-wash text-ink-muted hover:text-accent hover:bg-accent/10 flex items-center justify-center transition-colors shrink-0"
              >
                <Highlighter size={14} strokeWidth={1.75} />
              </button>
            )}
            {!ask.targetNodeId && (
              <button
                onClick={saveSelectionAsNote}
                title={t('reader.saveAsNote')}
                data-reader-clip-note
                className="w-8 h-8 rounded-lg bg-wash text-ink-muted hover:text-warm hover:bg-warm/10 flex items-center justify-center transition-colors shrink-0"
              >
                <StickyNote size={14} strokeWidth={1.75} />
              </button>
            )}
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
function PdfPage({ doc, pdfjs, pageNo, width, anchors, activeThreadId, onAnchorClick, clipMode, onClipped }: {
  doc: PDFDocumentProxy; pdfjs: Pdfjs; pageNo: number; width: number;
  anchors?: { id: string; question: string; rects: [number, number, number, number][] }[];
  activeThreadId?: string | null;
  onAnchorClick?: (id: string) => void;
  clipMode?: boolean;
  onClipped?: (pageNo: number, rect: [number, number, number, number], dataUrl: string) => void;
}) {
  const holderRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  // clip-mode rubber band, in page-fraction space (same space as anchors)
  const [band, setBand] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const frac = (e: React.MouseEvent) => {
    const pb = holderRef.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - pb.left) / pb.width)), y: Math.min(1, Math.max(0, (e.clientY - pb.top) / pb.height)) };
  };
  const finishClip = () => {
    if (!band || !canvasRef.current || !onClipped) { setBand(null); return; }
    const x = Math.min(band.x0, band.x1), y = Math.min(band.y0, band.y1);
    const w = Math.abs(band.x1 - band.x0), h = Math.abs(band.y1 - band.y0);
    setBand(null);
    if (w < 0.02 || h < 0.01) return; // a stray click, not a capture
    const src = canvasRef.current;
    const sx = Math.floor(x * src.width), sy = Math.floor(y * src.height);
    const sw = Math.max(1, Math.floor(w * src.width)), sh = Math.max(1, Math.floor(h * src.height));
    const out = document.createElement('canvas');
    out.width = sw; out.height = sh;
    out.getContext('2d')!.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
    onClipped(pageNo, [x, y, w, h], out.toDataURL('image/png'));
  };
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
      {/* interaction marks: a wash over the asked passage (never blocks
          re-selection) plus one clickable bubble that reopens the thread */}
      {anchors?.map((a) => (
        <div key={a.id}>
          {a.rects.map((r, i) => (
            <div
              key={i}
              className={`absolute rounded-sm pointer-events-none ${activeThreadId === a.id ? 'bg-accent/25' : 'bg-accent/10'}`}
              style={{ left: `${r[0] * 100}%`, top: `${r[1] * 100}%`, width: `${r[2] * 100}%`, height: `${r[3] * 100}%`, zIndex: 3 }}
            />
          ))}
          <button
            onClick={() => onAnchorClick?.(a.id)}
            title={a.question}
            className={`absolute w-6 h-6 rounded-full shadow-md border flex items-center justify-center text-xs transition-transform hover:scale-110 ${
              activeThreadId === a.id ? 'bg-accent text-white border-accent' : 'bg-card text-accent border-accent/40'
            }`}
            style={{ left: `calc(${(a.rects[0][0] + a.rects[0][2]) * 100}% + 6px)`, top: `${a.rects[0][1] * 100}%`, zIndex: 4 }}
            data-anchor-bubble={a.id}
          >
            💬
          </button>
        </div>
      ))}
      <span className="absolute -left-9 top-1 text-2xs text-ink-faint font-mono select-none">p.{pageNo}</span>
      {clipMode && (
        <div
          className="absolute inset-0 cursor-crosshair"
          style={{ zIndex: 6 }}
          data-clip-overlay={pageNo}
          onMouseDown={(e) => { e.preventDefault(); const p = frac(e); setBand({ x0: p.x, y0: p.y, x1: p.x, y1: p.y }); }}
          onMouseMove={(e) => { if (band) { const p = frac(e); setBand({ ...band, x1: p.x, y1: p.y }); } }}
          onMouseUp={finishClip}
          onMouseLeave={() => { if (band) finishClip(); }}
        >
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

// Digest markdown with (p.N) references turned into jump buttons back into
// the original pages — a digest with provenance, not a floating summary.
function DigestBody({ text, onJump }: { text: string; onJump: (page: number) => void }) {
  const parts = text.split(/(\(p\.\s?\d+\))/g);
  return (
    <>
      {parts.map((seg, i) => {
        const m = seg.match(/^\(p\.\s?(\d+)\)$/);
        if (m) {
          return (
            <button
              key={i}
              onClick={() => onJump(Number(m[1]))}
              className="inline-flex items-center text-2xs text-accent bg-accent/10 hover:bg-accent/20 rounded-full px-1.5 py-0.5 mx-0.5 align-middle transition-colors"
            >
              p.{m[1]}
            </button>
          );
        }
        return <Markdown key={i}>{seg}</Markdown>;
      })}
    </>
  );
}
