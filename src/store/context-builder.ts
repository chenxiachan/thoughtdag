import type { ThoughtNode, ThoughtEdge } from '../types';
import { walkUpAncestors } from '../lib/graph';
import { attachmentFingerprint } from '../lib/attachments';
import type { ContextMessage, ImageAttachment } from '../lib/api';

// Build conversation history by walking up the ancestor DAG
// All edges (blue, orange, cross-link) contribute to context as long as
// they point toward the current node. This is a pure DAG traversal.
interface BuildContextResult {
  messages: ContextMessage[];
  images: ImageAttachment[];
}

export function buildContext(
  nodeId: string,
  nodes: ThoughtNode[],
  edges: ThoughtEdge[],
  branchContext?: string,
  excludedAttachmentIds?: string[],
  includedAttachmentIds?: string[],
): BuildContextResult {
  const messages: ContextMessage[] = [];
  const images: ImageAttachment[] = [];
  // Collect excludedAttachmentIds from ALL nodes in the path (propagation)
  const excludeSet = new Set<string>(excludedAttachmentIds || []);
  const seenAttachmentFingerprints = new Set<string>();

  // Topological-order collection of all ancestors via incoming edges
  const { ordered } = walkUpAncestors(nodeId, nodes, edges);

  // Propagate excludedAttachmentIds from all ancestors
  const includeOverrides = new Set<string>(includedAttachmentIds || []);
  for (const node of ordered) {
    for (const exId of (node.data.excludedAttachmentIds || [])) {
      if (!includeOverrides.has(exId)) {
        excludeSet.add(exId);
      }
    }
  }

  // Convert ordered ancestors to messages, respecting highlightMode and collapse/summary
  for (const node of ordered) {
    // Archived = pruned-but-kept: contributes NOTHING to context (the walk
    // itself already passed through it, so descendants keep their ancestry)
    if (node.data.archived) continue;
    // Collect attachments from this node (respecting excludedAttachmentIds + cross-node dedup)
    const nodeAttachments = node.data.attachments || [];
    for (const att of nodeAttachments) {
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
        // Text files: inject as user message context
        messages.push({ role: 'user', content: `[File: ${att.name}]\n${att.content}` });
      }
    }

    // Collapsed nodes with summary: pass summary only (context compression)
    if (node.data.isCollapsed && node.data.summary) {
      messages.push({ role: 'user', content: node.data.question });
      messages.push({ role: 'assistant', content: `[Summary] ${node.data.summary}` });
      continue;
    }
    if (node.data.question) {
      // Content nodes are canvas material, not turns — marked so the model
      // reads them as reference rather than something to answer. Link
      // snapshots carry their source + capture date (web content drifts,
      // and fetched text is an injection surface — keep it clearly fenced).
      const content = node.data.stepKind === 'note'
        ? `[Note]\n${node.data.question}`
        : node.data.stepKind === 'link'
          ? `[Link snapshot: ${node.data.linkUrl ?? ''} @ ${(node.data.linkFetchedAt ?? '').slice(0, 10)}]\n${node.data.question}`
          : node.data.question;
      messages.push({ role: 'user', content });
    }
    if (node.data.response) {
      const mode = node.data.highlightMode || 'off';
      const highlights = node.data.highlights || [];
      if (mode === 'filter' && highlights.length > 0) {
        const filtered = highlights.map((h) => h.text).join('\n\n');
        messages.push({ role: 'assistant', content: filtered });
      } else if (mode === 'tag' && highlights.length > 0) {
        let tagged = node.data.response;
        for (const h of highlights) {
          tagged = tagged.replace(h.text, `[Important] ${h.text} [/Important]`);
        }
        messages.push({ role: 'assistant', content: tagged });
      } else {
        messages.push({ role: 'assistant', content: node.data.response });
      }
    }
  }

  // If this is a branch from selection, add the selected text
  if (branchContext) {
    messages.push({ role: 'user', content: `[Regarding this passage: "${branchContext}"]` });
  }

  // Check if user explicitly chose a role source (multi-parent conflict resolution)
  const selfNode = ordered[ordered.length - 1];
  if (selfNode?.data.roleSourceNodeId) {
    if (selfNode.data.roleSourceNodeId === '__none__') {
      return { messages, images };
    }
    const sourceNode = nodes.find((n) => n.id === selfNode.data.roleSourceNodeId);
    if (sourceNode?.data.rolePrompt) {
      messages.unshift({ role: 'system', content: sourceNode.data.rolePrompt });
      return { messages, images };
    }
  }

  // Resolve inherited rolePrompt using explicit roleMode:
  //   inherit: no own role, look up ancestors
  //   set-next: role for descendants only (skip for self)
  //   reset: role for self only (blocks inheritance for descendants)
  let resolvedRole: string | undefined;
  for (let i = ordered.length - 1; i >= 0; i--) {
    const n = ordered[i];
    const isSelf = i === ordered.length - 1;
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

  return { messages, images };
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
