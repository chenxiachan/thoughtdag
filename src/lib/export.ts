import { set as idbSet } from 'idb-keyval';
import { useStore, stripTransient } from '../store';
import { useProjects, projectStorageKey, adoptImportedProject } from '../store/projects';
import { detectFormat, listConversations, type ImportableConversation } from './import-chat';
import { isParadigmFile } from './paradigm';
import { getContextPath } from './graph';
import { runDiagnostics } from './diagnostics';
import { countTokens } from '../utils';
import { toast } from './ui-store';
import { t, fmt } from '../i18n';
import type { ThoughtNode, ThoughtEdge } from '../types';

const EXPORT_FORMAT_VERSION = 1;
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

function activeProjectName(): string {
  const { projects, activeId } = useProjects.getState();
  return projects.find((p) => p.id === activeId)?.name ?? 'canvas';
}

// ─── Run manifest: the provenance record for a canvas ───────────
// What a methods section needs: which model answered what, from which
// context (fingerprint), when, with which tools on, and whether anything
// on the canvas is currently stale. Lean by design — full content lives
// in the JSON backup; the manifest is the audit trail.
export function runManifest(): string {
  const { nodes, edges, staleIds } = useStore.getState();
  const stale = new Set(staleIds);
  const { projects, activeId } = useProjects.getState();
  const activeProject = projects.find((pr) => pr.id === activeId);
  const edgeKind = (e: ThoughtEdge) =>
    e.data?.isWatch ? 'watch'
      : e.data?.isCrossLink ? 'reference'
        : e.data?.isBranchFromSelection ? 'branch'
          : 'structural';
  const manifest = {
    format: 'thoughtdag-manifest',
    version: 1,
    exportedAt: new Date().toISOString(),
    project: activeProjectName(),
    instantiatedFrom: activeProject?.instantiatedFrom ?? null,
    staleCount: staleIds.length,
    // The check-up report ships with the audit trail by default: which
    // topological checks this graph passed is part of the methods record.
    diagnostics: runDiagnostics(nodes, edges).map((f) => ({
      tier: f.tier, kind: f.kind, nodes: f.nodeIds, edges: f.edgeIds,
    })),
    nodes: nodes
      .filter((n) => n.data.stepKind !== 'frame')
      .map((n) => ({
        id: n.id,
        kind: n.data.stepKind ?? 'qa',
        question: n.data.question,
        model: n.data.model ?? null,
        role: n.data.appliedRole ?? n.data.rolePrompt ?? null,
        webSearch: n.data.webSearch ?? null,
        scholarSearch: n.data.scholarSearch ?? null,
        autoRerunRounds: n.data.autoRerunRounds ?? null,
        versions: n.data.responses.length,
        activeVersion: n.data.responses.length > 0 ? n.data.responseIndex + 1 : null,
        responseChars: n.data.response.length,
        tokenCount: n.data.tokenCount,
        contextFingerprint: n.data.lastContextHash ?? null,
        generatedAt: n.data.lastGeneratedAt ?? null,
        stale: stale.has(n.id),
        archived: n.data.archived ?? false,
      })),
    edges: edges.map((e) => ({
      source: e.source,
      target: e.target,
      kind: edgeKind(e),
      ...(e.data?.isCrossLink ? { depth: e.data?.contextDepth === 'full' ? 'full' : 'quote' } : {}),
    })),
  };
  return JSON.stringify(manifest, null, 2);
}

export function downloadManifest(): void {
  downloadFile(`${sanitizeFilename(activeProjectName())}.manifest.json`, runManifest(), 'application/json');
  toast('success', t('toast.manifestExported'));
}

// ─── Whole-canvas JSON backup ───────────────────────────────────
export function exportActiveProjectJson(): void {
  const { nodes, edges } = useStore.getState();
  const name = activeProjectName();
  const payload = JSON.stringify({
    version: EXPORT_FORMAT_VERSION,
    name,
    exportedAt: new Date().toISOString(),
    nodes: stripTransient(nodes),
    edges,
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
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    toast('error', t('toast.importFailedJson'));
    return { kind: 'error' };
  }
  if (isParadigmFile(parsed)) {
    const id = crypto.randomUUID();
    await idbSet(projectStorageKey(id), JSON.stringify({ state: { nodes: parsed.nodes, edges: parsed.edges }, version: PERSIST_VERSION }));
    await adoptImportedProject(id, parsed.name || 'Paradigm', 'paradigm');
    toast('success', fmt(t('toast.imported'), { name: parsed.name, n: parsed.nodes.length }));
    return { kind: 'own', ok: true };
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

/** Convert selected chat conversations, one new project each. */
export async function importChatConversations(convs: ImportableConversation[]): Promise<void> {
  let firstId: string | null = null;
  let total = 0;
  for (const conv of convs) {
    const { nodes, edges } = conv.build();
    if (nodes.length === 0) continue;
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

export async function importProjectFromFile(file: File, pre?: unknown): Promise<boolean> {
  let parsed: { name?: string; nodes?: ThoughtNode[]; edges?: ThoughtEdge[] };
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
  const id = crypto.randomUUID();
  // Write in the zustand-persist envelope format so rehydration accepts it.
  await idbSet(projectStorageKey(id), JSON.stringify({
    state: { nodes: stripTransient(parsed.nodes), edges: parsed.edges },
    version: PERSIST_VERSION,
  }));
  const name = parsed.name?.trim() || file.name.replace(/\.thoughtdag\.json$|\.json$/i, '') || 'Imported canvas';
  await adoptImportedProject(id, name);
  toast('success', fmt(t('toast.imported'), { name, n: parsed.nodes.length }));
  return true;
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
