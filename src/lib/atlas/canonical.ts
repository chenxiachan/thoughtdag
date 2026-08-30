import { set as idbSet } from 'idb-keyval';
import { makeNode } from '../import-chat';
import { useStore, stripTransient } from '../../store';
import {
  useProjects, switchProject, adoptImportedProject, createProject, projectStorageKey,
  patchLedgerEntry, registerLedgerEntry, removeLedgerEntry, subscribedSessionIds, type ProjectMeta,
} from '../../store/projects';
import { useUiStore, toast } from '../ui-store';
import { t, fmt } from '../../i18n';
import { generateId } from '../../utils';
import type { ThoughtNode, ThoughtEdge } from '../../types';

// The canonical-canvas contract, chapter edition. One canvas = one line
// of thought; sessions are its physical chapters. Routing order:
//   1. SUBSCRIBED session (main / chapter / branch ledger) → open the
//      canvas, append only the turns past that entry's ledger.
//   2. UNREGISTERED session whose opening carries a live anchor → MOUNT
//      it: mode=branch hangs sideways at the anchor node (a side
//      experiment), mode=continue extends the main line below it (the
//      next chapter after context surgery) — and register it, which is
//      what makes every later arrival idempotent.
//   3. Otherwise → a fresh canvas subscribing to this session.
// Appending and mounting never move an existing node.

const APPEND_GAP = 190;

export type CanonicalResult =
  | { kind: 'imported'; nodeCount: number }
  | { kind: 'opened' } // already mirrored, nothing new
  | { kind: 'appended'; turns: number }
  | { kind: 'mounted'; mode: 'branch' | 'continue'; turns: number }
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

interface LedgerHit {
  project: ProjectMeta;
  entry: { sessionId: string; importedCount: number; tailNodeId: string };
}

function findSubscription(sessionId: string | undefined): LedgerHit | null {
  if (!sessionId) return null;
  for (const p of useProjects.getState().projects) {
    const ss = p.sourceSession;
    if (!ss) continue;
    if (ss.sessionId === sessionId) return { project: p, entry: ss };
    const ch = ss.chapters?.find((c) => c.sessionId === sessionId);
    if (ch) return { project: p, entry: ch };
    const br = ss.branches?.find((b) => b.sessionId === sessionId);
    if (br) return { project: p, entry: br };
  }
  return null;
}

/** Place a segment of freshly built nodes under/beside an anchor, above
 *  the collision floor of its column band. Never moves existing nodes. */
function placeSegment(
  store: { nodes: ThoughtNode[] },
  nodes: ThoughtNode[],
  innerEdges: ThoughtEdge[],
  anchorNode: ThoughtNode,
  sideways: boolean,
): { moved: ThoughtNode[]; edges: ThoughtEdge[] } {
  const baseX = anchorNode.position.x + (sideways ? 560 : 0);
  const bandLeft = baseX - 40;
  const bandRight = baseX + 580;
  const floor = store.nodes.reduce((acc, n) => {
    const w = n.width ?? n.measured?.width ?? 540;
    if (n.position.x + w < bandLeft || n.position.x > bandRight) return acc;
    const h = n.height ?? n.measured?.height ?? 300;
    return Math.max(acc, n.position.y + h);
  }, sideways ? anchorNode.position.y - 300 : anchorNode.position.y + (anchorNode.height ?? 140));
  const dx = baseX - nodes[0].position.x;
  const dy = Math.max(floor + APPEND_GAP, sideways ? anchorNode.position.y : -Infinity) - nodes[0].position.y;
  const moved = nodes.map((n): ThoughtNode => ({ ...n, position: { x: n.position.x + dx, y: n.position.y + dy } }));
  const edges: ThoughtEdge[] = [
    { id: generateId(), source: anchorNode.id, target: moved[0].id, type: 'smoothstep' } as ThoughtEdge,
    ...innerEdges,
  ];
  return { moved, edges };
}

