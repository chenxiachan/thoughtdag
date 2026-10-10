import { useT } from '../../i18n';
import { IN_HARNESS_FRAME } from '../../lib/embedded';
import { useUiStore } from '../../lib/ui-store';

// The 对话 | 思维图 switch, as the canvas shows it while it runs inside the
// harness: one control in the canvas's own top bar, right after the canvas
// chip, so it shares the bar's row and never lands on the toolbar at any
// width (the floating pill the harness shows over its chat hides while the
// canvas is up). 思维图 is where we are; 对话 asks the shim to close the
// overlay. Renders nothing outside the harness build.

export default function HarnessViewSwitch() {
  const t = useT();
  // the desktop host's title band carries this switch itself, and a Windows-style host keeps the floating
  // pill for both views — its iframe starts below the host's top strip, so this in-canvas twin could never
  // sit at strip height (#61); the canvas shows its own only in a browser tab
  const hostBar = useUiStore((st) => !!st.harnessHost?.bar);
  const hostPill = useUiStore((st) => !!st.harnessHost?.pill);
  if (!IN_HARNESS_FRAME || hostBar || hostPill) return null;
  const close = () => window.parent.postMessage({ source: 'dsh-thoughtdag', type: 'td:close' }, window.location.origin);
  return (
    <div className="bg-card/90 backdrop-blur border border-line rounded-xl p-0.5 shadow-sm flex items-center" role="group" aria-label="view switch" data-harness-view-switch>
      <button
        type="button"
        onClick={close}
        className="h-8 px-3 rounded-[10px] text-xs font-semibold text-ink-muted hover:bg-wash hover:text-ink transition-colors whitespace-nowrap"
        data-view="dialog"
        aria-pressed={false}
      >
        {t('harness.viewChat')}
      </button>
      <button
        type="button"
        className="h-8 px-3 rounded-[10px] text-xs font-semibold bg-ink text-card whitespace-nowrap cursor-default"
        data-view="map"
        aria-pressed={true}
      >
        {t('harness.viewMap')}
      </button>
    </div>
  );
}
