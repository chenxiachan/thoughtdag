import { useState } from 'react';
import { Paperclip, UserCog } from 'lucide-react';
import { useStore } from '../../store';
import { useT } from '../../i18n';
import RoleTemplateChips from '../ui/RoleTemplateChips';
import type { ThoughtData } from '../../types';

// The panel's summary kicker: role · tokens · materials, in one quiet line
// at the top. The narrow role model: a rolePrompt on a node is the system
// prompt for it and everything downstream (nearest ancestor wins). It is
// edited where it lives — on the node that set it, or on a root; clicking
// the role text opens the editor. Elsewhere it is a read-only "inherited"
// segment. Machine-step personas don't use this at all; they live in
// prompt text.

export default function RoleLine({
  nodeId,
  data,
  inheritedRole,
}: {
  nodeId: string;
  data: ThoughtData;
  inheritedRole: string;
}) {
  const setRolePrompt = useStore((s) => s.setRolePrompt);
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(data.rolePrompt ?? '');

  const own = data.rolePrompt;
  const effective = own || inheritedRole;
  const canEdit = !!own || data.isRoot;
  const attachCount = (data.attachments || []).length;

  const save = () => {
    setRolePrompt(nodeId, value.trim());
    setEditing(false);
  };

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5 text-xs text-ink-faint min-w-0 h-8">
        <UserCog size={13} strokeWidth={1.75} className="shrink-0" />
        {!editing && (<>
        {effective ? (
          canEdit ? (
            <button
              onClick={() => { setValue(own ?? ''); setEditing(true); }}
              className="text-warm hover:underline decoration-dotted underline-offset-2 truncate font-medium max-w-[45%] shrink-0"
              title={`${effective} — ${t('role.edit')}`}
            >
              {effective}
            </button>
          ) : (
            <span className="text-warm/90 truncate max-w-[45%] shrink-0" title={effective}>{effective}</span>
          )
        ) : canEdit ? (
          <button
            onClick={() => { setValue(''); setEditing(true); }}
            className="hover:text-warm transition-colors shrink-0"
          >
            + {t('role.set')}
          </button>
        ) : (
          <span className="italic shrink-0">{t('role.noRoleSet')}</span>
        )}
        {!own && effective && (
          <span className="text-2xs bg-line/50 px-1.5 py-px rounded-full shrink-0">{t('role.inherited')}</span>
        )}
        <span className="shrink-0">·</span>
        </>)}
        <span className="shrink-0 text-ink-muted">{data.tokenCount} tok</span>
        {attachCount > 0 && (
          <>
            <span className="shrink-0">·</span>
            <span className="shrink-0 text-ink-muted flex items-center gap-0.5">
              <Paperclip size={11} strokeWidth={1.75} /> {attachCount}
            </span>
          </>
        )}
      </div>
      {editing && (
        <div className="pb-2 space-y-1.5">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); }
              if (e.key === 'Escape') setEditing(false);
            }}
            placeholder={t('role.placeholder')}
            className="w-full text-xs border border-line rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent bg-card text-ink resize-none leading-relaxed"
            rows={2}
            autoFocus
          />
          <RoleTemplateChips onPick={(p) => setValue(p)} />
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(false)} className="text-xs text-ink-muted hover:text-ink px-2.5 py-1 rounded-lg hover:bg-line/40 transition-colors">{t('common.cancel')}</button>
            <button onClick={save} className="text-xs bg-accent hover:bg-accent-strong text-white px-3 py-1 rounded-lg transition-colors">{t('common.save')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
