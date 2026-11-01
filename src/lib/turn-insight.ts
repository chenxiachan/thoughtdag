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
  /** thinking the active version spent; never forwarded downstream */
  think: number;
  total: number;
  /** tool output share of the turn, 0..1 — the pruning signal */
  toolShare: number;
  /** how much of the tool record this node itself hands downstream */
  toolForwarded: 'all' | 'some' | 'none';
  /** tokens of the tool steps it hands downstream */
  toolForwardedTokens: number;
  /** tool steps, and how many of them go downstream */
  toolSteps: number;
  toolStepsForwarded: number;
}

export const isToolStep = (att: { name: string }) => TOOL_PREFIX.test(att.name);

/** The thinking the active version spent: counted from its text when the
 *  text is kept (a live answer), else the count an importer left. */
export function thinkingTokens(data: Pick<ThoughtData, 'reasonings' | 'reasoningTokens' | 'responseIndex'>): number {
  const text = data.reasonings?.[data.responseIndex];
  return text ? countTokens(text) : data.reasoningTokens?.[data.responseIndex] ?? 0;
}

/** Token split of one turn — null when it carries no tool output (nothing
 *  to explain: the badge row and bar only appear on imported turns). */
export function turnComposition(data: Pick<ThoughtData, 'question' | 'response' | 'attachments' | 'excludedAttachmentIds' | 'reasonings' | 'reasoningTokens' | 'responseIndex'>): TurnComposition | null {
  const excluded = new Set(data.excludedAttachmentIds ?? []);
  let tool = 0, toolForwardedTokens = 0, toolSteps = 0, toolStepsForwarded = 0;
  for (const att of data.attachments ?? []) {
    if (!isToolStep(att)) continue;
    const n = countTokens(att.content);
    tool += n;
    toolSteps++;
    if (!excluded.has(att.id)) { toolForwardedTokens += n; toolStepsForwarded++; }
  }
  if (tool === 0) return null;
  const q = countTokens(data.question);
  const a = countTokens(data.response);
  const total = q + a + tool;
  const toolForwarded = toolStepsForwarded === 0 ? 'none' : toolStepsForwarded === toolSteps ? 'all' : 'some';
  return { q, a, tool, think: thinkingTokens(data), total, toolShare: total > 0 ? tool / total : 0, toolForwarded, toolForwardedTokens, toolSteps, toolStepsForwarded };
}

/** The ids of a node's tool steps — what the "tool record" switch moves. */
export function toolStepIds(data: Pick<ThoughtData, 'attachments'>): string[] {
  return (data.attachments ?? []).filter(isToolStep).map((a) => a.id);
}

export interface FootprintEntry { path: string; name: string; op: 'read' | 'write' | 'edit' }

/** The files this turn touched, straight from its tool attachments —
 *  writes and edits first, then reads, each path once. This is what a
 *  reader looking back needs on the card's face; the calls themselves
 *  stay in the drawer. Empty for hand-made nodes. */
export function footprint(data: Pick<ThoughtData, 'attachments'>): FootprintEntry[] {
  const seen = new Map<string, FootprintEntry>();
  for (const att of data.attachments ?? []) {
    if (!att.paths?.length || (att.op !== 'read' && att.op !== 'write' && att.op !== 'edit')) continue;
    for (const path of att.paths) {
      const prev = seen.get(path);
      if (!prev) seen.set(path, { path, name: path.split('/').filter(Boolean).pop() ?? path, op: att.op });
      else if (prev.op === 'read' && att.op !== 'read') prev.op = att.op;
    }
  }
  return [...seen.values()].sort((a, b) => (a.op === 'read' ? 1 : 0) - (b.op === 'read' ? 1 : 0));
}

/** The closing paragraph of an answer. Agents state their conclusion
 *  LAST — the opening line is usually "let me look at…" — so a collapsed
 *  imported turn shows its end, not its start. */
export function conclusionOf(response: string, max = 140): string {
  const paras = response
    .replace(/```[\s\S]*?```/g, '')
    .split(/\n\s*\n/)
    .map((p) => p
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links and images → their text
      .replace(/[#*`>|_~]/g, '')
      .replace(/^\s*[-•\d.)]+\s*/gm, '')
      .replace(/\s+/g, ' ')
      .trim())
    // a lead-in to a block ("Now the warnings:"), a sources line, a bare
    // closing offer — none of these is the finding
    .filter((p) => p.length > 12 && !/[:：]$/.test(p) && !/^(sources?|references?|来源|参考)\b/i.test(p));
  const substantive = paras.filter((p) => p.length >= 30);
  const last = substantive[substantive.length - 1] ?? paras[paras.length - 1]
    ?? response.replace(/[#*`>-]/g, '').replace(/\s+/g, ' ').trim();
  return last.length > max ? `${last.slice(0, max)}…` : last;
}
