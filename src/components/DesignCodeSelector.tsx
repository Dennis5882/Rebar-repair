import { useI18n } from "../i18n/useI18n";
import { useDesignCode } from "../context/DesignCodeContext";
import { DESIGN_CODE_ORDER, DESIGN_CODES, MATERIAL_DBS } from "../data/rcCodePresets";

// Drives every bar-size dropdown (BarSelect) across BEAM/COLUMN/WALL/BRACE —
// picking a country/design code here changes which rebar sizes those
// dropdowns offer everywhere in the app, not just the Guide drawer's
// read-only reference table (CodeReferenceSection reads the same context).
export function DesignCodeSelector() {
  const { t } = useI18n();
  const { designCode, setDesignCode, materialDB } = useDesignCode();

  return (
    <section className="panel">
      <h2>{t("guide.codeDesignLabel")}</h2>
      <div className="select-row">
        <div className="field">
          <label htmlFor="designCode">{t("guide.codeDesignLabel")}</label>
          <select id="designCode" value={designCode} onChange={(e) => setDesignCode(e.target.value)}>
            {DESIGN_CODE_ORDER.map((code) => (
              <option key={code} value={code}>
                {code} ({DESIGN_CODES[code]?.country})
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="hint" style={{ marginTop: 0 }}>
        {t("designCode.hint")}
        {materialDB ? ` (${MATERIAL_DBS[materialDB]?.label})` : ""}
      </div>
    </section>
  );
}
