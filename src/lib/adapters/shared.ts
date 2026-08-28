import type { ThoughtNode, ThoughtEdge, Attachment } from '../../types';
import { makeNode } from '../import-chat';
import { autoLayout } from '../layout';
import { generateId } from '../../utils';

// Shared projection pieces for runner session adapters. Every runner's
// collector reduces its native format to this Turn shape; everything
// downstream (branch building, plaques, tool attachments) is common.

export interface RunnerTurn {
  question: string;
  response: string;
  itemIds: string[];
  tools: { name: string; call: string; result: string; truncated: boolean }[];
}

// The one turn we do NOT project faithfully: ThoughtDAG's own entry command.
// A turn that says "send this session to ThoughtDAG" is self-referential
// noise on the canvas, not conversation. Claude Code marks command turns
// structurally; the Codex prompt/skill text carries our sentinel line.
// Every OTHER slash command stays — faithful projection is the rule,
// self-reference is the only exception.
const SELF_MARKS = ['<command-name>/thoughtdag</command-name>', '[[thoughtdag:command]]'];

export function dropSelfCommandTurns<T extends { question: string }>(turns: T[]): T[] {
  return turns.filter((t) => !SELF_MARKS.some((m) => t.question.includes(m)));
}

export function seedPlaque(node: ThoughtNode): void {
  const first = node.data.response.split('\n').map((l) => l.trim()).find((l) => l && !/^[#>*`-]+$/.test(l));
  if (first) node.data.summaries = [first.replace(/^[#>*`\s]+/, '').slice(0, 90)];
}

export function toolAttachments(turn: RunnerTurn): Attachment[] {
  return turn.tools.map((tool): Attachment => ({
    id: generateId(),
    name: `tool: ${tool.name}${tool.truncated ? ' (truncated)' : ''}`,
    type: 'text/plain',
    size: tool.call.length + tool.result.length,
    content: `[call] ${tool.call}\n[result]\n${tool.result}`,
  }));
}

/** The harvest half, runner-agnostic: a SHORT experiment session becomes a
 *  branch hanging off the node it was compiled from, laid out beside the
 *  anchor — the user's canvas arrangement is never touched. */
export function turnsToBranch(
  turns: RunnerTurn[],
  sessionId: string,
  runner: string,
  anchorNode: { id: string; x: number; y: number },
): { nodes: ThoughtNode[]; edges: ThoughtEdge[]; turnCount: number } | null {
  if (turns.length === 0) return null;
  const nodes: ThoughtNode[] = [];
  const edges: ThoughtEdge[] = [];
  let prev: { id: string } = { id: anchorNode.id };
  for (const turn of turns) {
    const node = makeNode(turn.question || '(tool-only turn)', turn.response, false);
    node.data.importSource = { runner, sessionId, itemIds: turn.itemIds };
    node.data.source = { question: node.data.question, response: node.data.response };
    node.data.attachments = toolAttachments(turn);
    seedPlaque(node);
    if (nodes.length === 0) node.data.isBranch = true; // the experiment forks off sideways
    nodes.push(node);
    edges.push({ id: generateId(), source: prev.id, target: node.id, type: 'smoothstep' } as ThoughtEdge);
    prev = node;
  }
  const laid = autoLayout(nodes, edges.filter((e) => e.source !== anchorNode.id));
  const minX = Math.min(...laid.map((n) => n.position.x));
  const minY = Math.min(...laid.map((n) => n.position.y));
  for (const n of laid) {
    n.position = { x: n.position.x - minX + anchorNode.x + 560, y: n.position.y - minY + anchorNode.y };
  }
  return { nodes: laid, edges, turnCount: turns.length };
}
