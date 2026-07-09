import type { ThoughtData, ThoughtNode } from '../types';
import { generateId, countTokens } from '../utils';
import { useStore } from '../store';
import { triggerParadigmCascade } from '../store/streaming';
import { processFile } from './attachments';
import { fetchUrlSnapshot, llmCall } from './api';
import { getModelsOnce } from './use-models';
import { toast } from './ui-store';
import { t } from '../i18n';

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
    width: 400, // explicit so the horizontal resize control has a base
    dragHandle: '.drag-handle',
    data: {
      question,
      stepKind: kind,
      linkUrl: init?.linkUrl,
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

// Models whose keys were rejected THIS session — a stale key in .env keeps
// its models registered (registration is key-presence, not validation), so
// remember failures instead of stumbling over them for every image.
const extractionAuthFailed = new Set<string>();

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
  if (vision.length === 0) {
    toast('error', t('content.noVisionModel'));
    return;
  }
  const ranked = [...vision].sort((a, b) => visionRank(b) - visionRank(a));
  const usable = ranked.filter((m) => !extractionAuthFailed.has(m.id));
  const candidates = usable.length > 0 ? usable : ranked; // stale cache shouldn't dead-end us

  st.setAttachmentData(nodeId, attId, { isExtracting: true });
  const failures: string[] = [];
  for (const model of candidates) {
    try {
      const text = await llmCall(
        [{ role: 'user', content: t('content.extractPrompt') }],
        [{ data: att.content, mimeType: att.type }],
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
