import type { SectorKey } from "../types/rebar";
import { SECTORS } from "../types/rebar";
import { barArea_mm2, gbConcrete, gbRebar } from "./rcBeamCheck";
import { toModelDiameter } from "../data/rcCodePresets";
import type { SectorFormValues } from "./beamRebarForm";
import type { DemandBySector, MatProps } from "./beamBoard";
import { TENSION_FACE, foldBySector } from "./detailIssues";

// GB beam detailing (构造) checks — the GB counterpart of kdsDetailing.ts, same
// advisory role: never folded into OK/NG (Gen NX's GB check governs). Non-seismic
// rules only (抗震等级-dependent GB 50011 6.3 rules need a seismic-grade input).
// Clauses read from the code text (CN knowledge base, 2026-10-13):
//  - rhoMin  GB 55008-2021 表4.4.6 (GB 50010 8.5.1 defers to it since the 2024
//            revision): TENSION-side steel ρ = As/(b·h) ≥ max(0.20%, 45ft/fy %) —
//            top at the supports (I/J), bottom at mid-span (M).
//  - sMax    GB 50010 表9.2.9: stirrup spacing by h, tighter when V > 0.7·ft·b·h0.
//  - svMin   GB 50010 9.2.9-3: when V > 0.7·ft·b·h0, ρsv = Asv/(b·s) ≥ 0.24·ft/fyv.
//  - stirDia GB 50010 9.2.9-2: stirrup Ø ≥ 8 mm when h > 800, else ≥ 6 mm.
//  - barDia  GB 50010 9.2.1-2: longitudinal Ø ≥ 10 mm when h ≥ 300, else ≥ 8 mm.
// Board inputs follow Gen NX's GB meaning: fck = fcu,k grade, fy/fyt = fyk.

export type GbDetailKind = "rhoMinTop" | "rhoMinBot" | "sMax" | "svMin" | "stirDia" | "barDiaTop" | "barDiaBot";

export interface GbDetailIssue {
  kind: GbDetailKind;
  sectors: SectorKey[];
  actual: number; // % for rho/sv, mm for spacing/diameter
  limit: number;
  // false = the "V > 0.7ft·b·h0" branch couldn't be evaluated (no Vu loaded, or
  // fck outside the GB table so ft is unknown) and the stricter branch was used.
  demandKnown: boolean;
}

export interface GbDetailResult {
  issues: GbDetailIssue[];
  // false when fck/fy/fyt fall outside the GB tables (no ft/fy design values):
  // the strength-dependent rules (ρmin, ρsv) were skipped, the geometric ones
  // (spacing, diameters) still ran. The UI must not claim "all rules met".
  complete: boolean;
}

const num = (s: string): number => {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
const r3 = (x: number) => Math.round(x * 1000) / 1000;

// 表9.2.9 (mm): [V > 0.7ftbh0, V ≤ 0.7ftbh0]; h ≤ 150 has no row (no stirrups required).
function sMaxTable(h: number): [number, number] | null {
  if (h <= 150) return null;
  if (h <= 300) return [150, 200];
  if (h <= 500) return [200, 300];
  if (h <= 800) return [250, 350];
  return [300, 400];
}

export function gbBeamDetailing(
  mat: MatProps,
  materialDB: string,
  b_mm: number,
  h_mm: number,
  dt_mm: number,
  db_mm: number,
  sectors: Record<SectorKey, SectorFormValues>,
  demand: DemandBySector
): GbDetailResult {
  if (!(b_mm > 0 && h_mm > 0)) return { issues: [], complete: false };
  const conc = gbConcrete(mat.fck);
  const main = gbRebar(mat.fy);
  const stir = gbRebar(mat.fyt);
  const complete = !!(conc && main && stir);
  const h0 = h_mm - Math.max(dt_mm, db_mm);
  const vc07_kN = conc ? (0.7 * conc.ft * b_mm * h0) / 1000 : null;
  const rhoMin = conc && main ? Math.max(0.2, (45 * conc.ft) / main.fy) : null; // %
  const dia = (label: string) => (label ? toModelDiameter(materialDB, label, "mm") : null);

  const found: { sector: SectorKey; issue: Omit<GbDetailIssue, "sectors"> }[] = [];
  for (const key of SECTORS) {
    const s = sectors[key];
    const vu = demand[key]?.vu;
    const high = vu != null && vc07_kN != null ? Math.abs(vu) > vc07_kN : null; // null = unknown

    // --- longitudinal: bar diameter on every face, ρmin on the tension face ---
    for (const [face, name, cnt] of [["Top", s.topName, s.topNum], ["Bot", s.botName, s.botNum]] as const) {
      const d = dia(name);
      const n = num(cnt);
      if (!d || !(n > 0)) continue;
      const dMin = h_mm >= 300 ? 10 : 8;
      if (d < dMin) found.push({ sector: key, issue: { kind: `barDia${face}` as const, actual: d, limit: dMin, demandKnown: true } });
      if (rhoMin == null || !TENSION_FACE[key][face === "Top" ? "top" : "bot"]) continue;
      const rho = (100 * barArea_mm2(d) * n) / (b_mm * h_mm);
      if (rho < rhoMin - 1e-9) found.push({ sector: key, issue: { kind: `rhoMin${face}` as const, actual: r3(rho), limit: r3(rhoMin), demandKnown: true } });
    }

    // --- stirrups: spacing, diameter, ρsv ---
    const sd = dia(s.shearName);
    const sp = num(s.shearDist);
    const legs = num(s.shearLeg);
    if (!sd || !(sp > 0)) continue;
    const table = sMaxTable(h_mm);
    if (table) {
      const lim = high === false ? table[1] : table[0];
      if (sp > lim + 1e-9) found.push({ sector: key, issue: { kind: "sMax", actual: sp, limit: lim, demandKnown: high != null } });
    }
    const dMin = h_mm > 800 ? 8 : 6;
    if (sd < dMin) found.push({ sector: key, issue: { kind: "stirDia", actual: sd, limit: dMin, demandKnown: true } });
    if (high !== false && conc && stir && legs > 0) {
      // fyv in the 0.24ft/fyv floor: design value, capped at 360 like 6.3.4 (conservative).
      const fyv = Math.min(stir.fy, 360);
      const rhoSv = (100 * barArea_mm2(sd) * legs) / (b_mm * sp);
      const lim = (100 * 0.24 * conc.ft) / fyv;
      if (rhoSv < lim - 1e-9) found.push({ sector: key, issue: { kind: "svMin", actual: r3(rhoSv), limit: r3(lim), demandKnown: high != null } });
    }
  }

  return { issues: foldBySector(found), complete };
}
