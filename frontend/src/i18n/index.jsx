import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import en from "@/i18n/en";
import hu from "@/i18n/hu";

const DICTIONARIES = { en, hu };
export const LANGUAGES = Object.keys(DICTIONARIES);
export const DEFAULT_LANGUAGE = "hu"; // the café is in Budapest
const STORAGE_KEY = "bros-lang";

const I18nContext = createContext(null);

function readStoredLanguage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return LANGUAGES.includes(stored) ? stored : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

/** Walk a dotted path: resolve("home.about.title") -> the string. */
function resolve(dictionary, path) {
  return path.split(".").reduce((node, key) => (node == null ? undefined : node[key]), dictionary);
}

function interpolate(value, vars) {
  if (!vars || typeof value !== "string") return value;
  return Object.entries(vars).reduce(
    (out, [key, replacement]) => out.split(`{${key}}`).join(String(replacement)),
    value,
  );
}

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(readStoredLanguage);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* private browsing — the choice just won't persist */
    }
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next) => {
    if (LANGUAGES.includes(next)) setLangState(next);
  }, []);

  /**
   * Look up a dotted path. Falls back to English, then to the path itself, so a
   * missing key shows up in the UI instead of crashing the page.
   * Arrays and objects come back as-is for callers that map over them.
   */
  const t = useCallback(
    (path, vars) => {
      const hit = resolve(DICTIONARIES[lang], path) ?? resolve(en, path);
      if (hit === undefined) {
        if (process.env.NODE_ENV !== "production") {
          console.warn(`[i18n] missing key: ${path}`);
        }
        return path;
      }
      return interpolate(hit, vars);
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t, isHungarian: lang === "hu" }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside <I18nProvider>");
  return context;
}