export async function importOrAppendConversation(conv: import('../import-chat').ImportableConversation | null): Promise<CanonicalResult> {
  if (!conv) return null;

  const built = conv.build();
  const qa = built.nodes.filter((n) => n.data.importSource);
  const tailQaId = qa.at(-1)?.id ?? built.nodes.at(-1)?.id ?? '';
  if (built.nodes.length === 0) return null;

  // ── 1. subscribed somewhere? open + idempotent append ──
  const hit = findSubscription(conv.sessionId);
  if (hit) return appendPastLedger(conv, built, qa, tailQaId, hit);

  // ── 2. anchor-first mounting: the return half of the experiment loop,
  //       command-free — the anchor travels in the opening message ──
  if (conv.sessionId && qa.length > 0) {
    const { parseAnchor } = await import('../experiment-loop');
    const anchor = parseAnchor(qa[0].data.question ?? '');
    if (anchor && useProjects.getState().projects.some((p) => p.id === anchor.project)) {
      await switchProject(anchor.project);
      const store = useStore.getState();
      const meta = useProjects.getState().projects.find((p) => p.id === anchor.project)!;
      let anchorNode = store.nodes.find((n) => n.id === anchor.node) ?? null;
      if (!anchorNode && anchor.mode === 'continue' && meta.sourceSession?.sessionId) {
        // a chapter continues the MAIN line: fall back to its living tail
        const ss = meta.sourceSession;
        anchorNode = store.nodes.find((n) => n.id === ss.tailNodeId)
          ?? store.nodes.filter((n) => n.data.importSource?.sessionId === ss.sessionId).at(-1) ?? null;
      }
      // native canvases mount too — the ledger grows an empty-main
      // container on registration; no subscription is required to host
      if (anchorNode) {
        // The opening turn REPLAYS what the canvas already holds (the
        // compiled context, anchor included) — mounted verbatim, every
        // continue would nest the previous opener one level deeper.
        // Compress it to a departure marker; the reply stays.
        const opener = built.nodes.find((n) => n.data.importSource && n.data.stepKind !== 'note');
        if (opener && parseAnchor(opener.data.question ?? '')) {
          const mark = t('exp.openerMark');
          opener.data = { ...opener.data, question: mark, source: opener.data.source ? { ...opener.data.source, question: mark } : opener.data.source };
        }
        const inSet = new Set(built.nodes.map((n) => n.id));
        const innerEdges = built.edges.filter((e) => inSet.has(e.source) && inSet.has(e.target));
        const sideways = anchor.mode !== 'continue';
        const seg = placeSegment(store, built.nodes, innerEdges, anchorNode, sideways);
        if (sideways) {
          const firstQa = seg.moved.find((n) => n.data.importSource && n.data.stepKind !== 'note');
          if (firstQa) firstQa.data = { ...firstQa.data, isBranch: true };
        }
        store.pushHistory();
        useStore.setState((s) => ({ nodes: [...s.nodes, ...seg.moved], edges: [...s.edges, ...seg.edges] }));
        await registerLedgerEntry(anchor.project, sideways ? 'branch' : 'chapter', {
          sessionId: conv.sessionId, runner: conv.source, importedCount: qa.length,
          tailNodeId: tailQaId, anchorNodeId: anchorNode.id,
        });
        useUiStore.getState().setArrivalFocusNodeId(seg.moved[seg.moved.length - 1].id);
        return { kind: 'mounted', mode: sideways ? 'branch' : 'continue', turns: qa.length };
      }
      // anchor target unreachable — fall through to an honest plain import
    }
  }

  // ── 3. a fresh canvas subscribing to this session ──
  const id = crypto.randomUUID();
  await idbSet(projectStorageKey(id), JSON.stringify({ state: { nodes: stripTransient(built.nodes), edges: built.edges }, version: 1 }));
  useUiStore.getState().setArrivalFocusNodeId(built.nodes[built.nodes.length - 1].id);
  await adoptImportedProject(id, conv.title.slice(0, 60), 'chat', conv.sessionId ? {
    sourceSession: { sessionId: conv.sessionId, runner: conv.source, importedCount: qa.length, tailNodeId: tailQaId },
  } : undefined);
  return { kind: 'imported', nodeCount: built.nodes.length };
}

/** The MANUAL road into a canvas: mount an arbitrary session onto a
 *  chosen canvas's main-line tail (the anchored road is automatic; this
 *  one is for "I want these sessions to meet" — the join entry the map
 *  offers). Registers as a chapter, so growth appends idempotently. */
export async function mountConversationToProject(
  conv: import('../import-chat').ImportableConversation | null,
  projectId: string,
): Promise<CanonicalResult> {
  if (!conv || !conv.sessionId) return null;
  if (findSubscription(conv.sessionId)) return importOrAppendConversation(conv); // already lives somewhere
  const built = conv.build();
  const qa = built.nodes.filter((n) => n.data.importSource);
  if (built.nodes.length === 0) return null;
  await switchProject(projectId);
  const store = useStore.getState();
  const meta = useProjects.getState().projects.find((p) => p.id === projectId);
  if (!meta) return null;
  const ss = meta.sourceSession;
  const anchorNode = (ss?.sessionId ? store.nodes.find((n) => n.id === ss.tailNodeId)
    ?? store.nodes.filter((n) => n.data.importSource?.sessionId === ss.sessionId).at(-1) : null)
    ?? store.nodes.at(-1) ?? null;
  if (!anchorNode) return null;
  const inSet = new Set(built.nodes.map((n) => n.id));
  const innerEdges = built.edges.filter((e) => inSet.has(e.source) && inSet.has(e.target));
  const seg = placeSegment(store, built.nodes, innerEdges, anchorNode, false);
  store.pushHistory();
  useStore.setState((s) => ({ nodes: [...s.nodes, ...seg.moved], edges: [...s.edges, ...seg.edges] }));
  await registerLedgerEntry(projectId, 'chapter', {
    sessionId: conv.sessionId, runner: conv.source, importedCount: qa.length,
    tailNodeId: qa.at(-1)?.id ?? built.nodes.at(-1)!.id, anchorNodeId: anchorNode.id,
  });
  useUiStore.getState().setArrivalFocusNodeId(seg.moved[seg.moved.length - 1].id);
  return { kind: 'mounted', mode: 'continue', turns: qa.length };
}

