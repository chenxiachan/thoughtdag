import { Handle, Position, type NodeProps } from '@xyflow/react';
import { ClipboardList, Eye, FileText, Split, Trash2 } from 'lucide-react';
import type { ThoughtNode as ThoughtNodeType, ThoughtData } from '../types';
import { useStore } from '../store';
import { ROLE_TEMPLATES, rolePromptFor } from '../lib/role-templates';
import { useI18n, useT } from '../i18n';

// Orchestration-view card: a paradigm STEP. Here you write prompt
// engineering (instructions, roles, flow kinds) — never questions, never
// LLM calls. The dashed border and tool palette make the mode unmistakable.

const KINDS: { kind: NonNullable<ThoughtData['stepKind']>; icon: typeof FileText; labelKey: string }[] = [
  { kind: 'step', icon: FileText, labelKey: 'paradigm.kind.step' },
  { kind: 'fanout', icon: Split, labelKey: 'paradigm.kind.fanout' },
  { kind: 'review', icon: Eye, labelKey: 'paradigm.kind.review' },
  { kind: 'synthesis', icon: ClipboardList, labelKey: 'paradigm.kind.synthesis' },
];

const KIND_STYLES: Record<string, string> = {
  step: 'border-line',
  fanout: 'border-warm/60',
  review: 'border-watch/50',
  synthesis: 'border-accent/50',
};

export default function ParadigmNode({ id, data }: NodeProps<ThoughtNodeType>) {
  const t = useT();
  const lang = useI18n((s) => s.lang);
  const deleteNode = useStore((s) => s.deleteNode);
  const patch = (p: Partial<ThoughtData>) => {
    useStore.setState((state) => ({
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...p } } : n)),
    }));
  };
  const kind = data.stepKind ?? 'step';

  const rolesText = (data.fanoutRoles ?? []).map((r) => `${r.name}: ${r.prompt}`).join('\n');

  return (
    <div className={`bg-card border-2 border-dashed rounded-xl w-[440px] shadow-sm ${KIND_STYLES[kind]}`}>
      <Handle type="target" position={Position.Top} id="top" className="!bg-ink-faint !w-3 !h-3 !border-2 !border-white" />

      {/* header: drag handle + kind switcher + delete */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-line/60 cursor-grab active:cursor-grabbing drag-handle">
        <div className="flex gap-1">
          {KINDS.map(({ kind: k, icon: Icon, labelKey }) => (
            <button
              key={k}
              onClick={(e) => { e.stopPropagation(); patch({ stepKind: k }); }}
              title={t(labelKey as Parameters<typeof t>[0])}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                kind === k ? 'bg-ink/10 text-ink' : 'text-ink-faint hover:bg-wash'
              }`}
            >
              <Icon size={14} strokeWidth={1.75} />
            </button>
          ))}
          <span className="text-2xs text-ink-faint self-center ml-1 uppercase tracking-wider font-medium">
            {t(`paradigm.kind.${kind}` as Parameters<typeof t>[0])}
          </span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); deleteNode(id); }}
          className="text-ink-faint hover:text-red-500 rounded-full w-6 h-6 flex items-center justify-center transition-colors"
        >
          <Trash2 size={13} strokeWidth={1.75} />
        </button>
      </div>

      <div className="px-4 py-3 space-y-2.5 nodrag">
        {/* step title */}
        <input
          type="text"
          value={data.question}
          onChange={(e) => patch({ question: e.target.value })}
          placeholder={t('paradigm.titlePlaceholder')}
          className="w-full text-sm font-semibold text-ink bg-transparent focus:outline-none placeholder-ink-faint"
        />

        {/* instruction: the prompt-engineering body */}
        <textarea
          value={data.instruction ?? ''}
          onChange={(e) => patch({ instruction: e.target.value })}
          placeholder={t('paradigm.instructionPlaceholder')}
          rows={3}
          className="w-full text-xs text-ink bg-surface border border-line rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-accent/40 resize-y leading-relaxed"
        />

        {/* role for step/review */}
        {(kind === 'step' || kind === 'review') && (
          <div>
            <div className="flex flex-wrap gap-1 mb-1">
              {ROLE_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => patch({ rolePrompt: rolePromptFor(tpl, lang) })}
                  className="text-2xs bg-wash hover:bg-accent/10 hover:text-accent text-ink-muted px-1.5 py-0.5 rounded-full transition-colors"
                >
                  {lang === 'zh' ? tpl.nameZh : tpl.nameEn}
                </button>
              ))}
            </div>
            <textarea
              value={data.rolePrompt ?? ''}
              onChange={(e) => patch({ rolePrompt: e.target.value })}
              placeholder={t('paradigm.rolePlaceholder')}
              rows={2}
              className="w-full text-2xs text-ink-muted bg-surface border border-line rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent/40 resize-y leading-relaxed"
            />
          </div>
        )}

        {/* fanout role list */}
        {kind === 'fanout' && (
          <div>
            <label className="text-2xs text-ink-faint uppercase tracking-wider font-medium block mb-1">{t('paradigm.fanoutRoles')}</label>
            <textarea
              defaultValue={rolesText}
              onBlur={(e) => {
                // parse on blur so typing isn't disrupted by re-derivation
                const roles = e.target.value.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
                  const i = line.indexOf(':');
                  return i > 0 ? { name: line.slice(0, i).trim(), prompt: line.slice(i + 1).trim() } : { name: line.slice(0, 24), prompt: line };
                });
                patch({ fanoutRoles: roles.length > 0 ? roles : undefined });
              }}
              placeholder={t('fanout.customPlaceholder')}
              rows={4}
              className="w-full text-2xs text-ink-muted bg-surface border border-line rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-warm/40 resize-y leading-relaxed font-mono"
            />
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} id="continue" className="!bg-ink-faint !w-3 !h-3 !border-2 !border-white" />
    </div>
  );
}
