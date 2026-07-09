import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, Split, X } from 'lucide-react';
import { useStore } from '../store';
import { ROLE_TEMPLATES, rolePromptFor } from '../lib/role-templates';
import { useI18n, useT, fmt } from '../i18n';

// Perspectives dialog: N roles, ONE mechanism, two run policies.
//   once   → each role answers the question once, blind to its siblings
//            (the rule-in/rule-out candidate pool)
//   follow → each role becomes a reviewer on a sliding watch edge that
//            auto-reruns whenever the thread grows (the old "attach
//            evaluator" is exactly this with N=1)
// Roles come from the template library (toggle chips) and/or free-form
// lines ("Name: prompt"). Used from the panel and from fan-out
// placeholder nodes instantiated out of paradigms.
export default function FanOutModal({
  parentId,
  initialQuestion,
  initialRoles,
  onClose,
}: {
  parentId: string;
  initialQuestion: string;
  initialRoles?: { name: string; prompt: string }[];
  onClose: () => void;
}) {
  const fanOut = useStore((s) => s.fanOut);
  const t = useT();
  const lang = useI18n((s) => s.lang);
  const [mode, setMode] = useState<'once' | 'follow'>('once');
  const [question, setQuestion] = useState(initialQuestion);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [customText, setCustomText] = useState(
    (initialRoles ?? []).map((r) => `${r.name}: ${r.prompt}`).join('\n')
  );

  const switchMode = (m: 'once' | 'follow') => {
    setMode(m);
    // Each mode has its natural task: the shared question vs a standing critique
    setQuestion(m === 'follow' ? t('fanout.critiqueInstruction') : initialQuestion);
  };

  const customRoles = customText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf(':');
      return idx > 0
        ? { name: line.slice(0, idx).trim(), prompt: line.slice(idx + 1).trim() }
        : { name: line.slice(0, 24), prompt: line };
    });

  const templateRoles = ROLE_TEMPLATES.filter((tpl) => picked.has(tpl.id)).map((tpl) => ({
    name: lang === 'zh' ? tpl.nameZh : tpl.nameEn,
    prompt: rolePromptFor(tpl, lang),
  }));

  const roles = [...templateRoles, ...customRoles];

  const run = () => {
    if (!question.trim() || roles.length === 0) return;
    void fanOut(parentId, question.trim(), roles, { follow: mode === 'follow' });
    onClose();
  };

  return createPortal((
    <div className="fixed inset-0 z-50 bg-ink/30 backdrop-blur-sm flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-card border border-line rounded-2xl shadow-2xl w-full max-w-lg flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-line flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-ink flex items-center gap-2">
              <Split size={16} strokeWidth={1.75} className="text-warm" /> {t('fanout.title')}
            </h2>
            <p className="text-xs text-ink-muted mt-1 leading-relaxed">{t('fanout.subtitle')}</p>
          </div>
          <button onClick={onClose} className="text-ink-faint hover:text-ink transition-colors shrink-0 mt-0.5">
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4 overflow-y-auto">
          {/* Run policy: answer once (candidates) vs keep reviewing (watchers) */}
          <div>
            <div className="flex gap-1.5">
              {([
                { m: 'once' as const, icon: <Split size={14} strokeWidth={1.75} />, label: t('fanout.modeOnce') },
                { m: 'follow' as const, icon: <Eye size={14} strokeWidth={1.75} />, label: t('fanout.modeFollow') },
              ]).map(({ m, icon, label }) => (
                <button
                  key={m}
                  onClick={() => switchMode(m)}
                  className={`text-xs px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 ${
                    mode === m
                      ? (m === 'follow' ? 'bg-watch/10 text-watch font-medium ring-1 ring-watch/30' : 'bg-warm/15 text-warm font-medium ring-1 ring-warm/30')
                      : 'bg-wash text-ink-muted hover:bg-line'
                  }`}
                >
                  {icon} {label}
                </button>
              ))}
            </div>
            <p className="text-2xs text-ink-faint mt-1.5 leading-relaxed">
              {mode === 'once' ? t('fanout.modeOnceHint') : t('fanout.modeFollowHint')}
            </p>
          </div>

          <div>
            <label className="text-2xs text-ink-faint uppercase tracking-wider font-medium block mb-1.5">{t(mode === 'follow' ? 'fanout.instruction' : 'fanout.question')}</label>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={2}
              className="w-full text-sm border border-line rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent bg-surface resize-none leading-relaxed"
            />
          </div>

          <div>
            <label className="text-2xs text-ink-faint uppercase tracking-wider font-medium block mb-1.5">{t('fanout.templates')}</label>
            <div className="flex flex-wrap gap-1.5">
              {ROLE_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => setPicked((prev) => {
                    const next = new Set(prev);
                    if (next.has(tpl.id)) next.delete(tpl.id);
                    else next.add(tpl.id);
                    return next;
                  })}
                  className={`text-2xs px-2.5 py-1.5 rounded-full transition-colors ${
                    picked.has(tpl.id) ? 'bg-warm/15 text-warm font-medium' : 'bg-wash hover:bg-line text-ink-muted'
                  }`}
                >
                  {lang === 'zh' ? tpl.nameZh : tpl.nameEn}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-2xs text-ink-faint uppercase tracking-wider font-medium block mb-1.5">{t('fanout.custom')}</label>
            <textarea
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              rows={4}
              placeholder={t('fanout.customPlaceholder')}
              className="w-full text-xs border border-line rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent bg-surface resize-y leading-relaxed font-mono"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-line flex justify-end gap-2">
          <button onClick={onClose} className="text-xs text-ink-muted hover:text-ink px-4 py-2 rounded-lg hover:bg-wash transition-colors">
            {t('common.cancel')}
          </button>
          <button
            onClick={run}
            disabled={!question.trim() || roles.length === 0}
            className={`text-xs text-white px-5 py-2 rounded-lg transition-colors disabled:opacity-30 ${
              mode === 'follow' ? 'bg-watch/90 hover:bg-watch' : 'bg-warm hover:bg-warm/90'
            }`}
          >
            {fmt(t(mode === 'follow' ? 'fanout.confirmFollow' : 'fanout.confirm'), { n: roles.length })}
          </button>
        </div>
      </div>
    </div>
  ), document.body);
}
