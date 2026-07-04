import { useI18n } from '../../i18n';

// Compact EN/中 toggle used on the canvas toolbar and the landing page.
export default function LangSwitch() {
  const lang = useI18n((s) => s.lang);
  const setLang = useI18n((s) => s.setLang);

  return (
    <div className="flex items-center bg-card/90 backdrop-blur border border-line rounded-lg shadow-sm overflow-hidden">
      {(['en', 'zh'] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          className={`px-2 h-8 text-2xs font-medium transition-colors ${
            lang === l ? 'bg-accent text-white' : 'text-ink-muted hover:bg-wash'
          }`}
        >
          {l === 'en' ? 'EN' : '中'}
        </button>
      ))}
    </div>
  );
}
