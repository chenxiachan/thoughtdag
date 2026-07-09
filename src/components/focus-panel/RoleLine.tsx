import { useState } from 'react';
import { UserCog } from 'lucide-react';
import { useStore } from '../../store';
import { useT } from '../../i18n';
import RoleTemplateChips from '../ui/RoleTemplateChips';
import type { ThoughtData } from '../../types';

// One-line role status. The narrow role model: a rolePrompt on a node is
// the system prompt for it and everything downstream (nearest ancestor
// wins). It is edited where it lives — on the node that set it, or on a
// root. Elsewhere it is a read-only "inherited" line. Machine-step personas
// don't use this at all; they live in prompt text.

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

  const save = () => {
    setRolePrompt(nodeId, value.trim());
    setEditing(false);
  };

  return (
    <div className="px-4 py-2 border-b border-line">
      <div className="flex items-center gap-2 text-xs min-w-0">
        <UserCog size={13} strokeWidth={1.75} className="text-ink-faint shrink-0" />
        <span className="text-ink-faint font-medium shrink-0">{t('role.label')}</span>
        {!editing && (
          effective ? (
            <>
              <span className="text-ink-muted truncate flex-1" title={effective}>{effective}</span>
              {!own && <span className="text-2xs bg-wash text-ink-faint px-1.5 py-0.5 rounded-full shrink-0">{t('role.inherited')}</span>}
              {canEdit && (
                <button
                  onClick={() => { setValue(own ?? ''); setEditing(true); }}
                  className="text-2xs text-accent hover:text-accent-strong shrink-0 transition-colors"
                >
                  {t('role.edit')}
                </button>
              )}
            </>
          ) : canEdit ? (
            <button
              onClick={() => { setValue(''); setEditing(true); }}
              className="text-2xs text-ink-faint hover:text-accent transition-colors"
            >
              + {t('role.set')}
            </button>
          ) : (
            <span className="text-ink-faint italic">{t('role.noRoleSet')}</span>
          )
        )}
      </div>
      {editing && (
        <div className="mt-2 space-y-1.5">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); }
              if (e.key === 'Escape') setEditing(false);
            }}
            placeholder={t('role.placeholder')}
            className="w-full text-xs border border-line rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent bg-surface text-ink resize-none leading-relaxed"
            rows={2}
            autoFocus
          />
          <RoleTemplateChips onPick={(p) => setValue(p)} />
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(false)} className="text-xs text-ink-muted hover:text-ink px-2.5 py-1 rounded-lg hover:bg-wash transition-colors">{t('common.cancel')}</button>
            <button onClick={save} className="text-xs bg-accent hover:bg-accent-strong text-white px-3 py-1 rounded-lg transition-colors">{t('common.save')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
