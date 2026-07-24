import type { SectorKey } from "../types/rebar";
import { SECTORS } from "../types/rebar";
import { barArea_mm2, flexuralCapacity, shearCapacity, type RcFormulaFamily } from "./rcBeamCheck";
import { MM_PER_UNIT, toModelDiameter } from "../data/rcCodePresets";
import type { SectorFormValues } from "./beamRebarForm";

// Per-section capacity + OK/NG judgment for the BEAM board. Reuses the exact
// same verified capacity formulas the single-beam check panel uses
// (rcBeamCheck.ts) — the board just runs them for every section at once and
// reduces the three stations (I/M/J) to one governing (worst) result per
// section, so a whole model's flexural/shear adequacy reads at a glance.

export interface SectorDemand {
  muNeg?: number; // hogging (top steel) demand, kN·m
  muPos?: number; // sagging (bottom steel) demand, kN·m
  vu?: number; // shear demand, kN
}
export type DemandBySector = Partial<Record<SectorKey, SectorDemand>>;

export interface MatProps {
  fck: number;
  fy: number;
  fyt: number;
}

export interface SectorCap {
  phiMnNeg: number | null; // top-steel flexural capacity
  phiMnPos: number | null; // bottom-steel flexural capacity
  phiVn: number | null;
}

function num(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
// Mirrors BeamCheckSection.toMm: NaN (not a silent passthrough) for an
// unknown unit so it degrades to "no result" rather than a wrong number.
function toMm(value: number, unit: string): number {
  const per = MM_PER_UNIT[unit];
  return per ? value * per : NaN;
}

export function sectorCapacity(
  family: RcFormulaFamily,
  mat: MatProps,
  materialDB: string,
  lengthUnit: string,
  b_mm: number,
  h_mm: number,
  dt_mm: number,
  db_mm: number,
  s: SectorFormValues
): SectorCap {
  const dNeg = h_mm - dt_mm; // top bars resist negative (hogging) moment
  const dPos = h_mm - db_mm; // bottom bars resist positive (sagging) moment

  const topDia = toModelDiameter(materialDB, s.topName, "mm");
  const asTop = topDia && s.topNum ? barArea_mm2(topDia) * num(s.topNum) : 0;
  const neg = asTop > 0 ? flexuralCapacity(family, mat.fck, mat.fy, b_mm, dNeg, asTop) : null;

  const botDia = toModelDiameter(materialDB, s.botName, "mm");
  const asBot = botDia && s.botNum ? barArea_mm2(botDia) * num(s.botNum) : 0;
  const pos = asBot > 0 ? flexuralCapacity(family, mat.fck, mat.fy, b_mm, dPos, asBot) : null;

  const shearDia = toModelDiameter(materialDB, s.shearName, "mm");
  const av = shearDia && s.shearLeg ? barArea_mm2(shearDia) * num(s.shearLeg) : 0;
  const dShear = Math.max(dNeg, dPos) || h_mm;
  const shear = shearCapacity(family, mat.fck, mat.fyt, b_mm, dShear, av, toMm(num(s.shearDist), lengthUnit));

  return {
    phiMnNeg: neg ? neg.phiMn_kNm : null,
    phiMnPos: pos ? pos.phiMn_kNm : null,
    phiVn: shear ? shear.phiVn_kN : null,
  };
}

export interface BoardJudge {
  // Governing (minimum) capacities across the section's I/M/J stations.
  phiMnNeg: number | null;
  phiMnPos: number | null;
  phiVn: number | null;
  // Worst demand/capacity ratio across stations & actions — undefined when
  // no demand has been supplied yet (fetched or typed), so the board shows
  // capacity but withholds an OK/NG verdict rather than implying "OK" from
  // an absent demand.
  ratioFlex?: number;
  ratioShear?: number;
  ok?: boolean;
}

function minCap(a: number | null, b: number | null): number | null {
  if (a == null) return b;
  if (b == null) return a;
  return Math.min(a, b);
}

// Governs a section: minimum capacity across stations, worst ratio across
// stations where a demand exists. Flexural ratio folds both hogging and
// sagging (each against its own capacity); shear its own.
export function judgeSection(
  family: RcFormulaFamily,
  mat: MatProps,
  materialDB: string,
  lengthUnit: string,
  b_mm: number,
  h_mm: number,
  dt_mm: number,
  db_mm: number,
  sectors: Record<SectorKey, SectorFormValues>,
  demand: DemandBySector
): BoardJudge {
  let govNeg: number | null = null;
  let govPos: number | null = null;
  let govV: number | null = null;
  let ratioFlex: number | undefined;
  let ratioShear: number | undefined;

  for (const key of SECTORS) {
    const cap = sectorCapacity(family, mat, materialDB, lengthUnit, b_mm, h_mm, dt_mm, db_mm, sectors[key]);
    govNeg = minCap(govNeg, cap.phiMnNeg);
    govPos = minCap(govPos, cap.phiMnPos);
    govV = minCap(govV, cap.phiVn);

    const d = demand[key];
    if (d) {
      if (d.muNeg != null && cap.phiMnNeg && cap.phiMnNeg > 0) ratioFlex = Math.max(ratioFlex ?? 0, d.muNeg / cap.phiMnNeg);
      if (d.muPos != null && cap.phiMnPos && cap.phiMnPos > 0) ratioFlex = Math.max(ratioFlex ?? 0, d.muPos / cap.phiMnPos);
      if (d.vu != null && cap.phiVn && cap.phiVn > 0) ratioShear = Math.max(ratioShear ?? 0, d.vu / cap.phiVn);
    }
  }

  const hasVerdict = ratioFlex != null || ratioShear != null;
  const ok = hasVerdict ? (ratioFlex ?? 0) <= 1 && (ratioShear ?? 0) <= 1 : undefined;
  return { phiMnNeg: govNeg, phiMnPos: govPos, phiVn: govV, ratioFlex, ratioShear, ok };
}
