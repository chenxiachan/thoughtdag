import type { ThoughtNode, ThoughtEdge } from '../types';
import { buildContext, type MessageSource } from '../store/context-builder';
import { attachmentFingerprint } from './attachments';
import { countTokens } from '../utils';

// Context Bundle v0 — the compiler's portable output: what the target model
// should see next, and where every piece came from. This file is the
// PROPOSAL made runnable (protocol/context-bundle/v0/); field names track
// the handoff draft and stay unstable until fixtures freeze them.
//
// The one law of this module: it never assembles context itself. It wraps
// buildContext — the product's single source of truth — and adds identity,
// provenance and hashes. If the bundle and the will-send preview ever
// disagree, that is a bug here, not two truths.
//
// Determinism contract (the v0 acceptance test): the same graph snapshot
// with the same compile options produces byte-identical output. Everything
// volatile (timestamps) is injected, and the bundle id derives from the
// content hash.

export interface BundleCompileOptions {
  /** Injected clock — REQUIRED for determinism (never Date.now() here). */
  now: string;
  projectId?: string;
  /** Free-text task statement; defaults to the target node's question. */
  task?: string;
  language?: string;
  branchContext?: string;
  staleIds?: ReadonlySet<string> | string[];
  preferredModel?: string | null;
}

export interface BundleMessageItem {
  id: string;
  kind: 'message';
  role: 'system' | 'user' | 'assistant';
  content: { type: 'text'; text: string }[];
  source: {
    layer: MessageSource['layer'];
    part?: MessageSource['part'];
    node_id?: string;
    attachment_id?: string;
  };
  selection: { mode: 'full'; reason: string };
}

export interface BundleMaterial {
  id: string;
  kind: 'image' | 'document';
  name: string;
  mime_type: string;
  size: number;
  /** v0 honesty: this is the app's dedup fingerprint (name|size|head), NOT
      a cryptographic digest of the payload — vaulted content may not be in
      memory at compile time. A later version can upgrade to sha256. */
  fingerprint: string;
  model_projection: { mode: 'extracted_text' | 'pixels' | 'extracted_text+pixels' | 'placeholder' };
  source: { node_id: string };
}

export interface ContextBundle {
  format: 'thoughtdag.context-bundle';
  version: 0;
  id: string;
  created_at: string;
  graph: { project_id: string | null; snapshot_hash: string; target_node_id: string };
  intent: { task: string; language: string | null };
  context: {
    messages: BundleMessageItem[];
    materials: BundleMaterial[];
    references: { source_node_id: string }[];
  };
  execution_hints: {
    preferred_model: string | null;
    required_tools: string[];
    required_mcp_servers: string[];
  };
  budget: { estimated_tokens: number; limit: number | null; truncation: 'none' };
  provenance: {
    source_runs: string[];
    compiler: { name: 'thoughtdag'; adapter_id: null };
  };
  integrity: { content_hash: string };
}

/** JSON with recursively sorted object keys — the canonical form every
 *  hash in this module is computed over. Arrays keep their order (order IS
 *  meaning for context). */
export function canonicalStringify(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) {
        const x = (v as Record<string, unknown>)[k];
        if (x !== undefined) out[k] = sort(x);
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(sort(value));
}

/** sha256 as lowercase hex. globalThis.crypto.subtle exists in every
 *  browser and Node ≥ 18 — one implementation, both worlds. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The SEMANTIC snapshot of a graph: everything that can change what a
 *  model sees, nothing that can't. Positions, sizes, collapse and other
 *  view states are deliberately absent — moving a card is not a new
 *  thought. */
export function semanticSnapshot(nodes: ThoughtNode[], edges: ThoughtEdge[]): unknown {
  const nodePart = [...nodes]
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((n) => ({
      id: n.id,
      stepKind: n.data.stepKind,
      question: n.data.question,
      response: n.data.response,
      archived: n.data.archived || undefined,
      branchContext: n.data.branchContext || undefined,
      highlightMode: n.data.highlightMode !== 'off' ? n.data.highlightMode : undefined,
      highlights: (n.data.highlights ?? []).length > 0 ? n.data.highlights.map((h) => h.text) : undefined,
      linkUrl: n.data.linkUrl,
      linkFetchedAt: n.data.linkFetchedAt,
      rolePrompt: (n.data as { rolePrompt?: string }).rolePrompt,
      roleMode: (n.data as { roleMode?: string }).roleMode,
      excludedAttachmentIds: (n.data.excludedAttachmentIds as string[] | undefined)?.length
        ? n.data.excludedAttachmentIds : undefined,
      attachments: (n.data.attachments ?? []).map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        fingerprint: attachmentFingerprint(a),
        extractedText: a.extractedText,
        renderMode: a.renderMode,
      })),
    }));
  const edgePart = [...edges]
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((e) => ({
      source: e.source,
      target: e.target,
      isCrossLink: e.data?.isCrossLink || undefined,
      isWatch: e.data?.isWatch || undefined,
      contextDepth: (e.data as { contextDepth?: string } | undefined)?.contextDepth,
    }));
  return { nodes: nodePart, edges: edgePart };
}

