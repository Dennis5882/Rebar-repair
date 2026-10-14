import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useI18n } from "../i18n/useI18n";
import type { LangCode } from "../i18n/types";
import { DEFAULT_LANG } from "../i18n/types";
import { defaultMaterialDB, getBars, isOverride as isOverrideFn, type RebarSize } from "../data/rcCodePresets";
import type { GbSystem, SeismicGrade } from "../lib/gbSeismic";

interface DesignCodeContextValue {
  designCode: string;
  setDesignCode: (code: string) => void;
  materialDB: string;
  setMaterialDB: (db: string) => void;
  // True once materialDB has been pointed away from designCode's own
  // default — e.g. a Eurocode design using Korean (KS D 3504) rebar, a real
  // combination in practice, not just a hypothetical.
  isOverride: boolean;
  bars: RebarSize[];
  // GB only: 抗震等级 (0 = non-seismic, the default — nothing changes) and the
  // structure type row of GB 50011 表6.3.6. Gen NX doesn't expose either over
  // the API (live 2026-10-13), so the user picks them here.
  gbGrade: 0 | SeismicGrade;
  setGbGrade: (g: 0 | SeismicGrade) => void;
  gbSystem: GbSystem;
  setGbSystem: (s: GbSystem) => void;
  // TWN only: 特殊抗彎矩構架 (112年版 18.3) beam rules on/off. Gen NX has no API
  // field for it (same as GB's 抗震等级), so the user picks it here.
  twSmf: boolean;
  setTwSmf: (v: boolean) => void;
  // Unit the board's material strength inputs (fck / fy / fyt) are typed and
  // shown in. The boards still compute in MPa; "kgf/cm2" (Taiwan drawings) is a
  // display/input conversion with the code's own ×10 pairing (280 ↔ 28 MPa).
  stressUnit: "MPa" | "kgf/cm2";
  setStressUnit: (u: "MPa" | "kgf/cm2") => void;
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

function readSession(field: string, fallback: string): string {
  try {
    const v = sessionStorage.getItem("dcode_" + field);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
}
function writeSession(field: string, value: string) {
  try {
    sessionStorage.setItem("dcode_" + field, value);
  } catch {
    /* ignore (private mode etc.) */
  }
}
function hasSavedSession(field: string): boolean {
  try {
    return sessionStorage.getItem("dcode_" + field) !== null;
  } catch {
    return false;
  }
}

export function DesignCodeProvider({ children }: { children: ReactNode }) {
  const { lang } = useI18n();
  const [designCode, setDesignCodeState] = useState(() => readSession("designCode", DEFAULT_DESIGN_CODE_BY_LANG[DEFAULT_LANG]));
  const [materialDB, setMaterialDBState] = useState(
    () => readSession("materialDB", defaultMaterialDB(readSession("designCode", DEFAULT_DESIGN_CODE_BY_LANG[DEFAULT_LANG])) || "")
  );
  // Once the user picks a design code explicitly (or a saved session value
  // exists), stop following language changes for its default.
  const [userChangedCode, setUserChangedCode] = useState(() => hasSavedSession("designCode"));

  useEffect(() => {
    if (userChangedCode) return;
    const next = DEFAULT_DESIGN_CODE_BY_LANG[lang] || "KDS 41 20 : 2022";
    setDesignCodeState((prevCode) => {
      // Same "follow only if not customized" rule as setDesignCode below —
      // this only runs pre-first-interaction, but a user could still have
      // touched materialDB alone before IP detection resolves.
      setMaterialDBState((prevDB) => {
        if (prevDB !== defaultMaterialDB(prevCode)) return prevDB;
        return defaultMaterialDB(next) || prevDB;
      });
      return next;
    });
  }, [lang, userChangedCode]);

  // Mirrors ConnContext's product->baseUrl relationship: switching design
  // code follows materialDB to the new default UNLESS the user already
  // overrode it away from the *previous* code's default.
  const setDesignCode = useCallback((code: string) => {
    setUserChangedCode(true);
    setDesignCodeState((prevCode) => {
      setMaterialDBState((prevDB) => {
        if (prevDB !== defaultMaterialDB(prevCode)) return prevDB;
        const nextDefault = defaultMaterialDB(code);
        if (!nextDefault) return prevDB;
        writeSession("materialDB", nextDefault);
        return nextDefault;
      });
      writeSession("designCode", code);
      return code;
    });
  }, []);

  const setMaterialDB = useCallback((db: string) => {
    setMaterialDBState(db);
    writeSession("materialDB", db);
  }, []);

  const [gbGrade, setGbGradeState] = useState<0 | SeismicGrade>(() => {
    const g = Number(readSession("gbGrade", "0"));
    return g >= 1 && g <= 4 ? (g as SeismicGrade) : 0;
  });
  const [gbSystem, setGbSystemState] = useState<GbSystem>(() => {
    const s = readSession("gbSystem", "frame");
    return s === "dual" || s === "frameSupported" ? s : "frame";
  });
  const setGbGrade = useCallback((g: 0 | SeismicGrade) => {
    setGbGradeState(g);
    writeSession("gbGrade", String(g));
  }, []);
  const setGbSystem = useCallback((s: GbSystem) => {
    setGbSystemState(s);
    writeSession("gbSystem", s);
  }, []);

  const [twSmf, setTwSmfState] = useState<boolean>(() => readSession("twSmf", "0") === "1");
  const setTwSmf = useCallback((v: boolean) => {
    setTwSmfState(v);
    writeSession("twSmf", v ? "1" : "0");
  }, []);

  const [stressUnit, setStressUnitState] = useState<"MPa" | "kgf/cm2">(() => (readSession("stressUnit", "") === "kgf/cm2" ? "kgf/cm2" : "MPa"));
  const setStressUnit = useCallback((u: "MPa" | "kgf/cm2") => {
    setStressUnitState(u);
    writeSession("stressUnit", u);
  }, []);

  const bars = useMemo(() => (materialDB ? getBars(materialDB) : []), [materialDB]);
  const overridden = useMemo(() => isOverrideFn(designCode, materialDB), [designCode, materialDB]);

  const value = useMemo<DesignCodeContextValue>(
    () => ({ designCode, setDesignCode, materialDB, setMaterialDB, isOverride: overridden, bars, gbGrade, setGbGrade, gbSystem, setGbSystem, twSmf, setTwSmf, stressUnit, setStressUnit }),
    [designCode, setDesignCode, materialDB, setMaterialDB, overridden, bars, gbGrade, setGbGrade, gbSystem, setGbSystem, twSmf, setTwSmf, stressUnit, setStressUnit]
  );

  return <DesignCodeContext.Provider value={value}>{children}</DesignCodeContext.Provider>;
}

export function useDesignCode() {
  const ctx = useContext(DesignCodeContext);
  if (!ctx) throw new Error("useDesignCode must be used within DesignCodeProvider");
  return ctx;
}
