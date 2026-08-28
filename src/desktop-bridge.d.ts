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
interface DesktopSessionsBridge {
  list: (rootKey: string) => Promise<{ rel: string; size: number; mtime: number }[]>;
  head: (rootKey: string, rel: string, bytes: number) => Promise<string>;
  read: (rootKey: string, rel: string) => Promise<string>;
  openInCli: (runner: string, cwd: string | null, sessionId: string) => Promise<{ opened: boolean; command: string }>;
}

interface Window {
  desktop?: DesktopBridge;
  desktopSessions?: DesktopSessionsBridge;
}
