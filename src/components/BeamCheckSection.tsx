import { useMemo, useState } from "react";
import { useI18n } from "../i18n/useI18n";
import { useDesignCode } from "../context/DesignCodeContext";
import { SECTORS, type SectorKey } from "../types/rebar";
import { toModelDiameter } from "../data/rcCodePresets";
import { barArea_mm2, flexuralCapacity, formulaFamily, shearCapacity } from "../lib/rcBeamCheck";
import type { SectorFormValues } from "./BeamForm";

interface DemandInputs {
  muNeg: string;
  muPos: string;
  vu: string;
}
const EMPTY_DEMAND: DemandInputs = { muNeg: "", muPos: "", vu: "" };

const UNIT_TO_MM: Record<string, number> = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 };
function toMm(value: number, unit: string): number {
  return value * (UNIT_TO_MM[unit] || 1);
}
function num(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function RatioBadge({ demand, capacity }: { demand: number; capacity: number }) {
  if (!(demand > 0) || !(capacity > 0)) return null;
  const ratio = demand / capacity;
  return <span className={"badge " + (ratio <= 1 ? "ratio-ok" : "ratio-ng")}>{ratio.toFixed(3)}</span>;
}

interface Props {
  sectors: Record<SectorKey, SectorFormValues>;
  dimB: string;
  dimH: string;
  dt: string;
  db: string;
  lengthUnit: string;
}

export function BeamCheckSection({ sectors, dimB, dimH, dt, db, lengthUnit }: Props) {
  const { t } = useI18n();
  const { designCode, materialDB } = useDesignCode();
  const [fck, setFck] = useState("24");
  const [fy, setFy] = useState("400");
  const [fyt, setFyt] = useState("400");
  const [demand, setDemand] = useState<Record<SectorKey, DemandInputs>>({ I: { ...EMPTY_DEMAND }, M: { ...EMPTY_DEMAND }, J: { ...EMPTY_DEMAND } });

  const family = formulaFamily(designCode);

  const b_mm = num(dimB);
  const h_mm = num(dimH);
  const dt_mm = toMm(num(dt), lengthUnit);
  const db_mm = toMm(num(db), lengthUnit);
  const fckN = num(fck);
  const fyN = num(fy);
  const fytN = num(fyt);

  const results = useMemo(() => {
    if (!family) return null;
    const out: Record<SectorKey, { neg: ReturnType<typeof flexuralCapacity>; pos: ReturnType<typeof flexuralCapacity>; shear: ReturnType<typeof shearCapacity> }> = {} as any;
    for (const key of SECTORS) {
      const s = sectors[key];
      const dNeg = h_mm - dt_mm; // top bars resist negative (hogging) moment
      const dPos = h_mm - db_mm; // bottom bars resist positive (sagging) moment

      const topDia = toModelDiameter(materialDB, s.topName, "mm");
      const asTop = topDia && s.topNum ? barArea_mm2(topDia) * num(s.topNum) : 0;
      const neg = asTop > 0 ? flexuralCapacity(family, fckN, fyN, b_mm, dNeg, asTop) : null;

      const botDia = toModelDiameter(materialDB, s.botName, "mm");
      const asBot = botDia && s.botNum ? barArea_mm2(botDia) * num(s.botNum) : 0;
      const pos = asBot > 0 ? flexuralCapacity(family, fckN, fyN, b_mm, dPos, asBot) : null;

      const shearDia = toModelDiameter(materialDB, s.shearName, "mm");
      const av = shearDia && s.shearLeg ? barArea_mm2(shearDia) * num(s.shearLeg) : 0;
      const dShear = Math.max(dNeg, dPos) || h_mm;
      const shear = shearCapacity(family, fckN, fytN, b_mm, dShear, av, num(s.shearDist));

      out[key] = { neg, pos, shear };
    }
    return out;
  }, [family, sectors, b_mm, h_mm, dt_mm, db_mm, fckN, fyN, fytN, materialDB]);

  function setDemandField(key: SectorKey, field: keyof DemandInputs, value: string) {
    setDemand((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  }

  return (
    <div className="subhead-block">
      <div className="subhead">{t("beam.checkTitle")}</div>
      <div className="hint" style={{ margin: "0 0 8px" }}>
        {t("beam.checkHint")}
      </div>
      {!family ? (
        <div className="hint" style={{ margin: 0 }}>
          {t("beam.checkUnsupported")}
        </div>
      ) : (
        <>
          <div className="row3">
            <div className="field">
              <label htmlFor="BEAM-check-fck">{t("beam.fck")}</label>
              <input id="BEAM-check-fck" type="number" step="any" value={fck} onChange={(e) => setFck(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="BEAM-check-fy">{t("beam.fy")}</label>
              <input id="BEAM-check-fy" type="number" step="any" value={fy} onChange={(e) => setFy(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="BEAM-check-fyt">{t("beam.fyt")}</label>
              <input id="BEAM-check-fyt" type="number" step="any" value={fyt} onChange={(e) => setFyt(e.target.value)} />
            </div>
          </div>
          {SECTORS.map((key) => {
            const r = results?.[key];
            return (
              <div key={key} style={{ marginTop: 10 }}>
                <div className="subhead" style={{ fontSize: 12 }}>
                  {t(`js.sectorTitle.${key}`)}
                </div>
                <div className="row3">
                  <div className="field">
                    <label>{t("beam.checkNeg")}{r?.neg ? `: ${r.neg.phiMn_kNm.toFixed(2)} kN·m` : " —"}</label>
                    <div className="btn-row" style={{ marginTop: 0 }}>
                      <input
                        type="number"
                        step="any"
                        placeholder={t("beam.muInput")}
                        value={demand[key].muNeg}
                        onChange={(e) => setDemandField(key, "muNeg", e.target.value)}
                      />
                      {r?.neg && <RatioBadge demand={num(demand[key].muNeg)} capacity={r.neg.phiMn_kNm} />}
                    </div>
                  </div>
                  <div className="field">
                    <label>{t("beam.checkPos")}{r?.pos ? `: ${r.pos.phiMn_kNm.toFixed(2)} kN·m` : " —"}</label>
                    <div className="btn-row" style={{ marginTop: 0 }}>
                      <input
                        type="number"
                        step="any"
                        placeholder={t("beam.muInput")}
                        value={demand[key].muPos}
                        onChange={(e) => setDemandField(key, "muPos", e.target.value)}
                      />
                      {r?.pos && <RatioBadge demand={num(demand[key].muPos)} capacity={r.pos.phiMn_kNm} />}
                    </div>
                  </div>
                  <div className="field">
                    <label>{t("beam.checkShear")}{r?.shear ? `: ${r.shear.phiVn_kN.toFixed(2)} kN` : " —"}</label>
                    <div className="btn-row" style={{ marginTop: 0 }}>
                      <input
                        type="number"
                        step="any"
                        placeholder={t("beam.vuInput")}
                        value={demand[key].vu}
                        onChange={(e) => setDemandField(key, "vu", e.target.value)}
                      />
                      {r?.shear && <RatioBadge demand={num(demand[key].vu)} capacity={r.shear.phiVn_kN} />}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
