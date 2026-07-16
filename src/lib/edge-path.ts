import type { Position } from '@xyflow/react';
import type { ThoughtNode } from '../types';
import { nodeHeight } from './layout';
import { NODE_CSS_WIDTH } from './constants';

// Collision-aware bezier routing, the light way: build the natural arc,
// then — if it passes through any node card — try a few sideways "bends"
// (control points pushed perpendicular to the edge) and keep the first
// candidate that clears every card. No A*, no visibility graph: a handful
// of samples per candidate is enough at canvas scale, and edges stay
// stable while dragging because candidates are tried in a fixed order.

interface Pt { x: number; y: number }

const BENDS = [0, 0.18, -0.18, 0.36, -0.36, 0.55, -0.55];
const SAMPLES = 22;
const MARGIN = 10; // clearance around cards

function controlFor(pos: Position | undefined, x: number, y: number, ox: number, oy: number): Pt {
  // Control point extends along the handle direction, like a normal bezier
  switch (pos) {
    case 'left': return { x: x - ox, y };
    case 'right': return { x: x + ox, y };
    case 'top': return { x, y: y - oy };
    default: return { x, y: y + oy }; // bottom / undefined
  }
}

function cubicAt(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

export interface RoutedPath {
  path: string;
  labelX: number;
  labelY: number;
}

export function routeEdge(
  sourceX: number, sourceY: number, sourcePosition: Position | undefined,
  targetX: number, targetY: number, targetPosition: Position | undefined,
  sourceId: string, targetId: string,
  nodes: ThoughtNode[],
): RoutedPath {
  // Horizontal edges carry fixed semantic anchors (source right edge →
  // target left edge). When the target's CENTER lies left of the source's
  // center (hand-placed nodes), mirror both anchors about their node's
  // vertical centerline: the edge leaves left and enters right instead of
  // looping around the source card. Center comparison keeps the direction
  // matching what you see (a card mostly on the left connects from the
  // left, even while still overlapping); the flip at center-crossing is a
  // single follow-the-drag switch, not a flutter. Render-time only — the
  // stored handles keep their meaning. Centerline mirroring also keeps
  // glyph-tier anchors hugging the seal.
  if (sourcePosition === 'right' && targetPosition === 'left') {
    const src = nodes.find((n) => n.id === sourceId);
    const tgt = nodes.find((n) => n.id === targetId);
    if (src && tgt) {
      const sCx = src.position.x + (src.measured?.width ?? NODE_CSS_WIDTH) / 2;
      const tCx = tgt.position.x + (tgt.measured?.width ?? NODE_CSS_WIDTH) / 2;
      if (tCx < sCx) {
        sourceX = 2 * sCx - sourceX;
        targetX = 2 * tCx - targetX;
        sourcePosition = 'left' as Position;
        targetPosition = 'right' as Position;
      }
    }
  }
  const p0: Pt = { x: sourceX, y: sourceY };
  const p3: Pt = { x: targetX, y: targetY };
  const dist = Math.hypot(targetX - sourceX, targetY - sourceY);
  const offset = Math.min(Math.max(dist * 0.45, 40), 260);

  // Obstacles: every card except the two endpoints, inflated by MARGIN
  const obstacles = nodes
    .filter((n) => n.id !== sourceId && n.id !== targetId)
    .map((n) => ({
      x1: n.position.x - MARGIN,
      y1: n.position.y - MARGIN,
      x2: n.position.x + (n.measured?.width ?? NODE_CSS_WIDTH) + MARGIN,
      y2: n.position.y + nodeHeight(n) + MARGIN,
    }));

  // Unit normal to the straight source→target line, for sideways bending
  const nx = dist > 0 ? -(targetY - sourceY) / dist : 0;
  const ny = dist > 0 ? (targetX - sourceX) / dist : 0;

  let best: { c1: Pt; c2: Pt; hits: number } | null = null;

  for (const bend of BENDS) {
    const sway = bend * dist;
    const c1 = controlFor(sourcePosition, sourceX, sourceY, offset, offset);
    const c2 = controlFor(targetPosition, targetX, targetY, offset, offset);
    c1.x += nx * sway; c1.y += ny * sway;
    c2.x += nx * sway; c2.y += ny * sway;

    let hits = 0;
    for (let i = 1; i < SAMPLES; i++) {
      const pt = cubicAt(p0, c1, c2, p3, i / SAMPLES);
      for (const o of obstacles) {
        if (pt.x > o.x1 && pt.x < o.x2 && pt.y > o.y1 && pt.y < o.y2) { hits++; break; }
      }
    }
    if (hits === 0) { best = { c1, c2, hits }; break; }
    if (!best || hits < best.hits) best = { c1, c2, hits };
  }

  const { c1, c2 } = best!;
  const mid = cubicAt(p0, c1, c2, p3, 0.5);
  return {
    path: `M ${sourceX} ${sourceY} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${targetX} ${targetY}`,
    labelX: mid.x,
    labelY: mid.y,
  };
}
