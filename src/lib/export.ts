import { set as idbSet } from 'idb-keyval';
import { useStore, stripTransient } from '../store';
import { getModelsOnce, reconcileModelId } from './use-models';
import { useProjects, projectStorageKey, adoptImportedProject } from '../store/projects';
import { detectFormat, listConversations, type ImportableConversation } from './import-chat';
import { isParadigmFile } from './paradigm';
import { getContextPath } from './graph';
import { countTokens } from '../utils';
import { confirmDialog, toast } from './ui-store';
import { inlineVaultedContent, internNodes } from './attachment-vault';
import { t, fmt } from '../i18n';
import type { ThoughtNode, ThoughtEdge } from '../types';
import type { ProjectMeta } from '../store/projects';

export const EXPORT_FORMAT_VERSION = 1;
// Must match the main store's persist `version` — a mismatched envelope
// silently hydrates to an empty canvas.
const PERSIST_VERSION = 1;

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'canvas';
}

export function downloadFile(filename: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
  toast('success', t('toast.copied'));
}

export function activeProjectName(): string {
  const { projects, activeId } = useProjects.getState();
  return projects.find((p) => p.id === activeId)?.name ?? 'canvas';
}

// ─── Whole-canvas JSON backup ───────────────────────────────────
export async function exportActiveProjectJson(opts?: { sharedReadonly?: boolean }): Promise<void> {
  const { nodes: gateNodes } = useStore.getState();
  // exit gate — an exported file travels; local AUTO backups skip this
  // (they never leave the machine and must never be interrupted)
  const { confirmIfSensitive } = await import('./sensitive-scan');
  if (!await confirmIfSensitive(gateNodes)) return;
  localStorage.setItem('thoughtdag.lastBackupAt', String(Date.now()));
  const { nodes: rawNodes, edges, events } = useStore.getState();
  // A backup file must be self-contained: pull vaulted payloads back inline
  const nodes = await inlineVaultedContent(rawNodes);
  const { projects, activeId } = useProjects.getState();
  const name = activeProjectName();
  const payload = JSON.stringify({
    version: EXPORT_FORMAT_VERSION,
    name,
    exportedAt: new Date().toISOString(),
    // paradigm provenance lives in project meta, not the graph — without
    // this line a backup round-trip would silently drop it
    instantiatedFrom: projects.find((p) => p.id === activeId)?.instantiatedFrom,
    // a courtesy flag, not a lock: the importing side asks before turning
    // this into an editable copy (a file in someone's hands is theirs)
    ...(opts?.sharedReadonly ? { sharedReadonly: true } : {}),
    nodes: stripTransient(nodes),
    edges,
    events,
  });
  downloadFile(`${sanitizeFilename(name)}.thoughtdag.json`, payload, 'application/json');
  toast('success', fmt(t('toast.exported'), { name }));
}

/**
 * Parse any supported file. Returns 'own' after importing a ThoughtDAG
 * backup directly, or the conversation list of a ChatGPT/Claude export so
 * the caller can show a picker.
 */
export function exportActiveParadigm(): void {
  const { nodes, edges } = useStore.getState();
  const name = activeProjectName();
  const payload = JSON.stringify({ kind: 'thoughtdag-paradigm', version: 1, name, nodes: stripTransient(nodes), edges });
  downloadFile(`${sanitizeFilename(name)}.paradigm.json`, payload, 'application/json');
  toast('success', fmt(t('toast.exported'), { name }));
}

export async function parseImportFile(file: File): Promise<
  { kind: 'own'; ok: boolean } | { kind: 'chat'; conversations: ImportableConversation[] } | { kind: 'error' }
> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Not one JSON document — maybe a runner session (JSONL, one event per
    // line). Runner sessions import read-only through the same modal.
    const { anyRunnerSessionConversation } = await import('./adapters');
    const session = await anyRunnerSessionConversation(text);
    if (session) return { kind: 'chat', conversations: [session] };
    toast('error', t('toast.importFailedJson'));
    return { kind: 'error' };
  }
  if (isParadigmFile(parsed)) {
    const id = crypto.randomUUID();
    const reconciled = await internNodes(await reconcileImportedModels(parsed.nodes));
    await idbSet(projectStorageKey(id), JSON.stringify({ state: { nodes: reconciled, edges: parsed.edges }, version: PERSIST_VERSION }));
    await adoptImportedProject(id, parsed.name || 'Paradigm', 'paradigm');
    toast('success', fmt(t('toast.imported'), { name: parsed.name, n: parsed.nodes.length }));
    return { kind: 'own', ok: true };
  }
  // The manifest also carries nodes/edges arrays, but they are audit
  // records, not canvas nodes — importing them would build a broken canvas.
  if ((parsed as { format?: string })?.format === 'thoughtdag-manifest') {
    toast('error', t('toast.importManifest'), 9000);
    return { kind: 'error' };
  }
  const format = detectFormat(parsed);
  if (format === 'chatgpt' || format === 'claude') {
    const conversations = listConversations(parsed);
    if (conversations.length === 0) {
      toast('error', t('toast.importNoConversations'));
      return { kind: 'error' };
    }
    return { kind: 'chat', conversations };
  }
  return { kind: 'own', ok: await importProjectFromFile(file, parsed) };
}

// A canvas node must at least place and describe itself; anything else
// (manifests, foreign JSON with nodes/edges arrays) is rejected up front
// instead of crashing later inside stripTransient/React Flow.
function looksLikeCanvasNodes(nodes: unknown[]): boolean {
  return nodes.every((n) => {
    const node = n as Partial<ThoughtNode>;
    return !!node && typeof node.id === 'string'
      && !!node.position && typeof node.position.x === 'number' && typeof node.position.y === 'number'
      && !!node.data && typeof node.data === 'object';
  });
}

/** Convert selected chat conversations, one new project each. */
export async function importChatConversations(convs: ImportableConversation[]): Promise<void> {
  let firstId: string | null = null;
  let total = 0;
  for (const conv of convs) {
    const { nodes, edges } = conv.build();
    if (nodes.length === 0) continue;
    // Arrive at the working tail, not a bird's-eye column of 200 turns —
    // the canvas consumes this once on its next mount.
    if (firstId === null) {
      const { useUiStore } = await import('./ui-store');
      useUiStore.getState().setArrivalFocusNodeId(nodes[nodes.length - 1].id);
    }
    const id = crypto.randomUUID();
    await idbSet(projectStorageKey(id), JSON.stringify({
      state: { nodes: stripTransient(nodes), edges },
      version: PERSIST_VERSION,
    }));
    await adoptImportedProject(id, conv.title.slice(0, 60));
    firstId ??= id;
    total += nodes.length;
  }
  if (firstId) {
    toast('success', fmt(t('toast.importedChats'), { n: convs.length, m: total }));
  }
}

/** Imported canvases carry the AUTHOR's model pins (e.g. gateway slugs);
    the importer may reach the same families through different providers.
    Same family here → remap to the local id; unreachable → keep the pin
    (the author's intent survives a round-trip) and warn — generation
    falls back honestly at run time. */
async function reconcileImportedModels(nodes: ThoughtNode[]): Promise<ThoughtNode[]> {
  const data = await getModelsOnce();
  if (!data || data.models.length === 0) return nodes;
  const remapped = new Set<string>();
  const missing = new Set<string>();
  const out = nodes.map((n) => {
    const pin = n.data?.model;
    if (!pin) return n;
    const r = reconcileModelId(pin, data.models);
    if (r === pin) return n;
    if (r) { remapped.add(`${pin} → ${r}`); return { ...n, data: { ...n.data, model: r } }; }
    missing.add(pin);
    return n;
  });
  if (remapped.size) toast('info', fmt(t('import.modelsRemapped'), { list: [...remapped].join('，') }), 9000);
  if (missing.size) toast('info', fmt(t('import.modelsMissing'), { list: [...missing].join('，') }), 10000);
  return out;
}

