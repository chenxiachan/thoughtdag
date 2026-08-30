import type { ThoughtNode, ThoughtEdge } from '../types';
import { getDescendantIds } from './graph';
import { COLLAPSED_LAYOUT_HEIGHT, LAYOUT_COL_WIDTH, LAYOUT_H_GAP, LAYOUT_V_GAP } from './constants';

// Estimated rendered height of a node — fallback when React Flow hasn't
// measured the DOM yet (fresh nodes) and for collapse shifting. Every
// variable region of the card is height-capped in CSS (question scrolls at
// 180px, the answer at 400px), so the estimate caps each part the same way
// — an uncapped formula here would keep spreading nodes for content the
// card no longer grows for.
export function estimateNodeHeight(node: ThoughtNode): number {
  if (node.data.isCollapsed) return COLLAPSED_LAYOUT_HEIGHT;
  // Calibrated against measured DOM heights (2026-08): CJK markdown renders
  // ~1px per char at card width before the 400px CSS cap, chrome (header +
  // takeaway line + follow-up input + paddings) runs ~215px, and each
  // highlight row adds its own line. Under-estimating here is what made
  // map-mode relayout overlap once zoomed back in.
  const questionH = Math.min(180, 40 + (node.data.question || '').length / 1.2);
  const responseH = Math.min(400, (node.data.response || '').length / 1.05);
  const highlightsH = (node.data.highlights?.length ?? 0) * 26;
  // tool fingerprints + composition bar render an extra header row on
  // imported turns — un-counted, tool-heavy codex cards overlapped
  const insightH = (node.data.attachments?.length ?? 0) > 0 ? 30 : 0;
  const estimated = 215 + questionH + responseH + highlightsH + insightH;
  return Math.max(260, Math.min(930, estimated));
}

// Height used for layout: the larger of the measured DOM height (React
// Flow's ResizeObserver writes `measured` back through onNodesChange) and
// the estimate. The max matters: while zoomed out, semantic zoom renders
// small thumbnail cards, so `measured` under-reports the full-size height —
// laying out with it would overlap once the user zooms back in. Slightly
// generous spacing beats overlapping cards.
export function nodeHeight(node: ThoughtNode): number {
  return Math.max(node.measured?.height ?? 0, estimateNodeHeight(node));
}

/**
 * Column-Tree layout with collision resolution.
 *
 * Pass 1 — Column assignment:
 *   - Each continuation chain (first non-branch child) inherits the parent's column.
 *   - Additional children (explore / duplicate / distill / regenerate siblings)
 *     are assigned to the next available column to the right.
 *   - Multiple roots each get their own column group.
 *
 * Pass 2 — Vertical positioning:
 *   - Within a column, nodes are placed top-to-bottom in chain order.
 *   - A branch child's y aligns with (or slightly below) its parent's y.
 *
 * Pass 3 — Collision detection & nudge:
 *   - Sort all nodes by y, then by column.
 *   - Any overlap (bbox intersection + padding) pushes the lower node down.
 *   - Iterates until stable (max 5 passes).
 */
/** Legacy mirrors (imported before importer notes became annotations)
 *  wired notes INTO the chain — prev→note→turn — which severs the chain
 *  for layout and no relayout can fix it. Heal the wiring: incoming
 *  edges of a provenance-stamped note re-aim at the turn it annotates,
 *  the note keeps only its outgoing annotation edge. Idempotent; user
 *  notes (no provenance) are untouched. */
export function healLegacyNoteEdges(nodes: ThoughtNode[], edges: ThoughtEdge[]): ThoughtEdge[] {
  const legacy = nodes.filter((n) => n.data.stepKind === 'note' && n.data.importSource
    && edges.some((e) => e.target === n.id));
  if (legacy.length === 0) return edges;
  let out = [...edges];
  for (const note of legacy) {
    const incoming = out.filter((e) => e.target === note.id);
    const onward = out.find((e) => e.source === note.id);
    out = out.filter((e) => e.target !== note.id);
    if (!onward) continue;
    for (const inc of incoming) {
      if (!out.some((e) => e.source === inc.source && e.target === onward.target)) {
        out.push({ ...inc, target: onward.target });
      }
    }
  }
  return out;
}

