import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, X } from 'lucide-react';
import { effectiveRoles, type EffectiveRole } from '../../lib/role-templates';
import { useUiStore } from '../../lib/ui-store';
import { generateId } from '../../utils';
import { useI18n, useT } from '../../i18n';

// The role LIBRARY editor: add, edit and remove the reusable options shown
// as chips everywhere. Editing a built-in converts it into a custom copy
// (the bilingual original is hidden, restorable). This never touches roles
// already applied to nodes — those are plain text frozen on the node.

function Row({ role, onCommit, onRemove }: {
  role: EffectiveRole;
  onCommit: (role: EffectiveRole, name: string, prompt: string) => void;
  onRemove: (role: EffectiveRole) => void;
}) {
  const t = useT();
  const [name, setName] = useState(role.name);
  const [prompt, setPrompt] = useState(role.prompt);
  const commit = () => onCommit(role, name.trim(), prompt.trim());
  return (
    <div className="border border-line rounded-xl px-3 py-2.5 space-y-1.5 bg-surface">
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          placeholder={t('roles.namePlaceholder')}
          className="flex-1 text-sm font-medium text-ink bg-transparent focus:outline-none placeholder-ink-faint"
        />
        {role.builtin && <span className="text-2xs text-ink-faint bg-wash px-1.5 py-0.5 rounded-full shrink-0">{t('roles.builtin')}</span>}
        <button
          onClick={() => onRemove(role)}
          title={t('common.delete')}
          className="text-ink-faint hover:text-red-500 w-6 h-6 rounded-full flex items-center justify-center transition-colors shrink-0"
        >
          <Trash2 size={13} strokeWidth={1.75} />
        </button>
      </div>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onBlur={commit}
        placeholder={t('roles.promptPlaceholder')}
        rows={2}
        className="w-full text-xs text-ink-muted bg-transparent focus:outline-none resize-y leading-relaxed placeholder-ink-faint"
      />
    </div>
  );
}

export default function RoleManagerModal() {
  const open = useUiStore((s) => s.roleManagerOpen);
  const setOpen = useUiStore((s) => s.setRoleManagerOpen);
  const lib = useUiStore((s) => s.roleLib);
  const setLib = useUiStore((s) => s.setRoleLib);
  const lang = useI18n((s) => s.lang);
  const t = useT();
  if (!open) return null;

  const roles = effectiveRoles(lang, lib);

  const commit = (role: EffectiveRole, name: string, prompt: string) => {
    if ((name === role.name && prompt === role.prompt) || (!name && !prompt)) return;
    if (role.builtin) {
      // editing a built-in = hide the bilingual original, keep a custom copy
      setLib({ hidden: [...lib.hidden, role.id], custom: [...lib.custom, { id: generateId(), name: name || role.name, prompt: prompt || role.prompt }] });
    } else {
      setLib({ ...lib, custom: lib.custom.map((c) => (c.id === role.id ? { ...c, name, prompt } : c)) });
    }
  };
  const remove = (role: EffectiveRole) => {
    if (role.builtin) setLib({ ...lib, hidden: [...lib.hidden, role.id] });
    else setLib({ ...lib, custom: lib.custom.filter((c) => c.id !== role.id) });
  };
  const add = () => setLib({ ...lib, custom: [...lib.custom, { id: generateId(), name: '', prompt: '' }] });

  return createPortal((
    <div className="fixed inset-0 z-[60] bg-ink/30 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setOpen(false)}>
      <div className="bg-card rounded-2xl shadow-2xl border border-line w-[560px] max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 py-3 border-b border-line shrink-0">
          <span className="text-sm font-semibold text-ink">{t('roles.managerTitle')}</span>
          <span className="text-2xs text-ink-faint flex-1">{t('roles.hint')}</span>
          <button onClick={() => setOpen(false)} className="text-ink-faint hover:text-ink w-7 h-7 rounded-lg hover:bg-wash flex items-center justify-center transition-colors shrink-0">
            <X size={15} strokeWidth={1.75} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3 space-y-2">
          {roles.map((r) => <Row key={r.id} role={r} onCommit={commit} onRemove={remove} />)}
          {roles.length === 0 && <p className="text-xs text-ink-faint italic py-2">{t('roles.empty')}</p>}
        </div>
        <div className="flex items-center gap-2 px-5 py-3 border-t border-line shrink-0">
          <button
            onClick={add}
            className="flex items-center gap-1.5 text-xs text-accent hover:bg-accent/10 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus size={14} strokeWidth={1.75} /> {t('roles.add')}
          </button>
          <div className="flex-1" />
          {lib.hidden.length > 0 && (
            <button
              onClick={() => setLib({ ...lib, hidden: [] })}
              className="text-2xs text-ink-faint hover:text-ink-muted underline decoration-dotted transition-colors"
            >
              {t('roles.restore')}
            </button>
          )}
        </div>
      </div>
    </div>
  ), document.body);
}
