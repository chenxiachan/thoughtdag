import { create } from 'zustand';
import { en } from './en';
import { zh } from './zh';

// Minimal i18n: two flat dictionaries, a zustand lang store persisted to
// localStorage, and a hook that re-renders consumers on language change.
// LLM prompts are NOT translated here — they already adapt to content
// language (see store/streaming.ts and batchMergeSummarize).

export type Lang = 'en' | 'zh';
export type MessageKey = keyof typeof en;

const DICTS: Record<Lang, Record<MessageKey, string>> = { en, zh };
const LANG_KEY = 'thoughtdag.lang';

function initialLang(): Lang {
  // an explicit ?lang= (the desktop shell's --lang flag, or a shared
  // link) outranks everything and persists as the choice
  const q = new URLSearchParams(window.location.search).get('lang');
  if (q === 'en' || q === 'zh') {
    try { localStorage.setItem(LANG_KEY, q); } catch { /* private mode */ }
    return q;
  }
  const saved = localStorage.getItem(LANG_KEY);
  if (saved === 'en' || saved === 'zh') return saved;
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

interface I18nState {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

export const useI18n = create<I18nState>((set) => ({
  lang: initialLang(),
  setLang: (lang) => {
    localStorage.setItem(LANG_KEY, lang);
    set({ lang });
  },
}));

/** Reactive translator — components re-render when the language changes. */
export function useT(): (key: MessageKey) => string {
  const lang = useI18n((s) => s.lang);
  return (key) => DICTS[lang][key] ?? en[key] ?? key;
}

/** Non-reactive translator for imperative code (toasts, confirm dialogs). */
export function t(key: MessageKey): string {
  const { lang } = useI18n.getState();
  return DICTS[lang][key] ?? en[key] ?? key;
}

/** Interpolate {placeholders} in a dictionary template. */
export function fmt(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? ''));
}

/** Date/time locale that FOLLOWS THE UI LANGUAGE, not the OS locale — an
    English interface shows English-formatted dates even on a zh system.
    Reactive; components re-render on language switch. */
export function useDateLocale(): string {
  const lang = useI18n((s) => s.lang);
  return lang === 'zh' ? 'zh-CN' : 'en-US';
}
