import type { SessionCard } from './discover';

// The watermark: what the user has SEEN, per session file — the atlas's
// unread model. A card is NEW when its file wasn't in the watermark,
// UPDATED when the file grew past the recorded state. Only two things
// advance the line: opening a card, or "mark all seen" — closing the
// atlas never does, so "I saw there were updates but had no time" is
// still true tomorrow. This same ledger is the future incremental-import
// account book: it records exactly how far the mirror has caught up.

const KEY = 'thoughtdag.atlas.watermark';

interface Mark { mtime: number; size: number }
type Watermark = Record<string, Mark>;

export interface CardChange {
  kind: 'new' | 'updated';
  /** Bytes grown since last seen (updated only). */
  deltaSize: number;
}

const cardKey = (c: SessionCard) => `${c.rootKey}:${c.rel}`;

function load(): Watermark {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Watermark; } catch { return {}; }
}
function save(w: Watermark): void {
  localStorage.setItem(KEY, JSON.stringify(w));
}

/** Diff the scan against the watermark. First run (empty watermark)
 *  baselines silently — flagging everything NEW would be noise. Entries
 *  whose files vanished (upstream cleanup) are dropped on the way. */
export function diffAgainstWatermark(cards: SessionCard[]): Map<string, CardChange> {
  const w = load();
  const changes = new Map<string, CardChange>();
  if (Object.keys(w).length === 0) {
    save(Object.fromEntries(cards.map((c) => [cardKey(c), { mtime: c.mtime, size: c.size }])));
    return changes;
  }
  const live = new Set(cards.map(cardKey));
  let pruned = false;
  for (const k of Object.keys(w)) {
    if (!live.has(k)) { delete w[k]; pruned = true; }
  }
  for (const c of cards) {
    const prev = w[cardKey(c)];
    if (!prev) changes.set(cardKey(c), { kind: 'new', deltaSize: c.size });
    else if (c.size > prev.size || c.mtime > prev.mtime + 1000) {
      changes.set(cardKey(c), { kind: 'updated', deltaSize: Math.max(0, c.size - prev.size) });
    }
  }
  if (pruned) save(w);
  return changes;
}

export function markSeen(card: SessionCard): void {
  const w = load();
  w[cardKey(card)] = { mtime: card.mtime, size: card.size };
  save(w);
}

export function markAllSeen(cards: SessionCard[]): void {
  const w = load();
  for (const c of cards) w[cardKey(c)] = { mtime: c.mtime, size: c.size };
  save(w);
}

export const changeKeyOf = cardKey;
