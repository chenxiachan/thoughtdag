import { get as idbGet, set as idbSet, del as idbDel, keys as idbKeys } from 'idb-keyval';
import type { Attachment, ThoughtNode } from '../types';

// The attachment vault: bulky base64 payloads live in their own IndexedDB
// keys instead of inside node.data. Today that means PDF originals — they
// never enter model context (only extractedText does) and are read by
// exactly one consumer, the reader, which is already async. Keeping them
// out of the store shrinks the in-memory graph, every undo snapshot, and
// every persistence clone by the full weight of the PDFs.
//
// Images stay inline: their bytes ride the synchronous context-build path
// into vision requests, and they are typically an order of magnitude
// smaller than documents.
//
// Deleting a node does NOT delete its vault entries (undo must be able to
// resurrect them); orphans are swept by gcVault() at boot instead.

const KEY_PREFIX = 'att-content:';
const vaultKey = (attId: string) => `${KEY_PREFIX}${attId}`;

const shouldVault = (att: Attachment): boolean =>
  att.type === 'application/pdf' && !!att.content && !att.contentInVault;

/** Move a bulky payload into the vault; returns the lightened attachment.
    Non-PDF (and already-vaulted) attachments pass through unchanged. */
export async function internAttachment(att: Attachment): Promise<Attachment> {
  if (!shouldVault(att)) return att;
  await idbSet(vaultKey(att.id), att.content);
  return { ...att, content: '', contentInVault: true };
}

/** The attachment's payload, wherever it lives. '' when the vault entry is
    missing (cleared storage) — callers surface their own error state. */
export async function loadAttachmentContent(att: Attachment): Promise<string> {
  if (!att.contentInVault) return att.content;
  return (await idbGet<string>(vaultKey(att.id))) ?? '';
}

/** Exports and backups carry the FULL payload: a .thoughtdag.json must stay
    a complete, self-contained copy of the canvas. */
export async function inlineVaultedContent(nodes: ThoughtNode[]): Promise<ThoughtNode[]> {
  const out: ThoughtNode[] = [];
  for (const n of nodes) {
    const atts = n.data.attachments;
    if (!atts?.some((a) => a.contentInVault)) { out.push(n); continue; }
    const inlined: Attachment[] = [];
    for (const a of atts) {
      if (!a.contentInVault) { inlined.push(a); continue; }
      const content = await loadAttachmentContent(a);
      const { contentInVault: _drop, ...rest } = a;
      inlined.push({ ...rest, content });
    }
    out.push({ ...n, data: { ...n.data, attachments: inlined } });
  }
  return out;
}

/** Imports strip bulky payloads back INTO the vault before the graph is
    stored; returns the lightened nodes. */
export async function internNodes(nodes: ThoughtNode[]): Promise<ThoughtNode[]> {
  const out: ThoughtNode[] = [];
  for (const n of nodes) {
    const atts = n.data.attachments;
    if (!atts?.some(shouldVault)) { out.push(n); continue; }
    const interned: Attachment[] = [];
    for (const a of atts) interned.push(await internAttachment(a));
    out.push({ ...n, data: { ...n.data, attachments: interned } });
  }
  return out;
}

/** Sweep vault entries no canvas references anymore. `referencedIds` must
    cover EVERY project's attachments — run it from boot, after the project
    list is known. */
export async function gcVault(referencedIds: Set<string>): Promise<number> {
  const all = (await idbKeys()) as string[];
  let swept = 0;
  for (const k of all) {
    if (typeof k !== 'string' || !k.startsWith(KEY_PREFIX)) continue;
    if (referencedIds.has(k.slice(KEY_PREFIX.length))) continue;
    await idbDel(k);
    swept++;
  }
  return swept;
}
