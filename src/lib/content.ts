import type { ThoughtData, ThoughtNode } from '../types';
import { generateId, countTokens } from '../utils';
import { useStore } from '../store';
import { triggerParadigmCascade } from '../store/streaming';
import { processFile } from './attachments';
import { fetchUrlSnapshot } from './api';

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

/** Add files to a content node; a filled material slot advances a waiting run. */
export async function ingestFiles(nodeId: string, files: FileList | File[]): Promise<void> {
  for (const file of Array.from(files)) {
    await processFile(file, {
      add: (att) => {
        useStore.getState().addAttachment(nodeId, att);
        triggerParadigmCascade(useStore.getState, nodeId);
      },
      update: (attId, patch) => {
        useStore.getState().setAttachmentData(nodeId, attId, patch);
        // PDF text arrives late — re-check readiness after extraction
        triggerParadigmCascade(useStore.getState, nodeId);
      },
    });
  }
}

/** Fetch the URL server-side and store the stamped text snapshot on the node. */
export async function fetchLinkIntoNode(nodeId: string, url: string): Promise<void> {
  const patch = (p: Partial<ThoughtData>) => useStore.setState((s) => ({
    nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...p } } : n)),
  }));
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