async function appendPastLedger(
  conv: import('../import-chat').ImportableConversation,
  built: { nodes: ThoughtNode[]; edges: ThoughtEdge[] },
  qa: ThoughtNode[],
  tailQaId: string,
  hit: LedgerHit,
): Promise<CanonicalResult> {
  await switchProject(hit.project.id);
  const store = useStore.getState();
  // Anchor resolution, three tiers — deletion is the user's prerogative
  // (removed mirror nodes NEVER come back), so the recorded tail may be
  // gone: ① the entry's tail if it survives; ② the last surviving mirror
  // node of THIS session; ③ nothing left — the appendix lands
  // free-floating with an honest note.
  const survivors = store.nodes.filter((n) => n.data.importSource?.sessionId === conv.sessionId);
  const anchor = store.nodes.find((n) => n.id === hit.entry.tailNodeId) ?? survivors.at(-1) ?? null;

  if (qa.length <= hit.entry.importedCount) {
    useUiStore.getState().setArrivalFocusNodeId(anchor?.id ?? null);
    return { kind: 'opened' };
  }

  const firstNew = qa[hit.entry.importedCount];
  const from = built.nodes.findIndex((n) => n.id === firstNew.id);
  const appendix = built.nodes.slice(from);
  const inSet = new Set(appendix.map((n) => n.id));
  const innerEdges = built.edges.filter((e) => inSet.has(e.source) && inSet.has(e.target));

  let moved: ThoughtNode[];
  let extraEdges: ThoughtEdge[];
  if (anchor) {
    const seg = placeSegment(store, appendix, innerEdges, anchor, false);
    moved = seg.moved;
    extraEdges = seg.edges;
  } else {
    // every earlier mirror node was removed by hand: land beside the
    // canvas, say so, and do not pretend to continue anything
    const maxX = store.nodes.length ? Math.max(...store.nodes.map((n) => n.position.x)) : 0;
    const dx = maxX + 560 - appendix[0].position.x;
    const dy = -appendix[0].position.y;
    moved = appendix.map((n): ThoughtNode => ({ ...n, position: { x: n.position.x + dx, y: n.position.y + dy } }));
    const note = makeNote(orphanNoteText(qa.length - hit.entry.importedCount), moved[0]);
    moved = [note, ...moved];
    extraEdges = [
      { id: generateId(), source: note.id, target: moved[1].id, type: 'smoothstep' } as ThoughtEdge,
      ...innerEdges,
    ];
  }

  store.pushHistory();
  useStore.setState((s) => ({ nodes: [...s.nodes, ...moved], edges: [...s.edges, ...extraEdges] }));
  await patchLedgerEntry(hit.project.id, conv.sessionId!, { importedCount: qa.length, tailNodeId: tailQaId });
  useUiStore.getState().setArrivalFocusNodeId(moved[anchor ? 0 : 1].id);
  return { kind: 'appended', turns: qa.length - hit.entry.importedCount };
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

/** How much of this canvas is one of a kind? Coverage is a RELATIONSHIP
 *  question: only nodes whose provenance matches the MAIN subscribed
 *  session count as rebuildable (recast rebuilds the main line only).
 *  Chapters, branches, foreign-provenance pastes, hand-made nodes and
 *  drifted text are all unique here — conservative on purpose. */
export type CanvasUniqueness = 'native' | 'pristine-mirror' | 'diverged-mirror';

export async function canvasUniqueness(projectId: string): Promise<CanvasUniqueness> {
  const { projects, activeId } = useProjects.getState();
  const meta = projects.find((p) => p.id === projectId);
  if (!meta?.sourceSession) return 'native';
  if ((meta.sourceSession.chapters?.length ?? 0) > 0 || (meta.sourceSession.branches?.length ?? 0) > 0) {
    return 'diverged-mirror'; // a multi-session composition is always unique
  }
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
  const sid = meta.sourceSession.sessionId;
  const mirror = nodes.filter((n) => n.data.importSource?.sessionId === sid);
  const diverged =
    nodes.some((n) => !n.data.importSource)
    || nodes.some((n) => n.data.importSource && n.data.importSource.sessionId !== sid)
    || mirror.filter((n) => n.data.source).length < meta.sourceSession.importedCount
    || mirror.some((n) => n.data.source && (n.data.question !== n.data.source.question || n.data.response !== n.data.source.response));
  return diverged ? 'diverged-mirror' : 'pristine-mirror';
}

export { subscribedSessionIds };

/** Deletion IS unsubscription. After nodes are removed, any subscribed
 *  session with no surviving mirror node on the ACTIVE canvas loses its
 *  ledger entry: listening stops, nothing regrows from a canvas the
 *  user just weeded. (Undo restores the nodes but not the entry — the
 *  toast points at the atlas, where reopening resubscribes.) */
export async function unsubscribeOrphanedSessions(): Promise<void> {
  const { projects, activeId } = useProjects.getState();
  const meta = projects.find((p) => p.id === activeId);
  if (!meta?.sourceSession) return;
  const subscribed = subscribedSessionIds(meta);
  if (subscribed.length === 0) return;
  const alive = new Set<string>();
  for (const n of useStore.getState().nodes) {
    const sid = n.data.importSource?.sessionId;
    if (sid) alive.add(sid);
  }
  const orphaned = subscribed.filter((sid) => !alive.has(sid));
  if (orphaned.length === 0) return;
  for (const sid of orphaned) await removeLedgerEntry(meta.id, sid);
  // identity is announced, not implied: when the last subscription goes,
  // the canvas says out loud that it is native again
  const after = useProjects.getState().projects.find((p) => p.id === meta.id);
  const key = after?.sourceSession ? 'toast.unsubscribed' : 'toast.unsubscribedNative';
  toast('info', fmt(t(key), { n: orphaned.length }), 8000);
}

/** Curate several sessions onto ONE canvas. Every session mounts as an
 *  EQUAL chapter (empty-main container, no main line), laid out as
 *  side-by-side columns with NO cross-links: the sessions share no
 *  context, and a wire is context, so drawing one would be a lie — the
 *  joins are the curator's to wire. Each chapter keeps its own ledger
 *  entry, so every session listens and appends independently. Sessions
 *  already subscribed elsewhere are skipped (one session, one canvas). */
export async function mergeSessionsIntoProject(
  convs: (import('../import-chat').ImportableConversation | null)[],
  projectId?: string,
): Promise<{ mounted: number; skipped: number; projectId: string } | null> {
  const real = convs.filter((c): c is NonNullable<(typeof convs)[number]> => !!c && !!c.sessionId);
  if (real.length === 0) return null;
  const pid = projectId
    ?? await createProject(fmt(t('atlas.mergedName'), { title: real[0].title.slice(0, 24), n: real.length }));
  await switchProject(pid);
  useStore.getState().pushHistory();
  let mounted = 0, skipped = 0;
  for (const conv of real) {
    const sid = conv.sessionId!; // narrowed by the filter above
    if (findSubscription(sid)) { skipped++; continue; }
    const built = conv.build();
    if (built.nodes.length === 0) { skipped++; continue; }
    const qa = built.nodes.filter((n) => n.data.importSource);
    const cur = useStore.getState().nodes;
    const rightEdge = cur.reduce((acc, n) => Math.max(acc, n.position.x + (n.width ?? n.measured?.width ?? 540)), -Infinity);
    const topEdge = cur.reduce((acc, n) => Math.min(acc, n.position.y), Infinity);
    const chainLeft = Math.min(...built.nodes.map((n) => n.position.x));
    const chainTop = Math.min(...built.nodes.map((n) => n.position.y));
    const dx = (Number.isFinite(rightEdge) ? rightEdge + 180 : 0) - chainLeft;
    const dy = (Number.isFinite(topEdge) ? topEdge : 0) - chainTop;
    const moved = built.nodes.map((n): ThoughtNode => ({ ...n, position: { x: n.position.x + dx, y: n.position.y + dy } }));
    const inSet = new Set(moved.map((n) => n.id));
    const innerEdges = built.edges.filter((e) => inSet.has(e.source) && inSet.has(e.target));
    useStore.setState((st) => ({ nodes: [...st.nodes, ...moved], edges: [...st.edges, ...innerEdges] }));
    await registerLedgerEntry(pid, 'chapter', {
      sessionId: sid, runner: conv.source, importedCount: qa.length,
      tailNodeId: qa.at(-1)?.id ?? moved[moved.length - 1].id,
    });
    mounted++;
  }
  useStore.getState().pushHistory();
  const last = useStore.getState().nodes.at(-1);
  if (mounted > 0 && last) useUiStore.getState().setArrivalFocusNodeId(last.id);
  return { mounted, skipped, projectId: pid };
}
