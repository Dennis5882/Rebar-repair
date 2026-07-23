import { useI18n } from "../i18n/useI18n";
import { useDesignCode } from "../context/DesignCodeContext";
import {
  DESIGN_CODE_ORDER,
  DESIGN_CODES,
  MATERIAL_DBS,
  defaultRebarCode,
  rebarCodeOptions,
  getGrades,
  isVerified,
} from "../data/rcCodePresets";

// Shares the same selection (and the same rebar-size data) as every
// BarSelect dropdown in the BEAM/COLUMN/WALL/BRACE edit forms — see
// DesignCodeContext. This section is just a read-only detail view of it.
export function CodeReferenceSection() {
  const { t } = useI18n();
  const { designCode, setDesignCode, materialDB, bars } = useDesignCode();

  const entry = DESIGN_CODES[designCode];
  const rebarCode = defaultRebarCode(designCode);
  const rebarOptions = materialDB ? rebarCodeOptions(materialDB) : [];
  const grades = materialDB ? getGrades(materialDB) : [];
  const hasIn = bars.some((b) => b.nominal_in != null);
  const hasXref = bars.some((b) => b.xref != null);

  return (
    <>
      <div className="field">
        <label htmlFor="guideDesignCode">{t("guide.codeDesignLabel")}</label>
        <select id="guideDesignCode" value={designCode} onChange={(e) => setDesignCode(e.target.value)}>
          {DESIGN_CODE_ORDER.map((code) => (
            <option key={code} value={code}>
              {code} {DESIGN_CODES[code]?.country ? `(${t(`country.${DESIGN_CODES[code]!.country}`)})` : ""}
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
            {t("guide.codeMaterialLabel")}: {MATERIAL_DBS[materialDB].label} ({t(`country.${MATERIAL_DBS[materialDB].country}`)}){" "}
            <span className={"badge " + (isVerified(materialDB) ? "verified" : "unverified")}>
              {isVerified(materialDB) ? t("designCode.verifiedBadge") : t("designCode.unverifiedBadge")}
            </span>
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
