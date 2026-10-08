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
//
// Two storage modes, one filing rule (#66):
//   · handle (a browser tab): showDirectoryPicker returns a FileSystemDirectoryHandle
//     and the page writes through it.
//   · path (inside the harness): the picker is the HOST's own dialog and it
//     returns a PATH STRING, not a handle — the canvas keeps the string and the
//     host writes the file. Chromium's own picker never returns inside the
//     harness's Windows frame, so the handle mode is simply unavailable there.
//   The mode is chosen by whether the host offers backupJson; the layout
//   (folder root, cli/ drawer, <name>.thoughtdag.json) is identical in both.

const HANDLE_KEY = 'thoughtdag.backupDirHandle';
/** host-written mode: the picked directory as a plain absolute path */
const DIR_PATH_KEY = 'thoughtdag.backupDirPath';
const DEBOUNCE_MS = 60_000;

type DirHandle = FileSystemDirectoryHandle & {
  queryPermission?: (o: { mode: string }) => Promise<PermissionState>;
  requestPermission?: (o: { mode: string }) => Promise<PermissionState>;
};

/** the host's write endpoint, when this host has one */
function hostWrite(): ((dir: string, name: string, json: string) => Promise<{ file: string }>) | null {
  const fn = typeof window !== 'undefined' ? window.desktopAgents?.backupJson : undefined;
  return typeof fn === 'function' ? fn.bind(window.desktopAgents) : null;
}

/** Whether this page can back up at all.
 *
 *  A FUNCTION, not a constant: which mode is available is decided by whether
 *  the host's bridge is installed, and that bridge arrives from an async
 *  import in main.tsx — a module-level boolean would be evaluated before it
 *  exists and freeze the harness into "no backup" for the whole session.
 *  Both call sites are user-triggered (a menu renders, a dialog opens), so
 *  evaluating late is safe and always sees the truth. */
export function backupCapable(): boolean {
  return typeof window !== 'undefined'
    && ('showDirectoryPicker' in window || hostWrite() !== null);
}

let handle: DirHandle | null = null;
/** host-written mode's picked directory */
let hostDir: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;

/** What the file should contain and be called — shared by both modes. */
async function backupPayload(): Promise<{ name: string; isMirror: boolean; json: string } | null> {
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
  const json = JSON.stringify({
    version: EXPORT_FORMAT_VERSION,
    name: activeProjectName(),
    // the canvas's stable identity — names collide, ids do not; a deep
    // link back to this canvas rides on it
    projectId: activeId,
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
  return { name, isMirror, json };
}

/** Write the ACTIVE canvas as one real file. Both paths go through here —
    the debounced auto-backup and the dialog's "back up now" button back up
    the current canvas only; other canvases get their file whenever they
    are the active one. Returns the canvas name written, null if nothing
    was (no folder yet / empty canvas). */
export async function backupActiveProject(): Promise<string | null> {
  if (!handle && !hostDir) return null;
  const out = await backupPayload();
  if (!out) return null;
  // one filing rule: native canvases at the folder root, session-mirror
  // canvases in the cli/ drawer — every canvas reaches disk (a canvas
  // JSON is a PROJECTION, ~2.5% of its source session's size)
  const rel = out.isMirror ? `cli/${out.name}.thoughtdag.json` : `${out.name}.thoughtdag.json`;
  if (hostDir) {
    // the host creates cli/ under the picked folder and writes the file there
    await hostWrite()?.(hostDir, rel, out.json);
  } else {
    const dir = out.isMirror ? await handle!.getDirectoryHandle('cli', { create: true }) : handle!;
    const file = await dir.getFileHandle(`${out.name}.thoughtdag.json`, { create: true });
    const w = await file.createWritable();
    await w.write(out.json);
    await w.close();
  }
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

/** The folder's display name for the UI: the last path segment. */
function dirLabel(dir: string): string {
  const parts = dir.replace(/[\\/]+$/, '').split(/[\\/]/);
  return parts[parts.length - 1] || dir;
}

/** User gesture: pick (or re-pick) the backup folder.
 *
 *  Inside the harness the picker is the HOST's dialog (the same one the
 *  working-directory chip uses) and it answers with an absolute path — the
 *  canvas never sees a handle, and the host writes the files. Somewhere the
 *  host has no picker (reached remotely) the call reports unsupported and
 *  we fall back to Chromium's own picker, which is what a browser tab uses. */
export async function enableAutoBackup(): Promise<boolean> {
  const write = hostWrite();
  if (write) {
    const pick = window.desktopAgents?.pickCwd;
    const dir = pick ? await pick.call(window.desktopAgents).catch(() => null) : null;
    if (!dir) return false; // dismissed, or this host has no picker
    hostDir = dir;
    localStorage.setItem(DIR_PATH_KEY, dir);
    useUiStore.getState().setAutoBackupDir(dirLabel(dir));
    ensureWatch();
    try {
      await backupActiveProject();
    } catch (err) {
      // the folder was rejected (relative, gone, not writable): do not keep
      // a folder that cannot be written — the next pick starts clean
      hostDir = null;
      localStorage.removeItem(DIR_PATH_KEY);
      useUiStore.getState().setAutoBackupDir(null);
      console.warn('[thoughtdag] backup folder rejected:', err);
      return false;
    }
    toast('success', t('backup.enabled'));
    return true;
  }
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
  hostDir = null;
  await idbDel(HANDLE_KEY);
  localStorage.removeItem(DIR_PATH_KEY);
  useUiStore.getState().setAutoBackupDir(null);
}

/** Boot: restore the stored folder. In the host-written mode that is a path
    string — nothing to re-authorize, so the backup is live immediately; in
    the handle mode permission may need a gesture, so surface one sticky
    toast whose button re-activates it. */
export async function bootAutoBackup(): Promise<void> {
  if (isViewerMode || !backupCapable()) return;
  if (hostWrite()) {
    const dir = localStorage.getItem(DIR_PATH_KEY);
    if (!dir) return;
    hostDir = dir;
    useUiStore.getState().setAutoBackupDir(dirLabel(dir));
    ensureWatch();
    return;
  }
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
