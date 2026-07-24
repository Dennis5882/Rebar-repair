import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_LANG, LANGS, STORAGE_KEY, type Dict, type LangCode, type TFn } from "./types";

interface I18nContextValue {
  lang: LangCode;
  setLang: (code: LangCode) => void;
  t: TFn;
  ready: boolean;
}

export const I18nContext = createContext<I18nContextValue | null>(null);

function isLangCode(v: string): v is LangCode {
  return LANGS.some((l) => l.code === v);
}

function detectFromBrowser(): LangCode {
  const nav = (navigator.language || "").toLowerCase();
  const exact = LANGS.find((l) => l.code.toLowerCase() === nav);
  if (exact) return exact.code;
  if (nav.startsWith("zh")) {
    return /tw|hk|hant|mo/.test(nav) ? "zh-TW" : "zh-CN";
  }
  const prefix = LANGS.find((l) => nav.startsWith(l.code.toLowerCase() + "-"));
  return prefix ? prefix.code : DEFAULT_LANG;
}

// Vercel attaches geo-IP headers to deployed requests; /api/geo-lang reads
// those to suggest a language. Unavailable in local/static serving, so this
// fails fast and the caller falls back to browser-language detection.
async function detectFromIp(): Promise<LangCode | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const res = await fetch("/api/geo-lang", { signal: controller.signal });
    const data = await res.json();
    if (data && typeof data.lang === "string" && isLangCode(data.lang)) return data.lang;
  } catch {
    /* geo lookup unavailable — caller falls back to browser language */
  } finally {
    clearTimeout(timer);
  }
  return null;
}

async function detectInitialLang(): Promise<LangCode> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && isLangCode(saved)) return saved;
  } catch {
    /* localStorage unavailable (private mode etc.) */
  }
  const byIp = await detectFromIp();
  if (byIp) return byIp;
  return detectFromBrowser();
}

const localeCache: Partial<Record<LangCode, Dict>> = {};

async function loadLocale(code: LangCode): Promise<Dict> {
  if (localeCache[code]) return localeCache[code]!;
  const res = await fetch(`/locales/${code}.json`);
  const data = (await res.json()) as Dict;
  localeCache[code] = data;
  return data;
}

const HTML_LANG_MAP: Partial<Record<LangCode, string>> = { "zh-CN": "zh-Hans", "zh-TW": "zh-Hant" };

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LangCode>(DEFAULT_LANG);
  const [dict, setDict] = useState<Dict>({});
  const [ready, setReady] = useState(false);

  const applyLang = useCallback(async (code: LangCode) => {
    const resolved = isLangCode(code) ? code : DEFAULT_LANG;
    const nextDict = await loadLocale(resolved);
    setLangState(resolved);
    setDict(nextDict);
    try {
      localStorage.setItem(STORAGE_KEY, resolved);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const initial = await detectInitialLang();
      if (cancelled) return;
      await applyLang(initial);
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.title = dict["app.title"] || document.title;
    document.documentElement.lang = HTML_LANG_MAP[lang] || lang;
  }, [dict, lang]);

  // Depends on `dict` so its identity changes when the locale finishes
  // loading (or the language switches). Consumers that memoize a translated
  // result on `t` — e.g. SectionPreview's pre-rendered SVG strings — must
  // recompute then; a stable-identity `t` (reading a ref) left those frozen
  // with raw keys (e.g. "js.svgColumnCaption") whenever the first render
  // happened before the async dictionary arrived.
  const t = useCallback<TFn>(
    (key, vars) => {
      let s = dict[key];
      if (s === undefined) s = key;
      if (vars) {
        for (const k of Object.keys(vars)) {
          const val = vars[k];
          s = s.split(`{${k}}`).join(val == null ? "" : String(val));
        }
      }
      return s;
    },
    [dict]
  );

  const value = useMemo<I18nContextValue>(
    () => ({ lang, setLang: (code) => void applyLang(code), t, ready }),
    [lang, applyLang, t, ready]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
