import { useStore, stripTransient } from '../store';
import { useProjects, beforeSwitchHooks } from '../store/projects';
import { EXPORT_FORMAT_VERSION, activeProjectName } from './export';
import { isViewerMode } from './viewer';
import type { ThoughtNode } from '../types';

// The canvas writes its own source record — the way a runner writes its
// session file — so the why layer can read it whether or not the user
// ever chose a backup folder. Desktop only (the shell owns the disk).
// Slim on purpose: the words and the structure, never attachment bytes.
// Written to <thoughtdag home>/canvases/<projectId>.thoughtdag.json, the
// CLI's default canvas root; removed when the project is deleted.

const DEBOUNCE_MS = 60_000;
const MATERIAL_HEAD = 4000;

/** What the record keeps of an attachment: identity, kind, and the head
 *  of its text — enough to find a paper by its own words; no payload. */
function slimNode(n: ThoughtNode): ThoughtNode {
  const attachments = (n.data.attachments ?? []).map((a) => ({
    id: a.id, name: a.name, type: a.type, size: a.size, content: '',
    ...(a.addedAt ? { addedAt: a.addedAt } : {}),
    ...(a.extractedText ? { extractedText: a.extractedText.slice(0, MATERIAL_HEAD) } : {}),
    ...(a.paths ? { paths: a.paths } : {}), ...(a.op ? { op: a.op } : {}),
  }));
  return { ...n, data: { ...n.data, attachments } };
}

export function canvasRecordPayload(): { projectId: string; json: string } | null {
  const { nodes, edges, events } = useStore.getState();
  const { projects, activeId } = useProjects.getState();
  if (!activeId || nodes.length === 0) return null;
  const meta = projects.find((p) => p.id === activeId);
  const json = JSON.stringify({
    version: EXPORT_FORMAT_VERSION,
    name: activeProjectName(),
    projectId: activeId,
    exportedAt: new Date().toISOString(),
    record: 'thoughtdag-canvas-record',
    instantiatedFrom: meta?.instantiatedFrom,
    sourceSession: meta?.sourceSession,
    nodes: stripTransient(nodes).map(slimNode),
    edges,
    events,
  });
  return { projectId: activeId, json };
}

let timer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;

/** Write the active canvas's record now (a switch or a shutdown must not
 *  leave a minute of changes behind). */
export async function flushCanvasRecord(): Promise<boolean> {
  if (timer) { clearTimeout(timer); timer = null; }
  dirty = false;
  const bridge = window.desktopCanvas;
  if (!bridge) return false;
  const p = canvasRecordPayload();
  if (!p) return false;
  const r = await bridge.write(p.projectId, p.json).catch(() => ({ ok: false }));
  return !!r.ok;
}

function schedule(): void {
  dirty = true;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    if (!dirty) return;
    void flushCanvasRecord().catch((err) => console.warn('[thoughtdag] canvas record write failed:', err));
  }, DEBOUNCE_MS);
}

let started = false;
export function startCanvasRecord(): void {
  if (started || isViewerMode || typeof window === 'undefined' || !window.desktopCanvas) return;
  started = true;
  useStore.subscribe((state, prev) => {
    if (state.nodes !== prev.nodes || state.edges !== prev.edges || state.events !== prev.events) schedule();
  });
  // leaving a canvas flushes it before the next one loads
  beforeSwitchHooks.push(async () => { if (dirty) await flushCanvasRecord(); });
  window.addEventListener('pagehide', () => { if (dirty) void flushCanvasRecord(); });
  if (import.meta.env.DEV) Object.assign(window, { __canvasRecord: { flush: flushCanvasRecord, payload: canvasRecordPayload } });
}

/** A deleted project takes its record with it — backups the user made are
 *  their own files and stay. */
export async function removeCanvasRecord(projectId: string): Promise<void> {
  await window.desktopCanvas?.remove(projectId).catch(() => undefined);
}
