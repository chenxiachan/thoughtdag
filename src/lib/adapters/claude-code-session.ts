import type { ThoughtNode, ThoughtEdge } from '../../types';
import { makeNode, type ImportableConversation } from '../import-chat';
import { autoLayout } from '../layout';
import { generateId } from '../../utils';
import { turnsToBranch, seedPlaque, toolAttachments, dropSelfCommandTurns } from './shared';

// Claude Code session importer — the continuity layer's READ direction for
// one concrete runner. A session lives as JSONL under ~/.claude/projects/;
// each line is an event (user / assistant / system / metadata), chained by
// uuid → parentUuid, with an assistant turn often split across several
// lines (thinking, text, tool_use each on their own).
//
// Projection rules (v0, deliberately honest about what it drops):
//   - A TURN = one user text message plus everything the assistant did
//     until the next user text message → one Q/A node.
//   - Tool calls pair with their results (tool_use.id ↔ tool_result.
//     tool_use_id) into ATOMIC text attachments on the turn's node — the
//     existing per-attachment exclude dial makes each one individually
//     prunable, which is the whole point of importing.
//   - `thinking` blocks are dropped: they never re-enter a next turn's
//     context in the source runner either, and this importer projects
//     context, not the model's private reasoning.
//   - Sidechain (subagent) events are skipped in v0.
//   - A compaction boundary becomes a [Note] node wired into the next
//     turn: the source model's history was truncated there, and an honest
//     projection keeps that visible and prunable.
//   - Sessions can carry thousands of turns; only the most recent
//     MAX_TURNS import, and a [Note] node says so out loud.
// The source session file is never written — read-only by contract.

const TOOL_RESULT_LIMIT = 4000;
const TOOL_CALL_LIMIT = 800;

interface ContentPart {
  type?: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: string | Array<{ type?: string; text?: string }>;
}

interface SessionLine {
  type?: string;
  subtype?: string;
  uuid?: string;
  sessionId?: string;
  isSidechain?: boolean;
  customTitle?: string;
  slug?: string;
  timestamp?: string;
  compactMetadata?: { preTokens?: number; postTokens?: number };
  message?: {
    role?: string;
    content?: string | ContentPart[];
  };
}

interface Turn {
  question: string;
  response: string;
  itemIds: string[];
  tools: { name: string; call: string; result: string; truncated: boolean }[];
  compactionBefore?: string; // note text for a compaction boundary preceding this turn
}

function textParts(content: string | ContentPart[] | undefined): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter((p) => p.type === 'text' && p.text).map((p) => p.text).join('\n');
}

function resultText(content: string | Array<{ type?: string; text?: string }> | undefined): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((p) => (p.type === 'text' && p.text ? p.text : p.type === 'image' ? '[image result omitted]' : ''))
    .filter(Boolean)
    .join('\n');
}

const clip = (s: string, limit: number): { text: string; truncated: boolean } =>
  s.length > limit ? { text: `${s.slice(0, limit)}\n…[truncated, ${s.length} chars total]`, truncated: true } : { text: s, truncated: false };

/** Streaming turn collector — mirror of the Codex one: lines in one at a
 *  time (no path may hold a whole multi-hundred-MB session as text),
 *  turns accumulate small. String entry points below are thin wrappers. */
export class ClaudeSessionCollector {
  private turns: Turn[] = [];
  // tool_use id → registration, so results pair up even across lines
  private pendingTools = new Map<string, { name: string; call: string }>();
  private current: Turn | null = null;
  private pendingCompaction: string | undefined;
  private sessionId: string | null = null;
  private customTitle: string | null = null;
  private slug: string | null = null;

  feedLine(raw: string): void {
    const t = raw.trim();
    if (!t) return;
    let line: SessionLine;
    try { line = JSON.parse(t) as SessionLine; } catch { return; }
    this.feed(line);
  }

  private flush(): void {
    const c = this.current;
    if (c && (c.question || c.response || c.tools.length)) this.turns.push(c);
    this.current = null;
  }

  private feed(line: SessionLine): void {
    if (line.type === 'custom-title' && line.customTitle) this.customTitle = line.customTitle;
    if (line.slug && !this.slug) this.slug = line.slug;
    if (line.isSidechain) return;

    if (line.type === 'system' && line.subtype === 'compact_boundary') {
      this.flush();
      const m = line.compactMetadata;
      this.pendingCompaction = `[Compaction] The source runner compacted its history here${
        m?.preTokens ? ` (${m.preTokens} → ${m.postTokens ?? '?'} tokens)` : ''
      }. Everything above this point reached later turns only as a summary.`;
      return;
    }

    if ((line.type === 'user' || line.type === 'assistant') && line.uuid && line.sessionId && !this.sessionId) {
      this.sessionId = line.sessionId;
    }

    if (line.type === 'user') {
      const content = line.message?.content;
      // tool results ride user lines — pair them with their pending call
      if (Array.isArray(content)) {
        for (const p of content) {
          if (p.type === 'tool_result' && p.tool_use_id) {
            const reg = this.pendingTools.get(p.tool_use_id);
            if (reg && this.current) {
              const res = clip(resultText(p.content), TOOL_RESULT_LIMIT);
              this.current.tools.push({ name: reg.name, call: reg.call, result: res.text, truncated: res.truncated });
              this.pendingTools.delete(p.tool_use_id);
            }
          }
        }
      }
      const text = textParts(content);
      if (text.trim()) {
        this.flush();
        this.current = { question: text, response: '', itemIds: line.uuid ? [line.uuid] : [], tools: [] };
        if (this.pendingCompaction) {
          this.current.compactionBefore = this.pendingCompaction;
          this.pendingCompaction = undefined;
        }
      }
      return;
    }

    if (line.type === 'assistant' && this.current) {
      if (line.uuid) this.current.itemIds.push(line.uuid);
      const content = line.message?.content;
      const text = textParts(content);
      if (text.trim()) this.current.response = this.current.response ? `${this.current.response}\n\n${text}` : text;
      if (Array.isArray(content)) {
        for (const p of content) {
          if (p.type === 'tool_use' && p.id && p.name) {
            const call = clip(JSON.stringify(p.input ?? {}), TOOL_CALL_LIMIT);
            this.pendingTools.set(p.id, { name: p.name, call: call.text });
          }
        }
      }
    }
  }

