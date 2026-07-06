import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Split, X } from 'lucide-react';
import { useStore } from '../store';
import { ROLE_TEMPLATES, rolePromptFor } from '../lib/role-templates';
import { useI18n, useT, fmt } from '../i18n';

// Fan-out dialog: one question, N context-isolated role branches.
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
  const [question, setQuestion] = useState(initialQuestion);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [customText, setCustomText] = useState(
    (initialRoles ?? []).map((r) => `${r.name}: ${r.prompt}`).join('\n')
  );

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
    void fanOut(parentId, question.trim(), roles);
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
          <div>
            <label className="text-2xs text-ink-faint uppercase tracking-wider font-medium block mb-1.5">{t('fanout.question')}</label>
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
            className="text-xs bg-warm hover:bg-warm/90 text-white px-5 py-2 rounded-lg transition-colors disabled:opacity-30"
          >
            {fmt(t('fanout.confirm'), { n: roles.length })}
          </button>
        </div>
      </div>
    </div>
  ), document.body);
}
