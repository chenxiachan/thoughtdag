import { Wrench } from 'lucide-react';
import { useStore } from '../../store';
import { useT, fmt } from '../../i18n';
import { isViewerMode } from '../../lib/viewer';
import { turnComposition } from '../../lib/turn-insight';
import type { ThoughtData } from '../../types';

// What an agent turn hands to the questions asked below it. The answer always
// goes; the tool record goes only while this switch is on (every step at once,
// the per-step dial stays in the attachments); the thinking never goes. One
// switch on the turn itself, so every branch below reads the same record.

export default function HandoffLine({ nodeId, data }: { nodeId: string; data: ThoughtData }) {
  const t = useT();
  const setToolRecordForwarded = useStore((s) => s.setToolRecordForwarded);
  const c = turnComposition(data);
  if (!c) return null;
  const on = c.toolForwarded !== 'none';
  const label = c.toolForwarded === 'all' ? t('handoff.on')
    : c.toolForwarded === 'none' ? t('handoff.off')
    : fmt(t('handoff.some'), { k: c.toolStepsForwarded, n: c.toolSteps });

  return (
    <div className="rounded-xl border border-line bg-card px-3 py-2 text-xs space-y-1" data-handoff-line>
      <div className="flex items-center gap-2 min-w-0">
        <Wrench size={13} strokeWidth={1.75} className="text-warm shrink-0" />
        <span className="text-ink-muted truncate flex-1 min-w-0">
          {fmt(t('handoff.tools'), { n: c.toolSteps, tok: c.tool.toLocaleString() })}
        </span>
        <button
          onClick={() => setToolRecordForwarded(nodeId, c.toolForwarded !== 'all')}
          disabled={isViewerMode}
          title={t('handoff.toggleTitle')}
          className={`text-2xs px-2 py-0.5 rounded-lg shrink-0 transition-colors disabled:cursor-default ${on ? 'bg-warm/15 text-warm hover:bg-warm/25' : 'bg-line text-ink-muted hover:bg-warm/10 hover:text-warm'}`}
          data-handoff-toggle={c.toolForwarded}
        >
          {label}
        </button>
      </div>
      <p className="text-2xs text-ink-faint">{on ? t('handoff.onHint') : t('handoff.offHint')}</p>
      {c.think > 0 && (
        <p className="text-2xs text-ink-faint" data-handoff-think>{fmt(t('handoff.think'), { tok: c.think.toLocaleString() })}</p>
      )}
    </div>
  );
}
