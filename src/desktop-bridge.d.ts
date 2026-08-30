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
  /** Line-aligned chunked read — the road for sessions too big for one string. */
  readRange: (rootKey: string, rel: string, start: number, length: number) => Promise<{ text: string; nextStart: number; eof: boolean }>;
  openInCli: (runner: string, cwd: string | null, sessionId: string, mode: 'app' | 'terminal') => Promise<{ opened: boolean; via: 'app' | 'terminal' | ''; command: string }>;
  openTargets: () => Promise<{
    terminals: { id: string; name: string; custom: boolean }[];
    apps: { runner: string; name: string }[];
    prefs: { terminal: string };
    canAddCustom: boolean;
  }>;
  setOpenPrefs: (prefs: { terminal: string }) => Promise<{ terminal: string }>;
  /** Native app picker (macOS) — a user-chosen terminal app joins the registry. */
  addTerminal: () => Promise<{ id: string; name: string } | null>;
  /** Codex app-server read path (Tier 2): real thread names, fork
      lineage, full turns. null whenever the codex CLI is absent. */
  codexThreads?: () => Promise<{
    id: string; sessionId: string; name: string | null; preview: string;
    forkedFromId: string | null; parentThreadId: string | null;
    updatedAt: string | null; cwd: string | null; path: string | null;
  }[] | null>;
  codexThreadRead?: (threadId: string) => Promise<unknown | null>;
  /** thoughtdag:// deep links: push while running, pull once at startup. */
  onDeepLink?: (cb: (url: string) => void) => void;
  pendingDeepLink?: () => Promise<string | null>;
  /** Start watching all live roots; events arrive via onSessionsChanged. */
  watchStart: () => Promise<boolean>;
  onSessionsChanged: (cb: (e: { rootKey: string; rel: string }) => void) => void;
}

interface Window {
  desktop?: DesktopBridge;
  desktopSessions?: DesktopSessionsBridge;
}
