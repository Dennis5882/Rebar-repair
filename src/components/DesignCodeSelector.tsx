import { useI18n } from "../i18n/useI18n";
import { useDesignCode } from "../context/DesignCodeContext";
import { DESIGN_CODE_ORDER, DESIGN_CODES, MATERIAL_DBS, defaultMaterialDB, isVerified } from "../data/rcCodePresets";

const MATERIAL_DB_KEYS = Object.keys(MATERIAL_DBS);

// Drives every bar-size dropdown (BarSelect) across BEAM/COLUMN/WALL/BRACE —
// picking a country/design code here changes which rebar sizes those
// dropdowns offer everywhere in the app, not just the Guide drawer's
// read-only reference table (CodeReferenceSection reads the same context).
//
// Design code and rebar material standard are independent choices: a
// Eurocode design commonly defaults to EN 10080 rebar, but a project may
// still specify Korean (KS D 3504) rebar under that same design code — so
// the material dropdown here can be overridden away from its default.
export function DesignCodeSelector() {
  const { t } = useI18n();
  const { designCode, setDesignCode, materialDB, setMaterialDB, isOverride } = useDesignCode();

  return (
    <section className="panel">
      <h2>{t("guide.codeDesignLabel")}</h2>
      <div className="row2">
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
        <div className="field">
          <label htmlFor="materialDB">
            {t("guide.codeMaterialLabel")}{" "}
            <span className={"badge " + (isVerified(materialDB) ? "verified" : "unverified")}>
              {isVerified(materialDB) ? t("designCode.verifiedBadge") : t("designCode.unverifiedBadge")}
            </span>
          </label>
          <select id="materialDB" value={materialDB} onChange={(e) => setMaterialDB(e.target.value)}>
            {MATERIAL_DB_KEYS.map((key) => (
              <option key={key} value={key}>
                {MATERIAL_DBS[key].label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {isOverride ? (
        <div className="hint" style={{ marginTop: 0 }}>
          {t("designCode.overrideHint")}{" "}
          <button
            type="button"
            className="btn"
            style={{ padding: "2px 8px", fontSize: 11 }}
            onClick={() => setMaterialDB(defaultMaterialDB(designCode) || materialDB)}
          >
            {t("designCode.resetBtn")}
          </button>
        </div>
      ) : (
        <div className="hint" style={{ marginTop: 0 }}>
          {t("designCode.hint")}
        </div>
      )}
    </section>
  );
}
