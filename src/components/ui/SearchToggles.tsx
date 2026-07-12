import { Globe, GraduationCap } from 'lucide-react';
import { useUiStore } from '../../lib/ui-store';
import { useModels } from '../../lib/use-models';
import { useT } from '../../i18n';

// Per-ask search permissions, shown next to every input that asks. The two
// toggles edit the shared default (ui-store, persisted); each new node
// snapshots them at creation, so reruns keep behaving the same way.
export default function SearchToggles({ size = 16 }: { size?: number }) {
  const web = useUiStore((s) => s.webSearchEnabled);
  const setWeb = useUiStore((s) => s.setWebSearchEnabled);
  const scholar = useUiStore((s) => s.scholarSearchEnabled);
  const setScholar = useUiStore((s) => s.setScholarSearchEnabled);
  const t = useT();
  // no key, no button: search that cannot run must not be offerable
  // (the capabilities panel is the one place that says why)
  const webAvailable = useModels()?.capabilities?.webSearch ?? true;

  const cls = (on: boolean) =>
    `transition-colors shrink-0 rounded-full w-8 h-8 flex items-center justify-center ${
      on ? 'text-accent bg-accent/10 hover:bg-accent/20' : 'text-ink-faint hover:text-ink-muted hover:bg-line'
    }`;

  return (
    <>
      {webAvailable && (
        <button
          type="button"
          onClick={() => setWeb(!web)}
          title={web ? t('toolbar.webSearch') : t('toolbar.webSearchOff')}
          className={cls(web)}
        >
          <Globe size={size} strokeWidth={1.75} />
        </button>
      )}
      <button
        type="button"
        onClick={() => setScholar(!scholar)}
        title={scholar ? t('toolbar.scholarSearch') : t('toolbar.scholarSearchOff')}
        className={cls(scholar)}
      >
        <GraduationCap size={size} strokeWidth={1.75} />
      </button>
    </>
  );
}
