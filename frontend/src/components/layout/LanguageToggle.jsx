import { LANGUAGES, useI18n } from "@/i18n";

/** EN | HU pill. `light` inverts it for use over dark imagery. */
export default function LanguageToggle({ light = false }) {
  const { lang, setLang, t } = useI18n();

  return (
    <div
      data-testid="lang-toggle"
      className={`flex items-center gap-1 rounded-full border p-0.5 ${
        light ? "border-cream/35" : "border-olive/30"
      }`}
    >
      {LANGUAGES.map((code) => {
        const active = lang === code;
        return (
          <button
            key={code}
            data-testid={`lang-${code}`}
            onClick={() => setLang(code)}
            aria-label={t(code === "en" ? "nav.toEnglish" : "nav.toHungarian")}
            aria-pressed={active}
            className={`rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-wide transition-all duration-300 ${
              active
                ? light
                  ? "bg-cream text-olive"
                  : "bg-olive text-cream"
                : light
                  ? "text-cream/70 hover:text-cream"
                  : "text-olive/60 hover:text-olive"
            }`}
          >
            {code.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
