import type { ThoughtData, ThoughtNode } from '../types';
import { generateId, countTokens } from '../utils';
import { useStore } from '../store';
import { triggerParadigmCascade } from '../store/streaming';
import { autoLayout } from './layout';
import { COLORS } from './constants';
import { processFile } from './attachments';
import { fetchUrlSnapshot, llmCall } from './api';
import { getModelsOnce } from './use-models';
import { toast, useUiStore } from './ui-store';
import { t, fmt } from '../i18n';

// Content nodes: canvas material (note / file / link). Shared creation and
// ingestion used by the palette, canvas paste, and canvas drop.

export function isContentKind(kind?: ThoughtData['stepKind']): boolean {
  return kind === 'note' || kind === 'file' || kind === 'link';
}

export function spawnContentNode(
  kind: 'note' | 'file' | 'link',
  position: { x: number; y: number },
  init?: { question?: string; linkUrl?: string },
): string {
  const st = useStore.getState();
  const id = generateId();
  const question = init?.question ?? '';
  const node: ThoughtNode = {
    id,
    type: 'thought',
    position,
    width: 400, // explicit so the resize control has a base
    // big pastes start capped (body scrolls); small notes grow naturally
    ...(init?.question && init.question.length > 1200 ? { height: 480 } : {}),
    dragHandle: '.drag-handle',
    data: {
      question,
      stepKind: kind,
      linkUrl: init?.linkUrl,
      createdAt: new Date().toISOString(),
      response: '', responses: [], responseIndex: -1,
      isCollapsed: false, isEditing: false, isEditingResponse: false, isLoading: false,
      tokenCount: countTokens(question),
      highlights: [], highlightMode: 'tag',
      attachments: [], excludedAttachmentIds: [], includedAttachmentIds: [],
      roleMode: 'inherit', isRoot: false, isBranch: false,
    },
  };
  st.setNodes([...st.nodes, node]);
  st.pushHistory();
  if (question) triggerParadigmCascade(useStore.getState, id);
  return id;
}

/**
 * Word / Excel selections arrive as TAB-separated text — turn them into a
 * real markdown table (the note renderer does the rest). Anything else
 * passes through untouched.
 */
export function clipboardTextToMarkdown(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim() !== '');
  if (lines.length >= 2 && lines.every((l) => l.includes('\t'))) {
    const rows = lines.map((l) => l.split('\t').map((c) => c.trim().replace(/\|/g, '\\|')));
    const cols = Math.max(...rows.map((r) => r.length));
    const pad = (r: string[]) => [...r, ...Array(cols - r.length).fill('')];
    const [head, ...body] = rows.map(pad);
    return [
      `| ${head.join(' | ')} |`,
      `| ${head.map(() => '---').join(' | ')} |`,
      ...body.map((r) => `| ${r.join(' | ')} |`),
    ].join('\n');
  }
  return text;
}

/** Add files to a content node; a filled material slot advances a waiting run. */
export async function ingestFiles(nodeId: string, files: FileList | File[]): Promise<void> {
  for (const file of Array.from(files)) {
    await processFile(file, {
      add: (att) => {
        useStore.getState().addAttachment(nodeId, att);
        triggerParadigmCascade(useStore.getState, nodeId);
        // Images auto-extract on arrival: one VLM call, cached forever as
        // the image's companion text (same slot PDFs use)
        if (att.type.startsWith('image/')) void extractImage(nodeId, att.id);
      },
      update: (attId, patch) => {
        useStore.getState().setAttachmentData(nodeId, attId, patch);
        // PDF text arrives late — re-check readiness after extraction
        triggerParadigmCascade(useStore.getState, nodeId);
      },
    });
  }
}

// "Strongest available vision model" heuristic: flagship tiers understand
// scientific figures (axes, panels, trends) far better than the free tiers,
// and extraction runs ONCE per image — spend where it counts.
function visionRank(m: { id: string; name: string }): number {
  const s = `${m.id} ${m.name}`.toLowerCase();
  if (/max|opus|4o|gpt-5|sonnet/.test(s)) return 4;
  if (/plus|pro/.test(s)) return 3;
  if (/flash|lite|mini|nano/.test(s)) return 1;
  return 2;
}

// Vision candidate order: the user's explicit pick (capabilities panel)
// first, then strongest-first, session-failed keys pushed to the back.
function rankVision(vision: { id: string; name: string }[]): { id: string; name: string }[] {
  const ranked = [...vision].sort((a, b) => visionRank(b) - visionRank(a));
  const usable = ranked.filter((m) => !extractionAuthFailed.has(m.id));
  const base = usable.length > 0 ? usable : ranked; // stale cache shouldn't dead-end us
  const pref = useUiStore.getState().visionModelPref;
  if (pref && pref !== 'auto') {
    const picked = vision.find((m) => m.id === pref);
    if (picked) return [picked, ...base.filter((m) => m.id !== pref)];
  }
  return base;
}

