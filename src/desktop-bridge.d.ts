// The desktop shell's preload bridge (desktop/preload.js). Absent on the
// web app — presence of window.desktop IS the "running in the shell" test.
interface DesktopBridge {
  checkForUpdates: () => Promise<void>;
}

interface Window {
  desktop?: DesktopBridge;
}
