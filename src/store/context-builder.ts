import type { ThoughtNode } from '../types';
import type { ThoughtEdge } from '../types';
import { partitionContext, type ContextReference } from '../lib/graph';
import { attachmentFingerprint } from '../lib/attachments';
import { countTokens } from '../utils';
import { fuzzyHighlightRegex } from '../lib/highlight-match';
import type { ContextMessage, ImageAttachment } from '../lib/api';

// Build the prompt from the layered context partition (lib/graph.ts).
// The order rule, in one sentence: materials → reference blocks → the live
// conversation in chain order → the current question last. Solid edges are
// the conversation (full turns); dashed edges become fenced [Reference]
// blocks (quote by default, whole chain when the edge says 'full'); content
// nodes are identity-prefixed material blocks. Amounts are controlled on
// NODES (collapse+summary, highlight filter, archive) — edges only decide
// identity. This ordering is deliberately independent of edge creation
// history: the same graph always produces the same prompt.
interface BuildContextResult {
  messages: ContextMessage[];
  images: ImageAttachment[];
  /** Token weight per layer — lets the preview show composition honestly. */
  layerTokens: { material: number; reference: number; chain: number };
}

/** One-line handle for a node inside block headers and trails. */
function nodeTitle(node: ThoughtNode): string {
  const q = node.data.question.replace(/\s+/g, ' ').trim();
  return q.length > 60 ? `${q.slice(0, 60)}…` : q;
}

/** A node's response as context text, respecting its highlight mode. */
function renderResponse(node: ThoughtNode): string {
  const mode = node.data.highlightMode || 'off';
  const highlights = node.data.highlights || [];
  if (mode === 'filter' && highlights.length > 0) {
    return highlights.map((h) => h.text).join('\n\n');
  }
  if (mode === 'tag' && highlights.length > 0) {
    let tagged = node.data.response;
    for (const h of highlights) {
      const re = fuzzyHighlightRegex(h.text);
      if (re) tagged = tagged.replace(re, (m) => `[Important] ${m} [/Important]`);
    }
    return tagged;
  }
  return node.data.response;
}

/** Q/A of one node inside a reference block, honoring collapse+summary —
    collapsing an upstream node IS the user's handoff dial. */
function transcriptLines(node: ThoughtNode): string[] {
  const lines: string[] = [];
  if (node.data.question) lines.push(`Q: ${node.data.question}`);
  const a = node.data.isCollapsed && node.data.summary
    ? `[Summary] ${node.data.summary}`
    : renderResponse(node);
  if (a) lines.push(`A: ${a}`);
  return lines;
}

/** The full text of one dashed-edge reference block. Exported so the edge
    chip and the follow-up preview can price a reference without drift. */
export function referenceBlockContent(ref: ContextReference): string {
  const lines: string[] = [`[Reference: ${nodeTitle(ref.source)}]`];
  if (ref.depth === 'quote') {
    const trail = ref.chain
      .filter((n) => !n.data.archived)
      .map((n) => (n.data.isCollapsed && n.data.summary ? `${nodeTitle(n)} ([Summary] ${n.data.summary})` : nodeTitle(n)));
    if (trail.length > 0) lines.push(`Trail (upstream questions): ${trail.join(' → ')}`);
    lines.push(...transcriptLines(ref.source));
  } else {
    for (const n of [...ref.chain, ref.source]) {
      if (n.data.archived) continue;
      lines.push(...transcriptLines(n));
    }
  }
  return lines.join('\n');
}

/** Deterministic fingerprint of an assembled context — recorded on each
    generation (provenance seed for the staleness pass). */
