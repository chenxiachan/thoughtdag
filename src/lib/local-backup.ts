import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import { useStore, stripTransient } from '../store';
import { useProjects, projectStorageKey } from '../store/projects';
import { toast, useUiStore } from './ui-store';
import { t } from '../i18n';
import { EXPORT_FORMAT_VERSION, activeProjectName } from './export';
import { isViewerMode } from './viewer';

// Automatic local backup via the File System Access API (Chromium): the user
// grants a FOLDER once; afterwards every canvas change is debounced and the
// active project silently (re)written as <name>.thoughtdag.json — a real file
// on disk that survives any browser-data wipe. Point the folder at a synced
// directory (Dropbox / iCloud / Drive desktop) and it doubles as cross-device
// sync, still with zero servers.

const HANDLE_KEY = 'thoughtdag.backupDirHandle';
const DEBOUNCE_MS = 60_000;

type DirHandle = FileSystemDirectoryHandle & {
  queryPermission?: (o: { mode: string }) => Promise<PermissionState>;
  requestPermission?: (o: { mode: string }) => Promise<PermissionState>;
};

export const backupSupported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

let handle: DirHandle | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;

async function writeActiveProject(): Promise<void> {
  if (!handle) return;
  const { nodes, edges, events } = useStore.getState();
  if (nodes.length === 0) return;
  const { projects, activeId } = useProjects.getState();
  const name = activeProjectName().replace(/[\\/:*?"<>|]/g, '_') || 'canvas';
  const payload = JSON.stringify({
    version: EXPORT_FORMAT_VERSION,
    name: activeProjectName(),
    exportedAt: new Date().toISOString(),
    instantiatedFrom: projects.find((p) => p.id === activeId)?.instantiatedFrom,
    nodes: stripTransient(nodes),
    edges,
    events,
  });
  const file = await handle.getFileHandle(`${name}.thoughtdag.json`, { create: true });
  const w = await file.createWritable();
  await w.write(payload);
  await w.close();
  localStorage.setItem('thoughtdag.lastBackupAt', String(Date.now()));
  useUiStore.getState().setLastAutoBackupAt(Date.now());
}

/** Manual "backup now": every project, not just the active one. */
export async function backupAllProjects(): Promise<number> {
  if (!handle) return 0;
  const { projects, activeId } = useProjects.getState();
  let written = 0;
  for (const proj of projects) {
    let nodes; let edges; let events;
    if (proj.id === activeId) {
      ({ nodes, edges, events } = useStore.getState());
    } else {
      const raw = await idbGet(projectStorageKey(proj.id)).catch(() => null);
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      nodes = parsed?.state?.nodes ?? [];
      edges = parsed?.state?.edges ?? [];
      events = parsed?.state?.events ?? [];
    }
    if (!nodes || nodes.length === 0) continue;
    const fname = `${proj.name.replace(/[\\/:*?"<>|]/g, '_') || 'canvas'}.thoughtdag.json`;
    const payload = JSON.stringify({
      version: EXPORT_FORMAT_VERSION, name: proj.name,
      exportedAt: new Date().toISOString(), instantiatedFrom: proj.instantiatedFrom,
      nodes: stripTransient(nodes), edges, events,
    });
    const file = await handle.getFileHandle(fname, { create: true });
    const w2 = await file.createWritable();
    await w2.write(payload);
    await w2.close();
    written++;
  }
  localStorage.setItem('thoughtdag.lastBackupAt', String(Date.now()));
  useUiStore.getState().setLastAutoBackupAt(Date.now());
  return written;
}

function schedule(): void {
  dirty = true;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    if (!dirty) return;
    dirty = false;
    void writeActiveProject().catch((err) => {
      console.warn('[thoughtdag] auto-backup write failed:', err);
    });
  }, DEBOUNCE_MS);
}

function watch(): void {
  useStore.subscribe((state, prev) => {
    if (state.nodes !== prev.nodes || state.edges !== prev.edges) schedule();
  });
}

let watching = false;
function ensureWatch(): void {
  if (!watching) { watching = true; watch(); }
}

/** User gesture: pick (or re-pick) the backup folder. */
export async function enableAutoBackup(): Promise<boolean> {
  try {
    const dir = (await (window as unknown as { showDirectoryPicker: (o: object) => Promise<DirHandle> })
      .showDirectoryPicker({ mode: 'readwrite' }));
    handle = dir;
    await idbSet(HANDLE_KEY, dir);
    useUiStore.getState().setAutoBackupDir(dir.name);
    ensureWatch();
    await writeActiveProject();
    toast('success', t('backup.enabled'));
    return true;
  } catch {
    return false; // picker dismissed
  }
}

export async function disableAutoBackup(): Promise<void> {
  handle = null;
  await idbDel(HANDLE_KEY);
  useUiStore.getState().setAutoBackupDir(null);
}

/** Boot: restore the stored handle; if permission needs a gesture, surface
    one sticky toast whose button re-activates it. */
export async function bootAutoBackup(): Promise<void> {
  if (isViewerMode || !backupSupported) return;
  const stored = await idbGet<DirHandle>(HANDLE_KEY).catch(() => null);
  if (!stored) return;
  useUiStore.getState().setAutoBackupDir(stored.name);
  const perm = await stored.queryPermission?.({ mode: 'readwrite' }).catch(() => 'prompt');
  if (perm === 'granted') {
    handle = stored;
    ensureWatch();
    return;
  }
  toast('info', t('backup.reauth'), 0, {
    label: t('backup.reauthBtn'),
    run: () => {
      void stored.requestPermission?.({ mode: 'readwrite' }).then((p) => {
        if (p === 'granted') { handle = stored; ensureWatch(); toast('success', t('backup.enabled')); }
      });
    },
  });
}
