import { ROLE_TEMPLATES, rolePromptFor } from '../../lib/role-templates';
import { useI18n } from '../../i18n';

// One-tap role presets shown under every role input — pick a chip to fill
// the prompt, then edit freely.
export default function RoleTemplateChips({ onPick }: { onPick: (prompt: string) => void }) {
  const lang = useI18n((s) => s.lang);
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {ROLE_TEMPLATES.map((tpl) => (
        <button
          key={tpl.id}
          type="button"
          onClick={() => onPick(rolePromptFor(tpl, lang))}
          className="text-2xs bg-wash hover:bg-accent/10 hover:text-accent text-ink-muted px-2 py-1 rounded-full transition-colors"
          title={rolePromptFor(tpl, lang).slice(0, 140) + '…'}
        >
          {lang === 'zh' ? tpl.nameZh : tpl.nameEn}
        </button>
      ))}
    </div>
  );
}
