import type { ThoughtData } from '../types';
import { countTokens } from '../utils';

// The self-explaining chain: everything here renders information the
// import already carries for free — no LLM calls, no new state. A turn's
// tool attachments become an ACTION FINGERPRINT (read-code turn? run-
// experiment turn?), and its token split shows what is actually eating
// the context — the pruning compass of the inspection layer.

const TOOL_GLYPHS: [RegExp, string][] = [
  [/^(Read|NotebookRead)$/i, '📖'],
  [/^(Edit|Write|MultiEdit|NotebookEdit)$/i, '✏️'],
  [/^(Bash|BashOutput|Shell)$/i, '⌨️'],
  [/^(Grep|Glob|LS|Search|WebSearch)$/i, '🔍'],
  [/^(WebFetch|Fetch)$/i, '🌐'],
  [/^(Task|Agent)$/i, '🤖'],
];

const TOOL_PREFIX = /^tool: (\S+?)( \(truncated\))?$/;

export interface ToolMark { glyph: string; name: string; count: number }

/** Action fingerprint of one imported turn: its tool calls grouped into
 *  glyph counts, in first-appearance order. Empty for ordinary nodes. */
export function toolFingerprint(data: Pick<ThoughtData, 'attachments'>): ToolMark[] {
  const marks = new Map<string, ToolMark>();
  for (const att of data.attachments ?? []) {
    const m = att.name.match(TOOL_PREFIX);
    if (!m) continue;
    const name = m[1];
    const glyph = TOOL_GLYPHS.find(([re]) => re.test(name))?.[1] ?? '🔧';
    const existing = marks.get(name);
    if (existing) existing.count += 1;
    else marks.set(name, { glyph, name, count: 1 });
  }
  return [...marks.values()];
}

export interface TurnComposition {
  q: number;
  a: number;
  tool: number;
  total: number;
  /** tool output share of the turn, 0..1 — the pruning signal */
  toolShare: number;
}

/** Token split of one turn — null when it carries no tool output (nothing
 *  to explain: the badge row and bar only appear on imported turns). */
export function turnComposition(data: Pick<ThoughtData, 'question' | 'response' | 'attachments'>): TurnComposition | null {
  let tool = 0;
  for (const att of data.attachments ?? []) {
    if (TOOL_PREFIX.test(att.name)) tool += countTokens(att.content);
  }
  if (tool === 0) return null;
  const q = countTokens(data.question);
  const a = countTokens(data.response);
  const total = q + a + tool;
  return { q, a, tool, total, toolShare: total > 0 ? tool / total : 0 };
}
