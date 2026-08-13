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

interface Window {
  desktop?: DesktopBridge;
}
