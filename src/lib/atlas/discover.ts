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
  runner: 'claude-code' | 'codex' | 'dsh';
  rootKey: string;
  rel: string;
  sessionId: string;
  cwd: string | null;
  title: string;
  mtime: number;
  size: number;
  /** A spawned subagent thread (codex parent_thread_id, claude-code
      sidechain file) — machinery, not a conversation the user held;
      hidden unless asked for. */
  subagent?: boolean;
  /** the session that spawned this subagent, when the file says so */
  parentSessionId?: string;
}

/** The identity a session file answers to. One rule for every reader
 *  (cards, the live watcher, deep links): a codex rollout is its
 *  session_meta id; a claude-code file is its sessionId — EXCEPT a
 *  subagent's own file, whose sessionId names the PARENT and whose real
 *  name is the agentId. Reading the parent's id there would hang the
 *  parent's badges on the child and let the parent's canvas adopt it. */
export function identityFromHead(head: string): string | null {
  for (const raw of head.split('\n')) {
    let l: { type?: string; payload?: { id?: string }; sessionId?: string; isSidechain?: boolean; agentId?: string; id?: string };
    try { l = JSON.parse(raw) as typeof l; } catch { continue; }
    // dsh: the session-open event names the file at the TOP level
    if (l.type === 'session' && typeof l.id === 'string') return l.id;
    if (l.type === 'session_meta' && l.payload?.id) return l.payload.id;
    if ((l.type === 'user' || l.type === 'assistant') && typeof l.sessionId === 'string') {
      return l.isSidechain && typeof l.agentId === 'string' ? l.agentId : l.sessionId;
    }
  }
  return null;
}

export interface AtlasGroup {
  /** Absolute cwd, or null for the unfiled group. */
  cwd: string | null;
  /** Last path segment, the human name of the project folder. */
  name: string;
  cards: SessionCard[]; // newest first
}

const HEAD_BYTES = 16384;
const HEAD_RETRY_BYTES = 262144;

// A session file may hold megabytes; a card needs only identity + a title.
// Both runners put identity in the first lines, so a bounded head suffices.
// Identity comes ONLY from top-level fields of parsed lines — never from a
// regex over raw text: sessions that DISCUSS session formats quote strings
// like "cwd":"..." in their content, and a text match mis-files them.
// The runner is detected from CONTENT, not from which root the file came
// from — a custom directory can hold any mix of formats, and a file no
// signature claims is skipped, never guessed at.
function cardFromHead(rootKey: string, rel: string, head: string, mtime: number, size: number): SessionCard | null {
  const lines: Record<string, unknown>[] = [];
  for (const raw of head.split('\n')) {
    try { lines.push(JSON.parse(raw) as Record<string, unknown>); } catch { /* truncated tail of the head */ }
  }
  // dsh: the session-open event is FIRST, names id+cwd at the top level;
  // the human title arrives as its own session/title event later in the head
  // (fallback: the first real user message, then the id).
  const dshOpen = lines.find((l) => l.type === 'session') as { id?: string; cwd?: string } | undefined;
  if (typeof dshOpen?.id === 'string') {
    const id = dshOpen.id;
    const titleLine = lines.find((l) => l.type === 'session/title') as { data?: { title?: string } } | undefined;
    const firstUser = dshFirstUserText(lines);
    const title = titleLine?.data?.title ?? firstUser ?? `session ${id.replace(/^session-/, '').slice(0, 8)}`;
    return { runner: 'dsh', rootKey, rel, sessionId: id, cwd: dshOpen.cwd ?? null, title, mtime, size };
  }
  const meta = lines.find((l) => l.type === 'session_meta') as { payload?: { id?: string; cwd?: string; parent_thread_id?: string } } | undefined;
  if (meta?.payload?.id) {
    const id = meta.payload.id;
    return {
      runner: 'codex', rootKey, rel, sessionId: id, cwd: meta.payload.cwd ?? null,
      title: firstUserLine(head) ?? `session ${id.slice(0, 8)}`, mtime, size,
      subagent: !!meta.payload.parent_thread_id,
    };
  }
  // claude-code: every event line carries top-level sessionId + cwd; a
  // leading summary line (continued sessions) makes the best title.
  const marker = lines.find((l) => typeof l.sessionId === 'string' && (l.type === 'user' || l.type === 'assistant' || typeof l.cwd === 'string')) as { sessionId?: string; cwd?: string } | undefined;
  const first = lines.find((l) => l.type === 'user' || l.type === 'assistant') as { isSidechain?: boolean; agentId?: string; sessionId?: string } | undefined;
  if (first?.isSidechain && typeof first.agentId === 'string') {
    return {
      runner: 'claude-code', rootKey, rel, sessionId: first.agentId, cwd: marker?.cwd ?? null,
      title: firstUserLine(head) ?? `agent ${first.agentId.slice(0, 8)}`, mtime, size,
      subagent: true, ...(first.sessionId ? { parentSessionId: first.sessionId } : {}),
    };
  }
  const id = marker?.sessionId;
  if (!id) return null;
  const summary = (lines.find((l) => l.type === 'summary' && typeof l.summary === 'string') as { summary?: string } | undefined)?.summary;
  const title = summary ?? firstUserLine(head) ?? `session ${id.slice(0, 8)}`;
  return { runner: 'claude-code', rootKey, rel, sessionId: id, cwd: marker?.cwd ?? null, title, mtime, size };
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
      if (text && text.trim() && !text.startsWith('<') && !text.startsWith('# AGENTS.md instructions for ')) {
        return text.trim().split('\n')[0].slice(0, 80);
      }
    } catch { /* truncated tail line of the head — fine */ }
  }
  return null;
}

