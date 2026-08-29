import { set as idbSet } from 'idb-keyval';
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
  if (qa.length <= ledger.importedCount) {
    useUiStore.getState().setArrivalFocusNodeId(ledger.tailNodeId);
    return { kind: 'opened' };
  }

  // the appendix: everything from the first unseen turn onward
  const firstNew = qa[ledger.importedCount];
  const from = built.nodes.findIndex((n) => n.id === firstNew.id);
  const appendix = built.nodes.slice(from);
  const inSet = new Set(appendix.map((n) => n.id));
  const innerEdges = built.edges.filter((e) => inSet.has(e.source) && inSet.has(e.target));

  const store = useStore.getState();
  const tail = store.nodes.find((n) => n.id === ledger.tailNodeId) ?? store.nodes.at(-1);
  if (!tail) return { kind: 'opened' }; // canvas was emptied by hand — nothing to hang from
  const dx = tail.position.x - appendix[0].position.x;
  const dy = tail.position.y + (tail.height ?? 140) + APPEND_GAP - appendix[0].position.y;
  const moved = appendix.map((n): ThoughtNode => ({ ...n, position: { x: n.position.x + dx, y: n.position.y + dy } }));
  const bridge = { id: generateId(), source: tail.id, target: moved[0].id, type: 'smoothstep' } as ThoughtEdge;

  store.pushHistory();
  useStore.setState((s) => ({ nodes: [...s.nodes, ...moved], edges: [...s.edges, bridge, ...innerEdges] }));
  await updateSourceSession(existing.id, { importedCount: qa.length, tailNodeId: tailQaId });
  useUiStore.getState().setArrivalFocusNodeId(moved[0].id);
  return { kind: 'appended', turns: qa.length - ledger.importedCount };
}
