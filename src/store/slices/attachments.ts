import type { StateCreator } from 'zustand';
import type { Attachment } from '../../types';
import { walkUpAncestors } from '../../lib/graph';
import { attachmentFingerprint } from '../../lib/attachments';
import type { StoreState, AttachmentSlice } from '../types';

export const createAttachmentSlice: StateCreator<StoreState, [], [], AttachmentSlice> = (set, get) => ({
  addAttachment: (nodeId: string, attachment: Attachment) => {
    // Dedup: skip if same file already on this node (name + size + content prefix)
    const existing = get().nodes.find((n) => n.id === nodeId)?.data.attachments || [];
    const fingerprint = attachmentFingerprint(attachment);
    if (existing.some((a) => attachmentFingerprint(a) === fingerprint)) {
      return;
    }
    get().pushHistory();
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, attachments: [...(n.data.attachments || []), attachment] } }
          : n
      ),
    }));
    get().pushHistory();
  },

  removeAttachment: (nodeId: string, attachmentId: string) => {
    get().pushHistory();
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, attachments: (n.data.attachments || []).filter((a) => a.id !== attachmentId) } }
          : n
      ),
    }));
    get().pushHistory();
  },

  toggleExcludeAttachment: (nodeId: string, attachmentId: string, ancestorExcluded?: boolean) => {
    get().pushHistory();
    set((state) => ({
      nodes: state.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        const excluded = n.data.excludedAttachmentIds || [];
        const included = n.data.includedAttachmentIds || [];
        const isExcludedSelf = excluded.includes(attachmentId);
        const isIncludedOverride = included.includes(attachmentId);

        if (ancestorExcluded && !isIncludedOverride) {
          // Ancestor excluded this → add to includedAttachmentIds to override
          return { ...n, data: { ...n.data, includedAttachmentIds: [...included, attachmentId] } };
        } else if (ancestorExcluded && isIncludedOverride) {
          // Was overriding ancestor exclusion → remove override (respect ancestor exclusion)
          return { ...n, data: { ...n.data, includedAttachmentIds: included.filter((id) => id !== attachmentId) } };
        } else if (isExcludedSelf) {
          // Self-excluded → un-exclude
          return { ...n, data: { ...n.data, excludedAttachmentIds: excluded.filter((id) => id !== attachmentId) } };
        } else {
          // Not excluded → exclude
          return { ...n, data: { ...n.data, excludedAttachmentIds: [...excluded, attachmentId] } };
        }
      }),
    }));
    get().pushHistory();
  },

  setAttachmentData: (nodeId: string, attachmentId: string, data: Partial<Attachment>) => {
    set((state) => ({
      nodes: state.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        return { ...n, data: { ...n.data, attachments: (n.data.attachments || []).map((a) =>
          a.id === attachmentId ? { ...a, ...data } : a
        ) } };
      }),
    }));
  },

  setAttachmentRenderMode: (nodeId: string, attachmentId: string, mode: 'full' | 'text-only') => {
    set((state) => ({
      nodes: state.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        return { ...n, data: { ...n.data, attachments: (n.data.attachments || []).map((a) =>
          a.id === attachmentId ? { ...a, renderMode: mode } : a
        ) } };
      }),
    }));
  },

  getInheritedAttachments: (nodeId: string) => {
    const { nodes, edges } = get();
    const result: { attachment: Attachment; sourceNodeId: string; sourceQuestion: string; excludedByAncestor: boolean }[] = [];
    const seenFingerprints = new Set<string>();
    const { ordered } = walkUpAncestors(nodeId, nodes, edges);

    // Collect all ancestor exclusions (propagation)
    const ancestorExcludes = new Set<string>();
    for (const node of ordered) {
      if (node.id !== nodeId) {
        for (const exId of (node.data.excludedAttachmentIds || [])) {
          ancestorExcludes.add(exId);
        }
      }
    }

    // Collect attachments from ancestors (not self), with dedup
    for (const node of ordered) {
      if (node.id === nodeId) continue;
      for (const att of (node.data.attachments || [])) {
        const fp = attachmentFingerprint(att);
        if (seenFingerprints.has(fp)) continue;
        seenFingerprints.add(fp);
        result.push({
          attachment: att,
          sourceNodeId: node.id,
          sourceQuestion: node.data.question,
          excludedByAncestor: ancestorExcludes.has(att.id),
        });
      }
    }

    return result;
  },
});
