import { ChevronRight, RefreshCw } from 'lucide-react';
import { useStore } from '../../store';
import { useT } from '../../i18n';
import type { ThoughtData } from '../../types';

export default function RoleSection({
  nodeId,
  data,
  roleMode,
  inheritedRole,
  availableRoles,
  hasRoleConflict,
  roleChanged,
  setRoleChanged,
}: {
  nodeId: string;
  data: ThoughtData;
  roleMode: 'inherit' | 'set-next' | 'reset';
  inheritedRole: string;
  availableRoles: { nodeId: string; role: string; isPrimary: boolean; label: string }[];
  hasRoleConflict: boolean;
  roleChanged: boolean;
  setRoleChanged: (changed: boolean) => void;
}) {
  const setRoleMode = useStore((s) => s.setRoleMode);
  const setRoleSource = useStore((s) => s.setRoleSource);
  const setRolePrompt = useStore((s) => s.setRolePrompt);
  const regenerate = useStore((s) => s.regenerate);
  const t = useT();

  return (
    <div className="px-4 py-3 border-b border-line">
      <details className="group" open={roleMode !== 'inherit'}>
        <summary className="text-xs text-ink-faint uppercase tracking-wider font-medium cursor-pointer hover:text-ink-muted transition-colors flex items-center gap-1.5 select-none">
          <ChevronRight size={12} strokeWidth={1.75} className="transition-transform group-open:rotate-90" />
          {t('role.title')}
          {roleMode === 'set-next' && <span className="text-accent font-medium normal-case ml-1">{t('role.setForNext')}</span>}
          {roleMode === 'reset' && <span className="text-amber-600 font-medium normal-case ml-1">{t('role.resetBadge')}</span>}
          {roleMode === 'inherit' && (data.rolePrompt || inheritedRole) && (
            <span className="text-accent/60 font-medium normal-case ml-1 truncate max-w-[200px]">
              {data.rolePrompt ? data.rolePrompt.slice(0, 30) : `← ${inheritedRole.slice(0, 30)}`}{(data.rolePrompt || inheritedRole).length > 30 ? '…' : ''}
            </span>
          )}
        </summary>
        <div className="mt-2 space-y-2">
          {/* Three-mode radio */}
          <div className="flex gap-1">
            {([
              { mode: 'inherit' as const, label: t('role.inheritFromPrevious') },
              { mode: 'set-next' as const, label: t('role.setForNext') },
              { mode: 'reset' as const, label: t('role.resetForThisNode') },
            ]).map(({ mode, label }) => (
              <button
                key={mode}
                onClick={() => {
                  // Don't clear rolePrompt — preserve it when switching modes
                  setRoleMode(nodeId, mode);
                  setRoleChanged(false);
                }}
                className={`text-xs px-2.5 py-1.5 rounded-lg transition-colors ${
                  roleMode === mode ? 'bg-accent text-white' : 'bg-wash text-ink-muted hover:bg-line'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {/* Inherit: read-only display of role prompt */}
          {roleMode === 'inherit' && (
            (data.rolePrompt || inheritedRole) ? (
              <div className="text-xs text-ink-muted bg-wash rounded-lg px-3 py-2 leading-relaxed border border-line">
                {data.rolePrompt || inheritedRole}
              </div>
            ) : (
              <p className="text-xs text-ink-faint italic">{t('role.noRoleSet')}</p>
            )
          )}
          {/* Multi-role source selector */}
          {roleMode === 'inherit' && hasRoleConflict && (
            <div className="space-y-1.5">
              <p className="text-2xs text-amber-600 font-medium">{t('role.multipleRoles')}</p>
              {availableRoles.map((r) => {
                const isSelected = data.roleSourceNodeId === r.nodeId || (!data.roleSourceNodeId && r.isPrimary);
                return (
                  <label key={r.nodeId} className={`flex items-start gap-2 text-xs cursor-pointer select-none rounded-lg px-2.5 py-2 transition-colors ${isSelected ? 'bg-accent/10 border border-accent/30' : 'bg-wash border border-transparent hover:border-line'}`}>
                    <input
                      type="radio"
                      name="roleSource"
                      checked={isSelected}
                      onChange={() => setRoleSource(nodeId, r.nodeId)}
                      className="mt-0.5 text-accent focus:ring-accent"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-2xs px-1.5 py-0.5 rounded ${r.isPrimary ? 'bg-accent/15 text-accent' : 'bg-line text-ink-muted'}`}>
                          {r.isPrimary ? t('role.primary') : t('role.crossLink')}
                        </span>
                        <span className="text-ink-muted truncate">{r.label}</span>
                      </div>
                      <p className="text-ink-faint mt-0.5 truncate">{r.role.slice(0, 60)}{r.role.length > 60 ? '…' : ''}</p>
                    </div>
                  </label>
                );
              })}
              <label className={`flex items-center gap-2 text-xs cursor-pointer select-none rounded-lg px-2.5 py-2 transition-colors ${!data.roleSourceNodeId && !availableRoles.some((r) => r.isPrimary) ? 'bg-accent/10 border border-accent/30' : 'bg-wash border border-transparent hover:border-line'}`}>
                <input
                  type="radio"
                  name="roleSource"
                  checked={data.roleSourceNodeId === '__none__'}
                  onChange={() => setRoleSource(nodeId, '__none__')}
                  className="mt-0.5 text-accent focus:ring-accent"
                />
                <span className="text-ink-muted">{t('role.none')}</span>
              </label>
            </div>
          )}
          {/* Set for next / Reset: editable textarea */}
          {roleMode !== 'inherit' && (
            <textarea
              value={data.rolePrompt || ''}
              onChange={(e) => {
                setRolePrompt(nodeId, e.target.value);
                setRoleChanged(true);
              }}
              placeholder={t('role.placeholder')}
              className="w-full text-xs border border-line rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent bg-surface text-ink resize-none leading-relaxed"
              rows={2}
              autoFocus
            />
          )}
          {/* Regenerate button for Reset mode — show whenever reset mode is active with a prompt */}
          {roleMode === 'reset' && data.rolePrompt && !!data.response && !data.isLoading && (
            <button
              onClick={() => { regenerate(nodeId); setRoleChanged(false); }}
              className="w-full text-xs bg-accent hover:bg-accent-strong text-white px-3 py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5"
            >
              <RefreshCw size={14} strokeWidth={1.75} />
              {t('role.regenerateWithNewRole')}
            </button>
          )}
          {roleChanged && roleMode === 'set-next' && !!data.response && !data.isLoading && (
            <p className="text-2xs text-accent">{t('role.willApply')}</p>
          )}
          <p className="text-2xs text-ink-faint leading-relaxed">
            {roleMode === 'inherit' && !data.rolePrompt && !inheritedRole && t('role.hintNoRole')}
            {roleMode === 'inherit' && !data.rolePrompt && inheritedRole && t('role.hintInherited')}
            {roleMode === 'inherit' && data.rolePrompt && t('role.hintActive')}
            {roleMode === 'set-next' && t('role.hintSetNext')}
            {roleMode === 'reset' && t('role.hintReset')}
          </p>
        </div>
      </details>
    </div>
  );
}
