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

/** Q/A of one node inside a reference block — always full text (collapse
    is a view state and never changes what flows). */
function transcriptLines(node: ThoughtNode): string[] {
  const lines: string[] = [];
  if (node.data.question) lines.push(`Q: ${node.data.question}`);
  const a = renderResponse(node);
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
      .map((n) => nodeTitle(n));
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
      summaries: undefined,
      summaryTypes: undefined,
      generatedBy: undefined,
      ...(n.id === nodeId ? { question: '', response: '', attachments: [] } : {}),
    },
  }));
  const { messages } = buildContext(nodeId, normalized, edges);
  return hashContext(messages);
}

const STALE_MARK = '[Stale: this answer was written against an earlier version of its upstream]';

/**
 * THE role resolution. One walk, two consumers: buildContext injects the
 * result as the system prompt, the panel displays it — so what the UI shows
 * is by construction what the model receives. Semantics: an explicit
 * roleSourceNodeId on the node wins ('__none__' blocks); otherwise the
 * nearest rolePrompt along the STRUCTURAL mainline, honoring legacy
 * roleMode ('reset' stops inheritance, 'set-next' applies to descendants
 * only). ignoreOwn=true resolves what the node INHERITS (panel display).
 */
export function resolveRoleFor(
  nodeId: string,
  nodes: ThoughtNode[],
  edges: ThoughtEdge[],
  opts?: { ignoreOwn?: boolean },
): string | undefined {
  const { mainline } = partitionContext(nodeId, nodes, edges);
  return resolveRoleFromMainline(mainline, nodes, opts);
}

function resolveRoleFromMainline(
  mainline: ThoughtNode[],
  nodes: ThoughtNode[],
  opts?: { ignoreOwn?: boolean },
): string | undefined {
  const self = mainline[mainline.length - 1];
  if (!self) return undefined;
  if (!opts?.ignoreOwn && self.data.roleSourceNodeId) {
    if (self.data.roleSourceNodeId === '__none__') return undefined;
    const src = nodes.find((n) => n.id === self.data.roleSourceNodeId);
    return src?.data.rolePrompt || undefined;
  }
  for (let i = mainline.length - 1; i >= 0; i--) {
    const n = mainline[i];
    const isSelf = i === mainline.length - 1;
    const own = isSelf && opts?.ignoreOwn ? undefined : n.data.rolePrompt;
    const mode = n.data.roleMode || 'inherit';
    if (mode === 'reset') {
      // legacy "reset for this node": only self gets the role, ancestors blocked
      return isSelf ? (own || undefined) : undefined;
    }
    if (mode === 'set-next' && n.data.rolePrompt) {
      if (isSelf) continue; // for descendants only
      return n.data.rolePrompt;
    }
    if (mode === 'inherit' && own) return own;
  }
  return undefined;
}

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
          images.push({ data: att.content, mimeType: att.type, ...(att.extractedText?.trim() ? { hasCompanion: true } : {}) });
        }
      } else if (att.type === 'application/pdf') {
        // PDF: the extracted text IS the model channel. Page images never
        // flow into generation — sending one per page trips provider image
        // limits (Zhipu 1210) exactly on small PDFs; pages exist for the
        // reader and its per-page Recognize, which writes better text here.
        if (att.extractedText) {
          messages.push({ role: 'user', content: `[PDF: ${att.name}]\n${att.extractedText}` });
        } else {
          messages.push({ role: 'user', content: `[PDF: ${att.name} — no extracted text yet (scanned or still extracting). The reader's Recognize can turn its pages into readable text.]` });
        }
      } else if (att.type === 'text/html') {
        // HTML: the extracted Markdown IS the model channel — raw source
        // (tags, styles, boilerplate) never enters context
        const body = att.extractedText?.trim();
        messages.push({
          role: 'user',
          content: body
            ? `[File: ${att.name}]\n${body}`
            : `[File: ${att.name} — HTML with no extractable text yet]`,
        });
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

  // ── L2: the conversation — structural chain, current node last.
  // Collapse is PURELY visual: the solid chain always flows full text
  // (One Rule without asterisks). Budget control lives in the explicit
  // dials — archive, highlight filter, reference depth.
  for (const node of mainline) {
    // Archived = pruned-but-kept: contributes NOTHING to context (the walk
    // itself already passed through it, so descendants keep their ancestry)
    if (node.data.archived) continue;
    pushAttachments(node);
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

  // Role: THE shared resolution (see resolveRoleFor) — display and
  // injection can never drift apart again.
  const resolvedRole = resolveRoleFromMainline(mainline, nodes);
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
