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
