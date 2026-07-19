import type { ThoughtNode, ThoughtData } from '../types';

// Shared by the timeline rail and the timeline overview modal: every
// non-frame node as a chronicle entry, sorted by creation time. Creation
// time is the immutable axis (the moment you remember is the moment it was
// born; regeneration must not teleport a point); modification shows up as a
// secondary signal only. Undated nodes keep graph order at the head.

export const DOT_COLOR: Record<string, string> = {
  ruleout: '#ef4444',
  decision: '#6B5CE7',
  pivot: '#e8890c',
  open: '#d97706',
  insight: '#0284c7',
};

export type TimelineEntry = {
  id: string;
  label: string;
  createdAt?: string;
  modifiedAt?: string;
  color: string;
  archived: boolean;
  recentlyEdited: boolean;
  x: number;
  y: number;
};

const last = (arr?: (string | undefined)[]) => {
  if (!arr) return undefined;
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i]) return arr[i];
  return undefined;
};

export function collectTimeline(nodes: ThoughtNode[], now: number): TimelineEntry[] {
  return nodes
    .filter((n) => (n.data as ThoughtData).stepKind !== 'frame')
    .map((n, i) => {
      const d = n.data as ThoughtData;
      const createdAt = d.createdAt ?? d.askedAt ?? d.generatedAts?.[0] ?? d.lastGeneratedAt;
      const modifiedAt = [d.askedAt, last(d.generatedAts), last(d.editedAts)]
        .filter(Boolean)
        .sort()
        .pop() as string | undefined;
      const type = d.summaryTypes?.[d.responseIndex ?? 0] ?? undefined;
      const summary = d.summaries?.[d.responseIndex ?? 0];
      const created = createdAt ? Date.parse(createdAt) : NaN;
      const modified = modifiedAt ? Date.parse(modifiedAt) : NaN;
      return {
        entry: {
          id: n.id,
          label: (summary || d.question || '').slice(0, 60),
          createdAt,
          modifiedAt,
          color: (type && DOT_COLOR[type]) || '#b8b3c7',
          archived: !!d.archived,
          // Second-order signal: touched noticeably after birth, and recently.
          recentlyEdited:
            !isNaN(created) && !isNaN(modified) && modified - created > 60_000 && now - modified < 30 * 60_000,
          x: n.position.x,
          y: n.position.y,
        },
        i,
      };
    })
    .sort((a, b) => {
      const ka = a.entry.createdAt ?? '';
      const kb = b.entry.createdAt ?? '';
      return ka < kb ? -1 : ka > kb ? 1 : a.i - b.i;
    })
    .map(({ entry }) => entry);
}