export function autoLayout(allNodes: ThoughtNode[], allEdges: ThoughtEdge[]): ThoughtNode[] {
  if (allNodes.length === 0) return allNodes;
  // Content nodes (notes / files) are user-arranged material: layout never
  // moves them and their edges don't shape the column tree. A node whose
  // only parent is a content node simply roots its own chain.
  const contentIds = new Set(
    allNodes.filter((n) => ['note', 'file', 'link', 'frame'].includes(n.data.stepKind ?? '')).map((n) => n.id)
  );
  const nodes = allNodes.filter((n) => !contentIds.has(n.id));
  const edges = allEdges.filter((e) => !contentIds.has(e.source) && !contentIds.has(e.target));

  const NODE_WIDTH = LAYOUT_COL_WIDTH;
  const H_GAP = LAYOUT_H_GAP;
  const V_GAP = LAYOUT_V_GAP;
  const V_PAD = 24; // extra vertical padding for collision

  // --- Structural edges (no cross-links) ---
  // Structural edges drive the column tree. Cross-links normally don't —
  // BUT if a node's ONLY incoming edge is a cross-link (user deleted the
  // original edge and re-wired by dragging), that link IS its parent chain:
  // adopt it so the node still stacks below its arrow-parent instead of
  // being treated as a detached root. Watch edges are never adopted.
  const structuralEdges = edges.filter((e) => !e.data?.isCrossLink);
  const hasStructuralParent = new Set(structuralEdges.map((e) => e.target));
  for (const e of edges) {
    if (e.data?.isCrossLink && !e.data?.isWatch && !hasStructuralParent.has(e.target)) {
      structuralEdges.push(e);
      hasStructuralParent.add(e.target);
    }
  }
  const targetIds = new Set(structuralEdges.map((e) => e.target));
  const roots = nodes.filter((n) => !targetIds.has(n.id));

  const structuralParents = new Map<string, string[]>();
  for (const e of structuralEdges) {
    const list = structuralParents.get(e.target) || [];
    list.push(e.source);
    structuralParents.set(e.target, list);
  }

  // ── Material anchors ──
  // Layout never moves content nodes, but chains GROWN FROM them must obey
  // the arrow grammar: the child starts BELOW its material, roughly under
  // it — not at the canvas top as a free root. (Fixes questions asked from
  // the reader appearing above their file node.)
  const materialAnchors = new Map<string, { x: number; y: number }>();
  const perMaterialCount = new Map<string, number>();
  for (const root of roots) {
    const mats = allEdges
      .filter((e) => e.target === root.id && !e.data?.isCrossLink && contentIds.has(e.source))
      .map((e) => allNodes.find((n) => n.id === e.source))
      .filter((m): m is ThoughtNode => !!m);
    if (mats.length === 0) continue;
    // Two different questions, so two different materials answer them. The
    // chain must start below the LOWEST material, or it collides with the one
    // that hangs furthest down — that is a vertical question. But it should
    // start in the MIDDLE of them horizontally, which the lowest material
    // cannot answer: read a row of papers and the lowest is whichever card
    // happens to hang furthest down, telling us nothing about left or right.
    // Taking x from it parked the synthesis under one arbitrary document with
    // the rest of its reading reaching across the canvas.
    const lowest = mats.reduce((a, b) =>
      a.position.y + nodeHeight(a) > b.position.y + nodeHeight(b) ? a : b);
    const midX = mats.reduce((t, m) => t + m.position.x, 0) / mats.length;
    const k = perMaterialCount.get(lowest.id) ?? 0;
    perMaterialCount.set(lowest.id, k + 1);
    materialAnchors.set(root.id, {
      x: midX - 60 + k * (LAYOUT_COL_WIDTH + LAYOUT_H_GAP),
      y: lowest.position.y + nodeHeight(lowest) + LAYOUT_V_GAP,
    });
  }

  const childrenMap = new Map<string, string[]>();
  for (const edge of structuralEdges) {
    const list = childrenMap.get(edge.source) || [];
    list.push(edge.target);
    childrenMap.set(edge.source, list);
  }

  // Being explored out is a property of the EDGE, not of the node: a node can
  // be explored out of one parent and continue plainly from another, and to
  // that second parent it is an ordinary continuation.
  const edgeKey = (parent: string, child: string) => `${parent}\u0000${child}`;
  const exploreEdges = new Set(
    edges
      .filter((e) => e.data?.isBranchFromSelection)
      .map((e) => edgeKey(e.source, e.target))
  );

  // Classify children into 3 types:
  // 1. Continuation — first non-explore child, inherits parent column
  // 2. Regenerate siblings — other non-explore children, columns adjacent to parent
  // 3. Explore branches — explored out of THIS parent, columns further out
  function classifyChildren(parentId: string, claimant: Map<string, string>): {
    continuation: string | null;
    regenerates: string[];
    explores: string[];
  } {
    // A merge is laid out by one parent only; the others still draw their
    // arrow to it, they just no longer decide where it sits.
    const children = (childrenMap.get(parentId) || []).filter(
      (c) => (claimant.get(c) ?? parentId) === parentId
    );
    const nonExplore = children.filter((c) => !exploreEdges.has(edgeKey(parentId, c)));
    const explores = children.filter((c) => exploreEdges.has(edgeKey(parentId, c)));
    return {
      continuation: nonExplore[0] ?? null,
      regenerates: nonExplore.slice(1),
      explores,
    };
  }

  // --- Pass 1: Assign columns ---
  // Anchored chains live in VIRTUAL columns pinned to their material's x —
  // the grid formula never sees them, collision grouping still does.
  const VIRT_BASE = 100000;

  function assignAllColumns(claimant: Map<string, string>) {
    const nodeColumn = new Map<string, number>();
    let nextColumn = 0;
    let nextVirt = VIRT_BASE;
    const colXOverride = new Map<number, number>();
    const colX = (col: number) => colXOverride.get(col) ?? col * (NODE_WIDTH + H_GAP);

    function assignColumns(nodeId: string, col: number) {
      if (nodeColumn.has(nodeId)) return;
      nodeColumn.set(nodeId, col);

      const { continuation, regenerates, explores } = classifyChildren(nodeId, claimant);

      if (continuation) assignColumns(continuation, col);

      // Regenerate siblings: columns immediately adjacent (col+1, col+2, ...).
      // On an ANCHORED chain (virtual column) the sibling must take a fresh
      // virtual column pinned beside the chain — arithmetic on a virtual
      // column id would land in the grid formula at x ≈ 62 million, and
      // feeding it into nextColumn would catapult every later root after it.
      for (let i = 0; i < regenerates.length; i++) {
        let regenCol: number;
        if (col >= VIRT_BASE) {
          regenCol = nextVirt++;
          colXOverride.set(regenCol, colX(col) + (i + 1) * (NODE_WIDTH + H_GAP));
        } else {
          regenCol = col + 1 + i;
          nextColumn = Math.max(nextColumn, regenCol + 1);
        }
        assignColumns(regenerates[i], regenCol);
      }

      // Explore branches: after all regenerate columns (anchored chains keep
      // them beside the chain too, past the sibling columns)
      let exploreOffset = 0;
      for (const ec of explores) {
        let exploreCol: number;
        if (col >= VIRT_BASE) {
          exploreCol = nextVirt++;
          colXOverride.set(exploreCol, colX(col) + (regenerates.length + 1 + exploreOffset) * (NODE_WIDTH + H_GAP));
          exploreOffset++;
        } else {
          exploreCol = nextColumn;
          nextColumn++;
        }
        assignColumns(ec, exploreCol);
      }
    }

    for (const root of roots) {
      const anchor = materialAnchors.get(root.id);
      if (anchor) {
        const virtCol = nextVirt++;
        colXOverride.set(virtCol, anchor.x);
        assignColumns(root.id, virtCol);
      } else {
        const rootCol = nextColumn;
        nextColumn++;
        assignColumns(root.id, rootCol);
      }
    }

    // A claimant sitting on a chain the walk never reaches would strand the
    // merge with no column at all. Fall back to the median parent that DID get
    // one, and repeat: placing one merge can unlock another below it.
    for (let guard = 0; guard < nodes.length; guard++) {
      let progressed = false;
      for (const node of nodes) {
        if (nodeColumn.has(node.id)) continue;
        const cols = (structuralParents.get(node.id) || [])
          .map((p) => nodeColumn.get(p))
          .filter((c): c is number => c !== undefined)
          .sort((a, b) => a - b);
        if (!cols.length) continue;
        assignColumns(node.id, cols[Math.floor((cols.length - 1) / 2)]);
        progressed = true;
      }
      if (!progressed) break;
    }

    return { nodeColumn, colX };
  }

  // ── Which parent owns a merge ──
  // A node with several parents used to inherit the column of whichever parent
  // the walk reached first, so the synthesis landed under one arbitrary source
  // while the rest of its reading reached across the canvas.
  //
  // The middle parent should own it instead — but "middle" means middle COLUMN,
  // and columns are what this pass is computing. So compute them once with
  // nobody claiming anything, read the answer off that provisional run, and
  // lay out again. Deriving the claimant from a node's position in the input
  // array instead would be cheaper and wrong: the same graph handed over in a
  // different order would lay out differently, which is the very instability
  // this is meant to remove.
  const provisional = assignAllColumns(new Map());
  const claimant = new Map<string, string>();
  for (const [child, ps] of structuralParents) {
    if (ps.length < 2) continue;
    const known = ps.filter((p) => provisional.nodeColumn.has(p));
    // Only a parent this node CONTINUES from can own its column; one that
    // explored it out is meant to stand beside it, and handing it the claim
    // would drag the node out of the chain it actually continues. Explore
    // parents are candidates only when there is no plain one.
    const continued = known.filter((p) => !exploreEdges.has(edgeKey(p, child)));
    const pool = continued.length ? continued : known;
    if (!pool.length) continue;
    // Rank by where a column SITS, never by its id. A chain grown from
    // material is pinned to the document it came from and gets its id handed
    // out in traversal order, so the ids carry no left-to-right meaning at
    // all; only colX knows where the parent really is.
    const ranked = [...pool].sort(
      (a, b) =>
        provisional.colX(provisional.nodeColumn.get(a)!) -
          provisional.colX(provisional.nodeColumn.get(b)!) ||
        (a < b ? -1 : a > b ? 1 : 0)
    );
    claimant.set(child, ranked[Math.floor((ranked.length - 1) / 2)]);
  }
  const { nodeColumn, colX } = assignAllColumns(claimant);

  // --- Pass 2: Vertical positioning ---
  const nodeHeightMap = new Map<string, number>();
  for (const node of nodes) {
    nodeHeightMap.set(node.id, nodeHeight(node));
  }

  const positioned = new Map<string, { x: number; y: number }>();

  // BFS in topological order to assign y
  const visited = new Set<string>();
  const queue: string[] = [...roots.map((r) => r.id)];

  // Roots start at y=0; material-anchored roots start under their material
  for (const rootId of queue) {
    const col = nodeColumn.get(rootId) ?? 0;
    const anchor = materialAnchors.get(rootId);
    positioned.set(rootId, { x: colX(col), y: anchor?.y ?? 0 });
    visited.add(rootId);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const parentPos = positioned.get(current)!;
    const parentHeight = nodeHeightMap.get(current) || 220;

    const { continuation, regenerates, explores } = classifyChildren(current, claimant);

    if (continuation && !visited.has(continuation)) {
      visited.add(continuation);
      const col = nodeColumn.get(continuation) ?? 0;
      positioned.set(continuation, {
        x: colX(col),
        y: parentPos.y + parentHeight + V_GAP,
      });
      queue.push(continuation);
    }

    // Regenerate siblings: same y as continuation (they're alternative answers)
    const continuationY = parentPos.y + parentHeight + V_GAP;
    for (const rc of regenerates) {
      if (visited.has(rc)) continue;
      visited.add(rc);
      const col = nodeColumn.get(rc) ?? 0;
      positioned.set(rc, {
        x: colX(col),
        y: continuationY,
      });
      queue.push(rc);
    }

    // Explore branches: start at parent's y (slight offset for visible edge)
    for (const ec of explores) {
      if (visited.has(ec)) continue;
      visited.add(ec);
      const col = nodeColumn.get(ec) ?? 0;
      positioned.set(ec, {
        x: colX(col),
        y: parentPos.y + parentHeight * 0.25,
      });
      queue.push(ec);
    }
  }

  // Same story for y: a merge reached only through its claimant may still be
  // unplaced. Sit it below the lowest parent that was placed, so the arrow
  // keeps pointing downward instead of the node collapsing to the origin.
  for (let guard = 0; guard < nodes.length; guard++) {
    let progressed = false;
    for (const node of nodes) {
      if (positioned.has(node.id)) continue;
      const ps = (structuralParents.get(node.id) || []).filter((p) => positioned.has(p));
      if (!ps.length) continue;
      const bottom = Math.max(
        ...ps.map((p) => positioned.get(p)!.y + (nodeHeightMap.get(p) || 220))
      );
      positioned.set(node.id, { x: colX(nodeColumn.get(node.id) ?? 0), y: bottom + V_GAP });
      progressed = true;
    }
    if (!progressed) break;
  }

  // Handle any orphan nodes (shouldn't happen, but safety)
  for (const node of nodes) {
    if (!positioned.has(node.id)) {
      positioned.set(node.id, { x: 0, y: 0 });
    }
  }

  // ── A merge clears every parent it reads ──
  // Pass 2 hands a node its y from the single parent that walked to it, so a
  // synthesis could sit level with — or above — the other sources feeding it
  // and the arrow pointed back up the canvas. Whichever parent is chosen, the
  // node belongs below the LOWEST one. Only merges need this (a single-parent
  // chain is already correct by construction), and explore branches are
  // exempt: they are meant to sit alongside their parent, not beneath it.
  for (let pass = 0; pass < 5; pass++) {
    let moved = false;
    for (const node of nodes) {
      const pos = positioned.get(node.id);
      if (!pos) continue;
      const all = (structuralParents.get(node.id) || []).filter((p) => positioned.has(p));
      if (all.length < 2) continue;
      // Two rules, one for each kind of arrow into this node. A parent it
      // CONTINUES from must be cleared entirely. A parent that EXPLORED it out
      // is meant to stand beside it — no clearance owed, but the child must
      // still never float above that parent's top edge.
      const continued = all.filter((p) => !exploreEdges.has(`${p}\u0000${node.id}`));
      const explored = all.filter((p) => exploreEdges.has(`${p}\u0000${node.id}`));
      let floor = -Infinity;
      for (const p of continued) {
        floor = Math.max(floor, positioned.get(p)!.y + (nodeHeightMap.get(p) || 220) + V_GAP);
      }
      for (const p of explored) {
        floor = Math.max(floor, positioned.get(p)!.y);
      }
      if (floor > -Infinity && pos.y < floor) {
        const delta = floor - pos.y;
        pos.y = floor;
        // The whole subtree travels with it, not only the part sharing this
        // column. An explore branch is given a column of its own, so a
        // column-restricted shift left it where it was and the child came to
        // rest above the parent that spawned it. Dedupe first: a descendant
        // reachable by two paths must not be moved twice.
        for (const dId of new Set(getDescendantIds(node.id, structuralEdges))) {
          const dPos = positioned.get(dId);
          if (dPos) dPos.y += delta;
        }
        moved = true;
      }
    }
    if (!moved) break;
  }

  // --- Pass 3: Collision resolution ---
  // Group nodes by column, sort by y within each column, push down overlaps
  const columnNodes = new Map<number, string[]>();
  for (const node of nodes) {
    const col = nodeColumn.get(node.id) ?? 0;
    const list = columnNodes.get(col) || [];
    list.push(node.id);
    columnNodes.set(col, list);
  }

  for (let pass = 0; pass < 5; pass++) {
    let moved = false;

    for (const [, colNodeIds] of columnNodes) {
      // Sort by current y
      colNodeIds.sort((a, b) => (positioned.get(a)!.y) - (positioned.get(b)!.y));

      for (let i = 1; i < colNodeIds.length; i++) {
        const prevId = colNodeIds[i - 1];
        const currId = colNodeIds[i];
        const prevPos = positioned.get(prevId)!;
        const currPos = positioned.get(currId)!;
        const prevHeight = nodeHeightMap.get(prevId) || 220;

        const minY = prevPos.y + prevHeight + V_PAD;
        if (currPos.y < minY) {
          const delta = minY - currPos.y;
          currPos.y = minY;
          moved = true;

          // Push all descendants down too. Not only the ones sharing this
          // column: an explore branch is given a column of its own, and
          // leaving it behind stranded a child above the parent it came from.
          // Dedupe — a descendant reachable by two paths moves once.
          for (const dId of new Set(getDescendantIds(currId, structuralEdges))) {
            const dPos = positioned.get(dId);
            if (dPos) dPos.y += delta;
          }
        }
      }
    }

    if (!moved) break;
  }

  // --- Pass 4: Serpentine fold ---
  // A pure PATH component (every node ≤1 structural child — the shape of
  // an imported session chain) taller than FOLD_HEIGHT wraps into
  // newspaper columns: within a column order and vertical alignment hold
  // (the layout law, extended, not broken — folding a line is not
  // shuffling its words), columns advance in reading order, and
  // zoom-to-fit sees a page instead of a hair. Folding only happens when
  // nothing else occupies the space to the right — a canvas with branches
  // or side material keeps its tall single line rather than colliding.
  // Fold points PREFER chapter boundaries: past 60% of the column budget,
  // a turn annotated by an importer note (compaction) starts a new column,
  // so chapters and columns tend to coincide.
  const FOLD_HEIGHT = 8000;
  const FOLD_COL_GAP = 180; // folded columns breathe wider than branch columns
  // importer-owned notes (provenance-stamped) annotate turns via an edge;
  // those targets are the preferred fold points
  const importerNotes = allNodes.filter((n) => n.data.stepKind === 'note' && n.data.importSource);
  const noteTargets = new Set(
    allEdges.filter((e) => importerNotes.some((n) => n.id === e.source)).map((e) => e.target)
  );
  for (const root of roots) {
    const chain: string[] = [];
    let cur: string | undefined = root.id;
    let pure = true;
    while (cur) {
      chain.push(cur);
      const kids: string[] = childrenMap.get(cur) || [];
      if (kids.length > 1) { pure = false; break; }
      cur = kids[0];
    }
    if (!pure || chain.length < 8) continue;
    const chainSet = new Set(chain);
    const first = positioned.get(chain[0])!;
    const lastId = chain[chain.length - 1];
    const totalH = positioned.get(lastId)!.y + (nodeHeightMap.get(lastId) || 220) - first.y;
    if (totalH <= FOLD_HEIGHT) continue;
    const rightOccupied = nodes.some((n) => !chainSet.has(n.id) && positioned.get(n.id)!.x > first.x + NODE_WIDTH / 2);
    if (rightOccupied) continue;
    let foldCol = 0;
    let y = first.y;
    for (const id of chain) {
      const h = nodeHeightMap.get(id) || 220;
      const used = y - first.y;
      const mustFold = used + h > FOLD_HEIGHT;
      const chapterFold = noteTargets.has(id) && used > FOLD_HEIGHT * 0.6;
      if ((mustFold || chapterFold) && y !== first.y) { foldCol++; y = first.y; }
      const p = positioned.get(id)!;
      p.x = first.x + foldCol * (NODE_WIDTH + FOLD_COL_GAP);
      p.y = y;
      y += h + V_GAP;
    }
  }

  // --- Pass 5: Importer-note placement ---
  // The layout law, refined: USER content (notes, files, frames the user
  // arranged) is never moved — but importer-OWNED notes (provenance-
  // stamped) are the mirror's own annotations, and the mirror may re-seat
  // them on every relayout. Preference order: the gutter left of the turn
  // they annotate → directly above it (a chapter heading when the turn
  // opens a folded column) → stacked above the column top.
  const solidRects = nodes.map((n) => {
    const p = positioned.get(n.id)!;
    return { x: p.x, y: p.y, w: NODE_WIDTH, h: nodeHeightMap.get(n.id) || 220 };
  });
  const NOTE_W = 460;
  const NOTE_H = 130;
  const collides = (x: number, y: number) =>
    solidRects.some((r) => x < r.x + r.w && x + NOTE_W > r.x && y < r.y + r.h && y + NOTE_H > r.y);
  const colTopStacks = new Map<number, number>();
  for (const note of importerNotes) {
    const targetId = allEdges.find((e) => e.source === note.id)?.target;
    const tp = targetId ? positioned.get(targetId) : undefined;
    if (!tp) continue;
    let x = tp.x - 520;
    let y = tp.y;
    if (collides(x, y)) { x = tp.x; y = tp.y - NOTE_H - 40; }
    if (collides(x, y)) {
      const colKey = Math.round(tp.x);
      const colMinY = Math.min(...nodes.filter((n) => Math.round(positioned.get(n.id)!.x) === colKey).map((n) => positioned.get(n.id)!.y));
      const k = colTopStacks.get(colKey) ?? 0;
      colTopStacks.set(colKey, k + 1);
      x = tp.x;
      y = colMinY - NOTE_H - 40 - k * (NOTE_H + 30);
    }
    positioned.set(note.id, { x, y });
  }

  return allNodes.map((node) => {
    const pos = positioned.get(node.id);
    return pos ? { ...node, position: pos } : node;
  });
}
