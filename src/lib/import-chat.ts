import type { ThoughtNode, ThoughtEdge } from '../types';
import { generateId } from '../utils';
import { autoLayout } from './layout';

// Importers for ChatGPT / Claude conversation exports. Both platforms hand
// out a conversations.json; we detect which one it is and convert each
// selected conversation into a ThoughtDAG graph:
//   - ChatGPT's `mapping` is already a TREE (edits/regenerates fork it) —
//     it maps 1:1 onto our DAG, branches become sibling nodes.
//   - Claude's chat_messages are LINEAR — they become one chain.

export interface ImportableConversation {
  title: string;
  messageCount: number;
  source: 'chatgpt' | 'claude' | 'claude-code';
  build: () => { nodes: ThoughtNode[]; edges: ThoughtEdge[] };
}

// ─── format detection ───────────────────────────────────────────

export type DetectedFormat = 'chatgpt' | 'claude' | 'thoughtdag' | 'unknown';

export function detectFormat(parsed: unknown): DetectedFormat {
  if (Array.isArray(parsed) && parsed.length > 0) {
    const first = parsed[0] as Record<string, unknown>;
    if (first && typeof first === 'object' && 'mapping' in first) return 'chatgpt';
    if (first && typeof first === 'object' && 'chat_messages' in first) return 'claude';
  }
  const obj = parsed as Record<string, unknown> | null;
  if (obj && typeof obj === 'object' && Array.isArray(obj.nodes) && Array.isArray(obj.edges)) return 'thoughtdag';
  return 'unknown';
}

// ─── shared node factory ────────────────────────────────────────

export function makeNode(question: string, response: string, isRoot: boolean): ThoughtNode {
  return {
    id: generateId(),
    type: 'thought',
    position: { x: 0, y: 0 },
    dragHandle: '.drag-handle',
    data: {
      question,
      response,
      responses: [response],
      responseIndex: 0,
      isCollapsed: true,
      isEditing: false,
      isEditingResponse: false,
      isLoading: false,
      tokenCount: Math.ceil((question + response).length / 4),
      highlights: [],
      highlightMode: 'tag',
      attachments: [],
      excludedAttachmentIds: [],
      includedAttachmentIds: [],
      roleMode: 'inherit',
      isRoot,
      isBranch: false,
    },
  };
}

function edge(source: string, target: string): ThoughtEdge {
  return {
    id: `edge-${source}-${target}`,
    source,
    target,
    type: 'smoothstep',
    sourceHandle: 'continue',
    targetHandle: 'top',
    style: { stroke: '#6B5CE7', strokeWidth: 2 },
    markerEnd: { type: 'arrowclosed', color: '#6B5CE7', width: 18, height: 18 } as ThoughtEdge['markerEnd'],
    data: {},
  };
}

// ─── ChatGPT (tree-shaped mapping) ──────────────────────────────

interface GptMappingNode {
  id: string;
  parent?: string | null;
  children?: string[];
  message?: {
    author?: { role?: string };
    content?: { content_type?: string; parts?: unknown[] };
  } | null;
}

function gptText(m: GptMappingNode): string {
  const parts = m.message?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts.filter((p): p is string => typeof p === 'string').join('\n').trim();
}