export function hashContext(messages: ContextMessage[], images: ImageAttachment[] = []): string {
  const s = JSON.stringify(messages) + `#img:${images.map((i) => i.data.length).join(',')}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * Fingerprint of everything a node's answer DEPENDS ON — its upstream
 * (materials, references, ancestor turns), with the node's own content
 * blanked out. Recorded at generation time; when the live fingerprint
 * drifts from the recorded one, the answer is STALE: it was written
 * against upstream content that no longer exists.
 */
export function upstreamFingerprint(nodeId: string, nodes: ThoughtNode[], edges: ThoughtEdge[]): string {
  // Fingerprints track CONTENT and STRUCTURE, never the compression view:
  // collapse state and auto-generated summaries are normalized away, so a
  // background summary arriving (or a card being folded) never fakes an
  // "upstream changed" signal downstream.
  const normalized = nodes.map((n) => ({
    ...n,
    data: {
      ...n.data,
      isCollapsed: false,
      summary: undefined,
      ...(n.id === nodeId ? { question: '', response: '', attachments: [] } : {}),
    },
  }));
  const { messages } = buildContext(nodeId, normalized, edges);
  return hashContext(messages);
}

const STALE_MARK = '[Stale: this answer was written against an earlier version of its upstream]';

export function buildContext(
  nodeId: string,
  nodes: ThoughtNode[],
  edges: ThoughtEdge[],
  branchContext?: string,
  excludedAttachmentIds?: string[],
  includedAttachmentIds?: string[],
  /** Nodes whose stored answers predate upstream changes: their responses
      enter downstream context with an explicit stale mark, so the
      transcript never silently contradicts itself. */
  staleIds?: ReadonlySet<string> | string[],
): BuildContextResult {
  const messages: ContextMessage[] = [];
  const images: ImageAttachment[] = [];
  const layerTokens = { material: 0, reference: 0, chain: 0 };
  let layerStart = 0;
  const closeLayer = (layer: keyof typeof layerTokens) => {
    for (let i = layerStart; i < messages.length; i++) layerTokens[layer] += countTokens(messages[i].content);
    layerStart = messages.length;
  };
  const staleSet = staleIds instanceof Set ? staleIds : new Set(staleIds ?? []);
  const { materials, references, mainline } = partitionContext(nodeId, nodes, edges);

  // Propagate excludedAttachmentIds from every attachment-carrying layer
  const excludeSet = new Set<string>(excludedAttachmentIds || []);
  const includeOverrides = new Set<string>(includedAttachmentIds || []);
  for (const node of [...materials, ...mainline]) {
    for (const exId of (node.data.excludedAttachmentIds || [])) {
      if (!includeOverrides.has(exId)) excludeSet.add(exId);
    }
  }
  const seenAttachmentFingerprints = new Set<string>();

  const pushAttachments = (node: ThoughtNode) => {
    for (const att of node.data.attachments || []) {
      if (excludeSet.has(att.id)) continue;
      const fp = attachmentFingerprint(att);
      if (seenAttachmentFingerprints.has(fp)) continue;
      seenAttachmentFingerprints.add(fp);
      if (att.type.startsWith('image/')) {
        // Dual channel like PDFs: the auto-extracted companion text is an
        // index of the image (cheap, works for text-only models); the image
        // itself still flows unless the user switched it to text-only
        if (att.extractedText) {
          messages.push({ role: 'user', content: `[Image: ${att.name}]\n${att.extractedText}` });
        }
        if (att.renderMode !== 'text-only') {
          images.push({ data: att.content, mimeType: att.type });
        }
      } else if (att.type === 'application/pdf') {
        // PDF: inject extracted text + optionally page images for Vision
        if (att.extractedText) {
          messages.push({ role: 'user', content: `[PDF: ${att.name}]\n${att.extractedText}` });
        }
        if (att.renderMode !== 'text-only' && att.pageImages && att.pageImages.length > 0) {
          for (const pageImg of att.pageImages) {
            images.push({ data: pageImg, mimeType: 'image/png' });
          }
        }
        if (!att.extractedText && !att.pageImages) {
          messages.push({ role: 'user', content: `[PDF: ${att.name} — extracting content...]` });
        }
      } else {
        messages.push({ role: 'user', content: `[File: ${att.name}]\n${att.content}` });
      }
    }
  };

  // ── L1a: materials — canvas content with its identity prefix. Link
  // snapshots carry source + capture date (web content drifts, and fetched
  // text is an injection surface — keep it clearly fenced).
  for (const node of materials) {
    if (node.data.archived) continue;
    pushAttachments(node);
    if (node.data.question) {
      const content = node.data.stepKind === 'note'
        ? `[Note]\n${node.data.question}`
        : node.data.stepKind === 'link'
          ? `[Link snapshot: ${node.data.linkUrl ?? ''} @ ${(node.data.linkFetchedAt ?? '').slice(0, 10)}]\n${node.data.question}`
          : node.data.question;
      messages.push({ role: 'user', content });
    }
  }

  closeLayer('material');

  // ── L1b: references — one fenced block per dashed edge
  for (const ref of references) {
    if (ref.source.data.archived) continue;
    messages.push({ role: 'user', content: referenceBlockContent(ref) });
  }

  closeLayer('reference');

  // ── L2: the conversation — structural chain, current node last
  for (const node of mainline) {
    // Archived = pruned-but-kept: contributes NOTHING to context (the walk
    // itself already passed through it, so descendants keep their ancestry)
    if (node.data.archived) continue;
    pushAttachments(node);
    // Collapsed nodes with summary: pass summary only (context compression)
    if (node.data.isCollapsed && node.data.summary) {
      messages.push({ role: 'user', content: node.data.question });
      const summarized = `[Summary] ${node.data.summary}`;
      messages.push({ role: 'assistant', content: staleSet.has(node.id) ? `${STALE_MARK}\n${summarized}` : summarized });
      continue;
    }
    if (node.data.question) {
      messages.push({ role: 'user', content: node.data.question });
    }
    if (node.data.response) {
      const rendered = renderResponse(node);
      messages.push({ role: 'assistant', content: staleSet.has(node.id) ? `${STALE_MARK}\n${rendered}` : rendered });
    }
  }

  // If this is a branch from selection, add the selected text
  if (branchContext) {
    messages.push({ role: 'user', content: `[Regarding this passage: "${branchContext}"]` });
  }

  closeLayer('chain');

  // Check if user explicitly chose a role source (multi-parent conflict resolution)
  const selfNode = mainline[mainline.length - 1];
  if (selfNode?.data.roleSourceNodeId) {
    if (selfNode.data.roleSourceNodeId === '__none__') {
      return { messages, images, layerTokens };
    }
    const sourceNode = nodes.find((n) => n.id === selfNode.data.roleSourceNodeId);
    if (sourceNode?.data.rolePrompt) {
      messages.unshift({ role: 'system', content: sourceNode.data.rolePrompt });
      return { messages, images, layerTokens };
    }
  }

  // Resolve inherited rolePrompt using explicit roleMode:
  //   inherit: no own role, look up ancestors
  //   set-next: role for descendants only (skip for self)
  //   reset: role for self only (blocks inheritance for descendants)
  let resolvedRole: string | undefined;
  for (let i = mainline.length - 1; i >= 0; i--) {
    const n = mainline[i];
    const isSelf = i === mainline.length - 1;
    const mode = n.data.roleMode || 'inherit';

    if (mode === 'reset') {
      // "Reset for this node" — only self gets the role; descendants get nothing
      resolvedRole = isSelf ? (n.data.rolePrompt || undefined) : undefined;
      break;
    }
    if (mode === 'set-next' && n.data.rolePrompt) {
      if (isSelf) {
        // "Set for next" on self — skip, role is for descendants only
        continue;
      }
      // Ancestor's "Set for next" — we are a descendant, use it
      resolvedRole = n.data.rolePrompt;
      break;
    }
    // mode === 'inherit' — use own rolePrompt if present, otherwise keep walking
    if (mode === 'inherit' && n.data.rolePrompt) {
      resolvedRole = n.data.rolePrompt;
      break;
    }
  }
  if (resolvedRole) {
    messages.unshift({ role: 'system', content: resolvedRole });
  }

  return { messages, images, layerTokens };
}

// Explicit role for a freshly created node (addQuestion / regenerate),
// covering the cases buildContext can't see because it treats the parent
// as "self":
//   1. New node is reset → its own role
//   2. New root with inherit + own rolePrompt (e.g. set on the landing page)
//   3. Parent has set-next → parent's role
export function resolveExplicitRole(
  selfData: { roleMode?: string; rolePrompt?: string } | undefined,
  parentData: { roleMode?: string; rolePrompt?: string } | undefined,
  hasParent: boolean,
): string | undefined {
  if (selfData?.roleMode === 'reset' && selfData.rolePrompt) return selfData.rolePrompt;
  if (selfData?.rolePrompt && selfData.roleMode === 'inherit' && !hasParent) return selfData.rolePrompt;
  if (parentData?.roleMode === 'set-next' && parentData.rolePrompt) return parentData.rolePrompt;
  return undefined;
}

// Replace any system message in-place with the given role (no-op if undefined).
export function applyRoleOverride(messages: ContextMessage[], role: string | undefined): void {
  if (!role) return;
  const filtered = messages.filter((m) => m.role !== 'system');
  filtered.unshift({ role: 'system', content: role });
  messages.length = 0;
  messages.push(...filtered);
}
