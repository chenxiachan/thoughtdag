import { toast } from './ui-store';
import { t, fmt } from '../i18n';

// Desktop update prompts, rendered as IN-APP toasts: same visual language,
// same i18n language as the rest of the UI (the shell's native dialogs
// followed the OS locale and looked like a different program). The shell
// still does all the work — this module only narrates it and forwards the
// two clicks that matter (download, restart), keeping every step the
// user's own choice.

export function bootDesktopUpdateUI(): void {
  const d = window.desktop;
  if (!d?.onUpdateEvent) return; // web, or an older shell with its own dialogs
  d.onUpdateEvent((e) => {
    switch (e.kind) {
      case 'available':
        toast('info', fmt(t('update.found'), { v: e.version ?? '' }), 0, {
          label: t('update.downloadAction'),
          run: () => void d.downloadUpdate?.(),
        });
        break;
      case 'downloading':
        toast('info', fmt(t('update.downloading'), { p: String(e.percent ?? 0) }));
        break;
      case 'ready':
        toast('success', fmt(t('update.ready'), { v: e.version ?? '' }), 0, {
          label: t('update.restartAction'),
          run: () => void d.installUpdate?.(),
        });
        break;
      case 'latest':
        toast('success', fmt(t('update.latest'), { v: e.version ?? '' }));
        break;
      case 'check-failed':
        toast('error', t('update.checkFailed'));
        break;
      case 'download-failed':
        toast('error', t('update.downloadFailed'));
        break;
      case 'dev':
        toast('info', 'Dev build: no update channel.');
        break;
    }
  });
}