// Models whose keys were rejected THIS session — a stale key in .env keeps
// its models registered (registration is key-presence, not validation), so
// remember failures instead of stumbling over them for every image.
const extractionAuthFailed = new Set<string>();

// Retina screenshots are huge and PNGs can carry alpha — some VLMs silently
// crush oversized images or composite transparency into a "blank" frame.
// Normalize before sending: cap the long edge, flatten onto white, JPEG.
async function normalizeImageForVision(base64: string, mimeType: string): Promise<{ data: string; mimeType: string }> {
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('decode failed'));
      img.src = `data:${mimeType};base64,${base64}`;
    });
    const MAX = 1568;
    const scale = Math.min(1, MAX / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { data: base64, mimeType };
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const out = canvas.toDataURL('image/jpeg', 0.92);
    return { data: out.split(',')[1], mimeType: 'image/jpeg' };
  } catch {
    return { data: base64, mimeType }; // undecodable → send the original
  }
}

/**
 * Auto-extract an image into companion text. The prompt self-routes: the
 * model first classifies the image (photo / screenshot / diagram /
 * scientific figure / document) and then extracts at the finest depth for
 * that type — no user interaction. Dual channel by default: the text is an
 * INDEX of the image, not a replacement; the image itself still flows to
 * vision models downstream.
 *
 * Multi-LLM aware: tries vision models strongest-first and FALLS BACK down
 * the ranking on failure; every error is reported with the model that
 * produced it (no vendor assumptions), and the winning model is recorded
 * on the attachment (extraction provenance).
 */
export async function extractImage(nodeId: string, attId: string): Promise<void> {
  const st = useStore.getState();
  const att = st.nodes.find((n) => n.id === nodeId)?.data.attachments?.find((a) => a.id === attId);
  if (!att || !att.type.startsWith('image/')) return;

  const data = await getModelsOnce();
  const vision = (data?.models ?? []).filter((m) => m.vision);
  if (vision.length === 0) return; // no vision model: the capabilities panel explains
  const candidates = rankVision(vision);

  st.setAttachmentData(nodeId, attId, { isExtracting: true });
  const image = await normalizeImageForVision(att.content, att.type);
  const failures: string[] = [];
  for (const model of candidates) {
    try {
      const text = await llmCall(
        [{ role: 'user', content: t('content.extractPrompt') }],
        [image],
        model.id,
      );
      useStore.getState().setAttachmentData(nodeId, attId, { isExtracting: false, extractedText: text.trim(), extractedBy: model.id });
      if (failures.length > 0) {
        toast('info', `${t('content.extractFellBack')} ${model.name} — ${failures.join('; ')}`);
      }
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push(`${model.name}: ${msg}`);
      // Key problems are permanent for the session — skip this model next time
      if (/api.?key|unauthorized|forbidden|401|403|invalid/i.test(msg)) extractionAuthFailed.add(model.id);
    }
  }
  useStore.getState().setAttachmentData(nodeId, attId, { isExtracting: false });
  toast('error', `${t('content.extractFailed')} — ${failures.join('; ')}`);
}

/** Marker the reader uses to keep page provenance inside the extracted copy. */
export const PDF_PAGE_MARK = (n: number) => `<!-- tdag-page:${n} -->`;

/**
 * Per-page vision recognition for a PDF attachment: the image-extraction
 * channel applied page by page. Each rendered page image goes through the
 * same ranked vision models as extractImage; the results are stitched into
 * ONE Markdown copy (formulas as KaTeX) with page markers, written to
 * extractedText — the visible, editable text both the reader and downstream
 * context read. This is NOT a built-in OCR engine: external output (MinerU
 * etc.) can replace the same field by editing.
 */
