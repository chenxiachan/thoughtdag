import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import { useStore, stripTransient } from '../store';
import { useProjects } from '../store/projects';
import { toast, useUiStore } from './ui-store';
import { t } from '../i18n';
import { EXPORT_FORMAT_VERSION, activeProjectName } from './export';
import { isViewerMode } from './viewer';
import { inlineVaultedContent } from './attachment-vault';

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

/** Write the ACTIVE canvas as one real file. Both paths go through here —
    the debounced auto-backup and the dialog's "back up now" button back up
    the current canvas only; other canvases get their file whenever they
    are the active one. Returns the canvas name written, null if nothing
    was (no folder yet / empty canvas). */
export async function backupActiveProject(): Promise<string | null> {
  if (!handle) return null;
  const { nodes: rawNodes, edges, events } = useStore.getState();
  if (rawNodes.length === 0) return null;
  const { projects, activeId } = useProjects.getState();
  const activeMeta = projects.find((p) => p.id === activeId);
  const nodes = await inlineVaultedContent(rawNodes);
  const base = (activeProjectName().replace(/[\\/:*?"<>|]/g, '_') || 'canvas').slice(0, 48);
  // mirror canvases are named after their first prompt — suffix the
  // session id so long/similar prompts can't collide on disk
  const isMirror = !!activeMeta?.sourceSession;
  const name = activeMeta?.sourceSession?.sessionId ? `${base}-${activeMeta.sourceSession.sessionId.slice(0, 8)}` : base;
  const payload = JSON.stringify({
    version: EXPORT_FORMAT_VERSION,
    name: activeProjectName(),
    exportedAt: new Date().toISOString(),
    instantiatedFrom: activeMeta?.instantiatedFrom,
    // the LEDGER travels with the archive: a restored canvas keeps its
    // subscriptions, so listening and appending come back to life — the
    // ledger holds only UUIDs (session ids), never paths, so the file
    // survives machines and moves; a source that isn't on this machine
    // simply stays silent until it appears.
    sourceSession: activeMeta?.sourceSession,
    nodes: stripTransient(nodes),
    edges,
    events,
  });
  // one filing rule: native canvases at the folder root, session-mirror
  // canvases in the cli/ drawer — every canvas reaches disk (a canvas
  // JSON is a PROJECTION, ~2.5% of its source session's size)
  const dir = isMirror ? await handle.getDirectoryHandle('cli', { create: true }) : handle;
  const file = await dir.getFileHandle(`${name}.thoughtdag.json`, { create: true });
  const w = await file.createWritable();
  await w.write(payload);
  await w.close();
  localStorage.setItem('thoughtdag.lastBackupAt', String(Date.now()));
  useUiStore.getState().setLastAutoBackupAt(Date.now());
  return activeProjectName();
}

function schedule(): void {
  dirty = true;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    if (!dirty) return;
    dirty = false;
    void backupActiveProject().catch((err) => {
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
    await backupActiveProject();
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
