import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n/useI18n";
import { useConn } from "../context/ConnContext";
import { useDesignCode } from "../context/DesignCodeContext";
import { SECTORS, type SectorKey } from "../types/rebar";
import { MM_PER_UNIT, toModelDiameter } from "../data/rcCodePresets";
import { barArea_mm2, flexuralCapacity, formulaFamily, shearCapacity } from "../lib/rcBeamCheck";
import { getBeamDesignResult, type BeamDemandPoint } from "../lib/api";
import { beamResultStatusClass, beamResultStatusText, type BeamResultStatus } from "../lib/statusMsg";
import type { SectorFormValues } from "./BeamForm";

interface DemandInputs {
  muNeg: string;
  muPos: string;
  vu: string;
}
const EMPTY_DEMAND: DemandInputs = { muNeg: "", muPos: "", vu: "" };
function emptyDemandBySector(): Record<SectorKey, DemandInputs> {
  return Object.fromEntries(SECTORS.map((k) => [k, { ...EMPTY_DEMAND }])) as Record<SectorKey, DemandInputs>;
}

// NaN (not a silent 1:1 passthrough) when the unit isn't a recognized one —
// letting an unconverted value through as "probably already mm" is exactly
// how this used to silently understate/overstate cover and stirrup spacing.
// NaN propagates through the capacity formulas' own `d > 0`/`s > 0` guards
// in rcBeamCheck.ts, so an unknown unit degrades to "no result" rather than
// a wrong-but-plausible number.
function toMm(value: number, unit: string): number {
  const perUnit = MM_PER_UNIT[unit];
  return perUnit ? value * perUnit : NaN;
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

type SectorResult = {
  neg: ReturnType<typeof flexuralCapacity>;
  pos: ReturnType<typeof flexuralCapacity>;
  shear: ReturnType<typeof shearCapacity>;
};

// Drives the three structurally-identical row-groups (input row / capacity
// row / ratio row) in the check table below — was three ~30-line copies
// differing only in these fields.
const CHECK_ROWS: {
  demandField: keyof DemandInputs;
  rowLabelKey: string;
  capLabelKey: string;
  getCap: (r: SectorResult) => { value: number; unit: string } | null;
}[] = [
  { demandField: "muNeg", rowLabelKey: "beam.muNegRow", capLabelKey: "beam.checkNeg", getCap: (r) => (r.neg ? { value: r.neg.phiMn_kNm, unit: "kN·m" } : null) },
  { demandField: "muPos", rowLabelKey: "beam.muPosRow", capLabelKey: "beam.checkPos", getCap: (r) => (r.pos ? { value: r.pos.phiMn_kNm, unit: "kN·m" } : null) },
  { demandField: "vu", rowLabelKey: "beam.vuRow", capLabelKey: "beam.checkShear", getCap: (r) => (r.shear ? { value: r.shear.phiVn_kN, unit: "kN" } : null) },
];

interface Props {
  // Identifies which beam is currently loaded (e.g. the selected existing-
  // member key) — used only to reset manually-typed Mu/Vu demand when the
  // user switches beams, so a leftover demand value from the PREVIOUS beam
  // is never silently compared against the newly loaded one's capacity.
  memberKey: string;
  sectors: Record<SectorKey, SectorFormValues>;
  dimB: string;
  dimH: string;
  dt: string;
  db: string;
  lengthUnit: string;
}

export function BeamCheckSection({ memberKey, sectors, dimB, dimH, dt, db, lengthUnit }: Props) {
  const { t } = useI18n();
  const { payload: conn } = useConn();
  const { designCode, materialDB } = useDesignCode();
  const [fck, setFck] = useState("24");
  const [fy, setFy] = useState("400");
  const [fyt, setFyt] = useState("400");
  const [demand, setDemand] = useState<Record<SectorKey, DemandInputs>>(emptyDemandBySector);
  const [fetching, setFetching] = useState(false);
  const [fetchStatus, setFetchStatus] = useState<BeamResultStatus | null>(null);

  // Always holds the LATEST memberKey/conn props, kept current every render
  // (not just on change) — handleFetchResult reads it after its await to
  // check whether the beam/connection it was fetching for is still the one
  // on screen. Without this, switching beams (or reconnecting to a
  // different Gen NX session) while a fetch is still pending would let a
  // stale response silently overwrite whatever beam/model is now displayed.
  const currentRef = useRef({ memberKey, conn });
  currentRef.current = { memberKey, conn };

  useEffect(() => {
    setDemand(emptyDemandBySector());
    setFetchStatus(null);
    setFetching(false);
  }, [memberKey, conn]);

  async function handleFetchResult() {
    const requestedKey = memberKey;
    const requestedConn = conn;
    const isStale = () => currentRef.current.memberKey !== requestedKey || currentRef.current.conn !== requestedConn;

    setFetching(true);
    setFetchStatus({ kind: "fetching" });
    try {
      const res = await getBeamDesignResult(memberKey, conn);
      if (isStale()) return;
      if (!res.ok) {
        setFetchStatus({ kind: "fetchFail", res });
        return;
      }
      const entries = Object.entries(res.bySector) as [SectorKey, BeamDemandPoint][];
      if (!entries.length) {
        setFetchStatus({ kind: "fetchEmpty" });
        return;
      }
      setDemand((prev) => {
        const next = { ...prev };
        for (const [key, point] of entries) {
          next[key] = {
            muNeg: point.muNeg != null ? String(point.muNeg) : prev[key].muNeg,
            muPos: point.muPos != null ? String(point.muPos) : prev[key].muPos,
            vu: point.vu != null ? String(point.vu) : prev[key].vu,
          };
        }
        return next;
      });
      setFetchStatus({ kind: "fetchOk", count: entries.length });
    } catch (e) {
      if (isStale()) return;
      setFetchStatus({ kind: "fetchError", error: String(e) });
    } finally {
      if (!isStale()) setFetching(false);
    }
  }

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
    const out: Record<SectorKey, SectorResult> = {} as any;
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
      const shear = shearCapacity(family, fckN, fytN, b_mm, dShear, av, toMm(num(s.shearDist), lengthUnit));

      out[key] = { neg, pos, shear };
    }
    return out;
  }, [family, sectors, b_mm, h_mm, dt_mm, db_mm, fckN, fyN, fytN, materialDB, lengthUnit]);

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
          <div className="btn-row" style={{ marginTop: 0 }}>
            <button className="btn" type="button" onClick={handleFetchResult} disabled={!memberKey || fetching}>
              {t("beam.fetchResultBtn")}
            </button>
          </div>
          <div className="hint" style={{ margin: "0 0 8px" }}>
            {t("beam.fetchHint")}
          </div>
          {fetchStatus && (fetchStatus.kind === "fetching" || fetchStatus.kind === "fetchEmpty") && (
            <div className="hint" style={{ margin: "0 0 8px" }}>
              {beamResultStatusText(t, fetchStatus)}
            </div>
          )}
          {fetchStatus && fetchStatus.kind !== "fetching" && fetchStatus.kind !== "fetchEmpty" && (
            <div className={"status show " + beamResultStatusClass(fetchStatus)} style={{ margin: "0 0 8px" }}>
              {beamResultStatusText(t, fetchStatus)}
            </div>
          )}
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
          <div style={{ overflowX: "auto" }}>
            <table className="summary-table check-table">
              <thead>
                <tr>
                  <th></th>
                  {SECTORS.map((key) => (
                    <th key={key}>{t(`js.sectorTitle.${key}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CHECK_ROWS.map((rowDef) => (
                  <Fragment key={rowDef.demandField}>
                    <tr className="check-group-start">
                      <td>{t(rowDef.rowLabelKey)}</td>
                      {SECTORS.map((key) => (
                        <td key={key}>
                          <input
                            type="number"
                            step="any"
                            value={demand[key][rowDef.demandField]}
                            onChange={(e) => setDemandField(key, rowDef.demandField, e.target.value)}
                          />
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="check-subrow">{t(rowDef.capLabelKey)}</td>
                      {SECTORS.map((key) => {
                        const cap = results?.[key] ? rowDef.getCap(results[key]) : null;
                        return (
                          <td key={key} className="check-subrow">
                            {cap ? `${cap.value.toFixed(2)} ${cap.unit}` : "—"}
                          </td>
                        );
                      })}
                    </tr>
                    <tr>
                      <td className="check-subrow">{t("beam.ratioRow")}</td>
                      {SECTORS.map((key) => {
                        const cap = results?.[key] ? rowDef.getCap(results[key]) : null;
                        return (
                          <td key={key} className="check-subrow">
                            {cap && <RatioBadge demand={num(demand[key][rowDef.demandField])} capacity={cap.value} />}
                          </td>
                        );
                      })}
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
