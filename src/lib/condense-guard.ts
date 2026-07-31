import { useUiStore, toast } from './ui-store';
import { t } from '../i18n';

// Lives apart from condense.ts on purpose: store slices import this guard,
// and condense.ts imports the store — routing the guard through there
// would close an ESM cycle (the vault taught us this lesson once).

/** True (and toasts) when a mutation must wait for the condense build. */
export function condenseGuard(): boolean {
  if (useUiStore.getState().condenseRun.status !== 'building') return false;
  toast('info', t('condense.editLocked'));
  return true;
}
