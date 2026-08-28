// Session atlas — the discovery half of the continuity layer. The desktop
// shell hands us fenced fs primitives (window.desktopSessions); this module
// owns every piece of runner knowledge: where sessions live, how to read a
// file HEAD into a card (cheap — full parsing happens only when the user
// opens a session), and how cards group into project folders by cwd.
//
// Design laws carried from the adapter work:
//   - cwd is enrichment, not requirement: a runner that records no cwd
//     still lists — its sessions land in the unfiled group.
//   - detection is strict: a head that matches no runner signature is
//     skipped silently, never guessed at.
//   - read-only by contract, inherited from the shell primitives.

export interface SessionCard {
  runner: 'claude-code' | 'codex';
  rootKey: 'claude-projects' | 'codex-sessions';
  rel: string;
  sessionId: string;
  cwd: string | null;
  title: string;
  mtime: number;
  size: number;
}

export interface AtlasGroup {
  /** Absolute cwd, or null for the unfiled group. */
  cwd: string | null;
  /** Last path segment, the human name of the project folder. */
  name: string;
  cards: SessionCard[]; // newest first
}

const HEAD_BYTES = 16384;

// A session file may hold megabytes; a card needs only identity + a title.
// Both runners put identity in the first lines, so a bounded head suffices.
function cardFromHead(rootKey: SessionCard['rootKey'], rel: string, head: string, mtime: number, size: number): SessionCard | null {
  if (rootKey === 'codex-sessions') {
    if (!head.includes('"session_meta"')) return null;
    const id = head.match(/"id":\s*"([\w-]+)"/)?.[1];
    if (!id) return null;
    const cwd = head.match(/"cwd":\s*"((?:[^"\\]|\\.)*)"/)?.[1] ?? null;
    return { runner: 'codex', rootKey, rel, sessionId: id, cwd: cwd ? JSON.parse(`"${cwd}"`) : null, title: firstUserLine(head) ?? `session ${id.slice(0, 8)}`, mtime, size };
  }
  // claude-code: every event line carries sessionId + cwd; a leading
  // summary line (continued sessions) makes the best title.
  const id = head.match(/"sessionId":\s*"([\w-]+)"/)?.[1];
  if (!id) return null;
  const cwdRaw = head.match(/"cwd":\s*"((?:[^"\\]|\\.)*)"/)?.[1] ?? null;
  const summary = head.match(/"type":\s*"summary"[^\n]*?"summary":\s*"((?:[^"\\]|\\.)*)"/)?.[1];
  const title = (summary ? JSON.parse(`"${summary}"`) : null) ?? firstUserLine(head) ?? `session ${id.slice(0, 8)}`;
  return { runner: 'claude-code', rootKey, rel, sessionId: id, cwd: cwdRaw ? JSON.parse(`"${cwdRaw}"`) : null, title, mtime, size };
}

/** First human-authored user text in the head, clipped to a card title. */
function firstUserLine(head: string): string | null {
  for (const raw of head.split('\n')) {
    if (!raw.includes('"user"')) continue;
    try {
      const line = JSON.parse(raw) as { type?: string; payload?: { type?: string; role?: string; content?: Array<{ type?: string; text?: string }> }; message?: { role?: string; content?: unknown } };
      let text: string | null = null;
      if (line.type === 'user' && typeof line.message?.content === 'string') text = line.message.content;
      else if (line.type === 'response_item' && line.payload?.type === 'message' && line.payload.role === 'user') {
        text = (line.payload.content ?? []).find((p) => p.type === 'input_text' && p.text)?.text ?? null;
      }
      if (text && text.trim() && !text.startsWith('<')) {
        return text.trim().split('\n')[0].slice(0, 80);
      }
    } catch { /* truncated tail line of the head — fine */ }
  }
  return null;
}

export async function scanSessions(): Promise<SessionCard[]> {
  const bridge = window.desktopSessions;
  if (!bridge) return [];
  const roots: SessionCard['rootKey'][] = ['claude-projects', 'codex-sessions'];
  const cards: SessionCard[] = [];
  for (const rootKey of roots) {
    const files = await bridge.list(rootKey).catch(() => []);
    // newest first, and head-read concurrently in small batches — a store
    // can hold hundreds of files, but each head is one bounded read
    const sorted = [...files].sort((a, b) => b.mtime - a.mtime);
    const BATCH = 12;
    for (let i = 0; i < sorted.length; i += BATCH) {
      const batch = await Promise.all(sorted.slice(i, i + BATCH).map(async (f) => {
        const head = await bridge.head(rootKey, f.rel, HEAD_BYTES).catch(() => '');
        return head ? cardFromHead(rootKey, f.rel, head, f.mtime, f.size) : null;
      }));
      for (const c of batch) if (c) cards.push(c);
    }
  }
  return cards.sort((a, b) => b.mtime - a.mtime);
}

export function groupByCwd(cards: SessionCard[]): AtlasGroup[] {
  const map = new Map<string, AtlasGroup>();
  for (const card of cards) {
    const key = card.cwd ?? '';
    let g = map.get(key);
    if (!g) {
      g = { cwd: card.cwd, name: card.cwd ? card.cwd.split('/').filter(Boolean).pop() ?? card.cwd : '', cards: [] };
      map.set(key, g);
    }
    g.cards.push(card);
  }
  // most recently active folder first; the unfiled group sinks to the end
  return [...map.values()].sort((a, b) => {
    if (!a.cwd !== !b.cwd) return a.cwd ? -1 : 1;
    return b.cards[0].mtime - a.cards[0].mtime;
  });
}
