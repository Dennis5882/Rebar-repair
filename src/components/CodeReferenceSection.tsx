import { useEffect, useState } from "react";
import { useI18n } from "../i18n/useI18n";
import type { LangCode } from "../i18n/types";
import {
  DESIGN_CODE_ORDER,
  DESIGN_CODES,
  MATERIAL_DBS,
  defaultMaterialDB,
  defaultRebarCode,
  rebarCodeOptions,
  getBars,
  getGrades,
} from "../data/rcCodePresets";

// Reuses the language already IP-detected in I18nProvider (see
// [[i18n-multilingual-system]] in memory) to pick a sensible starting design
// code, rather than doing a second IP lookup just for this selector.
const DEFAULT_DESIGN_CODE_BY_LANG: Record<LangCode, string> = {
  en: "ACI318-25",
  ko: "KDS 41 20 : 2022",
  "zh-CN": "GB/T50010-10",
  "zh-TW": "TWN-USD112",
};

export function CodeReferenceSection() {
  const { t, lang } = useI18n();
  const [designCode, setDesignCodeState] = useState(() => DEFAULT_DESIGN_CODE_BY_LANG[lang] || "KDS 41 20 : 2022");
  // `lang` starts at a default and updates asynchronously once IP/localStorage
  // detection resolves (see I18nProvider) — if this section mounts before
  // that happens, keep following lang's default until the user actually
  // picks a design code themselves.
  const [userChanged, setUserChanged] = useState(false);

  useEffect(() => {
    if (!userChanged) setDesignCodeState(DEFAULT_DESIGN_CODE_BY_LANG[lang] || "KDS 41 20 : 2022");
  }, [lang, userChanged]);

  function setDesignCode(code: string) {
    setUserChanged(true);
    setDesignCodeState(code);
  }

  const entry = DESIGN_CODES[designCode];
  const materialDB = defaultMaterialDB(designCode);
  const rebarCode = defaultRebarCode(designCode);
  const rebarOptions = materialDB ? rebarCodeOptions(materialDB) : [];
  const grades = materialDB ? getGrades(materialDB) : [];
  const bars = materialDB ? getBars(materialDB) : [];
  const hasIn = bars.some((b) => b.nominal_in != null);
  const hasXref = bars.some((b) => b.xref != null);

  return (
    <>
      <div className="field">
        <label htmlFor="guideDesignCode">{t("guide.codeDesignLabel")}</label>
        <select id="guideDesignCode" value={designCode} onChange={(e) => setDesignCode(e.target.value)}>
          {DESIGN_CODE_ORDER.map((code) => (
            <option key={code} value={code}>
              {code} ({DESIGN_CODES[code]?.country})
            </option>
          ))}
        </select>
      </div>

      {entry?.confirm && (
        <div className="hint" style={{ marginTop: 0, color: "var(--critical)" }}>
          {t("guide.codeConfirmWarning")}
        </div>
      )}

      {materialDB && (
        <>
          <div className="hint" style={{ marginTop: 0 }}>
            {t("guide.codeMaterialLabel")}: {MATERIAL_DBS[materialDB].label}
          </div>
          <div className="hint" style={{ marginTop: -6 }}>
            {t("guide.codeRebarLabel")}: {rebarOptions.join(" / ")}
            {rebarCode ? ` (${t("guide.codeDefaultBadge")}: ${rebarCode})` : ""}
          </div>
          <div className="hint" style={{ marginTop: -6, marginBottom: 8 }}>
            {t("guide.codeGradesLabel")}: {grades.join(", ")}
          </div>

          <table className="summary-table">
            <thead>
              <tr>
                <th>{t("guide.codeBarsHeaderLabel")}</th>
                <th>{t("guide.codeBarsHeaderMm")}</th>
                {hasIn && <th>{t("guide.codeBarsHeaderIn")}</th>}
                {hasXref && <th>{t("guide.codeBarsHeaderXref")}</th>}
              </tr>
            </thead>
            <tbody>
              {bars.map((b) => (
                <tr key={b.label}>
                  <td>{b.label}</td>
                  <td>{b.nominal_mm}</td>
                  {hasIn && <td>{b.nominal_in ?? ""}</td>}
                  {hasXref && <td>{b.xref ?? ""}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