export async function recognizePdfPages(
  nodeId: string,
  attId: string,
  onProgress: (done: number, total: number) => void,
  isCancelled: () => boolean,
): Promise<void> {
  const att = useStore.getState().nodes.find((n) => n.id === nodeId)?.data.attachments?.find((a) => a.id === attId);
  if (!att || att.type !== 'application/pdf' || !att.pageImages?.length) return;

  const data = await getModelsOnce();
  const vision = (data?.models ?? []).filter((m) => m.vision);
  if (vision.length === 0) return; // no vision model: the capabilities panel explains
  const candidates = rankVision(vision);

  const pages = att.pageImages;
  const parts: string[] = [];
  let winner: string | undefined; // sticky: once a model works, keep it for the rest
  for (let i = 0; i < pages.length; i++) {
    if (isCancelled()) return;
    const image = await normalizeImageForVision(pages[i], 'image/png');
    const order = winner ? [...candidates].sort((a, b) => (b.id === winner ? 1 : 0) - (a.id === winner ? 1 : 0)) : candidates;
    let pageMd: string | null = null;
    for (const model of order) {
      if (isCancelled()) return;
      try {
        pageMd = (await llmCall([{ role: 'user', content: t('content.pdfPagePrompt') }], [image], model.id)).trim();
        winner = model.id;
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/api.?key|unauthorized|forbidden|401|403|invalid/i.test(msg)) extractionAuthFailed.add(model.id);
      }
    }
    parts.push(`${PDF_PAGE_MARK(i + 1)}\n\n${pageMd ?? `*${fmt(t('reader.pageFail'), { n: i + 1 })}*`}`);
    onProgress(i + 1, pages.length);
  }
  if (isCancelled()) return;
  if (!winner) {
    toast('error', t('content.extractFailed'));
    return;
  }
  useStore.getState().pushHistory();
  useStore.getState().setAttachmentData(nodeId, attId, { extractedText: parts.join('\n\n'), extractedBy: winner });
  toast('success', t('reader.recognizeDone'));
}

/**
 * The reader's guided digest: one short, intuitive post (NOT a summary) in
 * the UI language, with (p.N) anchors that jump back into the original.
 * The digest is a NODE grown from the material — the One Rule applies: wire
 * it downstream and later questions ride the material's best compression
 * instead of its full text. The reader's digest tab is a view of this node;
 * versions/rerun/model provenance all come from node machinery (rerunNode
 * routes digestOf nodes through the digest prompt). Runs on the user's
 * selected model — a reading deliverable, not a background chore.
 */
export async function generateDigest(nodeId: string, attId: string): Promise<boolean> {
  const st = useStore.getState();
  const att = st.nodes.find((n) => n.id === nodeId)?.data.attachments?.find((a) => a.id === attId);
  if (!att?.extractedText?.trim()) return false;

  let digestNode = st.nodes.find((n) => n.data.digestOf === attId);
  if (!digestNode) {
    const id = generateId();
    const question = fmt(t('content.digestNodeQuestion'), { name: att.name });
    const node: ThoughtNode = {
      id,
      type: 'thought',
      position: { x: 0, y: 0 },
      dragHandle: '.drag-handle',
      data: {
        question,
        digestOf: attId,
        response: '', responses: [], responseIndex: -1,
        isCollapsed: false, isEditing: false, isEditingResponse: false, isLoading: false,
        tokenCount: countTokens(question),
        highlights: [], highlightMode: 'tag',
        attachments: [], excludedAttachmentIds: [], includedAttachmentIds: [],
        roleMode: 'inherit', isRoot: false, isBranch: false,
      },
    };
    const edge = {
      id: `edge-${nodeId}-${id}`,
      source: nodeId,
      target: id,
      sourceHandle: 'continue',
      targetHandle: 'top',
      type: 'smoothstep',
      style: { stroke: COLORS.accent, strokeWidth: 2 },
      animated: false,
      markerEnd: { type: 'arrowclosed' as const, color: COLORS.accent, width: 18, height: 18 },
      data: {},
    };
    const edges = [...st.edges, edge];
    useStore.setState({ nodes: autoLayout([...st.nodes, node], edges), edges });
    st.pushHistory();
    digestNode = useStore.getState().nodes.find((n) => n.id === id);
    if (!digestNode) return false;
  }

  await useStore.getState().rerunNode(digestNode.id);
  const after = useStore.getState().nodes.find((n) => n.id === digestNode.id);
  if (!after || after.data.generationFailed || !after.data.response.trim()) {
    toast('error', t('content.digestFailed'));
    return false;
  }
  return true;
}

/** Fetch the URL server-side and store the stamped text snapshot on the node. */
export async function fetchLinkIntoNode(nodeId: string, url: string): Promise<void> {
  const patch = (p: Partial<ThoughtData>) => useStore.setState((s) => ({
    nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...p } } : n)),
  }));
  patch({ linkTitle: undefined }); // retry path: back to the loading state
  try {
    const snap = await fetchUrlSnapshot(url);
    patch({
      question: snap.text,
      linkTitle: snap.title || undefined,
      linkFetchedAt: snap.fetchedAt,
      tokenCount: countTokens(snap.text),
    });
    useStore.getState().pushHistory();
    triggerParadigmCascade(useStore.getState, nodeId);
  } catch (err) {
    patch({ linkTitle: `⚠ ${err instanceof Error ? err.message : 'fetch failed'}` });
  }
}