/** First REAL user message in a DSH head (source.kind === 'user') — the
 *  runner injects runtime-context and skill-catalog messages with other
 *  kinds; those are template, never a title. */
function dshFirstUserText(lines: Record<string, unknown>[]): string | null {
  for (const l of lines) {
    if (l.type !== 'user/message') continue;
    const d = (l as { data?: { source?: { kind?: string }; content?: Array<{ type?: string; text?: string }> } }).data;
    if (!d || (d.source?.kind && d.source.kind !== 'user')) continue;
    const text = (d.content ?? []).filter((p) => p.type === 'text' && p.text).map((p) => p.text).join('\n').trim();
    if (text && !text.startsWith('<')) return text.split('\n')[0].slice(0, 80);
  }
  return null;
}

// Which roots the user has toggled off — a renderer preference; the
// shell's whitelist itself is not affected.
const DISABLED_KEY = 'thoughtdag.atlas.disabledRoots';
export const disabledRoots = (): Set<string> => {
  try { return new Set(JSON.parse(localStorage.getItem(DISABLED_KEY) ?? '[]') as string[]); } catch { return new Set(); }
};
export function setRootDisabled(key: string, disabled: boolean): void {
  const set = disabledRoots();
  if (disabled) set.add(key); else set.delete(key);
  localStorage.setItem(DISABLED_KEY, JSON.stringify([...set]));
}

/** Session ids seen by the LAST scan — the twin badge's reachability
 *  cache. Empty until a scan ran (then nothing is reported unreachable:
 *  never a false alarm). */
export const knownSessionIds = new Set<string>();

export async function scanSessions(): Promise<SessionCard[]> {
  const bridge = window.desktopSessions;
  if (!bridge) return [];
  const off = disabledRoots();
  const roots = (await bridge.roots().catch(() => [])).filter((r) => r.exists && !off.has(r.key)).map((r) => r.key);
  const cards: SessionCard[] = [];
  for (const rootKey of roots) {
    const files = await bridge.list(rootKey).catch(() => []);
    // newest first, and head-read concurrently in small batches — a store
    // can hold hundreds of files, but each head is one bounded read
    const sorted = [...files].sort((a, b) => b.mtime - a.mtime);
    const BATCH = 12;
    for (let i = 0; i < sorted.length; i += BATCH) {
      const batch = await Promise.all(sorted.slice(i, i + BATCH).map(async (f) => {
        // DSH titles ride session/title AFTER the first user message, which
        // can be a giant pasted conversation — read those heads generously.
        const bytes = f.rel.endsWith('.zstd') ? HEAD_RETRY_BYTES : HEAD_BYTES;
        const head = await bridge.head(rootKey, f.rel, bytes).catch(() => '');
        if (!head) return null;
        const card = cardFromHead(rootKey, f.rel, head, f.mtime, f.size);
        if (card) return card;
        // a codex session_meta first line can be 48KB+ of instructions —
        // one generous retry before giving a file up as unrecognized
        const bigHead = await bridge.head(rootKey, f.rel, HEAD_RETRY_BYTES).catch(() => '');
        return bigHead.length > head.length ? cardFromHead(rootKey, f.rel, bigHead, f.mtime, f.size) : null;
      }));
      for (const c of batch) if (c) cards.push(c);
    }
  }
  knownSessionIds.clear();
  for (const c of cards) knownSessionIds.add(c.sessionId);
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
