import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useI18n } from "../i18n/useI18n";
import type { LangCode } from "../i18n/types";
import { DEFAULT_LANG } from "../i18n/types";
import { defaultMaterialDB, getBars, type RebarSize } from "../data/rcCodePresets";

interface DesignCodeContextValue {
  designCode: string;
  setDesignCode: (code: string) => void;
  materialDB: string | null;
  bars: RebarSize[];
}

const DesignCodeContext = createContext<DesignCodeContextValue | null>(null);

// Reuses the language already IP-detected in I18nProvider (see
// [[i18n-multilingual-system]] in memory) to pick a sensible starting design
// code, rather than doing a second IP lookup just for this selector.
const DEFAULT_DESIGN_CODE_BY_LANG: Record<LangCode, string> = {
  en: "ACI318-25",
  ko: "KDS 41 20 : 2022",
  "zh-CN": "GB/T50010-10",
  "zh-TW": "TWN-USD112",
};

function readSession(fallback: string): string {
  try {
    const v = sessionStorage.getItem("designCode");
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
}
function writeSession(value: string) {
  try {
    sessionStorage.setItem("designCode", value);
  } catch {
    /* ignore (private mode etc.) */
  }
}
function hasSavedSession(): boolean {
  try {
    return sessionStorage.getItem("designCode") !== null;
  } catch {
    return false;
  }
}

export function DesignCodeProvider({ children }: { children: ReactNode }) {
  const { lang } = useI18n();
  const [designCode, setDesignCodeState] = useState(() => readSession(DEFAULT_DESIGN_CODE_BY_LANG[DEFAULT_LANG]));
  // Once the user picks explicitly (or a saved session value exists), stop
  // following language changes — mirrors CodeReferenceSection's original
  // per-component version of this same rule, now shared app-wide.
  const [userChanged, setUserChanged] = useState(hasSavedSession);

  useEffect(() => {
    if (!userChanged) setDesignCodeState(DEFAULT_DESIGN_CODE_BY_LANG[lang] || "KDS 41 20 : 2022");
  }, [lang, userChanged]);

  const setDesignCode = useCallback((code: string) => {
    setUserChanged(true);
    setDesignCodeState(code);
    writeSession(code);
  }, []);

  const materialDB = useMemo(() => defaultMaterialDB(designCode), [designCode]);
  const bars = useMemo(() => (materialDB ? getBars(materialDB) : []), [materialDB]);

  const value = useMemo<DesignCodeContextValue>(
    () => ({ designCode, setDesignCode, materialDB, bars }),
    [designCode, setDesignCode, materialDB, bars]
  );

  return <DesignCodeContext.Provider value={value}>{children}</DesignCodeContext.Provider>;
}

export function useDesignCode() {
  const ctx = useContext(DesignCodeContext);
  if (!ctx) throw new Error("useDesignCode must be used within DesignCodeProvider");
  return ctx;
}
