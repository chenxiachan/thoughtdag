import { set as idbSet } from 'idb-keyval';
import { makeNode } from '../import-chat';
import { useStore, stripTransient } from '../../store';
import { useProjects, switchProject, adoptImportedProject, updateSourceSession, projectStorageKey } from '../../store/projects';
import { useUiStore } from '../ui-store';
import { generateId } from '../../utils';
import type { ThoughtNode, ThoughtEdge } from '../../types';

// The canonical-canvas contract: ONE canvas per runner session. The first
// import creates it; every later import of the same session OPENS it and
// appends only the turns past the ledger — the user's pruning, branches,
// and condensations live on that canvas and are never orphaned into a
// fresh snapshot. Appending never moves an existing node: the appendix
// hangs under the recorded tail, wherever the user has dragged it.

const APPEND_GAP = 190;

export type CanonicalResult =
  | { kind: 'imported'; nodeCount: number }
  | { kind: 'opened' } // already mirrored, nothing new
  | { kind: 'appended'; turns: number }
  | null; // not a runner session

export async function importOrAppendSession(text: string): Promise<CanonicalResult> {
  const { anyRunnerSessionConversation } = await import('../adapters');
  const conv = await anyRunnerSessionConversation(text);
  return importOrAppendConversation(conv);
}

/** Chunked reader over the shell's readRange — the road for any size. */
export function shellSessionReader(rootKey: string, rel: string): () => Promise<string | null> {
  const CHUNK = 8 * 1024 * 1024;
  let start = 0;
  let done = false;
  return async () => {
    if (done) return null;
    const r = await window.desktopSessions!.readRange(rootKey, rel, start, CHUNK);
    start = r.nextStart;
    if (r.eof) done = true;
    return r.text;
  };
}

export async function importOrAppendConversation(conv: import('../import-chat').ImportableConversation | null): Promise<CanonicalResult> {
  if (!conv) return null;

  const existing = conv.sessionId
    ? useProjects.getState().projects.find((p) => p.sourceSession?.sessionId === conv.sessionId)
    : undefined;

  const built = conv.build();
  const qa = built.nodes.filter((n) => n.data.importSource);
  const tailQaId = qa.at(-1)?.id ?? built.nodes.at(-1)?.id ?? '';

  if (!existing) {
    if (built.nodes.length === 0) return null;
    const id = crypto.randomUUID();
    await idbSet(projectStorageKey(id), JSON.stringify({ state: { nodes: stripTransient(built.nodes), edges: built.edges }, version: 1 }));
    useUiStore.getState().setArrivalFocusNodeId(built.nodes[built.nodes.length - 1].id);
    await adoptImportedProject(id, conv.title.slice(0, 60), 'chat', conv.sessionId ? {
      sourceSession: { sessionId: conv.sessionId, runner: conv.source, importedCount: qa.length, tailNodeId: tailQaId },
    } : undefined);
    return { kind: 'imported', nodeCount: built.nodes.length };
  }

  await switchProject(existing.id);
  const ledger = existing.sourceSession!;
  const store = useStore.getState();
  // Anchor resolution, three tiers — deletion is the user's prerogative
  // (removed mirror nodes NEVER come back), so the recorded tail may be
  // gone: ① the ledger's tail if it survives; ② the last surviving
  // mirror node of this session (array order = import order); ③ nothing
  // left — the appendix lands free-floating with an honest note.
  const survivors = store.nodes.filter((n) => n.data.importSource?.sessionId === conv.sessionId);
  const anchor = store.nodes.find((n) => n.id === ledger.tailNodeId) ?? survivors.at(-1) ?? null;

  if (qa.length <= ledger.importedCount) {
    useUiStore.getState().setArrivalFocusNodeId(anchor?.id ?? null);
    return { kind: 'opened' };
  }

  // the appendix: everything from the first unseen turn onward
  const firstNew = qa[ledger.importedCount];
  const from = built.nodes.findIndex((n) => n.id === firstNew.id);
  const appendix = built.nodes.slice(from);
  const inSet = new Set(appendix.map((n) => n.id));
  const innerEdges = built.edges.filter((e) => inSet.has(e.source) && inSet.has(e.target));

  let moved: ThoughtNode[];
  const extraEdges: ThoughtEdge[] = [...innerEdges];
  if (anchor) {
    // collision floor: the appendix must clear EVERYTHING already living
    // in this column band (harvest branches, user notes, earlier
    // appendices) — hanging straight under the anchor stacks on them
    const bandLeft = anchor.position.x - 40;
    const bandRight = anchor.position.x + 580;
    const floor = store.nodes.reduce((acc, n) => {
      const w = n.width ?? n.measured?.width ?? 540;
      if (n.position.x + w < bandLeft || n.position.x > bandRight) return acc;
      const h = n.height ?? n.measured?.height ?? 300;
      return Math.max(acc, n.position.y + h);
    }, anchor.position.y + (anchor.height ?? 140));
    const dx = anchor.position.x - appendix[0].position.x;
    const dy = floor + APPEND_GAP - appendix[0].position.y;
    moved = appendix.map((n): ThoughtNode => ({ ...n, position: { x: n.position.x + dx, y: n.position.y + dy } }));
    extraEdges.unshift({ id: generateId(), source: anchor.id, target: moved[0].id, type: 'smoothstep' } as ThoughtEdge);
  } else {
    // every earlier mirror node was removed by hand: land beside the
    // canvas, say so, and do not pretend to continue anything
    const maxX = store.nodes.length ? Math.max(...store.nodes.map((n) => n.position.x)) : 0;
    const dx = maxX + 560 - appendix[0].position.x;
    const dy = -appendix[0].position.y;
    moved = appendix.map((n): ThoughtNode => ({ ...n, position: { x: n.position.x + dx, y: n.position.y + dy } }));
    const note = makeNote(orphanNoteText(qa.length - ledger.importedCount), moved[0]);
    moved = [note, ...moved];
    extraEdges.unshift({ id: generateId(), source: note.id, target: moved[1].id, type: 'smoothstep' } as ThoughtEdge);
  }

  store.pushHistory();
  useStore.setState((s) => ({ nodes: [...s.nodes, ...moved], edges: [...s.edges, ...extraEdges] }));
  await updateSourceSession(existing.id, { importedCount: qa.length, tailNodeId: tailQaId });
  useUiStore.getState().setArrivalFocusNodeId(moved[anchor ? 0 : 1].id);
  return { kind: 'appended', turns: qa.length - ledger.importedCount };
}

