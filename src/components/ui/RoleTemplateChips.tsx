import { Pencil } from 'lucide-react';
import { effectiveRoles } from '../../lib/role-templates';
import { useUiStore } from '../../lib/ui-store';
import { useI18n, useT } from '../../i18n';

// One-tap role presets shown under every role input — pick a chip to fill
// the prompt, then edit freely. The list is the user-editable role library
// (built-ins + custom); the pencil opens the manager.
export default function RoleTemplateChips({ onPick }: { onPick: (prompt: string) => void }) {
  const lang = useI18n((s) => s.lang);
  const lib = useUiStore((s) => s.roleLib);
  const setRoleManagerOpen = useUiStore((s) => s.setRoleManagerOpen);
  const t = useT();
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {effectiveRoles(lang, lib).map((tpl) => (
        <button
          key={tpl.id}
          type="button"
          onClick={() => onPick(tpl.prompt)}
          className="text-2xs bg-wash hover:bg-accent/10 hover:text-accent text-ink-muted px-2 py-1 rounded-full transition-colors"
          title={tpl.prompt.slice(0, 140) + '…'}
        >
          {tpl.name}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setRoleManagerOpen(true)}
        title={t('roles.manageTitle')}
        className="text-2xs text-ink-faint hover:text-accent px-2 py-1 rounded-full border border-dashed border-line hover:border-accent/40 transition-colors flex items-center gap-1"
      >
        <Pencil size={10} strokeWidth={1.75} /> {t('roles.manage')}
      </button>
    </div>
  );
}
