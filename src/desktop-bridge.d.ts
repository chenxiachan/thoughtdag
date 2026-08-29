// The desktop shell's preload bridge (desktop/preload.js). Absent on the
// web app — presence of window.desktop IS the "running in the shell" test.
// Methods beyond checkForUpdates are optional: an older shell may pair with
// a newer page during dev; the page degrades to the shell's own dialogs.
interface DesktopUpdateEvent {
  kind: 'available' | 'downloading' | 'ready' | 'latest' | 'check-failed' | 'download-failed' | 'dev';
  version?: string;
  percent?: number;
}

interface DesktopBridge {
  checkForUpdates: () => Promise<void>;
  downloadUpdate?: () => Promise<void>;
  installUpdate?: () => Promise<void>;
  onUpdateEvent?: (cb: (e: DesktopUpdateEvent) => void) => void;
}

// Fenced read-only primitives over the runner session stores (main.js
// SESSION_ROOTS). All runner knowledge lives in src/lib/atlas/.
interface SessionRoot {
  key: string;
  path: string;
  builtin: boolean;
  exists: boolean;
}

interface DesktopSessionsBridge {
  roots: () => Promise<SessionRoot[]>;
  /** Native directory picker — the ONLY door into the whitelist. */
  addRoot: () => Promise<SessionRoot | null>;
  removeRoot: (key: string) => Promise<void>;
  list: (rootKey: string) => Promise<{ rel: string; size: number; mtime: number }[]>;
  head: (rootKey: string, rel: string, bytes: number) => Promise<string>;
  read: (rootKey: string, rel: string) => Promise<string>;
  openInCli: (runner: string, cwd: string | null, sessionId: string) => Promise<{ opened: boolean; via: 'app' | 'terminal' | ''; command: string }>;
  openTargets: () => Promise<{
    terminals: { id: string; name: string }[];
    apps: { runner: string; name: string }[];
    prefs: { terminal: string; openApp: Record<string, boolean> };
  }>;
  setOpenPrefs: (prefs: { terminal?: string; openApp?: Record<string, boolean> }) => Promise<{ terminal: string; openApp: Record<string, boolean> }>;
}

interface Window {
  desktop?: DesktopBridge;
  desktopSessions?: DesktopSessionsBridge;
}