export async function importProjectFromFile(file: File, pre?: unknown): Promise<boolean> {
  let parsed: { name?: string; nodes?: ThoughtNode[]; edges?: ThoughtEdge[]; events?: unknown[]; instantiatedFrom?: ProjectMeta['instantiatedFrom']; sourceSession?: ProjectMeta['sourceSession']; sharedReadonly?: boolean };
  try {
    parsed = (pre ?? JSON.parse(await file.text())) as typeof parsed;
  } catch {
    toast('error', t('toast.importFailedJson'));
    return false;
  }
  if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
    toast('error', t('toast.importFailedMissing'));
    return false;
  }
  if (parsed.nodes.length > 0 && !looksLikeCanvasNodes(parsed.nodes)) {
    toast('error', t('toast.importFailedShape'), 9000);
    return false;
  }
  if (parsed.sharedReadonly) {
    const ok = await confirmDialog({
      title: t('import.readonlyTitle'),
      message: t('import.readonlyConfirm'),
      confirmLabel: t('common.confirm'),
    });
    if (!ok) return false;
  }
  // An archive carrying a ledger restores a SUBSCRIBED canvas — but one
  // session, one canvas: if a canvas already subscribes to this session,
  // open it instead of minting a duplicate the listener would fight over.
  if (parsed.sourceSession?.sessionId) {
    const { useProjects, switchProject } = await import('../store/projects');
    const existing = useProjects.getState().projects.find(
      (p) => p.sourceSession?.sessionId === parsed.sourceSession!.sessionId);
    if (existing) {
      await switchProject(existing.id);
      toast('info', fmt(t('toast.importAlreadySubscribed'), { name: existing.name }), 9000);
      return true;
    }
  }
  const id = crypto.randomUUID();
  const reconciled = await internNodes(await reconcileImportedModels(parsed.nodes));
  // Write in the zustand-persist envelope format so rehydration accepts it.
  await idbSet(projectStorageKey(id), JSON.stringify({
    state: { nodes: stripTransient(reconciled), edges: parsed.edges, ...(Array.isArray(parsed.events) ? { events: parsed.events } : {}) },
    version: PERSIST_VERSION,
  }));
  const name = parsed.name?.trim() || file.name.replace(/\.thoughtdag\.json$|\.json$/i, '') || 'Imported canvas';
  await adoptImportedProject(id, name, 'chat', { instantiatedFrom: parsed.instantiatedFrom, sourceSession: parsed.sourceSession });
  toast('success', fmt(t('toast.imported'), { name, n: parsed.nodes.length }));
  return true;
}

// ─── Event-log CSV export (research measurement layer) ──────────
export function exportEventLogCsv(): void {
  const { events } = useStore.getState();
  if (events.length === 0) return;
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = events.map((e) => [e.t, e.op, e.id ?? '', e.d ? esc(JSON.stringify(e.d)) : ''].join(','));
  const csv = ['t,op,id,detail', ...rows].join('\n');
  downloadFile(`${sanitizeFilename(activeProjectName())}.events.csv`, csv, 'text/csv');
  toast('success', fmt(t('toast.exported'), { name: activeProjectName() }));
}

// ─── Markdown export ────────────────────────────────────────────
function nodeToMd(n: ThoughtNode): string {
  const parts = [`## Q: ${n.data.question}`, ''];
  const atts = n.data.attachments || [];
  if (atts.length > 0) parts.push(`> ${t('export.attachmentsLabel')} ${atts.map((a) => a.name).join(', ')}`, '');
  if (n.data.branchContext) parts.push(`> Exploring from: "${n.data.branchContext.slice(0, 120)}"`, '');
  parts.push(n.data.response || '_(no response)_', '');
  return parts.join('\n');
}

export function nodesToMarkdown(ordered: ThoughtNode[], subtitle: string): string {
  const totalTok = ordered.reduce((s, n) => s + countTokens(n.data.question + n.data.response), 0);
  return [
    `# ${activeProjectName()}`,
    '',
    `> ${subtitle} · exported ${new Date().toISOString().slice(0, 10)} · ${ordered.length} nodes · ~${totalTok} tok`,
    '',
    ordered.map(nodeToMd).join('\n---\n\n'),
  ].join('\n');
}

// Entry ①: the full context chain of one node (topological, roots first)
export function contextChainMarkdown(nodeId: string): string {
  const { nodes, edges } = useStore.getState();
  const ordered = getContextPath(nodeId, nodes, edges);
  return nodesToMarkdown(ordered, t('export.contextChain'));
}

// Entry ②: a multi-selection, in reading order (top-to-bottom, then left-to-right)
export function selectionMarkdown(selectedIds: string[]): string {
  const { nodes } = useStore.getState();
  const ordered = selectedIds
    .map((id) => nodes.find((n) => n.id === id))
    .filter((n): n is ThoughtNode => !!n)
    .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
  return nodesToMarkdown(ordered, t('export.selectedNodes'));
}

export function downloadMarkdown(md: string): void {
  downloadFile(`${sanitizeFilename(activeProjectName())}.md`, md, 'text/markdown');
}