  finish(): { sessionId: string; title: string; turns: Turn[] } | null {
    this.flush();
    if (!this.sessionId) return null;
    const title = this.customTitle ?? this.slug ?? `session ${this.sessionId.slice(0, 8)}`;
    return { sessionId: this.sessionId, title, turns: dropSelfCommandTurns(this.turns) };
  }

  toConversation(): ImportableConversation | null {
    const s = this.finish();
    if (!s || s.turns.length === 0) return null;
    return {
      title: s.title,
      messageCount: s.turns.length,
      source: 'claude-code',
      sessionId: s.sessionId,
      build: () => buildGraphFromTurns(s.turns, s.sessionId),
    };
  }
}

function collectFromText(text: string): ClaudeSessionCollector {
  const c = new ClaudeSessionCollector();
  for (const raw of text.split('\n')) c.feedLine(raw);
  return c;
}

function noteNode(text: string): ThoughtNode {
  // every canvas node is React Flow type 'thought'; stepKind dispatches
  const n = makeNode(text, '', false);
  n.data.stepKind = 'note';
  return n;
}

function buildGraphFromTurns(turns: Turn[], sessionId: string): { nodes: ThoughtNode[]; edges: ThoughtEdge[] } {
  // faithful projection: EVERY turn imports — no tail cap. Long sessions
  // stay navigable through the zoom tiers (map plaques, glyphs), and
  // pruning is the user's decision on the canvas, never the importer's.
  const nodes: ThoughtNode[] = [];
  const edges: ThoughtEdge[] = [];
  let prev: ThoughtNode | null = null;

  const link = (source: ThoughtNode, target: ThoughtNode) => {
    edges.push({ id: generateId(), source: source.id, target: target.id, type: 'smoothstep' } as ThoughtEdge);
  };

  for (const turn of turns) {
    // A compaction note ANNOTATES the chain, never joins it: layout skips
    // content nodes and their edges, so a note wired INTO the chain would
    // sever it — the second half restarts at the top and overlaps the
    // first. The main line stays turn→turn; the note points at the turn
    // it narrates from the side.
    let noteToWire: ThoughtNode | null = null;
    if (turn.compactionBefore) {
      const note = noteNode(turn.compactionBefore);
      // importer-owned notes carry provenance too, so "node without
      // importSource" strictly means "the user made this by hand"
      note.data.importSource = { runner: 'claude-code', sessionId, itemIds: [] };
      nodes.push(note);
      noteToWire = note;
    }
    const node = makeNode(turn.question, turn.response, prev === null);
    node.data.importSource = { runner: 'claude-code', sessionId, itemIds: turn.itemIds };
    node.data.source = { question: node.data.question, response: node.data.response };
    seedPlaque(node);
    node.data.attachments = toolAttachments(turn);
    nodes.push(node);
    if (prev) link(prev, node);
    if (noteToWire) link(noteToWire, node);
    prev = node;
  }

  const laid = autoLayout(nodes, edges);
  // Layout law: content notes are user-arranged material and autoLayout
  // never touches them — so the importer places its own notes by hand,
  // slotted into the chain gap they narrate (compaction, imported tail).
  for (let i = 0; i < laid.length; i++) {
    const n = laid[i];
    if (n.data.stepKind !== 'note') continue;
    n.width = 460;
    const next = laid.slice(i + 1).find((x) => x.data.stepKind !== 'note');
    const before = laid.slice(0, i).reverse().find((x) => x.data.stepKind !== 'note');
    // beside the chain, not inside it: a note is an annotation column —
    // wedging it between two tall cards would just stack paper
    if (before && next) n.position = { x: Math.min(before.position.x, next.position.x) - 520, y: (before.position.y + next.position.y) / 2 };
    else if (next) n.position = { x: next.position.x - 520, y: next.position.y };
    else if (before) n.position = { x: before.position.x - 520, y: before.position.y + 140 };
  }
  return { nodes: laid, edges };
}

/** The harvest half of the experiment loop: a SHORT experiment session
 *  becomes a branch hanging off the node it was compiled from. The anchor
 *  line traveled inside the session's first user message; the caller has
 *  already resolved it to a live node. Returns the branch subgraph, laid
 *  out beside the anchor (never re-laying the user's canvas). */
export function claudeCodeSessionAsBranch(
  text: string,
  anchorNode: { id: string; x: number; y: number },
): { nodes: ThoughtNode[]; edges: ThoughtEdge[]; turnCount: number } | null {
  const s = collectFromText(text).finish();
  if (!s) return null;
  return turnsToBranch(s.turns, s.sessionId, 'claude-code', anchorNode);
}

/** The importable-conversation wrapper the existing import modal consumes. */
export function claudeCodeSessionConversation(text: string): ImportableConversation | null {
  return collectFromText(text).toConversation();
}
