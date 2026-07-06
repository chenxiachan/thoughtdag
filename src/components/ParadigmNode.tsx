import { Handle, Position, type NodeProps } from '@xyflow/react';
import { MessageCircleQuestion, SquareTerminal, Trash2 } from 'lucide-react';
import type { ThoughtNode as ThoughtNodeType, ThoughtData } from '../types';
import { useStore } from '../store';
import { ROLE_TEMPLATES, rolePromptFor } from '../lib/role-templates';
import { useI18n, useT } from '../i18n';

// Orchestration-view card. A paradigm has exactly two node kinds:
//   human  — a dialogue turn: the human asks here. The card holds optional
//            guidance for the operator; it instantiates as an EMPTY question
//            node awaiting the human.
//   prompt — a machine processing step: a fixed prompt (plus optional role)
//            applied to whatever flows in from upstream nodes.
// Flow patterns (fan-out, review, synthesis) are drawn as graph shape, not
// node kinds. No LLM ever runs in this view. Legacy v1 kinds render as
// 'prompt' but keep their stored data for instantiation.

const KINDS: { kind: 'human' | 'prompt'; icon: typeof SquareTerminal; labelKey: string }[] = [
  { kind: 'human', icon: MessageCircleQuestion, labelKey: 'paradigm.kind.human' },
  { kind: 'prompt', icon: SquareTerminal, labelKey: 'paradigm.kind.prompt' },
];

const KIND_STYLES: Record<'human' | 'prompt', string> = {
  human: 'border-warm/70',
  prompt: 'border-accent/50',
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
  const kind: 'human' | 'prompt' = data.stepKind === 'human' ? 'human' : 'prompt';

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
                kind === k ? (k === 'human' ? 'bg-warm/15 text-warm' : 'bg-accent/10 text-accent') : 'text-ink-faint hover:bg-wash'
              }`}
            >
              <Icon size={14} strokeWidth={1.75} />
            </button>
          ))}
          <span className={`text-2xs self-center ml-1 uppercase tracking-wider font-medium ${kind === 'human' ? 'text-warm' : 'text-accent/80'}`}>
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

        {/* body: THE prompt (machine) or operator guidance (human) — one
            field; a persona is just the opening lines of the prompt */}
        <textarea
          value={data.instruction ?? ''}
          onChange={(e) => patch({ instruction: e.target.value })}
          placeholder={t(kind === 'human' ? 'paradigm.humanHintPlaceholder' : 'paradigm.promptPlaceholder')}
          rows={kind === 'human' ? 3 : 4}
          className={`w-full text-xs text-ink bg-surface border border-line rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 resize-y leading-relaxed ${
            kind === 'human' ? 'focus:ring-warm/40' : 'focus:ring-accent/40'
          }`}
        />

        {/* persona chips: prepend a template persona into the prompt */}
        {kind === 'prompt' && (
          <div className="flex flex-wrap gap-1" title={t('paradigm.insertPersona')}>
            {ROLE_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                onClick={() => patch({ instruction: `${rolePromptFor(tpl, lang)}\n${data.instruction ?? ''}` })}
                className="text-2xs bg-wash hover:bg-accent/10 hover:text-accent text-ink-muted px-1.5 py-0.5 rounded-full transition-colors"
              >
                + {lang === 'zh' ? tpl.nameZh : tpl.nameEn}
              </button>
            ))}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} id="continue" className="!bg-ink-faint !w-3 !h-3 !border-2 !border-white" />
    </div>
  );
}