function orphanNoteText(n: number): string {
  return `[Mirror] The source session grew by ${n} turn(s); the earlier mirrored turns were removed from this canvas by hand, so the new turns land here on their own.`;
}

function makeNote(text: string, beside: ThoughtNode): ThoughtNode {
  const note = makeNode(text, '', false);
  note.data.stepKind = 'note';
  // mirror-owned, not hand-made: provenance rides along (see the
  // uniqueness check — nodes WITHOUT importSource are the user's own)
  note.data.importSource = beside.data.importSource
    ? { ...beside.data.importSource, itemIds: [] }
    : undefined;
  note.width = 460;
  note.position = { x: beside.position.x - 520, y: beside.position.y };
  return note;
}

/** How much of this canvas is one of a kind? Drives the delete confirm:
 *  a pristine mirror deletes losslessly (rebuild from source any time); a
 *  diverged mirror loses the user's value layer; a native canvas loses
 *  everything. Conservative on purpose — any hand-made node, any drifted
 *  text, any pruned mirror turn counts as diverged. */
export type CanvasUniqueness = 'native' | 'pristine-mirror' | 'diverged-mirror';

export async function canvasUniqueness(projectId: string): Promise<CanvasUniqueness> {
  const { projects, activeId } = useProjects.getState();
  const meta = projects.find((p) => p.id === projectId);
  if (!meta?.sourceSession) return 'native';
  let nodes: ThoughtNode[];
  if (projectId === activeId) {
    nodes = useStore.getState().nodes;
  } else {
    const { get: idbGet } = await import('idb-keyval');
    const raw = await idbGet(projectStorageKey(projectId));
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      nodes = (parsed?.state?.nodes ?? []) as ThoughtNode[];
    } catch { return 'diverged-mirror'; } // unreadable — warn high, never low
  }
  const mirror = nodes.filter((n) => n.data.importSource);
  const diverged =
    nodes.some((n) => !n.data.importSource)
    || mirror.filter((n) => n.data.source).length < meta.sourceSession.importedCount
    || mirror.some((n) => n.data.source && (n.data.question !== n.data.source.question || n.data.response !== n.data.source.response));
  return diverged ? 'diverged-mirror' : 'pristine-mirror';
}