function convertChatGpt(mapping: Record<string, GptMappingNode>): { nodes: ThoughtNode[]; edges: ThoughtEdge[] } {
  const nodes: ThoughtNode[] = [];
  const edges: ThoughtEdge[] = [];

  // Walk the tree from the roots. State carried down: the nearest user
  // question awaiting an answer, and the ThoughtNode id of the last
  // completed Q&A (the structural parent for the next one).
  const roots = Object.values(mapping).filter((m) => !m.parent || !mapping[m.parent]);

  const walk = (gptId: string, pendingQuestion: string | null, parentNodeId: string | null) => {
    const m = mapping[gptId];
    if (!m) return;
    const role = m.message?.author?.role;
    const text = gptText(m);
    let nextPending = pendingQuestion;
    let nextParent = parentNodeId;

    if (role === 'user' && text) {
      nextPending = text;
    } else if (role === 'assistant' && text) {
      if (nextPending !== null) {
        // Q + A complete → one ThoughtDAG node
        const node = makeNode(nextPending, text, parentNodeId === null);
        nodes.push(node);
        if (parentNodeId) edges.push(edge(parentNodeId, node.id));
        nextParent = node.id;
        nextPending = null;
      } else if (nextParent) {
        // consecutive assistant message (continuation) → append to the node
        const prev = nodes.find((n) => n.id === nextParent);
        if (prev) {
          prev.data.response += '\n\n' + text;
          prev.data.responses = [prev.data.response];
        }
      }
    }
    // tool / system / empty messages pass through untouched

    for (const child of m.children ?? []) {
      walk(child, nextPending, nextParent);
    }
  };

  for (const root of roots) walk(root.id, null, null);
  return { nodes: autoLayout(nodes, edges), edges };
}

// ─── Claude (linear chat_messages) ──────────────────────────────

interface ClaudeMessage {
  text?: string;
  sender?: string;
  content?: Array<{ type?: string; text?: string }>;
}

function claudeText(m: ClaudeMessage): string {
  if (typeof m.text === 'string' && m.text.trim()) return m.text.trim();
  if (Array.isArray(m.content)) {
    return m.content
      .filter((c) => c?.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text as string)
      .join('\n')
      .trim();
  }
  return '';
}

function convertClaude(messages: ClaudeMessage[]): { nodes: ThoughtNode[]; edges: ThoughtEdge[] } {
  const nodes: ThoughtNode[] = [];
  const edges: ThoughtEdge[] = [];
  let pendingQuestion: string | null = null;
  let parentNodeId: string | null = null;

  for (const m of messages) {
    const text = claudeText(m);
    if (!text) continue;
    if (m.sender === 'human') {
      pendingQuestion = text;
    } else if (m.sender === 'assistant') {
      if (pendingQuestion !== null) {
        const node = makeNode(pendingQuestion, text, parentNodeId === null);
        nodes.push(node);
        if (parentNodeId) edges.push(edge(parentNodeId, node.id));
        parentNodeId = node.id;
        pendingQuestion = null;
      } else if (parentNodeId) {
        const prev = nodes.find((n) => n.id === parentNodeId);
        if (prev) {
          prev.data.response += '\n\n' + text;
          prev.data.responses = [prev.data.response];
        }
      }
    }
  }
  return { nodes: autoLayout(nodes, edges), edges };
}

// ─── listing ────────────────────────────────────────────────────

export function listConversations(parsed: unknown): ImportableConversation[] {
  const format = detectFormat(parsed);
  const out: ImportableConversation[] = [];

  if (format === 'chatgpt') {
    for (const conv of parsed as Array<{ title?: string; mapping?: Record<string, GptMappingNode> }>) {
      const mapping = conv.mapping ?? {};
      const messageCount = Object.values(mapping).filter(
        (m) => ['user', 'assistant'].includes(m.message?.author?.role ?? '') && gptText(m)
      ).length;
      if (messageCount === 0) continue;
      out.push({
        title: conv.title || 'Untitled',
        messageCount,
        source: 'chatgpt',
        build: () => convertChatGpt(mapping),
      });
    }
  } else if (format === 'claude') {
    for (const conv of parsed as Array<{ name?: string; chat_messages?: ClaudeMessage[] }>) {
      const messages = conv.chat_messages ?? [];
      const messageCount = messages.filter((m) => claudeText(m)).length;
      if (messageCount === 0) continue;
      out.push({
        title: conv.name || 'Untitled',
        messageCount,
        source: 'claude',
        build: () => convertClaude(messages),
      });
    }
  }

  return out;
}