export async function graphSnapshotHash(nodes: ThoughtNode[], edges: ThoughtEdge[]): Promise<string> {
  return `sha256:${await sha256Hex(canonicalStringify(semanticSnapshot(nodes, edges)))}`;
}

function projectionMode(att: { type: string; extractedText?: string; renderMode?: string }): BundleMaterial['model_projection']['mode'] {
  if (att.type.startsWith('image/')) {
    const pixels = att.renderMode !== 'text-only';
    const text = !!att.extractedText?.trim();
    return pixels && text ? 'extracted_text+pixels' : pixels ? 'pixels' : text ? 'extracted_text' : 'placeholder';
  }
  return att.extractedText?.trim() || att.type.startsWith('text/') ? 'extracted_text' : 'placeholder';
}

/** Compile the next-turn input for `targetNodeId` into a Context Bundle.
 *  Wraps buildContext; adds provenance, materials, hashes, identity. */
export async function compileContextBundle(
  targetNodeId: string,
  nodes: ThoughtNode[],
  edges: ThoughtEdge[],
  opts: BundleCompileOptions,
): Promise<ContextBundle> {
  const built = buildContext(targetNodeId, nodes, edges, opts.branchContext, undefined, undefined, opts.staleIds);
  const target = nodes.find((n) => n.id === targetNodeId);

  const messages: BundleMessageItem[] = built.messages.map((m, i) => {
    const src = built.sources[i] ?? { layer: 'chain' as const };
    return {
      id: `item_${String(i + 1).padStart(3, '0')}`,
      kind: 'message',
      role: m.role,
      content: [{ type: 'text', text: m.content }],
      source: {
        layer: src.layer,
        part: src.part,
        node_id: src.nodeId ?? src.refSourceId,
        attachment_id: src.attachmentId,
      },
      selection: { mode: 'full', reason: `structural-${src.layer}` },
    };
  });

  // Materials: every attachment that reached the model channel (text
  // message and/or pixels), deduped by attachment id.
  const byAttachment = new Map<string, BundleMaterial>();
  const collect = (nodeId: string | undefined, attachmentId: string | undefined) => {
    if (!nodeId || !attachmentId || byAttachment.has(attachmentId)) return;
    const node = nodes.find((n) => n.id === nodeId);
    const att = node?.data.attachments?.find((a) => a.id === attachmentId);
    if (!node || !att) return;
    byAttachment.set(attachmentId, {
      id: attachmentId,
      kind: att.type.startsWith('image/') ? 'image' : 'document',
      name: att.name,
      mime_type: att.type,
      size: att.size,
      fingerprint: attachmentFingerprint(att),
      model_projection: { mode: projectionMode(att) },
      source: { node_id: node.id },
    });
  };
  built.sources.forEach((s) => collect(s.nodeId, s.attachmentId));
  built.imageSources.forEach((s) => collect(s.nodeId, s.attachmentId));

  const references = built.sources
    .filter((s) => s.layer === 'reference' && s.refSourceId)
    .map((s) => ({ source_node_id: s.refSourceId! }));

  const body = {
    format: 'thoughtdag.context-bundle' as const,
    version: 0 as const,
    graph: {
      project_id: opts.projectId ?? null,
      snapshot_hash: await graphSnapshotHash(nodes, edges),
      target_node_id: targetNodeId,
    },
    intent: {
      task: opts.task ?? target?.data.question ?? '',
      language: opts.language ?? null,
    },
    context: { messages, materials: [...byAttachment.values()], references },
    execution_hints: {
      preferred_model: opts.preferredModel ?? target?.data.model ?? null,
      required_tools: [] as string[],
      required_mcp_servers: [] as string[],
    },
    budget: {
      estimated_tokens: built.messages.reduce((s, m) => s + countTokens(m.content), 0),
      limit: null,
      truncation: 'none' as const,
    },
  };

  const contentHash = await sha256Hex(canonicalStringify(body));
  return {
    ...body,
    id: `cb_${contentHash.slice(0, 16)}`,
    created_at: opts.now,
    provenance: { source_runs: [], compiler: { name: 'thoughtdag', adapter_id: null } },
    integrity: { content_hash: `sha256:${contentHash}` },
  };
}
